// verify-pairing.ts — static probe for issue #22 (desktop pairing and
// connection links: scan, import, and recovery).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf…, first-party
// packages/mobile-hosts, the Android shell, the web dist manifest and the
// docs), the structural facts the connection.md pairing section relies on.
// The upstream pairing/link import chain is already complete in the closure
// (`platform: "web"` entry) — this probe first-locks its safety semantics.
//
// DIVISION OF LABOR (three header declarations, per the in-registry
// dedup convention):
//   1. verify-credential-ref.ts reads dialog.tsx too, but asserts the M-006/
//      M-009 credentialRef round-trip — THIS probe asserts the pairing gate
//      (preview-cancel comment, checkbox render gate, redeem call face).
//      Zero overlap. screen.tsx and registry.tsx "whole-replacement" anchors
//      are NEW first locks here (the credref probe does not read them).
//   2. CROSS-REFERENCE re-checks (referencing, NOT first locks — the
//      originals live elsewhere): the M-002 encode-strip marker (first lock:
//      audit-secret-persistence.ts), the truth-table rows 6/11 passthrough
//      decision core (first lock: verify-credential-vault.ts), the netsec
//      cleartextTrafficPermitted="false" anchor (first lock:
//      verify-direct-connection.ts). The shell anchors setSavePassword(false)
//      and onReceivedSslError handler.cancel() are NOT carried by any existing
//      probe (grep checked) — first-locked HERE.
//   3. CLIPBOARD ASSERTION DOMAIN is EXPLICITLY servers/connect/ (all files)
//      + packages/mobile-hosts/src. The upstream app has exactly FOUR
//      navigator.clipboard.writeText sites OUTSIDE that domain
//      (providers/connect/dialog.tsx, runtime/extension/host-apis.tsx,
//      session/commands/use-session-commands.tsx ×2 — provider OAuth
//      copy-link fallback, host copy API, sessionID/projectID copy), declared
//      here as an out-of-domain fact (asserted as such) and NOT part of the
//      zero-write assertion.
//
// SCOPE NOTE: the docs-closure group anchors the four commit-1 documents
// (connection.md / interaction.md / architecture.md / design README.md). The
// build-and-verify.md #22 evidence section and the project-scope.md note are
// delivered in the FOLLOW-UP evidence commit, so anchoring them here would
// make this probe fail at its own validation run — the same scoping every
// earlier probe uses (verify-recovery.ts / verify-interaction-quality.ts
// anchor no build-and-verify/project-scope either).
//
// ISSUE #23 REVISION REGISTER (deliberate sentinel revisions, NOT bypasses):
//   - group 3: the bare zero-onNewIntent negative became a paired anchor
//     (onNewIntent only with the pendingRoute internal-route anchor) because
//     the issue #23 notification tap consumer lands in MainActivity — tap is
//     an IN-APP PendingIntent navigation (launch-only substance unchanged;
//     zero VIEW intent-filter + opencode:// double zero still enforced).
//   - group 6: the uses-permission drift sentinel 1 -> 2 (INTERNET +
//     POST_NOTIFICATIONS; issue #23's manifest line). Any THIRD permission
//     still fails — drift-gate semantics preserved.
//
//   1. Protocol + grammar layer: protocol/groups/server.ts pairing endpoints
//      (PAIRING_CONNECT_PATH, server.pair POST /api/pair, token/expires_in
//      schema fields) and pairing.ts four validation layers verbatim (scheme
//      whitelist regex, userinfo/search/hash rejection, CODE regex,
//      /auth/connect/ path whitelist, legacy /connect# detection).
//   2. Redemption semantics + error taxonomy: the bounded multi-address
//      redeem (server.connect + AbortSignal.timeout), the 401 → expired
//      mapping, the last.code token-reuse cache, the scanner three-second
//      rejected suppression, the four link i18n keys + scan/camera keys, and
//      the mixedContent structurally-unreachable early return (page origin
//      must be https:; the shell page origin is always the http loopback).
//   3. Zero passive import (explicit-confirmation sentinels): the
//      "redeeming spends it" preview-cancel comment verbatim, the link-method
//      checkbox render gate (dialog-side first lock; decision core is a
//      verify-credential-vault first lock, cross-reference), the
//      useRedeemPairing consumption set (exactly redeem.ts definition +
//      dialog.tsx + screen.tsx; the scanner receives redeem via props —
//      declared), exactly two `await redeem(` call faces per form file, and
//      the NEGATIVE deep-link sentinels (manifest zero VIEW intent-filter;
//      onNewIntent only with the pendingRoute internal-route anchor — issue
//      #23 revision, see below).
//   4. Custom-scheme double zero: `opencode://` zero hits across the six
//      upstream packages' src (pin-update drift sentinel), plus the
//      pairing.test.ts verbatim rejection anchors (opencode-ios:// and
//      /connect#abc).
//   5. Token secret discipline: shell setSavePassword(false), the clipboard
//      zero-write assertion over the EXPLICIT domain (servers/connect/ +
//      mobile-hosts/src), the out-of-domain four-write fact (declared set),
//      zero console/Log calls in pairing/redeem/scanner/camera, and the
//      cross-reference M-002 strip marker + rows 6/11 passthrough comment.
//   6. Camera-unavailable baseline: manifest zero CAMERA permission +
//      exactly the INTERNET + POST_NOTIFICATIONS permission pair (drift
//      sentinels; issue #23 added POST_NOTIFICATIONS — any THIRD permission
//      still fails), MainActivity zero
//      onPermissionRequest (drift sentinel), camera.ts gate line verbatim,
//      the cameraHint() two-branch anchor, the scanner environment/
//      inversion-mode closure evidence, and the dist manifest scanner chunk
//      prefixes (hash-tolerant).
//   7. Routing and trust preservation: keep-address comments (screen +
//      dialog) and the signed-out fallback url prop, the health-check-before-
//      add ordering (four call sites), the screen ref-drop reality pair
//      ({ ...existing, http } + registry whole replacement — new locks), the
//      SSH-domain zero-contact negative (servers/connect/ zero known_hosts/
//      HostKeyVerifier/hostKey), the zero-bypass negative (zero
//      rejectUnauthorized/disableCert/insecure), and cross-reference netsec +
//      ssl-cancel anchors.
//   8. Docs closure anchors (anti doc↔code drift): connection.md pairing
//      section with its eight subsection headings and the key sentences
//      (zero-passive-import / LAN cleartext unsupported / scan unsupported /
//      add-face ref split / three red lines), interaction.md G32 row +
//      G1–G34 title (issue #23 revised the G1–G32 anchor when G33 was added,
//      issue #24 revised G1–G33 -> G1–G34 when G34 was added
//      — coverage semantics preserved) + eighteenth honest wording + pairing
//      failure-path subsection + :151 face qualification, architecture.md
//      connection row, design README.md index row + baseline sentence.
//
// HONEST BOUNDARY (same tradition as verify-recovery.ts): this is a static
// STRUCTURE check (text anchors / regex on source and doc files). It proves
// source and doc shape, NOT runtime behavior: scan-entry presentation, LAN
// cleartext failure wording, token secrecy on a device, ref passthrough vs
// drop on re-pairing, routing after import, cancel/cold/hot-start behavior
// and the dual-route pass are covered by the G32 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-pairing.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-pairing: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

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

