// verify-ssh.ts — issue #6 static verification probe (docs/build-and-verify.md V-ssh).
//
// Asserts, against the REAL sources (and the REAL built dist in full mode):
//   1. JS taxonomy <-> i18n consistency: every SshErrorCode has one non-empty EN + ZH
//      `ssh.error.<code>` line; SSH_ERROR_CODES is total over isSshErrorCode.
//   2. Fingerprint interop vectors: computeSshFingerprint reproduces the verbatim
//      `ssh-keygen -lf` output for two ssh-keygen-generated key blobs (ed25519 + RSA) —
//      the documented OpenSSH representation (`SHA256:<base64_nopad>`).
//   3. known_hosts semantics: OpenSSH line format round-trip (`ssh-keygen -lf` reads what
//      we write), non-default-port bracket form, and the hashed-hostname negative — the
//      serializer never produces hashed/marker/pattern lines and the matcher ignores them.
//   4. Three-bridge isolation: the vault/probe/ssh handshake strings are pairwise distinct
//      (strict data equality on both sides keeps the bridges from capturing each other).
//   5. Android red lines (negative assertions over android/**/*.{kt,xml}):
//      - host-key validation is NEVER disabled: no StrictHostKeyChecking "no"/"ask";
//      - no jump-host surface: no ProxyJump/ProxyCommand/setProxy*;
//      - no WSL execution surface (decision 0001): no wsl.exe/wslconfig;
//      - no hashed hostnames anywhere in the Kotlin code (`|1|` literal);
//      - the ssh bridge package never serves content (no NanoHTTPD under ssh/).
//      (Plus, in native mode:) the scan session carries zero authentication material
//      (F2: no setPassword/addIdentity inside the scanHostKey function body), the key
//      store stays outside backup channels (`ssh/` excluded in both XML rule files), the
//      gradle dependencies carry their licence comments (F3), the Kotlin SshErrorCode
//      enum speaks every JS wire string, and the lifecycle red line (F8①: teardown is
//      local, the remote service keeps running) is double-written in the Kotlin sources.
//   6. (vendor-dependent, full mode only) dist markers: the built bundle carries the ssh
//      bridge handshake string and the mobile(ssh-v1) marker, and the vendored entry
//      wires the ssh transport/verifier into createMobileHosts (M-015).
//
// Staged strategy (review note F3 of issue #5, mirrored): every commit point stays
// verifiable. At the scripts commit run with BOTH --pre-native (the Kotlin ssh/ files do
// not exist yet) and --pre-vendor (the dist does not carry the markers yet). After the
// Kotlin commit run with --pre-vendor only. After M-015 lands, run in full mode (default)
// — the missing-marker and missing-native assertions then FAIL again.
//
// Usage:
//   bun run scripts/verify-ssh.ts                              # full (post-vendor)
//   bun run scripts/verify-ssh.ts --pre-vendor                 # after the Kotlin commit
//   bun run scripts/verify-ssh.ts --pre-native --pre-vendor    # scripts-only stage

import { SSH_ERROR_CODES, isSshErrorCode } from "../packages/mobile-hosts/src/transport/ssh-errors"
import { messages } from "../packages/mobile-hosts/src/i18n"
import { computeSshFingerprint, decodeBase64KeyBlob, isSshFingerprint } from "../packages/mobile-hosts/src/ssh/fingerprint"
import { matchesKnownHostsEntry, parseKnownHosts, parseKnownHostsLine, serializeKnownHostsEntry } from "../packages/mobile-hosts/src/ssh/known-hosts"
import { PROBE_HANDSHAKE } from "../packages/mobile-hosts/src/probe"
import { VAULT_HANDSHAKE } from "../packages/mobile-hosts/src/vault/transport"
import { SSH_BRIDGE } from "../packages/mobile-hosts/src/ssh/bridge"

function fail(message: string): never {
  console.error(`verify-ssh: FAIL: ${message}`)
  process.exit(1)
}

