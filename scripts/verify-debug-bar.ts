// verify-debug-bar.ts — static probe for issue #73 (W28: debug bar mobile
// availability, per-operation verification and registration; a ZERO-code round —
// verification + registration only, no vendor/first-party/shell change).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf… + packageSources
// + gui-plugins-native-test-deps..settings-about-version), the structural facts the W28 per-operation matrix
// (implementation.md E29 section, 13 rows) relies on:
//
//   1. Renderer gates (gui-plugins/src/debug/renderer.tsx): the motion build-time
//      gate verbatim (DEV || VITE_OPENCODE_CHANNEL === "beta"; "prod included,
//      drop the import and never contain knobs"); the unconditional toggle
//      Command registration (registered BEFORE the desktop gate line — no
//      platform/viewport gate on registration); the memory main-only comment
//      ("Offered by main only in debug builds"); the Slot face (window.bottom;
//      Show when={visible() || memoryState()?.on}; diagnostics=
//      import.meta.env.DEV; memory={memoryControl()}; motion={Motion ? …};
//      the Knobs inner gate visible() && motion()).
//      WITNESS ONLY — first lock: verify-commands-menus group 5 (drift
//      double-FAIL by design, ownership NOT re-locked): the heap verbatim
//      comment "never on the web…" and the `if (desktop)` conditional
//      registration (debug.heap is never registered on the web).
//   2. Bar element gates (gui-plugins/src/debug/bar.tsx): the aside viewport CSS
//      verbatim `pointer-events-auto hidden overflow-hidden text-text-strong
//      md:block` (narrow screens structurally hidden <768px — identical to the
//      upstream web narrow-window behavior, NOT a mobile special-case); CLOSE
//      `<Show when={props.onClose}>` and the DURATION/TPS cells (ungated); the
//      diagnostics Show + the nine-cell family + DIRECTION; the FOCUS TRIPLE
//      gate (inside the diagnostics Show + the desktop Show + the
//      `if (!desktop) return` function guard — review MINOR-4); the MEM cell's
//      desktop-conditional span; `<Show when={props.memory}>`; the motion Show
//      + its inner build-time recheck + the /components link ("The lab's route
//      exists only on the dev server and in Beta.").
//   3. Channel and titlebar gates: options.ts debugBuild verbatim
//      (!packaged || channel === "beta"); host-apis.tsx `?? "local"`
//      (WITNESS ONLY — first lock: verify-gui-plugins group 3); titlebar.tsx
//      ChannelIndicator: `if (!channel || channel === "prod") return null`
//      (review MAJOR-1: the mobile build sets NO VITE_OPENCODE_CHANNEL, so the
//      badge NEVER renders at ANY viewport — no entry at all, not a
//      "non-interactive static badge"); the two `!mobile()` render gates; the
//      placement consumer verbatim; the mobile() media query.
//      ZERO-HIT negative assertions: `placement: "channel"` appears NOWHERE in
//      gui-plugins/src; src/debug/ registers no TitlebarItem at all; the
//      plugin/src/gui/registries.ts TitlebarItem interface carries NO placement
//      field.  Mixed-generation drift witness (registered, not fixed): the pin
//      generation HAD the field (gui-extensions/src/sdk/registries.ts:522/:530)
//      AND a real channel registration (gui-extensions debug/renderer.tsx:75-86
//      — the "the debug bar does" comment was TRUE then); the v2.2.1 migration
//      dropped the registration and v2.2.1 upstream deleted the ChannelIndicator
//      consumer entirely (445510ce99), while this tree retains the
//      pin-generation app consumer reading a field the migrated interface no
//      longer declares → find() is permanently empty.  NOT an gui-plugins-api-migration missed
//      migration, NOT a first-party adaptation gap, and the S0 stop-line
//      condition does NOT trigger: v2.2.1 upstream itself removed the channel
//      contributor.
//   4. Whitelist and docs closure: WEB_ACTIVE_EXTENSIONS carries "debug"
//      (MEMBERSHIP assertion, NOT set equality — the #66 precedent: future
//      member additions must not fail this probe; set equality remains
//      verify-gui-plugins group 7's judgment); "debug" absent from
//      DESKTOP_HOST_EXTENSIONS; the refined gui-plugins.md debug row (the
//      "zero UI contribution" wording GONE — web has a renderer face), the §九
//      and §十 additions, the matrix.md W28 terminal row (MAJOR-1 phrasing)
//      and the implementation.md E29 row + W28 section.
//
// Cross-references (first-lock ownership declared, NOT re-locked):
//   - debug.heap web-never-registered anchors: verify-commands-menus group 5 +
//     docs/design/commands-menus.md (§二 reach faces; the debug.heap row).
//   - host-apis channel default: verify-gui-plugins group 3.
//   - WEB_ACTIVE/DESKTOP_HOST/EXCLUDED set judgment + management-face
//     semantics: verify-gui-plugins group 7 (EXCLUDED {"wsl"} set equality
//     lives there — negative 5 of that probe).
//   - dist sentinels: verify-gui-plugins / verify-commands-menus /
//     verify-notifications group 8 — this probe reads NO dist (issue #73 is a
//     zero-vendor round: no rebuild, no sentinel backfill; the current
//     post-#72 baseline 3516/159542120 must stay untouched).
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static
// STRUCTURE check. It proves source shape, NOT runtime behavior: the bar's
// on-device presentation, command palette reachability (keybind-only per
// commands-menus.md §二 — physical keyboard mod+k, Settings > Shortcuts, or
// CDP), the management-face toggle behavior and the store persistence across
// restarts are device-QA items (registered pending in docs/build-and-verify.md,
// issue #73 section, QA-1..QA-3). The narrow-screen (<768px) column is a
// source-level claim only — the device CSS viewport floor is 818px (S04), so a
// narrow face cannot be exercised on the device.
//
// Registered negative drills (inject → FAIL rc=1 → restore byte-identical →
// PASS rc=0; logs .probe-logs/negex/): ① flip the aside hidden/md:block pair →
// group 2 FAIL; ② true-ify the motion gate → group 1 FAIL; ③ inject
// `placement: "channel"` into gui-plugins/src/debug/renderer.tsx → group 3
// FAIL; ④ remove "debug" from WEB_ACTIVE_EXTENSIONS → group 4 FAIL.
//
// Usage:
//   bun run scripts/verify-debug-bar.ts
// Exit 0 = all assertions PASS.

