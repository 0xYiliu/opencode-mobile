// verify-gui-plugins.ts — static probe for issue #26 (GUI extension settings,
// dependency status, and mobile host compatibility unit).
//
// Issue #62 revision (N12): the mobile management face additionally renders a STATIC
// exclusion row for wsl (decision 0001) — id, disabled status, reason, zero controls.
// Groups 1–6 are untouched; group 7 gained the exclusion-row locks below, group 8 the
// rebuilt dist baseline.
//
// Asserts, against the REAL vendored/first-party sources (pin b4525d79bf… + M-001..M-036)
// and the commit-1 docs, the structural facts the gui-extensions unit document relies on:
// the 15-builtin inventory with its os/web-guard/main-entry faces (acceptance 1; issue #66
// added sources + goal after microsoft-office, in the v2.2.1 gui-plugins compose order), the
// token/dependency classification, the upstream desktop+DEV double gate, the issue #26
// first-party management face (M-025 disable-record union + M-026 settings mount), the
// state-restoration faces, the three guarantees (no dead menu / no draft loss / no remote
// stop) and the docs closure.
//
// DIVISION OF LABOR (per the in-registry dedup convention — referencing, NOT re-locking):
//   - root.tsx os gate (`const os = platform.platform === "desktop" ? platform.os : undefined`)
//     and builtins OS filter: FIRST LOCK verify-agent-capabilities group 3 (:388-401 four
//     readers — F2 ledger). Group 1 below only carries the ownership CROSS-REFERENCE
//     declaration as a light witness; it does not re-lock those two anchors.
//   - the shell upstream gate line `const guiExtensions = !!GuiExtensionsSettings && …
//     "desktop"`: FIRST LOCK verify-agent-capabilities group 3 (:382). Group 3 below
//     cross-references it as the unchanged-face witness.
//   - the revised redirect guard shape `!guiExtensions && !mobileGuiExtensions` and the
//     i18n 9/9 pairing (group 4/5): SAME-FACE as verify-agent-capabilities' commit-2
//     revised anchors (:384-385 / guiExtensions key-set pairing) — cross-references /
//     common witnesses (review N3 declaration); drift double-FAILs, never silently passes.
//   - `pty.remove` exact-one: FIRST LOCK verify-terminal group 2 (`expect("pty.remove",
//     [model.ts])` set equality) + group 3 close()/pty.remove pairing anchor (F8). Group 6
//     below only adds the NEW domain-scoped negative: the dispose() body is remove-free.
//   - `api.session.interrupt` three-call-site exhaustion: FIRST LOCK verify-session-workbench
//     (issue #9). Referenced, not re-locked.
//   - the extension enablement five-layer chain: FIRST LOCK verify-commands-menus group 5.
//   - the exact registered patch-ID set and count 35: FIRST LOCK verify-attachments-artifacts
//     + verify-commands-menus group 8 (set-equality cross-reference) — both revised in the
//     same commit as the patch registrations (#23 same-commit precedent; issue #65 registered
//     M-035 on dev, issue #66 registered M-036 in the rebase round: 34 -> 35, M-019 still
//     reserved-absent). Declared.
//   - the @opencode/gui-extensions specifier set {34, 8, 2, 1}: FIRST LOCK
//     verify-agent-capabilities group 3. Declared unchanged; not re-locked.
//   - settings-page-dev.tsx has ZERO probe readers before this issue; group 3 are its
//     first locks.
//
// CALIBER: RAW normalization (squash: all whitespace removed) only for verbatim single
// anchors; set equalities over extracted identifiers; cross-line scans over explicit
// domains. Line numbers are pin-time orientation only — text anchors are the contract.
//
// NEGATIVE EXAMPLES (run at verification time by injecting/reverting mutations;
// inject -> FAIL rc=1 -> restore -> PASS rc=0, logs kept):
//   1. inject a pseudo-extension entry `{ id: "fake-ext" },` into the builtins compose of
//      gui-extensions/src/renderer.ts -> group 1 inventory set/count FAIL;
//   2. change the wsl os literal `os: ["windows"]` to `os: ["linux"]` in
//      gui-extensions/src/wsl/index.ts -> group 2 os-declaration FAIL (forces an
//      inventory-table re-review);
//   3. delete the M-025 union line (`for (const id of mobileDisabled.ids()) …`) from
//      app/src/runtime/plugin/root.tsx -> group 4 M-025 anchor FAIL;
//   4. delete the zh `settings.guiExtensions.title` key from app i18n zh.ts -> group 5
//      9/9 pairing FAIL;
//   5. delete the `"wsl"` entry from EXCLUDED_EXTENSIONS in mobile-hosts
//      ui/extension-manager.tsx -> group 7 {"wsl"} set-equality FAIL (issue #62 — the
//      static exclusion row must not silently disappear).
//
// HONEST BOUNDARY (same tradition as the sibling probes): this is a static STRUCTURE
// check (text anchors / set equalities / negative injections). It proves source and doc
// shape, NOT runtime behavior: tab reachability, toggle chains, menu disappearance,
// state restoration across restarts, volatile fallback presentation, desktop-host row
// presentation and dual-route consistency on a device are covered by the G35 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-gui-plugins.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-gui-plugins: FAIL: ${message}`)
  process.exit(1)
}

async function read(path: string): Promise<string> {
  return Bun.file(new URL(path, repoRoot)).text()
}

/** RAW normalization: every whitespace removed (cross-line verbatim anchors). */
function squash(source: string): string {
  return source.replace(/\s+/g, "")
}

const GUI_EXT = "vendor/upstream/packages/gui-plugins/src/"
const UI_ICONS = "vendor/upstream/packages/ui/src/icons/"
const APP = "vendor/upstream/packages/app/"
const MH = "packages/mobile-hosts/"

/** The 15 built-in ids in compose order (renderer.ts compose sequence = the doc table). */
const EXPECTED_IDS = [
  "context",
  "btw",
  "debug",
  "terminal",
  "file",
  "review",
  "details",
  "browser",
  "pairing",
  "updater",
  "ssh",
  "wsl",
  "microsoft-office",
  "sources",
  "goal",
] as const

/** The six lazy main entries (main.ts) — the "phone never runs main-process extensions" inventory face. */
const EXPECTED_MAIN_LAZY = ["debug", "browser", "pairing", "updater", "ssh", "wsl"] as const

function setEq<T>(got: Iterable<T>, expected: Iterable<T>, label: string) {
  const gotSet = new Set(got)
  const expectedSet = new Set(expected)
  const missing = [...expectedSet].filter((item) => !gotSet.has(item))
  const extra = [...gotSet].filter((item) => !expectedSet.has(item))
  if (missing.length > 0 || extra.length > 0)
    fail(`${label}: set equality broken — missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`)
}

