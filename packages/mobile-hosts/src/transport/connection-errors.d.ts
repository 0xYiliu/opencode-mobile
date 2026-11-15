export type DirectErrorCode = "ok" | "cert-expired" | "cert-hostname" | "cert-untrusted" | "cleartext-blocked" | "refused" | "timeout" | "dns" | "unauthorized" | "forbidden" | "not-found" | "html-response";
/** Every DirectErrorCode, in canonical order (drives the i18n key-set assertion). */
export declare const DIRECT_ERROR_CODES: readonly ["ok", "cert-expired", "cert-hostname", "cert-untrusted", "cleartext-blocked", "refused", "timeout", "dns", "unauthorized", "forbidden", "not-found", "html-response"];
export declare function isDirectErrorCode(value: unknown): value is DirectErrorCode;
/**
 * Codes that must never surface as an error message: "ok" means the transport-level
 * probe found the endpoint reachable — the authoritative health check decides, and a
 * conflict degrades to the upstream generic message (probe is not the authority).
 */
export declare const SURFACEABLE_ERROR_CODES: Exclude<DirectErrorCode, "ok">[];
/**
 * Thrown by the secure fetch wrapper (M-011) and the upload XHR validation (M-012) when a
 * response must not be delivered or a request must not be sent.
 *
 * Retry semantics (erratum N1, stated precisely): the vendored client's execute()
 * (packages/client/src/promise/generated/client.ts:350) wraps EVERY fetch exception —
 * including this one — into ClientError("Transport", {cause}), and the health check's
 * retryable() returns true for ClientError("Transport") BEFORE its message regex runs.
 * A classified failure therefore IS retried on the health-check face (2 extra attempts by
 * default). That is harmless and fail-closed: no body is ever delivered, and cross-origin
 * redirect sub-requests already lost their Authorization header (the browser-spec floor).
 * The message discipline below (name kept distinct from TypeError, messages free of the
 * /network|fetch|econnreset|econnrefused|enotfound|timedout/i words) is DEFENSE IN DEPTH
 * for callers that consume SecureFetchError DIRECTLY — the M-012 upload face rejects
 * without any retry loop, and future direct consumers get a fast, unambiguous failure —
 * and is locked by unit tests as a discipline, not as a health-retry suppression.
 */
export type SecureFetchErrorCode = "redirect-cross-host" | "redirect-downgrade" | "credential-url";
export declare class SecureFetchError extends Error {
    readonly code: SecureFetchErrorCode;
    constructor(code: SecureFetchErrorCode, message?: string);
}