import { readdirSync, readFileSync } from "node:fs"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-debug-bar: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const squash = (text: string) => text.replace(/\s+/g, "")

const DEBUG = "vendor/upstream/packages/gui-plugins/src/debug/"
const GUI_PLUGINS_SRC = "vendor/upstream/packages/gui-plugins/src/"
const APP = "vendor/upstream/packages/app/"
const MANAGER = "packages/mobile-hosts/src/ui/extension-manager.tsx"

// --- 1. Renderer gates (debug/renderer.tsx) ---
{
  const renderer = await read(`${DEBUG}renderer.tsx`)
  const flat = squash(renderer)

  // The motion build-time gate, verbatim (dev server and Beta only; prod builds
  // drop the whole import).
  if (!flat.includes('constmotionTools=import.meta.env.DEV||import.meta.env.VITE_OPENCODE_CHANNEL==="beta"'))
    fail("1: renderer.tsx lost the motionTools build-time gate (DEV || channel beta)")
  if (!renderer.includes("builds, prod included, drop the import and never contain knobs."))
    fail("1: renderer.tsx lost the prod-drops-the-import verbatim comment")
  const motionIdx = renderer.indexOf("const motionTools")
  const motionLazyIdx = renderer.indexOf("motionTools ? lazy(")
  if (motionIdx === -1 || motionLazyIdx === -1 || motionLazyIdx < motionIdx)
    fail("1: renderer.tsx lost the Motion lazy import gated on motionTools")

  // The toggle Command is registered UNCONDITIONALLY (before the desktop gate
  // line exists in the file — no platform/viewport gate on registration).
  const cmdIdx = renderer.indexOf("ctx.add(\n    Command,")
  const desktopLineIdx = renderer.indexOf("const desktop = ctx.desktop")
  if (cmdIdx === -1 || desktopLineIdx === -1 || cmdIdx > desktopLineIdx)
    fail("1: renderer.tsx toggle Command registration moved relative to the desktop gate (must stay unconditional/before)")
  if (!renderer.includes('keywords: "dev bar developer tools diagnostics"'))
    fail("1: renderer.tsx lost the toggle Command keywords face")
  if (!renderer.includes('group: ctx.t("command.category.view")'))
    fail("1: renderer.tsx lost the toggle Command view-group face")

  // Memory diagnostics: main-only, verbatim comment (new lock here; the heap
  // anchors below are witnesses).
  if (!renderer.includes("Offered by main only in debug builds"))
    fail("1: renderer.tsx lost the main-only memory comment (Offered by main only in debug builds)")

  // WITNESS ONLY (first lock: verify-commands-menus group 5 — ownership
  // declared, drift double-FAIL by design; NOT a re-lock).
  if (!renderer.includes("// Offered only while main answers: never on the web, and not while the plugin restarts."))
    fail("1: renderer.tsx heap witness comment moved (first lock: verify-commands-menus group 5)")
  if (!renderer.includes("if (desktop)\n    createKeyed(ctx.use(HeapSnapshots)"))
    fail("1: renderer.tsx lost the if (desktop) heap witness (first lock: verify-commands-menus group 5)")

  // The Slot face: window.bottom + the two view gates + the prop wiring.
  // old->new (issue #194 sequential reveal, v2.2.7 machine form): the bar's visibility moved
  // behind the memory-machine view — renderer.tsx:13 imports debugBarView and :44 builds
  // barView = debugBarView(bar.value, memoryState()); the Show gate is barView().open (the old
  // `visible() || memoryState()?.on` disjunction), the diagnostics prop renamed devTools, the
  // motion prop carries { open: barView().motion, toggle }, and the Knobs inner gate is
  // barView().motion. The toggle Command's enabled is barView().togglable (running diagnostics
  // pin the bar open), and onClose rides barView().closable.
  if (!renderer.includes("import { debugBarView } from \"./memory-machine\""))
    fail("1: renderer.tsx lost the debugBarView machine import (old->new issue #194)")
  if (!renderer.includes("const barView = createMemo(() => debugBarView(bar.value, memoryState()))"))
    fail("1: renderer.tsx lost the barView machine build (debugBarView(bar.value, memoryState()); old->new issue #194)")
  if (!renderer.includes('at: "window.bottom"'))
    fail("1: renderer.tsx lost the window.bottom Slot")
  if (!flat.includes("<Showwhen={barView().open}>"))
    fail("1: renderer.tsx lost the bar Show gate (barView().open; old->new issue #194: visible() || memoryState()?.on)")
  if (!flat.includes("devTools={import.meta.env.DEV}"))
    fail("1: renderer.tsx lost the devTools prop wiring (import.meta.env.DEV — the production-web build-time absence; old->new issue #194: the prop was diagnostics)")
  if (!flat.includes("memory={memoryControl()}"))
    fail("1: renderer.tsx lost the memory prop wiring (memoryControl() — undefined while the contract is inactive)")
  if (!flat.includes("motion={Motion?{open:barView().motion,toggle:toggleMotion}:undefined}"))
    fail("1: renderer.tsx lost the motion prop wiring (Motion ? { open: barView().motion, toggle } : undefined; old->new issue #194: the open flag rode motion())")
  if (!flat.includes("<Showwhen={barView().motion}>"))
    fail("1: renderer.tsx lost the Knobs workspace inner gate (barView().motion; old->new issue #194: visible() && motion())")
  if (!flat.includes("enabled:barView().togglable"))
    fail("1: renderer.tsx toggle Command lost the machine togglable gate (running diagnostics keep the bar open)")
  if (!flat.includes("onClose={barView().closable?hide:undefined}"))
    fail("1: renderer.tsx lost the closable-conditional onClose (only the shown state may close)")
}

