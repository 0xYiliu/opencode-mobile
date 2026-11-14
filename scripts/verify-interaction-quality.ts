// verify-interaction-quality.ts — static probe for issue #20 (mobile
// interaction quality: navigation, keyboard, accessibility, preferences).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf…, the Android
// shell and the docs), the structural facts the interaction-quality.md
// cross-cutting document relies on. Division of labor with the existing
// probes: this probe only FIRST-LOCKS anchors no earlier probe covers. Four
// places are deliberate CROSS-REFERENCE re-checks (referencing, not first
// locks — the originals live in):
//   - group 3: the panels.tsx `window.visualViewport?.height ?? window.innerHeight`
//     soft-keyboard sync anchors (verify-terminal.ts group 6, :452-453),
//   - group 4: `sorted(["menu", "drawer"])` (verify-terminal.ts group 6, :448)
//     and the composer submit 767px blur line (verify-session-workbench.ts),
//   - group 5: the slash undo/redo registration pair (verify-diff.ts group 3,
//     :312-314),
//   - group 6: `Persist.global("model")` (verify-provider-models.ts, :383).
// The `<MobileViewTabs` mount anchor in screen.tsx (verify-agent-capabilities.ts
// group 3) and the terminal/files mobile registration anchors
// (verify-terminal.ts / verify-files.ts) are NOT re-asserted here. The
// slashAfter dynamic extension-command injection face is deliberately NOT
// locked: the slash set assertion below covers FIRST-PARTY STATIC
// registrations only.
//
//   1. Shell window & back key (MainActivity.kt + AndroidManifest.xml):
//      onBackPressed / canGoBack / goBack / super.onBackPressed, the
//      predictive-back comment, the single-WebView `setContentView(webView)`,
//      the sole LAUNCHER intent filter, the INTERNET + POST_NOTIFICATIONS +
//      CAMERA permission triple (issue #23 added the pair form over the
//      sole-INTERNET sentinel; issue #71 adds CAMERA — the runtime-granted
//      WebView camera for the pairing scan; any FOURTH permission still
//      fails), `enableOnBackInvokedCallback="false"`, and NEGATIVE zero
//      `configChanges` (rotation = Activity rebuild is structural), zero
//      multi-window faces (setSupportMultipleWindows/onCreateWindow);
//      onSaveInstanceState TODO as a CROSS-REFERENCE (first lock:
//      verify-recovery.ts group 4).
//   2. Web-layer navigation form (drift sentinels): the four upstream src
//      trees carry ZERO `history.pushState` / `popstate` / `history.back` /
//      `history.go` — the FIRST-PARTY domain stays clean (issue #75 erratum:
//      the scan domain is the four src trees BY DESIGN; dependency-side
//      writers are outside it, and the pinned @solidjs/router 1.0.0 default
//      History integration IS the documented dependency-side writer —
//      `pushState(state, "", value)` + `saveCurrentDepth()` stamping `_depth`
//      on non-replace navigation). Same-document entries do NOT open the
//      WebView canGoBack() gate (issue #75 emulator measurement, AOSP
//      WebView 113), so the back key still ends the Activity in regular use;
//      FULL-PAGE navigations (same-window navigation class + notification
//      route loadUrl) DO enter the gate. The ONLY first-party History API
//      touchpoint is pwa.ts's `history.replaceState(...)` (PWA URL cleanup).
//      A pin update introducing a FIRST-PARTY push/popstate write MUST fail
//      here and force a re-review of the back-key wording (interaction.md
//      baseline + interaction-quality.md §1) before it is kept. Plus the two
//      `target="_blank"` anchors in session-ui tool-renderer.tsx (the exa
//      link list and the webfetch subtitle link) — full-page same-window
//      navigation class paths in the shell (no setSupportMultipleWindows),
//      each of which gives the back list a gate-opening entry.
//   3. Keyboard/viewport linkage: index.html viewport meta verbatim four
//      segments + theme-color meta; keyboard.ts four listener registrations,
//      the `--safe-area-inset-bottom` set/remove pair, the `> 100` keyboard
//      threshold and the isContentEditable editing check; the entry.tsx
//      KeyboardInsets mount; the panels.tsx visualViewport anchors
//      (CROSS-REFERENCE, see header).
//   4. Breakpoints & responsive: the isDesktop authoritative definition; the
//      768px/767px media-query FILE-SET equality over the EXPLICIT domain
//      app/src + gui-extensions/src (20 media-query files + the host-apis.ts
//      "Viewport under 768px. Reactive." comment anchor = the documented
//      23 hits in 21 files; the three session-ui 767px consumption sites are
//      deliberately OUTSIDE the domain — they are registered in
//      interaction-quality.md §4 and carried by the session-ui subset run);
//      occurrence counts 8 (min-768) / 13 (max-767 incl. gui-plugins) as drift
//      sentinels; the submit blur line (CROSS-REFERENCE) and the mobile.tsx
//      sorted(["menu","drawer"]) key (CROSS-REFERENCE); the MobileViewTabs
//      COMMENT anchor (the mount anchor is verify-agent-capabilities.ts's);
//      the mobileTitlebarPosition four anchors.
//   5. Platform mapping face: DEFAULT_PALETTE_KEYBIND verbatim; the three
//      command.palette registrations all `hidden: true`; the slash set
//      equality — use-session-commands.tsx exactly {new,undo,redo,compact,
//      fork,export,open,mcp} and composer/commands.tsx exactly
//      {model,connect,agent} (undo/redo pair is a CROSS-REFERENCE, see
//      header) — plus the GLOBAL drift sentinel: `slash: "[a-z]+"` across the
//      four upstream src trees hits EXACTLY 11 registrations in EXACTLY 2
//      files (the three `slash: "/"` i18n placeholder arguments are excluded
//      naturally by the [a-z]+ shape). A new first-party static slash
//      registration or a new file carrying one MUST fail here and force a
//      mechanical re-count of interaction-quality.md §7 before the set is
//      extended. The `dialog.show(() => <x.DialogCommandPalette />)` route.
//   6. Preference restoration: the settings.v3 persisted key + the seven
//      schema segment keys + defaultSettings `mobileTitlebarPosition: "top"`;
//      the language persisted store + loadInitialLocale + setLocale; the
//      oc-theme-preload.js three localStorage keys + prefers-color-scheme +
//      theme-color meta update; `Persist.global("model")` (CROSS-REFERENCE,
//      see header).
//   7. Mobile navigation body: createMobileViews + the entries/tabs/menu/find
//      return keys + the lazy MobilePanelDrawer import (terminal/files mobile
//      registrations stay with verify-terminal.ts / verify-files.ts).
//   8. Docs closure anchors (anti drift between docs and code):
//      interaction-quality.md exists with its eight section titles, the
//      authority declaration and the four honest-state sentences (back key =
//      ends the Activity in regular use, re-reasoned by the issue #75
//      erratum — dependency-side router writes stay outside the WebView
//      canGoBack() gate, with the full-page-navigation CLASS exception /
//      command palette keybind-only / rotation = Activity rebuild / touch
//      target gaps on record); interaction.md carries the G1–G35 enumeration
//      (issue #23 revised the G1–G31 title anchor when G33 was added, issue #24
//      revised G1–G33 -> G1–G34 when G34 was added, issue #26 revised
//      G1–G34 -> G1–G35 when G35 was added — coverage semantics preserved),
//      the G31 gate row, the seventeenth honest wording, the back-key
//      real-state baseline sentence and the issue #20 failure-path
//      subsection; recovery.md carries the user-preferences row; README.md
//      carries the interaction-quality.md index row.
//
// HONEST BOUNDARY (same tradition as verify-recovery.ts): this is a static
// STRUCTURE check (text anchors / regex on source and doc files). It proves
// source and doc shape, NOT runtime behavior: back-key semantics on a device,
// soft-keyboard viewport resizing, IME composition, screen-reader walkthrough,
// contrast, touch-target usability, rotation rebuild + restoration chains and
// slash discoverability are covered by the G31 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-interaction-quality.ts
// Exit 0 = all assertions PASS.

