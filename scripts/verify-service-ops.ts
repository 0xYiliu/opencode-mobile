// verify-service-ops.ts — issue #7 static verification probe (docs/build-and-verify.md
// V-svcops). Mirrors the staged strategy of verify-ssh.ts / verify-direct-connection.ts.
//
// Asserts, against the REAL sources (and the REAL built dist in full mode):
//   1. JS taxonomy <-> i18n consistency: every ServiceOpsErrorCode has one non-empty EN +
//      ZH `svcops.error.<code>` line; SERVICE_OPS_ERROR_CODES is total over the guard.
//   2. Golden vectors: every recorded vector assembles byte-for-byte through BOTH faces
//      (preview == execution); the N1 stdin discipline (the TWO POSIX start variants carry
//      </dev/null — the Windows variant has none, cmd semantics; review residual 1); the
//      B2 setsid split (Linux only).
//   3. Command-surface negatives (TS): zero delete-class templates and no uninstall
//      action in the whitelist table (N8); the curl pipe installer is closed to
//      linux/darwin (N2); cross-OS assembly is refused.
//   4. No build-time execution face: the whole first-party service-ops face imports no
//      child_process/spawn surface; the panel builds command text ONLY through the
//      template assembler (no raw template strings outside commands.ts).
//   5. Four-bridge isolation: the vault/probe/ssh/svcops handshake strings are pairwise
//      distinct.
//   6. (native mode) Kotlin mirrors: every JS wire string spoken by the Kotlin taxonomy;
//      every template id and param pattern mirrored in ServiceCommandValidator; setCommand
//      has EXACTLY ONE call site across all Android Kotlin sources and it sits behind the
//      validator gate; no ProcessBuilder / Runtime.exec / wsl.exe / ProxyJump; no
//      uninstall execution path; bounded 16KiB output constants; pinned-fingerprint gate
//      over SshHostKeyStore; zero-value logging in the exec face; the svcops handshake
//      literal distinct from the three sibling handshakes.
//   7. (vendor mode) M-016 entry wiring + dist markers (handshake string + the
//      minification-proof mobile(svcops-v1) marker).
//
// Staged strategy: at the scripts commit run with BOTH --pre-native (the Kotlin svcops/
// files do not exist yet) and --pre-vendor (the dist does not carry the markers yet).
// After the Kotlin commit run with --pre-vendor only. After M-016 lands, run in full
// mode (default).
//
// Usage:
//   bun run scripts/verify-service-ops.ts                              # full (post-vendor)
//   bun run scripts/verify-service-ops.ts --pre-vendor                 # after the Kotlin commit
//   bun run scripts/verify-service-ops.ts --pre-native --pre-vendor    # scripts-only stage

import {
  COMMAND_TEMPLATES,
  GOLDEN_VECTORS,
  SERVICE_PARAM_PATTERNS,
  assembleServiceCommand,
  previewServiceCommand,
  serviceCommandTemplate,
} from "../packages/mobile-hosts/src/service-ops/commands"
import { SERVICE_OPS_ERROR_CODES, isServiceOpsErrorCode } from "../packages/mobile-hosts/src/service-ops/errors"
import { messages } from "../packages/mobile-hosts/src/i18n"
import { SVCOPS_BRIDGE, SVCOPS_HANDSHAKE } from "../packages/mobile-hosts/src/service-ops/bridge"
import { SSH_BRIDGE } from "../packages/mobile-hosts/src/ssh/bridge"
import { PROBE_HANDSHAKE } from "../packages/mobile-hosts/src/probe"
import { VAULT_HANDSHAKE } from "../packages/mobile-hosts/src/vault/transport"

function fail(message: string): never {
  console.error(`verify-service-ops: FAIL: ${message}`)
  process.exit(1)
}

const ROOT = new URL("..", import.meta.url).pathname
const PRE_NATIVE = process.argv.includes("--pre-native")
const PRE_VENDOR = process.argv.includes("--pre-vendor")
const path = (...segments: string[]) => `${ROOT}${segments.join("/")}`

