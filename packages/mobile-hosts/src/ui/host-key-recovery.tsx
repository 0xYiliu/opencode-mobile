import { Show, createSignal, onCleanup } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MobileHosts } from "../runtime"
import { createHostKeyRecoveryFlow } from "./host-key-recovery-flow"

/** Two-step danger confirmation before removing a changed host's stored trust. */
export function HostKeyRecovery(props: { runtime: MobileHosts; hostId: string }) {
  const t = createTranslator(props.runtime.locale)
  const flow = createHostKeyRecoveryFlow(() => props.runtime.forgetHostKey(props.hostId))
  const [phase, setPhase] = createSignal(flow.phase())
  const unsubscribe = flow.subscribe(setPhase)
  onCleanup(unsubscribe)
  const confirming = () => phase() === "confirming" || phase() === "failed"
  const busy = () => phase() === "busy"
  const removed = () => phase() === "removed"
  const failed = () => phase() === "failed"

  return (
    <div class="flex flex-col gap-2">
      <p role="alert" class="text-12-regular text-text-strong">{t("hostKey.changed.note")}</p>
      <Show when={removed()}>
        <p role="status" class="text-12-regular text-text-weak">{t("hostKey.changed.removed")}</p>
      </Show>
      <Show when={!removed()}>
        <Show
          when={confirming()}
          fallback={<Button variant="danger" disabled={busy()} onClick={() => flow.begin()}>{t("hostKey.changed.recover")}</Button>}
        >
          <p role="alert" class="text-12-regular text-text-strong">{t("hostKey.changed.confirmNote")}</p>
          <div class="flex flex-wrap gap-2">
            <Button variant="neutral" disabled={busy()} onClick={() => flow.cancel()}>
              {t("hostKey.changed.cancel")}
            </Button>
            <Button variant="danger" disabled={busy()} onClick={() => void flow.confirm()}>
              {t("hostKey.changed.confirmRemove")}
            </Button>
          </div>
          <Show when={failed()}><p role="alert">{t("hostKey.changed.failed")}</p></Show>
        </Show>
      </Show>
    </div>
  )
}
