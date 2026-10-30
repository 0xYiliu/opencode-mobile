import { describe, expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { assertExtensionShape, mapStateToServerState, toExtensionConnection } from "../src/upstream-map"
import { createMobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"
import { hostKey } from "../src/identity"

// All values fictional. This suite locks three things:
// 1. Structural conformance with the upstream ServerConnection.Plugin shape
//    (vendor/upstream/packages/app/src/runtime/server/registry.tsx) — duplicated structurally
//    on purpose, since the first-party package must not import the vendored app.
// 2. Change propagation (N5): upstreamConnections() is derived from solid stores, so a
//    registry or machine-state change re-evaluates it. The upstream ServersProvider reads
//    the injected value inside createMemo; a plain array snapshot would never re-render.
// 3. Mirror-liveness (issue #90): a source-level cross-check pins the vendored
//    discriminant/field names the mirror must follow. The M-037 rename moved the upstream
//    shape from Extension/`extension:` to Plugin/`plugin:` and this mirror silently kept
//    the stale shape — the vendored key() switch fell through to `undefined` and every
//    saved SSH host collapsed into one dedupe key. The old shape lock expired together
//    with the mirror; this cross-check is the anti-regression that keeps both honest.

const RECORD = {
  id: "44444444-5555-4666-8777-888888888888",
  name: "work box",
  target: "deploy@example.invalid:22",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

describe("extension mapping", () => {
  test("maps a host to the upstream Plugin shape (key/plugin/state/managed/http)", () => {
    const conn = toExtensionConnection({ record: RECORD, state: "connecting" })
    expect(conn.type).toBe("plugin")
    expect(conn.key).toBe(hostKey(RECORD.id))
    expect(conn.key.startsWith("mobile-ssh:")).toBe(true)
    expect(conn.plugin).toBe("mobile-ssh")
    expect(conn.state).toBe("starting")
    expect(conn.connecting).toBe(true)
    expect(conn.authenticationRequired).toBe(false)
    expect(conn.managed).toBe(true) // the endpoint is re-resolved on drop (tunnel port may move)
    expect(conn.http.url).toBe("http://127.0.0.1:0") // upstream offline sentinel until ready
    expect(conn.displayName).toBe("work box")
    expect(conn.label).toBe("SSH")
    expect(assertExtensionShape(conn)).toBe(true)
    expect(assertExtensionShape({ type: "http" })).toBe(false)
    expect(assertExtensionShape(null)).toBe(false)
  })

  test("the pre-#90 extension shape is rejected and the mirror stays keyed", () => {
    // The exact regression shape M-037 left behind: ServerConnection.key() has no case
    // for type "extension", so such a connection must never pass the shape guard.
    const stale = toExtensionConnection({ record: RECORD, state: "ready" })
    expect(stale.type).not.toBe("extension")
    expect("extension" in stale).toBe(false)
    expect(assertExtensionShape({ ...stale, type: "extension", plugin: stale.plugin })).toBe(false)
  })

  test("mirror cross-checks the vendored Plugin discriminant and key fields at source level", async () => {
    // The structural mirror is only as fresh as the vendored contract it shadows; read
    // the vendored source directly so a rename cannot re-issue the #90 collapse while
    // this suite stays green.
    const registry = await Bun.file(
      new URL("../../../vendor/upstream/packages/app/src/runtime/server/registry.tsx", import.meta.url),
    ).text()
    expect(registry).toContain('export type Plugin = {')
    expect(registry).toContain('type: "plugin"')
    expect(registry).toContain("plugin: string")
    expect(registry).not.toContain('export type Extension = {')
    // key() must resolve plugin connections to their recorded key (the #90 collapse was
    // a fall-through to undefined for unknown discriminants).
    expect(registry).toContain('case "plugin":')
    expect(registry).toContain("return Key.make(conn.key)")
    // The mirror's own mapping stays aligned with the vendored discriminant.
    expect(typeof toExtensionConnection({ record: RECORD, state: "idle" }).key).toBe("string")
  })

  test("a ready connection carries the in-memory endpoint; state mapping stays total", () => {
    const conn = toExtensionConnection({
      record: RECORD,
      state: "ready",
      endpoint: { url: "http://127.0.0.1:45133" },
    })
    expect(conn.http).toEqual({ url: "http://127.0.0.1:45133" })
    expect(conn.state).toBe("ready")
    expect(conn.connecting).toBe(false)

    // A real endpoint must never surface on a non-ready state, even if one is supplied.
    for (const state of ["idle", "connecting", "hostKeyUnverified", "authRequired", "incompatible", "offline", "reconnecting", "failed"] as const) {
      const mapped = toExtensionConnection({ record: RECORD, state, endpoint: { url: "http://127.0.0.1:45133" } })
      expect(mapped.http).toEqual({ url: "http://127.0.0.1:0" })
    }

    for (const state of ["idle", "connecting", "hostKeyUnverified", "ready", "authRequired", "incompatible", "offline", "reconnecting", "failed"] as const) {
      const mapped = toExtensionConnection({ record: RECORD, state })
      expect(mapStateToServerState(state)).toBe(mapped.state)
      expect(["stopped", "starting", "auth", "ready", "failed", "incompatible"]).toContain(mapped.state)
      expect(mapped.connecting).toBe(state === "connecting" || state === "reconnecting" || state === "hostKeyUnverified")
      expect(mapped.authenticationRequired).toBe(state === "authRequired")
    }
  })

  test("resolveServerList invariants: stable unique keys, props entries survive merges", () => {
    // The upstream resolveServerList deduplicates by ServerConnection.key with props winning
    // per key. Our mapped connections therefore must have: stable keys per host id, unique
    // keys across the list, and http.url always present.
    const hosts = createMobileHosts({ storage: createMemoryStorage() })
    const a = hosts.registry.add({ name: "a", target: "a@example.invalid" })
    const b = hosts.registry.add({ name: "b", target: "b@example.invalid:2222" })
    const connections = hosts.upstreamConnections()
    const keys = connections.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain(hostKey(a.id))
    expect(keys).toContain(hostKey(b.id))
    for (const conn of connections) {
      expect(typeof conn.http.url).toBe("string")
      expect(conn.http.url.length).toBeGreaterThan(0)
      expect(assertExtensionShape(conn)).toBe(true)
    }
  })

  test("change propagation: registry and machine-state changes re-derive upstreamConnections", async () => {
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      hostKey: { verify: async () => ({ action: "prompt", fingerprint: "aa:bb:cc:dd" }) },
    })
    let evaluations = 0
    const view = createRoot(() => createMemo(() => {
      evaluations++
      return hosts.upstreamConnections().map((c) => ({ key: c.key, state: c.state }))
    }))

    expect(view().length).toBe(0)
    const host = hosts.registry.add({ name: "a", target: "a@example.invalid" })
    expect(view().length).toBe(1) // registry add propagated
    expect(view()[0]?.state).toBe("stopped")

    hosts.connect(host.id)
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    expect(view()[0]?.state).toBe("starting") // hostKeyUnverified -> starting, propagated
    expect(connHas(hosts, host.id, "aa:bb:cc:dd")).toBe(false) // fingerprint stays in memory

    hosts.rejectHostKey(host.id)
    expect(view()[0]?.state).toBe("failed") // propagated again
    expect(evaluations).toBeGreaterThanOrEqual(4)
  })
})

function connHas(hosts: ReturnType<typeof createMobileHosts>, id: string, needle: string): boolean {
  return JSON.stringify(hosts.upstreamConnections().find((c) => c.key === hostKey(id))).includes(needle)
}
