import { describe, expect, mock, test } from "bun:test"
import { createComponent, createContext, createRoot, createSignal, useContext } from "solid-js"

// Test environment (derived from the settings-search-plugin.test.tsx findings): Bun 1.4.2's
// transpiler ignores the ui preload's `jsx: "react-jsx"` config — ui-package provider
// components (ui/src/context/helper.tsx) still emit classic React.createElement and throw
// "React is not defined" when CALLED. Rather than a transform plugin (the preload's plugin
// is registered first and wins), the context factory seam below is mocked JSX-free: the
// gate:false branch of the real helper is exactly `ctx.Provider` around the children, which
// createComponent builds without JSX.

// Narrow tests for the migrated settings surface's server scope (issue #101, plan §5):
// `server()` resolution order (view server → source server → local connected → first),
// `selectServer` as a no-op off the root view, `openServers` showing the Servers page, and
// the search open() activation bump. Everything mounts the real SettingsSurfaceProvider
// over mocked environment seams (the same mock.module precedent as
// settings-search-plugin.test.tsx); the registry module is mocked so the suite does not
// depend on the @opencode-mobile/mobile-hosts alias the bundler resolves at runtime.

const [search, setSearch] = createSignal("")
const [homeServer, setHomeServer] = createSignal("srv-a")

let navigated: Array<{ url: string; replace: boolean | undefined }> = []
mock.module("@solidjs/router", () => ({
  useNavigate: () => (url: string, opts?: { replace?: boolean }) => {
    navigated.push({ url, replace: opts?.replace })
  },
  useLocation: () => ({ get search() { return search() }, state: undefined }),
}))

mock.module("@/shell/state/layout", () => ({
  useLayout: () => ({
    route: () => ({ type: "home" as const }),
    home: { selection: () => ({ server: homeServer() }) },
  }),
}))

mock.module("@/shell/tabs/tabs", () => ({
  useTabs: () => ({ store: [] as unknown[] }),
}))

const triggered: string[] = []
mock.module("@/shell/commands/command", () => ({
  useCommand: () => ({
    register: () => () => {},
    trigger: (id: string) => triggered.push(id),
  }),
}))

mock.module("@/runtime/plugin/settings-pages", () => ({
  createSettingsPages: () => ({ pages: () => [], tabs: () => new Set<string>() }),
}))

mock.module("@/runtime/server/registry", () => ({
  ServerConnection: {
    // The surface only asks whether a connection is the local one.
    local: (connection: { local?: boolean } | undefined) => !!connection?.local,
    Key: { make: (value: string) => value },
  },
}))

const alpha = { key: "srv-a", name: "Alpha", connection: { id: "remote-a" } }
const beta = { key: "srv-b", name: "Beta", connection: { id: "remote-b" } }
const local = { key: "local", name: "This computer", connection: { id: "local", local: true } }
const [entries, setEntries] = createSignal([alpha, beta, local])
mock.module("@/settings/servers/inventory", () => ({
  useSettingsServers: () => entries,
  useSettingsServersLoaded: () => () => true,
}))

// JSX-free replica of the real createSimpleContext (ui/src/context/helper.tsx) for the
// gate:false providers this suite mounts; the remaining exports pass through.
const uiContext = await import("@opencode/ui/context")
mock.module("@opencode/ui/context", () => ({
  ...uiContext,
  createSimpleContext: (input: { name: string; gate?: boolean; init: (props: any) => any }) => {
    const ctx = createContext<unknown>() as unknown as { Provider: Parameters<typeof createComponent>[0] }

    return {
      provider: (props: Record<string, unknown>) => {
        const init = input.init(props)

        if (input.gate === false)
          return createComponent(ctx.Provider, { value: init, get children() { return props.children } })

        // gate defaults to true: the surfaces here are all gate:false; the ready gate is
        // only exercised by providers this suite never mounts.
        throw new Error(`settings-surface.test mock supports gate:false providers only (${input.name})`)
      },
      use: () => {
        const value = useContext(ctx as never)

        if (!value) throw new Error(`${input.name} context must be used within a context provider`)

        return value
      },
    }
  },
}))

const { useSettingsSurface, SettingsSurfaceProvider } = await import("./surface")

function mountSurface(): ReturnType<typeof useSettingsSurface> {
  let surface: ReturnType<typeof useSettingsSurface> | undefined
  const host = document.createElement("div")
  document.body.appendChild(host)

  createRoot((dispose) => {
    const tree = createComponent(SettingsSurfaceProvider, {
      get children() {
        return createComponent(() => {
          surface = useSettingsSurface()

          return document.createElement("span")
        }, {})
      },
    })

    if (tree instanceof Node) host.appendChild(tree)
    queueMicrotask(dispose)
  })

  if (!surface) throw new Error("settings surface did not initialize")

  return surface
}

describe("settings surface server scope", () => {
  // The unit-test conditions resolve solid-js to its server dist, whose createMemo computes
  // once (no reactive graph), so each resolution stage mounts a fresh surface after the
  // environment signals are set.
  test("resolves the view's server first, then the source server, then the local connection, then the first", () => {
    // No view server and the home selection names srv-a.
    expect(String(mountSurface().server()?.key)).toBe("srv-a")

    // A root view carrying a server wins over the source server.
    setSearch("?tab=projects&server=srv-b")
    expect(String(mountSurface().server()?.key)).toBe("srv-b")

    // An unknown view server and unknown source fall through to the local connection.
    setSearch("?tab=projects&server=missing")
    setHomeServer("also-missing")
    expect(String(mountSurface().server()?.key)).toBe("local")

    // With no local connection anywhere, the first listed server is the default.
    setEntries([alpha, beta])
    expect(String(mountSurface().server()?.key)).toBe("srv-a")

    setSearch("")
    setHomeServer("srv-a")
    setEntries([alpha, beta, local])
  })

  test("selectServer is a no-op off the root view and switches the server on it", () => {
    setSearch("?server=srv-a&project=/projects/opencode&tab=general")
    navigated = []
    mountSurface().selectServer("srv-b")
    expect(navigated).toEqual([])

    setSearch("?tab=projects&server=srv-a")
    mountSurface().selectServer("srv-b")
    expect(navigated).toHaveLength(1)
    expect(navigated[0]!.url).toContain("server=srv-b")
    setSearch("")
  })

  test("openServers shows the Servers page with the named server", () => {
    const surface = mountSurface()

    navigated = []
    surface.openServers("srv-b")
    expect(navigated).toHaveLength(1)
    expect(navigated[0]!.url).toContain("tab=servers")
    expect(navigated[0]!.url).toContain("server=srv-b")

    navigated = []
    surface.openServers()
    expect(navigated[0]!.url).toContain("tab=servers")
    expect(navigated[0]!.url).not.toContain("server=")
  })

  test("search.open records the selection and bumps the activation", () => {
    const surface = mountSurface()

    const before = surface.search.state.activation
    surface.search.open({ type: "root", tab: "general" }, "row-1")
    expect(surface.search.state.activation).toBe(before + 1)
    expect(surface.search.state.selected).toBe("row-1")
    expect(surface.search.state.highlighted).toBe("row-1")
  })

  test("back on a root view triggers the app-level back command", () => {
    const surface = mountSurface()

    triggered.length = 0
    surface.back()
    expect(triggered).toEqual(["common.goBack"])
  })
})
