// verify-commands-menus.ts — static probe for issue #24 (Workbench navigation,
// command menu, and Desktop host-action adaptation).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf… + registered M-001..M-035
// mobile patches, with M-019 reserved-absent) and
// the commit-1 docs, the structural facts the commands-menus cross-cutting document
// relies on: the DESKTOP_MENU pure-data desktop-host face (7 menus / 19 actions /
// 19 roles / 4 hrefs), the host command registry faces, the web-build reachability
// four-face set, the no-dangling five-layer enablement chain, the window.*
// single-window ruling, and the docs closure.
//
// DIVISION OF LABOR (per the in-registry dedup convention):
//   1. CROSS-REFERENCE declarations (referencing, NOT first locks — the originals
//      live elsewhere; asserted nowhere or lightly here as declared):
//      the slash 11-key static set (first lock: verify-interaction-quality group 5),
//      the session.undo/redo slash pair (first locks: verify-diff group 3 +
//      verify-interaction-quality group 5), the multi-window negative
//      (first lock: verify-interaction-quality group 1 — single WebView / zero
//      setSupportMultipleWindows / zero onCreateWindow), the settings.v3 keybinds
//      segment (first lock: verify-interaction-quality group 6), the viewport
//      four-segment meta anchor (first lock: verify-interaction-quality group 3 —
//      only the user-scalable NEGATIVE is first-locked here), the dist
//      fileCount/totalBytes baseline (first lock: verify-notifications group 8 —
//      re-read as the zero-build-input mechanical witness, not a new sentinel),
//      the exact registered patch set/count 32 (first lock: verify-attachments-artifacts
//      — cross-reference against registered JSON IDs and vendor-manifest paths), the
//      terminal.toggle keybind
//      passthrough (verify-terminal.ts:428 — different anchors, same file declared),
//      and M-020 readClipboardImage (first lock: verify-attachments-artifacts —
//      only the web.ts wiring anchor is asserted here).
//   2. EXISTING READERS on files this probe also reads (per the plan §0.7② ledger,
//      v1.1/R4 + v1.2/N1): verify-interaction-quality group 5 reads command.tsx
//      (DEFAULT_PALETTE_KEYBIND verbatim) and new-session/commands.tsx
//      (command.palette + hidden: true), verify-browser reads windows-menu.tsx
//      (openExternal count anchor — help hrefs face), verify-permission-requests
//      reads tab-strip.tsx (background permission.sync domain), verify-files
//      group 7 reads composer/model.ts (@-mention context domain — zero text
//      overlap with this probe's `!item.disabled` slash-filter anchor),
//      verify-attachments-artifacts group 5 reads MainActivity.kt (file save/pick
//      domain — zero overlap with this probe's zoom-configuration negatives).
//      None of those existing anchors are re-locked here.
//   3. FIRST LOCKS here: the six zero-reader files in full
//      (shell/commands/palette.ts, shell/commands/desktop.tsx,
//      shell/commands/desktop-menu.ts, shell/titlebar/history.ts,
//      settings/command.tsx, runtime/extension/commands.tsx) plus the specified new
//      anchor lines in command.tsx (commandPaletteOptions filter / catalog.v1
//      persistence / keybindRenames / CommandCatalogItem executable-field strip),
//      composer/model.ts (`!item.disabled` slash filter — different anchor from
//      verify-files' @-mention domain), MainActivity.kt (zoom-configuration
//      negatives), and the docs closure anchors (group 7).
//
// SCOPE NOTE: group 7 anchors the four commit-1 documents (commands-menus.md /
// interaction.md / interaction-quality.md / design README.md / architecture.md).
// The build-and-verify.md #24 evidence section and the project-scope.md note are
// delivered in the FOLLOW-UP evidence commit — anchoring them here would make this
// probe fail at its own validation run (the same scoping every earlier probe uses).
//
// NEGATIVE EXAMPLES (run at verification time by injecting/reverting mutations;
// inject -> FAIL rc=1 -> restore -> PASS rc=0, logs kept):
//   1. inject a new `action: "window.reopen"` item into DESKTOP_MENU -> group 1
//      used-actions subset-of-union FAIL;
//   2. inject `command: "session.steal"` into DESKTOP_MENU -> group 2 command-set
//      equality FAIL (and the doc table has no such row);
//   3. inject a `runDesktopMenuAction` implementation into web.ts -> group 3
//      zero-web-handler negative FAIL (forces a window.* ruling re-review);
//   4. delete the `!item.disabled` term from the composer/model.ts slash filter ->
//      group 5 layer-2 anchor FAIL.
//
// HONEST BOUNDARY (same tradition as the sibling probes): this is a static STRUCTURE
// check (text anchors / normalized cross-line scans / set equalities with an explicit
// receiver-tolerant caliber). It proves source and doc shape, NOT runtime behavior:
// command discoverability, menu-face absence on device, window.* semantics,
// long-press edit menus, pinch zoom, back/forward layering, no-dangling behavior
// and state restoration are covered by the G34 device gate
// (docs/design/interaction.md), BLOCKED at this verification level. Windows runtime
// menu evidence belongs to issue #1 by boundary declaration.
//
// Usage:
//   bun run scripts/verify-commands-menus.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-commands-menus: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

/** RAW caliber: whitespace/newline-insensitive containment for cross-line anchors. */
const raw = (text: string) => text.replace(/\s+/g, "")

// Recursive file listing under a repo-relative directory (stable sort for
// deterministic set assertions).
const listFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: new URL(current, repoRoot).pathname, dot: false }))
    for (const entry of entries) out.push(`${current}${entry}`)
  }
  return out.sort()
}

// Cached single-read content store (the app/src domain scans read ~1.5k files).
const cache = new Map<string, string>()
async function readCached(path: string): Promise<string> {
  let text = cache.get(path)
  if (text === undefined) {
    text = await read(path)
    cache.set(path, text)
  }
  return text
}

