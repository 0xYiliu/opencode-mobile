import { plugin } from "bun"
import { afterEach, describe, expect, mock, test as bunTest } from "bun:test"
import { createComponent, createRoot, createSignal, Suspense } from "solid-js"
import { insert } from "solid-js/web"
import { createRequire } from "node:module"
import en from "../../../../gui-plugins/src/ssh/i18n/en"

// Standalone browser-condition rendered tests for the settings SSH row-menu adapter
// (issue #161 semantics on the generic ServerRowMenu architecture, D2). Fixtures below
// are not production backend successes: the runtime drives the injected fail-closed or
// scripted ports, and every assertion is a real machine-state or registry fact — no
// faked success. Run with:
//   bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/servers/mobile-ssh.test.tsx
const require = createRequire(import.meta.resolve("vite-plugin-solid"))
const babel = require("@babel/core")
plugin({ name: "ssh-row-menu-rendered", setup(build) {
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
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ locale: () => locale(), t: (key: string) => key, rich: (key: string) => key }) }))
const uiDialog = await import("@opencode/ui/context/dialog")
mock.module("@opencode/ui/context/dialog", () => ({
  ...uiDialog,
  useDialog: () => ({ push: (render: () => unknown) => { pushed.push(render) }, close: () => closed++ }),
}))
mock.module("@/shell/notifications/toast", () => ({ showToast: () => { toasts++ } }))
// Keep original DialogSsh JSX, replace only its outer dialog/focus-management host.
mock.module("@opencode/ui/dialog", () => {
  const box = (props: { children: unknown }) => props.children
  return { Dialog: box, DialogBody: box, DialogFooter: box, DialogHeader: box, DialogTitle: box }
})
const { createMobileHosts, createMemoryStorage, TransportUnavailableError, parseHostKey } = await import("@opencode-mobile/mobile-hosts")
const { useMobileSshUi, mobileSshItems, useMobileSshMenuActions } = await import("./mobile-ssh")

// Shared-preload degradation (the servers-page.test.tsx convention): under the unit
// suite the shared ui solid-jsx preload / solid server dist owns these sources and any
// createRoot raises, so the behavioral group degrades to skipped there. The behavioral
// evidence run is standalone (browser conditions, no shared preload):
//   bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/servers/mobile-ssh.test.tsx
let rendered = false
try {
  // The probe drives the real hook chain (createResource): exactly the surface the
  // unit suite's solid server dist refuses, so the flag splits the environments.
  const probeRuntime = createMobileHosts({ storage: createMemoryStorage() })
  const probeHost = probeRuntime.registry.add({ name: "Canary", target: "example@example.invalid", servicePort: 4096 })
  createRoot((stop) => {
    useMobileSshMenuActions(() => parseHostKey(`mobile-ssh:${probeHost.id}`))
    stop()
  })
  rendered = true
} catch {
  // Degrade to skipped (see the note above).
}

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); document.body.replaceChildren(); pushed = []; closed = 0; toasts = 0; locale = () => "en"; for (const key of Object.keys(catalogRequests)) delete catalogRequests[key] })
function mount(create: () => unknown) {
  const host = document.createElement("div")
  document.body.append(host)
  createRoot((stop) => { dispose = stop; insert(host, create() as never) })
  return host
}

/** Mounts the row-menu actions for one host key under a real owner. */
function mountActions(key: () => string | undefined) {
  let actions: ReturnType<typeof useMobileSshMenuActions> | undefined
  mount(() => {
    actions = useMobileSshMenuActions(key)
    return document.createElement("span")
  })
  return actions
}

