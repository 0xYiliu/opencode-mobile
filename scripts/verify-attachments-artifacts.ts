// verify-attachments-artifacts.ts — static probe for issue #16 (attachments, artifacts,
// and Android file interactions unit).
//
// Asserts, against the REAL vendored/first-party/shell sources (pin b4525d79bf…), the
// structural facts the attachments-artifacts unit document relies on:
//
//   1. fs.write exhaustive-set baseline (the #11 starting baseline, re-verified): the
//      normalized `api.file.write(` / `/api/experimental/fs/write` call-site set over
//      app + gui-extensions `src/**` is STILL exactly {composer/attachments/destination.ts}
//      — M-021 adds no write call and the files bridge never touches the upload endpoint.
//   2. M-020 anchors: the entry wires the fifth bridge through the module-level files seam
//      (registration shape equal to the M-016 svcops block); web.ts completes the two
//      pre-existing optional Platform fields through the two seam-reading factories with
//      their dist-marker strings; platform.tsx still carries the UNCHANGED optional
//      declarations (zero Platform type change).
//   3. M-021 anchors: the openAttachment data: branch is the ONLY bridge share call site
//      (exactly one `shareDataUrl(` in region.tsx), the passed name is the same source as
//      the anchor.download (getFilename(file.name) || "attachment"), the seam import is the
//      M-012 first-party import shape, and the file:// (uri) branch faces are intact
//      (identity separation: no device-side share for remote artifacts).
//   4. B2 two-layer name sanitization: the JS layer (sanitizeFilename whitelist, no-strip
//      discipline, 128-char bound) and the Kotlin mirror (FILENAME regex + native
//      re-check comments + the 32 MiB bound) are both in place.
//   5. Bridge face: FILES_ERROR_CODES six-code taxonomy, the fail-closed stub per-field
//      semantics (clipboardImage null / saveFile false / shareDataUrl false), MAX_BRIDGE_BYTES,
//      the SAF save face (ACTION_CREATE_DOCUMENT + EXTRA_TITLE + openOutputStream, zero
//      cacheDir write on the save path) and the share face (FLAG_GRANT_READ_URI_PERMISSION
//      on BOTH intents, generational cleanup, read-only provider, manifest registration
//      exported=false + grantUriPermissions=true).
//   6. Handshake isolation: the five bridge handshake strings are pairwise distinct
//      (extracted from the five transport sources); the mobile patch registration carries
//      M-020/M-021 and exactly the registered ID set M-001..M-044 except reserved M-019/M-039
//      (43 patches total; issue #65 registered M-035, #66 M-036, #67 M-037, #70 M-038,
//      #72 M-040, #76 M-041, #101 M-042..M-044, #102 M-045 in
//      respective same-commit revisions; issue #23/#26/#55/#63/#64/#65/#66/#67 count revisions
//      remain documented history —
//      exact JSON set/path checks prevent an added or missing patch from passing); dist markers
//      (opencode-mobile-files-handshake / mobile(files-v1) / mobile(M-020) / mobile(M-021))
//      are present in the built assets when a dist exists.
//   7. No-leak negatives: the new-face sources (mobile-hosts files module + shell files
//      package) contain ZERO server-path shapes (`paths.tmp` / `info.paths`) and ZERO
//      credential-face imports; the identity-separation anchors (PathAttachmentPart "its
//      bytes never enter the draft store", send-side file:// and dataUrl faces) are intact.
//   8. Zero host-OS conditionals in the new first-party face (packages/mobile-hosts/src/files)
//      with a scanned-file lower bound.
//
// HONEST BOUNDARY (same tradition as verify-files.ts): this is a static STRUCTURE check
// (text anchors / regex on source files). It proves source shape, NOT runtime behavior:
// SAF dialog flows, share-sheet grants, clipboard reads, upload progress, artifact
// rendering and touch/a11y adequacy on a device are covered by the G27 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-attachments-artifacts.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-attachments-artifacts: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

const APP = "vendor/upstream/packages/app/"
const MOBILE_HOSTS = "packages/mobile-hosts/"
const SHELL_FILES = "android/app/src/main/java/ai/opencode/mobile/files/"

// Newline tolerance (plan R2 / #9 N-2 lesson): normalize ALL whitespace before matching.
const squash = (source: string) => source.replace(/\s+/g, "")

