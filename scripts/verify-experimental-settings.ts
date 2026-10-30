// verify-experimental-settings.ts — static probe for issue #64 (S38: expose
// the experimental settings entry — new icons, folded long user messages).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf… + mobile patch
// M-034), the structural facts the S38 alignment record relies on:
//
//   1. Entry face (settings/experimental/experimental.tsx): the flag flips to
//      true exactly as in v2.2.1 (which has NO platform gate) and the tab body
//      presents the two switches verbatim (New icons / Fold long messages,
//      data-action anchors, Switch bound to settings.general accessors).
//   2. Gates untouched (settings/shell.tsx): the :309 bounce guard and the
//      :362 nav-grouping conditional are byte-identical to pin — both read the
//      constant alone, so flipping the constant IS the upstream wiring;
//      pages.ts still registers the flask icon and the tab label.
//   3. Settings model (settings/model.tsx): only the S38 sub-hunks landed —
//      the two schema fields with their upstream comments, the false defaults,
//      the withFallback readers, the module-level setNewIcons effect and the
//      four accessors. Negative boundary: v2.2.1's S11 companions
//      (backgroundActivity/timelineWidth/sidebarOpen) are absent — reduceMotion removed
//      from this list by M-035's rebase round (issue #65): the appearance.reduceMotion
//      three-state face is a REGISTERED S17 delta (deliberate, NOT a bypass — group 3
//      keeps the other three S11 tokens and the showFileTree/terminalPlacement anchors),
//      showFileTree is still Schema.Boolean and terminalPlacement still exists.
//   4. Test sync (settings/model.test.ts): the defaults full-object assertion
//      carries the two new lines (without them the upstream subset fails);
//      negative boundary keeps showFileTree/terminalPlacement lines and the
//      original test name (no "extensions→plugins" rename adopted).
//   5. Fold chain surgery: message-timeline feeds
//      settings.general.foldUserMessages into the row renderer; the row call
//      site passes fold + the disclosure-backed expanded/onExpandedChange
//      (user-expanded:<id> keys, state survives row recycling); current-message
//      forwards the three props; message-content carries the whole fold slice
//      (USER_MESSAGE_FOLD { over: 12, show: 8 }, hard-break floor + ResizeObserver
//      measure, max-height 8lh, aria-expanded/aria-controls toggle, scroll flip
//      preservation via scrollParent/viewportTop). Negative boundary: NONE of
//      the v2.2.1 timeline-rewrite content (user-runs run={joined()},
//      sources chip, plugin migration, quote family, link segments) leaked in.
//   6. New icons chain: new-icons.ts is the verbatim 42-artwork/70-replacement
//      table and every replacement key is a real catalog name (pin primary ∪
//      additional ∪ the two adopted keys minus/outline-chevron-right — the two
//      catalog entries exist precisely because the Partial<Record<IconName,…>>
//      needs them); icon.tsx gained the module-level signal + setNewIcons
//      export, the dual-symbol sprite (opencode-v2-icon-new-*), the functional
//      pixelSize (new artwork stays 16px where small shrinks to 14) and the
//      next()-switched viewBox/use href. Catalog negative boundary: sidebar-right
//      stays, all FIFTEEN other v2.2.1 additions stay out, and the pin trash /
//      copy artwork bodies are still verbatim (the v2.2.1 body rewrites — the
//      "graduated" new-icons defaults — must NOT land, or the experiment would
//      have no visible delta).
//   7. Fold CSS: the two selector blocks carved out of the v2.2.1 mega-hunk
//      (@@ -177,45 +188,106) are present (overflow clip, unicode-bidi plaintext,
//      folded mask fade, toggle styling) and the rewrite companions
//      (data-run-folded corners, run actions, user-message-link) are absent.
//   8. i18n: exactly SIX new en keys (app 4 + ui 2 — the ui package joins the
//      mobile patch chain for the first time); zh (and the sampled locales)
//      stay key-free; the fallback chain anchors are verbatim on both sides
//      (app language.tsx en-base-first flatten; ui context/i18n.tsx
//      en[key] ?? String(key)) — upstream v2.2.1's real shape, a registered
//      delta, NOT a missing translation.
//   9. Patch/manifest face: M-034 is registered in BOTH manifests; the patch
//      file touches exactly the fourteen S38 files (app 6 + session-ui 4 + ui 4);
//      no other registered patch references the S38 tokens; no vendor source
//      outside the M-034 files mentions them (byte-level tree equivalence is
//      V3 verify-closure's job and must be run alongside this probe).
//  10. First-party negative: packages/mobile-hosts carries ZERO
//      newIcons/foldUserMessages/experimental references (S38 is vendor-side).
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static
// STRUCTURE check. It proves source shape, NOT runtime behavior: the switches
// actually flipping the experiments, the sprite swap, the 8-line fold with the
// Read more toggle, the disclosure survival across row recycling, the lh-unit
// behavior on the device WebView and settings.v3 persistence across process
// restarts are device QA items (registered in docs/build-and-verify.md).
//
// Usage:
//   bun run scripts/verify-experimental-settings.ts
// Exit 0 = all assertions PASS.

import { readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-experimental-settings: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const UI = "vendor/upstream/packages/ui/"
const SUI = "vendor/upstream/packages/session-ui/"
const HOSTS = "packages/mobile-hosts/"
const PATCHES = "vendor/upstream/patches/mobile/"

// --- 1. Entry face (settings/experimental/experimental.tsx) ---
{
  const file = await read(`${APP}src/settings/experimental/experimental.tsx`)

  if (!file.includes("export const experimentalSettingsAvailable = true"))
    fail("1: experimentalSettingsAvailable is not flipped to true (v2.2.1 verbatim — no platform gate exists upstream)")

  // The two rows, verbatim keys and anchors.
  for (const anchor of [
    'title={language.t("settings.experimental.row.newIcons.title")}',
    'description={language.t("settings.experimental.row.newIcons.description")}',
    '<div data-action="settings-new-icons">',
    'title={language.t("settings.experimental.row.foldUserMessages.title")}',
    'description={language.t("settings.experimental.row.foldUserMessages.description")}',
    '<div data-action="settings-fold-user-messages">',
  ]) {
    if (!file.includes(anchor)) fail(`1: experimental.tsx lost the anchor ${anchor}`)
  }

  // Switch bindings to the settings.general accessors.
  for (const binding of [
    "checked={settings.general.newIcons()}",
    "onChange={(checked) => settings.general.setNewIcons(checked)}",
    "checked={settings.general.foldUserMessages()}",
    "onChange={(checked) => settings.general.setFoldUserMessages(checked)}",
  ]) {
    if (!file.includes(binding)) fail(`1: experimental.tsx lost the Switch binding ${binding}`)
  }
}

// --- 2. Gates untouched (settings/shell.tsx, settings/pages.ts) ---
{
  const shell = await read(`${APP}src/settings/shell.tsx`)

  // Pin's bounce guard and nav grouping, byte-for-byte: flipping the constant
  // is the whole upstream wiring, so any edit here would be a divergence.
  if (!shell.includes('if (view.tab === "experimental" && !experimentalSettingsAvailable) surface.open("general")'))
    fail("2: shell.tsx :309 bounce guard is not the pin-verbatim line")
  if (!shell.includes("...(experimentalSettingsAvailable")) fail("2: shell.tsx :362 nav grouping conditional is not the pin-verbatim line")

  const pages = await read(`${APP}src/settings/pages.ts`)
  if (!pages.includes('experimental: "flask",')) fail("2: pages.ts lost the flask icon registration")
  if (!pages.includes('experimental: "settings.tab.experimental",')) fail("2: pages.ts lost the experimental tab label registration")
}

// --- 3. Settings model (settings/model.tsx) ---
{
  const model = await read(`${APP}src/settings/model.tsx`)

  if (!model.includes('import { setNewIcons } from "@opencode/ui/icon"'))
    fail("3: model.tsx lost the setNewIcons import from @opencode/ui/icon")

  // Schema fields with the upstream comments, before mobileTitlebarPosition.
  for (const anchor of [
    '  // The "New icons" design experiment, off until it ships.\n  newIcons: Schema.Boolean,',
    '  // The "Fold long messages" experiment, off until it ships.\n  foldUserMessages: Schema.Boolean,',
  ]) {
    if (!model.includes(anchor)) fail(`3: model.tsx lost the schema anchor ${JSON.stringify(anchor.slice(0, 60))}`)
  }

  // Defaults are false.
  if (!model.includes("    newIcons: false,\n    foldUserMessages: false,\n    mobileTitlebarPosition: \"top\","))
    fail("3: model.tsx defaults no longer carry newIcons: false / foldUserMessages: false before mobileTitlebarPosition")

  // Effect pushes the experiment to the Icon renderer layer.
  if (!model.includes("const newIcons = withFallback(() => store.general?.newIcons, defaultSettings.general.newIcons)"))
    fail("3: model.tsx lost the newIcons withFallback read path")
  if (!model.includes("createEffect(() => setNewIcons(newIcons()))"))
    fail("3: model.tsx lost the createEffect pushing setNewIcons")
  if (!model.includes("foldUserMessages: withFallback(() => store.general?.foldUserMessages, defaultSettings.general.foldUserMessages),"))
    fail("3: model.tsx lost the foldUserMessages withFallback read path")

  // Accessors.
  for (const accessor of [
    "        newIcons,\n        setNewIcons(value: boolean) {\n          setStore(\"general\", \"newIcons\", value)\n        },",
    "        setFoldUserMessages(value: boolean) {\n          setStore(\"general\", \"foldUserMessages\", value)\n        },",
  ]) {
    if (!model.includes(accessor)) fail("3: model.tsx lost the newIcons/foldUserMessages accessors")
  }

  // Negative boundary: S11 companions must not have been carried in.
  // mobile(M-035 rebase round, issue #65): "reduceMotion" removed — the S17 face now
  // legitimately lives in model.tsx (registered delta); the other three stay.
  for (const token of ["backgroundActivity", "timelineWidth", "sidebarOpen"]) {
    if (model.includes(token)) fail(`3: model.tsx adopted v2.2.1 content outside S38 (${token})`)
  }
  // Pin anchors survive: the retired-preference shape is unchanged.
  if (!model.includes("  showFileTree: Schema.Boolean,")) fail("3: model.tsx showFileTree is no longer Schema.Boolean (S38 must not adopt the Persistence.optional retirement)")
  if (!model.includes('  terminalPlacement: Schema.Literals(["side", "bottom"]),')) fail("3: model.tsx lost terminalPlacement (retirement belongs to another matrix row)")
}

// --- 4. Test sync (settings/model.test.ts) ---
{
  const test = await read(`${APP}src/settings/model.test.ts`)

  if (!test.includes("        newIcons: false,\n        foldUserMessages: false,"))
    fail("4: model.test.ts defaults assertion does not carry the two new lines (upstream subset would fail)")

  // Negative boundary: the pin-only lines and the original test name stay.
  if (!test.includes("        showFileTree: false,")) fail("4: model.test.ts lost the pin showFileTree: false line")
  if (!test.includes('        terminalPlacement: "side",')) fail("4: model.test.ts lost the pin terminalPlacement line")
  if (!test.includes('test("keeps the values extensions copy out once and discards retired preferences"'))
    fail("4: model.test.ts test name was renamed (the extensions→plugins rename belongs to another matrix row)")
}

// --- 5. Fold chain surgery (message-timeline → row → current → content) ---
{
  const timeline = await read(`${APP}src/session/timeline/message-timeline.tsx`)
  if (!timeline.includes('import { useSettings } from "@/settings/model"')) fail("5: message-timeline.tsx lost the useSettings import")
  if (!timeline.includes("const settings = useSettings()")) fail("5: message-timeline.tsx lost the settings accessor")
  if (!timeline.includes("    foldUserMessages: settings.general.foldUserMessages,\n"))
    fail("5: message-timeline.tsx does not feed settings.general.foldUserMessages into the row renderer")
  if (timeline.includes("PluginSlot")) fail("5: message-timeline.tsx adopted the plugin migration (not S38)")

  const row = await read(`${SUI}src/timeline/session-timeline-row.tsx`)
  if (!row.includes("  foldUserMessages?: Accessor<boolean>")) fail("5: session-timeline-row.tsx input lost foldUserMessages")
  for (const anchor of [
    "                      fold={input.foldUserMessages?.()}",
    "                      expanded={input.disclosure.value(`user-expanded:${message().id}`)}",
    "                      onExpandedChange={(open) => input.disclosure.set(`user-expanded:${message().id}`, open)}",
  ]) {
    if (!row.includes(anchor)) fail(`5: session-timeline-row.tsx lost the anchor ${anchor.trim()}`)
  }
  if (row.includes("run={joined()}")) fail("5: session-timeline-row.tsx adopted the user-runs run={joined()} (not S38)")

  const current = await read(`${SUI}src/message/current-message.tsx`)
  for (const anchor of [
    "  fold?: boolean\n  expanded?: boolean\n  onExpandedChange?: (expanded: boolean) => void",
    "      fold={props.fold}\n      expanded={props.expanded}\n      onExpandedChange={props.onExpandedChange}",
  ]) {
    if (!current.includes(anchor)) fail("5: current-message.tsx lost the fold prop plumbing")
  }
  if (current.includes("run?") || current.includes("run={props.run}")) fail("5: current-message.tsx adopted the run prop (not S38)")

  const content = await read(`${SUI}src/message/message-content.tsx`)
  // The fold slice, verbatim anchors.
  for (const anchor of [
    "const USER_MESSAGE_FOLD = { over: 12, show: 8 }",
    "function UserMessageFold(props: {",
    "function viewportTop(scroller: Element) {",
    "function scrollParent(element: HTMLElement) {",
    "  onMount,\n",
    "    if (!content?.isConnected || content.offsetHeight === 0) return",
    "    const observer = new ResizeObserver(measure)",
    'style={{ "max-height": folded() ? `${USER_MESSAGE_FOLD.show}lh` : undefined }}',
    "aria-expanded={props.expanded}",
    "aria-controls={props.id}",
    'props.expanded ? i18n.t("ui.message.showLess") : i18n.t("ui.message.readMore")',
    "<Icon name=\"chevron-down\" size=\"small\" />",
  ]) {
    if (!content.includes(anchor)) fail(`5: message-content.tsx lost the fold anchor ${anchor.trim().slice(0, 60)}`)
  }
  // props + store + fallback pair + Show wrapper.
  for (const anchor of [
    "  /** Folds a long message to its first lines with a Read more toggle. Omitted, the message always shows in full. */\n  fold?: boolean",
    "  /** Whether a folded message is open. The timeline owns it so it survives row recycling. */\n  expanded?: boolean",
    "  const expanded = () => props.expanded ?? state.expanded",
    "    if (props.onExpandedChange) return props.onExpandedChange(value)\n    setState(\"expanded\", value)",
    "            <Show\n              when={props.fold}",
    "              <UserMessageFold\n                id={`${props.message.id}-text`}",
  ]) {
    if (!content.includes(anchor)) fail(`5: message-content.tsx lost the plumbing anchor ${anchor.trim().slice(0, 60)}`)
  }
  // Negative boundary: rewrite content must not leak.
  for (const token of ["useSources", "SourcesChip", "linkSegments", "UserRun", "run?: UserRun", "commentCardTarget", "quoteTooltip", "springStyle", "userRunSpring", "agentLabel", "useNow"]) {
    if (content.includes(token)) fail(`5: message-content.tsx adopted v2.2.1 rewrite content outside S38 (${token})`)
  }
}

// --- 6. New icons chain (ui: new-icons.ts, icon.tsx, catalog.ts) ---
{
  const newIcons = await read(`${UI}src/icons/new-icons.ts`)

  // Table shape: 42 new artwork bodies, 70 replacements.
  const artwork = newIcons.match(/const newIcons = \{([\s\S]*?)\n\}/)
  const replacements = newIcons.match(
    /const replacements: Partial<Record<IconName, \{ name: NewIconName; rotate\?: number \}>> = \{([\s\S]*?)\n\}/,
  )
  if (!artwork || !replacements) fail("6: new-icons.ts lost the verbatim table shape (newIcons / replacements declarations)")
  const artworkNames = [...(artwork?.[1].matchAll(/^\s*"?([\w-]+)"?: `/gm) ?? [])].map((m) => m[1])
  const replacementKeys = [...(replacements?.[1].matchAll(/^\s*"?([\w-]+)"?: \{ name:/gm) ?? [])].map((m) => m[1])
  if (artworkNames.length !== 42) fail(`6: new-icons.ts artwork count is ${artworkNames.length}, expected the verbatim 42`)
  if (replacementKeys.length !== 70) fail(`6: new-icons.ts replacement count is ${replacementKeys.length}, expected the verbatim 70`)

  // Every replacement key must be a real catalog name (primary ∪ additional ∪ the two adopted keys).
  const catalog = await read(`${UI}src/icons/catalog.ts`)
  const primary = [...catalog.matchAll(/^(?:  )"?([\w-]+)"?: \{$/gm)].map((m) => m[1])
  const additionalSrc = await read(`${UI}src/icons/icon/additional-icons.ts`)
  const additional = [...additionalSrc.matchAll(/^(?:  )"?([\w-]+)"?: `|^(?:  )"?([\w-]+)"?: \{/gm)].map((m) => m[1] ?? m[2])
  const known = new Set([...primary, ...additional, "minus", "outline-chevron-right"])
  for (const key of replacementKeys) {
    if (!known.has(key)) fail(`6: replacement key "${key}" is not a catalog name (primary ∪ additional ∪ {minus, outline-chevron-right})`)
  }

  // icon.tsx: signal + exports + dual sprite + pixelSize function + viewBox/use switch.
  const icon = await read(`${UI}src/icons/icon/icon.tsx`)
  for (const anchor of [
    'import { createSignal, onMount, type ComponentProps, splitProps } from "solid-js"',
    'import { getNewIcon, newIconViewBox } from "../new-icons"',
    'const newSymbol = (name: IconName) => `opencode-v2-icon-new-${name}`',
    "const [newIconsEnabled, setNewIconsEnabled] = createSignal(false)",
    "export function setNewIcons(enabled: boolean) {\n  setNewIconsEnabled(enabled)\n}",
    "export const newIcons = newIconsEnabled",
    "      const next = getNewIcon(name)",
    'return next ? `${current}<symbol id="${newSymbol(name)}" viewBox="${newIconViewBox}">${next}</symbol>` : current',
    "  const next = () => newIconsEnabled() && getNewIcon(iconName()) !== undefined",
    "  const pixelSize = () => (split.size === \"large\" ? 20 : split.size === \"small\" && !next() ? 14 : 16)",
    '        iconName() === "outline-chevron-right" ||',
    "      viewBox={next() ? newIconViewBox : icon().viewBox}",
    "      <use href={`#${next() ? newSymbol(iconName()) : symbol(iconName())}`} />",
  ]) {
    if (!icon.includes(anchor)) fail(`6: icon.tsx lost the anchor ${anchor.trim().slice(0, 60)}`)
  }

  // catalog.ts: the two adopted entries, sidebar-right retained, 15 rejections, artwork locks.
  for (const adopted of ["  minus: {", '  "outline-chevron-right": {']) {
    if (!catalog.includes(adopted)) fail(`6: catalog.ts lost the adopted entry ${adopted.trim()}`)
  }
  if (!catalog.includes('  "sidebar-right": {'))
    fail("6: catalog.ts lost sidebar-right (the v2.2.1 deletion must NOT be adopted — pin keeps the icon)")

  // MINOR-1: all FIFTEEN rejected v2.2.1 additions stay out (17 additions − 2 adopted).
  const rejected = [
    "outline-magnifier-minus",
    "outline-magnifier-plus",
    "outline-expand",
    "outline-code-brackets",
    "outline-quote",
    "outline-steer",
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
    const asEntry = new RegExp(`^  "?${name}"?: \\{`, "m")
    if (asEntry.test(catalog)) fail(`6: catalog.ts adopted the rejected v2.2.1 icon "${name}"`)
  }

  // Artwork locks: pin trash/copy bodies must remain verbatim (v2.2.1 rewrote
  // them as the "graduated" new-icons defaults — adopting that would erase the
  // experiment's visible delta).
  if (!catalog.includes("M2.44434 4.22224H13.5554M5.99994 4.22224V2.44446"))
    fail("6: catalog.ts outline-trash body is no longer the pin artwork (v2.2.1's rewrite leaked in)")
  if (!catalog.includes("M4.14908 11.0081H1.76282V1.51758H9.1038V2.55588"))
    fail("6: catalog.ts outline-copy body is no longer the pin artwork (v2.2.1's rewrite leaked in)")
  // And the rewritten bodies are exactly what the experiment maps TO.
  if (!newIcons.includes("M5.5 4.5H2.5L4 14.5H12L13.5 4.5H10.5")) fail("6: new-icons.ts trash artwork lost the v2.2.1 new body")
  if (!newIcons.includes('copy: `<path d="M9.5 3.5V1.5H1.5V10.5H4.5"')) fail("6: new-icons.ts copy artwork lost the v2.2.1 new body")
}

// --- 7. Fold CSS (message-part.css) ---
{
  const css = await read(`${SUI}src/components/message-part.css`)

  for (const anchor of [
    '  [data-slot="user-message-fold"] {\n    overflow: hidden;',
    "      unicode-bidi: plaintext;",
    "      mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent);",
    '  [data-slot="user-message-fold-toggle"] {',
    '    &[aria-expanded="true"] [data-slot="icon-svg"] {\n      transform: rotate(180deg);\n    }',
    "    color: var(--v2-text-text-muted);",
  ]) {
    if (!css.includes(anchor)) fail(`7: message-part.css lost the fold CSS anchor ${anchor.trim().slice(0, 50)}`)
  }
  // Negative boundary: the rewrite companions stay out.
  for (const token of ["data-run-folded", "user-message-run-actions", "user-message-link", "border-start-end-radius"]) {
    if (css.includes(token)) fail(`7: message-part.css adopted v2.2.1 rewrite CSS outside S38 (${token})`)
  }
}

// --- 8. i18n: six en keys, en-only fallback on both packages ---
{
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  for (const key of [
    '  "settings.experimental.row.newIcons.title": "New icons",',
    '  "settings.experimental.row.newIcons.description": "Preview the updated icon set",',
    '  "settings.experimental.row.foldUserMessages.title": "Fold long messages",',
    '  "settings.experimental.row.foldUserMessages.description": "Fold your messages past 12 lines behind a Read more button",',
  ]) {
    if (!en.includes(key)) fail(`8: app en.ts lost or reshaped ${key.split(":")[0].trim()}`)
  }
  // Insertion point: right after settings.experimental.description.
  const description = en.indexOf('"settings.experimental.description": "Try experimental features",')
  const first = en.indexOf('"settings.experimental.row.newIcons.title"')
  const last = en.indexOf('"settings.experimental.row.foldUserMessages.description"')
  if (description < 0 || first < 0 || last < 0 || !(description < first && first < last))
    fail("8: app en.ts experimental rows are not inserted right after settings.experimental.description")

  const uiEn = await read(`${UI}src/i18n/en.ts`)
  for (const key of ['  "ui.message.readMore": "Read more",', '  "ui.message.showLess": "Show less",']) {
    if (!uiEn.includes(key)) fail(`8: ui en.ts lost or reshaped ${key.split(":")[0].trim()}`)
  }
  const collapse = uiEn.indexOf('"ui.message.collapse": "Collapse message",')
  const readMore = uiEn.indexOf('"ui.message.readMore"')
  const showLess = uiEn.indexOf('"ui.message.showLess"')
  if (collapse < 0 || readMore < 0 || showLess < 0 || !(collapse < readMore && readMore < showLess))
    fail("8: ui en.ts readMore/showLess are not inserted right after ui.message.collapse")

  // zh (and sampled locales) stay key-free — the registered en-fallback delta.
  for (const locale of ["zh", "zht", "ko", "de", "fr"]) {
    const appDict = await read(`${APP}src/runtime/i18n/${locale}.ts`)
    if (appDict.includes("settings.experimental.row") || appDict.includes("foldUserMessages"))
      fail(`8: app ${locale}.ts carries experimental keys — v2.2.1 keeps those locales en-fallback; a translation would be a project-local addition needing a delta re-registration`)
    const uiDict = await read(`${UI}src/i18n/${locale}.ts`)
    if (uiDict.includes("ui.message.readMore") || uiDict.includes("ui.message.showLess"))
      fail(`8: ui ${locale}.ts carries the fold toggle keys — v2.2.1 keeps those locales en-fallback`)
  }

  // The fallback chain anchors themselves, verbatim on both packages.
  const language = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!language.includes("const base = flatten({ ...en, ...dict })"))
    fail("8: app language.tsx lost the en base-first flatten")
  const uiI18n = await read(`${UI}src/context/i18n.tsx`)
  if (!uiI18n.includes("const value = en[key as UiI18nKey] ?? String(key)"))
    fail("8: ui context/i18n.tsx lost the en[key] ?? String(key) fallback")
}

// --- 9. Patch/manifest face ---
{
  const manifest = await read(`${PATCHES}manifest.json`)
  if (!manifest.includes('"id": "M-034"') || !manifest.includes("patches/mobile/0034-M-034-experimental-settings.patch"))
    fail("9: patches/mobile/manifest.json does not register M-034")
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/0034-M-034-experimental-settings.patch"))
    fail("9: vendor-manifest.json does not register M-034 (verify-closure reads only this list)")

  // The patch file touches exactly the fourteen S38 files (app 6 + session-ui 4 + ui 4).
  const patch = await read(`${PATCHES}0034-M-034-experimental-settings.patch`)
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
  const expected = [
    "packages/app/src/runtime/i18n/en.ts",
    "packages/app/src/session/timeline/message-timeline.tsx",
    "packages/app/src/settings/experimental/experimental.tsx",
    "packages/app/src/settings/model.test.ts",
    "packages/app/src/settings/model.tsx",
    "packages/app/src/settings/search-catalog.ts",
    "packages/session-ui/src/components/message-part.css",
    "packages/session-ui/src/message/current-message.tsx",
    "packages/session-ui/src/message/message-content.tsx",
    "packages/session-ui/src/timeline/session-timeline-row.tsx",
    "packages/ui/src/i18n/en.ts",
    "packages/ui/src/icons/catalog.ts",
    "packages/ui/src/icons/icon/icon.tsx",
    "packages/ui/src/icons/new-icons.ts",
  ]
  if (JSON.stringify([...touched].sort()) !== JSON.stringify(expected))
    fail(`9: M-034 patch face drifted: ${JSON.stringify(touched)} (expected exactly the fourteen S38 files)`)

  // No other registered patch ADDS the S38 content (context lines around
  // earlier patches' own edits legitimately show the guard, so only added
  // lines count).
  for (const name of readdirSync(join(repoRoot.pathname, PATCHES))) {
    if (!name.endsWith(".patch") || name.startsWith("0034-")) continue
    const other = await read(`${PATCHES}${name}`)
    const added = other
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n")
    if (added.includes("new-icons") || added.includes("newIcons") || added.includes("foldUserMessages") || added.includes("experimentalSettingsAvailable"))
      fail(`9: ${name} adds S38 content (only M-034 may)`)
  }

  // Diff face: no vendor source outside the M-034 files mentions the new face.
  const tokens = ["newIcons", "setNewIcons", "foldUserMessages", "UserMessageFold", "user-message-fold", "user-expanded"]
  const m034Files = new Set(expected.map((p) => `vendor/upstream/${p}`))
  const skipDirs = new Set(["node_modules", "dist", ".vite", ".turbo"])
  async function scan(dir: string): Promise<void> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) await scan(path)
        continue
      }
      if (m034Files.has(path.replace(`${repoRoot.pathname}`, ""))) continue
      if (!/\.(ts|tsx|css|js|jsx|json|md|html|svg|txt)$/.test(entry.name)) continue
      const body = await Bun.file(path).text()
      for (const token of tokens) {
        if (body.includes(token)) fail(`9: ${path.replace(repoRoot.pathname, "")} mentions ${token} outside the M-034 file set`)
      }
    }
  }
  await scan(`${repoRoot.pathname}vendor/upstream/packages`)
}