import { readdirSync, statSync } from "node:fs"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-interaction-quality: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const GUI = "vendor/upstream/packages/gui-plugins/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const CLIENT = "vendor/upstream/packages/client/"

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue
    const p = `${dir}/${e}`
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// --- 1. Shell window & back key (MainActivity.kt + AndroidManifest.xml) ---
{
  const activity = await read("android/app/src/main/java/ai/opencode/mobile/MainActivity.kt")

  for (const anchor of [
    "override fun onBackPressed()",
    "webView.canGoBack()",
    "webView.goBack()",
    "super.onBackPressed()",
    "setContentView(webView)",
  ]) {
    if (!activity.includes(anchor)) fail(`1: MainActivity.kt lost the ${anchor} anchor`)
  }

  // The predictive-back comment (RAW cross-line form: it wraps mid-sentence).
  if (!/Android 16 defaults\s*\n\s*\/\/ predictive back ON for targetSdk >= 36 apps/.test(activity))
    fail("1: MainActivity.kt lost the predictive-back comment (Android 16 defaults it ON; the manifest opt-out keeps onBackPressed alive)")

  // NEGATIVE: no multi-window faces — window.open / target="_blank" stay
  // same-window navigations, so they can only grow the back list.
  if (/setSupportMultipleWindows|onCreateWindow/.test(activity))
    fail("1: MainActivity.kt gained a multi-window face (setSupportMultipleWindows/onCreateWindow) — re-review the same-window navigation class wording in interaction.md and interaction-quality.md §1 before keeping it")

  // Shell instance-state restoration stays honestly unimplemented
  // (CROSS-REFERENCE re-check; first lock: verify-recovery.ts group 4).
  if (!activity.includes("override fun onSaveInstanceState(outState: Bundle)"))
    fail("1: MainActivity.kt lost the onSaveInstanceState override (cross-reference with verify-recovery group 4)")

  const manifest = await read("android/app/src/main/AndroidManifest.xml")

  if (!manifest.includes('android:enableOnBackInvokedCallback="false"'))
    fail("1: AndroidManifest.xml lost the enableOnBackInvokedCallback=\"false\" opt-out (predictive back would kill onBackPressed)")
  if (!manifest.includes('<category android:name="android.intent.category.LAUNCHER" />'))
    fail("1: AndroidManifest.xml lost the LAUNCHER intent-filter category (single-window shell shape)")

  // NEGATIVE sentinel: zero configChanges — rotation/dark-mode/size changes
  // rebuild the Activity (documented structural fact, not a gap). A future
  // configChanges declaration MUST fail here and force a re-review of the
  // rotation wording (interaction-quality.md §1/§4, G31⑥) before it is kept.
  if (manifest.includes("configChanges"))
    fail("1: AndroidManifest.xml gained a configChanges declaration — rotation is documented as Activity rebuild (interaction-quality.md §1); re-review the rotation wording before keeping it")

  // Permission triple: INTERNET + POST_NOTIFICATIONS + CAMERA (issue #23 added the
  // latter's predecessor; issue #71 added CAMERA — the WebView pairing-scan camera,
  // runtime-granted in-app only; the drift-gate semantics are preserved — any FOURTH
  // permission still fails).
  const permissions = manifest.match(/<uses-permission\s+android:name="([^"]+)"/g) ?? []
  if (
    permissions.length !== 3 ||
    !permissions.includes('<uses-permission android:name="android.permission.INTERNET"') ||
    !permissions.includes('<uses-permission android:name="android.permission.POST_NOTIFICATIONS"') ||
    !permissions.includes('<uses-permission android:name="android.permission.CAMERA"')
  )
    fail(`1: AndroidManifest.xml must carry exactly the permission triple {INTERNET, POST_NOTIFICATIONS, CAMERA} (issues #23/#71), got ${JSON.stringify(permissions)}`)
}

