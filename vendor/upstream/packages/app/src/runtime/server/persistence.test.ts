import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ModelState, modelState, serverState } from "./persistence"
import { Persistence } from "@/runtime/persistence/schema"

const initial = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {} }

function serverSchema(canonical?: () => string | undefined) {
  return Persistence.withInitial(serverState(canonical), initial)
}

describe("server persistence schema", () => {
  test("migrates legacy auth, keeps the old project directories for migration and writes only current server objects", () => {
    const schema = serverSchema()

    const input = {
      list: [
        "http://localhost:4096",
        { url: "https://flat.example", username: "legacy", password: "first", credentialRef: "fixture-ref-a" },
        {
          type: "http",
          displayName: "Remote",
          label: "Production",
          authToken: true,
          http: { url: "https://nested.example", username: "legacy", password: "second", credentialRef: "fixture-ref-b" },
        },
      ],
      projects: { local: [{ worktree: "/project", expanded: true }] },
      recentlyClosed: { local: ["/closed"] },
      lastProject: { local: "/project" },
    }

    const state = Schema.decodeUnknownSync(schema)(input)
    expect(state).toEqual({
      list: [
        { type: "http", http: { url: "http://localhost:4096" } },
        { type: "http", http: { url: "https://flat.example", password: "first", credentialRef: "fixture-ref-a" } },
        {
          type: "http",
          displayName: "Remote",
          label: "Production",
          authToken: true,
          http: { url: "https://nested.example", password: "second", credentialRef: "fixture-ref-b" },
        },
      ],
      hidden: {},
      lastProject: { local: "/project" },
      recentlyClosed: { local: ["/closed"] },
      projects: { local: [{ worktree: "/project", expanded: true }] },
    })
    expect(input.list[1]).toHaveProperty("username", "legacy")
    const encoded = Schema.encodeSync(schema)(state)
    expect(encoded).toEqual({ ...state, list: [
      { type: "http", http: { url: "http://localhost:4096" } },
      { type: "http", http: { url: "https://flat.example", credentialRef: "fixture-ref-a" } },
      { type: "http", displayName: "Remote", label: "Production", authToken: true,
        http: { url: "https://nested.example", credentialRef: "fixture-ref-b" } },
    ] })
    expect(input.list[1]).toHaveProperty("password", "first")
    const wire = JSON.parse(JSON.stringify(encoded))
    expect(Schema.decodeUnknownSync(schema)(wire)).toEqual(wire)
    expect(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)({ list: [
      { type: "http", http: { url: "https://no-password.example/", credentialRef: "fixture-ref-c" } },
    ] }))).toHaveProperty("list.0.http", { url: "https://no-password.example/", credentialRef: "fixture-ref-c" })
  })

  test("defaults missing or malformed fields and drops invalid entries independently", () => {
    const decode = Schema.decodeUnknownSync(serverSchema())
    expect(decode({})).toEqual(initial)
    expect(decode({ list: null, hidden: [], lastProject: 1, recentlyClosed: [], projects: "bad" })).toEqual(initial)
    expect(
      decode({
        list: [null, 1, {}, { type: "http", http: { url: 12 } }, "https://valid.example"],
        lastProject: { local: "/project", remote: 1 },
        recentlyClosed: { local: ["/closed", 1, null], remote: "bad" },
        projects: { local: [null, {}, { worktree: 1 }, { worktree: "/project", expanded: true }], remote: false },
      }),
    ).toEqual({
      ...initial,
      list: [{ type: "http", http: { url: "https://valid.example" } }],
      lastProject: { local: "/project" },
      recentlyClosed: { local: ["/closed"], remote: [] },
      projects: { local: [{ worktree: "/project", expanded: true }], remote: [] },
    })
  })

  test("moves canonical project buckets without changing server keys or unrelated scopes", () => {
    const schema = serverSchema(() => "https://opencode.example.com")
    const input = {
      list: ["https://opencode.example.com"], hidden: { "https://opencode.example.com": true },
      projects: {
        local: [{ worktree: "/local", expanded: false }],
        "https://opencode.example.com": [{ worktree: "/local", expanded: true }, { worktree: "/remote", expanded: true }, { worktree: "/remote", expanded: false }],
        other: [{ worktree: "/other", expanded: true }],
      },
      lastProject: { local: "/local", "https://opencode.example.com": "/remote", other: "/other" },
      recentlyClosed: { local: ["/closed"], "https://opencode.example.com": ["/old-closed"] },
    }
    const before = structuredClone(input)
    const state = Schema.decodeUnknownSync(schema)(input)
    expect(state.projects).toEqual({ local: [{ worktree: "/local", expanded: false }, { worktree: "/remote", expanded: true }], other: input.projects.other })
    expect(state.lastProject).toEqual({ local: "/local", other: "/other" })
    expect(state.list[0]?.http.url).toBe("https://opencode.example.com")
    expect(state.hidden).toEqual(input.hidden)
    expect(state.recentlyClosed).toEqual(input.recentlyClosed)
    expect(Schema.encodeSync(schema)(state)).toEqual(state)
    expect(Schema.decodeUnknownSync(schema)(state)).toEqual(state)
    expect(input).toEqual(before)
  })

  test("reads the latest canonical local prop on each decode", () => {
    const props: { canonicalLocalServer?: string } = {}
    const schema = serverSchema(() => props.canonicalLocalServer)
    const decode = Schema.decodeUnknownSync(schema)
    const input = { projects: { remote: [{ worktree: "/project", expanded: true }] }, lastProject: { remote: "/project" } }
    const before = structuredClone(input)
    expect(decode(input).projects).toEqual(input.projects)
    props.canonicalLocalServer = "remote"
    expect(decode(input).projects).toEqual({ local: [{ worktree: "/project", expanded: true }] })
    expect(decode(input).lastProject).toEqual({ local: "/project" })
    props.canonicalLocalServer = "local"
    expect(decode(input).projects).toEqual(input.projects)
    expect(input).toEqual(before)
    props.canonicalLocalServer = "remote"
    expect(decode({ lastProject: { remote: "/project" } })).toEqual({ ...initial, lastProject: { local: "/project" } })
  })
})

