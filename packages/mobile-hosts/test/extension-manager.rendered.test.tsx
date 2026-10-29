import { describe, expect, mock, test } from "bun:test"
import { plugin } from "bun"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createComponent } from "solid-js"
import h from "solid-js/h"
import { render } from "solid-js/web"
import { messages, type Locale } from "../src/i18n"
import { createMobileHosts } from "../src/runtime"
import type { MobileHosts } from "../src/runtime"

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