const ROOT = new URL("..", import.meta.url).pathname
const PRE_NATIVE = process.argv.includes("--pre-native")
const PRE_VENDOR = process.argv.includes("--pre-vendor")
const path = (...segments: string[]) => `${ROOT}${segments.join("/")}`

// ---------------------------------------------------------------------------
// 1. JS taxonomy <-> i18n consistency (F5 dual key-set discipline, ssh face)
// ---------------------------------------------------------------------------
{
  const codes = SSH_ERROR_CODES
  if (codes.length !== 14) fail(`expected exactly 14 ssh error codes, found ${codes.length}`)
  for (const code of codes) {
    if (!isSshErrorCode(code)) fail(`isSshErrorCode refuses its own code: ${code}`)
    for (const locale of ["en", "zh"] as const) {
      const key = `ssh.error.${code}`
      const line = (messages[locale] as Record<string, string | undefined>)[key]
      if (typeof line !== "string" || line.length === 0) fail(`missing ${locale} copy for ${key}`)
    }
  }
  console.log(`verify-ssh: taxonomy ok (${codes.length} codes, EN+ZH copies present)`)
}

// ---------------------------------------------------------------------------
// 2. Fingerprint interop vectors (ssh-keygen -lf verbatim)
// ---------------------------------------------------------------------------
{
  // ssh-keygen -t ed25519 → "256 SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk (ED25519)"
  const ED25519_BLOB = "AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5"
  const ED25519_FINGERPRINT = "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk"
  // ssh-keygen -t rsa 2048 → "2048 SHA256:ux4m4VPmpLNS5EkU+jI48HP7X3wOTlqHY+L9Fu6nujA (RSA)"
  const RSA_BLOB =
    "AAAAB3NzaC1yc2EAAAADAQABAAABAQCYQBVcJj6kD+WqpZ03AWQ+VnA+aEmLVdKv1oNfCFR0sOMK+bowA/OWRaIS3hWKujpbBuNQVvoYlbmAkCVJTf43qKzFG1hwTCp3bhDfGFCYAne2sneDez6kP1FTAarAk6ApD/6jsapij7Tib9/0BnyaFSQpL2bvKONwp77My/WBW5L2o2jVwQdsCVpEEps+VaoVPbbUUZptWktSB+uPDXxhz0475OVM/ri/V8GGGg4nQFwKQAj4c7/7lJSq+EN/bTal+KaIkZnbWhoQOccI+65FBOFpZe78wRQa0cyO1gUwzG3YhtTksCZL/r8B0TGu1zgi9vsDGzxvW5Rh0ML1hyTJ"
  const RSA_FINGERPRINT = "SHA256:ux4m4VPmpLNS5EkU+jI48HP7X3wOTlqHY+L9Fu6nujA"
  for (const [blob, expected] of [
    [ED25519_BLOB, ED25519_FINGERPRINT],
    [RSA_BLOB, RSA_FINGERPRINT],
  ] as const) {
    const bytes = decodeBase64KeyBlob(blob)
    if (!bytes) fail(`fingerprint vector blob failed to decode (${expected})`)
    const actual = await computeSshFingerprint(bytes!)
    if (actual !== expected) fail(`fingerprint vector mismatch: expected ${expected}, got ${actual}`)
    if (!isSshFingerprint(actual)) fail(`computed fingerprint failed the format guard: ${actual}`)
  }
  console.log("verify-ssh: fingerprint vectors ok (ed25519 + rsa, OpenSSH SHA256:base64_nopad)")
}

