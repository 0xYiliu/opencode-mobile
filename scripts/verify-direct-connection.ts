// verify-direct-connection.ts — issue #5 static verification probe (docs/build-and-verify.md V-conn).
//
// Asserts, against the REAL sources and the REAL built dist:
//   1. Android trust red line (negative assertions): no custom trust/verifier hooks and no
//      error-accepting SSL handler anywhere under android/ — no X509TrustManager, no
//      checkServerTrusted/checkClientTrusted, no HostnameVerifier, no custom SSL socket
//      factory, no SslErrorHandler.proceed, no trust-all posture.
//   2. Network security config permits HTTP while still trusting the system CA store only.
//   3. Probe taxonomy consistency: every JS DirectErrorCode string is spoken by the Kotlin
//      bridge (codeName mapping), and the first-party i18n carries one non-empty EN+ZH line
//      per code (F5 key set 1).
//   4. (vendor-dependent, full mode only) M-011/M-014 dist markers: the built bundle carries
//      the validated-follow wrapper (mobile(M-011)), the probe bridge handshake string and
//      the probe bridge marker (mobile(probe-v1)); the vendored web.ts injects
//      createSecureFetch into the platform seam.
//
// Staged strategy (review note F3 — every commit point stays verifiable): at the scripts
// commit (before the vendor patches land) run with --pre-vendor, which skips assertion 4
// (the dist does not carry the markers yet). After M-011/M-014 land, run in full mode
// (default) — assertion 4 is then permanent, so a lost marker FAILs again.
//
// Usage:
//   bun run scripts/verify-direct-connection.ts             # full (post-vendor)
//   bun run scripts/verify-direct-connection.ts --pre-vendor  # scripts-only stage

import { DIRECT_ERROR_CODES } from "../packages/mobile-hosts/src/transport/connection-errors"
import { messages } from "../packages/mobile-hosts/src/i18n"

function fail(message: string): never {
  console.error(`verify-direct-connection: FAIL: ${message}`)
  process.exit(1)
}

const ROOT = new URL("..", import.meta.url).pathname
const PRE_VENDOR = process.argv.includes("--pre-vendor")
const path = (...segments: string[]) => `${ROOT}${segments.join("/")}`

// ---------------------------------------------------------------------------
// 1. Android trust red line (negative assertions)
// ---------------------------------------------------------------------------
{
  const forbidden: Array<{ pattern: RegExp; why: string }> = [
    { pattern: /X509TrustManager/i, why: "custom trust manager" },
    { pattern: /X509ExtendedTrustManager/i, why: "extended custom trust manager" },
    { pattern: /checkServerTrusted|checkClientTrusted/i, why: "trust-manager callback" },
    { pattern: /HostnameVerifier/i, why: "custom hostname verifier" },
    { pattern: /setSSLSocketFactory|setDefaultSSLSocketFactory|sslSocketFactory\s*=/i, why: "custom SSL socket factory" },
    { pattern: /SSLCertificateSocketFactory/i, why: "certificate-agnostic socket factory" },
    { pattern: /\bproceed\b/i, why: "SSL error accept path (SslErrorHandler)" },
    { pattern: /trustall|trust-all/i, why: "trust-all posture" },
  ]
  const androidDir = path("android/")
  let scanned = 0
  for await (const relative of new Bun.Glob("**/*.{kt,xml}").scan({ cwd: androidDir })) {
    const text = await Bun.file(`${androidDir}${relative}`).text()
    scanned += 1
    for (const { pattern, why } of forbidden) {
      const lines = text.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i]!)) fail(`android/${relative}:${i + 1} matches forbidden pattern (${why}): ${pattern}`)
      }
    }
  }
  if (scanned === 0) fail("android/ scan found no .kt/.xml files")
  console.log(`1 OK: ${scanned} android source files carry no custom trust/verifier hooks and no error-accepting SSL path`)
}

