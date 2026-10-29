import { describe, expect, mock, test } from "bun:test"
import { createComponent, createSignal, Show } from "solid-js"
import h from "solid-js/h"
import { render } from "solid-js/web"
import type { MobileHosts } from "../src/runtime"

mock.module("@opencode/ui/button", () => ({
  Button: (props: { disabled?: boolean; onClick?: (event: MouseEvent) => void; children?: unknown }) =>
    h("button", { type: "button", disabled: props.disabled, "on:click": props.onClick }, props.children),
}))

const { ServiceAuthPrompt } = await import("../src/ui/service-auth-prompt")

function fixture(check: (hostId: string, password?: string) => Promise<boolean>) {
  const [required, setRequired] = createSignal(true)
  const [active, setActive] = createSignal(true)
  const [hostId] = createSignal("synthetic-host")
  const runtime = {
    locale: "en",
    serviceAuthRequiredOf: () => required(),
    cancelServiceAgain: () => {},
    checkServiceAgain: async (id: string, password?: string) => {
      const ok = await check(id, password)
      if (ok) setRequired(false)
      return ok
    },
    disconnect: () => setRequired(false),
  } as unknown as Pick<MobileHosts, "locale" | "serviceAuthRequiredOf" | "cancelServiceAgain" | "checkServiceAgain" | "disconnect">
  const host = document.createElement("div")
  document.body.appendChild(host)
  const dispose = render(
    () => createComponent(Show, {
      get when() { return runtime.serviceAuthRequiredOf(hostId()) },
      get children() { return createComponent(ServiceAuthPrompt, { runtime, hostId, active }) },
    }),
    host,
  )
  return { host, dispose: () => { dispose(); host.remove() }, setActive }
}

describe("SSH saved-host service authentication", () => {
  test("renders password-only recheck and keeps a rejected draft out of visible text", async () => {
    const submitted: Array<{ hostId: string; password?: string }> = []
    const view = fixture(async (hostId, password) => {
      submitted.push({ hostId, password })
      return false
    })
    const input = view.host.querySelector<HTMLInputElement>('input[type="password"]')!
    expect(input.id).toBe("service-auth-password-synthetic-host")
    input.value = "synthetic-service-secret"
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event("input", { bubbles: true }))
    view.host.querySelector<HTMLButtonElement>("button")!.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(input.autocomplete).toBe("current-password")
    expect(submitted).toEqual([{ hostId: "synthetic-host", password: "synthetic-service-secret" }])
    expect(view.host.textContent).not.toContain("synthetic-service-secret")
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain("still asking for credentials")
    expect(input.value).toBe("synthetic-service-secret")
    const manager = await Bun.file(new URL("../src/ui/host-manager.tsx", import.meta.url)).text()
    const initialSetup = await Bun.file(new URL("../src/ui/initial-ssh-setup.tsx", import.meta.url)).text()
    expect(manager).toContain('<ServiceAuthPrompt runtime={runtime} hostId={() => host.id} showDisconnect={false} />')
    expect(initialSetup).toContain("<ServiceAuthPrompt runtime={runtime} hostId={id} active={props.active} />")
    view.dispose()
  })

  test("clears the password draft when the host scope becomes inactive", () => {
    const view = fixture(async () => false)
    const input = view.host.querySelector<HTMLInputElement>('input[type="password"]')!
    input.value = "synthetic-unsubmitted-secret"
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event("input", { bubbles: true }))
    view.setActive(false)

    expect(view.host.querySelector("section")?.hidden).toBe(true)
    expect(view.host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("")
    expect(view.host.textContent).not.toContain("synthetic-unsubmitted-secret")
    view.dispose()
  })

  test("removes the prompt after a successful session-only service recheck", async () => {
    const submitted: Array<{ hostId: string; password?: string }> = []
    const view = fixture(async (hostId, password) => {
      submitted.push({ hostId, password })
      return true
    })
    const input = view.host.querySelector<HTMLInputElement>('input[type="password"]')!
    input.value = "synthetic-service-secret"
    view.host.querySelector<HTMLButtonElement>("button")!.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(submitted).toEqual([{ hostId: "synthetic-host", password: "synthetic-service-secret" }])
    expect(view.host.querySelector("section")).toBeNull()
    expect(view.host.textContent).not.toContain("synthetic-service-secret")
    view.dispose()
  })
})
