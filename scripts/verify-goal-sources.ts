// verify-goal-sources.ts — static probe for issue #66 (W22+W23: register the Goal and
// Sources panels, the v2.2.1 delta).
//
// Asserts, against the REAL vendored/first-party sources (pin b4525d79bf… + M-001..M-036),
// the structural facts the issue #66 alignment record relies on:
//
//   1. Registration face: renderer.ts carries exactly 15 compose entries with sources and
//      goal appended after microsoft-office in the v2.2.1 gui-plugins compose order (sources
//      then goal); main.ts carries the same 15-id table with the six lazy main entries
//      unchanged (sources/goal are renderer-only, ids reserved); the mobile face order set
//      is exactly {10,20,30,40,50,60,70} — no duplicates (sources 60 menu, goal 70 menu).
//   2. #67 host boundary: the four new-host tokens (`@opencode/plugin/gui`, `ComposerPill`,
//      `plugin-pills`, `usePlugin`) have ZERO hits across the four vendored domains
//      (gui-extensions/src, session-ui/src, app/src, ui/src — packages/plugin etc. are NOT
//      scan domains; their `@opencode/plugin` references predate and are unrelated), and the
//      two new builtin directories are additionally scanned as a precise double check.
//   3. Goal contract: schema/goal.ts is the v2.2.1 verbatim form including its THREE
//      `Schema.toStandardSchemaV1(...)` wrappers. Implementation note (deviation from the
//      approved plan recorded here): the plan expected the wrappers stripped because the pin
//      tree has no usage of that API — at implementation the closure's effect@4.0.1 DOES
//      export it and the promise client's RpcClient<P extends Rpc.PortableDefinition>
//      requires the Standard Schema form (raw effect codecs fail the PortableDefinition
//      bound), so the verbatim v2.2.1 form landed and is locked here. The renderer's data
//      layer is verbatim (per-server+session store, createKeyed keyed on server.connected +
//      directory, heard-flag late-snapshot drop, the error-swallow comment that degrades a
//      server without the goal plugin to "no goal"), the three-state status map and the
//      session.command pause/resume/clear path with the error toast are verbatim; the UI is
//      the registered Panel re-shell (pinned transient side tab + mobile face order 70).
//      Negatives: the server-side goal plugin is NOT vendored, and the client's
//      session.metadata.updated event face is NOT adopted.
//   4. Sources port: the 0f379f0a33 old-host four files verbatim (soft browser `uses`, the
//      transient side panel whose list empties when the experiment is off, the LinkHandler,
//      i18n tab.count, the panel's uses.browser()/openExternal fallback) plus the registered
//      narrow-screen branch (panel id path -> most recent turn with sources, empty states).
//      session-ui exports, ui en 9 keys, app en 2 keys (en-only; sampled locales stay
//      key-free), the Experimental tab row, the app SourcesProvider wrapper, and the three
//      timeline hook increments — with the M-034 fold anchors still in place (layering
//      witness).
//   5. Gate shim: ui/src/motion-tuning.ts implements ONLY the four faces experiment.ts
//      consumes (toggle/choice/spring/subscribe) over the upstream `opencode.motion.v2`
//      localStorage record (toggles 0|1, choices the option index, non-default entries
//      only, record removed when empty), default false (the Experimental row reads the same
//      default), no settings.v3 key, no Knob registry/panel/globals/action face, zero
//      runtime imports.
//   6. user-runs/quote domain negatives (BLOCKER-1 cross-check with the revised
//      verify-experimental-settings group 5 kept set): the sources slice carries none of
//      the rewrite domain — message-content/current-message/timeline-row token scans, the
//      14 kept catalog rejections, and clean new session-ui directories.
//   7. Motion: spring.ts/loop.ts are verbatim zero-import modules behind the motion entry;
//      the sources surface uses only :root[data-motion="reduce"] (three blocks, zero
//      @media prefers-reduced-motion); among the new motion surface only reduced.ts
//      mentions prefers-reduced-motion (its query constant). The whole-tree three-file
//      whitelist set-equality is verify-appearance-settings' (#65) lock and is NOT
//      re-asserted here — this branch predates the M-035 tree conversion (rebase round
//      re-checks).
//   8. Icons + patch registration: outline-steer is the verbatim v2.2.1 artwork (the only
//      catalog addition; removed from the #64 probe's rejected list in the same commit);
//      M-036 is registered in BOTH manifests with the exact 34-file patch face. No dist
//      marker is staged for this patch: it carries no credential/security semantics — the
//      gate shim stores a non-sensitive, device-local UI preference (an experiment gate),
//      so the M-002 marker precedent does not apply; recorded here deliberately.
//
// NEGATIVE EXAMPLES (run at verification time by injecting/reverting mutations;
// inject -> FAIL rc=1 -> restore -> PASS rc=0, logs kept):
//   1. flip the gate default `value: false` -> `value: true` in
//      session-ui/src/sources/experiment.ts -> group 5 default-false FAIL;
//   2. delete the goal mobile face (the `order: 70` block) from
//      gui-extensions/src/goal/renderer.tsx -> group 1 order-set FAIL;
//   3. inject `import { probe } from "@opencode/plugin/gui"` into
//      gui-extensions/src/sources/index.ts -> group 2 domain scan FAIL.
//
// HONEST BOUNDARY (same tradition as the sibling probes): static STRUCTURE check — text
// anchors / set equalities / negative injections. It proves source shape, NOT runtime
// behavior: tab reachability, the gate surviving process restarts (off by default), the
// chip presentation and panel opening, goal command round-trips against real servers, the
// error toast, the empty states and TalkBack announcement are device QA items registered in
// docs/build-and-verify.md (issue #66 section), NOT executed at this level.
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

