import { createMemo, Show } from "solid-js"
import { turnMessages, turnSources } from "@opencode/session-ui/sources"
import { sourcesExperiment } from "@opencode/session-ui/sources/experiment"
import { SourcesPanel } from "@opencode/session-ui/sources/panel"
import { useExtension, type MountedSession } from "../sdk"
import type Sources from "./index"

export default function SourcesTab(props: { session: MountedSession; from: string }) {
  const ctx = useExtension<typeof Sources>()

  // mobile(M-036): on the narrow-screen mobile view the render receives the panel's id instead of a
  // message id, so the tab shows the most recent turn that has sources, else the empty state. The
  // chip path below (a message id from `list`) is the wide-layout entry (registered delta; see
  // units/gui-extensions.md).
  const sources = createMemo(() => {
    const list = props.session.server.data.session.message.list(props.session.id)

    if (props.from !== "turn") return turnSources(turnMessages(list, props.from))

    for (let index = list.length - 1; index >= 0; index--) {
      const message = list[index]

      if (message.type !== "user") continue

      const value = turnSources(turnMessages(list, message.id))

      if (value.steps.length > 0) return value
    }

    return { steps: [], sources: [] }
  })

  const open = (url: string) => {
    const pane = ctx.uses.browser()

    if (pane.status === "active" && pane.value.canOpen(props.session)) return pane.value.open(props.session, url)
    ctx.system.openExternal(url)
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-v2-background-bg-base" data-slot="session-sources-panel">
      <Show
        when={sources().steps.length > 0}
        fallback={<div class="flex h-full items-center justify-center p-4 text-v2-text-text-muted">{ctx.t("panel.none")}</div>}
      >
        <div class="min-h-0 flex-1 overflow-y-auto" data-scrollable>
          <SourcesPanel sources={sources()} icons={sourcesExperiment.icons} onOpen={open} />
        </div>
      </Show>
    </div>
  )
}
