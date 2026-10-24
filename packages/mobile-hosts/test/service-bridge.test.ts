import { describe, expect, test } from "bun:test"
import { SVCOPS_BRIDGE, SVCOPS_HANDSHAKE, createWebMessageServiceOpsTransport } from "../src/service-ops/bridge"
import { SSH_HANDSHAKE, createWebMessageSshTransport } from "../src/ssh/bridge"
import { PROBE_HANDSHAKE } from "../src/probe"
import { VAULT_HANDSHAKE, createWebMessageChannelTransport } from "../src/vault/transport"
import { ServiceOpsError } from "../src/service-ops/errors"
import {
  StubServiceOpsPort,
  activeServiceOpsPort,
  createServiceOpsClient,
  interpretExecResult,
  serviceOpsBridgeInjected,
  setActiveServiceOpsPort,
} from "../src/service-ops/port"
import { createFakeSvcopsBridge } from "./fake-svcops-bridge"

/** A minimal port-like object for handshake-shape checks against sibling transports. */
function anyPort() {
  return { postMessage: () => {}, onmessage: null, close: () => {} }
}

// Fourth bridge transport (issue #7, decision 0004 §2.1): four-bridge isolation (no
// cross-capture in either direction), ack-before-capability, requestId discipline,
// explicit-unavailable failure paths, the fail-closed stub/injection seam and the
// credential-once wire shape (N7). Synthetic data only; nothing contacts a network.

describe("four-bridge isolation (vault / probe / ssh / svcops)", () => {
  test("all four handshake strings are pairwise distinct", () => {
    const handshakes = [VAULT_HANDSHAKE, PROBE_HANDSHAKE, SSH_HANDSHAKE, SVCOPS_HANDSHAKE]
    expect(new Set(handshakes).size).toBe(4)
    expect(SVCOPS_BRIDGE.handshake).toBe("opencode-mobile-svcops-handshake")
  })

  test("the svcops transport ignores the vault, probe and ssh handshakes", () => {
    const { native } = createFakeSvcopsBridge()
    native.deliver({ data: VAULT_HANDSHAKE, ports: [{}] })
    native.deliver({ data: PROBE_HANDSHAKE, ports: [{}] })
    native.deliver({ data: SSH_HANDSHAKE, ports: [{}] })
    expect(native.acked()).toBe(false)
    expect(native.sent()).toHaveLength(0)
    native.connect()
    expect(native.acked()).toBe(true)
  })

  test("the sibling transports do not capture the svcops handshake (mirror direction)", () => {
    let vaultSubscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const vault = createWebMessageChannelTransport({
      subscribe(handler) {
        vaultSubscriber = handler
        return () => {
          vaultSubscriber = undefined
        }
      },
    })
    vaultSubscriber?.call(undefined, { data: SVCOPS_HANDSHAKE, ports: [anyPort()] })
    expect(vault.status()).toBe("unavailable")
    vault.dispose()

    let sshSubscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const ssh = createWebMessageSshTransport({
      subscribe(handler) {
        sshSubscriber = handler
        return () => {
          sshSubscriber = undefined
        }
      },
    })
    sshSubscriber?.call(undefined, { data: SVCOPS_HANDSHAKE, ports: [anyPort()] })
    expect(ssh.status()).toBe("unavailable")
    ssh.dispose()
  })

  test("shape guard: wrong data, zero or multiple ports never capture; first capture wins", () => {
    const { native } = createFakeSvcopsBridge()
    native.deliver({ data: SVCOPS_HANDSHAKE, ports: [] })
    native.deliver({ data: SVCOPS_HANDSHAKE, ports: [{}, {}] })
    native.deliver({ data: `${SVCOPS_HANDSHAKE} `, ports: [{}] })
    native.deliver({ data: 42, ports: [{}] })
    expect(native.acked()).toBe(false)
    native.connect()
    expect(native.acked()).toBe(true)
    // a second handshake round must not flip anything (navigation reset guard)
    native.deliver({ data: SVCOPS_HANDSHAKE, ports: [{}] })
    expect(native.sent()).toHaveLength(1)
  })
})