const GUI = "vendor/upstream/packages/gui-extensions/src/"
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
  const renderer = await read(`${GUI}renderer.ts`)
  const composeStart = renderer.indexOf("export const builtins = Extension.compose(")
  if (composeStart === -1) fail("1: renderer.ts lost the builtins compose")
  const composeBlock = renderer.slice(composeStart, renderer.indexOf("\n)", composeStart))
  const entryLines = composeBlock.split("\n").filter((line) => /^\s*\{/.test(line))
  if (entryLines.length !== EXPECTED_IDS.length)
    fail(`1: builtins compose must carry exactly ${EXPECTED_IDS.length} entries, got ${entryLines.length} (NEGATIVE 2 deletes the goal mobile face / an entry)`)
  const spreadIds = [...composeBlock.matchAll(/\.\.\.(\w+),/g)].map((m) => m[1]!)
  const camel: Record<string, string> = { microsoftOffice: "microsoft-office" }
  setEq(
    spreadIds.map((id) => camel[id] ?? id),
    EXPECTED_IDS,
    "1: builtins compose id set",
  )
  // v2.2.1 compose order: … microsoft-office, sources, goal.
  const at = (id: string) => composeBlock.indexOf(`...${id},`)
  for (const id of ["microsoftOffice", "sources", "goal"]) if (at(id) === -1) fail(`1: compose lost the ${id} entry`)
  if (!(at("microsoftOffice") < at("sources") && at("sources") < at("goal")))
    fail("1: compose order must be microsoft-office -> sources -> goal (v2.2.1 gui-plugins renderer.ts order)")

  const main = await read(`${GUI}main.ts`)
  const mainImports = [...main.matchAll(/import (\w+) from "\.\/([\w-]+)"/g)].map((m) => m[1]!)
  const mainCamel: Record<string, string> = { microsoftOffice: "microsoft-office" }
  setEq(
    mainImports.map((id) => mainCamel[id] ?? id),
    [...EXPECTED_IDS],
    "1: main.ts import table (same 15 builtins)",
  )
  const mainLazy = [...main.matchAll(/\{\s*\.\.\.(\w+),\s*main:/g)].map((m) => m[1]!)
  setEq(mainLazy, EXPECTED_MAIN_LAZY, "1: main.ts lazy main-entry set (sources/goal are renderer-only)")

  // Mobile face orders across the seven registered faces: no duplicates, exact set.
  const faces: Array<[string, number, string]> = [
    ["review/renderer.tsx", 10, "tab"],
    ["file/renderer.tsx", 20, "menu"],
    ["terminal/renderer.tsx", 30, "menu"],
    ["context/renderer.tsx", 40, "menu"],
    ["details/renderer.tsx", 50, "drawer"],
    ["sources/renderer.tsx", 60, "menu"],
    ["goal/renderer.tsx", 70, "menu"],
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
  setEq(seenOrders, [10, 20, 30, 40, 50, 60, 70], "1: mobile face order set {10..70}")
}

// --- 2. #67 host boundary (four tokens x four vendored domains, zero hits) ---
{
  const TOKENS = ["@opencode/plugin/gui", "ComposerPill", "plugin-pills", "usePlugin"]
  const DOMAINS = [
    "vendor/upstream/packages/gui-extensions/src",
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
      for (const token of TOKENS) if (body.includes(token)) hit(path.replace(`${repoRoot.pathname}`, ""), token)
    }
  }
  let leaked = false
  for (const domain of DOMAINS) await scan(`${repoRoot.pathname}${domain}`, (path, token) => {
    leaked = true
    console.error(`  boundary leak: ${path} mentions ${token}`)
  })
  if (leaked) fail("2: a #67 new-host token leaked into the vendored domains (NEGATIVE 3 injects one deliberately)")

  // Double check: the two new builtin directories precisely.
  for (const dir of [`${GUI}sources`, `${GUI}goal`]) {
    for (const entry of readdirSync(`${repoRoot.pathname}${dir}`, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const inner of readdirSync(`${repoRoot.pathname}${dir}/${entry.name}`)) {
          const body = await Bun.file(`${repoRoot.pathname}${dir}/${entry.name}/${inner}`).text()
          for (const token of TOKENS) if (body.includes(token)) fail(`2: ${dir}/${entry.name}/${inner} mentions ${token}`)
        }
        continue
      }
      const body = await Bun.file(`${repoRoot.pathname}${dir}/${entry.name}`).text()
      for (const token of TOKENS) if (body.includes(token)) fail(`2: ${dir}/${entry.name} mentions ${token}`)
    }
  }
}