// --- 2. Web-layer navigation form (drift sentinels) ---
{
  // Zero History-API writes across the four upstream src trees: the scan
  // domain is deliberately FIRST-PARTY (four src trees). The documented normal
  // source of back-list entries is the DEPENDENCY side — @solidjs/router
  // (bun.lock pin 1.0.0) default History integration writing pushState +
  // saveCurrentDepth (_depth stamps) on non-replace navigation — which stays
  // outside this scan by design (issue #75 erratum; those same-document
  // entries do not open the WebView canGoBack() gate, so the hardware back
  // key still ends the Activity in regular use, while full-page navigations
  // do open it). These are intentional drift sentinels (same rationale as
  // #9's no-`default:` sentinel).
  for (const dir of [`${APP}src`, `${GUI}src`, `${SESSION_UI}src`, `${CLIENT}src`]) {
    for (const file of walk(dir)) {
      let text: string
      try {
        text = await Bun.file(new URL(file, repoRoot)).text()
      } catch {
        continue
      }
      const hit = /history\.pushState|popstate|history\.back|history\.go/.exec(text)
      if (hit)
        fail(`2: ${file} gained a History API write/listener ("${hit[0]}") — the FIRST-PARTY src is documented as having none (dependency-side router writes are out of this scan domain by design, issue #75); re-review the back-key wording (interaction.md baseline + interaction-quality.md §1) before keeping it`)
    }
  }

  // The single legitimate touchpoint: PWA URL cleanup replaceState.
  const pwa = await read(`${APP}src/runtime/platform/pwa.ts`)
  if (!pwa.includes('history.replaceState(history.state, "", url.pathname + url.search + url.hash)'))
    fail("2: pwa.ts lost the replaceState URL-cleanup anchor (the ONLY sanctioned FIRST-PARTY History API touchpoint)")

  // Same-window navigation class paths: exactly two target="_blank" links in
  // the tool renderer (verify-browser.ts reads this file but asserts different
  // objects — title mapping and hit counts; zero conflict, and scripts/ had no
  // prior lock on these anchors).
  const toolRenderer = await read(`${SESSION_UI}src/tools/tool-renderer.tsx`)
  const blankCount = toolRenderer.split('target="_blank"').length - 1
  if (blankCount !== 2)
    fail(`2: tool-renderer.tsx target="_blank" count changed (expected exactly 2, got ${blankCount}) — the same-window navigation class enumeration in interaction-quality.md §1 must be re-counted`)
  if (!toolRenderer.includes('data-slot="exa-tool-link"'))
    fail("2: tool-renderer.tsx lost the exa-tool-link anchor (same-window navigation path 1)")
  if (!toolRenderer.includes('data-slot="basic-tool-tool-subtitle"'))
    fail("2: tool-renderer.tsx lost the basic-tool-tool-subtitle anchor (same-window navigation path 2)")
}

