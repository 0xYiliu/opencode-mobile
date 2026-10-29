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

import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { DEFAULT_SERVICE_PORT, HostRegistryError } from "../registry"
import { createTranslator, type MessageKey } from "../i18n"
import type { MobileHosts } from "../runtime"
import { initialRemember } from "../vault/remember"
import { decideHostCredential, persistHostCredential } from "./host-credential"
import { MAX_SECRET_BYTES, parseVaultRef, VaultError, type VaultEntryMetadata } from "../vault/types"

class PrivateKeyTooLargeError extends Error {}

/** Stream actual file bytes to EOF with a bound; DocumentsUI File.size/slice metadata may lie. */
async function readPrivateKeyFile(file: File): Promise<string> {
  const reader = file.stream().getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      length += value.byteLength
      if (length > MAX_SECRET_BYTES) {
        await reader.cancel().catch(() => {})
        throw new PrivateKeyTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function HostDialog(props: { runtime: MobileHosts; hostId?: string; onClose: () => void; onCreated?: (id: string, generation?: number) => void; beforeCreate?: () => number | void }) {
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
  // Once a bound private key is explicitly unchecked, allow the user to re-check and type
  // a replacement password. The new credential gets a fresh vault entry; the old key stays
  // discoverable as an orphan and is never overwritten or removed implicitly.
  const [replaceBoundKey, setReplaceBoundKey] = createSignal(false)
  const [password, setPassword] = createSignal("")
  // Key passphrase (issue #6): optional form draft used to wrap an imported key before the
  // vault write. It remains memory-only and clears after a successful put or form disposal.
  const [keyPassphrase, setKeyPassphrase] = createSignal("")
  const [pendingKey, setPendingKey] = createSignal<string>()
  // The binding the save will work from; a key import re-points it before the save.
  const [boundRef, setBoundRef] = createSignal<string | undefined>(editing?.credentialRef)
  const [boundMeta, setBoundMeta] = createSignal<VaultEntryMetadata | undefined>(undefined)
  const [boundKnown, setBoundKnown] = createSignal<boolean | undefined>(undefined) // undefined: unknown (vault unavailable)
  const [importing, setImporting] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)
  let saveLock = false
  let disposed = false
  let generation = 0
  onCleanup(() => {
    disposed = true
    generation++
  })
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
      case "duplicate-target":
        return "hostDialog.error.duplicateTarget"
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
  // (onShowFileChooser -> ACTION_OPEN_DOCUMENT); the plaintext is staged only in this form,
  // then crosses the vault bridge once on a validated Save. It is never otherwise persisted.
  // The URI/permission
  // is not persisted (no takePersistableUriPermission); bytes are read with a hard bound.
  // An optional passphrase wraps the staged key in the vault envelope form
  // ({"v":1,"key":...,"passphrase":...}) — never a registry field.
  const onKeyFile = async (file: File | undefined) => {
    if (!file) return // chooser cancelled: nothing happens
    setError(undefined)
    setImporting(true)
    try {
      // Content providers may report an unknown/sentinel File.size or implement Blob.slice
      // using that bad metadata. Stream actual bytes to EOF, stopping as soon as the bound is
      // exceeded instead of trusting provider metadata or reading an unbounded document.
      const text = await readPrivateKeyFile(file)
      if (new TextEncoder().encode(text).byteLength > MAX_SECRET_BYTES) {
        setError(t("hostDialog.error.keyTooLarge"))
        return
      }
      if (!text.includes("-----BEGIN ")) throw new Error("invalid private key")
      setPendingKey(text)
      setRemember(true)
    } catch (error) {
      if (error instanceof PrivateKeyTooLargeError) {
        setError(t("hostDialog.error.keyTooLarge"))
        return
      }
      // Import only stages the file in this form; a read/format failure changes no vault or
      // registry entry and leaves the user with an inline retry path.
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
  const parseServicePort = (input = servicePort()): number | undefined => {
    const raw = input.trim()
    if (raw === "") return DEFAULT_SERVICE_PORT
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return undefined
    return parsed
  }

  const save = async () => {
    // The lock is synchronous (before the first await), so rapid taps and Enter cannot
    // start two vault writes using the same snapshot.
    if (saveLock || saving() || importing() || disposed) return
    saveLock = true
    setError(undefined)
    try {
      // Snapshot *all* mutable form values before the first await. The validated snapshot is
      // the only data allowed to reach the vault or registry for this save attempt.
      const draft = {
        name: name(),
        target: target(),
        servicePort: servicePort(),
        password: password(),
        pendingKey: pendingKey(),
        keyPassphrase: keyPassphrase(),
        remember: remember(),
        boundRef: boundRef(),
        boundKind: boundMeta()?.kind,
      }
      const port = parseServicePort(draft.servicePort)
      if (port === undefined) {
        setError(t("hostDialog.error.invalidServicePort"))
        return
      }
      try {
        props.runtime.registry.validate({ name: draft.name, target: draft.target, servicePort: port }, editing?.id)
      } catch (error) {
        const code = error instanceof HostRegistryError ? error.code : "invalid-target"
        setError(t(errorCodeToMessage(code)))
        return
      }
      // Truth table v3 for the SSH form. A staged key is a non-empty credential even while
      // the password editor is blank; boundKind preserves a prior imported key on edit.
      const decision = decideHostCredential({
        mode: editing ? "edit" : "add",
        checkboxRendered: vaultAvailable(),
        remember: draft.remember,
        password: draft.password,
        ...(draft.pendingKey !== undefined ? { pendingKey: draft.pendingKey } : {}),
        priorRef: draft.boundRef,
        ...(draft.boundKind !== undefined ? { boundKind: draft.boundKind } : {}),
      })
      if (decision.action === "abort") {
        setError(t(decision.reason === "key-requires-vault" ? "hostDialog.keyRequiresRemember" : "hostDialog.needsPassword"))
        return
      }

      const saveGeneration = generation
      setSaving(true)
      const createGeneration = editing ? undefined : props.beforeCreate?.()
      let credentialRef: string | undefined
      let savedKind: "password" | "privateKey" | undefined
      try {
        const saved = await persistHostCredential({
          vault,
          decision,
          password: draft.password,
          ...(draft.pendingKey !== undefined ? { pendingKey: draft.pendingKey } : {}),
          keyPassphrase: draft.keyPassphrase,
        })
        credentialRef = saved.credentialRef
        savedKind = saved.kind
      } catch (error) {
        if (!disposed && generation === saveGeneration) {
          const recoveryRef = error instanceof VaultError ? error.recoveryRef : undefined
          setError(`${t("hostDialog.error.putFailed")}${recoveryRef ? ` ${recoveryRef}` : ""}`)
        }
        return
      }

      // A parent route change can dispose the dialog while the vault promise is pending.
      // Keep any newly encrypted value as an explicit orphan; never publish/connect after
      // cancellation, and never delete an existing referenced credential to compensate.
      if (disposed || generation !== saveGeneration) return

      try {
        if (editing) {
          // Empty string clears only the registry reference. The existing vault entry stays
          // available in CredentialManager's orphan list until an explicit user deletion.
          props.runtime.registry.update(editing.id, {
            name: draft.name,
            target: draft.target,
            servicePort: port,
            credentialRef: credentialRef ?? "",
          })
        } else {
          const created = props.runtime.registry.add({
            name: draft.name,
            target: draft.target,
            servicePort: port,
            ...(credentialRef !== undefined ? { credentialRef } : {}),
          })
          props.onCreated?.(created.id, typeof createGeneration === "number" ? createGeneration : undefined)
        }
      } catch (error) {
        const code = error instanceof HostRegistryError ? error.code : "invalid-target"
        setError(t(errorCodeToMessage(code)))
        return // leave the previous record and any new vault orphan visible
      }
      if (savedKind === "privateKey") {
        setPendingKey(undefined)
        setKeyPassphrase("")
      }
      if (!disposed && generation === saveGeneration) props.onClose()
    } finally {
      saveLock = false
      if (!disposed) setSaving(false)
    }
  }

  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.isComposing) return
    if (saving() || importing()) return
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
          disabled={saving() || importing()}
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
          disabled={saving() || importing()}
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
          disabled={saving() || importing()}
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
            <span class="text-12-regular text-text-weak">{t("hostDialog.orphanHint")}</span>
          </Show>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remember()}
              disabled={saving() || importing()}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                if (!checked && boundMeta()?.kind === "privateKey") setReplaceBoundKey(true)
                setRemember(checked)
              }}
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
              disabled={saving() || importing() || (boundMeta()?.kind === "privateKey" && !replaceBoundKey())}
              placeholder={t("hostDialog.credentialPasswordPlaceholder")}
              invalid={!!error()}
              // Never overwrite a private-key entry in place. After the explicit
              // uncheck/re-check sequence, save creates a separate password entry.
              onInput={(event) => setPassword(event.currentTarget.value)}
              onKeyDown={keyDown}
            />
            <Show when={boundMeta()?.kind === "privateKey" && !replaceBoundKey()}>
              <span class="text-12-regular text-text-weak">{t("hostDialog.passwordDisabledForKey")}</span>
            </Show>
            <Show when={boundMeta()?.kind === "privateKey" && replaceBoundKey()}>
              <span class="text-12-regular text-text-weak">{t("hostDialog.keyReplacementHint")}</span>
            </Show>
            <input
              ref={keyFileInput}
              type="file"
              disabled={saving() || importing()}
              class="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = "" // allow re-selecting the same file
                void onKeyFile(file)
              }}
            />
            <Button size="small" variant="neutral" disabled={saving() || importing()} onClick={() => keyFileInput?.click()}>
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
              disabled={saving() || importing()}
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
        <Button variant="neutral" disabled={saving() || importing()} onClick={() => {
          if (saving() || importing() || saveLock) return
          generation++
          props.onClose()
        }}>
          {t("hostDialog.cancel")}
        </Button>
        <Button variant="contrast" disabled={saving() || importing()} onClick={() => void save()}>
          {t(saving() ? "hostDialog.saving" : "hostDialog.save")}
        </Button>
      </div>
    </div>
  )
}
