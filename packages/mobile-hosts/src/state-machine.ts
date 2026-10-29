// SSH host connection state machine (issue #3, decision D4).
//
// Pure transition table, T1–T14, one row per transition (source states × event × guard →
// target state). The driver (see ./index createMobileHosts) performs the side effects
// (transport.open, verifier calls); the machine itself is effect-free and serializable so
// tests can drive every row and lock the red lines:
// - T4: rejecting a host key produces NO connection attempt afterwards.
// - T13: cancel restores the pre-attempt source state with no residue.
// - T14: delete transitions from any state and the driver contract is zero transport calls
//   (the machine itself has no transport reach; the test asserts the driver honors this).
// Fingerprints and failure reasons live only in the in-memory context and are never persisted.

export type HostState =
  | "idle"
  | "connecting"
  | "hostKeyUnverified"
  | "ready"
  | "authRequired"
  | "incompatible"
  | "offline"
  | "reconnecting"
  | "failed"

export type HostEvent =
  | { type: "connect" }
  | { type: "hostKeyPending"; fingerprint: string }
  | { type: "hostKeyConfirm" }
  | { type: "hostKeyReject" }
  | { type: "ready" }
  | { type: "authRequired" }
  | { type: "incompatible"; version?: string }
  | { type: "fail"; reason?: string }
  | { type: "connectionLost" }
  | { type: "retry" }
  | { type: "cancel" }
  | { type: "delete" }

export type MachineContext = {
  /** State to restore on cancel: where the attempt started from (idle or offline). */
  source: "idle" | "offline"
  /** Host key fingerprint, memory-only, never persisted. */
  fingerprint?: string
  /** Server version reported at the last probe, memory-only. */
  version?: string
  /** Reconnect attempts spent in the current episode. */
  retries: number
  /** Last failure reason (diagnostic, memory-only). */
  reason?: string
}

export const INITIAL_CONTEXT: MachineContext = { source: "idle", retries: 0 }

export type Transition = {
  /** Row id T1..T14 (see docs/design/units/connection.md). */
  id: `T${number}`
  from: readonly HostState[]
  event: HostEvent["type"]
  to: HostState | ((ctx: MachineContext, from: HostState) => HostState)
  /** Guard over (ctx, event); a false guard rejects the transition. */
  guard?: (ctx: MachineContext, event: HostEvent) => boolean
  /** Pure context update applied on success. */
  apply?: (ctx: MachineContext, event: HostEvent) => MachineContext
}

const ANY: readonly HostState[] = [
  "idle",
  "connecting",
  "hostKeyUnverified",
  "ready",
  "authRequired",
  "incompatible",
  "offline",
  "reconnecting",
  "failed",
]

const clearSession = (ctx: MachineContext): MachineContext => ({
  source: ctx.source,
  retries: 0,
})

