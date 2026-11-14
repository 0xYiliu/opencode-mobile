import { describe, expect, mock, test } from "bun:test"
import { plugin } from "bun"
import { createComponent, createRoot } from "solid-js"
import { insert } from "solid-js/web"

// Issue #90 regression: the settings search index consumer must read the surface's
// `plugins` handle (the M-037-era rename broke the pin-era consumer; on the migrated
// v2.2.7 surface the target form is native). The suite mounts the real SettingsSearch
// inside the real SettingsSurfaceProvider over a real (empty) plugin host; the
// environment providers the shell normally supplies are stubbed at their seams (each
// mock keeps the real module's remaining exports, since unrelated modules in the import
// graph consume them), following the in-tree mock.module precedent
// (src/new-session/project/selector.test.tsx).
//
// Test environment (precedent: packages/mobile-hosts/test/extension-manager.rendered
// .test.tsx, itself "borrowed in spirit" from packages/ui/test/solid-jsx.ts): Solid's
// compiler normally replaces JSX, and Bun 1.4.2's Transpiler ignores an inline tsconfig
// `jsx: "react-jsx"` (it still emits classic React.createElement), so the transform uses
// the classic form with `jsxFactory: "h"` against Solid's hyperscript runtime, prepending
// the imports the classic form needs. Unlike the packages/ui preload, the plugin here is
// registered by this file and scoped to this run (run bun test with --preload
// ./happydom.ts only, without the ../ui/test/solid-jsx.ts preload, so the two plugins do
// not fight over the same modules); the filter covers every JSX-bearing source module in
// this file's import graph (app src + the ui package this graph reaches).
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  trimUnusedImports: true,
  tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "h", jsxFragmentFactory: "Fragment" } },
})

plugin({
  name: "settings-search-rendered-solid-jsx",
  setup(build) {
    build.onLoad({ filter: /packages\/(app|ui)\/src\/.*\.tsx$/ }, async (args) => ({
      contents:
        'import h from "solid-js/h";\nimport { Fragment } from "solid-js/h/jsx-runtime";\n' +
        transpiler.transformSync(await Bun.file(args.path).text()),
      loader: "js",
    }))
  },
})

const language = await import("@/runtime/i18n/language")
mock.module("@/runtime/i18n/language", () => ({
  ...language,
  useLanguage: () => ({
    t: (key: string) => key,
    rich: (key: string) => key,
    locale: () => "en",
    intl: () => "en-US",
    plural: () => "other",
  }),
}))

const platform = await import("@/runtime/platform/platform")
mock.module("@/runtime/platform/platform", () => ({
  ...platform,
  usePlatform: () => ({ platform: "web" as const }),
}))

const runtime = await import("@/runtime/server/runtime")
mock.module("@/runtime/server/runtime", () => ({
  ...runtime,
  useGlobal: () => ({ serverCtx: () => undefined }),
}))

const command = await import("@/shell/commands/command")
mock.module("@/shell/commands/command", () => ({
  ...command,
  useCommand: () => ({ register: () => () => {}, trigger: () => {} }),
}))

const inventory = await import("@/settings/servers/inventory")
// mobile(M-044): the migrated inventory no longer exports `settingsProjects` (the target
// search catalog reads `context.projects.list()` instead), so the mock only replaces the
// server list seam.
mock.module("@/settings/servers/inventory", () => ({
  ...inventory,
  useSettingsServers: () => () => [],
}))

const layout = await import("@/shell/state/layout")
mock.module("@/shell/state/layout", () => ({
  ...layout,
  useLayout: () => ({ route: () => ({ type: "home" as const }), home: { selection: () => ({ server: undefined }) } }),
}))

const tabs = await import("@/shell/tabs/tabs")
mock.module("@/shell/tabs/tabs", () => ({
  ...tabs,
  useTabs: () => ({ store: [] }),
}))

const registry = await import("@/runtime/server/registry")
mock.module("@/runtime/server/registry", () => ({
  ...registry,
  useServers: () => ({ local: () => false }),
}))

const router = await import("@solidjs/router")
mock.module("@solidjs/router", () => ({
  ...router,
  useNavigate: () => () => {},
  useLocation: () => ({ search: "", state: undefined }),
}))

const uiDialog = await import("@opencode/ui/context/dialog")
mock.module("@opencode/ui/context/dialog", () => ({
  ...uiDialog,
  useDialog: () => ({ show: () => {}, push: () => {}, close: () => {}, dismiss: () => {}, active: undefined, closing: false }),
}))

// Shared-preload degradation (the servers-page.test.tsx convention): under the unit
// suite the shared ui solid-jsx preload / solid server dist owns these sources and the
// rendered mount raises, so that one behavioral case degrades to skipped there. The
// behavioral evidence run is standalone (browser conditions, no shared preload):
//   bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/settings-search-plugin.test.tsx
let rendered = false
try {
  // The probe touches solid-js/web's insert: exactly the client-only surface the unit
  // suite's solid server dist refuses, so the flag splits the environments.
  createRoot((stop) => {
    const probeHost = document.createElement("div")
    insert(probeHost, document.createElement("span"))
    stop()
  })
  rendered = true
} catch {
  // Degrade to skipped (see the note above).
}

const { SettingsSearch } = await import("./search")
const { settingsSearchIndex } = await import("./search-index")
const { rankSettings } = await import("./search-results")
const { useSettingsSurface, SettingsSurfaceProvider } = await import("./surface")
const { PluginHostProvider } = await import("@/runtime/plugin/host")
const { render } = await import("solid-js/web")
const h = (await import("solid-js/h")).default

