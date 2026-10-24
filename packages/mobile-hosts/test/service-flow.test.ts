import { describe, expect, test } from "bun:test"
import {
  FLOW_FRESHNESS_MS,
  INITIAL_FLOW_CONTEXT,
  SERVICE_FLOW_TRANSITIONS,
  transitionServiceFlow,
  type ServiceFlowEvent,
  type ServiceFlowState,
} from "../src/service-ops/flow"

// Authorization flow O1–O14 (issue #7, decision 0004 §2.2): every row driven, the red
// lines locked exhaustively (no execution without confirmation, side-effect-free cancel,
// cancel-uncertain honesty, rollback only from rollbackAvailable, NO disconnect->stop
// edge) and the N3 freshness guard. Pure table only — no bridge, no exec, no network.

const ALL_STATES: readonly ServiceFlowState[] = [
  "idle",
  "discovering",
  "discovered",
  "previewing",
  "confirming",
  "executing",
  "cancelRequested",
  "succeeded",
  "partial",
  "failed",
]

const ALL_EVENT_TYPES: readonly ServiceFlowEvent["type"][] = [
  "discover",
  "discovered",
  "cancel",
  "preview",
  "confirm",
  "execute",
  "succeeded",
  "partial",
  "fail",
  "rediscover",
  "connectionLost",
]

const NOW = 1_800_000_000_000
const FRESH = NOW - 1000
const STALE = NOW - FLOW_FRESHNESS_MS - 1

/** Drive the canonical happy path: idle -> ... -> discovered (fresh). */
function toDiscovered(nowTs = FRESH) {
  let r = transitionServiceFlow("idle", { type: "discover" })!
  expect(r.id).toBe("O1")
  r = transitionServiceFlow(r.state, { type: "discovered", nowTs }, r.ctx)!
  expect(r.id).toBe("O2")
  return r
}

function toExecuting(nowTs = FRESH) {
  let r = toDiscovered(nowTs)
  r = transitionServiceFlow(r.state, { type: "preview", action: "start.linux" }, r.ctx)!
  expect(r.id).toBe("O4")
  r = transitionServiceFlow(r.state, { type: "confirm", nowTs: FRESH }, r.ctx)!
  expect(r.id).toBe("O6")
  r = transitionServiceFlow(r.state, { type: "execute" }, r.ctx)!
  expect(r.id).toBe("O7")
  return r
}

describe("O-table walk (each row reachable as written)", () => {
  test("happy path: discover -> preview -> confirm -> execute -> succeeded -> rediscover", () => {
    const r = toExecuting()
    expect(r.state).toBe("executing")
    const done = transitionServiceFlow(r.state, { type: "succeeded" }, r.ctx)!
    expect(done.id).toBe("O8")
    expect(done.state).toBe("succeeded")
    expect(done.ctx.rollbackAvailable).toBe(false)
    const hygiene = transitionServiceFlow(done.state, { type: "rediscover" }, done.ctx)!
    expect(hygiene.id).toBe("O12")
    expect(hygiene.state).toBe("discovering")
    // the re-discovery resets the flow context (freshness, action, uncertainty)
    expect(hygiene.ctx).toEqual({})
  })

  test("partial carries the result-declared rollback availability", () => {
    const r = toExecuting()
    const partial = transitionServiceFlow(r.state, { type: "partial", rollbackAvailable: true }, r.ctx)!
    expect(partial.id).toBe("O9")
    expect(partial.state).toBe("partial")
    expect(partial.ctx.rollbackAvailable).toBe(true)
    const flat = transitionServiceFlow(toExecuting().state, { type: "partial", rollbackAvailable: false }, toExecuting().ctx)!
    expect(flat.ctx.rollbackAvailable).toBe(false)
  })

  test("failure carries its classification code and optional rollback availability", () => {
    const r = toExecuting()
    const failed = transitionServiceFlow(r.state, { type: "fail", code: "occupied-port", rollbackAvailable: false }, r.ctx)!
    expect(failed.id).toBe("O10")
    expect(failed.state).toBe("failed")
    expect(failed.ctx.reason).toBe("occupied-port")
  })

  test("O13 rollback re-enters the authorization ladder (never a direct execution)", () => {
    const r = toExecuting()
    const partial = transitionServiceFlow(r.state, { type: "partial", rollbackAvailable: true }, r.ctx)!
    const rollback = transitionServiceFlow(partial.state, { type: "preview", action: "restore.linux" }, partial.ctx)!
    expect(rollback.id).toBe("O13")
    expect(rollback.state).toBe("previewing")
    // and the rollback STILL has to pass confirm -> execute (locked in the red-line sweep)
    const confirm = transitionServiceFlow(rollback.state, { type: "confirm", nowTs: FRESH }, rollback.ctx)!
    expect(confirm.state).toBe("confirming")
  })
})

