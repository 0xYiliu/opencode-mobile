// verify-pinch-shell-settings.ts — static probe for issues #74/#193 (S12 pinch-zoom
// disposition + S37 per-server shell selection equivalence check). Issue #193 re-anchor:
// at v2.2.7 (fedc6f208a) the general rows moved onto the createOptimisticSetting machine
// and the desktop zoom chain (nextDesktopZoomLevel) is native pin content in
// desktop-menu.ts — the S12 contract itself is unchanged: desktop-only pinch (and
// spellcheck) settings stay gated away from mobile.
//
// Asserts, against the REAL sources (vendored pin fedc6f208a… + the active patch chain,
// M-019/M-039 reserved-absent; first-party android/, and this round's registration docs),
// the structural facts the S12 ruling ("keep the WebView default, register —
// option (a)") and the S37 equivalence conclusion (implementation.md E30)
// rely on:
//
//   1. S12 pinch face: old->new (issue #193 re-anchor) — the hand-rolled
//      optimistic-set/rollback pair is ABSORBED by the createOptimisticSetting machine;
//      the gate survives as the machine source
//      (`(desktop() && "getPinchZoomEnabled" in platform) || undefined`) with the load
//      `(await platform.getPinchZoomEnabled?.()) ?? false`; the spellcheck row rides the
//      SAME shape and the SAME <Show when={desktop()}> block (general.tsx :239/:247/:278 —
//      the coordinator-cited spellcheck desktop-gate evidence); failure rollback is
//      machine-owned (machine.ts write.failed -> settled(state, state.confirmed, ...) +
//      controllers.ts notify.error -> options.onError). platform.tsx optional members
//      verbatim with their "(desktop only)" comments; the search-catalog entry keeps
//      `available: "desktop"` (#65 ruling A2 precedent — zoom was adopted for
//      mobile search, pinch is NOT); the en.ts pinchZoom keys verbatim.
//      NEGATIVE set (the ruling's "keep the default" half): MainActivity.kt
//      carries NO zoom configuration; index.html viewport sets NO
//      maximum-scale; settings.css has no zoom/pinch/touch-action token and its only
//      overscroll face is the native `overscroll-behavior: contain` @keyframes line
//      (old->new: the #74-era blanket overscroll negative is re-scoped — the v2.2.7 pin
//      ships the nav-containment keyframe, which does not touch the WebView pinch
//      default); packages/mobile-hosts/src has NO pinch capability at all (the web
//      platform never declares getPinchZoomEnabled/setPinchZoomEnabled —
//      upstream web has no pinch face either, the host decides); the desktop
//      zoom chain (nextDesktopZoomLevel) is NATIVE and scoped to desktop-menu.ts exactly
//      (old->new: the #144-era registered rc=1 full-domain unported negative discharges
//      with the rebase — the helper is pin content; a port landing in ANY OTHER file
//      still trips).
//      WITNESS ONLY — first locks elsewhere (drift double-FAIL by design,
//      ownership NOT re-locked): MainActivity setSupportZoom zero-hit +
//      index.html user-scalable zero-hit (verify-commands-menus group 4, fail
//      strings "...zoom ruling re-review required" / "...zoom/pinch ruling
//      re-review required"); the four-segment viewport meta verbatim
//      (verify-interaction-quality group 3); desktop-menu.ts scoped
//      nextDesktopZoomLevel (verify-appearance-settings group 4 —
//      this probe extends the same lock to the REST of the app/src domain).
//   2. S37 shell contract face (+ the wire-protocol anchors, review MAJOR-2
//      merged G3): old->new (issue #193 re-anchor) — the shell write is the native
//      experimental config API (`await context.sdk.api.experimental.config.update({
//      shell: value || null })`, controllers.ts :127; the #65-era `.sdk.api.config.update`
//      positive + experimental negative witness pair is absorbed — the non-experimental
//      write form must NOT come back); the no-op guard / optimistic mutate /
//      rollback→showToast legs moved into createOptimisticSetting + machine.ts
//      (machine-owned optimism: the write.failed -> settled(confirmed) restore and the
//      notify.error -> options.onError -> showToast chain); the read path survives
//      (config.get().catch + config.shells().catch, the directory boundary global segment,
//      the .at(-1) ?? "" last-info.shell pick);
//      behavior.ts createShellOptions (auto first item verbatim
//      {id:"auto",value:"",name:"",terminalOnly:false}, terminalOnly:
//      !shell.acceptable, the current-not-listed tail push); general.tsx
//      ShellSetting (the optional `action` prop with its doc comment,
//      `data-action={props.action ?? "settings-shell"}`, the ?? options()[0]
//      current fallback, the autoDefault key, the terminalOnly label suffix);
//      servers.tsx ServerShell wiring (createServerShellController(() =>
//      props.server) + <ShellSetting controller={controller}
//      action={props.action} />) with the per-row search naming
//      `action={entry.key === props.selected ? undefined :
//      `settings-shell:${entry.key}`}` carried since #102 (settings-servers-migration),
//      mounted under the v2.2.7 serverPagesConnection availability projection (old->new:
//      the #102-era single/list health-gate anchors are absorbed by
//      serverPagesConnection(entry.availability) — pinned by verify-settings-framework
//      group 4); en.ts shell keys ×4
//      verbatim; the wire contract — protocol config.ts GET /api/config/shell
//      (config.shells) + PATCH /api/experimental/config (config.update) +
//      Schema.Array(ConfigShell.Option), schema shell.ts ConfigShell.Option
//      with exactly path/name/acceptable (the probe locks THIS
//      tree's bytes so a future patch cannot silently break the contract
//      anchors).
//      WITNESS ONLY — first lock verify-appearance-settings group 2: the
//      native `experimental.config.update` write positive
//      AND the rewritten plugin-migration write-face negative (drift
//      double-FAIL by design).
//      ISSUE #102 REVISION (settings-servers-migration): the servers page is now target-verbatim —
//      general.tsx ShellSetting carries the optional `action` prop and renders
//      `data-action={props.action ?? "settings-shell"}` (the General page
//      default is unchanged), and servers.tsx threads the per-row search
//      naming `action={entry.key === props.selected ? undefined :
//      `settings-shell:${entry.key}`}` through ServerShell. The former
//      "settings-shell: must stay out" negatives became required positives;
//      the config.update witness legs are unchanged.
//   3. Docs closure: matrix.md S12/S37 rows carry the terminal state (E30, no
//      待核对 residue), now anchored to the POST-#102 row texts written by
//      this same issue (S12 gains the "server-page migration did not touch the
//      pinch row" clause; S37 is rewritten for the settings-servers-migration servers-page
//      migration with the dynamic write/rollback BLOCKED mark). Ordering
//      note: fail() exits on the FIRST failure, so a run surfaces one message
//      at a time — pre-#102 this loop reported the S12 "issue #74" stale pin
//      only; the S37 "issue #74" and S12 "MatePad 实测" stale pins were
//      repaired in the same revision. implementation.md carries the E30
//      evidence-table row, the narrative paragraph and the E30 section;
//      interaction-quality.md §四 carries the ruling sentence.
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static
// STRUCTURE check. It proves source shape, NOT runtime behavior: the on-device
// pinch gesture outcome (Android WebView default state — supportZoom defaults
// true but builtInZoomControls defaults false, so a mobile-viewport page is
// EXPECTED not to pinch-zoom; the device reality is the QA-1 record in
// docs/build-and-verify.md), the shell select round-trip against a real
// server (QA-2) and the settings-search zero-hit face (QA-3) are device-QA
// items, registered in docs/build-and-verify.md issue #74. Static equivalence
// (S37) also does not prove server-side shell execution semantics — same
// endpoint + same field is equivalence by construction; the execution
// difference is out of scope per the E30 boundary note.
//
// Registered negative drills (inject → FAIL rc=1 → restore byte-identical →
// PASS rc=0; logs .probe-logs/negex/): ① inject `user-scalable=no` into
// index.html viewport → group 1 FAIL (witness re-assert); ② inject
// `setBuiltInZoomControls(true)` into MainActivity.kt → group 1 NEW negative
// FAIL; ③ inject a `getPinchZoomEnabled` face into the vendored web platform
// (runtime/platform/web.ts) → group 1 zero-hit FAIL; ④ delete the auto first
// item in behavior.ts → group 2 FAIL; ⑤ rewrite the shell write to a
// plugin-host face in controllers.ts → group 2 negative FAIL.
// Issue #193 re-anchor round re-runs (all inject → FAIL → restore → PASS,
// logged in docs/build-and-verify.md): ⑥ remove the `<Show when={desktop()}>`
// wrapper around the pinch/spellcheck rows → group 1 FAIL; ⑦ re-add
// `nextDesktopZoomLevel` outside desktop-menu.ts → group 1 scoped negative
// FAIL; ⑧ drop the spellcheck desktop gate source line → group 1 FAIL.
//
// Usage:
//   bun run scripts/verify-pinch-shell-settings.ts
// Exit 0 = all assertions PASS.

