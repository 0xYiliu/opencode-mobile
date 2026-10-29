import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import h from "solid-js/h"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MobileHosts } from "../runtime"

type ServiceAuthRuntime = Pick<
  MobileHosts,
  "locale" | "serviceAuthRequiredOf" | "cancelServiceAgain" | "checkServiceAgain" | "disconnect"
>

/** Session-only OpenCode service authentication; separate from the SSH credential. */
export function ServiceAuthPrompt(props: {
  runtime: ServiceAuthRuntime
  hostId: Accessor<string>
  active?: Accessor<boolean>
  showDisconnect?: boolean
}) {
  const t = createTranslator(props.runtime.locale)
  const active = () => props.active?.() ?? true
  const [message, setMessage] = createSignal("")
  const [checking, setChecking] = createSignal(false)
  let inputElement: HTMLInputElement | undefined
  let generation = 0
  let checkingHost: string | undefined
  let observedHost = props.hostId()
  let observedActive = active()

  const invalidate = () => {
    generation++
    if (checkingHost) props.runtime.cancelServiceAgain(checkingHost)
    checkingHost = undefined
    setChecking(false)
    setMessage("")
    clearPassword()
  }

  const inputId = () => `service-auth-password-${props.hostId()}`
  const passwordInput = () => (document.getElementById(inputId()) as HTMLInputElement | null) ?? inputElement
  const clearPassword = () => {
    const input = passwordInput()
    if (input) input.value = ""
  }

  createEffect(() => {
    const currentHost = props.hostId()
    const currentActive = active()
    if (currentHost !== observedHost || currentActive !== observedActive) {
      invalidate()
      observedHost = currentHost
      observedActive = currentActive
    }
  })

  onCleanup(() => {
    generation++
    if (checkingHost) props.runtime.cancelServiceAgain(checkingHost)
    checkingHost = undefined
    clearPassword()
  })

  const checkAgain = (event?: Event) => {
    const hostId = props.hostId()
    if (!active() || !props.runtime.serviceAuthRequiredOf(hostId)) return
    const currentGeneration = ++generation
    const trigger = event?.currentTarget as HTMLElement | null | undefined
    const submitted = trigger?.closest("section")?.querySelector<HTMLInputElement>('input[type="password"]')?.value
      ?? passwordInput()?.value
      ?? ""
    checkingHost = hostId
    setChecking(true)
    setMessage("")
    void props.runtime.checkServiceAgain(hostId, submitted || undefined).then(
      (ok) => {
        if (currentGeneration !== generation || !active() || props.hostId() !== hostId) return
        checkingHost = undefined
        setChecking(false)
        setMessage(ok ? t("initialSsh.serviceReady") : t("initialSsh.serviceStillAuth"))
        if (ok) clearPassword()
      },
      () => {
        if (currentGeneration !== generation || !active() || props.hostId() !== hostId) return
        checkingHost = undefined
        setChecking(false)
        setMessage(t("initialSsh.serviceStillAuth"))
      },
    )
  }

  const disconnect = () => {
    if (!active()) return
    invalidate()
    props.runtime.disconnect(props.hostId())
  }

  const content = () => h("section", {
    class: "flex min-w-0 flex-col gap-2 rounded-[8px] border border-border-weak-base p-3",
    "aria-label": t("initialSsh.serviceAuth"),
    get hidden() { return !active() },
  },
  h("p", { role: "alert", class: "text-12-regular text-text-strong" }, t("initialSsh.serviceAuth")),
  h("label", { for: inputId(), class: "text-12-regular text-text-weak" }, t("hostDialog.credentialPassword")),
  h("input", {
    id: inputId(),
    type: "password",
    autocomplete: "current-password",
    ref: (element: HTMLInputElement) => { inputElement = element },
    get disabled() { return !active() || checking() },
  }),
  h("div", { class: "flex flex-wrap gap-2" },
    h(Button, { variant: "neutral", get disabled() { return !active() || checking() }, onClick: (event: MouseEvent) => checkAgain(event) },
      () => checking() ? t("initialSsh.checking") : t("initialSsh.checkAgain")),
    props.showDisconnect === false ? null : h(Button, { variant: "neutral", get disabled() { return !active() }, onClick: (_event: MouseEvent) => disconnect() },
      t("initialSsh.disconnectLocal")),
  ),
  h("p", { role: "status", class: "text-12-regular text-text-weak", get hidden() { return !message() } }, () => message()),
  )

  return content()
}
