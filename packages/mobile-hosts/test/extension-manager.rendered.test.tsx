import { describe, expect, mock, test } from "bun:test"
import { plugin } from "bun"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createComponent } from "solid-js"
import h from "solid-js/h"
import { render } from "solid-js/web"
import { messages, type Locale } from "../src/i18n"
import { createMobileHosts } from "../src/runtime"
import type { MobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"
import { GUIEXT_STORAGE_KEY, createExtensionDisabled, createExtensionDisabledStore } from "../src/extensions/manager"

// Issue #62/N12: the static WSL exclusion row (decision 0001). The row is a PRESENTATION
// of a product-scope exclusion, not a host state: it renders the id, the fixed disabled
// status and the reason copy, and carries ZERO controls. These rendered tests are the
// default machine check (code-review MAJOR-2): zero button, zero switch and zero reload
// invocations inside the excluded row, while the host-definition rows keep theirs.
//
// Test environment (both precedents are vendored, borrowed in spirit):
// - the Bun plugin below is the packages/ui test/solid-jsx.ts precedent, narrowed to the
//   one JSX-bearing source this file imports. Solid's compiler normally replaces JSX and
//   `solid-js/jsx-runtime` has no runtime exports; Bun 1.4.2's Transpiler ignores an
//   inline tsconfig `jsx: "react-jsx"` (verified empirically — it still emits classic
//   React.createElement), so the transform uses the classic form with `jsxFactory: "h"`
//   against Solid's hyperscript runtime, prepending the h import the classic form needs;
// - the happy-dom global registration is the packages/app happydom.ts preload precedent,
//   registered here for the render calls (never unregistered, same as the precedent).
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  trimUnusedImports: true,
  tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "h" } },
})

plugin({
  name: "extension-manager-rendered-solid-jsx",
  setup(build) {
    build.onLoad({ filter: /extension-manager\.tsx$/ }, async (args) => ({
      contents: 'import h from "solid-js/h";\n' + transpiler.transformSync(await Bun.file(args.path).text()),
      loader: "js",
    }))
  },
})

GlobalRegistrator.register()

let reloadCalls = 0

mock.module("@opencode/ui/button", () => ({
  Button: (props: { onClick?: (event: MouseEvent) => void; children?: unknown }) =>
    h(
      "button",
      {
        type: "button",
        "data-testid": "row-button",
        "on:click": () => {
          reloadCalls += 1
          props.onClick?.(new MouseEvent("click"))
        },
      },
      props.children,
    ),
}))

mock.module("@opencode/ui/switch", () => ({
  Switch: (props: { checked?: boolean; disabled?: boolean; onChange?: (next: boolean) => void; children?: unknown }) =>
    h(
      "input",
      {
        type: "checkbox",
        role: "switch",
        "data-testid": "row-switch",
        checked: props.checked,
        disabled: props.disabled,
        onChange: () => {
          props.onChange?.(!props.checked)
        },
      },
      props.children,
    ),
}))

// Dynamic import AFTER the plugin + mock registration (service-auth-prompt.rendered.tsx
// precedent): the component source is the only JSX-bearing module under test.
const { ExtensionManager, capabilityOf } = await import("../src/ui/extension-manager")

// The 12 host-definition ids the os filter delivers on web/mobile (wsl absent — the
// upstream os filter is untouched by this issue).
const DEFINITIONS = ["context", "btw", "debug", "terminal", "file", "review", "details", "browser", "pairing", "updater", "ssh", "microsoft-office"]

function fixture(locale: Locale, definitions: readonly string[] = DEFINITIONS) {
  createMobileHosts({ locale })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const dispose = render(
    () =>
      createComponent(ExtensionManager, {
        definitions: definitions.map((id) => ({ id })),
        statusOf: (id: string) => (id === "terminal" ? "active" : undefined),
        failureOf: () => undefined,
        onReload: () => {},
      }),
    host,
  )
  return { host, dispose: () => { dispose(); host.remove() } }
}

function excludedRow(host: HTMLElement) {
  return host.querySelector<HTMLLIElement>('li[data-component="extension-row"][data-extension-id="wsl"][data-capability="excluded"]')
}

