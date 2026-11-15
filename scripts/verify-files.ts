// verify-files.ts — static probe for issue #11 (remote file browsing, search,
// viewing, and context reference unit).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…), the structural
// facts the files unit document relies on:
//
//   1. Data face wiring: workspaces/files/model.tsx routes the tree/read/search
//      trio through `api.file.list/read/find` with a `location: { directory:
//      scope() }` scope (newline-tolerant — `api.file.read(` is written across
//      lines), normalizes FileNotFoundError, surfaces formatServerError + the
//      listFailed/loadFailed toasts, swallows non-abort SEARCH errors to an
//      empty result (upstream semantic, honestly registered), and composes tree
//      node `absolute` from scope + entry path; the generated client carries
//      the /api/fs/read|list|find endpoints (read block: declaredStatuses
//      [400,401,404] + binary) and the FileNotFoundError guard + the ephemeral
//      filesystem.changed event.
//   2. Write-face exhaustive set (newline-tolerant, plan §2 group 2): SCAN
//      DOMAIN = app + gui-extensions `src/**` ONLY (the client GENERATED
//      surface is single-listed below and is NOT in the set — it carries an
//      unwrapped `file.write` endpoint wrapper with zero callers). Normalized
//      `api.file.write(` / `/api/experimental/fs/write` call sites form a set
//      EQUAL to exactly {composer/attachments/destination.ts} — the browse/
//      search/view paths make ZERO write calls (this set is also the #16
//      starting baseline). The attachments-upload-redirect-policy responseURL validation context stays.
//   3. Large-file/binary/encoding anchors: MAX_MEDIA_BYTES = 256*1024*1024
//      (media-only placeholder; text has NO client-side size cap — honest),
//      the 8 KiB NUL binary test, the unknown-binary placeholder comment, the
//      UTF-8 TextDecoder decode (non-fatal replacement — no separate encoding
//      error state), and the content LRU bounds 40 entries / 20 MiB.
//   4. Stale chain: invalidateFromWatcher (+ .git/ skip), the
//      filesystem.changed subscription with `load(file, { force: true,
//      silent: true })`, the link-open force reread (verbatim "Always reread:
//      a cached copy can be stale" + files.sync force), the scope-change
//      reset block (inflight/LRU/store/tree, adjacent), and the selectedLines
//      persistence anchor.
//   5. Recovery keying: sessionTabs/sessionView decode-time SessionStateKey.is
//      migration filter, the MAX_SESSION_KEYS = 50 eviction list containing
//      "file-view" (scoped-store drop), view-cache serverScoped "file-view"
//      persistence with MAX_VIEW_FILES = 500 / MAX_FILE_VIEW_SESSIONS = 20,
//      and the SessionStateKey.from/is brand pair in scope.ts.
//   6. Mobile face & desktop gates: the mobile placement branch renders
//      MobileFiles; the OpenInApp slot registers only under `if (desktop)` +
//      `<Show when={desktop}>`; canOpen's double gate (!!desktop &&
//      server.local) and openPath's early return; ctx.desktop's
//      platform-platform ternary resolving to undefined on web (adjacent-pair
//      match); mobile tab strip aria labels; tree rows as buttons with
//      aria-expanded and 28px estimate; search combobox wiring (limit 200 +
//      signal) with role="status" states; drag disabled on mobile
//      (draggable={!props.mobile} lives in browser.tsx — review N-2); the
//      "Desktop-only abilities" comment in gui-extensions sdk host-apis.ts
//      (review N-1 location); i18n keys paired in en+zh (gui-extensions file
//      i18n has 63 language files — review N-4; app toasts).
//   7. Context reference chain: @-mention candidates from file.find
//      (searchContextFiles → searchFilesAndDirectories), the send-side
//      `file://` + `?start=&end=` line-range URI shape, addSelectionToContext
//      with the noLineSelection toast, the viewer comment→composer.attach
//      channel, and selectionFromFileUrl message-side recovery.
//   8. Zero host-OS conditionals (whitelist scan, #8 N-5 pattern): the
//      app/src/workspaces tree (whole directory — covers the #8 selection
//      subset and this issue's files face) plus gui-extensions/src/file must
//      contain ZERO process.platform / navigator.platform / node:os
//      references, with a scanned-file lower bound so a directory rename can
//      never silently empty the scan.
//
// HONEST BOUNDARY (same tradition as verify-permission-requests.ts): this is a
// static STRUCTURE check (text anchors / regex on source files). It proves
// source shape, NOT runtime behavior: tree rendering, search behavior, stale
// reread timing, context-to-composer presentation, per-workspace recovery,
// client-exit zero side effects, and touch/a11y adequacy on a device are
// covered by the G22 device gate (docs/design/interaction.md), BLOCKED at
// this verification level. Server semantics (packages/core|server|schema|protocol
// fs files) are NOT in the vendored closure and are NOT asserted here — they
// are cited from the upstream pin cache in the unit document (read fence /
// list parent-sibling design / write no-fence / search index 10s / ETag).
//
// Usage:
//   bun run scripts/verify-files.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-files: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"