const PROTOCOL = "vendor/upstream/packages/protocol/src/groups/server.ts"
const PAIRING = "vendor/upstream/packages/app/src/servers/connect/pairing.ts"
const REDEEM = "vendor/upstream/packages/app/src/servers/connect/redeem.ts"
const DIALOG = "vendor/upstream/packages/app/src/servers/connect/dialog.tsx"
const SCREEN = "vendor/upstream/packages/app/src/servers/connect/screen.tsx"
const SCANNER = "vendor/upstream/packages/app/src/servers/connect/scanner.tsx"
const CAMERA = "vendor/upstream/packages/app/src/servers/connect/camera.ts"
const BROWSER = "vendor/upstream/packages/app/src/servers/connect/browser.ts"
const PAIRING_TEST = "vendor/upstream/packages/app/src/servers/connect/pairing.test.ts"
const EN_I18N = "vendor/upstream/packages/app/src/runtime/i18n/en.ts"
const APP_SRC = "vendor/upstream/packages/app/src/"
const HOSTS_SRC = "packages/mobile-hosts/src/"
const MANIFEST = "android/app/src/main/AndroidManifest.xml"
const MAIN_ACTIVITY = "android/app/src/main/java/ai/opencode/mobile/MainActivity.kt"
const NETSEC = "android/app/src/main/res/xml/network_security_config.xml"
const REGISTRY = "vendor/upstream/packages/app/src/runtime/server/registry.tsx"
const ROUTES = "vendor/upstream/packages/app/src/shell/routes/routes.tsx"
const PERSISTENCE = "vendor/upstream/packages/app/src/runtime/server/persistence.ts"
const REMEMBER = "packages/mobile-hosts/src/vault/remember.ts"
const DIST_MANIFEST = "web-dist/manifest.json"

