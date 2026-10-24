// SSH error taxonomy (issue #6, decision 0003 §5) — the four-layer failure classification
// for the SSH tunnel transport.
//
// SshErrorCode is the FULL classification set spoken by the Android SshTunnelBridge
// (Kotlin SshErrorCode enum, `codeName` mirrors these exact wire strings — the direct
// probe bridge pattern) and consumed by the first-party failure copy (`ssh.error.<code>`,
// EN/ZH self-contained set in ./i18n) and the failure UI matrix
// (docs/design/units/connection.md "SSH 失败分类×反馈×恢复矩阵").
//
// Layers (decision 0003 §5):
// - bridge face:        bridge-unavailable — the bridge never came up (explicit degraded
//                       copy, never a fabricated cause; same discipline as the probe).
// - SSH reachability:   dns / refused / timeout / unreachable / io — TCP/DNS/timeout
//                       before any authentication (T8 fail).
// - SSH auth:           auth-failed / key-decrypt-failed (T6 authRequired -> edit
//                       credential -> T1 reconnect; decrypt failure -> re-import).
// - host key:           host-key-unknown / host-key-changed / host-key-rejected
//                       (T2 prompt / T4+T8; a changed key is a HARD refusal, never an
//                       automatic overwrite — decision 0003 §3.3).
// - tunnel target:      target-refused / forward-failed — the direct-tcpip channel was
//                       refused by the REMOTE side after successful auth (T8; copy states
//                       "SSH auth succeeded but the remote refused the forward").
// - service:            service-unreachable — tunnel open but the post-open bounded health
//                       check failed (T8); a version mismatch routes to incompatible (T7)
//                       instead (markIncompatible, not an error code).

export type SshErrorCode =
  | "bridge-unavailable"
  | "dns"
  | "refused"
  | "timeout"
  | "unreachable"
  | "auth-failed"
  | "key-decrypt-failed"
  | "host-key-unknown"
  | "host-key-changed"
  | "host-key-rejected"
  | "target-refused"
  | "forward-failed"
  | "service-unreachable"
  | "io"

/** Every SshErrorCode, in canonical order (drives the i18n key-set assertion). */
export const SSH_ERROR_CODES = [
  "bridge-unavailable",
  "dns",
  "refused",
  "timeout",
  "unreachable",
  "auth-failed",
  "key-decrypt-failed",
  "host-key-unknown",
  "host-key-changed",
  "host-key-rejected",
  "target-refused",
  "forward-failed",
  "service-unreachable",
  "io",
] as const satisfies readonly SshErrorCode[]

export function isSshErrorCode(value: unknown): value is SshErrorCode {
  return typeof value === "string" && (SSH_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * The classification carried by a transport failure so the driver can route it beyond a
 * plain `fail`: `auth` codes land in authRequired (T6) instead of failed (T8).
 * `code` is always a wire-taxonomy SshErrorCode; `bridge-unavailable`/`io` keep the
 * degraded general copy and never fabricate a specific cause.
 */
export type SshErrorInfo = { code: SshErrorCode }

/** The mobile-hosts i18n key of a classification ("ssh.error.<code>"). */
export function sshErrorCodeMessageKey(code: SshErrorCode): `ssh.error.${SshErrorCode}` {
  return `ssh.error.${code}`
}

/**
 * Thrown by the SSH bridge transport (and its fail-closed default) on hard failures.
 * The code travels out-of-band of the message so a transport failure can be classified
 * without parsing error text (the direct-probe lesson: message matching drifts).
 */
export class SshTransportError extends Error {
  readonly code: SshErrorCode

  constructor(code: SshErrorCode, message?: string) {
    super(message ?? defaultSshErrorMessage(code))
    this.name = "SshTransportError"
    this.code = code
  }
}

function defaultSshErrorMessage(code: SshErrorCode): string {
  switch (code) {
    case "bridge-unavailable":
      return "ssh bridge unavailable"
    case "dns":
      return "ssh host name could not be resolved"
    case "refused":
      return "ssh connection refused"
    case "timeout":
      return "ssh connection timed out"
    case "unreachable":
      return "ssh host unreachable"
    case "auth-failed":
      return "ssh authentication failed"
    case "key-decrypt-failed":
      return "private key could not be decrypted"
    case "host-key-unknown":
      return "host key is not known yet"
    case "host-key-changed":
      return "host key does not match the stored record"
    case "host-key-rejected":
      return "host key rejected by the user"
    case "target-refused":
      return "remote refused the forwarded target"
    case "forward-failed":
      return "local forwarding could not be established"
    case "service-unreachable":
      return "the service did not answer through the tunnel"
    case "io":
      return "ssh transport error"
  }
}