// --- 2. Bar element gates (debug/bar.tsx) ---
{
  const bar = await read(`${DEBUG}bar.tsx`)
  const flat = squash(bar)

  // The viewport CSS, verbatim: hidden below md (768px), block at md and up.
  // Narrow-screen structural hiding is upstream-web-identical, not a mobile
  // special-case (W28 row 3).
  if (!bar.includes("pointer-events-auto hidden overflow-hidden text-text-strong md:block"))
    fail("2: bar.tsx lost the aside viewport CSS (hidden <768px, md:block >=768px)")
  const asideIdx = bar.indexOf("<aside")
  if (asideIdx === -1 || bar.indexOf("pointer-events-auto hidden", asideIdx) === -1)
    fail("2: bar.tsx aside element lost the viewport class list position")

  // CLOSE button + the two ungated cells (rows 4-5).
  if (!flat.includes("<Showwhen={props.onClose}>"))
    fail("2: bar.tsx lost the CLOSE Show gate (props.onClose)")
  if (!flat.includes('label={ctx.t("duration.label")}') || !flat.includes('label={ctx.t("tps.label")}'))
    fail("2: bar.tsx lost the DURATION/TPS cells (ungated, rows 4-5)")

  // Dev-tools gate (props.devTools = import.meta.env.DEV, renamed from diagnostics — issue #194)
  // + the DIRECTION cell inside it. old->new (issue #194 sequential reveal): the v2.2.1
  // nine-cell performance family (nav/fps/frame/jank/long/delay/inp/cls/mem + the MEM
  // desktop-conditional span) is GONE upstream — the dev-tools zone is now the DIRECTION cell
  // and the FOCUS toggle only; the DURATION/TPS cells survive ungated on the turn memo.
  const diagShowIdx = bar.indexOf("<Show when={props.devTools}>")
  if (diagShowIdx === -1)
    fail("2: bar.tsx lost the dev-tools Show gate (props.devTools = import.meta.env.DEV; old->new issue #194: the prop was diagnostics)")
  for (const cell of ["nav.label", "fps.label", "frame.label", "jank.label", "long.label", "delay.label", "inp.label", "cls.label", "mem.label"])
    if (flat.includes(`label={ctx.t("${cell}")}`))
      fail(`2: bar.tsx resurrected the retired ${cell} diagnostics cell (old->new issue #194: the nine-cell family is upstream-removed at v2.2.7)`)
  if (bar.includes("span={desktop ? 2 : 3}"))
    fail("2: bar.tsx resurrected the MEM desktop-conditional span (old->new issue #194: retired with the nine-cell family)")
  const directionIdx = bar.indexOf('label={ctx.t("direction.label")}')
  if (directionIdx === -1 || directionIdx < diagShowIdx)
    fail("2: bar.tsx DIRECTION cell must sit inside the dev-tools Show block")

  // FOCUS triple gate (review MINOR-4): (a) inside the dev-tools Show,
  // (b) the desktop Show, (c) the dispatchFocus function guard (focus-machine form).
  const focusShowIdx = bar.indexOf("<Show when={desktop}>")
  const focusCellIdx = bar.indexOf('label={ctx.t("focus.label")}')
  const memoryShowIdx = bar.indexOf("<Show when={props.memory}>")
  if (focusShowIdx === -1)
    fail("2: bar.tsx lost the FOCUS desktop Show gate")
  if (!(diagShowIdx < focusShowIdx && focusShowIdx < focusCellIdx && focusCellIdx < memoryShowIdx))
    fail("2: bar.tsx FOCUS cell must stay nested inside the dev-tools Show (triple gate a+b; review MINOR-4)")
  if (!bar.includes("const dispatchFocus = (event: FocusToggleEvent) => {\n    if (!desktop) return"))
    fail("2: bar.tsx lost the dispatchFocus if (!desktop) return function guard (triple gate c; old->new issue #194: the v2.2.1 guard rode async toggleFocus)")
  if (!flat.includes("desktop.forceFocus(effect.enabled)") || !flat.includes("desktop.forceFocus(false)"))
    fail("2: bar.tsx lost the desktop forceFocus wiring (FOCUS is a desktop-only capability; old->new issue #194: the v2.2.1 shapes were await desktop.forceFocus(enabled) / desktop?.forceFocus(false))")

  // MEMORY toggle gate: renderer side props.memory only — the main-side
  // debugBuild gate lives in group 3.
  if (!flat.includes("<Showwhen={props.memory}>"))
    fail("2: bar.tsx lost the MEMORY Show gate (props.memory)")

  // Motion zone (row 10): the Show + the inner build-time recheck + the
  // /components route link.
  const motionShowIdx = bar.indexOf("<Show when={props.motion}>")
  if (motionShowIdx === -1)
    fail("2: bar.tsx lost the motion Show gate (props.motion)")
  if (!flat.includes('(import.meta.env.DEV||import.meta.env.VITE_OPENCODE_CHANNEL==="beta")&&('))
    fail("2: bar.tsx lost the motion zone inner build-time recheck")
  if (!bar.includes(`href="/components"`))
    fail("2: bar.tsx lost the /components route link (motion zone)")
  if (!bar.includes("The lab's route exists only on the dev server and in Beta."))
    fail("2: bar.tsx lost the lab-route verbatim comment")
}

