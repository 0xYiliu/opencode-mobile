// verify-settings-framework.ts — static probe for issue #101 (S01–S03: the settings
// framework — outer shell, navigation, route/view model, surface server scope, search,
// settings→command-palette bridge — migrated to v2.2.1 3ebcf9a via mobile patches
// settings-framework-dependencies/settings-framework-migration/settings-framework-mobile).
//
// Asserts, against the REAL applied sources (vendored pin b4525d79bf… + mobile patches
// gui-plugins-native-test-deps..settings-framework-mobile), the structural facts the S01–S03 record relies on:
//
//   1. Shell (settings/shell.tsx): the migrated target layout (single RootSettings, keyed
//      server scope, SettingsServerSwitcher/Unavailable around the per-server pages), the
//      settings-mobile-host-manager host-manager mount as the servers tab's first child, the settings-mobile-gui-plugins single-face
//      gui-extensions forms (predicate/guard/nav/mount), and the absence of the pin-era
//      dual layout (ServerSettings/nested server tabs).
//   2. Navigation (settings/navigation.tsx): the CollapsedSidebarToggleSpace back-row
//      dependency (settings-framework-dependencies file) and the 48px row comment.
//   3. Route model (settings/route.ts + pages.ts): no `type: "server"` views, the
//      gui-extensions root tab restored (mobile faces, documented deviation; issue #109
//      resolved the D4 contract as KEEP — settings-gui-plugins-tab-label rewrote the pending-removal notes in
//      place, marker strings unchanged), the `plugins`→extensions subtab redirect.
//   4. Server scope (settings/surface.tsx + servers/inventory.ts): the resolution order
//      (view server → source server → local connected → first), selectServer/openServers,
//      settingsServerReachable exported, settingsProjects gone.
//   5. Search (settings/search.tsx + search-index.ts + search-catalog.ts +
//      search-results.ts): SearchList/SearchHighlight/Slash, the 2-arg rankSettings, the
//      zoom row present WITHOUT the desktop gate (mobile(M-035)), the general-page pair of
//      dangling-anchor rows restored by issue #103/settings-general-experimental-migration (catalog rows + general.tsx
//      data-action anchors) and the settings-sounds-interface row restored by issue
//      #107/settings-notifications-migration (catalog row + notifications.tsx data-action anchor — the narrowed
//      mobile(M-044) catalog note is gone; route.ts keeps its own settings-framework-mobile note for
//      gui-extensions, which issue #109 resolved as a KEEP), and the pin search consumer
//      form gone.
//   6. Command-palette bridge (shell/commands/palette.ts + dialog.tsx + settings/palette.ts):
//      the `setting` entry type, the createSettingsPaletteEntries plumbing, and the
//      palette.group.settings category key.
//   7. Tests: the settings-framework-mobile-completed keyed/search-results/search-plugin test forms and the
//      three new first-party test files present.
//   8. Page glue: headerAction renders in all five page files (the switcher's reachability
//      on per-server pages depends on it).
//   9. i18n: the nine new en.ts keys (the plan's 8 + server.thisComputer for the settings-framework-dependencies
//      label/hint chain), zh fallback per the upstream strategy.
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static STRUCTURE
// check. It proves source shape, NOT runtime behavior: navigation/search/offline/isolation
// behavior on the device is the smoke checklist in docs/build-and-verify.md issue #101,
// and tree byte-equivalence is V3 verify-closure.
//
// Usage:
//   bun run scripts/verify-settings-framework.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-settings-framework: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const UI = "vendor/upstream/packages/ui/"

const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

