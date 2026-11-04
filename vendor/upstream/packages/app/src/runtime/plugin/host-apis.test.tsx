import { afterEach, expect, mock, test } from "bun:test"
import type { ServerConnection as ServerConnectionType } from "@/runtime/server/registry"
type HttpServer = ServerConnectionType.Http
type DirectoryRequest = {
  server: ServerConnectionType.Any
  title: string
  onSelect: (value: string | string[]) => void
}

const solidClient = require("solid-js/dist/solid.cjs") as typeof import("solid-js")
const solidStoreClient = require("solid-js/store/dist/store.cjs") as typeof import("solid-js/store")
mock.module("solid-js", () => solidClient)
mock.module("solid-js/store", () => solidStoreClient)
const { createRoot } = solidClient
const [serverList, setServerList] = solidClient.createSignal<HttpServer[]>([])

const servers = {
  get list() {
    return serverList()
  },
  label: () => "",
  scope: (key: ServerConnectionType.Key) => key,
}

const pickerRequests: DirectoryRequest[] = []
const drafts: Array<{ server: string; directory: string }> = []
const selectedContexts: string[] = []
const opened = new Map<string, string[]>()

const contexts = new Map<string, { projects: { open: (directory: string) => void } }>()

const global = {
  servers: { list: () => serverList(), health: {} },
  serverCtx: () => undefined,
  ensureServerCtx(server: ServerConnectionType.Any) {
    const key = serverConnection.key(server)
    selectedContexts.push(key)
    const context = contexts.get(key)
    if (!context) throw new Error(`No server context for ${key}`)
    return context
  },
  notifications: { sound: async () => {}, system: async () => {} },
}

const tabs = {
  store: [] as Array<Record<string, unknown>>,
  newDraft: (input: { server: string; directory: string }) => drafts.push(input),
}

mock.module("@/runtime/platform/platform", () => ({ usePlatform: () => ({ platform: "web" }) }))
mock.module("@opencode/ui/context/dialog", () => ({
  useDialog: () => ({ active: false }),
  useDialogLayer: () => undefined,
  DialogProvider: (props: { children: unknown }) => props.children,
}))
mock.module("@opencode/ui/toast", () => ({ toaster: { dismiss: () => {} } }))
mock.module("@opencode/ui/theme/context", () => ({ useTheme: () => ({ mode: () => "light" }) }))
mock.module("@/runtime/i18n/language", () => ({
  useLanguage: () => ({ intl: new Intl.Locale("en"), direction: "ltr", setDirection: () => {}, t: (key: string) => key }),
}))
mock.module("@/runtime/server/runtime", () => ({ useGlobal: () => global }))
mock.module("@opencode-mobile/mobile-hosts", () => ({ getMobileHosts: () => undefined }))
const { ServerConnection: serverConnection } = await import("@/runtime/server/registry")
mock.module("@/runtime/server/registry", () => ({ ServerConnection: serverConnection, useServers: () => servers }))
mock.module("@/workspaces/selection/picker", () => ({ useDirectoryPicker: () => (request: DirectoryRequest) => pickerRequests.push(request) }))
mock.module("@/shell/tabs/tabs", () => ({
  useTabs: () => ({
    ...tabs,
    region: () => undefined,
    setRegion: () => {},
    select: () => {},
    addSessionTab: () => {},
    reorder: () => {},
    closeTab: () => {},
  }),
  findSessionTab: () => undefined,
  tabKey: () => "",
}))
mock.module("@/shell/state/layout", () => ({
  useLayout: () => ({
    ready: () => false,
    sessionState: { track: () => {} },
    panel: {
      state: () => ({ all: [] }),
      copy: () => {},
      closed: () => [],
      setClosed: () => {},
      append: () => {},
      focus: () => {},
      preview: () => {},
      open: () => {},
      close: () => {},
      setScroll: () => {},
      scroll: () => undefined,
    },
  }),
  useCurrentRoute: () => () => ({ type: "home" }),
}))
mock.module("@/settings/model", () => ({
  useSettings: () => ({
    notifications: { errors: () => false, agent: () => false },
    sounds: { errorsEnabled: () => false, agentEnabled: () => false, errors: () => "", agent: () => "" },
    appearance: { terminalFont: () => undefined },
  }),
  terminalFontFamily: () => "monospace",
}))
mock.module("@/settings/surface", () => ({ useSettingsSurface: () => ({ open: () => {} }) }))
mock.module("@/runtime/plugin/host", () => ({ usePluginHost: () => ({ items: () => [], preload: () => {} }) }))
mock.module("@/shell/commands/command", () => ({
  useCommand: () => ({ options: [], keybindParts: () => [], matches: () => false }),
  formatKeybindParts: () => [],
}))
mock.module("@solidjs/router", () => ({
  useIsRouting: () => () => false,
  useLocation: () => ({ pathname: "/", search: "" }),
}))
mock.module("@solid-primitives/media", () => ({ createMediaQuery: () => () => true }))
mock.module("./embeds", () => ({ createEmbeds: () => ({}) }))
mock.module("./panel-menu", () => ({ createSessionPanelMenu: () => () => [] }))
mock.module("./ui", () => ({ ui: {} }))
mock.module("@/shell/notifications/notification", () => ({ openNotificationSession: () => {} }))
mock.module("@/shell/notifications/sound", () => ({ playSoundById: async () => {} }))
mock.module("@/shell/notifications/toast", () => ({ showToast: () => {} }))

