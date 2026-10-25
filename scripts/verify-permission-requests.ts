// verify-permission-requests.ts — static probe for issue #10 (permission
// requests and Agent questions unit).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…), the structural
// facts the permission-requests unit document relies on:
//
//   1. Decision call surface (layered enumeration, plan v1.1 F1): the LINEAR
//      `api.permission.reply(` call sites across the whole repo, collected
//      with whitespace/newline-tolerant matching (both call sites are written
//      across lines: `serverSDK.api.permission\n      .reply(`), form a set
//      EQUAL to exactly {session/requests/model.ts (decide(), explicit user
//      action), session/requests/auto-approve.ts (approve(), explicit opt-in
//      auto-answer)}. Any additional linear call site fails the probe. A
//      NEGATIVE assertion pins session-ui/src and ui/src (both inside the web
//      bundle closure) to ZERO normalized `permission.reply` occurrences.
//      Layered single-file checks: the client data.ts wrapper (whose NotFound
//      swallow has ZERO in-app callers), connection.ts (zero
//      permission/reply/interrupt/form references — disconnect never touches
//      the response channel) and runtime/server/client.tsx (no `.permission`).
//   2. Duplicate/stale/expired anchors (layered, plan v1.1 F2): client-side
//      dedup by id (permission.asked / form.created), removal on
//      permission.replied / form.replied / form.cancelled, the FORM-side
//      settleForm swallow (NotFound/AlreadySettled + error.id match gate) —
//      and the PERMISSION decision side with NO swallow: decide() catch shows
//      the `common.requestFailed` toast (removal then arrives via the
//      permission.replied broadcast); question/elicitation dock sending()
//      guards + ScopedKey draft cache.
//   3. Recovery chain: three connected-gate sync effects in requests/model.ts
//      (session permission.sync, sessionTreeIDs per-child form.sync, global
//      elicitation form.sync), tab-strip staggered background sync (300 +
//      index*50 + allSettled), auto-approve connect sweep (verbatim comment +
//      per-location list + the upstream-admitted never-loaded residual).
//   4. No ambiguous default approval: settings default autoApprove: false,
//      permission dock button variant sequence ghost(Deny)/neutral(Always)/
//      submit(Once) all disabled while responding, ZERO autoFocus in the
//      whole vendored session tree (negative), NO onKeyDown in the permission
//      dock (negative), auto-accept toast keys paired in en/zh (the project.*
//      pair is intentionally pinned en-only — zh falls back to en upstream;
//      a pin update adding zh translations must force a re-review).
//   5. Event and endpoint contract sampling: generated types carry the six
//      permission/form events plus PermissionRequest/FormInfo and the three
//      tagged error guards; the generated client carries the permission and
//      form reply endpoint paths.
//
// HONEST BOUNDARY (same tradition as verify-session-workbench.ts): this is a
// static STRUCTURE check (text anchors / regex on source files). It proves
// source shape, NOT runtime behavior: dock presentation, decision effects,
// disconnect recovery and "client exit never approves/rejects/stops the
// remote task" on a real device are covered by the G21 device gate
// (docs/design/interaction.md), BLOCKED at this verification level. Server
// semantics (packages/core|server|schema permission files) are NOT in the
// vendored closure and are NOT asserted here — they are cited from the
// upstream pin cache in the unit document. Scan scope excludes scripts/
// (this probe and sibling tooling) plus node_modules/dist/web-dist and the
// copied WebView payload android/app/src/main/assets/web/ (a byte copy of
// the vendored dist, not a separate call surface).
//
// Usage:
//   bun run scripts/verify-permission-requests.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-permission-requests: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()
const exists = async (path: string) => await Bun.file(new URL(path, repoRoot)).exists()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const UI = "vendor/upstream/packages/ui/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const PLUGIN = "vendor/upstream/packages/plugin/"

// Newline tolerance (plan §0e / review F1): normalize ALL whitespace before
// matching, because both linear call sites write the chain across lines
// (`serverSDK.api.permission\n      .reply(...)`).
const squash = (source: string) => source.replace(/\s+/g, "")

