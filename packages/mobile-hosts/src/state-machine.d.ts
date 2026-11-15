export type HostState = "idle" | "connecting" | "hostKeyUnverified" | "ready" | "authRequired" | "incompatible" | "offline" | "reconnecting" | "failed";
export type HostEvent = {
    type: "connect";
} | {
    type: "hostKeyPending";
    fingerprint: string;
} | {
    type: "hostKeyConfirm";
} | {
    type: "hostKeyReject";
} | {
    type: "ready";
} | {
    type: "authRequired";
} | {
    type: "incompatible";
    version?: string;
} | {
    type: "fail";
    reason?: string;
} | {
    type: "connectionLost";
} | {
    type: "retry";
} | {
    type: "cancel";
} | {
    type: "delete";
};
export type MachineContext = {
    /** State to restore on cancel: where the attempt started from (idle or offline). */
    source: "idle" | "offline";
    /** Host key fingerprint, memory-only, never persisted. */
    fingerprint?: string;
    /** Server version reported at the last probe, memory-only. */
    version?: string;
    /** Reconnect attempts spent in the current episode. */
    retries: number;
    /** Last failure reason (diagnostic, memory-only). */
    reason?: string;
};
export declare const INITIAL_CONTEXT: MachineContext;
export type Transition = {
    /** Row id T1..T14 (see docs/design/units/connection.md). */
    id: `T${number}`;
    from: readonly HostState[];
    event: HostEvent["type"];
    to: HostState | ((ctx: MachineContext, from: HostState) => HostState);
    /** Guard over (ctx, event); a false guard rejects the transition. */
    guard?: (ctx: MachineContext, event: HostEvent) => boolean;
    /** Pure context update applied on success. */
    apply?: (ctx: MachineContext, event: HostEvent) => MachineContext;
};
export declare const TRANSITIONS: readonly Transition[];
export type TransitionResult = {
    state: HostState;
    ctx: MachineContext;
    id: Transition["id"];
};
/**
 * Apply an event. Returns the next state and context, or undefined when the transition is
 * illegal (the caller must keep the current state unchanged).
 */
export declare function transition(state: HostState, event: HostEvent, ctx?: MachineContext): TransitionResult | undefined;
/** Serializable snapshot of a machine (memory values included, still never persisted by the registry). */
export declare function snapshotHostState(state: HostState, ctx: MachineContext): {
    state: HostState;
    ctx: {
        /** State to restore on cancel: where the attempt started from (idle or offline). */
        source: "idle" | "offline";
        /** Host key fingerprint, memory-only, never persisted. */
        fingerprint?: string;
        /** Server version reported at the last probe, memory-only. */
        version?: string;
        /** Reconnect attempts spent in the current episode. */
        retries: number;
        /** Last failure reason (diagnostic, memory-only). */
        reason?: string;
    };
};
/** Restore a machine snapshot; throws on a malformed state value. */
export declare function restoreHostState(snapshot: {
    state: HostState;
    ctx: MachineContext;
}): {
    state: HostState;
    ctx: MachineContext;
};
/** Reconnect retry budget used by the driver this phase. */
export declare const RECONNECT_MAX_RETRIES = 3;
/** Whether the reconnect budget for the current episode is exhausted (driver gives up into failed). */
export declare function reconnectExhausted(retries: number): boolean;