function setEq(actual: Set<string>, expected: Set<string>, what: string): void {
  for (const value of expected) {
    if (!actual.has(value)) fail(`${what}: missing expected member ${JSON.stringify(value)} (actual: ${[...actual].sort().join(", ")})`)
  }
  for (const value of actual) {
    if (!expected.has(value)) fail(`${what}: unexpected member ${JSON.stringify(value)} (expected: ${[...expected].sort().join(", ")})`)
  }
}

const APP_SRC = "vendor/upstream/packages/app/src/"
const DESKTOP_MENU_TS = "vendor/upstream/packages/app/src/shell/commands/desktop-menu.ts"
const COMMAND_TSX = "vendor/upstream/packages/app/src/shell/commands/command.tsx"
const PALETTE_TS = "vendor/upstream/packages/app/src/shell/commands/palette.ts"
const DESKTOP_TSX = "vendor/upstream/packages/app/src/shell/commands/desktop.tsx"
const SEARCH_KEYDOWN = "vendor/upstream/packages/app/src/shell/commands/search-keydown.ts"
const WINDOWS_MENU_TSX = "vendor/upstream/packages/app/src/shell/titlebar/windows-menu.tsx"
const WINDOWS_MENU_TEST = "vendor/upstream/packages/app/src/shell/titlebar/windows-menu.test.ts"
const TITLEBAR_TSX = "vendor/upstream/packages/app/src/shell/titlebar/titlebar.tsx"
const HISTORY_TS = "vendor/upstream/packages/app/src/shell/titlebar/history.ts"
const TAB_STRIP_TSX = "vendor/upstream/packages/app/src/shell/titlebar/tab-strip.tsx"
const SESSION_CMDS_TSX = "vendor/upstream/packages/app/src/session/commands/use-session-commands.tsx"
const COMPOSER_CMDS_TSX = "vendor/upstream/packages/app/src/composer/commands.tsx"
const COMPOSER_MODEL_TS = "vendor/upstream/packages/app/src/composer/model.ts"
const SETTINGS_CMD_TSX = "vendor/upstream/packages/app/src/settings/command.tsx"
const NEW_SESSION_CMDS_TSX = "vendor/upstream/packages/app/src/new-session/commands.tsx"
const EXT_CMDS_TSX = "vendor/upstream/packages/app/src/runtime/plugin/commands.tsx"
const WEB_TS = "vendor/upstream/packages/app/src/runtime/platform/web.ts"
const PLATFORM_TSX = "vendor/upstream/packages/app/src/runtime/platform/platform.tsx"
const KEYBINDS_TSX = "vendor/upstream/packages/app/src/settings/keybinds/keybinds.tsx"
const EN_TS = "vendor/upstream/packages/app/src/runtime/i18n/en.ts"
const TERMINAL_TSX = "vendor/upstream/packages/gui-plugins/src/terminal/terminal.tsx"
const TERMINAL_RENDERER = "vendor/upstream/packages/gui-plugins/src/terminal/renderer.tsx"
const BROWSER_RENDERER = "vendor/upstream/packages/gui-plugins/src/browser/renderer.tsx"
const DEBUG_RENDERER = "vendor/upstream/packages/gui-plugins/src/debug/renderer.tsx"
const REGISTRIES_TS = "vendor/upstream/packages/plugin/src/gui/registries.ts"
const MAIN_ACTIVITY = "android/app/src/main/java/ai/opencode/mobile/MainActivity.kt"
const INDEX_HTML = "vendor/upstream/packages/app/index.html"
const CM_DOC = "docs/design/commands-menus.md"
const INTERACTION_DOC = "docs/design/interaction.md"
const IQ_DOC = "docs/design/interaction-quality.md"
const DESIGN_README = "docs/design/README.md"
const ARCHITECTURE_DOC = "docs/design/architecture.md"
const WEB_DIST_MANIFEST = "web-dist/manifest.json"
const PATCHES_MANIFEST = "vendor/upstream/patches/mobile/manifest.json"
const VENDOR_MANIFEST = "vendor/upstream/vendor-manifest.json"
const BUN_LOCK = "bun.lock"