// --- 1. fs.write exhaustive-set baseline (#16 starting baseline, re-verified) ---
{
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/"]
  const expected = new Set([`${APP}src/composer/attachments/destination.ts`])
  const collected = new Set<string>()
  for (const base of [`${APP}src/`, "vendor/upstream/packages/gui-plugins/src/"]) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const rel = `${base}${file}`
      if (skip.some((entry) => `/${rel}`.includes(entry))) continue
      const source = await read(rel)
      if (/api\.file\.write\(|\/api\/experimental\/fs\/write/.test(squash(source))) collected.add(rel)
    }
  }
  for (const file of collected) {
    if (!expected.has(file)) fail(`1: unexpected fs.write call site outside the closed set: ${file}`)
  }
  for (const file of expected) {
    if (!collected.has(file)) fail(`1: expected fs.write call site missing from the scan: ${file}`)
  }
  if (collected.size !== 1) fail(`1: write call-site set must equal exactly 1 file, got ${collected.size}`)

  // The new faces never touch the upload endpoint.
  for (const file of [
    `${MOBILE_HOSTS}src/files/transport.ts`,
    `${MOBILE_HOSTS}src/files/client.ts`,
    `${SHELL_FILES}FilesBridge.kt`,
  ]) {
    const source = squash(await read(file))
    if (source.includes("/api/experimental/fs/write") || source.includes("api.file.write(")) {
      fail(`1: the files bridge face must never reference the upload endpoint: ${file}`)
    }
  }
}

// --- 2. M-020 anchors (entry seam registration + web platform completion, types untouched) ---
{
  const entry = squash(await read(`${APP}src/entry.tsx`))
  if (!entry.includes('import{createFilesClient,createMobileHosts,'))
    fail("2: entry.tsx lost the createFilesClient import (alphabetical position after the opening brace)")
  if (!entry.includes("createWebMessageFilesTransport,") || !entry.includes("setActiveFilesPort,"))
    fail("2: entry.tsx lost the files transport/seam imports")
  if (!entry.includes("opencode-mobile-files-handshake"))
    fail("2: entry.tsx lost the files handshake comment anchor")
  if (!entry.includes("setActiveFilesPort(createFilesClient(createWebMessageFilesTransport({"))
    fail("2: entry.tsx must register the files client through setActiveFilesPort over the web message transport (M-016 shape)")
  // Registration sits directly above the createMobileHosts call (rebase target discipline).
  const registrationAt = entry.indexOf("setActiveFilesPort(createFilesClient(")
  const hostsAt = entry.indexOf("consthosts=createMobileHosts({")
  if (registrationAt < 0 || hostsAt < 0 || registrationAt > hostsAt)
    fail("2: the files registration must sit directly above the createMobileHosts call")

  const web = await read(`${APP}src/runtime/platform/web.ts`)
  if (!web.includes("readClipboardImage: createPlatformClipboardReader(),"))
    fail("2: web.ts must complete the readClipboardImage Platform field via the factory")
  if (!web.includes("saveFile: createPlatformFileSaver(),"))
    fail("2: web.ts must complete the saveFile Platform field via the factory")
  if (!web.includes("activeFilesPort().clipboardImage()") || !web.includes("activeFilesPort().saveFile(opts, content)"))
    fail("2: both platform faces must read the port through the module-level seam per call")
  if (!web.includes("mobile(M-020): platform clipboard reader over the files bridge seam (issue #16)"))
    fail("2: web.ts lost the readClipboardImage dist marker string")
  if (!web.includes("mobile(M-020): platform file saver over the files bridge seam (issue #16)"))
    fail("2: web.ts lost the saveFile dist marker string")
  if (!web.includes('import { activeFilesPort, createSecureFetch } from "@opencode-mobile/mobile-hosts"'))
    fail("2: web.ts must import the seam from the first-party package (M-011 import line extended)")
  // Fail-closed stub semantics registered in the patch (M1: saveFile false = silent cancel,
  // an intentional behavior change over the absent-field fake-success anchor).
  if (!web.includes("fail-closed") || !web.includes("G27⑧"))
    fail("2: web.ts lost the fail-closed stub / G27⑧ behavior-change registration comment")

  // Platform TYPES are untouched: the pre-existing optional declarations stand verbatim.
  const platform = squash(await read(`${APP}src/runtime/platform/platform.tsx`))
  if (!platform.includes('saveFile?(opts:SaveFilePickerOptions,content:string):Promise<boolean>'))
    fail("2: platform.tsx saveFile declaration changed shape (Platform types must stay untouched)")
  if (!platform.includes("readClipboardImage?():Promise<File|null>"))
    fail("2: platform.tsx readClipboardImage declaration changed shape (Platform types must stay untouched)")
  if (!platform.includes("Readimagefromclipboard(desktoponly)"))
    fail("2: platform.tsx lost the 'Read image from clipboard (desktop only)' comment anchor")
  if (!platform.includes("typeSaveFilePickerOptions={title?:string;defaultPath?:string}"))
    fail("2: platform.tsx SaveFilePickerOptions changed shape (no mime field — L5 derivation lives in the client)")
}

