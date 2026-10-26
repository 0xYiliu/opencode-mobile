// verify-artifacts.ts — static probe for issue #18 (artifact viewers: Office
// documents and rich media preview).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…) and the
// committed web-dist manifest, the structural facts the artifact-viewers unit
// document relies on:
//
//   1. Kind contract anchors: the ArtifactKind 14-name union (set equality),
//      the extension→MIME table as the EXACT 44-key set (set equality, both
//      directions), the three officeKinds MIME→kind mappings verbatim and the
//      artifactKind decision order (each branch after the previous).
//   2. Viewer surface anchors: previewableKinds exactly {svg, html, markdown,
//      mermaid, table}, the EIGHT Match branches of the main Switch in order,
//      the ArtifactBinary triple (filename + view.binary size + reason), the
//      extension-viewer lookup chain (`ctx.list(FileViewer).find`), the
//      problem-check → ErrorBoundary → Dynamic viewer chain, the decode-failure
//      and binary-fallback comments, the PDF iframe face (navpanes blob URL +
//      "The PDF viewer is Chromium's own…" + sandbox/referrerPolicy) and the
//      FileViewer contract sentence that names Office documents.
//   3. Office extension anchors: the zip [0x50,0x4b,0x03,0x04] and Compound
//      File [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1] magic-byte prechecks,
//      the problem.compound/problem.format wording, the "Bytes no engine can
//      open fail here" comment, the three lazy viewer registrations, the
//      microsoft-office extension id, and the NEGATIVE assertion that the
//      office renderer carries ZERO platform gating (contrast: browser/renderer
//      keeps its desktop early exit — the structural pair stays intact).
//   4. Worker/asset closure anchors: the three per-file worker constructions,
//      the three WorkerClosedError messages, the fonts.ts "no font request
//      leaves the machine" offline face, the fonts-cjk alias (CJK_FONT_ASSET_URLS
//      = undefined), and the committed web-dist/manifest.json closure: EXACTLY
//      four .wasm entries {docx_edit_bg-*, docx_parse_bg-*, pptx_wasm_bg-*,
//      xlsx_wasm_bg-*} (hash suffix not locked, per R8), the three office
//      worker chunks present, and exactly 86 .ttf font entries with the
//      metric-compatible Caladea/Carlito families (4 styles each).
//   5. License anchors: the BetterOffice notices entry (four packages, openooxml
//      URL, Apache License 2.0, crateNotices + OpenOOXML copyright), the
//      upstream OFL-1.1 font-family attribution section (notices/fonts.ts +
//      fonts/OFL-1.1.txt on disk), the PERMISSIVE audit whitelist carrying both
//      Apache-2.0 AND OFL-1.1, the four @betteroffice versions in bun.lock, and
//      the NEGATIVE assertion that the optional CJK font add-on is NOT in the
//      lock (the 33 MB add-on does not ship).
//   6. Error-path anchors: the file-view four-state Switch (loaded/loading/
//      notFound/error), the files-unit loadFailed toast anchor, MAX_MEDIA_BYTES
//      = 256 * 1024 * 1024 with the bounded-cache and NUL-in-8KiB comments and
//      the eight-kind binaryKinds set, the worker teardown comments
//      ("Terminating it is what frees the engine's memory." + far-page
//      release), and the office i18n error copy as the EXACT seven-key set with
//      verbatim English values (exactly one locale: en).
//   7. Identity separation / download boundary anchors: the RAW scan of
//      artifact-view.tsx for `saveFile|shareDataUrl|download(` must stay at the
//      MEASURED BASELINE OF ZERO (the viewer has no save/download affordance —
//      a future affordance must go through plan re-evaluation, candidate
//      M-022+), the M-021 data:-branch / file://-branch pair in region.tsx,
//      and the corrected attachments-artifacts wording (office kinds render
//      through the microsoft-office extension viewer chain, not placeholders).
//   8. Zero host-OS / zero electron scan: over the microsoft-office non-test
//      sources + util/src/artifact.ts, the platform-access pattern set
//      (`process.platform`, `navigator.platform`), `node:os`/`require("os")`
//      and electron imports must stay at the MEASURED BASELINE OF ZERO.
//
// HONEST BOUNDARY (same tradition as verify-browser.ts / verify-files.ts /
// verify-diff.ts / verify-terminal.ts / verify-attachments-artifacts.ts): this
// is a static STRUCTURE check (text anchors / regex on source files). It proves
// source shape and closure contents, NOT runtime behavior: Office WASM loading
// and first render on the target WebView, the 14-kind matrix and the PDF
// verdict, memory pressure, corrupt/legacy/encrypted presentation, orientation
// re-layout, CJK fallback adequacy, accessibility, identity-separation and
// offline negatives on a device are covered by the G29 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-artifacts.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-artifacts: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const UTIL = "vendor/upstream/packages/util/"
const GUI = "vendor/upstream/packages/gui-extensions/"
const APP = "vendor/upstream/packages/app/"
const OFFICE = `${GUI}src/microsoft-office/`

