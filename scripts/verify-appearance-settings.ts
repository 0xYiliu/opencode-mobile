// verify-appearance-settings.ts — static probe for issues #65/#193 (S17+S42: the
// reduced-motion three-state setting and the interface zoom setting). Issue #193
// re-anchor: at v2.2.7 (fedc6f208a) the setting faces are pin-absorbed NATIVE; the
// appearance-motion-zoom patch is DEFERRED (39 targets, not replayed) and the mobile
// delta that survives is the W5 M-035 search-catalog deviation inside settings-v2-2-7.
//
// Asserts, against the REAL applied sources (vendored pin fedc6f208a… + the active
// patch chain incl. settings-v2-2-7), the structural facts the S17/S42 record relies on:
//
//   1. Three-state enum + arbiter (settings/model.tsx): appearance.reduceMotion is the
//      three-value literal (system/on/off) with default "system"; the read path is
//      withFallback; the system signal is createMediaQuery("@solid-primitives/media"); the
//      dataset.motion effect is verbatim (system mirrors the media query, on/off override
//      it). Layering: backgroundActivity/timelineWidth/interfaceEnabled/tabLayout/
//      mobileTitlebarPosition all NATIVE in the same file at v2.2.7 (old->new: the
//      #103/#101-era "restored by patch" faces are absorbed by the pin).
//   2. Controllers (settings/general/controllers.ts): the zoom block (available via
//      platform.zoomLevel presence, options [...desktopZoomLevels], current ?? 1, Intl
//      percent label, select via setZoomLevel) and the reduceMotion block are verbatim
//      (byte-identical to upstream v2.2.7 — the file is not a patch target). Config write:
//      old->new (issue #193 re-anchor) — the pin ADOPTED the experimental config API
//      natively (`context.sdk.api.experimental.config.update({ shell: ... })` at :127),
//      superseding the #65-era negative "api.experimental.config.update must stay out";
//      the REWRITTEN negative keeps the plugin-migration domain out of vendored
//      controllers.ts: zero plugin-host config-write references (api.plugin. /
//      PluginSettingsSections / usePluginHost) — the plugin settings-contribution write
//      path lives in general.tsx + the extension runtime (settings-v2-2-7 W3), and
//      upstream v2.2.7 controllers.ts is plugin-free.
//   3. Settings face (settings/appearance/appearance.tsx): reduceMotionOptions three
//      items in order; the zoom row is wrapped in <Show when={appearance.zoom.available()}>
//      (on this client the web platform does not implement zoomLevel yet — the deferred
//      patch face — so the row stays platform-gated, not deleted).
//   4. Zoom levels (shell/commands/desktop-menu.ts): old->new (issue #193 re-anchor) —
//      v2.2.7 re-based the menu on Chromium levels (eleven, 0.5–2, new comment) and ships
//      nextDesktopZoomLevel NATIVELY (the #144-era registered rc=1 "overlay carried the
//      pinch helper" discharges: the helper is pin content now, not overlay carry). The
//      S12 mobile contract is unchanged and lives in the SEARCH gates (group 9 here) +
//      verify-pinch-shell-settings: pinch stays desktop-gated away from mobile.
//   5. Platform faces: old->new (issue #193 re-anchor) — the zoom capability moved INTO
//      the Platform TYPE file natively (platform.tsx :94/:97 optional members + the
//      DesktopZoomLevel import; the #65-era "type file zero zoom content" negative is
//      absorbed), while runtime/platform/web.ts carries ZERO zoom implementation (the
//      deferred appearance-motion-zoom web face — CSS zoom + localStorage key — stays out
//      until its owner round, #197 direction).
//   6. Motion consumption chain — NATIVE at v2.2.7 and larger than the old patch face.
//      old->new: the per-file enumeration re-derives over the pin's own 30 CSS files /
//      34 :root[data-motion="reduce"] blocks; exactly two files (composer-lane.css,
//      question-prompt.css) legitimately keep a native @media (prefers-reduced-motion:
//      reduce) block alongside their data-motion blocks (registered dual-form); every
//      other converted file carries no bare @media reduce block. 3 TS consumers
//      (animated-wordmark, toast, segmented-control) import and call prefersReducedMotion
//      with no bare matchMedia reduce read. motion/reduced.ts keeps the query/override/
//      prefersReducedMotion/attributeFilter anchors + observeReducedMotion; motion/index.ts
//      is the full native re-export set (spring/loop/velocity/reduced/waapi/slider — the
//      #67-era minimized closure and its velocity/slider negative are absorbed), solid
//      stays a separate import.
//   7. Whole-tree whitelist set-equality: across ALL vendored packages, the file set
//      containing "prefers-reduced-motion" is EXACTLY the fourteen native members below
//      (the mechanism, the dual-form CSS, the upstream-unconverted faces and the two
//      native bare-read consumers). One more or one less is FAIL.
//   8. Tailwind: the comment + two @custom-variant lines (native); the @source roots
//      follow the v2.2.7 pin (app/desktop/session-ui/gui-plugins + stories — old->new: the
//      #65-era "no stories @source" negative is absorbed; the line is pin content while
//      the stories PACKAGE itself stays unvendored); the verbatim timeline-width token
//      block survives (issue #103 face native; the "overrides it below" sentence comment
//      was dropped by the pin — retired anchor).
//   9. Search catalog: the zoom entry carries the W5 M-035 gate-drop deviation in the
//      settings-v2-2-7 three-line comment form and NO available line; the reduceMotion
//      entry verbatim; terminalFont < zoom < reduceMotion order; search-results.test.ts:
//      the "font" query resolves to 4 with the mobile(M-035) rationale, the zoom target is
//      POSITIVELY advertised (old->new: the #65-era not.toContain("settings-zoom") lock
//      retires — the v2.2.7 test asserts toContain on both platforms), the S12 pinch-zoom
//      gates hold (settings-pinch-zoom desktop-only), the capsule row resolves to
//      settings-background-activity; old->new: the #103/#107-era timeline-width/
//      sounds-interface test assertions are gone from the pin's test — the rows themselves
//      are native catalog content pinned by verify-settings-framework group 5.
//  10. i18n: the seven en keys verbatim, native in the appearance block; old->new (issue
//      #193 re-anchor): the insertion anchor is the interfaceMode.inbox key (the
//      interfaceMode.experimental key is absorbed at v2.2.7 — see verify-interface-mode),
//      so the block reads inbox < zoom.title < reduceMotion.off < notifications.description;
//      zh (and sampled locales) stay key-free; language.tsx spreads the en base first
//      (v2.2.7 typed-spread form).
//  11. model.test.ts: both reduceMotion expectations present; old->new: the #103-era
//      showFileTree/terminalPlacement "retained deviation" rows are gone from the pin's
//      test (the v2.2.7 schema dropped the keys — verify-experimental-settings
//      negative-pins terminalPlacement in model.tsx); the settings-experimental
//      newIcons/foldUserMessages defaults rows stay.
//  12. Patch/manifest face: appearance-motion-zoom registered in BOTH manifests with
//      status DEFERRED and patch face == manifest targets (39 files at #193; the
//      search-catalog/search-results targets moved to settings-v2-2-7's active W5 face);
//      platform.tsx is not among them (5); go-upsell-hero-art.ts is not among them; web.ts
//      IS among them (the deferred implementation rides the patch file for its owner
//      round). settings-v2-2-7 is ACTIVE with the W5 search face.
//  13. First-party negative: packages/mobile-hosts carries ZERO reduceMotion /
//      prefers-reduced-motion / zoomLevel / opencode-ui-zoom references (S17+S42 are
//      vendor-side only).
//
// HONEST BOUNDARY (verify-* family tradition): static STRUCTURE check, zero runtime
// proof. Whether the system state maps to prefers-reduced-motion on Android WebView, the
// first-frame gap before hydrate, zoom × system font-size interaction (Chromium 41297766),
// KeyboardInsets behavior and the go-upsell hero boundary are device-QA items registered
// in docs/build-and-verify.md.
//
// Negative injections (issue #193 re-anchor round, run inject->FAIL->restore->PASS):
//   A1 (group 2): append an `api.plugin.list(` reference to controllers.ts -> the
//      plugin-host write-face negative fires.
//   A2 (group 5): add a `zoomLevel:` implementation line to web.ts -> the deferred-web-face
//      negative fires.
//   A3 (group 6): delete one :root[data-motion="reduce"] block from settings/settings.css
//      -> the per-file enumeration fails.
//   A4 (group 9): re-add `available: "desktop",` to the zoom catalog entry -> the W5
//      gate-drop form fails.
//   A5 (group 9): flip the pinch gate — assert settings-pinch-zoom in the no-desktop set
//      is already the positive form; inject by deleting the not.toContain("settings-pinch-zoom")
//      line from search-results.test.ts -> the S12 gate anchor fails.
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
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"
const HOSTS = "packages/mobile-hosts/"
const PATCHES = "vendor/upstream/patches/mobile/"
const M035_PATCH = `${PATCHES}appearance-motion-zoom.patch`

