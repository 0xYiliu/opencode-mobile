import { plugin } from "bun"
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createComponent, createRoot, createSignal, Suspense } from "solid-js"
import { insert } from "solid-js/web"
import { createRequire } from "node:module"
import type { SshItem } from "../../../../gui-plugins/src/ssh/contract"
import en from "../../../../gui-plugins/src/ssh/i18n/en"

// Standalone browser-condition rendered tests. Fixtures below are not production backend successes.
const require = createRequire(import.meta.resolve("vite-plugin-solid"))
const babel = require("@babel/core")
plugin({ name: "ssh-ui-rendered", setup(build) {
  build.onLoad({ filter: /packages\/.*\.tsx$/ }, async (args) => ({
    contents: babel.transformSync(await Bun.file(args.path).text(), {
      filename: args.path, presets: [require.resolve("babel-preset-solid"), require.resolve("@babel/preset-typescript")], configFile: false, babelrc: false,
    }).code, loader: "js",
  }))
} })

let pushed: (() => unknown)[] = []
let closed = 0
let toasts = 0
let locale = () => "en"
const catalogRequests: Record<string, Array<(value: { default: Record<string, string> }) => void>> = {}
const delayedCatalog = (key: string) => () => new Promise<{ default: Record<string, string> }>((resolve) => {
  ;(catalogRequests[key] ??= []).push(resolve)
})
mock.module("../../../../gui-plugins/src/ssh/index", () => ({ default: { i18n: { en, zh: delayedCatalog("zh"), fr: delayedCatalog("fr") } } }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ locale: () => locale(), t: (key: string) => key }) }))
mock.module("@opencode/ui/context/dialog", () => ({ useDialog: () => ({ push: (render: () => unknown) => { pushed.push(render) }, close: () => closed++ }) }))
mock.module("@opencode/ui/toast", () => ({ showToast: () => { toasts++ } }))
// Keep original DialogSsh JSX, replace only its outer dialog/focus-management host.
mock.module("@opencode/ui/dialog", () => {
  const box = (props: { children: unknown }) => props.children
  return { Dialog: box, DialogBody: box, DialogFooter: box, DialogHeader: box, DialogTitle: box }
})
const { createMobileHosts, createMemoryStorage } = await import("@opencode-mobile/mobile-hosts")
const { useMobileSshUi, mobileSshItems, MobileSshSettingsRow } = await import("./mobile-ssh")
const { DialogSsh } = await import("../../../../gui-plugins/src/ssh/dialog")
const { createSshController } = await import("../../../../gui-plugins/src/ssh/state")

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); document.body.replaceChildren(); pushed = []; closed = 0; toasts = 0; locale = () => "en"; for (const key of Object.keys(catalogRequests)) delete catalogRequests[key] })
function mount(render: () => unknown) {
  const host = document.createElement("div")
  document.body.append(host)
  createRoot((stop) => { dispose = stop; insert(host, render() as never) })
  return host
}
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((el) => el.textContent === text)!
const input = (host: HTMLElement, id: string, value: string) => {
  const el = host.querySelector<HTMLInputElement>(`#${id}`)!
  el.value = value
  el.dispatchEvent(new InputEvent("input", { bubbles: true }))
}