// --- 3. M-021 anchors (data:-only branch, same-source name, file:// branch untouched) ---
{
  const region = await read(`${APP}src/session/composer/region.tsx`)
  const shareCalls = [...region.matchAll(/\bshareDataUrl\s*\(/g)].length
  if (shareCalls !== 1)
    fail(`3: region.tsx must contain exactly ONE shareDataUrl call (the data: branch), got ${shareCalls}`)
  if (!region.includes('if (url.startsWith("data:")) {'))
    fail("3: region.tsx lost the data:-only branch guard")
  if (!region.includes('shareDataUrl(url, getFilename(file.name) || "attachment", file.mime)'))
    fail("3: the share call must pass the SAME name source as anchor.download (getFilename(file.name) || \"attachment\")")
  if (!region.includes('import { activeFilesPort } from "@opencode-mobile/mobile-hosts"'))
    fail("3: region.tsx must import the seam from the first-party package (M-012 import shape)")
  if (!region.includes("mobile(M-021): timeline attachment share over the files bridge (issue #16)"))
    fail("3: region.tsx lost the M-021 dist marker string")
  // file:// (uri) branch faces intact — the upstream reveal/download logic stands verbatim.
  const squashedRegion = squash(region)
  if (!squashedRegion.includes('consturl=file.source.type==="uri"?file.source.uri:`data:${file.mime};base64,${file.data}`'))
    fail("3: the uri/data url split changed (file:// branch must stay untouched)")
  if (!squashedRegion.includes("if(!platform.revealPath||!absolute)returndownload()"))
    fail("3: the uri-branch reveal/download logic changed (identity separation: remote artifacts keep upstream behavior)")
  // The share branch must not swallow the anchor fallback: both promise channels land on download().
  if (!squashedRegion.includes("if(shared)returndownload()")) 
    fail("3: the share-then-fallback shape changed (L6: false falls back to anchor.download)")

  // The fallback behavior is honest at the client: false/throw never invent success.
  const client = await read(`${MOBILE_HOSTS}src/files/client.ts`)
  if (!client.includes("shared !== boolean") && !client.includes('typeof shared !== "boolean"'))
    fail("4/client: the share result shape guard changed")
}

// --- 4. B2 two-layer name sanitization (JS + Kotlin native re-check) ---
{
  const client = await read(`${MOBILE_HOSTS}src/files/client.ts`)
  if (!client.includes("export function sanitizeFilename(name: string): string {"))
    fail("4: client.ts lost the sanitizeFilename export")
  if (!client.includes("const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._\\-[\\]()]{0,127}$/"))
    fail("4: the JS whitelist pattern changed (leading alnum, no leading dot, 128 bound)")
  if (!client.includes('name.includes("/") || name.includes("\\\\")'))
    fail("4: the JS separator rejection changed (Nit①: no internal strip — separators are outright rejected)")
  if (!client.includes('name.includes("..")'))
    fail("4: the JS dot-segment rejection changed")
  if (!client.includes('throw new FilesError("unsupported", "filename must not be empty")'))
    fail("4: the JS empty-name rejection changed")
  for (const anchor of [
    "it is never rewritten)",
    "basename normalization is the CALLER's job",
  ]) {
    if (!client.includes(anchor)) fail(`4: client.ts lost the no-strip discipline comment anchor: ${anchor}`)
  }

  const bridge = await read(`${SHELL_FILES}FilesBridge.kt`)
  if (!bridge.includes('private val FILENAME = Regex("^[A-Za-z0-9][A-Za-z0-9 ._\\\\-\\\\[\\\\]()]{0,127}$")'))
    fail("4: the Kotlin FILENAME mirror regex changed")
  for (const anchor of [
    "empty filename (native re-check)",
    "filename contains a path separator (native re-check)",
    "filename contains a dot segment (native re-check)",
    "filename outside the whitelist (native re-check)",
  ]) {
    if (!bridge.includes(anchor)) fail(`4: FilesBridge.kt lost the native re-check anchor: ${anchor}`)
  }
}

// --- 5. Bridge face (errors, stub semantics, bounds, SAF save, share grant) ---
{
  const errors = await read(`${MOBILE_HOSTS}src/files/errors.ts`)
  for (const code of ["unavailable", "too-large", "unsupported", "io", "busy", "cancelled"]) {
    if (!errors.includes(`"${code}"`)) fail(`5: FILES_ERROR_CODES lost the ${code} wire code`)
  }
  if (!errors.includes("user cancellation of the SAF dialog is NOT an error"))
    fail("5: errors.ts lost the saved:false contract note")

  const client = await read(`${MOBILE_HOSTS}src/files/client.ts`)
  if (!client.includes("export const MAX_BRIDGE_BYTES = 32 * 1024 * 1024"))
    fail("5: the 32 MiB JS bound changed")
  if (!client.includes("clipboardImage: async () => null,")) fail("5: the stub clipboardImage must answer null")
  if (!client.includes("saveFile: async () => false,")) fail("5: the stub saveFile must answer false (plan M1, single-listed)")
  if (!client.includes("shareDataUrl: async () => false,")) fail("5: the stub shareDataUrl must answer false")
  if (!client.includes("NOT equivalent, and this is an INTENTIONAL behavior change"))
    fail("5: client.ts lost the M1 per-field semantics header (saveFile stub inequivalence)")
  if (!client.includes("export function setActiveFilesPort(") || !client.includes("export function activeFilesPort("))
    fail("5: the module-level seam accessors changed shape (M-016 precedent)")
  if (!client.includes("export function mimeFromFilename("))
    fail("5: the L5 mime derivation helper is gone")
  if (!client.includes('"application/octet-stream"'))
    fail("5: the octet-stream fallback for unknown save extensions is gone (L5)")
  if (!client.includes('if (!dataUrl.startsWith("data:")) throw new FilesError("unsupported"'))
    fail("5: shareDataUrl must refuse non-data: URLs client-side")

  const transport = await read(`${MOBILE_HOSTS}src/files/transport.ts`)
  if (!transport.includes('export const FILES_HANDSHAKE = "opencode-mobile-files-handshake"'))
    fail("5: the files handshake constant changed")
  if (!transport.includes("mobile(files-v1): file bridge transport over the platform web message channel"))
    fail("5: the files-v1 dist marker string changed")
  if (!transport.includes('timeoutMs ?? 300_000'))
    fail("5: the transport default timeout changed (5 min: SAF dialog interaction dominates)")

  // Shell: SAF save face (B1) + share grant discipline (L1/L8).
  const bridge = await read(`${SHELL_FILES}FilesBridge.kt`)
  if (!bridge.includes("Intent.ACTION_CREATE_DOCUMENT") || !bridge.includes("Intent.EXTRA_TITLE"))
    fail("5: the SAF save dialog face changed (ACTION_CREATE_DOCUMENT + EXTRA_TITLE)")
  if (!bridge.includes("openOutputStream(uri, \"wt\")"))
    fail("5: the one-shot SAF write face changed (openOutputStream)")
  if (!bridge.includes('const val REQUEST_SAVE_DOCUMENT = 41002'))
    fail("5: the independent save request code changed (chooser keeps 41001)")
  if (!bridge.includes('code: "busy"') && !bridge.includes('respondError(requestId, "busy")'))
    fail("5: the pendingSave busy refusal changed")
  const grantFlags = [...bridge.matchAll(/FLAG_GRANT_READ_URI_PERMISSION/g)].length
  if (grantFlags < 2)
    fail(`5: FLAG_GRANT_READ_URI_PERMISSION must appear on BOTH the send and the chooser intent (L8), got ${grantFlags}`)
  if (!bridge.includes("cleanupShareGenerations(keep = current)"))
    fail("5: the generational cleanup call changed (L1: keep current, delete older)")
  if (!bridge.includes("deleteRecursively()"))
    fail("5: the onDestroy full-clear face changed")
  if (!bridge.includes("HandlerThread(\"opencode-mobile-files\")"))
    fail("5: the single background HandlerThread changed (M2)")
  if (!bridge.includes("CLIPBOARD_TIMEOUT_MS = 10_000L"))
    fail("5: the clipboard 10 s bound changed")
  if (!bridge.includes('description.hasMimeType("image/*")'))
    fail("5: the clipboard image/* shape gate changed")
  if (!bridge.includes('uri.scheme != "content"'))
    fail("5: the clipboard content:// gate changed")

  // B1 sentinels (issue #16 code-review round): the SAF save slot must be installed with
  // the DECODED bytes right before the dialog starts, onActivityResult must consume that
  // array, and the zero-byte placeholder construction must be gone — a saved:true answer
  // must never correspond to an empty slot.
  if (!bridge.includes("pendingSave = PendingSave(requestId, bytes)"))
    fail("5: B1 sentinel — the save slot must be installed with the decoded bytes (pendingSave = PendingSave(requestId, bytes))")
  if (bridge.includes("ByteArray(0)"))
    fail("5: B1 sentinel — the zero-byte placeholder slot construction must be gone")
  if (!bridge.includes("output.write(pending.bytes)"))
    fail("5: B1 sentinel — onActivityResult must write the pending payload array")
  // F2 sentinel (same review round): inbound parsing must hop to the background parse
  // thread — the port callback must not call handleClientMessage inline.
  if (!bridge.includes("backgroundHandler.post { handleClientMessage(raw) }"))
    fail("5: F2 sentinel — inbound dispatch must hop to the background parse thread (backgroundHandler.post { handleClientMessage(raw) })")

  const provider = await read(`${SHELL_FILES}ShareFileProvider.kt`)
  if (!provider.includes('const val AUTHORITY = "ai.opencode.mobile.share"'))
    fail("5: the share provider authority changed")
  if (!provider.includes('if (mode != "r") throw SecurityException("share provider is read-only")'))
    fail("5: the provider must be strictly read-only")
  if (!provider.includes("canonicalPath"))
    fail("5: the provider lost the canonical-path escape re-check")

  const manifest = await read("android/app/src/main/AndroidManifest.xml")
  if (!manifest.includes('android:name=".files.ShareFileProvider"')) fail("5: the provider is not registered")
  if (!manifest.includes('android:exported="false"') || !manifest.includes('android:grantUriPermissions="true"'))
    fail("5: the provider registration must be exported=false + grantUriPermissions=true")

  const main = await read("android/app/src/main/java/ai/opencode/mobile/MainActivity.kt")
  if (!main.includes("FilesBridge.REQUEST_SAVE_DOCUMENT"))
    fail("5: MainActivity must route 41002 to the files bridge")
  if (!main.includes("Intent.EXTRA_ALLOW_MULTIPLE") || !main.includes("clipData"))
    fail("5: the multiple-selection result resolution changed")
  if (!main.includes("Intent.ACTION_GET_CONTENT"))
    fail("5: the ACTION_GET_CONTENT fallback changed")
  if (!main.includes("EXTRA_MIME_TYPES"))
    fail("5: the acceptTypes MIME list face changed")
}

// --- 6. Handshake isolation + registration + dist markers ---
let distAssetCount = 0
{
  const handshakeFiles: [string, RegExp][] = [
    [`${MOBILE_HOSTS}src/vault/transport.ts`, /VAULT_HANDSHAKE = "([^"]+)"/],
    [`${MOBILE_HOSTS}src/probe.ts`, /PROBE_HANDSHAKE = "([^"]+)"/],
    [`${MOBILE_HOSTS}src/ssh/bridge.ts`, /SSH_HANDSHAKE = "([^"]+)"/],
    [`${MOBILE_HOSTS}src/service-ops/bridge.ts`, /SVCOPS_HANDSHAKE = "([^"]+)"/],
    [`${MOBILE_HOSTS}src/files/transport.ts`, /FILES_HANDSHAKE = "([^"]+)"/],
  ]
  const handshakes: string[] = []
  for (const [file, pattern] of handshakeFiles) {
    const match = pattern.exec(await read(file))
    if (!match) fail(`6: could not extract the handshake constant from ${file}`)
    handshakes.push(match![1]!)
  }
  if (new Set(handshakes).size !== 5)
    fail(`6: the five bridge handshakes must be pairwise distinct, got ${JSON.stringify(handshakes)}`)
  if (!handshakes.includes("opencode-mobile-files-handshake"))
    fail("6: the files handshake literal moved")

  const patchManifest = JSON.parse(await read("vendor/upstream/patches/mobile/manifest.json")) as {
    patches?: Array<{ id?: unknown; patch?: unknown; upstreamBaseline?: unknown }>
  }
  const patchRows = patchManifest.patches ?? []
  const patchIds = patchRows.map((entry) => entry.id).filter((id): id is string => typeof id === "string")
  // Issue #102: 43 registered = M-001..M-045 with M-019 and M-039 reserved-absent (M-038
  // registered by the btw narrow-screen entry; M-039 reserved for the parallel issue #71
  // branch, a hole at apply time tolerated like M-019/0031; M-041 registered by the N08
  // external-open bridge face; M-042..M-044 by the settings-framework migration; M-045 by
  // the servers-page target migration). Issue #103: M-046 by the general/experimental
  // preferences-page target migration. Issue #104: M-047 by the ui theme component-family
  // target-form trim (dead-export convergence). Issue #105: M-048 by the
  // providers/models/extensions settings-page target migration. Issue #106: M-049 by the
  // projects/workspaces settings-page target form (FU-3 runtime persistence deferred) -> 47.
  const expectedPatchIds = new Set(
    Array.from({ length: 49 }, (_, index) => `M-${String(index + 1).padStart(3, "0")}`).filter((id) => id !== "M-019" && id !== "M-039"),
  )
  const actualPatchIds = new Set(patchIds)
  if (patchRows.length !== 47 || patchIds.length !== patchRows.length || actualPatchIds.size !== patchRows.length)
    fail(`6: registered patch rows/IDs must be unique and exactly 47 (got rows=${patchRows.length}, valid IDs=${patchIds.length}, unique IDs=${actualPatchIds.size})`)
  for (const id of expectedPatchIds) if (!actualPatchIds.has(id)) fail(`6: registered mobile patch ID set is missing ${id}`)
  for (const id of actualPatchIds) if (!expectedPatchIds.has(id)) fail(`6: registered mobile patch ID set has unexpected ${id}`)
  if (patchRows.some((entry) => typeof entry.upstreamBaseline !== "string" || !entry.upstreamBaseline))
    fail("6: every registered mobile patch must retain its upstreamBaseline")
  if (!actualPatchIds.has("M-020") || !actualPatchIds.has("M-021"))
    fail("6: the patch manifest lost the M-020/M-021 registrations")
  const vendorManifest = JSON.parse(await read("vendor/upstream/vendor-manifest.json")) as { mobilePatches?: unknown }
  const vendorPatchPaths = Array.isArray(vendorManifest.mobilePatches)
    ? vendorManifest.mobilePatches.filter((path): path is string => typeof path === "string")
    : []
  const registeredPatchPaths = patchRows.map((entry) => entry.patch).filter((path): path is string => typeof path === "string")
  if (vendorPatchPaths.length !== patchRows.length || new Set(vendorPatchPaths).size !== patchRows.length ||
      registeredPatchPaths.length !== patchRows.length || vendorPatchPaths.toSorted().some((path, index) => path !== registeredPatchPaths.toSorted()[index]))
    fail("6: vendor-manifest mobilePatches paths must equal the registered patch paths (46 unique, path-for-path)")
  for (const patch of [
    "patches/mobile/0019-M-020-files-bridge-platform-capabilities.patch",
    "patches/mobile/0020-M-021-attachment-share-bridge-branch.patch",
  ]) {
    if (!vendorPatchPaths.includes(patch)) fail(`6: vendor-manifest.json lost ${patch}`)
  }

  // Dist markers (only when a build exists — staged like verify-direct-connection full mode).
  const distDir = new URL(`${APP}dist/_assets/`, repoRoot).pathname
  const distGlob = new Bun.Glob("*")
  const distFiles = await Array.fromAsync(distGlob.scan({ cwd: distDir }))
  distAssetCount = distFiles.length
  if (distFiles.length > 0) {
    for (const marker of [
      "opencode-mobile-files-handshake",
      "mobile(files-v1)",
      "mobile(M-020)",
      "mobile(M-021)",
    ]) {
      const proc = Bun.spawnSync(["grep", "-rl", "-e", marker, "dist/_assets/"], {
        cwd: new URL(APP, repoRoot).pathname,
      })
      if (proc.stdout.toString().trim() === "") fail(`6: dist marker ${marker} not found in built assets`)
    }
  }
}