// --- 1. Shell ---
{
  const shell = await read(`${APP}src/settings/shell.tsx`)

  // Target layout markers.
  for (const marker of [
    "function RootSettings()",
    "const reachable = createMemo(() => {",
    "<SettingsServerSwitcher />",
    "<SettingsServerUnavailable",
    "when={multiple() ? undefined : inventory()[0]}",
    "<SettingsServerList",
    "revealSettingsSearch(root, view)",
    "<PluginSettingsPages />",
  ]) {
    if (!shell.includes(marker)) fail(`1: shell.tsx lost the migrated marker: ${marker}`)
  }

  // Pin-era dual layout is gone.
  for (const gone of ["function ServerSettings(", "const nestedServerTabs = [", 'type: "server"']) {
    if (shell.includes(gone)) fail(`1: shell.tsx still carries the pin-era shape: ${gone}`)
  }

  // settings-server-menu: Settings exposes only the upstream Server surface; the old manager is not mounted.
  const serversTab = shell.indexOf('<Tabs.Content value="servers" class="settings-panel">')
  if (serversTab < 0 || shell.includes("MobileHostManager"))
    fail("1: shell.tsx must retain the upstream Server tab without the old mobile host manager")

  // settings-mobile-gui-plugins single-face forms (the verify-gui-plugins group 4 / verify-agent-capabilities
  // group 3 common witness — keep the exact strings in sync).
  for (const form of [
    'const mobileGuiExtensions = platform.platform !== "desktop"',
    'if (view.tab === "gui-extensions" && !mobileGuiExtensions) surface.open("general")',
    "...(mobileGuiExtensions ? [{ items: guiExtensionsTab.map",
    '<Suspense>\n            <MobileExtensionManager />\n          </Suspense>',
    "mobile(M-026)",
    "function MobileExtensionManager() {",
    "usePluginHost",
  ]) {
    if (!shell.includes(form)) fail(`1: shell.tsx lost the settings-mobile-gui-plugins form: ${JSON.stringify(form.slice(0, 60))}`)
  }
  // Code-form check (no spaces): the pin condition `!guiExtensions && mobileGuiExtensions`
  // survives only in marker comments when written with spaces, so this cannot false-positive.
  if (shell.includes("!guiExtensions&&")) fail("1: shell.tsx still gates on the removed pin guiExtensions face")
}

// --- 2. Navigation ---
{
  const nav = await read(`${APP}src/settings/navigation.tsx`)
  if (!nav.includes('import { CollapsedSidebarToggleSpace } from "@/shell/sidebar-toggle"'))
    fail("2: navigation.tsx lost the CollapsedSidebarToggleSpace import (settings-framework-dependencies dep)")
  if (!nav.includes("CollapsedSidebarToggleSpace start={24}")) fail("2: navigation.tsx lost the 48px back-row space")
  if (nav.includes("export type SettingsNavItem")) fail("2: navigation.tsx re-exported SettingsNavItem (target un-exports it)")
}

// --- 3. Route model ---
{
  const route = await read(`${APP}src/settings/route.ts`)
  if (route.includes('type: "server"') || route.includes("parent:"))
    fail("3: route.ts still names the removed server view/parent")
  if (!route.includes('return { type: "root", tab: "servers", server, ...transient }'))
    fail("3: route.ts lost the server-without-tab -> Servers page parse")
  if (!route.includes('if (!project && tab === "plugins") return { type: "root", tab: "extensions", server, subtab: "plugins", ...transient }'))
    fail("3: route.ts lost the plugins -> extensions subtab redirect")
  if (!route.includes('"gui-extensions"') || !route.includes("mobile(M-044)"))
    fail("3: route.ts lost the restored gui-extensions root tab (mobile faces deviation)")

  const pages = await read(`${APP}src/settings/pages.ts`)
  if (!pages.includes('"gui-extensions": "extensions",') || !pages.includes('"gui-extensions": "settings.guiExtensions.title",'))
    fail("3: pages.ts lost the restored gui-extensions entries")
}

