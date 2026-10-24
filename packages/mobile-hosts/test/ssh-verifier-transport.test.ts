import { describe, expect, test } from "bun:test"
import { createSshHostKeyVerifier, removeSshHostKey } from "../src/ssh/host-key-verifier"
import { createSshHostTransport } from "../src/ssh/transport"
import { SshTransportError } from "../src/transport/ssh-errors"
import { DEFAULT_SERVICE_PORT } from "../src/registry"
import { createFakeSshBridge } from "./fake-ssh-bridge"

// The ssh-keygen-verified ed25519 fingerprint vector (same constant as fingerprint.test.ts,
// re-declared to keep test files import-free of each other).
const ED25519_FINGERPRINT = "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk"

// SshBridgeHostKeyVerifier + SshBridgeHostTransport (issue #6). Red lines locked here:
// - a dead bridge NEVER reads as a host-key rejection (bridge-unavailable thrown first);
// - a changed key maps to reject(reason:"changed") — the strict refusal;
// - fetchHostKey requests carry ZERO authentication material (scan discipline);
// - teardown is local-only: aborts fire cancel/disconnect bridge ops, never anything else;
// - endpoints are loopback-only; servicePort defaults to 4096.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("SshBridgeHostKeyVerifier decision flow", () => {
  test("unavailable bridge throws bridge-unavailable (never a fabricated host-key rejection)", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => {
        throw new Error("must not be reached")
      },
    })
    const verifier = createSshHostKeyVerifier(transport)
    await expect(verifier.verify({ host: "user@example.invalid" })).rejects.toMatchObject({ code: "bridge-unavailable" })
    native.connect()
    void native
  })

  test("unknown host -> prompt with the native-computed fingerprint", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "prompt", fingerprint: ED25519_FINGERPRINT }),
    })
    native.connect()
    const decision = await createSshHostKeyVerifier(transport).verify({ host: "user@example.invalid:2222" })
    expect(decision).toEqual({ action: "prompt", fingerprint: ED25519_FINGERPRINT })
    // Scan discipline: the fetchHostKey request carries host/port ONLY — zero credential
    // material ever rides the key-scan path.
    const request = native.requests().find((r) => r.op === "fetchHostKey")
    expect(request!.params).toEqual({ host: "example.invalid", port: 2222 })
    expect(Object.keys(request!).sort()).toEqual(["id", "op", "params"])
  })

  test("known host -> trust (the store comparison happened native-side)", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "trust", fingerprint: ED25519_FINGERPRINT }),
    })
    native.connect()
    expect(await createSshHostKeyVerifier(transport).verify({ host: "example.invalid" })).toEqual({ action: "trust" })
  })

  test("changed key -> strict reject with reason=changed (never an automatic overwrite)", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => {
        throw Object.assign(new Error("changed"), { code: "host-key-changed" })
      },
    })
    native.connect()
    expect(await createSshHostKeyVerifier(transport).verify({ host: "example.invalid" })).toEqual({
      action: "reject",
      reason: "changed",
    })
  })

  test("reachability/auth failures during verification throw their code (not host-key rejections)", async () => {
    for (const code of ["dns", "refused", "timeout", "auth-failed", "io"]) {
      const { transport, native } = createFakeSshBridge({
        fetchHostKey: () => {
          throw Object.assign(new Error(code), { code })
        },
      })
      native.connect()
      await expect(createSshHostKeyVerifier(transport).verify({ host: "example.invalid" })).rejects.toMatchObject({ code })
    }
  })

  test("a malformed fingerprint from the bridge is an io error, never a prompt", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "prompt", fingerprint: "SHA256:garbage" }),
    })
    native.connect()
    await expect(createSshHostKeyVerifier(transport).verify({ host: "example.invalid" })).rejects.toMatchObject({ code: "io" })
  })

  test("removeSshHostKey forwards host/port and surfaces bridge errors", async () => {
    const ok = createFakeSshBridge({ removeHostKey: () => ({}) })
    ok.native.connect()
    await removeSshHostKey(ok.transport, "user@example.invalid:2222")
    expect(ok.native.requests()[0]!.params).toEqual({ host: "example.invalid", port: 2222 })

    const dead = createFakeSshBridge()
    await expect(removeSshHostKey(dead.transport, "example.invalid")).rejects.toMatchObject({ code: "bridge-unavailable" })

    const failing = createFakeSshBridge({
      removeHostKey: () => {
        throw Object.assign(new Error("io"), { code: "io" })
      },
    })
    failing.native.connect()
    await expect(removeSshHostKey(failing.transport, "example.invalid")).rejects.toMatchObject({ code: "io" })
  })
})

