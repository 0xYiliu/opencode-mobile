import { plugin } from "bun"
import { afterEach, beforeEach, expect, jest, mock, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { insert } from "solid-js/web"

const transpiler = new Bun.Transpiler({
  loader: "tsx",
  trimUnusedImports: true,
  tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "h", jsxFragmentFactory: "Fragment" } },
})

plugin({
  name: "servers-page-solid-jsx",
  setup(build) {
    build.onLoad({ filter: /packages\/(app|ui)\/src\/.*\.tsx$/ }, async (args) => ({
      contents:
        'import h from "solid-js/h";\nimport { Fragment } from "solid-js/h/jsx-runtime";\n' +
        transpiler.transformSync(await Bun.file(args.path).text()),
      loader: "js",
    }))
  },
})

const pushed: Array<() => unknown> = []
const browser = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

mock.module("@opencode/ui/button", () => ({ Button: () => document.createElement("button") }))
mock.module("@opencode/ui/context/dialog", () => ({
  useDialog: () => ({
    push: (render: () => unknown) => {
      pushed.push(render)
    },
  }),
}))
mock.module("@/runtime/i18n/language", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
mock.module("@/runtime/server/registry", () => ({
  ServerConnection: {
    http: (server: { http?: unknown }) => server.http,
  },
}))
mock.module("@/servers/registry/controller", () => ({
  useServerCollectionController: () => ({
    collection: { health: () => ({}) },
    connection: {},
  }),
}))
mock.module("@/servers/registry/add-menu", () => ({ AddServerMenu: () => document.createElement("button") }))
mock.module("@/servers/registry/plugin-row", () => ({ PluginServerRow: () => document.createElement("div") }))
mock.module("@/servers/registry/row", () => ({ ServerHealthIndicator: () => document.createElement("span") }))
mock.module("@/servers/connect/dialog", () => ({ DialogServer: () => document.createElement("div") }))
mock.module("@/settings/general/controllers", () => ({ createServerShellController: () => ({}) }))
mock.module("@/settings/general/general", () => ({ ShellSetting: () => document.createElement("div") }))

mock.module("@/servers/registry/row-menu", () => ({
  ServerRowMenu: (props: { server: { type?: string }; onEdit: (server: never) => void }) => {
    if (props.server.type === "http") props.onEdit(props.server as never)
    return document.createElement("div")
  },
}))

const { SettingsServerList } = await import("./servers")

let dispose: (() => void) | undefined
let marker: HTMLMetaElement | undefined
let initialUrl: string

beforeEach(() => {
  jest.useFakeTimers()
  pushed.length = 0
  initialUrl = window.location.href
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  marker?.remove()
  marker = undefined
  browser.setURL(initialUrl)
  jest.useRealTimers()
})

function mountServerRow() {
  const host = document.createElement("div")
  document.body.append(host)
  const server = { type: "http", http: { url: "http://server.local:4096" } }
  const entry = {
    key: "server-key",
    name: "Server",
    connection: server,
    availability: { status: "unreachable", reason: "offline", connection: server },
  }

  createRoot((rootDispose) => {
    dispose = rootDispose
    insert(
      host,
      createComponent(SettingsServerList as never, {
        servers: [entry],
        onAddServer: () => {},
        onServerChange: () => {},
      } as never) as never,
    )
  })
}

test("delays the server edit action for the Android WebView touch compatibility click", () => {
  browser.setURL("http://127.0.0.1:18090/")
  marker = document.createElement("meta")
  marker.name = "opencode-mobile-host"
  marker.content = "android-v1"
  document.head.append(marker)

  mountServerRow()
  expect(pushed).toHaveLength(0)

  jest.advanceTimersByTime(349)
  expect(pushed).toHaveLength(0)
  jest.advanceTimersByTime(1)
  expect(pushed).toHaveLength(1)
})

test("keeps the edit action immediate outside the Android WebView host", () => {
  mountServerRow()
  expect(pushed).toHaveLength(1)
})
