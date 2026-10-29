// Notifications bridge transport (issue #23, plan D3) — the JS side of the SIXTH
// protocol-isolated WebMessage bridge.
//
// This module is a deliberate mirror of the files bridge transport (../files/transport.ts),
// which mirrors the svcops bridge, which mirrors the ssh bridge, which mirrors the probe,
// which mirrors the vault bridge: same channel mechanics, entirely separate protocol. Six
// bridges share one window message event stream but each transport captures ONLY its own
// handshake string with exactly one port (strict data equality), so none can capture
// another's handshake and none can reset another's ack lifecycle — the vault gates (C1–C5),
// probe gate (G16), ssh behavior, the G18 four-bridge / G27 five-bridge bring-ups and this
// module are mutually independent; the static probes (scripts/verify-attachments-artifacts.ts
// + scripts/verify-notifications.ts) assert all six handshake strings pairwise distinct.
//
// Trust model (docs/design/architecture.md, three-layer trust; identical to the siblings):
// - event.origin is NEVER consulted: embedder-posted messages carry an empty origin by
//   platform construction. Trust = platform-enforced targetOrigin + port confinement
//   (closure, never a global) + zero capability before the handshake is captured/acked.
// - Messages are JSON strings both ways with requestId correlation. Zero binary across the
//   bridge. Zero credentials: the notification payload is {category, title, body, route}
//   ONLY — no permission payload fields (action/resources/message), no tokens, no URLs.
//
// Handshake: "opencode-mobile-notifications-handshake" — distinct from the vault's, the
// probe's, the ssh bridge's, the svcops bridge's and the files bridge's (pairwise
// inequality locked in tests and the probes).
//
// Timeout: the default (5 min) mirrors the siblings because the requestPermission op can
// keep the system POST_NOTIFICATIONS dialog open — the request resolves only after the
// user decides. A hung/died bridge still dies into an explicit unavailable state (never a
// silent hang).

/** The handshake string the native side posts with the transferable port. */
export const NOTIFICATIONS_HANDSHAKE = "opencode-mobile-notifications-handshake"

/**
 * Bridge constants; `marker` anchors the dist audit (mobile(notifications-v1)) the same way
 * mobile(files-v1)/mobile(svcops-v1)/mobile(ssh-v1)/mobile(probe-v1)/mobile(vault-v1) do —
 * the string survives minification inside this used object.
 */
export const NOTIFICATIONS_BRIDGE = {
  marker: "mobile(notifications-v1): notifications bridge transport over the platform web message channel",
  handshake: NOTIFICATIONS_HANDSHAKE,
} as const

export type NotificationsBridgeOperation = "notify" | "requestPermission"

export type NotificationsBridgeResponse =
  | { id: string; ok: true; result: Record<string, unknown> }
  | { id: string; ok: false; code: string; message?: string }

export interface NotificationsBridgeTransport {
  status(): "unavailable" | "available"
  onReady(listener: (available: boolean) => void): () => void
  /**
   * Send one request and correlate by requestId. Rejects before capture, after channel
   * death, or on a timed-out request (explicit unavailable state — never a silent hang).
   */
  request(op: NotificationsBridgeOperation, params: Record<string, unknown>): Promise<NotificationsBridgeResponse>
  dispose(): void
}

export interface WebMessageNotificationsTransportOptions {
  /** Subscribe to candidate handshake events (the entry wires this to window messages). */
  subscribe(handler: (event: { data: unknown; ports?: unknown }) => void): () => void
  /**
   * Per-request timeout. Must exceed real user interaction with the system
   * POST_NOTIFICATIONS dialog; default 300000ms (5 min). A hung bridge dies into an
   * explicit unavailable state.
   */
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
 * The production transport: listens for the native notifications handshake, captures the
 * port into this closure (never a global), acks immediately and serves requestId-correlated
 * requests. The five sibling handshake strings are NOT captured here and this module's
 * handshake is not captured by them — strict data equality on both sides keeps the six
 * bridges isolated even though all listeners sit on the same window messages.
 */
export function createWebMessageNotificationsTransport(options: WebMessageNotificationsTransportOptions): NotificationsBridgeTransport {
  const timeoutMs = options.timeoutMs ?? 300_000
  const nextRequestId = options.requestId ?? defaultRequestId

  let port: {
    postMessage(message: string): void
    onmessage: ((event: { data: unknown }) => void) | null
    close?: () => void
  } | null = null
  let dead = false
  const readyListeners = new Set<(available: boolean) => void>()
  const pending = new Map<
    string,
    { resolve: (r: NotificationsBridgeResponse) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >()

  const unsubscribe = options.subscribe((event) => {
    if (port || dead) return // first successful capture wins; later handshakes are ignored
    if (!isRecord(event) || event["data"] !== NOTIFICATIONS_BRIDGE.handshake) return
    const ports = event["ports"]
    if (!Array.isArray(ports) || ports.length !== 1) return
    const candidate = ports[0]
    if (!isRecord(candidate) || typeof candidate["postMessage"] !== "function") return
    const candidatePort = candidate as unknown as {
      postMessage: (m: string) => void
      onmessage: ((e: { data: unknown }) => void) | null
      close?: () => void
    }
    candidatePort.onmessage = (event: { data: unknown }) => {
      if (typeof event?.data !== "string") return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!isRecord(parsed)) return
      const id = parsed["id"]
      if (typeof id !== "string") return // unsolicited native faces do not exist on this bridge
      const entry = pending.get(id)
      if (!entry) return // unknown or already-settled correlation id: ignore
      clearTimeout(entry.timer)
      pending.delete(id)
      entry.resolve(parsed as unknown as NotificationsBridgeResponse)
    }
    try {
      candidatePort.postMessage(JSON.stringify({ op: "ack" }))
    } catch {
      return
    }
    port = candidatePort
    for (const listener of readyListeners) listener(true)
  })

  const failAll = (error: unknown) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  const die = () => {
    if (dead) return
    dead = true
    failAll(new Error("notifications bridge channel died"))
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
      if (!port || dead) return Promise.reject(new Error("notifications bridge handshake not captured"))
      const id = nextRequestId()
      return new Promise<NotificationsBridgeResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          die() // a hung bridge is an explicit unavailable state, never a silent hang
          reject(new Error(`notifications bridge request ${op} timed out`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          port!.postMessage(JSON.stringify({ id, op, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          die()
          reject(error)
        }
      })
    },
    dispose() {
      unsubscribe()
      die()
    },
  }
}