// --- 3. Keyboard/viewport linkage ---
{
  const indexHtml = await read(`${APP}index.html`)
  if (!indexHtml.includes('content="width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover"'))
    fail("3: index.html lost the viewport meta (interactive-widget=resizes-content is the soft-keyboard contract: the keyboard resizes the viewport instead of covering it)")
  if (!indexHtml.includes('<meta name="theme-color"'))
    fail("3: index.html lost the theme-color meta")

  const keyboard = await read(`${APP}src/runtime/platform/keyboard.ts`)
  for (const anchor of [
    'viewport.addEventListener("resize", sync)',
    'window.addEventListener("resize", sync)',
    'document.addEventListener("focusin", sync)',
    'document.addEventListener("focusout", sync)',
  ]) {
    if (!keyboard.includes(anchor)) fail(`3: keyboard.ts lost the ${anchor} listener registration`)
  }
  if (!keyboard.includes('root.style.setProperty("--safe-area-inset-bottom", "0px")'))
    fail("3: keyboard.ts lost the safe-area-inset-bottom setProperty (keyboard shown)")
  if (!keyboard.includes('root.style.removeProperty("--safe-area-inset-bottom")'))
    fail("3: keyboard.ts lost the safe-area-inset-bottom removeProperty (keyboard hidden)")
  if (!/viewport\.height \* viewport\.scale > 100/.test(keyboard))
    fail("3: keyboard.ts lost the > 100 keyboard threshold check")
  if (!keyboard.includes("active.isContentEditable"))
    fail("3: keyboard.ts lost the isContentEditable editing check")

  const entry = await read(`${APP}src/entry.tsx`)
  if (!entry.includes('import { KeyboardInsets } from "@/runtime/platform/keyboard"'))
    fail("3: entry.tsx lost the KeyboardInsets import")
  if (!entry.includes("<KeyboardInsets />"))
    fail("3: entry.tsx lost the KeyboardInsets mount")

  // CROSS-REFERENCE re-checks (referencing, NOT first locks — first-locked by
  // verify-terminal.ts group 6 on the pre-v2.2.7 pin). v2.2.7 status (issue
  // #191 re-anchor): the panels.tsx visualViewport sync assertions below are
  // STALE on this pin — panels.tsx no longer carries the sync, and the
  // terminal-face viewport state is recorded in verify-terminal.ts group 6 as
  // a ZERO-hit visualViewport scan over gui-plugins/src/terminal (the
  // terminal face carries no viewport sync of its own). The assertions stay
  // pending this probe's own re-anchor; they are unreachable at c0 because
  // group 2 fails first (titlebar history.back). Kept so the interaction
  // document's premises fail loudly in one place too: the dock viewport store
  // syncs to the visual viewport height (soft-keyboard awareness).
  const panels = await read(`${APP}src/runtime/plugin/panels.tsx`)
  const vvCount = panels.split("window.visualViewport?.height ?? window.innerHeight").length - 1
  if (vvCount < 2)
    fail(`3: panels.tsx visualViewport height-sync anchors thinned (expected >= 2, got ${vvCount}; cross-reference with verify-terminal group 6)`)
  if (!panels.includes('if (window.visualViewport) makeEventListener(window.visualViewport, "resize", sync)'))
    fail("3: panels.tsx lost the visualViewport resize listener (cross-reference with verify-terminal group 6)")
}