import { readdirSync, readFileSync } from "node:fs"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-pinch-shell-settings: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const squash = (text: string) => text.replace(/\s+/g, "")

const APP = "vendor/upstream/packages/app/"
const GENERAL_TSX = `${APP}src/settings/general/general.tsx`
const PLATFORM_TSX = `${APP}src/runtime/platform/platform.tsx`
const CONTROLLERS_TS = `${APP}src/settings/general/controllers.ts`
const BEHAVIOR_TS = `${APP}src/settings/general/behavior.ts`
const SERVERS_TSX = `${APP}src/settings/servers/servers.tsx`
const SEARCH_CATALOG = `${APP}src/settings/search-catalog.ts`
const EN_TS = `${APP}src/runtime/i18n/en.ts`
const SETTINGS_CSS = `${APP}src/settings/settings.css`
const PROTOCOL_CONFIG = "vendor/upstream/packages/protocol/src/groups/config.ts"
const SCHEMA_SHELL = "vendor/upstream/packages/schema/src/config/shell.ts"
const INDEX_HTML = `${APP}index.html`
const MAIN_ACTIVITY = "android/app/src/main/java/ai/opencode/mobile/MainActivity.kt"
const MOBILE_HOSTS_SRC = "packages/mobile-hosts/src/"

// --- 1. S12 pinch face (vendored/shell, keep-the-default negative set) ---
{
  const general = await read(GENERAL_TSX)
  const flat = squash(general)

  // old->new (issue #193 re-anchor): the hand-rolled optimistic-set/rollback pair is
  // absorbed by createOptimisticSetting; the gate survives as the machine source and the
  // failure rollback is machine-owned.
  if (!flat.includes('()=>(desktop()&&"getPinchZoomEnabled"inplatform)||undefined'))
    fail("1: general.tsx lost the pinch gate line ((desktop() && 'getPinchZoomEnabled' in platform) || undefined)")
  if (!flat.includes("load:async()=>({value:(awaitplatform.getPinchZoomEnabled?.())??false,meta:undefined})"))
    fail("1: general.tsx lost the pinch fetcher line ((await platform.getPinchZoomEnabled?.()) ?? false)")
  if (!flat.includes("write:(checked)=>platform.setPinchZoomEnabled?.(checked)"))
    fail("1: general.tsx lost the pinch write line (platform.setPinchZoomEnabled?.(checked))")

  // The spellcheck row rides the SAME gate shape (the second desktop-only row in the
  // same Show block — the mobile-leak surface).
  if (!flat.includes('()=>(desktop()&&"getSpellcheckEnabled"inplatform)||undefined'))
    fail("1: general.tsx lost the spellcheck gate line ((desktop() && 'getSpellcheckEnabled' in platform) || undefined)")
  if (!flat.includes("load:async()=>({value:(awaitplatform.getSpellcheckEnabled?.())??true,meta:undefined})"))
    fail("1: general.tsx lost the spellcheck fetcher line ((await platform.getSpellcheckEnabled?.()) ?? true)")

  // Failure rollback is machine-owned (old->new: the #74-era
  // `void update.catch(() => setPinchZoom(!checked))` line is absorbed — the optimistic
  // machine restores the confirmed value on write.failed and reports via onError).
  const machine = await read(`${APP}src/settings/general/machine.ts`)
  if (!machine.includes("return settled(state, state.confirmed, reread, state.queued ? [] : [{ type: \"notify.error\", failure }])"))
    fail("1: machine.ts lost the write.failed restore (settled(state, state.confirmed, ...) + notify.error)")
  const controllersForGate = await read(CONTROLLERS_TS)
  if (!controllersForGate.includes("if (effect.type === \"notify.error\") return options.onError?.(effect.failure)"))
    fail("1: controllers.ts lost the notify.error -> options.onError dispatch (machine-owned failure face)")

  // desktop-only wrapping: the pinch AND spellcheck rows sit inside <Show when={desktop()}>.
  const pinchTitleIdx = general.indexOf('language.t("settings.general.row.pinchZoom.title")')
  const showIdx = general.lastIndexOf("<Show when={desktop()}>", pinchTitleIdx)
  const dataActionIdx = general.indexOf('data-action="settings-pinch-zoom"')
  const spellActionIdx = general.indexOf('data-action="settings-spellcheck"')
  const showEndIdx = general.indexOf("</Show>", dataActionIdx)
  if (pinchTitleIdx === -1 || showIdx === -1 || dataActionIdx === -1 || showEndIdx === -1)
    fail("1: general.tsx lost the pinch row anchors (title/data-action)")
  if (!(showIdx < pinchTitleIdx && pinchTitleIdx < dataActionIdx && dataActionIdx < showEndIdx))
    fail("1: general.tsx pinch row must stay wrapped in <Show when={desktop()}> (desktop-only, mobile invisible)")
  if (!(showEndIdx > spellActionIdx && spellActionIdx > dataActionIdx))
    fail("1: general.tsx spellcheck row must stay inside the same <Show when={desktop()}> block (desktop-only, mobile invisible)")
  if (!general.includes('data-action="settings-pinch-zoom"'))
    fail("1: general.tsx lost the settings-pinch-zoom data-action")

  // platform.tsx optional members, verbatim with the "(desktop only)" comments.
  const platform = await read(PLATFORM_TSX)
  if (!platform.includes("/** Get whether native pinch/Ctrl-scroll zoom gestures are enabled (desktop only) */"))
    fail("1: platform.tsx lost the getPinchZoomEnabled (desktop only) comment")
  if (!platform.includes("getPinchZoomEnabled?(): Promise<boolean> | boolean"))
    fail("1: platform.tsx lost the getPinchZoomEnabled optional member")
  if (!platform.includes("/** Allow native pinch/Ctrl-scroll zoom gestures (desktop only) */"))
    fail("1: platform.tsx lost the setPinchZoomEnabled (desktop only) comment")
  if (!platform.includes("setPinchZoomEnabled?(enabled: boolean): Promise<void> | void"))
    fail("1: platform.tsx lost the setPinchZoomEnabled optional member")

  // Search catalog: the pinch entry keeps available: "desktop" (mobile search
  // must NOT hit it — #65 zoom ruling A2 applied the other way; E30).
  const catalog = await read(SEARCH_CATALOG)
  const pinchLabelIdx = catalog.indexOf('label: "settings.general.row.pinchZoom.title",')
  const pinchTargetIdx = catalog.indexOf('target: "settings-pinch-zoom",')
  const pinchAvailIdx = catalog.indexOf('available: "desktop",', Math.max(pinchLabelIdx, pinchTargetIdx))
  if (pinchLabelIdx === -1 || pinchTargetIdx === -1 || pinchAvailIdx === -1)
    fail("1: search-catalog.ts lost the pinch entry (label/target) or its available: 'desktop' gate")
  if (!(pinchLabelIdx < pinchTargetIdx && pinchTargetIdx < pinchAvailIdx && pinchAvailIdx < pinchLabelIdx + 120))
    fail("1: search-catalog.ts pinch entry must keep label→target→available:'desktop' in one block")

  // en.ts pinchZoom keys, verbatim (vendored :904-905; pin :848-849;
  // v2.2.1 :992-993 — all three sides byte-identical, E30).
  const en = await read(EN_TS)
  if (!en.includes('"settings.general.row.pinchZoom.title": "Pinch to zoom",'))
    fail("1: en.ts lost the pinchZoom.title key")
  if (!en.includes('"settings.general.row.pinchZoom.description": "Allow trackpad pinch and Ctrl-scroll gestures to zoom",'))
    fail("1: en.ts lost the pinchZoom.description key")

  // NEGATIVE set — the ruling's "keep the WebView default" half.
  // MainActivity.kt: zero zoom configuration. setBuiltInZoomControls/
  // setDisplayZoomControls/textZoom/useWideViewPort/loadWithOverviewMode are
  // NEW locks here (review MAJOR-2: the negative face not covered elsewhere);
  // setSupportZoom is a WITNESS (first lock: verify-commands-menus group 4,
  // fail string "...zoom ruling re-review required").
  const mainActivity = await read(MAIN_ACTIVITY)
  const newZoomNegatives = /setBuiltInZoomControls|setDisplayZoomControls|textZoom|useWideViewPort|loadWithOverviewMode/
  if (newZoomNegatives.test(mainActivity))
    fail("1: MainActivity.kt gained a built-in-zoom configuration (setBuiltInZoomControls/setDisplayZoomControls/textZoom/useWideViewPort/loadWithOverviewMode — S12 ruling re-review required, E30)")
  if (/setSupportZoom/.test(mainActivity))
    fail("1: MainActivity.kt gained setSupportZoom (WITNESS — first lock: verify-commands-menus group 4; drift double-FAIL by design)")

  // index.html viewport: no maximum-scale (NEW lock), user-scalable zero-hit
  // (WITNESS — first lock: verify-commands-menus group 4), the four-segment
  // meta verbatim (WITNESS — first lock: verify-interaction-quality group 3).
  const indexHtml = await read(INDEX_HTML)
  if (indexHtml.includes("maximum-scale"))
    fail("1: index.html viewport gained a maximum-scale directive (S12 ruling re-review required, E30)")
  if (indexHtml.includes("user-scalable"))
    fail("1: index.html viewport gained a user-scalable directive (WITNESS — first lock: verify-commands-menus group 4)")
  if (!indexHtml.includes('content="width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover"'))
    fail("1: index.html lost the four-segment viewport meta (WITNESS — first lock: verify-interaction-quality group 3)")

  // settings.css: no zoom/pinch/touch-action token, and the ONLY overscroll face is the
  // native `overscroll-behavior: contain` @keyframes line (old->new, issue #193
  // re-anchor: the #74-era blanket overscroll negative is re-scoped — the v2.2.7 pin
  // ships the settings-nav-contain keyframe, an inner-scroll containment that does not
  // touch the WebView page-level pinch default).
  const css = await read(SETTINGS_CSS)
  if (/zoom|pinch|touch-action/i.test(css))
    fail("1: settings.css gained a zoom/pinch/touch-action rule (S12 ruling re-review required, E30)")
  const overscrolls = [...css.matchAll(/overscroll-behavior\s*:\s*([^;]+);/g)].map((m) => m[1].trim())
  if (JSON.stringify(overscrolls) !== JSON.stringify(["contain"]))
    fail(`1: settings.css overscroll face drifted — got ${JSON.stringify(overscrolls)}, expected exactly ["contain"] (the native nav-containment keyframe)`)

  // The web platform never declares a pinch face: zero "pinch" (any case)
  // across packages/mobile-hosts/src AND in the vendored web platform
  // (runtime/platform/web.ts — the actual web platform this app runs; at v2.2.7 it
  // carries no zoom face either — that implementation is the deferred
  // appearance-motion-zoom face, verify-appearance-settings group 5) — upstream web has
  // no pinch face either, the host browser/WebView decides (E30 mechanism-isomorphism
  // premise).
  const webPlatform = await read(`${APP}src/runtime/platform/web.ts`)
  if (/pinch/i.test(webPlatform))
    fail("1: vendored web.ts gained a pinch face — the web platform must stay pinch-free (E30: keep the WebView default; a platform pinch capability is ruling (b) territory)")
  const hostFiles = readdirSync(new URL(MOBILE_HOSTS_SRC, repoRoot).pathname, { recursive: true }) as string[]
  let hostPinchHits = 0
  for (const file of hostFiles) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
    const text = readFileSync(new URL(MOBILE_HOSTS_SRC + file, repoRoot).pathname, "utf8")
    if (/pinch/i.test(text)) hostPinchHits++
  }
  if (hostPinchHits !== 0)
    fail(`1: packages/mobile-hosts/src carries ${hostPinchHits} file(s) matching /pinch/i — the web platform must have NO pinch face (E30: keep the WebView default; a host-side pinch capability is ruling (b) territory)`)

  // The desktop zoom chain is NATIVE pin content and scoped to desktop-menu.ts exactly.
  // old->new (issue #193 re-anchor): the #144-era registered rc=1 full-domain
  // "must stay unported" negative discharges — v2.2.7 ships nextDesktopZoomLevel in
  // desktop-menu.ts itself. The scoped lock remains: a port landing in ANY OTHER file
  // still trips (complementary lock: verify-appearance-settings group 4 first-locks the
  // desktop-menu.ts-scoped positive — drift double-FAIL by design there).
  const appFiles = readdirSync(new URL(`${APP}src`, repoRoot).pathname, { recursive: true }) as string[]
  const zoomLevelFiles: string[] = []
  for (const file of appFiles) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
    const text = readFileSync(new URL(`${APP}src/${file}`, repoRoot).pathname, "utf8")
    if (text.includes("nextDesktopZoomLevel")) zoomLevelFiles.push(file)
  }
  if (JSON.stringify(zoomLevelFiles.sort()) !== JSON.stringify(["shell/commands/desktop-menu.test.ts", "shell/commands/desktop-menu.ts"]))
    fail(`1: vendored app/src nextDesktopZoomLevel file set drifted — got ${JSON.stringify(zoomLevelFiles.sort())}, expected exactly ["shell/commands/desktop-menu.test.ts", "shell/commands/desktop-menu.ts"] (the native pinch/zoom chain stays scoped to the desktop menu module + its pin test; S12/#74 ruling)`)
}