// Native v2.2.7 data-motion conversion set (issue #193 re-anchor of the old patch-face
// enumeration): [file, :root[data-motion="reduce"] blocks in the file]. Counts re-derived
// from the vendored pin.
const CSS_CONVERTED: [string, number][] = [
  [`${APP}src/index.css`, 2],
  [`${APP}src/home/sessions/view.css`, 1],
  [`${APP}src/new-session/wordmark.css`, 1],
  [`${APP}src/session/composer/activity-chips.css`, 1],
  [`${APP}src/session/composer/composer-lane.css`, 1],
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
  [`${SESSION_UI}src/components/message-part.css`, 4],
  [`${SESSION_UI}src/components/question-prompt.css`, 2],
  [`${SESSION_UI}src/components/tool-count-label.css`, 1],
  [`${SESSION_UI}src/components/tool-count-summary.css`, 1],
  [`${SESSION_UI}src/components/tool-status-title.css`, 1],
  [`${SESSION_UI}src/sources/sources.css`, 3],
  [`${UI}src/components/animated-number.css`, 1],
  [`${UI}src/components/spinner.css`, 1],
  [`${UI}src/components/text-reveal.css`, 1],
  [`${UI}src/components/text-strikethrough.css`, 1],
  [`${UI}src/feedback/loader/loader.css`, 1],
  [`${UI}src/feedback/toast/toast.css`, 1],
  [`${UI}src/overlays/tooltip/tooltip.css`, 1],
  [`${UI}src/styles/tailwind/index.css`, 1],
  [`${UI}src/typography/text-shimmer/text-shimmer.css`, 1],
]

