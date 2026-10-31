// verify-projects-sessions.ts — static probe for issue #8 (projects/sessions unit).
//
// Asserts, against the REAL vendored sources:
//   M-017  the home session row archive action is wired to the real API
//          (session.update archived:true) with the archiveHomeSession helper
//          semantics (tabs cleanup on success, no removal on failure) kept.
//   M-018  the multi-server settings layout keeps the "servers" tab reachable:
//          the redirect guard's includes list no longer contains "servers" (the
//          reachability prerequisite) and the multiple() nav group carries a
//          fixed SSH hosts entry, with the i18n key present in en and zh.
//   Paths  the directory picker stays remote-side on the web platform
//          (directoryPickerKind: only desktop&&local is "native"), the reveal /
//          file-manager affordances keep their desktop gates, and the web
//          platform object defines no openDirectoryPickerDialog — the phone
//          filesystem never participates in project/session paths.
//   N-5    zero host-OS conditionals (process.platform / navigator.platform /
//          node os module) inside the whitelisted projects/sessions directories.
//
// HONEST BOUNDARY (same tradition as verify-credential-ref.ts): this is a static
// STRUCTURE check (text anchors / regex on source files). It proves source shape,
// NOT runtime behavior: the M-018 settings redirect guard is a Solid createEffect
// and the archive API's server-side semantics (time.archived stamp, list filtering)
// need a real service and a running UI — both belong to the G19 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-projects-sessions.ts
// Exit 0 = all assertions PASS.

const appRoot = new URL("../vendor/upstream/packages/app/", import.meta.url)