describe("guiext excluded capability mapping (issue #62/N12)", () => {
  test("wsl maps to excluded and the other 12 builtins keep their capability", () => {
    expect(capabilityOf("wsl")).toBe("excluded")
    for (const id of ["context", "btw", "debug", "terminal", "file", "review", "details", "microsoft-office"]) {
      expect(capabilityOf(id)).toBe("web")
    }
    for (const id of ["browser", "pairing", "ssh", "updater"]) {
      expect(capabilityOf(id)).toBe("desktop-host")
    }
  })

  test("the exclusion reason key exists symmetrically in en and zh", () => {
    expect(messages.en["guiext.excluded.wsl.reason"]).toContain("Excluded by product decision")
    expect(messages.en["guiext.excluded.wsl.reason"]).toContain("Native Windows remote hosts stay supported")
    expect(messages.zh["guiext.excluded.wsl.reason"]).toContain("产品决策排除")
    expect(messages.zh["guiext.excluded.wsl.reason"]).toContain("原生 Windows 远程主机支持保留")
  })

  test("prototype-chain member names are never exclusions (hasOwn membership)", () => {
    // `in` would classify inherited Object.prototype members as excluded; membership is
    // own-property only: "constructor"/"toString" fall through to the conservative
    // "web" default and no such row exists in the rendered face.
    expect(capabilityOf("constructor")).toBe("web")
    expect(capabilityOf("toString")).toBe("web")
    expect(capabilityOf("constructor")).not.toBe("excluded")
    const view = fixture("en")
    expect(view.host.querySelector('li[data-extension-id="constructor"]')).toBeNull()
    expect(view.host.querySelectorAll('li[data-capability="excluded"]').length).toBe(1)
    view.dispose()
  })
})

describe("WSL static exclusion row (issue #62/N12)", () => {
  test("renders the wsl row with excluded capability, disabled status and reason (en)", () => {
    const view = fixture("en")
    const row = excludedRow(view.host)
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain("wsl")
    expect(row!.textContent).toContain(messages.en["guiext.status.disabled"])
    expect(row!.textContent).toContain(messages.en["guiext.excluded.wsl.reason"])
    view.dispose()
  })

  test("renders the zh reason copy under the zh locale", () => {
    const view = fixture("zh")
    const row = excludedRow(view.host)
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain(messages.zh["guiext.status.disabled"])
    expect(row!.textContent).toContain(messages.zh["guiext.excluded.wsl.reason"])
    view.dispose()
  })

  test("the excluded row carries zero controls: no button, no switch, no alert role", () => {
    const view = fixture("en")
    const row = excludedRow(view.host)!
    expect(row!.querySelector('[data-testid="row-button"]')).toBeNull()
    expect(row!.querySelector('[data-testid="row-switch"]')).toBeNull()
    expect(row!.querySelectorAll("button").length).toBe(0)
    expect(row!.querySelectorAll("input").length).toBe(0)
    expect(row!.getAttribute("role")).toBeNull()
    view.dispose()
  })

  test("clicking anywhere in the excluded row never reaches the reload action", () => {
    const view = fixture("en")
    const row = excludedRow(view.host)!
    reloadCalls = 0
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(reloadCalls).toBe(0)
    view.dispose()
  })

  test("host-definition rows keep their controls while the excluded row stays bare", () => {
    const view = fixture("en")
    const rows = [...view.host.querySelectorAll<HTMLLIElement>('li[data-component="extension-row"]')]
    expect(rows.length).toBe(DEFINITIONS.length + 1)
    const webRow = view.host.querySelector<HTMLLIElement>('li[data-extension-id="context"]')!
    expect(webRow.dataset.capability).toBe("web")
    expect(webRow.querySelectorAll('[data-testid="row-button"]').length).toBe(1)
    expect(webRow.querySelectorAll('[data-testid="row-switch"]').length).toBe(1)
    const desktopRow = view.host.querySelector<HTMLLIElement>('li[data-extension-id="browser"]')!
    expect(desktopRow.dataset.capability).toBe("desktop-host")
    expect(desktopRow.querySelectorAll('[data-testid="row-button"]').length).toBe(1)
    expect(desktopRow.querySelectorAll('[data-testid="row-switch"]').length).toBe(1)
    view.dispose()
  })

  test("defensive shape: a definition-delivered wsl renders the excluded branch (zero controls)", () => {
    // Hypothetical upstream change: the os filter stops excluding wsl. The static row must
    // disappear instead of duplicating the id, and the definition-driven row must render
    // through the excluded branch: no reload button, no switch (not even a disabled one),
    // and the reason copy instead of the "runs on this device" capability label.
    const view = fixture("en", [...DEFINITIONS, "wsl"])
    expect(view.host.querySelectorAll('li[data-extension-id="wsl"]').length).toBe(1)
    const row = view.host.querySelector<HTMLLIElement>('li[data-extension-id="wsl"]')!
    expect(row.dataset.capability).toBe("excluded")
    expect(row.querySelectorAll('[data-testid="row-button"]').length).toBe(0)
    expect(row.querySelectorAll('[data-testid="row-switch"]').length).toBe(0)
    expect(row.textContent).toContain(messages.en["guiext.excluded.wsl.reason"])
    expect(row.textContent).not.toContain(messages.en["guiext.capability.web"])
    view.dispose()
  })
})

