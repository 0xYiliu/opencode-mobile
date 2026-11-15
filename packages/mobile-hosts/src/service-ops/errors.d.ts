export type ServiceOpsErrorCode = "svcops-unavailable" | "exec-failed" | "exec-timeout" | "exec-denied" | "permission-denied" | "binary-missing" | "os-unknown" | "unsupported-os" | "host-key-unknown" | "source-unavailable" | "version-unresolvable" | "install-failed" | "partial-install" | "occupied-port" | "start-failed" | "detach-uncertain" | "cancelled" | "cancel-uncertain" | "backup-failed" | "rollback-failed" | "rollback-available";
/** Every ServiceOpsErrorCode, in canonical order (drives the i18n key-set assertion). */
export declare const SERVICE_OPS_ERROR_CODES: readonly ["svcops-unavailable", "exec-failed", "exec-timeout", "exec-denied", "permission-denied", "binary-missing", "os-unknown", "unsupported-os", "host-key-unknown", "source-unavailable", "version-unresolvable", "install-failed", "partial-install", "occupied-port", "start-failed", "detach-uncertain", "cancelled", "cancel-uncertain", "backup-failed", "rollback-failed", "rollback-available"];
export declare function isServiceOpsErrorCode(value: unknown): value is ServiceOpsErrorCode;
/** The mobile-hosts i18n key of a classification ("svcops.error.<code>"). */
export declare function serviceOpsErrorCodeMessageKey(code: ServiceOpsErrorCode): `svcops.error.${ServiceOpsErrorCode}`;
/** Thrown by command assembly/refusal paths (never by the bridge transport itself). */
export declare class ServiceOpsError extends Error {
    readonly code: ServiceOpsErrorCode;
    constructor(code: ServiceOpsErrorCode, message?: string);
}
/**
 * Bounded documentation-derived markers whose presence in a command's stderr tail
 * indicates a PERMISSION refusal rather than a generic execution failure. The list is
 * deliberately small and verbatim (POSIX `Permission denied` / `Operation not permitted`,
 * Windows `Access is denied`, elevation wordings, the sudo refusal face) — a broad
 * pattern would fabricate specificity. Fixtures in test/service-errors.test.ts are
 * documented-output shapes, honestly marked non-live.
 */
export declare const PERMISSION_DENIED_MARKERS: readonly string[];
export type ExecFailureClassification = {
    code: "permission-denied";
    marker: string;
} | {
    code: "exec-failed";
    marker?: undefined;
};
/**
 * Classify one exec failure from its exit code and bounded stderr tail (pure function).
 * A marker hit promotes to the dedicated `permission-denied` code (N4); ANY other
 * failure — including a non-zero exit with an empty or unmatched tail — degrades to the
 * generic `exec-failed` and the caller presents the tail verbatim. Specificity is never
 * fabricated: the classifier only ever selects between these two codes.
 */
export declare function classifyExecFailure(input: {
    exitCode: number;
    stderrTail: string;
}): ExecFailureClassification;