// --- 3. Goal contract (schema + data layer + Panel re-shell + degradation negatives) ---
{
  const schema = await read("vendor/upstream/packages/schema/src/goal.ts")
  if (!schema.includes('export * as Goal from "./goal.js"')) fail("3: schema/goal.ts lost the Goal namespace export")
  if (!schema.includes('id: "opencode.goal",')) fail("3: schema/goal.ts lost the opencode.goal RPC id")
  if (!schema.includes('Schema.Literals(["active", "paused", "complete"])')) fail("3: schema/goal.ts lost the Status literals")
  for (const field of ["objective", "reason", "rounds", "maxRounds", "stalls", "boot", "updatedAt"]) {
    if (!schema.includes(`${field}:`)) fail(`3: schema/goal.ts State lost the ${field} field`)
  }
  if (!schema.includes("optional(Schema.String)")) fail("3: schema/goal.ts lost the optional() reason/stalls shape")
  if (!schema.includes("Rpc.define({")) fail("3: schema/goal.ts lost the Rpc.define form")
  // The THREE Standard Schema wrappers (v2.2.1 verbatim; see the implementation note in the header).
  const wrappers = [...schema.matchAll(/: Schema\.toStandardSchemaV1\(/g)].length
  if (wrappers !== 3) fail(`3: schema/goal.ts must carry exactly three Schema.toStandardSchemaV1 wrappers (get.input/get.output/events.changed.schema), got ${wrappers}`)
  for (const anchor of [
    "input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.String })),",
    "output: Schema.toStandardSchemaV1(Schema.NullOr(State)),",
    "schema: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.String, goal: Schema.NullOr(State) })),",
  ]) {
    if (!schema.includes(anchor)) fail(`3: schema/goal.ts lost the wrapper anchor ${anchor.split("(")[0].trim()}`)
  }

  const goal = squash(await read(`${GUI}goal/renderer.tsx`))
  // Data layer, verbatim (ComposerPillProps -> MountedSession is the only rename).
  for (const anchor of [
    "const[goals,setGoals]=createStore<Record<string,{goal:Goal.State|null}>>({})",
    "constkey=(server:string,sessionID:string)=>`${server}\\u0000${sessionID}`",
    "session?.server.connected?key(session.server.id,session.id)+`\\u0000${session.directory}`:undefined",
    "constheard={value:false}",
    "if(event.data.sessionID===session.id)heard.value=true",
    "rpc.events.on(\"changed\",",
    "{signal:controller.signal},",
    "A server without the goal plugin answers with an error, and the session shows no goal.",
    "if(!controller.signal.aborted&&!heard.value)setGoals(key(server,session.id),{goal:next})",
    "()=>undefined,",
  ]) {
    if (!goal.includes(squash(anchor))) fail(`3: goal/renderer.tsx lost the data-layer anchor ${anchor.slice(0, 60)}`)
  }
  // Status map, verbatim.
  for (const anchor of [
    'active:{label:"title",icon:"outline-steer",tone:undefined},',
    'paused:{label:"paused",icon:"circle-exclamation",tone:"warning"},',
    'complete:{label:"met",icon:"circle-check",tone:"success"},',
  ]) {
    if (!goal.includes(anchor)) fail(`3: goal/renderer.tsx lost the status map entry ${anchor.slice(0, 40)}`)
  }
  // Command path + toast failure path, verbatim.
  for (const anchor of [
    'command({sessionID:session.id,name:"goal",text})',
    'title:ctx.t("common.requestFailed"),',
    "causeinstanceofError?cause.message:String(cause),",
    'variant:"error",',
    'run("pause")',
    'run("resume")',
    'run("clear")',
  ]) {
    if (!goal.includes(anchor)) fail(`3: goal/renderer.tsx lost the command/toast anchor ${anchor.slice(0, 50)}`)
  }
  // Panel re-shell (registered delta D1): pinned transient side tab + mobile face 70.
  for (const anchor of ['id:"goal",', 'region:"side",', "transient:true,", "pinned:true,", "order:70,", 'kind:"menu",']) {
    if (!goal.includes(anchor)) fail(`3: goal/renderer.tsx lost the Panel re-shell anchor ${anchor}`)
  }
  if (!goal.includes("mobile(M-036)")) fail("3: goal/renderer.tsx lost the mobile(M-036) marker (D1 provenance)")
  // The pill-only surfaces must not appear: the re-shell lists a Panel, not a pill.
  if (goal.includes("ctx.add(ComposerPill") || goal.includes("ComposerPillProps"))
    fail("3: goal/renderer.tsx adopted the composer-pill host face (D1 violation)")

  const goalI18n = await read(`${GUI}goal/i18n/en.ts`)
  for (const key of ['title: "Goal",', 'paused: "Goal paused",', 'met: "Goal met",', 'pause: "Pause",', 'resume: "Resume",', 'clear: "Clear",']) {
    if (!goalI18n.includes(key)) fail(`3: goal i18n en lost ${key.trim()}`)
  }
  if (!goalI18n.includes("none:") || !goalI18n.includes("mobile(M-036)"))
    fail("3: goal i18n en lost the first-party none empty-state key with its marker")

  // Degradation negatives: no server plugin vendored; no client event adoption.
  if (await exists("vendor/upstream/packages/core/src/plugin/goal.ts"))
    fail("3: the server-side goal plugin was vendored (remote service domain — out of scope by AGENTS.md)")
  if (await exists("vendor/upstream/packages/core"))
    fail("3: packages/core appeared in the closure (it is not a registered package)")
  const clientData = await read("vendor/upstream/packages/client/src/solid/data.ts")
  if (clientData.includes("session.metadata.updated"))
    fail("3: client solid/data.ts adopted session.metadata.updated (server-event domain this issue does not consume)")
}

// --- 4. Sources port (0f379f0a33 verbatim + registered deltas + consumption chain) ---
{
  const index = squash(await read(`${GUI}sources/index.ts`))
  for (const anchor of [
    'id:"sources",',
    "uses:{browser:Browser},",
    "i18n:{en},",
    "Resultsopeninthedesktopbrowserpanewhenthereisone,elseinthesystembrowser.",
    'import{Browser}from"../browser/contract"',
    'import{Extension}from"../sdk"',
  ]) {
    if (!index.includes(anchor)) fail(`4: sources/index.ts lost the 0f379 anchor ${anchor.slice(0, 50)}`)
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
    if (!renderer.includes(anchor)) fail(`4: sources/renderer.tsx lost the 0f379 anchor ${anchor.slice(0, 60)}`)
  }
  if (!renderer.includes("mobile(M-036)") || !renderer.includes("panel.disabled"))
    fail("4: sources/renderer.tsx lost the gate-off empty-state fallback (mobile face honest state)")

  const panel = squash(await read(`${GUI}sources/panel.tsx`))
  for (const anchor of [
    "constpane=ctx.uses.browser()",
    'if(pane.status==="active"&&pane.value.canOpen(props.session))returnpane.value.open(props.session,url)',
    "ctx.system.openExternal(url)",
    'props.from!=="turn"',
    "mobile(M-036)",
    'ctx.t("panel.none")',
    'data-slot="session-sources-panel"',
  ]) {
    if (!panel.includes(anchor)) fail(`4: sources/panel.tsx lost the anchor ${anchor.slice(0, 60)}`)
  }

  const sourcesI18n = await read(`${GUI}sources/i18n/en.ts`)
  if (!sourcesI18n.includes('"tab.count": "Sources · {{count}}"')) fail("4: sources i18n en lost tab.count verbatim")
  if (!sourcesI18n.includes('"panel.title": "Sources",') || !sourcesI18n.includes("panel.disabled") || !sourcesI18n.includes("panel.none") || !sourcesI18n.includes("mobile(M-036)"))
    fail("4: sources i18n en lost the first-party mobile-face keys with their marker")

  // session-ui exports (v2.2.1 same-position block).
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
    if (at < prev) fail(`4: ui en.ts sources keys are not in v2.2.1 order at ${key}`)
    prev = at
  }
  if (uiEn.indexOf('"ui.sessionTimeline.notice.model"') < prev)
    fail("4: ui en.ts sources keys must sit before the sessionTimeline block (v2.2.1 position)")

  // app en: two keys after the foldUserMessages row, before guiExtensions; en-only delta.
  const appEn = await read(`${APP}src/runtime/i18n/en.ts`)
  const foldDesc = appEn.indexOf('"settings.experimental.row.foldUserMessages.description"')
  const srcTitle = appEn.indexOf('"settings.experimental.row.sources.title"')
  const srcDesc = appEn.indexOf('"settings.experimental.row.sources.description"')
  const guiExt = appEn.indexOf('"settings.guiExtensions.title"')
  if (foldDesc < 0 || srcTitle < 0 || srcDesc < 0 || guiExt < 0 || !(foldDesc < srcTitle && srcTitle < srcDesc && srcDesc < guiExt))
    fail("4: app en.ts sources row keys are not right after the foldUserMessages row")
  for (const locale of ["zh", "zht", "ko", "de", "fr"]) {
    if ((await read(`${APP}src/runtime/i18n/${locale}.ts`)).includes("settings.experimental.row.sources"))
      fail(`4: app ${locale}.ts carries the sources row keys (en-fallback is the registered delta)`)
    if ((await read(`${UI}src/i18n/${locale}.ts`)).includes("ui.sources."))
      fail(`4: ui ${locale}.ts carries the sources keys (en-fallback is the registered delta)`)
  }

  // Experimental row (D2 writer face).
  const experimental = await read(`${APP}src/settings/experimental/experimental.tsx`)
  for (const anchor of [
    'data-action="settings-sources"',
    'title={language.t("settings.experimental.row.sources.title")}',
    'description={language.t("settings.experimental.row.sources.description")}',
    'storedToggle("sources.enabled", false)',
    'setStoredToggle("sources.enabled", checked, false)',
    "mobile(M-036)",
  ]) {
    if (!experimental.includes(anchor)) fail(`4: experimental.tsx lost the sources row anchor ${anchor}`)
  }

  // App SourcesProvider wrapper (inside the MarkdownProvider).
  const render = await read(`${APP}src/runtime/extension/render.tsx`)
  for (const anchor of [
    'import { SourcesProvider } from "@opencode/session-ui/context/sources"',
    'import { sourcesExperiment } from "@opencode/session-ui/sources/experiment"',
    "A turn's\n * sources chip opens its turn through the Sources extension's handler.",
    "<SourcesProvider",
    "enabled={sourcesExperiment.enabled}",
    "icons={sourcesExperiment.icons}",
    'onOpen={(from) => void host.links.open({ href: from, origin: "sources", session: props.session })}',
    "</SourcesProvider>",
  ]) {
    if (!render.includes(anchor)) fail(`4: app render.tsx lost the SourcesProvider anchor ${anchor.slice(0, 50)}`)
  }
  if (!(render.indexOf("<MarkdownProvider") < render.indexOf("<SourcesProvider")))
    fail("4: SourcesProvider must wrap inside the MarkdownProvider (v2.2.1 shape)")

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
    'import { useSources } from "../context/sources"',
    'import { SourcesChip } from "../sources/sources-chip"',
    'import type { TurnSources } from "../sources/sources"',
    "const sourcesHost = useSources()",
    "let rendered = false",
    "onMount(() => (rendered = true))",
    "const sources = () => (props.showCopy && sourcesHost?.enabled ? props.sources : undefined)",
    "<Show when={sources()} fallback={<Show when={props.showCopy}>{copyFooter()}</Show>}>",
    'data-slot="text-part-footer"',
    "appear={rendered}",
    'icons={sourcesHost?.icons ?? "letters"}',
    "onOpen={() => props.onOpenSources?.()}",
    "function copyFooter() {",
    '/** The finished turn\'s web searches and fetches, shown as a chip in its footer. */',
  ]) {
    if (!content.includes(anchor)) fail(`4: message-content.tsx lost the anchor ${anchor.slice(0, 60)}`)
  }

  // Layering witness: the M-034 fold anchors stay in place (first lock: the #64 probe).
  for (const anchor of ["foldUserMessages?: Accessor<boolean>", "fold={input.foldUserMessages?.()}"]) {
    if (!row.includes(anchor)) fail(`4: session-timeline-row.tsx lost the M-034 fold witness ${anchor.trim()}`)
  }
  if (!content.includes("const USER_MESSAGE_FOLD = { over: 12, show: 8 }"))
    fail("4: message-content.tsx lost the M-034 USER_MESSAGE_FOLD witness")
}