describe("guiext toggle end-to-end (issue #96)", () => {
  // The real chain, no mock pre-inversion on any leg: a DOM click sequence reaches the
  // REAL component handler, which drives the REAL reactive store (the shell-wide
  // singleton the component reads via sharedExtensionDisabled()) over an isolated memory
  // port — the same wiring root.tsx boots in the app (window.localStorage there, a
  // StoragePort here). The Switch stand-in's onChange(!props.checked) is the faithful
  // Kobalte contract (onChange delivers the NEW checked value); the assertions below
  // never encode that inversion themselves — they read the store, the persisted payload
  // and a fresh mount's rendered face.
  const storage = createMemoryStorage()
  const records = createExtensionDisabled(storage)

  const persisted = () => JSON.parse(storage.getItem(GUIEXT_STORAGE_KEY)!) as { version: number; disabled: string[] }
  const rowSwitch = (host: HTMLElement, id: string) =>
    host.querySelector<HTMLInputElement>(`li[data-extension-id="${id}"] input[data-testid="row-switch"]`)!

  test("real click disables, persists, survives a restart; clicking back re-enables and persists the empty set", () => {
    expect(records.ids()).toEqual([])
    const view = fixture("en")
    const sw = rowSwitch(view.host, "context")
    expect(sw.checked).toBe(true) // enabled at mount (checked ⇔ enabled)
    expect(sw.disabled).toBe(false) // web row + shell instance present

    // A real click is two legs in a browser: the activation behavior toggles the input
    // and the browser then fires a change event carrying the new value. happy-dom
    // implements the first leg only (verified: input.click() flips checked, fires no
    // change) — the second leg is dispatched here, reaching the component's real
    // onChange → setDisabled → records.toggle → saveGuiext chain.
    sw.click()
    sw.dispatchEvent(new Event("change"))

    expect(records.disabled().has("context")).toBe(true)
    expect(persisted()).toEqual({ version: 1, disabled: ["context"] })

    // Restart equivalent: a fresh store over the SAME storage is exactly what a new
    // process loads (extensions/manager loadGuiext on construction), and a fresh mount
    // of the manager must render the persisted state — the switch comes up unchecked.
    expect(createExtensionDisabledStore(storage).ids()).toEqual(["context"])
    const restarted = fixture("en")
    expect(rowSwitch(restarted.host, "context").checked).toBe(false)

    // Toggle back through the same real-click arc: the previously disabled row's switch
    // reads checked=false at event time, the handler passes the flipped intent, and the
    // persisted payload returns to the empty set.
    const back = rowSwitch(restarted.host, "context")
    back.click()
    back.dispatchEvent(new Event("change"))
    expect(records.disabled().has("context")).toBe(false)
    expect(persisted()).toEqual({ version: 1, disabled: [] })
    expect(createExtensionDisabledStore(storage).ids()).toEqual([])
    const reenabled = fixture("en")
    expect(rowSwitch(reenabled.host, "context").checked).toBe(true)

    view.dispose()
    restarted.dispose()
    reenabled.dispose()
  })

  test("a desktop-host row's switch is rendered non-interactive and a raw click leg never reaches the records", () => {
    const view = fixture("en")
    const sw = rowSwitch(view.host, "browser")
    expect(sw.disabled).toBe(true) // desktopHost || !records — the honest not-toggleable face
    sw.click() // disabled form control: activation suppressed, no change leg follows
    expect(records.ids()).toEqual([])
    view.dispose()
  })
})
