import { describe, expect, mock, test } from "bun:test"
import { plugin } from "bun"
import { createComponent } from "solid-js"

// Issue #90 regression: the settings search index consumer must read the surface's
// migrated `plugins` handle. M-037 renamed the surface return `extensions` -> `plugins`,
// but this consumer kept the pin-era name, so the eager catalog memo threw a TypeError
// on mount and took the whole Settings face down. The suite mounts the real
// SettingsSearch inside the real SettingsSurfaceProvider over a real (empty) plugin
// host; the environment providers the shell normally supplies are stubbed at their
// seams (each mock keeps the real module's remaining exports, since unrelated modules
// in the import graph consume them), following the in-tree mock.module precedent
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
  useGlobal: () => ({ ensureServerCtx: () => undefined }),
}))

const command = await import("@/shell/commands/command")
mock.module("@/shell/commands/command", () => ({
  ...command,
  useCommand: () => ({ register: () => () => {} }),
}))

const inventory = await import("@/settings/servers/inventory")
mock.module("@/settings/servers/inventory", () => ({
  ...inventory,
  settingsProjects: () => [],
  useSettingsServers: () => () => [],
}))

const layout = await import("@/shell/state/layout")
mock.module("@/shell/state/layout", () => ({
  ...layout,
  useLayout: () => ({ route: () => ({ type: "home" as const }) }),
}))

const router = await import("@solidjs/router")
mock.module("@solidjs/router", () => ({
  ...router,
  useNavigate: () => () => {},
  useLocation: () => ({ search: "", state: undefined }),
}))

const dialog = await import("@opencode/ui/context/dialog")
mock.module("@opencode/ui/context/dialog", () => ({
  ...dialog,
  useDialog: () => ({ open: () => {}, close: () => {}, active: undefined }),
}))

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
    expect(source).toContain("extensions: surface.plugins.items()")
    expect(source).not.toContain("surface.extensions.")
  })

  test("mounts the search over the real surface plugin handle and builds the catalog", async () => {
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
    expect(surface?.search.state.query).toBe("general")
    const catalog = settingsSearchIndex({
      servers: [],
      desktop: false,
      browser: false,
      mobile: false,
      translate: (key: string) => key,
      extensions: surface!.plugins.items(),
    })
    expect(rankSettings("general", catalog, { type: "root", tab: "general" }).length).toBeGreaterThan(0)

    dispose()
    host.remove()
  })
})
