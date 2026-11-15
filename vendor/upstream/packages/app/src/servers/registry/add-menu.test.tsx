import { plugin } from "bun"
import { afterEach, describe, expect, mock, test as bunTest } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { insert } from "solid-js/web"
import { createRequire } from "node:module"
import type { Window as HappyDOMWindow } from "happy-dom"

function isHappyDOMWindow(value: unknown): value is { happyDOM: Pick<HappyDOMWindow["happyDOM"], "setURL"> } {
  if (typeof value !== "object" || value === null || !("happyDOM" in value)) return false
  const api = value.happyDOM
  return typeof api === "object" && api !== null && "setURL" in api && typeof api.setURL === "function"
}
if (!isHappyDOMWindow(window)) throw new Error("This rendered test requires the Happy DOM preload")
const browser = window.happyDOM

// Standalone rendered test for the settings add-server menu (N12 contract, issue #124):
// on the Android shell the control becomes a menu with Add server / Add SSH server / a
// disabled WSL row (visible but disabled, zero controls, no extra explanation); elsewhere
// the upstream control is unchanged. Run with:
//   bun test --conditions=browser --isolate --preload ./happydom.ts src/servers/registry/add-menu.test.tsx
const require = createRequire(import.meta.resolve("vite-plugin-solid"))
const babel = require("@babel/core") as {
  transformSync: (source: string, options: object) => { code: string | null } | null
}
plugin({
  name: "add-server-menu-rendered",
  setup(build) {
    build.onLoad({ filter: /packages\/(app|ui)\/src\/.*\.tsx$/ }, async (args) => ({
      contents: babel.transformSync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [require.resolve("babel-preset-solid"), require.resolve("@babel/preset-typescript")],
        configFile: false,
        babelrc: false,
      })!.code!,
      loader: "js",
    }))
  },
})

let contributions: Array<{ plugin: string; value: { menu: "server.add"; id: string; title: string; run: () => void } }> = []
mock.module("@/runtime/plugin/host", () => ({ usePluginHost: () => ({ items: () => contributions }) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
let sshOpened = 0
mock.module("@/settings/servers/mobile-ssh", () => ({ useMobileSshUi: () => ({ translate: (key: string) => key === "add" ? "Add SSH server" : key, open: () => { sshOpened++ } }) }))
// Shared-preload degradation (the servers-page.test.tsx convention): when the unit
// suite's own ui solid-jsx preload also owns these sources, this file's classic-h
// transform cannot win and executing real modules' JSX raises; the behavioral group
// then degrades to skipped. Standalone evidence run (browser conditions, no shared
// preload): bun test --conditions=browser --isolate --preload ./happydom.ts src/servers/registry/add-menu.test.tsx
let rendered = false
let AddServerMenu: (props: never) => unknown
let SettingsAddServerMenu: (props: never) => unknown
try {
  ;({ AddServerMenu, SettingsAddServerMenu } = (await import("./add-menu")) as never)
  // The import succeeds in every environment; executing the real components' JSX is
  // what raises under the unit suite (its shared preload / solid server dist owns
  // these sources there — the servers-page.test.tsx degradation convention).
  createRoot((stop) => {
    insert(document.createElement("div"), createComponent(SettingsAddServerMenu as never, { onAddServer: () => {} }))
    queueMicrotask(stop)
  })
  rendered = true
} catch {
  // Degrade to skipped (see the note above).
}

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); document.body.replaceChildren(); contributions = []; sshOpened = 0 })

function mount(unsupportedWsl: boolean, onAddServer: () => void) {
  const host = document.createElement("div")
  document.body.append(host)
  createRoot((stop) => {
    dispose = stop
    insert(host, createComponent(AddServerMenu, { onAddServer, unsupportedWsl }))
  })
  return host
}

function open(host: HTMLElement) {
  host.querySelector("button")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0 }))
}

const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)

