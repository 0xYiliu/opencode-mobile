#!/usr/bin/env bun
// license-audit.ts — generate NOTICE-THIRD-PARTY.md from the installed dependency set and
// stop on unknown or copyleft licenses (mobile AGENTS.md: license contamination halts delivery
// and becomes a user decision; nothing is merged silently).
//
// Scope: every package recorded in the root bun.lock resolution (npm + git dependencies,
// including the vendored upstream workspace packages). Metadata source: package.json files
// inside the bun install store (node_modules/.bun) — authoritative for what we actually ship.
//
// Usage: bun run scripts/license-audit.ts
// Exit codes: 0 = all licenses permissive and known (NOTICE written)
//             1 = unknown or copyleft licenses found (NOTICE not updated; list printed)
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(import.meta.dir, "..")
const STORE = join(ROOT, "node_modules", ".bun")
const LOCK = join(ROOT, "bun.lock")
const OUT = join(ROOT, "vendor", "upstream", "NOTICE-THIRD-PARTY.md")

// Licenses acceptable for redistribution in an app NOTICE with attribution. Compared
// case-insensitively (PERMISSIVE_CANONICAL).
const PERMISSIVE = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSD-Source-Code",
  "0BSD",
  "Zlib",
  "Unlicense",
  "CC0-1.0",
  "WTFPL",
  "BlueOak-1.0.0",
  "Python-2.0",
  "CC-BY-4.0",
  "CC-BY-3.0",
  "OFL-1.1",
  "OFL-1.0",
  "Artistic-2.0",
  "MS-PL",
  "Unicode-3.0",
  "Unicode-DFS-2016",
  "MPL-1.1",
])
const PERMISSIVE_CANONICAL = new Set([...PERMISSIVE].map((id) => id.toUpperCase()))

// Weak/strong copyleft and unknown-required licenses stop the audit for a user decision.
const STOP_PATTERNS: Array<[RegExp, string]> = [
  [/GPL/i, "GPL (copyleft)"],
  [/LGPL/i, "LGPL (weak copyleft)"],
  [/AGPL/i, "AGPL (strong copyleft)"],
  [/MPL/i, "MPL (weak copyleft)"],
  [/SSPL/i, "SSPL"],
  [/EUPL/i, "EUPL (copyleft)"],
  [/CECILL/i, "CECILL (copyleft)"],
  [/OSL|RSCPL|IPL/i, "copyleft-style"],
]

type Pkg = { name: string; version: string; license: string | string[] | undefined; path: string }

function licenseIds(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  const s = Array.isArray(raw) ? raw.join(" OR ") : raw
  // Split common SPDX-ish expressions ("MIT OR Apache-2.0", "(MIT OR CC0-1.0) AND ISC").
  return s
    .replace(/[()]/g, " ")
    .split(/\b(?:OR|AND|WITH[^+]*)\b|,/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && /^[A-Za-z0-9.-]+$/.test(t))
}

function isPermissive(ids: string[]): boolean {
  if (ids.length === 0) return false
  // SPDX identifiers are canonical-cased, but package.json authors write them in any case
  // (e.g. "apache-2.0"); compare case-insensitively against the allowlist.
  return ids.every((id) => PERMISSIVE_CANONICAL.has(id.toUpperCase()))
}

function stopReason(ids: string[]): string | undefined {
  for (const id of ids) {
    for (const [re, label] of STOP_PATTERNS) {
      if (re.test(id)) return `${id} (${label})`
    }
  }
  return undefined
}