describe("red line: no execution without confirmation (exhaustive)", () => {
  test("execute is illegal from every state except confirming", () => {
    for (const state of ALL_STATES) {
      const result = transitionServiceFlow(state, { type: "execute" }, { checkedAt: FRESH, action: "start.linux" })
      if (state === "confirming") {
        expect(result).toBeDefined()
        expect(result!.id).toBe("O7")
        expect(result!.state).toBe("executing")
      } else {
        expect(result).toBeUndefined()
      }
    }
  })

  test("the transition table has exactly one executing-producing row and it sources confirming", () => {
    const intoExecuting = SERVICE_FLOW_TRANSITIONS.filter((t) => t.to === "executing")
    expect(intoExecuting.length).toBe(1)
    expect(intoExecuting[0]!.id).toBe("O7")
    expect(intoExecuting[0]!.from).toEqual(["confirming"])
  })

  test("succeeded/partial/fail results are illegal from anywhere but executing", () => {
    for (const state of ALL_STATES) {
      for (const event of [
        { type: "succeeded" },
        { type: "partial", rollbackAvailable: true },
        { type: "fail", code: "install-failed" },
      ] as const) {
        const result = transitionServiceFlow(state, event as ServiceFlowEvent)
        const legal =
          (event.type === "fail" && (state === "executing" || state === "cancelRequested")) ||
          (event.type !== "fail" && state === "executing")
        if (legal) {
          expect(result).toBeDefined()
        } else {
          expect(result).toBeUndefined()
        }
      }
    }
  })
})

