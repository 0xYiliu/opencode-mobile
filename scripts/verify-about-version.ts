// verify-about-version.ts — static probe for issue #72 (S39: About page version
// displays alignment, patch M-040).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf… + mobile patches
// M-001..M-052, M-019/M-039 reserved-absent), the structural facts
// the S39 alignment record (E27) relies on. Dual-track delivery, registered separately:
//
//   Track 1 (upstream alignment — the last v2.2.1 target-face gap closed verbatim):
//   1. Notices scroll face: notices/dialog.tsx carries the v2.2.1 (3ebcf9a) face verbatim —
//      div.settings-notices-scroll[data-scrollable] replacing the ScrollView wrapper (open
//      and close tags), the ScrollView import GONE (zero ScrollView tokens in the file);
//      settings.css gains exactly the enabling v2.2.1 line `overflow-y: auto` inside
//      .settings-notices-scroll — and the M-040 patch adds exactly one line / removes zero
//      lines in settings.css (the v2.2.1 file's remaining 100+ line delta must NOT ride in).
//
//   Track 2 (baseline intent — the mobile version face, a registered first-party delta,
//   NOT an upstream form; upstream v2.2.1 has no base/server version rows):
//   2. Version face (about.tsx): the upstream platform.version row kept verbatim; the base
//      row backed by the vendored packages/app package.json import; the server row via the
//      upstream public useServerCollectionController with the MAJOR-1 contract — the shown
//      server is the FIRST entry of the sorted collection (sortServerConnections ranks
//      healthy-first over the full list INCLUDING hidden hosts; single-host equivalent;
//      multi-host shows only the first sorted entry, registered boundary, the complete
//      per-server face lives in the servers settings rows), health keyed by
//      ServerConnection.key(item); explicit degradation: no collection entry -> row not
//      rendered; entry undefined (not yet established) or checking -> the checking key;
//      unauthorized / unhealthy / healthy-but-version-missing-or-not-presentable -> the
//      unavailable key; settings-about-versions[data-component] anchor present.
//   3. Three-way version sync (first-party): MOBILE_APP_VERSION (packages/mobile-hosts/
//      src/app-version.ts) == android/app/build.gradle.kts defaultConfig.versionName ==
//      packages/mobile-hosts/package.json "version"; the constant is exported from the
//      package index and injected at the entry (createWebPlatform(MOBILE_APP_VERSION)).
//   4. i18n: en.ts carries EXACTLY the four new keys (upstreamVersion +
//      serverVersion.version/checking/unavailable) and no other serverVersion key; zh/zht
//      carry ZERO new keys; the language.tsx en-base-first fallback chain anchors are
//      verbatim (base = flatten({ ...en, ...dict }); merge spreads ...base first) — non-en
//      locales fall back to the English strings (registered en-only lineage, #63-#70).
//   5. Negative boundaries: entry.tsx keeps the Sentry release line on pkg.version VERBATIM
//      and keeps the pkg import (pkg has no other consumer after the substitution — the
//      Sentry fallback is the remaining one); shell/errors/error.tsx keeps both
//      platform.version consumers verbatim (:275/:422 at generation time); runtime/plugin/
//      host-apis.tsx keeps ctx.app.version = platform.version ?? "" verbatim (:307 at
//      generation time) — second-order effect registered in E27 (mobile-reachable consumer
//      is only the updater What's New read watermark, S40/E24 in-registry, no version
//      comparison); settings/search-catalog.ts about row VERBATIM (MINOR-1 two-condition
//      lock: (a) the row `{ tab: "about", … keywords: "version license credits" }` and
//      (b) search-catalog.ts is NOT among the M-040 patch targets — the file's ~88-line
//      delta vs the pin is other patches' work, so a file-level equality gate would be
//      wrong; the ROW is the contract); the M-040 patch touches EXACTLY the five files;
//      the M-036..M-038 faces (gui-plugins btw renderer/i18n, goal panels) show zero
//      spill from this unit.
//   6. Manifest dual registration: manifest.json has an M-040 entry with the exact patch
//      path, the five targets and a non-empty upstreamBaseline; vendor-manifest.json
//      mobilePatches lists the same path; both registries hold exactly 52 entries (52=52 after M-053; 50=50
//      since issue #109's M-052, re-verified by issue #110) and agree path-for-path.
//
// HONEST BOUNDARY (same tradition as the verify-* family): this is a static STRUCTURE
// check. It proves source shape, NOT runtime behavior: the actual three-row rendering,
// the server-version degradation transitions (checking -> version / unavailable),
// notices scrolling inside the WebView and the zh fallback presentation are device QA
// items (registered in docs/build-and-verify.md, issue #72 section, pending). Tree
// byte-equivalence itself is V3 verify-closure, which must be run alongside this probe.
//
// Usage:
//   bun run scripts/verify-about-version.ts
// Exit 0 = all assertions PASS.

