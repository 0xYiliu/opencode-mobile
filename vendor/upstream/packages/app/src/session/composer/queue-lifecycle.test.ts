import { afterEach, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { SessionInboxInfo } from "@opencode/client/promise"
import type { ComposerDelivery } from "@/composer/adapter"
import { createMemoryComposerState, type Prompt } from "@/composer/state"
import { setMediaBlobLoader } from "@/runtime/persistence/drafts"
import { ServerConnection } from "@/runtime/server/registry"

// These cases own the queue lifecycle handoff windows the #188 review round locked down: an owner
// break (unmount or connection/composer loss) must never abandon the committed phase of a mutation
// (duplicate remote delivery), must never suppress a terminal machine report (the machine's
// disposed-return contract restores the content), and must always leave the machine settled. They
// keep the production machine, drafts and queue algorithms intact; the server/context edges are
// mocked at the module seams the queue reads.

const fixture = {
  inbox: [] as SessionInboxInfo[],
  owner: () => true,
  calls: [] as string[],
  prompts: [] as { id?: string; text: string }[],
  gates: new Map<string, PromiseWithResolvers<void>>(),
}

const data = {
  session: {
    get: () => undefined,
    pending: {
      list: () => fixture.inbox,
      sync: async () => undefined,
      invalidate: () => undefined,
    },
    prompt: (input: { id?: string; text: string; prepare?: () => Promise<unknown> }) => {
      // Like the real client: the native prepare hook runs BEFORE the request is recorded or sent,
      // so an admission refused by prepare never appears as a sent prompt.
      const gate = fixture.gates.get("prompt")

      return (async () => {
        await input.prepare?.()
        fixture.calls.push(`prompt:${input.id ?? "?"}`)
        fixture.prompts.push({ id: input.id, text: input.text })

        if (gate) await gate.promise

        return undefined
      })()
    },
  },
}

const server = {
  server: { type: "http" as const, http: { url: "https://queue-lifecycle.fixture.example" } },
  http: { url: "https://queue-lifecycle.fixture.example" },
  api: {
    session: {
      inbox: {
        list: async () => {
          fixture.calls.push("list")

          return fixture.inbox
        },
        cancel: async (input: { inboxID: string }) => {
          fixture.calls.push(`cancel:${input.inboxID}`)
          const gate = fixture.gates.get("cancel")

          return gate ? ((await gate.promise), undefined) : undefined
        },
        update: async (input: { inboxID: string; delivery: string }) => {
          fixture.calls.push(`update:${input.inboxID}:${input.delivery}`)
          const gate = fixture.gates.get("update")

          return gate ? ((await gate.promise), undefined) : undefined
        },
      },
    },
  },
}

mock.module("@/runtime/server/current", () => ({ useData: () => data }))
mock.module("@/runtime/server/client", () => ({ useServerSDK: () => server }))
mock.module("@/workspaces/location", () => ({ useWorkspaceLocation: () => () => ({ directory: "/repo" }) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
mock.module("@/shell/notifications/toast", () => ({ showToast: () => undefined }))
mock.module("@/composer/persistence", () => ({ useComposerState: () => ({ captureOwner: () => () => fixture.owner() }) }))

const { createSessionQueue } = await import("./queue")

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const queuedItem = (id: string, text: string): SessionInboxInfo =>
  ({
    id,
    sessionID: "ses_lifecycle",
    time: { created: 1 },
    type: "user",
    delivery: "queue",
    payload: { text },
  }) as SessionInboxInfo

function mount(text = "queued body") {
  fixture.calls.length = 0
  fixture.prompts.length = 0
  fixture.gates.clear()
  fixture.owner = () => true
  fixture.inbox = [queuedItem("msg_original", text)]

  // The production server SDK registers the per-server draft loader (client.tsx); the harness
  // mirrors that so the captured media lease is live.
  const serverKey = ServerConnection.key({ type: "http", http: { url: "https://queue-lifecycle.fixture.example" } })
  const unregister = setMediaBlobLoader(serverKey, async () => undefined)

  const composer = createMemoryComposerState({ prompt: "draft" }).capture()
  // The composer writes record what the machine's draft effects actually published, in order.
  const sets: string[] = []
  const write = (prompt: { type: string; content?: string }[]) =>
    prompt.map((part) => (part.type === "text" ? part.content ?? "" : part.type)).join("|")
  // The captured value's `set` is readonly-typed; the recorder installs through a mutable view.
  const writer = composer as { set: (prompt: Prompt, cursor?: number) => void }
  const rawSet = writer.set.bind(composer)
  writer.set = (prompt, cursor) => {
    sets.push(write(prompt as { type: string; content?: string }[]))
    rawSet(prompt, cursor)
  }

  let queue!: ReturnType<typeof createSessionQueue>
  let dispose!: () => void
  createRoot((root) => {
    dispose = root
    queue = createSessionQueue({
      sessionID: "ses_lifecycle",
      draft: composer,
      working: () => false,
      behavior: () => "queue" as ComposerDelivery,
      restoreFocus: () => undefined,
      background: () => ({ move: () => Promise.resolve() }),
    })
  })

  return {
    composer,
    dispose: () => {
      dispose()
      unregister()
    },
    queue,
    sets,
  }
}

afterEach(() => {
  fixture.gates.clear()
})

test("R1: unmount while a steered edit admission is in flight still cancels the original (no duplicate delivery)", async () => {
  const { composer, dispose, queue, sets } = mount()
  expect(queue.edit("msg_original")).toBe(true)
  await flush()
  expect(sets).toEqual(["queued body"])

  // The prompt must differ from the queued item, or the machine steers it in place instead of
  // re-admitting it as an edit.
  composer.set([{ type: "text", content: "queued body v2", start: 0, end: 14 }], 14)

  // The admission is parked mid-flight; the unmount lands while it is outstanding.
  const gate = Promise.withResolvers<void>()
  fixture.gates.set("prompt", gate)
  queue.confirmEdit("steer")
  await flush()
  expect(fixture.prompts).toHaveLength(1)
  expect(fixture.prompts[0]!.text).toBe("queued body v2")

  dispose()
  gate.resolve()
  await flush()
  await flush()

  // The committed phase ran ungated: the original's cancel went out, so the steered replacement
  // cannot be delivered twice; and the admitted edit is not merged back into the composer. The
  // writes are: the edit's draft.load, the manual text change, the confirm-time optimistic restore
  // of the pre-edit draft — nothing lands after the unmount+admission.
  expect(fixture.calls).toContain("cancel:msg_original")
  expect(sets).toEqual(["queued body", "queued body v2", "draft"])
})

test("R2: unmount during an undo's cancel round-trip still merges the prompt back (disposed return)", async () => {
  const { composer, dispose, queue, sets } = mount("undo me")
  const gate = Promise.withResolvers<void>()
  fixture.gates.set("cancel", gate)
  queue.undo("msg_original")
  await flush()

  // The cancel is parked mid-flight; the unmount lands while the server may still apply it.
  dispose()
  expect(composer.current().some((part) => part.type === "text" && part.content === "undo me")).toBe(false)
  gate.resolve()
  await flush()
  await flush()

  // The late mutation.undone reaches the disposed machine and merges the content back.
  expect(composer.current().some((part) => part.type === "text" && part.content === "undo me")).toBe(true)
  expect(sets.at(-1)).toContain("undo me")
})

test("R3: unmount during an edit admission that then fails still restores the edited text", async () => {
  const { composer, dispose, queue, sets } = mount("queued body")
  queue.edit("msg_original")
  await flush()
  composer.set([{ type: "text", content: "queued body v2", start: 0, end: 14 }], 14)
  const gate = Promise.withResolvers<void>()
  fixture.gates.set("prompt", gate)
  queue.confirmEdit("steer")
  await flush()
  expect(fixture.prompts.at(-1)?.text).toBe("queued body v2")

  dispose()
  gate.reject(new Error("admission failed"))
  await flush()
  await flush()

  // The late mutation.failed reaches the disposed machine and merges the stashed edit back. The
  // writes before it: the edit's draft.load, the manual text change, the confirm-time optimistic
  // restore of the pre-edit draft — the LAST write is the disposed-return merge carrying the edit.
  expect(sets.at(-1)).toContain("queued body v2")
  expect(sets).not.toEqual(["queued body", "queued body v2"])
  expect(composer.current().some((part) => part.type === "text" && part.content === "queued body v2")).toBe(true)
})

test("R4: an owner break without unmount still settles the machine (steer)", async () => {
  const { dispose, queue } = mount()
  const gate = Promise.withResolvers<void>()
  fixture.gates.set("update", gate)
  queue.steer("msg_original")
  await flush()
  expect(queue.busy()).toBe(true)

  fixture.owner = () => false
  gate.resolve()
  await flush()
  await flush()

  expect(queue.busy()).toBe(false)
  dispose()
})

test("R5: an owner break between rewrite re-admissions withdraws what was sent and settles", async () => {
  fixture.calls.length = 0
  fixture.prompts.length = 0
  fixture.gates.clear()
  fixture.owner = () => true
  fixture.inbox = [queuedItem("msg_a", "first body"), queuedItem("msg_b", "second body")]

  // Mirrors the production per-server draft loader registration (see mount()).
  const serverKey = ServerConnection.key({ type: "http", http: { url: "https://queue-lifecycle.fixture.example" } })
  const unregister = setMediaBlobLoader(serverKey, async () => undefined)

  const composer = createMemoryComposerState({ prompt: "draft" }).capture()
  const sets: string[] = []
  const writer = composer as { set: (prompt: Prompt, cursor?: number) => void }
  const rawSet = writer.set.bind(composer)
  writer.set = (prompt, cursor) => {
    sets.push((prompt as { type: string; content?: string }[]).map((part) => (part.type === "text" ? part.content ?? "" : part.type)).join("|"))
    rawSet(prompt, cursor)
  }

  let queue!: ReturnType<typeof createSessionQueue>
  let dispose!: () => void
  createRoot((root) => {
    dispose = root
    queue = createSessionQueue({
      sessionID: "ses_lifecycle",
      draft: composer,
      working: () => false,
      behavior: () => "queue" as ComposerDelivery,
      restoreFocus: () => undefined,
      background: () => ({ move: () => Promise.resolve() }),
    })
  })

  queue.edit("msg_a")
  await flush()
  composer.set([{ type: "text", content: "first body v2", start: 0, end: 13 }], 13)
  const gate = Promise.withResolvers<void>()
  fixture.gates.set("prompt", gate)
  queue.confirmEdit("queue")
  await flush()
  expect(fixture.prompts).toHaveLength(1)
  expect(fixture.prompts[0]!.text).toBe("first body v2")

  // The first re-admission went out and resolved; break the owner before the second admission's
  // prepare runs.
  fixture.owner = () => false
  gate.resolve()
  await flush()
  await flush()

  const replacement = fixture.prompts[0]!.id
  expect(replacement).toBeDefined()
  // Only one admission was sent; its copy is withdrawn and the originals stay queued (no
  // duplicate, no content loss), and the machine settles.
  expect(fixture.prompts).toHaveLength(1)
  expect(fixture.calls).toContain(`cancel:${replacement}`)
  expect(fixture.calls).not.toContain("cancel:msg_a")
  expect(fixture.calls).not.toContain("cancel:msg_b")
  expect(queue.busy()).toBe(false)
  // The edited text returned through the machine's failed-while-admitting merge.
  expect(sets.at(-1)).toContain("first body v2")
  dispose()
  unregister()
})
