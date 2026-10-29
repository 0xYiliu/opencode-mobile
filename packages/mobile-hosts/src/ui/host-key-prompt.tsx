// Host key prompt: confirmation UI for the state machine's `hostKeyUnverified` state.
//
// First-contact confirmation for a native-verified unknown host key. Host ID and fingerprint
// are snapshotted together; the prompt never offers a skip-verification path. Changed-key
// recovery is a separate, two-step danger-confirmed flow.

import { Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MobileHosts } from "../runtime"
import { bindHostKeyPrompt } from "./host-key-binding"

export function HostKeyPrompt(props: { runtime: MobileHosts; hostId: string; onClose: () => void }) {
  const t = createTranslator(props.runtime.locale)
  // Snapshot the host ID and fingerprint together; even a stale mounted component can never
  // render one host's fingerprint while confirming another host's trust.
  const binding = bindHostKeyPrompt(props.runtime, props.hostId)

  return (
    <div
      class="flex w-full min-w-0 flex-col gap-4 rounded-[12px] border border-border-weak-base p-4"
      role="alertdialog"
      aria-label={t("hostKey.title")}
    >
      <h4 class="text-14-medium text-text-strong">{t("hostKey.title")}</h4>
      <dl class="flex min-w-0 flex-col gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <dt class="text-12-regular text-text-weak">{t("hostKey.hostName")}</dt>
          <dd class="break-all whitespace-normal text-12-regular text-text-strong">{binding.hostName}</dd>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <dt class="text-12-regular text-text-weak">{t("hostKey.hostTarget")}</dt>
          <dd class="break-all whitespace-normal text-12-regular text-text-strong" dir="ltr">{binding.target}</dd>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <dt class="text-12-regular text-text-weak">{t("hostKey.sshPort")}</dt>
          <dd class="text-12-regular text-text-strong" dir="ltr">{binding.sshPort}</dd>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <dt class="text-12-regular text-text-weak">{t("hostDialog.servicePort")}</dt>
          <dd class="text-12-regular text-text-strong" dir="ltr">{binding.servicePort}</dd>
        </div>
      </dl>
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-12-regular text-text-weak">{t("hostKey.fingerprint")}</span>
        <code class="w-full min-w-0 break-all whitespace-normal select-text text-12-mono text-text-strong" dir="ltr">
          {binding.fingerprint}
        </code>
      </div>
      <p class="text-12-regular text-text-weak">{t("hostKey.note")}</p>
      <Show when={props.runtime.stateOf(props.hostId) === "hostKeyUnverified"}>
        <div class="flex items-center justify-end gap-2">
          <Button
            variant="neutral"
            onClick={() => {
              binding.reject()
              props.onClose()
            }}
          >
            {t("hostKey.reject")}
          </Button>
          <Button
            variant="contrast"
            onClick={() => {
              binding.confirm()
              props.onClose()
            }}
          >
            {t("hostKey.confirm")}
          </Button>
        </div>
      </Show>
    </div>
  )
}
