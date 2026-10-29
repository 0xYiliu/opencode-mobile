// Endpoint probe port (issue #5, decision 0002 D2/D4) — the shell-side error CLASSIFIER.
//
// The probe is never the authority: it answers "why did the transport fail" with one of
// the DirectErrorCode values so the connect dialog can show an actionable message. The
// upstream health check (real fetch) stays authoritative for whether a save proceeds; a
// classification that conflicts with a real fetch result is discarded in favor of the
// real result (M-013 consumes classifications only after the health check failed).
//
// Default port = StubProbePort, fail-closed: every query answers { status: "unavailable" }
// and the caller degrades to the upstream generic error message. A classification is
// never fabricated. The Android shell injects the bridge-backed client (M-014); tests
// inject the in-process engine client.
//
// Credential boundary (decision 0002 F1): the probe request carries the just-typed
// password so 401/403 classifications are meaningful; it crosses the bridge once, lives
// for the duration of one request, is never logged, never persisted, and the response
// carries only the classification code (no free text, no echo).
//
// Bridge transport: a deliberate protocol-isolated mirror of the vault bridge transport
// (independent handshake string, own channel, own ack lifecycle) so the probe can never
// perturb the vault bridge gates C1–C5. event.origin is never consulted — embedder-posted
// messages carry an empty origin by platform construction (docs/design/architecture.md,
// three-layer trust); trust is targetOrigin enforcement + port confinement + zero
// capability before ack.

import type { MessageKey } from "./i18n"
import { isDirectErrorCode, type DirectErrorCode } from "./transport/connection-errors"

// ---------------------------------------------------------------------------
// Port + fail-closed stub
// ---------------------------------------------------------------------------

export type ProbeRequest = { url: string; password?: string }

export type ProbeResult = { status: "available"; code: DirectErrorCode } | { status: "unavailable" }

export interface ProbePort {
  /** Classify one endpoint. Never throws: every failure path degrades to unavailable. */
  probe(request: ProbeRequest): Promise<ProbeResult>
}

/** Fail-closed stub: never classifies, never fakes. The caller shows the generic error. */
export const StubProbePort: ProbePort = {
  probe: async () => ({ status: "unavailable" }),
}

// ---------------------------------------------------------------------------
// Classification -> copy mapping (first-party i18n; EN/ZH self-contained set)
// ---------------------------------------------------------------------------

/**
 * The mobile-hosts i18n key of a classification ("direct.error.<code>"). This is the
 * FIRST-PARTY key set (used by first-party UI surfaces); the vendored connect dialog
 * (M-013) consumes the separate app-i18n keys dialog.server.error.<code> — two key sets,
 * two consumers, documented in docs/design/units/connection.md.
 */
export function directErrorCodeMessageKey(code: DirectErrorCode): MessageKey {
  return `direct.error.${code}` as MessageKey
}

// ---------------------------------------------------------------------------
// Bridge transport (protocol-isolated mirror of the vault bridge)
// ---------------------------------------------------------------------------

/** The handshake string the native side posts with the transferable port. */
export const PROBE_HANDSHAKE = "opencode-mobile-probe-handshake"

/**
 * Bridge constants; `marker` anchors the V-conn dist audit the same way mobile(M-002)/
 * mobile(vault-v1) do — the string survives minification inside this used object.
 */
export const PROBE_BRIDGE = {
  marker: "mobile(probe-v1): endpoint probe classifier over the platform web message channel",
  handshake: PROBE_HANDSHAKE,
} as const

export type ProbeBridgeResponse =
  | { id: string; ok: true; result: { code: DirectErrorCode } }
  | { id: string; ok: false; code: string; message?: string }

export interface ProbeBridgeTransport {
  status(): "unavailable" | "available"
  onReady(listener: (available: boolean) => void): () => void
  request(op: "probe", params: Record<string, unknown>): Promise<ProbeBridgeResponse>
  dispose(): void
}

