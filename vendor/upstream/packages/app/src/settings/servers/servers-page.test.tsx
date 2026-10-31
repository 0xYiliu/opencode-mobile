import { plugin } from "bun"
import { describe, expect, mock, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { insert } from "solid-js/web"
import type { ServerConnection } from "@/runtime/server/registry"

// Issue #102 regression (mobile M-045): the servers page is target-verbatim
// (v2.2.1). The pins below lock the shapes the shell and the General page rely
// on so a later re-glue cannot silently regress them:
//   - source: SettingsServerGeneral delegates to the shared ServerConnectionRow
//     and health-gates the Shell preferences section (`healthy !== false`),
//     SettingsServersHeader is the header of both page faces, the per-server
//     shell row search action (`settings-shell:<key>`, defaulting for the
//     selected server) threads servers.tsx -> ServerShell -> ShellSetting ->
//     data-action, and the row edit dialog carries the server through
//     `onSave` (the shell.tsx `selectServer` seam).
//   - behavior: an unauthorized HTTP server renders the Authenticate face, an
//     unhealthy server hides its Shell section, and a row edit reaches
//     DialogServer with `onSave` wired to the caller's onServerChange.
//
// Harness (precedent: ../settings-search-plugin.test.tsx, itself "borrowed in
// spirit" from packages/mobile-hosts rendered tests): environment providers are
// stubbed at their seams with mock.module, and the mount uses createRoot +
// createComponent instead of `render()` from solid-js/web, whose server dist
// throws `notSup` under the unit-test conditions. Two leaf widgets are replaced
// by probes: the row menu (a corvu dropdown whose portal click-through is out
// of scope here) fires the real `onEdit` callback so the page's real edit
// closure runs, and the Select shell of ShellSetting forwards `data-action` so
// the full action thread is observable.
//
// Transform note (same finding settings-search-plugin.test.tsx records): Bun
// 1.4.2's transpiler ignores an inline tsconfig `jsx: "react-jsx"` (it still
// emits classic React.createElement without the matching import), so this file
// registers the classic `jsxFactory: "h"` transform against Solid's
// hyperscript runtime, prepending the imports the classic form needs. When the
// shared ../ui/test/solid-jsx.ts preload is also loaded (the unit suite and the
// directed subset), the preload's own transform wins on the shared sources and
// executing real modules' JSX raises `React is not defined`; the behavioral
// group below detects that via a canary mount and degrades to the source pins
// (test.skipIf), which run in every environment. The behavioral evidence run is
// standalone, without the shared preload (the settings-search-plugin evidence
// convention from issue #101):
//   bun test --conditions=browser --isolate --preload ./happydom.ts \
//     src/settings/servers/servers-page.test.tsx
// The mock graph deliberately avoids every module that imports the
// `@opencode-mobile/mobile-hosts` seam (registry/runtime/connect dialog are
// either mocked or only type-imported here), so even the source pins load and
// run in a fresh worktree where that gitignored symlink does not exist.
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  trimUnusedImports: true,
  tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "h", jsxFragmentFactory: "Fragment" } },
})

plugin({
  name: "servers-page-rendered-solid-jsx",
  setup(build) {
    build.onLoad({ filter: /packages\/(app|ui)\/src\/.*\.tsx$/ }, async (args) => ({
      contents:
        'import h from "solid-js/h";\nimport { Fragment } from "solid-js/h/jsx-runtime";\n' +
        transpiler.transformSync(await Bun.file(args.path).text()),
      loader: "js",
    }))
  },
})

// The controller seam: only `collection.health()` is read by the page itself
// (the row menu's domain actions are probed away below).
const healthByServer: Record<string, { healthy?: boolean; unauthorized?: boolean }> = {}

// The http fixture matches the persistence schema shape; the runtime module is
// only imported as a type (its value side reaches the mobile-hosts seam).
const httpServer = (url: string) => ({ type: "http", http: { url } }) as unknown as ServerConnection.Http
const serverKey = (key: string) => key as unknown as ServerConnection.Key

