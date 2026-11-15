import type { ServiceOpsBridgeTransport, ServiceOpsExecResult } from "./bridge";
import type { ServiceOpsErrorCode } from "./errors";
import type { ServiceOsFamily } from "./commands";
export type ServiceOpsExecInput = {
    host: string;
    port: number;
    /**
     * The SSH username from the target's user@ segment (review B2): a routing fact, NOT a
     * credential — carried so the native getSession authenticates as the right user.
     * Absent for user-less targets.
     */
    username?: string;
    /** The whitelisted template id (the wire face; the command is assembled natively). */
    templateId: string;
    params?: Record<string, string>;
    /** The discovered OS family of the host — the closed-domain gate input on both sides. */
    os: ServiceOsFamily;
    /**
     * The per-command resolved SSH credential (password or key envelope JSON). Memory-only,
     * one way across the bridge, never logged/persisted/echoed (N7). Absent for hosts
     * without a credentialRef.
     */
    credential?: string;
    /** The fingerprint pinned by the connection flow's confirmation (0003 §3.3); absent =
     * an unknown-fingerprint host is refused natively with host-key-unknown. */
    pinnedFingerprint?: string;
};
export type ServiceOpsExecOutcome = {
    ok: true;
    result: import("./bridge").ServiceOpsExecResult;
} | {
    ok: false;
    code: ServiceOpsErrorCode;
    /** Bounded stderr tail for honest presentation (never swallowed, never padded). */
    stderrTail?: string;
};
export interface ServiceOpsPort {
    /** Run one whitelisted command through a short-lived exec session. Never throws. */
    exec(input: ServiceOpsExecInput): Promise<ServiceOpsExecOutcome>;
    /** Best-effort local cancel of an in-flight exec for a host (channel+session close). */
    cancel(input: {
        host: string;
        port: number;
    }): Promise<boolean>;
}
/** Fail-closed stub: never executes, never fakes. The default when nothing is injected. */
export declare const StubServiceOpsPort: ServiceOpsPort;
/**
 * Interpret one executed command: exit 0 is a success; ANY non-zero exit is a failure
 * whose classification comes from the bounded stderr tail (N4: a permission marker
 * promotes to permission-denied; anything else degrades honestly to exec-failed) with
 * the tail carried verbatim for presentation. Protocol-level refusals (exec-denied,
 * host-key-unknown, ...) travel as error responses, not through here.
 */
export declare function interpretExecResult(result: ServiceOpsExecResult): {
    ok: true;
} | {
    ok: false;
    code: ServiceOpsErrorCode;
    stderrTail?: string;
};
/** Register the bridge-backed client (the entry bootstrap, M-016). Undefined resets. */
export declare function setActiveServiceOpsPort(port: ServiceOpsPort | undefined): void;
/** The active port. Never undefined: the stub is the fail-closed default. */
export declare function activeServiceOpsPort(): ServiceOpsPort;
/** Whether a real (non-stub) port was injected — the panel's explicit degrade-hidden gate. */
export declare function serviceOpsBridgeInjected(): boolean;
/**
 * The bridge-backed service ops port. EVERY failure path (bridge unavailable, error
 * response, malformed result, transport throw) degrades to an explicit ServiceOpsExecOutcome
 * failure — a result is never invented here. The stderr tail travels with a failed
 * outcome so the panel can show the honest bounded evidence (classify-or-degrade lives
 * above this layer).
 */
export declare function createServiceOpsClient(transport: ServiceOpsBridgeTransport): ServiceOpsPort;