describe("red line: cancel is side-effect-free before execution and honest during it", () => {
  test("cancel from discovering lands idle; from previewing/confirming lands discovered (nothing executed)", () => {
    const discovering = transitionServiceFlow("idle", { type: "discover" })!
    const cancelledEarly = transitionServiceFlow(discovering.state, { type: "cancel" }, discovering.ctx)!
    expect(cancelledEarly.id).toBe("O3")
    expect(cancelledEarly.state).toBe("idle")
    expect(cancelledEarly.ctx).toEqual({})

    const p = toDiscovered()
    const preview = transitionServiceFlow(p.state, { type: "preview", action: "stop.linux" }, p.ctx)!
    const cancelledPreview = transitionServiceFlow(preview.state, { type: "cancel" }, preview.ctx)!
    expect(cancelledPreview.id).toBe("O5")
    expect(cancelledPreview.state).toBe("discovered")
    expect(cancelledPreview.ctx.action).toBeUndefined()

    const c = toDiscovered()
    const previewed = transitionServiceFlow(c.state, { type: "preview", action: "stop.linux" }, c.ctx)!
    const confirmed = transitionServiceFlow(previewed.state, { type: "confirm", nowTs: FRESH }, previewed.ctx)!
    const cancelledConfirm = transitionServiceFlow(confirmed.state, { type: "cancel" }, confirmed.ctx)!
    expect(cancelledConfirm.id).toBe("O5")
    expect(cancelledConfirm.state).toBe("discovered")
    expect(cancelledConfirm.ctx.action).toBeUndefined()
  })

  test("cancel during executing reaches cancelRequested — never a success claim", () => {
    const r = toExecuting()
    const requested = transitionServiceFlow(r.state, { type: "cancel" }, r.ctx)!
    expect(requested.id).toBe("O11")
    expect(requested.state).toBe("cancelRequested")
    expect(requested.ctx.cancelUncertain).toBe(true)
  })

  test("from cancelRequested the only forward actions are rediscover and fail (no re-execution)", () => {
    for (const event of ALL_EVENT_TYPES) {
      const concrete = (
        {
          discovered: { type: "discovered", nowTs: NOW },
          preview: { type: "preview", action: "start.linux" },
          confirm: { type: "confirm", nowTs: NOW },
          partial: { type: "partial", rollbackAvailable: false },
          fail: { type: "fail", code: "exec-failed" },
        } as Record<string, ServiceFlowEvent>
      )[event] ?? ({ type: event } as ServiceFlowEvent)
      const result = transitionServiceFlow("cancelRequested", concrete, { cancelUncertain: true })
      if (event === "rediscover" || event === "fail") {
        expect(result).toBeDefined()
        expect(result!.state).not.toBe("executing")
      } else {
        expect(result).toBeUndefined()
      }
    }
  })

  test("cancel-uncertainty sticks through a late failure and clears only on rediscover", () => {
    const r = toExecuting()
    const requested = transitionServiceFlow(r.state, { type: "cancel" }, r.ctx)!
    const failed = transitionServiceFlow(requested.state, { type: "fail", code: "exec-timeout" }, requested.ctx)!
    expect(failed.state).toBe("failed")
    expect(failed.ctx.cancelUncertain).toBe(true)
    const again = transitionServiceFlow(failed.state, { type: "discover" }, failed.ctx)!
    expect(again.ctx).toEqual({})
  })
})

describe("red line: rollback only from a rollbackAvailable context", () => {
  test("the rollback preview is refused without the flag, accepted with it (partial and failed)", () => {
    const partialFlat = transitionServiceFlow(toExecuting().state, { type: "partial", rollbackAvailable: false }, toExecuting().ctx)!
    expect(transitionServiceFlow(partialFlat.state, { type: "preview", action: "restore.linux" }, partialFlat.ctx)).toBeUndefined()

    const failedNoRollback = transitionServiceFlow(toExecuting().state, { type: "fail", rollbackAvailable: false }, toExecuting().ctx)!
    expect(transitionServiceFlow(failedNoRollback.state, { type: "preview", action: "restore.linux" }, failedNoRollback.ctx)).toBeUndefined()

    const failedRollback = transitionServiceFlow(toExecuting().state, { type: "fail", rollbackAvailable: true }, toExecuting().ctx)!
    const rollback = transitionServiceFlow(failedRollback.state, { type: "preview", action: "restore.linux" }, failedRollback.ctx)!
    expect(rollback.id).toBe("O13")
    expect(rollback.state).toBe("previewing")
    expect(rollback.ctx.reason).toBeUndefined() // the failure note cleared for the new action
  })

  test("O13 is the only preview row sourcing partial/failed", () => {
    const rows = SERVICE_FLOW_TRANSITIONS.filter((t) => t.event === "preview" && (t.from.includes("partial") || t.from.includes("failed")))
    expect(rows.length).toBe(1)
    expect(rows[0]!.id).toBe("O13")
    expect(rows[0]!.guard).toBeDefined()
  })
})

