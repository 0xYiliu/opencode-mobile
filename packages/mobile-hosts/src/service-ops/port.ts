// Service ops port (issue #7, decision 0004 §2.1) — the fourth-bridge client face and its
// fail-closed default. Everything the panel does against a remote system flows through
// this port; the shared package itself has zero platform APIs (AGENTS.md architecture rule).
//
// Fail-closed defaults stay in charge: the stub never executes (every exec answers
// svcops-unavailable, cancel answers false) and the panel hides entirely when no bridge
// client was injected — a shell that injects nothing has NO service-operations capability
// ("a client-only build implies no service operation surface", issue #7 acceptance 5).
//
// Injection seam: unlike the connection ports (wired through createMobileHosts options),
// the service ops port registers through the module-level accessor below. The runtime
// bootstrap contract (runtime.ts) is deliberately UNCHANGED (plan zero-change list); the
// vendored entry (M-016) calls setActiveServiceOpsPort once at bootstrap, mirroring how
// getMobileHosts() exposes the bootstrapped runtime to the settings mount point.
//
// Wire discipline (decision 0004 §2.1): the exec request carries {host, port, templateId,
// params, os, credential?, pinnedFingerprint?} — NEVER a command string. The native side
// assembles from its mirrored whitelist and refuses anything else (exec-denied,
// fail-closed). The credential is resolved PER COMMAND by the caller (N7: 逐命令解析) and
// crosses the bridge exactly once; responses never echo it.

import { bridgeErrorToServiceOpsError, parseBridgeExecResult } from "./bridge"
import type { ServiceOpsBridgeTransport, ServiceOpsExecResult } from "./bridge"
import { ServiceOpsError, classifyExecFailure } from "./errors"
import type { ServiceOpsErrorCode } from "./errors"
import type { ServiceOsFamily } from "./commands"

// ---------------------------------------------------------------------------
// Port + fail-closed stub
// ---------------------------------------------------------------------------

export type ServiceOpsExecInput = {
  host: string
  port: number
  /** The whitelisted template id (the wire face; the command is assembled natively). */
  templateId: string
  params?: Record<string, string>
  /** The discovered OS family of the host — the closed-domain gate input on both sides. */
  os: ServiceOsFamily
  /**
   * The per-command resolved SSH credential (password or key envelope JSON). Memory-only,
   * one way across the bridge, never logged/persisted/echoed (N7). Absent for hosts
   * without a credentialRef.
   */
  credential?: string
  /** The fingerprint pinned by the connection flow's confirmation (0003 §3.3); absent =
   * an unknown-fingerprint host is refused natively with host-key-unknown. */
  pinnedFingerprint?: string
}

export type ServiceOpsExecOutcome =
  | { ok: true; result: import("./bridge").ServiceOpsExecResult }
  | {
      ok: false
      code: ServiceOpsErrorCode
      /** Bounded stderr tail for honest presentation (never swallowed, never padded). */
      stderrTail?: string
    }

export interface ServiceOpsPort {
  /** Run one whitelisted command through a short-lived exec session. Never throws. */
  exec(input: ServiceOpsExecInput): Promise<ServiceOpsExecOutcome>
  /** Best-effort local cancel of an in-flight exec for a host (channel+session close). */
  cancel(input: { host: string; port: number }): Promise<boolean>
}

/** Fail-closed stub: never executes, never fakes. The default when nothing is injected. */
export const StubServiceOpsPort: ServiceOpsPort = {
  exec: async () => ({ ok: false, code: "svcops-unavailable" }),
  cancel: async () => false,
}

/**
 * Interpret one executed command: exit 0 is a success; ANY non-zero exit is a failure
 * whose classification comes from the bounded stderr tail (N4: a permission marker
 * promotes to permission-denied; anything else degrades honestly to exec-failed) with
 * the tail carried verbatim for presentation. Protocol-level refusals (exec-denied,
 * host-key-unknown, ...) travel as error responses, not through here.
 */
export function interpretExecResult(result: ServiceOpsExecResult): { ok: true } | { ok: false; code: ServiceOpsErrorCode; stderrTail?: string } {
  if (result.exitCode === 0) return { ok: true }
  const classification = classifyExecFailure({ exitCode: result.exitCode, stderrTail: result.stderr })
  return { ok: false, code: classification.code, stderrTail: result.stderr.length > 0 ? result.stderr : undefined }
}

// ---------------------------------------------------------------------------
// Module-level injection seam (M-016; runtime.ts stays untouched — see header)
// ---------------------------------------------------------------------------

let activePort: ServiceOpsPort = StubServiceOpsPort

/** Register the bridge-backed client (the entry bootstrap, M-016). Undefined resets. */
export function setActiveServiceOpsPort(port: ServiceOpsPort | undefined): void {
  activePort = port ?? StubServiceOpsPort
}

/** The active port. Never undefined: the stub is the fail-closed default. */
export function activeServiceOpsPort(): ServiceOpsPort {
  return activePort
}

/** Whether a real (non-stub) port was injected — the panel's explicit degrade-hidden gate. */
export function serviceOpsBridgeInjected(): boolean {
  return activePort !== StubServiceOpsPort
}

// ---------------------------------------------------------------------------
// Bridge-backed client
// ---------------------------------------------------------------------------

/**
 * The bridge-backed service ops port. EVERY failure path (bridge unavailable, error
 * response, malformed result, transport throw) degrades to an explicit ServiceOpsExecOutcome
 * failure — a result is never invented here. The stderr tail travels with a failed
 * outcome so the panel can show the honest bounded evidence (classify-or-degrade lives
 * above this layer).
 */
export function createServiceOpsClient(transport: ServiceOpsBridgeTransport): ServiceOpsPort {
  return {
    exec: async (input: ServiceOpsExecInput): Promise<ServiceOpsExecOutcome> => {
      try {
        if (transport.status() !== "available") return { ok: false, code: "svcops-unavailable" }
        const response = await transport.request("exec", {
          host: input.host,
          port: input.port,
          templateId: input.templateId,
          params: input.params ?? {},
          os: input.os,
          ...(input.credential !== undefined ? { credential: input.credential } : {}),
          ...(input.pinnedFingerprint !== undefined ? { pinnedFingerprint: input.pinnedFingerprint } : {}),
        })
        if (!response.ok) {
          const message = "message" in response ? response.message : undefined
          return {
            ok: false,
            code: bridgeErrorToServiceOpsError(response.code, message).code,
            // The native error face may carry the bounded stderr tail in the message
            // field (permission-denied evidence); pass it through untouched.
            stderrTail: message && message.length > 0 ? message : undefined,
          }
        }
        return { ok: true, result: parseBridgeExecResult(response.result as Record<string, unknown>) }
      } catch (error) {
        if (error instanceof ServiceOpsError) return { ok: false, code: error.code }
        return { ok: false, code: "svcops-unavailable" }
      }
    },
    cancel: async (input: { host: string; port: number }): Promise<boolean> => {
      try {
        if (transport.status() !== "available") return false
        const response = await transport.request("cancel", { host: input.host, port: input.port })
        return response.ok
      } catch {
        return false
      }
    },
  }
}