export interface WebMessageProbeTransportOptions {
  /** Subscribe to candidate handshake events (the entry wires this to window messages). */
  subscribe(handler: (event: { data: unknown; ports?: unknown }) => void): () => void
  /** Per-request timeout; a dead bridge must not hang callers. Default 20000ms. */
  timeoutMs?: number
  /** Injectable request id source (tests); defaults to crypto.randomUUID. */
  requestId?: () => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** The duck-typed port surface this transport relies on (Android WebMessagePort and test engines match it). */
interface ProbePortLike {
  postMessage(message: string): void
  onmessage: ((event: { data: unknown }) => void) | null
  close?: () => void
}

function defaultRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  const bytes = c.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * The production transport: listens for the native probe handshake, captures the port
 * into this closure (never a global), acks immediately, serves requestId-correlated
 * probe requests. The vault handshake string is NOT captured here and this module's
 * handshake is not captured by the vault transport — the strict data equality on both
 * sides guarantees the two bridges stay isolated even though both listeners sit on the
 * same window message events.
 */
export function createWebMessageProbeTransport(options: WebMessageProbeTransportOptions): ProbeBridgeTransport {
  const timeoutMs = options.timeoutMs ?? 20000
  const nextRequestId = options.requestId ?? defaultRequestId

  let port: ProbePortLike | null = null
  let dead = false
  const readyListeners = new Set<(available: boolean) => void>()
  const pending = new Map<string, { resolve: (r: ProbeBridgeResponse) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>()

  const unsubscribe = options.subscribe((event) => {
    if (port || dead) return // first successful capture wins; later handshakes are ignored
    if (!isRecord(event) || event["data"] !== PROBE_BRIDGE.handshake) return
    const ports = event["ports"]
    if (!Array.isArray(ports) || ports.length !== 1) return
    const candidate = ports[0]
    if (!isRecord(candidate) || typeof candidate["postMessage"] !== "function") return
    const candidatePort = candidate as unknown as ProbePortLike
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
      if (typeof id !== "string") return
      const entry = pending.get(id)
      if (!entry) return // unknown or already-settled correlation id: ignore
      clearTimeout(entry.timer)
      pending.delete(id)
      entry.resolve(parsed as unknown as ProbeBridgeResponse)
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
    failAll(new Error("probe bridge unavailable"))
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
      if (!port || dead) return Promise.reject(new Error("probe bridge handshake not captured"))
      const id = nextRequestId()
      return new Promise<ProbeBridgeResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          die() // a hung bridge is an explicit unavailable state, never a silent hang
          reject(new Error("probe bridge request timed out"))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          port!.postMessage(JSON.stringify({ id, op, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          die()
          reject(error instanceof Error ? error : new Error("probe bridge write failed"))
        }
      })
    },
    dispose() {
      unsubscribe()
      die()
    },
  }
}

// ---------------------------------------------------------------------------
// Client: ProbePort over the bridge transport
// ---------------------------------------------------------------------------

/**
 * The bridge-backed probe port. EVERY failure path (bridge unavailable, error response,
 * malformed code, transport throw) degrades to { status: "unavailable" } — the caller
 * shows the upstream generic message; a classification is never invented here. A
 * credential-bearing (userinfo) URL never crosses the bridge: the transport-level
 * credential-url refusal is surfaced by the URL policy at the save path, not by a probe
 * that would have to send those credentials.
 */
export function createProbeClient(transport: ProbeBridgeTransport): ProbePort {
  return {
    probe: async (request: ProbeRequest): Promise<ProbeResult> => {
      try {
        if (transport.status() !== "available") return { status: "unavailable" }
        const probeUrl = new URL(request.url) // absolute http(s) only; also normalizes the check below
        if (probeUrl.protocol !== "https:" && probeUrl.protocol !== "http:") return { status: "unavailable" }
        if (probeUrl.username !== "" || probeUrl.password !== "") return { status: "unavailable" }
        const response = await transport.request("probe", {
          url: probeUrl.href,
          ...(request.password !== undefined ? { password: request.password } : {}),
        })
        if (!response.ok) return { status: "unavailable" }
        const code = (response.result as { code?: unknown } | null)?.code
        if (!isDirectErrorCode(code)) return { status: "unavailable" }
        return { status: "available", code }
      } catch {
        return { status: "unavailable" }
      }
    },
  }
}
