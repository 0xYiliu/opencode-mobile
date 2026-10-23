// Host dialog: SSH host add/edit form (issue #3, credential binding reworked in issue #4).
//
// The form never persisted a credential value and still does not: the credential binding
// block stores secrets through the device vault (device-side encryption) and the record
// keeps only the non-secret `mobile-credential:<id>` reference. The free-text reference
// input from issue #3 is gone — bindings are made by remembering a password or importing a
// private key file. Validation errors render inline; a failed save keeps the previously
// stored record untouched (acceptance: editing failure preserves the last working config).
//
// The remember decision reuses truth table v3 (src/vault/remember.ts): the same semantics
// as the upstream connect dialog (M-009), evaluated for the SSH host form.

import { Show, createSignal, onMount } from "solid-js"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { HostRegistryError } from "../registry"
import { createTranslator, type MessageKey } from "../i18n"
import type { MobileHosts } from "../runtime"
import { evaluateRemember, initialRemember } from "../vault/remember"
import { MAX_SECRET_BYTES, parseVaultRef, type VaultEntryMetadata } from "../vault/types"

export function HostDialog(props: { runtime: MobileHosts; hostId?: string; onClose: () => void }) {
  const t = createTranslator(props.runtime.locale)
  const vault = props.runtime.credentials
  const editing = props.hostId !== undefined ? props.runtime.registry.get(props.hostId) : undefined

  const [name, setName] = createSignal(editing?.name ?? "")
  const [target, setTarget] = createSignal(editing?.target ?? "")
  // Remember state: initialized from the prior ref (truth table "initial value").
  const [remember, setRemember] = createSignal(initialRemember(editing?.credentialRef))
  const [password, setPassword] = createSignal("")
  // The binding the save will work from; a key import re-points it before the save.
  const [boundRef, setBoundRef] = createSignal<string | undefined>(editing?.credentialRef)
  const [boundMeta, setBoundMeta] = createSignal<VaultEntryMetadata | undefined>(undefined)
  const [boundKnown, setBoundKnown] = createSignal<boolean | undefined>(undefined) // undefined: unknown (vault unavailable)
  const [importing, setImporting] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const vaultAvailable = () => vault.status() === "available"

  // Metadata lookup for the bound entry (kind display + missing-entry detection). The
  // metadata list carries no values; a vault that is unavailable simply leaves it unknown.
  onMount(() => {
    void (async () => {
      if (!boundRef()) return
      try {
        const metas = await vault.list()
        const meta = metas.find((m) => m.id === parseVaultRef(boundRef()!))
        setBoundMeta(meta)
        setBoundKnown(Boolean(meta))
      } catch {
        setBoundKnown(undefined)
      }
    })()
  })

  const errorCodeToMessage = (code: string): MessageKey => {
    switch (code) {
      case "duplicate-name":
        return "hostDialog.error.duplicateName"
      case "invalid-target":
      case "empty-target":
      case "target-too-long":
        return "hostDialog.error.invalidTarget"
      case "empty-name":
      case "name-too-long":
        return "hostDialog.error.emptyName"
      case "invalid-credential-ref":
        return "hostDialog.error.invalidCredentialRef"
      default:
        return "hostDialog.error.invalidTarget"
    }
  }

  // Private key import: input[type=file] surfaces through the shell's file chooser
  // (onShowFileChooser -> ACTION_OPEN_DOCUMENT); the plaintext crosses the bridge exactly
  // once, is never persisted anywhere else and never leaves this closure. The URI/permission
  // is not persisted (no takePersistableUriPermission) and the size bound is pre-checked.
  const onKeyFile = async (file: File | undefined) => {
    if (!file) return // chooser cancelled: nothing happens
    setError(undefined)
    if (file.size > MAX_SECRET_BYTES) {
      setError(t("hostDialog.error.putFailed"))
      return
    }
    setImporting(true)
    try {
      const text = await file.text()
      const ref = await vault.put({ kind: "privateKey", value: text, ...(boundRef() !== undefined ? { existingRef: boundRef() } : {}) })
      setBoundRef(ref)
      setRemember(true)
      const meta = await vault.list().then((metas) => metas.find((m) => m.id === parseVaultRef(ref)))
      setBoundMeta(meta)
      setBoundKnown(Boolean(meta))
    } catch {
      // Nothing was changed on disk unless the put itself partially succeeded; the dialog
      // stays open with an inline error instead of silently dropping the binding.
      setError(t("hostDialog.importKeyFailed"))
    } finally {
      setImporting(false)
    }
  }

  const save = async () => {
    setError(undefined)
    // Truth table v3 for the SSH form: add has no prior, edit's prior is the bound ref.
    const decision = evaluateRemember({
      mode: editing ? "edit" : "add",
      checkboxRendered: true,
      remember: remember(),
      valueEmpty: password().length === 0,
      priorRef: boundRef(),
    })
    if (decision.action === "abort") {
      setError(t("hostDialog.needsPassword"))
      return
    }
    let credentialRef: string | undefined
    try {
      if (decision.action === "put") {
        credentialRef = await vault.put({ kind: "password", value: password(), ...(decision.existingRef !== undefined ? { existingRef: decision.existingRef } : {}) })
      } else if (decision.action === "clear") {
        await vault.remove(decision.ref)
        credentialRef = undefined
      } else if (decision.action === "passthrough") {
        credentialRef = decision.ref
      }
    } catch {
      // put/remove failure: keep the dialog open with an inline error — never silently
      // close with a half-applied binding.
      setError(t("hostDialog.error.putFailed"))
      return
    }
    try {
      if (editing) {
        // Empty string means "clear": the registry's update treats an explicit empty value
        // as removal (undefined would mean "keep the current value"). Never convert the
        // empty string to undefined here — that would silently preserve the stored ref.
        props.runtime.registry.update(editing.id, {
          name: name(),
          target: target(),
          credentialRef: credentialRef ?? "",
        })
      } else {
        props.runtime.registry.add({
          name: name(),
          target: target(),
          ...(credentialRef !== undefined ? { credentialRef } : {}),
        })
      }
    } catch (error) {
      const code = error instanceof HostRegistryError ? error.code : "invalid-target"
      setError(t(errorCodeToMessage(code)))
      return // keep the previously stored record untouched
    }
    props.onClose()
  }

  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    void save()
  }

  let keyFileInput: HTMLInputElement | undefined

  const boundLabel = () => {
    if (boundKnown() === false) return t("hostDialog.boundMissing")
    const kind = boundMeta()?.kind
    return kind === "password" || kind === "privateKey" ? t(`hostDialog.boundKind.${kind}` as MessageKey) : t("hostDialog.bound")
  }

  return (
    <div
      class="flex w-full min-w-0 flex-col gap-4 rounded-[12px] border border-border-weak-base p-4"
      role="dialog"
      aria-label={editing ? t("hostDialog.editTitle") : t("hostDialog.addTitle")}
    >
      <h4 class="text-14-medium text-text-strong">{editing ? t("hostDialog.editTitle") : t("hostDialog.addTitle")}</h4>
      <div class="flex w-full min-w-0 flex-col gap-2">
        <label for="mobile-host-name" class="text-12-regular text-text-weak">
          {t("hostDialog.name")}
        </label>
        <TextInput
          id="mobile-host-name"
          type="text"
          appearance="large"
          class="!w-full self-stretch"
          value={name()}
          placeholder={t("hostDialog.namePlaceholder")}
          invalid={!!error()}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={keyDown}
        />
        <label for="mobile-host-target" class="text-12-regular text-text-weak">
          {t("hostDialog.target")}
        </label>
        <TextInput
          id="mobile-host-target"
          type="text"
          appearance="large"
          class="!w-full self-stretch"
          dir="ltr"
          spellcheck={false}
          autocapitalize="off"
          value={target()}
          placeholder={t("hostDialog.targetPlaceholder")}
          invalid={!!error()}
          onInput={(event) => setTarget(event.currentTarget.value)}
          onKeyDown={keyDown}
        />
      </div>
      <div class="flex w-full min-w-0 flex-col gap-2 border-t border-border-weak-base pt-3">
        <span class="text-12-medium text-text-strong">{t("hostDialog.credentialSection")}</span>
        <Show when={vaultAvailable()}>
          <Show when={boundRef()}>
            <span class="text-12-regular text-text-weak" role="status">
              {t("hostDialog.bound")}: {boundLabel()}
            </span>
          </Show>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remember()}
              onChange={(event) => setRemember(event.currentTarget.checked)}
            />
            <span class="text-12-regular text-text-weak">{t("hostDialog.remember")}</span>
          </label>
          <Show when={remember()}>
            <label for="mobile-host-credential-password" class="text-12-regular text-text-weak">
              {t("hostDialog.credentialPassword")}
            </label>
            <TextInput
              id="mobile-host-credential-password"
              type="password"
              appearance="large"
              class="!w-full self-stretch"
              autocomplete="off"
              value={password()}
              placeholder={t("hostDialog.credentialPasswordPlaceholder")}
              invalid={!!error()}
              onInput={(event) => setPassword(event.currentTarget.value)}
              onKeyDown={keyDown}
            />
            <input
              ref={keyFileInput}
              type="file"
              class="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = "" // allow re-selecting the same file
                void onKeyFile(file)
              }}
            />
            <Button size="small" variant="neutral" disabled={importing()} onClick={() => keyFileInput?.click()}>
              {t("hostDialog.importKey")}
            </Button>
          </Show>
        </Show>
        <Show when={!vaultAvailable()}>
          <p role="status" class="text-12-regular text-text-weak">
            {t("hostDialog.rememberUnavailable")}
          </p>
        </Show>
        <Show when={error()}>
          <span role="alert" class="text-12-regular text-text-strong">
            {error()}
          </span>
        </Show>
      </div>
      <div class="flex items-center justify-end gap-2">
        <Button variant="neutral" onClick={() => props.onClose()}>
          {t("hostDialog.cancel")}
        </Button>
        <Button variant="contrast" onClick={() => void save()}>
          {t("hostDialog.save")}
        </Button>
      </div>
    </div>
  )
}