// The only two files where the pin keeps a native @media (prefers-reduced-motion: reduce)
// block alongside the data-motion selectors (registered dual-form; both are whitelist
// members in group 7). Every other converted file must have zero bare @media reduce blocks.
const CSS_DUAL_FORM = new Set([`${APP}src/session/composer/composer-lane.css`, `${SESSION_UI}src/components/question-prompt.css`])

const TS_CONSUMERS = [
  `${APP}src/settings/about/animated-wordmark.tsx`,
  `${UI}src/feedback/toast/toast.tsx`,
  `${UI}src/navigation/segmented-control/segmented-control.tsx`,
]

// Whole-tree prefers-reduced-motion whitelist at v2.2.7 (issue #193 re-anchor; per-member
// reason in the group-7 PASS line).
const WHITELIST = new Set([
  `${APP}src/home/sessions/controller.tsx`,
  `${APP}src/providers/connect/go-upsell-hero-art.ts`,
  `${APP}src/session/composer/composer-lane.css`,
  `${APP}src/settings/model.tsx`,
  `${APP}src/shell/palette-menu.css`,
  `${APP}src/shell/search-list.css`,
  `${APP}test-browser/motion-dom.test.ts`,
  `${SESSION_UI}src/components/question-prompt.css`,
  `${SESSION_UI}src/components/session-compaction.css`,
  `${UI}src/components/menu-scroll.css`,
  `${UI}src/data-display/project-avatar/project-icon-styles.stories.tsx`,
  `${UI}src/forms/search-list/search-list.css`,
  `${UI}src/motion/reduced.ts`,
  `${UI}src/navigation/tabs/tabs.css`,
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

  // Layering: same-file literals are all pin-native at v2.2.7 (old->new: the
  // #103/#101-era restored-by-patch faces are absorbed; the mobile faces ride the
  // mobileTitlebarPosition/tabLayout pins).
  if (!model.includes('  backgroundActivity: Schema.Literals(["off", "left", "center", "right"]),'))
    fail("1: model.tsx lost the backgroundActivity schema literal")
  if (!model.includes('  timelineWidth: Schema.Literals(["focused", "comfortable", "wide"]),'))
    fail("1: model.tsx lost the timelineWidth schema literal")
  if (!model.includes("  interfaceEnabled: Schema.optional(Schema.Boolean),"))
    fail("1: model.tsx lost the sounds.interfaceEnabled schema field")
  if (!model.includes('tabLayout: Schema.Literals(["horizontal", "vertical", "inbox"]),'))
    fail("1: model.tsx lost the three-value tabLayout literal")
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
  if (!controllers.includes(zoomBlock)) fail("2: controllers.ts zoom block is not the verbatim form")

  const motionBlock = [
    "    reduceMotion: {",
    "      current: settings.appearance.reduceMotion,",
    "      select: (value: ReduceMotion) => settings.appearance.setReduceMotion(value),",
    "    },",
  ].join("\n")
  if (!controllers.includes(motionBlock)) fail("2: controllers.ts reduceMotion block is not the verbatim form")

  // Config write. old->new (issue #193 re-anchor): the v2.2.7 pin adopted the
  // experimental config API natively at :127 — the #65-era negative
  // ("api.experimental.config.update is the plugin migration, keep the sdk.api.config.update
  // call") is absorbed. The positive is now the experimental form itself.
  if (!controllers.includes("await context.sdk.api.experimental.config.update({ shell: value || null })"))
    fail("2: controllers.ts lost the native experimental.config.update shell write")
  // Rewritten negative (same closed-set intent, re-expressed for v2.2.7): the
  // plugin-migration write face stays OUT of vendored controllers.ts — the plugin
  // settings-contribution path lives in general.tsx + the extension runtime
  // (settings-v2-2-7 W3); upstream v2.2.7 controllers.ts is plugin-free.
  for (const pluginFace of ["api.plugin.", "PluginSettingsSections", "usePluginHost", "pluginHost"]) {
    if (controllers.includes(pluginFace))
      fail(`2: controllers.ts adopted the plugin-migration write face ${JSON.stringify(pluginFace)} (plugin settings-contribution stays in general.tsx + the extension runtime)`)
  }
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

  // old->new (issue #193 re-anchor): the v2.2.7 pin re-based the constant on Chromium
  // levels (eleven, 0.5–2) with a new comment; the #65-era six-level Slack-comment face
  // is absorbed.
  if (!menu.includes("// Chromium's zoom levels from 50% to 200%. Zoom In, Zoom Out and the Appearance setting all pick one."))
    fail("4: desktop-menu.ts lost the upstream Chromium zoom-levels comment")
  if (!menu.includes("export const desktopZoomLevels = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const"))
    fail("4: desktop-menu.ts desktopZoomLevels is not the eleven-level Chromium verbatim constant")
  if (!menu.includes("export type DesktopZoomLevel = (typeof desktopZoomLevels)[number]"))
    fail("4: desktop-menu.ts lost the DesktopZoomLevel type export")
  // old->new (issue #193 re-anchor): nextDesktopZoomLevel is NATIVE pin content at
  // v2.2.7 — the #144-era registered rc=1 ("overlay carried the S12/#74 pinch helper")
  // discharges with the rebase. The old must-not-exist negative is absorbed; the S12
  // mobile contract is enforced at the search gate (group 9) and by
  // verify-pinch-shell-settings, not by deleting the desktop helper.
  if (!menu.includes('/** The level after `factor` in `direction`. A pinch can leave `factor` between two levels. */'))
    fail("4: desktop-menu.ts lost the nextDesktopZoomLevel doc comment (native pinch helper)")
  if (!menu.includes('export function nextDesktopZoomLevel(factor: number, direction: "in" | "out"): DesktopZoomLevel {'))
    fail("4: desktop-menu.ts lost the native nextDesktopZoomLevel helper")
  if (!menu.includes("export const DESKTOP_MENU: DesktopMenu[] = ["))
    fail("4: desktop-menu.ts lost the DESKTOP_MENU data (menu face must stay per pin)")
}

// --- 5. Platform faces ---
{
  // old->new (issue #193 re-anchor): the zoom capability is DECLARED natively in the
  // Platform type file at v2.2.7 (optional members — platforms implement it or not; the
  // #65-era "type file zero zoom content" negative is absorbed).
  const platformType = await read(`${APP}src/runtime/platform/platform.tsx`)
  for (const anchor of [
    'import type { DesktopMenuAction, DesktopZoomLevel } from "@/shell/commands/desktop-menu"',
    "  zoomLevel?: Accessor<DesktopZoomLevel>",
    "  setZoomLevel?(level: DesktopZoomLevel): Promise<void>",
  ]) {
    if (!platformType.includes(anchor)) fail(`5: platform.tsx lost the native zoom declaration ${JSON.stringify(anchor)}`)
  }

  // The web platform implements NO zoom face: the appearance-motion-zoom implementation
  // (CSS zoom + opencode-ui-zoom-level localStorage) is the DEFERRED patch's face and
  // stays out until its owner round (#197 direction).
  const web = await read(`${APP}src/runtime/platform/web.ts`)
  for (const token of ["zoomLevel", "setZoomLevel", "opencode-ui-zoom", "createUiZoomLevel"]) {
    if (web.includes(token))
      fail(`5: web.ts carries the deferred zoom face token ${JSON.stringify(token)} (appearance-motion-zoom is not replayed — the web implementation belongs to its owner round)`)
  }
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
    if (!CSS_DUAL_FORM.has(file) && css.includes("@media (prefers-reduced-motion: reduce)"))
      fail(`6: ${file} still contains an unconverted @media (prefers-reduced-motion: reduce) block (dual-form is registered only for composer-lane.css / question-prompt.css)`)
  }
  for (const file of CSS_DUAL_FORM) {
    const css = await read(file)
    if (!css.includes("@media (prefers-reduced-motion: reduce)"))
      fail(`6: ${file} lost its native dual-form @media (prefers-reduced-motion: reduce) block`)
  }

  for (const file of TS_CONSUMERS) {
    const ts = await read(file)
    if (!ts.includes("prefersReducedMotion")) fail(`6: ${file} lost the prefersReducedMotion consumer`)
    if (!ts.includes('from "../../motion"') && !ts.includes('from "@opencode/ui/motion"'))
      fail(`6: ${file} lost the motion module import`)
    if (/matchMedia\("(prefers-reduced-motion: reduce)"\)/.test(ts))
      fail(`6: ${file} still reads matchMedia("(prefers-reduced-motion: reduce)") directly`)
  }

  // The native motion module face: reduced.ts anchors + the full re-export set.
  const reduced = await read(`${UI}src/motion/reduced.ts`)
  for (const anchor of [
    'const query = "(prefers-reduced-motion: reduce)"',
    'if (value === "reduce") return true',
    "export const prefersReducedMotion = (): boolean => override() ?? media()?.matches ?? false",
    'attributeFilter: ["data-motion"]',
    "export function observeReducedMotion(listener: () => void): () => void {",
  ]) {
    if (!reduced.includes(anchor)) fail(`6: ui/src/motion/reduced.ts lost the anchor ${JSON.stringify(anchor)}`)
  }
  const index = await read(`${UI}src/motion/index.ts`)
  // old->new (issue #193 re-anchor): the #67-era minimized closure (velocity/slider
  // re-export negative) is absorbed — v2.2.7 vendors the full native module.
  for (const required of ['export * from "./spring"', 'export * from "./loop"', 'export * from "./velocity"', 'export * from "./reduced"', 'export * from "./waapi"', 'export * from "./slider"']) {
    if (!index.includes(required)) fail(`6: ui/src/motion/index.ts lost the native export ${required}`)
  }
  if (index.includes('from "./solid"'))
    fail("6: ui/src/motion/index.ts re-exports ./solid (the pin keeps Solid a separate import)")

  const uiPkg = await read(`${UI}package.json`)
  if (!uiPkg.includes('"./motion": "./src/motion/index.ts",'))
    fail("6: ui package.json lost the ./motion export")
  for (const required of ['"./motion/solid": "./src/motion/solid.ts"', '"./motion-tuning": "./src/motion-tuning.ts"', '"./motion-tuning-features": "./src/motion-tuning-features.ts"', '"./motion-tuning-fields": "./src/motion-tuning-fields.ts"']) {
    if (!uiPkg.includes(required)) fail(`6: ui package.json lost the native motion export ${required}`)
  }
}