// --- 5. Gate shim (upstream storage format, default false, minimal face) ---
{
  const shim = await read(`${UI}src/motion-tuning.ts`)
  for (const anchor of [
    'const key = "opencode.motion.v2"',
    "export const motionTuning = {",
    "toggle(id: string, meta: Meta & { value: boolean }) {",
    "choice<const T extends string>(id: string, meta: Meta & { value: NoInfer<T>; labels: Record<T, string> }) {",
    "spring(id: string, meta: Meta & { presets: Record<string, DurationOptions>; shipped?: string }) {",
    "subscribe(listener: () => void) {",
    "export function storedToggle(id: string, initial: boolean) {",
    "export function setStoredToggle(id: string, value: boolean, initial: boolean) {",
    "if (value === initial) delete saved[id]",
    "localStorage.removeItem(key)",
    'JSON.parse(localStorage.getItem(key) ?? "{}")',
    "mobile(M-036)",
  ]) {
    if (!shim.includes(anchor)) fail(`5: motion-tuning.ts lost the anchor ${anchor.slice(0, 60)}`)
  }
  // Default false at the knob declaration (NEGATIVE 1 flips it) and at the settings reader.
  const experiment = await read(`${SUI}src/sources/experiment.ts`)
  const settingsRow = await read(`${APP}src/settings/experimental/experimental.tsx`)
  if (!experiment.includes("value: false,")) fail("5: sources experiment knob default is not false (must not ship enabled)")
  if (!settingsRow.includes('storedToggle("sources.enabled", false)'))
    fail("5: the Experimental row's gate reader default is not false")
  // Minimal face negatives: no Knobs dev-console surface, no settings.v3, no auto-enable.
  for (const forbidden of ["settings.v3", "motionPresets", "MotionKnob", "motionTimeScale", "motionGlobals", "const knobs", "action(", "/components"]) {
    if (shim.includes(forbidden)) fail(`5: motion-tuning.ts adopted the Knobs console face (${forbidden}) — minimal shim only`)
  }
  const runtimeImports = [...shim.matchAll(/^import (?!type).*$/gm)].map((m) => m[0])
  if (runtimeImports.length !== 0) fail(`5: motion-tuning.ts must be import-free at runtime, got ${JSON.stringify(runtimeImports)}`)
  // The four consumed faces, verbatim call shapes in experiment.ts (v2.2.1 file).
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
    if (!experiment.includes(anchor)) fail(`5: experiment.ts lost the shim call anchor ${anchor}`)
  }
}

