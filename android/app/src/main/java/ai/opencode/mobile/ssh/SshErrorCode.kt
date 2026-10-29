package ai.opencode.mobile.ssh

/**
 * SSH failure taxonomy (issue #6, decision 0003 §5) — the Kotlin mirror of the JS-side
 * `SshErrorCode` wire strings (packages/mobile-hosts/src/transport/ssh-errors.ts). The
 * bridge answers every error response with [SshErrorCode.wire]; scripts/verify-ssh.ts
 * locks the two sets to each other, so a code drift FAILs the build probe.
 *
 * Four layers (decision 0003 §5):
 * - bridge face:        BRIDGE_UNAVAILABLE — explicit degraded state, never a fabricated cause.
 * - SSH reachability:   DNS / REFUSED / TIMEOUT / UNREACHABLE / IO — before any
 *                       authentication.
 * - SSH auth:           AUTH_FAILED / KEY_DECRYPT_FAILED — land in the machine's
 *                       authRequired state (edit credential, re-drive).
 * - host key:           HOST_KEY_UNKNOWN / HOST_KEY_CHANGED / HOST_KEY_REJECTED — a changed
 *                       key is a HARD refusal, never an automatic overwrite.
 * - tunnel target:      TARGET_REFUSED / FORWARD_FAILED — the remote refused the forwarded
 *                       target after authentication had already succeeded.
 * - service:            SERVICE_UNREACHABLE — decided JS-side by the post-open health check
 *                       (declared here only so the enum is the full mirror of the wire set).
 */
enum class SshErrorCode(val wire: String) {
    BRIDGE_UNAVAILABLE("bridge-unavailable"),
    DNS("dns"),
    REFUSED("refused"),
    TIMEOUT("timeout"),
    UNREACHABLE("unreachable"),
    AUTH_FAILED("auth-failed"),
    KEY_DECRYPT_FAILED("key-decrypt-failed"),
    HOST_KEY_UNKNOWN("host-key-unknown"),
    HOST_KEY_CHANGED("host-key-changed"),
    HOST_KEY_REJECTED("host-key-rejected"),
    TARGET_REFUSED("target-refused"),
    FORWARD_FAILED("forward-failed"),
    SERVICE_UNREACHABLE("service-unreachable"),
    IO("io"),
}

/** Bridge operation failure carrying its wire classification out-of-band of the message. */
class SshException(val code: SshErrorCode, message: String) : Exception(message)