// Behavioral harness; `undefined` when this environment cannot render real
// modules' JSX (shared-preload runs), in which case only the source pins run.
let behavior:
  | {
      SettingsServerGeneral: (props: never) => unknown
      SettingsServerList: (props: never) => unknown
      SettingsList: (props: { children: unknown }) => unknown
      pushed: Array<() => unknown>
      dialogServerProps: { mode?: string; server?: unknown; onSave?: unknown } | undefined
      setFireRowEdit: (fire: boolean) => void
    }
  | undefined

try {
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

  const uiDialog = await import("@opencode/ui/context/dialog")
  const pushed: Array<() => unknown> = []
  mock.module("@opencode/ui/context/dialog", () => ({
    ...uiDialog,
    useDialog: () => ({
      push: (render: () => unknown) => {
        pushed.push(render)
      },
      close: () => {},
      active: undefined,
    }),
  }))

  mock.module("@/servers/registry/controller", () => ({
    useServerCollectionController: () => ({
      collection: {
        items: () => [],
        health: () => healthByServer,
      },
      connection: {
        canRemove: () => true,
        canHide: () => false,
        isHidden: () => false,
        setHidden: () => {},
        remove: () => {},
      },
    }),
  }))

  // The Shell preferences controller fetches the remote shell list; the page
  // wiring under test only needs the row to mount.
  mock.module("@/settings/general/controllers", () => ({
    createShellOptions: (input: { shells: unknown[] }) => [
      { id: "auto", value: "", name: "", terminalOnly: false },
      ...input.shells,
    ],
    createSoundPreviewController: () => ({}),
    createServerShellController: () => ({
      shells: () => [],
      current: () => "auto",
      select: () => {},
    }),
  }))

  // The header's add-server button reads plugin-contributed kinds; none in this
  // harness, so the plain button fallback renders.
  mock.module("@/runtime/plugin/servers", () => ({
    usePluginServers: () => ({ entries: () => [], entry: () => undefined, ready: () => true }),
    useServerAddItems: () => () => [],
    useServerRowItems: () => () => [],
  }))

  // Probe: the row menu normally opens a dropdown whose Edit item fires
  // `onEdit`; the probe fires it directly so the page's real edit closure runs.
  let fireRowEdit = false
  mock.module("@/servers/registry/row-menu", () => ({
    ServerRowMenu: (props: { server: { type?: string }; onEdit: (server: never) => void }) => {
      if (fireRowEdit && props.server.type === "http") props.onEdit(props.server as never)

      return document.createElement("div")
    },
  }))

  // Probe: ShellSetting's Select forwards `data-action` onto the DOM so the
  // servers.tsx -> ServerShell -> ShellSetting action thread is observable.
  const uiSelect = await import("@opencode/ui/select")
  mock.module("@opencode/ui/select", () => ({
    ...uiSelect,
    Select: (props: Record<string, unknown>) => {
      const el = document.createElement("div")
      if (props["data-action"] !== undefined) el.setAttribute("data-action", String(props["data-action"]))

      return el
    },
  }))

  // Probe: the edit dialog body is out of scope (M-005/M-013 machinery); the
  // page's contract is which props it instantiates DialogServer with.
  let dialogServerProps: { mode?: string; server?: unknown; onSave?: unknown } | undefined
  mock.module("@/servers/connect/dialog", () => ({
    DialogServer: (props: { mode?: string; server?: unknown; onSave?: unknown }) => {
      dialogServerProps = props

      return document.createElement("div")
    },
  }))

  const { SettingsServerGeneral, SettingsServerList } = await import("./servers")
  const { SettingsList } = await import("@/settings/list")

  // Canary: execute one real module's JSX. Under the shared solid-jsx preload
  // the module graph was compiled to classic React.createElement without the
  // matching import, which raises here; standalone (this file's own transform
  // registered and no competing preload) the hyperscript runtime handles it.
  {
    const canaryHost = document.createElement("div")
    document.body.appendChild(canaryHost)
    const canaryChild = document.createElement("span")
    canaryChild.textContent = "canary"
    createRoot((dispose) => {
      const tree = createComponent(SettingsList as (props: { children: unknown }) => unknown, {
        children: canaryChild,
      })
      insert(canaryHost, tree as never)
      dispose()
    })
    const rendered = canaryHost.querySelector('[data-component="settings-list"]')
    if (!rendered || !rendered.contains(canaryChild)) throw new Error("canary render no-op")
  }

  behavior = {
    SettingsServerGeneral: SettingsServerGeneral as (props: never) => unknown,
    SettingsServerList: SettingsServerList as (props: never) => unknown,
    SettingsList: SettingsList as (props: { children: unknown }) => unknown,
    pushed,
    get dialogServerProps() {
      return dialogServerProps
    },
    set dialogServerProps(value) {
      dialogServerProps = value
    },
    setFireRowEdit: (fire: boolean) => {
      fireRowEdit = fire
    },
  }
} catch {
  // Degrade to the source pins (see the header note for the environments).
}

