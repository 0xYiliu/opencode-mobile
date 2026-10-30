// verify-appearance-settings.ts — static probe for issue #65 (S17+S42: the v2.2.1
// reduced-motion three-state setting and the interface zoom setting, mobile patch M-035).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf… + mobile patches
// M-001..M-035), the structural facts the S17/S42 alignment record relies on:
//
//   1. Three-state enum + arbiter (settings/model.tsx): appearance.reduceMotion is the
//      v2.2.1 three-value literal (system/on/off) with default "system"; the read path is
//      withFallback; the system signal is createMediaQuery("@solid-primitives/media"); the
//      dataset.motion effect is verbatim (system mirrors the media query, on/off override
//      it). Layering negatives: the W05/S11/sounds faces of the same v2.2.1 file
//      (sidebarOpen/backgroundActivity/timelineWidth/interfaceEnabled) are NOT carried,
//      while the M-033 tabLayout three-value line and mobileTitlebarPosition remain.
//   2. Controllers (settings/general/controllers.ts): the zoom block (available via
//      platform.zoomLevel presence, options [...desktopZoomLevels], current ?? 1, Intl
//      percent label, select via setZoomLevel) and the reduceMotion block are verbatim
//      v2.2.1 :94-103. Cherry-pick negatives: api.experimental.config.update NOT adopted
//      (pin sdk.api.config.update retained), behavior re-exports retained.
//   3. Settings face (settings/appearance/appearance.tsx): reduceMotionOptions three
//      items in order; the zoom row is wrapped in <Show when={appearance.zoom.available()}>.
//   4. Zoom levels (shell/commands/desktop-menu.ts): desktopZoomLevels six levels verbatim
//      with the Slack comment; nextDesktopZoomLevel (pinch, S12/#74) NOT ported; the
//      DESKTOP_MENU data face is untouched (commands/menus probe cross-locks this).
//   5. Web platform faces (runtime/platform/web.ts): zoomLevel/setZoomLevel implemented
//      per the M-020 precedent (CSS zoom + localStorage opencode-ui-zoom-level, validated
//      against desktopZoomLevels, mobile(M-035) marker); platform.tsx (the TYPE file)
//      carries zero zoom content — the M-035 patch face must not touch it either.
//   6. Motion consumption chain — PER-FILE enumeration (BLOCKER-2 discipline: no count
//      assertions). 25 CSS files / 31 blocks: each file contains :root[data-motion="reduce"]
//      and no longer contains @media (prefers-reduced-motion: reduce). 3 TS consumers
//      (toast, segmented-control, animated-wordmark): each imports and calls
//      prefersReducedMotion and has no bare matchMedia reduce read.
//   7. Whole-tree whitelist set-equality: across ALL vendored packages, the file set
//      containing "prefers-reduced-motion" is EXACTLY {app settings/model.tsx (the
//      createMediaQuery query string — the ported mechanism itself), app
//      providers/connect/go-upsell-hero-art.ts (the upstream-unconverted face — registered
//      boundary), ui motion/reduced.ts (the fallback mechanism)}. One more or one less is
//      FAIL. The app+ui subscan (plan v2 §8 step 3b scope) yields the identical set.
//   8. Tailwind: the comment + two @custom-variant lines only; the entangled @source
//      renames (gui-plugins/stories) did NOT ride along (they would break the build).
//   9. Search catalog: the two appearance entries verbatim except the zoom entry drops
//      available:"desktop" (ruling A2); search-results.test.ts carries exactly the one
//      A2-forced "font" length change 3→4 with the mobile(M-035) comment and NOT the
//      v2.2.1 :54 not.toContain("settings-zoom") line (registered future-sync note).
//  10. i18n: the seven en keys verbatim, inserted after interfaceMode.experimental and
//      before the notifications block; zh (and sampled locales) stay key-free; language.tsx
//      still spreads the en base first (fallback chain intact).
//  11. model.test.ts: both reduceMotion expectations present; the pin general rows
//      (showFileTree/terminalPlacement) remain; M-034's newIcons/foldUserMessages rows are
//      absent at THIS baseline (the rebase round onto #64 flips that line).
//  12. Patch/manifest face: M-035 registered in BOTH manifests; the patch file touches
//      exactly the 41 registered targets; platform.tsx is not among them (5).
//  13. First-party negative: packages/mobile-hosts carries ZERO reduceMotion / zoomLevel /
//      opencode-ui-zoom references (S17+S42 are vendor-side only).
//
// HONEST BOUNDARY (verify-* family tradition): static STRUCTURE check, zero runtime
// proof. Whether the system state maps to prefers-reduced-motion on Android WebView, the
// first-frame gap before hydrate, zoom × system font-size interaction (Chromium 41297766),
// KeyboardInsets behavior at zoom>1 and the go-upsell hero boundary are device-QA items
// registered in docs/build-and-verify.md.
//
// Usage:
//   bun run scripts/verify-appearance-settings.ts
// Exit 0 = all assertions PASS.

import { readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-appearance-settings: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const UI = "vendor/upstream/packages/ui/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const GUI_EXT = "vendor/upstream/packages/gui-extensions/"
const HOSTS = "packages/mobile-hosts/"
const PATCHES = "vendor/upstream/patches/mobile/"
const M035_PATCH = `${PATCHES}0035-M-035-appearance-motion-zoom.patch`

const CSS_CONVERTED: [string, number][] = [
  // [file, blocks converted in this file]
  [`${APP}src/index.css`, 3],
  [`${APP}src/new-session/wordmark.css`, 1],
  [`${APP}src/settings/search.css`, 1],
  [`${APP}src/settings/settings.css`, 3],
  [`${APP}src/settings/workspaces/project.css`, 1],
  [`${APP}src/shell/mobile-drawer.css`, 1],
  [`${APP}src/shell/titlebar/tab-nav.css`, 1],
  [`${APP}src/shell/titlebar/tab-popover.css`, 1],
  [`${GUI_EXT}src/browser/comment.css`, 1],
  [`${GUI_EXT}src/details/details.css`, 1],
  [`${SESSION_UI}src/components/basic-tool.css`, 1],
  [`${SESSION_UI}src/components/markdown.css`, 1],
  [`${SESSION_UI}src/components/message-part.css`, 3],
  [`${SESSION_UI}src/components/question-prompt.css`, 1],
  [`${SESSION_UI}src/components/tool-count-label.css`, 1],
  [`${SESSION_UI}src/components/tool-count-summary.css`, 1],
  [`${SESSION_UI}src/components/tool-status-title.css`, 1],
  [`${SESSION_UI}src/v2/components/session-progress-indicator-v2.css`, 1],
  [`${UI}src/components/animated-number.css`, 1],
  [`${UI}src/components/text-reveal.css`, 1],
  [`${UI}src/components/text-strikethrough.css`, 1],
  [`${UI}src/feedback/loader/loader.css`, 1],
  [`${UI}src/feedback/toast/toast.css`, 1],
  [`${UI}src/overlays/tooltip/tooltip.css`, 1],
  [`${UI}src/typography/text-shimmer/text-shimmer.css`, 1],
]

const TS_CONSUMERS = [
  `${APP}src/settings/about/animated-wordmark.tsx`,
  `${UI}src/feedback/toast/toast.tsx`,
  `${UI}src/navigation/segmented-control/segmented-control.tsx`,
]

const WHITELIST = new Set([
  `${APP}src/settings/model.tsx`,
  `${APP}src/providers/connect/go-upsell-hero-art.ts`,
  `${UI}src/motion/reduced.ts`,
])

// --- 1. Three-state enum + arbiter (settings/model.tsx) ---
{
  const model = await read(`${APP}src/settings/model.tsx`)

  if (!model.includes('import { createMediaQuery } from "@solid-primitives/media"'))
    fail("1: model.tsx lost the createMediaQuery import")
  if (!model.includes('reduceMotion: Schema.Literals(["system", "on", "off"]),'))
    fail("1: model.tsx reduceMotion is not the three-value system/on/off literal")
  if (!model.includes('appearance: { fontSize: 14, mono: "", sans: "", terminal: "", tabLayout: "horizontal", reduceMotion: "system" },'))
    fail("1: model.tsx defaultSettings appearance does not default reduceMotion to system")
  if (!model.includes("const reduceMotion = withFallback(() => store.appearance?.reduceMotion, defaultSettings.appearance.reduceMotion)"))
    fail("1: model.tsx lost the withFallback reduceMotion read path")
  if (!model.includes('const systemReducedMotion = createMediaQuery("(prefers-reduced-motion: reduce)")'))
    fail("1: model.tsx lost the system reduced-motion media signal")
  if (!model.includes("export type ReduceMotion = Settings[\"appearance\"][\"reduceMotion\"]"))
    fail("1: model.tsx lost the exported ReduceMotion type")

  // The arbiter effect, verbatim (including the override comment).
  const effect = [
    "    // Motion styles key off this attribute instead of the media query so the setting can override the system.",
    "    createEffect(() => {",
    '      if (typeof document === "undefined") return',
    '      const reduce = reduceMotion() === "system" ? systemReducedMotion() : reduceMotion() === "on"',
    '      document.documentElement.dataset.motion = reduce ? "reduce" : "full"',
    "    })",
  ].join("\n")
  if (!model.includes(effect)) fail("1: model.tsx dataset.motion arbiter effect is not verbatim")

  // Layering negatives: same-file v2.2.1 faces owned by OTHER matrix rows stay out;
  // M-033/pin lines stay in.
  for (const token of ["sidebarOpen", "backgroundActivity", "timelineWidth", "interfaceEnabled"]) {
    if (model.includes(token)) fail(`1: model.tsx carried the ${token} face (W05/S11/sounds domain — must stay out)`)
  }
  if (!model.includes('tabLayout: Schema.Literals(["horizontal", "vertical", "inbox"]),'))
    fail("1: model.tsx lost the M-033 three-value tabLayout (layering broken)")
  if (!model.includes('mobileTitlebarPosition: Schema.Literals(["top", "bottom"]),'))
    fail("1: model.tsx lost the mobileTitlebarPosition literal (pin face must stay)")
  if (!model.includes("setReduceMotion(value: ReduceMotion) {"))
    fail("1: model.tsx lost the setReduceMotion accessor")
}

// --- 2. Controllers ---
{
  const controllers = await read(`${APP}src/settings/general/controllers.ts`)

  if (!controllers.includes("  type ReduceMotion,"))
    fail("2: controllers.ts lost the type ReduceMotion import")
  if (!controllers.includes('import { usePlatform } from "@/runtime/platform/platform"'))
    fail("2: controllers.ts lost the usePlatform import")
  if (!controllers.includes('import { desktopZoomLevels, type DesktopZoomLevel } from "@/shell/commands/desktop-menu"'))
    fail("2: controllers.ts lost the desktopZoomLevels/DesktopZoomLevel import")

  const zoomBlock = [
    "    zoom: {",
    "      available: () => platform.zoomLevel !== undefined,",
    "      options: [...desktopZoomLevels],",
    "      current: () => platform.zoomLevel?.() ?? 1,",
    '      label: (level: DesktopZoomLevel) => new Intl.NumberFormat(language.intl(), { style: "percent" }).format(level),',
    "      select: (level: DesktopZoomLevel) => void platform.setZoomLevel?.(level),",
    "    },",
  ].join("\n")
  if (!controllers.includes(zoomBlock)) fail("2: controllers.ts zoom block is not the verbatim v2.2.1 :94-99 form")

  const motionBlock = [
    "    reduceMotion: {",
    "      current: settings.appearance.reduceMotion,",
    "      select: (value: ReduceMotion) => settings.appearance.setReduceMotion(value),",
    "    },",
  ].join("\n")
  if (!controllers.includes(motionBlock)) fail("2: controllers.ts reduceMotion block is not the verbatim v2.2.1 :101-103 form")

  // Cherry-pick negatives (plugin-migration domain stays out; pin faces stay).
  if (controllers.includes("api.experimental.config.update"))
    fail("2: controllers.ts adopted api.experimental.config.update (plugin migration — must stay out)")
  if (!controllers.includes(".sdk.api.config.update({ shell: value || null })"))
    fail("2: controllers.ts lost the pin sdk.api.config.update call")
  if (!controllers.includes('export { createShellOptions, createSoundPreviewController } from "./behavior"'))
    fail("2: controllers.ts lost the behavior re-export (cherry-pick boundary)")
}

// --- 3. Settings face ---
{
  const appearance = await read(`${APP}src/settings/appearance/appearance.tsx`)

  if (!appearance.includes('import { Component, Show } from "solid-js"'))
    fail("3: appearance.tsx lost the Show import")
  const options = [
    "const reduceMotionOptions = [",
    '  { value: "system" as const, label: "settings.appearance.row.reduceMotion.system" as const },',
    '  { value: "on" as const, label: "settings.appearance.row.reduceMotion.on" as const },',
    '  { value: "off" as const, label: "settings.appearance.row.reduceMotion.off" as const },',
    "]",
  ].join("\n")
  if (!appearance.includes(options)) fail("3: appearance.tsx reduceMotionOptions is not the three-item verbatim constant")
  for (const anchor of ['data-action="settings-zoom"', 'data-action="settings-reduce-motion"']) {
    if (!appearance.includes(anchor)) fail(`3: appearance.tsx lost the ${anchor} row anchor`)
  }
  const showAt = appearance.indexOf("<Show when={appearance.zoom.available()}>")
  const zoomAt = appearance.indexOf('data-action="settings-zoom"')
  const motionAt = appearance.indexOf('data-action="settings-reduce-motion"')
  if (showAt < 0 || zoomAt < 0 || motionAt < 0 || !(showAt < zoomAt && zoomAt < motionAt))
    fail("3: appearance.tsx zoom row is not Show-gated before the reduceMotion row")
  if (appearance.includes("sidebarOpen")) fail("3: appearance.tsx carried a sidebarOpen row (W05 domain — must stay out)")
}

// --- 4. Zoom levels ---
{
  const menu = await read(`${APP}src/shell/commands/desktop-menu.ts`)

  if (!menu.includes("// Slack's desktop zoom levels from 100% up. Zoom In, Zoom Out and the Appearance setting all pick one."))
    fail("4: desktop-menu.ts lost the upstream zoom-levels comment")
  if (!menu.includes("export const desktopZoomLevels = [1, 1.1, 1.25, 1.5, 1.75, 2] as const"))
    fail("4: desktop-menu.ts desktopZoomLevels is not the six-level verbatim constant")
  if (!menu.includes("export type DesktopZoomLevel = (typeof desktopZoomLevels)[number]"))
    fail("4: desktop-menu.ts lost the DesktopZoomLevel type export")
  if (menu.includes("nextDesktopZoomLevel"))
    fail("4: desktop-menu.ts carried nextDesktopZoomLevel (S12/#74 pinch domain — must stay out)")
  if (!menu.includes('export const DESKTOP_MENU: DesktopMenu[] = ['))
    fail("4: desktop-menu.ts lost the DESKTOP_MENU data (menu face must stay per pin)")
}

// --- 5. Web platform faces ---
{
  const web = await read(`${APP}src/runtime/platform/web.ts`)

  for (const anchor of [
    "zoomLevel: Accessor<DesktopZoomLevel>",
    "setZoomLevel: (level: DesktopZoomLevel) => Promise<void>",
    'const UI_ZOOM_KEY = "opencode-ui-zoom-level"',
    'document.documentElement.style.removeProperty("zoom")',
    'document.documentElement.style.setProperty("zoom", String(level))',
    "(desktopZoomLevels as readonly number[]).includes(parsed)",
    "mobile(M-035)",
  ]) {
    if (!web.includes(anchor)) fail(`5: web.ts lost the zoom-face anchor ${JSON.stringify(anchor)}`)
  }
  if (!web.includes("...createUiZoomLevel(),"))
    fail("5: web.ts zoom faces do not join the platform object via the createUiZoomLevel spread")

  // The Platform TYPE file stays pin-identical (zero zoom content; byte-equality itself
  // is V3 verify-closure's job, which must run alongside this probe).
  const platformType = await read(`${APP}src/runtime/platform/platform.tsx`)
  if (platformType.includes("zoomLevel") || platformType.includes("DesktopZoomLevel"))
    fail("5: platform.tsx type file carries zoom content (must stay pin-identical per plan §7.13)")
}

// --- 6. Consumption chain per-file enumeration ---
{
  for (const [file, blocks] of CSS_CONVERTED) {
    let css: string
    try {
      css = await read(file)
    } catch {
      fail(`6: converted CSS file missing: ${file}`)
    }
    const found = css.split(':root[data-motion="reduce"]').length - 1
    if (found < blocks)
      fail(`6: ${file} carries ${found} :root[data-motion="reduce"] selector(s), expected ${blocks}`)
    if (css.includes("@media (prefers-reduced-motion: reduce)"))
      fail(`6: ${file} still contains an unconverted @media (prefers-reduced-motion: reduce) block`)
  }

  for (const file of TS_CONSUMERS) {
    const ts = await read(file)
    if (!ts.includes("prefersReducedMotion")) fail(`6: ${file} lost the prefersReducedMotion consumer`)
    if (!ts.includes('from "../../motion"') && !ts.includes('from "@opencode/ui/motion"'))
      fail(`6: ${file} lost the motion module import`)
    if (/matchMedia\("(prefers-reduced-motion: reduce)"\)/.test(ts))
      fail(`6: ${file} still reads matchMedia("(prefers-reduced-motion: reduce)") directly`)
  }

  // The minimal motion module face: reduced.ts verbatim anchors + minimized index.
  const reduced = await read(`${UI}src/motion/reduced.ts`)
  for (const anchor of [
    'const query = "(prefers-reduced-motion: reduce)"',
    'if (value === "reduce") return true',
    "export const prefersReducedMotion = (): boolean => override() ?? media()?.matches ?? false",
    "attributeFilter: [\"data-motion\"]",
  ]) {
    if (!reduced.includes(anchor)) fail(`6: ui/src/motion/reduced.ts lost the anchor ${JSON.stringify(anchor)}`)
  }
  const index = await read(`${UI}src/motion/index.ts`)
  if (!index.includes('export * from "./reduced"')) fail("6: ui/src/motion/index.ts lost the reduced re-export")
  if (index.includes('from "./spring"') || index.includes('from "./waapi"'))
    fail("6: ui/src/motion/index.ts re-exports submodules this closure does not vendor (minimization drift)")

  const uiPkg = await read(`${UI}package.json`)
  if (!uiPkg.includes('"./motion": "./src/motion/index.ts",'))
    fail("6: ui package.json lost the ./motion export")
  if (uiPkg.includes('"./motion/solid"'))
    fail("6: ui package.json carried ./motion/solid (upstream companion not vendored)")
}

// --- 7. Whole-tree whitelist set-equality ---
{
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  const hits = new Set<string>()
  async function scan(dir: string, scope: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path, scope)
        continue
      }
      if (!/\.(ts|tsx|css|js|jsx)$/.test(entry.name)) continue
      const content = await Bun.file(path).text()
      if (content.includes("prefers-reduced-motion")) hits.add(path.replace(repoRoot.pathname, ""))
    }
  }
  await scan(`${repoRoot.pathname}vendor/upstream/packages`, "all")
  const actual = [...hits].sort()
  const expected = [...WHITELIST].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`7: whole-tree prefers-reduced-motion file set drifted — got ${JSON.stringify(actual)}, expected exactly ${JSON.stringify(expected)}`)

  // The plan v2 §8 step 3b app+ui subscan: same set, asserted over the narrower scope.
  const appUi = actual.filter((f) => f.startsWith(APP) || f.startsWith(UI))
  if (JSON.stringify(appUi) !== JSON.stringify(expected))
    fail(`7: app+ui subscan is not the exact three-file whitelist — got ${JSON.stringify(appUi)}`)
}

