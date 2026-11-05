import { afterEach, expect, mock, test } from "bun:test"
import { createComponent, createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createSessionOwnership } from "./session-ownership"
import type { SessionMessageUser } from "@opencode/client/promise"
import { ServerConnection } from "@/runtime/server/registry"
import { ServerScope } from "@/runtime/server/scope"
import type { ComposerState } from "@/composer/state"
import { blobDataUrl, resolveBlobUrl } from "@/runtime/persistence/drafts"
import { base64Encode } from "@opencode/util/encode"

// These cases own asynchronous source/session handoff, not timeline rendering. They keep the
// production composer, SDK registration, media cache, fork and revert algorithms intact.
const [route, setRoute] = createStore({ id: "ses_a", serverKey: "", directory: "/fixture/a" })
const states = new Map<string, ComposerState>()
const navigations: string[] = []
const remembered: string[] = []
const activeMessages: Array<string | undefined> = []
const toasts: Array<{ actions?: Array<{ onClick: () => void }> }> = []
const requests: Array<{ source: string; path: string }> = []
const holds = new Map<string, ReturnType<typeof deferred<Response>>>()
const messages: SessionMessageUser[] = []
// The real sync store publishes new state through signals, so consumers' memos re-read it. The
// fixture is mutable arrays, so a version signal stands in for that publication.
const [fixtureDataVersion, setFixtureDataVersion] = createSignal(0)
let queued = false
let boundary: string | undefined
let currentSdk: ReturnType<typeof import("@/runtime/server/client").createServerSdkContext>
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const transport = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "object" && "url" in input ? input.url : String(input))
  const source = url.origin
  const path = url.pathname
  requests.push({ source, path })
  if (path.includes("/event")) return new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener("abort", () => controller.close(), { once: true })
  } }), { headers: { "content-type": "text/event-stream" } })
  const hold = holds.get(path)
  if (hold) { holds.delete(path); return hold.promise }
  if (path.includes("/media/")) return new Response(new Uint8Array([65]))
  if (path.endsWith("/fork")) return Response.json({ data: { id: "ses_forked" } })
  if (path.endsWith("/wait") || path.endsWith("/cancel")) return new Response(null, { status: 204 })
  return Response.json({ data: {} })
}, { preconnect: globalThis.fetch.preconnect })
const data = { session: {
  get: () => { fixtureDataVersion(); return { revert: boundary ? { messageID: boundary } : undefined, location: { directory: route.directory } } },
  status: () => { fixtureDataVersion(); return "idle" },
  message: { list: () => { fixtureDataVersion(); return [...messages] }, get: (_sessionID: string, id: string) => {
    fixtureDataVersion()
    return messages.find((message) => message.id === id)
  } },
  input: { has: () => { fixtureDataVersion(); return queued } },
  remember: (session: { id: string }) => remembered.push(session.id),
}, project: { get: () => undefined, list: () => [] } }
mock.module("@/runtime/server/current", () => ({
  useServer: () => ({ get key() { return ServerConnection.key(currentSdk.server) }, ctx: { get sdk() { return currentSdk }, sync: { data: { project: [] } } } }),
  useData: () => data,
}))
mock.module("@/runtime/platform/platform", () => ({ usePlatform: () => ({ platform: "web", fetch: transport }) }))
mock.module("@solidjs/router", () => ({
  useParams: () => route, useSearchParams: () => [{}, () => {}],
  useNavigate: () => (path: string) => navigations.push(path),
}))
mock.module("@/workspaces/location", () => ({ useWorkspaceLocation: () => () => ({ directory: route.directory }) }))
mock.module("@/shell/tabs/tabs", () => ({ useTabs: () => ({
  store: [], state: (tab: { server?: string; sessionId?: string }, _key: string, factory: () => ComposerState) => {
    const key = `${tab.server}:${tab.sessionId}`
    if (!states.has(key)) states.set(key, factory())
    return states.get(key)!
  },
}) }))
mock.module("./session-layout", () => ({ useSessionLayout: () => ({
  params: route, sessionKey: () => `${route.serverKey}:${route.id}`,
  workspaceKey: () => route.directory, tabs: {}, view: {}, tabKey: () => route.id,
}) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
mock.module("@/shell/notifications/toast", () => ({ showToast: (toast: typeof toasts[number]) => { toasts.push(toast) } }))
const { createServerSdkContext } = await import("@/runtime/server/client")
const { ComposerPersistenceProvider, useComposerState } = await import("@/composer/persistence")
const { useSessionModel } = await import("./model")
const { useSessionFork } = await import("./fork")
const { createSessionRevert } = await import("./revert")
const disposers: Array<() => void> = []
afterEach(() => {
  disposers.splice(0).reverse().forEach((dispose) => dispose())
  states.clear(); messages.splice(0); requests.splice(0); navigations.splice(0)
  remembered.splice(0); activeMessages.splice(0); toasts.splice(0); holds.clear()
  queued = false; boundary = undefined; localStorage.clear()
})
// Each fixture message uses its own media hash: the draft store's media aliases and retained blobs
// are process-global, so a reused hash would let a later test resolve bytes from an earlier one.
let mediaSerial = 0
let hash = "7".repeat(64)
function mount(source = "a") {
  let result!: { prompt: ReturnType<typeof useComposerState>; fork: ReturnType<typeof useSessionFork>; revert: ReturnType<typeof createSessionRevert> }
  createRoot((dispose) => {
    disposers.push(dispose)
    const server: ServerConnection.Http = { type: "http", http: { url: `https://${source}.fixture.example` } }
    currentSdk = createServerSdkContext(server, ServerScope.fromServerKey(ServerConnection.key(server)))
    setRoute({ id: `ses_${source}`, serverKey: base64Encode(ServerConnection.key(server)), directory: `/fixture/${source}` })
    createComponent(ComposerPersistenceProvider, { get children() {
      const prompt = useComposerState()
      const session = useSessionModel()
      result = { prompt, fork: useSessionFork(), revert: createSessionRevert({ session,
        setActiveMessage: (message) => activeMessages.push(message?.id),
      }) }
      return null
    } })
  })
  result.prompt.capture().set([{ type: "text", content: `draft-${source}`, start: 0, end: 7 }])
  return result
}
function mediaMessage() {
  hash = "7".repeat(62) + (mediaSerial++).toString(16).padStart(2, "0")
  const message: SessionMessageUser = { type: "user", id: "msg_media", text: "fixture", time: { created: 0 }, files: [
    { uri: `media:${hash}`, mime: "image/png", source: { type: "inline" } },
    { uri: "file:///fixture/context.ts", mime: "text/plain", source: { type: "uri", uri: "file:///fixture/context.ts" } },
  ] }
  messages.push(message)
  setFixtureDataVersion((version) => version + 1)
  return message
}
function hold(path: string) {
  const value = deferred<Response>()
  holds.set(path, value)
  return value
}
async function started(path: string) {
  for (let turn = 0; turn < 100; turn++) {
    if (requests.some((request) => request.path === path)) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Synthetic request never started: ${path}`)
}
function snapshot(value: ReturnType<typeof mount>) {
  return JSON.stringify({ prompt: value.prompt.capture().current(), context: value.prompt.capture().context.items(),
    history: messages, navigations, remembered, activeMessages })
}

test.each(["pin", "fork"] as const)("SF-1: switch source while awaiting %s does not publish a stale fork", async (phase) => {
  const a = mount()
  mediaMessage()
  const path = phase === "pin" ? `/api/experimental/media/${hash}` : "/api/session/ses_a/fork"
  const pending = hold(path)
  const operation = a.fork({ sessionID: "ses_a", messageID: "msg_media" })
  await started(path)
  const b = mount("b")
  const before = snapshot(b)
  pending.resolve(phase === "pin" ? new Response(new Uint8Array([65])) : Response.json({ data: { id: "ses_old" } }))
  expect(await operation).toBe(false)
  expect(snapshot(b)).toBe(before)
  expect(requests.filter((request) => !request.path.includes("/event")).every((request) => request.source === "https://a.fixture.example")).toBe(true)
  expect(requests.some((request) => /delete|stop|cancel/.test(request.path))).toBe(false)
})

test("SF-2: same-key replacement invalidates old fork without unregistering successor", async () => {
  const a = mount(); mediaMessage()
  const pending = hold("/api/session/ses_a/fork")
  const operation = a.fork({ sessionID: "ses_a", messageID: "msg_media" })
  await started("/api/session/ses_a/fork")
  const next = mount()
  const before = snapshot(next)
  pending.resolve(Response.json({ data: { id: "ses_old" } }))
  expect(await operation).toBe(false)
  expect(snapshot(next)).toBe(before)
  disposers.shift()!()
  expect(await resolveBlobUrl({ id: `media:${"8".repeat(64)}`, sourceServerKey: "https://a.fixture.example" })).toStartWith("blob:")
})

test("SF-3/SR-4: pin rejection keeps queue and draft intact and never probes B", async () => {
  const a = mount(); const message = mediaMessage(); queued = true
  const pending = hold(`/api/experimental/media/${hash}`)
  const before = snapshot(a)
  const operation = a.fork({ sessionID: "ses_a", messageID: message.id })
  await started(`/api/experimental/media/${hash}`)
  pending.resolve(new Response(null, { status: 403 }))
  expect(await operation).toBe(false)
  const retry = hold(`/api/experimental/media/${hash}`)
  const recall = a.revert.to(message.id)
  await new Promise((resolve) => setTimeout(resolve, 0))
  retry.resolve(new Response(null, { status: 404 }))
  await recall
  expect(snapshot(a)).toBe(before)
  expect(queued).toBe(true)
  expect(requests.filter((request) => !request.path.includes("/event")).every((request) => request.path.includes("/media/") && request.source === "https://a.fixture.example")).toBe(true)
})

test("SR-1: queued revert waiting for pin cannot cancel or restore after source switch", async () => {
  const a = mount(); const message = mediaMessage(); queued = true
  const pending = hold(`/api/experimental/media/${hash}`)
  const operation = a.revert.to(message.id)
  await started(`/api/experimental/media/${hash}`)
  const b = mount("b"); const before = snapshot(b)
  pending.resolve(new Response(new Uint8Array([65])))
  await operation
  expect(snapshot(b)).toBe(before)
  expect(requests.some((request) => request.path.includes("/cancel"))).toBe(false)
})

test.each(["cancel", "stage", "clear"] as const)("SR-2: already dispatched %s stays on A and late response cannot restore B", async (phase) => {
  const a = mount(); const message = mediaMessage()
  queued = phase === "cancel"
  boundary = phase === "clear" ? message.id : undefined
  setFixtureDataVersion((version) => version + 1)
  // The generated client stages POST /revert/stage, clears DELETE /revert and cancels DELETE /inbox/{id}.
  const path = phase === "cancel"
    ? `/api/session/ses_a/inbox/${message.id}`
    : `/api/session/ses_a/revert${phase === "clear" ? "" : "/stage"}`

  const pending = hold(path)
  const operation = phase === "clear" ? a.revert.redo() : a.revert.to(message.id)
  await started(path)
  const b = mount("b"); const before = snapshot(b)
  pending.resolve(phase === "cancel" ? new Response(null, { status: 204 }) : Response.json({ data: {} }))
  await operation
  toasts.flatMap((toast) => toast.actions ?? []).forEach((action) => action.onClick())
  expect(snapshot(b)).toBe(before)
  expect(requests.filter((request) => request.path === path).map((request) => request.source)).toEqual(["https://a.fixture.example"])
})

test.each(["pin", "cancel"] as const)("SR-3: same-key new generation during %s suppresses old continuation", async (phase) => {
  const a = mount(); const message = mediaMessage(); queued = true
  const path = phase === "pin" ? `/api/experimental/media/${hash}` : `/api/session/ses_a/inbox/${message.id}`
  const pending = hold(path)
  const operation = a.revert.to(message.id)
  await started(path)
  const next = mount(); const before = snapshot(next)
  pending.resolve(phase === "pin" ? new Response(new Uint8Array([65])) : new Response(null, { status: 204 }))
  await operation
  expect(snapshot(next)).toBe(before)
  expect(requests.filter((request) => request.path === `/api/session/ses_a/inbox/${message.id}`)).toHaveLength(phase === "pin" ? 0 : 1)
})

test("SF-4/SR-5: fork and recall/revert/undo/redo retain local media and source; stale toast cannot mutate", async () => {
  const a = mount(); const message = mediaMessage()
  expect(await a.fork({ sessionID: "ses_a", messageID: message.id })).toBe(true)
  const forked = states.get("https://a.fixture.example:ses_forked")!
  expect(forked).toBeDefined()
  const image = forked.current().find((part) => part.type === "image")!
  expect(image.blob.sourceServerKey).toBe("https://a.fixture.example")
  expect(await blobDataUrl(image.blob, image.mime)).toBe("data:image/png;base64,QQ==")
  await a.revert.recall(message)
  expect(a.prompt.capture().context.items()).toHaveLength(1)
  const before = JSON.stringify(a.prompt.capture().current())
  await a.revert.undo()
  const undo = toasts.at(-1)!.actions![0]!
  undo.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(JSON.stringify(a.prompt.capture().current())).toBe(before)
  boundary = message.id
  setFixtureDataVersion((version) => version + 1)
  await a.revert.redo()
  const b = mount("b"); const unchanged = snapshot(b)
  const count = requests.length
  undo.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(snapshot(b)).toBe(unchanged)
  expect(requests).toHaveLength(count)
  expect(await resolveBlobUrl({ id: `media:${hash}` })).toBeUndefined()
})

test("rejects work captured by a previous session", () => {
  createRoot((dispose) => {
    const [key, setKey] = createSignal("session-a")
    const ownership = createSessionOwnership(key)
    const captured = ownership.capture()
    let ran = false

    setKey("session-b")

    expect(captured.current()).toBe(false)
    expect(captured.run(() => (ran = true))).toBeUndefined()
    expect(ran).toBe(false)
    dispose()
  })
})