const DATA_FACE_DOMAIN = (file: string) =>
  file.startsWith(APP_SRC) && (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.includes(".test.")
const NON_I18N_DOMAIN = (file: string) => DATA_FACE_DOMAIN(file) && !file.startsWith(`${APP_SRC}runtime/i18n/`)

const EXPECTED_MENUS = new Set(["app", "file", "edit", "view", "go", "window", "help"])

const EXPECTED_ACTIONS = new Set([
  "app.installCli",
  "app.relaunch",
  "edit.undo",
  "edit.redo",
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "edit.delete",
  "edit.selectAll",
  "view.reload",
  "view.toggleDevTools",
  "view.resetZoom",
  "view.zoomIn",
  "view.zoomOut",
  "view.toggleFullscreen",
  "window.new",
  "window.close",
  "window.minimize",
  "window.toggleMaximize",
])

const EXPECTED_ROLES = new Set([
  "about",
  "close",
  "copy",
  "cut",
  "hide",
  "hideOthers",
  "paste",
  "quit",
  "redo",
  "reload",
  "resetZoom",
  "selectAll",
  "toggleDevTools",
  "togglefullscreen",
  "undo",
  "unhide",
  "windowMenu",
  "zoomIn",
  "zoomOut",
])

const EXPECTED_HREFS = new Set([
  "https://opencode.ai/v2/docs",
  "https://discord.com/invite/opencode",
  "https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml",
  "https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml",
])

// The menu references exactly 13 distinct commands (15 references; settings.open and
// logs.export each appear twice). 9 are registered somewhere in the closure, 4 are
// the upstream desktop-face dangling commands (registered NOWHERE).
const EXPECTED_COMMAND_REFS = new Set([
  "session.new",
  "settings.open",
  "logs.export",
  "fileTree.toggle",
  "common.goBack",
  "common.goForward",
  "session.previous",
  "session.next",
  "terminal.toggle",
  "project.open",
  "project.previous",
  "project.next",
  "sidebar.toggle",
])

const REGISTERED_REFS: [string, string, string][] = [
  ["session.new", SESSION_CMDS_TSX, 'id: "session.new",'],
  ["settings.open", SETTINGS_CMD_TSX, 'id: "settings.open",'],
  ["logs.export", DESKTOP_TSX, 'id: "logs.export",'],
  ["fileTree.toggle", SESSION_CMDS_TSX, 'id: "fileTree.toggle",'],
  ["common.goBack", TITLEBAR_TSX, 'id: "common.goBack",'],
  ["common.goForward", TITLEBAR_TSX, 'id: "common.goForward",'],
  ["session.previous", TAB_STRIP_TSX, 'id: "session.previous",'],
  ["session.next", TAB_STRIP_TSX, 'id: "session.next",'],
]

const UNREGISTERED_REFS = ["project.open", "project.previous", "project.next", "sidebar.toggle"]

// The `command.project.open` i18n key's NON-i18n consumers: exactly these four UI
// title faces (plan v1.1/R2), none of which is a command registration.
const PROJECT_OPEN_CONSUMERS = new Set([
  "vendor/upstream/packages/app/src/home/projects/controller.tsx",
  "vendor/upstream/packages/app/src/workspaces/selection/dialog.tsx",
  "vendor/upstream/packages/app/src/new-session/project/selector.tsx",
  "vendor/upstream/packages/app/src/settings/workspaces/projects.tsx",
])

// --- 1. DESKTOP_MENU data face (menus / actions / roles / hrefs / three helpers) ---
{
  const menu = await read(DESKTOP_MENU_TS)

  const menuIds = new Set<string>()
  for (const m of menu.matchAll(/\n    id: "([a-z]+)",/g)) menuIds.add(m[1]!)
  setEq(menuIds, EXPECTED_MENUS, "1: DESKTOP_MENU menu-id set")

  const actionStart = menu.indexOf("export type DesktopMenuAction =")
  const roleStart = menu.indexOf("export type DesktopMenuRole =")
  const itemStart = menu.indexOf("export type DesktopMenuItem =")
  if (actionStart < 0 || roleStart < 0 || itemStart < 0) fail("1: desktop-menu.ts lost the action/role/item type declarations")
  const actionSegment = menu.slice(actionStart, roleStart)
  const roleSegment = menu.slice(roleStart, itemStart)

  const declaredActions = new Set<string>()
  for (const m of actionSegment.matchAll(/\| "([^"]+)"/g)) declaredActions.add(m[1]!)
  setEq(declaredActions, EXPECTED_ACTIONS, "1: DesktopMenuAction union set")
  const declaredRoles = new Set<string>()
  for (const m of roleSegment.matchAll(/\| "([^"]+)"/g)) declaredRoles.add(m[1]!)
  setEq(declaredRoles, EXPECTED_ROLES, "1: DesktopMenuRole union set")

  // Every action value USED by the DESKTOP_MENU data must be a declared union member
  // (this is negative example 1's tripwire: an injected action re-opens the set).
  const usedActions = new Set<string>()
  for (const m of menu.slice(menu.indexOf("export const DESKTOP_MENU")).matchAll(/action: "([^"]+)"/g)) usedActions.add(m[1]!)
  for (const action of usedActions) {
    if (!EXPECTED_ACTIONS.has(action)) fail(`1: DESKTOP_MENU uses action ${JSON.stringify(action)} that is not a declared DesktopMenuAction (menu data changed — re-run the mapping tables)`)
  }

  const hrefs = new Set<string>()
  for (const m of menu.matchAll(/href: "([^"]+)"/g)) hrefs.add(m[1]!)
  setEq(hrefs, EXPECTED_HREFS, "1: DESKTOP_MENU href set")

  for (const anchor of [
    "export function desktopMenuVisible(",
    "export function desktopMenuKey(",
    "export function desktopMenuWithPlugins<",
  ]) {
    if (!menu.includes(anchor)) fail(`1: desktop-menu.ts lost the helper anchor ${JSON.stringify(anchor)}`)
  }

  // The app menu is macOS-gated; the file-menu settings.open entry is windows-gated
  // (the ONLY platforms:["windows"] occurrence in the data).
  if (!raw(menu).includes(raw(`id: "app", labelKey: "desktop.menu.app", platforms: ["macos"],`)))
    fail("1: desktop-menu.ts lost the app-menu macos platform gate")
  if (!raw(menu).includes(raw(`command: "settings.open", accelerator: { windows: "Ctrl+," }, platforms: ["windows"]`)))
    fail("1: desktop-menu.ts lost the settings.open windows accelerator/platform gate")
  const windowsGateCount = menu.split('platforms: ["windows"]').length - 1
  if (windowsGateCount !== 1) fail(`1: desktop-menu.ts platforms:["windows"] count drifted (expected exactly 1, got ${windowsGateCount})`)

  const desktop = await read(DESKTOP_TSX)
  if (!desktop.includes("if (platform.platform !== \"desktop\" || !platform.exportDebugLogs) return commands"))
    fail("1: desktop.tsx lost the logs.export desktop platform gate")
  if (!desktop.includes('id: "logs.export",')) fail("1: desktop.tsx lost the logs.export registration")
}

// --- 2. Registration reconciliation (the no-dangling master assertion) ---
{
  const menu = await read(DESKTOP_MENU_TS)
  const refs: string[] = []
  for (const m of menu.matchAll(/command: "([^"]+)"/g)) refs.push(m[1]!)
  if (refs.length !== 15) fail(`2: DESKTOP_MENU command-reference count drifted (expected exactly 15, got ${refs.length})`)
  const uniqueRefs = new Set(refs)
  setEq(uniqueRefs, EXPECTED_COMMAND_REFS, "2: DESKTOP_MENU command-reference unique set")

  for (const [id, file, anchor] of REGISTERED_REFS) {
    const source = await read(file)
    if (!source.includes(anchor)) fail(`2: registered menu command ${id} lost its registration anchor ${JSON.stringify(anchor)} in ${file}`)
  }

  // terminal.toggle is plugin-published: the terminal index exports the shared
  // `terminalToggleCommand` ({ id: "toggle", bind }) and the renderer spreads it with its
  // slash entry; the host republishes it as `${plugin}.${id}` (issue #67 v2.2.1 shape).
  const terminalIndex = await read("vendor/upstream/packages/gui-plugins/src/terminal/index.ts")
  if (!terminalIndex.includes('id: "toggle",'))
    fail("2: terminal index lost the toggle command id anchor")
  const terminalRenderer = await read(TERMINAL_RENDERER)
  if (!terminalRenderer.includes('slash: { name: "terminal", after: "open" },'))
    fail("2: terminal renderer lost the toggle command slash anchor")
  const extCmds = await read(EXT_CMDS_TSX)
  if (!extCmds.includes('id: `${item.plugin}.${item.value.id}`,'))
    fail("2: plugin/commands.tsx lost the ${plugin}.${id} publish template (issue #67 host rename)")

  // The 4 dangling commands are registered NOWHERE in the data-face domain
  // (no `id: "<ref>"` registration shape anywhere in app/src non-test sources).
  const domainFiles = (await listFiles(APP_SRC)).filter(DATA_FACE_DOMAIN)
  for (const dir of domainFiles) await readCached(dir)
  for (const id of UNREGISTERED_REFS) {
    const holders = domainFiles.filter((file) => cache.get(file)!.includes(`id: "${id}"`))
    if (holders.length > 0) fail(`2: menu command ${id} gained a registration (dangling-set re-review required): ${holders.join(", ")}`)
  }

  // Doc-side one-to-one: the reconciliation table in commands-menus.md must carry a
  // row per dangling command (doc missing row = FAIL).
  const cm = await read(CM_DOC)
  for (const id of UNREGISTERED_REFS) {
    if (!cm.includes(`\`${id}\` | **未注册**`)) fail(`2: commands-menus.md reconciliation table lost the dangling row for ${id}`)
  }

  // `command.project.open` i18n key consumers: exactly the four UI-title faces
  // outside the i18n definition domain (plan v1.1/R2; zero `command.register`
  // consumption is implied by the registration-shape negative above).
  const nonI18nFiles = (await listFiles(APP_SRC)).filter(NON_I18N_DOMAIN)
  for (const dir of nonI18nFiles) await readCached(dir)
  const consumers = nonI18nFiles.filter((file) => cache.get(file)!.includes("command.project.open"))
  setEq(new Set(consumers), PROJECT_OPEN_CONSUMERS, "2: command.project.open non-i18n consumer file set")
}

// --- 3. window.* single-window ruling (acceptance 2 body) ---
{
  const domainFiles = (await listFiles(APP_SRC)).filter(DATA_FACE_DOMAIN)
  for (const dir of domainFiles) await readCached(dir)
  const windowFormFiles = domainFiles.filter((file) => /window\.(new|close|minimize|toggleMaximize)/.test(cache.get(file)!))
  setEq(
    new Set(windowFormFiles),
    new Set([DESKTOP_MENU_TS]),
    "3: window.* form scan over app/src data-face domain (data declaration must stay the ONLY face)",
  )

  // The upstream test's "window.new" literal is the declared SECOND non-data-face hit
  // (test reference, windows-menu.test.ts:6 — explicitly domain-excluded, plan v1.1/R6).
  const windowsMenuTest = await read(WINDOWS_MENU_TEST)
  if (!windowsMenuTest.includes('"window.new",')) fail("3: windows-menu.test.ts lost the window.new accelerator test literal (declared second non-data-face hit)")

  const web = await read(WEB_TS)
  if (web.includes("runDesktopMenuAction"))
    fail("3: web.ts gained a runDesktopMenuAction implementation (window.* ruling re-review required — negative example 3's tripwire)")

  const platform = await read(PLATFORM_TSX)
  if (!platform.includes("runDesktopMenuAction?(action: DesktopMenuAction)"))
    fail("3: platform.tsx lost the runDesktopMenuAction optional-member declaration")
  if (!platform.includes("/** Webview zoom level (desktop only) */"))
    fail("3: platform.tsx lost the webviewZoom desktop-only comment anchor")

  const titlebar = await read(TITLEBAR_TSX)
  if (!titlebar.includes("<Show when={windows() || linux()}>"))
    fail("3: titlebar.tsx lost the WindowsAppMenu mount gate (windows() || linux())")
  if (!titlebar.includes('const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")'))
    fail("3: titlebar.tsx lost the windows os memo (platform.platform === desktop)")
  if (!titlebar.includes('const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux")'))
    fail("3: titlebar.tsx lost the linux os memo (platform.platform === desktop)")

  const windowsMenu = await read(WINDOWS_MENU_TSX)
  if (!windowsMenu.includes("export function windowsMenuAccelerator(event: KeyboardEvent)"))
    fail("3: windows-menu.tsx lost the accelerator resolver export")
  if (!raw(windowsMenu).includes(raw("onMount(() => { makeEventListener( document, \"keydown\",")))
    fail("3: windows-menu.tsx lost the onMount-scoped accelerator keydown listener (web never mounts -> zero listening)")
}

// --- 4. Edit / zoom / navigation families ---
{
  // Cross-reference declarations (NOT re-locked): session.undo/redo slash pair first
  // locks live in verify-diff group 3 + verify-interaction-quality group 5; M-020
  // readClipboardImage first lock lives in verify-attachments-artifacts.
  const web = await read(WEB_TS)
  if (!web.includes("readClipboardImage: createPlatformClipboardReader(),"))
    fail("4: web.ts lost the M-020 readClipboardImage wiring anchor")

  const terminal = await read(TERMINAL_TSX)
  if (!terminal.includes('document.execCommand("copy")'))
    fail("4: terminal.tsx lost the execCommand copy anchor")
  if (!terminal.includes("// allow for toggle terminal keybinds in parent"))
    fail("4: terminal.tsx lost the toggle-terminal-keybinds parent comment anchor")

  // select-all negative (plan v1.1/R1 caliber, narrowed to the command-registration
  // face): the selectAll FORM may appear only in the menu data face and the
  // search-keydown internal helper — the 59-locale i18n label-key domain is excluded
  // by declaration (three-class enumeration). A new file in this set = a new
  // select-all face -> re-review the gap registration.
  const domainFiles = (await listFiles(APP_SRC)).filter(NON_I18N_DOMAIN)
  for (const dir of domainFiles) await readCached(dir)
  const selectAllFiles = domainFiles.filter((file) => cache.get(file)!.includes("selectAll"))
  setEq(
    new Set(selectAllFiles),
    new Set([DESKTOP_MENU_TS, SEARCH_KEYDOWN]),
    "4: selectAll form file set (menu data + search-box internal helper ONLY)",
  )

  const mainActivity = await read(MAIN_ACTIVITY)
  if (/setSupportZoom|setTextZoom|setInitialScale/.test(mainActivity))
    fail("4: MainActivity.kt gained a zoom configuration (zoom ruling re-review required)")

  const indexHtml = await read(INDEX_HTML)
  // The four-segment viewport anchor itself is first-locked by verify-interaction-quality
  // group 3; only the user-scalable NEGATIVE is first-locked here.
  if (indexHtml.includes("user-scalable"))
    fail("4: index.html viewport gained a user-scalable directive (zoom/pinch ruling re-review required)")

  const titlebar = await read(TITLEBAR_TSX)
  const goBackCount = titlebar.split("common.goBack").length - 1
  if (goBackCount !== 2)
    fail(`4: titlebar.tsx common.goBack occurrence drift (expected exactly 2 = id line + title line, got ${goBackCount}) — a new wiring face appeared, re-review the in-app back/forward mapping row`)
  if (!titlebar.includes('id: "common.goForward",')) fail("4: titlebar.tsx lost the common.goForward registration")

  const history = await read(HISTORY_TS)
  for (const anchor of ["export const MAX_TITLEBAR_HISTORY = 100", "export function backPath(", "export function forwardPath("]) {
    if (!history.includes(anchor)) fail(`4: history.ts lost the anchor ${JSON.stringify(anchor)}`)
  }
}

// --- 5. Enablement five-layer chain (no-dangling structure) ---
{
  const command = await read(COMMAND_TSX)
  if (!raw(command).includes(raw("return options.filter( (option) => !option.disabled && !option.hidden && !option.id.startsWith(SUGGESTED_PREFIX) && option.id !== \"file.open\", )")))
    fail("5: command.tsx lost the commandPaletteOptions disabled+hidden filter (layer 1)")
  if (!raw(command).includes(raw("export function commandPaletteOptions(options: CommandOption[])")))
    fail("5: command.tsx lost the commandPaletteOptions export")

  const composerModel = await read(COMPOSER_MODEL_TS)
  if (!composerModel.includes('.filter((item) => !item.disabled && !item.id.startsWith("suggested.") && item.slash)'))
    fail("5: composer/model.ts lost the slash-list disabled filter (layer 2)")

  const palette = await read(PALETTE_TS)
  if (!palette.includes("const COMMON_COMMAND_IDS = [\"session.new\", \"workspace.new\", \"session.previous\", \"session.next\"] as const"))
    fail("5: palette.ts lost the COMMON_COMMAND_IDS preference list (workspace.new unregistered member)")
  if (!palette.includes("order.has(option.id)"))
    fail("5: palette.ts lost the order.has defensive skip (layer 3)")

  const extCmds = await read(EXT_CMDS_TSX)
  if (!extCmds.includes("disabled: item.value.enabled === false,"))
    fail("5: extension/commands.tsx lost the enabled===false -> disabled mapping (layer 4)")
  const registries = await read(REGISTRIES_TS)
  if (!registries.includes("/** False takes the command out of the palette and turns its keybind off. Defaults to true. Reactive. */"))
    fail("5: sdk/registries.ts lost the enabled-semantics verbatim comment")

  const windowsMenu = await read(WINDOWS_MENU_TSX)
  if (!windowsMenu.includes("const commandDisabled = (id: string) => {") || !windowsMenu.includes("if (!option) return true"))
    fail("5: windows-menu.tsx lost the commandDisabled unregistered->true face (layer 5, desktop-only)")

  const terminalRenderer = await read(TERMINAL_RENDERER)
  if (!terminalRenderer.includes("enabled: routed(),")) fail("5: terminal renderer lost the enabled: routed() gate")
  const browserRenderer = await read(BROWSER_RENDERER)
  if (!browserRenderer.includes("enabled: pane.visible()")) fail("5: browser renderer lost the enabled: pane.visible() gate")
  const debugRenderer = await read(DEBUG_RENDERER)
  if (!debugRenderer.includes("// Offered only while main answers: never on the web, and not while the plugin restarts."))
    fail("5: debug renderer lost the never-on-the-web verbatim comment")
  if (!debugRenderer.includes("if (desktop)")) fail("5: debug renderer lost the if (desktop) conditional registration (heap web-never-registered)")
}

// --- 6. State restoration & the Shortcuts face ---
{
  // Cross-reference declaration (NOT re-locked): the settings.v3 keybinds segment is
  // first-locked by verify-interaction-quality group 6.
  const command = await read(COMMAND_TSX)
  if (!command.includes('persisted(Persist.global("command.catalog.v1"), CommandCatalog, {})'))
    fail("6: command.tsx lost the command.catalog.v1 persisted store")
  if (!command.includes("const stale = untrack(() => Object.keys(keybindRenames).filter((id) => id in catalog))"))
    fail("6: command.tsx lost the keybindRenames stale-catalog cleanup")

  // The persisted catalog metadata struct strips executable fields: title/description/
  // category/section/keybind/slash/hidden + plugin/follows ONLY — no onSelect (upstream
  // command.test.ts block 1 locks this; the struct shape is anchored here; plugin/follows
  // are metadata for the Shortcuts page's plugin-filter/follower-collapse, issue #108 /
  // M-051 target form un-exports the declaration).
  const structStart = command.indexOf("const CommandCatalogItem = Persistence.struct({")
  if (structStart < 0) fail("6: command.tsx lost the CommandCatalogItem struct declaration")
  const structEnd = command.indexOf("\n})", structStart)
  const structSegment = command.slice(structStart, structEnd)
  for (const field of [
    "title: Schema.String,",
    "description: Schema.optional(Schema.String),",
    "category: Schema.optional(Schema.String),",
    "section: Persistence.optional(CommandSection),",
    "keybind: Schema.optional(Schema.String),",
    "slash: Schema.optional(Schema.String),",
    "hidden: Schema.optional(Schema.Boolean),",
    "plugin: Schema.optional(Schema.String),",
    "follows: Schema.optional(Schema.String),",
  ]) {
    if (!structSegment.includes(field)) fail(`6: CommandCatalogItem lost the persisted field ${JSON.stringify(field)}`)
  }
  if (structSegment.includes("onSelect"))
    fail("6: CommandCatalogItem gained an executable field (persisted catalog must stay metadata-only)")

  const keybinds = await read(KEYBINDS_TSX)
  if (!keybinds.includes("for (const opt of command.catalog) {"))
    fail("6: keybinds.tsx lost the command.catalog consumption loop (Shortcuts page lists commands while owners unmounted)")
  if (!keybinds.includes('Pick<CommandContext, "catalog" | "options">'))
    fail("6: keybinds.tsx lost the catalog/options context pick anchor")

  // Issue #108 / M-051: the Unbind face's i18n key is a positive pin (machine-checked,
  // not only device-visible) — en-only by target parity, so only en.ts is asserted.
  const en = await read(EN_TS)
  if (!en.includes('"settings.shortcuts.unbind": "Unbind",'))
    fail("6: en.ts lost the settings.shortcuts.unbind key (issue #108 Unbind button i18n)")
}

// --- 7. Docs closure anchors (anti doc<->code drift; commit-1 documents) ---
{
  const cm = await read(CM_DOC)
  for (const heading of [
    "## 一、权威边界与探针分工",
    "## 二、命令注册系统全景",
    "## 三、DESKTOP_MENU 七菜单映射主表（验收 1 本体）",
    "## 四、DesktopMenuAction 十九枚举映射",
    "## 五、window.* 单窗口裁定（验收 2 本体）",
    "## 六、编辑/缩放/导航三族移动实态",
    "## 七、enablement 与「no dangling」五层结构链（验收 3 本体）",
    "## 八、focus、无障碍与状态恢复",
    "## 九、Windows-only host 命令排除清单（per #1）",
    "## 十、诚实边界（本期不声称）",
  ]) {
    if (!cm.includes(heading)) fail(`7: commands-menus.md lost the section ${heading}`)
  }
  for (const sentence of [
    "冲突时以单元文档为准并按双向变更协议回修本文",
    "（第二十处落字）",
    "不得声称桌面菜单（`WindowsAppMenu`）或命令面板（mod+k）在移动壳可达",
    "不得声称 `window.*` 在壳内有任何实现或运行期行为",
    "不得混同两组 undo/redo 与两层 back/forward",
    "不得声称 zoom/全选在移动可用",
  ]) {
    if (!cm.includes(sentence)) fail(`7: commands-menus.md lost the key sentence "${sentence}"`)
  }
  for (const id of EXPECTED_COMMAND_REFS) {
    if (!cm.includes(`| \`${id}\` |`)) fail(`7: commands-menus.md reconciliation table lost the row for ${id}`)
  }
  for (const row of [
    "`window.new` | **排除**",
    "`window.close` | **OS 级映射**",
    "`window.minimize` | **OS 级映射**",
    "`window.toggleMaximize` | **N/A**",
  ]) {
    if (!cm.includes(row)) fail(`7: commands-menus.md lost the window.* ruling row "${row}"`)
  }
  if (!cm.includes("首锁 verify-interaction-quality 组 1"))
    fail("7: commands-menus.md lost the multi-window negative cross-reference declaration")

  const interaction = await read(INTERACTION_DOC)
  // Issue #26 revision (deliberate, NOT a bypass): the enumeration-title anchor moved
  // G1–G34 -> G1–G35 when the issue #26 G35 gate row was appended to interaction.md —
  // the anchor's coverage semantics (the enumeration must cover the FULL gate set) are
  // preserved.
  if (!interaction.includes("## G1–G35 设备门禁（完整枚举）"))
    fail("7: interaction.md gate enumeration must cover G1–G35")
  if (!interaction.includes("| G34 命令与菜单面运行期门禁（issue #24 **新设门禁**；命令菜单收口文档见 [commands-menus.md](commands-menus.md)）"))
    fail("7: interaction.md lost the G34 gate row")
  if (!interaction.includes("第二十处落字（issue #24）"))
    fail("7: interaction.md lost the twentieth honest wording (issue #24)")
  if (!interaction.includes("### 命令与菜单面失败路径（issue #24）"))
    fail("7: interaction.md lost the commands-menus failure-path subsection")

  const quality = await read(IQ_DOC)
  if (!quality.includes("命令与菜单面全景收口") || !quality.includes("[commands-menus.md](commands-menus.md)"))
    fail("7: interaction-quality.md lost the section-7 pointer to commands-menus.md")

  const readme = await read(DESIGN_README)
  if (!readme.includes("[commands-menus.md](commands-menus.md)"))
    fail("7: design README.md lost the commands-menus index row")

  const architecture = await read(ARCHITECTURE_DOC)
  if (!architecture.includes("[commands-menus.md](commands-menus.md)") || !architecture.includes("运行期归 G34"))
    fail("7: architecture.md lost the commands-menus flow-matrix row")
}

// --- 8. Build zero-touch declaration (mechanical witnesses; NO build inputs change) ---
{
  // Current Vite output is an exact first-lock cross-reference to verify-notifications
  // group 8. Earlier M-026/M-027/M-028 sizes remain historical measurements.
  const distManifest = JSON.parse(await read(WEB_DIST_MANIFEST)) as { fileCount?: number; totalBytes?: number }
  if (distManifest.fileCount !== 3520 || distManifest.totalBytes !== 159673641)
    fail(`8: current web-dist baseline drifted (expected 3520/159673641, got ${String(distManifest.fileCount)}/${String(distManifest.totalBytes)})`) // issue #109 measured (gui-extensions D4 resolution + label disambiguation M-052: same 3520 file count, +645 bytes — the two i18n label values "GUI extensions"/"GUI 扩展" + comment stripping ship inside existing chunks, zero new chunks); issue #108 measured (keybinds/command-catalog target form M-051: same 3520 file count, +7406 bytes — the Shortcuts unbind row + Unbind button + ghost-danger styles + command catalog/keymap core ship inside existing chunks, zero new chunks); issue #107 measured (notifications/sounds settings-page target form M-050: same 3520 file count, +1563 bytes — the sounds-interface row + catalog row restore + sound.ts export trim ship inside existing chunks, zero new chunks); issue #106 measured (projects/workspaces settings-page target form M-049: same 3520 file count, +97 bytes — the min-w-0/autofocus/registry-label page-form hunks ship inside existing chunks, zero new chunks); issue #105 measured (providers/models/extensions settings-page target migration M-048: +3 files = the mcp-dialog css chunk (search-list.css import) + the shared TruncatedText chunk (css/js/map netting out the removed panel.css); ExtensionPlugins ships in the renamed shell chunk, zero new files, +64134 bytes); issue #104 measured (ui theme component-family target-form trim M-047: the trimmed theme index barrel/loader/default-themes dead code previously only survived via tree-shaking, same 3517 file count, -1225 bytes); issue #103 measured (general/experimental preferences-page migration M-046: the new settings rows / i18n keys / timeline-width token block outweigh the removed terminalPlacement strings, same 3517 file count, +1994 bytes); issue #102 measured (servers-page target migration M-045: the servers.tsx/row.tsx target deletions outweigh the additions, same 3517 file count, -7497 bytes; prior 3517/159606524 = issue #101's settings-framework migration M-042..M-044, +1 chunk/+59859; prior 3516/159546665 = issue #96's first-party toggle-semantics fix rebuild, prior 3516/159545922); issue #76 measured (M-041 openExternal bridge call, prior 3516/159542455); issue #90 measured (amended M-037 + Fix B, prior 3516/159542120); issue #72 measured: the About version face + notices v2.2.1 line grow the payload (issue #70 measured 3516/159535257; issue #67 measured 3516/159532385 — historical)
  // Cross-reference the exact registered JSON IDs and paths, not arbitrary M-### text in
  // reasons/verification prose. verify-attachments-artifacts group 6 is the first lock.
  const patchManifest = JSON.parse(await read(PATCHES_MANIFEST)) as {
    patches?: Array<{ id?: unknown; patch?: unknown; upstreamBaseline?: unknown }>
  }
  const patchRows = patchManifest.patches ?? []
  const registeredIds = patchRows.map((entry) => entry.id).filter((value): value is string => typeof value === "string")
  const patchIds = new Set(registeredIds)
  // Issue #102 / M-045: 43 registered = M-001..M-045 with M-019 and M-039 reserved-absent.
  // Issue #103 / M-046 (general/experimental preferences-page target migration).
  // Issue #104 / M-047 (ui theme component-family target-form trim). Issue #105:
  // M-048 by the providers/models/extensions settings-page target migration. Issue #106:
  // M-049 by the projects/workspaces settings-page target form. Issue #107:
  // M-050 by the notifications/sounds settings-page target form (sounds-interface
  // search row restored) -> 48. Issue #108: M-051 by the keybinds/command-catalog
  // target form -> 49. Issue #109: M-052 by the gui-extensions D4 resolution (tab kept)
  // and the label disambiguation -> 50.
  const expectedPatches = new Set<string>()
  for (let i = 1; i <= 52; i++) {
    // M-019 reserved-absent since issue #16. M-035 registered by #65, M-036 by #66,
    // M-037 by #67, M-038 by #70, M-040 by #72, M-041 by #76; M-042..M-044 by #101,
    // M-045 by #102, M-046 by #103, M-047 by #104, M-048 by #105, M-049 by #106,
    // M-050 by #107 (count 48), M-051 by #108 (count 49), M-052 by #109 (count 50);
    // M-039 reserved for the parallel issue #71 branch (hole tolerated at apply time,
    // M-019/0031 precedent).
    if (i === 19 || i === 39) continue
    expectedPatches.add(`M-${String(i).padStart(3, "0")}`)
  }
  if (patchRows.length !== 50 || registeredIds.length !== patchRows.length || patchIds.size !== patchRows.length)
    fail(`8: registered patch rows/IDs must be unique and exactly 50 (got rows=${patchRows.length}, IDs=${registeredIds.length}, unique=${patchIds.size})`)
  setEq(patchIds, expectedPatches, "8: mobile patch id set (50 registered, M-019/M-039 reserved-absent)")
  if (patchRows.some((entry) => typeof entry.upstreamBaseline !== "string" || !entry.upstreamBaseline))
    fail("8: every registered mobile patch must retain its upstreamBaseline")
  const vendorManifest = JSON.parse(await read(VENDOR_MANIFEST)) as { mobilePatches?: unknown }
  const vendorPaths = Array.isArray(vendorManifest.mobilePatches)
    ? vendorManifest.mobilePatches.filter((value): value is string => typeof value === "string")
    : []
  const patchPaths = patchRows.map((entry) => entry.patch).filter((value): value is string => typeof value === "string")
  const sortedVendorPaths = vendorPaths.toSorted()
  const sortedPatchPaths = patchPaths.toSorted()
  if (vendorPaths.length !== 50 || new Set(vendorPaths).size !== 50 || patchPaths.length !== 50 ||
      sortedVendorPaths.some((value, index) => value !== sortedPatchPaths[index]))
    fail("8: vendor-manifest mobilePatches paths must equal the 50 unique registered patch paths")

  // bun.lock workspace registration anchor (zero-change itself is V-lock's git-diff
  // evidence in build-and-verify.md — this only proves the seam package is registered).
  const bunLock = await read(BUN_LOCK)
  if (!bunLock.includes("packages/mobile-hosts"))
    fail("8: bun.lock lost the mobile-hosts workspace registration anchor")
}

console.log(
  "verify-commands-menus: PASS (" +
    "1: DESKTOP_MENU data face — menu-id set {app,file,edit,view,go,window,help} + DesktopMenuAction 19-union + DesktopMenuRole 19-union + used-actions subset-of-union + href exactly-4 set + desktopMenuVisible/Key/WithPlugins helpers + app macos gate + settings.open windows gate (exactly-1) + logs.export desktop platform gate; " +
    "2: registration reconciliation — menu command refs exactly 15/unique 13 set + Registered 9 with per-file anchors (incl. terminal.toggle extension publish double anchor) + Unregistered 4 zero-registration negative + doc dangling-row one-to-one + command.project.open four-consumer file-set equality; " +
    "3: window.* single-window — window.* form scan exactly {desktop-menu.ts} + windows-menu.test.ts declared test-reference hit + web.ts zero runDesktopMenuAction negative + platform.tsx optional-member/webviewZoom anchors + titlebar windows()/linux() memos + mount gate + onMount accelerator scope; " +
    "4: edit/zoom/nav families — M-020 wiring anchor + terminal execCommand copy + parent-toggle comment + selectAll form file-set exactly {desktop-menu, search-keydown} (i18n label-key domain excluded by declaration) + MainActivity zero zoom-configuration negative + viewport zero user-scalable negative (four-segment anchor cross-referenced to viq group 3) + common.goBack exactly-2 drift sentinel + history.ts three anchors; " +
    "5: enablement five layers — commandPaletteOptions filter + composer slash disabled filter + COMMON_COMMAND_IDS/order.has skip + extension enabled===false mapping + registries verbatim comment + windows-menu commandDisabled face + terminal/browser/debug enabled gates + never-on-the-web comment; " +
    "6: state restoration — command.catalog.v1 persisted store + keybindRenames cleanup + CommandCatalogItem metadata-only struct (no onSelect; plugin/follows metadata fields, issue #108) + keybinds.tsx catalog consumption (settings.v3 segment cross-referenced to viq group 6) + en.ts unbind key positive pin (issue #108); " +
    "7: docs closure — commands-menus.md ten sections + authority + four 不得声称 + 13-row table + four window.* rows + multi-window cross-reference, interaction.md G1–G35 + G34 row + twentieth wording + failure path, interaction-quality.md section-7 pointer, design README index, architecture flow row; " +
     "8: build witnesses — current dist baseline 3520/159673641 (issue #109 gui-extensions D4 resolution + label disambiguation incl. M-052, +645 bytes at the same 3520 file count — the two tab-label i18n values 'GUI extensions'/'GUI 扩展' + comment stripping inside existing chunks; prior 3520/159672996 = issue #108 keybinds/command-catalog target form incl. M-051, +7406 bytes at the same 3520 file count — Shortcuts unbind key/Unbind button + ghost-danger ui variant + command catalog plugin/follows fields + commandKeymap custom-priority inside existing chunks; prior 3520/159665590 = issue #107 notifications/sounds settings-page target form incl. M-050, +1563 bytes at the same 3520 file count — sounds-interface row + catalog restore + sound.ts trim inside existing chunks; prior 3520/159664027 = issue #106 projects/workspaces settings-page target form incl. M-049, +97 bytes at the same 3520 file count — the page-form hunks ship inside existing chunks; prior 3520/159663930 = issue #105 providers/models/extensions settings-page target migration incl. M-048, +3 files/+64134 bytes — new lazy chunks from the migrated mcp-dialog/extension-plugins faces; prior 3517/159599796 = issue #104 ui theme component-family target-form trim incl. M-047, -1225 bytes at the same 3517 file count — dead code previously only survived via tree-shaking; prior 3517/159601021 = issue #103 general/experimental preferences-page migration incl. M-046, +1994 bytes at the same 3517 file count; prior 3517/159599027 = issue #102 servers-page target migration incl. M-045, prior 3517/159606524 = issue #101 settings-framework migration incl. M-042..M-044, prior 3516/159546665 = issue #96 toggle-semantics fix rebuild, prior 3516/159545922; issue #76 incl. M-041, prior 3516/159542455; issue #90 incl. amended M-037 + Fix B, prior 3516/159542120; issue #72 incl. M-040; cross-reference verify-notifications group 8; issue #70 incl. M-038 3516/159535257, issue #67 incl. M-037 3516/159532385, issue #66 incl. M-036 3493/153776571, issue #65 rebuild incl. M-035 3482/153654746, issue #64 fix round 153638138 (first build 153638140), issue #63 baseline 153581483, issue #62 rebuild 153563460, M-028 3482/153447934, M-027 3482/153445727 and M-026 3480/153441733 remain historical) + exact registered patch set 50 with M-019/M-039 absent and vendor paths equal (cross-reference verify-attachments-artifacts; counts M-026=25, M-028=27, M-032=31, M-033=32, M-034=33, M-035=34, M-036=35, M-037=36, M-038=37, M-040=38, M-041=39, M-042=40, M-043=41, M-044=42, M-045=43, M-046=44, M-047=45, M-048=46, M-049=47, M-050=48, M-051=49, M-052=50) + bun.lock workspace anchor; " +    "STATIC check - command discoverability, menu-face absence, window.* semantics, long-press edit menus, pinch zoom, back/forward layering, no-dangling behavior and state restoration on a device are G34; Windows runtime menu evidence belongs to issue #1)",
)