// ---------------------------------------------------------------------------
// 3. known_hosts semantics (OpenSSH line format; hashed-hostname negative)
// ---------------------------------------------------------------------------
{
  const blob = "AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5"
  const line = serializeKnownHostsEntry({ hostname: "example.invalid", keytype: "ssh-ed25519", blob })
  if (line !== `example.invalid ssh-ed25519 ${blob}`) {
    fail(`default-port line is not the OpenSSH shape: ${line}`)
  }
  const bracketed = serializeKnownHostsEntry({ hostname: "example.invalid", port: 2222, keytype: "ssh-ed25519", blob })
  if (bracketed !== `[example.invalid]:2222 ssh-ed25519 ${blob}`) {
    fail(`non-default-port line is not the [host]:port shape: ${bracketed}`)
  }
  const parsed = parseKnownHosts(`${line}\n${bracketed}\n`)
  if (parsed.issues.length !== 0) fail(`clean OpenSSH lines produced parse issues: ${JSON.stringify(parsed.issues)}`)
  if (parsed.entries.length !== 2) fail(`expected 2 entries, got ${parsed.entries.length}`)
  if (!matchesKnownHostsEntry(parsed.entries[0]!, "example.invalid", 22)) fail("default-port entry did not match host:22")
  if (matchesKnownHostsEntry(parsed.entries[0]!, "example.invalid", 2222)) fail("default-port entry matched a different port")
  if (!matchesKnownHostsEntry(parsed.entries[1]!, "example.invalid", 2222)) fail("bracketed entry did not match host:2222")
  // Hashed hostnames are recognized, never matched, never produced.
  const hashed = parseKnownHostsLine("|1|abcdef0123456789|ghijklmnopqrstuv= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5", 1)
  if (!hashed || !("kind" in hashed) || hashed.kind !== "hashed-hostname") fail("hashed hostname was not classified")
  if (matchesKnownHostsEntry({ hostname: "|1|abcdef0123456789|ghijklmnopqrstuv=", keytype: "ssh-ed25519", blob: "x" }, "example.invalid")) {
    fail("a hashed entry shape matched a plaintext host")
  }
  const marker = parseKnownHostsLine(`@revoked example.invalid ssh-ed25519 ${blob}`, 1)
  if (!marker || !("kind" in marker) || marker.kind !== "marker") fail("marked line was not classified")
  console.log("verify-ssh: known_hosts semantics ok (OpenSSH line format, hashed-hostname negative)")
}

// ---------------------------------------------------------------------------
// 4. Three-bridge isolation (vault / probe / ssh handshake strings pairwise distinct)
// ---------------------------------------------------------------------------
{
  const handshakes = [VAULT_HANDSHAKE, PROBE_HANDSHAKE, SSH_BRIDGE.handshake]
  if (new Set(handshakes).size !== 3) fail(`bridge handshake strings are not pairwise distinct: ${handshakes.join(", ")}`)
  if (SSH_BRIDGE.handshake !== "opencode-mobile-ssh-handshake") fail("ssh handshake string drifted from the registered value")
  console.log("verify-ssh: bridge isolation ok (three distinct handshake strings)")
}