// Mount a component element into a host. The hyperscript runtime returns lazy
// thunks, so the tree goes through solid-js/web's insert (what `render()` does
// before its server dist raises notSup), which materializes thunks and arrays.
const mount = (ui: () => unknown) => {
  const host = document.createElement("div")
  document.body.appendChild(host)

  createRoot((dispose) => {
    insert(host, createComponent(ui as never, {}) as never)
    queueMicrotask(dispose)
  })

  return host
}

const preferencesCount = (host: HTMLElement) => (host.textContent.match(/settings\.tab\.preferences/g) ?? []).length

// In the list face the Shell section renders without the preferences header;
// its observable body is the ShellSetting row (title + data-action).
const shellRowCount = (host: HTMLElement) => (host.textContent.match(/settings\.general\.row\.shell\.title/g) ?? []).length

describe("servers page (target-verbatim, issue #102)", () => {
  test("source: target rows, health gate, header reuse and the shell action thread", async () => {
    const source = await Bun.file(new URL("./servers.tsx", import.meta.url)).text()

    // SettingsServerGeneral delegates to the shared row and health-gates Shell.
    expect(source).toContain("<ServerConnectionRow entry={props.entry} />")
    expect(source).toContain(
      "props.entry.connection && health()?.healthy !== false ? props.entry.connection : undefined",
    )
    // SettingsServersHeader is the header of both faces.
    expect(source.match(/<SettingsServersHeader /g)?.length).toBe(2)
    // The per-server shell row action: default for the selected server, named apart otherwise.
    expect(source).toContain("action={entry.key === props.selected ? undefined : `settings-shell:${entry.key}`}")
    // ServerShell carries the optional action into ShellSetting.
    expect(source).toContain("function ServerShell(props: { server: ServerConnection.Any; action?: string })")
    expect(source).toContain("<ShellSetting controller={controller} action={props.action} />")
  })

  test("source: ShellSetting carries the optional action into data-action", async () => {
    const source = await Bun.file(new URL("../general/general.tsx", import.meta.url)).text()

    expect(source).toContain("action?: string")
    expect(source).toContain('data-action={props.action ?? "settings-shell"}')
    expect(source).not.toContain('data-action="settings-shell"')
  })

  test.skipIf(!behavior)("behavior: an unauthorized HTTP server renders the Authenticate face", () => {
    const { SettingsServerList } = behavior!
    const connection = httpServer("http://locked.local:40910")
    healthByServer["srv-locked"] = { healthy: false, unauthorized: true }
    const host = mount(() =>
      createComponent(SettingsServerList as never, {
        servers: [{ key: serverKey("srv-locked"), name: "Locked", connection }],
        onAddServer: () => {},
        onServerChange: () => {},
      }),
    )

    expect(host.textContent).toContain("server.action.authenticate")
    expect(host.querySelector('[aria-label="server.status.authentication"]')).not.toBeNull()
    // 401 maps to healthy:false + unauthorized, so the shell section stays hidden.
    expect(shellRowCount(host)).toBe(0)
  })

  test.skipIf(!behavior)("behavior: unhealthy rows hide Shell; healthy rows thread the shell action", () => {
    const { SettingsServerList } = behavior!
    const alpha = httpServer("http://alpha.local:40911")
    const beta = httpServer("http://beta.local:40912")
    const gamma = httpServer("http://gamma.local:40913")
    healthByServer["srv-alpha"] = { healthy: true }
    healthByServer["srv-beta"] = { healthy: true }
    healthByServer["srv-gamma"] = { healthy: false }

    const host = mount(() =>
      createComponent(SettingsServerList as never, {
        servers: [
          { key: serverKey("srv-alpha"), name: "Alpha", connection: alpha },
          { key: serverKey("srv-beta"), name: "Beta", connection: beta },
          { key: serverKey("srv-gamma"), name: "Gamma", connection: gamma },
        ],
        selected: "srv-alpha",
        onAddServer: () => {},
        onServerChange: () => {},
      }),
    )

    // Two healthy rows show Shell preferences, the unhealthy one does not.
    expect(shellRowCount(host)).toBe(2)
    // Selected server's row keeps the default action; others are named apart.
    expect(host.querySelectorAll('[data-action="settings-shell"]').length).toBe(1)
    expect(host.querySelector('[data-action="settings-shell:srv-beta"]')).not.toBeNull()
    expect(host.querySelector('[data-action="settings-shell:srv-gamma"]')).toBeNull()
  })

  test.skipIf(!behavior)("behavior: single-server view shows Shell when healthy, hides it when not", () => {
    const { SettingsServerGeneral } = behavior!
    const connection = httpServer("http://single.local:40914")
    healthByServer["srv-single"] = { healthy: true }

    const healthyHost = mount(() =>
      createComponent(SettingsServerGeneral as never, {
        entry: { key: serverKey("srv-single"), name: "Single", connection },
        onAddServer: () => {},
      }),
    )
    expect(preferencesCount(healthyHost)).toBe(1)
    expect(healthyHost.textContent).toContain("settings.section.server")
    expect(healthyHost.textContent).toContain("dialog.server.add.button")

    healthByServer["srv-single"] = { healthy: false }
    const unhealthyHost = mount(() =>
      createComponent(SettingsServerGeneral as never, {
        entry: { key: serverKey("srv-single"), name: "Single", connection },
        onAddServer: () => {},
      }),
    )
    expect(preferencesCount(unhealthyHost)).toBe(0)
    // The connection row itself still renders (health dot, name, url).
    expect(unhealthyHost.textContent).toContain("Single")
    expect(unhealthyHost.textContent).toContain("http://single.local:40914")
  })

  test.skipIf(!behavior)("behavior: a row edit reaches DialogServer with server and onServerChange", () => {
    const { SettingsServerList, pushed } = behavior!
    const connection = httpServer("http://editable.local:40915")
    healthByServer["srv-editable"] = { healthy: true }
    let received: unknown
    pushed.length = 0
    behavior!.dialogServerProps = undefined
    behavior!.setFireRowEdit(true)

    try {
      mount(() =>
        createComponent(SettingsServerList as never, {
          servers: [{ key: serverKey("srv-editable"), name: "Editable", connection }],
          onAddServer: () => {},
          onServerChange: (server: ServerConnection.Any) => {
            received = server
          },
        }),
      )

      // The row menu probe fired the page's real edit closure, which pushed the dialog.
      expect(pushed.length).toBe(1)
      const dialogHost = document.createElement("div")
      document.body.appendChild(dialogHost)
      createRoot((dispose) => {
        insert(dialogHost, createComponent(pushed[0] as never, {}) as never)
        queueMicrotask(dispose)
      })

      expect(behavior!.dialogServerProps?.mode).toBe("edit")
      expect(behavior!.dialogServerProps?.server).toBe(connection)
      // onSave IS the caller's onServerChange: saving from the dialog selects the server.
      expect(behavior!.dialogServerProps?.onSave).toBeTypeOf("function")

      const onSave = behavior!.dialogServerProps?.onSave as (server: ServerConnection.Any) => void
      onSave(connection)
      expect(received).toBe(connection)
    } finally {
      behavior!.setFireRowEdit(false)
    }
  })
})