// --- 6. user-runs/quote domain negatives (sources slice carries none of it) ---
{
  const content = await read(`${SUI}src/message/message-content.tsx`)
  // Same eight-token set the revised #64 probe group 5 keeps (cross-probe interlock).
  for (const token of ["linkSegments", "UserRun", "commentCardTarget", "quoteTooltip", "springStyle", "userRunSpring", "agentLabel", "useNow"]) {
    if (content.includes(token)) fail(`6: message-content.tsx carries the rewrite token ${token} (sources slice boundary)`)
  }
  const current = await read(`${SUI}src/message/current-message.tsx`)
  if (current.includes("UserRun") || current.includes("user-runs")) fail("6: current-message.tsx adopted the UserRun import (only TurnSources crosses)")
  if (current.includes("run?") || current.includes("run={props.run}")) fail("6: current-message.tsx adopted the run prop")
  const row = await read(`${SUI}src/timeline/session-timeline-row.tsx`)
  if (row.includes("run={joined()}")) fail("6: session-timeline-row.tsx adopted the user-runs run={joined()} boundary")
  if (row.includes("user-runs")) fail("6: session-timeline-row.tsx imports from the user-runs domain")

  const catalog = await read(`${UI}src/icons/catalog.ts`)
  // The fourteen KEPT rejections of the revised #64 probe group 6 (outline-steer left the list).
  const rejected = [
    "outline-magnifier-minus",
    "outline-magnifier-plus",
    "outline-expand",
    "outline-code-brackets",
    "outline-quote",
    "outline-wave-audio",
    "comment",
    "outline-text",
    "outline-photo",
    "file-document",
    "outline-audio",
    "outline-video",
    "outline-brain",
    "outline-console",
  ]
  for (const name of rejected) {
    if (new RegExp(`^  "?${name}"?: \\{`, "m").test(catalog)) fail(`6: catalog.ts adopted the rejected v2.2.1 icon "${name}"`)
  }

  // The new session-ui directories stay clean of the quote/comment rewrite domain.
  const newFiles = [
    `${SUI}src/context/sources.tsx`,
    `${SUI}src/sources/sources.ts`,
    `${SUI}src/sources/experiment.ts`,
    `${SUI}src/sources/sources-panel.tsx`,
    `${SUI}src/sources/sources-chip.tsx`,
    `${SUI}src/sources/site-icon.tsx`,
    `${SUI}src/sources/sources-title.tsx`,
  ]
  for (const file of newFiles) {
    const body = await read(file)
    for (const token of ["user-runs", "UserRun", "quoteTooltip", "commentCardTarget", "linkSegments"]) {
      if (body.includes(token)) fail(`6: ${file.replace("vendor/upstream/packages/session-ui/", "")} mentions ${token}`)
    }
  }
}

