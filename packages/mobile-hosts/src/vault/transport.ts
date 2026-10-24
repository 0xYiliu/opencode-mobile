// Vault bridge transport (issue #4, decision D1) — the JS side of the platform
// WebMessage channel.
//
// Trust model (docs/design/architecture.md "vault 桥的三层信任"):
// - event.origin is NEVER consulted: embedder-posted messages carry an empty origin by
//   platform construction (Chromium AwContents.postMessageToMainFrame hardcodes
//   sourceOrigin=null -> blink originForBindings() "" -> PostMessageTest SOURCE_ORIGIN="").
//   Trust comes from (1) the platform-enforced targetOrigin on the native post, (2) port
//   confinement (the port lives in this module's closure, never on a global), and
//   (3) zero capability before the handshake is captured and acked.
// - Handshake shape is validated strictly: data === "opencode-mobile-vault-handshake" and
//   exactly one port. Malformed events never capture; after the first successful capture
//   every later handshake is ignored (retry/multi-onPageFinished desync guard).
// - Messages are JSON strings in both directions (zero binary across the bridge), with a
//   requestId correlating responses.

import { VaultError, type VaultErrorCode } from "./types"

/** The handshake string the native side posts with the transferable port. */
export const VAULT_HANDSHAKE = "opencode-mobile-vault-handshake"

/**
 * Bridge constants object; `marker` anchors the V-secret dist audit (docs/build-and-verify.md):
 * the string survives minification inside this used object and lets the built bundle be
 * checked for the vault contract (mobile(vault-v1)) the same way mobile(M-002) is.
 */
export const VAULT_BRIDGE = {
  marker: "mobile(vault-v1): keystore envelope v1 over the platform web message channel",
  handshake: VAULT_HANDSHAKE,
} as const

export type VaultOperation = "put" | "remove" | "get" | "list"

export type VaultResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; code: VaultErrorCode; message?: string }

/** Minimal view of the message event the subscriber receives (data/ports only — never origin). */
export interface VaultHandshakeEvent {
  data: unknown
  ports?: unknown
}

/** The duck-typed port surface this module relies on (Android WebMessagePort and the test engine both match it). */
export interface VaultPortLike {
  postMessage(message: string): void
  onmessage: ((event: { data: unknown }) => void) | null
  close?: () => void
}

export interface VaultTransport {
  /** Current availability (available once the handshake was captured and ack was sent). */
  status(): "unavailable" | "available"
  /** Subscribe to availability flips; returns an unsubscribe function. */
  onReady(listener: (available: boolean) => void): () => void
  /**
   * Send one request over the captured port and correlate the response by requestId.
   * Throws VaultError("unavailable") before capture or after the channel died.
   */
  request(op: VaultOperation, params: Record<string, unknown>): Promise<VaultResponse>
  /** Tear down: unsubscribe, close the port, reject pending requests. Idempotent. */
  dispose(): void
}