describe("SshBridgeHostTransport open flow", () => {
  const connectOk = () => ({ url: "http://127.0.0.1:41001" })

  test("connect params carry host/port/servicePort with the 4096 default, credential only when present", async () => {
    const { transport, native } = createFakeSshBridge({ connect: connectOk })
    native.connect()
    const endpoint = await createSshHostTransport(transport).open({
      target: "deploy@example.invalid:2200",
      signal: new AbortController().signal,
      onEvent: () => {},
    })
    expect(endpoint).toEqual({ url: "http://127.0.0.1:41001" })
    expect(native.requests()[0]!.op).toBe("connect")
    // Review B2 (issue #7): the target's user@ segment crosses as the username (a
    // routing fact, not a credential).
    expect(native.requests()[0]!.params).toEqual({
      host: "example.invalid",
      port: 2200,
      servicePort: DEFAULT_SERVICE_PORT,
      username: "deploy",
    })

    const withCredential = createFakeSshBridge({ connect: connectOk })
    withCredential.native.connect()
    await createSshHostTransport(withCredential.transport).open({
      target: "example.invalid",
      credential: '{"v":1,"key":"synthetic"}',
      pinnedFingerprint: "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk",
      servicePort: 8080,
      signal: new AbortController().signal,
      onEvent: () => {},
    })
    expect(withCredential.native.requests()[0]!.params).toEqual({
      host: "example.invalid",
      port: 22,
      servicePort: 8080,
      credential: '{"v":1,"key":"synthetic"}',
      pinnedFingerprint: "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk",
    })
  })

  test("error responses throw the classified SshTransportError", async () => {
    const { transport, native } = createFakeSshBridge({
      connect: () => {
        throw Object.assign(new Error("refused"), { code: "target-refused" })
      },
    })
    native.connect()
    await expect(
      createSshHostTransport(transport).open({ target: "example.invalid", signal: new AbortController().signal, onEvent: () => {} }),
    ).rejects.toMatchObject({ code: "target-refused" })
  })

  test("a non-loopback endpoint from the bridge is rejected (red line)", async () => {
    const { transport, native } = createFakeSshBridge({
      connect: () => ({ url: "http://192.168.1.10:8080" }),
    })
    native.connect()
    await expect(
      createSshHostTransport(transport).open({ target: "example.invalid", signal: new AbortController().signal, onEvent: () => {} }),
    ).rejects.toMatchObject({ code: "io" })
  })

  test("abort while connecting fires the cancel op; abort after establishment fires disconnect", async () => {
    const { transport, native } = createFakeSshBridge({
      connect: () => new Promise(() => {}), // hang until the native cancel answers it
    })
    native.connect()
    const controller = new AbortController()
    const opening = createSshHostTransport(transport).open({ target: "example.invalid", signal: controller.signal, onEvent: () => {} })
    controller.abort()
    await drain()
    expect(native.requests().map((r) => r.op)).toEqual(["connect", "cancel"])
    // The native side answers the cancelled connect with an error -> the open rejects.
    const connectRequest = native.requests()[0]!
    native.push({ id: connectRequest.id, ok: false, code: "io", message: "" })
    await expect(opening).rejects.toMatchObject({ code: "io" })

    const established = createFakeSshBridge({ connect: connectOk })
    established.native.connect()
    const controller2 = new AbortController()
    await createSshHostTransport(established.transport).open({
      target: "example.invalid",
      signal: controller2.signal,
      onEvent: () => {},
    })
    controller2.abort()
    await drain()
    expect(established.native.requests().map((r) => r.op)).toEqual(["connect", "disconnect"])
  })

  test("an already-aborted signal refuses to open at all", async () => {
    const { transport, native } = createFakeSshBridge({ connect: connectOk })
    native.connect()
    const controller = new AbortController()
    controller.abort()
    await expect(
      createSshHostTransport(transport).open({ target: "example.invalid", signal: controller.signal, onEvent: () => {} }),
    ).rejects.toThrow(/aborted/)
    expect(native.requests()).toHaveLength(0)
  })

  test("native connectionLost routes to the open attempt's onEvent (T9 path)", async () => {
    const { transport, native } = createFakeSshBridge({ connect: connectOk })
    native.connect()
    const events: unknown[] = []
    await createSshHostTransport(transport).open({
      target: "user@example.invalid:22",
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    })
    native.pushEvent({ event: "connectionLost", host: "example.invalid", port: 22 })
    await drain()
    expect(events).toEqual([{ type: "connectionLost" }])
  })

  test("an out-of-range servicePort is refused before the bridge sees it", async () => {
    const { transport, native } = createFakeSshBridge({ connect: connectOk })
    native.connect()
    await expect(
      createSshHostTransport(transport).open({
        target: "example.invalid",
        servicePort: 70000,
        signal: new AbortController().signal,
        onEvent: () => {},
      }),
    ).rejects.toMatchObject({ code: "io" })
    expect(native.requests()).toHaveLength(0)
  })
})