// --- 10. First-party negative (packages/mobile-hosts stays untouched) ---
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
      const body = await Bun.file(path).text()
      if (body.includes("newIcons") || body.includes("foldUserMessages") || body.includes("experimental"))
        fail(`10: first-party ${path.replace(repoRoot.pathname, "")} references the S38 face (vendor-side only)`)
    }
  }
  await scan(`${repoRoot.pathname}${HOSTS}src`)
  await scan(`${repoRoot.pathname}${HOSTS}test`)
}

console.log(
  "verify-experimental-settings: PASS (" +
    "1: experimentalSettingsAvailable=true verbatim (no platform gate), two rows with keys/data-actions/Switch bindings; " +
    "2: shell.tsx :309 guard and :362 grouping byte-identical to pin, flask + label registration intact; " +
    "3: model.tsx two schema fields with upstream comments, false defaults, withFallback readers, setNewIcons effect, accessors; no backgroundActivity/timelineWidth/sidebarOpen (reduceMotion dropped from the negative list by M-035's rebase round, issue #65), showFileTree+terminalPlacement kept; " +
    "4: model.test.ts defaults +2 lines, showFileTree/terminalPlacement lines and original test name kept; " +
    "5: fold chain message-timeline→row(disclosure user-expanded)→current→content (USER_MESSAGE_FOLD {over:12,show:8}, ResizeObserver, 8lh, aria toggle, flip/scrollParent/viewportTop), zero run=/useSources/linkSegments/quote/spring leak; " +
    "6: new-icons.ts verbatim 42+70 table, all replacement keys real catalog names (∪ minus/outline-chevron-right), icon.tsx signal+setNewIcons+dual sprite+pixelSize next(), catalog minus/outline-chevron-right only, sidebar-right kept, 15 rejections out, pin trash/copy artwork bodies locked; " +
    "7: fold CSS two selector blocks in, data-run-folded/run-actions/user-message-link out; " +
    "8: six en keys (app 4 after settings.experimental.description, ui 2 after ui.message.collapse), zh/zht/ko/de/fr key-free, both fallback anchors verbatim; " +
    "9: M-034 in BOTH manifests, patch face exactly the fourteen S38 files, no other patch references the face, no vendor source outside the set mentions it; " +
    "10: packages/mobile-hosts zero newIcons/foldUserMessages/experimental references; " +
    "STATIC check - switch flipping, sprite swap, real fold visuals, disclosure survival, lh-unit WebView behavior and settings.v3 persistence are device-QA items registered in docs/build-and-verify.md)",
)