// --- 4. Server scope ---
{
  const surface = await read(`${APP}src/settings/surface.tsx`)
  for (const marker of [
    "const sourceServer = createMemo(() => {",
    "const server = createMemo(() => {",
    "list.find((item) => item.key === key) ??",
    "list.find((item) => !!item.connection && ServerConnection.local(item.connection)) ??",
    "list[0]",
    "selectServer(server: string)",
    "openServers(server?: string)",
  ]) {
    if (!surface.includes(marker)) fail(`4: surface.tsx lost the server-scope marker: ${marker}`)
  }

  const inventory = await read(`${APP}src/settings/servers/inventory.ts`)
  if (!inventory.includes("export function settingsServerReachable("))
    fail("4: inventory.ts lost the settingsServerReachable export")
  if (inventory.includes("settingsProjects"))
    fail("4: inventory.ts still exports settingsProjects (target-removed; all consumers migrated)")

  const switcher = await read(`${APP}src/settings/servers/switcher.tsx`)
  if (!switcher.includes("settingsServerReachable(server, health(server))") || !switcher.includes("surface.selectServer(key)"))
    fail("4: switcher.tsx lost its server-scope wiring")

  const unavailable = await read(`${APP}src/settings/servers/unavailable.tsx`)
  if (!unavailable.includes("global.servers.retry()"))
    fail("4: unavailable.tsx lost the retry exit")
  if (!unavailable.includes('role="status"')) fail("4: unavailable.tsx lost the status role")
}

// --- 5. Search ---
{
  const search = await read(`${APP}src/settings/search.tsx`)
  for (const marker of ['SearchHighlight, SearchList, type SearchListHandle', 'import { Slash } from "@opencode/ui/slash"', "screen.clientWidth < 800", "createSettingsSearchCatalog", "plugins: surface.plugins.items()"]) {
    if (!search.includes(marker)) fail(`5: search.tsx lost the migrated marker: ${marker}`)
  }
  if (search.includes("extensions: surface.plugins.items()"))
    fail("5: search.tsx still reads the pin #90 consumer form (must be the target plugins form)")

  const results = await read(`${APP}src/settings/search-results.ts`)
  if (!results.includes("export function rankSettings(query: string, items: SettingsSearchResult[])"))
    fail("5: search-results.ts lost the 2-arg rankSettings")
  if (results.includes("origin")) fail("5: search-results.ts still scores by origin (target removed it)")

  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  const zoomStart = catalog.indexOf('label: "settings.appearance.row.zoom.title"')
  const zoomEnd = catalog.indexOf("},", zoomStart)
  const zoomRow = zoomStart >= 0 ? catalog.slice(zoomStart, zoomEnd) : ""
  if (!zoomRow) fail("5: the zoom catalog row is missing")
  if (/(^|\n)\s*available:/.exec(zoomRow))
    fail("5: the zoom catalog row still carries an availability gate (appearance-motion-zoom drop regressed)")
  if (!catalog.includes('target: "settings-zoom"')) fail("5: the zoom catalog row is missing")
  if (!catalog.includes("mobile(M-035)")) fail("5: the zoom row lost the mobile(M-035) marker")
  // Issue #103 / settings-general-experimental-migration: the two general-page rows return with their page anchors.
  // Issue #107 / settings-notifications-migration: settings-sounds-interface returns the same way — catalog row plus
  // a real notifications.tsx anchor (the narrowed mobile(M-044) catalog note is gone;
  // route.ts keeps its own settings-framework-mobile note for the gui-extensions faces — issue #109 resolved
  // the note's pending question as KEEP, marker unchanged).
  for (const restored of ["settings-background-activity", "settings-timeline-width"]) {
    if (!catalog.includes(`target: "${restored}"`)) fail(`5: the restored catalog row ${restored} is missing (issue #103)`)
  }
  const generalPage = await read(`${APP}src/settings/general/general.tsx`)
  for (const anchor of ['data-action="settings-background-activity"', 'data-action="settings-timeline-width"']) {
    if (!generalPage.includes(anchor)) fail(`5: general.tsx lost the restored page anchor ${anchor} (issue #103)`)
  }
  const interfaceRow = catalog.indexOf('target: "settings-sounds-interface"')
  if (interfaceRow < 0)
    fail("5: the restored catalog row settings-sounds-interface is missing (issue #107)")
  {
    const rowText = catalog.slice(Math.max(0, catalog.lastIndexOf("{", interfaceRow)), catalog.indexOf("}", interfaceRow))
    for (const part of [
      'label: "settings.general.sounds.interface.title"',
      'section: "settings.general.section.sounds"',
      'description: "settings.general.sounds.interface.description"',
      'keywords: "sound audio interface effects wordmark logo"',
    ]) {
      if (!rowText.includes(part)) fail(`5: the restored settings-sounds-interface catalog row lost: ${part}`)
    }
  }
  if (catalog.includes("mobile(M-044)"))
    fail("5: search-catalog.ts still carries the mobile(M-044) prune register (issue #107 restored the row; route.ts keeps its own note for gui-extensions — #109 resolved it as KEEP)")

  const notificationsPage = await read(`${APP}src/settings/notifications/notifications.tsx`)
  for (const anchor of [
    'data-action="settings-sounds-interface"',
    "settings.sounds.interfaceEnabled()",
    "settings.sounds.setInterfaceEnabled(",
  ]) {
    if (!notificationsPage.includes(anchor)) fail(`5: notifications.tsx lost the restored page anchor ${anchor} (issue #107)`)
  }

  const index = await read(`${APP}src/settings/search-index.ts`)
  if (!index.includes("selected?: string") || !index.includes("plugins?: readonly SettingsSearchPlugin[]"))
    fail("5: search-index.ts lost the selected/plugins shape")
}

