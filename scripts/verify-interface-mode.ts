// verify-interface-mode.ts — static probe for issue #63 (S04: align the
// Windows v2.2.1 Top / Side / Inbox interface mode).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf… + mobile patch
// M-033), the structural facts the S04 alignment record relies on:
//
//   1. Enum + persistence (settings/model.tsx): appearance.tabLayout carries the
//      three-value literal (horizontal/vertical/inbox) with the upstream
//      experimental comment, the default stays "horizontal", the persisted key
//      stays "settings.v3" and the read path stays withFallback (per-field
//      recovery: a stored unknown literal falls back for THAT field only —
//      runtime/persistence/schema.ts recover() walks the objects AST field by
//      field; fontSize/mono/sans/terminal survive).
//   2. Shell consumer (shell/shell.tsx): the sidebar predicate is
//      tabLayout !== "horizontal" && !mobile() — inbox takes the side rail at
//      desktop widths, narrow screens stay shell-identical for all three modes.
//   3. Settings face (settings/general/): InterfaceModeSetting mounted in the
//      General section (fieldset, radio semantics, settings-tab-layout anchor,
//      Experimental badge, three preview modes top/horizontal side/vertical
//      inbox/inbox); the old TabLayoutSetting select and tabLayoutOptions are
//      gone; TerminalPlacementSetting and ExtensionSettingsSections are still
//      present (cherry-pick boundary — no Plugin rename, no terminal removal).
//   4. Search catalog: the tabs entry became the interfaceMode entry (new label
//      key, target stays settings-tab-layout, v2.2.1 keywords).
//   5. i18n: exactly EIGHT new en keys (nine physical lines —
//      inbox.description wraps), inserted right after the legacy
//      settings.appearance.row.tabs.* block which stays; the sampled locales
//      (zh/zht/ko/de/fr — not a full sweep of every non-en locale) carry ZERO
//      interfaceMode keys and language.tsx merges the en base
//      FIRST, so non-en locales fall back to English (upstream v2.2.1's real
//      shape — registered delta, NOT a missing translation to fix).
//   6. Patch/manifest face: M-033 is registered in BOTH manifests; the patch
//      file touches exactly the seven S04 files; no other registered patch
//      references interface-mode; no vendor source outside the M-033 files
//      mentions interfaceMode (diff face stays M-033-only — the byte-level
//      tree equivalence itself is V3 verify-closure, which must be run
//      alongside this probe).
//   7. First-party negative: packages/mobile-hosts carries ZERO
//      interface-mode/tabLayout references (S04 is vendor-side only).
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static
// STRUCTURE check. It proves source shape, NOT runtime behavior: preview-card
// rendering, radio interaction, narrow-screen stacking, persistence across
// process restarts and the inbox-rail presentation at >=768px are device QA
// items (registered in docs/build-and-verify.md; the inbox grouping delta is
// registered in the alignment docs — no needs-you/done/running groups, no
// cross-server aggregation, no unread badge).
//
// Usage:
//   bun run scripts/verify-interface-mode.ts
// Exit 0 = all assertions PASS.

import { readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-interface-mode: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const HOSTS = "packages/mobile-hosts/"
const PATCHES = "vendor/upstream/patches/mobile/"

// --- 1. Enum + persistence (settings/model.tsx) ---
{
  const model = await read(`${APP}src/settings/model.tsx`)

  // Three-value literal with the upstream v2.2.1 comment, verbatim.
  if (!model.includes('// "inbox" is experimental: the vertical layout with a server-wide session inbox in place of tabs.'))
    fail("1: model.tsx lost the upstream inbox experimental comment")
  if (!model.includes('tabLayout: Schema.Literals(["horizontal", "vertical", "inbox"]),'))
    fail("1: model.tsx tabLayout literal is not the three-value horizontal/vertical/inbox form")

  // Default stays horizontal; persisted key stays settings.v3; read path stays withFallback.
  // mobile(M-035) appended reduceMotion:"system" to the same line (issue #65) — the anchor
  // rides the updated line and still pins the horizontal tabLayout default.
  if (!model.includes('appearance: { fontSize: 14, mono: "", sans: "", terminal: "", tabLayout: "horizontal", reduceMotion: "system" },'))
    fail("1: model.tsx defaultSettings appearance no longer defaults tabLayout to horizontal")
  if (!model.includes('persisted({ key: "settings.v3" }, settingsPersistence, defaultSettings)'))
    fail("1: model.tsx lost the verbatim settings.v3 persisted() anchor")
  if (!model.includes("tabLayout: withFallback(() => store.appearance?.tabLayout, defaultSettings.appearance.tabLayout),"))
    fail("1: model.tsx lost the tabLayout withFallback read path")

  // Per-field recovery contract (F2 wording): the pin recovery walks objects
  // ASTs field by field — an unknown stored literal degrades THAT FIELD ONLY.
  const schema = await read(`${APP}src/runtime/persistence/schema.ts`)
  if (!schema.includes("function recover(ast: SchemaAST.AST, value: unknown, initial: unknown): unknown {"))
    fail("1: persistence/schema.ts lost the recover() entry point")
  if (!schema.includes("ast.propertySignatures.flatMap((field) => {"))
    fail("1: persistence/schema.ts recover() no longer walks propertySignatures per field")
}

// --- 2. Shell consumer (shell/shell.tsx) ---
{
  const shell = await read(`${APP}src/shell/shell.tsx`)
  if (!shell.includes('const verticalTabs = () => preferences.appearance.tabLayout() !== "horizontal" && !mobile()'))
    fail('2: shell.tsx predicate is not the one-line !== "horizontal" && !mobile() form')
  if (/===\s*"vertical"/.test(shell))
    fail("2: shell.tsx still contains a === \"vertical\" tabLayout comparison")
}

// --- 3. Settings face (settings/general/) ---
{
  const general = await read(`${APP}src/settings/general/general.tsx`)
  const component = await read(`${APP}src/settings/general/interface-mode.tsx`)

  // Cherry-pick boundary: the four adopted hunks and nothing else.
  if (!general.includes('import { InterfaceModeSetting } from "./interface-mode"'))
    fail("3: general.tsx lost the InterfaceModeSetting import")
  if (general.includes("tabLayoutOptions"))
    fail("3: general.tsx still carries the tabLayoutOptions constant")
  if (general.includes("TabLayoutSetting"))
    fail("3: general.tsx still references the removed TabLayoutSetting component")

  // Negative boundary (plan risk table + review F3): the v2.2.1 companions that
  // belong to OTHER matrix rows must NOT have been carried in.
  if (!general.includes("const TerminalPlacementSetting: Component = () => {"))
    fail("3: general.tsx lost TerminalPlacementSetting (S37 domain — must stay per pin)")
  // Issue #67: the Plugin* naming pipeline (§6.B.5) renames the sections import; the S11/S04
  // negatives keep their scope (BackgroundActivity/TimelineWidth stay out).
  if (!general.includes('import { PluginSettingsSections } from "@/runtime/plugin/settings-page-view"'))
    fail("3: general.tsx lost the PluginSettingsSections import (issue #67 rename)")
  if (general.includes("BackgroundActivitySetting") || general.includes("TimelineWidthSetting"))
    fail("3: general.tsx adopted v2.2.1 rows outside S04 (S11 settings)")

  // Mount position: h3 → <InterfaceModeSetting /> → <SettingsList> → LanguageSetting.
  const h3 = general.indexOf('settings-section-title">{language.t("settings.general.section.general")}')
  const mount = general.indexOf("<InterfaceModeSetting />")
  const list = general.indexOf("<SettingsList>")
  const language = general.indexOf("<LanguageSetting />")
  if (h3 < 0 || mount < 0 || list < 0 || language < 0 || !(h3 < mount && mount < list && list < language))
    fail("3: general.tsx InterfaceModeSetting is not mounted between the General h3 and the settings list head")

  // Component shape: three modes in order, radio fieldset, same anchor, badge.
  const modesBlock = /const modes = \[\s*\n\s*\{ id: "top", layout: "horizontal" \},\s*\n\s*\{ id: "side", layout: "vertical" \},\s*\n\s*\{ id: "inbox", layout: "inbox" \},\s*\n\] as const satisfies/
  if (!modesBlock.test(component))
    fail('3: interface-mode.tsx modes are not exactly top/horizontal, side/vertical, inbox/inbox in order')
  for (const anchor of [
    '<fieldset data-component="interface-mode" data-action="settings-tab-layout">',
    'settings.general.row.interfaceMode.experimental',
    'type="radio"',
    'data-slot="interface-mode-preview"',
    'settings.general.row.interfaceMode.${mode.id}',
    'settings.general.row.interfaceMode.${mode.id}.description',
  ]) {
    if (!component.includes(anchor)) fail(`3: interface-mode.tsx lost the anchor ${anchor}`)
  }

  // CSS exists and carries the adaptive grid + component root.
  const css = await read(`${APP}src/settings/general/interface-mode.css`)
  if (!css.includes('[data-component="interface-mode"]')) fail("3: interface-mode.css lost the component root")
  if (!css.includes("repeat(auto-fit, minmax(220px, 1fr))")) fail("3: interface-mode.css lost the adaptive preview grid")

  // The legacy tabs i18n keys stay (v2.2.1 keeps them too).
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  for (const legacy of ["settings.appearance.row.tabs.title", "settings.appearance.row.tabs.vertical"]) {
    if (!en.includes(legacy)) fail(`3: en.ts lost the legacy ${legacy} key (v2.2.1 keeps it)`)
  }
}

// --- 4. Search catalog ---
{
  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  const entry = /tab: "general",\s*\n\s*label: "settings\.general\.row\.interfaceMode\.title",\s*\n\s*target: "settings-tab-layout",\s*\n\s*keywords: "top side tabs inbox sidebar mode layout vertical horizontal focus pro",/
  if (!entry.test(catalog))
    fail("4: search-catalog.ts lost the interfaceMode entry (label/target/keywords must match v2.2.1, target stays settings-tab-layout)")
}

// --- 5. i18n: eight keys, nine lines, en-only with base-first fallback ---
{
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  // F1: EIGHT keys asserted one by one; inbox.description spans two physical lines.
  const keys = [
    '"settings.general.row.interfaceMode.title": "Interface",',
    '"settings.general.row.interfaceMode.top": "Top tabs",',
    '"settings.general.row.interfaceMode.top.description": "Browser-style tabs across the top of the window.",',
    '"settings.general.row.interfaceMode.side": "Side tabs",',
    '"settings.general.row.interfaceMode.side.description": "Browser-style tabs in a sidebar.",',
    '"settings.general.row.interfaceMode.inbox": "Inbox",',
    '"settings.general.row.interfaceMode.inbox.description":\n    "Every session across your servers, sorted by what needs you next.",',
    '"settings.general.row.interfaceMode.experimental": "Experimental",',
  ]
  for (const key of keys) {
    if (!en.includes(key)) fail(`5: en.ts lost or reshaped the key ${key.split(":")[0]}`)
  }

  // Insertion point: directly after the legacy tabs.vertical key and before the
  // notifications block (v2.2.1 keeps the legacy block adjacent).
  const verticalAt = en.indexOf('"settings.appearance.row.tabs.vertical": "Vertical",')
  const first = en.indexOf('"settings.general.row.interfaceMode.title"')
  const last = en.indexOf('"settings.general.row.interfaceMode.experimental"')
  const notifications = en.indexOf('"settings.notifications.description"')
  if (verticalAt < 0 || first < 0 || last < 0 || notifications < 0 || !(verticalAt < first && first < last && last < notifications))
    fail("5: en.ts interfaceMode block is not inserted between tabs.vertical and the notifications block")

  // zh (and every other locale) stays key-free — the registered fallback delta.
  const locales = ["zh", "zht", "ko", "de", "fr"]
  for (const locale of locales) {
    const dict = await read(`${APP}src/runtime/i18n/${locale}.ts`)
    if (dict.includes("interfaceMode"))
      fail(`5: ${locale}.ts carries interfaceMode keys — v2.2.1 keeps those locales en-fallback; a translation would be a project-local addition needing a delta re-registration`)
  }

  // The fallback chain itself: en base is spread FIRST in language.tsx.
  const languageFile = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!languageFile.includes("const base = flatten({ ...en, ...dict })"))
    fail("5: language.tsx lost the en base-first flatten")
  if (!languageFile.includes("{ ...base, ...flatten({ ...a.dict, ...b.dict }) }"))
    fail("5: language.tsx merge no longer spreads the en base before the locale dict")
}