// --- 1. Decision call surface: exhaustive set equality (newline-tolerant) ---
{
  const expected = new Set([
    `${APP}src/session/requests/model.ts`,
    `${APP}src/session/requests/auto-approve.ts`,
  ])
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/", "scripts/", "android/app/src/main/assets/web/"]
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}")
  const collected = new Set<string>()
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(".", repoRoot).pathname }))) {
    if (skip.some((entry) => `/${file}`.includes(entry))) continue
    if (!(await exists(file))) continue
    if (/api\.permission\.reply\(/.test(squash(await read(file)))) collected.add(file)
  }
  for (const file of collected) {
    if (!expected.has(file)) fail(`1: unexpected linear permission.reply call site outside the closed set: ${file}`)
  }
  for (const file of expected) {
    if (!collected.has(file)) fail(`1: expected linear permission.reply call site missing from the scan: ${file}`)
  }
  if (collected.size !== 2) fail(`1: decision call-site set must equal exactly 2 files, got ${collected.size}`)

  // F1 negative assertion: session-ui and ui are inside the web bundle
  // closure — zero normalized `permission.reply` occurrences allowed there.
  for (const [name, base] of [
    ["session-ui/src", `${SESSION_UI}src/`],
    ["ui/src", `${UI}src/`],
  ] as const) {
    const inner = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(inner.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const source = await read(`${base}${file}`)
      if (/permission\.reply/.test(squash(source)))
        fail(`1: ${name} must stay free of permission.reply references, found in: ${file}`)
    }
  }

  // Per-site shapes stay intact (both are explicit actions/opt-ins).
  const model = await read(`${APP}src/session/requests/model.ts`)
  if (!model.includes('.reply({ sessionID: perm.sessionID, requestID: perm.id, decision: response })'))
    fail("1: model.ts decide() reply call lost its `{ decision: response }` shape")
  if (!model.includes("if (store.responding === perm.id) return"))
    fail("1: model.ts lost the responding idempotent early-return guard")
  if (!model.includes(".finally(")) fail("1: model.ts decide() lost its .finally responding reset")
  if (!model.includes('language.t("common.requestFailed")'))
    fail("1: model.ts decide() lost the failure toast anchor (F2: the permission decision side does NOT swallow)")

  const autoApprove = await read(`${APP}src/session/requests/auto-approve.ts`)
  if (!autoApprove.includes('.reply({ sessionID: permission.sessionID, requestID: permission.id, decision: "once" })'))
    fail('1: auto-approve.ts reply call lost its `{ decision: "once" }` shape')
  if (!autoApprove.includes("state.responded.has(permission.id)"))
    fail("1: auto-approve.ts lost the responded-set dedup guard")
  if (!autoApprove.includes("!covers(projectID)"))
    fail("1: auto-approve.ts lost the covers(projectID) project gate")

  // Layered single-file checks (F1): wrapper / transport / definition / plugin.
  const data = await read(`${CLIENT}src/solid/data.ts`)
  if (!data.includes(".permission.reply(input)"))
    fail("1: data.ts permission.reply wrapper anchor changed")
  if (!data.includes("if (!isPermissionNotFoundError(error)) throw error"))
    fail("1: data.ts wrapper lost its NotFound swallow (wrapper-layer fact)")
  if (!data.includes("removePermission(input.sessionID, input.requestID)"))
    fail("1: data.ts wrapper lost its removePermission settle step")
  // The wrapper has ZERO in-app callers (F2: its swallow is not the decision
  // side's semantics) — no vendored app source routes through it.
  const appGlob = new Bun.Glob("src/**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(appGlob.scan({ cwd: new URL(APP, repoRoot).pathname }))) {
    if (/session\.permission\.reply\(/.test(squash(await read(`${APP}${file}`))))
      fail(`1: data.ts permission.reply wrapper gained an in-app caller: ${file} — re-review the F2 layering`)
  }

  const connection = await read(`${CLIENT}src/solid/connection.ts`)
  for (const banned of ["permission", ".reply(", "interrupt", ".form"]) {
    if (connection.includes(banned)) fail(`1: connection.ts must not reference ${banned} (disconnect zero-side-effect)`)
  }

  const clientAssembly = await read(`${APP}src/runtime/server/client.tsx`)
  if (clientAssembly.includes(".permission")) fail("1: runtime/server/client.tsx must not reference .permission")

  // The remaining two layers exist where F1 says they do (definition/adapter).
  const protocol = await read(`${PROTOCOL}src/groups/permission.ts`)
  if (!protocol.includes('HttpApiEndpoint.post("session.permission.reply", "/api/session/:sessionID/permission/:requestID/reply"'))
    fail("1: protocol endpoint definition for session.permission.reply changed")
  const plugin = await read(`${PLUGIN}src/promise/adapter.ts`)
  if (!plugin.includes('adaptApiMethod(PermissionEndpoints["session.permission.reply"], host.permission.reply)'))
    fail("1: plugin adapter permission.reply host face changed")
}

// --- 2. Duplicate/stale/expired anchors (layered, F2) ---
{
  const data = await read(`${CLIENT}src/solid/data.ts`)
  if (!data.includes('store.session.permission[event.data.sessionID]?.some((request) => request.id === event.data.id)) return'))
    fail("2: permission.asked id-dedup anchor changed")
  if (!data.includes("removePermission(event.data.sessionID, event.data.requestID)"))
    fail("2: permission.replied removal anchor changed")
  if (!data.includes("some((form) => form.id === event.data.form.id)"))
    fail("2: form.created id-dedup anchor changed")
  if (!data.includes("removeForm(event.data.sessionID, event.data.id, event.location)"))
    fail("2: form.replied/cancelled removal anchor changed")
  // FORM side: settleForm swallow with the error.id match gate (self-healing).
  const settleBody = /function settleForm\([\s\S]*?\n  \}/.exec(data)
  if (!settleBody) fail("2: settleForm body not found")
  if (!settleBody![0].includes("!isFormNotFoundError(error) && !isFormAlreadySettledError(error)") ||
      !settleBody![0].includes("error.id !== input.formID"))
    fail("2: settleForm lost its NotFound/AlreadySettled + error.id swallow gate (form-side self-healing)")
  if (!data.includes("settleForm(input, ref, api().session.form.reply(input")) 
    fail("2: form.reply must route through settleForm")
  if (!data.includes("settleForm(input, ref, api().session.form.cancel(input"))
    fail("2: form.cancel must route through settleForm")

  // PERMISSION decision side: catch shows a toast, no NotFound swallow (F2).
  const model = await read(`${APP}src/session/requests/model.ts`)
  const decideCatch = /\.reply\(\{ sessionID: perm\.sessionID[\s\S]*?\.finally\(/.exec(model)
  if (!decideCatch) fail("2: decide() reply chain not found")
  if (!decideCatch![0].includes('language.t("common.requestFailed")'))
    fail("2: decide() catch must surface the requestFailed toast (permission side has NO swallow)")
  if (decideCatch![0].includes("isPermissionNotFoundError"))
    fail("2: decide() must not swallow NotFound — removal arrives via the permission.replied broadcast")

  // Question dock: sending() guard + disabled buttons + Esc reject + drafts.
  const question = await read(`${APP}src/session/requests/session-question-dock.tsx`)
  const sendingGuards = question.match(/if \(sending\(\)\) return/g)?.length ?? 0
  if (sendingGuards < 8) fail(`2: question dock sending() guards thinned (expected >= 8, got ${sendingGuards})`)
  const disabledButtons = question.match(/disabled=\{sending\(\)\}/g)?.length ?? 0
  if (disabledButtons < 5) fail(`2: question dock disabled={sending()} buttons thinned (expected >= 5, got ${disabledButtons})`)
  if (!question.includes("ScopedKey.from(serverSDK.scope, props.request.id)"))
    fail("2: question dock lost the per-request draft cache key")
  if (!question.includes('serverSDK.api.session.form.cancel({ sessionID: props.request.sessionID, formID: props.request.id })'))
    fail("2: question dock lost its Esc-reject form.cancel call")
  if (!question.includes('showToast({ title: language.t("common.requestFailed")'))
    fail("2: question dock lost the failure toast")

  // Elicitation dock: same family — mutation reply/cancel + guard + toast.
  const elicitation = await read(`${APP}src/session/requests/session-elicitation-dock.tsx`)
  if (!elicitation.includes("data.session.form.reply({ ...input(), answer }"))
    fail("2: elicitation dock lost its form.reply mutation")
  if (!elicitation.includes("data.session.form.cancel(input()"))
    fail("2: elicitation dock lost its form.cancel mutation")
  if (!elicitation.includes('language.t("common.requestFailed")'))
    fail("2: elicitation dock lost the failure toast")
  if (!elicitation.includes("if (sending()) return")) fail("2: elicitation dock lost its sending() guard")
}

// --- 3. Recovery chain (snapshot after ephemeral events) ---
{
  const model = await read(`${APP}src/session/requests/model.ts`)
  // Adjacent-pair anchors: connected early-return directly followed by the sync.
  if (!/status\(\) !== "connected"\) return\s*\n\s*void Promise\.all\(\[data\.shell\.sync\([^\n]*permission\.sync\(id\)/.test(model))
    fail('3: session gate must early-return on !connected and then call data.session.permission.sync(id)')
  if (!/status\(\) !== "connected"\) return\s*\n\s*void Promise\.all\(\s*\n?\s*sessionTreeIDs\(data\.session\.list\(\), id\)\.map\(\(sessionID\) => data\.session\.form\.sync\(sessionID\)\)/.test(model))
    fail("3: session-tree gate must early-return on !connected and then form.sync each child session")
  if (!/status\(\) !== "connected"\) return\s*\n\s*void data\.session\.form\.sync\("global", ref\)/.test(model))
    fail('3: elicitation location gate must early-return on !connected and then form.sync("global", ref)')

  const tabStrip = await read(`${APP}src/shell/titlebar/tab-strip.tsx`)
  if (!tabStrip.includes("ctx.data.session.permission.sync(value.id)"))
    fail("3: tab-strip background permission.sync anchor changed")
  if (!tabStrip.includes("ctx.data.session.form.sync(value.id)"))
    fail("3: tab-strip background form.sync anchor changed")
  if (!tabStrip.includes("300 + props.index * 50"))
    fail("3: tab-strip stagger delay (300 + index*50) anchor changed")
  if (!tabStrip.includes("Promise.allSettled("))
    fail("3: tab-strip must settle background syncs with allSettled")

  const autoApprove = await read(`${APP}src/session/requests/auto-approve.ts`)
  if (!autoApprove.includes("sweep on every connect while the setting is on"))
    fail("3: auto-approve sweep comment anchor changed (verbatim 'sweep on every connect while the setting is on')")
  if (!squash(autoApprove).includes("api.permission.request.list({location:{directory:location.directory}})"))
    fail("3: auto-approve sweep permission.request.list anchor changed (per-location listing)")
  if (!autoApprove.includes("never loaded"))
    fail("3: auto-approve lost the upstream-admitted never-loaded residual comment (F3: per-location aggregation)")
  if (!autoApprove.includes("async function sweepLocations()"))
    fail("3: auto-approve sweepLocations (per-location aggregation) anchor changed")
}

// --- 4. No ambiguous default approval ---
{
  const settings = await read(`${APP}src/settings/model.tsx`)
  if (!settings.includes("permissions: { autoApprove: false, autoApproveProjects: {} },"))
    fail("4: settings default must keep autoApprove: false (opt-in only)")

  const dock = await read(`${APP}src/session/requests/session-permission-dock.tsx`)
  if (!/variant="ghost"[^>]*onClick=\{\(\) => props\.onDecide\("reject"\)\}/.test(dock))
    fail('4: Deny button must be variant="ghost" wired to onDecide("reject") and stay first/weakened')
  if (!/variant="neutral"/.test(dock) || !/variant="submit"[^>]*onClick=\{\(\) => props\.onDecide\("once"\)\}/.test(dock))
    fail('4: Allow Always (neutral) / Allow Once (submit) variant sequence changed')
  const disabledCount = dock.match(/disabled=\{props\.responding\}/g)?.length ?? 0
  if (disabledCount !== 3) fail(`4: all three decision buttons must be disabled while responding, got ${disabledCount}`)
  if (dock.includes("onKeyDown"))
    fail("4: permission dock must not declare onKeyDown (no keyboard default approval)")
  if (!dock.includes("settings.permissions.tool.${props.request.action}.description"))
    fail("4: permission dock lost the per-action description lookup")

  const sessionGlob = new Bun.Glob("src/session/**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(sessionGlob.scan({ cwd: new URL(APP, repoRoot).pathname }))) {
    if ((await read(`${APP}${file}`)).includes("autoFocus"))
      fail(`4: vendored session tree must stay free of autoFocus, found in: ${file}`)
  }

  // auto-approve is opt-in with explicit toasts; the four on/off keys are
  // paired in en/zh (the project.* pair is pinned en-only — upstream zh
  // falls back to en; a pin update adding zh keys must force a re-review).
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  const zh = await read(`${APP}src/runtime/i18n/zh.ts`)
  for (const key of [
    "toast.permissions.autoaccept.on.title",
    "toast.permissions.autoaccept.on.description",
    "toast.permissions.autoaccept.off.title",
    "toast.permissions.autoaccept.off.description",
  ]) {
    if (!en.includes(`"${key}"`)) fail(`4: en lost the autoaccept toast key ${key}`)
    if (!zh.includes(`"${key}"`)) fail(`4: zh lost the autoaccept toast key ${key}`)
  }
  for (const key of ["toast.permissions.autoaccept.project.title", "toast.permissions.autoaccept.project.description"]) {
    if (!en.includes(`"${key}"`)) fail(`4: en lost the autoaccept project toast key ${key}`)
    if (zh.includes(`"${key}"`)) fail(`4: zh gained ${key} — re-review the en-only fallback note in the unit document`)
  }
}

// --- 5. Event and endpoint contract sampling ---
{
  const types = await read(`${CLIENT}src/promise/generated/types.ts`)
  for (const anchor of [
    'type: "permission.asked"',
    'type: "permission.replied"',
    'type: "session.permissions"',
    'type: "form.created"',
    'type: "form.replied"',
    'type: "form.cancelled"',
  ]) {
    if (!types.includes(anchor)) fail(`5: generated types lost the ${anchor} event`)
  }
  for (const anchor of ["PermissionRequest", "FormInfo", "PermissionNotFoundError", "FormNotFoundError", "FormAlreadySettledError"]) {
    if (!types.includes(anchor)) fail(`5: generated types lost the ${anchor} type`)
  }
  const client = await read(`${CLIENT}src/promise/generated/client.ts`)
  if (!client.includes("/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply"))
    fail("5: generated client lost the permission reply endpoint path")
  if (!client.includes("/api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}/reply"))
    fail("5: generated client lost the form reply endpoint path")
}

console.log(
  "verify-permission-requests: PASS (" +
    "1: linear permission.reply call sites form exactly the closed 2-file set {requests/model, requests/auto-approve} with per-site shapes; session-ui/ui zero-hit negative; data.ts wrapper (no in-app callers) + connection.ts zero refs + client.tsx no .permission + protocol/plugin layers pinned; " +
    "2: asked/created id-dedup, replied/cancelled removal, settleForm form-side swallow with error.id gate, decide() toast-only catch (NO swallow, F2), question/elicitation sending() guards + Esc reject + ScopedKey drafts; " +
    "3: three connected-gate sync adjacent pairs in requests/model.ts, tab-strip staggered allSettled sync, auto-approve connect sweep + never-loaded residual (F3); " +
    "4: autoApprove default false, ghost/neutral/submit variant sequence all disabled while responding, zero autoFocus in vendored session tree, no onKeyDown in permission dock, autoaccept toast keys en/zh paired (project.* pinned en-only); " +
    "5: six permission/form events + request/error types + reply endpoint paths in generated surfaces; " +
    "STATIC check - dock presentation, decision effects, recovery and client-exit red line on device are G21)",
)
