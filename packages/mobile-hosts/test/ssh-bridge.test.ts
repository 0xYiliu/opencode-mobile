import { describe, expect, test } from "bun:test"
import { SSH_BRIDGE, SSH_HANDSHAKE, bridgeServicePort, createWebMessageSshTransport, parseBridgeEndpoint } from "../src/ssh/bridge"
import { SshTransportError } from "../src/transport/ssh-errors"
import { VAULT_HANDSHAKE, createWebMessageChannelTransport } from "../src/vault/transport"
import { PROBE_HANDSHAKE } from "../src/probe"
import { createFakeSshBridge } from "./fake-ssh-bridge"

/** A minimal port-like object for handshake-shape checks against other transports. */
function anyPort() {
  return { postMessage: () => {}, onmessage: null, close: () => {} }
}

// Third bridge transport (issue #6): a protocol-isolated mirror of the vault/probe
// bridges. These tests lock the isolation (no cross-capture), the ack-before-capability
// gate, requestId correlation, explicit-unavailable failure paths and the connectionLost
// event routing. Synthetic data only; nothing contacts a network.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("ssh bridge handshake capture (three-bridge isolation)", () => {
  test("captures only the ssh handshake with exactly one port and acks immediately", () => {
    const { native } = createFakeSshBridge()
    expect(native.acked()).toBe(false)
    native.connect()
    expect(native.acked()).toBe(true)
    expect(native.sent()).toEqual([JSON.stringify({ op: "ack" })])
  })

  test("vault and probe handshakes are NOT captured by the ssh transport (and vice versa)", async () => {
    const { native } = createFakeSshBridge()
    native.deliver({ data: VAULT_HANDSHAKE, ports: [{}] })
    native.deliver({ data: PROBE_HANDSHAKE, ports: [{}] })
    expect(native.acked()).toBe(false)
    expect(native.sent()).toHaveLength(0)
    // Mirror direction: the vault transport does not capture the ssh handshake either.
    let vaultSubscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const vault = createWebMessageChannelTransport({
      subscribe(handler) {
        vaultSubscriber = handler
        return () => {
          vaultSubscriber = undefined
        }
      },
    })
    vaultSubscriber?.call(undefined, { data: SSH_HANDSHAKE, ports: [anyPort()] })
    expect(vault.status()).toBe("unavailable")
    vault.dispose()
  })

  test("shape guard: wrong data, zero or multiple ports never capture", () => {
    const { native } = createFakeSshBridge()
    native.deliver({ data: SSH_HANDSHAKE, ports: [] })
    native.deliver({ data: SSH_HANDSHAKE, ports: [{}, {}] })
    native.deliver({ data: "opencode-mobile-ssh-handshake ", ports: [{}] })
    native.deliver({ data: 42, ports: [{}] })
    expect(native.acked()).toBe(false)
    native.connect()
    expect(native.acked()).toBe(true)
  })

  test("first capture wins; later handshakes are ignored (retry desync guard)", () => {
    const first = createFakeSshBridge()
    first.native.connect()
    // A second handshake round (navigation reset native-side) must not flip anything.
    first.native.deliver({ data: SSH_HANDSHAKE, ports: [{}] })
    expect(first.native.acked()).toBe(true)
    expect(first.native.sent()).toHaveLength(1)
  })

  test("zero capability before ack: requests before capture reject bridge-unavailable", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "trust" }),
    })
    expect(transport.status()).toBe("unavailable")
    await expect(transport.request("fetchHostKey", { host: "example.invalid", port: 22 })).rejects.toThrow(SshTransportError)
    native.connect()
    expect(transport.status()).toBe("available")
    const response = await transport.request("fetchHostKey", { host: "example.invalid", port: 22 })
    expect(response.ok).toBe(true)
  })
})

