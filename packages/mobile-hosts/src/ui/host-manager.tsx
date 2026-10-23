// Host manager: the SSH host list mounted in the app's settings "servers" tab (M-008).
// Reuses @opencode/ui primitives and tokens — no new visual decisions, no bare values.
// Delete and disconnect are local-only operations (see createMobileHosts); the component
// has no transport reach of its own.

import { For, Show, createSignal } from "solid-js"
import { Match, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { HostState } from "../state-machine"
import type { MobileHosts } from "../runtime"
import { HostDialog } from "./host-dialog"

function stateLabel(t: ReturnType<typeof createTranslator>, state: HostState): string {
  return t(`state.${state}` as Parameters<typeof t>[0])
}

export function MobileHostManager(props: { runtime: MobileHosts }) {
  const t = createTranslator(props.runtime.locale)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [editingId, setEditingId] = createSignal<string | undefined>(undefined)

  const openAdd = () => {
    setEditingId(undefined)
    setDialogOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setDialogOpen(true)
  }

  return (
    <div class="flex w-full min-w-0 flex-col gap-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-14-strong">{t("hostManager.title")}</h3>
        <Button size="small" onClick={openAdd}>
          {t("hostManager.add")}
        </Button>
      </div>
      <Show when={props.runtime.registry.list().length > 0} fallback={<p class="text-13-muted">{t("hostManager.empty")}</p>}>
        <ul class="flex w-full min-w-0 flex-col gap-2">
          <For each={props.runtime.registry.list()}>
            {(host) => (
              <li class="flex w-full min-w-0 items-center gap-2 rounded-[8px] border border-token px-3 py-2">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-13-strong">{host.name}</span>
                  <span class="truncate text-12-muted" dir="ltr">
                    {host.target}
                  </span>
                </div>
                <span class="shrink-0 text-12-muted">{stateLabel(t, props.runtime.stateOf(host.id))}</span>
                <div class="flex shrink-0 items-center gap-1">
                  <Switch>
                    <Match when={props.runtime.stateOf(host.id) === "offline"}>
                      <Button size="small" variant="neutral" onClick={() => props.runtime.retry(host.id)}>
                        {t("hostManager.retry")}
                      </Button>
                    </Match>
                    <Match when={props.runtime.stateOf(host.id) === "ready"}>
                      <Button size="small" variant="neutral" onClick={() => props.runtime.disconnect(host.id)}>
                        {t("hostManager.disconnect")}
                      </Button>
                    </Match>
                    <Match
                      when={
                        props.runtime.stateOf(host.id) === "idle" ||
                        props.runtime.stateOf(host.id) === "failed" ||
                        props.runtime.stateOf(host.id) === "incompatible" ||
                        props.runtime.stateOf(host.id) === "authRequired"
                      }
                    >
                      <Button size="small" variant="neutral" onClick={() => props.runtime.connect(host.id)}>
                        {t("hostManager.connect")}
                      </Button>
                    </Match>
                  </Switch>
                  <Button size="small" variant="neutral" onClick={() => openEdit(host.id)}>
                    {t("hostManager.edit")}
                  </Button>
                  <Button size="small" variant="danger" onClick={() => props.runtime.remove(host.id)}>
                    {t("hostManager.delete")}
                  </Button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <p class="text-12-muted">{t("hostManager.deleteHint")}</p>
      <Show when={dialogOpen()}>
        <HostDialog runtime={props.runtime} hostId={editingId()} onClose={() => setDialogOpen(false)} />
      </Show>
    </div>
  )
}