// Newline tolerance (plan R2 / #9 N-2 lesson): normalize ALL whitespace before
// matching, because several call sites write the chain across lines.
const squash = (source: string) => source.replace(/\s+/g, "")

// --- 1. Data face wiring (tree/read/search scoped to the remote location) ---
{
  const model = squash(await read(`${APP}src/workspaces/files/model.tsx`))
  if (!model.includes(`serverSDK.api.file.list({path:dir,location:{directory:scope()}})`))
    fail("1: the tree listing must call api.file.list with a location: { directory: scope() } scope")
  if (!model.includes("serverSDK.api.file.read("))
    fail("1: file viewing must route through api.file.read (newline-tolerant match)")
  if (!model.includes("serverSDK.api.file.find("))
    fail("1: file search must route through api.file.find (newline-tolerant match)")
  if (!model.includes("absolute:`${scope()}/${entry.path}`"))
    fail("1: tree nodes must compose absolute from scope + entry path (path identity)")
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the catch variable is named `error`.
  if (!model.includes("isFileNotFoundError(error)"))
    fail("1: model.tsx must normalize FileNotFoundError via isFileNotFoundError")
  if (!model.includes("formatServerError"))
    fail("1: model.tsx must surface formatServerError for non-NotFound failures")
  if (!model.includes('language.t("toast.file.listFailed.title")'))
    fail("1: model.tsx lost the listFailed toast anchor")
  if (!model.includes('language.t("toast.file.loadFailed.title")'))
    fail("1: model.tsx lost the loadFailed toast anchor")
  // Upstream search-error semantic (honestly registered): non-abort errors are
  // swallowed to an empty result; aborts rethrow.
  if (!model.includes("if(options?.signal?.aborted)throwerror") || !model.includes("return[]"))
    fail("1: the search swallow shape changed (non-abort → empty result, abort rethrows)")

  const client = await read(`${CLIENT}src/promise/generated/client.ts`)
  if (!client.includes("/api/fs/read/${encodePath(input.path)}"))
    fail("1: generated client lost the /api/fs/read endpoint path")
  if (!client.includes("path: `/api/fs/list`")) fail("1: generated client lost the /api/fs/list endpoint path")
  if (!client.includes("path: `/api/fs/find`")) fail("1: generated client lost the /api/fs/find endpoint path")
  // The read block specifically: declared 401 + binary transfer.
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the generated client grew an
  // experimental persistentPty read before the fs group, so the old lazy
  // `file: { ... read: (input ... list: (input` span matched the wrong block. The read/list
  // pair is now pinned by its de-prefixed wrapper names (same vendored-face discipline as the
  // watch/unwatch block in section 9).
  const readBlock = /read:\s*\(input: FileReadInput[\s\S]*?list:\s*\(input\?: FileListInput/.exec(client)
  if (!readBlock) fail("1: the file.read block was not found in the generated client")
  if (!readBlock![0].includes("declaredStatuses: [400, 401, 404]"))
    fail("1: file.read must declare [400, 401, 404] (401 = auth face of server permissions)")
  if (!readBlock![0].includes("binary: true")) fail("1: file.read must transfer bytes (binary: true)")

  const types = await read(`${CLIENT}src/promise/generated/types.ts`)
  if (!types.includes('value["_tag"] === "FileNotFoundError"'))
    fail("1: generated types lost the isFileNotFoundError tagged guard")
  if (!types.includes('type: "filesystem.changed"'))
    fail("1: generated types lost the filesystem.changed event")
}

// --- 2. Write-face exhaustive set (#16 baseline; scan domain written here) ---
{
  // SCAN DOMAIN = app + gui-extensions `src/**` ONLY. The client generated
  // surface (which carries an unwrapped `file.write` endpoint wrapper with
  // zero callers) is single-listed below and is NOT part of this set.
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/"]
  const expected = new Set([`${APP}src/composer/attachments/destination.ts`])
  const collected = new Set<string>()
  for (const base of [`${APP}src/`, `${GUI_EXT}src/`]) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const rel = `${base}${file}`
      if (skip.some((entry) => `/${rel}`.includes(entry))) continue
      const source = await read(rel)
      if (/api\.file\.write\(|\/api\/experimental\/fs\/write/.test(squash(source))) collected.add(rel)
    }
  }
  for (const file of collected) {
    if (!expected.has(file)) fail(`2: unexpected fs.write call site outside the closed set: ${file}`)
  }
  for (const file of expected) {
    if (!collected.has(file)) fail(`2: expected fs.write call site missing from the scan: ${file}`)
  }
  if (collected.size !== 1) fail(`2: write call-site set must equal exactly 1 file, got ${collected.size}`)

  // The single call site keeps its attachments-upload-redirect-policy transport-hygiene context (#16 face).
  const destination = await read(`${APP}src/composer/attachments/destination.ts`)
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the endpoint is built from the
  // sdk's current connection (`sdk.http.url`), not the b4525d79-era `server.conn.http.url`.
  if (!destination.includes('new URL("/api/experimental/fs/write", sdk.http.url)'))
    fail("2: destination.ts lost the upload endpoint construction")
  // Re-anchored to the v2.2.1 (3ebcf9a) form: the b4525d79-era responseURL redirect-policy
  // validation no longer exists in the vendored source; the upload path is the direct XHR POST
  // with the Basic auth header and the { data: { path } } response contract.
  for (const anchor of ["xhr.open(\"POST\", url)", "xhr.responseType = \"json\"", "authTokenFromCredentials({ password })", "(xhr.response as { data: { path: string } }).data.path"])
    if (!destination.includes(anchor)) fail(`2: destination.ts upload path lost the v2.2.1 anchor: ${anchor}`)
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the userinfo-credential URL refusal
  // moved from the connect dialog's normalize path into the connect CONTROLLER's submitted-event
  // handling (mobile(M-013) enforcement site; the old b4525d79-era anchor read
  // `assertNoUrlCredentials(normalized)` in dialog.tsx).
  const controller = squash(await read(`${APP}src/servers/connect/controller.ts`))
  if (!controller.includes("assertNoUrlCredentials(prev.draft.url)"))
    fail("2: the userinfo-credential URL refusal must stay enforced via assertNoUrlCredentials in the connect controller (M-013 site)")
  if (!destination.includes("a 200 from `fs.write` is its declared success body"))
    fail("2: destination.ts lost the SAFETY comment context")
  // mobile(M-012) anchors re-derived by composer-queue-attachments-v2-2-7 (issue #188): the
  // upload face enforces the URL policy itself — credential refusal at write() entry and the
  // final-response redirect validation in the load listener (fail-closed SecureFetchError).
  if (!destination.includes("assertNoUrlCredentials(url.href)"))
    fail("2: destination.ts lost the mobile(M-012) assertNoUrlCredentials call at write() entry")
  if (!destination.includes("validateRedirectTarget(url.href, xhr.responseURL)"))
    fail("2: destination.ts lost the mobile(M-012) validateRedirectTarget final-response check")
  if (!destination.includes('verdict.reason === "downgrade" ? "redirect-downgrade" : "redirect-cross-host"'))
    fail("2: destination.ts lost the mobile(M-012) SecureFetchError rejection branch")

  // N-5 single-listing: the generated wrapper exists but has NO caller in the
  // scan domain (the set above proves it) — pin its existence here so a pin
  // update that removes/moves it forces a re-review of the layering note.
  const client = await read(`${CLIENT}src/promise/generated/client.ts`)
  if (!client.includes("path: `/api/experimental/fs/write`"))
    fail("2: the generated client file.write wrapper moved — re-check the N-5 layering note")
}

// --- 3. Large-file / binary / encoding anchors ---
{
  const artifact = await read(`${APP}src/workspaces/files/artifact.ts`)
  if (!artifact.includes("export const MAX_MEDIA_BYTES = 256 * 1024 * 1024"))
    fail("3: MAX_MEDIA_BYTES = 256 MiB anchor changed")
  if (!artifact.includes("a NUL in the first 8 KiB marks an unknown binary"))
    fail("3: the 8 KiB NUL binary-test comment anchor changed (verbatim)")
  if (!artifact.includes("function isBinaryBytes(bytes: Uint8Array)"))
    fail("3: isBinaryBytes changed shape")
  if (!artifact.includes("the viewer only shows a placeholder for them"))
    fail("3: the unknown-binary placeholder comment anchor changed (verbatim)")
  if (!artifact.includes("new TextDecoder().decode(bytes)"))
    fail("3: text must decode as UTF-8 via TextDecoder (non-fatal, no encoding error state)")
  if (!artifact.includes("Media above this stays a placeholder"))
    fail("3: the media placeholder comment anchor changed")

  const cache = await read(`${APP}src/workspaces/files/content-cache.ts`)
  if (!cache.includes("const MAX_FILE_CONTENT_ENTRIES = 40"))
    fail("3: content LRU entry bound (40) anchor changed")
  if (!cache.includes("const MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024"))
    fail("3: content LRU byte bound (20 MiB) anchor changed")
  if (!cache.includes("MAX_FILE_CONTENT_ENTRIES || total > MAX_FILE_CONTENT_BYTES"))
    fail("3: the LRU eviction condition lost its entry-or-byte form")
}

// --- 4. Stale chain (watcher + ETag reread discipline) ---
{
  const watcher = await read(`${APP}src/workspaces/files/watcher.ts`)
  if (!watcher.includes("export function invalidateFromWatcher("))
    fail("4: invalidateFromWatcher entry point changed")
  if (!watcher.includes('path.startsWith(".git/")'))
    fail("4: the watcher lost its .git/ skip")

  const model = await read(`${APP}src/workspaces/files/model.tsx`)
  if (!model.includes('sdk().event.on("filesystem.changed"'))
    fail("4: model.tsx lost the filesystem.changed subscription")
  if (!model.includes("load(file, { force: true, silent: true })"))
    fail("4: open files must be force-reread (silent) on filesystem.changed")
  // Adjacent scope-change reset block. Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the
  // inflight/LRU/store resets moved into the content machine's `scope.changed` transition
  // (abort.all + cache.reset), and the model's handler dispatches that plus tree.reset in one
  // batch (the old b4525d79-era inline `inflight.clear()/resetFileContentLru()/reconcile({})`
  // block no longer exists).
  if (!/on\(scope, \(directory\) => \{[\s\S]*?dispatch\(\{ type: "scope.changed", directory \}\)[\s\S]*?tree\.reset\(\)/.test(model))
    fail("4: the scope-change reset block (machine scope.changed + tree.reset) changed")
  // Re-anchored to the v2.2.7 line wrap ("a reset after that / load would discard its reply").
  if (!/a reset after that\s*\/\/\s*load would discard its reply/.test(model))
    fail("4: the scope-change ordering comment anchor changed (verbatim, newline-tolerant)")

  const renderer = await read(`${GUI_EXT}src/file/renderer.tsx`)
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the comment is now the sentence tail
  // "..., and always reread: a cached copy can be stale." (lowercase), and the sync call names
  // the effect path with silent:true — the force reread discipline is unchanged.
  if (!renderer.includes("always reread: a cached copy can be stale"))
    fail("4: the link-open reread comment anchor changed (verbatim 'always reread: a cached copy can be stale')")
  if (!renderer.includes("files.sync(effect.path, { force: true, silent: true })"))
    fail("4: link-open must confirm existence via files.sync(force) before a tab appears")

  const viewCache = await read(`${APP}src/workspaces/files/view-cache.ts`)
  if (!viewCache.includes("selectedLines: Persistence.optional(Schema.NullOr(SelectedLineRange))"))
    fail("4: view-cache lost the selectedLines persistence anchor")
}

// --- 5. Recovery keying (per workspace; file tabs + selections) ---
{
  const layout = await read(`${APP}src/shell/state/layout.tsx`)
  if (!layout.includes(".filter(([key]) => SessionStateKey.is(key))"))
    fail("5: sessionTabs/sessionView lost the decode-time SessionStateKey.is migration filter")
  if (!layout.includes('const names = ["prompt", "file-view", ...scoped]'))
    fail("5: the dropSessionState eviction list must contain \"file-view\" (scoped store drop)")
  if (!layout.includes("const MAX_SESSION_KEYS = 50"))
    fail("5: MAX_SESSION_KEYS = 50 anchor changed")

  const viewCache = await read(`${APP}src/workspaces/files/view-cache.ts`)
  if (!viewCache.includes('persisted(Persist.serverScoped(scope, dir, id, "file-view"), FileViewsSchema'))
    fail("5: view-cache must persist per file under the serverScoped \"file-view\" store")
  if (!viewCache.includes("const MAX_VIEW_FILES = 500")) fail("5: MAX_VIEW_FILES = 500 anchor changed")
  if (!viewCache.includes("const MAX_FILE_VIEW_SESSIONS = 20")) fail("5: MAX_FILE_VIEW_SESSIONS = 20 anchor changed")

  const scope = await read(`${APP}src/runtime/server/scope.ts`)
  if (!scope.includes("from(scope: ServerScope, route: SessionRouteKey)"))
    fail("5: SessionStateKey.from changed shape (server scope + route composition)")
  if (!scope.includes("is(key: string): key is SessionStateKey"))
    fail("5: SessionStateKey.is changed shape (migration filter depends on it)")
}

// --- 6. Mobile face & desktop gates (IDE/Explorer structurally absent on web) ---
{
  const renderer = await read(`${GUI_EXT}src/file/renderer.tsx`)
  if (!renderer.includes('panel.placement() === "mobile"'))
    fail("6: the mobile placement branch is gone from the file panel")
  if (!renderer.includes("<MobileFiles")) fail("6: renderer must render MobileFiles on the mobile placement")
  if (!renderer.includes("if (desktop) {")) fail("6: the OpenInApp slot must register only under if (desktop)")
  if (!renderer.includes("<Show when={desktop}>")) fail("6: the OpenInApp UI must gate on <Show when={desktop}>")

  const openInApp = await read(`${GUI_EXT}src/file/open-in-app.tsx`)
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): canOpen grew skill:// and /builtin/
  // exclusion arms, so the desktop && local double gate wraps onto its own lines
  // (the old b4525d79-era single-line `!!desktop && input.session.server.local` no longer exists).
  if (!openInApp.includes("!!desktop &&\n      input.session.server.local &&"))
    fail("6: canOpen lost its desktop && local double gate")
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): openPath gained app/target/reveal
  // parameters and the desktop gate folded into canOpen, so the early return is now
  // `if (!canOpen()) return` (the old `opening() || !canOpen() || !desktop` form is gone).
  if (!openInApp.includes("if (!canOpen()) return"))
    fail("6: openPath lost its canOpen early return")

  const hostApis = squash(await read(`${APP}src/runtime/plugin/host-apis.tsx`))
  if (!/desktop:\(\)=>platform\.platform==="desktop"\?[\s\S]*?:undefined/.test(hostApis))
    fail("6: ctx.desktop must resolve to undefined off desktop (adjacent ternary pair)")
  // N-1: the comment lives in the gui-extensions sdk, not the app assembly.
  const sdkHostApis = await read("vendor/upstream/packages/plugin/src/gui/host-apis.ts")
  if (!sdkHostApis.includes("Desktop-only abilities; `ctx.desktop` is undefined on the web."))
    fail("6: the sdk host-apis.ts desktop comment anchor moved (review N-1 location)")

  const mobile = await read(`${GUI_EXT}src/file/mobile.tsx`)
  if (!mobile.includes('ctx.t("mobile.openTabs")')) fail("6: the mobile open-tabs list lost its aria-label")
  if (!mobile.includes('ctx.t("common.closeTab")')) fail("6: the mobile tab close button lost its aria-label")

  // Issue #67: the v2.2.1 file tree is the pierre web-component tree (tree-v2.tsx ->
  // pierre-tree.tsx + tree-model.ts); the row anchors follow the v2.2.1 shapes.
  const tree = await read(`${GUI_EXT}src/file/pierre-tree.tsx`)
  if (!tree.includes('button[data-type="item"]')) fail("6: tree rows must render as buttons (pierre-tree button row)")
  if (!tree.includes('[data-type="item"][aria-expanded="true"]')) fail("6: directory rows lost aria-expanded styling")
  const treeModel = await read(`${GUI_EXT}src/file/tree-model.ts`)
  if (!treeModel.includes("export const FILE_TREE_ROW_HEIGHT = 28"))
    fail("6: the 28px virtual row estimate constant changed")
  const list = await read(`${GUI_EXT}src/file/list.tsx`)
  if (!list.includes("estimateSize: () => FILE_TREE_ROW_HEIGHT"))
    fail("6: the 28px virtual row estimate anchor changed")
  if (!tree.includes("ctx.desktop ? useOpenInApp("))
    fail("6: tree rows must gate open-in-app behind ctx.desktop")

  const browser = await read(`${GUI_EXT}src/file/browser.tsx`)
  // Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the search moved into the browser's
  // machine face — `file.find({ ..., type: "file", limit: 200 }, { signal: AbortSignal.any(...) })`
  // keeps the limit-200 + signal discipline (the old `file.search(value, { limit: 200, signal })`
  // call no longer exists).
  if (!browser.includes('type: "file", limit: 200 },'))
    fail("6: the search query anchor changed (limit 200 + signal)")
  if (!browser.includes("AbortSignal.any([ctx.signal, request.controller.signal])"))
    fail("6: the search lost its combined abort signal")
  if (!browser.includes('role="status"')) fail("6: the search loading/empty states lost role=status")
  if (!browser.includes("draggable={!props.mobile}"))
    fail("6: mobile must keep drag disabled (draggable lives in browser.tsx — review N-2)")

  // i18n pairs (gui-extensions file i18n: 63 language files on this pin; app toasts).
  const guiEn = await read(`${GUI_EXT}src/file/i18n/en.ts`)
  const guiZh = await read(`${GUI_EXT}src/file/i18n/zh.ts`)
  for (const key of ['"mobile.title"', '"tree.all"', '"tab.notFound"']) {
    if (!guiEn.includes(key)) fail(`6: gui-extensions en lost the ${key} key`)
    if (!guiZh.includes(key)) fail(`6: gui-extensions zh lost the ${key} key`)
  }
  for (const [name, dict] of [
    ["app en", `${APP}src/runtime/i18n/en.ts`],
    ["app zh", `${APP}src/runtime/i18n/zh.ts`],
  ] as const) {
    const source = await read(dict)
    if (!source.includes('"toast.file.loadFailed.title":')) fail(`6: ${name} lost toast.file.loadFailed.title`)
    if (!source.includes('"toast.file.listFailed.title":')) fail(`6: ${name} lost toast.file.listFailed.title`)
  }
}

// --- 7. Context reference chain (selections → session context → message) ---
{
  const composerModel = await read(`${APP}src/composer/model.ts`)
  if (!composerModel.includes("searchContextFiles"))
    fail("7: composer lost the searchContextFiles @-mention candidate source")
  if (!composerModel.includes("searchFilesAndDirectories"))
    fail("7: @-mention candidates must come from the file.find-backed search")
  if (!composerModel.includes('mention: { type: "file", path'))
    fail("7: the file mention shape changed")

  const request = squash(await read(`${APP}src/composer/request.ts`))
  if (!request.includes("file://${encodeFilePath(path)}"))
    fail("7: the send-side file:// URI shape changed")
  if (!request.includes("?start=${selection.startLine}&end=${selection.endLine}"))
    fail("7: line ranges must ride the file URI query (?start=&end=)")
  if (!request.includes("formatCommentNote")) fail("7: the comment note formatter anchor changed")

  const commands = await read(`${APP}src/session/commands/use-session-commands.tsx`)
  if (!commands.includes("addSelectionToContext"))
    fail("7: the session command must expose addSelectionToContext")
  if (!commands.includes('language.t("toast.context.noLineSelection.title")'))
    fail("7: the noLineSelection toast anchor changed")

  const view = await read(`${GUI_EXT}src/file/view.tsx`)
  if (!view.includes("composer.attach({")) fail("7: the viewer comment channel lost composer.attach")
  if (!view.includes('type: "file",')) fail("7: the viewer attach item must be type file")
  if (!view.includes("previewSelectedLines")) fail("7: the selected-lines preview anchor changed")

  const prompt = await read(`${APP}src/composer/prompt.ts`)
  if (!prompt.includes("function selectionFromFileUrl("))
    fail("7: message-side line-range recovery (selectionFromFileUrl) changed")
  if (!prompt.includes("extractPromptContext")) fail("7: extractPromptContext anchor changed")
}

// --- 8. Zero host-OS conditionals in the whitelisted file-face directories ---
let osScanFiles = 0
{
  const whitelist = [`${APP}src/workspaces`, `${GUI_EXT}src/file`]
  const osPatterns: [RegExp, string][] = [
    [/process\.platform/, "process.platform"],
    [/navigator\.platform/, "navigator.platform"],
    [/from ["']node:os["']/, 'import from "node:os"'],
    [/require\(["']os["']\)/, 'require("os")'],
  ]
  // Issue #67 measured exception: gui-plugins@v2.2.1's file/renderer.tsx carries one
  // navigator.platform mac-pointer gate in the renderer header (upstream shape, desktop
  // refinement only — registered like the verify-browser baselines).
  const osExceptions = new Set([`${GUI_EXT}src/file/renderer.tsx`])
  let scanned = 0
  for (const base of whitelist) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      osScanFiles++
      const source = await read(`${base}/${file}`)
      if (osExceptions.has(`${base}/${file}`)) continue
      for (const [pattern, label] of osPatterns) {
        if (pattern.test(source)) fail(`8: host-OS conditional (${label}) found in whitelisted ${base}/${file}`)
      }
    }
  }
  // Lower bound (real counts on this pin: 27 + 88 = 115): a directory rename
  // must never silently empty the scan.
  if (osScanFiles < 100) fail(`8: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
}

// --- 9. Streaming reads + file-watch subscriptions (issue #143) ---
{
  // model.tsx: the streamed media read (HEAD-first, download fallback), the
  // watch/unwatch lifecycle (open-or-show watch, reconnect re-watch).
  // Re-anchored to the v2.2.7 (fedc6f2) forms (issue #188): the HEAD probe moved into
  // `headStreamedFile(platform.fetch ?? fetch, url, signal)` (artifact.ts), and upstream
  // re-verticalized the watch call points through `api.experimental.file.watch/unwatch` —
  // the generated face carries the `Experimental`-prefixed wrappers again, so the old
  // mobile(files-stream-watch) de-prefix adaptation is obsolete and the anti-leak check
  // below is retired (recorded old→new).
  const model = squash(await read(`${APP}src/workspaces/files/model.tsx`))
  if (!model.includes("streamedKinds.has(artifactKind(file))"))
    fail("9: model.tsx lost the streamed-kind gate (HEAD-first read)")
  if (!model.includes("headStreamedFile(platform.fetch??fetch,url,signal)"))
    fail("9: model.tsx lost the HEAD probe shape (headStreamedFile over platform.fetch ?? fetch)")
  if (!model.includes("response.ok?streamedFileContent(file,url,response):download()"))
    fail("9: model.tsx lost the streamed/download fallback pair")
  if (!model.includes("voidserverSDK.api.experimental.file.watch({path:file,location:{directory:scope()}}).catch(()=>{})"))
    fail("9: model.tsx watch must dial api.experimental.file.watch scoped to the location and swallow errors (old-server tolerance)")
  if (!model.includes("voidserverSDK.api.experimental.file.unwatch({path:file,location:{directory:scope()}}).catch(()=>{})"))
    fail("9: model.tsx unwatch must dial api.experimental.file.unwatch scoped to the location and swallow errors")
  if (!model.includes('serverSDK.event.on("server.connected"'))
    fail("9: model.tsx lost the server.connected re-watch subscription")
  if (!model.includes("attachment.files.opened().forEach(watch)"))
    fail("9: the reconnect handler must re-watch the opened files")
  if (!model.includes("onCleanup(stop)"))
    fail("9: the server.connected subscription must clean up (onCleanup)")

  // artifact.ts: streamed media kinds + the versioned URL composition.
  const artifact = squash(await read(`${APP}src/workspaces/files/artifact.ts`))
  if (!artifact.includes('exportconststreamedKinds=newSet<ArtifactKind>(["image","audio","video"])'))
    fail("9: streamedKinds must be exactly the image/audio/video set")
  if (!artifact.includes("exportfunctionstreamedFileContent(path:string,url:string,response:Response)"))
    fail("9: streamedFileContent changed shape")
  if (!artifact.includes('versioned.searchParams.set("v",`${size}-${Date.parse(response.headers.get("last-modified")??"")||0}`)'))
    fail("9: the v=<size>-<mtime> version composition changed")
  if (!artifact.includes("mimeType:artifactMime(path)"))
    fail("9: streamed content mime must come from artifactMime")

  // api.ts: fileStreamUrl — credential never enters a DOM URL.
  const api = squash(await read(`${APP}src/runtime/server/api.ts`))
  if (!api.includes("exportfunctionfileStreamUrl(server:ServerConnection.HttpBase,input:{path:string;directory:string})"))
    fail("9: fileStreamUrl changed shape")
  if (!api.includes("if(server.password)return"))
    fail("9: fileStreamUrl must return undefined for password-protected servers (credentials stay out of DOM URLs)")
  if (!api.includes('url.searchParams.set("location[directory]",input.directory)'))
    fail("9: fileStreamUrl lost the location[directory] query parameter")

  // protocol fs.ts: the two endpoint identifiers (route identity the client dials).
  const fs = await read(`${APP}../protocol/src/groups/fs.ts`)
  if (!fs.includes('identifier: "experimental.fs.watch"')) fail("9: protocol fs group lost the experimental.fs.watch endpoint")
  if (!fs.includes('identifier: "experimental.fs.unwatch"')) fail("9: protocol fs group lost the experimental.fs.unwatch endpoint")
  if (!fs.includes('HttpApiEndpoint.post("fs.watch", "/api/experimental/fs/watch"'))
    fail("9: fs.watch must POST /api/experimental/fs/watch")
  if (!fs.includes('HttpApiEndpoint.delete("fs.unwatch", "/api/experimental/fs/watch"'))
    fail("9: fs.unwatch must DELETE the same /api/experimental/fs/watch path")
  if (!fs.includes("ServiceUnavailableError"))
    fail("9: fs.watch must declare ServiceUnavailableError (location not ready → 503)")

  // generated client. Re-anchored to the v2.2.7 (fedc6f2) form (issue #188): the vendored
  // generated face carries the upstream `Experimental`-prefixed wrapper names again (the
  // de-prefix payload of the old files-stream-watch adaptation is obsolete upstream), with the
  // same endpoint paths and the same watch statuses.
  const client = await read(`${CLIENT}src/promise/generated/client.ts`)
  if (!client.includes("path: `/api/experimental/fs/watch`"))
    fail("9: the generated client lost the watch/unwatch endpoint path")
  const watchBlock =
    /watch:\s*\(input: ExperimentalFileWatchInput[\s\S]*?unwatch:\s*\(input: ExperimentalFileUnwatchInput[\s\S]*?\),\s*\n\s*\},/.exec(client)
  if (!watchBlock)
    fail("9: the file.watch/unwatch wrapper block (ExperimentalFileWatchInput/ExperimentalFileUnwatchInput names) changed")
  if (watchBlock && !watchBlock[0].includes("successStatus: 204,\n              declaredStatuses: [400, 401, 404, 503],\n              empty: true,"))
    fail("9: file.watch must declare success 204 with [400, 401, 404, 503]")

  // types.ts: the four payload types (the de-prefixed names survive as upstream deprecated
  // aliases of the Experimental-prefixed types).
  const types = await read(`${CLIENT}src/promise/generated/types.ts`)
  for (const name of ["FileWatchInput", "FileWatchOutput", "FileUnwatchInput", "FileUnwatchOutput"]) {
    if (!types.includes(`export type ${name} =`)) fail(`9: generated types lost ${name}`)
  }
}

// --- 10. pierre tree chain on the @pierre/trees beta.6 baseline (issue #162) ---
// The gui-plugins package is extracted from the v2.2.1 tree (3ebcf9a) while the vendor baseline
// pin is b4525d79; its pierre-tree.tsx calls beta.6-only FileTree APIs, so the dependency
// baseline MUST stay at beta.6 — the beta.4 downgrade broke the Open-file tree at runtime
// (applyGitStatusPatch/getVisibleRows TypeErrors; see docs/build-and-verify.md #162/#163).
{
  const tree = await read(`${GUI_EXT}src/file/pierre-tree.tsx`)
  // Re-anchored to the v2.2.7 (fedc6f2) forms (issue #188): the beta.6 calls moved into effect
  // handlers (`current.applyGitStatusPatch(effect.patch)`) and a guard expression
  // (`tree.getVisibleRows(startIndex, endIndex)` inside a null-checked branch); the beta.6 pin
  // and the file-tree-v2 identity are unchanged.
  if (!tree.includes("current.applyGitStatusPatch(effect.patch)"))
    fail("10: pierre-tree lost the beta.6 applyGitStatusPatch call (git status badge chain)")
  if (!tree.includes("tree.getVisibleRows(startIndex, endIndex)"))
    fail("10: pierre-tree lost the beta.6 getVisibleRows call (scroll-into-view chain)")
  if (!tree.includes('data-component="file-tree-v2"'))
    fail("10: pierre-tree lost the file-tree-v2 wrapper identity")

  const guiPkg = await read(`${GUI_EXT}package.json`)
  const appPkg = await read(`${APP}package.json`)
  if (!guiPkg.includes('"@pierre/trees": "1.0.0-beta.6"'))
    fail("10: gui-plugins package.json must pin @pierre/trees 1.0.0-beta.6 (v2.2.1 extraction baseline)")
  if (!appPkg.includes('"@pierre/trees": "1.0.0-beta.6"'))
    fail("10: app package.json must pin @pierre/trees 1.0.0-beta.6 (api calls above need it)")
  if (guiPkg.includes("1.0.0-beta.4") || appPkg.includes("1.0.0-beta.4"))
    fail("10: the stale beta.4 pin resurfaced in a vendored package.json")
}

console.log(
  "verify-files: PASS (" +
    "1: tree/read/search wired through api.file.list/read/find with location scope + path identity + NotFound normalization + search swallow registered; generated client fs endpoints with [400,401,404]/binary read; " +
    "2: fs.write call sites form exactly the closed 1-file set {composer/attachments/destination.ts} in app+gui-extensions src/** (client generated wrapper single-listed, zero callers — #16 baseline) with attachments-upload-redirect-policy context kept; " +
    "3: 256MiB media placeholder (text uncapped — honest), 8KiB NUL binary test, unknown-binary placeholder, UTF-8 non-fatal decode, LRU 40 entries / 20MiB; " +
    "4: watcher invalidate chain (.git/ skip, force+silent reread, link-open force sync verbatim, adjacent scope-change reset, selectedLines persistence); " +
    "5: SessionStateKey.is migration filter, 50-key eviction list containing file-view, serverScoped file-view store 500/20, SessionStateKey.from/is brands; " +
    "6: mobile placement renders MobileFiles, OpenInApp desktop gates (if(desktop)/Show/canOpen/ctx.desktop ternary), mobile aria labels, button rows + aria-expanded + 28px, search combobox limit 200 + role=status, drag off on mobile, en+zh i18n pairs; " +
    "7: @-mention file.find candidates, file:// ?start=&end= send shape, addSelectionToContext + noLineSelection toast, viewer composer.attach channel, selectionFromFileUrl recovery; " +
    "8: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted files (workspaces + gui-extensions/file); " +
    "9: streamed media reads (HEAD-first via fileStreamUrl, download fallback, streamedKinds image/audio/video) + file.watch/unwatch subscriptions (scoped, silent-failure, server.connected re-watch, onCleanup) with the vendored de-prefixed generated face and [400,401,404,503] watch statuses; " +
    "10: pierre tree chain on the @pierre/trees 1.0.0-beta.6 baseline (applyGitStatusPatch/getVisibleRows call sites + beta.6 pins in gui-plugins and app package.json, #162); " +
    "STATIC check - tree/search/view runtime behavior, stale reread timing, recovery, client-exit red line and touch/a11y adequacy are G22)",
)