// --- 4. Breakpoints & responsive ---
{
  const model = await read(`${APP}src/session/model.ts`)
  if (!model.includes('const isDesktop = createMediaQuery("(min-width: 768px)")'))
    fail("4: session/model.ts lost the isDesktop authoritative definition")

  // File-set equality over the EXPLICIT domain app/src + gui-extensions/src.
  // The 767px consumption sites in session-ui are deliberately outside this
  // domain (interaction-quality.md §4 registers them; the session-ui subset
  // run and G20/G28 carry their semantics).
  const domainDirs = [`${APP}src`, `${GUI}src`]
  const files = domainDirs.flatMap((dir) => walk(dir))
  // Domain underflow guard: a silently empty scan must not pass.
  if (files.length < 500)
    fail(`4: breakpoint scan domain underflow (scanned ${files.length} files, expected >= 500) — the app/src + gui-extensions/src domain shape changed; re-derive the scan domain before trusting this assertion`)

  const minFiles: string[] = []
  const maxFiles: string[] = []
  let minHits = 0
  let maxHits = 0
  for (const file of files) {
    let text: string
    try {
      text = await Bun.file(new URL(file, repoRoot)).text()
    } catch {
      continue
    }
    const mins = text.split("min-width: 768px").length - 1
    const maxs = text.split("max-width: 767px").length - 1
    if (mins > 0) {
      minFiles.push(file)
      minHits += mins
    }
    if (maxs > 0) {
      maxFiles.push(file)
      maxHits += maxs
    }
  }

  // 9 min-768 hits in 7 app files (issue #101: settings-framework-dependencies adds shell/sidebar-toggle.tsx, the
  // settings framework's CollapsedSidebarToggleSpace dependency, with the useCollapsedSlot
  // desktop breakpoint — interaction-quality.md §4 recounted 23/21 -> 24/22);
  // 14 max-767 hits (13 app files + 1 gui-ext); plus the host-apis.ts comment anchor.
  const expectedMin = [
    `${APP}src/runtime/plugin/host-apis.tsx`,
    `${APP}src/runtime/plugin/panels.tsx`,
    `${APP}src/runtime/plugin/side-region.tsx`,
    `${APP}src/session/header/session-header.tsx`,
    `${APP}src/session/model.ts`,
    `${APP}src/session/timeline/virtualizer.tsx`,
    `${APP}src/shell/sidebar-toggle.tsx`,
  ].sort()
  const expectedMax = [
    `${APP}src/composer/composer.tsx`,
    `${APP}src/composer/editor/editor.tsx`,
    `${APP}src/composer/submit.ts`,
    `${APP}src/home/route.tsx`,
    `${APP}src/home/sessions/view.css`,
    `${APP}src/providers/models/select-dialog.tsx`,
    `${APP}src/settings/general/general.tsx`,
    `${APP}src/settings/search.tsx`,
    `${APP}src/settings/settings.css`,
    `${APP}src/shell/shell.tsx`,
    `${APP}src/shell/titlebar/tab-popover.tsx`,
    `${APP}src/shell/titlebar/titlebar.tsx`,
    `${GUI}src/details/details.css`,
  ].sort()

  const setEq = (got: string[], want: string[], label: string) => {
    const g = [...got].sort()
    if (g.length !== want.length || g.some((f, i) => f !== want[i]))
      fail(
        `4: ${label} file set drifted — expected ${want.length} files, got ${g.length}` +
          (g.length || want.length
            ? ` (added: ${g.filter((f) => !want.includes(f)).join(", ") || "none"}; removed: ${want.filter((f) => !g.includes(f)).join(", ") || "none"})`
            : "") +
          " — a breakpoint change MUST fail here and force a re-count of interaction-quality.md §4 before the set is extended",
      )
  }
  setEq(minFiles, expectedMin, "min-width: 768px")
  setEq(maxFiles, expectedMax, "max-width: 767px")
  if (minHits !== 9) fail(`4: min-width: 768px hit count drifted (expected 9, got ${minHits})`)
  if (maxHits !== 13) fail(`4: max-width: 767px hit count drifted (expected 13, got ${maxHits})`)

  // The 21st file's anchor: the gui-ext SDK viewport comment.
  const guiHostApis = await read("vendor/upstream/packages/plugin/src/gui/host-apis.ts")
  if (!guiHostApis.includes("/** Viewport under 768px. Reactive. */"))
    fail("4: gui-extensions sdk/host-apis.ts lost the \"Viewport under 768px. Reactive.\" comment anchor (the 21st documented file)")

  // CROSS-REFERENCE re-checks (first locks: verify-session-workbench.ts and
  // verify-terminal.ts group 6 :448).
  const submit = await read(`${APP}src/composer/submit.ts`)
  if (!submit.includes('if (window.matchMedia("(max-width: 767px)").matches) input.editor()?.blur()'))
    fail("4: composer/submit.ts lost the 767px submit blur line (cross-reference with verify-session-workbench)")
  const mobile = await read(`${APP}src/runtime/plugin/mobile.tsx`)
  if (!mobile.includes('sorted(["menu", "drawer"])'))
    fail("4: mobile.tsx lost the sorted([\"menu\", \"drawer\"]) key (cross-reference with verify-terminal group 6)")

  // The COMMENT anchor only — the <MobileViewTabs mount anchor in screen.tsx is
  // verify-agent-capabilities.ts group 3's first lock and is NOT re-asserted.
  if (!mobile.includes("The narrow-screen view switcher: the conversation, each tab view, and a More drawer with the other views."))
    fail("4: mobile.tsx lost the MobileViewTabs narrow-screen view-switcher comment anchor")

  // mobileTitlebarPosition four anchors.
  const settings = await read(`${APP}src/settings/model.tsx`)
  if (!settings.includes('mobileTitlebarPosition: Schema.Literals(["top", "bottom"])'))
    fail("4: settings/model.tsx lost the mobileTitlebarPosition schema literal")
  if (!settings.includes('mobileTitlebarPosition: "top",'))
    fail("4: settings/model.tsx lost the mobileTitlebarPosition default (\"top\")")
  const shell = await read(`${APP}src/shell/shell.tsx`)
  if (!shell.includes('const bottomTitlebar = () => mobile() && preferences.general.mobileTitlebarPosition() === "bottom"'))
    fail("4: shell.tsx lost the bottomTitlebar consumer")
  const general = await read(`${APP}src/settings/general/general.tsx`)
  if (!general.includes("<Show when={mobile()}>") || !general.includes('data-action="settings-mobile-titlebar-bottom"'))
    fail("4: settings/general.tsx lost the mobile()-gated titlebar-position switch")
}

