// verify-settings-framework.ts — static probe for issue #193 (the settings-domain
// re-base at v2.2.7: the framework is pin-absorbed native; the mobile faces re-derive via
// the consolidated settings-v2-2-7 patch — W1 host manager, W2 N12 add menu, W3 gui
// extensions tab + disabled union, W5 zoom deviation, W6 test re-derivations).
//
// Re-anchor ledger (issue #193, v2.2.7 = fedc6f208a): every group below records its
// old->new anchors. The #101-#110-era payload faces this probe used to pin are now
// upstream-native (settings framework, general/experimental, interface mode, keybinds,
// notifications, servers pages, providers/models/extensions, workspaces, dependency
// closure); the probe pins the NATIVE forms and the #193 consolidated-patch faces.
//
//   1. Shell (settings/shell.tsx): the v2.2.7 layout (single RootSettings, keyed server
//      scope, SettingsServerSwitcher/Unavailable around the per-server pages), the
//      surface-owned search chain (old->new: `revealSettingsSearch(root, view)` ->
//      `surface.search.attach(root!)` + `surface.search.sync(surface.view())`, with the
//      reveal itself at surface.tsx `startSettingsSearchReveal(screen, effect.view, ...)`
//      and the searchActivation passthrough preserved), the settings-v2-2-7 W1 mount
//      (MobileHostManager lazy block + first child of the servers tab) and W3 forms
//      (mobileGuiExtensions predicate/guard/nav/mount), and the absence of the pin-era
//      dual layout (ServerSettings/nested server tabs).
//   2. Navigation (settings/navigation.tsx): the CollapsedSidebarToggleSpace back-row
//      dependency and the un-exported SettingsNavItem (v2.2.7 declares it file-local).
//   3. Route model (settings/route.ts + pages.ts): no `type: "server"` views, the
//      gui-extensions root tab restored by settings-v2-2-7 (mobile(M-044) markers; issue
//      #109 resolved the D4 contract as KEEP), the `plugins`->extensions subtab redirect,
//      and host tabs winning over same-id plugin pages.
//   4. Server scope (settings/surface.tsx + servers/machine.ts): the resolution order
//      (view server -> source server -> local connected -> first), selectServer/openServers,
//      the v2.2.7 reachable projection (old->new: inventory `settingsServerReachable` ->
//      machine.ts `serverPagesConnection` + switcher `isSettingsServerUnreachable`),
//      settingsProjects still gone.
//   5. Search (settings/search.tsx + search-index.ts + search-catalog.ts +
//      search-results.ts): SearchList/SearchHighlight/Slash, the 2-arg rankSettings, the
//      zoom row present WITHOUT the desktop gate (mobile(M-035), W5), the three
//      dangling-anchor rows NATIVE at v2.2.7 (settings-background-activity +
//      settings-timeline-width + settings-sounds-interface with their page anchors — the
//      old->new here is "restored by issues #103/#107 patches" -> "native at fedc6f208a"),
//      the pin search consumer form gone, and the spellcheck row keeping its desktop gate
//      (no mobile leak).
//   6. Command-palette bridge (shell/commands/palette.ts + dialog.tsx + settings/palette.ts):
//      the `setting` entry type, the createSettingsPaletteEntries plumbing, and the
//      palette.group.settings category key; the select branch is the v2.2.7 reveal form
//      (old->new: `surface.search.open(entry.setting.view, entry.setting.id)` ->
//      `surface.search.reveal(entry.setting.view)`).
//   7. Tests: the settings-v2-2-7 keyed/search-results/search-plugin test forms (the W1
//      first-child lockup returns, `entry={entry()}`, the M-035 flips, the S14 cases);
//      the #101-era first-party surface/search-reveal/palette test trio is deliberately
//      NOT carried (D3: native coverage exists — route.test/model.test/inventory.test/
//      machine.test).
//   8. Page glue: headerAction renders in all five page files (native) + the projects
//      accessor swap.
//   9. i18n: the palette/switcher/unreachable/thisComputer keys (native at v2.2.7) and the
//      settings.tab.sshHosts key (old->new: "added by settings-ssh-entry-guard" -> "native
//      upstream, live consumer servers/connect/screen.tsx"); the settings.guiExtensions
//      family restored by settings-v2-2-7 (en 9 keys incl. mobile.description; zh full
//      block; the #109 "GUI extensions"/"GUI 扩展" disambiguation).
//  10. Dependency closure files (settings-framework-dependencies) + css: all native at
//      v2.2.7 (old->new: "added by the patch" -> "pin-absorbed"); the v2.2.7 health
//      machine keeps the retry dispatch and runtime keeps the servers return block.
//  11. Patch registration: the settings-family rows are registered with their #193
//      statuses (settings-framework-dependencies/migration/mobile + gui-plugins-tab-label
//      absorbed; settings-v2-2-7 active).
//  12. Plugin settings-contribution hosting + label disambiguation: PluginSettingsPages in
//      the shell, the general.tsx section/page placements, the review mobile-diff
//      contribution shape, and the GUI-extensions label disambiguation en/zh (the Sources
//      row part of the old group moved to session-goal-sources-panels' own domain —
//      #194 routing, not pinned here).
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static STRUCTURE
// check. It proves source shape, NOT runtime behavior: navigation/search/offline/isolation
// behavior on the device is the smoke checklist in docs/build-and-verify.md issue #193,
// and tree byte-equivalence is V3 verify-closure.
//
// Negative injections (per re-anchor round, run inject->FAIL->restore->PASS):
//   I1 (group 1): remove the `<MobileHostManager />` mount line -> group 1 W1 anchor fails.
//   I2 (group 5): re-add `available: "desktop"` to the zoom row -> group 5 gate negative fires.
//   I3 (group 3): delete the route.ts "gui-extensions" union member -> group 3 fails.
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

  // Target layout markers (v2.2.7 native).
  for (const marker of [
    "function RootSettings()",
    "const reachable = createMemo(() => {",
    "<SettingsServerSwitcher />",
    "<SettingsServerUnavailable",
    "when={multiple() ? undefined : inventory()[0]}",
    "<SettingsServerList",
    // old->new (S01-S03): the reveal chain moved into the surface — the shell attaches and
    // syncs it, surface.tsx runs startSettingsSearchReveal and keeps the searchActivation
    // passthrough on the persisted view state.
    "onCleanup(surface.search.attach(root!))",
    "surface.search.sync(surface.view())",
    "<PluginSettingsPages />",
  ]) {
    if (!shell.includes(marker)) fail(`1: shell.tsx lost the v2.2.7 marker: ${marker}`)
  }
  const surface = await read(`${APP}src/settings/surface.tsx`)
  if (!surface.includes("startSettingsSearchReveal(screen, effect.view, {"))
    fail("1: surface.tsx lost the startSettingsSearchReveal reveal chain (S01-S03)")
  if (!surface.includes("searchActivation: view.searchActivation"))
    fail("1: surface.tsx lost the searchActivation transient passthrough (S01-S03)")

  // Pin-era dual layout is gone.
  for (const gone of ["function ServerSettings(", "const nestedServerTabs = [", 'type: "server"']) {
    if (shell.includes(gone)) fail(`1: shell.tsx still carries the pin-era shape: ${gone}`)
  }

  // settings-v2-2-7 W1: the host manager is the servers tab's first child again.
  const serversTab = shell.indexOf('<Tabs.Content value="servers" class="settings-panel">')
  if (serversTab < 0 || !shell.includes("<MobileHostManager />"))
    fail("1: shell.tsx lost the settings-v2-2-7 W1 MobileHostManager mount")
  if (shell.indexOf("<MobileHostManager />") < serversTab)
    fail("1: shell.tsx MobileHostManager mount is not inside the servers tab")
  if (!shell.includes('const MobileHostManager = lazy(() =>\n  import("@opencode-mobile/mobile-hosts")'))
    fail("1: shell.tsx lost the W1 lazy MobileHostManager import block")

  // settings-v2-2-7 W3: the gui-extensions single-face forms.
  for (const form of [
    'const mobileGuiExtensions = platform.platform !== "desktop"',
    'if (view.tab === "gui-extensions" && !mobileGuiExtensions) surface.open("general")',
    "...(mobileGuiExtensions ? guiExtensionsTab.map((item) => ({ ...item, label: language.t(item.label) })) : [])",
    "<Suspense>\n            <MobileExtensionManager />\n          </Suspense>",
    "mobile(M-026)",
    "function MobileExtensionManager() {",
    "usePluginHost",
  ]) {
    if (!shell.includes(form)) fail(`1: shell.tsx lost the W3 gui-extensions form: ${JSON.stringify(form.slice(0, 60))}`)
  }
  // Code-form check (no spaces): no residual dual-face gate may survive in code.
  if (shell.includes("!guiExtensions&&")) fail("1: shell.tsx still gates on a removed pin guiExtensions face")
}

