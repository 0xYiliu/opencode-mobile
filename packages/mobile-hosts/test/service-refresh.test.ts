import { describe, expect, test } from "bun:test"
import { INITIAL_CONTEXT, transition } from "../src/state-machine"
import type { HostEvent, HostState } from "../src/state-machine"
import { shouldRefreshServiceStatus } from "../src/service-ops/refresh"

// B1 disconnect-survival trigger set (issue #7 acceptance 4; review residual 2): the
// tests are PREDICATE-LEVEL — every trigger case is reached through the REAL T-table
// paths (offline -> T10 -> reconnecting -> T11 -> ready; authRequired -> T12 -> ready),
// never through invented direct edges. The predicate's offline arm is a defensive dead
// branch (no direct offline -> ready row exists in the machine) and is asserted as such.

function drive(from: HostState, events: HostEvent[]): HostState {
  let state = from
  let ctx = { ...INITIAL_CONTEXT }
  for (const event of events) {
    const result = transition(state, event, ctx)
    if (!result) throw new Error(`unexpected illegal transition: ${state} --${event.type}--> ?`)
    state = result.state
    ctx = result.ctx
  }
  return state
}

describe("B1 refresh trigger set (predicate over real T-table paths)", () => {
  test("T5 first connect (connecting -> ready) does NOT trigger: no established episode, no survival to verify", () => {
    const final = drive("idle", [{ type: "connect" }, { type: "ready" }])
    expect(final).toBe("ready")
    expect(shouldRefreshServiceStatus("connecting", final)).toBe(false)
  })

  test("offline -> T10 reconnecting -> T11 ready DOES trigger (the real reconnect path)", () => {
    // ready --T9 connectionLost--> offline --T10 retry--> reconnecting --T11 ready--> ready
    const afterLoss = drive("ready", [{ type: "connectionLost" }])
    expect(afterLoss).toBe("offline")
    const afterRetry = drive(afterLoss, [{ type: "retry" }])
    expect(afterRetry).toBe("reconnecting")
    const afterReady = drive(afterRetry, [{ type: "ready" }])
    expect(afterReady).toBe("ready")
    // the trigger reads the LAST hop only: reconnecting -> ready
    expect(shouldRefreshServiceStatus(afterRetry, afterReady)).toBe(true)
  })

  test("authRequired -> T12 ready triggers the refresh (worded as a re-authentication re-check, not detach survival)", () => {
    const final = drive("authRequired", [{ type: "ready" }])
    expect(final).toBe("ready")
    expect(shouldRefreshServiceStatus("authRequired", final)).toBe(true)
  })

  test("residual 2: a DIRECT offline -> ready edge does not exist in the machine (the predicate's offline arm is a defensive dead branch)", () => {
    expect(transition("offline", { type: "ready" })).toBeUndefined()
    // predicate-level: should a future revision ever add the edge, the trigger set still
    // covers it — the arm is declared, not exercised by any current path.
    expect(shouldRefreshServiceStatus("offline", "ready")).toBe(true)
  })

  test("T9 (ready -> offline) does not trigger: leaving ready only invalidates", () => {
    expect(shouldRefreshServiceStatus("ready", "offline")).toBe(false)
  })

  test("the predicate is total over the state pairs and stable under repeats (debounce-safe input)", () => {
    const states: HostState[] = [
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
    for (const previous of states) {
      for (const current of states) {
        const expected = current === "ready" && ["offline", "reconnecting", "authRequired"].includes(previous)
        expect(shouldRefreshServiceStatus(previous, current)).toBe(expected)
        expect(shouldRefreshServiceStatus(previous, current)).toBe(expected) // idempotent
      }
    }
  })
})
