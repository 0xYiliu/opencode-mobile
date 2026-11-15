// verify-agent-capabilities.ts — static probe for issues #15/#193 (remote Agent
// capabilities and extension settings: agents / commands / skills / MCP /
// plugin presentation, MCP state machine + re-auth, disconnect semantics,
// and the GUI-extension main-process zero-execution boundary).
//
// Issue #193 re-anchor (v2.2.7 = fedc6f208a): the MCP face moved OFF the
// global-sync/sync.tsx toggle — v2.2.7 ships the machine-driven controller
// providers/connect/mcp.tsx (mcp.ts -> mcp.tsx; runtime/server/global-sync/mcp.ts
// deleted; the sync.tsx toggle + interactive-auth copy absorbed into the
// per-connection machine with effect-driven open-external/open-sign-in). The
// config-write stub in sync.tsx survives verbatim. installed.ts is gone — the
// bridge-less inertness face moved into runtime/plugin/root.tsx (settled:!bridge
// initial state + createExtensionDisabled) + embeds.tsx/ipc.ts. The i18n faces
// re-derived: dialog.mcp en21/zh2 (the paste/sign-in wizard grew; zh keeps
// title/empty), settings.extensions en8/zh7 (plugins.loadFailed en-only),
// mcp.status en4/zh0 (the pin dropped the zh block; en fallback).
//
// Asserts, against the REAL vendored sources (pin fedc6f208a… + the active
// patch chain), the structural facts the agent-capabilities unit document relies on:
//
//   1. MCP start/stop call-face EXHAUSTIVE SETS (normalized cross-line scan,
//      no exceptions — B1 caliber): with the RECEIVER-TOLERANT regex
//      `\b(api|client)\s*(\(\s*\))?\s*(\.\s*experimental\s*\(\s*\))?\s*\.\s*mcp\s*\.\s*(connect|disconnect)\s*\(`
//      the `mcp.connect|disconnect` call face is EXACTLY
//      {providers/connect/mcp.tsx, gui-extensions/src/details/server-panel.tsx}
//      (old->new: sync.tsx drops out — the v2.2.7 pin moved the toggle into the
//      mcp.tsx machine). app side via the experimental-namespace receiver
//      `api.experimental.mcp.` (old->new: the OpenAPI client grew the
//      `experimental` namespace — serverSDK.api.mcp. is gone), gui-ext side via
//      the promise client receiver `client.experimental.mcp.`; same endpoint
//      face, both receiver shapes count. `mcp.list` is EXACTLY FOUR files:
//      those two + new-session/mcp.ts + the DATA-LAYER ACCESSOR in
//      client/src/solid/data.ts (`api().mcp.list(` — a FUNCTION-CALL-FORM
//      receiver `api()` that the plain `\b(api|client)\.mcp` regex is blind
//      to; plan review N1 — hence the optional-call-parens group `(\s*\))?`
//      in the receiver tolerance). extensions.tsx stays OUT of the list set
//      (the settings-providers-models-extensions retirement holds at v2.2.7 —
//      the page reads the data layer; its sync/list overlay anchors are pinned).
//      Assertion form: NAMED-FILE SET EQUALITY
//      (each named file ≥1 hit + zero hits outside the named set) — the
//      conjunction is equivalent to set equality, and when the regex and the
//      sources disagree the failure lands on a MISSING hit in a named file,
//      pointing at widening the regex rather than shrinking the set (B1
//      mirror protection). CALIBER NOTE: the tolerant regexes run on RAW
//      text (with `\s*` between tokens), NOT on whitespace-squashed text —
//      squashing would fuse `await client` into `awaitclient` and destroy
//      the `\b` boundary. plugin.list call face: EXACTLY {extensions.tsx,
//      project-extensions.tsx, server-panel.tsx}.
//   2. Re-authentication two-site chain (containment assertions, NOT a
//      global exclusive set; old->new: sync.tsx's third site is absorbed —
//      the sign-in flow lives in the mcp.tsx machine and the gui-ext panel):
//      each of the two call-face files contains the integration.get →
//      oauth-method selection → integration.oauth.connect chain (in that
//      order), one interactiveForm-class error anchor (mcp.auth.interactiveForm
//      app-side / mcp.interactiveAuth gui-ext side) and the open-external
//      face — app-side EFFECT-driven (`input.platform.openExternal(effect.url)`,
//      old->new from the direct `platform.openExternal(attempt.data.url)` call),
//      gui-ext side `ctx.system.openExternal(effect.url)`. provider-face
//      controller.ts legally co-exists the oauth.connect call
//      (serverSDK.api.integration.oauth.connect — not an MCP face);
//      exclusivity is carried indirectly by the group-1 call-face sets.
//      Source-caliber sets: integration.get EXACTLY FOUR files (the two MCP
//      faces + controller.ts load + providers.tsx disconnect.run — cross-line
//      faces; old->new: controller.ts/providers.tsx/sync.tsx drop out —
//      controller.ts reads the useIntegrations catalog now), integration.oauth.connect
//      EXACTLY THREE files in the app/gui-extensions SOURCE caliber
//      (+ controller.ts; providers.tsx has none — plan review N2).
//      The failed-state terminal re-check survives verbatim (mcp.tsx
//      "A successful HTTP response can still leave the MCP connection in a
//      failed state."); the throw shape became a machine event return
//      (old->new: `throw new Error` -> `return { type: "toggle.failed", ... }`).
//   3. GUI-extension main-process zero-execution negative group (four
//      independent evidence chains): ① web platform has NO `extensions`
//      (Bridge) field and the Bridge doc says verbatim
//      "What the desktop preload exposes to the renderer host; undefined on
//      the web." — the desktop package SOURCE is not in the closure; ② the
//      Ipc doc verbatim "On the web, where no main process runs, it is
//      inactive and every call rejects."; ③ app/src carries ZERO
//      `from "electron"` import shapes and its `@opencode/…` gui specifier
//      set is EXACTLY the measured v2.2.7 map below with ZERO
//      `gui-plugins/main` / `plugin/gui/main` imports (the main compose with
//      six `main:` entries lives in gui-extensions/src/main.ts, consumed only
//      by the desktop main host); ④ the settings gui-extensions tab keeps the
//      W3 single-face form: the mobile(M-026) predicate
//      `mobileGuiExtensions = platform.platform !== "desktop"`, the redirect
//      guard `if (view.tab === "gui-extensions" && !mobileGuiExtensions)
//      surface.open("general")`, and the first-party Tabs.Content mount.
//      ANTI-OVERCLAIM anchors: the renderer side DOES run on the web
//      (ExtensionRoot mounts on web; builtins filter by OS only —
//      runsOn(definition, os); the bridge-less inertness face is
//      root.tsx `{ settled: !bridge, plugins: [], reserved: [] }` +
//      createExtensionDisabled + embeds.tsx `if (!bridge) return` + ipc.ts
//      `if (!bridge) return` — old->new: the #15-era installed.ts pins are
//      absorbed into these files); the details drawer mobile registration
//      (`kind: "drawer"`, order 50) and the app session screen
//      `<MobileViewTabs` mount are asserted as the mobile reachability
//      chain's static half.
//   4. Data-face five events + reconnect resync + client disconnect zero:
//      data.ts handles mcp.status.changed (with the verbatim push-back
//      comment — auth completion pushes state back, no polling — now with
//      the settle() per-location dedupe), mcp.resources.changed,
//      agent.updated, command.updated, skill.updated (old->new: the
//      invalidate+refresh pairs collapsed into the refreshLocation helper);
//      the reconnect/bootstrap sync block re-syncs agent/command/mcp.server/
//      mcp.resource/skill; the locationResource accessors (incl. the
//      `api().mcp.list(` data-layer form, N1) are anchored; connection.ts
//      has ZERO mcp/agent/command/skill/plugin API call shapes (its only api
//      use is event.subscribe) — disconnect never touches the five
//      capability faces (#9/#13 red-line family).
//   5. Error and recovery chain: the mcp.tsx failed-state terminal re-check
//      (verbatim), the mcp.auth.interactiveForm key, the data-layer fallback
//      shape (old->new: extensions.tsx's `.catch(() => [])` became the
//      `?? []` list overlay — pinned in group 1; project-extensions.tsx
//      dropped the rethrows/fall-back comments with the v2.2.7 retry
//      machine — the LSP face is loadFailed/retry/onRetry=config.retry and
//      the plugins face common.retry/onRetry=plugins.retry), the three
//      session.summary.mcp.* keys in new-session/mcp.ts (old->new:
//      prepareFailed left the consumer — the en key stays as a dead key, the
//      machine's unresolved-status throw carries signInBeforeSend/notReady),
//      the toggle machine face (old->new: the global-sync/mcp.ts dispatch
//      table is gone — the run-toggle effect + the pending-refusal machine
//      comment + the failed-state return carry the contract), the mcp-dialog
//      statusLabels map + pending gate (old->new: the pending-disabled Switch
//      gate became `disabled={view().pending}`), and the en+zh i18n pairing
//      (settings.extensions en8/zh7 with plugins.loadFailed en-only,
//      mcp.status en4/zh0 en-fallback, session.summary.mcp 4/4,
//      project.settings.extensions 20/20) with settings.guiExtensions.* at
//      9/9 and the EXACT key-set pins dialog.mcp en21/zh2 + settings.plugins
//      en12/zh0.
//   6. Config write boundary: the sync.tsx updateConfig stub (verbatim TODO
//      + commented experimental call + throw — the client cannot edit server
//      opencode.json), the "Manage in opencode.json" copy, the THREE
//      zero-call negatives with the receiver-tolerant regex (`mcp.add|remove`,
//      `plugin.check|update`, `session.skill` — zero in the four-package src
//      domain), the promise GENERATED surface registration anchors
//      (client.ts `check:`/`update:` via PluginCheckInput/PluginUpdateInput,
//      `add:`/`remove:`/`skill:` via the v2.2.7 Experimental* input-type
//      names — old->new: McpAddInput/McpRemoveInput/SessionSkillInput gained
//      the Experimental prefix; the generated face existing is NOT a call),
//      the Mcp.Server schema with the title member + NO config-echo fields
//      (name/status/title?/integrationID? + the integrationID comment
//      verbatim) and the five Status literals, the LocalConfig cwd
//      description verbatim (server-side process semantics), and the
//      mobile-hosts double lock (zero capability API call shapes across the
//      whole shared layer).
//   7. Zero host-OS conditionals (whitelist scan, #8 N-5 / #11 / #12 / #13
//      / #14 pattern): the scan domain — app/src/session/commands +
//      app/src/composer + app/src/runtime/server/global-sync +
//      app/src/runtime/server/sync.tsx (90 .ts/.tsx files measured on this
//      pin; lower-bound assertion 50) — must contain ZERO process.platform /
//      navigator.platform / node:os / require("os") / from "os" references.
//      COVERAGE NOTE (no double-counting): settings/providers/extensions.tsx
//      + providers/connect/mcp.tsx + providers/connect/mcp-dialog.tsx were
//      first-scanned by #14 (provider domain); settings/workspaces/**
//      + gui-extensions/src/details/** by #12 (six-domain whitelist);
//      new-session/** by #8 — this probe does NOT rescan them and does NOT
//      claim whole-repo coverage.

