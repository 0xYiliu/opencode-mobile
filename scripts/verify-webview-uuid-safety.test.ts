import { expect, test } from "bun:test"
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

/**
 * verify-webview-uuid-safety — locks the #199 webview crypto.randomUUID invariants (issue #199).
 *
 * Upstream v2.2.7 uses crypto.randomUUID in gui-plugins code paths that are main-side only
 * (electron main / node host). On the mobile web payload those paths must never reach the
 * renderer bundle: the WebView lacks a secure-context guarantee for crypto.randomUUID, so a
 * bare renderer-side call would throw at runtime (issue #194 recorded the secure-context
 * prerequisite; upstream fef232392d already gates renderer-side usage behind feature-detected
 * fallbacks, which is the form the shipped dist keeps — 18 occurrences, all fallbacks).
 *
 * (a) SOURCE-LEVEL, GRAPH-DERIVED (not a hand list): the static import closure of the renderer
 *     entry faces must contain ZERO randomUUID call sites — neither the bare
 *     `crypto.randomUUID(` form nor the `import { randomUUID } from "node:crypto"` named form
 *     used by the main-side trio (ssh/askpass, wsl/servers, wsl/sidecar). The closure is
 *     computed here by walking relative static imports from the faces; bare package specifiers
 *     are external boundaries; dynamic `import(...)` targets are NOT followed — that is exactly
 *     the documented lazy chain the design relies on (the browser-domain randomUUID sites are
 *     reachable only through browser/main.ts, which is main-side and statically imports the
 *     browser/{chromium,diagnostics,files,pane,profiling} cluster; no renderer-reachable module
 *     does).
 * (b) CONFINED-SET EQUIVALENCE: every randomUUID-bearing file under gui-plugins/src outside
 *     *.test.ts must be exactly the documented FULL inventory {browser/{chromium,diagnostics,
 *     files,pane,profiling}, ssh/askpass, wsl/{servers,sidecar}} — asserted in both directions
 *     (no unknown bearer, no empty inventory member) with the per-file call-form shape pinned.
 *     packages/client/src/pty-handoff.ts:56 also uses randomUUID but sits outside the webview
 *     payload graph (node-side pty handoff, not imported by any renderer-reachable module) and
 *     outside this package's scope.
 * (c) DIST-LEVEL: the staged Android web assets (android/app/src/main/assets/web, produced by
 *     build:web + copy:web-dist in the same round) must contain NONE of the 4 main-side module
 *     path markers — if the main-side files were ever bundled, their sourcemap `sources` would
 *     carry these paths. Skipped with a message when the assets are not staged yet (fresh
 *     worktree before the first build); a hard assertion on every staged run.
 */

const root = fileURLToPath(new URL("..", import.meta.url))
const guiPluginsSrc = path.join(root, "vendor/upstream/packages/gui-plugins/src")
const pluginGui = path.join(root, "vendor/upstream/packages/plugin/src/gui")

// Documented FULL inventory of randomUUID-bearing files in gui-plugins/src (non-test), with the
// expected per-file call-form shape from the #199 audit: the browser-domain cluster uses the
// bare `crypto.randomUUID(` form; the main-side trio uses `import { randomUUID } from
// "node:crypto"` and the named call form.
const CONFINED: Record<string, { bare: number; named: number }> = {
  "browser/chromium.ts": { bare: 1, named: 0 },
  "browser/diagnostics.ts": { bare: 1, named: 0 },
  "browser/files.ts": { bare: 2, named: 0 },
  "browser/pane.ts": { bare: 3, named: 0 },
  "browser/profiling.ts": { bare: 3, named: 0 },
  "ssh/askpass.ts": { bare: 0, named: 2 },
  "wsl/servers.ts": { bare: 0, named: 2 },
  "wsl/sidecar.ts": { bare: 0, named: 1 },
}

// The 4 main-side module markers that must never appear in the staged web payload.
const MAIN_SIDE_MARKERS = ["src/browser/main", "src/ssh/askpass", "src/wsl/servers", "src/wsl/sidecar"]

const BARE_CALL = /\bcrypto\s*\.\s*randomUUID\s*\(/g
const NAMED_IMPORT = /import\s*\{[^{}]*\brandomUUID\b[^{}]*\}\s*from/g
const NAMED_CALL = /\brandomUUID\s*\(/g

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) out.push(...listSources(full))
    else out.push(full)
  }
  return out
}