const { createHostApis, createPluginAttachment } = await import("./host-apis")

const disposers: Array<() => void> = []
afterEach(() => {
  disposers.splice(0).reverse().forEach((dispose) => dispose())
  setServerList([])
  pickerRequests.splice(0)
  drafts.splice(0)
  selectedContexts.splice(0)
  opened.clear()
  contexts.clear()
})

function server(url: string): HttpServer {
  return { type: "http", http: { url } }
}

function mount() {
  let layout!: ReturnType<ReturnType<typeof createHostApis>["apis"]["layout"]>
  let attach!: () => () => void
  const dispose = createRoot((destroy) => {
    disposers.push(destroy)
    const host = createHostApis()
    const attachment = createPluginAttachment(host)
    layout = host.apis.layout("p126-test", null, {} as never, (cleanup) => cleanup, false)
    attach = () => attachment.attach()
  })

  return { layout, attach, dispose }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function registerServerContext(connection: HttpServer) {
  const key = serverConnection.key(connection)
  const values: string[] = []
  opened.set(key, values)
  contexts.set(key, { projects: { open: (directory) => values.push(directory) } })
  return key
}

test("waits for the requested server, binds the picker and draft to that key, and ignores cancellation", async () => {
  const first = server("https://first.example")
  const second = server("https://second.example")
  const firstKey = registerServerContext(first)
  const secondKey = registerServerContext(second)
  const mounted = mount()

  mounted.attach()
  await settle()
  mounted.layout.project(firstKey, "First project")
  mounted.layout.project(secondKey, "Second project")
  await settle()
  expect(pickerRequests).toHaveLength(0)

  setServerList([first])
  await settle()
  expect(pickerRequests).toHaveLength(1)
  expect(serverConnection.key(pickerRequests[0]!.server)).toBe(firstKey)
  expect(pickerRequests[0]!.title).toBe("First project")

  pickerRequests[0]!.onSelect([])
  expect(selectedContexts).toEqual([])
  expect(opened.get(firstKey)).toEqual([])
  expect(drafts).toEqual([])

  expect(() => pickerRequests[0]!.onSelect("/shared/project")).not.toThrow()
  expect(selectedContexts).toEqual([firstKey])
  expect(opened.get(firstKey)).toEqual(["/shared/project"])
  expect(drafts).toEqual([{ server: firstKey, directory: "/shared/project" }])

  setServerList([first, second])
  await settle()
  expect(pickerRequests).toHaveLength(2)
  expect(serverConnection.key(pickerRequests[1]!.server)).toBe(secondKey)
  expect(pickerRequests[1]!.title).toBe("Second project")

  pickerRequests[1]!.onSelect("/shared/project")
  expect(selectedContexts).toEqual([firstKey, secondKey])
  expect(opened.get(firstKey)).toEqual(["/shared/project"])
  expect(opened.get(secondKey)).toEqual(["/shared/project"])
  expect(drafts).toEqual([
    { server: firstKey, directory: "/shared/project" },
    { server: secondKey, directory: "/shared/project" },
  ])
})