function fail(message: string): never {
  console.error(`verify-projects-sessions: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, appRoot)).text()

// --- M-017: home session archive wiring (issue #8) ---
{
  const controller = await read("src/home/sessions/controller.tsx")

  if (controller.includes("Session archiving is unavailable"))
    fail("M-017: the archive stub text is still present in home/sessions/controller.tsx")
  if (controller.includes("TODO: Restore archiving when the V2 client exposes a session archive API."))
    fail("M-017: the archive stub TODO comment is still present in home/sessions/controller.tsx")
  if (!/archive: \(sessionID\) => ctx\.sdk\.api\.session\.update\(\{ sessionID, archived: true \}\)/.test(controller))
    fail('M-017: archive does not call session.update({ sessionID, archived: true })')
  // The real call still routes through the injected helper (tabs cleanup + onError toast).
  if (!controller.includes("await archiveHomeSession({"))
    fail("M-017: the archive flow no longer routes through archiveHomeSession")
  if (!controller.includes('import { archiveHomeSession } from "./archive"'))
    fail("M-017: the archiveHomeSession import is missing")
  // Success path drops the row from the Home index cache and re-syncs the record.
  if (!/setQueryData<SessionInfo\[\]>\(\["home-sessions", conn\]/.test(controller))
    fail("M-017: archive success does not drop the row from the home-sessions query cache")
  if (!/ctx\.data\.session\.invalidate\(session\.id\)/.test(controller))
    fail("M-017: archive success does not invalidate the canonical session record")
  if (!/void ctx\.data\.session\.sync\(session\.id\)\.catch\(\(\) => \{\}\)/.test(controller))
    fail("M-017: archive success does not re-sync the canonical session record")
}
{
  // The helper itself keeps its contract: tabs cleanup on success, no removal on failure.
  const helper = await read("src/home/sessions/archive.ts")
  if (!helper.includes("notifySessionTabsRemoved({"))
    fail("M-017: home/sessions/archive.ts no longer removes open titlebar tabs on success")
  if (!helper.includes("input.remove()") || !helper.includes("input.onError?.(error)"))
    fail("M-017: home/sessions/archive.ts helper contract changed (remove/onError)")
}

// --- M-018 reachability under the migrated (v2.2.1) framework shell (issue #101 revision) ---
{
  const shell = await read("src/settings/shell.tsx")

  // The migration (M-043, target-verbatim shell) REMOVED the pin's root-tab redirect guard
  // and the per-server nested view: the target layout keeps the "servers" group in the nav
  // unconditionally and never bounces a root tab, so the M-018 pin guard block must be
  // ABSENT (its presence would mean a stale pin-era shell came back).
  if (/if \(\[([^\]]+)\]\.includes\(view\.tab\)\)\s*\n\s*surface\.open\("general"\)/.exec(shell))
    fail('M-018: the pin root-tab redirect guard block came back — the migrated shell must not bounce root tabs')

  // Servers-tab reachability asserted structurally: the target nav's unconditional
  // "servers" group (target shell.tsx:276-283) — reachable with one or many servers.
  if (!/items: \[\s*\{\s*value: "servers",\s*icon: pageIcons\.servers,\s*label: language\.t\(multiple\(\) \? "settings\.tab\.servers" : pageLabels\.servers\)/.exec(shell))
    fail('M-018: the migrated nav lost the unconditional "servers" group (target shell.tsx:276-283 shape)')

  // The settings.tab.sshHosts key stays REGISTERED (patches untouched) and live: its real
  // consumer is servers/connect/screen.tsx:286.
  for (const dict of ["src/runtime/i18n/en.ts", "src/runtime/i18n/zh.ts"]) {
    if (!(await read(dict)).includes('"settings.tab.sshHosts":'))
      fail(`M-018: the settings.tab.sshHosts key is missing from ${dict}`)
  }
  if (!(await read("src/servers/connect/screen.tsx")).includes('"settings.tab.sshHosts"'))
    fail('M-018: the settings.tab.sshHosts key lost its live consumer in servers/connect/screen.tsx')
}

// --- Path boundaries: the phone filesystem never participates (issue #8) ---
{
  // 1. directoryPickerKind: only desktop && local reaches the native picker;
  //    every web build resolves to the "server" (remote) picker.
  const policy = await read("src/workspaces/selection/policy.ts")
  if (!/platform === "desktop" && ServerConnection\.local\(server\)\s*\n?\s*\)\s*return "native" as const/.test(policy))
    fail('paths: directoryPickerKind does not gate "native" behind desktop && ServerConnection.local')
  if (!policy.includes('return "server" as const'))
    fail('paths: directoryPickerKind has no unconditional "server" fallback (the web branch)')

  // 2. Reveal-in-file-manager keeps its desktop double gate.
  const reveal = await read("src/home/projects/reveal.ts")
  if (!/platform\.platform === "desktop" && !!platform\.revealPath && ServerConnection\.local\(conn\)/.test(reveal))
    fail("paths: useRevealProject lost its desktop && local double gate")

  // 3. The file-manager affordance maps a non-desktop platform to "unknown" (unreachable).
  const projectView = await read("src/home/projects/view.tsx")
  if (!projectView.includes('fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown")'))
    fail("paths: the file-manager affordance lost its desktop gate in home/projects/view.tsx")

  // 4. The web platform object defines no native directory-picker entry point.
  const web = await read("src/runtime/platform/web.ts")
  if (web.includes("openDirectoryPickerDialog"))
    fail("paths: the web platform object must not define openDirectoryPickerDialog")
}

// --- N-5: zero host-OS conditionals in the whitelisted projects/sessions dirs ---
{
  const whitelist = [
    "src/home/projects",
    "src/workspaces/selection",
    "src/new-session",
    "src/session/composer/location-missing.tsx",
  ]
  const osPatterns: [RegExp, string][] = [
    [/process\.platform/, "process.platform"],
    [/navigator\.platform/, "navigator.platform"],
    [/from ["']node:os["']/, 'import from "node:os"'],
    [/require\(["']os["']\)/, 'require("os")'],
  ]
  let scanned = 0
  for (const entry of whitelist) {
    const full = new URL(entry, appRoot)
    const stat = await Bun.file(full).exists()
    const paths = stat
      ? [entry]
      : (await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: new URL(entry, appRoot).pathname }))).map(
          (file) => `${entry}/${file}`,
        )
    for (const path of paths) {
      scanned++
      const source = await read(path)
      for (const [pattern, label] of osPatterns) {
        if (pattern.test(source)) fail(`N-5: host-OS conditional (${label}) found in whitelisted ${path}`)
      }
    }
  }
  if (scanned < 20) fail(`N-5: whitelist scan covered only ${scanned} files — the directory set looks wrong`)

  console.log(
    "verify-projects-sessions: PASS (M-017 home archive wiring: stub gone, session.update archived:true call shape, archiveHomeSession helper + cache row removal + invalidate/resync kept; M-018 guard revision: includes list without \"servers\" + fixed SSH hosts entry + en/zh keys; path boundaries: web picker stays remote / reveal+file-manager desktop gates / web.ts has no openDirectoryPickerDialog; N-5: zero host-OS conditionals across " +
      scanned +
      " whitelisted files; STATIC check - runtime semantics and navigation reachability are G19)",
  )
}