// --- 3. Channel and titlebar gates ---
{
  // options.ts debugBuild (the main-side memory/heap gate; row 9/13).
  const options = await read(`${DEBUG}options.ts`)
  if (!options.includes("Stable builds never run") || !options.includes("memory diagnostics or open a debugging port"))
    fail("3: options.ts lost the debug-builds verbatim header comment")
  if (!squash(options).includes('return!build.packaged||build.channel==="beta"'))
    fail("3: options.ts lost the debugBuild expression (!packaged || channel beta)")
  const main = await read(`${DEBUG}main.ts`)
  if (!main.includes("if (!debugBuild(ctx.app)) return"))
    fail("3: debug/main.ts lost the debugBuild early return (memory diagnostics never start outside debug builds)")

  // host-apis channel default — WITNESS ONLY (first lock: verify-gui-plugins
  // group 3; ownership declared, drift double-FAIL by design).
  const hostApis = await read(`${APP}src/runtime/plugin/host-apis.tsx`)
  if (!squash(hostApis).includes('channel:(import.meta.env.VITE_OPENCODE_CHANNEL??"local")'))
    fail("3: host-apis.tsx channel ?? local witness moved (first lock: verify-gui-plugins group 3)")

  // titlebar channel badge — old->new (issue #194 sequential reveal, v2.2.7 removal): the
  // MAJOR-1 story is SUPERSEDED. The v2.2.1-pin titlebar retained the ChannelIndicator consumer
  // reading a field the migrated interface no longer declared (find() permanently empty, so the
  // badge never rendered at any viewport); v2.2.7 upstream DELETED the consumer entirely — no
  // channel env read, no ChannelIndicator, no placement consumer in titlebar.tsx. The
  // no-render guarantee becomes an ABSENCE guarantee (a stronger form: the mobile badge face is
  // gone, not merely dead). The mobile() 767px media query survives for its other consumers.
  const titlebar = await read(`${APP}src/shell/titlebar/titlebar.tsx`)
  const flat = squash(titlebar)
  for (const gone of [
    "constchannel=import.meta.env.VITE_OPENCODE_CHANNEL",
    "ChannelIndicator",
    'item.placement==="channel"',
  ]) {
    if (flat.includes(gone))
      fail(`3: titlebar.tsx resurrected the removed channel-badge face ${JSON.stringify(gone)} (old->new issue #194: v2.2.7 deleted the consumer; MAJOR-1 superseded by the absence guarantee)`)
  }
  if (!titlebar.includes('createMediaQuery("(max-width: 767px)")'))
    fail("3: titlebar.tsx lost the mobile() media query (max-width: 767px)")

  // Zero-hit negative assertions across gui-plugins/src.
  const files = readdirSync(new URL(GUI_PLUGINS_SRC, repoRoot).pathname, { recursive: true }) as string[]
  let placementHits = 0
  let debugTitlebarHits = 0
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
    const text = readFileSync(new URL(GUI_PLUGINS_SRC + file, repoRoot).pathname, "utf8")
    if (text.includes('placement: "channel"')) placementHits++
    if (file.startsWith("debug/") && text.includes("TitlebarItem")) debugTitlebarHits++
  }
  if (placementHits !== 0)
    fail(`3: gui-plugins/src carries ${placementHits} file(s) with placement: "channel" — the v2.2.1 generation registers NO channel contributor (zero-hit negative; review MINOR-2)`)
  if (debugTitlebarHits !== 0)
    fail("3: debug/ registers a TitlebarItem — the v2.2.1 debug module has none (zero-hit negative)")

  // The interface carries NO placement field. Mixed-generation drift witness, RESOLVED at
  // v2.2.7 (old->new issue #194): the pin generation had the field AND a real channel
  // registration; the v2.2.1 migration dropped both but kept the dead consumer (the E29
  // registered drift); v2.2.7 upstream deleted the consumer, closing the drift. A placement
  // field returning now would reintroduce it — keep the negative.
  const registries = await read("vendor/upstream/packages/plugin/src/gui/registries.ts")
  const ifaceStart = registries.indexOf("export interface TitlebarItem {")
  if (ifaceStart === -1)
    fail("3: plugin/src/gui/registries.ts lost the TitlebarItem interface")
  const ifaceEnd = registries.indexOf("\n}", ifaceStart)
  const iface = registries.slice(ifaceStart, ifaceEnd)
  if (iface.includes("placement"))
    fail("3: TitlebarItem interface regained a placement field (no consumer exists at v2.2.7 — issue #194 resolved the mixed-generation drift by deletion; a field would reopen it)")
}