// --- 7. Whole-tree whitelist set-equality ---
{
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  const hits = new Set<string>()
  async function scan(dir: string, scope: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        await scan(path, scope)
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

  // The app+ui subscan: the native members narrowed to the two first-party packages.
  const appUi = actual.filter((f) => f.startsWith(APP) || f.startsWith(UI))
  const expectedAppUi = expected.filter((f) => f.startsWith(APP) || f.startsWith(UI))
  if (JSON.stringify(appUi) !== JSON.stringify(expectedAppUi))
    fail(`7: app+ui subscan is not the exact native whitelist subset — got ${JSON.stringify(appUi)}`)
}

// --- 8. Tailwind custom variants + @source roots ---
{
  const tailwind = await read(`${UI}src/styles/tailwind/index.css`)
  if (!tailwind.includes("/* The app resolves its reduce motion setting, including the system preference, into this attribute. */"))
    fail("8: tailwind/index.css lost the upstream variant comment")
  if (!tailwind.includes('@custom-variant motion-reduce (&:where(:root[data-motion="reduce"] *));'))
    fail("8: tailwind/index.css lost the motion-reduce custom variant")
  if (!tailwind.includes('@custom-variant motion-safe (&:where(:root:not([data-motion="reduce"]) *));'))
    fail("8: tailwind/index.css lost the motion-safe custom variant")
  // old->new (issue #193 re-anchor): the v2.2.7 @source roots are native pin content
  // (app/desktop/session-ui/gui-plugins + stories); the stories LINE is absorbed while
  // the stories PACKAGE itself stays unvendored.
  for (const required of [
    '@source "../../../../app/src";',
    '@source "../../../../session-ui/src";',
    '@source "../../../../gui-plugins/src";',
    '@source "../../../../stories";',
  ]) {
    if (!tailwind.includes(required)) fail(`8: tailwind/index.css lost the native @source root ${JSON.stringify(required)}`)
  }
  if (readdirSync(new URL(`${UI}src/../../`, repoRoot).pathname).includes("stories"))
    fail("8: the upstream stories package got vendored (the @source root is pin text, not a vendoring contract)")
  // Issue #103 face, native: the verbatim timeline-width token block. (The #65-era
  // "overrides it below" sentence comment was dropped by the pin — retired anchor.)
  const timelineWidthBlock = [
    "/* With Inter at 14px, after the timeline's 24px side padding, these give about 66 characters per line",
    "   (the classic optimum for scanning prose); the 744px default gives about 105 and 1000px about 144. */",
    ':root[data-timeline-width="focused"] {',
    "  --container-session: 488px;",
    "}",
    "",
    ':root[data-timeline-width="wide"] {',
    "  --container-session: 1000px;",
    "}",
  ].join("\n")
  if (!tailwind.includes(timelineWidthBlock))
    fail("8: tailwind/index.css lost the verbatim timeline-width token block")
}

// --- 9. Search catalog + test face ---
{
  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  // settings-v2-2-7 W5 form (issue #193 re-anchor of the settings-framework-mobile
  // comment): the A2 fields + the mobile(M-035) gate-drop deviation in the three-line
  // registered-deviation comment, NO `available` line.
  const zoomEntry = [
    "  {",
    '    tab: "appearance",',
    '    label: "settings.appearance.row.zoom.title",',
    '    target: "settings-zoom",',
    '    keywords: "scale size text font larger bigger accessibility",',
    '    // mobile(M-035): the upstream gate drops `available: "desktop"` — zoom is web-available',
    "    // on this mobile client (registered deviation, matrix S42 / issue #144; the later",
    '    // appearance-motion-zoom rebase must not re-add the gate).',
    "  },",
  ].join("\n")
  if (!catalog.includes(zoomEntry))
    fail("9: search-catalog.ts zoom entry is not the settings-v2-2-7 W5 form (A2 fields + mobile(M-035) registered-deviation comment, no available line)")
  if (/label: "settings\.appearance\.row\.zoom\.title",\s*\n\s*available: "desktop"/.test(catalog))
    fail("9: search-catalog.ts zoom entry re-added the desktop gate (M-035 deviation)")
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
  // The M-035 "font" face + the v2.2.7 positives. old->new (issue #193 re-anchor): the
  // #65-era not.toContain("settings-zoom") lock retires — the pin's test advertises the
  // zoom target on both platform shapes; the #103/#107-era timeline-width/
  // sounds-interface assertions are gone from the pin's test (the catalog rows themselves
  // are native and pinned by verify-settings-framework group 5).
  if (!searchTest.includes("expect(rankSettings(\"font\", items)).toHaveLength(4)"))
    fail("9: search-results.test.ts 'font' expectation is not the 2-arg length 4")
  if (!searchTest.includes("mobile(M-035)"))
    fail("9: search-results.test.ts lost the mobile(M-035) rationale comment on the length change")
  if (searchTest.includes('not.toContain("settings-zoom")'))
    fail("9: search-results.test.ts carried the not.toContain(\"settings-zoom\") line (the M-035 ruling advertises zoom)")
  if (!searchTest.includes('expect(targets({})).toContain("settings-zoom")'))
    fail("9: search-results.test.ts lost the M-035 zoom-advertised positive")
  if (!searchTest.includes('expect(targets({ desktop: true })).toContain("settings-zoom")'))
    fail("9: search-results.test.ts lost the desktop zoom-advertised positive")
  // The S12 pinch gates: settings-pinch-zoom is desktop-only in search.
  if (!searchTest.includes('expect(targets({})).not.toContain("settings-pinch-zoom")'))
    fail("9: search-results.test.ts lost the S12 pinch-zoom desktop gate (no-desktop negative)")
  if (!searchTest.includes('expect(targets({ desktop: true })).toContain("settings-pinch-zoom")'))
    fail("9: search-results.test.ts lost the S12 pinch-zoom desktop positive")
  if (!searchTest.includes('expect(rankSettings("capsule", items)[0].view).toMatchObject({'))
    fail("9: search-results.test.ts lost the target capsule assertion")
  if (!searchTest.includes('target: "settings-background-activity",'))
    fail("9: search-results.test.ts capsule no longer resolves to settings-background-activity")
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
  // old->new (issue #193 re-anchor): the insertion anchor is interfaceMode.inbox — the
  // interfaceMode.experimental key is absorbed at v2.2.7 (verify-interface-mode
  // negative-pins it).
  const inboxAt = en.indexOf('"settings.general.row.interfaceMode.inbox": "Inbox",')
  const firstAt = en.indexOf('"settings.appearance.row.zoom.title"')
  const lastAt = en.indexOf('"settings.appearance.row.reduceMotion.off"')
  const notificationsAt = en.indexOf('"settings.notifications.description"')
  if (inboxAt < 0 || firstAt < 0 || lastAt < 0 || notificationsAt < 0 ||
      !(inboxAt < firstAt && firstAt < lastAt && lastAt < notificationsAt))
    fail("10: en.ts zoom/reduceMotion block is not between interfaceMode.inbox and the notifications block (v2.2.7 order)")

  for (const locale of ["zh", "zht", "ko", "de", "fr"]) {
    const dict = await read(`${APP}src/runtime/i18n/${locale}.ts`)
    if (dict.includes("reduceMotion") || dict.includes("appearance.row.zoom"))
      fail(`10: ${locale}.ts carries zoom/reduceMotion keys — en-fallback is the registered shape; a translation needs a delta re-registration`)
  }

  // old->new (issue #193 re-anchor): the en base-first merge is the typed spread form.
  const languageFile = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!languageFile.includes("const base: Dictionary = { ...en, ...dict }"))
    fail("10: language.tsx lost the en base-first spread")
}