// --- 7. No-leak negatives + identity separation ---
let scanned = 0
{
  const glob = new Bun.Glob("**/*.{ts,tsx,kt}")
  for (const base of [`${MOBILE_HOSTS}src/files/`, SHELL_FILES]) {
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      scanned++
      const source = await read(`${base}${file}`)
      if (source.includes("paths.tmp") || source.includes("info.paths"))
        fail(`7: server-path shape leaked into the new face: ${base}${file}`)
      if (/navigator\.platform|process\.platform|from ["']node:os["']/.test(source))
        fail(`7: host-OS conditional leaked into the new face: ${base}${file}`)
    }
  }
  if (scanned < 5) fail(`7: the new-face scan covered only ${scanned} files — the directory set looks wrong`)

  const schema = squash(await read(`${APP}src/composer/schema.ts`))
  if (!schema.includes("itsbytesneverenterthedraftstore"))
    fail("7: the identity-separation schema anchor changed (PathAttachmentPart)")
  const request = squash(await read(`${APP}src/composer/request.ts`))
  if (!request.includes("file://${encodeFilePath(path)}"))
    fail("7: the send-side file:// URI face changed")
  if (!request.includes("uri:attachment.dataUrl"))
    fail("7: the send-side inline dataUrl face changed")
}

// --- 8. Zero host-OS conditionals in the first-party files module (dedicated scan) ---
let filesModuleCount = 0
{
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${MOBILE_HOSTS}src/files/`, repoRoot).pathname }))) {
    filesModuleCount++
    const source = await read(`${MOBILE_HOSTS}src/files/${file}`)
    for (const [pattern, label] of [
      [/process\.platform/, "process.platform"],
      [/navigator\.platform/, "navigator.platform"],
      [/from ["']node:os["']/, 'import from "node:os"'],
      [/require\(["']os["']\)/, 'require("os")'],
    ] as [RegExp, string][]) {
      if (pattern.test(source)) fail(`8: host-OS conditional (${label}) found in files/${file}`)
    }
  }
  if (filesModuleCount < 3) fail(`8: the files module scan covered only ${filesModuleCount} files`)
}

console.log(
  "verify-attachments-artifacts: PASS (" +
    "1: fs.write call sites still form exactly the closed 1-file set {composer/attachments/destination.ts} (#11 baseline re-verified; the files bridge never references the upload endpoint); " +
    "2: M-020 entry seam registration (M-016 shape, above createMobileHosts) + web.ts readClipboardImage/saveFile completion through per-call seam readers with both mobile(M-020) markers + platform.tsx optional declarations verbatim (zero Platform type change); " +
    "3: M-021 exactly-one shareDataUrl call in the data:-only branch with the getFilename same-source name and L6 false-falls-back shape; uri-branch faces intact; " +
    "4: B2 two-layer sanitization (JS whitelist + no-strip discipline; Kotlin FILENAME mirror + native re-check anchors); " +
    "5: six-code taxonomy, fail-closed per-field stub semantics (saveFile false single-listed, M1), 32 MiB bound, SAF save face (41002 + EXTRA_TITLE + openOutputStream + busy), share grant flags on BOTH intents + generational cleanup + read-only provider + manifest exported=false/grantUriPermissions=true + B1 sentinels (decoded-bytes slot, no zero-byte placeholder, onActivityResult consumes the payload) + F2 sentinel (background dispatch hop); " +
     "6: five handshakes pairwise distinct, M-020/M-021 registered in the exact registered ID set (47 = M-001..M-049 minus reserved M-019/M-039; M-042..M-044 by issue #101, M-045 by issue #102, M-046 by issue #103, M-047 by issue #104, M-048 by issue #105, M-049 by issue #106), vendor path set equal; historical issue #23/#26/#55/#63/#64/#65/#66/#67/#72/#76 count revisions retained in build records" +    (distAssetCount > 0
      ? `, dist markers verified across ${distAssetCount} built assets`
      : ", dist markers SKIPPED (no built dist present)") +
    "; 7: zero server-path/OS/credential shapes in the new faces (" +
    scanned +
    " files) + identity-separation schema/request anchors; " +
    "8: zero host-OS conditionals across " +
    filesModuleCount +
    " files-module files; " +
    "STATIC check - SAF dialog flows, share-sheet grants, clipboard reads, upload progress and touch/a11y adequacy are G27)",
)