// The hyperscript transform of provider components reads their `children` prop eagerly
// (where babel-solid would keep a getter), so a subtree built directly would be created
// OUTSIDE the context providers and miss their values. Wrapping each subtree in an
// h-style `$ELEMENT` thunk defers creation until the provider reads its children, under
// the provider's owner — the same timing babel-solid produces.
const $ELEMENT = Object.getOwnPropertySymbols(h("div"))[0]
const lazy = (create: () => unknown) => {
  const thunk = () => create()
  ;(thunk as unknown as Record<symbol, boolean>)[$ELEMENT] = true

  return thunk
}

describe("settings search plugin catalog", () => {
  test("reads the migrated plugin handle from the search source", async () => {
    const source = await Bun.file(new URL("./search.tsx", import.meta.url)).text()
    // mobile(M-044): the migrated (v2.2.1/v2.2.7) search source reads the surface's
    // `plugins` handle natively — the assertion pins the target form.
    expect(source).toContain("plugins: surface.plugins.items()")
    expect(source).not.toContain("surface.extensions.")
  })

  test.skipIf(!rendered)("mounts the search over the real surface plugin handle and builds the catalog", async () => {
    let surface: ReturnType<typeof useSettingsSurface> | undefined
    const SurfaceProbe = () => {
      surface = useSettingsSurface()

      return document.createElement("span")
    }

    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = render(() =>
      createComponent(PluginHostProvider, {
        definitions: () => [],
        disabled: () => new Set<string>(),
        apis: {},
        whenMounted: (run: () => void) => {
          run()

          return () => {}
        },
        get children() {
          return lazy(() =>
            createComponent(SettingsSurfaceProvider, {
              get children() {
                return [lazy(() => createComponent(SurfaceProbe, {})), lazy(() => createComponent(SettingsSearch, {}))]
              },
            }),
          )
        },
      }),
      host,
    )

    // The plugin handle is present (an absent `plugins` key was the #90 break) and the
    // plugin contribution section degrades to an empty array with no host pages.
    expect(surface?.plugins.items()).toEqual([])
    expect(surface?.plugins.pages()).toEqual([])

    expect(host.querySelector(".settings-search")).not.toBeNull()
    const input = host.querySelector<HTMLInputElement>("input[type=search]")
    expect(input).not.toBeNull()

    // The catalog memo is eagerly evaluated during setup, so reaching this point already
    // proves the consumer chain built the catalog. Driving the query and ranking a catalog
    // below is the in-register supplementary (non-failure) shape-object variant: the
    // hyperscript transform snapshots expression JSX props (`<Show when={...}>`), so the
    // rendered results list cannot update in this harness and is not asserted.
    surface?.search.input("general")
    expect(surface?.search.query()).toBe("general")
    const catalog = settingsSearchIndex({
      servers: [],
      desktop: false,
      browser: false,
      mobile: false,
      translate: (key: string) => key,
      // mobile(M-044): the migrated index reads the surface's `plugins` handle and
      // rankSettings is the target 2-arg form.
      plugins: surface!.plugins.items(),
    })
    expect(rankSettings("general", catalog).length).toBeGreaterThan(0)

    dispose()
    host.remove()
  })

  // Issue #109 (S14 search reveal): the review plugin's Wrap-lines contribution is hosted
  // on the General page via PluginSettingsSections, and the search index must reveal it
  // with the host-scoped section label. search-index.ts: a `page: "general"` contribution
  // WITH `section` set reads the HOST's General-section label
  // (settings.general.section.general); the plugin title is the section label only for a
  // page-level contribution WITHOUT `section`. The fixtures mimic review/renderer.tsx's
  // SettingsPage shape ({ id: "mobile-diff", page: "general", section: "general", ... }).
  test("indexes a hosted wrap-lines entry under the host's General section label", () => {
    const catalog = settingsSearchIndex({
      servers: [],
      desktop: false,
      browser: false,
      mobile: false,
      translate: (key: string) => key,
      plugins: [
        {
          plugin: "review",
          value: {
            id: "mobile-diff",
            page: "general",
            section: "general",
            title: "Review",
            entries: [
              { id: "settings-mobile-diff-wrap", title: "Wrap long lines in mobile diffs", keywords: "diff wrap lines" },
            ],
            // Data-only fixture: the index never mounts the page; h() satisfies the JSX.Element return.
            render: () => h("div")(),
          },
        },
      ],
    })

    const wrap = catalog.find((item) => item.view.target === "settings-mobile-diff-wrap")
    expect(wrap).toBeDefined()
    expect(wrap?.view).toMatchObject({ type: "root", tab: "general", target: "settings-mobile-diff-wrap" })
    expect(wrap?.title).toBe("Wrap long lines in mobile diffs")
    // Host-owned presentation: the host General-section label, host icon.
    expect(wrap?.page).toBe("settings.tab.preferences / settings.general.section.general")
    expect(wrap?.icon).toBe("sliders")
  })

  test("uses the plugin title as the section label only without a host section", () => {
    const catalog = settingsSearchIndex({
      servers: [],
      desktop: false,
      browser: false,
      mobile: false,
      translate: (key: string) => key,
      plugins: [
        {
          plugin: "acme",
          value: {
            id: "acme-page",
            page: "general",
            title: "Acme",
            entries: [{ id: "settings-acme-row", title: "Acme row", keywords: "acme" }],
            render: () => h("div")(),
          },
        },
      ],
    })

    const row = catalog.find((item) => item.view.target === "settings-acme-row")
    expect(row).toBeDefined()
    expect(row?.page).toBe("settings.tab.preferences / Acme")
  })
})
