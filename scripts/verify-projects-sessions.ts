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

// --- M-018: SSH hosts entry + guard revision in the multi-server settings layout ---
{
  const shell = await read("src/settings/shell.tsx")

  // Guard revision (the reachability PREREQUISITE): the root-tab redirect guard's
  // includes list must no longer contain "servers" — otherwise the guard createEffect
  // rewrites view.tab='servers' back to general in the multiple() layout. Asserted on
  // the SOURCE structure of the guard list, not merely on the entry's existence.
  const guard = /if \(\[([^\]]+)\]\.includes\(view\.tab\)\)\s*\n\s*surface\.open\("general"\)/.exec(shell)
  if (!guard) fail('M-018: the root-tab redirect guard block was not found in settings/shell.tsx')
  const guardTabs = guard![1]!.split(",").map((item) => item.trim().replaceAll('"', ""))
  if (guardTabs.includes("servers"))
    fail('M-018: the redirect guard still lists "servers" — the tab would bounce to general in the multiple() layout')
  for (const kept of ["projects", "workspaces", "providers", "models", "extensions"]) {
    if (!guardTabs.includes(kept)) fail(`M-018: the redirect guard dropped "${kept}" — upstream redirect semantics must stay`)
  }

  // Entry: the multiple() nav group carries a fixed item opening the "servers" tab.
  const group = /multiple\(\)\s*\n\s*\? \[[\s\S]*?items: \[[\s\S]*?\{ value: "servers", icon: "server" as const, label: language\.t\("settings\.tab\.sshHosts"\) \}/.exec(shell)
  if (!group) fail('M-018: the multiple() nav group has no "servers" entry keyed on settings.tab.sshHosts')

  // i18n keys exist in BOTH dictionaries.
  for (const dict of ["src/runtime/i18n/en.ts", "src/runtime/i18n/zh.ts"]) {
    if (!(await read(dict)).includes('"settings.tab.sshHosts":'))
      fail(`M-018: the settings.tab.sshHosts key is missing from ${dict}`)
  }
}

console.log(
  "verify-projects-sessions: PASS (M-017 home archive wiring: stub gone, session.update archived:true call shape, archiveHomeSession helper + cache row removal + invalidate/resync kept; M-018 guard revision: includes list without \"servers\" + fixed SSH hosts entry + en/zh keys; STATIC check - runtime semantics and navigation reachability are G19)",
)