// --- 2. Navigation ---
{
  const nav = await read(`${APP}src/settings/navigation.tsx`)
  if (!nav.includes('import { CollapsedSidebarToggleSpace } from "@/shell/sidebar-toggle"'))
    fail("2: navigation.tsx lost the CollapsedSidebarToggleSpace import")
  if (!nav.includes("CollapsedSidebarToggleSpace start={24}")) fail("2: navigation.tsx lost the 48px back-row space")
  if (/export (type|interface) SettingsNavItem/.exec(nav))
    fail("2: navigation.tsx re-exported SettingsNavItem (v2.2.7 declares it file-local)")
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
  if (!route.includes('  | "gui-extensions"') || !route.includes('"gui-extensions": true,') || !route.includes("mobile(M-044)"))
    fail("3: route.ts lost the restored gui-extensions root tab (settings-v2-2-7 W3: union member + rootTabs entry)")
  // M-052: host tabs win over same-id plugin pages (the v2.2.7 isPluginTab guard).
  if (!route.includes("/** Host tabs win over a plugin page with the same id. */"))
    fail("3: route.ts lost the host-tabs-win contract comment (M-052)")

  const pages = await read(`${APP}src/settings/pages.ts`)
  if (!pages.includes('"gui-extensions": "extensions",') || !pages.includes('"gui-extensions": "settings.guiExtensions.title",'))
    fail("3: pages.ts lost the restored gui-extensions entries (settings-v2-2-7 W3)")

  const routeTest = await read(`${APP}src/settings/route.test.ts`)
  for (const anchor of ['test("parses the restored gui-extensions host root tab"', 'test("host tabs win over a plugin page with the same id"']) {
    if (!routeTest.includes(anchor)) fail(`3: route.test.ts lost the W3 case: ${anchor}`)
  }
}