import { parse } from "node:path"

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-about-version: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const HOSTS = "packages/mobile-hosts/"
const PATCH = "vendor/upstream/patches/mobile/0040-M-040-about-version-face.patch"
const MANIFEST = "vendor/upstream/patches/mobile/manifest.json"
const VENDOR_MANIFEST = "vendor/upstream/vendor-manifest.json"

const M040_TARGETS = [
  "packages/app/src/settings/about/notices/dialog.tsx",
  "packages/app/src/settings/settings.css",
  "packages/app/src/settings/about/about.tsx",
  "packages/app/src/entry.tsx",
  "packages/app/src/runtime/i18n/en.ts",
]

// --- 1. Notices v2.2.1 verbatim face (track 1) ---
{
  const dialog = await read(`${APP}src/settings/about/notices/dialog.tsx`)

  if (!dialog.includes('<div class="settings-notices-scroll" data-scrollable>'))
    fail("1: dialog.tsx lost the v2.2.1 data-scrollable open tag")
  if (dialog.includes("ScrollView"))
    fail("1: dialog.tsx still carries a ScrollView token (import or wrapper must be gone)")
  if (!dialog.includes(`import { useLanguage } from "@/runtime/i18n/language"`))
    fail("1: dialog.tsx lost the upstream import block anchor")

  const css = await read(`${APP}src/settings/settings.css`)
  const block = css.slice(css.indexOf(".settings-notices-scroll {"), css.indexOf(".settings-notices {"))
  if (!block.includes("  overflow-y: auto;"))
    fail("1: settings.css .settings-notices-scroll lost the v2.2.1 enabling line overflow-y: auto")

  // R6 guard: the M-040 patch adds exactly ONE line and removes ZERO lines in settings.css
  // (the v2.2.1 file's remaining delta must not ride in).
  const patch = await read(PATCH)
  const cssDiff = patch
    .slice(patch.indexOf("diff --git a/packages/app/src/settings/settings.css"))
    .replace(/^diff --git[^\n]*\n/, "")
    .split("\ndiff --git")[0]
  const cssPlus = cssDiff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
  const cssMinus = cssDiff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"))
  if (cssPlus.length !== 1 || cssPlus[0] !== "+  overflow-y: auto;")
    fail(`1: M-040 settings.css hunk must add exactly one line (+  overflow-y: auto;), got ${cssPlus.length} added`)
  if (cssMinus.length !== 0)
    fail(`1: M-040 settings.css hunk must remove zero lines, got ${cssMinus.length} removed`)
}