// --- 5. Platform mapping face ---
{
  const command = await read(`${APP}src/shell/commands/command.tsx`)
  if (!command.includes('export const DEFAULT_PALETTE_KEYBIND = "mod+k,mod+shift+p"'))
    fail("5: command.tsx lost the DEFAULT_PALETTE_KEYBIND (the command palette is keybind-only — documented honest state)")

  for (const file of [
    `${APP}src/home/sessions/controller.tsx`,
    `${APP}src/new-session/commands.tsx`,
    `${APP}src/session/composer/region.tsx`,
  ]) {
    const text = await read(file)
    if (!text.includes('id: "command.palette"')) fail(`5: ${file} lost the command.palette registration`)
    if (!text.includes("hidden: true")) fail(`5: ${file} lost the hidden: true flag (the palette is keybind-only — documented honest state)`)
  }

  // Slash set equality — first-party STATIC registrations only (the slashAfter
  // dynamic extension face is deliberately not locked; see header).
  const slashOf = (text: string) => [...text.matchAll(/\bslash:\s*"([a-z]+)"/g)].map((m) => m[1]!)
  const sessionCommandsFile = `${APP}src/session/commands/use-session-commands.tsx`
  const composerCommandsFile = `${APP}src/composer/commands.tsx`
  const sessionSlashes = slashOf(await read(sessionCommandsFile)).sort()
  const composerSlashes = slashOf(await read(composerCommandsFile)).sort()
  const eq = (got: string[], want: string[]) => got.length === want.length && got.every((v, i) => v === want[i])
  if (!eq(sessionSlashes, ["compact", "export", "fork", "mcp", "new", "open", "redo", "undo"]))
    fail(`5: use-session-commands.tsx slash set drifted (expected exactly the 8-key set {new,undo,redo,compact,fork,export,open,mcp}, got {${sessionSlashes.join(",")}}) — a static slash registration change MUST force a re-count of interaction-quality.md §7 before the set is extended`)
  if (!eq(composerSlashes, ["agent", "connect", "model"]))
    fail(`5: composer/commands.tsx slash set drifted (expected exactly the 3-key set {model,connect,agent}, got {${composerSlashes.join(",")}})`)
  // The undo/redo pair is a CROSS-REFERENCE re-check (first lock:
  // verify-diff.ts group 3 :312-314).
  if (!sessionSlashes.includes("undo") || !sessionSlashes.includes("redo"))
    fail("5: use-session-commands.tsx lost the undo/redo slash pair (cross-reference with verify-diff group 3)")

  // GLOBAL drift sentinel: exactly 11 static registrations in exactly 2 files
  // across the four upstream src trees. The three `slash: "/"` i18n
  // placeholder arguments are excluded naturally by the [a-z]+ shape.
  const sentinelFiles = new Set<string>()
  let sentinelHits = 0
  for (const dir of [`${APP}src`, `${GUI}src`, `${SESSION_UI}src`, `${CLIENT}src`]) {
    for (const file of walk(dir)) {
      let text: string
      try {
        text = await Bun.file(new URL(file, repoRoot)).text()
      } catch {
        continue
      }
      const hits = text.match(/slash: "[a-z]+"/g)?.length ?? 0
      if (hits > 0) {
        sentinelHits += hits
        sentinelFiles.add(file)
      }
    }
  }
  if (sentinelHits !== 11 || sentinelFiles.size !== 2)
    fail(
      `5: global slash sentinel drifted (expected exactly 11 hits in exactly 2 files, got ${sentinelHits} hits in ${sentinelFiles.size}: ${[...sentinelFiles].join(", ")})` +
        " — a new first-party static slash registration MUST force a mechanical re-count of interaction-quality.md §7 (and G31⑤) before the set is extended",
    )

  // The /open → DialogCommandPalette route.
  const sessionCommands = await read(sessionCommandsFile)
  if (!sessionCommands.includes("dialog.show(() => <x.DialogCommandPalette />)"))
    fail("5: use-session-commands.tsx lost the dialog.show(() => <x.DialogCommandPalette />) route")
}