// ---------------------------------------------------------------------------
// 2. HTTP allowed; TLS trust remains system-CA-only
// ---------------------------------------------------------------------------
{
  const xml = await Bun.file(path("android/app/src/main/res/xml/network_security_config.xml")).text()
  const baseConfig = /<base-config[^>]*>([\s\S]*?)<\/base-config>/.exec(xml)
  if (!baseConfig) fail("network_security_config: base-config block missing")
  if (!/<base-config[^>]*cleartextTrafficPermitted\s*=\s*"true"/.test(baseConfig![0]!)) {
    fail("network_security_config: base-config does not permit cleartext")
  }
  const anchors = baseConfig![1]!
  if (!/<certificates\s+src="system"\s*\/?>/.test(anchors)) fail("network_security_config: system CA anchor missing")
  if (/<certificates\s+src="user"/.test(xml)) fail("network_security_config: user CA anchor present (must stay absent)")
  const manifest = await Bun.file(path("android/app/src/main/AndroidManifest.xml")).text()
  if (!/android:usesCleartextTraffic\s*=\s*"true"/.test(manifest)) fail("AndroidManifest: cleartext traffic not permitted")
  console.log("2 OK: HTTP permitted; HTTPS uses system-CA-only anchors")
}

// ---------------------------------------------------------------------------
// 3. Probe taxonomy consistency (Kotlin wire strings + first-party i18n, F5 key set 1)
// ---------------------------------------------------------------------------
{
  const bridge = await Bun.file(path("android/app/src/main/java/ai/opencode/mobile/probe/ProbeBridge.kt")).text()
  for (const code of DIRECT_ERROR_CODES) {
    // The Kotlin codeName mapping must speak exactly the JS wire strings.
    if (!bridge.includes(`"${code}"`)) fail(`ProbeBridge.kt does not speak the code "${code}"`)
    // The first-party i18n must carry an actionable EN+ZH line per code.
    for (const locale of ["en", "zh"] as const) {
      const table = messages[locale] as Record<string, string>
      const key = `direct.error.${code}`
      if (typeof table[key] !== "string" || table[key]!.length <= 8) {
        fail(`mobile-hosts i18n ${locale} is missing an actionable "${key}" line`)
      }
    }
  }
  console.log(`3 OK: all ${DIRECT_ERROR_CODES.length} classification codes are spoken by the Kotlin bridge and covered by EN+ZH first-party copy`)
}

// ---------------------------------------------------------------------------
// 4. Vendor-dependent: M-011/M-014 seam + dist markers (full mode only — F3 staging)
// ---------------------------------------------------------------------------
if (PRE_VENDOR) {
  console.log("4 SKIPPED (--pre-vendor): M-011/M-014 seam and dist-marker assertions activate once the vendor patches land")
} else {
  const webTs = await Bun.file(path("vendor/upstream/packages/app/src/runtime/platform/web.ts")).text()
  if (!webTs.includes("createSecureFetch")) {
    fail("vendored web.ts does not inject createSecureFetch into the platform fetch seam (M-011)")
  }
  if (!webTs.includes("mobile(M-011)")) fail("vendored web.ts is missing the mobile(M-011) marker comment")

  const distDir = path("vendor/upstream/packages/app/dist/_assets/")
  const distFiles = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: distDir }))
  if (distFiles.length === 0) fail("dist/_assets is empty — run `bun run build:web` for the dist-marker assertions")
  const markers = ["mobile(M-011)", "opencode-mobile-probe-handshake", "mobile(probe-v1)"]
  for (const marker of markers) {
    const proc = Bun.spawnSync(["grep", "-rl", "-e", marker, "dist/_assets/"], {
      cwd: path("vendor/upstream/packages/app/"),
    })
    if (proc.stdout.toString().trim() === "") fail(`dist marker ${marker} not found in built assets`)
  }
  console.log(`4 OK: M-011 platform seam present in vendored web.ts; dist markers ${markers.join(", ")} found in ${distFiles.length} built assets`)
}

console.log("verify-direct-connection: PASS")