// --- 2. Version face (about.tsx, track 2) ---
{
  const about = await read(`${APP}src/settings/about/about.tsx`)

  // The upstream platform.version row stays verbatim.
  if (!about.includes(`version: platform.version ?? language.t("settings.about.devVersion"),`))
    fail("2: about.tsx lost the upstream platform.version row (must stay verbatim)")

  // Base row backed by the vendored package.json import.
  if (!about.includes(`import pkg from "../../../package.json"`))
    fail("2: about.tsx lost the vendored package.json import for the base row")
  if (!about.includes(`language.t("settings.about.upstreamVersion", { version: pkg.version })`))
    fail("2: about.tsx lost the upstreamVersion base row")

  // Server row: upstream public controller + MAJOR-1 contract anchors.
  if (!about.includes(`import { useServerCollectionController } from "@/servers/registry/controller"`))
    fail("2: about.tsx lost the useServerCollectionController import")
  if (!about.includes(`servers.collection.items()[0]`))
    fail("2: about.tsx lost the first-sorted-entry read (collection.items()[0])")
  if (!about.includes(`servers.collection.health()[ServerConnection.key(item)]`))
    fail("2: about.tsx lost the ServerConnection.key(item) health key derivation (MAJOR-1 anchor)")

  // Degradation branches, all explicit.
  if (!about.includes(`if (!item) return undefined`))
    fail("2: about.tsx lost the zero-entry no-render branch")
  if (!about.includes(`if (!health || health.checking) return language.t("settings.about.serverVersion.checking")`))
    fail("2: about.tsx lost the checking/unestablished degradation branch")
  if (!about.includes(`health.unauthorized || !health.healthy || !presentableVersion(health.version)`))
    fail("2: about.tsx lost the unavailable degradation branch")
  if (!about.includes(`language.t("settings.about.serverVersion.version", { version: health.version })`))
    fail("2: about.tsx lost the presentable-version branch")

  // Anchor + non-empty-string guard helper.
  if (!about.includes(`<div class="settings-about-versions" data-component="settings-about-versions">`))
    fail("2: about.tsx lost the settings-about-versions anchor")
  if (!about.includes(`return typeof value === "string" && value.length > 0`))
    fail("2: about.tsx lost the presentableVersion non-empty-string guard")
}

// --- 3. Three-way version sync (first-party) ---
{
  const constant = await read(`${HOSTS}src/app-version.ts`)
  const gradle = await read("android/app/build.gradle.kts")
  const pkgJson = JSON.parse(await read(`${HOSTS}package.json`)) as { version?: unknown }

  const constMatch = constant.match(/export const MOBILE_APP_VERSION = "([^"]+)"/)
  if (!constMatch) fail("3: app-version.ts lost the MOBILE_APP_VERSION constant export")
  const gradleMatch = gradle.match(/versionName = "([^"]+)"/)
  if (!gradleMatch) fail("3: build.gradle.kts lost versionName")

  const appVersion = constMatch![1]!
  if (appVersion !== gradleMatch![1])
    fail(`3: three-way sync broken: MOBILE_APP_VERSION=${appVersion} != gradle versionName=${gradleMatch![1]}`)
  if (appVersion !== pkgJson.version)
    fail(`3: three-way sync broken: MOBILE_APP_VERSION=${appVersion} != mobile-hosts package.json=${String(pkgJson.version)}`)

  // Exported from the package index; injected at the entry.
  const index = await read(`${HOSTS}src/index.ts`)
  if (!index.includes(`export { MOBILE_APP_VERSION } from "./app-version"`))
    fail("3: mobile-hosts index.ts lost the MOBILE_APP_VERSION export")
  const entry = await read(`${APP}src/entry.tsx`)
  if (!entry.includes("createWebPlatform(MOBILE_APP_VERSION)"))
    fail("3: entry.tsx does not inject MOBILE_APP_VERSION into createWebPlatform")
}

// --- 4. i18n: exactly four en keys, zh/zht zero, fallback chain anchors ---
{
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  const newKeys = [
    `"settings.about.upstreamVersion": "Upstream OpenCode {{version}}"`,
    `"settings.about.serverVersion.version": "Server OpenCode {{version}}"`,
    `"settings.about.serverVersion.checking": "Checking server version…"`,
    `"settings.about.serverVersion.unavailable": "Server version unavailable"`,
  ]
  for (const key of newKeys) if (!en.includes(key)) fail(`4: en.ts lost the key line ${key}`)
  if ((en.match(/settings\.about\.serverVersion\./g) ?? []).length !== 3)
    fail("4: en.ts must carry exactly three settings.about.serverVersion.* keys")
  if ((en.match(/settings\.about\.upstreamVersion/g) ?? []).length !== 1)
    fail("4: en.ts must carry exactly one settings.about.upstreamVersion key")

  for (const locale of ["zh", "zht"]) {
    const dict = await read(`${APP}src/runtime/i18n/${locale}.ts`)
    if (dict.includes("settings.about.serverVersion") || dict.includes("settings.about.upstreamVersion"))
      fail(`4: ${locale}.ts carries new M-040 keys (must stay zero — en-only lineage, fallback via language.tsx)`)
  }

  // Fallback chain anchors verbatim: en is the base, non-en merges spread base first.
  const language = await read(`${APP}src/runtime/i18n/language.tsx`)
  if (!language.includes("const base = flatten({ ...en, ...dict })"))
    fail("4: language.tsx lost the en-base-first anchor (const base = flatten({ ...en, ...dict }))")
  if (!language.includes("{ ...base, ...flatten({ ...a.dict, ...b.dict }) }"))
    fail("4: language.tsx lost the base-first merge anchor ({ ...base, ...flatten(...) })")
}

