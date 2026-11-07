// verify-session-workbench.ts — static probe for issue #9 (session workbench unit).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…), the structural
// facts the session-workbench unit document relies on:
//
//   1. Cancel call surface: the LINEAR `api.session.interrupt(` call sites
//      across the whole repo, collected with whitespace/newline-tolerant
//      matching (the composer adapter chain is written across lines), form a
//      set EQUAL to exactly {session/composer/adapter.ts,
//      session/revert.ts}. Any (issue #67: session-running-menu.tsx left with the host migration)
//      additional linear call site fails the probe. Also checks the two
//      adapter-method trigger faces in composer/submit.ts (stop button +
//      working-state empty submit), and that connection.ts stop()/resync()/
//      pagehide paths contain zero API/interrupt calls (client disconnect
//      never stops the remote task) while runtime/server/client.tsx has no
//      interrupt at all.
//   2. Live-only SSE + snapshot recovery: shared-events.ts is a bounded live
//      fan-out (capacity 4096) with only a late-subscriber server.connected
//      compensation and NO replay/backlog; data.ts invalidates all cached
//      reads when the connection is not "connected" (adjacent
//      early-return + sync.invalidate() pair) and reconciles a session.active()
//      snapshot in the server.connected case; session-resolution.ts and
//      requests/model.ts gate their re-syncs on the connected flag.
//   3. Per-session persistence: composer prompts persist under
//      Persist.serverScoped(...scope.id, "prompt") and shell layout keeps
//      sessionView keyed/filtered by SessionStateKey.
//   4. Event surface sampling + malformed tolerance: the failure/interrupt
//      event branches exist (session.tool.failed / session.step.failed /
//      session.execution.interrupted / session.inbox.cancelled /
//      session.retry.scheduled), events for never-loaded rows are dropped
//      (comment anchor), and data.ts contains NO `default:` — unknown events
//      fall through silently (structural assertion; an upstream default
//      branch must force a re-review of the malformed-event stance).
//   5. Mobile adaptation facts: session/screen-layout.ts isDesktop() gating
//      and composer/submit.ts matchMedia("(max-width: 767px)").
//
// HONEST BOUNDARY (same tradition as verify-projects-sessions.ts): this is a
// static STRUCTURE check (text anchors / regex on source files). It proves
// source shape, NOT runtime behavior: streaming arrival timing, reconnect
// snapshot recovery as seen by a user, and "disconnect does not stop the
// remote task" on a real device are all covered by the G20 device gate
// (docs/design/interaction.md), BLOCKED at this verification level.
// Scan scope excludes scripts/ (this probe and sibling tooling) plus
// node_modules/dist/web-dist and the copied WebView payload
// android/app/src/main/assets/web/ (a byte copy of the vendored dist, not a
// separate call surface — scanning it would double-count the same minified
// sources and break on every rebuild) — the asserted surface is shipped app
// source code.
//
// Usage:
//   bun run scripts/verify-session-workbench.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-session-workbench: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"

