// verify-permission-requests.ts — static probe for issue #10 (permission
// requests and Agent questions unit), re-anchored for issue #189 to the
// v2.2.7 pin fedc6f208a… (the #188 re-anchor tradition: fact-level old→new
// re-anchors for v2.2.7-context drift, no contract weakening).
//
// Asserts, against the REAL vendored sources (pin fedc6f208a… = v2.2.7), the
// structural facts the permission-requests unit document relies on:
//
//   1. Decision call surface (layered enumeration, plan v1.1 F1 as carried by
//      the #189 fact sync): the LINEAR `api.permission.reply(` call sites
//      across the whole repo, collected with whitespace/newline-tolerant
//      matching (the model.ts machine reply effect is written across lines:
//      `serverSDK.api.permission\n      .reply(`), form a set EQUAL to
//      exactly {session/requests/model.ts (execute(), the reply effect
//      dispatched by the permission machine)}. The v2.2.1 explicit auto-answer
//      call site moved to the client DATA LAYER: `session.permission.reply(`
//      callers form the EXACT set {session/requests/auto-approve.ts (opt-in
//      auto-answer), shell/titlebar/inbox-model.ts (explicit inbox decision,
//      `.catch(requestFailed)`)} — any additional or missing caller fails the
//      probe. A NEGATIVE assertion pins session-ui/src and ui/src (both
//      inside the web bundle closure) to ZERO normalized `permission.reply`
//      occurrences. Layered single-file checks: the client data.ts wrapper
//      (whose NotFound swallow now has exactly those two callers, v2.2.7
//      F2 layering), connection.ts (zero permission/reply/interrupt/form
//      references — disconnect never touches the response channel) and
//      runtime/server/client.tsx (no `.permission`).
//   2. Duplicate/stale/expired anchors (layered, F2): client-side
//      dedup by id (permission.asked / form.created), removal on
//      permission.replied / form.replied / form.cancelled, the FORM-side
//      settleForm swallow (NotFound/AlreadySettled + error.id match gate) —
//      and the PERMISSION decision side reclassified by the v2.2.7 machine:
//      NotFound is explicitly classified as ALREADY-REPLIED
//      (`isPermissionNotFoundError(error) → { type: "reply.succeeded" }`),
//      real failures dispatch `reply.failed` carrying error.message (the
//      machine turns that into the `common.requestFailed` toast via its
//      toast-failed effect). Question/elicitation guards and ScopedKey draft
//      caches live in the shared controllers + machine files, with the
//      sending() guard surface pinned in BOTH dock variants (classic +
//      experimental) behind the thin newQuestionUI router.
//   3. Recovery chain: three connected-gate sync effects in requests/model.ts
//      (session permission.sync, formSessions per-child form.sync, global
//      elicitation form.sync), tab-strip staggered background sync
//      (running-conditioned permission/form sync, 300 + index*50,
//      allSettled), auto-approve connect sweep (verbatim comment +
//      per-location listing via the generated client + session.active/
//      permission.list inventory + machine sweep dispatch + the
//      upstream-admitted never-loaded residual).
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
// matching, because the linear reply effect (model.ts), the inbox decision
// (inbox-model.ts) and the sweep listing (auto-approve.ts) write their chains
// across lines.
const squash = (source: string) => source.replace(/\s+/g, "")