// ---------------------------------------------------------------------------
// 1. JS taxonomy <-> i18n consistency (svcops face)
// ---------------------------------------------------------------------------
{
  const codes = SERVICE_OPS_ERROR_CODES
  if (codes.length !== 21) fail(`expected exactly 21 service ops error codes, found ${codes.length}`)
  for (const code of codes) {
    if (!isServiceOpsErrorCode(code)) fail(`isServiceOpsErrorCode refuses its own code: ${code}`)
    for (const locale of ["en", "zh"] as const) {
      const key = `svcops.error.${code}`
      const line = (messages[locale] as Record<string, string | undefined>)[key]
      if (typeof line !== "string" || line.length === 0) fail(`missing ${locale} copy for ${key}`)
    }
  }
  // The dedicated permission-denied code (N4) and the rollback-available flow marker.
  if (!codes.includes("permission-denied")) fail("the permission-denied dedicated code (N4) is missing")
  if (!codes.includes("rollback-available")) fail("the rollback-available flow-state marker is missing")
  console.log(`verify-service-ops: taxonomy ok (${codes.length} codes, EN+ZH copies present, N4 dedicated code in set)`)
}

// ---------------------------------------------------------------------------
// 2. Golden vectors (preview == execution, byte for byte; N1 residual 1; B2 setsid)
// ---------------------------------------------------------------------------
{
  for (const vector of GOLDEN_VECTORS) {
    const execution = assembleServiceCommand(vector.os, vector.templateId, vector.params)
    const preview = previewServiceCommand(vector.os, vector.templateId, vector.params)
    if (execution.command !== vector.command) fail(`golden vector drifted (${vector.templateId}): ${execution.command}`)
    if (preview.command !== execution.command) fail(`preview face diverged from the execution face (${vector.templateId})`)
  }
  const startLinux = serviceCommandTemplate("start.linux")
  const startDarwin = serviceCommandTemplate("start.darwin")
  const startWindows = serviceCommandTemplate("start.windows")
  if (!startLinux || !startDarwin || !startWindows) fail("the three start variants are missing")
  // N1 (review residual 1): the TWO POSIX variants carry </dev/null; the Windows variant
  // has no /dev/null (cmd semantics — the stdio story is documented, not fabricated).
  if (!startLinux!.command.includes("</dev/null") || !startLinux!.command.includes(">/dev/null 2>&1")) {
    fail("start.linux lost the full stdio redirect discipline (N1)")
  }
  if (!startDarwin!.command.includes("</dev/null") || !startDarwin!.command.includes(">/dev/null 2>&1")) {
    fail("start.darwin lost the full stdio redirect discipline (N1)")
  }
  if (startWindows!.command.includes("/dev/null")) fail("start.windows must not carry a /dev/null redirect (cmd semantics)")
  // B2: setsid is Linux-only; macOS carries nohup only.
  if (!startLinux!.command.startsWith("setsid nohup ")) fail("start.linux must detach via setsid (B2)")
  if (!startDarwin!.command.startsWith("nohup ") || startDarwin!.command.includes("setsid")) {
    fail("start.darwin must carry nohup only (B2: macOS has no setsid)")
  }
  console.log(`verify-service-ops: golden vectors ok (${GOLDEN_VECTORS.length} vectors, N1 POSIX stdin, B2 setsid split)`)
}

// ---------------------------------------------------------------------------
// 3. Command-surface negatives (N8 delete-class zero; N2 curl POSIX closure)
// ---------------------------------------------------------------------------
{
  for (const template of COMMAND_TEMPLATES) {
    if (/\brm\b|\bdel\b|\brmdir\b|\bRemove-Item\b/.test(template.command)) {
      fail(`delete-class template in the whitelist table (N8): ${template.id}`)
    }
    if (template.action === "uninstall" || template.id.includes("uninstall")) {
      fail("an uninstall face entered the executable table (N8: copy-only)")
    }
  }
  if (serviceCommandTemplate("install-curl.windows") !== undefined) {
    fail("the curl pipe installer must not exist for windows (N2)")
  }
  let crossOsRefused = false
  try {
    assembleServiceCommand("windows", "start.linux", { port: "4096" })
  } catch {
    crossOsRefused = true
  }
  if (!crossOsRefused) fail("cross-OS assembly must be refused (B2/N2 closed domain)")
  let curlCrossRefused = false
  try {
    assembleServiceCommand("windows", "install-curl.linux", { version: "2.1.4" })
  } catch {
    curlCrossRefused = true
  }
  if (!curlCrossRefused) fail("cross-OS curl assembly must be refused (N2)")
  console.log(`verify-service-ops: command surface ok (${COMMAND_TEMPLATES.length} templates, zero delete-class, N2 closure, closed domain)`)
}