// --- 1. Cancel call surface: exhaustive set equality (newline-tolerant) ---
{
  // Issue #67: session-running-menu.tsx is upstream-removed with the host migration (C
  // group); the linear interrupt set drops to {adapter, revert}.
  const expected = new Set([
    `${APP}src/session/composer/adapter.ts`,
    `${APP}src/session/revert.ts`,
  ])
  // issue #149: android/app/build/ excluded alongside the copied WebView payload — gradle
  // merge/intermediate asset copies inside the build directory are the same minified dist
  // bytes again, not a separate call surface (the asserted surface stays shipped app source).
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/", "scripts/", "android/app/src/main/assets/web/", "android/app/build/"]
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}")
  const collected = new Set<string>()
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(".", repoRoot).pathname }))) {
    if (skip.some((entry) => `/${file}`.includes(entry))) continue
    if (!(await exists(file))) continue
    // Newline tolerance (plan v2.1 N-2): normalize ALL whitespace before
    // matching, because adapter.ts writes the chain across lines
    // (`server.api.session\n        .interrupt(...)`).
    const source = await read(file)
    if (/api\.session\.interrupt\(/.test(source.replace(/\s+/g, ""))) collected.add(file)
  }
  for (const file of collected) {
    if (!expected.has(file)) fail(`1: unexpected linear interrupt call site outside the closed set: ${file}`)
  }
  for (const file of expected) {
    if (!collected.has(file)) fail(`1: expected linear interrupt call site missing from the scan: ${file}`)
  }
  if (collected.size !== 2) fail(`1: cancel call-site set must equal exactly 2 files, got ${collected.size}`)

  // Per-site shapes stay intact.
  const adapter = await read(`${APP}src/session/composer/adapter.ts`)
  if (!adapter.includes(".interrupt({ sessionID: id, resume: true })"))
    fail("1: adapter.ts interrupt call lost its `{ sessionID: id, resume: true }` shape")
  if (!adapter.includes(".catch(() => undefined)"))
    fail("1: adapter.ts interrupt no longer swallows failures (resume:true contract)")

  const revert = await read(`${APP}src/session/revert.ts`)
  if (!revert.includes("server.api.session.interrupt({ sessionID })"))
    fail("1: revert.ts stage() interrupt call shape changed")
  if (!revert.includes("server.api.session.wait({ sessionID })"))
    fail("1: revert.ts stage() interrupt→wait sequence lost its wait step")
  if (!revert.includes("server.api.session.revert.stage("))
    fail("1: revert.ts stage() sequence lost its revert.stage step")
  if (!revert.includes("both are idle no-ops."))
    fail("1: revert.ts comment anchor changed (expected verbatim 'both are idle no-ops.')")
  if (!revert.includes("server.api.session.inbox.cancel({ sessionID, inboxID: message.id })"))
    fail("1: revert.ts undelivered-prompt branch must cancel via inbox.cancel, not interrupt")

  // Adapter-method trigger faces (NOT linear call sites): stop button + empty submit.
  const submit = await read(`${APP}src/composer/submit.ts`)
  if (!submit.includes("void input.adapter.interrupt()"))
    fail("1: composer/submit.ts working-state empty-submit interrupt face is gone")
  if (!submit.includes("stop: () => (input.adapter.kind === \"active-session\" ? input.adapter.interrupt() : Promise.resolve())"))
    fail("1: composer/submit.ts stop-button interrupt face is gone")

  // Disconnect paths carry zero API/interrupt calls.
  const connection = await read(`${CLIENT}src/solid/connection.ts`)
  if (connection.includes(".interrupt(")) fail("1: connection.ts contains an interrupt call")
  if (connection.includes("api.session.")) fail("1: connection.ts contains a direct session API call")
  const stopBody = /function stop\(\) \{[\s\S]*?\n  \}/.exec(connection)
  if (!stopBody) fail("1: connection.ts stop() body not found")
  if (!stopBody![0].includes("stream?.abort()")) fail("1: connection.ts stop() lost its stream abort anchor")
  if (/api\.|interrupt/.test(stopBody![0].replace("// Nothing is listening once stopped, so consumers must treat their data as stale until start() reconnects.", "")))
    fail("1: connection.ts stop() body must not call APIs (disconnect must not stop the remote task)")
  const resyncBody = /function resync\(reason: string\) \{[\s\S]*?\n  \}/.exec(connection)
  if (!resyncBody) fail("1: connection.ts resync() body not found")
  if (!resyncBody![0].includes("current?.abort(new Error(reason))"))
    fail("1: connection.ts resync() lost its local stream drop anchor")
  if (/api\.|interrupt/.test(resyncBody![0])) fail("1: connection.ts resync() body must not call APIs")
  if (!connection.includes("const pagehide = () => stop()")) fail("1: connection.ts pagehide must route to stop()")
  if (!connection.includes('resync("Page returned to the foreground after the event stream went quiet")'))
    fail("1: connection.ts foreground resync anchor changed")
  if (!connection.includes("foregroundIdleThreshold")) fail("1: connection.ts idle watchdog anchor changed")

  // The server SDK assembly never interrupts.
  const clientAssembly = await read(`${APP}src/runtime/server/client.tsx`)
  if (clientAssembly.includes("interrupt")) fail("1: runtime/server/client.tsx must not reference interrupt")
  if (!/createClientConnection\(transport\.api, \{/.test(clientAssembly))
    fail("1: runtime/server/client.tsx lost its createClientConnection assembly")
  if (!clientAssembly.includes("pageLifecycle: true")) fail("1: runtime/server/client.tsx lost pageLifecycle")
}

// --- 2. Live-only SSE + snapshot recovery ---
{
  const shared = await read(`${CLIENT}src/shared-events.ts`)
  if (!shared.includes("const capacity = 4_096")) fail("2: shared-events.ts live capacity anchor changed")
  if (!shared.includes('if (item.value.type === "server.connected") connection.connected = item.value'))
    fail("2: shared-events.ts late-subscriber server.connected compensation anchor changed")
  if (/backlog|replay/i.test(shared))
    fail("2: shared-events.ts must stay live-only (no replay/backlog buffering)")

  const data = await read(`${CLIENT}src/solid/data.ts`)
  // Adjacent-pair anchor (plan v2.1 N-1): the full-invalidate effect is a
  // positive early-return when connected, immediately followed by the
  // invalidation — NOT a `status() !== "connected"` literal.
  if (!/status\(\) === "connected"\) return\s*\n\s*sync\.invalidate\(\)/.test(data))
    fail('2: data.ts disconnect invalidation effect anchor changed (expected `status() === "connected") return` directly followed by `sync.invalidate()`)')
  const serverConnectedCase = /case "server.connected": \{[\s\S]*?case "project\.updated"/.exec(data)
  if (!serverConnectedCase) fail("2: data.ts server.connected case not found")
  if (!serverConnectedCase![0].includes(".session.active()"))
    fail("2: data.ts server.connected case must reconcile the session.active() snapshot")

  const resolution = await read(`${APP}src/session/session-resolution.ts`)
  if (!resolution.includes("options?.connected?.()")) fail("2: session-resolution.ts connected gate changed")
  if (!resolution.includes("if (!id || !connected) return")) fail("2: session-resolution.ts disconnected early-return changed")
  if (!resolution.includes("Queued inputs") || !resolution.includes("ride along so a reconnect refreshes them"))
    fail("2: session-resolution.ts queued-inputs resync comment changed")
  if (!resolution.includes("store.message.sync(id)") || !resolution.includes("store.pending.sync(id)"))
    fail("2: session-resolution.ts must re-sync message and pending reads on reconnect")

  const requests = await read(`${APP}src/session/requests/model.ts`)
  const gates = requests.match(/serverSDK\.connection\.status\(\) !== "connected"/g)?.length ?? 0
  if (gates < 3) fail(`2: requests/model.ts connected gates dropped (expected >= 3, got ${gates})`)
  if (!requests.includes('connected: () => serverSDK.connection.status() === "connected"'))
    fail("2: requests/model.ts lost its positive connected gate")
}

// --- 3. Per-session state persistence ---
{
  const composerState = await read(`${APP}src/composer/state.ts`)
  if (!composerState.includes('Persist.serverScoped(serverScope, scope.dir, scope.id, "prompt")'))
    fail('3: composer/state.ts lost the Persist.serverScoped(...scope.id, "prompt") draft persistence')
  if (!composerState.includes("previousKey:")) fail("3: composer/state.ts lost the previousKey v2 migration field")

  const layout = await read(`${APP}src/shell/state/layout.tsx`)
  if (!layout.includes("sessionView")) fail("3: shell/state/layout.tsx lost the sessionView scroll persistence")
  if (!layout.includes("SessionStateKey.is(key)"))
    fail("3: shell/state/layout.tsx lost the SessionStateKey whitelist filter")
}

// --- 4. Event surface sampling + malformed tolerance ---
{
  const data = await read(`${CLIENT}src/solid/data.ts`)
  for (const branch of [
    'case "session.permissions"',
    'case "session.tool.failed"',
    'case "session.step.failed"',
    'case "session.execution.interrupted"',
    'case "session.inbox.cancelled"',
    'case "session.retry.scheduled"',
  ]) {
    if (!data.includes(branch)) fail(`4: data.ts handleEvent lost the ${branch} branch`)
  }
  if (!data.includes("the row was never loaded or was evicted; the event is dropped"))
    fail("4: data.ts lost the never-loaded-row event-drop anchor")
  // Unknown events fall through silently: no `default:` anywhere in data.ts.
  // If an upstream pin update introduces one, this assertion FAILS on purpose
  // to force a re-review of the malformed-event tolerance stance.
  if (data.includes("default:")) fail("4: data.ts gained a `default:` branch — unknown events would no longer fall through silently; re-review the malformed-event stance")
}

// --- 5. Mobile adaptation facts ---
{
  const screenLayout = await read(`${APP}src/session/screen-layout.ts`)
  const desktopGates = screenLayout.match(/session\.isDesktop\(\)/g)?.length ?? 0
  if (desktopGates < 3) fail(`5: screen-layout.ts isDesktop() gating thinned (expected >= 3, got ${desktopGates})`)

  const submit = await read(`${APP}src/composer/submit.ts`)
  if (!submit.includes('window.matchMedia("(max-width: 767px)")'))
    fail('5: composer/submit.ts lost the narrow-screen matchMedia("(max-width: 767px)") awareness')
}

console.log(
  "verify-session-workbench: PASS (" +
    "1: linear interrupt call sites form exactly the closed 2-file set {composer/adapter, revert} with per-site shapes (issue #67: session-running-menu.tsx upstream-removed); submit.ts stop/empty-submit adapter faces present; connection.ts stop/resync/pagehide paths carry zero API calls; client.tsx has no interrupt; " +
    "2: shared-events live-only fan-out (capacity 4096, no replay/backlog), data.ts disconnect full-invalidate adjacent pair + server.connected session.active() snapshot, session-resolution/requests connected gates; " +
    "3: per-session prompt persistence (Persist.serverScoped) + sessionView scroll persistence; " +
    "4: failure/interrupt/permissions event branches sampled, never-loaded-row drop anchor, NO default: (silent fall-through); " +
    "5: isDesktop() gating + 767px matchMedia; " +
    "STATIC check - streaming arrival, reconnect recovery, and remote-task survival on device are G20)",
)
