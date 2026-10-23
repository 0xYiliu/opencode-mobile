// Host dialog: SSH host add/edit form (issue #3).
//
// This form never accepts a credential value — only the non-secret credential reference
// identifier (see ../credential-ref). Validation errors render inline; a failed save keeps
// the previously stored record untouched (acceptance: editing failure preserves the last
// working config).

import { Show, createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { HostRegistryError } from "../registry"
import { createTranslator, type MessageKey } from "../i18n"
import type { MobileHosts } from "../runtime"

export function HostDialog(props: { runtime: MobileHosts; hostId?: string; onClose: () => void }) {
  const t = createTranslator(props.runtime.locale)
  const editing = props.hostId !== undefined ? props.runtime.registry.get(props.hostId) : undefined

  const [name, setName] = createSignal(editing?.name ?? "")
  const [target, setTarget] = createSignal(editing?.target ?? "")
  const [credentialRef, setCredentialRef] = createSignal(editing?.credentialRef ?? "")
  const [error, setError] = createSignal<string | undefined>(undefined)

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

  const save = () => {
    setError(undefined)
    const ref = credentialRef().trim()
    try {
      if (editing) {
        props.runtime.registry.update(editing.id, {
          name: name(),
          target: target(),
          credentialRef: ref || undefined,
        })
      } else {
        props.runtime.registry.add({
          name: name(),
          target: target(),
          credentialRef: ref || undefined,
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
    save()
  }

  return (
    <div
      class="flex w-full min-w-0 flex-col gap-4 rounded-[12px] border border-token p-4"
      role="dialog"
      aria-label={editing ? t("hostDialog.editTitle") : t("hostDialog.addTitle")}
    >
      <h4 class="text-14-strong">{editing ? t("hostDialog.editTitle") : t("hostDialog.addTitle")}</h4>
      <div class="flex w-full min-w-0 flex-col gap-2">
        <label for="mobile-host-name" class="text-13-muted">
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
        <label for="mobile-host-target" class="text-13-muted">
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
        <label for="mobile-host-credential-ref" class="text-13-muted">
          {t("hostDialog.credentialRef")}
        </label>
        <TextInput
          id="mobile-host-credential-ref"
          type="text"
          appearance="large"
          class="!w-full self-stretch"
          dir="ltr"
          spellcheck={false}
          autocapitalize="off"
          value={credentialRef()}
          onInput={(event) => setCredentialRef(event.currentTarget.value)}
          onKeyDown={keyDown}
        />
        <span id="mobile-host-credential-ref-hint" class="text-12-muted">
          {t("hostDialog.credentialRefHint")}
        </span>
        <Show when={error()}>
          <span role="alert" class="text-12-muted">
            {error()}
          </span>
        </Show>
      </div>
      <div class="flex items-center justify-end gap-2">
        <Button variant="neutral" onClick={() => props.onClose()}>
          {t("hostDialog.cancel")}
        </Button>
        <Button variant="contrast" onClick={save}>
          {t("hostDialog.save")}
        </Button>
      </div>
    </div>
  )
}
