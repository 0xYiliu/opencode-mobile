// Service operations error taxonomy (issue #7, decision 0004) — an independent
// classification parallel to SshErrorCode (decision 0003 §5), spoken by the FOURTH
// protocol-isolated bridge (./bridge) and consumed by the service panel copy
// (`svcops.error.<code>`, EN/ZH self-contained set in ../i18n).
//
// The Kotlin side (ServiceOpsBridge.kt) mirrors every wire string verbatim (the
// SshErrorCode.kt pattern); scripts/verify-service-ops.ts locks the two sets to each
// other, so a drift FAILs the static probe.
//
// Layers (decision 0004 §4):
// - bridge face:      svcops-unavailable — the fourth bridge never came up (explicit
//                     degraded copy; a classification is never fabricated, same
//                     discipline as probe/ssh bridge-unavailable).
// - session/exec:     exec-failed / exec-timeout / exec-denied (the command validator
//                     refused — fail-closed) / permission-denied (issue #7 acceptance 3
//                     names permission refusal directly: the stderr-tail classifier
//                     (classifyExecFailure) promotes a permission marker match to this
//                     dedicated code instead of the generic exec-failed; when no marker
//                     matches the failure degrades HONESTLY to exec-failed with the
//                     bounded stderr tail shown verbatim — specificity is never invented).
// - discovery:        binary-missing / os-unknown / unsupported-os / host-key-unknown
//                     (the fourth bridge builds no trust of its own — an unknown host key
//                     routes back to the connection flow, decision 0003 §3.3).
// - install:          source-unavailable / version-unresolvable / install-failed /
//                     partial-install (post-install version re-check mismatch).
// - start:            occupied-port / start-failed / detach-uncertain (honest Windows
//                     `start /b` survival boundary — never claimed as confirmed detach).
// - lifecycle:        cancelled / cancel-uncertain (a cancel during execution closes the
//                     channel but can never claim the remote aborted) / backup-failed /
//                     rollback-failed.
// - flow-state face:  rollback-available is NOT an error — it is a result-state marker
//                     carried by the same taxonomy (the plan's single classification set),
//                     rendered as the rollback entry affordance, never as failure copy.

export type ServiceOpsErrorCode =
  | "svcops-unavailable"
  | "exec-failed"
  | "exec-timeout"
  | "exec-denied"
  | "permission-denied"
  | "binary-missing"
  | "os-unknown"
  | "unsupported-os"
  | "host-key-unknown"
  | "source-unavailable"
  | "version-unresolvable"
  | "install-failed"
  | "partial-install"
  | "occupied-port"
  | "start-failed"
  | "detach-uncertain"
  | "cancelled"
  | "cancel-uncertain"
  | "backup-failed"
  | "rollback-failed"
  | "rollback-available"

/** Every ServiceOpsErrorCode, in canonical order (drives the i18n key-set assertion). */
export const SERVICE_OPS_ERROR_CODES = [
  "svcops-unavailable",
  "exec-failed",
  "exec-timeout",
  "exec-denied",
  "permission-denied",
  "binary-missing",
  "os-unknown",
  "unsupported-os",
  "host-key-unknown",
  "source-unavailable",
  "version-unresolvable",
  "install-failed",
  "partial-install",
  "occupied-port",
  "start-failed",
  "detach-uncertain",
  "cancelled",
  "cancel-uncertain",
  "backup-failed",
  "rollback-failed",
  "rollback-available",
] as const satisfies readonly ServiceOpsErrorCode[]

export function isServiceOpsErrorCode(value: unknown): value is ServiceOpsErrorCode {
  return typeof value === "string" && (SERVICE_OPS_ERROR_CODES as readonly string[]).includes(value)
}

/** The mobile-hosts i18n key of a classification ("svcops.error.<code>"). */
export function serviceOpsErrorCodeMessageKey(code: ServiceOpsErrorCode): `svcops.error.${ServiceOpsErrorCode}` {
  return `svcops.error.${code}`
}

/** Thrown by command assembly/refusal paths (never by the bridge transport itself). */
export class ServiceOpsError extends Error {
  constructor(
    readonly code: ServiceOpsErrorCode,
    message?: string,
  ) {
    super(message ?? `service ops: ${code}`)
    this.name = "ServiceOpsError"
  }
}

// ---------------------------------------------------------------------------
// stderr-tail classification (issue #7 N4: the dedicated permission-denied code)
// ---------------------------------------------------------------------------

/**
 * Bounded documentation-derived markers whose presence in a command's stderr tail
 * indicates a PERMISSION refusal rather than a generic execution failure. The list is
 * deliberately small and verbatim (POSIX `Permission denied` / `Operation not permitted`,
 * Windows `Access is denied`, elevation wordings, the sudo refusal face) — a broad
 * pattern would fabricate specificity. Fixtures in test/service-errors.test.ts are
 * documented-output shapes, honestly marked non-live.
 */
export const PERMISSION_DENIED_MARKERS: readonly string[] = [
  "permission denied",
  "operation not permitted",
  "access is denied",
  "not permitted",
  "elevation required",
  "requires administrator",
  "requires elevation",
  "sudo: no password",
  "sudo: a password is required",
]

export type ExecFailureClassification =
  | { code: "permission-denied"; marker: string }
  | { code: "exec-failed"; marker?: undefined }

/**
 * Classify one exec failure from its exit code and bounded stderr tail (pure function).
 * A marker hit promotes to the dedicated `permission-denied` code (N4); ANY other
 * failure — including a non-zero exit with an empty or unmatched tail — degrades to the
 * generic `exec-failed` and the caller presents the tail verbatim. Specificity is never
 * fabricated: the classifier only ever selects between these two codes.
 */
export function classifyExecFailure(input: { exitCode: number; stderrTail: string }): ExecFailureClassification {
  const haystack = input.stderrTail.toLowerCase()
  for (const marker of PERMISSION_DENIED_MARKERS) {
    if (haystack.includes(marker)) return { code: "permission-denied", marker }
  }
  return { code: "exec-failed" }
}