describe("svcops bridge request/response discipline", () => {
  test("zero capability before ack: requests before capture reject svcops-unavailable", async () => {
    const { transport, native } = createFakeSvcopsBridge({
      exec: () => ({ exitCode: 0, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
    })
    expect(transport.status()).toBe("unavailable")
    await expect(transport.request("exec", { host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })).rejects.toThrow(
      ServiceOpsError,
    )
    native.connect()
    const response = await transport.request("exec", { host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(response.ok).toBe(true)
  })

  test("requestId correlation; malformed and unknown-id responses are ignored", async () => {
    const { transport, native } = createFakeSvcopsBridge({
      exec: () => ({ exitCode: 0, stdout: "Linux", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
    })
    native.connect()
    const pending = transport.request("exec", { host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    native.push({ nope: true }) // malformed: ignored
    native.push({ id: "not-a-known-id", ok: true, result: {} }) // unknown id: ignored
    const response = await pending
    expect(response.ok).toBe(true)
    const sent = native.sent().filter((raw) => raw !== JSON.stringify({ op: "ack" }))
    expect(sent).toHaveLength(1)
    expect(typeof JSON.parse(sent[0]!).id).toBe("string")
  })

  test("a timed-out request dies into an explicit unavailable state (never a silent hang)", async () => {
    const { transport, native } = createFakeSvcopsBridge(
      {
        exec: () => new Promise(() => {}),
      },
      { timeoutMs: 50 },
    )
    native.connect()
    let error: unknown
    await transport.request("exec", { host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" }).catch((e) => {
      error = e
    })
    expect(error).toBeInstanceOf(ServiceOpsError)
    expect((error as ServiceOpsError).code).toBe("svcops-unavailable")
    expect(transport.status()).toBe("unavailable")
  })

  test("dispose rejects pending requests and is idempotent", async () => {
    const { transport, native } = createFakeSvcopsBridge({ exec: () => new Promise(() => {}) })
    native.connect()
    const pending = transport.request("exec", { host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    transport.dispose()
    await expect(pending).rejects.toThrow(ServiceOpsError)
    expect(() => transport.dispose()).not.toThrow()
    expect(transport.status()).toBe("unavailable")
  })
})

describe("service ops client (port over the bridge)", () => {
  test("happy path: exec result shape validated and returned", async () => {
    const { transport, native } = createFakeSvcopsBridge({
      exec: () => ({ exitCode: 0, stdout: "Linux", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
    })
    native.connect()
    const client = createServiceOpsClient(transport)
    const outcome = await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(outcome.ok).toBe(true)
  })

  test("N7: the credential crosses exactly once per exec request and never appears in a response face", async () => {
    const { transport, native } = createFakeSvcopsBridge({
      exec: () => ({ exitCode: 0, stdout: "Linux", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
    })
    native.connect()
    const client = createServiceOpsClient(transport)
    await client.exec({
      host: "example.invalid",
      port: 22,
      templateId: "probe.os.posix",
      params: {},
      os: "linux",
      credential: "synthetic-credential-value",
    })
    const execRequests = native.requests().filter((r) => r.op === "exec")
    expect(execRequests).toHaveLength(1)
    const rawExecSent = native.sent().filter((raw) => raw !== JSON.stringify({ op: "ack" }))
    const occurrences = rawExecSent.join("\n").split("synthetic-credential-value").length - 1
    expect(occurrences).toBe(1) // exactly one way, one time
    expect(execRequests[0]!.params["credential"]).toBe("synthetic-credential-value")
    // a request without a credential carries no credential field at all
    await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    const second = native.requests().filter((r) => r.op === "exec")[1]!
    expect("credential" in second.params).toBe(false)
  })

  test("error responses map to the classification; unknown codes degrade to exec-failed; unavailable degrades", async () => {
    const { transport, native } = createFakeSvcopsBridge({ exec: () => { throw { code: "host-key-unknown" } } })
    native.connect()
    const client = createServiceOpsClient(transport)
    const refused = await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(refused).toEqual({ ok: false, code: "host-key-unknown" })

    native.setHandlers({ exec: () => { throw { code: "totally-unknown-code" } } })
    const degraded = await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(degraded).toEqual({ ok: false, code: "exec-failed" })

    transport.dispose()
    const dead = await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(dead).toEqual({ ok: false, code: "svcops-unavailable" })
  })

  test("malformed exec results are refused (no invention of truncation flags or exit codes)", async () => {
    const { transport, native } = createFakeSvcopsBridge({ exec: () => ({ exitCode: 0, stdout: "x" }) })
    native.connect()
    const client = createServiceOpsClient(transport)
    const outcome = await client.exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(outcome).toEqual({ ok: false, code: "exec-failed" })
  })

  test("cancel degrades to false on every failure path", async () => {
    const { transport, native } = createFakeSvcopsBridge()
    const client = createServiceOpsClient(transport)
    expect(await client.cancel({ host: "example.invalid", port: 22 })).toBe(false) // unacked bridge
    native.connect()
    native.setHandlers({ cancel: () => ({}) })
    expect(await client.cancel({ host: "example.invalid", port: 22 })).toBe(true)
    transport.dispose()
    expect(await client.cancel({ host: "example.invalid", port: 22 })).toBe(false)
  })
})

describe("fail-closed stub and the injection seam", () => {
  test("the stub never executes and never reports an injected bridge", async () => {
    await expect(
      StubServiceOpsPort.exec({ host: "h", port: 22, templateId: "stop.linux", params: {}, os: "linux" }),
    ).resolves.toEqual({ ok: false, code: "svcops-unavailable" })
    expect(await StubServiceOpsPort.cancel({ host: "h", port: 22 })).toBe(false)
  })

  test("the module seam defaults to the stub; injection flips the flag; reset restores", async () => {
    expect(serviceOpsBridgeInjected()).toBe(false)
    expect(activeServiceOpsPort()).toBe(StubServiceOpsPort)
    const { transport, native } = createFakeSvcopsBridge({
      exec: () => ({ exitCode: 0, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
    })
    native.connect()
    setActiveServiceOpsPort(createServiceOpsClient(transport))
    expect(serviceOpsBridgeInjected()).toBe(true)
    const outcome = await activeServiceOpsPort().exec({ host: "example.invalid", port: 22, templateId: "probe.os.posix", params: {}, os: "linux" })
    expect(outcome.ok).toBe(true)
    setActiveServiceOpsPort(undefined)
    expect(serviceOpsBridgeInjected()).toBe(false)
    expect(activeServiceOpsPort()).toBe(StubServiceOpsPort)
  })
})

describe("interpretExecResult (N4 classification at the result face)", () => {
  test("exit 0 is success; a permission tail promotes; anything else degrades with the tail verbatim", () => {
    expect(interpretExecResult({ exitCode: 0, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false })).toEqual({ ok: true })
    const denied = interpretExecResult({ exitCode: 1, stdout: "", stderr: "opencode: Permission denied", stdoutTruncated: false, stderrTruncated: false })
    expect(denied).toEqual({ ok: false, code: "permission-denied", stderrTail: "opencode: Permission denied" })
    const generic = interpretExecResult({ exitCode: 1, stdout: "", stderr: "bash: opencode: command not found", stdoutTruncated: false, stderrTruncated: false })
    expect(generic.ok).toBe(false)
    if (!generic.ok) {
      expect(generic.code).toBe("exec-failed")
      expect(generic.stderrTail).toBe("bash: opencode: command not found") // never swallowed
    }
    expect(interpretExecResult({ exitCode: 1, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false })).toEqual({
      ok: false,
      code: "exec-failed",
    })
  })
})
