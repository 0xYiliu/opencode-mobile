// Host key prompt: confirmation UI for the state machine's `hostKeyUnverified` state.
//
// This phase it is a stub-only stakeout: the HostKeyVerifier stub rejects everything, so
// the state machine never reaches hostKeyUnverified and this prompt is unreachable in the
// shipped build. There is deliberately NO "skip verification" affordance — real fingerprint
// verification data arrives with the SSH transport (issue #6, BLOCKED).

import { Show, createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MobileHosts } from "../runtime"

export function HostKeyPrompt(props: { runtime: MobileHosts; hostId: string; fingerprint: string; onClose: () => void }) {
  const t = createTranslator(props.runtime.locale)
  // The fingerprint lives in memory only; keeping it in a signal mirrors that lifetime.
  const [fingerprint] = createSignal(props.fingerprint)

  return (
    <div
      class="flex w-full min-w-0 flex-col gap-4 rounded-[12px] border border-border-weak-base p-4"
      role="alertdialog"
      aria-label={t("hostKey.title")}
    >
      <h4 class="text-14-medium text-text-strong">{t("hostKey.title")}</h4>
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-12-regular text-text-weak">{t("hostKey.fingerprint")}</span>
        <code class="truncate text-12-mono text-text-strong" dir="ltr">
          {fingerprint()}
        </code>
      </div>
      <p class="text-12-regular text-text-weak">{t("hostKey.note")}</p>
      <Show when={props.runtime.stateOf(props.hostId) === "hostKeyUnverified"}>
        <div class="flex items-center justify-end gap-2">
          <Button
            variant="neutral"
            onClick={() => {
              props.runtime.rejectHostKey(props.hostId)
              props.onClose()
            }}
          >
            {t("hostKey.reject")}
          </Button>
          <Button
            variant="contrast"
            onClick={() => {
              props.runtime.confirmHostKey(props.hostId)
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
