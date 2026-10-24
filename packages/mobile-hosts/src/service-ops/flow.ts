// Service operations authorization flow (issue #7, decision 0004 §2.2) — a pure
// transition table O1–O14 mirroring the T1–T14 connection machine pattern. The driver
// (the service panel) performs the side effects (bridge exec, discovery); the machine
// itself is effect-free and serializable so tests can drive every row and lock the red
// lines:
// - NO execution without confirmation: the ONLY transition into `executing` comes from
//   `confirming` (exhaustive state x event assertion in test/service-flow.test.ts).
// - Cancel is side-effect-free before execution (discovered/idle); a cancel DURING
//   execution can only reach `cancelRequested` — the remote may have continued, so the
//   flow never claims an abort and the only way forward is a forced re-discovery.
// - Rollback is an authorized action of its own (preview -> confirm -> execute) and is
//   reachable ONLY from a rollbackAvailable context (never fabricated).
// - There is NO disconnect-to-stop edge anywhere: the client losing its connection
//   (`connectionLost`) only INVALIDATES the flow into a re-discovery — it never stops or
//   restarts anything remote (AGENTS.md red line; the event set has no stop-carrying loss
//   path, asserted exhaustively).
// - N3 freshness guard: the confirming step refuses a stale discovery (checkedAt older
//   than the bounded threshold) — the driver re-runs discovery before re-presenting the
//   confirmation. The residual TOCTOU window between confirmation and execution is
//   accepted and bounded (declared in decision 0004; mitigated by the exec-side
//   running-service preflight, never by pretending the window is closed).

import type { ServiceOpsErrorCode } from "./errors"

export type ServiceFlowState =
  | "idle"
  | "discovering"
  | "discovered"
  | "previewing"
  | "confirming"
  | "executing"
  | "cancelRequested"
  | "succeeded"
  | "partial"
  | "failed"

export type ServiceFlowEvent =
  | { type: "discover" }
  | { type: "discovered"; nowTs: number }
  | { type: "cancel" }
  | { type: "preview"; action: string }
  | { type: "confirm"; nowTs: number }
  | { type: "execute" }
  | { type: "succeeded" }
  | { type: "partial"; rollbackAvailable: boolean }
  | { type: "fail"; rollbackAvailable?: boolean; code?: ServiceOpsErrorCode }
  | { type: "rediscover" }
  | { type: "connectionLost" }

export type ServiceFlowContext = {
  /** The previewed action (template id face), memory-only. */
  action?: string
  /** Freshness bound of the last discovery (N3 guard input). */
  checkedAt?: number
  /** A rollback entry exists for the current result (failed/partial carry it). */
  rollbackAvailable?: boolean
  /** A cancel was requested during execution — the remote outcome is uncertain. */
  cancelUncertain?: boolean
  /** The result classification (memory-only; the panel maps it to copy). */
  reason?: ServiceOpsErrorCode
}

export const INITIAL_FLOW_CONTEXT: ServiceFlowContext = {}

/** N3: a confirmation presented on an older discovery is refused (driver re-discovers). */
export const FLOW_FRESHNESS_MS = 60_000

export type ServiceFlowTransition = {
  id: `O${number}`
  from: readonly ServiceFlowState[]
  event: ServiceFlowEvent["type"]
  to: ServiceFlowState
  guard?: (ctx: ServiceFlowContext, event: ServiceFlowEvent) => boolean
  apply?: (ctx: ServiceFlowContext, event: ServiceFlowEvent) => ServiceFlowContext
}