// HONEST BOUNDARY (same tradition as verify-terminal.ts /
// verify-provider-models.ts): this is a static STRUCTURE check (text anchors
// / regex on source files). It proves source shape, NOT runtime behavior:
// real MCP connect/disconnect against a real MCP server, the needs_auth
// re-auth round-trip and `window.open` behavior inside the Android WebView
// (G26③, same-origin uncertainty as G25③), the prepare gate on real sends,
// remote MCP server survival across client disconnect (G26⑦), and the
// server-side agent/command/skill registration + MCP client process
// management IMPLEMENTATION (packages/server, packages/core) are NOT in the
// vendored closure and are NOT asserted here — cited from the upstream pin
// cache in the unit document. The protocol/schema descriptions, the toggle
// state machine, the call faces, the client solid data layer and the
// settings/dialog/drawer UI sources ARE in the closure and are asserted
// here.
//
// Negative injections (issue #193 re-anchor round, run inject->FAIL->restore->PASS):
//   B1 (group 1): append `await api.experimental.mcp.connect({})` to an
//      unrelated file (settings/route.ts) -> the connect/disconnect set
//      equality FAILS with the unexpected-site message.
//   B2 (group 3): inject `import ... from "@opencode/plugin/gui/main"` into
//      an app/src file -> the main-process import negative FAILS.
//
// Usage:
//   bun run scripts/verify-agent-capabilities.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-agent-capabilities: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const SCHEMA = "vendor/upstream/packages/schema/"
const MOBILE_HOSTS = "packages/mobile-hosts/"

// Newline/whitespace tolerance for VERBATIM anchors (B1 lesson from #12/#13:
// verbatim quotes are matched on whitespace-squashed text so cross-line
// comments and wrapped descriptions still hit).
const squash = (source: string) => source.replace(/\s+/g, "")

// RECEIVER-TOLERANT call-shape regexes run on RAW text. Two calibers, no
// exceptions: (a) RAW + `\s*` between tokens — preserves the `\b` word
// boundary (`await client.` must not fuse) while tolerating cross-line
// writes; (b) the optional `(\s*\))?` call-paren group admits the data
// layer's FUNCTION-CALL receiver `api()` (N1). See header note 1 for why the
// squashed caliber is wrong for these shapes.
const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/", "/generated/"]

async function srcFiles(base: string): Promise<string[]> {
  const out: string[] = []
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
    const rel = `${base}${file}`
    if (skip.some((entry) => `/${rel}`.includes(entry))) continue
    out.push(rel)
  }
  return out
}

const recv = String.raw`\b(api|client)\s*(\(\s*\))?\s*(\.\s*experimental)?\s*\.`
const mcpCall = (method: string) => new RegExp(recv + String.raw`\s*mcp\s*\.\s*` + method + String.raw`\s*\(`)
const pluginCall = (method: string) => new RegExp(recv + String.raw`\s*plugin\s*\.\s*` + method + String.raw`\s*\(`)
const sessionCall = (method: string) => new RegExp(recv + String.raw`\s*session\s*\.\s*` + method + String.raw`\s*\(`)
const integrationCall = (method: string) =>
  new RegExp(recv + String.raw`\s*integration\s*\.\s*` + method + String.raw`\s*\(`)
const FOUR_PKGS = [`${APP}src/`, `${CLIENT}src/`, `${GUI_EXT}src/`, `${SESSION_UI}src/`]

const mcpConnectDisconnect = mcpCall("(connect|disconnect)")
const mcpList = mcpCall("list")
const pluginList = pluginCall("list")
const integrationGet = integrationCall("get")
const oauthConnect = new RegExp(recv + String.raw`\s*integration\s*\.\s*oauth\s*\.\s*connect\s*\(`)

// Scan counters surfaced in the summary line.
let fourPkgFiles = 0
let osScanFiles = 0
let mhFiles = 0