describe("red line: no disconnect-to-stop edge (the client never stops the remote)", () => {
  test("the event union carries no disconnect event at all", () => {
    expect(ALL_EVENT_TYPES).not.toContain("disconnect")
    expect(ALL_EVENT_TYPES).not.toContain("stop")
    for (const t of SERVICE_FLOW_TRANSITIONS) {
      expect(t.event).not.toBe("disconnect")
      expect(t.event).not.toBe("stop")
    }
  })

  test("every connectionLost row targets discovering and clears any previewed action", () => {
    const lossRows = SERVICE_FLOW_TRANSITIONS.filter((t) => t.event === "connectionLost")
    expect(lossRows.length).toBe(1)
    expect(lossRows[0]!.to).toBe("discovering")
    const ctx = { ...INITIAL_FLOW_CONTEXT, action: "stop.linux", checkedAt: FRESH }
    const invalidated = transitionServiceFlow("previewing", { type: "connectionLost" }, ctx)!
    expect(invalidated.state).toBe("discovering")
    expect(invalidated.ctx).toEqual({}) // no action survives a loss: nothing remote is signalled
  })

  test("connectionLost is refused from idle/discovering/executing (no invented invalidation)", () => {
    for (const state of ["idle", "discovering", "executing", "cancelRequested", "failed"] as const) {
      expect(transitionServiceFlow(state, { type: "connectionLost" })).toBeUndefined()
    }
  })
})

describe("N3 freshness guard on confirming", () => {
  test("a stale discovery refuses the confirmation (the driver re-runs discovery via O1)", () => {
    const p = toDiscovered(STALE)
    const preview = transitionServiceFlow(p.state, { type: "preview", action: "start.linux" }, p.ctx)!
    const refused = transitionServiceFlow(preview.state, { type: "confirm", nowTs: NOW }, preview.ctx)
    expect(refused).toBeUndefined() // guard refuses: the panel must re-discover, not proceed
    const rediscover = transitionServiceFlow(preview.state, { type: "discover" }, preview.ctx)!
    expect(rediscover.id).toBe("O1")
    expect(rediscover.state).toBe("discovering")
  })

  test("a fresh discovery confirms; the threshold is inclusive", () => {
    const edge = toDiscovered(NOW - FLOW_FRESHNESS_MS)
    const preview = transitionServiceFlow(edge.state, { type: "preview", action: "start.linux" }, edge.ctx)!
    const accepted = transitionServiceFlow(preview.state, { type: "confirm", nowTs: NOW }, preview.ctx)
    expect(accepted!.state).toBe("confirming")
    expect(accepted!.id).toBe("O6")
    const futureClock = toDiscovered(NOW + 1000)
    const previewed = transitionServiceFlow(futureClock.state, { type: "preview", action: "start.linux" }, futureClock.ctx)!
    // a checkedAt in the future relative to the event clock is treated as stale (guard
    // requires nowTs - checkedAt >= 0) — an honest refusal, not a negative-freshness pass
    expect(transitionServiceFlow(previewed.state, { type: "confirm", nowTs: NOW }, previewed.ctx)).toBeUndefined()
  })

  test("a confirm without any discovery is refused (and previewing-without-discovery is unreachable)", () => {
    // The machine can never produce a previewing state without a stamped checkedAt
    // (O4 only runs from discovered, which only O2 reaches, and O2 stamps checkedAt) —
    // so the only way to test the void is to forge the context and assert the guard.
    expect(transitionServiceFlow("previewing", { type: "confirm", nowTs: NOW }, { checkedAt: undefined })).toBeUndefined()
    // Symmetrically, a preview event from an unreachable previewing start is refused.
    expect(transitionServiceFlow("previewing", { type: "preview", action: "start.linux" })).toBeUndefined()
  })
})

describe("table hygiene", () => {
  test("exactly 14 rows O1..O14, unique ids, all states/events declared", () => {
    expect(SERVICE_FLOW_TRANSITIONS.length).toBe(14)
    expect(SERVICE_FLOW_TRANSITIONS.map((t) => t.id).join(",")).toBe(
      "O1,O2,O3,O4,O5,O6,O7,O8,O9,O10,O11,O12,O13,O14",
    )
  })

  test("an illegal event leaves the state untouched (the caller keeps the current state)", () => {
    expect(transitionServiceFlow("idle", { type: "execute" })).toBeUndefined()
    expect(transitionServiceFlow("discovered", { type: "confirm", nowTs: NOW })).toBeUndefined()
    expect(transitionServiceFlow("failed", { type: "fail" })).toBeUndefined()
  })
})