// --- 4. Whitelist and docs closure ---
{
  // Membership, not set equality: the #66 precedent — future member additions
  // must not fail this probe (equality judgment stays verify-gui-plugins group 7).
  const manager = await read(MANAGER)
  const webSetMatch = manager.match(/const WEB_ACTIVE_EXTENSIONS: ReadonlySet<string> = new Set\(\[([^\]]*)\]/)
  if (!webSetMatch)
    fail("4: extension-manager.tsx lost the WEB_ACTIVE_EXTENSIONS set table")
  const webMembers = [...webSetMatch[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]!)
  if (!webMembers.includes("debug"))
    fail("4: WEB_ACTIVE_EXTENSIONS lost the debug member (row 12: the management face presents debug as a web toggleable row — removing it is the registered negative drill)")
  const desktopMatch = manager.match(/const DESKTOP_HOST_EXTENSIONS: ReadonlySet<string> = new Set\(\[([^\]]*)\]/)
  if (!desktopMatch)
    fail("4: extension-manager.tsx lost the DESKTOP_HOST_EXTENSIONS set table")
  const desktopMembers = [...desktopMatch[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]!)
  if (desktopMembers.includes("debug"))
    fail("4: debug must NOT be a desktop-host row (its whole contribution runs renderer-side; row 12 semantics)")
  if (!manager.includes("Extensions whose whole contribution runs renderer-side on this device"))
    fail("4: extension-manager.tsx lost the classification comment (whole contribution runs renderer-side — the row-12 judgment criterion, review MINOR-3)")

  // Docs closure: the refined unit-doc debug row (the stale "zero UI
  // contribution" cell is GONE — web has a renderer face).
  const unit = await read("docs/design/units/gui-plugins.md")
  const debugRow = unit.split("| debug |")[1] ?? ""
  if (!debugRow.includes("web 渲染面实态（issue #73/W28 逐操作核对）"))
    fail("4: gui-plugins.md debug row lost the refined web-renderer-face cell (issue #73)")
  if (unit.includes("零 UI 贡献（桌面诊断）"))
    fail("4: gui-plugins.md still carries the stale zero-UI-contribution debug cell (issue #73 refined it — web has a renderer face)")
  if (!unit.includes("**debug bar 移动实态（issue #73/W28）**"))
    fail("4: gui-plugins.md §九 lost the debug bar mobile-state sentence (issue #73)")
  if (!unit.includes("窄屏 face 源码级未真机宣称"))
    fail("4: gui-plugins.md §十 lost the narrow-screen source-level-only boundary (issue #73)")

  // matrix.md W28 terminal row. old->new (issue #194 sequential reveal): the row was revised by
  // the #145/#148 evidence rounds — the E-marker set is now E29/E34 (the #73-era pin was
  // E09/E29) and the MAJOR-1 no-render phrasing + the drift classification moved into
  // implementation.md's E29 narrative; the probe pins the CURRENT row face and re-anchors the
  // MAJOR-1/drift phrasing there.
  const matrix = await read("docs/alignment/windows-desktop/v2.2.1/matrix.md")
  const w28 = matrix.split("| W28 |")[1] ?? ""
  if (!w28.includes("E29/E34"))
    fail("4: matrix.md W28 row lost the E29/E34 evidence markers (old->new issue #194: the #73-era pin was E09/E29)")
  if (!w28.includes("部分实现（web 子集）") || !w28.includes("窄屏 bar 隐藏"))
    fail("4: matrix.md W28 row lost the web-subset / narrow-hidden face")

  // implementation.md E29 row + W28 section + the MAJOR-1/drift phrasing (moved from the matrix row).
  const implementation = await read("docs/alignment/windows-desktop/v2.2.1/implementation.md")
  if (!implementation.includes("E29 为 issue #73（W28：Debug bar 移动可用范围逐操作核对并登记）"))
    fail("4: implementation.md lost the E29 narrative paragraph")
  if (!implementation.includes("| E29 |"))
    fail("4: implementation.md lost the E29 evidence-table row")
  if (!implementation.includes("### W28 差异核对与实施记录（issue #73，E29）"))
    fail("4: implementation.md lost the W28 section")
  if (!implementation.includes("均**不渲染**") || !implementation.includes('if (!channel || channel === "prod") return null'))
    fail("4: implementation.md lost the MAJOR-1 no-render phrasing (old->new issue #194: moved from the matrix row)")
  if (!implementation.includes("pin 内混合代际漂移"))
    fail("4: implementation.md lost the mixed-generation drift classification (old->new issue #194: moved from the matrix row)")
}