// --- 6. Patch/manifest face ---
{
  // Both manifests register M-033.
  const manifest = await read(`${PATCHES}manifest.json`)
  if (!manifest.includes('"id": "M-033"') || !manifest.includes("patches/mobile/0033-M-033-interface-mode-setting.patch"))
    fail("6: patches/mobile/manifest.json does not register M-033")
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/0033-M-033-interface-mode-setting.patch"))
    fail("6: vendor-manifest.json does not register M-033 (verify-closure reads only this list)")

  // The patch file touches exactly the seven S04 files.
  const patch = await read(`${PATCHES}0033-M-033-interface-mode-setting.patch`)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  const expected = [
    "packages/app/src/runtime/i18n/en.ts",
    "packages/app/src/settings/general/general.tsx",
    "packages/app/src/settings/general/interface-mode.css",
    "packages/app/src/settings/general/interface-mode.tsx",
    "packages/app/src/settings/model.tsx",
    "packages/app/src/settings/search-catalog.ts",
    "packages/app/src/shell/shell.tsx",
  ]
  if (JSON.stringify([...touched].sort()) !== JSON.stringify(expected))
    fail(`6: M-033 patch face drifted: ${JSON.stringify(touched)} (expected exactly the seven S04 files)`)

  // No other registered patch carries interface-mode content. mobile(M-035) is exempted
  // on the patch-FILE scan only: its en.ts hunk context legitimately contains the
  // interfaceMode.experimental key line (the M-035 seven keys insert directly after it,
  // issue #65) — its diff face touches zero interface-mode files (asserted in
  // verify-appearance-settings group 12).
  // Issue #67: M-037 joins the exemption (its consumer-token hunks legitimately carry
  // `interfaceMode` context lines in settings/general surface files — same precedent as
  // the M-033/M-035 exemptions; its diff face touches zero interface-mode files).
  for (const name of readdirSync(join(repoRoot.pathname, PATCHES))) {
    if (!name.endsWith(".patch") || name.startsWith("0033-") || name.startsWith("0035-") || name.startsWith("0037-")) continue
    const content = await read(`${PATCHES}${name}`)
    if (content.includes("interface-mode") || content.includes("interfaceMode"))
      fail(`6: ${name} unexpectedly references interface-mode (only M-033 may)`)
  }

  // Diff face: no vendor source outside the M-033 files mentions the new face.
  // (Byte-level tree equivalence == pin + registered patches is V3
  // verify-closure's job and must be run alongside this probe.)
  const tokens = ["interfaceMode", "interface-mode"]
  const m033Files = new Set([
    `${APP}src/settings/general/general.tsx`,
    `${APP}src/settings/general/interface-mode.tsx`,
    `${APP}src/settings/general/interface-mode.css`,
    `${APP}src/settings/search-catalog.ts`,
    `${APP}src/runtime/i18n/en.ts`,
  ])
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path)
        continue
      }
      if (m033Files.has(path.replace(`${repoRoot.pathname}`, ""))) continue
      const isText = /\.(ts|tsx|css|js|jsx|json|md|html|svg|txt)$/.test(entry.name)
      if (!isText) continue
      const content = await Bun.file(path).text()
      for (const token of tokens) {
        if (content.includes(token))
          fail(`6: ${path.replace(repoRoot.pathname, "")} mentions ${token} outside the M-033 file set`)
      }
    }
  }
  await scan(`${repoRoot.pathname}vendor/upstream/packages`)
}

