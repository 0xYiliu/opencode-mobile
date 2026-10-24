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
import { DEFAULT_SERVICE_PORT, HostRegistryError } from "../registry"
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
  // servicePort (issue #6, F7): the REMOTE OpenCode service port the tunnel forwards to —
  // a different thing from the SSH port inside the target, hence its own labeled input.
  // Prefill: the stored port, else the documented default 4096.
  const [servicePort, setServicePort] = createSignal(String(editing?.servicePort ?? DEFAULT_SERVICE_PORT))
  // Remember state: initialized from the prior ref (truth table "initial value").
  const [remember, setRemember] = createSignal(initialRemember(editing?.credentialRef))
  const [password, setPassword] = createSignal("")
  // Key passphrase (issue #3): optional, shown with the import block — it wraps the
  // imported key into the vault envelope form and is cleared from memory right after.
  const [keyPassphrase, setKeyPassphrase] = createSignal("")
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
      case "invalid-service-port":
        return "hostDialog.error.invalidServicePort"
      default:
        return "hostDialog.error.invalidTarget"
    }
  }

  // Private key import: input[type=file] surfaces through the shell's file chooser
  // (onShowFileChooser -> ACTION_OPEN_DOCUMENT); the plaintext crosses the bridge exactly
  // once, is never persisted anywhere else and never leaves this closure. The URI/permission
  // is not persisted (no takePersistableUriPermission) and the size bound is pre-checked.
  // Issue #6: an optional key passphrase wraps the key into the vault envelope form
  // ({"v":1,"key":...,"passphrase":...}) — same Keystore-encrypted value, never a registry
  // field — and is cleared from this closure the moment the import settles either way.
  const onKeyFile = async (file: File | undefined) => {
    if (!file) return // chooser cancelled: nothing happens
    setError(undefined)
    if (file.size > MAX_SECRET_BYTES) {
      setError(t("hostDialog.error.putFailed"))
      return
    }
    setImporting(true)
    const passphrase = keyPassphrase()
    setKeyPassphrase("") // the passphrase never lingers in memory beyond the import
    try {
      const text = await file.text()
      const value = passphrase.length > 0 ? JSON.stringify({ v: 1, key: text, passphrase }) : text
      const ref = await vault.put({ kind: "privateKey", value, ...(boundRef() !== undefined ? { existingRef: boundRef() } : {}) })
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

  /**
   * Parse the service port input (issue #6): a blank field means the default (4096);
   * anything non-numeric or out of 1..65535 fails the save with an inline error — the
   * previously stored record stays untouched.
   */
  const parseServicePort = (): number | undefined => {
    const raw = servicePort().trim()
    if (raw === "") return DEFAULT_SERVICE_PORT
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return undefined
    return parsed
  }

  const save = async () => {
    setError(undefined)
    // servicePort first: a malformed port fails the save before any vault call (the
    // previously stored record stays untouched, acceptance: editing failure preserves it).
    const port = parseServicePort()
    if (port === undefined) {
      setError(t("hostDialog.error.invalidServicePort"))
      return
    }
    // Truth table v3 for the SSH form: add has no prior, edit's prior is the bound ref.
    // boundKind lets an already-imported private key keep its binding on an empty value
    // (row 13) instead of aborting the save and stranding the entry as an orphan.
    const decision = evaluateRemember({
      mode: editing ? "edit" : "add",
      checkboxRendered: vaultAvailable(),
      remember: remember(),
      valueEmpty: password().length === 0,
      priorRef: boundRef(),
      ...(boundMeta() !== undefined ? { boundKind: boundMeta()!.kind } : {}),
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
          servicePort: port,
          credentialRef: credentialRef ?? "",
        })
      } else {
        props.runtime.registry.add({
          name: name(),
          target: target(),
          servicePort: port,
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
        {/* Issue #6 (F7): dual-port disambiguation — the SSH port lives inside the target
            above; this is the REMOTE OpenCode service port the tunnel forwards to
            (remote loopback localhost:<servicePort>, single hop). */}
        <label for="mobile-host-service-port" class="text-12-regular text-text-weak">
          {t("hostDialog.servicePort")}
        </label>
        <TextInput
          id="mobile-host-service-port"
          type="text"
          inputmode="numeric"
          appearance="large"
          class="!w-full self-stretch"
          dir="ltr"
          spellcheck={false}
          autocapitalize="off"
          value={servicePort()}
          placeholder={t("hostDialog.servicePortPlaceholder")}
          invalid={!!error()}
          onInput={(event) => setServicePort(event.currentTarget.value)}
          onKeyDown={keyDown}
        />
        <span class="text-12-regular text-text-weak">{t("hostDialog.servicePortHint")}</span>
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
              // A bound private key must never be silently in-place overwritten by a
              // password (same entry id, kind would flip to password). The field is
              // disabled while a key is bound; replacing the key with a password goes
              // through uncheck (clears the binding) then check + type.
              disabled={boundMeta()?.kind === "privateKey"}
              onInput={(event) => setPassword(event.currentTarget.value)}
              onKeyDown={keyDown}
            />
            <Show when={boundMeta()?.kind === "privateKey"}>
              <span class="text-12-regular text-text-weak">{t("hostDialog.passwordDisabledForKey")}</span>
            </Show>
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
            {/* Issue #6: optional key passphrase — wraps the imported key into the vault
                envelope form; memory-only, cleared the moment the import settles. v1 does
                not try to decrypt at import time: a wrong/missing passphrase surfaces as
                ssh-key-decrypt-failed on first connect (known limitation, documented). */}
            <label for="mobile-host-key-passphrase" class="text-12-regular text-text-weak">
              {t("hostDialog.passphrase")}
            </label>
            <TextInput
              id="mobile-host-key-passphrase"
              type="password"
              appearance="large"
              class="!w-full self-stretch"
              autocomplete="off"
              value={keyPassphrase()}
              placeholder={t("hostDialog.passphrasePlaceholder")}
              onInput={(event) => setKeyPassphrase(event.currentTarget.value)}
              onKeyDown={keyDown}
            />
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