// --- 6. Preference restoration ---
{
  const settings = await read(`${APP}src/settings/model.tsx`)
  if (!settings.includes('persisted({ key: "settings.v3" }, settingsPersistence, defaultSettings)'))
    fail("6: settings/model.tsx lost the settings.v3 persisted key")
  for (const anchor of [
    "general: generalSchema",
    "appearance: appearanceSchema",
    "keybinds: Persistence.record(",
    "permissions: permissionsSchema",
    "workspaces: workspacesSchema",
    "notifications: notificationsSchema",
    "sounds: soundsSchema",
  ]) {
    if (!settings.includes(anchor)) fail(`6: settings/model.tsx settingsSchema lost the ${anchor} segment key`)
  }

  const language = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!language.includes('persisted(Persist.global("language"), languageSchema, { locale: initial })'))
    fail("6: language.tsx lost the persisted language store")
  if (!language.includes("export function loadInitialLocale()"))
    fail("6: language.tsx lost the loadInitialLocale initial-detection entry")
  if (!language.includes("setLocale(next: Locale)"))
    fail("6: language.tsx lost the setLocale action")
  const general = await read(`${APP}src/settings/general/general.tsx`)
  if (!general.includes("language.setLocale(option.value)"))
    fail("6: settings/general.tsx lost the language.setLocale wiring")

  // Theme pre-load (three localStorage keys; the file is inlined into the
  // build by vite.js — the anchors live in the public source file).
  const themePreload = await read(`${APP}public/oc-theme-preload.js`)
  for (const anchor of ['"opencode-theme-id"', '"opencode-color-scheme"', '"opencode-theme-css-"', "(prefers-color-scheme: dark)", "meta[name='theme-color']"]) {
    if (!themePreload.includes(anchor)) fail(`6: oc-theme-preload.js lost the ${anchor} anchor`)
  }

  // CROSS-REFERENCE re-check (first lock: verify-provider-models.ts :383).
  const runtime = await read(`${APP}src/runtime/server/runtime.tsx`)
  if (!runtime.includes('persisted(Persist.global("model")'))
    fail("6: runtime/server/runtime.tsx lost the Persist.global(\"model\") preference store (cross-reference with verify-provider-models)")
}

// --- 7. Mobile navigation body ---
{
  const mobile = await read(`${APP}src/runtime/plugin/mobile.tsx`)
  if (!mobile.includes("export function createMobileViews()"))
    fail("7: mobile.tsx lost the createMobileViews function")
  if (!mobile.includes("entries,")) fail("7: mobile.tsx lost the entries return key")
  if (!mobile.includes("tabs: createMemo(() => sorted([\"tab\"]))"))
    fail("7: mobile.tsx lost the tabs return key (kind \"tab\" → top-level tab bar)")
  if (!mobile.includes('menu: createMemo(() => sorted(["menu", "drawer"]))'))
    fail("7: mobile.tsx lost the menu return key (kinds menu/drawer → More drawer)")
  if (!mobile.includes("find: (key: string) => entries().find((entry) => entry.key === key)"))
    fail("7: mobile.tsx lost the find return key")
  if (!mobile.includes("const MobilePanelDrawer = lazy(async () => {"))
    fail("7: mobile.tsx lost the lazy MobilePanelDrawer import")
  if (!mobile.includes('await import("@/shell/mobile-panel-drawer")'))
    fail("7: mobile.tsx lost the mobile-panel-drawer module import")
}