// --- 7. Motion (verbatim zero-import modules + reduced-motion face) ---
{
  const spring = await read(`${UI}src/motion/spring.ts`)
  const loop = await read(`${UI}src/motion/loop.ts`)
  for (const [name, body] of [["spring.ts", spring], ["loop.ts", loop]] as const) {
    if (/^import /m.test(body)) fail(`7: ${name} must be a zero-import module (v2.2.1 verbatim)`)
  }
  for (const anchor of ["export class Spring {", "static fromDuration(", "step(dt: number)", "get resting()"]) {
    if (!spring.includes(anchor)) fail(`7: spring.ts lost the anchor ${anchor}`)
  }
  for (const anchor of ["export function createFrameLoop(", "export const frameLoop = createFrameLoop()", "requestAnimationFrame(callback)"]) {
    if (!loop.includes(anchor)) fail(`7: loop.ts lost the anchor ${anchor}`)
  }
  const index = await read(`${UI}src/motion/index.ts`)
  for (const anchor of ['export * from "./reduced"', 'export * from "./spring"', 'export * from "./loop"']) {
    if (!index.includes(anchor)) fail(`7: motion/index.ts lost ${anchor}`)
  }
  if (!index.includes("M-035") || !index.includes("mobile(M-036)"))
    fail("7: motion/index.ts lost the M-035 ownership / M-036 rebase provenance comment")

  const css = await read(`${SUI}src/sources/sources.css`)
  const reduceBlocks = [...css.matchAll(/:root\[data-motion="reduce"\]/g)].length
  if (reduceBlocks !== 3) fail(`7: sources.css must carry exactly three :root[data-motion="reduce"] blocks, got ${reduceBlocks}`)
  if (css.includes("prefers-reduced-motion") || css.includes("@media"))
    fail("7: sources.css must use the data-motion attribute face only (M-035 mechanism)")

  // Among the new motion surface, only reduced.ts mentions the media query (its constant).
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
  setEq(mentioning, ["motion/reduced.ts"], "7: prefers-reduced-motion mentions within the new motion surface")
}