// --- 2. S37 shell contract face (+ wire-protocol anchors, MAJOR-2 merged) ---
{
  // controllers.ts createServerShellController — read path + save protocol.
  const controllers = await read(CONTROLLERS_TS)
  const flat = squash(controllers)
  if (!flat.includes("exportfunctioncreateServerShellController(server:Accessor<ServerConnection.Any>)"))
    fail("2: controllers.ts lost the createServerShellController export")
  if (!flat.includes("context.sdk.api.config.get().catch(()=>[]),"))
    fail("2: controllers.ts lost the config.get().catch(() => []) read anchor")
  if (!flat.includes("context.sdk.api.config.shells().catch(()=>[]),"))
    fail("2: controllers.ts lost the config.shells().catch(() => []) candidates anchor")
  if (!flat.includes('entries.findIndex((entry)=>entry.type==="directory")'))
    fail("2: controllers.ts lost the directory boundary (global segment before the first directory)")
  if (!flat.includes('entry.type==="document"&&entry.info.shell!==undefined?[entry.info.shell]:[]'))
    fail("2: controllers.ts lost the document info.shell extraction")
  if (!flat.includes('.at(-1)??""'))
    fail("2: controllers.ts lost the .at(-1) ?? '' last-global-shell pick")
  // old->new (issue #193 re-anchor): the no-op guard / optimistic mutate /
  // rollback→showToast legs moved into createOptimisticSetting + machine.ts — the
  // machine-owned optimism face is pinned here (dispatch on source.synced, the
  // write.failed restore, the notify.error -> onError -> showToast chain).
  if (!flat.includes("exportfunctioncreateOptimisticSetting<T,M,S>(options:{"))
    fail("2: controllers.ts lost the createOptimisticSetting export (machine-owned optimism)")
  if (!flat.includes("onError:(failure)=>showToast({"))
    fail("2: controllers.ts lost the shell controller onError -> showToast failure face")

  // The shell write face. old->new (issue #193 re-anchor): the v2.2.7 pin adopted the
  // experimental config API natively — the #65-era witness pair (`.sdk.api.config.update`
  // positive + experimental negative) is absorbed; the non-experimental write form must
  // NOT come back.
  if (!controllers.includes("await context.sdk.api.experimental.config.update({ shell: value || null })"))
    fail("2: controllers.ts lost the native experimental.config.update shell write (WITNESS — first lock: verify-appearance-settings group 2)")
  if (controllers.includes(".sdk.api.config.update({"))
    fail("2: controllers.ts carries the pre-adoption non-experimental sdk.api.config.update write (superseded at v2.2.7)")

  // WITNESS ONLY (first lock: verify-appearance-settings group 2 — the
  // plugin-migration write face stays out of vendored controllers.ts).
  for (const pluginFace of ["api.plugin.", "PluginSettingsSections", "usePluginHost", "pluginHost"]) {
    if (controllers.includes(pluginFace))
      fail(`2: controllers.ts adopted the plugin-migration write face ${JSON.stringify(pluginFace)} (WITNESS — first lock: verify-appearance-settings group 2; drift double-FAIL by design)`)
  }

  // behavior.ts createShellOptions — candidates shape (v2.2.1 delta = export
  // type→type only, E30; the re-export line is a group-2 witness).
  const behavior = await read(BEHAVIOR_TS)
  const bflat = squash(behavior)
  if (!bflat.includes('{id:"auto",value:"",name:"",terminalOnly:false},'))
    fail("2: behavior.ts lost the auto first item ({ id: 'auto', value: '', name: '', terminalOnly: false })")
  if (!bflat.includes("terminalOnly:!shell.acceptable,"))
    fail("2: behavior.ts lost the terminalOnly: !shell.acceptable mapping")
  if (!bflat.includes("if(input.current&&!options.some((option)=>option.value===input.current))"))
    fail("2: behavior.ts lost the current-not-listed guard")
  if (!bflat.includes("options.push({id:input.current,value:input.current,name:input.current,terminalOnly:false})"))
    fail("2: behavior.ts lost the current tail push")

  // general.tsx ShellSetting — presentation face (read/write body identical
  // pin→v2.2.1, E30; the optional action prop + doc comment are the v2.2.1
  // form, carried by settings-servers-migration/issue #102; the General page passes no action so
  // the effective default is unchanged).
  const general = await read(GENERAL_TSX)
  const gflat = squash(general)
  if (
    !gflat.includes(
      "exportconstShellSetting:Component<{controller:ShellSettingsController/**Searchrevealstherowwiththedefaultaction;theServerspagenamestheotherservers'rowsapart.*/action?:string}>=(props)=>{",
    )
  )
    fail("2: general.tsx lost the ShellSetting component export (target signature with the optional action prop)")
  if (!gflat.includes('data-action={props.action??"settings-shell"}'))
    fail("2: general.tsx lost the data-action={props.action ?? \"settings-shell\"} thread")
  if (!gflat.includes("current={options().find((option)=>option.value===props.controller.current())??options()[0]}"))
    fail("2: general.tsx lost the ?? options()[0] current fallback")
  if (!gflat.includes('if(option.id==="auto")returnlanguage.t("settings.general.row.shell.autoDefault")'))
    fail("2: general.tsx lost the auto → autoDefault label branch")
  if (!gflat.includes("`${option.name}(${language.t(\"settings.general.row.shell.terminalOnly\")})`"))
    fail("2: general.tsx lost the terminalOnly label suffix")
  // old->new (issue #193 re-anchor): the v2.2.7 suffix adds the space before the paren
  // (`${option.name} (...)`) — pin the current form.
  if (!general.includes('`${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`'))
    fail("2: general.tsx lost the v2.2.7 terminalOnly label suffix (with the space before the paren)")
  if (!gflat.includes("onSelect={(option)=>option&&props.controller.select(option.value)}"))
    fail("2: general.tsx lost the onSelect → controller.select wiring")

  // servers.tsx ServerShell — the mount face, target-verbatim since settings-servers-migration
  // (issue #102). The v2.2.1 per-row search naming is a REQUIRED positive:
  // non-selected servers' shell rows are named `settings-shell:<key>` for
  // Settings search reveal; the selected one keeps the default.
  const servers = await read(SERVERS_TSX)
  if (!servers.includes("const controller = createServerShellController(() => props.server)"))
    fail("2: servers.tsx lost the ServerShell controller wiring")
  if (!servers.includes("<ShellSetting controller={controller} action={props.action} />"))
    fail("2: servers.tsx lost the ShellSetting mount with the action thread (settings-servers-migration)")
  if (!servers.includes("function ServerShell(props: { server: ServerConnection.Any; action?: string })"))
    fail("2: servers.tsx lost the ServerShell action prop (settings-servers-migration)")
  if (!servers.includes("action={entry.key === props.selected ? undefined : `settings-shell:${entry.key}`}"))
    fail("2: servers.tsx lost the per-row `settings-shell:<key>` search action (settings-servers-migration)")
  // old->new (issue #193 re-anchor): the #102-era single/list health-gate anchors are
  // absorbed — the v2.2.7 page mounts ServerShell under the serverPagesConnection
  // availability projection (the projection itself is pinned by verify-settings-framework
  // group 4).
  if (!servers.includes("<Show when={serverPagesConnection(entry.availability)} keyed>"))
    fail("2: servers.tsx lost the serverPagesConnection availability gate on the Shell section (v2.2.7 projection)")

  // en.ts shell keys ×4, verbatim (vendored :876-879; pin :820-823;
  // v2.2.1 :968-971 — byte-identical across all three sides, E30).
  const en = await read(EN_TS)
  for (const [key, value] of [
    ["settings.general.row.shell.title", "Terminal shell"],
    ["settings.general.row.shell.description", "Shell used by the terminal and agent tools"],
    ["settings.general.row.shell.autoDefault", "Auto (Default)"],
    ["settings.general.row.shell.terminalOnly", "terminal only"],
  ] as const) {
    if (!en.includes(`"${key}": "${value}",`)) fail(`2: en.ts lost the ${key} key`)
  }

  // Wire contract — vendored protocol/schema bytes (byte-identical
  // pin=v2.2.1: blobs c6f6693f / 52278b27, E30). PATCH path, GET path,
  // ConfigShell.Option with exactly path/name/acceptable.
  const protocol = await read(PROTOCOL_CONFIG)
  const pflat = squash(protocol)
  if (!pflat.includes('HttpApiEndpoint.get("config.shells","/api/config/shell",{'))
    fail("2: protocol config.ts lost the GET /api/config/shell endpoint (config.shells)")
  if (!pflat.includes("success:Schema.Array(ConfigShell.Option),"))
    fail("2: protocol config.ts lost the Schema.Array(ConfigShell.Option) success shape")
  if (!pflat.includes('HttpApiEndpoint.patch("config.update","/api/experimental/config",{'))
    fail("2: protocol config.ts lost the PATCH /api/experimental/config endpoint (config.update)")
  const schema = await read(SCHEMA_SHELL)
  const sflat = squash(schema)
  if (!sflat.includes("exportconstOption=Schema.Struct({path:Schema.String,name:Schema.String,acceptable:Schema.Boolean,}).annotate({identifier:\"ConfigShell.Option\"})"))
    fail("2: schema shell.ts lost the ConfigShell.Option struct (path/name/acceptable) — the candidate contract")
  if (!sflat.includes("export*asConfigShellfrom"))
    fail("2: schema shell.ts lost the ConfigShell namespace export")
}