// --- 1. Decision call surface: exhaustive set equality (newline-tolerant) ---
{
  const expected = new Set([`${APP}src/session/requests/model.ts`])
  // issue #149: android/app/build/ excluded alongside the copied WebView payload — gradle
  // merge/intermediate asset copies inside the build directory are the same minified dist
  // bytes again, not a separate call surface (the asserted surface stays shipped app source).
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/", "scripts/", "android/app/src/main/assets/web/", "android/app/build/"]
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
  if (collected.size !== 1) fail(`1: linear decision call-site set must equal exactly 1 file (requests/model.ts), got ${collected.size}`)

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

  // Per-site shapes stay intact (machine reply effect + data-layer opt-in).
  const model = await read(`${APP}src/session/requests/model.ts`)
  if (!model.includes(".reply({ sessionID: effect.sessionID, requestID, decision: effect.decision }, { signal: controller.signal })"))
    fail("1: model.ts machine reply effect lost its `{ decision: effect.decision }` + abort-signal shape")
  if (!model.includes("dispatch(perm.id, { type: \"decide\", sessionID: perm.sessionID, decision })"))
    fail("1: model.ts decide() no longer dispatches the machine decide event")
  if (!model.includes("const result = transitionPermissionReply(state, event)"))
    fail("1: model.ts reply lifecycle must run through the permission machine (transitionPermissionReply)")
  if (!model.includes("language.t(\"common.requestFailed\")"))
    fail("1: model.ts lost the failure toast anchor (F2: reply.failed carries the message, the machine's toast-failed effect shows the toast)")

  const autoApprove = await read(`${APP}src/session/requests/auto-approve.ts`)
  if (!autoApprove.includes("void input.data.session.permission.reply({ sessionID: effect.sessionID, requestID, decision: \"once\" }).then("))
    fail('1: auto-approve.ts data-layer reply call lost its `{ decision: "once" }` shape')
  if (!autoApprove.includes("if (!covers(projectID)) return"))
    fail("1: auto-approve.ts lost the covers(projectID) project gate")
  if (!autoApprove.includes("dispatch(permission.id, { type: \"approve\", sessionID: permission.sessionID, projectID, runId: uuid() })"))
    fail("1: auto-approve.ts approve() no longer dispatches the auto-approve-machine approve event")

  // NEW (v2.2.7): the inbox titlebar row carries its own explicit decision path.
  const inbox = await read(`${APP}src/shell/titlebar/inbox-model.ts`)
  if (!inbox.includes("decide: (entry: InboxEntry, decision: \"once\" | \"always\" | \"reject\") =>"))
    fail("1: inbox-model.ts lost the three-decision decide() entry")
  if (!squash(inbox).includes(".reply({sessionID:request.sessionID,requestID:request.id,decision}).catch(requestFailed)"))
    fail("1: inbox-model.ts decide() reply must route through the data layer with .catch(requestFailed)")

  // Layered single-file checks (F1): wrapper / transport / definition / plugin.
  const data = await read(`${CLIENT}src/solid/data.ts`)
  if (!data.includes(".permission.reply(input)"))
    fail("1: data.ts permission.reply wrapper anchor changed")
  if (!data.includes("if (!isPermissionNotFoundError(error)) throw error"))
    fail("1: data.ts wrapper lost its NotFound swallow (wrapper-layer fact)")
  if (!data.includes("removePermission(input.sessionID, input.requestID)"))
    fail("1: data.ts wrapper lost its removePermission settle step")
  // The wrapper has EXACTLY TWO in-app callers (F2, v2.2.7 layering): the
  // opt-in auto-answer and the inbox's explicit decision route through its
  // swallow; anything else re-opens the layering review.
  const expectedWrapperCallers = new Set([
    "src/session/requests/auto-approve.ts",
    "src/shell/titlebar/inbox-model.ts",
  ])
  const wrapperCallers = new Set<string>()
  const appGlob = new Bun.Glob("src/**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(appGlob.scan({ cwd: new URL(APP, repoRoot).pathname }))) {
    if (/session\.permission\.reply\(/.test(squash(await read(`${APP}${file}`)))) wrapperCallers.add(file)
  }
  for (const file of wrapperCallers) {
    if (!expectedWrapperCallers.has(file))
      fail(`1: data.ts permission.reply wrapper gained an unexpected caller: ${file} — re-review the F2 layering`)
  }
  for (const file of expectedWrapperCallers) {
    if (!wrapperCallers.has(file))
      fail(`1: expected data-layer permission.reply caller missing from the exact set: ${file}`)
  }
  if (wrapperCallers.size !== 2)
    fail(`1: data-layer permission.reply caller set must equal exactly 2 files, got ${wrapperCallers.size}`)

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

  // PERMISSION decision side (v2.2.7 machine reclassification, #189): NotFound
  // is explicitly counted as already-replied; real failures dispatch
  // reply.failed with error.message (the machine toasts via toast-failed).
  const model = await read(`${APP}src/session/requests/model.ts`)
  const replyChain = /void serverSDK\.api\.permission\s*\.reply\(\{ sessionID: effect\.sessionID[\s\S]*?error instanceof Error \? error\.message : String\(error\)/.exec(model)
  if (!replyChain) fail("2: model.ts machine reply effect chain not found")
  if (!replyChain![0].includes("isPermissionNotFoundError(error)"))
    fail("2: decide() reply chain must classify NotFound explicitly (isPermissionNotFoundError)")
  if (!/isPermissionNotFoundError\(error\)\s*\?\s*\{\s*type:\s*"reply\.succeeded"/.test(replyChain![0]))
    fail('2: NotFound must map to { type: "reply.succeeded" } (already-replied classification, not a swallow)')
  if (!replyChain![0].includes('type: "reply.failed"'))
    fail('2: real reply failures must dispatch { type: "reply.failed" } carrying error.message')

  // Question docks: thin newQuestionUI router + two guarded variants.
  const questionRouter = await read(`${APP}src/session/requests/session-question-dock.tsx`)
  if (!questionRouter.includes("settings.general.newQuestionUI()"))
    fail("2: question dock router lost the newQuestionUI switch")
  if (!questionRouter.includes("<SessionQuestionDockClassic {...props} />") || !questionRouter.includes("<SessionQuestionDockExperimental {...props} />"))
    fail("2: question dock router must render both variants (classic fallback + experimental)")

  const classic = await read(`${APP}src/session/requests/session-question-dock-classic.tsx`)
  const experimental = await read(`${APP}src/session/requests/session-question-dock-experimental.tsx`)
  const classicSending = classic.match(/sending\(\)/g)?.length ?? 0
  const experimentalSending = experimental.match(/sending\(\)/g)?.length ?? 0
  if (classicSending < 19) fail(`2: classic question dock sending() guards thinned (expected >= 19, got ${classicSending})`)
  if (experimentalSending < 19) fail(`2: experimental question dock sending() guards thinned (expected >= 19, got ${experimentalSending})`)
  const classicDisabled = classic.match(/disabled=\{sending\(\)\}/g)?.length ?? 0
  const experimentalDisabled = experimental.match(/disabled=\{sending\(\)\}/g)?.length ?? 0
  if (classicDisabled < 9) fail(`2: classic question dock disabled={sending()} buttons thinned (expected >= 9, got ${classicDisabled})`)
  if (experimentalDisabled < 10) fail(`2: experimental question dock disabled={sending()} buttons thinned (expected >= 10, got ${experimentalDisabled})`)
  for (const [name, source] of [["classic", classic], ["experimental", experimental]] as const) {
    if (!source.includes("const reject = form.dismiss"))
      fail(`2: ${name} question dock lost its Esc-reject wiring (reject = form.dismiss)`)
    if (!source.includes('aria-keyshortcuts="Escape"'))
      fail(`2: ${name} question dock lost the Esc reject affordance (aria-keyshortcuts="Escape")`)
    if (!source.includes("createQuestionDock"))
      fail(`2: ${name} question dock must share the createQuestionDock controller`)
  }
  if (!classic.includes("event.key === \"Escape\""))
    fail("2: classic question dock lost the Escape key handling in nav()")

  // Question controller: the reply/cancel mutations moved here (v2.2.7).
  const questionController = await read(`${APP}src/session/requests/question-controller.ts`)
  if (!questionController.includes("serverSDK.api.session.form.reply({ ...target, answer: action.answer }, { signal: current.signal })"))
    fail("2: question controller lost its form.reply mutation")
  if (!questionController.includes("serverSDK.api.session.form.cancel(target, { signal: current.signal })"))
    fail("2: question controller lost its form.cancel (Esc dismiss) mutation")
  if (!questionController.includes('dispatch({ type: "request.succeeded", attempt })'))
    fail("2: question controller lost the request.succeeded dispatch")
  if (!questionController.includes('dispatch({ type: "request.failed", attempt, error: error.message })'))
    fail("2: question controller lost the request.failed dispatch")
  if (!questionController.includes("ScopedKey.from(serverSDK.scope, untrack(input.request).id)"))
    fail("2: question controller lost the per-request ScopedKey draft cache key")
  if (!questionController.includes("showToast({ title: input.language.t(\"common.requestFailed\"), description: effect.error })"))
    fail("2: question controller lost the failure toast")

  // Draft cache: question-state.ts owns the LRU; the machine saves/deletes.
  const questionState = await read(`${APP}src/session/requests/question-state.ts`)
  if (!questionState.includes("export const questionCache = {"))
    fail("2: question-state.ts lost the questionCache draft cache export")
  if (!questionController.includes("questionCache.set(cacheKey, effect.snapshot)") || !questionController.includes("questionCache.delete(cacheKey)"))
    fail("2: question controller lost the questionCache save/delete wiring")
  const questionMachine = await read(`${APP}src/session/requests/question-machine.ts`)
  if (!questionMachine.includes('type: "cache.save"') || !questionMachine.includes('type: "cache.delete"') || !questionMachine.includes('type: "toast.fail"'))
    fail("2: question machine lost its cache/toast effects")

  // Elicitation dock: the mutations moved to the controller (v2.2.7); the dock
  // keeps only the wiring (its own sending() surface is zero).
  const elicitation = await read(`${APP}src/session/requests/session-elicitation-dock.tsx`)
  if (!elicitation.includes("createElicitationDock")) fail("2: elicitation dock lost the shared controller wiring")
  if (!elicitation.includes("dock.reply()") || !elicitation.includes("dock.dismiss()"))
    fail("2: elicitation dock lost its reply/dismiss entry points")
  const elicitationController = await read(`${APP}src/session/requests/elicitation-controller.ts`)
  if (!elicitationController.includes("ScopedKey.from(serverSDK.scope, untrack(input.request).id)"))
    fail("2: elicitation controller lost the per-request ScopedKey cache key")
  if (!elicitationController.includes("input.forms.reply({ ...target, answer: action.answer }, request.location)"))
    fail("2: elicitation controller lost its data-layer form.reply mutation")
  if (!elicitationController.includes("input.forms.cancel(target, request.location)"))
    fail("2: elicitation controller lost its data-layer form.cancel mutation")
  if (!elicitationController.includes('dispatch({ type: "request.succeeded", attempt })'))
    fail("2: elicitation controller lost the request.succeeded dispatch")
  if (!elicitationController.includes('dispatch({ type: "request.failed", attempt, error: error instanceof Error ? error.message : String(error) })'))
    fail("2: elicitation controller lost the request.failed dispatch")
  if (!elicitationController.includes("showToast({ title: input.language.t(\"common.requestFailed\"), description: effect.error })"))
    fail("2: elicitation controller lost the failure toast")
  const elicitationMachine = await read(`${APP}src/session/requests/elicitation-machine.ts`)
  if (!elicitationMachine.includes('type: "cache.save"') || !elicitationMachine.includes('type: "cache.delete"') || !elicitationMachine.includes('type: "toast.fail"'))
    fail("2: elicitation machine lost its cache/toast effects")
}

// --- 3. Recovery chain (snapshot after ephemeral events) ---
{
  const model = await read(`${APP}src/session/requests/model.ts`)
  // Adjacent-pair anchors: connected early-return directly followed by the sync.
  if (!/status\(\) !== "connected"\) return\s*\n\s*void Promise\.all\(\[data\.shell\.sync\([^\n]*permission\.sync\(id\)/.test(model))
    fail('3: session gate must early-return on !connected and then call data.session.permission.sync(id)')
  if (!/status\(\) !== "connected"\) return\s*\n\s*void Promise\.all\(\s*formSessions\(\)\.map\(\(sessionID\) => data\.session\.form\.sync\(sessionID\)\)/.test(model))
    fail("3: session-tree gate must early-return on !connected and then form.sync each child session (formSessions memo)")
  if (!/status\(\) !== "connected"\) return\s*\n\s*void data\.session\.form\.sync\("global", ref\)/.test(model))
    fail('3: elicitation location gate must early-return on !connected and then form.sync("global", ref)')

  const tabStrip = await read(`${APP}src/shell/titlebar/tab-strip.tsx`)
  if (!tabStrip.includes("...(running ? [ctx.data.session.permission.sync(id), ctx.data.session.form.sync(id)] : [])"))
    fail("3: tab-strip running-conditioned background permission/form sync anchor changed")
  if (!tabStrip.includes("window.setTimeout("))
    fail("3: tab-strip stagger delay must be scheduled via window.setTimeout")
  if (!tabStrip.includes("300 + props.index * 50"))
    fail("3: tab-strip stagger delay (300 + index*50) anchor changed")
  if (!tabStrip.includes("Promise.allSettled("))
    fail("3: tab-strip must settle background syncs with allSettled")

  const autoApprove = await read(`${APP}src/session/requests/auto-approve.ts`)
  if (!autoApprove.includes("sweep on every connect while the setting is on"))
    fail("3: auto-approve sweep comment anchor changed (verbatim 'sweep on every connect while the setting is on')")
  if (!squash(autoApprove).includes("api.permission.request.list({location:{directory:location.directory}},{signal})"))
    fail("3: auto-approve sweep permission.request.list anchor changed (per-location listing with abort signal)")
  if (!autoApprove.includes("never loaded"))
    fail("3: auto-approve lost the upstream-admitted never-loaded residual comment (F3: per-location aggregation)")
  if (!autoApprove.includes("async function sweepLocations(signal: AbortSignal)"))
    fail("3: auto-approve sweepLocations(signal) (session.active inventory) anchor changed")
  if (!autoApprove.includes("input.data.session.permission.list(session.id)"))
    fail("3: auto-approve lost the locally-loaded permission.list approve loop")
  if (!autoApprove.includes("dispatchSweep(on ? { type: \"sweep.start\", runId: uuid() } : { type: \"sweep.cancel\" })"))
    fail("3: auto-approve connect sweep must dispatch the sweep machine (sweep.start/sweep.cancel)")
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
    "1: linear permission.reply call sites form exactly the closed 1-file set {requests/model} (machine reply effect) with per-site shapes; data-layer session.permission.reply callers form the exact 2-file set {requests/auto-approve, shell/titlebar/inbox-model}; session-ui/ui zero-hit negative; data.ts wrapper (exact-2 callers) + connection.ts zero refs + client.tsx no .permission + protocol/plugin layers pinned; " +
    "2: asked/created id-dedup, replied/cancelled removal, settleForm form-side swallow with error.id gate, NotFound classified as already-replied (reply.succeeded) with real failures on reply.failed (v2.2.7 machine reclassification), thin newQuestionUI router + classic/experimental sending() guard surface, question/elicitation controllers carrying form.reply/cancel mutations + ScopedKey draft caches; " +
    "3: three connected-gate sync adjacent pairs in requests/model.ts, tab-strip running-conditioned staggered allSettled sync, auto-approve connect sweep (sweepLocations via session.active inventory) + never-loaded residual (F3); " +
    "4: autoApprove default false, ghost/neutral/submit variant sequence all disabled while responding, zero autoFocus in vendored session tree, no onKeyDown in permission dock, autoaccept toast keys en/zh paired (project.* pinned en-only); " +
    "5: six permission/form events + request/error types + reply endpoint paths in generated surfaces; " +
    "STATIC check - dock presentation, decision effects, recovery and client-exit red line on device are G21)",
)
