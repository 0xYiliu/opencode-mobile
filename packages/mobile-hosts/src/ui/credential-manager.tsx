// Credential manager (issue #4): metadata view over the device credential vault.
//
// Shows ONLY metadata (kind/label/created) — the vault never hands values back through this
// UI (list() carries no value field, locked by tests). Zones:
// - unavailable banner: explicit state, no downgrade pretense;
// - referenced entries: cross-referenced against the SSH host registry;
// - orphan zone: entries no host/server points at (stale bindings, cancelled imports) with
//   explicit deletion;
// - recovery copy: an unreadable entry is restored by re-entering it where it is asked for
//   (the re-save keeps the binding stable via the in-place put).
// Deletion is a local vault operation; it never touches the network (red line).

import { For, Show, createSignal, onMount } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MobileHosts } from "../runtime"
import { formatVaultRef, type VaultEntryMetadata } from "../vault/types"

export function CredentialManager(props: { runtime: MobileHosts; onClose: () => void }) {
  const t = createTranslator(props.runtime.locale)
  const vault = props.runtime.credentials
  const [metas, setMetas] = createSignal<VaultEntryMetadata[] | undefined>(undefined)
  const [loadFailed, setLoadFailed] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const refresh = async () => {
    try {
      setMetas(await vault.list())
      setLoadFailed(false)
    } catch {
      setMetas(undefined)
      setLoadFailed(true)
    }
  }

  onMount(() => void refresh())

  const usedBy = (id: string) => props.runtime.registry.list().filter((host) => host.credentialRef === formatVaultRef(id))

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await vault.remove(formatVaultRef(id))
      await refresh()
    } catch {
      await refresh() // a failed delete re-renders the current state; never silent success
    } finally {
      setBusy(false)
    }
  }

  const kindLabel = (kind: VaultEntryMetadata["kind"]) => t(`credentialManager.kind.${kind}` as Parameters<typeof t>[0])

  const referenced = () => (metas() ?? []).filter((m) => usedBy(m.id).length > 0)
  const orphans = () => (metas() ?? []).filter((m) => usedBy(m.id).length === 0)

  const entryRow = (meta: VaultEntryMetadata) => {
    const users = usedBy(meta.id)
    return (
      <li class="flex w-full min-w-0 items-center gap-2 rounded-[8px] border border-border-weak-base px-3 py-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-12-medium text-text-strong" dir="ltr">
            {kindLabel(meta.kind)}
            {meta.label ? ` · ${meta.label}` : ""}
          </span>
          <span class="truncate text-12-regular text-text-weak" dir="ltr">
            <Show when={users.length > 0} fallback={t("credentialManager.orphan.title")}>
              {t("credentialManager.usedBy")}: {users.map((host) => host.name).join(", ")}
            </Show>
          </span>
        </div>
        <Button size="small" variant="danger" disabled={busy()} onClick={() => void remove(meta.id)}>
          {t("credentialManager.delete")}
        </Button>
      </li>
    )
  }

  return (
    <div class="flex w-full min-w-0 flex-col gap-4 rounded-[12px] border border-border-weak-base p-4" role="dialog" aria-label={t("credentialManager.title")}>
      <div class="flex items-center justify-between gap-2">
        <h4 class="text-14-medium text-text-strong">{t("credentialManager.title")}</h4>
        <Button size="small" variant="neutral" onClick={() => props.onClose()}>
          {t("credentialManager.close")}
        </Button>
      </div>
      <Show when={vault.status() === "unavailable"}>
        <p role="status" class="text-12-regular text-text-strong">
          {t("credentialManager.unavailable")}
        </p>
      </Show>
      <Show when={vault.status() === "available" && loadFailed()}>
        <p role="alert" class="text-12-regular text-text-strong">
          {t("hostDialog.error.putFailed")}
        </p>
      </Show>
      <Show when={metas() !== undefined && metas()!.length === 0}>
        <p class="text-14-regular text-text-weak">{t("credentialManager.empty")}</p>
      </Show>
      <Show when={(referenced().length > 0 || orphans().length > 0) && vault.status() === "available"}>
        <ul class="flex w-full min-w-0 flex-col gap-2">
          <For each={referenced()}>{(meta) => entryRow(meta)}</For>
        </ul>
      </Show>
      <Show when={vault.status() === "available" && orphans().length > 0}>
        <div class="flex w-full min-w-0 flex-col gap-2">
          <span class="text-12-medium text-text-strong">{t("credentialManager.orphan.title")}</span>
          <p class="text-12-regular text-text-weak">{t("credentialManager.orphan.hint")}</p>
          <ul class="flex w-full min-w-0 flex-col gap-2">
            <For each={orphans()}>{(meta) => entryRow(meta)}</For>
          </ul>
        </div>
      </Show>
      <p class="text-12-regular text-text-weak">{t("credentialManager.deleteHint")}</p>
      <p class="text-12-regular text-text-weak">{t("credentialManager.corruptHint")}</p>
    </div>
  )
}