// --- 3. Docs closure ---
{
  // matrix.md S12/S37 terminal rows (E30, no 待核对 residue), anchored to the
  // POST-#102 row texts (the same issue rewrites S37 for the settings-servers-migration servers
  // page migration and extends S12 with the "migration did not touch the
  // pinch row" clause; the stale "issue #74" markers and the "MatePad 实测"
  // clause predate #101's matrix rewrite and are gone — the three stale pins
  // were repaired here together because fail() exits on the first failure
  // and only the first one ever surfaced per run).
  const matrix = await read("docs/alignment/windows-desktop/v2.2.1/matrix.md")
  const s12 = matrix.split("| S12 |")[1] ?? ""
  const s37 = matrix.split("| S37 |")[1] ?? ""
  if (!s12) fail("3: matrix.md lost the S12 row")
  if (!s37) fail("3: matrix.md lost the S37 row")
  for (const [name, row] of [["S12", s12], ["S37", s37]] as const) {
    if (!row.includes("E30"))
      fail(`3: matrix.md ${name} row lost the E30 evidence marker`)
    if (row.includes("待核对"))
      fail(`3: matrix.md ${name} row still carries a 待核对 residue (issue #74 must leave the terminal state)`)
  }
  if (!s12.includes("保持 WebView 默认"))
    fail("3: matrix.md S12 row lost the ruling statement (保持 WebView 默认)")
  if (!s12.includes("MatePad 主页捏合/双击无缩放"))
    fail("3: matrix.md S12 row lost the device-QA measured clause (MatePad 主页捏合/双击无缩放)")
  if (!s12.includes("#102 服务器页迁移未触及捏合行"))
    fail("3: matrix.md S12 row lost the post-#102 clause (服务器页迁移未触及捏合行)")
  if (!s37.includes("等价"))
    fail("3: matrix.md S37 row lost the equivalence conclusion (等价)")
  if (!s37.includes("settings-servers-migration"))
    fail("3: matrix.md S37 row lost the post-#102 settings-servers-migration migration marker")
  if (!s37.includes("ShellSetting action"))
    fail("3: matrix.md S37 row lost the post-#102 ShellSetting action clause")
  if (!s37.includes("仍未验"))
    fail("3: matrix.md S37 row lost the dynamic write/rollback BLOCKED mark (真服务动态往返仍未验)")

  // implementation.md E30 row + narrative + section.
  const implementation = await read("docs/alignment/windows-desktop/v2.2.1/implementation.md")
  if (!implementation.includes("E30 为 issue #74"))
    fail("3: implementation.md lost the E30 narrative paragraph")
  if (!implementation.includes("| E30 |"))
    fail("3: implementation.md lost the E30 evidence-table row")
  if (!implementation.includes("### S12+S37 差异核对与实施记录（issue #74，E30）"))
    fail("3: implementation.md lost the E30 section")

  // interaction-quality.md §四 ruling sentence.
  const interaction = await read("docs/design/interaction-quality.md")
  if (!interaction.includes("WebView 手势默认态裁定（issue #74/E30）"))
    fail("3: interaction-quality.md lost the S12 ruling sentence anchor (§四)")
}

