export type SshErrorCode = "bridge-unavailable" | "dns" | "refused" | "timeout" | "unreachable" | "auth-failed" | "key-decrypt-failed" | "host-key-unknown" | "host-key-changed" | "host-key-rejected" | "target-refused" | "forward-failed" | "service-unreachable" | "io";
/** Every SshErrorCode, in canonical order (drives the i18n key-set assertion). */
export declare const SSH_ERROR_CODES: readonly ["bridge-unavailable", "dns", "refused", "timeout", "unreachable", "auth-failed", "key-decrypt-failed", "host-key-unknown", "host-key-changed", "host-key-rejected", "target-refused", "forward-failed", "service-unreachable", "io"];
export declare function isSshErrorCode(value: unknown): value is SshErrorCode;
/**
 * The classification carried by a transport failure so the driver can route it beyond a
 * plain `fail`: `auth` codes land in authRequired (T6) instead of failed (T8).
 * `code` is always a wire-taxonomy SshErrorCode; `bridge-unavailable`/`io` keep the
 * degraded general copy and never fabricate a specific cause.
 */
export type SshErrorInfo = {
    code: SshErrorCode;
};
/** The mobile-hosts i18n key of a classification ("ssh.error.<code>"). */
export declare function sshErrorCodeMessageKey(code: SshErrorCode): `ssh.error.${SshErrorCode}`;
/**
 * Thrown by the SSH bridge transport (and its fail-closed default) on hard failures.
 * The code travels out-of-band of the message so a transport failure can be classified
 * without parsing error text (the direct-probe lesson: message matching drifts).
 */
export declare class SshTransportError extends Error {
    readonly code: SshErrorCode;
    constructor(code: SshErrorCode, message?: string);
}
