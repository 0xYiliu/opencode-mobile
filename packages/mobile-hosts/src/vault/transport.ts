// Vault bridge transports (issue #4 / issue #58). Production uses the origin-bound AndroidX
// WebViewCompat listener (protocol v2). The old transferable-port transport below remains
// only as an in-process test harness for legacy response semantics; native no longer serves it.
//
// Production trust is enforced natively by AndroidX WebKit's exact origin rules plus
// per-message source-origin and main-frame checks. The legacy in-process harness below
// deliberately retains the former shape-only handshake for unrelated fake-bridge tests;
// it is not registered by the Android app and conveys no current production trust claim.

import { VaultError, type VaultErrorCode } from "./types"

/** @deprecated Test-only legacy handshake marker; production protocol v2 does not use it. */
export const VAULT_HANDSHAKE = "opencode-mobile-vault-handshake"

/**
 * Bridge constants object; `marker` anchors the v2 dist audit (docs/build-and-verify.md):
 * the string survives minification inside this used object and lets the built bundle be
 * checked for the vault contract (mobile(vault-v2)) the same way mobile(M-002) is.
 */
export const VAULT_BRIDGE = {
  marker: "mobile(vault-v2): Keystore envelope v1 over origin-bound AndroidX WebMessageListener",
  handshake: VAULT_HANDSHAKE,
} as const

export type VaultOperation = "put" | "remove" | "get" | "list"

/** AndroidX WebViewCompat.addWebMessageListener injected object (protocol v2). */
export interface VaultNativeListener {
  postMessage(message: string): void
  onmessage: ((event: { data: unknown }) => void) | null
}

export function createAndroidXVaultTransport(listener: VaultNativeListener | undefined, options: { timeoutMs?: number; requestId?: () => string } = {}): VaultTransport {
  const timeoutMs = options.timeoutMs ?? 15000
  const nextId = options.requestId ?? defaultRequestId
  let ready = false
  let dead = !listener
  const pending = new Map<string, { op: string; resolve: (value: VaultResponse) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }>()
  const readyListeners = new Set<(available: boolean) => void>()
  const setReady = (value: boolean) => { if (ready !== value) { ready = value; for (const fn of readyListeners) fn(value) } }
  const failAll = (reason: string) => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer); pending.delete(id)
      entry.reject(new VaultError(entry.op === "put" || entry.op === "remove" ? "unknown" : "unavailable", reason))
    }
  }
  if (listener) {
    listener.onmessage = (event) => {
      if (typeof event?.data !== "string") { failAll("malformed vault response"); return }
      let parsed: any
      try { parsed = JSON.parse(event.data) } catch { failAll("malformed vault response"); return }
      const entry = typeof parsed?.id === "string" ? pending.get(parsed.id) : undefined
      if (!entry) return
      clearTimeout(entry.timer); pending.delete(parsed.id)
      if (typeof parsed.ok !== "boolean" || (parsed.ok && !("result" in parsed)) || (!parsed.ok && typeof parsed.code !== "string")) {
        entry.reject(new VaultError(entry.op === "put" || entry.op === "remove" ? "unknown" : "io", "malformed vault response")); return
      }
      entry.resolve(parsed as VaultResponse)
    }
  }
  const transport: VaultTransport = {
    status: () => ready && !dead ? "available" : "unavailable",
    onReady(fn) {
      readyListeners.add(fn)
      // Replay current readiness to close the subscribe race when the native roundtrip
      // completes between the client's initial status() read and its listener registration.
      fn(ready && !dead)
      return () => readyListeners.delete(fn)
    },
    request(op, params) {
      if (!listener || dead) return Promise.reject(new VaultError("unavailable", "vault listener unavailable"))
      const id = nextId()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id); setReady(false)
          const error = new VaultError(op === "put" || op === "remove" ? "unknown" : "unavailable", "vault response timed out; mutation outcome may be unknown")
          failAll("vault response timed out"); reject(error)
        }, timeoutMs)
        pending.set(id, { op, resolve, reject, timer })
        try { listener.postMessage(JSON.stringify({ id, op, params })) }
        catch { clearTimeout(timer); pending.delete(id); reject(new VaultError(op === "put" || op === "remove" ? "unknown" : "unavailable", "vault post failed; outcome may be unknown")) }
      })
    },
    dispose() { dead = true; setReady(false); failAll("vault transport disposed"); if (listener) listener.onmessage = null },
  }
  if (listener) {
    const id = nextId()
    const timer = setTimeout(() => { pending.delete(id) }, timeoutMs)
    pending.set(id, {
      op: "ready",
      resolve: (response) => {
        clearTimeout(timer)
        if (response.ok && response.result === "vault-v2") {
          setReady(true)
        }
      },
      reject: () => { clearTimeout(timer) },
      timer,
    })
    try { listener.postMessage(JSON.stringify({ id, op: "ready", params: { protocol: VAULT_BRIDGE.marker } })) } catch { clearTimeout(timer); pending.delete(id) }
  }
  return transport
}

export type VaultResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; code: VaultErrorCode; message?: string; recoveryRef?: string }

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
  /** Current availability (available after the v2 non-mutating readiness roundtrip). */
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
 * Legacy in-process test transport: listens for the former native handshake, captures its
 * port and serves request/response correlation. Production never calls this function.
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
      if (!port || dead) {
        return Promise.reject(new VaultError("unavailable", "vault bridge handshake not captured"))
      }
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