// --- 1. Protocol + grammar layer ---
{
  const protocol = await read(PROTOCOL)
  for (const anchor of [
    'export const PAIRING_CONNECT_PATH = "/auth/connect/:code"',
    'HttpApiEndpoint.post("server.pair", "/api/pair"',
    "token: Schema.String,",
    "expires_in: Schema.Int,",
    'HttpApiEndpoint.get("server.connect", PAIRING_CONNECT_PATH',
  ]) {
    if (!protocol.includes(anchor)) fail(`1: protocol server.ts lost the ${anchor} anchor`)
  }

  const pairing = await read(PAIRING)
  // Layer 1 — serverAddress: scheme whitelist + userinfo/search/hash rejection.
  if (!pairing.includes('if (value.includes("://") && !/^https?:\\/\\//.test(value.trim())) return'))
    fail("1: pairing.ts lost the serverAddress scheme whitelist (a relaxed scheme accept would also break the negative control)")
  if (!pairing.includes("if (url.username || url.password || url.search || url.hash) return"))
    fail("1: pairing.ts lost the userinfo/search/hash rejection line (credential URLs must be refused at parse time)")
  if (!pairing.includes('if (url.protocol !== "http:" && url.protocol !== "https:") return'))
    fail("1: pairing.ts lost the http/https protocol restriction")
  // Layer 2 — pairingLink: CODE regex + path whitelist.
  if (!pairing.includes("const CODE = /^[A-Za-z0-9_-]+$/"))
    fail("1: pairing.ts lost the CODE character whitelist")
  if (!pairing.includes('const code = /^\\/auth\\/connect\\/([^/]+)$/.exec(url.pathname)?.[1]'))
    fail("1: pairing.ts lost the /auth/connect/ path whitelist (the only link shape that names an action)")
  // Layer 3 — legacy detection (identify + refuse, never redeem).
  if (!pairing.includes('url.pathname === "/connect" && (url.hash.length > 1 || url.searchParams.has("data"))'))
    fail("1: pairing.ts lost the legacy /connect# credential-link detection")
}

// --- 2. Redemption semantics + error taxonomy ---
{
  const pairing = await read(PAIRING)
  // The bounded multi-address redeem against the protocol endpoint.
  if (!pairing.includes(".server.connect({ code: link.code }, { signal: AbortSignal.timeout(5_000) })"))
    fail("2: pairing.ts lost the bounded server.connect redeem call (the ONLY network action a link can trigger)")
  if (!pairing.includes("error.errors.some(isUnauthorizedError)"))
    fail("2: pairing.ts lost the 401 → expired mapping (expired and replayed share the single-use 401)")
  if (!pairing.includes('{ type: "expired" }') || !pairing.includes('{ type: "unreachable" }'))
    fail("2: pairing.ts lost the expired/unreachable redemption taxonomy")
  if (!pairing.includes("const health = await checkServerHealth(http, globalThis.fetch"))
    fail("2: pairing.ts lost the preferFirst health re-check (residual #5 F2 surface, referenced not re-ruled)")

  const redeem = await read(REDEEM)
  // The last-code token reuse (hot return must not re-spend a spent code).
  if (!redeem.includes("if (last.pairing && last.code === link.code)"))
    fail("2: redeem.ts lost the last.code reuse cache (a retry must not re-redeem a spent code)")
  if (!redeem.includes('legacyPairingLink(value) ? { error: language.t("server.connect.link.legacy") } : undefined'))
    fail("2: redeem.ts lost the legacy refusal (identify + report, ZERO redeem action)")
  if (!redeem.includes("link.urls.every((url) => isMixedContent(location.href, url))"))
    fail("2: redeem.ts lost the mixedContent classification branch")

  const en = await read(EN_I18N)
  for (const key of [
    '"server.connect.link.invalid":',
    '"server.connect.link.expired":',
    '"server.connect.link.unreachable":',
    '"server.connect.link.legacy":',
    '"server.connect.scan.invalid":',
    '"server.connect.scan.failed":',
    '"server.connect.camera.error":',
    '"server.connect.camera.unavailable":',
    '"server.connect.mixedContent":',
  ]) {
    if (!en.includes(key)) fail(`2: en.ts lost the ${key} i18n key`)
  }
  if (!en.includes("expired or was already used"))
    fail("2: en.ts lost the expired/replayed double-coverage wording")

  const scanner = await read(SCANNER)
  if (!scanner.includes("const rejected = new Map<string, number>()"))
    fail("2: scanner.tsx lost the rejected-codes map declaration")
  if (!scanner.includes("rejected.set(result.data, Date.now() + 3000)"))
    fail("2: scanner.tsx lost the three-second rejected suppression (per-frame re-redeem guard)")

  // mixedContent is structurally unreachable in this shell: the page origin is
  // always the http loopback, so the https:-page early return wins (plan v2/C4).
  const browser = await read(BROWSER)
  if (!browser.includes('if (new URL(page).protocol !== "https:") return false'))
    fail("2: browser.ts lost the mixedContent https:-page early return (the structural unreachability note in connection.md §③ rests on it)")
}

