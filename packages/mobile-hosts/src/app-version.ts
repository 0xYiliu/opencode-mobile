// issue #72: the mobile application version as a build-time constant.
//
// Single source of truth for the version the About page (M-040) presents as THIS app's
// version through the platform.version seam (entry.tsx createWebPlatform(MOBILE_APP_VERSION)).
// Three-way sync contract, probe-locked by scripts/verify-about-version.ts:
//   MOBILE_APP_VERSION == android/app/build.gradle.kts defaultConfig.versionName
//                     == packages/mobile-hosts/package.json "version".
//
// Build-time constant by design: the Android shell exposes no version runtime bridge (the
// MainActivity bridges are vault/probe/ssh/svcops/files/notifications + bootstrap), and a
// purely static display value does not justify widening the bridge surface.
//
// This is the MOBILE APP version — distinct from the vendored upstream base version
// (vendor/upstream/packages/app/package.json "version", shown on its own About row) and
// from the connected server version (/api/info via ServerHealth, shown on its own About row
// with explicit degradation strings). See the issue #72 alignment record (E27).

export const MOBILE_APP_VERSION = "0.1.0"