// --- 1. MCP start/stop call-face exhaustive sets + mcp.list set ---
{
  const expectConnect = new Set([
    `${APP}src/providers/connect/mcp.tsx`,
    `${GUI_EXT}src/details/server-panel.tsx`,
  ])
  const expectList = new Set([
    ...expectConnect,
    `${APP}src/new-session/mcp.ts`,
    `${CLIENT}src/solid/data.ts`,
  ])
  const expectPluginList = new Set([
    `${APP}src/settings/providers/extensions.tsx`,
    `${APP}src/settings/workspaces/project-extensions.tsx`,
    `${GUI_EXT}src/details/server-panel.tsx`,
  ])
  const gotConnect = new Set<string>()
  const gotList = new Set<string>()
  const gotPluginList = new Set<string>()
  for (const base of FOUR_PKGS) {
    for (const rel of await srcFiles(base)) {
      fourPkgFiles++
      const source = await read(rel)
      if (mcpConnectDisconnect.test(source)) gotConnect.add(rel)
      if (mcpList.test(source)) gotList.add(rel)
      if (pluginList.test(source)) gotPluginList.add(rel)
    }
  }
  if (fourPkgFiles < 1200) fail(`1: four-package scan implausibly small (${fourPkgFiles} files)`)
  const assertSet = (name: string, got: Set<string>, expected: Set<string>) => {
    for (const file of got) if (!expected.has(file)) fail(`1: unexpected mcp ${name} call site (outside the named set): ${file}`)
    for (const file of expected) if (!got.has(file)) fail(`1: expected mcp ${name} call site missing (regex/source mismatch — widen the regex, do NOT shrink the set): ${file}`)
  }
  assertSet("connect/disconnect", gotConnect, expectConnect)
  assertSet("list", gotList, expectList)
  assertSet("plugin.list", gotPluginList, expectPluginList)

  // Receiver-shape anchors: both receiver forms on the same endpoint face.
  // old->new (issue #193 re-anchor): the app receiver is the experimental
  // namespace (`api.experimental.mcp.`) — the OpenAPI client grew the
  // namespace and the pre-#193 serverSDK.api.mcp face is gone.
  const face = squash(await read(`${APP}src/providers/connect/mcp.tsx`))
  if (!/api\.experimental\.mcp/.test(face)) fail("1: the app-side experimental receiver (api.experimental.mcp.) moved")
  if (/serverSDK\.api\s*\.\s*mcp/.test(face)) fail("1: mcp.tsx regained the pre-adoption serverSDK.api.mcp receiver")
  const panel = squash(await read(`${GUI_EXT}src/details/server-panel.tsx`))
  if (!/client(\s*\.\s*experimental)?\s*\.\s*mcp\s*\.\s*(connect|disconnect)/.test(panel))
    fail("1: the gui-plugins promise-client receiver (client.experimental.mcp.connect/disconnect) moved")
  const data = squash(await read(`${CLIENT}src/solid/data.ts`))
  if (!/api\(\)\s*\.\s*mcp\s*\.\s*list/.test(data))
    fail("1: the data-layer function-call receiver (api().mcp.list — N1) moved")

  // B1 retirement (settings-providers-models-extensions, issue #105): extensions.tsx used to be the standing
  // cross-line mcp.list case; the target migration moved it to the data layer,
  // so the UI face is exactly the two MCP faces + new-session + the data-layer
  // accessor. The tolerant scan stays (it is what proves the retirement); the
  // page pins its data-layer shapes below.
  const extensionsRaw = await read(`${APP}src/settings/providers/extensions.tsx`)
  if (/api\s*\.\s*mcp\s*\.\s*list\s*\(/.test(extensionsRaw))
    fail("1: extensions.tsx regained an api.mcp.list call — settings-providers-models-extensions moved it to the data layer (retired B1 case); re-derive the set if intentional")
  const extensionsSq = squash(extensionsRaw)
  if (!extensionsSq.includes("voiddata.location.mcp.server.sync(data.location.default()).catch(()=>undefined)"))
    fail("1: the extensions.tsx default-Location mcp sync anchor moved")
  if (!extensionsSq.includes("constactive=data.location.mcp.server.list(location())"))
    fail("1: the extensions.tsx per-directory location() overlay anchor moved")
  if (!extensionsSq.includes("data.location.mcp.server.list(data.location.default())??[])"))
    fail("1: the extensions.tsx default-Location list overlay anchor moved")

  // mcp.list UI-face vs data-face: the three UI files call it through
  // server clients; only data.ts is the locationResource accessor (the N1
  // two-part wording — UI call face three + data-layer accessor one).
  if (!data.includes('locationResource("mcpServer",(location)=>api().mcp.list({location}))'))
    fail("1: the mcpServer locationResource accessor (data-layer mcp.list) changed")
}

// --- 2. Re-authentication two-site chain (containment) ---
{
  const sites: [string, string, string][] = [
    [`${APP}src/providers/connect/mcp.tsx`, "mcp.auth.interactiveForm", "input.platform.openExternal(effect.url)"],
    [`${GUI_EXT}src/details/server-panel.tsx`, "mcp.interactiveAuth", "ctx.system.openExternal(effect.url)"],
  ]
  for (const [rel, errorAnchor, openAnchor] of sites) {
    const raw = await read(rel)
    const sq = squash(raw)
    if (!sq.includes(squash(errorAnchor)))
      fail(`2: the interactiveForm-class error anchor moved in ${rel}: ${errorAnchor}`)
    if (!sq.includes(squash(openAnchor))) fail(`2: the openExternal anchor moved in ${rel}: ${openAnchor}`)
    if (!integrationGet.test(raw)) fail(`2: integration.get missing in ${rel}`)
    if (!oauthConnect.test(raw)) fail(`2: integration.oauth.connect missing in ${rel}`)
    // Chain order: integration.get precedes oauth.connect (needs_auth flow).
    const getIdx = raw.search(integrationGet)
    const connIdx = raw.search(oauthConnect)
    if (getIdx < 0 || connIdx < 0 || getIdx > connIdx)
      fail(`2: the needs_auth chain order (integration.get → oauth.connect) broke in ${rel}`)
    if (!sq.includes("if(!method||method.type!==")) fail(`2: the oauth-method selection guard (type check) moved in ${rel}`)
  }
  // Terminal re-check after the action (mcp.tsx verbatim), with the machine
  // event return shape (old->new: the #15-era throw became a toggle.failed event).
  const mcpToggle = squash(await read(`${APP}src/providers/connect/mcp.tsx`))
  if (!mcpToggle.includes(squash("A successful HTTP response can still leave the MCP connection in a failed state.")))
    fail("2: the failed-state terminal re-check comment moved (verbatim)")
  if (!mcpToggle.includes('if(status?.status==="failed")return{type:"toggle.failed",name,attempt,error:status.error,server:true}'))
    fail("2: the failed-state toggle.failed return shape moved")

  // Source-caliber sets (N2): integration.get exactly four (the two MCP faces
  // + controller.ts's load effect + providers.tsx's disconnect.run effect —
  // cross-line `…api.integration\n.get` writes the tolerant regex exists for),
  // oauth.connect exactly three (+ controller.ts's serverSdk connect).
  // old->new: sync.tsx dropped out of the get set — the sync toggle moved
  // into the mcp.tsx machine.
  const gotGet = new Set<string>()
  const gotOauth = new Set<string>()
  for (const base of FOUR_PKGS) {
    for (const rel of await srcFiles(base)) {
      const source = await read(rel)
      if (integrationGet.test(source)) gotGet.add(rel)
      if (oauthConnect.test(source)) gotOauth.add(rel)
    }
  }
  const expectGet = new Set([
    `${APP}src/providers/connect/controller.ts`,
    `${APP}src/providers/connect/mcp.tsx`,
    `${APP}src/settings/providers/providers.tsx`,
    `${GUI_EXT}src/details/server-panel.tsx`,
  ])
  const expectOauth = new Set([
    `${APP}src/providers/connect/controller.ts`,
    `${APP}src/providers/connect/mcp.tsx`,
    `${GUI_EXT}src/details/server-panel.tsx`,
  ])
  for (const file of gotGet) if (!expectGet.has(file)) fail(`2: unexpected integration.get call site: ${file}`)
  for (const file of expectGet) if (!gotGet.has(file)) fail(`2: expected integration.get call site missing: ${file}`)
  for (const file of gotOauth) if (!expectOauth.has(file)) fail(`2: unexpected oauth.connect call site: ${file}`)
  for (const file of expectOauth) if (!gotOauth.has(file)) fail(`2: expected oauth.connect call site missing: ${file}`)
}

// --- 3. GUI-extension main-process zero-execution negative group ---
{
  // ① web platform has NO Bridge field.
  const web = await read(`${APP}src/runtime/platform/web.ts`)
  if (web.includes("extensions")) fail("3: web platform must carry NO extensions (Bridge) field")
  const bridge = await read("vendor/upstream/packages/plugin/src/gui/host.ts")
  if (!bridge.includes("What the desktop preload exposes to the renderer host; undefined on the web."))
    fail("3: the Bridge 'undefined on the web' doc moved (verbatim)")
  // ② Ipc always inactive on the web.
  const core = await read("vendor/upstream/packages/plugin/src/gui/core.ts")
  if (!core.includes("On the web, where no main process runs, it is inactive and every call rejects."))
    fail("3: the Ipc 'always inactive on the web' doc moved (verbatim)")
  // ③ zero electron imports + exact gui specifier set.
  const electronShape = /from\s*["']electron["']/
  // Specifier shapes: `from "@opencode/…"` imports AND the DEV HMR
  // `import.meta.hot.accept(...)` form. Measured on the v2.2.7 pin + the
  // settings-v2-2-7 W3 face (issue #193 re-anchor of the #141 map):
  // plugin/gui x50, /builtin x10, /host x21, /browser x1, /file x1, /review x1,
  // /updater x2, gui-plugins/renderer x2, gui-plugins/terminal x1; bare
  // gui-plugins and BOTH main-process entries zero.
  const specifierRe = /(?:from\s*|import\.meta\.hot\.accept\(|import\()\s*["']@opencode\/(plugin\/gui[^"']*|gui-plugins\/?[^"']*)["']/g
  const specifiers = new Map<string, number>([
    ["plugin/gui", 0],
    ["plugin/gui/builtin", 0],
    ["plugin/gui/host", 0],
    ["plugin/gui/browser", 0],
    ["plugin/gui/file", 0],
    ["plugin/gui/main", 0],
    ["plugin/gui/review", 0],
    ["plugin/gui/updater", 0],
    ["gui-plugins", 0],
    ["gui-plugins/renderer", 0],
    ["gui-plugins/terminal", 0],
  ])
  let appSrcFiles = 0
  for (const rel of await srcFiles(`${APP}src/`)) {
    appSrcFiles++
    const raw = await read(rel)
    if (electronShape.test(raw)) fail(`3: electron import shape found in app/src: ${rel}`)
    for (const match of raw.matchAll(specifierRe)) {
      const key = match[1]!.replace(/"/g, "")
      const record = specifiers.get(key)
      if (record === undefined) fail(`3: unexpected @opencode plugin/gui specifier "${key}" in ${rel}`)
      specifiers.set(key, record + 1)
    }
    if (/["']@opencode\/gui-plugins\/main["']/.test(raw))
      fail(`3: main-process gui-plugins entry imported in app/src: ${rel}`)
  }
  if (appSrcFiles < 300) fail(`3: app/src scan implausibly small (${appSrcFiles} files)`)
  const expectSpecifiers: [string, number][] = [
    ["plugin/gui", 50],
    ["plugin/gui/builtin", 10],
    ["plugin/gui/host", 21],
    ["plugin/gui/browser", 1],
    ["plugin/gui/file", 1],
    ["plugin/gui/main", 0],
    ["plugin/gui/review", 1],
    ["plugin/gui/updater", 2],
    ["gui-plugins", 0],
    ["gui-plugins/renderer", 2],
    ["gui-plugins/terminal", 1],
  ]
  for (const [key, count] of expectSpecifiers) {
    const got = specifiers.get(key) ?? -1
    if (got !== count) fail(`3: the @opencode plugin/gui specifier set changed: "${key}" expected ${count}, got ${got}`)
  }
  // ④ settings entry (settings-v2-2-7 W3 form, issue #193): the mobile(M-026)
  // single-face predicate + redirect guard + the first-party Tabs.Content
  // mount (SAME-FACE as verify-settings-framework group 1 and
  // verify-gui-plugins — common witness, drift double-FAILs preserved).
  const shell = squash(await read(`${APP}src/settings/shell.tsx`))
  if (shell.includes("constGuiExtensionsSettings=import.meta.env.DEV"))
    fail("3: shell.tsx still carries the pin DEV-only lazy gate (upstream-removed on the W3 face)")
  if (!shell.includes('constmobileGuiExtensions=platform.platform!=="desktop"'))
    fail("3: shell.tsx lost the mobile(M-026) gui-extensions predicate (settings-v2-2-7 W3)")
  if (!shell.includes('if(view.tab==="gui-extensions"&&!mobileGuiExtensions)surface.open("general")'))
    fail("3: the gui-extensions redirect guard lost the single-face form (settings-v2-2-7 W3)")
  if (!shell.includes('<Tabs.Contentvalue="gui-extensions"'))
    fail("3: shell.tsx lost the first-party gui-extensions Tabs.Content mount (settings-v2-2-7 W3)")
  // Anti-overclaim: renderer side DOES run on web (os filter + bridge-less
  // inertness), and the details mobile drawer chain stays in place.
  // old->new (issue #193 re-anchor): installed.ts is gone — its bridge-less
  // faces are absorbed into root.tsx (empty initial state +
  // createExtensionDisabled), embeds.tsx and ipc.ts.
  const root = squash(await read(`${APP}src/runtime/plugin/root.tsx`))
  if (!root.includes('constos=platform.platform==="desktop"?platform.os:undefined'))
    fail("3: the root os gate (web ⇒ os undefined) moved")
  if (!root.includes("runsOn(definition,os)"))
    fail("3: the builtins OS-only filter moved (runsOn host fn)")
  if (!root.includes("ipc={bridge?(token)=>ipcs.client(token):undefined}"))
    fail("3: the PluginHostProvider ipc bridge-conditional moved")
  if (!root.includes("settled:!bridge,plugins:[],reserved:[]"))
    fail("3: root.tsx lost the bridge-less empty initial state (installed.ts successor)")
  if (!root.includes("createExtensionDisabled(window.localStorage)"))
    fail("3: root.tsx lost the createExtensionDisabled bridge-less union (settings-v2-2-7 W3)")
  const embeds = squash(await read(`${APP}src/runtime/plugin/embeds.tsx`))
  if (!embeds.includes("if(!bridge)return")) fail("3: embeds.tsx must early-return without a bridge")
  const ipc = squash(await read(`${APP}src/runtime/plugin/ipc.ts`))
  if (!ipc.includes("if(!bridge)return")) fail("3: ipc.ts must no-op without a bridge")
  const renderer = squash(await read(`${GUI_EXT}src/details/renderer.tsx`))
  if (!renderer.includes('order:50,kind:"drawer"')) fail("3: the details mobile drawer registration (order 50, kind drawer) moved")
  const screen = await read(`${APP}src/session/screen.tsx`)
  if (!/<MobileViewTabs/.test(screen)) fail("3: the session screen MobileViewTabs mount moved")
  const wsl = squash(await read(`${GUI_EXT}src/wsl/index.ts`))
  if (!wsl.includes('os:["windows"]')) fail("3: the wsl windows-only os literal moved (the only os-filtered builtin)")
  // The gui-plugins main compose stays desktop-side (six mainEntry: entries in main.ts).
  const mainCompose = await read(`${GUI_EXT}src/main.ts`)
  const mainEntries = (mainCompose.match(/mainEntry:\s*\(\)\s*=>\s*import\(/g) ?? []).length
  if (mainEntries !== 6) fail(`3: the gui-plugins main compose must carry exactly 6 mainEntry: entries (got ${mainEntries})`)
}

// --- 4. Data-face five events + reconnect resync + disconnect zero ---
{
  const data = squash(await read(`${CLIENT}src/solid/data.ts`))
  // old->new (issue #193 re-anchor): the push-back comment gains the settle()
  // dedupe sentence; the branches collapse into refreshLocation helpers and
  // the mcp.status.changed branch settles via the per-location key.
  if (!data.includes(squash("Authenticating an MCP integration reconnects its server, which emits mcp.status.changed,")))
    fail("4: the mcp.status.changed push-back comment moved (verbatim, line 1)")
  if (!data.includes(squash("so the mcp list syncs here rather than off integration.updated. The server emits one event")))
    fail("4: the mcp.status.changed push-back comment moved (verbatim, line 2)")
  if (!data.includes('case"mcp.status.changed":{constactive=hasLocation("mcpServer",location)result.location.mcp.server.invalidate(location)'))
    fail("4: the mcp.status.changed invalidate+settle branch moved")
  if (!data.includes('case"mcp.resources.changed":refreshLocation("mcpResource",result.location.mcp.resource,location)'))
    fail("4: the mcp.resources.changed branch moved")
  if (!data.includes('case"agent.updated":refreshLocation("agent",result.location.agent,location)'))
    fail("4: the agent.updated branch moved")
  if (!data.includes('case"command.updated":refreshLocation("command",result.location.command,location)'))
    fail("4: the command.updated branch moved")
  if (!data.includes('case"skill.updated":refreshLocation("skill",result.location.skill,location)'))
    fail("4: the skill.updated branch moved")
  // Reconnect/bootstrap resync block: five capability directories in sync().
  for (const dir of [
    "result.location.agent.sync(location)",
    "result.location.command.sync(location)",
    "result.location.mcp.server.sync(location)",
    "result.location.mcp.resource.sync(location)",
    "result.location.skill.sync(location)",
  ]) {
    if (!data.includes(dir)) fail(`4: the reconnect resync block lost ${dir}`)
  }
  // locationResource accessors (read faces, N1 data-layer forms).
  for (const accessor of [
    'agent:locationResource("agent",(location)=>api().agent.list({location}))',
    'command:locationResource("command",(location)=>api().command.list({location}))',
    'skill:locationResource("skill",(location)=>api().skill.list({location}))',
  ]) {
    if (!data.includes(accessor)) fail(`4: the locationResource accessor changed: ${accessor}`)
  }
  // connection.ts: zero capability API calls; the only api use is the event
  // stream subscription — client disconnect never touches the five faces.
  const connection = await read(`${CLIENT}src/solid/connection.ts`)
  const capCall = /\bapi\s*\.\s*(mcp|agent|command|skill|plugin)\s*\.\s*\w+\s*\(/
  if (capCall.test(connection)) fail("4: connection.ts must carry ZERO mcp/agent/command/skill/plugin API calls")
  if (!/\bapi\s*\.\s*event\s*\.\s*subscribe\s*\(/.test(connection))
    fail("4: connection.ts's event.subscribe anchor moved")
}

// --- 5. Error and recovery chain ---
{
  // old->new (issue #193 re-anchor): the data-layer fallback shape is the
  // `?? []` list overlay (group 1); the v2.2.7 retry machines carry the
  // recovery faces.
  const extensions = squash(await read(`${APP}src/settings/providers/extensions.tsx`))
  // Target-face pins (settings-providers-models-extensions S25/S26): data-layer MCP row with the status
  // dot, the failed View-error Button, the needs_auth Sign-in Button and the
  // extensions-side statusLabels map.
  if (!extensions.includes("settings-mcp-row")) fail("5: the extensions.tsx MCP row class (settings-mcp-row) moved")
  if (!extensions.includes("mcp-status-dot")) fail("5: the extensions.tsx status dot (mcp-status-dot) moved")
  if (!extensions.includes('data-status={item.status.status}')) fail("5: the extensions.tsx row data-status binding moved")
  if (!extensions.includes('language.t("dialog.mcp.error.view")')) fail("5: the extensions.tsx failed-row View-error Button copy moved")
  if (!extensions.includes('language.t(busy()?"dialog.mcp.signingIn":"dialog.mcp.signIn")'))
    fail("5: the extensions.tsx needs_auth Sign-in Button copy moved")
  if (
    !extensions.includes('connected:"mcp.status.connected",failed:"mcp.status.failed",needs_auth:"mcp.status.needs_auth",disabled:"mcp.status.disabled"')
  )
    fail("5: the extensions.tsx statusLabels four-key map changed")
  // LSP loadFailed + retry recovery pair (the v2.2.7 retry-machine form:
  // onRetry={config.retry}; old->new from `void config.refetch()`).
  const project = squash(await read(`${APP}src/settings/workspaces/project-extensions.tsx`))
  if (!project.includes('language.t("project.settings.extensions.lsp.loadFailed")'))
    fail("5: the LSP loadFailed copy key moved")
  if (!project.includes('language.t("project.settings.extensions.lsp.retry")'))
    fail("5: the LSP retry button moved")
  if (!project.includes("onRetry={config.retry}")) fail("5: the LSP retry action (config.retry) moved")
  if (!project.includes('retry={language.t("common.retry")}')) fail("5: the plugins retry button (common.retry) moved")
  if (!project.includes("onRetry={plugins.retry}")) fail("5: the plugins retry action (plugins.retry) moved")
  // new-session prepare-gate failure keys (old->new: prepareFailed left the
  // consumer — the machine's unresolved-status throw carries
  // signInBeforeSend/notReady; the en key stays as a dead key).
  const newSessionMcp = await read(`${APP}src/new-session/mcp.ts`)
  for (const key of [
    "session.summary.mcp.unavailable",
    "session.summary.mcp.signInBeforeSend",
    "session.summary.mcp.notReady",
  ]) {
    if (!newSessionMcp.includes(key)) fail(`5: the prepare-gate key ${key} moved`)
  }
  if (newSessionMcp.includes("session.summary.mcp.prepareFailed"))
    fail("5: new-session/mcp.ts regained session.summary.mcp.prepareFailed (the v2.2.7 unresolved-status throw superseded it)")
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  if (!en.includes('"session.summary.mcp.prepareFailed"'))
    fail("5: en.ts lost the dead session.summary.mcp.prepareFailed key (registered dead-key face)")
  if (!newSessionMcp.includes("mcp.unavailable")) fail("5: the catalog availability re-check moved")
  // The toggle machine face (old->new: the global-sync/mcp.ts dispatch table
  // is gone — the run-toggle effect + the pending-refusal machine comment
  // carry the contract).
  const mcpToggle = squash(await read(`${APP}src/providers/connect/mcp.tsx`))
  if (!mcpToggle.includes('if(effect.type==="run-toggle")')) fail("5: the run-toggle effect face moved")
  if (!mcpToggle.includes(squash('the machine refuses the request, which only a `"pending"` status does')))
    fail("5: the pending-refusal machine comment moved (verbatim)")
  // mcp-dialog: statusLabels map + pending gate (old->new: the
  // pending-disabled Switch gate became disabled={view().pending}).
  const dialog = squash(await read(`${APP}src/providers/connect/mcp-dialog.tsx`))
  if (!dialog.includes('connected:"mcp.status.connected",failed:"mcp.status.failed",needs_auth:"mcp.status.needs_auth",disabled:"mcp.status.disabled"'))
    fail("5: the mcp-dialog statusLabels four-key literal changed")
  if (!dialog.includes("disabled={view().pending}")) fail("5: the mcp-dialog pending gate moved (v2.2.7 form)")
  // i18n en+zh pairing.
  const zh = await read(`${APP}src/runtime/i18n/zh.ts`)
  const keySet = (text: string, family: string): Set<string> => {
    const keys = new Set<string>()
    const pattern = new RegExp(`["']${family.replace(/\./g, "\\.")}\\.([A-Za-z0-9_.]+)["']`, "g")
    for (const match of text.matchAll(pattern)) keys.add(match[1])
    return keys
  }
  // Systemic consumed-keys guard (settings-providers-models-extensions §3-1d): every `language.t("…")`
  // quoted literal in the guarded files must exist in en.ts. `language.t`
  // is untyped, so tsc and count-only pairing stay green while a consumed key
  // goes missing (the MAJOR-2 silent-defect class). This file-wide scan (quoted
  // literals inside the call parens, ternary-wrapped forms included — NOT a
  // naive call-site regex) is the machine check that closes the class.
  const enKeyUniverse = new Set([...en.matchAll(/["']([A-Za-z0-9_.]+)["']\s*:/g)].map((m) => m[1]!))
  // The connect dialog also consumes shared ui-package keys that the language
  // base-merge resolves from packages/ui/src/i18n/en.ts — include that
  // universe so the guard checks the dialog's full literal set.
  const uiEn = await read(`vendor/upstream/packages/ui/src/i18n/en.ts`)
  for (const match of uiEn.matchAll(/["']([A-Za-z0-9_.]+)["']\s*:/g)) enKeyUniverse.add(match[1]!)
  const languageTLiterals = (source: string): string[] => {
    const out: string[] = []
    const marker = "language.t("
    let idx = source.indexOf(marker)
    while (idx >= 0) {
      let depth = 1
      let i = idx + marker.length
      while (i < source.length && depth > 0) {
        const ch = source[i]!
        if (ch === "(") depth++
        else if (ch === ")") depth--
        else if (ch === '"' || ch === "'") {
          const quote = ch
          let j = i + 1
          let literal = ""
          while (j < source.length && source[j] !== quote) {
            if (source[j] === "\\") {
              literal += source[j + 1]!
              j += 2
              continue
            }
            literal += source[j]!
            j++
          }
          // A quoted literal immediately followed by `?` is the CONDITION
          // operand of a ternary key choice — not a key; both ternary
          // branches still end in `:` or `)` and are checked.
          let peek = j + 1
          while (peek < source.length && /\s/.test(source[peek]!)) peek++
          if (source[peek] !== "?") out.push(literal)
          i = j + 1
          continue
        }
        i++
      }
      idx = source.indexOf(marker, idx + marker.length)
    }
    return out
  }
  for (const rel of [
    `${APP}src/settings/providers/providers.tsx`,
    `${APP}src/settings/models/models.tsx`,
    `${APP}src/settings/providers/extensions.tsx`,
    `${APP}src/providers/connect/mcp-dialog.tsx`,
    `${APP}src/runtime/plugin/extension-plugins.tsx`,
    `${APP}src/settings/notifications/notifications.tsx`,
    `${APP}src/providers/connect/dialog.tsx`,
  ]) {
    const source = await read(rel)
    let checked = 0
    for (const key of languageTLiterals(source)) {
      if (key === "") continue // expression defaults inside the args (e.g. `?? ""`), not keys
      checked++
      if (!/^[A-Za-z0-9_.]+$/.test(key))
        fail(`5: non-static language.t key in ${rel}: ${JSON.stringify(key)} — extend the guard deliberately`)
      if (!enKeyUniverse.has(key)) fail(`5: consumed i18n key missing in en.ts: ${key} (${rel})`)
    }
    if (checked === 0) fail(`5: the consumed-keys guard found no language.t literals in ${rel} — scan broke`)
  }
  // EXACT key-set pins (v2.2.7 faces, issue #193 re-anchor):
  // dialog.mcp en21 (the sign-in wizard grew signIn.description +
  // signIn.paste.* + signIn.syncFailed; the dead `description` key left) /
  // zh2 {title, empty}; settings.plugins en12/zh0.
  const assertExactSet = (family: string, expectEn: string[], expectZh: string[]) => {
    const enKeys = keySet(en, family)
    const zhKeys = keySet(zh, family)
    for (const key of expectEn) if (!enKeys.has(key)) fail(`5: ${family}.${key} missing in en`)
    for (const key of enKeys) if (!expectEn.includes(key)) fail(`5: ${family}.${key} unexpected in en (key-set pin drifted)`)
    for (const key of expectZh) if (!zhKeys.has(key)) fail(`5: ${family}.${key} missing in zh`)
    for (const key of zhKeys) if (!expectZh.includes(key)) fail(`5: ${family}.${key} unexpected in zh (key-set pin drifted)`)
  }
  assertExactSet(
    "dialog.mcp",
    [
      "title",
      "empty",
      "search.placeholder",
      "search.empty",
      "error.title",
      "error.copy",
      "error.copyFailed",
      "error.open",
      "error.status",
      "error.view",
      "error.viewLabel",
      "error.disable",
      "error.details",
      "signingIn",
      "signIn",
      "signIn.description",
      "signIn.open",
      "signIn.paste.label",
      "signIn.paste.placeholder",
      "signIn.paste.required",
      "signIn.syncFailed",
    ],
    ["title", "empty"],
  )
  assertExactSet(
    "settings.plugins",
    [
      "reload",
      "status.loading",
      "status.failed",
      "error.notFound",
      "error.show",
      "error.hide",
      "builtin",
      "reserved",
      "unsupported",
      "part.server",
      "part.tui",
      "parts.note",
    ],
    [],
  )
  // Pairing faces: settings.extensions en8/zh7 (plugins.loadFailed en-only —
  // the v2.2.7 registered en-fallback gap), session.summary.mcp 4/4,
  // project.settings.extensions 20/20.
  const extEn = keySet(en, "settings.extensions")
  const extZh = keySet(zh, "settings.extensions")
  if (extEn.size !== 8) fail(`5: settings.extensions.* en key count ${extEn.size} ≠ 8`)
  if (extZh.size !== 7) fail(`5: settings.extensions.* zh key count ${extZh.size} ≠ 7`)
  for (const key of extZh) if (!extEn.has(key)) fail(`5: settings.extensions.${key} missing in en`)
  for (const key of extEn) if (!extZh.has(key) && key !== "plugins.loadFailed")
    fail(`5: settings.extensions.${key} missing in zh (only plugins.loadFailed may be en-only)`)
  const assertPair = (family: string, expect: number) => {
    const enKeys = keySet(en, family)
    const zhKeys = keySet(zh, family)
    if (enKeys.size !== expect) fail(`5: ${family}.* en key count ${enKeys.size} ≠ ${expect}`)
    if (zhKeys.size !== expect) fail(`5: ${family}.* zh key count ${zhKeys.size} ≠ ${expect}`)
    for (const key of enKeys) if (!zhKeys.has(key)) fail(`5: ${family}.${key} missing in zh`)
    for (const key of zhKeys) if (!enKeys.has(key)) fail(`5: ${family}.${key} missing in en`)
  }
  assertPair("session.summary.mcp", 4)
  assertPair("project.settings.extensions", 20)
  // mcp.status: en 4 / zh 0 (old->new: the pin dropped the zh block; the
  // base-merge en fallback is the registered shape).
  const mcpStatusEn = keySet(en, "mcp.status")
  const mcpStatusZh = keySet(zh, "mcp.status")
  if (mcpStatusEn.size !== 4) fail(`5: mcp.status.* en key count ${mcpStatusEn.size} ≠ 4`)
  if (mcpStatusZh.size !== 0) fail(`5: mcp.status.* zh key count ${mcpStatusZh.size} ≠ 0 (the v2.2.7 pin is en-fallback)`)
  // Issue #26/#193: settings.guiExtensions stays 9/9 with full key-set pairing.
  const guiExtEn = keySet(en, "settings.guiExtensions")
  const guiExtZh = keySet(zh, "settings.guiExtensions")
  if (guiExtEn.size !== 9) fail(`5: settings.guiExtensions.* en key count ${guiExtEn.size} ≠ 9`)
  if (guiExtZh.size !== 9) fail(`5: settings.guiExtensions.* zh key count ${guiExtZh.size} ≠ 9`)
  for (const key of guiExtEn) if (!guiExtZh.has(key)) fail(`5: settings.guiExtensions.${key} missing in zh`)
  for (const key of guiExtZh) if (!guiExtEn.has(key)) fail(`5: settings.guiExtensions.${key} missing in en`)
  // Server-side presentation copy (verbatim en values).
  if (!en.includes("Manage extensions available on this server")) fail("5: the extensions description copy moved (verbatim)")
  if (!en.includes("Manage in opencode.json")) fail("5: the manageConfig copy moved (verbatim)")
}

// --- 6. Config write boundary ---
{
  // updateConfig stub (verbatim) — the client cannot edit opencode.json.
  const syncRaw = await read(`${APP}src/runtime/server/sync.tsx`)
  const sync = squash(syncRaw)
  if (!sync.includes(squash("// TODO: Restore config updates when the V2 client exposes a config API.")))
    fail("6: the updateConfig stub TODO moved (verbatim)")
  if (!sync.includes(squash('throw new Error(`Config updates are unavailable: ${Object.keys(config).length} fields were not saved`)')))
    fail("6: the updateConfig stub throw moved (verbatim)")
  // old->new (issue #193 re-anchor): the mcp.toggle face moved off sync.tsx
  // into the mcp.tsx machine — the connect/disconnect write shapes live there
  // (experimental namespace, { server, location: ref } argument form).
  const mcpFace = squash(await read(`${APP}src/providers/connect/mcp.tsx`))
  if (!mcpFace.includes("awaitapi.experimental.mcp.disconnect({server:name,location:ref},{signal})"))
    fail("6: the mcp.tsx disconnect call shape moved")
  if (!mcpFace.includes("awaitapi.experimental.mcp.connect({server:name,location:ref},{signal})"))
    fail("6: the mcp.tsx connect call shape moved")
  // Zero-call negatives (receiver-tolerant, four-package src).
  const zeroShapes: [RegExp, string][] = [
    [mcpCall("(add|remove)"), "mcp.add/remove"],
    [pluginCall("(check|update)"), "plugin.check/update"],
    [sessionCall("skill"), "session.skill"],
  ]
  for (const base of FOUR_PKGS) {
    for (const rel of await srcFiles(base)) {
      const source = await read(rel)
      for (const [shape, label] of zeroShapes) {
        if (shape.test(source)) fail(`6: ${label} call shape found (config CRUD has no client UI): ${rel}`)
      }
    }
  }
  // The promise GENERATED surface stays registered (existence ≠ a call).
  // old->new: the mcp/skill input types gained the Experimental prefix at v2.2.7.
  const generated = await read(`${CLIENT}src/promise/generated/client.ts`)
  for (const anchor of [
    "check: (input?: PluginCheckInput",
    "update: (input: PluginUpdateInput",
    "add: (input: ExperimentalMcpAddInput",
    "remove: (input: ExperimentalMcpRemoveInput",
    "skill: (input: ExperimentalSessionSkillInput",
  ]) {
    if (!generated.includes(anchor)) fail(`6: the promise generated-client anchor moved: ${anchor}`)
  }
  // Mcp.Server schema: no config echo + five statuses + integrationID note.
  // old->new: the struct gained the optional `title` member (serverInfo.title
  // display face) and the statuses are annotated structs.
  const mcpSchema = squash(await read(`${SCHEMA}src/mcp.ts`))
  if (!mcpSchema.includes("exportconstServer=Schema.Struct({name:Schema.String,status:Status,"))
    fail("6: the Mcp.Server shape (name/status) changed")
  if (!mcpSchema.includes(squash("Display title from the connected server's `serverInfo.title`; absent while disconnected or when not provided.")))
    fail("6: the Mcp.Server title comment moved (verbatim)")
  if (!mcpSchema.includes("integrationID:optional(IntegrationID)")) fail("6: the Mcp.Server integrationID field moved")
  if (!mcpSchema.includes(squash("Set for remote servers registered as OAuth integrations; lets clients act on the right integration")))
    fail("6: the integrationID comment moved (verbatim)")
  for (const literal of ['"connected"', '"pending"', '"disabled"', '"failed"', '"needs_auth"']) {
    if (!mcpSchema.includes(`status:Schema.Literal(${literal})`)) fail(`6: the Mcp.Status ${literal} literal moved`)
  }
  if ((mcpSchema.match(/error:Schema.String/g) ?? []).length !== 2)
    fail("6: the failed/needs_auth error fields changed (exactly two error: Schema.String)")
  // Server-side config-value storage (echo-free corollary): headers /
  // client_secret exist ONLY in the server-side config schema classes.
  if (!mcpSchema.includes("headers:Schema.Record(Schema.String,Schema.String)"))
    fail("6: the RemoteConfig headers field moved (server-side storage anchor)")
  if (!mcpSchema.includes("client_secret:")) fail("6: the OAuthConfig client_secret field moved (server-side storage anchor)")
  if (!mcpSchema.includes(squash("Working directory for the MCP server process. Relative paths resolve from the workspace directory.")))
    fail("6: the LocalConfig cwd description moved (verbatim — server-side process semantics)")
  // mobile-hosts double lock: the shared layer stays capability-face-free.
  const mhShapes = [
    /\bapi\s*\.\s*(mcp|agent|command|skill|plugin)\s*\.\s*\w+\s*\(/,
    /\bintegration\s*\.\s*(get|list|connect)\s*\(/,
    /integration\s*\.\s*oauth\s*\.\s*connect\s*\(/,
  ]
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${MOBILE_HOSTS}src`, repoRoot).pathname }))) {
    mhFiles++
    const source = await read(`${MOBILE_HOSTS}src/${file}`)
    for (const shape of mhShapes) {
      if (shape.test(source)) fail(`6: mobile-hosts shared layer must stay capability-face-free: ${MOBILE_HOSTS}src/${file}`)
    }
  }
  if (mhFiles < 30) fail(`6: mobile-hosts scan covered only ${mhFiles} files — the directory set looks wrong`)
  // Protocol descriptions (in-closure, verbatim).
  const agentGroup = await read(`${PROTOCOL}src/groups/agent.ts`)
  if (!agentGroup.includes("Retrieve currently registered agents.")) fail("6: the agent.list protocol description moved (verbatim)")
  const commandGroup = await read(`${PROTOCOL}src/groups/command.ts`)
  if (!commandGroup.includes("Retrieve currently registered commands.") || !commandGroup.includes("Experimental command routes."))
    fail("6: the command.list protocol description moved (verbatim)")
  const skillGroup = await read(`${PROTOCOL}src/groups/skill.ts`)
  if (!skillGroup.includes("Retrieve currently registered skills.") || !skillGroup.includes("Experimental skill routes."))
    fail("6: the skill.list protocol description moved (verbatim)")
  const pluginGroup = await read(`${PROTOCOL}src/groups/plugin.ts`)
  if (!pluginGroup.includes("Retrieve enabled server plugins and their current status."))
    fail("6: the plugin.list protocol description moved (verbatim)")
  if (!pluginGroup.includes("Check one or all package plugins for available updates."))
    fail("6: the plugin.check protocol description moved (verbatim)")
  const mcpGroup = await read(`${PROTOCOL}src/groups/mcp.ts`)
  for (const quote of [
    "Retrieve configured MCP servers and their connection status.",
    "Add an MCP server at runtime or replace an existing one, connecting it immediately.",
    "Stop an MCP server and remove it from the runtime set until restart.",
    "Connect an MCP server at runtime, overriding a disabled configuration until restart.",
    "Disconnect an MCP server at runtime, removing its tools until reconnected.",
    "Upgrade to a WebSocket over which the client hosts an MCP server named after `name`",
  ]) {
    if (!mcpGroup.includes(quote)) fail(`6: the mcp protocol description moved (verbatim): ${quote}`)
  }
}

// --- 7. Zero host-OS conditionals in the scan domain ---
{
  const osPatterns: [RegExp, string][] = [
    [/process\.platform/, "process.platform"],
    [/navigator\.platform/, "navigator.platform"],
    [/from ["']node:os["']/, 'import from "node:os"'],
    [/require\(["']os["']\)/, 'require("os")'],
    [/from ["']os["']/, 'import from "os"'],
  ]
  const bases = [
    `${APP}src/session/commands/`,
    `${APP}src/composer/`,
    `${APP}src/runtime/server/global-sync/`,
  ]
  // Registered in-set exception (issue #193 re-anchor): the v2.2.7 pin ships
  // composer/editor/quote-comment.tsx with a native Mac sniff
  // (`const IS_MAC = /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)`) for
  // the comment-posting hint — upstream editor-face content, not a mobile
  // branch. The file stays in the scan for the OTHER four patterns.
  const navigatorPlatformExceptions = new Set([`${APP}src/composer/editor/quote-comment.tsx`])
  for (const base of bases) {
    for (const rel of await srcFiles(base)) {
      osScanFiles++
      const source = await read(rel)
      for (const [pattern, label] of osPatterns) {
        if (label === "navigator.platform" && navigatorPlatformExceptions.has(rel)) continue
        if (pattern.test(source)) fail(`7: host-OS conditional (${label}) found in whitelisted ${rel}`)
      }
    }
  }
  {
    const rel = `${APP}src/runtime/server/sync.tsx`
    osScanFiles++
    const source = await read(rel)
    for (const [pattern, label] of osPatterns) {
      if (pattern.test(source)) fail(`7: host-OS conditional (${label}) found in whitelisted ${rel}`)
    }
  }
  // Lower bound (measured on this pin: 90 .ts/.tsx files). Both calibers stay honest.
  if (osScanFiles < 50) fail(`7: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
}

console.log(
  "verify-agent-capabilities: PASS (" +
    "1: MCP start/stop call-face exhaustive sets (issue #193 re-anchor) — connect/disconnect EXACTLY {providers/connect/mcp.tsx (experimental receiver), gui-ext details/server-panel.tsx}, mcp.list EXACTLY 4 (= 2 MCP faces + new-session/mcp.ts + data.ts `api().mcp.list` N1 data-layer accessor; the extensions.tsx retirement holds), plugin.list EXACTLY 3, receiver-tolerant RAW-text scan over " +
    fourPkgFiles +
    " four-package src files; " +
    "2: re-auth two-site chain (integration.get → oauth.connect → effect-driven openExternal + interactiveForm/mcp.interactiveAuth anchors), the failed-state terminal re-check verbatim + the toggle.failed return shape, integration.get exactly 4 (+controller.ts load, +providers.tsx disconnect.run), oauth.connect exactly 3 (+controller.ts; source caliber); " +
    "3: GUI-extension main-process zero-execution — web.ts no extensions field, Bridge/Ipc verbatim, zero electron imports, specifier set exactly {plugin/gui:50, builtin:10, host:21, browser:1, file:1, review:1, updater:2, renderer:2, terminal:1} zero main (v2.2.7+W3 measured), W3 mobileGuiExtensions predicate + redirect guard + Tabs.Content mount, anti-overclaim renderer/os/bridge-less anchors (root.tsx settled:!bridge + createExtensionDisabled, embeds.tsx/ipc.ts early-returns — installed.ts absorbed), details drawer chain (order 50 kind drawer + MobileViewTabs), wsl os literal, 6 mainEntry: entries desktop-side; " +
    "4: data-face five events (mcp.status.changed verbatim push-back comment + settle() dedupe, refreshLocation branches) + reconnect resync five directories + locationResource accessors + connection.ts zero capability calls (event.subscribe only); " +
    "5: error/recovery chain — extensions MCP row/dot/View-error/Sign-in pins, LSP loadFailed/retry/onRetry=config.retry + plugins common.retry/onRetry=plugins.retry (v2.2.7 retry machines), prepare-gate three keys + prepareFailed dead-key face, run-toggle machine face + pending-refusal comment (the global-sync dispatch table absorbed), mcp-dialog statusLabels + disabled={view().pending}, consumed-keys guard over the seven guarded files (+ ui i18n universe), i18n EXACT key-set pins dialog.mcp en21/zh2 + settings.plugins en12/zh0 + settings.extensions en8/zh7 (plugins.loadFailed en-only) + mcp.status en4/zh0 + session.summary.mcp 4/4 + project.settings.extensions 20/20 + guiExtensions 9/9, manageConfig copy; " +
    "6: config write boundary — updateConfig stub verbatim, mcp.tsx experimental connect/disconnect write shapes, mcp.add/remove + plugin.check/update + session.skill ZERO (receiver-tolerant), generated client anchors (PluginCheck/PluginUpdate/ExperimentalMcpAdd/ExperimentalMcpRemove/ExperimentalSessionSkill), Mcp.Server no-echo schema + title member + five statuses, LocalConfig cwd verbatim, mobile-hosts " +
    mhFiles +
    " files capability-face-free, protocol descriptions verbatim; " +
    "7: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted files (session/commands + composer + global-sync + sync.tsx; 90 measured, lower bound 50; the registered in-set exception: composer/editor/quote-comment.tsx native IS_MAC navigator.platform sniff (pin content)); " +
    "STATIC check — real MCP connect/re-auth round-trip, window.open inside the Android WebView (G26③, same-origin as G25③), prepare gate on real sends, remote MCP survival across disconnect (G26⑦) and server-side registration/process semantics (outside the closure) are G26/BLOCKED)",
)
