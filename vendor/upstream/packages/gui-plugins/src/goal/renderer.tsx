// mobile(M-036): the data layer, the status mapping and the command path are upstream verbatim. The
// presentation is re-shelled from the upstream composer pill (which lives above the composer and
// depends on the gui-plugins pill host) onto the host's Panel — a registered delta (D1; see
// units/gui-plugins.md for the mapping table).
import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, Panel, type MountedSession, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { Goal } from "@opencode/schema/goal"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { showToast } from "@opencode/ui/toast"
import type GoalDefinition from "./index"

const status = {
  active: { label: "title", icon: "outline-steer", tone: undefined },
  paused: { label: "paused", icon: "circle-exclamation", tone: "warning" },
  complete: { label: "met", icon: "circle-check", tone: "success" },
} as const

/**
 * The session's `/goal`: the status as a side-panel tab, headed by the objective with the actions that apply. The
 * server's goal plugin owns the goal and serves it over its RPC; a bare `/goal` shows the last reason.
 */
const setup: Plugin.Setup<typeof GoalDefinition> = (ctx) => {
  // The last goal heard for each server and session. A session switched back to shows it until the refetch lands.
  const [goals, setGoals] = createStore<Record<string, { goal: Goal.State | null }>>({})
  const key = (server: string, sessionID: string) => `${server}\u0000${sessionID}`
  const goal = (session: MountedSession) => goals[key(session.server.id, session.id)]?.goal

  // Subscribes to the routed session's goal: its current value, then every change. It runs again when another session
  // is routed, the session moves, or its server reconnects, since changes published meanwhile were missed.
  createKeyed(
    () => {
      const session = ctx.sessions.current()

      return session?.server.connected ? key(session.server.id, session.id) + `\u0000${session.directory}` : undefined
    },
    () => {
      const session = ctx.sessions.current()

      if (!session) return

      const server = session.server.id
      const rpc = session.server.client.rpc(Goal.Definition)
      const controller = new AbortController()
      // A change that arrives before the snapshot is newer than it.
      const heard = { value: false }
      onCleanup(() => controller.abort())
      onCleanup(
        rpc.events.on(
          "changed",
          (event) => {
            if (event.data.sessionID === session.id) heard.value = true
            setGoals(key(server, event.data.sessionID), { goal: event.data.goal })
          },
          { signal: controller.signal },
        ),
      )
      // A server without the goal plugin answers with an error, and the session shows no goal.
      void rpc
        .get({ sessionID: session.id }, { location: { directory: session.directory }, signal: controller.signal })
        .then(
          (next) => {
            if (!controller.signal.aborted && !heard.value) setGoals(key(server, session.id), { goal: next })
          },
          () => undefined,
        )
    },
  )

  const command = (session: MountedSession, text: "pause" | "resume" | "clear") =>
    void session.server.client.session
      .command({ sessionID: session.id, name: "goal", text })
      .catch((cause: unknown) =>
        showToast({
          variant: "error",
          title: ctx.t("common.requestFailed"),
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      )

  ctx.add(Panel, {
    id: "goal",
    region: "side",
    transient: true,
    // mobile(M-036): the narrow-screen More-drawer entry, after sources (order 60).
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 70,
      kind: "menu",
    },
    // Listed only while the session's goal is loaded and non-null: a server without the goal plugin
    // answers `get` with an error, the swallow above leaves no goal, and the entry does not exist.
    list: (input) => {
      const current = goal(input.session)

      if (!current) return []

      const tab: PanelTab = {
        id: "goal",
        // Present while the goal exists, like the upstream pill; not user-managed.
        pinned: true,
        get title() {
          return ctx.t("title")
        },
        label: (state) => {
          const value = goal(state.session)

          if (!value) return <span>{ctx.t("title")}</span>

          const view = status[value().status]

          return (
            <span class={`flex min-w-0 items-center gap-1.5 ${view.tone ? `text-v2-state-fg-${view.tone}` : ""}`}>
              <Icon name={view.icon} size="small" class="shrink-0" />
              <span class="truncate">{ctx.t(view.label)}</span>
            </span>
          )
        },
      }

      return [tab]
    },
    render: (props) => {
      const run = (text: "pause" | "resume" | "clear") => command(props.session, text)

      return (
        <div class="flex h-full min-h-0 flex-col overflow-y-auto" data-slot="session-goal-panel">
          <Show when={goal(props.session)} fallback={<p class="p-4 text-v2-text-text-muted">{ctx.t("none")}</p>}>
            {(value) => (
              <div class="flex flex-col gap-3 p-4">
                <div class="flex items-start gap-2">
                  <span class={`mt-0.5 shrink-0 ${value().status !== "active" ? `text-v2-state-fg-${status[value().status].tone}` : ""}`}>
                    <Icon name={status[value().status].icon} size="small" />
                  </span>
                  <div class="flex min-w-0 flex-col gap-1">
                    <p class="whitespace-pre-wrap break-words text-v2-text-text-base">{value().objective}</p>
                    <Show when={value().reason}>
                      {(reason) => <p class="whitespace-pre-wrap break-words text-v2-text-text-muted">{reason()}</p>}
                    </Show>
                  </div>
                </div>
                <div class="flex justify-end gap-1">
                  <Show when={value().status === "active"}>
                    <Button size="small" variant="ghost" icon="stop" onClick={() => run("pause")}>
                      {ctx.t("pause")}
                    </Button>
                  </Show>
                  <Show when={value().status === "paused"}>
                    <Button size="small" variant="ghost" icon="refresh" onClick={() => run("resume")}>
                      {ctx.t("resume")}
                    </Button>
                  </Show>
                  <Button size="small" variant="ghost" icon="outline-trash" onClick={() => run("clear")}>
                    {ctx.t("clear")}
                  </Button>
                </div>
              </div>
            )}
          </Show>
        </div>
      )
    },
    close: () => undefined,
  })
}

export default setup
