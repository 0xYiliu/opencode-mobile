import { describe, expect, test } from "bun:test"
import {
  FILES_BRIDGE,
  FILES_HANDSHAKE,
  createWebMessageFilesTransport,
  type FilesBridgeResponse,
} from "../src/files/transport"
import { SSH_HANDSHAKE } from "../src/ssh/bridge"
import { PROBE_HANDSHAKE } from "../src/probe"
import { SVCOPS_HANDSHAKE } from "../src/service-ops/bridge"
import { VAULT_HANDSHAKE } from "../src/vault/transport"

// Files bridge transport (issue #16, plan D2) — the FIFTH protocol-isolated WebMessage
// bridge. All payloads in tests are synthetic; nothing touches a clipboard, a disk or a
// network.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type NativeReply = Record<string, unknown>

// ---------------------------------------------------------------------------
// In-process files bridge engine (software mirror of the native side, same shape as the
// probe/svcops engines; lets the transport be exercised over the exact message protocol).
// ---------------------------------------------------------------------------
function createInProcessFilesEngine(serve: (op: string, params: Record<string, unknown>) => NativeReply | "silence") {
  const sent: string[] = []
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  let acked = false

  const transport = createWebMessageFilesTransport({
    subscribe(handler) {
      subscriber = handler
      return () => {
        subscriber = undefined
      }
    },
  })

  const nativePort = {
    postMessage(raw: string) {
      sent.push(raw)
      void (async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (typeof parsed !== "object" || parsed === null) return
        const record = parsed as Record<string, unknown>
        if (record["op"] === "ack") {
          acked = true
          return
        }
        const id = record["id"]
        const op = record["op"]
        const params = (typeof record["params"] === "object" && record["params"] !== null ? record["params"] : {}) as Record<string, unknown>
        if (typeof id !== "string" || typeof op !== "string") return
        const reply = serve(op, params)
        if (reply === "silence") return
        push({ id, ...reply })
      })()
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
    close() {
      /* engine port close is a no-op */
    },
  }

  function push(raw: unknown) {
    nativePort.onmessage?.({ data: JSON.stringify(raw) })
  }

  return {
    transport,
    native: {
      connect: () => subscriber?.call(undefined, { data: FILES_BRIDGE.handshake, ports: [nativePort] }),
      deliver: (event: { data: unknown; ports?: unknown }) => subscriber?.call(undefined, event),
      sent: () => [...sent],
      acked: () => acked,
    },
  }
}

function nativePortLike() {
  return {
    postMessage: () => {},
    onmessage: null as ((event: { data: unknown }) => void) | null,
  }
}

