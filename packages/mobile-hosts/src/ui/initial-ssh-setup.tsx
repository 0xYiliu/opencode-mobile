import { For, Show, createEffect, createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import { isSshErrorCode, sshErrorCodeMessageKey } from "../transport/ssh-errors"
import type { MobileHosts } from "../runtime"
import { canHandoffInitialSsh, canStartInitialSshAttempt, shouldSelectCreatedSshHost } from "../initial-handoff"
import { HostDialog } from "./host-dialog"
import { KeyedHostKeyPrompt } from "./keyed-host-key-prompt"
import { HostKeyRecovery } from "./host-key-recovery"
import { CredentialManager } from "./credential-manager"
import { ServiceAuthPrompt } from "./service-auth-prompt"

/** Initial-screen SSH onboarding. Ownership is claimed before registry publication. */
export function InitialSshSetup(props: { runtime: MobileHosts; active: () => boolean }) {
  const runtime = props.runtime
  const t = createTranslator(runtime.locale)
  const [hostId, setHostId] = createSignal<string | undefined>(runtime.initialHostId() ?? runtime.registry.list()[0]?.id)
  const [editing, setEditing] = createSignal(false)
  const [adding, setAdding] = createSignal(false)
  const [credentialsOpen, setCredentialsOpen] = createSignal(false)

  const id = () => (adding() ? undefined : hostId() ?? runtime.initialHostId())
  const state = () => (id() ? runtime.stateOf(id()!) : "idle")
  createEffect(() => {
    const current = id()
    if (!current) return
    const formOpen = editing() || adding()
    if (props.active() && runtime.initialScreenOwned()) runtime.ownInitialHost(current)
    if (canHandoffInitialSsh({
      activeMode: props.active(),
      formOpen,
      ownerActive: runtime.initialScreenOwned(),
      ownerHostId: runtime.initialHostId(),
      hostId: current,
      ownerGeneration: runtime.initialHostGeneration() ?? -1,
      currentGeneration: runtime.initialGeneration(),
      state: runtime.stateOf(current),
      serviceAuthenticated: !runtime.serviceAuthRequiredOf(current),
    })) {
      runtime.releaseInitialScreen(current, runtime.initialGeneration())
    }
  })
  const reason = () => {
    const failure = id() ? runtime.failureReasonOf(id()!) : undefined
    return failure ? (isSshErrorCode(failure) ? t(sshErrorCodeMessageKey(failure)) : t("hostManager.failedGeneric")) : ""
  }

  const connect = () => {
    if (!id()) return
    runtime.connect(id()!)
  }

  return (
    <section class="flex w-full min-w-0 flex-col gap-3" aria-label={t("hostDialog.addTitle")}>
      <Show when={!id() || editing()}>
        <HostDialog
          runtime={runtime}
          hostId={editing() ? id() : undefined}
          beforeCreate={() => (props.active() ? runtime.claimInitialScreen() : undefined)}
          onCreated={(created, ownerGeneration) => {
            setAdding(false)
            const currentOwner = canStartInitialSshAttempt({
              activeMode: props.active(),
              ownerActive: runtime.initialScreenOwned(),
              ownerGeneration,
              currentGeneration: runtime.initialGeneration(),
            })
            if (shouldSelectCreatedSshHost({
              activeMode: props.active(),
              ownerActive: runtime.initialScreenOwned(),
              ownerGeneration,
              currentGeneration: runtime.initialGeneration(),
            })) setHostId(created)
            if (currentOwner) {
              runtime.ownInitialHost(created)
              runtime.connect(created)
            }
          }}
          onClose={() => { setEditing(false); setAdding(false) }}
        />
      </Show>
      <Show when={id() && !editing()}>
        <div class="flex flex-col gap-3 rounded-[12px] border border-border-weak-base p-4">
          <p class="text-14-medium text-text-strong">{t(`state.${state()}` as Parameters<typeof t>[0])}</p>
          <Show when={state() === "hostKeyUnverified" ? id() : undefined} keyed>
            {(hostId) => <KeyedHostKeyPrompt runtime={runtime} hostId={() => hostId} onClose={() => {}} />}
          </Show>
          <Show when={reason()}><p role="alert" class="text-12-regular text-text-strong">{reason()}</p></Show>
          <Show when={state() === "failed" && runtime.failureReasonOf(id()!) === "host-key-changed" ? id() : undefined} keyed>
            {(hostId) => <HostKeyRecovery runtime={runtime} hostId={hostId} />}
          </Show>
          <Show when={runtime.serviceAuthRequiredOf(id()!)}>
            <ServiceAuthPrompt runtime={runtime} hostId={id} active={props.active} />
          </Show>
          <div class="flex flex-wrap gap-2">
            <Show when={state() === "idle" || state() === "failed" || state() === "incompatible" || state() === "authRequired"}>
              <Button variant="contrast" onClick={connect}>{state() === "failed" ? t("hostManager.retry") : t("hostManager.connect")}</Button>
            </Show>
            <Show when={state() === "offline"}><Button variant="contrast" onClick={() => runtime.retry(id()!)}>{t("hostManager.retry")}</Button></Show>
            <Show when={state() === "ready" && !runtime.serviceAuthRequiredOf(id()!)}>
              <Button variant="neutral" onClick={() => {
                if (props.active()) runtime.releaseInitialScreen(id()!, runtime.initialGeneration())
              }}>{t("initialSsh.continue")}</Button>
              <Button variant="neutral" onClick={() => runtime.disconnect(id()!)}>{t("initialSsh.disconnectLocal")}</Button>
            </Show>
            <Button variant="neutral" onClick={() => setEditing(true)}>{t("hostManager.edit")}</Button>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button variant="neutral" onClick={() => { setAdding(true); setEditing(false) }}>{t("hostManager.add")}</Button>
            <Button variant="neutral" onClick={() => setCredentialsOpen(true)}>{t("hostManager.credentials")}</Button>
          </div>
          <For each={runtime.registry.list()}>{(host) => (
            <div class="flex items-center justify-between gap-2 rounded-[8px] border border-border-weak-base px-3 py-2">
              <span class="min-w-0 truncate text-12-regular text-text-weak">{host.name} · {t(`state.${runtime.stateOf(host.id)}` as Parameters<typeof t>[0])}</span>
              <Button size="small" variant="neutral" onClick={() => {
                setAdding(false)
                setEditing(false)
                setHostId(host.id)
                runtime.ownInitialHost(host.id)
              }}>{t("initialSsh.selectHost")}</Button>
            </div>
          )}</For>
          <Show when={credentialsOpen()}>
            <CredentialManager runtime={runtime} onClose={() => setCredentialsOpen(false)} />
          </Show>
        </div>
      </Show>
    </section>
  )
}