// --- 7. First-party negative (packages/mobile-hosts stays untouched) ---
{
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path)
        continue
      }
      if (!/\.(ts|tsx|css|js|jsx|json)$/.test(entry.name)) continue
      const content = await Bun.file(path).text()
      if (content.includes("interfaceMode") || content.includes("interface-mode") || content.includes("tabLayout"))
        fail(`7: first-party ${path.replace(repoRoot.pathname, "")} references the interface mode face (S04 is vendor-side only)`)
    }
  }
  await scan(`${repoRoot.pathname}${HOSTS}src`)
  await scan(`${repoRoot.pathname}${HOSTS}test`)
}

console.log(
  "verify-interface-mode: PASS (" +
    "1: tabLayout three-value literal + upstream comment, default horizontal, settings.v3 verbatim, withFallback read path + per-field recover() contract; " +
    "2: shell predicate !== \"horizontal\" && !mobile() one-liner, no === \"vertical\" remnant; " +
    "3: InterfaceModeSetting mounted h3→fieldset→list, modes exactly top/side/inbox, radio+anchor+experimental badge, adaptive grid CSS, TabLayoutSetting/tabLayoutOptions removed, TerminalPlacementSetting + ExtensionSettingsSections kept (no Plugin rename, no S11 rows); " +
    "4: search-catalog interfaceMode entry with settings-tab-layout target and v2.2.1 keywords; " +
    "5: EIGHT en keys (nine lines) one-by-one after the kept legacy tabs block, zero interfaceMode keys in zh/zht/ko/de/fr, language.tsx base-first merge fallback chain; " +
    "6: M-033 in BOTH manifests, patch face exactly the seven S04 files, no other patch references interface-mode, zero interfaceMode tokens in vendor sources outside the M-033 set (byte equivalence is V3's job); " +
    "7: packages/mobile-hosts zero interface-mode/tabLayout references; " +
    "STATIC check - preview rendering, radio interaction, narrow-screen stacking, restart persistence and the inbox-rail (no grouping/aggregation/badge) presentation are device-QA items registered in docs/build-and-verify.md)",
)