// --- 11. model.test.ts expectations ---
{
  const test = await read(`${APP}src/settings/model.test.ts`)
  if (!test.includes('        tabLayout: "horizontal",\n        reduceMotion: "system",'))
    fail("11: model.test.ts defaults expectation lacks reduceMotion: system after tabLayout")
  if (!test.includes('      tabLayout: "vertical",\n      reduceMotion: "system",'))
    fail("11: model.test.ts decode expectation lacks reduceMotion: system after tabLayout")
  // old->new (issue #193 re-anchor): the #103-era showFileTree/terminalPlacement
  // "retained deviation" rows are gone from the pin's test — the v2.2.7 schema dropped
  // the keys (verify-experimental-settings negative-pins terminalPlacement in model.tsx);
  // they must NOT come back here.
  for (const row of ["showFileTree", "terminalPlacement"]) {
    if (test.includes(row)) fail(`11: model.test.ts resurrected the dropped ${row} row (v2.2.7 dropped the schema keys)`)
  }
  // settings-experimental rows (native defaults face).
  for (const row of ["newIcons: false,", "foldUserMessages: false,"]) {
    if (!test.includes(row)) fail(`11: model.test.ts lost the settings-experimental defaults row ${row}`)
  }
}

// --- 12. Patch/manifest face ---
{
  const manifest = await read(`${PATCHES}manifest.json`)
  const parsed = JSON.parse(manifest)
  const row = parsed.patches.find((p: { id: string }) => p.id === "appearance-motion-zoom")
  if (!row || !manifest.includes("patches/mobile/appearance-motion-zoom.patch"))
    fail("12: patches/mobile/manifest.json does not register appearance-motion-zoom")
  if (row.status !== "deferred")
    fail(`12: appearance-motion-zoom manifest status is ${row.status}, expected deferred (the v2.2.7 pin absorbed the setting faces; the web/CSS implementation round is #197 direction)`)
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/appearance-motion-zoom.patch"))
    fail("12: vendor-manifest.json does not register appearance-motion-zoom")

  const patch = await read(M035_PATCH)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  const manifestTargets = row.targets as string[]
  if (JSON.stringify([...touched].sort()) !== JSON.stringify([...manifestTargets].sort()))
    fail("12: appearance-motion-zoom patch face does not equal its manifest targets (39 files)")
  if (touched.includes("packages/app/src/runtime/platform/platform.tsx"))
    fail("12: appearance-motion-zoom patch face touches platform.tsx (the type members are native at v2.2.7 — group 5)")
  if (touched.includes("packages/app/src/providers/connect/go-upsell-hero-art.ts"))
    fail("12: appearance-motion-zoom patch face touches go-upsell-hero-art.ts (registered non-converted boundary)")
  if (!touched.includes("packages/app/src/runtime/platform/web.ts"))
    fail("12: appearance-motion-zoom patch face lost web.ts (the deferred implementation rides the patch file for its owner round)")
  // The deferred row retains its full historical face including the search targets (not
  // replayed); the W5 content actually applied comes from ACTIVE settings-v2-2-7.
  for (const historical of ["packages/app/src/settings/search-catalog.ts", "packages/app/src/settings/search-results.test.ts"]) {
    if (!touched.includes(historical))
      fail(`12: appearance-motion-zoom deferred face lost the historical target ${historical} (the deferred row keeps its full face; the applied W5 form is settings-v2-2-7's)`)
  }

  // The active consolidated patch carries the W5 search face.
  const active = parsed.patches.find((p: { id: string }) => p.id === "settings-v2-2-7")
  if (!active || active.status !== "active")
    fail("12: settings-v2-2-7 is not registered active (the W5 M-035 search face has no carrier)")
  const activeTargets = active.targets as string[]
  for (const required of ["packages/app/src/settings/search-catalog.ts", "packages/app/src/settings/search-results.test.ts"]) {
    if (!activeTargets.includes(required))
      fail(`12: settings-v2-2-7 does not carry the W5 target ${required}`)
  }
}