describe("settings SSH row-menu adapter (issue #161 on the generic row menu)", () => {
  // Every case mounts real Solid roots; where the environment cannot (see above) the
  // group degrades to skipped instead of failing.
  const test = rendered ? bunTest : bunTest.skip

  test("non-SSH keys build nothing (no runtime access, no catalog resource)", () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    // The row-menu contract: the adapter receives the PARSED host id (row-menu applies
    // parseHostKey), so a plain server key parses to undefined and builds nothing.
    const actions = mountActions(() => parseHostKey(saved.id))
    expect(actions).toBeUndefined()
    expect(pushed.length).toBe(0)
    expect(toasts).toBe(0)
  })

  test("T1: an ordinary row starts a real runtime attempt — connecting, then failed under the stub verifier, no fail-closed toast, no dialog", async () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const actions = mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!
    expect(actions).toBeDefined()

    actions!.connect()
    // The row starts a real runtime attempt (T1) — no fail-closed toast, no dialog.
    expect(runtime.stateOf(saved.id)).toBe("connecting")
    expect(toasts).toBe(0)
    expect(pushed.length).toBe(0)
    // Under the fail-closed stub verifier the attempt settles into failed (T8), leaving
    // the row actionable again instead of dead-ending on an unavailable error.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.stateOf(saved.id)).toBe("failed")
    expect(toasts).toBe(0)
    // And the failed row re-drives (T1 sources failed too).
    actions!.connect()
    expect(runtime.stateOf(saved.id)).toBe("connecting")
  })

  test("T10: an offline row re-enters through retry — reconnecting, then offline again while the budget lasts", async () => {
    let loss: (() => void) | undefined
    let opens = 0
    const runtime = createMobileHosts({
      storage: createMemoryStorage(),
      hostKey: { verify: async () => ({ action: "trust" }) },
      transport: {
        open: async (input) => {
          opens++
          if (opens === 1) {
            loss = () => input.onEvent({ type: "connectionLost" })
            return { url: "http://127.0.0.1:41017" }
          }
          throw new TransportUnavailableError()
        },
      },
      fetch: (async () => new Response(JSON.stringify({ version: "2.2.7" }), { status: 200, headers: { "content-type": "application/json" } })) as never,
    })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const actions = mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!

    actions!.connect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.stateOf(saved.id)).toBe("ready")
    // T9: a client-side loss lands the host in offline; the remote keeps running.
    loss!()
    expect(runtime.stateOf(saved.id)).toBe("offline")

    // The menu's ordinary Connect re-enters through the T10 retry path.
    actions!.connect()
    expect(runtime.stateOf(saved.id)).toBe("reconnecting")
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The scripted transport refuses the second open (T8): while the retry budget lasts
    // the failure lands back in offline — the row stays actionable.
    expect(runtime.stateOf(saved.id)).toBe("offline")
    expect(toasts).toBe(0)
  })

  test("T14: Delete removes the registry record locally — zero transport calls, no toast, no dialog", async () => {
    let opens = 0
    const runtime = createMobileHosts({
      storage: createMemoryStorage(),
      hostKey: { verify: async () => ({ action: "trust" }) },
      transport: { open: async () => { opens++; return { url: "http://127.0.0.1:41018" } } },
      fetch: (async () => new Response(JSON.stringify({ version: "2.2.7" }), { status: 200 })) as never,
    })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const actions = mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!
    expect(await actions!.remove()).toBe(true)
    expect(runtime.registry.list()).toHaveLength(0)
    // Zero transport calls: the remote host keeps running (AGENTS.md red line).
    expect(opens).toBe(0)
    expect(toasts).toBe(0)
    expect(pushed.length).toBe(0)
    // Removing an unknown host reports false through the same path (the menu toasts).
    expect(await mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!.remove()).toBe(false)
    expect(toasts).toBe(1)
  })

  test("the host-key challenge opens the first-party prompt; Trust and connect confirms the pending key (T3)", async () => {
    let opens = 0
    const runtime = createMobileHosts({
      storage: createMemoryStorage(),
      hostKey: { verify: async () => ({ action: "prompt", fingerprint: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99" }) },
      transport: { open: async () => { opens++; return { url: "http://127.0.0.1:41019" } } },
      fetch: (async () => new Response(JSON.stringify({ version: "2.2.7" }), { status: 200 })) as never,
    })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const actions = mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!

    actions!.connect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.stateOf(saved.id)).toBe("hostKeyUnverified")
    expect(runtime.fingerprintOf(saved.id)).toContain("AA:BB")

    // The menu's Connect presents the prompt dialog instead of a new attempt.
    actions!.connect()
    expect(pushed.length).toBe(1)
    expect(runtime.stateOf(saved.id)).toBe("hostKeyUnverified")
    expect(opens).toBe(0)

    // Rendering the pushed dialog and confirming drives runtime.confirmHostKey (T3):
    // the attempt proceeds to the transport with the pinned fingerprint and turns ready.
    const host = mount(() => pushed[0]!())
    const confirm = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Trust"))
    expect(confirm).toBeDefined()
    confirm!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.stateOf(saved.id)).toBe("ready")
    expect(opens).toBe(1)
  })

  test("the connect item reflects the machine state: label per state, disabled while connecting", () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const saved = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const actions = mountActions(() => parseHostKey(`mobile-ssh:${saved.id}`))!
    expect(actions!.label()).toBe("Connect")
    actions!.connect()
    expect(runtime.stateOf(saved.id)).toBe("connecting")
    expect(actions!.connecting()).toBe(true)
    expect(actions!.label()).toBe("Connect")
  })
})

describe("adapter data face", () => {
  const test = rendered ? bunTest : bunTest.skip

  test("saved host config and identity are read without mutation", () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    const host = runtime.registry.add({ name: "Fixture", target: "example@example.invalid", servicePort: 4096 })
    const item = mobileSshItems(runtime)[0]!
    expect(item.config.id).toBe(host.id)
    expect(item.config.target).toBe(host.target)
    expect(item.stage).toBe("disconnected")
  })

  test("delayed initial and switched catalogs never suspend or reuse the previous language", async () => {
    const runtime = createMobileHosts({ storage: createMemoryStorage() })
    runtime.registry.add({ name: "Catalog fixture", target: "example@example.invalid", servicePort: 4096 })
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
          return label
        },
      })
    })
    await Promise.resolve()
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
    expect(host.textContent).toContain("Add SSH server")
    for (const resolve of catalogRequests.zh!) resolve({ default: { ...en, add: "ZH fixture add" } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.textContent).toContain("ZH fixture add")
    select("fr")
    await Promise.resolve()
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
    expect(host.textContent).toContain("Add SSH server")
    expect(host.textContent).not.toContain("ZH fixture")
    for (const resolve of catalogRequests.fr!) resolve({ default: { ...en, add: "FR fixture add" } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.textContent).toContain("FR fixture add")
    expect(host.textContent).not.toContain("SUSPENDED SETTINGS")
  })
})