// ---------------------------------------------------------------------------
// 5. Android red lines (negative assertions over android/)
// ---------------------------------------------------------------------------
{
  const forbidden: Array<{ pattern: RegExp; why: string; where?: RegExp }> = [
    { pattern: /StrictHostKeyChecking\s*[=:]\s*"(?:no|ask)"|setStrictHostKeyChecking\(\s*"(?:no|ask)"\s*\)/i, why: "host-key validation disabled (StrictHostKeyChecking no/ask)" },
    { pattern: /ProxyJump|ProxyCommand|setProxy(Host|Port|Command)?\s*\(/i, why: "jump-host surface (ProxyJump/ProxyCommand/setProxy*)" },
    { pattern: /wsl\.exe|wslconfig/i, why: "WSL execution surface (decision 0001)" },
    { pattern: /\|1\|/, why: "hashed hostname literal in Kotlin code", where: /\.kt$/ },
    { pattern: /NanoHTTPD/i, why: "device-side serving surface inside the ssh package", where: /\/ssh\/.+\.kt$/ },
  ]
  const androidDir = path("android/")
  let scanned = 0
  for await (const relative of new Bun.Glob("**/*.{kt,xml}").scan({ cwd: androidDir })) {
    const text = await Bun.file(`${androidDir}${relative}`).text()
    scanned += 1
    for (const { pattern, why, where } of forbidden) {
      if (where && !where.test(relative)) continue
      if (pattern.test(text)) fail(`android/${relative}: forbidden pattern — ${why}`)
    }
  }
  if (scanned === 0) fail("no android sources scanned")
  console.log(`verify-ssh: android negatives ok (${scanned} files scanned)`)
}

// ---------------------------------------------------------------------------
// 5b. Native-mode assertions (after the Kotlin commit; --pre-native skips)
// ---------------------------------------------------------------------------
if (!PRE_NATIVE) {
  const sshDir = path("android/app/src/main/java/ai/opencode/mobile/ssh/")
  const sshFiles: Array<{ relative: string; text: string }> = []
  for await (const relative of new Bun.Glob("*.kt").scan({ cwd: sshDir })) {
    sshFiles.push({ relative, text: await Bun.file(`${sshDir}${relative}`).text() })
  }
  if (sshFiles.length < 4) fail(`expected at least the four ssh Kotlin files, found ${sshFiles.length}`)

  // The SSH channel bootstrap is origin-bound and frame-bound; the transferred port is
  // requested only after the page's window-message listener has synchronously subscribed.
  {
    const bridge = sshFiles.find((file) => file.relative.includes("SshTunnelBridge"))
    const activity = await Bun.file(path("android/app/src/main/java/ai/opencode/mobile/MainActivity.kt")).text()
    const listenerRegistration = activity.indexOf("sshBridge?.register()")
    const firstLoad = activity.indexOf("webView.loadUrl(START_URL)")
    if (!bridge?.text.includes("WebViewCompat.addWebMessageListener")
      || !bridge.text.includes("VaultOriginPolicy.shouldAcceptMessage(isMainFrame")
      || !bridge.text.includes("BOOTSTRAP_MESSAGE")
      || listenerRegistration < 0 || firstLoad < listenerRegistration
      || !activity.includes("sshBridge?.onNavigationStarted()")) {
      fail("SSH AndroidX bootstrap must use exact origin/main-frame checks and register before loadUrl")
    }
    const entry = await Bun.file(path("vendor/upstream/packages/app/src/entry.tsx")).text()
    const subscribe = entry.indexOf("const ssh = createWebMessageSshTransport")
    const localeWait = entry.indexOf("void loadInitialLocale().then")
    if (subscribe < 0 || localeWait < 0 || subscribe > localeWait
      || !entry.includes("requestNativeHandshake") || !entry.includes("SSH_BOOTSTRAP_MESSAGE")) {
      fail("SSH JS listener/bootstrap must be ready before asynchronous locale loading")
    }
  }

  // F2: the scan session carries ZERO authentication material (no setPassword/addIdentity
  // inside the scanHostKey function body).
  {
    const manager = sshFiles.find((f) => f.relative.includes("SshTunnelManager"))
    if (!manager) fail("SshTunnelManager.kt not found")
    const scanMatch = /fun\s+scanHostKey\s*\(/.exec(manager!.text)
    if (!scanMatch) fail("SshTunnelManager.kt: scanHostKey function not found (F2)")
    const bodyStart = scanMatch!.index
    const bodyEnd = manager!.text.indexOf("\n    fun ", bodyStart + 1)
    const body = manager!.text.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
    for (const pattern of [/setPassword/i, /addIdentity/i]) {
      if (pattern.test(body)) fail("SshTunnelManager.scanHostKey carries authentication material (F2: scan sessions are anonymous)")
    }
  }

  // F3: the gradle dependencies carry their licence comments.
  {
    const gradle = await Bun.file(path("android/app/build.gradle.kts")).text()
    if (!/com\.github\.mwiede:jsch/.test(gradle)) fail("build.gradle.kts: jsch dependency missing")
    if (!/org\.bouncycastle:bcprov-jdk18on/.test(gradle)) fail("build.gradle.kts: bcprov dependency missing")
    if (!/BSD/i.test(gradle)) fail("build.gradle.kts: jsch BSD licence comment missing (F3)")
    if (!/Bouncy Castle/i.test(gradle)) fail("build.gradle.kts: Bouncy Castle licence comment missing (F3)")
  }

  // Taxonomy mirror: the Kotlin enum speaks every JS wire string.
  {
    const errors = sshFiles.find((f) => f.relative.includes("SshErrorCode"))
    if (!errors) fail("SshErrorCode.kt not found")
    for (const code of SSH_ERROR_CODES) {
      if (!errors!.text.includes(`"${code}"`)) fail(`SshErrorCode.kt does not speak the wire string "${code}"`)
    }
  }

  // F8①: the lifecycle red line is double-written in the Kotlin sources (teardown is
  // local; the remote OpenCode process keeps running). At least one of the manager/bridge
  // files must carry the explicit wording.
  {
    const redLine = /remote\s+(OpenCode\s+)?(service|process|task)[^.]*keeps?\s+running|远端[^。\n]*(存活|继续运行)/i
    const keepers = sshFiles.filter((f) => f.relative.includes("SshTunnelManager") || f.relative.includes("SshTunnelBridge"))
    if (keepers.length === 0) fail("no SshTunnelManager/SshTunnelBridge Kotlin file found")
    if (!keepers.some((f) => redLine.test(f.text))) {
      fail("the F8① lifecycle red line (teardown is local; the remote keeps running) is not double-written in the Kotlin ssh sources")
    }
  }

  // Backup exclusion: the host-key store never travels with backups.
  {
    for (const file of ["android/app/src/main/res/xml/data_extraction_rules.xml", "android/app/src/main/res/xml/full_backup_content.xml"]) {
      const text = await Bun.file(path(file)).text()
      if (!text.includes('path="ssh/"')) fail(`${file}: ssh/ backup exclusion missing`)
    }
  }

  console.log(`verify-ssh: native assertions ok (${sshFiles.length} Kotlin ssh files)`)
}

// ---------------------------------------------------------------------------
// 6. Vendor-dependent dist markers (full mode only; --pre-vendor skips)
// ---------------------------------------------------------------------------
if (!PRE_VENDOR) {
  const entrySrc = await Bun.file(path("vendor/upstream/packages/app/src/entry.tsx")).text()
  for (const needle of [
    "createWebMessageSshTransport",
    "createSshHostKeyVerifier",
    "createSshHostTransport",
    SSH_BRIDGE.handshake,
    "createMobileHosts",
  ]) {
    if (!entrySrc.includes(needle)) fail(`vendored entry.tsx: M-015 wiring missing (${needle})`)
  }
  const sshListenerAt = entrySrc.indexOf("const ssh = createWebMessageSshTransport")
  const localeWaitAt = entrySrc.indexOf("void loadInitialLocale().then")
  if (sshListenerAt < 0 || localeWaitAt < 0 || sshListenerAt > localeWaitAt)
    fail("vendored entry.tsx: SSH handshake listener must subscribe before asynchronous locale loading")
  // Dist scan: the built bundle carries the handshake string and the minification-proof
  // marker (the same discipline as mobile(M-002)/mobile(vault-v1)/mobile(probe-v1)).
  const distDir = path("android/app/src/main/assets/web/")
  let handshakeHits = 0
  let markerHits = 0
  for await (const relative of new Bun.Glob("**/*.{js,html}").scan({ cwd: distDir })) {
    const text = await Bun.file(`${distDir}${relative}`).text()
    if (text.includes(SSH_BRIDGE.handshake)) handshakeHits += 1
    if (text.includes("mobile(ssh-v1)")) markerHits += 1
  }
  if (handshakeHits === 0) fail("built dist does not carry the ssh bridge handshake string (M-015 not built in?)")
  if (markerHits === 0) fail("built dist does not carry the mobile(ssh-v1) marker")
  console.log("verify-ssh: vendor markers ok (dist handshake + mobile(ssh-v1), M-015 wiring)")
}

console.log("verify-ssh: PASS")
