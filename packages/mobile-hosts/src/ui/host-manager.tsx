// Host manager: the SSH host list mounted in the app's settings "servers" tab (M-008).
// Reuses @opencode/ui primitives and tokens — no new visual decisions, no bare values.
// Delete and disconnect are local-only operations (see createMobileHosts); the component
// has no transport reach of its own. Issue #4 adds the credential manager entry point and
// the per-row bound-credential indicator. Issue #6 mounts the host-key confirmation
// prompt inline (hostKeyUnverified), surfaces the classified failure reason, and adds the
// changed-key recovery entry (one explicit danger confirmation -> forgetHostKey; never an
// automatic overwrite, no skip-verification affordance anywhere).

import { For, Show, createSignal } from "solid-js"
import { Match, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { HostState } from "../state-machine"
import { getMobileHosts } from "../runtime"
import { isSshErrorCode, sshErrorCodeMessageKey } from "../transport/ssh-errors"
import { CredentialManager } from "./credential-manager"
import { HostDialog } from "./host-dialog"
import { HostKeyPrompt } from "./host-key-prompt"

function stateLabel(t: ReturnType<typeof createTranslator>, state: HostState): string {
  return t(`state.${state}` as Parameters<typeof t>[0])
}

export function MobileHostManager() {
  const runtime = getMobileHosts()
  const t = createTranslator(runtime.locale)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [editingId, setEditingId] = createSignal<string | undefined>(undefined)
  const [credentialsOpen, setCredentialsOpen] = createSignal(false)
  // Memory-only recovery bookkeeping: hosts whose stored key was removed in this session
  // (the row then shows the "connect to re-verify" hint instead of the danger entry).
  const [forgotten, setForgotten] = createSignal<Record<string, boolean>>({})

  const openAdd = () => {
    setEditingId(undefined)
    setDialogOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setDialogOpen(true)
  }

  // The classified failure reason (memory-only, decision 0003 §5): a recognized
  // SshErrorCode gets its actionable line; anything else (e.g. the stub transport
  // message) gets the generic failure line — the raw reason is never swallowed.
  const reasonLine = (reason: string | undefined): string | undefined => {
    if (!reason) return undefined
    return isSshErrorCode(reason) ? t(sshErrorCodeMessageKey(reason)) : t("hostManager.failedGeneric")
  }

  const recoverHostKey = async (id: string) => {
    // The danger copy renders next to this button; this click is the single explicit
    // confirmation. A failed removal keeps the danger entry visible (failure matrix).
    const removed = await runtime.forgetHostKey(id)
    if (removed) setForgotten((current) => ({ ...current, [id]: true }))
  }

  return (
    <div class="flex w-full min-w-0 flex-col gap-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-14-medium text-text-strong">{t("hostManager.title")}</h3>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="small" variant="neutral" onClick={() => setCredentialsOpen(true)}>
            {t("hostManager.credentials")}
          </Button>
          <Button size="small" onClick={openAdd}>
            {t("hostManager.add")}
          </Button>
        </div>
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
                  <Show when={runtime.stateOf(host.id) === "failed" && reasonLine(runtime.failureReasonOf(host.id))}>
                    <span role="alert" class="text-12-regular text-text-strong">
                      {reasonLine(runtime.failureReasonOf(host.id))}
                    </span>
                  </Show>
                  <Show when={runtime.stateOf(host.id) === "failed" && runtime.failureReasonOf(host.id) === "host-key-changed"}>
                    <Show
                      when={!forgotten()[host.id]}
                      fallback={<span class="text-12-regular text-text-weak">{t("hostKey.changed.removed")}</span>}
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-12-regular text-text-strong" role="alert">
                          {t("hostKey.changed.note")}
                        </span>
                        <Button size="small" variant="danger" onClick={() => void recoverHostKey(host.id)}>
                          {t("hostKey.changed.recover")}
                        </Button>
                      </div>
                    </Show>
                  </Show>
                </div>
                <Show when={host.credentialRef !== undefined}>
                  <span class="shrink-0 text-12-regular text-text-weak">{t("hostManager.bound")}</span>
                </Show>
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
                      {/* authRequired included (issue #6): T1's revised source set makes this
                          button real — edit the credential, then connect re-drives the attempt. */}
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
      <For each={runtime.registry.list().filter((host) => runtime.stateOf(host.id) === "hostKeyUnverified")}>
        {(host) => (
          <HostKeyPrompt runtime={runtime} hostId={host.id} fingerprint={runtime.fingerprintOf(host.id) ?? ""} onClose={() => {}} />
        )}
      </For>
      <Show when={runtime.storageVolatile}>
        <p role="status" class="text-12-regular text-text-strong">{t("hostManager.volatileStorage")}</p>
      </Show>
      <p class="text-12-regular text-text-weak">{t("hostManager.deleteHint")}</p>
      <Show when={dialogOpen()}>
        <HostDialog runtime={runtime} hostId={editingId()} onClose={() => setDialogOpen(false)} />
      </Show>
      <Show when={credentialsOpen()}>
        <CredentialManager runtime={runtime} onClose={() => setCredentialsOpen(false)} />
      </Show>
    </div>
  )
}