describe("production Settings SSH boundary", () => {
  test("delayed initial and switched catalogs never suspend rows or reuse the previous language", async () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const saved = runtime.registry.add({ name: "Catalog fixture", target: "example@example.invalid", servicePort: 4096 })
    let select!: (next: string) => void
    const host = mount(() => {
      const [current, setCurrent] = createSignal("zh")
      locale = current
      select = setCurrent
      return createComponent(Suspense, {
        fallback: "SUSPENDED SETTINGS",
        get children() {
          const ui = useMobileSshUi()
          const label = document.createElement("span")
          insert(label, () => ui.translate("add"))
          return [label, createComponent(MobileSshSettingsRow, { server: `mobile-ssh:${saved.id}`, health: () => undefined })]
        },
      })
    })
    await Promise.resolve()
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
    expect(host.textContent).toContain("Catalog fixture")
    expect(host.textContent).toContain("Add SSH server")
    for (const resolve of catalogRequests.zh!) resolve({ default: { ...en, add: "ZH fixture add", label: "ZH fixture label" } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.textContent).toContain("ZH fixture add")
    select("fr")
    await Promise.resolve()
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
    expect(host.textContent).toContain("Catalog fixture")
    expect(host.textContent).toContain("Add SSH server")
    expect(host.textContent).not.toContain("ZH fixture")
    for (const resolve of catalogRequests.fr!) resolve({ default: { ...en, add: "FR fixture add", label: "FR fixture label" } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.textContent).toContain("FR fixture add")
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
  })

  test("Add fails immediately, retains editable draft and retries; Cancel has no runtime or persistence effect", async () => {
    const storage = createMemoryStorage()
    const runtime = createMobileHosts({ storage })
    const before = JSON.stringify(runtime.registry.list())
    const host = mount(() => {
      const ui = useMobileSshUi()
      void ui.open()
      return pushed.pop()!()
    })
    await Promise.resolve()
    expect(button(host, "Add server").disabled).toBe(true)
    input(host, "ssh-target", "ssh example@example.invalid")
    input(host, "ssh-name", "Draft only")
    button(host, "Add server").click()
    await Promise.resolve()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("common.requestFailed")
    expect(closed).toBe(0)
    expect(host.querySelector<HTMLInputElement>("#ssh-target")!.disabled).toBe(false)
    button(host, "Add server").click()
    expect(toasts).toBe(2)
    expect(JSON.stringify(runtime.registry.list())).toBe(before)
    button(host, "common.cancel").click()
    dispose?.()
    await Promise.resolve()
    expect(JSON.stringify(runtime.registry.list())).toBe(before)
  })

  test("saved host config and identity are read without mutation", () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const host = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const item = mobileSshItems(runtime)[0]!
    expect(item.config.id).toBe(host.id)
    expect(item.config.target).toBe(host.target)
    expect(item.stage).toBe("disconnected")
  })

  test("real mobile row exposes upstream Connect/Delete; both fail without changing its owner", async () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const before = JSON.stringify(runtime.registry.list())
    const host = mount(() => createComponent(MobileSshSettingsRow, { server: `mobile-ssh:${saved.id}`, health: () => undefined }))
    const menu = () => host.querySelector("button")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0 }))
    menu()
    await Promise.resolve()
    const select = (text: string) => [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === text)!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    select("Connect")
    await Promise.resolve()
    expect(toasts).toBe(1)
    expect(pushed.length).toBe(0)
    menu()
    await Promise.resolve()
    select("Delete")
    await Promise.resolve()
    expect(toasts).toBe(2)
    expect(JSON.stringify(runtime.registry.list())).toBe(before)
    expect(runtime.stateOf(saved.id)).toBe("idle")
  })

  test("a reused row follows a changed mobile host key without retaining the previous host", async () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const first = runtime.registry.add({ name: "First fixture", target: "first@example.invalid", servicePort: 4096 })
    const second = runtime.registry.add({ name: "Second fixture", target: "second@example.invalid", servicePort: 4096 })
    let select!: (key: string) => void
    const host = mount(() => {
      const [key, setKey] = createSignal(`mobile-ssh:${first.id}`)
      select = setKey
      return createComponent(MobileSshSettingsRow, { get server() { return key() }, health: () => undefined })
    })
    expect(host.querySelector(".settings-servers-name")!.textContent).toBe(first.name)
    select(`mobile-ssh:${second.id}`)
    await Promise.resolve()
    expect(host.querySelector(".settings-servers-name")!.textContent).toBe(second.name)
  })
})

describe("upstream SSH state fixtures (no real backend)", () => {
  for (const stage of ["ready", "incompatible", "authentication"] as const) {
    test(`${stage}: unavailable connect/respond never completes or closes`, async () => {
      const item: SshItem = { config: { id: "fixture", target: "example.invalid", name: "Fixture" }, saved: true, stage, detail: "",
        ...(stage === "authentication" ? { prompt: { id: "challenge", text: "Synthetic identity challenge", confirm: true } } : {}) }
      const host = mount(() => {
        const ssh = createSshController({ items: () => [item], api: () => undefined, refresh: async () => {}, error: () => { toasts++ } })
        return createComponent(DialogSsh, { ssh, config: item.config, translate: (key) => key })
      })
      button(host, stage === "authentication" ? "trust" : stage === "incompatible" ? "update" : "connect").click()
      await Promise.resolve()
      expect(host.querySelector('[role="alert"]')?.textContent).toBe("common.requestFailed")
      expect(closed).toBe(0)
      expect(toasts).toBe(1)
    })
  }

  test("new password challenge clears the prior draft and remains masked", async () => {
    let change!: (item: SshItem) => void
    const config = { id: "fixture", target: "example.invalid", name: "Fixture" }
    const host = mount(() => {
      const [item, setItem] = createSignal<SshItem>({ config, saved: true, stage: "authentication", detail: "", prompt: { id: "one", text: "Synthetic password", confirm: false } })
      change = setItem
      const ssh = createSshController({ items: () => [item()], api: () => undefined, refresh: async () => {}, error: () => {} })
      return createComponent(DialogSsh, { ssh, config, promptOnly: true, translate: (key) => key })
    })
    input(host, "ssh-response", "synthetic-not-a-secret")
    expect(host.querySelector<HTMLInputElement>("#ssh-response")!.type).toBe("password")
    change({ config, saved: true, stage: "authentication", detail: "", prompt: { id: "two", text: "Next synthetic password", confirm: false } })
    await Promise.resolve()
    expect(host.querySelector<HTMLInputElement>("#ssh-response")!.value).toBe("")
  })
})
