// Health wrapper (issue #3): closes the "incompatible" gap for SSH hosts on the web build.
//
// Upstream facts (verified against the pin):
// - packages/app/src/runtime/server/health.ts maps an extension's `state === "incompatible"`
//   to ServerHealth.incompatible, which drives the upstream IncompatibleServerPanel.
// - For direct http servers the web `checkServerHealth` never sets `incompatible` — the
//   version comparison lives in the desktop extension main, not in the web closure.
//
// Binary split (docs/design/units/connection.md):
// - SSH hosts: OUR state machine decides incompatible with the explicit rule below.
// - Direct http: never incompatible here (upstream web native behavior; if the product ever
//   wants it, that is issue #5, not silently added here).

/** Mirror of packages/app/src/runtime/server/health.ts ServerHealth. */
export interface HealthLike {
  healthy: boolean
  version?: string
  incompatible?: boolean
  checking?: boolean
  unauthorized?: boolean
}

export type ParsedVersion = { major: number; minor: number; patch: number }

/** Parse `MAJOR.MINOR.PATCH` (leading "v" tolerated). Undefined when unparseable. */
export function parseServerVersion(version?: string): ParsedVersion | undefined {
  if (!version) return undefined
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!match) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) return undefined
  return { major, minor, patch }
}

/**
 * Compatibility predicate for OpenCode servers reported through SSH (our own rule — the
 * upstream web closure has no reusable predicate; the desktop extension only checks exact
 * CLI-binary versions it installs itself).
 *
 * Rule: major must equal 2 and minor must be >= 1 (the vendored app is 2.1.x); the patch
 * number does not participate. A missing or unparseable version yields undefined — we do
 * not claim incompatibility we cannot judge; such servers surface via healthy/failed paths.
 */
export function isCompatibleServerVersion(version?: string): boolean | undefined {
  const parsed = parseServerVersion(version)
  if (!parsed) return undefined
  return parsed.major === 2 && parsed.minor >= 1
}

/**
 * Whether a host of `kind` should surface as incompatible.
 * - kind "ssh": true only when the reported version parses and fails the rule above.
 * - kind "direct": always false (upstream web native behavior; gap tracked as issue #5).
 */
export function assessIncompatible(input: { kind: "ssh" | "direct"; version?: string }): boolean {
  if (input.kind === "direct") return false
  return isCompatibleServerVersion(input.version) === false
}
