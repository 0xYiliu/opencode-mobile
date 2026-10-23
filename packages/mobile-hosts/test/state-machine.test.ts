import { describe, expect, test } from "bun:test"
import { INITIAL_CONTEXT, RECONNECT_MAX_RETRIES, reconnectExhausted, restoreHostState, snapshotHostState, transition, TRANSITIONS } from "../src/state-machine"
import type { HostEvent, HostState } from "../src/state-machine"
import { mapStateToServerState } from "../src/upstream-map"
import { assessIncompatible } from "../src/health-wrapper"
import { createMobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"
import type { HostTransport } from "../src/ports"

// All values in this suite are fictional. Fingerprints are fabricated documentation strings
// and live in memory only — nothing here touches storage.

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

function drivingTransport() {
  const calls: string[] = []
  const transport: HostTransport = {
    open: async (input) => {
      calls.push(input.target)
      return { url: "http://127.0.0.1:0" }
    },
  }
  return { calls, transport }
}

function pureMachine(state: HostState, ctx = { ...INITIAL_CONTEXT }) {
  return {
    get state() {
      return state
    },
    get ctx() {
      return ctx
    },
    send(event: HostEvent) {
      const result = transition(state, event, ctx)
      if (!result) return this
      return pureMachine(result.state, result.ctx)
    },
  }
}

describe("state machine transitions T1–T14", () => {
  test("T1 idle|failed|incompatible --connect--> connecting", () => {
    expect(transition("idle", { type: "connect" })?.id).toBe("T1")
    expect(transition("idle", { type: "connect" })?.state).toBe("connecting")
    expect(transition("failed", { type: "connect" })?.state).toBe("connecting")
    expect(transition("incompatible", { type: "connect" })?.state).toBe("connecting")
    // connect while ready is illegal (disconnect first)
    expect(transition("ready", { type: "connect" })).toBeUndefined()
  })

  test("T2 connecting --hostKeyPending--> hostKeyUnverified (fingerprint in memory)", () => {
    const result = transition("connecting", { type: "hostKeyPending", fingerprint: "aa:bb:cc:dd" })
    expect(result?.state).toBe("hostKeyUnverified")
    expect(result?.ctx.fingerprint).toBe("aa:bb:cc:dd")
  })

  test("T3 hostKeyUnverified --hostKeyConfirm--> connecting", () => {
    const pending = transition("connecting", { type: "hostKeyPending", fingerprint: "aa:bb:cc:dd" })!
    const confirmed = transition(pending.state, { type: "hostKeyConfirm" }, pending.ctx)
    expect(confirmed?.state).toBe("connecting")
  })

  test("T4 hostKeyUnverified --hostKeyReject--> failed, and a rejected host key produces no connection attempt", async () => {
    const { calls, transport } = drivingTransport()
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      transport,
      hostKey: { verify: async () => ({ action: "prompt", fingerprint: "aa:bb:cc:dd" }) },
    })
    const host = hosts.registry.add({ name: "h", target: "user@example.invalid" })
    hosts.connect(host.id)
    await flush()
    expect(hosts.stateOf(host.id)).toBe("hostKeyUnverified")
    expect(calls.length).toBe(0) // not attempted while unverified
    hosts.rejectHostKey(host.id)
    expect(hosts.stateOf(host.id)).toBe("failed")
    expect(calls.length).toBe(0) // the red line: rejection never attempts
    // And confirm-after-reject is illegal from failed.
    expect(transition("failed", { type: "hostKeyConfirm" })).toBeUndefined()
  })

  test("T5 connecting --ready--> ready", () => {
    expect(transition("connecting", { type: "ready" })?.state).toBe("ready")
  })

  test("T6 connecting|reconnecting --authRequired--> authRequired", () => {
    expect(transition("connecting", { type: "authRequired" })?.state).toBe("authRequired")
    expect(transition("reconnecting", { type: "authRequired" })?.state).toBe("authRequired")
  })

  test("T7 connecting|reconnecting --incompatible--> incompatible (records version in memory)", () => {
    const result = transition("connecting", { type: "incompatible", version: "1.9.0" })
    expect(result?.state).toBe("incompatible")
    expect(result?.ctx.version).toBe("1.9.0")
    expect(transition("reconnecting", { type: "incompatible", version: "3.0.0" })?.state).toBe("incompatible")
  })

  test("T8 connecting|reconnecting --fail--> failed (reconnecting: only once the budget is exhausted)", () => {
    expect(transition("connecting", { type: "fail", reason: "transport-error" })?.state).toBe("failed")
    // Not exhausted: the episode falls back to offline with the budget intact.
    expect(transition("reconnecting", { type: "fail", reason: "transport-error" })?.state).toBe("offline")
    expect(
      transition("reconnecting", { type: "fail", reason: "retry-exhausted" }, { source: "offline", retries: RECONNECT_MAX_RETRIES + 1 })?.state,
    ).toBe("failed")
  })

  test("T9 ready --connectionLost--> offline (client-side; remote untouched)", () => {
    const result = transition("ready", { type: "connectionLost" })
    expect(result?.state).toBe("offline")
    expect(result?.ctx.source).toBe("offline")
  })

  test("T10 offline --retry--> reconnecting", () => {
    const result = transition("offline", { type: "retry" })
    expect(result?.state).toBe("reconnecting")
    expect(result?.ctx.retries).toBe(1)
  })

  test("T11 reconnecting --ready--> ready", () => {
    expect(transition("reconnecting", { type: "ready" })?.state).toBe("ready")
  })

  test("T12 authRequired --ready--> ready (re-authenticated)", () => {
    expect(transition("authRequired", { type: "ready" })?.state).toBe("ready")
  })

  test("T13 cancel restores the source state with no residue (including disconnect from ready)", () => {
    const first = transition("idle", { type: "connect" })!
    const cancelled = transition(first.state, { type: "cancel" }, first.ctx)
    expect(cancelled?.state).toBe("idle")
    expect(cancelled?.ctx.fingerprint).toBeUndefined()
    expect(cancelled?.ctx.reason).toBeUndefined()
    // Cancel while a fingerprint is pending leaves no residue either.
    const pending = transition(first.state, { type: "hostKeyPending", fingerprint: "aa:bb" })!
    const cancelled2 = transition(pending.state, { type: "cancel" }, pending.ctx)
    expect(cancelled2?.state).toBe("idle")
    expect(cancelled2?.ctx.fingerprint).toBeUndefined()
    // User disconnect from an established connection returns to idle.
    expect(transition("ready", { type: "cancel" }, { source: "idle", retries: 0 })?.state).toBe("idle")
    // A reconnect episode returns to offline.
    expect(transition("reconnecting", { type: "cancel" }, { source: "offline", retries: 2 })?.state).toBe("offline")
  })

  test("T14 delete from any state lands in idle; the driver performs zero transport calls on delete", async () => {
    for (const state of ["idle", "connecting", "hostKeyUnverified", "ready", "authRequired", "incompatible", "offline", "reconnecting", "failed"] as const) {
      expect(transition(state, { type: "delete" })?.state).toBe("idle")
    }
    const { calls, transport } = drivingTransport()
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      transport,
      hostKey: { verify: async () => ({ action: "trust" as const }) },
    })
    const host = hosts.registry.add({ name: "h", target: "user@example.invalid" })
    hosts.connect(host.id)
    await flush()
    expect(hosts.stateOf(host.id)).toBe("ready")
    expect(calls.length).toBe(1)
    hosts.remove(host.id)
    expect(calls.length).toBe(1) // delete never calls the transport
    expect(hosts.stateOf(host.id)).toBe("idle")
  })

  test("illegal transitions are rejected in both directions", () => {
    expect(transition("idle", { type: "connectionLost" })).toBeUndefined()
    expect(transition("idle", { type: "ready" })).toBeUndefined()
    expect(transition("ready", { type: "connect" })).toBeUndefined()
    expect(transition("hostKeyUnverified", { type: "ready" })).toBeUndefined()
    expect(transition("failed", { type: "connectionLost" })).toBeUndefined()
    expect(transition("offline", { type: "ready" })).toBeUndefined()
    expect(transition("offline", { type: "hostKeyPending", fingerprint: "x" })).toBeUndefined()
    expect(transition("authRequired", { type: "connectionLost" })).toBeUndefined()
  })

  test("snapshot/restore round-trips state and context; malformed states are refused", () => {
    const pending = transition("connecting", { type: "hostKeyPending", fingerprint: "aa:bb" })!
    const snap = snapshotHostState(pending.state, pending.ctx)
    const restored = restoreHostState(JSON.parse(JSON.stringify(snap)))
    expect(restored.state).toBe("hostKeyUnverified")
    expect(restored.ctx.fingerprint).toBe("aa:bb")
    expect(() => restoreHostState({ state: "made-up" as HostState, ctx: { ...INITIAL_CONTEXT } })).toThrow()
  })

  test("retry budget: reconnect failures loop back to offline until the budget exhausts, failed stays actionable", () => {
    // offline is only entered via T9 (whose real trigger is the connection monitor of the
    // actual transport, issue #6) — so the budget loop is exercised on the pure machine.
    let machine = pureMachine("offline")
    let retries = 0
    while (machine.state !== "failed") {
      machine = machine.send({ type: "retry" })
      retries++
      expect(machine.state).toBe("reconnecting")
      expect(machine.ctx.retries).toBe(retries)
      machine = machine.send({ type: "fail", reason: "transport-error" })
      // Not exhausted yet: the episode returns to offline with its budget intact.
      if (retries <= RECONNECT_MAX_RETRIES) expect(machine.state).toBe("offline")
    }
    expect(retries).toBe(RECONNECT_MAX_RETRIES + 1)
    expect(machine.ctx.retries).toBe(RECONNECT_MAX_RETRIES + 1)
    // failed stays actionable: a fresh user attempt starts a new episode.
    machine = machine.send({ type: "connect" })
    expect(machine.state).toBe("connecting")
    expect(machine.ctx.retries).toBe(0)
    machine = machine.send({ type: "cancel" })
    expect(machine.state).toBe("idle")
    expect(reconnectExhausted(RECONNECT_MAX_RETRIES)).toBe(false)
    expect(reconnectExhausted(RECONNECT_MAX_RETRIES + 1)).toBe(true)
    // Driver level: retry() outside offline is an illegal transition and keeps the state.
    const { calls, transport } = drivingTransport()
    const hosts = createMobileHosts({ storage: createMemoryStorage(), transport })
    const host = hosts.registry.add({ name: "h", target: "user@example.invalid" })
    hosts.retry(host.id)
    expect(hosts.stateOf(host.id)).toBe("idle")
    expect(calls.length).toBe(0)
  })

  test("mapping to upstream ServerState is total over every state", () => {
    const states = ["idle", "connecting", "hostKeyUnverified", "ready", "authRequired", "incompatible", "offline", "reconnecting", "failed"] as const
    const serverStates = new Set(states.map(mapStateToServerState))
    expect(serverStates.size).toBeGreaterThan(0)
    for (const s of states) expect(typeof mapStateToServerState(s)).toBe("string")
    expect(mapStateToServerState("idle")).toBe("stopped")
    expect(mapStateToServerState("connecting")).toBe("starting")
    expect(mapStateToServerState("reconnecting")).toBe("starting")
    expect(mapStateToServerState("hostKeyUnverified")).toBe("starting")
    expect(mapStateToServerState("ready")).toBe("ready")
    expect(mapStateToServerState("authRequired")).toBe("auth")
    expect(mapStateToServerState("incompatible")).toBe("incompatible")
    expect(mapStateToServerState("offline")).toBe("failed")
    expect(mapStateToServerState("failed")).toBe("failed")
    expect(TRANSITIONS.length).toBe(14)
  })

  test("incompatible predicate: SSH judged by our rule, direct never", () => {
    // Rule: major === 2, minor >= 1; patch ignored; unparseable -> not judged.
    expect(assessIncompatible({ kind: "ssh", version: "2.1.4" })).toBe(false)
    expect(assessIncompatible({ kind: "ssh", version: "2.9.0" })).toBe(false)
    expect(assessIncompatible({ kind: "ssh", version: "2.1.0" })).toBe(false)
    expect(assessIncompatible({ kind: "ssh", version: "2.0.9" })).toBe(true)
    expect(assessIncompatible({ kind: "ssh", version: "1.9.4" })).toBe(true)
    expect(assessIncompatible({ kind: "ssh", version: "3.1.0" })).toBe(true)
    expect(assessIncompatible({ kind: "ssh", version: "" })).toBe(false)
    expect(assessIncompatible({ kind: "ssh", version: undefined })).toBe(false)
    expect(assessIncompatible({ kind: "ssh", version: "dev" })).toBe(false)
    // Direct http connections never surface incompatible here (upstream web native behavior).
    expect(assessIncompatible({ kind: "direct", version: "1.0.0" })).toBe(false)
    expect(assessIncompatible({ kind: "direct", version: "9.9.9" })).toBe(false)
  })
})