// Static relative-import closure. Only `import ... from "./x"` / `export ... from "./x"` with a
// relative specifier are followed (type-only imports skipped: no runtime edge). Bare specifiers
// and dynamic import() are boundaries by design; dynamic targets are the documented lazy chain.
// Asset imports (`.css?inline` and friends) resolve to their file and are scanned but never
// contain code.
function staticClosure(entry: string, withinDir: string): { files: Set<string>; externals: Set<string> } {
  const files = new Set<string>()
  const externals = new Set<string>()
  const queue = [entry]
  const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[\s\S]*?from\s*["']([^"']+)["']/g
  const SIDE_EFFECT_RE = /(?:^|\n)\s*import\s*["']([^"']+)["']/g
  while (queue.length > 0) {
    const current = queue.pop()!
    if (files.has(current)) continue
    files.add(current)
    const text = readFileSync(current, "utf8")
    const specs: string[] = []
    for (const m of text.matchAll(IMPORT_RE)) {
      if (m[1] === "type ") continue
      specs.push(m[2])
    }
    for (const m of text.matchAll(SIDE_EFFECT_RE)) specs.push(m[1])
    for (const spec of specs) {
      if (!spec.startsWith(".")) {
        externals.add(spec)
        continue
      }
      const [stripped, query] = spec.split("?", 2)
      const base = path.resolve(path.dirname(current), stripped)
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]
      // TypeScript-style ".js" specifiers resolve to the ".ts"/".tsx" source file
      if (stripped.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`)
      const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile())
      if (!hit) throw new Error(`unresolved relative import ${spec} from ${current}`)
      if (!hit.endsWith(".ts") && !hit.endsWith(".tsx") && !query) {
        externals.add(spec) // non-code asset without an inlining query: boundary
        continue
      }
      if (!hit.startsWith(withinDir)) {
        externals.add(spec)
        continue
      }
      if (!files.has(hit)) queue.push(hit)
    }
  }
  return { files, externals }
}

function hitsOf(text: string): { bare: number; namedImport: number; namedCall: number } {
  return {
    bare: [...text.matchAll(BARE_CALL)].length,
    namedImport: [...text.matchAll(NAMED_IMPORT)].length,
    namedCall: [...text.matchAll(NAMED_CALL)].length,
  }
}

test("renderer import closure (graph-derived) contains zero randomUUID call sites", () => {
  const rendererEntry = path.join(guiPluginsSrc, "renderer.ts")
  const builtinEntry = path.join(pluginGui, "builtin.ts")
  expect(existsSync(rendererEntry)).toBe(true)
  expect(existsSync(builtinEntry)).toBe(true)

  const closure = new Set<string>()
  for (const [entry, within] of [
    [rendererEntry, guiPluginsSrc],
    [builtinEntry, pluginGui],
  ] as const) {
    const walked = staticClosure(entry, within)
    for (const f of walked.files) closure.add(f)
  }

  const offenders: string[] = []
  for (const file of closure) {
    const h = hitsOf(readFileSync(file, "utf8"))
    if (h.bare > 0 || h.namedImport > 0 || h.namedCall > 0) offenders.push(`${file} bare=${h.bare} namedImport=${h.namedImport} namedCall=${h.namedCall}`)
  }
  expect(
    offenders,
    `the renderer import closure gained a randomUUID call site — the WebView lacks the secure-context ` +
      `guarantee crypto.randomUUID needs; gate it behind a feature-detected fallback or keep it main-side ` +
      `(issue #199 / #194 secure-context prerequisite): ${offenders.join("; ")}`,
  ).toEqual([])
  // witness: the walk is real, not a degenerate empty set
  expect(closure.size).toBeGreaterThan(50)
})

test("randomUUID inventory outside the closure is exactly the documented confined set", () => {
  const observed = new Map<string, { bare: number; named: number }>()
  for (const file of listSources(guiPluginsSrc)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
    const rel = path.relative(guiPluginsSrc, file)
    if (/\.test\.tsx?$/.test(rel)) continue // test files are exempt (happy-dom/unit fixtures)
    const text = readFileSync(file, "utf8")
    const bare = [...text.matchAll(BARE_CALL)].length
    const namedImports = [...text.matchAll(NAMED_IMPORT)].length
    const named = namedImports > 0 ? [...text.matchAll(NAMED_CALL)].length : 0
    if (bare > 0 || named > 0) observed.set(rel, { bare, named })
  }
  const unknown = [...observed.keys()].filter((k) => !(k in CONFINED))
  const missing = Object.keys(CONFINED).filter((k) => !observed.has(k))
  expect(
    unknown,
    `unknown randomUUID-bearing file(s) appeared in gui-plugins/src outside the documented confined set ` +
      `(browser/{chromium,diagnostics,files,pane,profiling}, ssh/askpass, wsl/{servers,sidecar}) — extend the ` +
      `inventory with a reachability note or remove the usage (issue #199): ${unknown.join(", ")}`,
  ).toEqual([])
  expect(
    missing,
    `documented inventory member(s) no longer bear randomUUID — update the confined set (issue #199): ${missing.join(", ")}`,
  ).toEqual([])
  for (const [rel, counts] of observed) {
    expect(counts, `${rel} call-form shape drifted from the #199 audit`).toEqual(CONFINED[rel])
  }
})

test("staged web payload contains none of the 4 main-side module markers", () => {
  const assets = path.join(root, "android/app/src/main/assets/web")
  let staged: string[] = []
  if (existsSync(assets)) staged = listSources(assets)
  if (staged.length === 0) {
    console.log(
      "SKIP(dist): staged assets not present yet — run `bun run build:web` + `bun run copy:web-dist` " +
        "and re-run this probe; the dist-level assertion hard-fails on every staged run after staging.",
    )
    return
  }
  const offenders: string[] = []
  for (const file of staged) {
    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue // binary asset
    }
    for (const marker of MAIN_SIDE_MARKERS) {
      if (text.includes(marker)) offenders.push(`${file} contains ${marker}`)
    }
  }
  expect(
    offenders,
    `the staged web payload carries main-side module code (sourcemap sources) that must stay out of the ` +
      `renderer bundle — the main-side randomUUID inventory must not ship to the WebView (issue #199): ` +
      `${offenders.join("; ")}`,
  ).toEqual([])
})
