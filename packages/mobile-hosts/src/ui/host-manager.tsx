// Host manager: the SSH host list mounted in the app's settings "servers" tab (M-008).
// Reuses @opencode/ui primitives and tokens — no new visual decisions, no bare values.
// Delete and disconnect are local-only operations (see createMobileHosts); the component
// has no transport reach of its own.

import { For, Show, createSignal } from "solid-js"
import { Match, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { HostState } from "../state-machine"
import { getMobileHosts } from "../runtime"
import { HostDialog } from "./host-dialog"

function stateLabel(t: ReturnType<typeof createTranslator>, state: HostState): string {
  return t(`state.${state}` as Parameters<typeof t>[0])
}

export function MobileHostManager() {
  const runtime = getMobileHosts()
  const t = createTranslator(runtime.locale)
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
        <h3 class="text-14-medium text-text-strong">{t("hostManager.title")}</h3>
        <Button size="small" onClick={openAdd}>
          {t("hostManager.add")}
        </Button>
      </div>
      <Show when={runtime.registry.list().length > 0} fallback={<p class="text-14-regular text-text-weak">{t("hostManager.empty")}</p>}>
        <ul class="flex w-full min-w-0 flex-col gap-2">
          <For each={runtime.registry.list()}>
            {(host) => (
              <li class="flex w-full min-w-0 items-center gap-2 rounded-[8px] border border-border-weak-base px-3 py-2">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-12-medium text-text-strong">{host.name}</span>
                  <span class="truncate text-12-regular text-text-weak" dir="ltr">
                    {host.target}
                  </span>
                </div>
                <span class="shrink-0 text-12-regular text-text-weak">{stateLabel(t, runtime.stateOf(host.id))}</span>
                <div class="flex shrink-0 items-center gap-1">
                  <Switch>
                    <Match when={runtime.stateOf(host.id) === "offline"}>
                      <Button size="small" variant="neutral" onClick={() => runtime.retry(host.id)}>
                        {t("hostManager.retry")}
                      </Button>
                    </Match>
                    <Match when={runtime.stateOf(host.id) === "ready"}>
                      <Button size="small" variant="neutral" onClick={() => runtime.disconnect(host.id)}>
                        {t("hostManager.disconnect")}
                      </Button>
                    </Match>
                    <Match
                      when={
                        runtime.stateOf(host.id) === "idle" ||
                        runtime.stateOf(host.id) === "failed" ||
                        runtime.stateOf(host.id) === "incompatible" ||
                        runtime.stateOf(host.id) === "authRequired"
                      }
                    >
                      <Button size="small" variant="neutral" onClick={() => runtime.connect(host.id)}>
                        {t("hostManager.connect")}
                      </Button>
                    </Match>
                  </Switch>
                  <Button size="small" variant="neutral" onClick={() => openEdit(host.id)}>
                    {t("hostManager.edit")}
                  </Button>
                  <Button size="small" variant="danger" onClick={() => runtime.remove(host.id)}>
                    {t("hostManager.delete")}
                  </Button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <p class="text-12-regular text-text-weak">{t("hostManager.deleteHint")}</p>
      <Show when={dialogOpen()}>
        <HostDialog runtime={runtime} hostId={editingId()} onClose={() => setDialogOpen(false)} />
      </Show>
    </div>
  )
}