// --- 4. Server scope ---
{
  const surface = await read(`${APP}src/settings/surface.tsx`)
  for (const marker of [
    "const sourceServer = createMemo(() => {",
    "const server = createMemo(() => {",
    "list.find((item) => item.key === key) ??",
    "list.find((item) => !!item.connection && registry.local(item.connection)) ??",
    "list[0]",
    "selectServer(server: string)",
    "openServers(server?: string)",
  ]) {
    if (!surface.includes(marker)) fail(`4: surface.tsx lost the server-scope marker: ${marker}`)
  }

  // old->new: the reachable projection is machine.ts serverPagesConnection at v2.2.7
  // (the #101-era inventory settingsServerReachable export is gone with the pin).
  const machine = await read(`${APP}src/settings/servers/machine.ts`)
  if (!machine.includes("export function serverPagesConnection("))
    fail("4: machine.ts lost the serverPagesConnection reachable projection")
  if (!machine.includes("export function isSettingsServerUnreachable("))
    fail("4: machine.ts lost the isSettingsServerUnreachable switcher gate")
  const inventory = await read(`${APP}src/settings/servers/inventory.ts`)
  if (inventory.includes("settingsProjects"))
    fail("4: inventory.ts still exports settingsProjects (target-removed; all consumers migrated)")

  const switcher = await read(`${APP}src/settings/servers/switcher.tsx`)
  if (!switcher.includes("isSettingsServerUnreachable(server.availability)") || !switcher.includes("surface.selectServer(key)"))
    fail("4: switcher.tsx lost its v2.2.7 server-scope wiring")

  const unavailable = await read(`${APP}src/settings/servers/unavailable.tsx`)
  if (!unavailable.includes("global.servers.retry()"))
    fail("4: unavailable.tsx lost the retry exit")
  if (!unavailable.includes('role="status"')) fail("4: unavailable.tsx lost the status role")
}

