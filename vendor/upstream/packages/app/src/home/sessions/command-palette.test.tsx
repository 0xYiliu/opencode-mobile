import { afterEach, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionInfo } from "@opencode/client/promise"
import { ServerConnection } from "@/runtime/server/registry"
import { createServerSessionEntries } from "@/shell/commands/palette"

// The palette helper owns the Home session metadata contract: legacy request shapes and signals on
// the retained session API, project metadata from the runtime catalog, and superseded stale loads.
const server = ServerConnection.Key.make("https://palette.example")
const requests: Array<{ search?: string; sessionID?: string; aborted: boolean }> = []
const responses: Array<{ answer: SessionInfo[]; resolve: () => void }> = []

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function session(id: string, title: string, directory: string, updated: number): SessionInfo {
  return { id, title, location: { directory }, time: { created: updated, updated } } as SessionInfo
}

const catalog = [
  { id: "proj-app", worktree: "/repo/app", expanded: false },
  { id: "proj-root", worktree: "/repo", expanded: false },
]

mock.module("@/shell/tabs/tabs", () => ({ useTabs: () => ({ store: [] }) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
mock.module("@/shell/commands/command", () => ({ useCommand: () => ({ options: () => [] }), commandPaletteOptions: () => [] }))

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach((dispose) => dispose())
  requests.splice(0)
  responses.splice(0)
})

function create() {
  let result!: ReturnType<typeof createServerSessionEntries>
  createRoot((dispose) => {
    cleanups.push(dispose)
    result = createServerSessionEntries({
      server,
      projects: () => catalog,
      load: (search, signal) => {
        const pending = deferred()
        const answer = search === "stale" ? [session("ses_old", "stale result", "/repo/other", 5)] : [session("ses_1", "App fix", "/repo/app", 10)]
        const record = { search, aborted: false }
        requests.push(record)
        signal.addEventListener("abort", () => (record.aborted = true), { once: true })
        responses.push({ answer, resolve: pending.resolve })
        return pending.promise.then(() => ({ data: answer }))
      },
      get: (sessionID, signal) => {
        const record = { sessionID, aborted: false }
        requests.push(record)
        signal.addEventListener("abort", () => (record.aborted = true), { once: true })
        return Promise.resolve(session(sessionID, "Exact session", "/repo/app", 20))
      },
      untitled: () => "untitled.label",
      category: () => "category.session",
      recentCategory: () => "palette.recentSessions",
    })
  })
  return result
}

function resolveAll() {
  responses.splice(0).forEach((response) => response.resolve())
}

// Resolve every registered load as soon as it appears, until the search settles: the helper starts
// a load only after its debounce, so the answer can register well after the call.
async function settle(pending: Promise<unknown>) {
  let settled = false

  pending.then(() => (settled = true))

  for (let turn = 0; turn < 50 && !settled; turn++) {
    resolveAll()
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  return await pending
}

test("recent queries keep the retained request fields and attach catalog project metadata", async () => {
  const helper = create()
  const search = helper.search("")
  await settle(search)
  const recent = helper.items("")

  expect(requests.map((request) => request.search)).toEqual([""])
  expect(requests.every((request) => request.sessionID === undefined)).toBe(true)
  expect(recent.map((entry) => [entry.title, entry.description])).toEqual([
    ["App fix", "app"],
  ])
  expect(recent[0]).toMatchObject({ server, sessionID: "ses_1", category: "palette.recentSessions", directory: "/repo/app" })
  expect(recent[0]?.project).toMatchObject({ id: "proj-app", worktree: "/repo/app" })
})

test("typed searches issue the retained search field and ID lookups use the retained session.get input", async () => {
  const helper = create()
  const typed = helper.search("app")
  await settle(typed)
  expect(requests.map((request) => request.search)).toEqual(["app"])

  const exact = helper.search("ses_0123456789abcdef012345")
  await settle(exact)
  expect(requests.filter((request) => request.sessionID !== undefined).map((request) => request.sessionID)).toEqual(["ses_0123456789abcdef012345"])

  const found = helper.items("app")
  // Newest metadata first; the learned names from both loads stay searchable.
  expect(found.map((entry) => entry.title)).toEqual(["Exact session", "App fix"])
})

test("a newer query supersedes the older load and its late stale reply cannot publish", async () => {
  const helper = create()
  const stale = helper.search("stale")
  // The typed debounce must elapse so the stale load is in flight before the newer query supersedes it.
  await new Promise((resolve) => setTimeout(resolve, 150))
  const fresh = helper.search("fresh")

  expect(requests.filter((request) => request.search === "stale").at(-1)?.aborted).toBe(true)

  const both = await settle(Promise.all([stale, fresh]))
  console.error("BOTH", JSON.stringify(both))
  const [staleEntries, freshEntries] = both as [
    Array<{ title: string }>,
    Array<{ title: string }>,
  ]

  expect(staleEntries).toEqual([])
  expect(freshEntries.map((entry) => entry.title)).toEqual(["App fix"])
  // The stale reply published nothing: the loaded store only carries the fresh result.
  expect(helper.items("stale").map((entry) => entry.title)).toEqual([])
})

test("names learned while open stay available to later keystrokes without changing the caller's store", () => {
  const helper = create()
  const [seen, setSeen] = createStore<{ loaded: SessionInfo[] }>({ loaded: [] })
  setSeen("loaded", [session("ses_keep", "kept title", "/repo/app", 1)])

  expect(helper.items("kept").map((entry) => entry.title)).toEqual([])
  expect(seen.loaded.map((session) => session.id)).toEqual(["ses_keep"])
})
