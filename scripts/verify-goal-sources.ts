// verify-goal-sources.ts — static probe for the Goal + Sources panels (issue #66 W22+W23,
// REWRITTEN for the v2.2.7 pin by issue #194).
//
// At fedc6f208a the v2.2.1 delta this probe used to lock is largely PIN-ABSORBED: goal ships as
// the native ComposerPill with a goal machine (the old Panel re-shell and its mobile face
// order 70 are superseded upstream), the session-ui sources subsystem (incl. the graduated
// sources-expand-machine), the timeline turnSources hooks, the motion spring/loop modules,
// outline-steer, the ui.sources.* i18n family and the SourcesProvider host wrapper are all
// native. The surviving narrow-screen deltas — the sources mobile face 60 + gate-off honest
// empty state, the panel-id "turn" dispatch, the panel.* i18n keys, the Settings -> Experimental
// Sources gate row and its en/zh keys — re-land by gui-plugins-v2-2-7 and are locked here.
// old->new (issue #194 rewrite): the v2.2.1-only assertions retired with their faces — the
// motion-tuning shim helpers (storedToggle/setStoredToggle do not exist at v2.2.7), the
// 0f379f0a33 old-host four-files-verbatim claim, the 22-file patch face, the goal Panel
// re-shell/mobile 70, the user-runs rewrite negatives (the v2.2.7 timeline IS the rewrite
// target form), and the 14-catalog-rejection list (the experiment graduated upstream).
//
// Asserts, against the REAL vendored/first-party sources (pin fedc6f208a… + the 10 active
// mobilePatches incl. gui-plugins-v2-2-7):
//
//   1. Registration face: renderer.ts carries exactly 15 compose entries with sources and goal
//      appended after microsoft-office (the v2.2.1 compose order the pin kept); main.ts carries
//      the same 15-id table with the six lazy main entries unchanged (sources/goal are
//      renderer-only, ids reserved); the mobile face order set is exactly
//      {10,20,30,40,50,60,80} — review 10 tab / file 20 menu / terminal 30 menu / context 40
//      menu / details 50 drawer pin-native, sources 60 menu + btw 80 menu re-landed by
//      gui-plugins-v2-2-7; goal has NO mobile face (the native ComposerPill), so 70 exists
//      nowhere and nothing is renumbered.
//   2. Host boundary: the OLD host tokens (`@opencode/gui-extensions` specifier,
//      `Extension.define`, `useExtension`) have ZERO hits across the four vendored domains
//      (gui-plugins/src, session-ui/src, app/src, ui/src), while `@opencode/plugin/gui` is a
//      POSITIVE anchor there. The pill faces flipped from negatives to positives at the pin:
//      goal IS the native ComposerPill and app/src/session/composer/plugin-pills.tsx hosts it.
//   3. Goal contract (v2.2.7 pin form): schema/goal.ts keeps the Goal namespace export, the
//      opencode.goal RPC (get + events.changed) and its THREE `Schema.toStandardSchemaV1(...)`
//      wrappers (the promise client's PortableDefinition requires the Standard Schema form; the
//      wrappers are upstream-native now, not a port artifact). The renderer is the machine form:
//      createGoalState/transitionGoal/selectGoal/selectGoalBusy + the GOAL_* timeouts from
//      machine.ts, the createKeyed subscription keyed on the routed session (server connected +
//      directory equality), the fetch/subscribe/command guard with attempt timeouts, the
//      three-state status map verbatim, the error toast with `common.requestFailed`, and the
//      pill menu's pause/resume/clear. Negatives: no server-side goal plugin vendored, no
//      session.metadata.updated adoption, no mobile face (order 70 retired with the pill), no
//      first-party `none:` i18n key (the v2.2.1 empty-state key retired).
//   4. Sources (pin body + gui-plugins-v2-2-7 faces): sources/index.ts is the two-line
//      Plugin.define; the renderer keeps the soft browser LinkHandler face, the transient side
//      Panel whose list empties when the experiment is off, the gated onIdle preload and the
//      SourcesTitle/count faces; gui-plugins-v2-2-7 re-lands the mobile face (order 60, menu,
//      icon globe), the gate-off honest panel.disabled fallback, the panel-id "turn" dispatch
//      (most recent turn with sources), the panel.none empty state and the panel.* i18n keys.
//      Downstream: session-ui exports 4, ui en 9 keys in the v2.2.1 position, the app
//      en/zh row.sources.* pair (gui-plugins-v2-2-7; the #193 en+zh pairing convention), the
//      Experimental row flipping the knob through setSourcesEnabled, the app SourcesProvider
//      wrapper inside the Links/MarkdownProvider, and the three timeline hook increments
//      (row turnSourcesValue memo + call-site props, current-message TurnSources passthrough,
//      message-content footer restructure) — with the settings-experimental fold witnesses
//      still in place (layering witness).
//   5. Gate/knob (v2.2.7 real module): motion-tuning.ts is the upstream Knobs registry module —
//      the opencode.motion.v2 record, the toggle/choice/spring/subscribe faces experiment.ts
//      consumes, motionTuning.set/list/actions, motionPresets/MotionKnob/motionTimeScale/
//      motionGlobals — with ZERO runtime imports; the retired v2.2.1 shim helpers
//      storedToggle/setStoredToggle must NOT exist. The knob default is false at the
//      declaration; the gui-plugins-v2-2-7 accessor closes over the single registered instance
//      (enabledKnob capture + setSourcesEnabled export) so no call site re-registers or looks
//      the knob up.
//   6. Icons + patch registration: outline-steer is the pin-native catalog entry after waveform
//      (the v2.2.1 verbatim artwork, absorbed); session-goal-sources-panels stays registered
//      (status absorbed, patch file untouched on disk) and gui-plugins-v2-2-7 is registered in
//      BOTH manifests with the exact 11-file patch face (mobilePatches position 10, dependsOn
//      settings-v2-2-7); the 22-file face claim is retired with the absorption. No dist marker
//      is staged for the family: the gate stores a non-sensitive, device-local UI preference
//      (an experiment gate) in the upstream opencode.motion.v2 record — recorded deliberately.
//   7. Motion: spring.ts/loop.ts are verbatim zero-import modules; the motion entry is the FULL
//      upstream re-export list (spring/loop/velocity/reduced/waapi/slider — the v2.2.1-era
//      M-035/M-036 provenance comment retired with the absorption); sources.css uses only
//      :root[data-motion="reduce"] (three blocks, zero @media prefers-reduced-motion); within
//      the sources motion surface only ui/src/motion/reduced.ts mentions the media query.
//
// NEGATIVE EXAMPLES (run at verification time by injecting/reverting mutations;
// inject -> FAIL rc=1 -> restore -> PASS rc=0, logs kept):
//   1. flip the gate default `value: false` -> `value: true` in
//      session-ui/src/sources/experiment.ts -> group 5 default-false FAIL;
//   2. delete the btw mobile face (the `mobile: {` block) from
//      gui-plugins/src/btw/renderer.tsx -> group 1 order-set FAIL (issue #194 — the
//      re-landed narrow-screen entry must not silently disappear);
//   3. inject `import { probe } from "@opencode/plugin/gui"` — wait, that is a REQUIRED token;
//      the injection is `import { probe } from "@opencode/gui-extensions/sdk"` into
//      gui-plugins/src/sources/index.ts -> group 2 domain scan FAIL.
//
// HONEST BOUNDARY (same tradition as the sibling probes): static STRUCTURE check — text
// anchors / set equalities / negative injections. It proves source shape, NOT runtime
// behavior: tab reachability, the gate surviving process restarts (off by default), the chip
// presentation and panel opening, goal command round-trips against real servers, the error
// toast, the empty states and TalkBack announcement are device QA items registered in
// docs/build-and-verify.md, NOT executed at this level.
//
// Usage:
//   bun run scripts/verify-goal-sources.ts
// Exit 0 = all assertions PASS.

import { readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-goal-sources: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

const GUI = "vendor/upstream/packages/gui-plugins/src/"
const SUI = "vendor/upstream/packages/session-ui/"
const APP = "vendor/upstream/packages/app/"
const UI = "vendor/upstream/packages/ui/"
const PATCHES = "vendor/upstream/patches/mobile/"

/** RAW normalization: every whitespace removed (cross-line verbatim anchors). */
function squash(source: string): string {
  return source.replace(/\s+/g, "")
}

function setEq<T>(got: Iterable<T>, expected: Iterable<T>, label: string) {
  const gotSet = new Set(got)
  const expectedSet = new Set(expected)
  const missing = [...expectedSet].filter((item) => !gotSet.has(item))
  const extra = [...gotSet].filter((item) => !expectedSet.has(item))
  if (missing.length > 0 || extra.length > 0)
    fail(`${label}: set equality broken — missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`)
}

const EXPECTED_IDS = [
  "context",
  "btw",
  "debug",
  "terminal",
  "file",
  "review",
  "details",
  "browser",
  "pairing",
  "updater",
  "ssh",
  "wsl",
  "microsoft-office",
  "sources",
  "goal",
] as const

const EXPECTED_MAIN_LAZY = ["debug", "browser", "pairing", "updater", "ssh", "wsl"] as const

// --- 1. Registration face ---
{
  // The pin keeps the v2.2.1 compose: an OBJECT MAP keyed by plugin id with `windowEntry`
  // (renderer) / `mainEntry` (main) faces — same 15 ids, same order.
  const renderer = await read(`${GUI}renderer.ts`)
  const composeStart = renderer.indexOf("export const builtins = compose({")
  if (composeStart === -1) fail("1: renderer.ts lost the builtins compose (object-map form)")
  const composeBlock = renderer.slice(composeStart, renderer.indexOf("\n})", composeStart))
  const entryIds = [...composeBlock.matchAll(/^  "?([\w-]+)"?: \{/gm)].map((m) => m[1]!)
  if (entryIds.length !== EXPECTED_IDS.length)
    fail(`1: builtins compose must carry exactly ${EXPECTED_IDS.length} entries, got ${entryIds.length} (NEGATIVE 2 deletes the btw mobile face / an entry)`)
  setEq(entryIds, EXPECTED_IDS, "1: builtins compose id set")
  // Compose order tail: … microsoft-office, sources, goal.
  const at = (id: string) => composeBlock.indexOf(`  ${id}: {`) !== -1
    ? composeBlock.indexOf(`  ${id}: {`)
    : composeBlock.indexOf(`  "${id}": {`)
  for (const id of ["microsoft-office", "sources", "goal"]) if (at(id) === -1) fail(`1: compose lost the ${id} entry`)
  if (!(at("microsoft-office") < at("sources") && at("sources") < at("goal")))
    fail("1: compose order must be microsoft-office -> sources -> goal")
  if (!renderer.includes("windowEntry: eager(goalRenderer)"))
    fail("1: renderer.ts compose lost the windowEntry face")

  const main = await read(`${GUI}main.ts`)
  const mainImports = [...main.matchAll(/import (\w+) from "\.\/([\w-]+)"/g)].map((m) => m[1]!)
  const mainCamel: Record<string, string> = { microsoftOffice: "microsoft-office" }
  setEq(
    mainImports.map((id) => mainCamel[id] ?? id),
    [...EXPECTED_IDS],
    "1: main.ts import table (same 15 builtins)",
  )
  const mainLazy = [...main.matchAll(/\{\s*\.\.\.(\w+),\s*mainEntry:/g)].map((m) => m[1]!)
  setEq(mainLazy, EXPECTED_MAIN_LAZY, "1: main.ts lazy mainEntry set (sources/goal are renderer-only)")

  // Mobile face orders across the SEVEN registered faces: no duplicates, exact set.
  // (review 10 … details 50 are pin-native; sources 60 + btw 80 re-land by gui-plugins-v2-2-7;
  // goal has NO face at v2.2.7 — the native ComposerPill — so 70 exists nowhere.
  // old->new issue #194: the previous set was {10,20,30,40,50,60,70,80}.)
  const faces: Array<[string, number, string]> = [
    ["review/renderer.tsx", 10, "tab"],
    ["file/renderer.tsx", 20, "menu"],
    ["terminal/renderer.tsx", 30, "menu"],
    ["context/renderer.tsx", 40, "menu"],
    ["details/renderer.tsx", 50, "drawer"],
    ["sources/renderer.tsx", 60, "menu"],
    ["btw/renderer.tsx", 80, "menu"],
  ]
  const seenOrders = new Set<number>()
  for (const [file, order, kind] of faces) {
    const source = squash(await read(`${GUI}${file}`))
    const anchor = source.indexOf("mobile:{")
    if (anchor === -1) fail(`1: ${file} lost the mobile face (NEGATIVE 2 target)`)
    const window = source.slice(anchor, anchor + 220)
    const orderMatch = window.match(/order:(\d+),/)
    const kindMatch = window.match(/kind:"(\w+)"/)
    if (!orderMatch || !kindMatch) fail(`1: ${file} mobile face lost its order/kind fields`)
    if (Number(orderMatch![1]) !== order) fail(`1: ${file} mobile face order drifted (expected ${order}, got ${orderMatch![1]})`)
    if (kindMatch![1] !== kind) fail(`1: ${file} mobile face kind drifted (expected ${kind}, got ${kindMatch![1]})`)
    if (seenOrders.has(order)) fail(`1: mobile face order ${order} duplicated (registry would mis-sort)`)
    seenOrders.add(order)
  }
  setEq(seenOrders, [10, 20, 30, 40, 50, 60, 80], "1: mobile face order set {10..60,80} — no 70 (old->new issue #194: the v2.2.1 set was {10..80}; the goal face retired with the native ComposerPill)")
  // goal/renderer.tsx must NOT grow a mobile face (the pill is a composer face, not a panel).
  const goal = squash(await read(`${GUI}goal/renderer.tsx`))
  if (goal.includes("mobile:{"))
    fail("1: goal/renderer.tsx grew a mobile face (goal is the native ComposerPill at v2.2.7 — order 70 retired with the Panel re-shell)")
}

// --- 2. Host boundary (old-host tokens zero-hit; the pill faces are pin-positive now) ---
{
  const FORBIDDEN = ["@opencode/gui-extensions", "Extension.define", "useExtension"]
  const REQUIRED = ["@opencode/plugin/gui"]
  const DOMAINS = [
    "vendor/upstream/packages/gui-plugins/src",
    "vendor/upstream/packages/session-ui/src",
    "vendor/upstream/packages/app/src",
    "vendor/upstream/packages/ui/src",
  ]
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string, hit: (path: string, token: string) => void): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path, hit)
        continue
      }
      if (!/\.(ts|tsx|css|js|jsx|json)$/.test(entry.name)) continue
      const body = await Bun.file(path).text()
      for (const token of [...FORBIDDEN, ...REQUIRED]) if (body.includes(token)) hit(path.replace(`${repoRoot.pathname}`, ""), token)
    }
  }
  let leaked = false
  for (const domain of DOMAINS) await scan(`${repoRoot.pathname}${domain}`, (path, token) => {
    if (REQUIRED.includes(token)) return
    leaked = true
    console.error(`  boundary leak: ${path} mentions ${token}`)
  })
  if (leaked) fail("2: an old-host token leaked into the vendored domains (NEGATIVE 3 injects one deliberately)")

  // old->new (issue #194): ComposerPill and plugin-pills FLIPPED from the forbidden list to
  // positive anchors — goal IS the native ComposerPill at v2.2.7 and the app composer's
  // plugin-pills host renders it; the D1-era "pill host stays unadopted" negative is retired.
  const goalRenderer = await read(`${GUI}goal/renderer.tsx`)
  if (!goalRenderer.includes("ComposerPill")) fail("2: goal/renderer.tsx lost the native ComposerPill face")
  const pluginPills = await read(`${APP}src/session/composer/plugin-pills.tsx`)
  if (!pluginPills.includes('data-component="session-plugin-pills"')) fail("2: app plugin-pills.tsx lost the pill host face")
}

