import { afterEach, expect, mock, test } from "bun:test"
import { createComponent, createEffect, createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { ServerConnection, createServerProjects } from "./registry"
import { ServerScope } from "./scope"
import { createApiForServer } from "./api"
import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"
import { serverState } from "./persistence"

// The catalog remains real: only its surrounding SDK/network, unrelated UI contexts and old
// sync inventory are fixtures. A regression to sync.data.project cannot satisfy these records.
const base = ServerConnection.Key.make("https://catalog-a.example")
const alternate = ServerConnection.Key.make("https://catalog-b.example")
const [connections, setConnections] = createStore<{ list: ServerConnection.Http[] }>({ list: [] })
const [old, setOld] = createStore(Schema.decodeUnknownSync(Persistence.withInitial(serverState(), {
  list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {},
}))({}))
const scopes = new Map<string, ReturnType<typeof createServerProjects>>()
const sdkFixtures: Array<{ setStatus: (value: "connected" | "reconnecting") => void; updated: () => void }> = []
const requests: Array<{ server: string; path: string; method: string }> = []
const replies = new Map<string, Array<ReturnType<typeof deferred<Response>>>>()
const metadata = [
  { id: "nested", canonical: "/repo/nested", worktrees: [{ directory: "/repo/nested" }], sandboxes: ["/sandbox"] },
  { id: "global", canonical: "/", worktrees: [{ directory: "/" }] },
  { id: "global", canonical: "/opencode-test-hidden", worktrees: [{ directory: "/opencode-test-hidden" }] },
  { id: "parent", canonical: "/repo", worktrees: [{ directory: "/repo" }] },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function makeSdk(server: ServerConnection.Any, scope: ServerScope) {
  const [status, setStatus] = createSignal<"connected" | "reconnecting">("connected")
  const listeners = new Set<() => void>()
  const transport: typeof globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    requests.push({ server: server.http.url, path: url.pathname, method: init?.method ?? "GET" })
    if (url.pathname !== "/api/project") throw new Error("Unexpected catalog fixture request")
    const response = replies.get(server.http.url)?.shift()
    return response ? response.promise : Response.json(metadata)
  }, { preconnect: globalThis.fetch.preconnect })
  const api = createApiForServer({ server: server.http, fetch: transport })
  const sdk = {
    server, scope, api: api.inline, mediaApi: api, url: server.http.url,
    connection: { status, attempt: () => 0, error: () => undefined },
    event: {
      on: (type: string, listener: () => void) => {
        if (type === "project.updated") listeners.add(listener)
        return () => listeners.delete(listener)
      },
      listen: () => () => {},
      location: () => ({ on: () => () => {}, listen: () => () => {} }),
    },
    setStatus,
    updated: () => listeners.forEach((listener) => listener()),
  }
  sdkFixtures.push(sdk)
  return sdk
}

mock.module("./client", () => ({ createServerSdkContext: makeSdk }))
mock.module("./sync", () => ({ createServerSyncContext: () => ({
  data: { project: [] }, child: () => [{ project: undefined, projectMeta: undefined, icon: undefined }],
}) }))
mock.module("./health", () => ({ useServerHealth: () => ({ status: {}, retry: async () => {} }) }))
mock.module("./registry", () => ({
  ServerConnection, createServerProjects,
  useServers: () => ({
    get list() { return connections.list }, scope: (key: ServerConnection.Key) => ServerScope.fromServerKey(key),
    projects: { forServer: (key: ServerConnection.Key) => {
      if (!scopes.has(key)) scopes.set(key, createServerProjects({ store: old, setStore: setOld, scope: () => ServerScope.fromServerKey(key) }))
      return scopes.get(key)!
    } },
  }),
}))
mock.module("@/shell/tabs/tabs", () => ({ useTabs: () => ({ store: [] }) }))
mock.module("@/shell/state/layout", () => ({ useCurrentRoute: () => () => ({ type: "home" }) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
mock.module("@/runtime/platform/platform", () => ({ usePlatform: () => ({ platform: "web" }) }))
mock.module("@/settings/model", () => ({ useSettings: () => ({ general: { timelineDetail: () => ({
  shell: { placement: "grouped", details: "collapsed" }, edit: { placement: "grouped", details: "collapsed" },
  thinking: "hidden", subagents: "grouped", notices: "hidden", tools: "grouped", commentary: "hidden",
}) } }) }))
mock.module("@/session/requests/auto-approve", () => ({ createPermissionAutoApprover: () => {} }))
mock.module("@/shell/notifications/notification", () => ({ createServerNotificationState: () => ({}) }))
mock.module("@/shell/notifications/coordinator", () => ({ createNotificationCoordinator: () => ({}) }))
mock.module("@/shell/notifications/toast", () => ({ showToast: () => {} }))

const { GlobalProvider, useGlobal } = await import("./runtime")
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose())
  setConnections("list", [])
  setOld({ list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {} })
  scopes.clear(); sdkFixtures.splice(0); requests.splice(0); replies.clear(); localStorage.clear()
})

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let global!: ReturnType<typeof useGlobal>
  createRoot((dispose) => {
    cleanups.push(() => { dispose(); queryClient.clear() })
    createComponent(QueryClientProvider, { client: queryClient, get children() {
      return createComponent(GlobalProvider, { get children() { global = useGlobal(); return null } })
    } })
  })
  return { global, queryClient }
}