console.log(
  "verify-debug-bar: PASS (" +
    "1: renderer gates — motionTools build-time gate verbatim (prod drops the import), toggle Command registered unconditionally BEFORE the desktop gate line, main-only memory comment, window.bottom Slot on the debugBarView(bar.value, memoryState()) machine face (old->new issue #194: visible()||memoryState()?.on) with barView().open Show + devTools=DEV (renamed from diagnostics) + memoryControl() + {open:barView().motion,toggle} wiring, the barView().motion Knobs inner gate, the togglable command gate and the closable-conditional onClose; heap anchors are witnesses only (first lock: verify-commands-menus group 5); " +
    "2: bar element gates — aside viewport CSS hidden/md:block verbatim (narrow-screen structural hiding = upstream-web-identical), CLOSE Show + ungated DURATION/TPS (turn memo), devTools Show + DIRECTION (old->new issue #194: renamed from diagnostics; the nine-cell family and the MEM span are upstream-REMOVED — pinned as resurrect-negatives), FOCUS triple gate (devTools Show nesting + desktop Show + the dispatchFocus if (!desktop) return guard — focus-machine form, review MINOR-4), MEMORY Show, motion Show + inner build-time recheck + /components link; " +
    "3: channel and titlebar gates — debugBuild (!packaged || beta) + main.ts early return, host-apis ?? local witness (first lock: verify-gui-plugins group 3), titlebar channel-badge ABSENCE guarantee (old->new issue #194: MAJOR-1 superseded — v2.2.7 deleted the ChannelIndicator consumer/env read/placement find entirely; the no-render guarantee is now the stronger no-face guarantee), mobile() 767px media query, zero-hit negatives (placement: 'channel' nowhere in gui-plugins/src; no debug TitlebarItem; the TitlebarItem interface has no placement field — the mixed-generation drift MINOR-2 is RESOLVED upstream, deletion-verified); " +
    "4: whitelist and docs closure — WEB_ACTIVE_EXTENSIONS debug membership (not set equality; equality is verify-gui-plugins group 7), debug not desktop-host, renderer-side classification comment, gui-plugins.md refined debug row + §九/§十 additions, matrix.md W28 terminal row at the #145/#148 face (E29/E34; old->new issue #194 from E09/E29 — the MAJOR-1/drift phrasing re-anchored on implementation.md's E29 narrative), implementation.md E29 + W28 section; " +
    "STATIC check — bar presentation, palette reachability (keybind-only per commands-menus.md §二), management toggle behavior and store persistence on a device are QA items registered pending in docs/build-and-verify.md issue #73 (QA-1..QA-3); the narrow-screen column is a source-level claim only (device floor 818px, S04); dist untouched (no rebuild, no sentinel backfill — group 8 probes own the 3516/159542120 baseline)",
)
