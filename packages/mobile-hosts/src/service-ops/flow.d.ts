import type { ServiceOpsErrorCode } from "./errors";
export type ServiceFlowState = "idle" | "discovering" | "discovered" | "previewing" | "confirming" | "executing" | "cancelRequested" | "succeeded" | "partial" | "failed";
export type ServiceFlowEvent = {
    type: "discover";
} | {
    type: "discovered";
    nowTs: number;
} | {
    type: "cancel";
} | {
    type: "preview";
    action: string;
} | {
    type: "confirm";
    nowTs: number;
} | {
    type: "execute";
} | {
    type: "succeeded";
} | {
    type: "partial";
    rollbackAvailable: boolean;
} | {
    type: "fail";
    rollbackAvailable?: boolean;
    code?: ServiceOpsErrorCode;
} | {
    type: "rediscover";
} | {
    type: "connectionLost";
};
export type ServiceFlowContext = {
    /** The previewed action (template id face), memory-only. */
    action?: string;
    /** Freshness bound of the last discovery (N3 guard input). */
    checkedAt?: number;
    /** A rollback entry exists for the current result (failed/partial carry it). */
    rollbackAvailable?: boolean;
    /** A cancel was requested during execution — the remote outcome is uncertain. */
    cancelUncertain?: boolean;
    /** The result classification (memory-only; the panel maps it to copy). */
    reason?: ServiceOpsErrorCode;
};
export declare const INITIAL_FLOW_CONTEXT: ServiceFlowContext;
/** N3: a confirmation presented on an older discovery is refused (driver re-discovers). */
export declare const FLOW_FRESHNESS_MS = 60000;
export type ServiceFlowTransition = {
    id: `O${number}`;
    from: readonly ServiceFlowState[];
    event: ServiceFlowEvent["type"];
    to: ServiceFlowState;
    guard?: (ctx: ServiceFlowContext, event: ServiceFlowEvent) => boolean;
    apply?: (ctx: ServiceFlowContext, event: ServiceFlowEvent) => ServiceFlowContext;
};
export declare const SERVICE_FLOW_TRANSITIONS: readonly ServiceFlowTransition[];
export type ServiceFlowTransitionResult = {
    state: ServiceFlowState;
    ctx: ServiceFlowContext;
    id: ServiceFlowTransition["id"];
};
/**
 * Apply one event to the flow. Returns the next state/context or undefined when the
 * transition is illegal (the caller keeps the current state — a refused confirmation is
 * the N3 guard refusing a stale discovery).
 */
export declare function transitionServiceFlow(state: ServiceFlowState, event: ServiceFlowEvent, ctx?: ServiceFlowContext): ServiceFlowTransitionResult | undefined;