// ---------------------------------------------------------------------------
// 4. No build-time execution face; preview strings come only from the template table
// ---------------------------------------------------------------------------
{
  const faceFiles: string[] = []
  for await (const relative of new Bun.Glob("**/*.ts").scan({ cwd: path("packages/mobile-hosts/src/service-ops") })) {
    faceFiles.push(`packages/mobile-hosts/src/service-ops/${relative}`)
  }
  faceFiles.push("packages/mobile-hosts/src/ui/service-panel.tsx")
  for (const relative of faceFiles) {
    const text = await Bun.file(path(relative)).text()
    if (/node:child_process|require\(["']child_process|\bexecSync\b|\bspawnSync\b|\bexecFile\b|Bun\.spawn/.test(text)) {
      fail(`${relative}: build-time execution face (a client-only build implies no service-operation capability)`)
    }
  }
  // The panel never spells a raw template string — command text is assembled ONLY via
  // the golden-vector table (preview source uniqueness).
  const panel = await Bun.file(path("packages/mobile-hosts/src/ui/service-panel.tsx")).text()
  for (const raw of ["opencode serve", "curl -fsSL", "winget install", "npm install -g", "pkill -x", "taskkill", "setsid nohup", "uname -s"]) {
    if (panel.includes(raw)) fail(`service-panel.tsx spells the raw template fragment "${raw}" — preview strings must come from the template table only`)
  }
  if (!panel.includes("assembleServiceCommand")) fail("service-panel.tsx does not assemble through the whitelist table")
  console.log(`verify-service-ops: no build-time execution face; preview source unique (template table)`)
}

// ---------------------------------------------------------------------------
// 5. Four-bridge isolation (vault / probe / ssh / svcops handshake strings)
// ---------------------------------------------------------------------------
{
  const handshakes = [VAULT_HANDSHAKE, PROBE_HANDSHAKE, SSH_BRIDGE.handshake, SVCOPS_BRIDGE.handshake]
  if (new Set(handshakes).size !== 4) fail(`bridge handshake strings are not pairwise distinct: ${handshakes.join(", ")}`)
  if (SVCOPS_BRIDGE.handshake !== "opencode-mobile-svcops-handshake") fail("svcops handshake string drifted from the registered value")
  console.log("verify-service-ops: bridge isolation ok (four distinct handshake strings)")
}

// ---------------------------------------------------------------------------
// 6. Native-mode assertions (after the Kotlin commit; --pre-native skips)
// ---------------------------------------------------------------------------
if (!PRE_NATIVE) {
  const svcopsDir = path("android/app/src/main/java/ai/opencode/mobile/svcops/")
  const svcopsFiles: Array<{ relative: string; text: string }> = []
  for await (const relative of new Bun.Glob("*.kt").scan({ cwd: svcopsDir })) {
    svcopsFiles.push({ relative, text: await Bun.file(`${svcopsDir}${relative}`).text() })
  }
  if (svcopsFiles.length < 3) fail(`expected at least the three svcops Kotlin files, found ${svcopsFiles.length}`)

  // Taxonomy mirror: the Kotlin enum speaks every JS wire string.
  {
    const errors = svcopsFiles.find((f) => f.relative.includes("ServiceOpsErrorCode"))
    if (!errors) fail("ServiceOpsErrorCode.kt not found")
    for (const code of SERVICE_OPS_ERROR_CODES) {
      if (!errors!.text.includes(`"${code}"`)) fail(`ServiceOpsErrorCode.kt does not speak the wire string "${code}"`)
    }
  }

  // Template + param-pattern mirror in the validator.
  {
    const validator = svcopsFiles.find((f) => f.relative.includes("ServiceCommandValidator"))
    if (!validator) fail("ServiceCommandValidator.kt not found")
    for (const template of COMMAND_TEMPLATES) {
      if (!validator!.text.includes(`"${template.id}"`)) fail(`ServiceCommandValidator.kt does not whitelist the template "${template.id}"`)
    }
    for (const [name, pattern] of Object.entries(SERVICE_PARAM_PATTERNS)) {
      // The Kotlin source stores the pattern in its STRING-LITERAL form: every backslash
      // doubled relative to the JS regex value. Compare against that literal form.
      const kotlinLiteral = pattern.replace(/\\/g, "\\\\")
      if (!validator!.text.includes(kotlinLiteral)) fail(`ServiceCommandValidator.kt does not mirror the param pattern ${name} (${pattern})`)
    }
    // The OS applicability domains are mirrored (closed domain on the native side too).
    for (const domain of ["linux", "darwin", "windows", "any"] as const) {
      if (!validator!.text.includes(`"${domain}"`)) fail(`ServiceCommandValidator.kt does not mirror the OS domain "${domain}"`)
    }
  }

  // setCommand: EXACTLY ONE call site across ALL Android Kotlin sources, inside the
  // manager, behind the validator gate (fail-closed double gate).
  {
    const androidDir = path("android/")
    let callSites = 0
    for await (const relative of new Bun.Glob("**/*.kt").scan({ cwd: androidDir })) {
      const text = await Bun.file(`${androidDir}${relative}`).text()
      const hits = text.match(/\.setCommand\(/g)
      if (hits) callSites += hits.length
    }
    if (callSites !== 1) fail(`setCommand must have exactly one call site in the Android tree, found ${callSites}`)
    const manager = svcopsFiles.find((f) => f.relative.includes("ServiceOpsManager"))
    if (!manager || !/\.setCommand\(/.test(manager!.text)) fail("the single setCommand call site is not in ServiceOpsManager.kt")
    if (!manager!.text.includes("validator") && !manager!.text.includes("Validator")) {
      fail("ServiceOpsManager.kt does not reference the command validator gate above setCommand")
    }
  }

  // Android red lines over the svcops face (and the whole tree for the execution faces).
  {
    const forbidden: Array<{ pattern: RegExp; why: string; where?: RegExp }> = [
      { pattern: /ProcessBuilder/, why: "process-builder execution surface" },
      { pattern: /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec/, why: "Runtime.exec execution surface" },
      { pattern: /wsl\.exe|wslconfig/i, why: "WSL execution surface (decision 0001)" },
      { pattern: /ProxyJump|ProxyCommand|setProxy(Host|Port|Command)?\s*\(/i, why: "jump-host surface" },
      { pattern: /\buninstall\b/i, why: "an uninstall execution path (N8: copy-only)", where: /\/svcops\/.+\.kt$/ },
    ]
    const androidDir = path("android/")
    let scanned = 0
    for await (const relative of new Bun.Glob("**/*.kt").scan({ cwd: androidDir })) {
      const text = await Bun.file(`${androidDir}${relative}`).text()
      scanned += 1
      for (const { pattern, why, where } of forbidden) {
        if (where && !where.test(relative)) continue
        if (pattern.test(text)) fail(`android/${relative}: forbidden pattern — ${why}`)
      }
    }
    if (scanned === 0) fail("no android sources scanned")
  }

  // Bounded exec face: 16KiB output bounds, explicit timeout, exit status capture,
  // single-flight per host, pinned-fingerprint gate over the authoritative store.
  {
    const manager = svcopsFiles.find((f) => f.relative.includes("ServiceOpsManager"))
    if (!manager) fail("ServiceOpsManager.kt not found")
    for (const needle of ["16", "ChannelExec", "exitStatus", "pinnedFingerprint"]) {
      if (!manager!.text.includes(needle)) fail(`ServiceOpsManager.kt is missing the exec bound/face element: ${needle}`)
    }
    if (!manager!.text.includes("SshHostKeyStore")) fail("ServiceOpsManager.kt must gate on the authoritative SshHostKeyStore (decision 0003 §3.3 inheritance)")
    // Per-host single flight: a keyed in-flight map.
    if (!/inFlight|singleFlight|in-flight/i.test(manager!.text)) fail("ServiceOpsManager.kt shows no per-host single-flight bookkeeping")
    // N7: the credential is parsed per command and crosses once — no logging of it.
    if (/Log\.[iwve]\([^)]*\$?(credential|password)/i.test(manager!.text)) {
      fail("ServiceOpsManager.kt logs credential-shaped values (zero-value logging red line)")
    }
  }

  // Zero-value logging across the svcops face: no host/port interpolation into log calls.
  {
    for (const file of svcopsFiles) {
      if (/Log\.[iwved]\([^)]*\$(host|port)\b/.test(file.text)) {
        fail(`android/svcops/${file.relative}: log statement interpolates host/port (zero-value logging red line)`)
      }
    }
  }

  // Four-bridge isolation on the native side: the svcops handshake differs from the
  // three siblings' literals.
  {
    const bridge = svcopsFiles.find((f) => f.relative.includes("ServiceOpsBridge"))
    if (!bridge) fail("ServiceOpsBridge.kt not found")
    if (!bridge!.text.includes("opencode-mobile-svcops-handshake")) fail("ServiceOpsBridge.kt does not speak the registered handshake")
    for (const sibling of ["opencode-mobile-vault-handshake", "opencode-mobile-probe-handshake", "opencode-mobile-ssh-handshake"]) {
      if (bridge!.text.includes(sibling)) fail(`ServiceOpsBridge.kt references a sibling handshake (${sibling})`)
    }
  }

  // The lifecycle red line stays double-written: the fourth bridge never stops the remote.
  {
    const redLine = /never\s+(stops?|signals?)[^.]*remote|remote[^.]*(keeps?|survives)|断开[^。\n]*永不|绝不[^。\n]*(停止|终止)[^。\n]*远端/i
    if (!svcopsFiles.some((f) => redLine.test(f.text))) {
      fail("the lifecycle red line (the fourth bridge never stops the remote) is not written in the Kotlin svcops sources")
    }
  }

  console.log(`verify-service-ops: native assertions ok (${svcopsFiles.length} Kotlin svcops files, single setCommand call site behind the validator)`)
}

// ---------------------------------------------------------------------------
// 7. Vendor-dependent dist markers (full mode only; --pre-vendor skips)
// ---------------------------------------------------------------------------
if (!PRE_VENDOR) {
  const entrySrc = await Bun.file(path("vendor/upstream/packages/app/src/entry.tsx")).text()
  for (const needle of ["createWebMessageServiceOpsTransport", "setActiveServiceOpsPort", SVCOPS_BRIDGE.handshake]) {
    if (!entrySrc.includes(needle)) fail(`vendored entry.tsx: M-016 wiring missing (${needle})`)
  }
  const distDir = path("android/app/src/main/assets/web/")
  let handshakeHits = 0
  let markerHits = 0
  for await (const relative of new Bun.Glob("**/*.{js,html}").scan({ cwd: distDir })) {
    const text = await Bun.file(`${distDir}${relative}`).text()
    if (text.includes(SVCOPS_BRIDGE.handshake)) handshakeHits += 1
    if (text.includes("mobile(svcops-v1)")) markerHits += 1
  }
  if (handshakeHits === 0) fail("built dist does not carry the svcops bridge handshake string (M-016 not built in?)")
  if (markerHits === 0) fail("built dist does not carry the mobile(svcops-v1) marker")
  console.log("verify-service-ops: vendor markers ok (dist handshake + mobile(svcops-v1), M-016 wiring)")
}

console.log("verify-service-ops: PASS")
