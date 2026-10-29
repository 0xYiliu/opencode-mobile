// Service ops bridge transport (issue #7, decision 0004 §2.1) — the JS side of the FOURTH
// protocol-isolated WebMessage bridge.
//
// This module is a deliberate mirror of the ssh bridge transport (../ssh/bridge.ts),
// which mirrors the probe bridge, which mirrors the vault bridge: same channel mechanics,
// entirely separate protocol. Four bridges share one window message event stream but each
// transport captures ONLY its own handshake string with exactly one port (strict data
// equality), so none can capture another's handshake and none can reset another's ack
// lifecycle — the vault gates (C1–C5), probe gate (G16), ssh behavior and the G18
// four-bridge bring-up are independent; the static probe (scripts/verify-service-ops.ts)
// asserts all four handshake strings pairwise distinct.
//
// Trust model (docs/design/architecture.md, three-layer trust; identical to the siblings):
// - event.origin is NEVER consulted: embedder-posted messages carry an empty origin by
//   platform construction. Trust = platform-enforced targetOrigin + port confinement
//   (closure, never a global) + zero capability before the handshake is captured/acked.
// - Messages are JSON strings both ways with requestId correlation. Zero binary.
//
// Credential boundary (N7 — EXPLICIT inheritance of decision 0003 §4): every exec request
// carries the per-command resolved credential (password or key envelope JSON) ONE WAY,
// exactly once; it lives for the duration of that one command in native memory only, is
// never logged, never persisted, never echoed — responses carry exit codes, bounded
// output tails and classifications only. Only store-known hosts (or hosts pinned through
// the connection flow's fingerprint confirmation) are served by the native side at all:
// an unknown-fingerprint host is refused BEFORE any credential is issued, and host-key
// trust is NEVER established by this bridge (decision 0003 §3.3 ownership stays with the
// connection flow — the JS-side protocol shape asserts it in test/service-bridge.test.ts).
//
// The wire protocol carries {templateId, params, os} — NEVER a raw command string. The
// native side assembles the command from its mirrored whitelist (ServiceCommandValidator,
// fail-closed exec-denied); the JS-side table (./commands) exists for preview and the
// closed-domain refusal. Golden vectors lock the two tables to byte-identical outputs.
//
// Handshake: "opencode-mobile-svcops-handshake" — distinct from the vault's, the probe's
// and the ssh bridge's (pairwise-inequality locked in tests and the static probe).

import { ServiceOpsError, isServiceOpsErrorCode } from "./errors"
import type { ServiceOpsErrorCode } from "./errors"
import type { ServiceOsFamily } from "./commands"

/** The handshake string the native side posts with the transferable port. */
export const SVCOPS_HANDSHAKE = "opencode-mobile-svcops-handshake"

/**
 * Bridge constants; `marker` anchors the dist audit (mobile(svcops-v1)) the same way
 * mobile(ssh-v1)/mobile(vault-v1)/mobile(probe-v1) do — the string survives minification
 * inside this used object.
 */
export const SVCOPS_BRIDGE = {
  marker: "mobile(svcops-v1): service ops exec transport over the platform web message channel",
  handshake: SVCOPS_HANDSHAKE,
} as const

export type ServiceOpsBridgeOperation = "exec" | "cancel"

/** One executed whitelisted command: bounded output, explicit truncation, real exit code. */
export type ServiceOpsExecResult = {
  exitCode: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

export type ServiceOpsBridgeResponse =
  | { id: string; ok: true; result: ServiceOpsExecResult }
  | { id: string; ok: false; code: string; message?: string }

export interface ServiceOpsBridgeTransport {
  status(): "unavailable" | "available"
  onReady(listener: (available: boolean) => void): () => void
  /**
   * Send one request and correlate by requestId. Throws ServiceOpsError("svcops-unavailable")
   * before capture, after channel death, or on a timed-out request (explicit unavailable
   * state — never a silent hang).
   */
  request(op: ServiceOpsBridgeOperation, params: Record<string, unknown>): Promise<ServiceOpsBridgeResponse>
  dispose(): void
}

export interface WebMessageServiceOpsTransportOptions {
  /** Subscribe to candidate handshake events (the entry wires this to window messages). */
  subscribe(handler: (event: { data: unknown; ports?: unknown }) => void): () => void
  /**
   * Per-request timeout. Must exceed the native exec bounds (decision 0004 F-svcops);
   * default 60000ms. A hung bridge dies into an explicit unavailable state.
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
 * The production transport: listens for the native svcops handshake, captures the port
 * into this closure (never a global), acks immediately and serves requestId-correlated
 * requests. The vault/probe/ssh handshake strings are NOT captured here and this
 * module's handshake is not captured by them — strict data equality on both sides keeps
 * the four bridges isolated even though all listeners sit on the same window messages.
 */
export function createWebMessageServiceOpsTransport(options: WebMessageServiceOpsTransportOptions): ServiceOpsBridgeTransport {
  const timeoutMs = options.timeoutMs ?? 60_000
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
    { resolve: (r: ServiceOpsBridgeResponse) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >()

  const unsubscribe = options.subscribe((event) => {
    if (port || dead) return // first successful capture wins; later handshakes are ignored
    if (!isRecord(event) || event["data"] !== SVCOPS_BRIDGE.handshake) return
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
      entry.resolve(parsed as unknown as ServiceOpsBridgeResponse)
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
    failAll(new ServiceOpsError("svcops-unavailable", "service ops bridge channel died"))
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
      if (!port || dead) return Promise.reject(new ServiceOpsError("svcops-unavailable", "service ops bridge handshake not captured"))
      const id = nextRequestId()
      return new Promise<ServiceOpsBridgeResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          die() // a hung bridge is an explicit unavailable state, never a silent hang
          reject(new ServiceOpsError("svcops-unavailable", `service ops bridge request ${op} timed out`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          port!.postMessage(JSON.stringify({ id, op, params }))
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          die()
          reject(error instanceof ServiceOpsError ? error : new ServiceOpsError("svcops-unavailable", "service ops bridge write failed"))
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
// Wire-shape validation helpers shared by the port client and the verifier
// ---------------------------------------------------------------------------

/** Validate one exec result shape (bounded strings + explicit truncation flags). */
export function parseBridgeExecResult(result: Record<string, unknown>): ServiceOpsExecResult {
  const exitCode = result["exitCode"]
  const stdout = result["stdout"]
  const stderr = result["stderr"]
  const stdoutTruncated = result["stdoutTruncated"]
  const stderrTruncated = result["stderrTruncated"]
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new ServiceOpsError("exec-failed", "service ops bridge returned a malformed exit code")
  }
  if (typeof stdout !== "string" || typeof stderr !== "string") {
    throw new ServiceOpsError("exec-failed", "service ops bridge returned malformed output faces")
  }
  if (typeof stdoutTruncated !== "boolean" || typeof stderrTruncated !== "boolean") {
    throw new ServiceOpsError("exec-failed", "service ops bridge returned malformed truncation flags")
  }
  return { exitCode, stdout, stderr, stdoutTruncated, stderrTruncated }
}

/**
 * Error-response -> ServiceOpsError. A recognized wire code keeps its classification;
 * an unknown code degrades to exec-failed (a cause is never fabricated — the ssh
 * bridgeErrorToTransportError lesson).
 */
export function bridgeErrorToServiceOpsError(code: string, message?: string): ServiceOpsError {
  return isServiceOpsErrorCode(code)
    ? new ServiceOpsError(code as ServiceOpsErrorCode, message || undefined)
    : new ServiceOpsError("exec-failed", message || undefined)
}