// --- 3. Goal contract (v2.2.7 pin form: schema + machine + ComposerPill + degradation negatives) ---
{
  const goal = squash(await read(`${GUI}goal/renderer.tsx`))
  const schema = await read("vendor/upstream/packages/schema/src/goal.ts")
  if (!schema.includes('export * as Goal from "./goal.js"')) fail("3: schema/goal.ts lost the Goal namespace export")
  if (!schema.includes('id: "opencode.goal",')) fail("3: schema/goal.ts lost the opencode.goal RPC id")
  if (!schema.includes('Schema.Literals(["active", "paused", "complete"])')) fail("3: schema/goal.ts lost the Status literals")
  for (const field of ["objective", "reason", "rounds", "maxRounds", "stalls", "boot", "updatedAt"]) {
    if (!schema.includes(`${field}:`)) fail(`3: schema/goal.ts State lost the ${field} field`)
  }
  if (!schema.includes("optional(Schema.String)")) fail("3: schema/goal.ts lost the optional() reason/stalls shape")
  if (!schema.includes("Rpc.define({")) fail("3: schema/goal.ts lost the Rpc.define form")
  // The THREE Standard Schema wrappers (upstream-native at v2.2.7; the v2.2.1-port artifact
  // note retired — the promise client's PortableDefinition still requires this form).
  const wrappers = [...schema.matchAll(/: Schema\.toStandardSchemaV1\(/g)].length
  if (wrappers !== 3) fail(`3: schema/goal.ts must carry exactly three Schema.toStandardSchemaV1 wrappers (get.input/get.output/events.changed.schema), got ${wrappers}`)
  for (const anchor of [
    "input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.String })),",
    "output: Schema.toStandardSchemaV1(Schema.NullOr(State)),",
    "schema: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.String, goal: Schema.NullOr(State) })),",
  ]) {
    if (!schema.includes(anchor)) fail(`3: schema/goal.ts lost the wrapper anchor ${anchor.split("(")[0].trim()}`)
  }

  // The renderer machine form (v2.2.7; the v2.2.1 data-layer anchors retired with the machine).
  for (const anchor of [
    "createGoalState,",
    "GOAL_COMMAND_TIMEOUT_MS,",
    "GOAL_SNAPSHOT_TIMEOUT_MS,",
    "selectGoal,",
    "selectGoalBusy,",
    "transitionGoal,",
    "const next = transitionGoal(untrack(goalState), event)",
    "next.effects.forEach((effect) => void Promise.try(() => run(effect)).catch(console.error))",
    "client.rpc(Goal.Definition).events.on(\"changed\", (event) =>",
    ".get({ sessionID: effect.sessionID }, { location: { directory: effect.directory }, signal })",
    "client.session.command({ sessionID: effect.sessionID, name: \"goal\", text: effect.action }, { signal })",
    "equals: (a, b) => a.key === b.key && a.directory === b.directory",
    "The server's goal plugin owns the goal and serves it over its RPC; a bare `/goal` shows the last",
  ]) {
    if (!goal.includes(squash(anchor))) fail(`3: goal/renderer.tsx lost the machine-form anchor ${anchor.slice(0, 60)}`)
  }
  // Status map, verbatim (squashed — `goal` is the squashed form).
  for (const anchor of [
    'active: { label: "title", icon: "outline-steer", tone: undefined },',
    'paused: { label: "paused", icon: "circle-exclamation", tone: "warning" },',
    'complete: { label: "met", icon: "circle-check", tone: "success" },',
  ]) {
    if (!goal.includes(squash(anchor))) fail(`3: goal/renderer.tsx lost the status map entry ${anchor.slice(0, 40)}`)
  }
  // Pill face + toast + menu actions (squashed — `goal` is the squashed form).
  for (const anchor of [
    "ctx.add(ComposerPill, {",
    'id: "goal",',
    'title: ctx.t("common.requestFailed"),',
    'run("pause")',
    'run("resume")',
    'run("clear")',
  ]) {
    if (!goal.includes(squash(anchor))) fail(`3: goal/renderer.tsx lost the pill/toast/menu anchor ${anchor}`)
  }
  if (goal.includes("ctx.add(Panel")) fail("3: goal/renderer.tsx grew a Panel (the pill is the pin form; the v2.2.1 re-shell retired)")

  const machine = await read(`${GUI}goal/machine.ts`)
  for (const anchor of [
    "export const GOAL_SNAPSHOT_TIMEOUT_MS = 15_000",
    "export const GOAL_COMMAND_TIMEOUT_MS = 15_000",
    "export function createGoalState()",
    "export function transitionGoal",
    "export function selectGoal(",
    "export function selectGoalBusy(",
  ]) {
    if (!machine.includes(anchor)) fail(`3: goal/machine.ts lost the anchor ${anchor}`)
  }
  if (!machine.includes("Every fetch failed, as on a server without the goal plugin"))
    fail("3: goal/machine.ts lost the no-goal-plugin degradation comment")

  const goalI18n = await read(`${GUI}goal/i18n/en.ts`)
  for (const key of ['title: "Goal",', 'paused: "Goal paused",', 'met: "Goal met",', 'pause: "Pause",', 'resume: "Resume",', 'clear: "Clear",']) {
    if (!goalI18n.includes(key)) fail(`3: goal i18n en lost ${key.trim()}`)
  }
  // old->new (issue #194): the first-party `none:` empty-state key retired with the Panel
  // re-shell — the pill form has no panel body to empty.
  if (goalI18n.includes("none:") || goalI18n.includes("mobile("))
    fail("3: goal i18n en carries a retired first-party key (none: / mobile marker — the v2.2.7 pill i18n is the six upstream keys only)")

  // Degradation negatives: no server plugin vendored; no client event adoption.
  if (await exists("vendor/upstream/packages/core/src/plugin/goal.ts"))
    fail("3: the server-side goal plugin was vendored (remote service domain — out of scope by AGENTS.md)")
  if (await exists("vendor/upstream/packages/core"))
    fail("3: packages/core appeared in the closure (it is not a registered package)")
  // old->new (issue #194): the session.metadata.updated negative RETIRED — the event handler is
  // upstream-native at v2.2.7 (client solid/data.ts reconciles the metadata record; not a
  // v2.2.1-era adoption by the goal/sources slice, and unrelated to the goal domain).
  const clientData = await read("vendor/upstream/packages/client/src/solid/data.ts")
  if (!clientData.includes('case "session.metadata.updated":'))
    fail("3: client solid/data.ts lost the upstream-native session.metadata.updated handler (old->new issue #194: the v2.2.1-era negative retired — the event is upstream-native now)")
}

// --- 4. Sources (pin body + gui-plugins-v2-2-7 narrow-screen faces + consumption chain) ---
{
  const index = await read(`${GUI}sources/index.ts`)
  for (const anchor of ["import { Plugin } from \"@opencode/plugin/gui\"", "export default Plugin.define({ i18n: { en } })"]) {
    if (!index.includes(anchor)) fail(`4: sources/index.ts lost the anchor ${anchor}`)
  }

  const renderer = squash(await read(`${GUI}sources/renderer.tsx`))
  for (const anchor of [
    "match:(link)=>sourcesExperiment.enabled&&link.origin===ctx.id&&!!link.session",
    "open(link){if(link.session)ctx.layout.open(`${ctx.id}:${link.href}`,link.session,{tab:\"select\"})}",
    'region:"side",',
    "transient:true,",
    'ctx.t("tab.count",{count:count(input.session,id)})',
    "if(!sourcesExperiment.enabled){tabs.delete(input.session.key)",
    "return[]",
    "onIdle(()=>{",
    "if(sourcesExperiment.enabled)voidSourcesTab.preload()",
    "SourcesTitle",
    "constcount=(session:MountedSession,id:string)=>turnSources(turnMessages(session.server.data.session.message.list(session.id),id)).sources.length",
  ]) {
    if (!renderer.includes(anchor)) fail(`4: sources/renderer.tsx lost the pin anchor ${anchor.slice(0, 60)}`)
  }
  // gui-plugins-v2-2-7 faces: the mobile face + the gate-off honest fallback.
  for (const anchor of [
    'mobile(gui-plugins-v2-2-7,issue#194;M-036):thenarrow-screenMore-drawerentry',
    "mobile:{",
    'returnctx.t("panel.title")',
    "order:60,",
    'kind:"menu",',
    'icon:"globe",',
    'ctx.t("panel.disabled")',
  ]) {
    if (!renderer.includes(anchor)) fail(`4: sources/renderer.tsx lost the gui-plugins-v2-2-7 face ${anchor.slice(0, 60)}`)
  }

  const panel = squash(await read(`${GUI}sources/panel.tsx`))
  for (const anchor of [
    "constpane=ctx.use(Browser)()",
    'if(pane.status==="active"&&pane.value.canOpen(props.session))returnpane.value.open(props.session,url)',
    "ctx.system.openExternal(url)",
    'props.from!=="turn"',
    "mobile(gui-plugins-v2-2-7,issue#194;M-036)",
    "for(letindex=list.length-1;index>=0;index--){",
    "if(value.steps.length>0)returnvalue",
    "return{steps:[],sources:[]}",
    'ctx.t("panel.none")',
    'data-slot="session-sources-panel"',
  ]) {
    if (!panel.includes(anchor)) fail(`4: sources/panel.tsx lost the anchor ${anchor.slice(0, 60)}`)
  }

  const sourcesI18n = await read(`${GUI}sources/i18n/en.ts`)
  if (!sourcesI18n.includes('"tab.count": "Sources · {{count}}"')) fail("4: sources i18n en lost tab.count verbatim")
  if (!sourcesI18n.includes('"panel.title": "Sources",') || !sourcesI18n.includes("panel.disabled") || !sourcesI18n.includes("panel.none") || !sourcesI18n.includes("mobile(gui-plugins-v2-2-7, issue #194; M-036)"))
    fail("4: sources i18n en lost the gui-plugins-v2-2-7 mobile-face keys with their marker")

  // session-ui exports.
  const pkg = await read(`${SUI}package.json`)
  for (const anchor of [
    '"./sources": "./src/sources/sources.ts",',
    '"./sources/experiment": "./src/sources/experiment.ts",',
    '"./sources/panel": "./src/sources/sources-panel.tsx",',
    '"./sources/title": "./src/sources/sources-title.tsx",',
  ]) {
    if (!pkg.includes(anchor)) fail(`4: session-ui package.json lost the export ${anchor}`)
  }

  // ui en: nine keys after ui.message.modelVariant, before the sessionTimeline block.
  const uiEn = await read(`${UI}src/i18n/en.ts`)
  const uiKeys = [
    '"ui.sources.count.one"',
    '"ui.sources.count.other"',
    '"ui.sources.none"',
    '"ui.sources.title"',
    '"ui.sources.searched"',
    '"ui.sources.searchFailed"',
    '"ui.sources.noResults"',
    '"ui.sources.opened"',
    '"ui.sources.openFailed"',
  ]
  let prev = uiEn.indexOf('"ui.message.modelVariant"')
  if (prev === -1) fail("4: ui en.ts lost the modelVariant insertion anchor")
  for (const key of uiKeys) {
    const at = uiEn.indexOf(key)
    if (at === -1) fail(`4: ui en.ts lost ${key}`)
    if (at < prev) fail(`4: ui en.ts sources keys are not in order at ${key}`)
    prev = at
  }
  if (uiEn.indexOf('"ui.sessionTimeline.notice.model"') < prev)
    fail("4: ui en.ts sources keys must sit before the sessionTimeline block")

  // app en/zh: the row.sources.* pair (gui-plugins-v2-2-7, #193 pairing convention).
  const appEn = await read(`${APP}src/runtime/i18n/en.ts`)
  const srcTitle = appEn.indexOf('"settings.experimental.row.sources.title"')
  const srcDesc = appEn.indexOf('"settings.experimental.row.sources.description"')
  const sidebarList = appEn.indexOf('"settings.experimental.sidebarOrganize.list"')
  if (sidebarList < 0 || srcTitle < 0 || srcDesc < 0 || !(sidebarList < srcTitle && srcTitle < srcDesc))
    fail("4: app en.ts sources row keys are not right after the sidebarOrganize.list row (gui-plugins-v2-2-7 position)")
  if (!appEn.includes('"settings.experimental.row.sources.title": "Sources",'))
    fail("4: app en.ts lost the sources row title value")
  const appZh = await read(`${APP}src/runtime/i18n/zh.ts`)
  if (!appZh.includes('"settings.experimental.row.sources.title": "来源",') || !appZh.includes('"settings.experimental.row.sources.description": "一轮回复检索并阅读过的页面",'))
    fail("4: app zh.ts lost the sources row pair (gui-plugins-v2-2-7 en/zh pairing per the #193 convention)")
  if (!appZh.includes("mobile(gui-plugins-v2-2-7, issue #194"))
    fail("4: app zh.ts lost the sources row marker comment")
  // The upstream en-only rows stay key-free in zh (only the first-party pair is translated).
  if (appZh.includes("settings.experimental.row.newIcons") || appZh.includes("settings.experimental.row.foldUserMessages"))
    fail("4: app zh.ts carries upstream en-only experimental rows (the fallback delta is upstream's; only row.sources.* is first-party)")

  // Experimental row (gui-plugins-v2-2-7 writer face): flips the registered knob via the
  // exported accessor — the storedToggle/setStoredToggle write path does not exist at v2.2.7.
  const experimental = await read(`${APP}src/settings/experimental/experimental.tsx`)
  for (const anchor of [
    'import { setSourcesEnabled, sourcesExperiment } from "@opencode/session-ui/sources/experiment"',
    'data-action="settings-sources"',
    'title={language.t("settings.experimental.row.sources.title")}',
    'description={language.t("settings.experimental.row.sources.description")}',
    "checked={sourcesExperiment.enabled}",
    "onChange={(checked) => setSourcesEnabled(checked)}",
    "mobile(gui-plugins-v2-2-7, issue #194; M-036)",
  ]) {
    if (!experimental.includes(anchor)) fail(`4: experimental.tsx lost the sources row anchor ${anchor}`)
  }
  for (const gone of ["storedToggle", "setStoredToggle", "motion-tuning"]) {
    if (experimental.includes(gone))
      fail(`4: experimental.tsx carries the retired write path token "${gone}" (old->new issue #194: the row flips the knob through setSourcesEnabled)`)
  }

  // App SourcesProvider wrapper (inside the Links/MarkdownProvider composition).
  const render = await read(`${APP}src/runtime/plugin/render.tsx`)
  for (const anchor of [
    'import { SourcesProvider } from "@opencode/session-ui/context/sources"',
    'import { sourcesExperiment } from "@opencode/session-ui/sources/experiment"',
    "A turn's sources chip opens its turn",
    "<SourcesProvider",
    "enabled={sourcesExperiment.enabled}",
    "icons={sourcesExperiment.icons}",
    'onOpen={(from) => void host.links.open({ href: from, origin: "sources", session: props.session })}',
    "</SourcesProvider>",
  ]) {
    if (!render.includes(anchor)) fail(`4: app render.tsx lost the SourcesProvider anchor ${anchor.slice(0, 50)}`)
  }
  if (!(render.indexOf("<MarkdownProvider") !== -1 && render.indexOf("<MarkdownProvider") < render.indexOf("<SourcesProvider")))
    fail("4: SourcesProvider must compose inside the Links/MarkdownProvider")

  // Consumption chain: timeline-row -> current-message -> message-content.
  const row = await read(`${SUI}src/timeline/session-timeline-row.tsx`)
  for (const anchor of [
    'import { useSources } from "../context/sources"',
    'import { turnSources } from "../sources/sources"',
    "const sourcesHost = useSources()",
    "const turnSourcesValue = createMemo(() => {",
    "if (!sourcesHost?.enabled || !current || copyContentID(row().userMessageID) !== current.partID) return undefined",
    "input.projection.assistantMessagesByParent().get(row().userMessageID) ?? emptyAssistantMessages,",
    "return value.steps.length > 0 ? value : undefined",
    "sources={turnSourcesValue()}",
    "onOpenSources={() => sourcesHost?.open(row().userMessageID)}",
  ]) {
    if (!row.includes(anchor)) fail(`4: session-timeline-row.tsx lost the anchor ${anchor.slice(0, 60)}`)
  }

  const current = await read(`${SUI}src/message/current-message.tsx`)
  for (const anchor of [
    'import type { TurnSources } from "../sources/sources"',
    "sources?: TurnSources",
    "onOpenSources?: () => void",
    "sources={props.sources}",
    "onOpenSources={props.onOpenSources}",
  ]) {
    if (!current.includes(anchor)) fail(`4: current-message.tsx lost the anchor ${anchor}`)
  }

  const content = await read(`${SUI}src/message/message-content.tsx`)
  for (const anchor of [
    "const sourcesHost = useSources()",
    "let rendered = false",
    "const sources = () => (props.showCopy && sourcesHost?.enabled ? props.sources : undefined)",
    "<Show when={sources()} fallback={<Show when={props.showCopy}>{copyFooter()}</Show>}>",
    'data-slot="text-part-footer"',
    "appear={rendered}",
    'icons={sourcesHost?.icons ?? "letters"}',
    "onOpen={() => props.onOpenSources?.()}",
    "function copyFooter() {",
  ]) {
    if (!content.includes(anchor)) fail(`4: message-content.tsx lost the anchor ${anchor.slice(0, 60)}`)
  }

  // Layering witness: the settings-experimental fold anchors stay in place (first lock: the #64 probe).
  for (const anchor of ["foldUserMessages?: Accessor<boolean>", "fold={input.foldUserMessages?.()}"]) {
    if (!row.includes(anchor)) fail(`4: session-timeline-row.tsx lost the settings-experimental fold witness ${anchor.trim()}`)
  }
  if (!content.includes("const USER_MESSAGE_FOLD = { over: 12, show: 8 }"))
    fail("4: message-content.tsx lost the settings-experimental USER_MESSAGE_FOLD witness")
}

// --- 5. Gate/knob (v2.2.7 real module, default false, single-registration accessor) ---
{
  const shim = await read(`${UI}src/motion-tuning.ts`)
  for (const anchor of [
    'const key = "opencode.motion.v2"',
    "export const motionTuning = {",
    "toggle(id: string, meta: Meta & { value: boolean }) {",
    "spring(id: string, meta: Meta & { presets: Record<MotionPreset, DurationOptions>; shipped?: MotionPreset }) {",
    "subscribe(listener: () => void) {",
    "set<K extends MotionKnob>(knob: K, value: K[\"value\"]) {",
    "list: () => [...knobs.values()],",
    "export const motionPresets",
    "export type MotionKnob",
    "export function motionTimeScale()",
    "export const motionGlobals",
    'JSON.parse(localStorage.getItem(key) ?? "{}")',
  ]) {
    if (!shim.includes(anchor)) fail(`5: motion-tuning.ts lost the anchor ${anchor.slice(0, 60)}`)
  }
  // old->new (issue #194): the v2.2.1 shim helpers are GONE at v2.2.7 — the settings row rides
  // the knob accessor instead.
  for (const gone of ["storedToggle", "setStoredToggle"]) {
    if (shim.includes(gone))
      fail(`5: motion-tuning.ts carries the retired shim helper "${gone}" (old->new issue #194: the v2.2.7 module has no stored write helpers)`)
  }
  if (shim.includes("settings.v3")) fail("5: motion-tuning.ts adopted the settings.v3 key (out of scope)")
  if (/from ["']knobs["']/.test(shim)) fail("5: motion-tuning.ts imports knobs at runtime (only -fields may)")
  const runtimeImports = [...shim.matchAll(/^import (?!type).*$/gm)].map((m) => m[0])
  if (runtimeImports.length !== 0) fail(`5: motion-tuning.ts must be import-free at runtime, got ${JSON.stringify(runtimeImports)}`)
  // The knobs-consuming submodules ship and keep the console DEV-only.
  for (const f of [`${UI}src/motion-tuning-features.ts`, `${UI}src/motion-tuning-fields.ts`]) {
    const body = await read(f)
    if (!body.includes("knobs")) fail(`5: ${f.split("/").pop()} lost the knobs import`)
  }
  // Default false at the knob declaration (NEGATIVE 1 flips it).
  const experiment = await read(`${SUI}src/sources/experiment.ts`)
  if (!experiment.includes("value: false,")) fail("5: sources experiment knob default is not false (must not ship enabled)")
  // The four consumed faces, verbatim call shapes.
  for (const anchor of [
    'motionTuning.toggle("sources.enabled"',
    'motionTuning.choice("sources.icons"',
    'motionTuning.spring("sources.fade"',
    'motionTuning.spring("sources.expand"',
    "motionTuning.subscribe(",
    'value: "letters",',
    "experiment: true,",
    "export const sourcesExperiment = state",
  ]) {
    if (!experiment.includes(anchor)) fail(`5: experiment.ts lost the call anchor ${anchor}`)
  }
  // The gui-plugins-v2-2-7 write path: the accessor closes over the single registered instance —
  // no re-registration (Map.set would clobber it), no call-site lookup.
  for (const anchor of [
    "motionTuning",
    'knob.id === "sources.enabled"',
    "export const setSourcesEnabled = (value: boolean) => {",
    "motionTuning.set(enabledKnob, value)",
    "mobile(gui-plugins-v2-2-7, issue #194; M-036)",
  ]) {
    if (!experiment.includes(anchor)) fail(`5: experiment.ts lost the setSourcesEnabled accessor anchor ${anchor}`)
  }
  if ((experiment.match(/motionTuning\.toggle\("sources\.enabled"/g) ?? []).length !== 1)
    fail("5: experiment.ts must register sources.enabled EXACTLY once (a second motionTuning.toggle would Map.set-clobber the instance — the row would show on while the experiment stays off)")
}

// --- 6. Icons + patch registration ---
{
  const catalog = await read(`${UI}src/icons/catalog.ts`)
  if (!catalog.includes("M8 3.86328V12.1391C10.2854 12.1391 12.1379 10.2863 12.1379 8.00121C12.1379 5.71608 10.2854 3.86328 8 3.86328Z"))
    fail("6: outline-steer body drifted from the v2.2.1 artwork (pin-native at v2.2.7)")
  if (catalog.indexOf('"outline-steer"') < catalog.indexOf("  waveform: {"))
    fail("6: outline-steer must sit after waveform (catalog position)")

  const manifest = await read(`${PATCHES}manifest.json`)
  // The absorbed predecessor stays registered with its historical payload (file untouched).
  if (!manifest.includes('"id": "session-goal-sources-panels"') || !manifest.includes("patches/mobile/session-goal-sources-panels.patch"))
    fail("6: patches/mobile/manifest.json does not register session-goal-sources-panels")
  const registry = JSON.parse(manifest) as { patches?: Array<{ id?: string; status?: string; sha256?: string }> }
  const absorbedRow = (registry.patches ?? []).find((p) => p.id === "session-goal-sources-panels")
  if (!absorbedRow || absorbedRow.status !== "absorbed")
    fail("6: session-goal-sources-panels did not flip to absorbed (old->new issue #194: goal half pin-native, narrow-screen faces re-landed by gui-plugins-v2-2-7)")
  // The new carrier in BOTH manifests (mobilePatches position 10, dependsOn settings-v2-2-7).
  if (!manifest.includes('"id": "gui-plugins-v2-2-7"') || !manifest.includes("patches/mobile/gui-plugins-v2-2-7.patch"))
    fail("6: patches/mobile/manifest.json does not register gui-plugins-v2-2-7")
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  const order = JSON.parse(await read("vendor/upstream/vendor-manifest.json"))["mobilePatches"] as string[]
  if (!vendorManifest.includes("patches/mobile/gui-plugins-v2-2-7.patch"))
    fail("6: vendor-manifest.json does not register gui-plugins-v2-2-7 (verify-closure reads only this list)")
  if (order[9] !== "patches/mobile/gui-plugins-v2-2-7.patch")
    fail("6: gui-plugins-v2-2-7 is not mobilePatches position 10 (dependsOn settings-v2-2-7 at position 9)")
  const patch = await read(`${PATCHES}gui-plugins-v2-2-7.patch`)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  if (touched.length !== 11) fail(`6: gui-plugins-v2-2-7 patch face drifted: ${touched.length} files (expected exactly 11)`)
  for (const required of [
    "packages/gui-plugins/src/btw/renderer.tsx",
    "packages/gui-plugins/src/btw/model.ts",
    "packages/gui-plugins/src/btw/i18n/en.ts",
    "packages/gui-plugins/src/sources/renderer.tsx",
    "packages/gui-plugins/src/sources/panel.tsx",
    "packages/gui-plugins/src/sources/i18n/en.ts",
    "packages/gui-plugins/src/details/details.css",
    "packages/app/src/settings/experimental/experimental.tsx",
    "packages/session-ui/src/sources/experiment.ts",
    "packages/app/src/runtime/i18n/en.ts",
    "packages/app/src/runtime/i18n/zh.ts",
  ]) {
    if (!touched.includes(required)) fail(`6: gui-plugins-v2-2-7 patch lost the target ${required}`)
  }
  // The retired 22-file face claim: session-goal-sources-panels' own patch file must stay
  // untouched on disk (its historical identity, not replayed).
  const oldPatch = await read(`${PATCHES}session-goal-sources-panels.patch`)
  if (!oldPatch.includes("packages/session-ui/src/sources/sources.ts"))
    fail("6: the absorbed session-goal-sources-panels payload lost its historical face (the file must stay untouched on disk)")

  console.log(
    "verify-goal-sources: dist marker NOT staged for the goal/sources family — the patches carry no credential/security " +
      "semantics; the gate stores a non-sensitive device-local UI preference (an experiment gate) in " +
      "the upstream opencode.motion.v2 record, so the connection-password-memory-only marker precedent does not apply (deliberate note).",
  )
}

// --- 7. Motion (verbatim zero-import modules + reduced-motion face) ---
{
  const spring = await read(`${UI}src/motion/spring.ts`)
  const loop = await read(`${UI}src/motion/loop.ts`)
  for (const [name, body] of [["spring.ts", spring], ["loop.ts", loop]] as const) {
    if (/^import /m.test(body)) fail(`7: ${name} must be a zero-import module (verbatim)`)
  }
  for (const anchor of ["export class Spring {", "static fromDuration(", "step(dt: number)", "get resting()"]) {
    if (!spring.includes(anchor)) fail(`7: spring.ts lost the anchor ${anchor}`)
  }
  for (const anchor of ["export function createFrameLoop(", "export const frameLoop = createFrameLoop()", "requestAnimationFrame(callback)"]) {
    if (!loop.includes(anchor)) fail(`7: loop.ts lost the anchor ${anchor}`)
  }
  // old->new (issue #194): the motion entry is the FULL upstream re-export list now — the
  // v2.2.1-era M-035/M-036 provenance comment retired with the absorption.
  const index = await read(`${UI}src/motion/index.ts`)
  for (const anchor of ['export * from "./spring"', 'export * from "./loop"', 'export * from "./velocity"', 'export * from "./reduced"', 'export * from "./waapi"', 'export * from "./slider"']) {
    if (!index.includes(anchor)) fail(`7: motion/index.ts lost ${anchor}`)
  }
  if (index.includes("mobile(M-036)") || index.includes("M-035"))
    fail("7: motion/index.ts still carries the retired M-035/M-036 provenance comment (absorbed upstream)")

  const css = await read(`${SUI}src/sources/sources.css`)
  const reduceBlocks = [...css.matchAll(/:root\[data-motion="reduce"\]/g)].length
  if (reduceBlocks !== 3) fail(`7: sources.css must carry exactly three :root[data-motion="reduce"] blocks, got ${reduceBlocks}`)
  if (css.includes("prefers-reduced-motion") || css.includes("@media"))
    fail("7: sources.css must use the data-motion attribute face only (appearance-motion-zoom mechanism)")

  // Within the sources motion surface, only reduced.ts mentions the media query.
  const motionFiles = [
    `${UI}src/motion/index.ts`,
    `${UI}src/motion/reduced.ts`,
    `${UI}src/motion/spring.ts`,
    `${UI}src/motion/loop.ts`,
    `${UI}src/motion-tuning.ts`,
    `${SUI}src/sources/sources.css`,
    `${SUI}src/sources/sources-panel.tsx`,
    `${SUI}src/sources/sources-chip.tsx`,
  ]
  const mentioning: string[] = []
  for (const file of motionFiles) {
    if ((await read(file)).includes("prefers-reduced-motion")) mentioning.push(file.split("/").slice(-2).join("/"))
  }
  setEq(mentioning, ["motion/reduced.ts"], "7: prefers-reduced-motion mentions within the sources motion surface")
}

console.log(
  "verify-goal-sources: PASS (" +
    "1: registration — renderer.ts compose exactly 15 entries (microsoft-office -> sources -> goal), main.ts same 15-id table with the six lazy main entries unchanged, mobile face order set exactly {10,20,30,40,50,60,80} no duplicates (review 10 tab / file 20 / terminal 30 / context 40 menu / details 50 drawer pin-native; sources 60 + btw 80 re-landed by gui-plugins-v2-2-7; NO 70 — the v2.2.7 goal is the native ComposerPill, old->new issue #194 from {10..80}); " +
    "2: host boundary — old-host tokens {gui-extensions specifier, Extension.define, useExtension} zero-hit across the four vendored domains; ComposerPill/plugin-pills flipped to positive anchors (the pin-native goal face); " +
    "3: goal — schema/opencode.goal with the three toStandardSchemaV1 wrappers (upstream-native; PortableDefinition), the machine form (createGoalState/transitionGoal/selectGoal/selectGoalBusy + GOAL_* timeouts, createKeyed keyed subscription, guarded fetch/subscribe/command, three-state status map, common.requestFailed toast, pill menu pause/resume/clear), no Panel/mobile face/none-key (retired negatives), no server plugin vendored, session.metadata.updated upstream-native (old->new issue #194: the adoption negative retired); " +
    "4: sources — pin body anchors (Plugin.define two-liner, LinkHandler, transient gate-off list, onIdle preload, SourcesTitle/count), gui-plugins-v2-2-7 faces (mobile 60 menu globe, panel.disabled fallback, panel-id turn dispatch most-recent-turn, panel.none, panel.* i18n with the marker), session-ui exports 4, ui en 9 keys in position, app en/zh row.sources.* pair (#193 convention) with upstream rows zh-key-free, Experimental row via setSourcesEnabled (storedToggle path retired), SourcesProvider inside Links/MarkdownProvider, three hook increments, fold witnesses intact; " +
    "5: gate/knob — the v2.2.7 Knobs registry module (opencode.motion.v2, set/list/actions, motionPresets/MotionKnob/motionTimeScale/motionGlobals, zero runtime imports; storedToggle/setStoredToggle retired), knob default false (NEGATIVE 1 target), the four consumed faces verbatim + the gui-plugins-v2-2-7 setSourcesEnabled accessor (single-registration capture, no call-site lookup), sources.enabled registered exactly once; " +
    "6: icons + registration — outline-steer verbatim artwork after waveform, session-goal-sources-panels absorbed (payload on disk untouched), gui-plugins-v2-2-7 in BOTH manifests at mobilePatches position 10 with the exact 11-file face, dist-marker absence recorded deliberately; " +
    "7: motion — spring/loop zero-import verbatim, the FULL upstream motion entry (six re-exports; M-035/M-036 provenance comment retired), sources.css three data-motion blocks and zero @media, prefers-reduced-motion mentions within the surface exactly {motion/reduced.ts}; " +
    "STATIC check - tab reachability, gate restart persistence, chip/panel presentation, goal command round-trips, toast rendering, empty states and TalkBack are device QA items registered in docs/build-and-verify.md)",
)