// --- 5. Negative boundaries ---
{
  const entry = await read(`${APP}src/entry.tsx`)

  // Sentry release stays pkg.version, upstream verbatim (negative lock).
  if (!entry.includes("release: import.meta.env.VITE_SENTRY_RELEASE ?? `web@${pkg.version}`,"))
    fail("5: entry.tsx lost the verbatim Sentry pkg.version release line (negative lock)")
  if (!entry.includes(`import pkg from "../package.json"`))
    fail("5: entry.tsx lost the pkg import (the Sentry fallback still consumes it)")
  if (entry.includes("createWebPlatform(pkg.version)"))
    fail("5: entry.tsx still injects pkg.version into createWebPlatform (must be MOBILE_APP_VERSION)")

  // Error page + plugin host-apis keep their platform.version consumers verbatim.
  const errorPage = await read(`${APP}src/shell/errors/error.tsx`)
  if (!errorPage.includes("version: platform.version,"))
    fail("5: error.tsx lost the platform.version message consumer (negative lock)")
  if (!errorPage.includes("<Show when={platform.version}>"))
    fail("5: error.tsx lost the platform.version footer gate (negative lock)")
  const hostApis = await read(`${APP}src/runtime/plugin/host-apis.tsx`)
  if (!hostApis.includes(`version: platform.version ?? "",`))
    fail("5: host-apis.tsx lost the ctx.app.version consumer (negative lock, E27)")

  // MINOR-1 two-condition lock on search-catalog.ts: (a) about row verbatim; (b) file not
  // in the M-040 touch set (asserted with the touch face below). The ~88-line file delta
  // vs the pin is other patches' work — a file-level equality gate would be wrong here.
  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  if (!catalog.includes(`{ tab: "about", label: "settings.tab.about", keywords: "version license credits" },`))
    fail("5: search-catalog.ts lost the verbatim about row")

  // M-040 touch face: exactly the five declared files, no sixth file.
  const patch = await read(PATCH)
  const touched = [...patch.matchAll(/^diff --git a\/(.+) b\/\1$/gm)].map((m) => m[1])
  if (touched.length !== M040_TARGETS.length)
    fail(`5: M-040 patch must touch exactly ${M040_TARGETS.length} files, diff carries ${touched.length}`)
  for (const target of M040_TARGETS)
    if (!touched.includes(target)) fail(`5: M-040 patch is missing the declared target ${target}`)
  for (const file of touched)
    if (!M040_TARGETS.includes(file!)) fail(`5: M-040 patch touches undeclared file ${file}`)
  if (touched.includes("packages/app/src/settings/search-catalog.ts"))
    fail("5: M-040 patch must NOT touch search-catalog.ts (MINOR-1 condition b)")

  // M-036..M-038 faces show zero spill from this unit.
  const btwRenderer = await read("vendor/upstream/packages/gui-plugins/src/btw/renderer.tsx")
  if (!btwRenderer.includes('"mobile.title"') || !btwRenderer.includes('"mobile.none"'))
    fail("5: btw renderer.tsx lost the M-038 mobile face anchors (zero-spill negative)")
  if (!btwRenderer.includes("enabled: mounted()"))
    fail("5: btw renderer.tsx lost the M-038 D3 gate anchor (zero-spill negative)")
  const btwEn = await read("vendor/upstream/packages/gui-plugins/src/btw/i18n/en.ts")
  if (!btwEn.includes('"mobile.title": "Side question"'))
    fail("5: btw i18n/en.ts lost the M-038 keys (zero-spill negative)")
  const guiPluginsRenderer = await read("vendor/upstream/packages/gui-plugins/src/goal/renderer.tsx")
  if (!guiPluginsRenderer.includes("mobile"))
    fail("5: goal renderer.tsx lost its mobile face (M-036 zero-spill negative)")
}