// Newline tolerance: squash ALL whitespace before verbatim anchor matching.
const squash = (source: string) => source.replace(/\s+/g, "")

const isTestFile = (rel: string) => /\.test\./.test(rel)

const srcFiles = async (base: string): Promise<string[]> => {
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  const out: string[] = []
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
    out.push(`${base}${file}`)
  }
  return out.sort()
}

// Slice between two unique text fences (for set-equality extractions). A
// missing end fence means "rest of file" (the caller's fences are unique).
const slice = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  if (from < 0) fail(`probe error: start fence not found: ${start}`)
  const to = source.indexOf(end, from + start.length)
  if (to < 0) return source.slice(from)
  return source.slice(from, to)
}

// --- 1. Kind contract anchors (util/src/artifact.ts) ---
{
  const artifact = await read(`${UTIL}src/artifact.ts`)

  // ArtifactKind: EXACT 14-name set (set equality, not containment).
  const union = slice(artifact, "export type ArtifactKind =", "const officeKinds")
  const names = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!)
  const expectedNames = [
    "image", "svg", "audio", "video", "pdf", "html", "markdown", "mermaid",
    "table", "font", "document", "spreadsheet", "presentation", "text",
  ]
  if (names.length !== 14 || new Set(names).size !== 14)
    fail(`1: the ArtifactKind union must carry exactly 14 distinct names, got ${names.length} (${names.join(", ")})`)
  for (const name of expectedNames) {
    if (!names.includes(name)) fail(`1: the ArtifactKind union lost the "${name}" kind`)
  }

  // mimes: EXACT 44-key set (set equality in both directions; the count is a
  // comment, the assertion is the set — plan F-2).
  const mimesBlock = slice(artifact, "const mimes = new Map([", "])")
  const pairs = [...mimesBlock.matchAll(/\["([a-z0-9]+)", "([^"]+)"\]/g)].map((m) => [m[1]!, m[2]!] as const)
  if (pairs.length !== 44) fail(`1: the mimes table must carry exactly 44 entries, got ${pairs.length}`)
  const expectedMimes: [string, string][] = [
    ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"],
    ["webp", "image/webp"], ["avif", "image/avif"], ["bmp", "image/bmp"], ["ico", "image/x-icon"],
    ["tif", "image/tiff"], ["tiff", "image/tiff"], ["heic", "image/heic"], ["svg", "image/svg+xml"],
    ["mp3", "audio/mpeg"], ["wav", "audio/wav"], ["ogg", "audio/ogg"], ["oga", "audio/ogg"],
    ["m4a", "audio/mp4"], ["aac", "audio/aac"], ["flac", "audio/flac"], ["opus", "audio/ogg"],
    ["weba", "audio/webm"],
    ["mp4", "video/mp4"], ["m4v", "video/mp4"], ["webm", "video/webm"], ["mov", "video/quicktime"],
    ["ogv", "video/ogg"], ["mkv", "video/x-matroska"],
    ["pdf", "application/pdf"],
    ["html", "text/html"], ["htm", "text/html"],
    ["md", "text/markdown"], ["markdown", "text/markdown"], ["mdx", "text/markdown"],
    ["mmd", "text/vnd.mermaid"], ["mermaid", "text/vnd.mermaid"],
    ["csv", "text/csv"], ["tsv", "text/tab-separated-values"],
    ["ttf", "font/ttf"], ["otf", "font/otf"], ["woff", "font/woff"], ["woff2", "font/woff2"],
    [
      "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    [
      "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  ]
  const got = new Map(pairs)
  const want = new Map(expectedMimes)
  if (got.size !== want.size) fail(`1: the mimes key set size changed: expected ${want.size}, got ${got.size}`)
  for (const [ext, mime] of want) {
    if (got.get(ext) !== mime) fail(`1: the mimes mapping for "${ext}" changed: expected "${mime}", got "${got.get(ext)}"`)
  }
  for (const ext of got.keys()) {
    if (!want.has(ext)) fail(`1: unexpected mimes key "${ext}" outside the closed 44-key set`)
  }

  // officeKinds: the three MIME→kind mappings verbatim.
  const officeBlock = slice(artifact, "const officeKinds = new Map<string, ArtifactKind>([", "])")
  for (const needle of [
    '["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"]',
    '["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"]',
    '["application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation"]',
  ]) {
    if (!officeBlock.includes(needle)) fail(`1: the officeKinds mapping changed: expected ${needle}`)
  }

  // artifactKind decision order: each branch anchor after the previous one.
  const decision = slice(artifact, "export function artifactKind(", "officeKinds.get(mime)")
  const order = [
    'if (!mime) return "text"',
    'if (mime === "image/svg+xml") return "svg"',
    'if (mime === "application/pdf") return "pdf"',
    'if (mime === "text/html") return "html"',
    'if (mime === "text/markdown") return "markdown"',
    'if (mime === "text/vnd.mermaid") return "mermaid"',
    'if (mime === "text/csv" || mime === "text/tab-separated-values") return "table"',
    'if (mime.startsWith("image/")) return "image"',
    'if (mime.startsWith("audio/")) return "audio"',
    'if (mime.startsWith("font/")) return "font"',
  ]
  let at = 0
  for (const anchor of order) {
    const index = decision.indexOf(anchor)
    if (index < 0) fail(`1: the artifactKind decision chain lost the branch: ${anchor}`)
    if (index < at) fail(`1: the artifactKind decision order changed around: ${anchor}`)
    at = index
  }
  if (!artifact.includes('return officeKinds.get(mime) ?? "video"'))
    fail(`1: the artifactKind fallback must stay 'return officeKinds.get(mime) ?? "video"'`)
}

// --- 2. Viewer surface anchors (artifact-view.tsx + contract.ts) ---
{
  const view = await read(`${GUI}src/file/artifact-view.tsx`)

  // previewableKinds: EXACT five-kind set.
  const previewBlock = slice(view, "const previewableKinds: readonly ArtifactKind[] = [", "]\n")
  const previewKinds = [...previewBlock.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!)
  const expectedPreview = ["svg", "html", "markdown", "mermaid", "table"]
  if (previewKinds.length !== 5 || !expectedPreview.every((k) => previewKinds.includes(k)))
    fail(`2: previewableKinds must be exactly [${expectedPreview.join(", ")}], got [${previewKinds.join(", ")}]`)

  // The EIGHT Match branches of the main Switch, in order.
  const branches = [
    '<Match when={kind() === "image" || kind() === "svg"}>',
    '<Match when={kind() === "video"}>',
    '<Match when={kind() === "audio"}>',
    '<Match when={kind() === "pdf" || kind() === "html"}>',
    '<Match when={kind() === "font"}>',
    "<Match when={table()}>",
    '<Match when={kind() === "markdown" || kind() === "mermaid"}>',
    "<Match when={viewer()} keyed>",
  ]
  let at = 0
  for (const anchor of branches) {
    const index = view.indexOf(anchor)
    if (index < 0) fail(`2: the artifact viewer main Switch lost a Match branch: ${anchor}`)
    if (index < at) fail(`2: the artifact viewer Match branch order changed around: ${anchor}`)
    at = index
  }
  if (!view.includes('<Switch fallback={<ArtifactBinary path={props.path} size={size()} reason={state().reason} />}>'))
    fail("2: the main Switch fallback must stay the ArtifactBinary placeholder (zero blank states)")

  // ArtifactBinary triple: filename + view.binary size + reason.
  const binary = slice(view, "function ArtifactBinary(", "}\n")
  if (!binary.includes("getFilename(props.path)"))
    fail("2: ArtifactBinary lost the filename face")
  if (!binary.includes('ctx.t("view.binary", { size: props.size })'))
    fail("2: ArtifactBinary lost the view.binary size face")
  if (!binary.includes("<Show when={props.reason}>"))
    fail("2: ArtifactBinary lost the reason face (errors must stay actionable, never blank)")
  // The comment wraps across two block-comment lines (the continuation `*` is
  // not whitespace, so the anchor splits at the wrap point).
  if (!view.includes("show the binary placeholder in this") || !view.includes("area alone rather than the whole file panel failing."))
    fail("2: artifact-view.tsx lost the binary-placeholder comment anchor")

  // Extension-viewer lookup chain + problem-check → ErrorBoundary → Dynamic.
  if (!view.includes("ctx.list(FileViewer).find((item) => item.kinds.includes(value))"))
    fail("2: artifact-view.tsx lost the FileViewer lookup chain (office kinds would lose their viewer)")
  if (!view.includes("A kind the file view does not render itself goes to the first extension viewer that lists it."))
    fail("2: artifact-view.tsx lost the extension-viewer lookup comment")
  if (!view.includes("props.viewer.problem?.(bytes)"))
    fail("2: ArtifactViewer lost the problem() precheck call")
  if (!view.includes("<ErrorBoundary"))
    fail("2: ArtifactViewer lost the ErrorBoundary (viewer throws must not blank the panel)")
  if (!view.includes("<Dynamic"))
    fail("2: ArtifactViewer lost the Dynamic view mount")
  if (!view.includes("const fail = (reason?: string) => change({ undecodable: true, info: {}, reason })"))
    fail("2: artifact-view.tsx lost the fail() fallback (undecodable → binary + details dropped)")
  if (!squash(view).includes(squash("The browser could not decode the bytes; the host falls back to the binary placeholder.")))
    fail("2: artifact-view.tsx lost the decode-failure fallback comment")

  // PDF/HTML iframe face.
  if (!view.includes("`${url()}#navpanes=0&view=FitH`"))
    fail("2: ArtifactFrame lost the PDF Open Parameters anchor (#navpanes=0&view=FitH)")
  // The two-line `//` comment anchors split at the line break.
  if (!view.includes("The PDF viewer is Chromium's own and does not run in a sandboxed frame.") || !view.includes("opaque origin: no app storage, cookies, or credentialed requests reach it."))
    fail("2: ArtifactFrame lost the Chromium-PDF-viewer dependency comment (G29② judgment-point fact)")
  if (!view.includes('sandbox={props.kind === "html" ? "allow-scripts allow-popups allow-forms allow-modals" : undefined}'))
    fail("2: ArtifactFrame lost the HTML sandbox token set")
  if (!view.includes('referrerPolicy="no-referrer"'))
    fail("2: ArtifactFrame lost the no-referrer policy")

  // The FileViewer contract names Office documents (extension contract face).
  const contract = await read(`${GUI}src/file/contract.ts`)
  if (!contract.includes("A viewer for a kind of file the file view does not render itself, such as an Office document."))
    fail("2: file/contract.ts lost the Office-document FileViewer contract sentence")
}

// --- 3. Office extension anchors (renderer + index + i18n + no gating) ---
{
  const renderer = await read(`${OFFICE}renderer.tsx`)

  // Magic-byte prechecks: zip passes, Compound File and everything else fail
  // BEFORE any engine downloads.
  if (!renderer.includes("const zip = [0x50, 0x4b, 0x03, 0x04]"))
    fail("3: renderer.tsx lost the zip magic signature [0x50, 0x4b, 0x03, 0x04]")
  if (!renderer.includes("const compound = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]"))
    fail("3: renderer.tsx lost the Compound File magic signature")
  if (!renderer.includes('ctx.t(startsWith(bytes, compound) ? "problem.compound" : "problem.format")'))
    fail("3: renderer.tsx lost the problem.compound / problem.format precheck wording")
  if (!renderer.includes("Bytes no engine can open fail here, before their viewer and its engine download."))
    fail("3: renderer.tsx lost the pre-engine-download rejection comment")
  // Two-line `//` header note (anchor splits at the wrap point).
  if (!renderer.includes("Each format loads its engine, several megabytes of wasm, only when a file of that format opens. Nothing preloads:") || !renderer.includes("most sessions never open an Office file."))
    fail("3: renderer.tsx lost the lazy-engine header note")

  // Three lazy viewer registrations (document/spreadsheet/presentation).
  for (const module of ["document", "spreadsheet", "presentation"]) {
    if (!renderer.includes(`lazy(() => import("./${module}"))`))
      fail(`3: renderer.tsx lost the lazy ${module} viewer registration`)
  }
  for (const kind of ['"document"', '"spreadsheet"', '"presentation"']) {
    if (!renderer.includes(`viewer(\n    ${kind},`))
      fail(`3: renderer.tsx lost the ${kind} viewer call`)
  }

  // Extension identity.
  const index = await read(`${OFFICE}index.ts`)
  if (!index.includes('id: "microsoft-office"')) fail("3: index.ts lost the microsoft-office extension id")
  if (!index.includes("i18n: { en }")) fail("3: index.ts lost the en i18n registration")
  if (!index.includes("Read-only previews of Word, Excel and PowerPoint files in the file view."))
    fail("3: index.ts lost the read-only previews header")

  // NEGATIVE: NO platform gating in the office renderer — the structural pair
  // with the browser extension must stay intact (office renders on web/mobile).
  if (/ctx\s*\.\s*build\s*\.\s*platform/.test(renderer))
    fail("3: microsoft-office/renderer.tsx gained a ctx.build.platform gate (mobile Office would vanish)")
  if (/process\s*\.\s*env/.test(renderer))
    fail("3: microsoft-office/renderer.tsx gained a process.env gate")
  // Contrast anchor: the browser extension KEEPS its desktop early exit.
  const browserRenderer = await read(`${GUI}src/browser/renderer.tsx`)
  if (!browserRenderer.includes('if (ctx.build.platform !== "desktop") return'))
    fail("3: browser/renderer.tsx lost its desktop early exit (the contrast pair broke)")

  // The office renderer is wired into the builtins compose (web build carries it).
  const rendererRegistry = await read(`${GUI}src/renderer.ts`)
  if (!rendererRegistry.includes('{ ...microsoftOffice, renderer: eager(microsoftOfficeRenderer) }'))
    fail("3: gui-extensions renderer.ts lost the microsoftOffice builtins compose entry")
}

// --- 4. Worker/asset closure anchors (workers + fonts + dist manifest) ---
{
  const documentViewer = await read(`${OFFICE}document.tsx`)
  if (!documentViewer.includes('new Worker(new URL("./document.worker.ts", import.meta.url), { type: "module" })'))
    fail("4: document.tsx lost its per-file module worker construction")
  const spreadsheetViewer = await read(`${OFFICE}spreadsheet.tsx`)
  if (!spreadsheetViewer.includes('new Worker(new URL("./spreadsheet.worker.ts", import.meta.url)'))
    fail("4: spreadsheet.tsx lost its per-file module worker construction")
  const presentationViewer = await read(`${OFFICE}presentation.tsx`)
  if (!presentationViewer.includes('new Worker(new URL("./presentation.worker.ts", import.meta.url)'))
    fail("4: presentation.tsx lost its per-file module worker construction")

  const rpc = await read(`${OFFICE}worker-rpc.ts`)
  for (const message of [
    '"The Office engine stopped"',
    '"The Office engine sent an unreadable reply"',
    '"The Office engine was closed"',
  ]) {
    if (!rpc.includes(message)) fail(`4: worker-rpc.ts lost the WorkerClosedError message ${message}`)
  }

  const fonts = await read(`${OFFICE}fonts.ts`)
  if (!fonts.includes("Every face loads from the app's own files, so no font request leaves the machine."))
    fail("4: fonts.ts lost the offline font-loading anchor (no request leaves the machine)")
  const fontsCjk = await read(`${OFFICE}fonts-cjk.ts`)
  if (!fontsCjk.includes("export const CJK_FONT_ASSET_URLS = undefined"))
    fail("4: fonts-cjk.ts lost the CJK add-on alias (CJK_FONT_ASSET_URLS = undefined)")
  // Two-line `//` comment (anchor splits at the wrap point).
  if (!fontsCjk.includes("The add-on is about 33 MB,") || !fontsCjk.includes("so the app aliases it to this module, which offers no faces: those scripts fall back to the bundled Latin faces."))
    fail("4: fonts-cjk.ts lost the 33 MB add-on fallback comment")

  // Committed dist closure: manifest.files carries the Office assets.
  const manifest = JSON.parse(await read("web-dist/manifest.json")) as { files: Record<string, string> }
  const paths = Object.keys(manifest.files ?? {})
  if (paths.length === 0) fail("4: web-dist/manifest.json carries no files record")
  const wasm = paths.filter((p) => p.endsWith(".wasm"))
  const expectedWasm = ["_assets/docx_edit_bg-", "_assets/docx_parse_bg-", "_assets/pptx_wasm_bg-", "_assets/xlsx_wasm_bg-"]
  if (wasm.length !== 4) fail(`4: the dist closure must carry exactly 4 .wasm entries, got ${wasm.length}: ${wasm.join(", ")}`)
  for (const prefix of expectedWasm) {
    if (!wasm.some((p) => p.startsWith(prefix)))
      fail(`4: the dist closure lost the ${prefix}*.wasm engine entry`)
  }
  // Hash suffix deliberately NOT locked (R8): a pin update changes hashes, a
  // changed FILE NAME set must fail (the closure set needs re-evaluation).
  for (const entry of wasm) {
    if (!expectedWasm.some((prefix) => entry.startsWith(prefix)))
      fail(`4: unexpected .wasm entry outside the closed engine set: ${entry}`)
  }
  for (const worker of ["_assets/document.worker-", "_assets/spreadsheet.worker-", "_assets/presentation.worker-"]) {
    if (!paths.some((p) => p.startsWith(worker) && p.endsWith(".js")))
      fail(`4: the dist closure lost the office worker chunk ${worker}*.js`)
  }
  const ttf = paths.filter((p) => p.endsWith(".ttf"))
  if (ttf.length !== 86) fail(`4: the dist closure must carry exactly 86 .ttf font entries, got ${ttf.length}`)
  for (const family of ["Caladea", "Carlito"]) {
    const styles = ttf.filter((p) => p.includes(family))
    if (styles.length !== 4) fail(`4: the dist closure must carry 4 ${family} styles, got ${styles.length}`)
  }
}

// --- 5. License anchors (BetterOffice + OFL-1.1 font families + audit + lock) ---
{
  const notices = await read(`${APP}src/settings/about/notices/notices.ts`)
  if (!notices.includes('detail: "@betteroffice/docx, @betteroffice/xlsx, @betteroffice/pptx, @betteroffice/fonts"'))
    fail("5: notices.ts lost the BetterOffice four-package detail line")
  if (!notices.includes('url: "https://github.com/openooxml/betteroffice"'))
    fail("5: notices.ts lost the openooxml project URL")
  if (!notices.includes('license: "Apache License 2.0"'))
    fail("5: notices.ts lost the BetterOffice Apache License 2.0 declaration")
  if (!notices.includes("crateNotices"))
    fail("5: notices.ts lost the crate-level notices anchor")
  if (!notices.includes("Copyright 2026 The OpenOOXML contributors"))
    fail("5: notices.ts lost the OpenOOXML copyright line")

  // OFL-1.1 font-family attribution section (plan F-1): the upstream notices
  // carry a dedicated OFL section for the shipped font families.
  const fontNotices = await read(`${APP}src/settings/about/notices/fonts.ts`)
  // Block comment wraps mid-sentence (the `*` continuation is not whitespace —
  // anchor splits at the wrap point).
  if (!fontNotices.includes("The font families the Office previews ship, each with the copyright lines its own license file carries. Every") || !fontNotices.includes("family is under the SIL Open Font License 1.1, so the license text is shown once."))
    fail("5: notices/fonts.ts lost the SIL Open Font License 1.1 section header")
  if (!fontNotices.includes('import license from "./fonts/OFL-1.1.txt?raw"'))
    fail("5: notices/fonts.ts lost the OFL-1.1 license text import")
  for (const family of ["Carlito", "Caladea", "Liberation Sans, Liberation Serif, Liberation Mono"]) {
    if (!fontNotices.includes(`name: "${family}"`))
      fail(`5: notices/fonts.ts lost the ${family} family attribution row`)
  }
  const oflText = Bun.file(new URL(`${APP}src/settings/about/notices/fonts/OFL-1.1.txt`, repoRoot))
  if (!(await oflText.exists()))
    fail("5: the OFL-1.1.txt license text file is missing from notices/fonts/")

  // The audit whitelist carries BOTH engines (Apache-2.0) and fonts (OFL-1.1).
  const audit = await read("scripts/license-audit.ts")
  if (!audit.includes('"Apache-2.0"')) fail("5: license-audit.ts PERMISSIVE lost Apache-2.0")
  if (!audit.includes('"OFL-1.1"')) fail("5: license-audit.ts PERMISSIVE lost OFL-1.1")

  // The four packages (and ONLY those — no CJK add-on) resolve in the lock.
  const lock = await read("bun.lock")
  for (const versioned of [
    '"@betteroffice/docx@0.4.3"',
    '"@betteroffice/fonts@0.4.0"',
    '"@betteroffice/pptx@0.2.0"',
    '"@betteroffice/xlsx@0.3.0"',
  ]) {
    if (!lock.includes(versioned)) fail(`5: bun.lock lost the ${versioned} resolution`)
  }
  if (lock.includes("@betteroffice/fonts-cjk@"))
    fail("5: bun.lock gained @betteroffice/fonts-cjk — the 33 MB CJK add-on must not ship (re-evaluate G29⑥ if intended)")
}

// --- 6. Error-path anchors (four states + bounded media + worker teardown + copy) ---
{
  const fileView = await read(`${GUI}src/file/view.tsx`)
  if (!fileView.includes("current()?.loaded ? current()?.content : undefined"))
    fail("6: file view.tsx lost the loaded state")
  if (!fileView.includes('ctx.t("common.loading")'))
    fail("6: file view.tsx lost the loading state copy")
  if (!fileView.includes('ctx.t("tab.notFound"'))
    fail("6: file view.tsx lost the notFound state copy")
  if (!fileView.includes("<Match when={current()?.error}>"))
    fail("6: file view.tsx lost the inline error state")
  if (!fileView.includes("Plain text keeps the code view; every other kind is rendered by ArtifactView."))
    fail("6: file view.tsx lost the artifact hand-off comment")

  const filesModel = await read(`${APP}src/workspaces/files/model.tsx`)
  if (!filesModel.includes('language.t("toast.file.loadFailed.title")'))
    fail("6: files model.tsx lost the loadFailed toast anchor")

  const artifact = await read(`${APP}src/workspaces/files/artifact.ts`)
  if (!artifact.includes("export const MAX_MEDIA_BYTES = 256 * 1024 * 1024"))
    fail("6: artifact.ts lost the 256 MiB media bound")
  if (!artifact.includes("Media above this stays a placeholder so the in-memory file cache stays bounded."))
    fail("6: artifact.ts lost the bounded-cache placeholder comment")
  if (!artifact.includes("a NUL in the first 8 KiB marks an unknown binary"))
    fail("6: artifact.ts lost the NUL binary-detection comment")
  const binaryBlock = slice(artifact, "const binaryKinds = new Set<ArtifactKind>([", "])")
  const binaryKinds = [...binaryBlock.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!)
  const expectedBinary = ["image", "audio", "video", "pdf", "font", "document", "spreadsheet", "presentation"]
  if (binaryKinds.length !== 8 || !expectedBinary.every((k) => binaryKinds.includes(k)))
    fail(`6: binaryKinds must be exactly the 8 raw-byte kinds, got [${binaryKinds.join(", ")}]`)

  const documentViewer = await read(`${OFFICE}document.tsx`)
  if (!documentViewer.includes("Terminating it is what frees the engine's memory."))
    fail("6: document.tsx lost the worker teardown memory anchor")
  if (!documentViewer.includes("each built page holds megabytes in the engine"))
    fail("6: document.tsx lost the far-page release anchor")

  // Office i18n: exactly one locale (en) carrying the EXACT seven error/problem
  // keys with verbatim values (plan F-3).
  const en = await read(`${OFFICE}i18n/en.ts`)
  const expectedCopy: [string, string][] = [
    ["problem.compound", "This file is password-protected or saved in an older Office format."],
    ["problem.format", "This file is not a valid Office document."],
    ["sheet.openFailed", "This sheet could not be opened"],
    ["sheet.paintFailed", "This part of the sheet could not be shown"],
    ["slideFailed", "This slide could not be shown"],
    ["sheet.copyTooLarge", "The selection is too large to copy"],
    ["sheet.copyFailed", "The cells could not be copied"],
  ]
  for (const [key, value] of expectedCopy) {
    // Keys without a dot are unquoted in the source (slideFailed: "...").
    const quoted = `"${key}": "${value}"`
    const unquoted = `${key}: "${value}"`
    if (!en.includes(quoted) && !en.includes(unquoted))
      fail(`6: office i18n en.ts lost the "${key}" copy ("${value}")`)
  }
  const localeDir = new URL(`${OFFICE}i18n/`, repoRoot).pathname
  const locales = (await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: localeDir }))).sort()
  if (!(locales.length === 1 && locales[0] === "en.ts"))
    fail(`6: the office i18n locale set changed (upstream baseline is exactly en.ts): ${locales.join(", ")}`)
}