export const SERVICE_FLOW_TRANSITIONS: readonly ServiceFlowTransition[] = [
  // O1 idle|succeeded|partial|failed|previewing --discover--> discovering
  // (previewing is a source: the N3 stale-confirm path re-runs discovery first — the
  // driver dispatches discover when the confirm guard refused, never a silent skip.)
  {
    id: "O1",
    from: ["idle", "succeeded", "partial", "failed", "previewing"],
    event: "discover",
    to: "discovering",
    apply: () => ({ ...INITIAL_FLOW_CONTEXT }),
  },
  // O2 discovering --discovered--> discovered (the snapshot itself lives in the driver;
  // the machine carries only the freshness bound and clears any cancel uncertainty).
  {
    id: "O2",
    from: ["discovering"],
    event: "discovered",
    to: "discovered",
    apply: (_ctx, event) => ({ checkedAt: event.type === "discovered" ? event.nowTs : undefined }),
  },
  // O3 discovering --cancel--> idle (no side effects: nothing has been executed).
  { id: "O3", from: ["discovering"], event: "cancel", to: "idle", apply: () => ({ ...INITIAL_FLOW_CONTEXT }) },
  // O4 discovered --preview--> previewing
  {
    id: "O4",
    from: ["discovered"],
    event: "preview",
    to: "previewing",
    apply: (ctx, event) => ({ ...ctx, action: event.type === "preview" ? event.action : ctx.action }),
  },
  // O5 previewing|confirming --cancel--> discovered (no side effects: the plan's cancel
  // row covers the whole pre-execution authorization ladder; discovering→idle is O3 —
  // mid-discovery there is no snapshot yet, so idle is the honest target).
  { id: "O5", from: ["previewing", "confirming"], event: "cancel", to: "discovered", apply: (ctx) => ({ ...ctx, action: undefined }) },
  // O6 previewing --confirm--> confirming [N3 guard: the discovery is fresh]
  {
    id: "O6",
    from: ["previewing"],
    event: "confirm",
    to: "confirming",
    guard: (ctx, event) =>
      ctx.checkedAt !== undefined &&
      event.type === "confirm" &&
      event.nowTs - ctx.checkedAt >= 0 &&
      event.nowTs - ctx.checkedAt <= FLOW_FRESHNESS_MS,
    apply: (ctx) => ({ ...ctx }),
  },
  // O7 confirming --execute--> executing (THE ONLY door into executing — red line).
  { id: "O7", from: ["confirming"], event: "execute", to: "executing", apply: (ctx) => ({ ...ctx }) },
  // O8 executing --succeeded--> succeeded
  {
    id: "O8",
    from: ["executing"],
    event: "succeeded",
    to: "succeeded",
    apply: (ctx) => ({ ...ctx, action: undefined, rollbackAvailable: false, cancelUncertain: false }),
  },
  // O9 executing --partial--> partial (rollback availability comes from the RESULT, not
  // from optimism; a rollbackAvailable:false partial offers no rollback entry).
  {
    id: "O9",
    from: ["executing"],
    event: "partial",
    to: "partial",
    apply: (ctx, event) => ({
      ...ctx,
      action: undefined,
      rollbackAvailable: event.type === "partial" ? event.rollbackAvailable : false,
      cancelUncertain: false,
    }),
  },
  // O10 executing|cancelRequested --fail--> failed (a cancel-in-flight that ends in a
  // failure still lands here; cancelUncertain sticks so the panel reports honestly).
  {
    id: "O10",
    from: ["executing", "cancelRequested"],
    event: "fail",
    to: "failed",
    apply: (ctx, event) => ({
      ...ctx,
      action: undefined,
      rollbackAvailable: event.type === "fail" ? (event.rollbackAvailable ?? false) : false,
      reason: event.type === "fail" ? event.code : undefined,
    }),
  },
  // O11 executing --cancel--> cancelRequested: the exec channel and session close, but
  // the remote may have continued — never reported as "aborted"; only a forced
  // re-discovery (O12) may proceed past this state.
  {
    id: "O11",
    from: ["executing"],
    event: "cancel",
    to: "cancelRequested",
    apply: (ctx) => ({ ...ctx, cancelUncertain: true }),
  },
  // O12 cancelRequested|succeeded|partial --rediscover--> discovering (mandatory after a
  // cancel request; the hygiene re-check after a result — "复核后回状态态").
  { id: "O12", from: ["cancelRequested", "succeeded", "partial"], event: "rediscover", to: "discovering", apply: () => ({ ...INITIAL_FLOW_CONTEXT }) },
  // O13 partial|failed --rollback--> previewing [guard: rollbackAvailable] — the rollback
  // is itself an authorized action and re-enters the SAME preview->confirm->execute gate.
  {
    id: "O13",
    from: ["partial", "failed"],
    event: "preview",
    to: "previewing",
    guard: (ctx) => ctx.rollbackAvailable === true,
    apply: (ctx, event) => ({ ...ctx, action: event.type === "preview" ? event.action : ctx.action, reason: undefined }),
  },
  // O14 discovered|previewing|confirming|succeeded|partial --connectionLost-->
  // discovering. Client-side loss INVALIDATES the flow (any previewed action is dropped,
  // nothing remote is signalled) — survival is answered by the refreshed discovery
  // (survivedDisconnect), never by a stop. There is deliberately NO disconnect->stop edge.
  {
    id: "O14",
    from: ["discovered", "previewing", "confirming", "succeeded", "partial"],
    event: "connectionLost",
    to: "discovering",
    apply: () => ({ ...INITIAL_FLOW_CONTEXT }),
  },
]

export type ServiceFlowTransitionResult = { state: ServiceFlowState; ctx: ServiceFlowContext; id: ServiceFlowTransition["id"] }

/**
 * Apply one event to the flow. Returns the next state/context or undefined when the
 * transition is illegal (the caller keeps the current state — a refused confirmation is
 * the N3 guard refusing a stale discovery).
 */
export function transitionServiceFlow(
  state: ServiceFlowState,
  event: ServiceFlowEvent,
  ctx: ServiceFlowContext = { ...INITIAL_FLOW_CONTEXT },
): ServiceFlowTransitionResult | undefined {
  for (const t of SERVICE_FLOW_TRANSITIONS) {
    if (t.event !== event.type) continue
    if (!t.from.includes(state)) continue
    if (t.guard && !t.guard(ctx, event)) continue
    return { state: t.to, ctx: t.apply ? t.apply(ctx, event) : ctx, id: t.id }
  }
  return undefined
}