// --- 8. Docs closure anchors (docs ↔ code drift guards) ---
{
  const quality = await read("docs/design/interaction-quality.md")

  for (const anchor of [
    "## 一、窗口与进程形态",
    "## 二、导航与切换保持索引",
    "## 三、键盘、IME 与焦点",
    "## 四、viewport、旋转与响应式",
    "## 五、读屏、对比度与触摸目标盘点",
    "## 六、偏好恢复索引",
    "## 七、Desktop actions 平台映射清单",
    "## 八、诚实边界（上游/第一方实态，本期不声称）",
  ]) {
    if (!quality.includes(anchor)) fail(`8: interaction-quality.md lost the ${anchor} section title`)
  }
  if (!quality.includes("authority 边界声明"))
    fail("8: interaction-quality.md lost the authority 边界声明")

  // The four honest-state sentences.
  if (!quality.includes("返回键实际语义=结束 Activity"))
    fail("8: interaction-quality.md lost the back-key-ends-the-Activity honest-state sentence")
  if (!quality.includes("命令面板本体无触屏按钮入口（keybind-only）"))
    fail("8: interaction-quality.md lost the palette-keybind-only honest-state sentence")
  if (!quality.includes("旋转=Activity 重建"))
    fail("8: interaction-quality.md lost the rotation-is-an-Activity-rebuild honest-state sentence")
  if (!quality.includes("触摸目标缺口在册"))
    fail("8: interaction-quality.md lost the touch-target-gaps-on-record honest-state sentence")

  // The slash 11-key mapping inventory (acceptance 3 body).
  for (const anchor of ["`/model`", "`/connect`", "`/agent`", "`/mcp`"]) {
    if (!quality.includes(anchor)) fail(`8: interaction-quality.md lost the ${anchor} slash mapping entry`)
  }

  const interaction = await read("docs/design/interaction.md")
  // Issue #23/#24/#26 revisions (deliberate, NOT a bypass): the enumeration-title anchor
  // moved G1–G31 -> G1–G33 when the issue #23 G33 gate row was appended,
  // G1–G33 -> G1–G34 when the issue #24 G34 gate row was appended, and
  // G1–G34 -> G1–G35 when the issue #26 G35 gate row was appended to interaction.md —
  // the anchor's coverage semantics (the enumeration must cover the FULL gate set) are
  // preserved.
  if (!interaction.includes("## G1–G35 设备门禁（完整枚举）"))
    fail("8: interaction.md gate enumeration must cover G1–G35")
  if (!interaction.includes("| G31 移动交互质量 walkthrough 门禁（issue #20"))
    fail("8: interaction.md lost the G31 gate row")
  if (!interaction.includes("第十七处落字（issue #20）"))
    fail("8: interaction.md lost the seventeenth honest wording (issue #20)")
  if (!interaction.includes("返回键实际语义=结束 Activity"))
    fail("8: interaction.md lost the back-key real-state baseline sentence")
  if (!interaction.includes("例外为一**类**而非单点"))
    fail("8: interaction.md lost the class-shaped exception wording (not a single OAuth point)")
  if (!interaction.includes("移动交互质量失败路径（issue #20）"))
    fail("8: interaction.md lost the issue #20 failure-path subsection")

  const recovery = await read("docs/design/recovery.md")
  if (!recovery.includes("| 用户偏好（issue #20 回修增行） |"))
    fail("8: recovery.md lost the user-preferences data-class row")

  const readme = await read("docs/design/README.md")
  if (!readme.includes("[interaction-quality.md](interaction-quality.md)"))
    fail("8: design/README.md lost the interaction-quality.md index row")
}

console.log(
  "verify-interaction-quality: PASS (" +
    "1: back-key trio + predictive-back comment + single WebView + LAUNCHER + INTERNET+POST_NOTIFICATIONS+CAMERA triple (issues #23/#71) + enableOnBackInvokedCallback=false, NEGATIVE zero configChanges + zero multi-window faces, CROSS-REFERENCE onSaveInstanceState TODO (verify-recovery group 4); " +
    "2: NEGATIVE zero History-API writes across the four upstream src trees (FIRST-PARTY drift sentinel, issue #75 domain note) + pwa.ts replaceState sole FIRST-PARTY touchpoint + exactly two target=\"_blank\" tool-link anchors (full-page same-window navigation class paths); " +
    "3: viewport meta four segments + theme-color, keyboard.ts four listeners + safe-area set/remove pair + > 100 threshold + isContentEditable, entry.tsx KeyboardInsets mount, CROSS-REFERENCE panels.tsx visualViewport sync (stale on v2.2.7 pending this probe's own re-anchor; terminal-face viewport state recorded in verify-terminal group 6); " +
    "4: isDesktop verbatim + 768/767 media-query FILE-SET equality over app/src + gui-extensions/src (8/13 hits, 19 files + host-apis comment anchor = 22 hits / 20 files; session-ui consumption sites outside the domain by design), CROSS-REFERENCE 767px blur (vsw) + sorted([\"menu\",\"drawer\"]) (verify-terminal group 6), MobileViewTabs comment anchor (mount anchor stays with verify-agent-capabilities), mobileTitlebarPosition four anchors; " +
    "5: DEFAULT_PALETTE_KEYBIND + three hidden command.palette registrations + slash set equality (8-key + 3-key files, undo/redo pair CROSS-REFERENCE verify-diff group 3) + GLOBAL sentinel exactly 11 registrations in exactly 2 files + DialogCommandPalette /open route; " +
    "6: settings.v3 key + seven schema segments + mobileTitlebarPosition default + language store/loadInitialLocale/setLocale + oc-theme-preload three localStorage keys + Persist.global(\"model\") CROSS-REFERENCE (verify-provider-models); " +
    "7: createMobileViews + entries/tabs/menu/find return keys + lazy MobilePanelDrawer; " +
    "8: interaction-quality.md eight section titles + authority declaration + four honest-state sentences + slash mapping inventory, interaction.md G1–G35 enumeration (issue #26 revision) + G31 row + seventeenth honest wording + back-key baseline (issue #75 re-reasoned wording) + issue #20 failure path, recovery.md user-preferences row, README.md index row; " +
    "STATIC check - back-key semantics, soft-keyboard viewport behavior, IME, screen-reader walkthrough, contrast, touch-target usability, rotation rebuild chains and slash discoverability on a device are G31)",
)