// --- 6. Manifest dual registration (52=52) ---
{
  const manifest = JSON.parse(await read(MANIFEST)) as {
    patches?: Array<{ id?: unknown; patch?: unknown; targets?: unknown; upstreamBaseline?: unknown }>
  }
  const rows = manifest.patches ?? []
  // Issue #109: M-052 (gui-extensions D4 resolution + label disambiguation) -> 50.
  if (rows.length !== 52) fail(`6: patches manifest must register exactly 52 patches (got ${rows.length})`)
  const m040 = rows.filter((row) => row.id === "M-040")
  if (m040.length !== 1) fail("6: patches manifest must carry exactly one M-040 entry")
  const entry = m040[0]!
  if (entry.patch !== "patches/mobile/0040-M-040-about-version-face.patch")
    fail(`6: M-040 patch path mismatch: ${String(entry.patch)}`)
  const targets = Array.isArray(entry.targets) ? (entry.targets as string[]) : []
  if (targets.length !== M040_TARGETS.length || targets.join("\n") !== M040_TARGETS.join("\n"))
    fail(`6: M-040 targets must equal the five declared files (got ${targets.length})`)
  if (typeof entry.upstreamBaseline !== "string" || !entry.upstreamBaseline)
    fail("6: M-040 entry must retain a non-empty upstreamBaseline")

  const vendorManifest = JSON.parse(await read(VENDOR_MANIFEST)) as { mobilePatches?: unknown }
  const paths = Array.isArray(vendorManifest.mobilePatches)
    ? (vendorManifest.mobilePatches as unknown[]).filter((value): value is string => typeof value === "string")
    : []
  if (paths.length !== 52) fail(`6: vendor-manifest mobilePatches must list exactly 52 patches (got ${paths.length})`)
  if (!paths.includes("patches/mobile/0040-M-040-about-version-face.patch"))
    fail("6: vendor-manifest mobilePatches lost the M-040 path")

  // Path-for-path agreement (the 52=52 core).
  const manifestPaths = rows.map((row) => row.patch).filter((value): value is string => typeof value === "string")
  const sortedA = manifestPaths.toSorted()
  const sortedB = paths.toSorted()
  if (sortedA.length !== sortedB.length || sortedA.some((value, index) => value !== sortedB[index]))
    fail("6: the two registries disagree on the patch path set")
}

console.log(
  "verify-about-version: PASS (" +
    "1: notices v2.2.1 verbatim face - data-scrollable div + zero ScrollView tokens + css overflow-y: auto with the M-040 css hunk exactly +1/-0 (R6); " +
    "2: version face - platform.version row verbatim, base row pkg import, server row via useServerCollectionController with first-sorted-entry (hidden-hosts-included, single-host equivalent, MAJOR-1) + ServerConnection.key(item) derivation + no-render/checking/unavailable degradation branches + settings-about-versions anchor + presentableVersion guard; " +
    "3: three-way version sync MOBILE_APP_VERSION == gradle versionName == mobile-hosts package.json + index export + entry injection; " +
    "4: en exactly the four M-040 keys (3 serverVersion + 1 upstreamVersion), zh/zht zero new keys, language.tsx en-base-first fallback anchors verbatim (registered en-only lineage); " +
    "5: negative boundaries - Sentry pkg.version release + pkg import verbatim, createWebPlatform(pkg.version) absent, error.tsx both platform.version consumers, host-apis ctx.app.version, search-catalog about row verbatim AND outside the M-040 touch set (MINOR-1 two-condition: row lock, not file-level - the ~88-line file delta is other patches' work), M-040 touch face exactly the five declared files, btw/goal M-036..038 zero spill; " +
    "6: manifest dual registration 52=52 with M-040 targets/baseline and path-for-path agreement (M-041 by issue #76, M-042..M-044 by issue #101, M-045 by issue #102, M-046 by issue #103, M-047 by issue #104, M-048 by issue #105, M-049 by issue #106, M-050 by issue #107, M-051 by issue #108, M-052 by issue #109; M-019/M-039 reserved-absent); " +
    "STATIC check - row rendering, degradation transitions, notices scrolling and zh fallback presentation are device-QA items registered in docs/build-and-verify.md issue #72; tree byte-equivalence is V3 verify-closure)",
)