// --- 8. Tailwind custom variants only ---
{
  const tailwind = await read(`${UI}src/styles/tailwind/index.css`)
  if (!tailwind.includes("/* The app resolves its reduce motion setting, including the system preference, into this attribute. */"))
    fail("8: tailwind/index.css lost the upstream variant comment")
  if (!tailwind.includes('@custom-variant motion-reduce (&:where(:root[data-motion="reduce"] *));'))
    fail("8: tailwind/index.css lost the motion-reduce custom variant")
  if (!tailwind.includes('@custom-variant motion-safe (&:where(:root:not([data-motion="reduce"]) *));'))
    fail("8: tailwind/index.css lost the motion-safe custom variant")
  if (tailwind.includes("gui-plugins") || tailwind.includes('"../../../../stories"'))
    fail("8: tailwind/index.css mixed in the @source gui-plugins/stories renames (pin has no such dirs — build breakage)")
  if (tailwind.includes("data-timeline-width"))
    fail("8: tailwind/index.css mixed in the timeline-width rules (S11 domain — must stay out)")
}

// --- 9. Search catalog + A2 test face ---
{
  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  const zoomEntry = [
    "  {",
    '    tab: "appearance",',
    '    label: "settings.appearance.row.zoom.title",',
    '    target: "settings-zoom",',
    '    keywords: "scale size text font larger bigger accessibility",',
    "  },",
  ].join("\n")
  if (!catalog.includes(zoomEntry))
    fail("9: search-catalog.ts zoom entry is not the A2 form (verbatim fields, NO available line)")
  const motionEntry = [
    "  {",
    '    tab: "appearance",',
    '    label: "settings.appearance.row.reduceMotion.title",',
    '    target: "settings-reduce-motion",',
    '    keywords: "animation accessibility",',
    "  },",
  ].join("\n")
  if (!catalog.includes(motionEntry)) fail("9: search-catalog.ts lost the reduceMotion entry")
  const zoomIdx = catalog.indexOf('label: "settings.appearance.row.zoom.title"')
  const motionIdx = catalog.indexOf('label: "settings.appearance.row.reduceMotion.title"')
  const terminalFontIdx = catalog.indexOf('label: "settings.general.row.terminalFont.title"')
  if (terminalFontIdx < 0 || !(terminalFontIdx < zoomIdx && zoomIdx < motionIdx))
    fail("9: search-catalog.ts appearance entries are not after the terminalFont entry")

  const searchTest = await read(`${APP}src/settings/search-results.test.ts`)
  if (!searchTest.includes("expect(rankSettings(\"font\", items, root)).toHaveLength(4)"))
    fail("9: search-results.test.ts 'font' expectation is not the A2-forced length 4")
  if (!searchTest.includes("mobile(M-035)"))
    fail("9: search-results.test.ts lost the mobile(M-035) rationale comment on the length change")
  if (searchTest.includes('not.toContain("settings-zoom")'))
    fail("9: search-results.test.ts carried the v2.2.1 not.toContain(\"settings-zoom\") line (false under A2 — registered future-sync note)")
}