console.log(
  "verify-pinch-shell-settings: PASS (" +
    "1: S12 pinch face (issue #193 re-anchor) — general.tsx pinch+spellcheck createOptimisticSetting gates ((desktop() && member-check) || undefined) + fetchers + writes, rows inside the shared <Show when={desktop()}>, failure rollback machine-owned (machine.ts write.failed settled(confirmed) + notify.error -> controllers.ts options.onError), platform.tsx optional members + (desktop only) comments, search-catalog available:'desktop' kept, en.ts pinchZoom keys verbatim; negatives: MainActivity zero setBuiltInZoomControls/setDisplayZoomControls/textZoom/useWideViewPort/loadWithOverviewMode, index.html zero maximum-scale, settings.css zero zoom/pinch/touch-action + overscroll-behavior exactly [contain] (the native nav-containment keyframe), mobile-hosts zero /pinch/i, app/src nextDesktopZoomLevel scoped EXACTLY to desktop-menu.ts + its pin test (native pin content — the #144 registered rc=1 discharges with the rebase); witnesses double-FAIL by design: MainActivity setSupportZoom + index.html user-scalable (verify-commands-menus group 4), four-segment viewport (verify-interaction-quality group 3); " +
    "2: S37 contract face (issue #193 re-anchor) — controllers read path (config.get/config.shells catch, directory boundary, .at(-1) ?? \"\"), machine-owned optimism (createOptimisticSetting + onError -> showToast), the NATIVE experimental.config.update shell write (the pre-adoption non-experimental write form negative-pinned), plugin-migration write face negative (witness — first lock: verify-appearance-settings group 2), behavior auto-first-item/terminalOnly/tail-push, ShellSetting target signature (optional action + doc comment) + data-action={props.action ?? \"settings-shell\"} + ?? options()[0] + autoDefault + v2.2.7 terminalOnly suffix, ServerShell wiring + action thread (settings-servers-migration: `settings-shell:<key>` for non-selected rows, serverPagesConnection availability gate) + en.ts shell keys ×4, protocol GET /api/config/shell + PATCH /api/experimental/config + Schema.Array(ConfigShell.Option), schema ConfigShell.Option path/name/acceptable; " +
    "3: docs closure — matrix S12/S37 terminal rows anchored to the post-#102 row texts (E30, no 待核对; S12 migration-did-not-touch clause, S37 settings-servers-migration migration + ShellSetting action clause + dynamic write/rollback BLOCKED mark; three stale #74-era pins repaired in this revision because fail() exits first), implementation.md E30 row/narrative/section, interaction-quality.md ruling sentence; " +
    "STATIC check — the on-device pinch outcome (Android WebView default state), the shell select round-trip against a real server and the settings-search face are QA items registered in docs/build-and-verify.md issue #74 (QA-1..QA-3); static equivalence does not prove server-side shell execution semantics (same endpoint + same field = equivalence by construction, E30 boundary note)",
)