// --- 8. Icons + patch registration ---
{
  const catalog = await read(`${UI}src/icons/catalog.ts`)
  const steer = catalog.match(/  "outline-steer": \{\n    viewBox: "0 0 16 16",\n    body: `<path d="[^"]+"[^<]*<path d="[^"]+" fill="currentColor"\/>`,\n  \},/)
  if (!steer) fail("8: catalog.ts lost the outline-steer entry (the v2.2.1 verbatim artwork)")
  if (!catalog.includes("M8 3.86328V12.1391C10.2854 12.1391 12.1379 10.2863 12.1379 8.00121C12.1379 5.71608 10.2854 3.86328 8 3.86328Z"))
    fail("8: outline-steer body drifted from the v2.2.1 artwork")
  if (catalog.indexOf('"outline-steer"') < catalog.indexOf("  waveform: {"))
    fail("8: outline-steer must sit after waveform (v2.2.1 catalog position)")

  const manifest = await read(`${PATCHES}manifest.json`)
  if (!manifest.includes('"id": "M-036"') || !manifest.includes("patches/mobile/0036-M-036-goal-sources-panels.patch"))
    fail("8: patches/mobile/manifest.json does not register M-036")
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/0036-M-036-goal-sources-panels.patch"))
    fail("8: vendor-manifest.json does not register M-036 (verify-closure reads only this list)")
  const patch = await read(`${PATCHES}0036-M-036-goal-sources-panels.patch`)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  // Rebase round: reduced.ts and the ./motion export returned to M-035 — the patch face is 33 files.
  if (touched.length !== 33) fail(`8: M-036 patch face drifted: ${touched.length} files (expected exactly 33 post-rebase)`)
  for (const required of [
    "packages/schema/src/goal.ts",
    "packages/gui-extensions/src/sources/renderer.tsx",
    "packages/gui-extensions/src/goal/renderer.tsx",
    "packages/session-ui/src/sources/sources.test.ts",
    "packages/session-ui/src/context/sources.tsx",
    "packages/app/src/runtime/extension/render.tsx",
    "packages/app/src/settings/experimental/experimental.tsx",
    "packages/ui/src/motion/spring.ts",
    "packages/ui/src/motion/loop.ts",
    "packages/ui/src/motion-tuning.ts",
    "packages/ui/src/icons/catalog.ts",
  ]) {
    if (!touched.includes(required)) fail(`8: M-036 patch lost the target ${required}`)
  }
  // The patch must not touch the #67 migration domains' new API (mechanical cross-check of group 2).
  const added = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n")
  for (const token of ["@opencode/plugin/gui", "ComposerPill", "plugin-pills", "usePlugin"]) {
    if (added.includes(token)) fail(`8: M-036 adds ${token} (the #67 boundary is negative)`)
  }

  console.log(
    "verify-goal-sources: dist marker NOT staged for M-036 — the patch carries no credential/security " +
      "semantics; the gate shim stores a non-sensitive device-local UI preference (an experiment gate) in " +
      "the upstream opencode.motion.v2 record, so the M-002 marker precedent does not apply (deliberate note).",
  )
}

