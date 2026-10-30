// verify-open-external.ts — static probe for issue #76 (N08: the openExternal
// shell bridge). Locks the structural facts the delivery relies on, against
// the REAL sources: the vendored platform face (pin b4525d79bf… + packageSources
// + M-001..M-041), the first-party mobile-hosts files port, the Android shell
// (ExternalOpenPolicy + FilesBridge + strings.xml + manifest) and the patch
// registration.
//
//   1. JS face (web.ts + mobile-hosts): the upstream canParse gate and the
//      http/https/mailto protocol gate stay VERBATIM (first layer only, never
//      trusted); the outbound call is `void activeFilesPort().openExternal(url.href)`
//      with the mobile(M-041) marker; web.ts carries ZERO window.open call sites
//      (negative — the same-WebView navigation defect must not return);
//      FilesPort has exactly the four members with openExternal(url): Promise<boolean>;
//      the stub answers false (fail-closed, void-contract equivalent); the
//      bridge-backed client degrades everything to false and never throws (the
//      try/catch + return-false shape; the OAuth controller's browserFailed face
//      stays unreachable exactly as on web); FilesBridgeOperation union carries
//      "openExternal"; the transport timeout anchor line is untouched
//      (`options.timeoutMs ?? 300_000`).
//   2. Native face (shell): FilesBridge OPERATIONS is exactly the four-op set;
//      the openExternal dispatch branch + handleOpenExternal anchors (policy on
//      the parse thread, ACTION_VIEW on the main thread from the SAME accepted
//      string, ActivityNotFoundException -> {opened:false}, the fixed-string
//      Toast LENGTH_SHORT, exactly-one response shape {opened}); the
//      ExternalOpenPolicy gates (strict URI parse, http/https only — the
//      registered mailto delta, userinfo refused, host required, port range
//      hardened, 2048 bound) and its JVM purity (zero android imports);
//      zero-value logging negative over the handleOpenExternal domain (no URL
//      fragment inside any Log call); strings.xml carries the single fixed
//      failure string (en-only first version — no values-zh exists in this app,
//      the zh completion candidate is registered in the unit doc); MainActivity
//      zero openExternal wiring (negative).
//      WITNESS ONLY — outbound/inbound boundary (first locks elsewhere, NOT
//      re-locked here): AndroidManifest.xml keeps zero VIEW intent-filter and
//      zero custom scheme (verify-pairing groups 3/4), zero
//      QUERY_ALL_PACKAGES, and the permission set is verify-pairing group 6's
//      master lock (exactly {INTERNET, POST_NOTIFICATIONS, CAMERA}) — this
//      probe only witnesses that the OUTBOUND face added no manifest surface.
//   3. Registration face: M-041 is dual-registered (patches/mobile/manifest.json
//      row with targets exactly [web.ts] + non-empty upstreamBaseline;
//      vendor-manifest.json mobilePatches carries the path). The exact 39=39
//      chain count is the MASTER lock of verify-about-version group 6 +
//      verify-attachments-artifacts group 6 + verify-commands-menus group 8 —
//      witnessed here, not re-locked.
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static
// STRUCTURE check. It proves source shape, NOT runtime behavior: the on-device
// allowed-domain hand-off (QA-1), the refused-domain Toast (QA-2), the mailto
// delta Toast (QA-3) and the no-handler-app path (QA-4) are device-QA items
// registered in docs/build-and-verify.md issue #76. The JVM decision matrix
// (ExternalOpenPolicyTest) is the behavioral lower bound for the policy.
//
// Registered negative drills (inject → FAIL rc=1 → restore byte-identical →
// PASS rc=0; logs .probe-logs/negex/): ① re-introduce the literal
// `window.open(url.href, "_blank", "noopener,noreferrer")` into web.ts →
// group 1 FAIL (zero-window.open negative); ② delete the mobile(M-041) marker
// comment from web.ts → group 1 FAIL; ③ remove "openExternal" from the
// FilesBridge OPERATIONS set → group 2 FAIL; ④ add an android import to
// ExternalOpenPolicy.kt → group 2 purity FAIL; ⑤ add a URL interpolation into
// a Log call inside handleOpenExternal → group 2 zero-value-log FAIL.
//
// Usage:
//   bun run scripts/verify-open-external.ts
// Exit 0 = all assertions PASS.

import { readdirSync, readFileSync } from "node:fs"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-open-external: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const squash = (text: string) => text.replace(/\s+/g, "")