// --- 5. Search ---
{
  const search = await read(`${APP}src/settings/search.tsx`)
  for (const marker of ['SearchHighlight, SearchList, type SearchListHandle', 'import { Slash } from "@opencode/ui/slash"', "screen.clientWidth < 800", "createSettingsSearchCatalog", "plugins: surface.plugins.items()"]) {
    if (!search.includes(marker)) fail(`5: search.tsx lost the marker: ${marker}`)
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
    fail("5: the zoom catalog row still carries an availability gate (mobile(M-035) W5 deviation regressed)")
  if (!catalog.includes('target: "settings-zoom"')) fail("5: the zoom catalog row is missing")
  if (!catalog.includes("mobile(M-035)")) fail("5: the zoom row lost the mobile(M-035) marker")

  // The spellcheck row keeps its desktop gate — no mobile leak (issue #193 hard constraint).
  const spellStart = catalog.indexOf('label: "settings.general.row.spellcheck.title"')
  const spellEnd = catalog.indexOf("},", spellStart)
  const spellRow = spellStart >= 0 ? catalog.slice(spellStart, spellEnd) : ""
  if (!spellRow || !/(^|\n)\s*available: "desktop",/.exec(spellRow))
    fail("5: the spellcheck catalog row lost its desktop gate (mobile leak)")

  // The three #101-era dangling-anchor rows are NATIVE at v2.2.7 (old->new: "restored by
  // issues #103/#107" -> "pin-absorbed pristine").
  for (const restored of ["settings-background-activity", "settings-timeline-width", "settings-sounds-interface"]) {
    if (!catalog.includes(`target: "${restored}"`)) fail(`5: the native catalog row ${restored} is missing`)
  }
  const generalPage = await read(`${APP}src/settings/general/general.tsx`)
  for (const anchor of ['data-action="settings-background-activity"', 'data-action="settings-timeline-width"']) {
    if (!generalPage.includes(anchor)) fail(`5: general.tsx lost the native page anchor ${anchor}`)
  }
  if (catalog.includes("mobile(M-044)"))
    fail("5: search-catalog.ts still carries the mobile(M-044) prune register (the rows are native at v2.2.7)")

  const notificationsPage = await read(`${APP}src/settings/notifications/notifications.tsx`)
  for (const anchor of [
    'data-action="settings-sounds-interface"',
    "settings.sounds.interfaceEnabled()",
    "settings.sounds.setInterfaceEnabled(",
  ]) {
    if (!notificationsPage.includes(anchor)) fail(`5: notifications.tsx lost the native page anchor ${anchor}`)
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
  // old->new: the select branch is the v2.2.7 reveal form.
  if (!settingsPalette.includes("const LIMIT = 5") || !settingsPalette.includes("surface.search.reveal(entry.setting.view)"))
    fail("6: settings/palette.ts lost its v2.2.7 contract shape")
}

// --- 7. Tests ---
{
  const keyed = await read(`${APP}src/settings/keyed-server-entry.test.tsx`)
  for (const marker of ["entry={entry()}", "selected={surface.server()?.key}", 'toContain("<MobileHostManager />")', "mobile(M-044)"]) {
    if (!keyed.includes(marker)) fail(`7: keyed-server-entry.test.tsx lost the settings-v2-2-7 marker: ${marker}`)
  }
  if (keyed.includes("<Show when={singleEntry()} keyed>")) fail("7: keyed-server-entry.test.tsx still pins the pin-era keyed form")
  if (keyed.includes('not.toContain("MobileHostManager")'))
    fail("7: keyed-server-entry.test.tsx still pins the #124-era host-manager absence (W1 restored the mount)")

  const searchTest = await read(`${APP}src/settings/search-results.test.ts`)
  if (!searchTest.includes('expect(rankSettings("font", items)).toHaveLength(4)')) fail("7: the font length flip is missing (mobile(M-035) W5)")
  if (!searchTest.includes('expect(targets({})).toContain("settings-zoom")')) fail("7: the zoom toContain flip is missing (mobile(M-035) W5)")
  if (!searchTest.includes("mobile(M-035)")) fail("7: search-results.test.ts lost the mobile(M-035) comment")
  if (!searchTest.includes('expect(rankSettings("capsule", items)[0].view).toMatchObject({'))
    fail("7: search-results.test.ts lost the native capsule assertion")

  const pluginTest = await read(`${APP}src/settings/settings-search-plugin.test.tsx`)
  if (!pluginTest.includes('toContain("plugins: surface.plugins.items()")')) fail("7: the search-plugin test lost the target source assertion")
  if (/mock\s*key|\n\s*settingsProjects:/.exec(pluginTest))
    fail("7: the search-plugin test still mocks the removed settingsProjects export")
  for (const s14 of ['test("indexes a hosted wrap-lines entry under the host\'s General section label"', 'test("uses the plugin title as the section label only without a host section"']) {
    if (!pluginTest.includes(s14)) fail(`7: settings-search-plugin.test.tsx lost the S14 case: ${s14}`)
  }

  // D3 (issue #193): the #101-era first-party test trio is deliberately NOT carried;
  // the native coverage it duplicated exists (route/model/inventory/machine tests).
  for (const file of ["surface.test.ts", "search-reveal.test.ts", "palette.test.ts"]) {
    if (await exists(`${APP}src/settings/${file}`))
      fail(`7: ${file} resurrected (D3: the #101-era first-party trio stays out; native coverage exists)`)
  }
  for (const file of ["route.test.ts", "model.test.ts", "servers/inventory.test.ts", "servers/machine.test.ts"]) {
    if (!(await exists(`${APP}src/settings/${file}`))) fail(`7: the native coverage file is missing: ${file}`)
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
  // old->new: the accessor is the v2.2.7 unique() projection (the #101-era list() form is gone).
  if (!projects.includes("context.projects.unique()")) fail("8: projects.tsx lost the v2.2.7 projects accessor")
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
  // old->new: settings.tab.sshHosts is defined here (pristine v2.2.7 has none); live consumer in the applied tree
  // servers/connect/screen.tsx); the ssh-entry-guard row's key obligation closed natively.
  if (!en.includes('"settings.tab.sshHosts":')) fail("9: en.ts lost the native settings.tab.sshHosts key")
  const screen = await read(`${APP}src/servers/connect/screen.tsx`)
  if (!screen.includes('language.t("settings.tab.sshHosts")'))
    fail("9: servers/connect/screen.tsx lost the native sshHosts consumer")

  // settings-v2-2-7 W3: the guiExtensions family (9 en keys incl. mobile.description).
  for (const key of [
    '"settings.guiExtensions.title": "GUI extensions",',
    '"settings.guiExtensions.description":',
    '"settings.guiExtensions.reload":',
    '"settings.guiExtensions.status.loading":',
    '"settings.guiExtensions.status.active":',
    '"settings.guiExtensions.status.failed":',
    '"settings.guiExtensions.status.disabled":',
    '"settings.guiExtensions.status.blocked":',
    '"settings.guiExtensions.mobile.description":',
  ]) {
    if (!en.includes(key)) fail(`9: en.ts lost the W3 guiExtensions key: ${key}`)
  }
  const zh = await read(`${APP}src/runtime/i18n/zh.ts`)
  if (!zh.includes('"settings.guiExtensions.title": "GUI 扩展"'))
    fail('9: zh.ts lost the "GUI 扩展" label value (#109 disambiguation via settings-v2-2-7 W3)')
  if (!zh.includes('"settings.guiExtensions.mobile.description":'))
    fail("9: zh.ts lost the W3 mobile description key")
}

// --- 10. Dependency closure files (settings-framework-dependencies) + css ---
{
  for (const file of [
    "src/shell/sidebar-toggle.tsx",
    "src/shell/sidebar-peek.ts",
    "src/shell/sidebar-peek.css",
    "src/servers/registry/label.tsx",
  ]) {
    if (!(await exists(`${APP}${file}`))) fail(`10: the dependency-closure file is missing (native at v2.2.7): ${file}`)
  }
  for (const file of ["src/typography/slash/slash.tsx", "src/typography/slash/slash.css"]) {
    if (!(await exists(`${UI}${file}`))) fail(`10: the ui dependency file is missing (native at v2.2.7): ${file}`)
  }
  const uiPkg = JSON.parse(await read(`${UI}package.json`)) as { exports?: Record<string, string> }
  if (uiPkg.exports?.["./slash"] !== "./src/typography/slash/slash.tsx") fail("10: ui package.json lost the ./slash export")

  const registry = await read(`${APP}src/runtime/server/registry.tsx`)
  if (!registry.includes("export function serverLabel(") || !registry.includes("hint(conn: ServerConnection.Any)"))
    fail("10: registry.tsx lost the serverLabel/hint block")

  const settingsCss = await read(`${APP}src/settings/settings.css`)
  for (const marker of ["settings-server-switcher-", "settings-server-unavailable-", "settings-tab-header-actions", '--settings-bottom-inset']) {
    if (!settingsCss.includes(marker)) fail(`10: settings.css lost the marker: ${marker}`)
  }

  const health = await read(`${APP}src/runtime/server/health.ts`)
  // old->new: the v2.2.7 health machine drives retry through the dispatch machine
  // (the #101-era status/retry + stageHealth accessor shape is gone with the pin).
  if (!health.includes('type: "retry.requested"')) fail("10: health.ts lost the v2.2.7 retry dispatch shape")

  const runtime = await read(`${APP}src/runtime/server/runtime.tsx`)
  if (!runtime.includes("health: serverHealth.status") || !runtime.includes("retry: serverHealth.retry"))
    fail("10: runtime.tsx lost the servers return block")
  if (runtime.includes("serverHealth[ServerConnection.key") || /\bserverHealth\[key\]/.exec(runtime))
    fail("10: runtime.tsx still subscripts the old health record shape")
}

// --- 11. Patch registration ---
{
  const manifest = JSON.parse(await read("vendor/upstream/patches/mobile/manifest.json")) as {
    patches?: Array<{ id?: unknown; status?: unknown }>
  }
  const rows = new Map((manifest.patches ?? []).map((row) => [String(row.id), String(row.status)]))
  for (const id of ["settings-framework-dependencies", "settings-framework-migration", "settings-framework-mobile", "settings-gui-plugins-tab-label"]) {
    if (rows.get(id) !== "absorbed") fail(`11: the manifest lost the ${id} registration as absorbed (issue #193 flip)`)
  }
  if (rows.get("settings-v2-2-7") !== "active")
    fail("11: the manifest lost the settings-v2-2-7 active registration (issue #193)")
}

// --- 12. Plugin settings-contribution hosting + label disambiguation ---
{
  const shell = await read(`${APP}src/settings/shell.tsx`)
  if (!shell.includes("<PluginSettingsPages />")) fail("12: shell.tsx lost the PluginSettingsPages mount (S41)")
  const general = await read(`${APP}src/settings/general/general.tsx`)
  if (!general.includes('import { PluginSettingsSections } from "@/runtime/plugin/settings-page-view"'))
    fail("12: general.tsx lost the PluginSettingsSections import (S41)")
  if (!general.includes('<PluginSettingsSections page="general" section="general" />'))
    fail("12: general.tsx lost the section-scoped PluginSettingsSections placement (S41)")
  if (!general.includes('<PluginSettingsSections page="general" />'))
    fail("12: general.tsx lost the page-level PluginSettingsSections placement (S41)")

  const reviewRenderer = await read("vendor/upstream/packages/gui-plugins/src/review/renderer.tsx")
  for (const anchor of ['id: "mobile-diff"', 'page: "general"', 'section: "general"', 'id: "settings-mobile-diff-wrap"']) {
    if (!reviewRenderer.includes(anchor)) fail(`12: review/renderer.tsx lost the SettingsPage anchor: ${anchor} (S14)`)
  }
  const reviewSettings = await read("vendor/upstream/packages/gui-plugins/src/review/settings.tsx")
  // old->new: the v2.2.7 review row consumes the plugin UI kit (ui.SettingsRow with the row
  // id); the data-component/data-action render markers live in the kit itself
  // (runtime/plugin/ui.tsx), which derives data-action from the row id.
  for (const anchor of ['id="settings-mobile-diff-wrap"', "ctx.stores.mobileDiff"]) {
    if (!reviewSettings.includes(anchor)) fail(`12: review/settings.tsx lost the Wrap-lines row anchor: ${anchor} (S14)`)
  }
  const pluginUi = await read(`${APP}src/runtime/plugin/ui.tsx`)
  if (!pluginUi.includes('<div data-component="settings-row" data-action={props.id}>'))
    fail("12: runtime/plugin/ui.tsx lost the kit SettingsRow render markers (data-component/data-action)")

  // The Sources-row part of the old group 12 moved with session-goal-sources-panels to its
  // own domain (issue #194 routing; verify-goal-sources owns it) — deliberately not pinned here.

  // Label disambiguation (the #109 core): the gui-extensions tab label no longer collides
  // with settings.tab.extensions ("Extensions"/"扩展").
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  if (!en.includes('"settings.guiExtensions.title": "GUI extensions"'))
    fail('12: en.ts lost the "GUI extensions" label value (#109 label disambiguation)')
  if (/^\s*"settings\.guiExtensions\.title": "Extensions",?$/m.exec(en))
    fail('12: en.ts settings.guiExtensions.title regressed to the bare "Extensions" value (label collision with settings.tab.extensions)')
}

console.log(
  "verify-settings-framework: PASS (" +
    "1: v2.2.7 shell — single RootSettings + keyed server scope + switcher/unavailable, surface-owned search chain (attach/sync + startSettingsSearchReveal + searchActivation), settings-v2-2-7 W1 MobileHostManager first-child mount + W3 single-face gui-extensions forms, pin dual-layout negatives; " +
    "2: navigation CollapsedSidebarToggleSpace back row + file-local SettingsNavItem; " +
    "3: route model — no server views, servers-page parse, plugins->extensions redirect, gui-extensions restoration (settings-v2-2-7 W3, D4 KEEP) + host-tabs-win contract + route.test W3 cases; " +
    "4: server scope — resolution order, selectServer/openServers, machine.ts serverPagesConnection/isSettingsServerUnreachable (old->new from inventory settingsServerReachable), settingsProjects gone, retry exit; " +
    "5: search — SearchList/Slash catalog factory, 2-arg rankSettings, zoom row present without the desktop gate (mobile(M-035) W5), spellcheck desktop gate kept (no mobile leak), the three dangling-anchor rows NATIVE at v2.2.7 with their page anchors, catalog M-044 register gone, target plugins consumer form; " +
    "6: command-palette bridge — setting entry type + createSettingsPaletteEntries + select branch + dialog Match/items + the v2.2.7 reveal select form; " +
    "7: tests — settings-v2-2-7 keyed (W1 first-child lockup restored, entry={entry()}) / search-results (M-035 flips) / search-plugin (target pin + S14 cases) forms + D3: the #101-era surface/search-reveal/palette first-party trio stays out with native coverage present; " +
    "8: page glue — headerAction rendered in all five pages + projects accessor swap (v2.2.7 unique() form); " +
    "9: i18n — native palette/switcher/thisComputer keys + native sshHosts (live consumer screen.tsx), W3 guiExtensions 9-key en family + zh block with the #109 disambiguation; " +
    "10: dependency-closure files + ./slash export + registry label/hint + css markers + the v2.2.7 health retry dispatch/runtime servers block (all pin-absorbed native); " +
    "11: manifest registration — the settings-framework family + gui-plugins-tab-label absorbed, settings-v2-2-7 active (issue #193); " +
    "12: plugin settings-contribution hosting (PluginSettingsPages shell mount + general.tsx section/page placements), review mobile-diff contribution shape (the kit SettingsRow render markers re-anchored to runtime/plugin/ui.tsx), and the GUI-extensions label disambiguation en (the Sources-row face moved to session-goal-sources-panels' own domain, #194); " +
    "STATIC check — device navigation/search/offline/isolation are smoke items in docs/build-and-verify.md issue #193; tree byte-equivalence is V3 verify-closure)",
)