// --- 10. i18n ---
{
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  const keys = [
    '"settings.appearance.row.zoom.title": "Zoom",',
    '"settings.appearance.row.zoom.description": "Make text and controls larger across the app",',
    '"settings.appearance.row.reduceMotion.title": "Reduce motion",',
    '"settings.appearance.row.reduceMotion.description": "Reduce animations or match your system",',
    '"settings.appearance.row.reduceMotion.system": "System",',
    '"settings.appearance.row.reduceMotion.on": "On",',
    '"settings.appearance.row.reduceMotion.off": "Off",',
  ]
  for (const key of keys) {
    if (!en.includes(key)) fail(`10: en.ts lost or reshaped the key ${key.split(":")[0]}`)
  }
  const experimentalAt = en.indexOf('"settings.general.row.interfaceMode.experimental": "Experimental",')
  const firstAt = en.indexOf('"settings.appearance.row.zoom.title"')
  const lastAt = en.indexOf('"settings.appearance.row.reduceMotion.off"')
  const notificationsAt = en.indexOf('"settings.notifications.description"')
  if (experimentalAt < 0 || firstAt < 0 || lastAt < 0 || notificationsAt < 0 ||
      !(experimentalAt < firstAt && firstAt < lastAt && lastAt < notificationsAt))
    fail("10: en.ts zoom/reduceMotion block is not between interfaceMode.experimental and the notifications block")

  for (const locale of ["zh", "zht", "ko", "de", "fr"]) {
    const dict = await read(`${APP}src/runtime/i18n/${locale}.ts`)
    if (dict.includes("reduceMotion") || dict.includes("appearance.row.zoom"))
      fail(`10: ${locale}.ts carries zoom/reduceMotion keys — en-fallback is the registered shape; a translation needs a delta re-registration`)
  }

  const languageFile = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!languageFile.includes("const base = flatten({ ...en, ...dict })"))
    fail("10: language.tsx lost the en base-first flatten")
}