export const TRANSITIONS: readonly Transition[] = [
  // T1 idle|failed|incompatible|authRequired --connect--> connecting
  // (failed/incompatible stay actionable: a fresh user attempt re-opens the transport.
  // Issue #6 revision: authRequired joins the source states — the "dead end" fix. After
  // an authentication failure the user edits the credential and connects again; T1 used
  // to refuse the authRequired source, so the Connect button did nothing. The other 13
  // rows are untouched; docs/design/units/connection.md carries the same revision.)
  {
    id: "T1",
    from: ["idle", "failed", "incompatible", "authRequired"],
    event: "connect",
    to: "connecting",
    apply: () => ({ source: "idle", retries: 0 }),
  },
  // T2 connecting --hostKeyPending--> hostKeyUnverified
  {
    id: "T2",
    from: ["connecting"],
    event: "hostKeyPending",
    to: "hostKeyUnverified",
    apply: (ctx, event) =>
      event.type === "hostKeyPending" ? { ...ctx, fingerprint: event.fingerprint } : ctx,
  },
  // T3 hostKeyUnverified --hostKeyConfirm--> connecting
  {
    id: "T3",
    from: ["hostKeyUnverified"],
    event: "hostKeyConfirm",
    to: "connecting",
    apply: (ctx) => ({ ...ctx }),
  },
  // T4 hostKeyUnverified --hostKeyReject--> failed (no connection attempt afterwards)
  {
    id: "T4",
    from: ["hostKeyUnverified"],
    event: "hostKeyReject",
    to: "failed",
    apply: (ctx) => ({ ...ctx, fingerprint: undefined, reason: "host-key-rejected" }),
  },
  // T5 connecting --ready--> ready
  {
    id: "T5",
    from: ["connecting"],
    event: "ready",
    to: "ready",
    apply: clearSession,
  },
  // T6 connecting|reconnecting --authRequired--> authRequired
  {
    id: "T6",
    from: ["connecting", "reconnecting"],
    event: "authRequired",
    to: "authRequired",
    apply: (ctx) => ({ ...ctx, reason: undefined }),
  },
  // T7 connecting|reconnecting --incompatible--> incompatible
  {
    id: "T7",
    from: ["connecting", "reconnecting"],
    event: "incompatible",
    to: "incompatible",
    apply: (ctx, event) => ({ ...ctx, version: event.type === "incompatible" ? event.version : ctx.version }),
  },
  // T8 connecting|reconnecting --fail--> failed
  // From connecting a transport failure is terminal. From reconnecting the episode keeps
  // its retry budget: while retries remain, the failure lands back in offline (retry again);
  // once the budget is exhausted it lands in failed. The fail event's reason is whatever
  // the driver reports for the transport error (this phase: the error message itself).
  {
    id: "T8",
    from: ["connecting", "reconnecting"],
    event: "fail",
    to: (ctx, from) => (from === "reconnecting" && !reconnectExhausted(ctx.retries) ? "offline" : "failed"),
    apply: (ctx, event) => ({ ...ctx, fingerprint: undefined, reason: event.type === "fail" ? event.reason : undefined }),
  },
  // T9 ready --connectionLost--> offline (client-side loss; remote keeps running)
  {
    id: "T9",
    from: ["ready"],
    event: "connectionLost",
    to: "offline",
    apply: (ctx) => ({ source: "offline", retries: 0 }),
  },
  // T10 offline --retry--> reconnecting
  {
    id: "T10",
    from: ["offline"],
    event: "retry",
    to: "reconnecting",
    apply: (ctx) => ({ ...ctx, source: "offline", retries: ctx.retries + 1 }),
  },
  // T11 reconnecting --ready--> ready
  {
    id: "T11",
    from: ["reconnecting"],
    event: "ready",
    to: "ready",
    apply: clearSession,
  },
  // T12 authRequired --ready--> ready (re-authentication succeeded, probe passed)
  {
    id: "T12",
    from: ["authRequired"],
    event: "ready",
    to: "ready",
    apply: clearSession,
  },
  // T13 connecting|hostKeyUnverified|reconnecting|ready|authRequired|incompatible|offline|failed
  //     --cancel--> source (idle|offline), no residue.
  // Covers both mid-attempt cancel (restore pre-attempt state) and user disconnect from an
  // established/resting state (ready -> idle). Driver contract: zero transport calls.
  {
    id: "T13",
    from: ["connecting", "hostKeyUnverified", "reconnecting", "ready", "authRequired", "incompatible", "offline", "failed"],
    event: "cancel",
    to: (ctx) => ctx.source,
    apply: (ctx) => ({ source: ctx.source, retries: 0, fingerprint: undefined, reason: undefined }),
  },
  // T14 any --delete--> idle, zero transport calls (driver contract; machine has no I/O)
  {
    id: "T14",
    from: ANY,
    event: "delete",
    to: "idle",
    apply: () => ({ ...INITIAL_CONTEXT }),
  },
]

export type TransitionResult = { state: HostState; ctx: MachineContext; id: Transition["id"] }

/**
 * Apply an event. Returns the next state and context, or undefined when the transition is
 * illegal (the caller must keep the current state unchanged).
 */
export function transition(state: HostState, event: HostEvent, ctx: MachineContext = { ...INITIAL_CONTEXT }): TransitionResult | undefined {
  for (const t of TRANSITIONS) {
    if (t.event !== event.type) continue
    if (!t.from.includes(state)) continue
    if (t.guard && !t.guard(ctx, event)) continue
    const next = typeof t.to === "function" ? t.to(ctx, state) : t.to
    return { state: next, ctx: t.apply ? t.apply(ctx, event) : ctx, id: t.id }
  }
  return undefined
}

/** Serializable snapshot of a machine (memory values included, still never persisted by the registry). */
export function snapshotHostState(state: HostState, ctx: MachineContext) {
  return { state, ctx: { ...ctx } }
}

/** Restore a machine snapshot; throws on a malformed state value. */
export function restoreHostState(snapshot: { state: HostState; ctx: MachineContext }): { state: HostState; ctx: MachineContext } {
  const valid: readonly HostState[] = ANY
  if (!valid.includes(snapshot.state)) throw new Error(`unknown host state: ${String(snapshot.state)}`)
  const source = snapshot.ctx.source === "offline" ? "offline" : "idle"
  return {
    state: snapshot.state,
    ctx: {
      source,
      retries: Number.isInteger(snapshot.ctx.retries) && snapshot.ctx.retries >= 0 ? snapshot.ctx.retries : 0,
      fingerprint: snapshot.ctx.fingerprint,
      version: snapshot.ctx.version,
      reason: snapshot.ctx.reason,
    },
  }
}

/** Reconnect retry budget used by the driver this phase. */
export const RECONNECT_MAX_RETRIES = 3

/** Whether the reconnect budget for the current episode is exhausted (driver gives up into failed). */
export function reconnectExhausted(retries: number): boolean {
  return retries > RECONNECT_MAX_RETRIES
}