export interface WebMessageChannelTransportOptions {
  /**
   * Subscribe to candidate handshake events (the entry wires this to window "message"
   * events; tests feed synthetic events). The handler receives the event as-is.
   */
  subscribe(handler: (event: VaultHandshakeEvent) => void): () => void
  /** Per-request timeout; a dead bridge must not hang callers. Default 15000ms. */
  timeoutMs?: number
  /** Injectable request id source (tests); defaults to crypto.randomUUID. */
  requestId?: () => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function defaultRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  const bytes = c.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * The production transport: listens for the native handshake, captures the port into this
 * closure (never a global), acks immediately and serves request/response with requestId
 * correlation. See the module header for the trust model; origin is deliberately absent.
 */
export function createWebMessageChannelTransport(options: WebMessageChannelTransportOptions): VaultTransport {
  const timeoutMs = options.timeoutMs ?? 15000
  const nextRequestId = options.requestId ?? defaultRequestId

  let port: VaultPortLike | null = null
  let dead = false
  const readyListeners = new Set<(available: boolean) => void>()
  const pending = new Map<string, { resolve: (r: VaultResponse) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>()

  const unsubscribe = options.subscribe((event: VaultHandshakeEvent) => {
    if (port || dead) return // first successful capture wins; later handshakes are ignored
    if (!isRecord(event) || event["data"] !== VAULT_BRIDGE.handshake) return
    const ports = event["ports"]
    if (!Array.isArray(ports) || ports.length !== 1) return
    const candidate = ports[0]
    if (!isRecord(candidate) || typeof candidate["postMessage"] !== "function") return
    // Capture into the closure (port confinement) and dispatch responses. Port messages are
    // JSON strings in both directions (zero binary across the bridge).
    candidate["onmessage"] = (event: { data: unknown }) => {
      if (typeof event?.data !== "string") return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!isRecord(parsed)) return
      const id = parsed["id"]
      if (typeof id !== "string") return
      const entry = pending.get(id)
      if (!entry) return // unknown or already-settled correlation id: ignore
      clearTimeout(entry.timer)
      pending.delete(id)
      entry.resolve(parsed as unknown as VaultResponse)
    }
    port = candidate as unknown as VaultPortLike
    // Ack immediately; messages are in-order on the port pair, so the native side has the
    // ack before any request that follows.
    try {
      port.postMessage(JSON.stringify({ op: "ack" }))
    } catch {
      port = null
      return
    }
    for (const listener of readyListeners) listener(true)
  })

  const failAll = (error: VaultError) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  const die = (error: VaultError) => {
    if (dead) return
    dead = true
    failAll(error)
    try {
      port?.close?.()
    } catch {
      // closing a dead port must never mask the original failure
    }
    port = null
    for (const listener of readyListeners) listener(false)
  }

  return {
    status: () => (port && !dead ? "available" : "unavailable"),
    onReady(listener) {
      readyListeners.add(listener)
      return () => readyListeners.delete(listener)
    },
    request(op, params) {
      if (!port || dead) return Promise.reject(new VaultError("unavailable", "vault bridge handshake not captured"))
      const id = nextRequestId()
      return new Promise<VaultResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          // A hung bridge is treated as unavailable: explicit state, no silent retry loop.
          die(new VaultError("unavailable", `vault request ${op} timed out`))
          reject(new VaultError("unavailable", `vault request ${op} timed out`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          port!.postMessage(JSON.stringify({ id, op, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          die(new VaultError("unavailable", "vault bridge write failed"))
          reject(new VaultError("unavailable", `vault bridge write failed: ${String(error)}`))
        }
      })
    },
    dispose() {
      unsubscribe()
      die(new VaultError("unavailable", "vault transport disposed"))
    },
  }
}

// ---------------------------------------------------------------------------
// In-process test engine (software mirror of the native side; also the engine the
// scripts/verify-credential-vault.ts probes run on).
// ---------------------------------------------------------------------------

export interface InProcessVaultHandlers {
  /** Handle one validated native-side operation. Throwing a VaultError maps to an error response. */
  handle(op: VaultOperation, params: Record<string, unknown>): Promise<unknown>
}

export interface InProcessVaultEngine {
  client: VaultTransport
  native: {
    /** Deliver the handshake to the client subscriber (as the WebView would) and process the ack. */
    connect(): void
    /** Deliver an arbitrary event shape to the subscriber (malformed-handshake tests). */
    deliver(event: VaultHandshakeEvent): void
    /** Messages the client posted on the port, oldest first (raw JSON strings). */
    sent(): string[]
    /** Push a JSON message to the client as the native side would (handcrafted responses). */
    push(raw: unknown): void
    /** Run queued client messages through the operation handlers (auto-invoked by default). */
    pump(): Promise<void>
    /** Whether the client's ack arrived. */
    acked(): boolean
  }
}

/**
 * A fake native bridge in-process. By default it auto-pumps client messages through the
 * supplied handlers (so put/remove/get/list round-trip synchronously-ish); tests can also
 * drive handcrafted responses via push().
 */
export function createInProcessVaultEngine(handlers: InProcessVaultHandlers, options?: { timeoutMs?: number; requestId?: () => string }): InProcessVaultEngine {
  const sent: string[] = []
  let subscriber: ((event: VaultHandshakeEvent) => void) | undefined
  let acked = false

  const client = createWebMessageChannelTransport({
    timeoutMs: options?.timeoutMs,
    requestId: options?.requestId,
    subscribe(handler) {
      subscriber = handler
      return () => {
        subscriber = undefined
      }
    },
  })

  const nativePort = {
    postMessage(raw: string) {
      // Client -> native. Ack flips the native flag; everything else is handled and answered.
      sent.push(raw)
      void (async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (!isRecord(parsed)) return
        if (parsed["op"] === "ack") {
          acked = true
          return
        }
        const id = parsed["id"]
        const op = parsed["op"]
        const params = isRecord(parsed["params"]) ? parsed["params"] : {}
        if (typeof id !== "string" || typeof op !== "string") return
        try {
          const result = await handlers.handle(op as VaultOperation, params)
          push({ id, ok: true, result })
        } catch (error) {
          if (error instanceof VaultError) push({ id, ok: false, code: error.code, message: error.message })
          else push({ id, ok: false, code: "io", message: String(error) })
        }
      })()
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
    close() {
      /* engine port close is a no-op */
    },
  }

  function push(raw: unknown) {
    // Native -> client messages travel the port, not the handshake subscriber: stringify and
    // deliver through the onmessage dispatch the client installed on the port.
    nativePort.onmessage?.({ data: JSON.stringify(raw) })
  }

  return {
    client,
    native: {
      connect() {
        subscriber?.call(undefined, { data: VAULT_BRIDGE.handshake, ports: [nativePort] })
      },
      deliver(event) {
        subscriber?.call(undefined, event)
      },
      sent: () => [...sent],
      push,
      pump: async () => {
        /* the engine auto-pumps; kept for explicitness in probes */
      },
      acked: () => acked,
    },
  }
}