function observe<T>(read: () => T, ready: (value: T) => boolean) {
  return new Promise<T>((resolve) => {
    createRoot((dispose) => createEffect(() => {
      const value = read()
      if (!ready(value)) return
      resolve(value)
      queueMicrotask(dispose)
    }))
  })
}

test("complete canonical catalog preserves order and duplicate IDs without touching old directory actions", async () => {
  setConnections("list", [{ type: "http", http: { url: base } }])
  const { global } = mount()
  const ctx = global.serverCtx(base)!
  ctx.projects.open("/repo")
  ctx.projects.collapse("/repo")
  ctx.projects.touch("/repo")
  ctx.projects.open("/closed")
  ctx.projects.close("/closed")
  const before = structuredClone(JSON.parse(JSON.stringify(old)))
  await observe(ctx.projects.catalog.ready, Boolean)
  expect(ctx.projects.catalog.list().map((project) => [project.id, project.worktree])).toEqual(metadata.map((project) => [project.id, project.canonical]))
  expect(ctx.projects.forDirectory("/sandbox")?.id).toBe("nested")
  expect(ctx.projects.forDirectory("/repo/nested/deeper")?.id).toBe("nested")
  expect(ctx.projects.forDirectory("/repo/file")?.id).toBe("parent")
  // The root really is in the inventory and is a valid ancestor, not an unknown fake ID.
  expect(ctx.projects.forDirectory("/elsewhere")?.id).toBe("global")
  expect(ctx.projects.list()).toEqual([{ worktree: "/repo", expanded: false }])
  expect(JSON.parse(JSON.stringify(old))).toEqual(before)
  expect(requests.every((request) => request.method === "GET" && request.path === "/api/project")).toBe(true)
})

test("same-key controller replacement cannot publish an old ignored-abort response or corrupt another source", async () => {
  const pending = deferred<Response>()
  replies.set(base, [pending])
  setConnections("list", [{ type: "http", http: { url: base, password: "fixture-old" } }])
  const { global, queryClient } = mount()
  const original = global.serverCtx(base)!
  await observe(() => queryClient.isFetching(), (count) => count > 0)
  setConnections("list", [{ type: "http", http: { url: base, password: "fixture-new" } }, { type: "http", http: { url: alternate } }])
  const replacement = global.serverCtx(base)!
  const other = global.serverCtx(alternate)!
  expect(replacement).not.toBe(original)
  await Promise.all([observe(replacement.projects.catalog.ready, Boolean), observe(other.projects.catalog.ready, Boolean)])
  pending.resolve(Response.json([{ id: "stale", canonical: "/stale" }]))
  await pending.promise
  expect(replacement.projects.catalog.list().map((project) => project.id)).toEqual(metadata.map((project) => project.id))
  expect(other.projects.catalog.list().map((project) => project.id)).toEqual(metadata.map((project) => project.id))
  expect(queryClient.getQueryCache().findAll().filter((query) => query.queryKey.includes("session-project-catalog"))).toHaveLength(2)
})

test("a failed refetch remains an error with same-generation content; reconnect recovers the complete list", async () => {
  setConnections("list", [{ type: "http", http: { url: base } }])
  const { global } = mount()
  const ctx = global.serverCtx(base)!
  await observe(ctx.projects.catalog.ready, Boolean)
  const failure = deferred<Response>()
  replies.set(base, [failure])
  sdkFixtures[0]!.updated()
  failure.resolve(new Response(null, { status: 503 }))
  await observe(ctx.projects.catalog.status, (status) => status === "error")
  expect(ctx.projects.catalog.error()).toBeDefined()
  expect(ctx.projects.catalog.list()).toHaveLength(4)
  sdkFixtures[0]!.setStatus("reconnecting")
  sdkFixtures[0]!.setStatus("connected")
  await observe(ctx.projects.catalog.status, (status) => status === "success")
  expect(ctx.projects.catalog.list()).toHaveLength(4)
})

test("real persisted favorite accessor imports flags once and an explicit cancellation remains empty after reload", async () => {
  localStorage.setItem("opencode.global.dat:model", JSON.stringify({ user: [{ providerID: "p", modelID: "m", visibility: "show", favorite: true }], recent: [], variant: { "p/m": "high" } }))
  const { global } = mount()
  await global.models.ready.promise
  expect(global.models.favorite()).toEqual([{ providerID: "p", modelID: "m" }])
  global.models.set("favorite", [])
  expect(global.models.favorite()).toEqual([])
  window.dispatchEvent(new Event("pagehide"))
  expect(JSON.parse(localStorage.getItem("opencode.global.dat:model")!).favorite).toEqual([])
  cleanups.splice(0).forEach((dispose) => dispose())
  const next = mount().global
  await next.models.ready.promise
  expect(next.models.favorite()).toEqual([])
  expect(next.models.store.user[0]?.favorite).toBe(true)
  expect(next.models.store.variant).toEqual({ "p/m": "high" })
})