// --- 11. model.test.ts expectations ---
{
  const test = await read(`${APP}src/settings/model.test.ts`)
  if (!test.includes('        tabLayout: "horizontal",\n        reduceMotion: "system",'))
    fail("11: model.test.ts defaults expectation lacks reduceMotion: system after tabLayout")
  if (!test.includes('      tabLayout: "vertical",\n      reduceMotion: "system",'))
    fail("11: model.test.ts decode expectation lacks reduceMotion: system after tabLayout")
  // Pin general rows remain.
  for (const row of ["showFileTree: false,", 'terminalPlacement: "side",']) {
    if (!test.includes(row)) fail(`11: model.test.ts lost the pin general row ${row}`)
  }
  // M-034 rows (flipped at the rebase round onto #64 — the earlier "must be absent"
  // negative is retired with the rebase; both faces now coexist in the defaults row).
  for (const row of ["newIcons: false,", "foldUserMessages: false,"]) {
    if (!test.includes(row)) fail(`11: model.test.ts lost the M-034 defaults row ${row} (#64 face must stay)`)
  }
}

// --- 12. Patch/manifest face ---
{
  const manifest = await read(`${PATCHES}manifest.json`)
  if (!manifest.includes('"id": "M-035"') || !manifest.includes("patches/mobile/0035-M-035-appearance-motion-zoom.patch"))
    fail("12: patches/mobile/manifest.json does not register M-035")
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/0035-M-035-appearance-motion-zoom.patch"))
    fail("12: vendor-manifest.json does not register M-035 (verify-closure reads only this list)")

  const patch = await read(M035_PATCH)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  const manifestTargets = JSON.parse(manifest).patches.find((p: { id: string }) => p.id === "M-035").targets as string[]
  if (JSON.stringify([...touched].sort()) !== JSON.stringify([...manifestTargets].sort()))
    fail("12: M-035 patch face does not equal its manifest targets (41 files)")
  if (touched.includes("packages/app/src/runtime/platform/platform.tsx"))
    fail("12: M-035 patch face touches platform.tsx (type file must stay pin-identical)")
  if (touched.includes("packages/app/src/providers/connect/go-upsell-hero-art.ts"))
    fail("12: M-035 patch face touches go-upsell-hero-art.ts (registered non-converted boundary)")
}

