package ai.opencode.mobile.svcops

/**
 * Service operations failure taxonomy (issue #7, decision 0004 §4) — the Kotlin mirror of
 * the JS-side `ServiceOpsErrorCode` wire strings
 * (packages/mobile-hosts/src/service-ops/errors.ts). The bridge answers every error
 * response with [ServiceOpsErrorCode.wire]; scripts/verify-service-ops.ts locks the two
 * sets to each other (21 codes incl. the N4 dedicated permission-denied code and the
 * rollback-available flow-state marker), so a drift FAILs the build probe.
 *
 * Layers (decision 0004 §4):
 * - bridge face:      SVCOPS_UNAVAILABLE — explicit degraded state, never a fabricated cause.
 * - session/exec:     EXEC_FAILED / EXEC_TIMEOUT / EXEC_DENIED (the command validator
 *                     refused — fail-closed) / PERMISSION_DENIED (N4: the JS-side
 *                     stderr-tail classifier promotes a permission marker; the native
 *                     face answers the bounded evidence, the JS face classifies).
 * - discovery:        BINARY_MISSING / OS_UNKNOWN / UNSUPPORTED_OS / HOST_KEY_UNKNOWN
 *                     (the fourth bridge builds NO trust of its own — an unconfirmed
 *                     host key routes back to the connection flow, decision 0003 §3.3).
 * - install:          SOURCE_UNAVAILABLE / VERSION_UNRESOLVABLE / INSTALL_FAILED /
 *                     PARTIAL_INSTALL (decided JS-side from the post-install re-check).
 * - start:            OCCUPIED_PORT / START_FAILED / DETACH_UNCERTAIN.
 * - lifecycle:        CANCELLED / CANCEL_UNCERTAIN / BACKUP_FAILED / ROLLBACK_FAILED
 *                     (decided JS-side by the flow machine; carried here so the enum is
 *                     the full mirror of the wire set).
 * - flow-state face:  ROLLBACK_AVAILABLE is NOT an error — a result-state marker riding
 *                     the same taxonomy (declared here for the full mirror).
 */
enum class ServiceOpsErrorCode(val wire: String) {
    SVCOPS_UNAVAILABLE("svcops-unavailable"),
    EXEC_FAILED("exec-failed"),
    EXEC_TIMEOUT("exec-timeout"),
    EXEC_DENIED("exec-denied"),
    PERMISSION_DENIED("permission-denied"),
    BINARY_MISSING("binary-missing"),
    OS_UNKNOWN("os-unknown"),
    UNSUPPORTED_OS("unsupported-os"),
    HOST_KEY_UNKNOWN("host-key-unknown"),
    SOURCE_UNAVAILABLE("source-unavailable"),
    VERSION_UNRESOLVABLE("version-unresolvable"),
    INSTALL_FAILED("install-failed"),
    PARTIAL_INSTALL("partial-install"),
    OCCUPIED_PORT("occupied-port"),
    START_FAILED("start-failed"),
    DETACH_UNCERTAIN("detach-uncertain"),
    CANCELLED("cancelled"),
    CANCEL_UNCERTAIN("cancel-uncertain"),
    BACKUP_FAILED("backup-failed"),
    ROLLBACK_FAILED("rollback-failed"),
    ROLLBACK_AVAILABLE("rollback-available"),
}

/** Bridge operation failure carrying its wire classification out-of-band of the message. */
class ServiceOpsException(val code: ServiceOpsErrorCode, message: String) : Exception(message)