console.log(
  "verify-goal-sources: PASS (" +
    "1: registration — renderer.ts compose exactly 15 entries (microsoft-office -> sources -> goal, v2.2.1 order), main.ts same 15-id table with the six lazy main entries unchanged, mobile face order set exactly {10,20,30,40,50,60,70} no duplicates (sources 60 menu, goal 70 menu); " +
    "2: #67 boundary — four new-host tokens zero-hit across the four vendored domains + the two new builtin directories double-checked; " +
    "3: goal — schema/opencode.goal verbatim incl. the three toStandardSchemaV1 wrappers (implementation note: the closure's effect@4.0.1 exports the API and PortableDefinition requires it — the plan's strip step proven unnecessary, verbatim form locked), data layer store/key/createKeyed/heard/error-swallow verbatim, status three-state map verbatim, session.command pause/resume/clear + error toast verbatim, Panel re-shell (pinned/transient/side + mobile 70 menu, D1 marker), no server plugin vendored, no session.metadata.updated adoption; " +
    "4: sources — 0f379f0a33 four files verbatim anchors (uses/LinkHandler/transient/tab.count/uses.browser/openExternal), registered narrow-screen branch + gate-off honest empty states, session-ui exports 4, ui en 9 keys in v2.2.1 position, app en 2 keys en-only, Experimental row (storedToggle/setStoredToggle, default false), SourcesProvider inside MarkdownProvider, three hook increments, M-034 fold witnesses intact; " +
    "5: gate shim — opencode.motion.v2 record format, four consumed faces only, zero runtime imports, no Knobs console/settings.v3/auto-enable face, knob default false (NEGATIVE 1 target); " +
    "6: user-runs/quote negatives — eight-token message-content scan (= revised #64 kept set), current-message UserRun/run? boundaries, timeline-row run={joined()} boundary, 14 kept catalog rejections, new session-ui directories clean; " +
    "7: motion — spring/loop zero-import verbatim, motion entry three exports with M-035 ownership note, sources.css three data-motion blocks and zero @media, prefers-reduced-motion mentions within the new surface exactly {motion/reduced.ts}; " +
    "8: outline-steer verbatim artwork after waveform, M-036 in BOTH manifests with the exact 34-file patch face, dist-marker absence recorded deliberately; " +
    "STATIC check - tab reachability, gate restart persistence, chip/panel presentation, goal command round-trips, toast rendering, empty states and TalkBack are device QA items registered in docs/build-and-verify.md)",
)