const APP = "vendor/upstream/packages/app/"
const WEB_TS = `${APP}src/runtime/platform/web.ts`
const FILES_CLIENT = "packages/mobile-hosts/src/files/client.ts"
const FILES_TRANSPORT = "packages/mobile-hosts/src/files/transport.ts"
const POLICY_KT = "android/app/src/main/java/ai/opencode/mobile/ExternalOpenPolicy.kt"
const BRIDGE_KT = "android/app/src/main/java/ai/opencode/mobile/files/FilesBridge.kt"
const MAIN_ACTIVITY_KT = "android/app/src/main/java/ai/opencode/mobile/MainActivity.kt"
const MANIFEST_XML = "android/app/src/main/AndroidManifest.xml"
const STRINGS_XML = "android/app/src/main/res/values/strings.xml"
const PATCH_MANIFEST = "vendor/upstream/patches/mobile/manifest.json"
const VENDOR_MANIFEST = "vendor/upstream/vendor-manifest.json"

// --- 1. JS face: the platform face routes over the files bridge (M-041) ---
{
  const web = await read(WEB_TS)
  const flat = squash(web)

  // Upstream gates stay verbatim (the first layer — never the enforced one).
  if (!flat.includes('openExternal(value){if(!URL.canParse(value))return'))
    fail("1: web.ts lost the openExternal canParse gate (verbatim)")
  if (!flat.includes('if(url.protocol!=="http:"&&url.protocol!=="https:"&&url.protocol!=="mailto:")return'))
    fail("1: web.ts lost the openExternal http/https/mailto protocol gate (verbatim)")
  if (!flat.includes('consturl=newURL(value)'))
    fail("1: web.ts lost the openExternal URL construction line (verbatim)")

  // M-041: the outbound call is the files-bridge port face.
  if (!flat.includes("voidactiveFilesPort().openExternal(url.href)"))
    fail("1: web.ts lost the M-041 external-open bridge call shape")
  if (!web.includes("mobile(M-041)"))
    fail("1: web.ts lost the mobile(M-041) outbound-face marker comment")

  // NEGATIVE: the same-WebView navigation defect must not return in this file.
  if (web.includes("window.open("))
    fail("1: web.ts gained a window.open call site (M-041 routed the outbound face over the files bridge)")

  // FilesPort: exactly the four members, openExternal never-throw contract.
  const client = await read(FILES_CLIENT)
  const flatClient = squash(client)
  for (const member of [
    "clipboardImage():Promise<File|null>",
    "saveFile(opts:SaveFileInput,content:string):Promise<boolean>",
    "shareDataUrl(dataUrl:string,filename:string,mime:string):Promise<boolean>",
    "openExternal(url:string):Promise<boolean>",
  ]) {
    if (!flatClient.includes(member)) fail(`1: FilesPort lost the member shape ${member}`)
  }
  if (!flatClient.includes("openExternal:async()=>false"))
    fail("1: the StubFilesPort openExternal must answer false (fail-closed)")
  if (!flatClient.includes('openExternal:async(url:string):Promise<boolean>=>{'))
    fail("1: the bridge-backed client lost the openExternal implementation shape")
  if (!flatClient.includes('transport.request("openExternal",{url})'))
    fail("1: the client must send the openExternal op over the files transport")
  if (!flatClient.includes('if(typeofopened!=="boolean")returnfalse'))
    fail("1: the client lost the malformed-answer degradation (opened not boolean -> false)")
  if (!flatClient.includes('if(transport.status()!=="available")returnfalse'))
    fail("1: the client lost the un-acked degradation (transport unavailable -> false)")
  // Never-throw shape: the openExternal body closes with catch { return false }.
  const openExternalIdx = client.indexOf("openExternal: async (url: string): Promise<boolean> => {")
  const bodyEnd = client.indexOf("},\n  }\n}", openExternalIdx)
  if (openExternalIdx === -1 || bodyEnd === -1) fail("1: could not delimit the client openExternal body")
  const body = client.slice(openExternalIdx, bodyEnd)
  if (!body.includes("} catch {") || !body.includes("return false"))
    fail("1: the client openExternal body must be fully fail-closed (catch -> return false, never throws)")

  // Transport: the op union carries the fourth op; the timeout anchor is untouched.
  const transport = await read(FILES_TRANSPORT)
  if (!transport.includes('export type FilesBridgeOperation = "clipboardImage" | "save" | "share" | "openExternal"'))
    fail("1: FilesBridgeOperation union lost the openExternal member")
  if (!transport.includes("options.timeoutMs ?? 300_000"))
    fail("1: the transport timeout anchor line moved (timeoutMs ?? 300_000)")
}

