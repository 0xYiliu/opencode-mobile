// SSH bridge transport (issue #6, decision 0003 §2) — the JS side of the THIRD
// protocol-isolated WebMessage bridge.
//
// This module is a deliberate mirror of the probe bridge transport (./probe.ts), which is
// itself a mirror of the vault bridge (./vault/transport.ts): same channel mechanics,
// entirely separate protocol. The three bridges share one window message event stream but
// each transport captures ONLY its own handshake string with exactly one port (strict
// data equality), so none can capture another's handshake and none can reset another's
// ack lifecycle — the vault gates (C1–C5) and probe gates (G16) are not perturbed by this
// bridge's existence (G17 covers the three-bridge bring-up on device).
//
// Trust model (docs/design/architecture.md, three-layer trust; identical to vault/probe):
// - event.origin is NEVER consulted: embedder-posted messages carry an empty origin by
//   platform construction. Trust = platform-enforced targetOrigin + port confinement
//   (closure, never a global) + zero capability before the handshake is captured/acked.
// - Messages are JSON strings both ways with requestId correlation. Zero binary.
//
// Credential red lines (decision 0003 §4): the `connect` request carries the resolved
// credential (password or key envelope JSON) and `fetchHostKey` never authenticates.
// Credential material crosses one way, exactly once, is never logged, never persisted and
// never echoed — responses carry classifications/endpoints only. The native side (Kotlin
// SshTunnelBridge) enforces the mirrored bounds.
//
// Handshake: "opencode-mobile-ssh-handshake" — distinct from the vault's and the probe's.

import { DEFAULT_SERVICE_PORT } from "../registry"
import { isSshErrorCode, SshTransportError } from "../transport/ssh-errors"

/** The handshake string the native side posts with the transferable port. */
export const SSH_HANDSHAKE = "opencode-mobile-ssh-handshake"

/**
 * Bridge constants; `marker` anchors the dist audit (mobile(ssh-v1)) the same way
 * mobile(M-002)/mobile(vault-v1)/mobile(probe-v1) do — the string survives minification
 * inside this used object.
 */
export const SSH_BRIDGE = {
  marker: "mobile(ssh-v1): ssh tunnel transport over the platform web message channel",
  handshake: SSH_HANDSHAKE,
} as const

export type SshBridgeOperation = "connect" | "disconnect" | "fetchHostKey" | "removeHostKey" | "cancel"

/** Native-pushed event (no requestId): the client-side tunnel dropped; the remote keeps running. */
export type SshBridgeEvent = { type: "connectionLost"; host: string; port: number }

export type SshBridgeResponse =
  | { id: string; ok: true; result: Record<string, unknown> }
  | { id: string; ok: false; code: string; message?: string }

export interface SshBridgeTransport {
  status(): "unavailable" | "available"
  onReady(listener: (available: boolean) => void): () => void
  /** Subscribe to unsolicited native events (connectionLost). Returns an unsubscribe. */
  onEvent(listener: (event: SshBridgeEvent) => void): () => void
  /**
   * Send one request and correlate by requestId. Throws SshTransportError("bridge-unavailable")
   * before capture, after channel death, or on a timed-out request (explicit unavailable
   * state — never a silent hang).
   */
  request(op: SshBridgeOperation, params: Record<string, unknown>): Promise<SshBridgeResponse>
  dispose(): void
}

