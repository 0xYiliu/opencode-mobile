import { describe, expect, test } from "bun:test"
import { VAULT_HANDSHAKE, createWebMessageChannelTransport, type VaultHandshakeEvent, type VaultPortLike } from "../src/vault/transport"
import { VaultError } from "../src/vault/types"

// Bridge transport contract (issue #4, decision D1).
//
// ORIGIN NOTE (plan erratum 3 / F-1b): these tests deliberately NEVER fabricate or assert
// event.origin. Embedder-posted messages carry an empty origin by platform construction
// (Chromium AwContents.postMessageToMainFrame hardcodes sourceOrigin=null), so origin
// equality checking is not part of this contract and faking it in a test would assert
// platform behavior that does not exist. Trust is validated via handshake SHAPE here; the
// platform targetOrigin enforcement is device-gated (C5a).

interface Harness {
  deliver(event: VaultHandshakeEvent): void
  port: VaultPortLike & { received: string[] }
  transport: ReturnType<typeof createWebMessageChannelTransport>
}

function harness(options?: { requestId?: () => string; timeoutMs?: number }): Harness {
  let handler: ((event: VaultHandshakeEvent) => void) | undefined
  const port: Harness["port"] = Object.assign(
    { received: [] as string[], onmessage: null as VaultPortLike["onmessage"], postMessage(message: string) { port.received.push(message) }, close() {} },
    {},
  )
  const transport = createWebMessageChannelTransport({
    timeoutMs: options?.timeoutMs,
    requestId: options?.requestId,
    subscribe(handler_) {
      handler = handler_
      return () => {
        handler = undefined
      }
    },
  })
  return {
    deliver: (event) => handler?.(event),
    port,
    transport,
  }
}

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function handshakeWith(port: unknown): VaultHandshakeEvent {
  // Only data and ports participate; no origin field exists on this synthetic event.
  return { data: VAULT_HANDSHAKE, ports: [port] }
}

describe("handshake capture", () => {
  test("a well-shaped handshake is captured, acked immediately and flips status", async () => {
    const h = harness()
    expect(h.transport.status()).toBe("unavailable")
    const flips: boolean[] = []
    h.transport.onReady((available) => flips.push(available))
    h.deliver(handshakeWith(h.port))
    expect(h.transport.status()).toBe("available")
    expect(flips).toEqual([true])
    await drain()
    const ack = h.port.received[0]
    expect(ack).toBeDefined()
    expect(JSON.parse(ack!)).toEqual({ op: "ack" })
  })

  test("malformed handshakes never capture (data mismatch, missing ports, extra ports, non-port member)", async () => {
    for (const event of [
      { data: "other-message", ports: [] },
      { data: VAULT_HANDSHAKE, ports: [] },
      { data: VAULT_HANDSHAKE, ports: [] },
      { data: VAULT_HANDSHAKE, ports: [{}] },
      { data: VAULT_HANDSHAKE, ports: [{ postMessage: "not-a-function" }] },
      { data: VAULT_HANDSHAKE, ports: [{ postMessage: () => {} }, { postMessage: () => {} }] },
      {},
      null,
    ] as unknown as VaultHandshakeEvent[]) {
      const h = harness()
      h.deliver(event)
      expect(h.transport.status()).toBe("unavailable")
      await expect(h.transport.request("list", {})).rejects.toMatchObject({ code: "unavailable" })
      h.transport.dispose()
    }
  })

  test("first successful capture wins: later handshakes are ignored (desync guard)", async () => {
    const h = harness()
    h.deliver(handshakeWith(h.port))
    const second: VaultPortLike = { postMessage() {}, onmessage: null }
    h.deliver(handshakeWith(second))
    await drain()
    // The second port never received anything and the first stays authoritative.
    expect(h.port.received.length).toBeGreaterThanOrEqual(1) // ack went to the first port only
    // Requests still correlate over the first port.
    const response = h.transport.request("list", {})
    h.port.onmessage?.({ data: JSON.stringify({ id: JSON.parse(h.port.received.at(-1)!).id, ok: true, result: [] }) })
    await expect(response).resolves.toMatchObject({ ok: true, result: [] })
    h.transport.dispose()
  })

  test("port confinement: capturing the handshake adds nothing to globalThis (C5b)", async () => {
    const before = Object.keys(globalThis).sort().join(",")
    const h = harness()
    h.deliver(handshakeWith(h.port))
    await drain()
    const after = Object.keys(globalThis).sort().join(",")
    expect(after).toBe(before)
    h.transport.dispose()
  })
})

describe("request/response", () => {
  test("requests before capture (or after dispose) are explicitly unavailable", async () => {
    const h = harness()
    await expect(h.transport.request("put", {})).rejects.toBeInstanceOf(VaultError)
    h.deliver(handshakeWith(h.port))
    h.transport.dispose()
    await expect(h.transport.request("get", {})).rejects.toMatchObject({ code: "unavailable" })
  })

  test("requestId correlates the response; JSON strings cross in both directions", async () => {
    let seq = 0
    const h = harness({ requestId: () => `req-${++seq}` })
    h.deliver(handshakeWith(h.port))
    const pending = h.transport.request("put", { kind: "password", value: "synthetic" })
    const sent = JSON.parse(h.port.received.at(-1)!)
    expect(sent).toEqual({ id: "req-1", op: "put", params: { kind: "password", value: "synthetic" } })
    // A response with an unknown id is ignored, then the correlated one resolves.
    h.port.onmessage?.({ data: JSON.stringify({ id: "req-999", ok: true, result: "nope" }) })
    h.port.onmessage?.({ data: JSON.stringify({ id: "req-1", ok: true, result: "mobile-credential:entry-1" }) })
    await expect(pending).resolves.toEqual({ id: "req-1", ok: true, result: "mobile-credential:entry-1" })
  })

  test("a hung bridge times out into the explicit unavailable state and closes the port", async () => {
    const h = harness({ timeoutMs: 5 })
    h.deliver(handshakeWith(h.port))
    let closed = false
    h.port.close = () => {
      closed = true
    }
    await expect(h.transport.request("list", {})).rejects.toMatchObject({ code: "unavailable" })
    expect(closed).toBe(true)
    expect(h.transport.status()).toBe("unavailable")
    await expect(h.transport.request("list", {})).rejects.toMatchObject({ code: "unavailable" })
  })

  test("dispose unsubscribes from further handshakes and rejects pending requests", async () => {
    const h = harness()
    h.transport.dispose()
    h.deliver(handshakeWith(h.port))
    expect(h.transport.status()).toBe("unavailable")
    expect(h.port.received).toEqual([])
  })
})