// --- 7. Identity separation / download boundary anchors ---
{
  // RAW scan (no squash — call-shape, `\s*`-tolerant): the artifact viewer has
  // NO save/download affordance. Baseline is the MEASURED ZERO (pin
  // b4525d79bf): any hit means a viewer affordance appeared — plan re-eval and
  // the M-022+ candidate registry must move first (plan R5④/R5⑤/R7).
  const affordanceRe = /(saveFile|shareDataUrl|download)\s*\(/g
  const view = await read(`${GUI}src/file/artifact-view.tsx`)
  const affordanceHits = [...view.matchAll(affordanceRe)].length
  if (affordanceHits !== 0)
    fail(`7: artifact-view.tsx gained a save/download affordance (baseline is exactly 0 hits; got ${affordanceHits} — candidate M-022+ requires plan re-evaluation first)`)

  // M-021 pair: data: branch shares over the bridge, file:// branch untouched.
  const region = await read(`${APP}src/session/composer/region.tsx`)
  if (!region.includes('shareDataUrl(url, getFilename(file.name) || "attachment", file.mime)'))
    fail("7: region.tsx lost the M-021 data:-branch share call")
  if (!region.includes('if (url.startsWith("data:"))'))
    fail("7: region.tsx lost the data: branch gate")
  if (!region.includes("The file:// branch below is REMOTELY-held identity"))
    fail("7: region.tsx lost the file:// remote-identity comment (identity separation)")
  if (!region.includes("if (!platform.revealPath || !absolute) return download()"))
    fail("7: region.tsx lost the upstream anchor-download fallback in the file:// branch")

  // The corrected attachments-artifacts wording (#16 erratum, D4-④): office
  // kinds render through the extension viewer chain, not placeholders.
  const corrected = squash(
    "docx/xlsx/pptx → officeKinds 三 kind 经 microsoft-office 扩展查看器呈现（FileViewer 注册链，见 [artifact-viewers.md](artifact-viewers.md)），运行期验证归 #18",
  )
  const attachmentsDoc = squash(await read("docs/design/units/attachments-artifacts.md"))
  if (!attachmentsDoc.includes(corrected))
    fail("7: attachments-artifacts.md lost the corrected office-kind wording (extension viewer chain)")

  // The unit document keeps its zero-download boundary and candidate registry.
  const unit = squash(await read("docs/design/units/artifact-viewers.md"))
  if (!unit.includes(squash("**没有保存/下载 affordance**")))
    fail("7: units/artifact-viewers.md lost the zero-download-affordance boundary")
  if (!unit.includes(squash("M-022+ 候选 A")))
    fail("7: units/artifact-viewers.md lost the M-022+ candidate A registry entry")
}

// --- 8. Zero host-OS / zero electron scan (microsoft-office + util artifact) ---
let scannedArtifactFiles = 0
{
  const patterns: [RegExp, string][] = [
    [/process\s*\.\s*platform/, "process.platform"],
    [/navigator\s*\.\s*platform/, "navigator.platform"],
    [/node:os|require\(\s*["']os["']\s*\)/, "node:os / require(\"os\")"],
    [/from\s*["']electron["']/, "electron import"],
  ]
  for (const rel of await srcFiles(OFFICE)) {
    if (isTestFile(rel)) continue
    scannedArtifactFiles++
    const raw = await read(rel)
    for (const [pattern, label] of patterns) {
      if (pattern.test(raw)) fail(`8: ${label} appeared in the office viewer domain: ${rel} (baseline is zero)`)
    }
  }
  scannedArtifactFiles++
  const utilArtifact = await read(`${UTIL}src/artifact.ts`)
  for (const [pattern, label] of patterns) {
    if (pattern.test(utilArtifact)) fail(`8: ${label} appeared in util/src/artifact.ts (baseline is zero)`)
  }
  if (scannedArtifactFiles < 25)
    fail(`8: the zero-OS scan covered only ${scannedArtifactFiles} files — the domain set looks wrong`)
}

console.log(
  "verify-artifacts: PASS (" +
    "1: kind contract — ArtifactKind 14-name set, mimes EXACT 44-key set (both directions), officeKinds three verbatim mappings, artifactKind decision order; " +
    "2: viewer surface — previewableKinds exactly {svg, html, markdown, mermaid, table}, EIGHT Match branches in order, ArtifactBinary triple (filename + view.binary size + reason), FileViewer lookup chain + problem→ErrorBoundary→Dynamic, decode-failure/binary-fallback comments, PDF iframe face (navpanes + Chromium's own viewer + sandbox/no-referrer), Office-document FileViewer contract sentence; " +
    "3: office extension — zip + Compound File magic prechecks, problem.compound/problem.format wording, pre-engine-download rejection comment, three lazy registrations, microsoft-office id + en i18n, NEGATIVE zero platform gating with browser/renderer contrast pair intact, builtins compose entry; " +
    "4: worker/asset closure — three per-file workers, three WorkerClosedError messages, no-font-request-leaves-the-machine, CJK alias undefined, dist manifest EXACTLY 4 wasm {docx_edit_bg, docx_parse_bg, pptx_wasm_bg, xlsx_wasm_bg} (hash not locked per R8) + 3 office workers + 86 ttf with Caladea/Carlito ×4; " +
    "5: license — BetterOffice notices entry (four packages/openooxml/Apache 2.0/crateNotices), OFL-1.1 font-family section + OFL-1.1.txt on disk, PERMISSIVE whitelist Apache-2.0 AND OFL-1.1, four @betteroffice lock versions, NEGATIVE fonts-cjk not in lock; " +
    "6: error paths — file-view four-state Switch, loadFailed toast, MAX_MEDIA_BYTES 256 MiB + bounded-cache/NUL-8KiB comments + 8-kind binaryKinds, worker teardown + far-page release anchors, office i18n EXACT seven error keys verbatim (single en locale); " +
    "7: identity/download boundary — artifact-view save/download affordance RAW scan at the measured baseline 0, M-021 data:/file:// pair, corrected attachments-artifacts wording, unit doc zero-download boundary + M-022+ candidate registry; " +
    "8: zero host-OS/electron — platform-access two modes + node:os + electron over " +
    scannedArtifactFiles +
    " office/util files, baseline exactly 0 hits; " +
    "STATIC check - Office WASM loading and first render, the 14-kind matrix and the PDF verdict, memory pressure, corrupt/legacy/encrypted presentation, orientation, CJK fallback adequacy, accessibility and offline negatives on a device are G29)",
)