export interface WebMessageSshTransportOptions {
  /** Subscribe to candidate handshake events (the entry wires this to window messages). */
  subscribe(handler: (event: { data: unknown; ports?: unknown }) => void): () => void
  /**
   * Per-request timeout. Must exceed the native bounds (connect 30s, key scan 15s —
   * decision 0003 F6/F2); default 45000ms. A hung bridge dies into an explicit
   * unavailable state.
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
 * The production transport: listens for the native ssh handshake, captures the port into
 * this closure (never a global), acks immediately, serves requestId-correlated requests
 * and routes unsolicited native events (connectionLost). The vault and probe handshake
 * strings are NOT captured here and this module's handshake is not captured by them —
 * strict data equality on both sides keeps the three bridges isolated.
 */
export function createWebMessageSshTransport(options: WebMessageSshTransportOptions): SshBridgeTransport {
  const timeoutMs = options.timeoutMs ?? 45000
  const nextRequestId = options.requestId ?? defaultRequestId

  let port: {
    postMessage(message: string): void
    onmessage: ((event: { data: unknown }) => void) | null
    close?: () => void
  } | null = null
  let dead = false
  const readyListeners = new Set<(available: boolean) => void>()
  const eventListeners = new Set<(event: SshBridgeEvent) => void>()
  const pending = new Map<
    string,
    { resolve: (r: SshBridgeResponse) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >()

  const unsubscribe = options.subscribe((event) => {
    if (port || dead) return // first successful capture wins; later handshakes are ignored
    if (!isRecord(event) || event["data"] !== SSH_BRIDGE.handshake) return
    const ports = event["ports"]
    if (!Array.isArray(ports) || ports.length !== 1) return
    const candidate = ports[0]
    if (!isRecord(candidate) || typeof candidate["postMessage"] !== "function") return
    const candidatePort = candidate as unknown as { postMessage: (m: string) => void; onmessage: ((e: { data: unknown }) => void) | null; close?: () => void }
    candidatePort.onmessage = (event: { data: unknown }) => {
      if (typeof event?.data !== "string") return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!isRecord(parsed)) return
      // Unsolicited native event (no requestId): connectionLost only — anything else is
      // ignored. Events carry the session coordinates, never any credential material.
      if (typeof parsed["id"] !== "string") {
        if (parsed["event"] === "connectionLost" && typeof parsed["host"] === "string" && typeof parsed["port"] === "number") {
          const connectionLost: SshBridgeEvent = { type: "connectionLost", host: parsed["host"], port: parsed["port"] }
          for (const listener of eventListeners) listener(connectionLost)
        }
        return
      }
      const id = parsed["id"]
      const entry = pending.get(id)
      if (!entry) return // unknown or already-settled correlation id: ignore
      clearTimeout(entry.timer)
      pending.delete(id)
      entry.resolve(parsed as unknown as SshBridgeResponse)
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
    failAll(new SshTransportError("bridge-unavailable", "ssh bridge channel died"))
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
    onEvent(listener) {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    },
    request(op, params) {
      if (!port || dead) return Promise.reject(new SshTransportError("bridge-unavailable", "ssh bridge handshake not captured"))
      const id = nextRequestId()
      return new Promise<SshBridgeResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          die() // a hung bridge is an explicit unavailable state, never a silent hang
          reject(new SshTransportError("bridge-unavailable", `ssh bridge request ${op} timed out`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          port!.postMessage(JSON.stringify({ id, op, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          die()
          reject(error instanceof SshTransportError ? error : new SshTransportError("bridge-unavailable", "ssh bridge write failed"))
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
// Wire-shape validation helpers shared by the verifier and host transport clients
// ---------------------------------------------------------------------------

/** The connect result endpoint: loopback http(s) URL only — the tunnel never yields a remote origin. */
export function parseBridgeEndpoint(result: Record<string, unknown>): { url: string; password?: string } {
  const url = result["url"]
  if (typeof url !== "string" || !/^https?:\/\/(127\.0\.0\.1|\[::1\]):\d+$/.test(url)) {
    throw new SshTransportError("io", "ssh bridge returned a non-loopback or malformed endpoint")
  }
  const password = result["password"]
  if (password !== undefined && typeof password !== "string") {
    throw new SshTransportError("io", "ssh bridge endpoint password shape is invalid")
  }
  return password !== undefined ? { url, password } : { url }
}

/** Validated service port for the connect params (defense in depth above the registry). */
export function bridgeServicePort(servicePort: number | undefined): number {
  const port = servicePort ?? DEFAULT_SERVICE_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SshTransportError("io", "service port out of range")
  return port
}

/** Error-response -> SshTransportError (unknown codes degrade to "io", never fabricated causes). */
export function bridgeErrorToTransportError(code: string, message?: string): SshTransportError {
  return isSshErrorCode(code) ? new SshTransportError(code, message || undefined) : new SshTransportError("io")
}
