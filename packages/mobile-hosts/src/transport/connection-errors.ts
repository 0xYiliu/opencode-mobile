// Connection error taxonomy (issue #5, decision 0002 D2/D4).
//
// DirectErrorCode is the FULL classification set spoken by the endpoint probe (Android
// DirectEndpointProbe over the probe bridge) and consumed by the connect-dialog error
// mapping (M-013). The probe is a CLASSIFIER, never the authority: a classification is
// only used to choose an error message after the upstream health check has failed; when
// it conflicts with a real fetch result, the real fetch wins (docs/decisions/
// 0002-direct-connection-transport.md, D4).
//
// cert-untrusted covers both self-signed and private-CA servers: a client cannot tell
// them apart, and the copy says so honestly (direct HTTPS to them is unsupported this
// cycle — decision 0002 D2).

export type DirectErrorCode =
  | "ok"
  | "cert-expired"
  | "cert-hostname"
  | "cert-untrusted"
  | "cleartext-blocked"
  | "refused"
  | "timeout"
  | "dns"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "html-response"

/** Every DirectErrorCode, in canonical order (drives the i18n key-set assertion). */
export const DIRECT_ERROR_CODES = [
  "ok",
  "cert-expired",
  "cert-hostname",
  "cert-untrusted",
  "cleartext-blocked",
  "refused",
  "timeout",
  "dns",
  "unauthorized",
  "forbidden",
  "not-found",
  "html-response",
] as const satisfies readonly DirectErrorCode[]

export function isDirectErrorCode(value: unknown): value is DirectErrorCode {
  return typeof value === "string" && (DIRECT_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Codes that must never surface as an error message: "ok" means the transport-level
 * probe found the endpoint reachable — the authoritative health check decides, and a
 * conflict degrades to the upstream generic message (probe is not the authority).
 */
export const SURFACEABLE_ERROR_CODES = DIRECT_ERROR_CODES.filter((code) => code !== "ok") as Exclude<
  DirectErrorCode,
  "ok"
>[]

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
export type SecureFetchErrorCode = "redirect-cross-host" | "redirect-downgrade" | "credential-url"

export class SecureFetchError extends Error {
  readonly code: SecureFetchErrorCode

  constructor(code: SecureFetchErrorCode, message?: string) {
    super(message ?? defaultSecureFetchMessage(code))
    this.name = "SecureFetchError"
    this.code = code
  }
}

function defaultSecureFetchMessage(code: SecureFetchErrorCode): string {
  switch (code) {
    case "redirect-cross-host":
      return "blocked: the response came from a different origin than the requested one"
    case "redirect-downgrade":
      return "blocked: the response was downgraded from HTTPS to plaintext"
    case "credential-url":
      return "blocked: the request URL carries embedded credentials (userinfo)"
  }
}