// --- 13. First-party negative ---
{
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path)
        continue
      }
      if (!/\.(ts|tsx|css|js|jsx|json|kt|kts)$/.test(entry.name)) continue
      const content = await Bun.file(path).text()
      for (const token of ["reduceMotion", "prefers-reduced-motion", "zoomLevel", "opencode-ui-zoom"]) {
        if (content.includes(token))
          fail(`13: first-party ${path.replace(repoRoot.pathname, "")} references ${token} (S17+S42 are vendor-side only)`)
      }
    }
  }
  await scan(`${repoRoot.pathname}${HOSTS}src`)
  await scan(`${repoRoot.pathname}${HOSTS}test`)
}

console.log(
  "verify-appearance-settings: PASS (" +
    "1: reduceMotion three-value literal + system default + withFallback + createMediaQuery + verbatim dataset.motion arbiter, no sidebarOpen/backgroundActivity/timelineWidth/interfaceEnabled, M-033 tabLayout + mobileTitlebarPosition retained; " +
    "2: verbatim zoom/reduceMotion controller blocks, no experimental.config.update, pin config.update + behavior re-exports retained; " +
    "3: reduceMotionOptions three items, zoom row Show-gated before reduceMotion row, no sidebarOpen row; " +
    "4: desktopZoomLevels six levels + type, no nextDesktopZoomLevel, DESKTOP_MENU intact; " +
    "5: web.ts zoom faces (CSS zoom + opencode-ui-zoom-level localStorage + desktopZoomLevels validation + mobile(M-035) marker) via spread, platform.tsx type file zero zoom content; " +
    "6: 25 CSS files / 31 blocks + 3 TS consumers converted per-file (no bare @media reduce block, no bare matchMedia reduce read), motion/reduced.ts verbatim + minimized index + ./motion export only; " +
    "7: whole-tree prefers-reduced-motion file set EXACTLY {settings/model.tsx, go-upsell-hero-art.ts, motion/reduced.ts} (app+ui subscan identical); " +
    "8: tailwind comment + two custom variants only, no @source renames, no timeline-width rules; " +
    "9: A2 zoom entry without available line + reduceMotion entry, search-results 'font' length 4 with mobile(M-035) comment, no not.toContain settings-zoom line; " +
    "10: seven en keys between interfaceMode.experimental and notifications block, zero keys in zh/zht/ko/de/fr, en base-first merge intact; " +
    "11: both model.test.ts reduceMotion expectations + pin general rows + M-034 newIcons/foldUserMessages rows (rebase round onto #64); " +
    "12: M-035 in BOTH manifests, patch face == manifest targets (41 files), platform.tsx and go-upsell-hero-art.ts absent; " +
    "13: packages/mobile-hosts zero reduceMotion/prefers-reduced-motion/zoomLevel/opencode-ui-zoom references; " +
    "STATIC check — system-mapping on WebView, first-frame gap, zoom × system font-size (Chromium 41297766), KeyboardInsets at zoom>1 and the go-upsell hero boundary are device-QA items registered in docs/build-and-verify.md)",
)