// --- 13. First-party negative ---
{
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        await scan(path)
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
    "1: reduceMotion three-value literal + system default + withFallback + createMediaQuery + verbatim dataset.motion arbiter, backgroundActivity/timelineWidth/interfaceEnabled/tabLayout/mobileTitlebarPosition literals all pin-native (issue #193 re-anchor: the #103/#101 restored-by-patch faces are absorbed); " +
    "2: verbatim zoom/reduceMotion controller blocks, the NATIVE experimental.config.update shell write (issue #193 re-anchor: the pin adopted the experimental config API), the rewritten plugin-migration negative (api.plugin./PluginSettingsSections/usePluginHost/pluginHost write faces stay out of controllers.ts — plugin contribution lives in general.tsx + the extension runtime, settings-v2-2-7 W3); " +
    "3: reduceMotionOptions three items, zoom row Show-gated before reduceMotion row, no sidebarOpen row; " +
    "4: eleven-level Chromium desktopZoomLevels + type, nextDesktopZoomLevel NATIVE (issue #193 re-anchor: the #144 registered rc=1 discharges — the pinch helper is pin content; the S12 mobile contract lives in the group-9 search gates + verify-pinch-shell-settings), DESKTOP_MENU intact; " +
    "5: platform.tsx native optional zoomLevel/setZoomLevel declarations (issue #193 re-anchor: the type members are pin content), web.ts zero zoom tokens (the deferred appearance-motion-zoom web face stays out, #197 direction); " +
    "6: native consumption chain — 30 CSS files / 34 data-motion blocks per-file (no bare @media reduce outside the two registered dual-form files composer-lane/question-prompt), 3 TS consumers on prefersReducedMotion with no bare matchMedia reduce read, reduced.ts query/override/prefersReducedMotion/attributeFilter/observeReducedMotion anchors, motion/index.ts full native re-export set (spring/loop/velocity/reduced/waapi/slider; solid separate — issue #193 re-anchor absorbs the #67 minimized closure), ui package.json ./motion + solid + tuning exports; " +
    "7: whole-tree prefers-reduced-motion file set EXACTLY the fourteen native members {home/sessions/controller.tsx (native bare matchMedia read), go-upsell-hero-art.ts (unconverted boundary), composer-lane.css + question-prompt.css (dual-form), settings/model.tsx (the createMediaQuery mechanism), palette-menu.css + shell/search-list.css + forms/search-list.css + menu-scroll.css + tabs.css + session-compaction.css + project-icon-styles.stories.tsx (unconverted faces), test-browser/motion-dom.test.ts (native browser test), motion/reduced.ts (the mechanism)}; " +
    "8: tailwind comment + two custom variants + the v2.2.7 @source roots (stories line native, stories package unvendored — issue #193 re-anchor absorbs the old no-stories negative), verbatim timeline-width token block; " +
    "9: W5 zoom entry without available line in the settings-v2-2-7 three-comment form + reduceMotion entry after terminalFont, search-results 'font' length 4 with mobile(M-035) comment, zoom advertised on both platform shapes (the not.toContain lock retired), S12 pinch-zoom desktop gates, target capsule -> settings-background-activity (the timeline-width/sounds-interface test assertions retired — catalog rows pinned by verify-settings-framework group 5); " +
    "10: seven en keys between interfaceMode.inbox and notifications block (issue #193 re-anchor), zero keys in zh/zht/ko/de/fr, en base-first typed spread; " +
    "11: both model.test.ts reduceMotion expectations + settings-experimental newIcons/foldUserMessages rows, the dropped showFileTree/terminalPlacement rows kept out (issue #193 re-anchor); " +
    "12: appearance-motion-zoom in BOTH manifests DEFERRED with patch face == manifest targets (39 files), platform.tsx/go-upsell absent, web.ts + the historical search targets carried in the deferred face (not replayed) while the applied W5 form is ACTIVE settings-v2-2-7's; " +
    "13: packages/mobile-hosts zero reduceMotion/prefers-reduced-motion/zoomLevel/opencode-ui-zoom references; " +
    "STATIC check — system-mapping on WebView, first-frame gap, zoom × system font-size (Chromium 41297766), KeyboardInsets and the go-upsell hero boundary are device-QA items registered in docs/build-and-verify.md)",
)