// --- 3. Zero passive import (explicit-confirmation sentinels) ---
{
  const dialog = await read(DIALOG)
  if (!dialog.includes("A pairing link is not a server address until it is redeemed, and redeeming spends it."))
    fail("3: dialog.tsx lost the preview-cancel comment (zero auto-redeem anchor, verbatim)")
  // Dialog-side FIRST LOCK of the render gate; the truth-table decision core
  // itself is verify-credential-vault.ts's first lock (cross-reference only).
  if (!dialog.includes('checkboxRendered: store.method === "password" && vaultAvailable()'))
    fail("3: dialog.tsx lost the checkbox render gate (link method must never render remember)")

  // Consumption set equality: useRedeemPairing is defined once and consumed by
  // exactly the two form faces. The scanner receives redeem via props (it never
  // calls useRedeemPairing) — declared, not an omission.
  const appFiles = await listFiles(APP_SRC)
  const consumers: string[] = []
  for (const file of appFiles) {
    if (!/\.(ts|tsx)$/.test(file)) continue
    const content = await read(file)
    if (content.includes("useRedeemPairing")) consumers.push(file)
  }
  const expected = [DIALOG, REDEEM, SCREEN].sort()
  if (consumers.length !== expected.length || consumers.some((file, i) => file !== expected[i]))
    fail(`3: useRedeemPairing consumption set changed (expected exactly ${expected.join(", ")}, got ${consumers.join(", ")}) — a new consumer face needs a mechanical review of the import path first`)

  // Each form redeems from exactly the submit path (two call faces each). A
  // preview-time/auto redeem would add a third — this is negative control ②.
  const dialogRedeems = dialog.match(/await redeem\(/g)?.length ?? 0
  if (dialogRedeems !== 2)
    fail(`3: dialog.tsx redeem call faces changed (expected exactly 2 — link field + address field, both in the submit path; got ${dialogRedeems})`)
  const screen = await read(SCREEN)
  const screenRedeems = screen.match(/await redeem\(/g)?.length ?? 0
  if (screenRedeems !== 2)
    fail(`3: screen.tsx redeem call faces changed (expected exactly 2; got ${screenRedeems})`)

  // NEGATIVE deep-link sentinels: the shell must stay launch-only.
  const manifest = await read(MANIFEST)
  if (/android\.intent\.action\.VIEW/.test(manifest))
    fail("3: AndroidManifest.xml gained a VIEW intent-filter — external links would trigger app actions; re-review the zero-passive-import anchors and connection.md §⑦ before keeping it")
  // Issue #23 revision (deliberate, NOT a bypass): the bare zero-onNewIntent negative
  // became an internal-route-aware PAIRED anchor. onNewIntent is allowed ONLY alongside
  // the pendingRoute internal-route anchor (the issue #23 notification tap consumer —
  // an in-app PendingIntent navigation to a session route). The EXTERNAL import ban is
  // unchanged and still enforced by three intact gates: zero VIEW intent-filter (above),
  // the opencode:// six-domain double zero (group 4), and this pairing — an onNewIntent
  // without a pendingRoute anchor still FAILS here.
  const mainActivity = await read(MAIN_ACTIVITY)
  if (/onNewIntent/.test(mainActivity) && !/pendingRoute/.test(mainActivity))
    fail("3: MainActivity.kt gained onNewIntent handling without the pendingRoute internal-route anchor — onNewIntent is only allowed with the issue #23 notification internal-route consumer (tap = in-app PendingIntent navigation); external deep-link/passive import stays banned (zero VIEW intent-filter is asserted above)")
  if (!mainActivity.includes("deep links"))
    fail("3: MainActivity.kt lost the deep-links TODO comment")
}

// --- 4. Custom-scheme double zero ---
{
  const domains = [
    "vendor/upstream/packages/app/src/",
    "vendor/upstream/packages/gui-extensions/src/",
    "vendor/upstream/packages/session-ui/src/",
    "vendor/upstream/packages/client/src/",
    "vendor/upstream/packages/protocol/src/",
    "vendor/upstream/packages/schema/src/",
  ]
  for (const domain of domains) {
    const files = (await listFiles(domain)).filter((file) => /\.(ts|tsx)$/.test(file))
    if (files.length === 0) fail(`4: scheme-scan domain ${domain} resolved to zero files (glob broken)`)
    for (const file of files) {
      const content = await read(file)
      if (content.includes("opencode://"))
        fail(`4: ${file} gained an opencode:// custom scheme — a pin update introduced a scheme; re-review the import face and connection.md §①/⑦ before keeping it`)
    }
  }

  // The upstream grammar test itself carries the rejection negative examples.
  const pairingTest = await read(PAIRING_TEST)
  if (!pairingTest.includes('expect(pairingLink("opencode-ios://auth/connect/abc")).toBeUndefined()'))
    fail("4: pairing.test.ts lost the opencode-ios:// rejection anchor")
  if (!pairingTest.includes('expect(pairingLink("http://192.168.1.2:49374/connect#abc")).toBeUndefined()'))
    fail("4: pairing.test.ts lost the /connect# rejection anchor")
}

// --- 5. Token secret discipline ---
{
  const mainActivity = await read(MAIN_ACTIVITY)
  // Shell anchors first-locked here (no earlier probe covers them — grep checked).
  if (!mainActivity.includes("setSavePassword(false)"))
    fail("5: MainActivity.kt lost setSavePassword(false) (the WebView must not offer to save the password)")
  if (!mainActivity.includes("handler.cancel()"))
    fail("5: MainActivity.kt lost the onReceivedSslError handler.cancel() (TLS validation is never disabled to work around errors)")

  // Clipboard zero-write over the EXPLICIT domain (plan v2/C1): servers/connect/
  // (all files) + packages/mobile-hosts/src.
  const connectFiles = (await listFiles("vendor/upstream/packages/app/src/servers/connect/")).filter((file) => /\.(ts|tsx|css)$/.test(file))
  const hostsFiles = (await listFiles(HOSTS_SRC)).filter((file) => /\.(ts|tsx)$/.test(file))
  if (connectFiles.length < 8) fail(`5: clipboard domain servers/connect/ resolved to ${connectFiles.length} files (expected the full connect directory)`)
  for (const file of [...connectFiles, ...hostsFiles]) {
    const content = await read(file)
    if (/navigator\.clipboard\.write/.test(content))
      fail(`5: ${file} gained a clipboard WRITE inside the pairing/import domain (servers/connect/ + mobile-hosts/src must stay write-free; reads via clipboardImage are the #16 face)`)
  }

  // Out-of-domain fact (declared, not asserted as a violation): the upstream app
  // has exactly four writeText sites in exactly three files, none in the pairing flow.
  const appFiles = (await listFiles(APP_SRC)).filter((file) => /\.(ts|tsx)$/.test(file))
  const writers: string[] = []
  let writes = 0
  for (const file of appFiles) {
    const content = await read(file)
    const hits = content.match(/navigator\.clipboard\.writeText\(/g)?.length ?? 0
    if (hits > 0) {
      writers.push(file)
      writes += hits
    }
  }
  const expectedWriters = [
    `${APP_SRC}providers/connect/dialog.tsx`,
    `${APP_SRC}runtime/extension/host-apis.tsx`,
    `${APP_SRC}session/commands/use-session-commands.tsx`,
  ].sort()
  if (writes !== 4 || writers.length !== 3 || writers.some((file, i) => file !== expectedWriters[i]))
    fail(`5: the app/src clipboard-write fact changed (expected exactly 4 writes in 3 declared files ${expectedWriters.join(", ")}; got ${writes} writes in ${writers.length} files: ${writers.join(", ")}) — re-review the connection.md §④ domain split before keeping it`)

  // Zero logging in the import path (pairing/redeem/scanner/camera).
  for (const [name, path] of [["pairing.ts", PAIRING], ["redeem.ts", REDEEM], ["scanner.tsx", SCANNER], ["camera.ts", CAMERA]] as const) {
    const content = await read(path)
    if (/console\.|\bLog\./.test(content))
      fail(`5: ${name} gained a console./Log. call (tokens/links must never reach logs; negative assertion)`)
  }

  // CROSS-REFERENCE re-checks (first locks live elsewhere — see header).
  const persistence = await read(PERSISTENCE)
  if (!persistence.includes("mobile(M-002): password stripped at encode (memory-only)"))
    fail("5: persistence.ts lost the M-002 strip marker (cross-reference with audit-secret-persistence.ts)")
  const remember = await read(REMEMBER)
  if (!remember.includes("no checkbox means no remember intent either way"))
    fail("5: remember.ts lost the rows 6/11 passthrough comment (cross-reference with verify-credential-vault.ts decision core)")
}

// --- 6. Camera-unavailable baseline ---
{
  const manifest = await read(MANIFEST)
  // Drift sentinels: either appearing means the shell gained camera capability —
  // the candidate M-022+ decision and connection.md §⑦ must be re-reviewed first.
  if (manifest.includes("android.permission.CAMERA"))
    fail("6: AndroidManifest.xml gained the CAMERA permission — the scan-enable candidate (M-022+) is a user decision; re-review connection.md §⑦ and the probe header before keeping it")
  if (!manifest.includes('<uses-permission android:name="android.permission.INTERNET" />'))
    fail("6: AndroidManifest.xml lost the INTERNET permission anchor")
  const permissionCount = manifest.match(/<uses-permission /g)?.length ?? 0
  if (permissionCount !== 2)
    fail(`6: AndroidManifest.xml uses-permission count changed (expected exactly 2 = INTERNET + POST_NOTIFICATIONS, issue #23; any third permission still fails; got ${permissionCount}) — a new permission touches the security baseline; re-review`)
  const mainActivity = await read(MAIN_ACTIVITY)
  if (/onPermissionRequest/.test(mainActivity))
    fail("6: MainActivity.kt gained onPermissionRequest (WebView getUserMedia authorization) — the scan-enable candidate (M-022+) is a user decision; re-review connection.md §⑦ before keeping it")

  const camera = await read(CAMERA)
  if (!camera.includes('platform.platform === "web" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia'))
    fail("6: camera.ts lost the availability gate line (scan availability stops at getUserMedia authorization — shell cannot grant it)")
  if (!camera.includes('window.isSecureContext ? "server.connect.camera.unavailable" : "server.connect.camera.native"'))
    fail("6: camera.ts lost the cameraHint() two-branch anchor (graceful manual-entry degradation)")

  const scanner = await read(SCANNER)
  if (!scanner.includes('preferredCamera: "environment"'))
    fail("6: scanner.tsx lost the preferredCamera anchor (closure carries the scanner code)")
  if (!scanner.includes('scanner.setInversionMode("both")'))
    fail("6: scanner.tsx lost the inversion-mode anchor")

  // The dist closure carries the scanner chunks (hash-tolerant prefix anchors;
  // dist numbers move with the build pipeline — connection.md §⑧).
  const distManifest = await read(DIST_MANIFEST)
  if (!distManifest.includes('"_assets/scanner-'))
    fail("6: web-dist/manifest.json lost the scanner- chunk (build stripped the scanner — re-review the closure baseline)")
  if (!/"_assets\/qr-scanner-worker\.min-/.test(distManifest))
    fail("6: web-dist/manifest.json lost the qr-scanner-worker.min- chunk (worker missing from the closure)")
}

// --- 7. Routing and trust preservation ---
{
  const screen = await read(SCREEN)
  const dialog = await read(DIALOG)

  // Keep-address routing on both faces (verbatim comments; the two faces word
  // the tail differently — screen "the server that signed out", dialog "the
  // edited server" — so each gets its own anchor).
  if (!screen.includes("A pairing token works on every address of its server. Signing in again to the server that signed out keeps its"))
    fail("7: screen.tsx lost the keep-address comment")
  if (!dialog.includes("A pairing token works on every address of its server. Signing in again to the edited server keeps its address"))
    fail("7: dialog.tsx lost the keep-address comment")

  // Signed-out fallback routes back to the SAME server.
  const routes = await read(ROUTES)
  if (!routes.includes("<ConnectServerScreen url={signedOut()?.http.url} />"))
    fail("7: routes.tsx lost the signed-out fallback url prop (sign-in-again must return to the same server)")

  // Health check precedes the registry write — four call faces.
  if (!screen.includes("(await check(http)).healthy ? http : pairing"))
    fail("7: screen.tsx lost the target() health check call face")
  if (!screen.includes("const result = await check(http)"))
    fail("7: screen.tsx lost the connect() health check call face")
  if (!dialog.includes("(await checkServerHealth(http)).healthy ? http : pairing"))
    fail("7: dialog.tsx lost the paired() health check call face")
  if (!dialog.includes("const result = await checkServerHealth(connection.http)"))
    fail("7: dialog.tsx lost the save-path health check call face")
  const checkAt = screen.indexOf("const result = await check(http)")
  const addAt = screen.indexOf("servers.add(existing ? { ...existing, http }")
  if (checkAt < 0 || addAt < 0 || checkAt > addAt)
    fail("7: screen.tsx ordering changed (the health check must precede servers.add — a failed check must leave no registry write)")

  // The screen ref-drop REALITY pair (plan v2/C2): the shorthand http object
  // overwrites existing.http, and the registry add() replaces the whole entry.
  if (!screen.includes('servers.add(existing ? { ...existing, http } : { type: "http", http })'))
    fail("7: screen.tsx lost the whole-overwrite add anchor (the screen-face ref-drop reality connection.md §④ documents)")
  const registry = await read(REGISTRY)
  if (!registry.includes('setStore("list", existing, conn)'))
    fail("7: registry.tsx lost the whole-replacement add() anchor (no merge with the stored entry's ref — new first lock, zero conflict with verify-credential-ref.ts)")

  // SSH domain zero contact: the pairing/import surface never touches host keys.
  const connectDir = "vendor/upstream/packages/app/src/servers/connect/"
  for (const file of await listFiles(connectDir)) {
    if (!/\.(ts|tsx|css)$/.test(file)) continue
    const content = await read(file)
    if (/known_hosts|HostKeyVerifier|hostKey/.test(content))
      fail(`7: ${file} gained a host-key/SSH identifier — the pairing flow must stay structurally separated from the SSH domain (connection.md §④/⑤)`)
    // Zero-bypass negative: no certificate-check relaxation anywhere in the domain.
    if (/rejectUnauthorized|disableCert|insecure/i.test(content))
      fail(`7: ${file} gained a certificate-check bypass identifier (TLS/host-key validation is never disabled — red line)`)
  }

  // CROSS-REFERENCE anchors (netsec first lock: verify-direct-connection.ts).
  const netsec = await read(NETSEC)
  if (!/<base-config[^>]*cleartextTrafficPermitted\s*=\s*"false"/.test(netsec))
    fail("7: network_security_config.xml lost the cleartextTrafficPermitted=\"false\" base config (cross-reference with verify-direct-connection.ts; the LAN-cleartext unsupported flow rests on it)")
}

// --- 8. Docs closure anchors (anti doc↔code drift) ---
{
  const connection = await read("docs/design/units/connection.md")
  if (!connection.includes("## 配对与连接导入（已实现（未验证）：issue #22"))
    fail("8: connection.md lost the pairing import section heading")
  for (const heading of [
    "### ① 协议链路",
    "### ② 四层校验与零被动导入",
    "### ③ 兑换错误分类×呈现",
    "### ④ token 秘密纪律",
    "### ⑤ 路由与信任保持",
    "### ⑥ 取消与冷热启动",
    "### ⑦ 不支持流清单",
    "### ⑧ 残余面与验证面",
  ]) {
    if (!connection.includes(heading)) fail(`8: connection.md lost the pairing subsection ${heading}`)
  }
  for (const sentence of [
    "零被动导入三锚",
    "LAN 明文配对链接不可达",
    "相机扫描不可用",
    "dialog 连接对话框面=passthrough 保 ref",
    "screen 独立连接屏面=重配对丢弃",
    "scheme/host 校验不放宽",
    "秘密不经日志/剪贴板/历史",
    "TLS/host-key 校验不绕过",
  ]) {
    if (!connection.includes(sentence)) fail(`8: connection.md lost the key sentence "${sentence}"`)
  }

  const interaction = await read("docs/design/interaction.md")
  // Issue #23/#24 revisions (deliberate, NOT a bypass): the enumeration-title anchor
  // moved G1–G32 -> G1–G33 when the issue #23 G33 gate row was appended, and
  // G1–G33 -> G1–G34 when the issue #24 G34 gate row was appended to interaction.md —
  // the anchor's coverage semantics (the enumeration must cover the FULL gate set) are
  // preserved.
  if (!interaction.includes("## G1–G34 设备门禁（完整枚举）"))
    fail("8: interaction.md gate enumeration must cover G1–G34")
  if (!interaction.includes("| G32 配对/链接导入运行期门禁（issue #22"))
    fail("8: interaction.md lost the G32 gate row")
  if (!interaction.includes("第十八处落字（issue #22）"))
    fail("8: interaction.md lost the eighteenth honest wording (issue #22)")
  if (!interaction.includes("配对/链接导入失败路径（issue #22）"))
    fail("8: interaction.md lost the pairing import failure-path subsection")
  // The :151 stale-ref note face qualification (plan v2/C2, two-way protocol).
  if (!interaction.includes("issue #22 面限定回修"))
    fail("8: interaction.md lost the :151 stale-ref note face-qualification marker")
  if (!interaction.includes("screen 独立连接屏面的重配对为 `{ ...existing, http }` 整体覆盖、不保 ref"))
    fail("8: interaction.md lost the :151 screen-face overwrite sentence (the dialog passthrough note must not read as dual-face)")

  const architecture = await read("docs/design/architecture.md")
  if (!architecture.includes("承载配对链接导入（issue #22"))
    fail("8: architecture.md connection row lost the pairing import responsibility")
  if (!architecture.includes("G32 归 #22"))
    fail("8: architecture.md connection row lost the G32 blocked entry")

  const readme = await read("docs/design/README.md")
  if (!readme.includes("配对与连接导入面（协议链路/四层校验"))
    fail("8: design README.md lost the connection.md index row pairing description")
  if (!readme.includes("配对与连接导入面收口"))
    fail("8: design README.md lost the key-facts baseline pairing sentence")
}

console.log(
  "verify-pairing: PASS (" +
    "1: protocol endpoints (PAIRING_CONNECT_PATH/server.pair/server.connect/token/expires_in) + four grammar layers verbatim (scheme whitelist, userinfo/search/hash rejection, CODE regex, /auth/connect/ path whitelist, legacy /connect# detection); " +
    "2: bounded multi-address redeem + 401→expired mapping + last.code reuse + scanner 3s rejected suppression + nine i18n keys + mixedContent https:-page early return (structurally unreachable in this shell); " +
    "3: preview-cancel comment verbatim + checkbox render gate (dialog first lock) + useRedeemPairing consumption set equality (redeem.ts definition + dialog + screen; scanner via props) + exactly 2 redeem faces per form + NEGATIVE zero VIEW intent-filter / onNewIntent only with the pendingRoute internal-route anchor (issue #23 — external launch stays banned); " +
    "4: NEGATIVE opencode:// zero hits across six upstream src domains + pairing.test.ts rejection anchors (opencode-ios://, /connect#abc); " +
    "5: setSavePassword(false) + ssl handler.cancel() (first locks here) + clipboard zero-write over servers/connect/ + mobile-hosts/src (domain explicit) + out-of-domain four-write fact set + zero console/Log in the import path + M-002 and rows-6/11 cross-references; " +
    "6: NEGATIVE zero CAMERA permission + exactly-2 uses-permission (INTERNET + POST_NOTIFICATIONS, issue #23; any third still fails) + zero onPermissionRequest (drift sentinels) + camera.ts gate + cameraHint() branches + scanner closure anchors + dist scanner chunk prefixes; " +
    "7: keep-address comments both faces + signed-out fallback prop + health-check-before-add (four faces, ordering asserted) + screen ref-drop reality pair ({ ...existing, http } + registry whole replacement) + SSH-domain zero contact + zero cert-bypass identifiers + netsec cleartext cross-reference; " +
    "8: connection.md pairing section + eight subsections + key sentences, interaction.md G1–G34 enumeration (issue #24 revision) + G32 row + eighteenth wording + failure path + :151 face qualification, architecture.md connection row, design README index + baseline; " +
    "STATIC check - scan-entry presentation, LAN cleartext wording, device token secrecy, ref passthrough vs drop on re-pairing, cancel/cold/hot-start behavior and dual-route pass are G32)",
)