// --- 6. Command-palette bridge ---
{
  const palette = await read(`${APP}src/shell/commands/palette.ts`)
  if (!palette.includes('type: "command" | "file" | "session" | "setting"')) fail("6: the palette entry union lost the setting type")
  if (!palette.includes("setting?: SettingsSearchResult") || !palette.includes("createSettingsPaletteEntries()"))
    fail("6: the palette lost the settings plumbing")
  if (!palette.includes('if (item.type === "setting") return settings.select(item)')) fail("6: the palette lost the setting select branch")

  const dialog = await read(`${APP}src/shell/commands/dialog.tsx`)
  if (!dialog.includes('props.item.type === "command" || props.item.type === "setting"'))
    fail("6: the dialog lost the setting Match condition")
  if (!dialog.includes("palette.settings.items(q)")) fail("6: the dialog lost the settings items source")

  const settingsPalette = await read(`${APP}src/settings/palette.ts`)
  if (!settingsPalette.includes("const LIMIT = 5") || !settingsPalette.includes("surface.search.open(entry.setting.view, entry.setting.id)"))
    fail("6: settings/palette.ts lost its contract shape")
}

// --- 7. Tests ---
{
  const keyed = await read(`${APP}src/settings/keyed-server-entry.test.tsx`)
  for (const marker of ["entry={entry()}", "selected={surface.server()?.key}", 'not.toContain("MobileHostManager")', "mobile(M-044)"]) {
    if (!keyed.includes(marker)) fail(`7: keyed-server-entry.test.tsx lost the settings-framework-mobile marker: ${marker}`)
  }
  if (keyed.includes("<Show when={singleEntry()} keyed>")) fail("7: keyed-server-entry.test.tsx still pins the pin-era keyed form")

  const searchTest = await read(`${APP}src/settings/search-results.test.ts`)
  if (!searchTest.includes('expect(rankSettings("font", items)).toHaveLength(4)')) fail("7: the font length flip is missing (settings-framework-mobile)")
  if (!searchTest.includes('expect(targets({})).toContain("settings-zoom")')) fail("7: the zoom toContain flip is missing (settings-framework-mobile)")
  if (!searchTest.includes("mobile(M-035)")) fail("7: search-results.test.ts lost the mobile(M-035) comment")
  // Issue #103 / settings-general-experimental-migration: the target capsule assertion is back with the restored rows.
  // Issue #107 / settings-notifications-migration: the sounds-interface assertion is flipped positive (row restored
  // with its real page anchor; deliberate first-party extension, timeline-width precedent).
  if (!searchTest.includes('expect(rankSettings("capsule", items)[0].view).toMatchObject({'))
    fail("7: search-results.test.ts lost the target capsule assertion (issue #103 restored the rows)")
  if (
    !searchTest.includes(
      'expect(items.some((item) => item.view.target === "settings-sounds-interface")).toBe(true)',
    )
  )
    fail("7: search-results.test.ts lost the sounds-interface positive assertion (issue #107 restored the row)")

  const pluginTest = await read(`${APP}src/settings/settings-search-plugin.test.tsx`)
  if (!pluginTest.includes('toContain("plugins: surface.plugins.items()")')) fail("7: the search-plugin test lost the target source assertion")
  // The mock seam must not pin the removed export (a mention inside the mobile(M-044)
  // rationale comment is fine).
  if (/mock\s*key|\n\s*settingsProjects:/.exec(pluginTest))
    fail("7: the search-plugin test still mocks the removed settingsProjects export")

  for (const file of ["surface.test.ts", "search-reveal.test.ts", "palette.test.ts"]) {
    if (!(await exists(`${APP}src/settings/${file}`))) fail(`7: the new first-party test file is missing: ${file}`)
  }
}