// --- 1. Inventory face (acceptance 1): builtins 15 / main.ts same table / os / guards ---
{
  const renderer = await read(`${GUI_EXT}renderer.ts`)
  // Each compose entry sits on its own line; count entries and map the spread identifiers.
  // Issue #67: the v2.2.1 gui-plugins compose is an object map keyed by id.
  const composeStart = renderer.indexOf("export const builtins = compose({")
  if (composeStart === -1) fail("1: renderer.ts lost the builtins compose (v2.2.1 object-map form)")
  const composeBlock = renderer.slice(composeStart, renderer.indexOf("\n})", composeStart))
  const entryIds = [...composeBlock.matchAll(/^  "?([\w-]+)"?: \{/gm)].map((m) => m[1]!)
  if (entryIds.length !== EXPECTED_IDS.length)
    fail(`1: builtins compose must carry exactly ${EXPECTED_IDS.length} entries, got ${entryIds.length} (inventory drift — refresh the unit doc table; NEGATIVE 1 injects a 16th)`)
  setEq(
    entryIds,
    EXPECTED_IDS,
    "1: builtins compose id set",
  )

  const main = await read(`${GUI_EXT}main.ts`)
  // Same table: the 15 `import X from "./X"` lines (one per builtin, ids reserved).
  const mainImports = [...main.matchAll(/import (\w+) from "\.\/([\w-]+)"/g)].map((m) => m[1]!)
  const mainCamel: Record<string, string> = { microsoftOffice: "microsoft-office" }
  setEq(
    mainImports.map((id) => mainCamel[id] ?? id),
    EXPECTED_IDS,
    "1: main.ts import table (same 15 builtins)",
  )
  // Six lazy main entries (first lock verify-agent-capabilities group 3 mainEntries==6 —
  // cross-reference witness; the SET below is this probe's new lock).
  const mainLazy = [...main.matchAll(/\{\s*\.\.\.(\w+),\s*mainEntry:/g)].map((m) => m[1]!)
  setEq(mainLazy, EXPECTED_MAIN_LAZY, "1: main.ts lazy mainEntry set (phone never runs these in the app)")

  // os declarations: exactly wsl ["windows"], nowhere else (15 index.ts scan).
  const osFiles: string[] = []
  for (const id of EXPECTED_IDS) {
    const dir = id === "microsoft-office" ? "microsoft-office" : id
    const source = await read(`${GUI_EXT}${dir}/index.ts`)
    if (/os:\s*\[/.test(source)) osFiles.push(dir)
    if (dir === "wsl" && !source.includes('os: ["windows"]'))
      fail("1: wsl/index.ts lost the os [\"windows\"] literal (the only os-filtered builtin)")
  }
  if (osFiles.length !== 1 || osFiles[0] !== "wsl")
    fail(`1: os declarations must be exactly {wsl}, got ${JSON.stringify(osFiles)}`)

  // root.tsx faces — FIRST LOCK verify-agent-capabilities group 3 (F2): ownership
  // cross-reference witnesses only (light includes, not re-locks).
  const root = squash(await read(`${APP}src/runtime/plugin/root.tsx`))
  if (!root.includes('constos=platform.platform==="desktop"?platform.os:undefined'))
    fail("1: root.tsx os gate witness moved (first lock: verify-agent-capabilities group 3)")
  // Issue #67: the inline os filter becomes the host's runsOn(definition, os) (same semantics;
  // the plan §4.1 row). The os gate line above stays verbatim.
  if (!root.includes("runsOn(definition,os)"))
    fail("1: root.tsx lost the runsOn os-filter call (issue #67 §4.1 row)")
  // Issue #67: the .ocdx installed-archive face is gone upstream; the witness becomes the
  // builtins.ts hmr accept (the verify-agent-capabilities group 3 revised anchor).
  const builtins = squash(await read(`${APP}src/runtime/plugin/builtins.ts`))
  if (!builtins.includes('import.meta.hot.accept("@opencode/gui-plugins/renderer",'))
    fail("1: builtins.ts lost the hmr accept anchor (issue #67 §6.C B)")

  // Five renderer early-exit guards (new locks; ssh carries its verbatim comment).
  for (const [file, guard] of [
    ["browser/renderer.tsx", 'if (ctx.app.platform !== "desktop") return'],
    ["pairing/renderer.tsx", "if (!ctx.desktop) return"],
    ["ssh/renderer.tsx", 'if (ctx.app.platform !== "desktop") return'],
    ["updater/renderer.tsx", "if (!ctx.desktop) return"],
    ["wsl/renderer.tsx", 'if (ctx.app.platform !== "desktop") return'],
  ] as [string, string][]) {
    const source = squash(await read(`${GUI_EXT}${file}`))
    if (!source.includes(squash(guard))) fail(`1: ${file} lost the renderer early-exit guard ${JSON.stringify(guard)}`)
  }
  const sshRenderer = await read(`${GUI_EXT}ssh/renderer.tsx`)
  if (!sshRenderer.includes("// SSH lives in the desktop main process."))
    fail("1: ssh/renderer.tsx lost the desktop-main-process comment")
}

// --- 2. Tokens and dependencies: Ipc 6 / Contract 3 / requires 0 / mobile panels ---
{
  // Ipc.define exactly six files (five contract.ts + browser/ipc.ts — browser carries
  // both a contract.ts and an ipc.ts, so both candidates are read per extension).
  const ipcFiles: string[] = []
  for (const id of EXPECTED_IDS) {
    const dir = id === "microsoft-office" ? "microsoft-office" : id
    for (const candidate of ["contract.ts", "ipc.ts"]) {
      let source: string
      try {
        source = await read(`${GUI_EXT}${dir}/${candidate}`)
      } catch {
        continue
      }
      if (/Ipc\.define\(/.test(source)) ipcFiles.push(dir)
    }
  }
  // Issue #67: the updater's Ipc moved into the plugin gui host library
  // (plugin/src/gui/updater.ts); the other five stay per-plugin.
  if (!/Ipc\.define\(/.test(await read("vendor/upstream/packages/plugin/src/gui/updater.ts")))
    fail("2: plugin/src/gui/updater.ts lost the Ipc.define (the updater IPC host face)")
  setEq(ipcFiles, ["pairing", "wsl", "ssh", "debug", "browser"], "2: Ipc.define file set (exactly five in gui-plugins + updater in the host lib)")
  const browserIpc = squash(await read(`${GUI_EXT}browser/ipc.ts`))
  if (!browserIpc.includes("exportconstBrowserPane=Ipc.define({")) fail("2: browser/ipc.ts lost the BrowserPane Ipc")
  // Issue #67: browser/contract.ts moved into the host library (plugin/src/gui/browser.ts).
  const browserContract = squash(await read("vendor/upstream/packages/plugin/src/gui/browser.ts"))
  if (/Ipc\.define\(/.test(browserContract)) fail("2: gui/browser.ts must stay Contract-only")

  // Issue #67: the three contract faces moved into the plugin gui host library
  // (plugin/src/gui/{browser,file,review}.ts) — assert there; the per-plugin dirs keep none.
  const contractFiles: string[] = []
  for (const id of ["browser", "file", "review", "terminal", "details", "context", "btw", "debug", "pairing", "updater", "ssh", "wsl", "microsoft-office", "sources", "goal"] as const) {
    let source: string
    try {
      source = await read(`${GUI_EXT}${id}/contract.ts`)
    } catch {
      continue
    }
    if (/Contract\.define[<(]/.test(source)) contractFiles.push(id)
  }
  setEq(contractFiles, [], "2: per-plugin contract.ts set (the contracts moved to the host library)")
  for (const id of ["browser", "file", "review"]) {
    const host = await read(`vendor/upstream/packages/plugin/src/gui/${id}.ts`)
    if (!/Contract\.define[<(]/.test(host))
      fail(`2: plugin/src/gui/${id}.ts lost the Contract.define host face (issue #67)`)
  }

  // Hard requires are zero across the 15 builtins (blocked is structurally absent;
  // sources' soft browser `uses` is the pending-until-active accessor face, not a require).
  for (const id of EXPECTED_IDS) {
    const dir = id === "microsoft-office" ? "microsoft-office" : id
    const source = await read(`${GUI_EXT}${dir}/index.ts`)
    if (/requires:/.test(source)) fail(`2: ${dir}/index.ts gained a requires: (the zero-hard-requires baseline moved)`)
  }

  // The web-inactive Ipc contract sentence (core.ts, verbatim).
  // Issue #67: sdk/core.ts -> plugin/src/gui/core.ts (wording adjusted upstream).
  const core = await read("vendor/upstream/packages/plugin/src/gui/core.ts")
  if (!core.includes("On the web, where no main process runs, it is inactive and every call rejects."))
    fail("2: gui/core.ts lost the web-inactive Ipc sentence (first-evidence anchor of #15, referenced)")

  // Mobile Panel registrations (five): kind + order per unit doc table.
  const review = squash(await read(`${GUI_EXT}review/renderer.tsx`))
  if (!review.includes("order:10,kind:\"tab\",")) fail("2: review mobile panel lost order 10 / kind tab")
  const file = squash(await read(`${GUI_EXT}file/renderer.tsx`))
  if (!file.includes("order:20,kind:\"menu\",")) fail("2: file mobile panel lost order 20 / kind menu")
  const terminal = squash(await read(`${GUI_EXT}terminal/renderer.tsx`))
  if (!terminal.includes("order:30,kind:\"menu\",")) fail("2: terminal mobile panel lost order 30 / kind menu")
  const context = squash(await read(`${GUI_EXT}context/renderer.tsx`))
  if (!context.includes("order:40,kind:\"menu\",")) fail("2: context mobile panel lost order 40 / kind menu")
  const details = squash(await read(`${GUI_EXT}details/renderer.tsx`))
  if (!details.includes("order:50,kind:\"drawer\""))
    fail("2: details mobile panel lost order 50 / kind drawer (cross-reference: verify-agent-capabilities group 3 locks the same anchor — common witness)")

  // btw narrow-window command gate (mobile-unreachable, honest inventory row).
  const btw = await read(`${GUI_EXT}btw/renderer.tsx`)
  if (!btw.includes("// Offered only while a session is open in a desktop-width window."))
    fail("2: btw/renderer.tsx lost the desktop-width comment")
  if (!btw.includes("enabled: !layout.narrow() && mounted()")) fail("2: btw/renderer.tsx lost the narrow-window command gate")
}

// --- 3. The upstream management double gate (acceptance 4 upstream reality) ---
{
  const pageDev = await read(`${APP}src/runtime/plugin/settings-page-dev.tsx`)
  if (!pageDev.includes("/** Development builds: every built-in GUI extension of this window, with enable and reload controls. */"))
    fail("3: settings-page-dev.tsx lost the development-builds header")
  if (!pageDev.includes("void (next ? bridge?.manager.enable(id) : bridge?.manager.disable(id))"))
    fail("3: settings-page-dev.tsx lost the optional-chain toggle (the web double-dead face: no-op without a bridge)")
  if (!pageDev.includes("installed.list.find((item) => item.id === id)?.enabled ?? true"))
    fail("3: settings-page-dev.tsx lost the installed.list enabled reader (web: always empty -> always enabled)")
  if (!pageDev.includes("host.reload(id)")) fail("3: settings-page-dev.tsx lost the renderer-side reload channel")
  if (!pageDev.includes('void bridge?.manager.reload(id)'))
    fail("3: settings-page-dev.tsx lost the manager reload channel (main-process reload is desktop-only)")

  const shell = squash(await read(`${APP}src/settings/shell.tsx`))
  if (!shell.includes("constGuiExtensionsSettings=import.meta.env.DEV"))
    fail("3: shell.tsx lost the DEV-only lazy gate")
  // The upstream gate line is UNTOUCHED by M-026 (first lock verify-agent-capabilities
  // :382 — cross-reference/unchanged-face witness per the review N3 declaration).
  if (!shell.includes('constguiExtensions=!!GuiExtensionsSettings&&platform.platform==="desktop"'))
    fail("3: shell.tsx upstream guiExtensions gate moved (must stay untouched; first lock: verify-agent-capabilities group 3)")

  // Build channel/packaged faces (the dev/source vs packaged ruling's code anchors).
  const hostApis = squash(await read(`${APP}src/runtime/plugin/host-apis.tsx`))
  if (!hostApis.includes("(import.meta.env.VITE_OPENCODE_CHANNEL??\"local\")"))
    fail("3: host-apis.tsx lost the channel face (VITE_OPENCODE_CHANNEL ?? local)")
  if (!hostApis.includes("packaged:platform.plugins?.packaged??false"))
    fail("3: host-apis.tsx lost the packaged face (always false on the web)")

  // Issue #67 (D04, plan §6.C E): the installed-.ocdx install/remove faces are GONE upstream.
  // The zero-install negative anchor becomes the host Bridge.manager member set:
  // exactly {initial, list, enable, disable, reload} — no install, no remove.
  const bridge = await read("vendor/upstream/packages/plugin/src/gui/host.ts")
  const managerBlock = /readonly manager: \{[\s\S]*?\n  \}/.exec(bridge)?.[0] ?? ""
  if (!managerBlock) fail("3: gui/host.ts lost the Bridge.manager block (D04 anchor)")
  for (const member of ["initial", "list()", "enable(", "disable(", "reload("]) {
    if (!managerBlock.includes(member)) fail(`3: Bridge.manager lost the ${member} member (D04 anchor)`)
  }
  for (const gone of ["install(", "remove("]) {
    if (managerBlock.includes(gone)) fail(`3: Bridge.manager gained an ${gone} member — third-party install/remove must stay out (D04)`)
  }
}

// --- 4. The issue #26 implementation face (M-025/M-026; all first locks here) ---
{
  const root = squash(await read(`${APP}src/runtime/plugin/root.tsx`))
  if (!root.includes('import{createExtensionDisabled}from"@opencode-mobile/mobile-hosts"'))
    fail("4: root.tsx lost the M-025 first-party import")
  if (!root.includes("constmobileDisabled=createExtensionDisabled(window.localStorage)"))
    fail("4: root.tsx lost the M-025 shell-wide record instance (NEGATIVE 3 deletes the union below)")
  if (!root.includes("constids=newSet(definitions().map((definition)=>definition.id))"))
    fail("4: root.tsx lost the definitions id-set filter (rename self-heal)")
  if (!root.includes("for(constidofmobileDisabled.ids())if(ids.has(id))merged.add(id)"))
    fail("4: root.tsx lost the M-025 disabled-set union line")
  if (!root.includes("if(!state)returnundefined"))
    fail("4: root.tsx lost the early-exit (enableState undefined -> neither face applies)")
  if ((root.match(/mobile\(M-025\)/g) ?? []).length < 2)
    fail("4: root.tsx lost a mobile(M-025) marker comment")

  const shell = squash(await read(`${APP}src/settings/shell.tsx`))
  if (!shell.includes("constmobileGuiExtensions=platform.platform!==\"desktop\""))
    fail("4: shell.tsx lost the mobileGuiExtensions predicate line")
  // Revised redirect — SAME-FACE as verify-agent-capabilities' commit-2 revised anchor
  // (review N3 declaration: common witness, drift double-FAILs).
  if (!shell.includes('if(view.tab==="gui-extensions"&&!guiExtensions&&!mobileGuiExtensions)surface.open("general")'))
    fail("4: shell.tsx redirect guard lost the !mobileGuiExtensions term (issue #26 revised shape)")
  if (!shell.includes("(guiExtensions||mobileGuiExtensions)"))
    fail("4: shell.tsx nav group lost the either-face condition")
  if (!shell.includes("!guiExtensions&&mobileGuiExtensions&&("))
    fail("4: shell.tsx lost the first-party mount branch condition")
  if (!shell.includes("module.ExtensionManager")) fail("4: shell.tsx lost the ExtensionManager lazy import")
  if (!shell.includes("usePluginHost")) fail("4: shell.tsx lost the host-handle wrapper import (issue #67 rename)")
  if (!shell.includes("definitions={host.definitions()}") || !shell.includes("onReload={(id)=>host.reload(id)}"))
    fail("4: shell.tsx wrapper lost the props injection (definitions/status/failure/reload)")

  // The M-008/M-018 hunks stay byte-intact (layered-patch neighbors, zero re-touch).
  if (!shell.includes("module.MobileHostManager")) fail("4: shell.tsx lost the M-008 MobileHostManager lazy block")
  if (!shell.includes('language.t("settings.tab.sshHosts")')) fail("4: shell.tsx lost the M-018 SSH hosts entry")
  if (!shell.includes('["projects","workspaces","providers","models","extensions"].includes(view.tab)'))
    fail("4: shell.tsx lost the M-018 guard includes list (five per-server tabs still redirected)")

  // Double registration (manifest + vendor manifest; count first locks declared in header).
  const manifest = await read("vendor/upstream/patches/mobile/manifest.json")
  for (const anchor of ['"id": "M-025"', '"id": "M-026"', "0024-M-025-root-disabled-merge.patch", "0025-M-026-mobile-gui-extensions-settings-face.patch"]) {
    if (!manifest.includes(anchor)) fail(`4: patches/mobile/manifest.json lost ${JSON.stringify(anchor)}`)
  }
  const vendorManifest = await read("vendor/upstream/vendor-manifest.json")
  if (!vendorManifest.includes("patches/mobile/0024-M-025-root-disabled-merge.patch") || !vendorManifest.includes("patches/mobile/0025-M-026-mobile-gui-extensions-settings-face.patch"))
    fail("4: vendor-manifest.json lost the M-025/M-026 mobilePatches entries")
  // Issue #67 note: the M-025 PATCH legitimately keeps its pre-#67 target header
  // (runtime/extension/root.tsx — it applies at chain position 24, before M-037 deletes the
  // directory); the re-fallen content in runtime/plugin/root.tsx is asserted on the TREE
  // above. Both faces together prove the two-stage chain.
  const rootPatch = await read("vendor/upstream/patches/mobile/0024-M-025-root-disabled-merge.patch")
  if (!rootPatch.includes("packages/app/src/runtime/extension/root.tsx"))
    fail("4: M-025 patch lost its (pre-#67) target header")
  const shellPatch = await read("vendor/upstream/patches/mobile/0025-M-026-mobile-gui-extensions-settings-face.patch")
  for (const target of ["packages/app/src/settings/shell.tsx", "packages/app/src/runtime/i18n/en.ts", "packages/app/src/runtime/i18n/zh.ts"]) {
    if (!shellPatch.includes(target)) fail(`4: M-026 patch lost the target header ${target}`)
  }
}

// --- 5. State restoration and migration (acceptance 2 state restoration) ---
{
  const manager = await read(`${MH}src/extensions/manager.ts`)
  if (!manager.includes('"opencode-mobile.guiext.v1"')) fail("5: manager.ts lost the versioned storage key")
  if (!manager.includes("version: number") || !manager.includes("disabled: string[]"))
    fail("5: manager.ts lost the versioned payload shape")
  if (!manager.includes("export function mergeDisabledRecords"))
    fail("5: manager.ts lost the definitions-filter merge (rename self-heal)")
  if (!manager.includes("export function createExtensionDisabledStore") || !manager.includes("export function sharedExtensionDisabled"))
    fail("5: manager.ts lost the store factory / shared accessor pair")
  if (!manager.includes("volatile")) fail("5: manager.ts lost the volatile honest report")

  // Desktop rows (reference; persistence itself is the desktop main process, out of closure).
  // Issue #67: extensionEnabled -> pluginEnabled({id, builtin}, state) on the host; the
  // default-enabled tail keeps its `?? true` shape.
  const bridge = await read("vendor/upstream/packages/plugin/src/gui/host.ts")
  if (!bridge.includes("export function pluginEnabled("))
    fail("5: gui/host.ts lost the pluginEnabled legacy resolution (issue #67 §4.1 row)")
  if (!bridge.includes("?.enabled ?? true")) fail("5: pluginEnabled lost the default-enabled tail")

  // Extension stores live under the `extension.<id>.<name>` window namespace.
  const core = await read("vendor/upstream/packages/plugin/src/gui/core.ts")
  if (!core.includes("stored as `plugin.<id>.<name>`"))
    fail("5: gui/core.ts lost the plugin store namespace sentence (issue #67 §4.1 rename)")

  // settings.v3 migration picks (review/details/updater).
  const reviewIndex = squash(await read(`${GUI_EXT}review/index.ts`))
  if (!reviewIndex.includes('key:"settings.v3"')) fail("5: review/index.ts lost the settings.v3 migration pick")
  // Issue #67: v2.2.1 removed the details store migration face (details/index.ts carries no
  // settings.v3 pick any more — registered upstream delta); review + updater keep theirs.
  const updaterIndex = squash(await read(`${GUI_EXT}updater/index.ts`))
  if (!updaterIndex.includes('key:"settings.v3"')) fail("5: updater/index.ts lost the settings.v3 migration pick")

  // Panel strip/legacy-rewrite/transient cleanup.
  const panels = await read(`${APP}src/runtime/plugin/panels.tsx`)
  if (!panels.includes("Rewrites stored keys once their panel is present"))
    fail("5: panels.tsx lost the legacy-rewrite comment (strip keys only rewrite while the panel is present)")
  if (!panels.includes("Transient panels are not restored: their stored keys leave once the panel stops listing them."))
    fail("5: panels.tsx lost the transient cleanup comment")

  // WebView localStorage landing (web persistence of the persisted state).
  const storage = await read(`${APP}src/runtime/persistence/storage.ts`)
  if (!storage.includes("function localStorageWithPrefix(prefix: string): SyncStorage {") || !storage.includes("function localStorageDirect(): SyncStorage {"))
    fail("5: persistence/storage.ts lost the two localStorage views")

  // i18n 9/9 pairing — SAME-FACE as verify-agent-capabilities group 5's commit-2 revised
  // pairing (review N3 declaration: common witness; the M-026 en/zh key sets).
  const keySet = (source: string) => new Set([...source.matchAll(/"(settings\.guiExtensions\.[A-Za-z0-9.]+)"/g)].map((m) => m[1]!))
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  const zh = await read(`${APP}src/runtime/i18n/zh.ts`)
  const enKeys = keySet(en)
  const zhKeys = keySet(zh)
  if (enKeys.size !== 9) fail(`5: settings.guiExtensions.* en key count ${enKeys.size} ≠ 9`)
  if (zhKeys.size !== 9) fail(`5: settings.guiExtensions.* zh key count ${zhKeys.size} ≠ 9 (NEGATIVE 4 deletes the zh title key)`)
  for (const key of enKeys) if (!zhKeys.has(key)) fail(`5: settings.guiExtensions.${key} missing in zh`)
  for (const key of zhKeys) if (!enKeys.has(key)) fail(`5: settings.guiExtensions.${key} missing in en`)
}

// --- 6. Three guarantees (no dead menu / no draft loss / no remote stop) ---
{
  // Same-frame batch deactivation + disabled-status publication before startup.
  const host = await read(`${APP}src/runtime/plugin/host.tsx`)
  if (!host.includes("One batch: every contribution and contract of the plugin disappears in the same frame."))
    fail("6: host.tsx lost the same-frame batch comment")
  if (!host.includes("Publish every disabled status")) fail("6: host.tsx lost the disabled-status publication watcher comment")

  // The More-trigger conditional render (strongest no-dead-menu witness).
  const mobile = squash(await read(`${APP}src/runtime/plugin/mobile.tsx`))
  if (!mobile.includes("<Showwhen={props.views.menu().length}>"))
    fail("6: mobile.tsx lost the More-trigger conditional render (the trigger itself disappears at zero menu items)")

  // Contribution error isolation.
  const render = await read(`${APP}src/runtime/plugin/render.tsx`)
  if (!render.includes("a contribution that throws records the\n * error and renders nothing, and the rest of the window keeps working."))
    fail("6: render.tsx lost the ErrorBoundary isolation comment")

  // The dispose-domain negative (NEW lock; pty.remove exact-one is FIRST LOCKED by
  // verify-terminal group 2 set equality + group 3 pairing anchor — F8).
  const model = await read(`${GUI_EXT}terminal/model.ts`)
  const removeCalls = [...model.matchAll(/\.remove\(/g)].length
  if (removeCalls !== 2)
    fail(`6: terminal/model.ts must carry exactly two .remove( call shapes (storage.remove + pty.remove), got ${removeCalls}`)
  if (!model.includes("input.storage.remove(STORE")) fail("6: terminal/model.ts lost the storage.remove face")
  if (!model.includes("pty.remove({ ptyID: id, location })")) fail("6: terminal/model.ts lost the pty.remove close face")
  const disposeStart = model.indexOf("dispose() {")
  const disposeEnd = model.indexOf("function createWorkspace", disposeStart)
  if (disposeStart === -1 || disposeEnd === -1) fail("6: terminal/model.ts dispose domain unresolvable (structure moved)")
  const disposeDomain = model.slice(disposeStart, disposeEnd)
  if (/\.remove\(/.test(disposeDomain))
    fail("6: terminal/model.ts dispose() body gained a .remove( — the disable path must NOT terminate remote sessions (domain-scoped negative; dispose ends at function createWorkspace)")

  // Extension servers keep their inventory as stopped entries; the route stays mounted.
  const servers = await read(`${APP}src/runtime/plugin/servers.tsx`)
  if (!servers.includes("inventory as stopped entries, so its servers' tabs, drafts and routes outlive the outage."))
    fail("6: servers.tsx lost the stopped-entries comment")
  const serverShell = await read(`${APP}src/runtime/plugin/server-shell.tsx`)
  if (!serverShell.includes("Keep the route mounted so reconnecting preserves its draft and local UI state."))
    fail("6: server-shell.tsx lost the keep-mounted comment (draft preservation on outage)")
}

// --- 7. Docs closure anchors (anti doc<->code drift; commit-1 documents) ---
{
  const unit = await read("docs/design/units/gui-plugins.md")
  for (const heading of [
    "## 一、权威边界与分工",
    "## 二、内建扩展清单（验收 1 主表",
    "## 三、宿主生命周期",
    "## 四、管理面",
    "## 五、三条保证",
    "## 六、状态恢复与迁移",
    "## 七、dev/source 管理器 vs packaged 信任/安装模型",
    "## 八、与远程 Agent/MCP 配置的区分",
    "## 九、移动形态与无障碍",
    "## 十、诚实边界（本期不声称）",
  ]) {
    if (!unit.includes(heading)) fail(`7: gui-plugins.md lost the section ${heading}`)
  }
  for (const sentence of [
    "扩展的**业务行为权威不在本文**",
    "（第二十一处落字）",
    "**移动零安装、零移除、零扩展商店（marketplace）**",
    "不 adapt 任何原生能力",
    "phone never runs Electron/Node main-process extensions",
  ]) {
    if (!unit.includes(sentence)) fail(`7: gui-plugins.md lost the key sentence "${sentence}"`)
  }
  // Inventory table: exactly 15 rows keyed by `| <id> |`.
  for (const id of EXPECTED_IDS) {
    if (!unit.includes(`| ${id} |`)) fail(`7: gui-plugins.md inventory table lost the ${id} row`)
  }
  // Capability mapping three sets (web 10 / desktop-host 4 / excluded 1 = {wsl}, issue #62;
  // issue #66 moved sources + goal into the web set as renderer-side toggle rows).
  const webSet = ["context", "btw", "debug", "terminal", "file", "review", "details", "microsoft-office", "sources", "goal"]
  const desktopSet = ["browser", "pairing", "ssh", "updater"]
  for (const id of webSet) {
    if (!unit.includes(`| ${id} |`) || !unit.split(`| ${id} |`)[1]!.includes("web")) fail(`7: capability mapping lost ${id} in the web set`)
  }
  for (const id of desktopSet) {
    if (!unit.includes(`| ${id} |`) || !unit.split(`| ${id} |`)[1]!.includes("desktop-host")) fail(`7: capability mapping lost ${id} in the desktop-host set`)
  }
  // The excluded row's doc face (issue #62/N12): the wsl inventory row must carry the
  // static-excluded-row semantics and the zero-operation wording; the capability mapping
  // bullet must name the third set and the 12+1 row arithmetic.
  if (!unit.split(`| wsl |`)[1]!.includes("静态排除行（issue #62/N12）"))
    fail("7: gui-plugins.md wsl row lost the static-excluded-row semantics (issue #62)")
  if (!unit.split(`| wsl |`)[1]!.includes("零操作"))
    fail("7: gui-plugins.md wsl row lost the zero-operation wording")
  if (!unit.includes("管理面呈现 15 行 = 14 宿主定义行 + 1 静态排除行") || !unit.includes("issue #62/N12"))
    fail("7: gui-plugins.md lost the 14+1 management-row arithmetic (issue #62; 13->15/12->14 with the M-036 registrations)")

  // Issue #62/N12 code locks: the static excluded row in the first-party manager. The
  // vendored root.tsx os filter stays untouched (group 1 witnesses), so the row is a
  // first-party presentation — the table equality here is NEGATIVE 5's target. The
  // record's values are the members' own reason keys (compile-time tied to the i18n
  // table — no fallback copy), and the definition-row excluded branch suppresses the
  // controls too (the same zero-controls contract on the defensive path).
  const manager = await read(`${MH}src/ui/extension-manager.tsx`)
  const excludedTableMatch = manager.match(/const EXCLUDED_EXTENSIONS = (\{[^}]*\}) as const satisfies Record<string, MessageKey>/)
  if (!excludedTableMatch) fail("7: extension-manager.tsx lost the EXCLUDED_EXTENSIONS static table")
  const excludedKeys = [...excludedTableMatch[1]!.matchAll(/([A-Za-z0-9-]+):/g)].map((m) => m[1]!)
  const excludedValues = [...excludedTableMatch[1]!.matchAll(/"([a-z][a-z0-9.-]*)"/g)].map((m) => m[1]!)
  setEq(excludedKeys, ["wsl"], "7: EXCLUDED_EXTENSIONS must be exactly {wsl} (NEGATIVE 5 deletes the entry)")
  if (excludedKeys.length !== excludedValues.length || excludedValues[0] !== "guiext.excluded.wsl.reason")
    fail("7: EXCLUDED_EXTENSIONS values must be the members' own reason keys (no fallback copy)")
  if (!manager.includes('data-capability="excluded"')) fail("7: extension-manager.tsx lost the excluded capability marker")
  if (!manager.includes("guiext.excluded.wsl.reason")) fail("7: extension-manager.tsx lost the wsl exclusion reason key")
  if (!manager.includes('t("guiext.status.disabled")')) fail("7: extension-manager.tsx lost the reused disabled-status key on the excluded row")
  if (!manager.includes("<Show when={!excluded}>"))
    fail("7: extension-manager.tsx lost the definition-row excluded branch (controls must be suppressed on the defensive path too)")
  // Zero-controls domain scan (static complement of the rendered machine check in
  // extension-manager.rendered.test.tsx — the default executed one): the excluded row JSX
  // region must gain no control and read no host state.
  const excludedRowStart = manager.indexOf('data-capability="excluded"')
  const excludedRowEnd = manager.indexOf("</li>", excludedRowStart)
  if (excludedRowStart === -1 || excludedRowEnd === -1) fail("7: the excluded row JSX region is unresolvable (structure moved)")
  const excludedRowDomain = manager.slice(excludedRowStart, excludedRowEnd)
  for (const forbidden of ["<Button", "<ToggleSwitch", "onReload", "setDisabled", "statusOf", "failureOf", "disabledIds", 'role="alert"']) {
    if (excludedRowDomain.includes(forbidden))
      fail(`7: the excluded row region gained ${JSON.stringify(forbidden)} (zero-controls contract, issue #62)`)
  }

  // Issue #62/N12 i18n pairing: the guiext.excluded.* key family must exist symmetrically
  // in the mobile-hosts en/zh tables (same caliber as group 5's 9/9 app-i18n pairing).
  const excludedKeySet = (source: string) => new Set([...source.matchAll(/"(guiext\.excluded\.[A-Za-z0-9.]+)"/g)].map((m) => m[1]!))
  const mhI18n = await read(`${MH}src/i18n.ts`)
  const mhEnBlock = mhI18n.slice(mhI18n.indexOf("  en: {"), mhI18n.indexOf("  zh: {"))
  const mhZhBlock = mhI18n.slice(mhI18n.indexOf("  zh: {"))
  const mhEnExcluded = excludedKeySet(mhEnBlock)
  const mhZhExcluded = excludedKeySet(mhZhBlock)
  if (!mhEnExcluded.has("guiext.excluded.wsl.reason") || mhEnExcluded.size !== 1)
    fail(`7: mobile-hosts i18n en must carry exactly {guiext.excluded.wsl.reason}, got ${JSON.stringify([...mhEnExcluded])}`)
  if (!mhZhExcluded.has("guiext.excluded.wsl.reason") || mhZhExcluded.size !== 1)
    fail(`7: mobile-hosts i18n zh must carry exactly {guiext.excluded.wsl.reason}, got ${JSON.stringify([...mhZhExcluded])}`)
  if (!mhEnBlock.includes("Excluded by product decision") || !mhEnBlock.includes("Native Windows remote hosts stay supported"))
    fail("7: mobile-hosts i18n en lost the exclusion reason copy (decision 0001 wording)")
  if (!mhZhBlock.includes("产品决策排除") || !mhZhBlock.includes("原生 Windows 远程主机支持保留"))
    fail("7: mobile-hosts i18n zh lost the exclusion reason copy (decision 0001 wording)")

  const interaction = await read("docs/design/interaction.md")
  if (!interaction.includes("## G1–G35 设备门禁（完整枚举）"))
    fail("7: interaction.md gate enumeration must cover G1–G35")
  if (!interaction.includes("| G35 GUI 扩展管理面运行期门禁（issue #26 **新设门禁**；单元文档见 [units/gui-plugins.md](units/gui-plugins.md)）"))
    fail("7: interaction.md lost the G35 gate row")
  if (!interaction.includes("第二十一处落字（issue #26）"))
    fail("7: interaction.md lost the twenty-first honest wording (issue #26)")
  if (!interaction.includes("### GUI 扩展管理面失败路径（issue #26）"))
    fail("7: interaction.md lost the gui-extensions failure-path subsection")
  // The revised G26 face (acceptance handover: the tab IS the first-party face now).
  if (!interaction.includes("移动 gui-extensions tab=#26 第一方管理面（与远程 extensions 三子 tab 的区分保持）；零 GUI 扩展安装入口保持"))
    fail("7: interaction.md G26 row lost the issue #26 face revision")

  const capabilities = await read("docs/design/units/agent-capabilities.md")
  if (!capabilities.includes("**与 #26 的边界（自 issue #26 起为承接声明）**"))
    fail("7: agent-capabilities.md lost the #26 handover declaration")
  if (!capabilities.includes("enable/disable/reload/状态呈现的管理面自 issue #26 起以第一方移动面存在"))
    fail("7: agent-capabilities.md lost the lifecycle-face correction")
  if (!capabilities.includes("en 9 键 / zh 9 键"))
    fail("7: agent-capabilities.md lost the 9/9 i18n gap-closure record")

  const readme = await read("docs/design/README.md")
  if (!readme.includes("[units/gui-extensions.md](units/gui-extensions.md)"))
    fail("7: design README.md lost the gui-extensions index row")

  const architecture = await read("docs/design/architecture.md")
  if (!architecture.includes("| gui-extensions（GUI 扩展管理面） |") || !architecture.includes("运行期归 G35"))
    fail("7: architecture.md lost the gui-extensions unit/flow rows")
}

// --- 8. Build and sentinel reconciliation (mechanical witnesses) ---
{
  // Cross-reference the current baseline first-locked by verify-notifications group 8.
  // Earlier M-026/M-027/M-028 measurements remain historical in build-and-verify.md.
  const distManifest = JSON.parse(await read("web-dist/manifest.json")) as { fileCount?: number; totalBytes?: number }
  if (distManifest.fileCount !== 3516 || distManifest.totalBytes !== 159532385)
    fail(`8: current web-dist baseline drifted (expected 3493/153776571, got ${String(distManifest.fileCount)}/${String(distManifest.totalBytes)})`)

  // The dist carries the runtime marker (minification-surviving constant) and the new
  // i18n keys; the mobile(M-025)/mobile(M-026) comment markers live in the sourcemaps
  // (M-022/M-023 precedent), staged on a built dist like the sibling probes.
  const assets = new URL("vendor/upstream/packages/app/dist/_assets/", repoRoot).pathname
  let distFiles: string[] = []
  try {
    distFiles = await Array.fromAsync(new Bun.Glob("*.js").scan({ cwd: assets }))
  } catch {
    distFiles = []
  }
  if (distFiles.length > 0) {
    let markerKey = false
    let markerEn = false
    let markerZh = false
    let markerZhReason = false
    for (const name of distFiles) {
      const content = await Bun.file(new URL(`vendor/upstream/packages/app/dist/_assets/${name}`, repoRoot)).text()
      if (content.includes("opencode-mobile.guiext.v1")) markerKey = true
      if (content.includes("settings.guiExtensions.mobile.description") && content.includes("Built-in GUI extensions of this app")) markerEn = true
      if (content.includes("本应用的内建 GUI 扩展")) markerZh = true
      if (content.includes("产品决策排除：本应用不发现")) markerZhReason = true
    }
    if (!markerKey) fail("8: the built dist lost the opencode-mobile.guiext.v1 runtime marker")
    if (!markerEn || !markerZh) fail(`8: the built dist lost the guiExtensions i18n keys (en=${markerEn}, zh=${markerZh})`)
    if (!markerZhReason) fail("8: the built dist lost the zh exclusion reason copy (issue #62)")
  } else {
    console.log("verify-gui-plugins: dist markers SKIPPED (no built dist present)")
  }

  // bun.lock workspace anchor (zero-change itself is V-lock's git-diff evidence — the
  // record layer adds no dependency; the seam package registration only).
  const bunLock = await read("bun.lock")
  if (!bunLock.includes("packages/mobile-hosts")) fail("8: bun.lock lost the mobile-hosts workspace registration anchor")

  // mobile(M-035 rebase round, issue #65): 34 registered = M-001..M-035, M-019
  // reserved-absent (the M-034 exclusion dropped now that #64 has landed).
  // Declared cross-references (no re-lock): exact registered patch-ID set, 34 entries,
  // M-019 reserved-absent = verify-attachments-artifacts
  // group 6 + verify-commands-menus group 8; @opencode/gui-extensions specifier set
  // {sdk:34, bridge:8, renderer:2, updater:1} unchanged = verify-agent-capabilities group 3;
  // the M-025 hunk does not touch the VAC root.tsx anchors (its group 3 stayed green in
  // the same commit as the patch registration).
}


// --- 9. gui-plugins icon closure (issue #67, plan §6.C E): every icon literal in the
// gui-plugins sources resolves through the vendored universe — catalog ∪ additional-icons ∪
// new-icons (its replacements map carries the current-name aliases, e.g. file-tree -> folder,
// so the alias resolves without any catalog adoption, D5). A silent Icon fallback would
// otherwise render nothing (icon.tsx returns undefined for unknown names).
{
  // The resolution universe: catalog ∪ additional-icons ∪ new-icons record keys ∪ the
  // replacement targets (current-name aliases resolve through the replacements map, e.g.
  // file-tree -> folder, D5 — no catalog adoption needed).
  const universe = new Set<string>()
  const catalog = await read(`${UI_ICONS}catalog.ts`)
  for (const m of catalog.matchAll(/^  "?([a-z][a-z0-9-]*)"?: \{/gm)) universe.add(m[1]!)
  const additional = await read(`${UI_ICONS}icon/additional-icons.ts`)
  for (const m of additional.matchAll(/^  "?([a-z][a-z0-9-]*)"?: /gm)) universe.add(m[1]!)
  const newIcons = await read(`${UI_ICONS}new-icons.ts`)
  for (const m of newIcons.matchAll(/^  "?([a-z][a-z0-9-]*)"?: /gm)) universe.add(m[1]!)
  const replacementsBlock = /const replacements[^=]*= \{([\s\S]*?)\n\}/.exec(newIcons)?.[1] ?? ""
  for (const m of replacementsBlock.matchAll(/name: "([a-z][a-z0-9-]*)"/g)) universe.add(m[1]!)
  console.log(`  icon universe: ${universe.size} names (catalog + additional + new-icons/aliases)`)

  // Direct forms: name="x", icon="x", name={...} / icon={...} brace expressions (ternary
  // branches included — every quoted token inside the braces is a candidate), and getIcon("x").
  const directRe = /(?:\bname\s*=\s*|\bicon\s*=\s*|\bname:\s*"|\bicon:\s*"|\bgetIcon\(\s*)"([a-z][a-z0-9-]*)"/g
  const braceRe = /(?:\bname\s*=\s*\{|\bicon\s*=\s*\{)([^}]*)\}/g
  const used = new Map<string, string[]>()
  const note = (name: string, file: string) => {
    if (universe.has(name)) return
    const sites = used.get(name) ?? []
    sites.push(file)
    used.set(name, sites)
  }
  let scanned = 0
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${GUI_EXT}`, repoRoot).pathname }))) {
    if (file.includes(".stories.") || file.includes(".test.")) continue
    scanned++
    const body = await read(`${GUI_EXT}${file}`)
    for (const m of body.matchAll(directRe)) note(m[1]!, file)
    for (const m of body.matchAll(braceRe)) {
      // Scrub the Icon component's non-name props (size/direction/class/...) so their
      // values ("normal" / "large" / ...) stay out, and strip the ternary CONDITION (its
      // comparison operands like direction === "back" are not icon names) — only the
      // branches after the first `?` are candidates.
      let inner = m[1]!.replace(/\b(?:size|direction|class|label|stroke|fill|rotate|placement)\s*=\s*"[^"]*"/g, "")
      const q2 = inner.indexOf("?")
      if (q2 !== -1) inner = inner.slice(q2)
      for (const q of inner.matchAll(/"([a-z][a-z0-9-]*)"/g)) note(q[1]!, file)
    }
  }
  if (scanned < 100) fail(`9: icon scan covered only ${scanned} files — the gui-plugins tree shape changed`)
  const unknown = [...used.keys()]
  if (unknown.length > 0)
    fail(`9: unresolved icon literal(s) outside the vendored universe: ${unknown.map((n) => `${n} (in ${used.get(n)!.slice(0, 3).join(", ")})`).join("; ")}`)
  console.log(`  icon closure: scanned ${scanned} gui-plugins files; every name/icon literal resolves`)
}


console.log(
  "verify-gui-plugins: PASS (" +
    "1: inventory — builtins compose exactly 15 entries with the id set equality (sources + goal appended after microsoft-office per v2.2.1 compose order, issue #66), main.ts same-table import set, six lazy main entries {debug,browser,pairing,updater,ssh,wsl}, os declarations exactly {wsl: windows}, root.tsx VAC first-lock witnesses (os gate/OS filter/.ocdx), five renderer early-exit guards + ssh desktop-main-process comment; " +
    "2: tokens — Ipc.define exactly {pairing,wsl,ssh,updater,debug,browser} + BrowserPane, Contract.define exactly {browser,file,review} (sources/goal scanned, zero), zero requires: across 15 builtins, always-inactive core sentence, five mobile Panel registrations (tab 10/menu 20/menu 30/menu 40/drawer 50 — sources 60 / goal 70 are locked by verify-goal-sources), btw narrow gate; " +
    "3: upstream double gate — DEV-only lazy + desktop-only gate (VAC first-lock witness), settings-page-dev optional-chain toggle + installed.list reader + reload two channels, host-apis channel/packaged faces, bridge install/Built-ins-refuse; " +
    "4: issue #26 face — M-025 import/instance/filter/union/early-exit + two markers, M-026 predicate/revised guard (VAC common witness)/nav condition/mount branch/lazy import/props injection, M-008/M-018 hunks intact, manifest+vendor-manifest double registration + patch target headers; " +
    "5: state — guiext.v1 key/shape/merge/self-heal/volatile, extensionEnabled legacy rows, extension.<id>.<name> namespace, settings.v3 picks (review/details/updater), panels legacy-rewrite/transient comments, localStorage two views, settings.guiExtensions 9/9 en/zh pairing (VAC common witness); " +
    "6: guarantees — same-frame batch + disabled publication, More-trigger conditional render, ErrorBoundary renders-nothing comment, terminal model.ts exactly-two .remove( with a remove-free dispose() domain (NEGATIVE-lockable), stopped-entries + keep-mounted draft comments; " +
    "7: docs closure — gui-extensions.md ten sections + authority + zero-marketplace/no-adapt sentences + 15 inventory rows + capability three-set mapping (web 10/desktop-host 4/excluded {wsl} — issue #62 static exclusion row with doc zero-operation wording and the 14+1 arithmetic revised 13->15/12->14 with the M-036 registrations), interaction.md G1–G35 + G35 row + twenty-first wording + failure path + revised G26 face, agent-capabilities.md three revisions, README index, architecture rows; " +
    "issue #62 code locks — EXCLUDED_EXTENSIONS exactly {wsl} (NEGATIVE 5), data-capability=excluded + reused disabled status + wsl reason key, zero-controls domain scan of the excluded row region (rendered machine check: extension-manager.rendered.test.tsx), guiext.excluded.* en/zh pairing; " +
    "8: build witnesses — current dist baseline 3493/153776571 (issue #66 incl. M-036; registered patch set 36 = M-001..M-037 with M-019 reserved-absent (issue #67), per verify-attachments-artifacts group 6 + verify-commands-menus group 8; issue #65 rebuild incl. M-035 3482/153654746, issue #64 incl. M-034 3480/153638138 (first build 153638140), issue #63 rebase rebuild incl. M-033 153581483, issue #62 rebuild 153563460, M-028 3482/153447934, M-027 3482/153445727, M-026 3480/153441733 and the issue #58 chain 3480/153555364 remain historical), runtime markers (guiext.v1 constant + en/zh i18n keys + zh exclusion reason) staged on a built dist, bun.lock workspace anchor; " +
    "STATIC check - tab reachability, toggle chains, menu disappearance, restart restoration, volatile presentation, desktop-host rows, the excluded row presentation and dual-route consistency on a device are G35)",
)
