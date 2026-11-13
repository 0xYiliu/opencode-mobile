import { createEffect, createMemo, createRoot, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import type { PromptAttachment } from "@opencode/client/promise"
import { SessionMessage } from "@opencode/schema/session-message"
import type { ComposerDelivery, ComposerSession } from "@/composer/adapter"
import type { ComposerStateTarget } from "@/composer/submission-state"
import type { ImageAttachmentPart, PathAttachmentPart, Prompt } from "@/composer/state"
import { clonePrompt, promptLength } from "@/composer/prompt-parts"
import { buildPromptRequest } from "@/composer/request"
import { type BlobReference, blobDataUrl, captureMediaSource } from "@/runtime/persistence/drafts"
import { pinPromptMedia } from "@/composer/media"
import { extractPromptContext, extractPromptFromMessage } from "@/composer/prompt"
import { useData } from "@/runtime/server/current"
import { useComposerState } from "@/composer/persistence"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import {
  createQueueState,
  editingID,
  isComposerAttachment,
  isPristine,
  mergePrompt,
  QUEUE_MUTATION_TIMEOUT_MS,
  queuedPromptText,
  transitionQueue,
  viewQueue,
  type ActiveOperation,
  type EditOperation,
  type QueueEffect,
  type QueueEvent,
  type QueueMutationStage,
  type QueuedPrompt,
} from "./queue-machine"

// mobile(M-016, issue #188): one mutation attempt's captured ownership. `current` is false once
// the queue unmounted, the composer instance was replaced, the connection rebuilt, or the media
// lease was superseded — any of which invalidates the attempt's remaining publications.
type QueueOwner = {
  composerOwner: () => boolean
  http: ServerConnection.HttpBase
  serverKey: ServerConnection.Key
  media: () => boolean
  sessionID: string
  directory: string
  current: () => boolean
}

export function createSessionQueue(input: {
  sessionID: string
  draft: ComposerStateTarget
  working: Accessor<boolean>
  behavior: Accessor<ComposerDelivery>
  restoreFocus: (cursor: number) => void
  background: NonNullable<ComposerSession["background"]>
}) {
  const data = useData()
  const server = useServerSDK()
  const location = useWorkspaceLocation()
  const language = useLanguage()
  const composer = useComposerState()

  // mobile(M-016, issue #188): every mutation, pin and undo runs on an owner captured when it
  // starts. The owner binds the attempt to the composer instance, the connection and the media
  // lease it started on; once any of those is lost the attempt stops publishing (and its existing
  // abort checkpoints stop it) without ever touching a request already dispatched — the AbortSignal
  // is not wired to any HTTP call, so an owner break cannot cancel a remote prompt (issue #188).
  const sourceServerKey = ServerConnection.key(server.server)
  let active = true
  onCleanup(() => {
    active = false
  })

  const captureOwner = (): QueueOwner => {
    const composerOwner = composer.captureOwner()
    const media = captureMediaSource(sourceServerKey)
    const owner: Omit<QueueOwner, "current"> = {
      composerOwner,
      http: server.http,
      serverKey: sourceServerKey,
      media,
      sessionID: input.sessionID,
      directory: location().directory,
    }

    return Object.assign(owner, {
      // The predicate closes over the captured identity itself.
      current: () => active && composerOwner() && server.http === owner.http && media(),
    })
  }

  const queued = createMemo(() =>
    data.session.pending
      .list(input.sessionID)
      .filter((item): item is QueuedPrompt => item.type === "user" && item.delivery === "queue"),
  )

  const [state, setState] = createSignal(createQueueState(untrack(queued)))
  const view = createMemo(() => viewQueue(state(), { working: input.working(), behavior: input.behavior() }))
  // OS handles for the machine's expiry timers, keyed by its expiry IDs.
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  // The bound on the operation in flight, and each running operation's progress, keyed by attempt.
  let mutationTimer: ReturnType<typeof setTimeout> | undefined
  const runs = new Map<number, MutationProgress>()

  // Effects read and write the composer, so neither the transition nor its effects subscribe the caller.
  const dispatch = (event: QueueEvent) =>
    untrack(() => {
      const next = transitionQueue(state(), event)
      setState(next.state)
      next.effects.forEach(perform)
    })

  const perform = (effect: QueueEffect) => {
    if (effect.type === "draft.load") {
      input.draft.mode.set("normal")
      input.draft.set(effect.prompt, effect.cursor)
      input.restoreFocus(effect.cursor)

      return
    }

    if (effect.type === "draft.restore") {
      const current = input.draft.current()

      const prompt =
        effect.keep && !isPristine(effect.keep, current)
          ? mergePrompt(effect.stash.prompt, current)
          : effect.stash.prompt

      const cursor = prompt === effect.stash.prompt ? effect.stash.cursor : promptLength(prompt)
      // The stashed retry fingerprints its own payload, so a merged prompt sends under a new ID.
      input.draft.mode.set(effect.stash.mode)
      input.draft.set(prompt, cursor)

      if (effect.stash.retry) input.draft.retry.set(effect.stash.retry)

      if (effect.focus) input.restoreFocus(cursor)

      return
    }

    if (effect.type === "draft.pinned") {
      const current = input.draft.current()
      input.draft.set(
        current.map((part) => {
          const blob = part.type === "image" ? effect.blobs.get(part.id) : undefined

          return blob && part.type === "image" ? { ...part, blob } : part
        }),
        input.draft.cursor() ?? promptLength(current),
      )

      return
    }

    if (effect.type === "draft.merge") {
      const prompt = mergePrompt(input.draft.current(), effect.prompt)
      input.draft.set(prompt, promptLength(prompt))
      effect.context.forEach((item) => input.draft.context.add(item))

      if (effect.focus !== false) input.restoreFocus(promptLength(prompt))

      return
    }

    if (effect.type === "media.pin") {
      // Images the user removed meanwhile stay removed; a pin for a row no longer open is rejected by the machine.
      // The pin loads on the queue's own server lease (issue #188): a lost owner rejects the machine attempt
      // (unchanged) and leaves the edit draft's unresolved refs alone.
      const owner = captureOwner()
      void pinPromptMedia(sourcedAttachments([...effect.attachments], sourceServerKey), owner.current).then(
        (pinned) => {
          if (!owner.current()) return
          dispatch({
            type: "edit.mediaPinned",
            attempt: effect.attempt,
            blobs: new Map(
              pinned.flatMap((part): [string, BlobReference][] =>
                part.type === "image" ? [[part.id, part.blob]] : [],
              ),
            ),
          })
        },
        () => undefined,
      )

      return
    }

    if (effect.type === "mutation.run") {
      const attempt = effect.operation.attempt
      const progress: MutationProgress = {
        controller: new AbortController(),
        hidden: [],
        stage: "running",
        owner: captureOwner(),
      }
      runs.set(attempt, progress)
      // mobile(M-016, issue #188): an owner break aborts the attempt exactly like the machine's
      // mutation.abort does. The signal is never wired to an HTTP call, so this cannot cancel a
      // request already dispatched; the run's existing throwIfAborted checkpoints absorb the break.
      const stopWatching = createRoot((dispose) => {
        createEffect(() => {
          if (!progress.owner.current()) runs.get(attempt)?.controller.abort()
        })

        return dispose
      })

      return void run(effect.operation, progress).finally(() => {
        runs.delete(attempt)
        stopWatching()
      })
    }

    if (effect.type === "mutation.abort") return runs.get(effect.attempt)?.controller.abort()

    if (effect.type === "mutation.timer.start") {
      clearTimeout(mutationTimer)
      mutationTimer = setTimeout(() => {
        const progress = runs.get(effect.attempt)

        dispatch({
          type: "mutation.timed-out",
          attempt: effect.attempt,
          hidden: progress ? [...progress.hidden] : [],
          stage: progress?.stage ?? "running",
        })
      }, QUEUE_MUTATION_TIMEOUT_MS)

      return
    }

    if (effect.type === "mutation.timer.clear") {
      clearTimeout(mutationTimer)
      mutationTimer = undefined

      return
    }

    if (effect.type === "timer.start") {
      timers.set(
        effect.expiry,
        setTimeout(() => {
          timers.delete(effect.expiry)
          dispatch({ type: "gone.expired", expiry: effect.expiry })
        }, 30_000),
      )

      return
    }

    if (effect.type === "timer.clear") {
      clearTimeout(timers.get(effect.expiry))
      timers.delete(effect.expiry)

      return
    }

    if (effect.type === "timer.clearAll") {
      timers.forEach(clearTimeout)
      timers.clear()
      clearTimeout(mutationTimer)
      mutationTimer = undefined

      return
    }

    showToast({ title: language.t(effect.key) })
  }

  // Runs the operation in flight and reports its progress. Each report carries the operation's attempt, so the machine
  // ignores one that arrives after the operation stopped being current. Every publication is gated on the attempt's
  // owner (issue #188): a result that lands after the composer, connection or media lease was lost is dropped, and
  // the machine's timeout cleans the attempt up.
  const run = async (operation: ActiveOperation, progress: MutationProgress) => {
    const attempt = operation.attempt
    const owner = progress.owner
    const current = () => owner.current()

    // SSE retracts and updates materialized timeline messages for a steer or removal, so neither re-syncs the queue.
    if (operation.type === "steer") {
      const background = input.background()

      return server.api.session.inbox
        .update({ sessionID: input.sessionID, inboxID: operation.id, delivery: "steer" })
        .then(
          () => {
            if (!current()) return
            void background?.move()
            dispatch({ type: "mutation.succeeded", attempt })
          },
          () => {
            if (current()) dispatch({ type: "mutation.failed", attempt, hidden: [] })
          },
        )
    }

    if (operation.type === "remove")
      return server.api.session.inbox.cancel({ sessionID: input.sessionID, inboxID: operation.id }).then(
        () => {
          if (!current()) return
          dispatch({ type: "mutation.succeeded", attempt })
        },
        () => {
          if (current()) dispatch({ type: "mutation.failed", attempt, hidden: [] })
        },
      )

    if (operation.type === "undo") {
      const source = { id: operation.item.id, ...operation.item.payload }
      const context = extractPromptContext(source, { directory: location().directory })

      await undoQueuedPrompt({
        prompt: extractPromptFromMessage(source, {
          directory: location().directory,
          sourceServerKey,
          attachmentName: language.t("common.attachment"),
          sessionTitle: (id) => data.session.get(id)?.title,
        }),
        sourceServerKey,
        signal: progress.controller.signal,
        cancelInboxItem: () => {
          progress.stage = "committed"

          return server.api.session.inbox.cancel({ sessionID: input.sessionID, inboxID: operation.item.id })
        },
      }).then(
        (prompt) => {
          if (!current()) return
          dispatch({ type: "mutation.undone", attempt, prompt, context: [...context.comments, ...context.files] })
        },
        () => {
          if (current()) dispatch({ type: "mutation.failed", attempt, hidden: [] })
        },
      )
      if (current()) await data.session.pending.sync(input.sessionID).catch(() => undefined)

      return
    }

    const settled = await (
      operation.type === "reorder" ? rewrite(attempt, progress, [...operation.inboxIDs]) : sendEdit(operation, progress)
    ).then(
      () => true,
      () => false,
    )

    if (!current()) return

    if (settled) progress.stage = "settled"

    if (operation.type === "reorder") data.session.pending.invalidate(input.sessionID)
    // The rows keep their optimistic state until the server's queue has caught up.
    await data.session.pending.sync(input.sessionID).catch(() => undefined)
    if (!current()) return
    dispatch(
      settled ? { type: "mutation.succeeded", attempt } : { type: "mutation.failed", attempt, hidden: progress.hidden },
    )
  }

  const sendEdit = async (operation: EditOperation & { attempt: number }, progress: MutationProgress) => {
    const signal = progress.controller.signal
    const owner = progress.owner
    const current = () => owner.current()

    const replacement = await editedPromptInput(
      input.sessionID,
      location().directory,
      operation.item,
      operation.prompt,
      operation.raw,
    )
    if (!current()) throw new DOMException("", "AbortError")

    // Admit before cancelling so a failed replacement never discards the original. A queued edit rebuilds its position
    // in one rewrite, which leaves the queue unchanged if any admission fails.
    const admission = { ...replacement, id: operation.moved[operation.original], delivery: operation.delivery }

    if (operation.delivery === "queue")
      return rewrite(operation.attempt, progress, undefined, {
        original: operation.original,
        admission: { ...admission, resume: false },
        moved: operation.moved,
      })

    signal.throwIfAborted()
    // Like a queued edit, an original the server delivered meanwhile keeps the edit draft instead of sending twice.
    const pending = await server.api.session.inbox.list({ sessionID: input.sessionID })
    if (!current()) throw new DOMException("", "AbortError")

    if (!pending.some((item) => item.id === operation.original && item.type === "user" && item.delivery === "queue"))
      throw new Error("Queued prompt was delivered before the edit")
    signal.throwIfAborted()
    const background = input.background()
    // A steered replacement can be delivered before a withdrawal reaches it, so the bound waits for the admission and
    // the edit returns to the composer only if it really did not go out.
    progress.stage = "committed"
    // The client's native prepare hook re-checks ownership just before the request goes out, so a
    // lost owner never admits a new remote prompt (issue #188).
    await data.session.prompt({
      ...admission,
      prepare: async () => {
        if (!current()) throw new DOMException("", "AbortError")
      },
    })
    if (!current()) throw new DOMException("", "AbortError")
    void background?.move()
    dispatch({ type: "mutation.admitted", attempt: operation.attempt })
    // Cancelling is a no-op once the original is gone, so one retry is safe.
    const cancel = () => server.api.session.inbox.cancel({ sessionID: input.sessionID, inboxID: operation.original })
    await cancel().catch(cancel)
    if (!current()) throw new DOMException("", "AbortError")
  }

  // `replace` substitutes an edited prompt for the original at its position in the same rewrite.
  // Without `inboxIDs` the server's current order is kept.
  const rewrite = async (
    attempt: number,
    progress: MutationProgress,
    inboxIDs: string[] | undefined,
    replace?: {
      original: string
      admission: Parameters<typeof data.session.prompt>[0]
      moved: Readonly<Record<string, string>>
    },
  ) => {
    const signal = progress.controller.signal
    const owner = progress.owner
    // `current` below is the queue's filtered row list, so the ownership predicate is `owned`.
    const owned = () => owner.current()
    signal.throwIfAborted()
    const pending = await server.api.session.inbox.list({ sessionID: input.sessionID })
    if (!owned()) throw new DOMException("", "AbortError")
    signal.throwIfAborted()

    if (pending.some((item) => item.delivery === "queue" && item.type !== "user"))
      throw new Error("Queued control items block reordering")
    const current = pending.filter((item): item is QueuedPrompt => item.type === "user" && item.delivery === "queue")
    const ordered = inboxIDs ? inboxIDs.flatMap((id) => current.filter((item) => item.id === id)) : current

    // An edited prompt delivered meanwhile is no longer queued; fail so the edit draft stays.
    if (ordered.length !== current.length || (replace && !current.some((item) => item.id === replace.original)))
      throw new Error("Queued prompts changed before reordering")
    const changed = ordered.findIndex((item, index) => item.id !== current[index]?.id || item.id === replace?.original)

    if (changed < 0) return

    // Existing inbox APIs cannot reorder rows, so replace only the changed suffix. A replacement
    // can fail (its file may be gone), so withdraw the ones already sent to keep the queue intact.
    // Each ID is recorded before sending: the server can admit a prompt whose response then fails.
    const replacements: string[] = []

    const withdraw = () =>
      Promise.all(
        replacements.map((inboxID) =>
          server.api.session.inbox.cancel({ sessionID: input.sessionID, inboxID }).then(
            () => {
              // The hidden record feeds the machine's failure report, so it is a publication (issue #188).
              if (owned()) progress.hidden.push(inboxID)
            },
            () => undefined,
          ),
        ),
      )

    // A rewrite stopped by its bound withdraws what it sent, as a failed one does.
    const stopped = async () => {
      if (!signal.aborted) return
      await withdraw()
      signal.throwIfAborted()
    }

    // An edit's pending rows follow the queue as the server has it now, keeping the IDs minted at confirm.
    const moved = Object.fromEntries(
      ordered.slice(changed).map((item) => [item.id, replace?.moved[item.id] ?? SessionMessage.ID.create()]),
    )

    dispatch({ type: "mutation.moved", attempt, moved })

    for (const item of ordered.slice(changed)) {
      const admission =
        item.id === replace?.original
          ? replace.admission
          : {
              id: moved[item.id],
              sessionID: input.sessionID,
              text: item.payload.text,
              files: item.payload.files?.map((file) => ({
                uri: storedFileUri(file),
                name: file.name,
                description: file.description,
                mention: file.mention,
              })),
              agents: item.payload.agents,
              skills: item.payload.skills,
              metadata: item.payload.metadata,
              delivery: "queue" as const,
              resume: false,
            }

      const id = admission.id ?? SessionMessage.ID.create()

      await stopped()
      if (!owned()) throw new DOMException("", "AbortError")
      replacements.push(id)
      // The native prepare hook re-checks ownership just before each re-admission goes out (issue #188).
      await data
        .session.prompt({
          ...admission,
          id,
          prepare: async () => {
            if (!owned()) throw new DOMException("", "AbortError")
          },
        })
        .catch(async (error) => {
          if (!owned()) throw error
          await withdraw()
          throw error
        })
      if (!owned()) throw new DOMException("", "AbortError")
    }

    await stopped()
    if (!owned()) throw new DOMException("", "AbortError")
    // Every copy is in, so the originals must go, however long that takes, or the queue holds both.
    progress.stage = "committed"

    if (replace) dispatch({ type: "mutation.admitted", attempt })

    // An edit cancels last first: the strip shows each original until it goes, so its copies never
    // show out of order.
    const replaced = current.slice(changed)

    for (const item of replace ? replaced.reverse() : replaced) {
      await server.api.session.inbox.cancel({ sessionID: input.sessionID, inboxID: item.id })
      if (!owned()) throw new DOMException("", "AbortError")
      progress.hidden.push(item.id)
    }
  }

  createEffect(() => {
    const items = queued()
    dispatch({ type: "inbox.synced", items })
  })

  onCleanup(() => dispatch({ type: "dispose" }))

  const reverted = () => !!data.session.get(input.sessionID)?.revert

  const edit = (id: string) => {
    const draft = input.draft.current()

    dispatch({
      type: "edit.start",
      id,
      reverted: reverted(),
      draft: {
        prompt: clonePrompt(draft),
        cursor: input.draft.cursor() ?? promptLength(draft),
        mode: input.draft.mode.current(),
        retry: input.draft.retry.current(),
      },
    })

    return editingID(state()) === id
  }

  return {
    count: () => view().rows.length,
    delivery: () => view().delivery,
    alternate: () => view().alternate,
    editing: () => view().editing,
    confirmEdit: (delivery: ComposerDelivery) =>
      dispatch({
        type: "edit.confirm",
        delivery,
        reverted: reverted(),
        prompt: clonePrompt(input.draft.current()),
        ids: queued().map(() => SessionMessage.ID.create()),
      }),
    cancelEdit: () => dispatch({ type: "edit.cancel" }),
    editFirst: () => {
      const first = view().rows[0]

      if (!first) return false

      return edit(first.id)
    },
    rows: () => view().rows,
    moved: () => view().moved,
    busy: () => view().busy,
    undoing: () => view().undoing,
    working: input.working,
    steer: (id: string) => dispatch({ type: "steer.requested", id }),
    remove: (id: string) => dispatch({ type: "remove.requested", id }),
    undo: (id: string) => dispatch({ type: "undo.requested", id, mode: input.draft.mode.current() }),
    edit,
    reorder: (inboxIDs: string[]) => dispatch({ type: "reorder.requested", inboxIDs, reverted: reverted() }),
  }
}

export type SessionQueue = ReturnType<typeof createSessionQueue>

// What a running operation has done so far: the IDs it withdrew or cancelled, and how far it got.
// mobile(M-016, issue #188): the owner captured at mutation.run binds every publication to the
// composer, connection and media lease the attempt started on.
type MutationProgress = {
  controller: AbortController
  hidden: string[]
  stage: QueueMutationStage
  owner: QueueOwner
}

// The slice of the queue the panel renders and drives. Without `moved`, a replaced row closes and its replacement opens.
export type SessionQueueView = Pick<
  SessionQueue,
  "rows" | "editing" | "working" | "busy" | "steer" | "remove" | "undo" | "edit" | "reorder"
> &
  Partial<Pick<SessionQueue, "moved">>

// Pin `media:<hash>` attachments before cancelling: the cancel releases the item's blob refs and sweeps blobs
// nothing else references, so a pin that fails leaves the item queued.
// An undo stopped while its media loads leaves the item queued.
// mobile(M-016, issue #188): `sourceServerKey` backfills refs that predate per-part provenance —
// the queued items came from this queue's own server, so the attribution is the captured source,
// not a cross-server fallback.
export async function undoQueuedPrompt<A>(input: {
  prompt: Prompt
  sourceServerKey?: string
  signal?: AbortSignal
  cancelInboxItem: () => Promise<A>
}): Promise<Prompt> {
  const signal = input.signal
  const prompt = input.sourceServerKey
    ? input.prompt.map((part) => {
        if (part.type === "image" && !part.blob.sourceServerKey)
          return { ...part, blob: { ...part.blob, sourceServerKey: input.sourceServerKey } }
        if (part.type === "file" && !part.sourceServerKey) return { ...part, sourceServerKey: input.sourceServerKey }

        return part
      })
    : input.prompt
  let pinned: Prompt
  try {
    pinned = await pinPromptMedia(prompt, signal && (() => !signal.aborted))
  } catch (error) {
    // A stop that lands mid-load reads as the signal's abort, not a missing attachment: the caller
    // stopped the undo, so the item stays queued exactly as an explicit abort does.
    if (signal?.aborted) throw new DOMException("", "AbortError")
    throw error
  }
  signal?.throwIfAborted()
  await input.cancelInboxItem()

  return pinned
}

// mobile(M-016, issue #188): the machine's `queuedPromptAttachments` is source-neutral (the machine
// keeps its upstream shape), so the queue attributes each image ref with the server the queue is
// bound to before a pin loads the bytes. Data URLs are unaffected: `createLegacyBlobReference`
// keeps them byte-exact.
function sourcedAttachments(attachments: readonly (ImageAttachmentPart | PathAttachmentPart)[], sourceServerKey: string) {
  return attachments.map((part) =>
    part.type === "image" && !part.blob.sourceServerKey ? { ...part, blob: { ...part.blob, sourceServerKey } } : part,
  )
}

// A stored file re-admits by the URI it came from, as the TUI does, so a file:// reference keeps its
// provenance (review comment files stay recognizable) instead of turning into an inline snapshot.
function storedFileUri(file: PromptAttachment) {
  const source = file.source

  return source?.type === "uri" ? source.uri : "uri" in file ? file.uri : `data:${file.mime};base64,${file.data}`
}

// Confirming an edit submits the current composer content as the replacement:
// mentions and attachments are parsed like a normal submission, so removed
// attachments drop and added ones join. Stored file mentions and context files
// the composer cannot show are preserved, and the review-comment notes appended
// to the original's model-visible text survive. Ambient composer context (open
// review comments) stays out: it belongs to the next fresh prompt, not to a
// queued edit.
async function editedPromptInput(
  sessionID: string,
  directory: string,
  item: QueuedPrompt | undefined,
  prompt: Prompt,
  text: string,
) {
  const images = await Promise.all(
    prompt
      .filter((part): part is ImageAttachmentPart => part.type === "image")
      .map(async (part) => ({ ...part, dataUrl: await blobDataUrl(part.blob, part.mime) })),
  )

  const request = buildPromptRequest({ prompt, context: [], images, text, sessionDirectory: directory })
  const payload = item?.payload
  const display = item ? queuedPromptText(item) : ""
  const notes = payload && display && payload.text.startsWith(display) ? payload.text.slice(display.length) : ""

  const mention = (value: { start: number; end: number; text: string } | undefined) => {
    if (!value) return undefined
    const start = text.indexOf(value.text)

    if (start < 0) return undefined

    return { text: value.text, start, end: start + value.text.length }
  }

  // Structured mentions degrade to plain text in the editor, so an original
  // agent or skill reference survives the edit as long as its mention text
  // still appears; newly typed structured mentions come from the request.
  const agents = [
    ...(payload?.agents?.filter(
      (agent) =>
        (!agent.mention || text.includes(agent.mention.text)) &&
        !request.agents.some((entry) => entry.name === agent.name),
    ) ?? []),
    ...request.agents,
  ]

  const skills = [
    ...(payload?.skills?.filter(
      (skill) =>
        (!skill.mention || text.includes(skill.mention.text)) && !request.skills.some((entry) => entry.id === skill.id),
    ) ?? []),
    ...request.skills,
  ]

  return {
    sessionID,
    text: request.text + notes,
    files: [
      // A stored file whose mention the edit deleted is dropped; unmentioned context stays.
      ...(payload?.files
        ?.filter(
          (file) =>
            !isComposerAttachment(file) &&
            (!file.mention || text.includes(file.mention.text)) &&
            !request.files.some((entry) => entry.uri === storedFileUri(file)),
        )
        .map((file) => ({
          uri: storedFileUri(file),
          name: file.name,
          description: file.description,
          mention: mention(file.mention),
        })) ?? []),
      ...request.files.map((file) => ({
        uri: file.uri,
        name: file.name,
        description: file.description,
        mention: file.mention,
      })),
    ],
    agents: agents.map((agent) => ({ name: agent.name, mention: mention(agent.mention) })),
    skills: skills.map((skill) => ({ id: skill.id, mention: mention(skill.mention) })),
    // Presentation metadata reads only with a comments list, which prompts from other clients lack.
    // Comments survive while their notes stay out of the edited text; when the editor showed the
    // notes as text (a prompt with no display text), the edit owns them and the comments go.
    metadata: {
      ...payload?.metadata,
      comments: notes ? (payload?.metadata?.["comments"] ?? []) : [],
      displayText: request.displayText,
      attachments: request.attachments,
    },
  }
}