// --- 8. Page glue ---
{
  const glueFiles = [
    "providers/providers.tsx",
    "models/models.tsx",
    "providers/extensions.tsx",
    "workspaces/projects.tsx",
    "workspaces/workspaces.tsx",
  ]
  for (const file of glueFiles) {
    const page = await read(`${APP}src/settings/${file}`)
    if (!page.includes("headerAction?: JSX.Element")) fail(`8: ${file} lost the headerAction prop`)
    if (!page.includes('<div class="settings-tab-header-actions">{props.headerAction}</div>') &&
        !page.includes("{props.headerAction}"))
      fail(`8: ${file} does not render headerAction`)
  }
  const projects = await read(`${APP}src/settings/workspaces/projects.tsx`)
  if (!projects.includes("context().projects.list()")) fail("8: projects.tsx lost the target projects accessor")
  if (/import \{ settingsProjects|settingsProjects\(/.exec(projects))
    fail("8: projects.tsx still imports/calls the removed settingsProjects export")
}

// --- 9. i18n ---
{
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  for (const key of [
    '"palette.group.settings":',
    '"settings.server.switcher.label":',
    '"settings.server.switcher.unreachable":',
    '"settings.server.switcher.manage":',
    '"settings.server.unreachable.title":',
    '"settings.server.unreachable.description":',
    '"settings.server.unreachable.retry":',
    '"settings.server.unreachable.edit":',
    '"server.thisComputer":',
  ]) {
    if (!en.includes(key)) fail(`9: en.ts lost the settings-framework key: ${key}`)
  }
  // The settings-ssh-entry-guard key stays registered (live consumer servers/connect/screen.tsx).
  if (!en.includes('"settings.tab.sshHosts":')) fail("9: en.ts lost the settings-ssh-entry-guard settings.tab.sshHosts key")
}

// --- 10. Dependency closure files (settings-framework-dependencies) + css ---
{
  for (const file of [
    "src/shell/sidebar-toggle.tsx",
    "src/shell/sidebar-peek.ts",
    "src/shell/sidebar-peek.css",
    "src/servers/registry/label.tsx",
  ]) {
    if (!(await exists(`${APP}${file}`))) fail(`10: the settings-framework-dependencies dep file is missing: ${file}`)
  }
  for (const file of ["src/typography/slash/slash.tsx", "src/typography/slash/slash.css"]) {
    if (!(await exists(`${UI}${file}`))) fail(`10: the settings-framework-dependencies ui dep file is missing: ${file}`)
  }
  const uiPkg = JSON.parse(await read(`${UI}package.json`)) as { exports?: Record<string, string> }
  if (uiPkg.exports?.["./slash"] !== "./src/typography/slash/slash.tsx") fail("10: ui package.json lost the ./slash export")

  const registry = await read(`${APP}src/runtime/server/registry.tsx`)
  if (!registry.includes("export function serverLabel(") || !registry.includes("hint(conn: ServerConnection.Any)"))
    fail("10: registry.tsx lost the settings-framework-dependencies label/hint block")

  const settingsCss = await read(`${APP}src/settings/settings.css`)
  for (const marker of ["settings-server-switcher-", "settings-server-unavailable-", "settings-tab-header-actions", '--settings-bottom-inset']) {
    if (!settingsCss.includes(marker)) fail(`10: settings.css lost the migrated marker: ${marker}`)
  }

  const health = await read(`${APP}src/runtime/server/health.ts`)
  if (!health.includes("retry: () =>") || !health.includes("stageHealth")) fail("10: health.ts lost the status/retry shape")

  const runtime = await read(`${APP}src/runtime/server/runtime.tsx`)
  if (!runtime.includes("health: serverHealth.status") || !runtime.includes("retry: serverHealth.retry"))
    fail("10: runtime.tsx lost the servers return block")
  if (runtime.includes("serverHealth[ServerConnection.key") || /\bserverHealth\[key\]/.exec(runtime))
    fail("10: runtime.tsx still subscripts the old health record shape")
}

// --- 11. Patch registration ---
{
  const manifest = JSON.parse(await read("vendor/upstream/patches/mobile/manifest.json")) as {
    patches?: Array<{ id?: unknown }>
  }
  const ids = new Set((manifest.patches ?? []).map((row) => String(row.id)))
  for (const id of ["settings-framework-dependencies", "settings-framework-migration", "settings-framework-mobile"]) {
    if (!ids.has(id)) fail(`11: the patches manifest lost the ${id} registration`)
  }
  // Issue #109 / settings-gui-plugins-tab-label registered (the D4-resolution patch this probe's group 12 locks).
  if (!ids.has("settings-gui-plugins-tab-label")) fail("11: the patches manifest lost the settings-gui-plugins-tab-label registration (issue #109)")
}

// --- 12. Plugin settings-contribution hosting + label disambiguation (issue #109:
//         S41/S14/Sources static locks; the plan's "new group 11" — renumbered 12
//         because the file's group 11 (manifest registration) predates it) ---
{
  // Hosting surface: the target PluginSettingsPages/PluginSettingsSections pair mounts in
  // the migrated shell (plugin-owned root pages) and twice in the General page (the
  // review Wrap-lines row lands in the "general/general" section placement).
  const shell = await read(`${APP}src/settings/shell.tsx`)
  if (!shell.includes("<PluginSettingsPages />")) fail("12: shell.tsx lost the PluginSettingsPages mount (issue #109 S41)")
  const general = await read(`${APP}src/settings/general/general.tsx`)
  if (!general.includes('import { PluginSettingsSections } from "@/runtime/plugin/settings-page-view"'))
    fail("12: general.tsx lost the PluginSettingsSections import (issue #109 S41)")
  if (!general.includes('<PluginSettingsSections page="general" section="general" />'))
    fail("12: general.tsx lost the section-scoped PluginSettingsSections placement (issue #109 S41)")
  if (!general.includes('<PluginSettingsSections page="general" />'))
    fail("12: general.tsx lost the page-level PluginSettingsSections placement (issue #109 S41)")

  // The review plugin's contribution shape (target-verbatim at 3ebcf9a; S14 hosting).
  const reviewRenderer = await read("vendor/upstream/packages/gui-plugins/src/review/renderer.tsx")
  for (const anchor of ['id: "mobile-diff"', 'page: "general"', 'section: "general"', 'id: "settings-mobile-diff-wrap"']) {
    if (!reviewRenderer.includes(anchor)) fail(`12: review/renderer.tsx lost the SettingsPage anchor: ${anchor} (issue #109 S14)`)
  }
  const reviewSettings = await read("vendor/upstream/packages/gui-plugins/src/review/settings.tsx")
  for (const anchor of ['data-component="settings-row"', 'data-action="settings-mobile-diff-wrap"', "ctx.stores.mobileDiff"]) {
    if (!reviewSettings.includes(anchor)) fail(`12: review/settings.tsx lost the Wrap-lines row anchor: ${anchor} (issue #109 S14)`)
  }

  // Sources row (session-goal-sources-panels registered deviation — target has no settings row; the knob lives
  // in the DEV motion-tuning panel) keeps its storedToggle wiring.
  const experimental = await read(`${APP}src/settings/experimental/experimental.tsx`)
  for (const anchor of ['storedToggle("sources.enabled", false)', 'setStoredToggle("sources.enabled", checked, false)', 'data-action="settings-sources"', "mobile(M-036)"]) {
    if (!experimental.includes(anchor)) fail(`12: experimental.tsx lost the Sources row anchor: ${anchor} (issue #109 Sources gate)`)
  }

  // Label disambiguation (the #109 core): the gui-extensions tab label no longer collides
  // with settings.tab.extensions ("Extensions"/"扩展").
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  if (!en.includes('"settings.guiExtensions.title": "GUI extensions"'))
    fail('12: en.ts lost the "GUI extensions" label value (issue #109 label disambiguation)')
  if (/^\s*"settings\.guiExtensions\.title": "Extensions",?$/m.exec(en))
    fail('12: en.ts settings.guiExtensions.title regressed to the bare "Extensions" value (label collision with settings.tab.extensions)')
  const zh = await read(`${APP}src/runtime/i18n/zh.ts`)
  if (!zh.includes('"settings.guiExtensions.title": "GUI 扩展"'))
    fail('12: zh.ts lost the "GUI 扩展" label value (issue #109 label disambiguation)')
}

console.log(
  "verify-settings-framework: PASS (" +
    "1: migrated shell — single RootSettings + keyed server scope + switcher/unavailable, settings-server-menu upstream-only Server tab (no MobileHostManager), settings-mobile-gui-plugins single-face forms (predicate/guard/nav/mount), pin dual-layout negatives; " +
    "2: navigation CollapsedSidebarToggleSpace back row + un-exported SettingsNavItem; " +
    "3: route model — no server views, servers-page parse, plugins->extensions redirect, gui-extensions restoration (mobile faces deviation, D4 — issue #109 resolved the contract as KEEP, notes reworded in place by settings-gui-plugins-tab-label); " +
    "4: server scope — resolution order, selectServer/openServers, settingsServerReachable, settingsProjects gone, retry exit; " +
    "5: search — SearchList/Slash catalog factory, 2-arg rankSettings, zoom row present without the desktop gate (mobile(M-035)), the general-page pair restored by issue #103/settings-general-experimental-migration (catalog rows + general.tsx data-action anchors) and settings-sounds-interface restored by issue #107/settings-notifications-migration (catalog row + notifications.tsx anchor, catalog mobile(M-044) register gone; route.ts note resolved as KEEP by #109), target plugins consumer form; " +
    "6: command-palette bridge — setting entry type + createSettingsPaletteEntries + select branch + dialog Match/items; " +
    "7: tests — settings-framework-mobile keyed/search-results/search-plugin forms (capsule + sounds-interface assertions at the issue #103/#107 restored-row shapes) + three new first-party test files; " +
    "8: page glue — headerAction rendered in all five pages + projects accessor swap; " +
    "9: i18n — nine en.ts keys (plan's 8 + server.thisComputer), sshHosts retained; " +
    "10: settings-framework-dependencies dep closure files + ./slash export + registry label/hint + css markers + health/runtime shapes; " +
    "11: manifest registration settings-framework-dependencies/settings-framework-migration/settings-framework-mobile + settings-gui-plugins-tab-label (issue #109); " +
    "12: plugin settings-contribution hosting (PluginSettingsPages shell mount + general.tsx section/page placements), review mobile-diff contribution shape, Sources row wiring, and the GUI-extensions label disambiguation en/zh (issue #109 S41/S14/Sources); " +
    "STATIC check — device navigation/search/offline/isolation are smoke items in docs/build-and-verify.md issue #101; tree byte-equivalence is V3 verify-closure)",
)