describe("files bridge transport handshake + isolation", () => {
  test("before handshake + ack the transport is unavailable and sends nothing", async () => {
    const engine = createInProcessFilesEngine(() => ({ ok: true, result: {} }))
    expect(engine.transport.status()).toBe("unavailable")
    await expect(engine.transport.request("clipboardImage", {})).rejects.toThrow("handshake not captured")
    expect(engine.native.sent().length).toBe(0) // zero capability before ack
  })

  test("handshake capture + ack flips availability", async () => {
    const engine = createInProcessFilesEngine(() => ({ ok: true, result: null }))
    engine.native.connect()
    await drain()
    expect(engine.native.acked()).toBe(true)
    expect(engine.transport.status()).toBe("available")
    const response = await engine.transport.request("clipboardImage", {})
    expect(response.ok).toBe(true)
  })

  test("the four sibling handshake strings are NOT captured (protocol isolation, pairwise)", async () => {
    for (const sibling of [VAULT_HANDSHAKE, PROBE_HANDSHAKE, SSH_HANDSHAKE, SVCOPS_HANDSHAKE]) {
      const engine = createInProcessFilesEngine(() => ({ ok: true, result: {} }))
      engine.native.deliver({ data: sibling, ports: [nativePortLike()] })
      await drain()
      expect(engine.transport.status()).toBe("unavailable")
      expect(engine.native.acked()).toBe(false)
    }
  })

  test("malformed handshakes are ignored (shape validation: data equality + exactly one port)", async () => {
    const engine = createInProcessFilesEngine(() => ({ ok: true, result: {} }))
    engine.native.deliver({ data: FILES_HANDSHAKE, ports: [] })
    engine.native.deliver({ data: FILES_HANDSHAKE, ports: [nativePortLike(), nativePortLike()] })
    engine.native.deliver({ data: 42, ports: [nativePortLike()] })
    engine.native.deliver({ data: FILES_HANDSHAKE })
    await drain()
    expect(engine.transport.status()).toBe("unavailable")
    // A valid capture still wins afterwards (earlier garbage never consumed the round).
    engine.native.connect()
    await drain()
    expect(engine.transport.status()).toBe("available")
  })

  test("handshake string is distinct from all four siblings and the marker anchors the dist audit", () => {
    expect(FILES_HANDSHAKE).toBe("opencode-mobile-files-handshake")
    expect(FILES_HANDSHAKE).not.toBe(VAULT_HANDSHAKE)
    expect(FILES_HANDSHAKE).not.toBe(PROBE_HANDSHAKE)
    expect(FILES_HANDSHAKE).not.toBe(SSH_HANDSHAKE)
    expect(FILES_HANDSHAKE).not.toBe(SVCOPS_HANDSHAKE)
    expect(FILES_BRIDGE.marker).toContain("mobile(files-v1)")
    expect(FILES_BRIDGE.handshake).toBe(FILES_HANDSHAKE)
  })
})

describe("files bridge transport request semantics", () => {
  test("requestId correlation: responses resolve their own promise", async () => {
    const engine = createInProcessFilesEngine((op) => (op === "save" ? { ok: true, result: { saved: true } } : { ok: true, result: null }))
    engine.native.connect()
    await drain()
    const save = engine.transport.request("save", { name: "a.json", mime: "application/json", data: "e30=" })
    const probe = engine.transport.request("clipboardImage", {})
    expect(await save).toEqual({ id: expect.any(String), ok: true, result: { saved: true } } as FilesBridgeResponse)
    expect((await probe).ok).toBe(true)
  })

  test("a hung bridge times out into an explicit unavailable state", async () => {
    let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const silentPort = {
      postMessage(raw: string) {
        // ack arrives, but responses never do
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (parsed["op"] === "ack") acked = true
      },
      onmessage: null as ((event: { data: unknown }) => void) | null,
    }
    let acked = false
    const transport = createWebMessageFilesTransport({
      timeoutMs: 30,
      subscribe(handler) {
        subscriber = handler
        return () => {
          subscriber = undefined
        }
      },
    })
    subscriber?.call(undefined, { data: FILES_BRIDGE.handshake, ports: [silentPort] })
    await drain()
    expect(acked).toBe(true)
    await expect(transport.request("save", { name: "a.json", mime: "application/json", data: "e30=" })).rejects.toThrow(
      "timed out",
    )
    expect(transport.status()).toBe("unavailable")
  })

  test("error responses carry the native wire code through unchanged", async () => {
    const engine = createInProcessFilesEngine(() => ({ ok: false, code: "too-large", message: "" }))
    engine.native.connect()
    await drain()
    const response = await engine.transport.request("save", { name: "a.bin", mime: "application/octet-stream", data: "AA==" })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe("too-large")
  })

  test("dispose stops the transport and late responses are ignored", async () => {
    const engine = createInProcessFilesEngine(() => "silence")
    engine.native.connect()
    await drain()
    engine.transport.dispose()
    expect(engine.transport.status()).toBe("unavailable")
    await expect(engine.transport.request("clipboardImage", {})).rejects.toThrow("handshake not captured")
  })
})

// FilesBridgeTransport type usage guard (compile-time shape check).
const _transportShape: import("../src/files/transport").FilesBridgeTransport | undefined = undefined
void _transportShape