// Collect every installed package: node_modules/.bun/<store-key>/node_modules/<name>/package.json
const pkgs = new Map<string, Pkg>()
if (!existsSync(STORE)) {
  console.error(`license-audit: install store missing at ${STORE} — run bun install first`)
  process.exit(1)
}
for (const entry of readdirSync(STORE)) {
  const inner = join(STORE, entry, "node_modules")
  if (!existsSync(inner)) continue
  for (const scope of readdirSync(inner)) {
    const candidates = scope.startsWith("@")
      ? readdirSync(join(inner, scope)).map((n) => join(scope, n))
      : [scope]
    for (const name of candidates) {
      const manifestPath = join(inner, name, "package.json")
      if (!existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
        const key = `${manifest.name}@${manifest.version}`
        if (!pkgs.has(key)) {
          pkgs.set(key, {
            name: manifest.name,
            version: manifest.version,
            license: manifest.license ?? manifest.licenses,
            path: relative(ROOT, manifestPath),
          })
        }
      } catch (err) {
        console.error(`license-audit: unreadable manifest ${manifestPath}: ${err}`)
      }
    }
  }
}

// The vendored workspace packages (upstream MIT) are not in the store; record them explicitly.
const vendorPackagesDir = join(ROOT, "vendor", "upstream", "packages")
const lockSha = createHash("sha256").update(readFileSync(LOCK)).digest("hex")
for (const name of readdirSync(vendorPackagesDir)) {
  const manifestPath = join(vendorPackagesDir, name, "package.json")
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  pkgs.set(`${manifest.name}@workspace`, {
    name: manifest.name,
    version: `workspace (upstream pin)`,
    license: manifest.license ?? "MIT",
    path: relative(ROOT, manifestPath),
  })
}

console.log(`license-audit: auditing ${pkgs.size} packages (lock sha256 ${lockSha.slice(0, 12)}...)`)

const byLicense = new Map<string, string[]>()
const problems: string[] = []
for (const pkg of [...pkgs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const ids = licenseIds(pkg.license)
  if (ids.length === 0) {
    problems.push(`UNKNOWN license: ${pkg.name}@${pkg.version} (no license field) — ${pkg.path}`)
    continue
  }
  // The allowlist is checked first: an allowlisted weak-copyleft id (MPL-1.1) must not be
  // shadowed by the stop patterns below — review correction N7b, output unchanged.
  if (isPermissive(ids)) {
    const label = ids.join(" OR ")
    byLicense.set(label, [...(byLicense.get(label) ?? []), `${pkg.name}@${pkg.version}`])
    continue
  }
  const reason = stopReason(ids)
  if (reason) {
    problems.push(`COPYLEFT/STOP: ${pkg.name}@${pkg.version} license ${reason} — ${pkg.path}`)
    continue
  }
  problems.push(`UNRECOGNIZED license: ${pkg.name}@${pkg.version} ${JSON.stringify(pkg.license)} — ${pkg.path}`)
}

if (problems.length > 0) {
  console.error(`license-audit: STOP — ${problems.length} package(s) need a user decision:`)
  for (const p of problems) console.error("  " + p)
  process.exit(1)
}

// Generate the notice.
const lines: string[] = []
lines.push(`# NOTICE — third-party software`)
lines.push("")
lines.push(`Generated by \`scripts/license-audit.ts\` from the dependency set recorded in the root`)
lines.push(`\`bun.lock\` (sha256 \`${lockSha}\`). Do not edit by hand; regenerate after dependency changes.`)
lines.push("")
lines.push(`The vendored upstream code (\`vendor/upstream/\`) is MIT-licensed; see \`vendor/upstream/LICENSE\`.`)
lines.push(`This product also uses the following third-party packages:`)
lines.push("")
let count = 0
for (const license of [...byLicense.keys()].sort()) {
  const members = (byLicense.get(license) ?? []).sort()
  count += members.length
  lines.push(`## ${license} (${members.length} package${members.length === 1 ? "" : "s"})`)
  lines.push("")
  for (const m of members) lines.push(`- ${m}`)
  lines.push("")
}
lines.push(`Full license texts are distributed inside the installed packages under \`node_modules/\``)
lines.push(`and in the build inputs under \`vendor/upstream/packages/\`.`)
lines.push("")

mkdirSync(join(ROOT, "vendor", "upstream"), { recursive: true })
await Bun.write(OUT, lines.join("\n"))
console.log(`license-audit: OK — ${count} permissively licensed packages written to ${relative(ROOT, OUT)}`)