describe("model persistence schema", () => {
  test("raw presence governs favorites, tuple dedup is stable, and cancellation survives repeated reload", () => {
    const schema = Persistence.withInitial(modelState, { user: [], recent: [], favorite: [], variant: {} })
    const decode = Schema.decodeUnknownSync(schema)
    const user = [
      { providerID: "a:b", modelID: "c", visibility: "show", favorite: true },
      { providerID: "a", modelID: "b:c", visibility: "hide", favorite: true },
      { providerID: "a:b", modelID: "c", visibility: "hide", favorite: true },
      { providerID: "bad", modelID: "bad", visibility: "bad", favorite: true },
    ]
    const input = { user, recent: [{ providerID: "r", modelID: "m" }], variant: { model: "high" } }
    const before = structuredClone(input)
    const expected = [{ providerID: "a:b", modelID: "c" }, { providerID: "a", modelID: "b:c" }]
    expect(decode(input).favorite).toEqual(expected)
    for (const favorite of [[], null, undefined, 0, "x", {}, [null, { providerID: "", modelID: "x" }]]) {
      // The malformed values are intentionally invalid wire data, so hand the raw form to the
      // decoder; an undefined favorite stays an own property, unlike a JSON round trip.
      const wire = { ...input, favorite } as Omit<typeof input, "favorite"> & { favorite: unknown }
      const state = decode(wire)
      expect(state.favorite).toEqual([])
      expect(state.user).toEqual(user.slice(0, 3) as typeof state.user)
      expect(state.recent).toEqual(input.recent)
      expect(state.variant).toEqual(input.variant)
      const saved = Schema.encodeSync(schema)(state)
      expect(saved).toHaveProperty("favorite", [])
      expect(decode(JSON.parse(JSON.stringify(Schema.encodeSync(schema)(decode(saved)))))).toEqual(state)
    }
    expect(decode({ ...input, favorite: [null, expected[1], expected[1], { providerID: " A ", modelID: "M" }] }).favorite)
      .toEqual([expected[1], { providerID: " A ", modelID: "M" }])
    expect(input).toEqual(before)
  })
  test("defaults missing state and keeps valid entries beside malformed entries", () => {
    const decode = Schema.decodeUnknownSync(
      Persistence.withInitial(ModelState, { user: [], recent: [], favorite: [], variant: {} }),
    )

    expect(decode({})).toEqual({ user: [], recent: [], favorite: [], variant: {} })
    expect(decode({ user: null, recent: 1, favorite: "x", variant: [] })).toEqual({
      user: [],
      recent: [],
      favorite: [],
      variant: {},
    })

    const state = decode({
      user: [
        null,
        { providerID: "provider", modelID: "model", visibility: "show", favorite: true },
        { providerID: "provider", modelID: "invalid", visibility: "invalid" },
        { providerID: "provider", modelID: "hidden", visibility: "hide" },
      ],
      recent: [false, { providerID: "provider", modelID: "model" }, { providerID: "missing-model" }],
      favorite: [{ providerID: "provider", modelID: "model" }, { modelID: "missing-provider" }],
      variant: { model: "high" },
    })

    expect(state).toEqual({
      user: [
        { providerID: "provider", modelID: "model", visibility: "show", favorite: true },
        { providerID: "provider", modelID: "hidden", visibility: "hide" },
      ],
      recent: [{ providerID: "provider", modelID: "model" }],
      favorite: [{ providerID: "provider", modelID: "model" }],
      variant: { model: "high" },
    })
    expect(Schema.encodeSync(ModelState)(state)).toEqual(state)
  })
})