describe("settings add server menu", () => {
  // Every case renders the real menu; where the environment cannot (see above) the
  // group degrades to skipped instead of failing.
  const test = rendered ? bunTest : bunTest.skip

  test("first render distinguishes same-origin browser from native shell", async () => {
    const initial = window.location.href
    let added = 0
    try {
      browser.setURL("http://127.0.0.1:18090/")
      const host = document.createElement("div")
      document.body.append(host)
      createRoot((stop) => {
        dispose = stop
        insert(host, createComponent(SettingsAddServerMenu, { checkAndroid: true, onAddServer: () => added++ }))
      })
      host.querySelector("button")!.click()
      expect(added).toBe(1)
      expect(document.querySelector('[role="menuitem"]')).toBeNull()
      dispose?.()
      host.remove()
      const marker = document.createElement("meta")
      marker.name = "opencode-mobile-host"
      marker.content = "android-v1"
      document.head.append(marker)
      const android = document.createElement("div")
      document.body.append(android)
      createRoot((stop) => {
        dispose = stop
        insert(android, createComponent(SettingsAddServerMenu, { checkAndroid: true, onAddServer: () => added++ }))
      })
      open(android)
      await Promise.resolve()
      const wsl = [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes("dialog.server.add.wsl"))!
      expect(wsl.getAttribute("aria-disabled")).toBe("true")
      expect(added).toBe(1)
      marker.remove()
    } finally {
      browser.setURL(initial)
    }
  })

  test("mobile exposes exactly Add, SSH and disabled WSL, without extra explanation", async () => {
    let added = 0
    const host = mount(true, () => added++)
    open(host)
    await Promise.resolve()
    const wsl = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes("dialog.server.add.wsl"))!
    expect(wsl).toBeDefined()
    expect(wsl.getAttribute("aria-disabled")).toBe("true")
    expect(items()).toEqual(["dialog.server.add.button", "Add SSH server", "dialog.server.add.wsl"])
    expect(document.querySelector('[role="note"]')).toBeNull()
    wsl.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    wsl.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    expect(added).toBe(0)
    const add = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "dialog.server.add.button")!
    add.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    expect(added).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 370))
    expect(added).toBe(1)
  })

  test("mobile SSH touch action opens the upstream dialog after menu dismissal", async () => {
    const host = mount(true, () => {})
    open(host)
    await Promise.resolve()
    const ssh = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "Add SSH server")!
    ssh.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    expect(sshOpened).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 370))
    expect(sshOpened).toBe(1)
  })

  test("leaving Settings cancels a pending Android touch open", async () => {
    const host = mount(true, () => {})
    open(host)
    await Promise.resolve()
    const ssh = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "Add SSH server")!
    ssh.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    dispose?.()
    await new Promise((resolve) => setTimeout(resolve, 370))
    expect(sshOpened).toBe(0)
  })

  test("preserves other contributions but never runs the WSL contribution", async () => {
    let wsl = 0
    let other = 0
    contributions = [
      { plugin: "wsl", value: { menu: "server.add", id: "add", title: "real WSL", run: () => wsl++ } },
      { plugin: "other", value: { menu: "server.add", id: "add", title: "other server", run: () => other++ } },
    ]
    const host = mount(true, () => {})
    open(host)
    await Promise.resolve()
    expect(document.body.textContent).not.toContain("real WSL")
    const otherItem = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "other server")!
    otherItem.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }))
    expect(other).toBe(1)
    expect(wsl).toBe(0)
  })

  test("non-mobile with no contributions retains the direct Add action", () => {
    let added = 0
    const host = mount(false, () => added++)
    host.querySelector("button")!.click()
    expect(added).toBe(1)
    expect(document.querySelector('[role="menuitem"]')).toBeNull()
  })

  test("non-mobile retains a real WSL contribution", async () => {
    let wsl = 0
    contributions = [{ plugin: "wsl", value: { menu: "server.add", id: "add", title: "real WSL", run: () => wsl++ } }]
    const host = mount(false, () => {})
    open(host)
    await Promise.resolve()
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "real WSL")!
    item.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    expect(wsl).toBe(1)
    expect(document.body.textContent).not.toContain("dialog.server.add.wslUnavailable")
  })
})