describe("ssh bridge request/response discipline", () => {
  test("requestId correlation with params carried as JSON (zero binary over the bridge)", async () => {
    const { transport, native } = createFakeSshBridge({
      connect: (params) => ({ url: `http://127.0.0.1:${params["servicePort"] === 4096 ? 40001 : 40002}` }),
    })
    native.connect()
    const response = await transport.request("connect", { host: "example.invalid", port: 22, servicePort: 4096 })
    expect(response.ok).toBe(true)
    expect((response as { result: Record<string, unknown> }).result["url"]).toBe("http://127.0.0.1:40001")
    const sent = native.sent().filter((raw) => raw !== JSON.stringify({ op: "ack" }))
    expect(sent).toHaveLength(1)
    const parsed = JSON.parse(sent[0]!) as Record<string, unknown>
    expect(typeof parsed["id"]).toBe("string")
    expect(parsed["op"]).toBe("connect")
  })

  test("responses for unknown correlation ids are ignored", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "trust" }),
    })
    native.connect()
    native.push({ id: "not-a-known-id", ok: true, result: { decision: "trust" } })
    const response = await transport.request("fetchHostKey", { host: "example.invalid", port: 22 })
    expect(response.ok).toBe(true)
  })

  test("a timed-out request dies into an explicit unavailable state (never a silent hang)", async () => {
    const { transport, native } = createFakeSshBridge(
      {
        fetchHostKey: () => {
          // never answers
          return new Promise(() => {})
        },
      },
      { timeoutMs: 50 }, // short timeout so the test does not wait on the 45s default
    )
    native.connect()
    let error: unknown
    await transport.request("fetchHostKey", { host: "example.invalid", port: 22 }).catch((e) => {
      error = e
    })
    expect(error).toBeInstanceOf(SshTransportError)
    expect((error as SshTransportError).code).toBe("bridge-unavailable")
    expect(transport.status()).toBe("unavailable")
    await expect(transport.request("fetchHostKey", { host: "example.invalid", port: 22 })).rejects.toThrow(/handshake not captured|channel died/)
    void native
  })

  test("dispose rejects pending requests and is idempotent", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => new Promise(() => {}),
    })
    native.connect()
    const pending = transport.request("fetchHostKey", { host: "example.invalid", port: 22 })
    transport.dispose()
    await expect(pending).rejects.toThrow(SshTransportError)
    expect(() => transport.dispose()).not.toThrow()
    expect(transport.status()).toBe("unavailable")
  })
})

describe("ssh bridge unsolicited events (connectionLost)", () => {
  test("native connectionLost events reach the onEvent listeners; response-shaped messages do not", async () => {
    const { transport, native } = createFakeSshBridge({
      fetchHostKey: () => ({ decision: "trust" }),
    })
    const events: unknown[] = []
    const unsubscribe = transport.onEvent((event) => events.push(event))
    native.connect()
    await transport.request("fetchHostKey", { host: "example.invalid", port: 22 }) // a correlated response, not an event
    native.pushEvent({ event: "connectionLost", host: "example.invalid", port: 22 })
    await drain()
    expect(events).toEqual([{ type: "connectionLost", host: "example.invalid", port: 22 }])
    unsubscribe()
    native.pushEvent({ event: "connectionLost", host: "example.invalid", port: 2222 })
    await drain()
    expect(events).toHaveLength(1)
  })

  test("non-connectionLost events and malformed shapes are ignored", async () => {
    const { transport, native } = createFakeSshBridge()
    const events: unknown[] = []
    transport.onEvent((event) => events.push(event))
    native.connect()
    native.pushEvent({ event: "remoteTaskStopped" })
    native.pushEvent({ event: "connectionLost" }) // no host/port
    native.pushEvent({ event: "connectionLost", host: "example.invalid" }) // no port
    await drain()
    expect(events).toHaveLength(0)
  })
})

describe("bridge wire-shape helpers", () => {
  test("parseBridgeEndpoint accepts loopback http endpoints only", () => {
    expect(parseBridgeEndpoint({ url: "http://127.0.0.1:40001" })).toEqual({ url: "http://127.0.0.1:40001" })
    expect(parseBridgeEndpoint({ url: "http://[::1]:40001" })).toEqual({ url: "http://[::1]:40001" })
    expect(parseBridgeEndpoint({ url: "http://127.0.0.1:40001", password: "synthetic" })).toEqual({
      url: "http://127.0.0.1:40001",
      password: "synthetic",
    })
    expect(() => parseBridgeEndpoint({ url: "http://10.0.0.5:40001" })).toThrow(/non-loopback/)
    expect(() => parseBridgeEndpoint({ url: "https://example.invalid" })).toThrow(/non-loopback/)
    expect(() => parseBridgeEndpoint({})).toThrow(/non-loopback/)
    expect(() => parseBridgeEndpoint({ url: 42 })).toThrow(/non-loopback/)
  })

  test("bridgeServicePort applies the default and rejects out-of-range values", () => {
    expect(bridgeServicePort(undefined)).toBe(4096)
    expect(bridgeServicePort(22)).toBe(22)
    expect(() => bridgeServicePort(0)).toThrow(/range/)
    expect(() => bridgeServicePort(65536)).toThrow(/range/)
    expect(() => bridgeServicePort(1.5)).toThrow(/range/)
  })
})