// --- 2. Native face: policy + bridge + fixed failure copy + manifest witness ---
{
  const policy = await read(POLICY_KT)

  // JVM purity: zero Android imports (CameraGrantPolicy caliber).
  if (/^\s*import\s+android\./m.test(policy))
    fail("2: ExternalOpenPolicy must stay JVM-pure (zero android imports)")

  // The gates (plan 2.2 + the registered port-range hardening).
  const flatPolicy = squash(policy)
  if (!flatPolicy.includes('if(raw.length>MAX_URL_LENGTH)returnDecision.REFUSED'))
    fail("2: ExternalOpenPolicy lost the 2048 length bound")
  if (!flatPolicy.includes("URI(raw)")) fail("2: ExternalOpenPolicy lost the strict java.net.URI parse")
  if (!flatPolicy.includes('if(scheme!="http"&&scheme!="https")returnDecision.REFUSED'))
    fail("2: ExternalOpenPolicy lost the http/https-only protocol gate (the registered mailto delta)")
  if (!flatPolicy.includes("if(uri.rawUserInfo!=null)returnDecision.REFUSED"))
    fail("2: ExternalOpenPolicy lost the userinfo refusal")
  if (!flatPolicy.includes("if(host.isNullOrEmpty())returnDecision.REFUSED"))
    fail("2: ExternalOpenPolicy lost the host requirement")
  if (!flatPolicy.includes("if(uri.port!in-1..65535)returnDecision.REFUSED"))
    fail("2: ExternalOpenPolicy lost the port-range hardening")
  if (!policy.includes('internal const val MAX_URL_LENGTH = 2048'))
    fail("2: ExternalOpenPolicy lost the 2048 bound constant")
  if (!flatPolicy.includes("enumclassDecision{"))
    fail("2: ExternalOpenPolicy lost the Decision enum (exactly REFUSED/OPEN — locked by the JVM matrix)")

  // FilesBridge: exactly four ops + the dispatch + the handler anchors.
  const bridge = await read(BRIDGE_KT)
  if (!bridge.includes('private val OPERATIONS = setOf("clipboardImage", "save", "share", "openExternal")'))
    fail("2: FilesBridge OPERATIONS must be exactly the four-op set")
  if (!bridge.includes('"openExternal" -> handleOpenExternal(id, json.optJSONObject("params") ?: JSONObject())'))
    fail("2: FilesBridge lost the openExternal dispatch branch")
  if (!bridge.includes("ExternalOpenPolicy.decide(raw) == ExternalOpenPolicy.Decision.OPEN"))
    fail("2: handleOpenExternal lost the policy decision call")
  if (!bridge.includes("Intent(Intent.ACTION_VIEW, Uri.parse(accepted))"))
    fail("2: handleOpenExternal lost the ACTION_VIEW built from the SAME accepted string")
  if (!bridge.includes("catch (e: ActivityNotFoundException)"))
    fail("2: handleOpenExternal lost the no-handler-app capture")
  if (!bridge.includes("openedBody(requestId, false)"))
    fail("2: handleOpenExternal lost the {opened:false} answer shape")
  if (!bridge.includes('JSONObject().put("opened", opened)'))
    fail("2: FilesBridge lost the {opened:...} response body shape")
  if (!bridge.includes("Toast.LENGTH_SHORT"))
    fail("2: the failure Toast must be LENGTH_SHORT (registered: no throttle)")
  if (!bridge.includes("R.string.external_open_failed"))
    fail("2: the failure Toast must use the fixed string resource (zero URL content)")

  // Zero-value logging negative over the handler domain: no URL fragment on any
  // Log-call line (line-scoped so a parenthesized message cannot hide the tail).
  const handlerStart = bridge.indexOf("private fun handleOpenExternal")
  const helperEnd = bridge.indexOf("private fun showToastExternalOpenFailed")
  if (handlerStart === -1 || helperEnd === -1) fail("2: could not delimit the openExternal handler domain")
  const handlerDomain = bridge.slice(handlerStart, helperEnd)
  for (const line of handlerDomain.split("\n")) {
    if (!/Log\.\w+\(/.test(line)) continue
    if (/\b(raw|accepted|url)\b/.test(line))
      fail(`2: a Log call in the openExternal domain carries URL-shaped content: ${line.trim().slice(0, 72)}`)
  }

  // Fixed failure copy: one en string, no zh resource in this app (en-only first
  // version — the zh completion candidate is registered in the unit doc).
  const strings = await read(STRINGS_XML)
  if (!strings.includes('<string name="external_open_failed">Unable to open external link</string>'))
    fail("2: strings.xml lost the fixed external_open_failed copy")
  const resDir = new URL("android/app/src/main/res/", repoRoot).pathname
  const resEntries = readdirSync(resDir)
  if (resEntries.some((entry) => entry.startsWith("values-zh")))
    fail("2: a values-zh resource dir appeared (the first version is en-only — re-register the zh face deliberately)")

  // NEGATIVE: MainActivity carries no openExternal wiring (the op rides the
  // bridge instance; zero coordinator/activity surface).
  const mainActivity = await read(MAIN_ACTIVITY_KT)
  if (mainActivity.includes("openExternal"))
    fail("2: MainActivity gained an openExternal reference (the outbound face must stay inside FilesBridge)")

  // WITNESS (outbound/inbound boundary; NOT a re-lock — first locks are
  // verify-pairing groups 3/4/6): the OUTBOUND face added no manifest surface.
  const manifest = await read(MANIFEST_XML)
  if (manifest.includes("android.intent.action.VIEW"))
    fail("2: manifest gained a VIEW intent-filter (witness — the outbound face needs none; master lock verify-pairing group 3)")
  if (manifest.includes("QUERY_ALL_PACKAGES"))
    fail("2: manifest gained QUERY_ALL_PACKAGES (witness — startActivity needs no package visibility declaration)")
  if (/<data android:scheme/.test(manifest))
    fail("2: manifest gained a custom scheme (witness — decision 0007 inbound remains proposal-stage; master lock verify-pairing group 4)")
}

// --- 3. Registration face: M-041 dual registration (count master-locked elsewhere) ---
{
  const patchManifest = JSON.parse(await read(PATCH_MANIFEST)) as {
    patches?: Array<{ id?: unknown; patch?: unknown; targets?: unknown; upstreamBaseline?: unknown }>
  }
  const rows = patchManifest.patches ?? []
  const m041 = rows.filter((row) => row.id === "M-041")
  if (m041.length !== 1) fail("3: patches manifest must carry exactly one M-041 entry")
  const entry = m041[0]!
  if (entry.patch !== "patches/mobile/0041-M-041-open-external-platform-face.patch")
    fail(`3: M-041 patch path mismatch: ${String(entry.patch)}`)
  const targets = Array.isArray(entry.targets) ? (entry.targets as unknown[]).filter((t): t is string => typeof t === "string") : []
  if (targets.length !== 1 || targets[0] !== "packages/app/src/runtime/platform/web.ts")
    fail("3: M-041 targets must be exactly [packages/app/src/runtime/platform/web.ts] (single-file hunk)")
  if (typeof entry.upstreamBaseline !== "string" || !entry.upstreamBaseline)
    fail("3: M-041 entry must retain a non-empty upstreamBaseline")

  const vendorManifest = JSON.parse(await read(VENDOR_MANIFEST)) as { mobilePatches?: unknown }
  const paths = Array.isArray(vendorManifest.mobilePatches)
    ? (vendorManifest.mobilePatches as unknown[]).filter((value): value is string => typeof value === "string")
    : []
  if (!paths.includes("patches/mobile/0041-M-041-open-external-platform-face.patch"))
    fail("3: vendor-manifest mobilePatches lost the M-041 path")

  // WITNESS: the exact 39=39 chain count + path-for-path agreement is the
  // MASTER lock of verify-about-version group 6 / verify-attachments-artifacts
  // group 6 / verify-commands-menus group 8 (same-commit backfill). This probe
  // deliberately does not re-count the chain.
  if (!JSON.stringify(entry).includes("issue #76"))
    fail("3: M-041 registration lost the issue #76 attribution")
}

console.log(
  "verify-open-external: PASS (" +
    "1: JS face — upstream canParse + protocol gates verbatim, M-041 bridge-call shape + marker, web.ts zero window.open negative, FilesPort exactly four members + stub false + client never-throw fail-closed shapes + op union + timeout anchor untouched; " +
    "2: native face — ExternalOpenPolicy JVM purity + six gates (strict parse, http/https-only mailto delta, userinfo, host, port range, 2048) + Decision enum, FilesBridge exactly-four-op set + dispatch + ACTION_VIEW-from-accepted-string + no-handler capture + {opened} body + LENGTH_SHORT fixed-string Toast + zero-value-log negative, en-only fixed copy + no values-zh negative, MainActivity zero wiring negative, manifest witness zero VIEW/scheme/QUERY_ALL_PACKAGES (first locks verify-pairing groups 3/4/6 NOT re-locked); " +
    "3: registration — M-041 dual registration with targets exactly [web.ts] + baseline + issue #76 attribution (39=39 chain count is the master lock of verify-about-version/attachments-artifacts/commands-menus, witnessed not re-locked); " +
    "STATIC check — allowed-domain hand-off, refused-domain Toast, mailto delta Toast and no-handler path on a device are QA-1/QA-2/QA-3/QA-4 registered in docs/build-and-verify.md issue #76; the JVM decision matrix (ExternalOpenPolicyTest) is the policy behavioral lower bound)",
)
