// verify-notifications.ts — static probe for issue #23 (task completion, permission,
// question, and error notifications), re-anchored to the v2.2.7 surface by issue #195.
//
// Asserts, against the REAL sources (vendored pin fedc6f208aa2… + the registered active
// mobile patches incl. notifications-v2-2-7, issue #195), first-party packages/mobile-hosts,
// the Android shell, web dist, and docs, the structural facts the notifications unit document
// relies on.
//
// DIVISION OF LABOR (per the in-registry dedup convention):
//   1. CROSS-REFERENCE re-checks (referencing, NOT first locks — the originals live
//      elsewhere): the coordinator claim-key template `opencode:notification-${kind}`
//      (first lock: audit-secret-persistence.ts registered-writer list — this probe
//      re-asserts the anchor only as an isolation fact, the claim table gained no writer),
//      the client-package pageLifecycle anchors (first locks: verify-session-workbench /
//      verify-recovery), the manifest permission set (pair -> triple with issue #71's
//      CAMERA) and onNewIntent/pendingRoute paired anchors (first locks: the issue
//      #23/#71-revised verify-pairing group 6 / group 3 and verify-interaction-quality
//      group 1 — re-asserted here in the same direction, the double-probe mutual-confirmation
//      the plan registered).
//   2. FIRST LOCKS here: the notification.tsx delivery-face reroute (M-023 re-derived by
//      notifications-v2-2-7, issue #195), the unified handleRequest trigger face (upstream
//      v2.2.7; the old M-023 permission fourth-branch is superseded by it), the bridge
//      contract (handshake/op whitelist/wire codes/route+bounds validation/silent
//      channels/VISIBILITY_PRIVATE/zero-action), the safety negatives (zero addAction /
//      zero .reply( in the notification domain / exact op param set), the POST_NOTIFICATIONS
//      face (M-024 four-switch wiring + user-in-foreground-only), the tap-route consumption
//      chain, the app-side i18n key family and the docs closure.
//   3. Domain note: the autoApproves( guard now lives inside upstream's unified handleRequest
//      pending() gate (the project-avatar-state precedent expression, upstream form) —
//      avatar-state itself is NOT re-asserted here (its probe coverage is unaffected).
//   4. Probe history: the #144 round pinned the session-workbench retirement of the delivery
//      face as NEGATIVE anchors; the #148 restore flipped groups 2/3/7 back to the positive
//      anchors of the original #23 shape. Issue #195 re-anchors the whole probe to the
//      v2.2.7 surface — the old->new ledger (old anchor -> new anchor):
//      a. notification.tsx isSessionUnread watermark -> the machine face (shell/notifications/
//         machine.ts exports isSessionUnread; notification.tsx imports and consumes it in
//         view(); the old inline `time.viewed === undefined || time.idle > time.viewed`
//         literal moved with it) + the view-report face grew `idle: effect.idle`.
//      b. coordinator hasFocus-only anchors -> the G33① backgrounded() helper (visibility
//         OR hasFocus, the #148 measured defect), syncFocus -> focused: !backgrounded()
//         (the v2.2.7 focus-lock-machine lifecycle replaced the old updateFocus/lock-request
//         faces; focus-lock-machine.ts is NOT modified) and the system() gate
//         `!backgrounded()` (old: `document.hasFocus() && document.visibilityState === "visible"`).
//      c. the M-023 handlePermissionAsked fourth listener -> upstream's unified
//         handleRequest(kind, sessionID, requestID) with the two-value category map
//         (question/mcp-elicitation -> "questions") and the R3 target resolution: the request
//         face passes `target` (the upstream-resolved root session), NOT sessionID.
//      d. `settings.notifications.permissions` reference set {settings page, notification.tsx}
//         -> {settings page} (notification.tsx now reads the toggle through the computed
//         `settings.notifications[category]()` trigger face; the v2.2.7 search catalog
//         carries the dashed data-action targets, not the accessor literal).
//      e. the wire-level api.permission.reply exhaustion {auto-approve, model} ->
//         {model.ts:1} wire-level + the data-layer wrapper pair {auto-approve, inbox-model}
//         (v2.2.7 auto-approve replies through data.session.permission.reply; consistent with
//         verify-permission-requests' closed sets, re-asserted in the same direction).
//      f. exactly-three categories -> exactly-four (questions adjacent to permissions; Kotlin
//         CATEGORIES mirror + the channelTitle questions branch, issue #195 commit 1).
//      g. dist constants 5520/155572926 (issue #190) -> 5630/155881892 (issue #195 measured;
//         prior pin 5630/155863020 = issue #194; the #193 settings rebuild moved the file
//         count 5520 -> 5630 between those pins).
//
// SCOPE NOTE: group 9 anchors the four commit-1 documents (units/notifications.md /
// interaction.md / architecture.md / design README.md) + recovery.md (commit 1). The
// build-and-verify.md #23 evidence section and the project-scope.md note are delivered in
// the FOLLOW-UP evidence commit — anchoring them here would make this probe fail at its
// own validation run (the same scoping every earlier probe uses).
//
// HONEST BOUNDARY (same tradition as the sibling probes): this is a static STRUCTURE
// check (text anchors / normalized cross-line scans / set equalities with an explicit
// receiver-tolerant caliber). It proves source and doc shape, NOT runtime behavior:
// foreground suppression reality, background delivery, tap routing, permission prompts,
// sound, lock-screen redaction and process-death behavior are covered by the G33 device
// gate (docs/design/interaction.md), BLOCKED at this verification level.
//
// Usage:
//   bun run scripts/verify-notifications.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-notifications: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

/** RAW caliber: whitespace/newline-insensitive containment for cross-line anchors. */
const raw = (text: string) => text.replace(/\s+/g, "")

// Recursive file listing under a repo-relative directory (stable sort for
// deterministic set assertions).
const listFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: new URL(current, repoRoot).pathname, dot: false }))
    for (const entry of entries) out.push(`${current}${entry}`)
  }
  return out.sort()
}

const NOTIFICATION_TSX = "vendor/upstream/packages/app/src/shell/notifications/notification.tsx"
const MACHINE_TS = "vendor/upstream/packages/app/src/shell/notifications/machine.ts"
const COORDINATOR = "vendor/upstream/packages/app/src/shell/notifications/coordinator.ts"
const FOCUS_LOCK_MACHINE = "vendor/upstream/packages/app/src/shell/notifications/focus-lock-machine.ts"
const WEB_TS = "vendor/upstream/packages/app/src/runtime/platform/web.ts"
const PLATFORM_TSX = "vendor/upstream/packages/app/src/runtime/platform/platform.tsx"
const SOUND_TS = "vendor/upstream/packages/app/src/shell/notifications/sound.ts"
const MODEL_TSX = "vendor/upstream/packages/app/src/settings/model.tsx"
const SETTINGS_NOTIF_TSX = "vendor/upstream/packages/app/src/settings/notifications/notifications.tsx"
const AUTO_APPROVE = "vendor/upstream/packages/app/src/session/requests/auto-approve.ts"
const REQUESTS_MODEL = "vendor/upstream/packages/app/src/session/requests/model.ts"
const INBOX_MODEL = "vendor/upstream/packages/app/src/shell/titlebar/inbox-model.ts"
const DOCK_TSX = "vendor/upstream/packages/app/src/session/requests/session-permission-dock.tsx"
const EN_I18N = "vendor/upstream/packages/app/src/runtime/i18n/en.ts"
const ZH_I18N = "vendor/upstream/packages/app/src/runtime/i18n/zh.ts"
const ENTRY_TSX = "vendor/upstream/packages/app/src/entry.tsx"
const APP_SRC = "vendor/upstream/packages/app/src/"
const SESSION_ROUTE = "vendor/upstream/packages/app/src/shell/routes/session.ts"
const ROUTES_TSX = "vendor/upstream/packages/app/src/shell/routes/routes.tsx"
const CONNECTION_TS = "vendor/upstream/packages/client/src/solid/connection.ts"
const TRANSPORT = "packages/mobile-hosts/src/notifications/transport.ts"
const CLIENT = "packages/mobile-hosts/src/notifications/client.ts"
const BRIDGE = "android/app/src/main/java/ai/opencode/mobile/notifications/NotificationsBridge.kt"
const MAIN_ACTIVITY = "android/app/src/main/java/ai/opencode/mobile/MainActivity.kt"
const MANIFEST = "android/app/src/main/AndroidManifest.xml"
const GRADLE = "android/app/build.gradle.kts"
const RECOVERY = "docs/design/recovery.md"
const DIST_MANIFEST = "web-dist/manifest.json"
const DIST_ASSETS = "vendor/upstream/packages/app/dist/_assets/"

// --- 1. Upstream notification face anchors (the closure carried the whole system) ---
{
  const notification = await read(NOTIFICATION_TSX)
  // The upstream event branches and their guard chains (upstream semantics unchanged by
  // the M-023 reroute — only the delivery face moved). v2.2.7 adds the unified
  // handleRequest monitors: permission.asked + form.created (question/mcp-elicitation/
  // websearch.provider kinds).
  for (const anchor of [
    'if (event.type === "session.execution.failed")',
    'if (event.type === "session.execution.succeeded")',
    'if (event.type === "permission.asked") {',
    'void handleRequest("permission", event.data.sessionID, event.data.id)',
    'const kind = event.data.form.metadata?.kind',
    'if (kind === "question" || kind === "mcp-elicitation" || kind === "websearch.provider") {',
    "void handleRequest(kind, event.data.form.sessionID, event.data.form.id)",
    "const hasOpenTab = sessionIDHasOpenTab(tabs.store, input.key, sessionID)",
    "hasOpenTab && settings.notifications.agent()",
    "hasOpenTab && settings.notifications.errors()",
    "settings.sounds.agentEnabled()",
    "settings.sounds.errorsEnabled()",
  ]) {
    if (!notification.includes(anchor)) fail(`1: notification.tsx lost the upstream anchor ${JSON.stringify(anchor)}`)
  }
  // openNotificationSession: the tab-API three-call sequence (upstream notification.test.ts
  // locks the ["add","route","select"] order; the function stays exported for it).
  for (const anchor of [
    "export function openNotificationSession(tabs: NotificationTabs, server: ServerConnection.Key, sessionID: string)",
    "tabs.addSessionTab({ server, sessionId: sessionID })",
    "tabs.rememberSessionRoute(tab, sessionID)",
    "tabs.select(tab)",
  ]) {
    if (!notification.includes(anchor)) fail(`1: notification.tsx lost the openNotificationSession anchor ${JSON.stringify(anchor)}`)
  }
  // The unread watermark + legacy migration faces. OLD->NEW (issue #195 re-anchor): the
  // watermark moved to the machine face at v2.2.7 — machine.ts exports isSessionUnread
  // (the server-authoritative `time.viewed === undefined || time.idle > time.viewed`
  // literal lives there now); notification.tsx imports it and consumes it in view().
  if (!notification.includes("isSessionUnread,"))
    fail("1: notification.tsx lost the isSessionUnread import (old->new issue #195: the watermark moved to the machine face)")
  if (!notification.includes("if (idle === undefined || !isSessionUnread(session)) return"))
    fail("1: notification.tsx lost the isSessionUnread consumption in view()")
  const machine = await read(MACHINE_TS)
  for (const anchor of [
    "export function isSessionUnread(session?: { readonly time: SessionTime }) {",
    "return time?.idle !== undefined && (time.viewed === undefined || time.idle > time.viewed)",
    "export function selectSessionUnread(state: LegacyMigrationState, session?: UnreadSession) {",
  ]) {
    if (!machine.includes(anchor)) fail(`1: machine.ts lost the server-authoritative watermark anchor ${JSON.stringify(anchor)} (old->new issue #195: the watermark face moved here from notification.tsx)`)
  }
  if (!notification.includes("void input.sdk.api.session.view({ sessionID: root, idle: effect.idle }).then("))
    fail("1: notification.tsx lost the session.view report face (old->new issue #195: v2.2.7 grew idle: effect.idle)")

  const coordinator = await read(COORDINATOR)
  for (const anchor of [
    "const MAX_CLAIMED = 500",
    "const once = async <T>(kind: ",
    "navigator.locks",
    // mobile(#148 G33①) re-derived on the focus-lock-machine lifecycle (issue #195): the
    // backgrounded() helper, the syncFocus dispatch and the system() delivery gate.
    "const backgrounded = () =>",
    'typeof document !== "undefined" && (document.visibilityState !== "visible" || !document.hasFocus())',
    "focused: !backgrounded()",
    'if (typeof document !== "undefined" && !backgrounded()) return',
    "// mobile(#148 G33①): the Android WebView keeps document.hasFocus() TRUE while the",
    "measured 2026-11-07, MatePad DBY2-AL00: 0 false samples",
    "hasWindowFocus → {posted:false, code:\"foreground\"}) stays the second layer",
  ]) {
    if (!coordinator.includes(anchor)) fail(`1: coordinator.ts lost the anchor ${JSON.stringify(anchor)}`)
  }
  // The focus-lock-machine itself is NOT modified by the G33① re-derivation (red line):
  // the machine file must not carry the mobile() marker.
  if ((await read(FOCUS_LOCK_MACHINE)).includes("mobile("))
    fail("1: focus-lock-machine.ts gained a mobile( marker — the G33① re-derivation must not touch the machine (issue #195 red line)")
  // CROSS-REFERENCE (first lock: audit-secret-persistence.ts registered-writer list):
  // the claim-key template survives unchanged — this issue's dedup table gained no writer.
  if (!coordinator.includes("`opencode:notification-${kind}`"))
    fail("1: coordinator.ts lost the claim-key template (cross-reference with audit-secret-persistence.ts)")

  // The structural dead point the M-023 reroute routes around: the web platform notify face
  // (web.ts notify at :46 on the v2.2.7 tree — the early return is the dead point).
  const web = await read(WEB_TS)
  if (!web.includes('if (!("Notification" in window)) return'))
    fail("1: web.ts lost the Web Notification API early return (the structural dead point the unit document describes)")
  const platform = await read(PLATFORM_TSX)
  if (!platform.includes("notify(title: string, description?: string, onClick?: () => void): Promise<void>"))
    fail("1: platform.tsx lost the notify signature (the title/description/onClick shape the M-023 selection note rests on)")
  const sound = await read(SOUND_TS)
  if (!sound.includes("new Audio("))
    fail("1: sound.ts lost the Audio playback path (the single sound source; channels stay silent)")
}

// --- 2. The unified handleRequest trigger face and the M-023 delivery reroute ---
{
  // Reference-face set equality: `settings.notifications.permissions` (the literal
  // accessor string) appears in EXACTLY the settings page at v2.2.7.
  // OLD->NEW (issue #195): notification.tsx left the literal set — the v2.2.7 trigger
  // reads the toggle through the computed `settings.notifications[category]()` face
  // (anchored below); the search catalog carries the dashed data-action targets
  // ("settings-notifications-permissions"), not the accessor literal. The definition
  // faces in model.tsx use the store form and are anchored separately.
  const appFiles = (await listFiles(APP_SRC)).filter((file) => /\.(ts|tsx)$/.test(file))
  if (appFiles.length < 500) fail(`2: app/src scan resolved only ${appFiles.length} files (glob broken)`)
  for (const key of ["settings.notifications.permissions", "settings.notifications.questions"]) {
    const consumers: string[] = []
    for (const file of appFiles) {
      const content = await read(file)
      if (content.includes(key)) consumers.push(file)
    }
    const expected = [SETTINGS_NOTIF_TSX]
    if (consumers.length !== expected.length || consumers.some((file, i) => file !== expected[i]))
      fail(`2: ${key} reference set changed (old->new issue #195: expected exactly ${expected.join(", ")}; got ${consumers.join(", ")})`)
  }
  const model = await read(MODEL_TSX)
  for (const anchor of [
    "permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions)",
    "questions: withFallback(() => store.notifications?.questions, defaultSettings.notifications.questions)",
  ]) {
    if (!model.includes(anchor)) fail(`2: settings/model.tsx lost the notification accessor definition face ${JSON.stringify(anchor)}`)
  }

  // The unified handleRequest (upstream v2.2.7; superseded the M-023 permission
  // fourth-branch listener): the two-value category map, the R3 target resolution and the
  // pending() guard chain (open-tab × settings toggle × autoApproves).
  const notification = await read(NOTIFICATION_TSX)
  for (const anchor of [
    "const handleRequest = async (kind: keyof typeof requestTitles, sessionID: string, requestID: string) => {",
    'const category = kind === "question" || kind === "mcp-elicitation" ? "questions" : "permissions"',
    "const target = sessionIDHasOpenTab(tabs.store, input.key, sessionID)",
    "? sessionID",
    ": input.data.session.root(sessionID)",
    "if (!sessionIDHasOpenTab(tabs.store, input.key, target)) return",
    "if (settings.permissions.autoApproves(projectSettingsKey(input.sdk.scope, session.projectID))) return false",
    "if (!settings.notifications[category]()) return",
    "if (settings.sounds[`${category}Enabled`]()) {",
    "if (pending()) return playSoundById(settings.sounds[category]())",
    "const key = `${input.key}\\0${kind}:${requestID}`",
  ]) {
    if (!notification.includes(anchor)) fail(`2: notification.tsx lost the unified handleRequest anchor ${JSON.stringify(anchor)}`)
  }
  // The requestTitles two-value map: permission/websearch.provider share the permission
  // title; question and mcp-elicitation map to the question/elicitation titles — the
  // upstream source of the "questions" category this probe locks in group 3.
  for (const anchor of [
    'permission: "notification.permission.title",',
    'question: "notification.question.title",',
    '"mcp-elicitation": "notification.elicitation.title",',
    '"websearch.provider": "notification.permission.title",',
  ]) {
    if (!notification.includes(anchor)) fail(`2: notification.tsx lost the requestTitles map anchor ${JSON.stringify(anchor)}`)
  }
  // The target-form delivery faces (hasRunningChild subagent guard + the coordinator
  // sound/system pairs) PLUS the M-023 bridge delivery (platform.notify is the structural
  // dead point documented in group 1 — it no longer appears in notification.tsx at all).
  for (const anchor of [
    "hasOpenTab && settings.notifications.agent()",
    "hasOpenTab && settings.notifications.errors()",
    "function hasRunningChild(data: Data, sessionID: string) {",
    "if (hasRunningChild(input.data, sessionID)) return",
    'language.t("notification.session.responseReady.title")',
    'language.t("notification.session.error.title")',
  ]) {
    if (!notification.includes(anchor)) fail(`2: notification.tsx lost the target-form delivery anchor ${JSON.stringify(anchor)}`)
  }
  // The M-023 delivery face (re-derived by notifications-v2-2-7, issue #195): all three
  // faces deliver through the bridge port with JS-built sessionHref routes; the request
  // face passes `target` — the upstream-resolved root session — NOT sessionID (R3: tap
  // routing must match upstream navigation exactly), so its route anchor is the target form.
  for (const anchor of [
    "activeNotificationsPort().notify({",
    'category: "agent",',
    'category: "errors",',
    "category,",
    "route: sessionHref(input.key, sessionID),",
    "route: sessionHref(input.key, target),",
    "// mobile(M-023): deliver through the notifications bridge (issue #23) — the",
    "`target` — the upstream-resolved root session — NOT sessionID",
  ]) {
    if (!notification.includes(anchor)) fail(`2: notification.tsx lost the M-023 delivery-face anchor ${JSON.stringify(anchor)}`)
  }
  if ((notification.match(/route: sessionHref\(input\.key, sessionID\),/g) ?? []).length !== 2)
    fail("2: notification.tsx sessionID-route face count changed (expected exactly 2 = agent + errors; the request face routes to target)")
  if ((notification.match(/route: sessionHref\(input\.key, target\),/g) ?? []).length !== 1)
    fail("2: notification.tsx target-route face count changed (expected exactly 1 = the unified request face; R3 tap-routing pin)")
  if (notification.includes("platform.notify("))
    fail("2: notification.tsx still delivers through platform.notify (the structural dead point; the M-023 bridge reroute is the delivery face)")
  if ((notification.match(/input\.coordinator\.sound\(/g) ?? []).length !== 3)
    fail("2: notification.tsx coordinator sound faces changed (expected exactly 3 = agent + errors + requests)")
  if ((notification.match(/input\.coordinator\.system\(/g) ?? []).length !== 3)
    fail("2: notification.tsx coordinator system faces changed (expected exactly 3 = agent + errors + requests)")

  // The approval-path exhaustion (#10 authoritative; OLD->NEW issue #195 re-partition at
  // v2.2.7): the wire-level api.permission.reply call site is EXACTLY model.ts:1 (the dock
  // decide() machine effect), and auto-approve now replies through the data-layer wrapper
  // alongside the Inbox — the closed pair {auto-approve, inbox-model}. The notification
  // face is in neither set (group 4's .reply( negative keeps it navigation-only either
  // way). Same direction as verify-permission-requests' closed sets (double-probe
  // mutual-confirmation; that probe is the first lock).
  const wireHits: Record<string, number> = {}
  const dataHits: Record<string, number> = {}
  for (const file of appFiles) {
    const content = raw(await read(file))
    const wire = (content.match(/api\.permission\.reply\(/g) ?? []).length
    const data = (content.match(/session\.permission\.reply\(/g) ?? []).length
    if (wire > 0) wireHits[file] = wire
    if (data > 0) dataHits[file] = data
  }
  const wireExpected: Record<string, number> = { [REQUESTS_MODEL]: 1 }
  const dataExpected: Record<string, number> = { [AUTO_APPROVE]: 1, [INBOX_MODEL]: 1 }
  const setMatches = (got: Record<string, number>, expected: Record<string, number>) =>
    JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(expected).sort()) &&
    Object.values(got).reduce((a, b) => a + b, 0) === Object.values(expected).reduce((a, b) => a + b, 0)
  if (!setMatches(wireHits, wireExpected))
    fail(`2: the wire-level api.permission.reply exhaustion changed (old->new issue #195: expected exactly {model.ts:1}; got ${JSON.stringify(wireHits)})`)
  if (!setMatches(dataHits, dataExpected))
    fail(`2: the data-layer session.permission.reply wrapper caller set changed (old->new issue #195: expected exactly {auto-approve, inbox-model}; got ${JSON.stringify(dataHits)})`)

  // The sound event faces: notification.tsx carries exactly the three event faces (agent +
  // errors + requests — the request sound face rides the unified handleRequest); the
  // settings preview in controllers.ts is the declared non-event face.
  if ((notification.match(/playSoundById\(/g) ?? []).length !== 3)
    fail("2: notification.tsx playSoundById event faces changed (expected exactly 3 = agent + errors + requests)")
  const soundWriters: string[] = []
  for (const file of appFiles) {
    if ((await read(file)).includes("playSoundById")) soundWriters.push(file)
  }
  // Issue #67: host-apis.tsx (runtime/plugin) joins the playSoundById consumer set
  // (the notification sound plays from the plugin host's notify flow).
  const soundExpected = [NOTIFICATION_TSX, SOUND_TS, "vendor/upstream/packages/app/src/settings/general/controllers.ts", "vendor/upstream/packages/app/src/runtime/plugin/host-apis.tsx"].sort()
  if (soundWriters.length !== soundExpected.length || soundWriters.some((file, i) => file !== soundExpected[i]))
    fail(`2: playSoundById file set changed (expected exactly ${soundExpected.join(", ")}; got ${soundWriters.join(", ")})`)

  // The dock title i18n key consumer set: the dock + the notification face (the request
  // titles map); the question/elicitation titles are notification.tsx-exclusive. The
  // runtime/i18n/ definition domain (en/zh + locales carrying the key STRING as a
  // definition) is outside this consumption set by design.
  const titleConsumers: string[] = []
  for (const file of appFiles) {
    if (file.includes("runtime/i18n/")) continue
    if ((await read(file)).includes("notification.permission.title")) titleConsumers.push(file)
  }
  const titleExpected = [DOCK_TSX, NOTIFICATION_TSX]
  if (titleConsumers.length !== titleExpected.length || titleConsumers.some((file, i) => file !== titleExpected[i]))
    fail(`2: notification.permission.title consumer set changed (expected exactly ${titleExpected.join(", ")}; got ${titleConsumers.join(", ")})`)
  for (const key of ["notification.question.title", "notification.elicitation.title", "notification.session.responseReady.title", "notification.session.error.title"]) {
    const keyConsumers: string[] = []
    for (const file of appFiles) {
      if (file.includes("runtime/i18n/")) continue
      if ((await read(file)).includes(key)) keyConsumers.push(file)
    }
    if (keyConsumers.length !== 1 || keyConsumers[0] !== NOTIFICATION_TSX)
      fail(`2: ${key} consumer set changed (expected exactly notification.tsx; got ${keyConsumers.join(", ")})`)
  }

  // The M-023 import face: projectSettingsKey rejoins the settings import (the
  // autoApproves guard upstream form) and the bridge seam + route builder imports return.
  for (const anchor of [
    'import { projectSettingsKey, useSettings } from "@/settings/model"',
    'import { activeNotificationsPort } from "@opencode-mobile/mobile-hosts"',
    'import { sessionHref } from "@/shell/routes/session"',
  ]) {
    if (!notification.includes(anchor))
      fail(`2: notification.tsx lost the M-023 import anchor ${JSON.stringify(anchor)}`)
  }
}

// --- 3. Bridge contract (the sixth protocol-isolated sibling) ---
{
  // Six handshake strings pairwise distinct (extracted from the six transport sources).
  const handshakeFiles: [string, RegExp][] = [
    ["packages/mobile-hosts/src/vault/transport.ts", /VAULT_HANDSHAKE = "([^"]+)"/],
    ["packages/mobile-hosts/src/probe.ts", /PROBE_HANDSHAKE = "([^"]+)"/],
    ["packages/mobile-hosts/src/ssh/bridge.ts", /SSH_HANDSHAKE = "([^"]+)"/],
    ["packages/mobile-hosts/src/service-ops/bridge.ts", /SVCOPS_HANDSHAKE = "([^"]+)"/],
    ["packages/mobile-hosts/src/files/transport.ts", /FILES_HANDSHAKE = "([^"]+)"/],
    [TRANSPORT, /NOTIFICATIONS_HANDSHAKE = "([^"]+)"/],
  ]
  const handshakes: string[] = []
  for (const [file, pattern] of handshakeFiles) {
    const match = pattern.exec(await read(file))
    if (!match) fail(`3: could not extract the handshake constant from ${file}`)
    handshakes.push(match![1]!)
  }
  if (new Set(handshakes).size !== 6)
    fail(`3: the six bridge handshakes must be pairwise distinct, got ${JSON.stringify(handshakes)}`)
  if (!handshakes.includes("opencode-mobile-notifications-handshake"))
    fail("3: the notifications handshake literal moved")

  const client = await read(CLIENT)
  // The op whitelist, exactly two ops on both sides.
  if (!client.includes('transport.request("requestPermission", {})')) fail("3: client.ts lost the requestPermission op face")
  if (!client.includes('transport.request("notify", {')) fail("3: client.ts lost the notify op face")
  const bridge = await read(BRIDGE)
  if (!bridge.includes('private val OPERATIONS = setOf("notify", "requestPermission")'))
    fail("3: NotificationsBridge.kt lost the two-op whitelist")

  // The notify op param set is EXACTLY {category, title, body, route} (normalized
  // cross-line anchor — an injected fifth field, e.g. a credential-shaped one, fails here).
  if (!raw(client).includes('transport.request("notify",{category:op.category,title:op.title,body:op.body,route:op.route,})'))
    fail("3: the notify op param set changed (expected exactly {category, title, body, route})")

  // The four-code taxonomy, both sides, canonical order on the JS side.
  if (!client.includes('= [\n  "unavailable",\n  "permission",\n  "foreground",\n  "io",\n] as const'))
    fail("3: client.ts lost the canonical four-code taxonomy")
  if (!bridge.includes('private val ERROR_CODES = setOf("unavailable", "permission", "foreground", "io")'))
    fail("3: NotificationsBridge.kt lost the mirrored four-code set")

  // Two-layer validation: route whitelist regex + bounds, JS layer and Kotlin mirror
  // (the JS literal escapes the slashes; the Kotlin string form does not).
  if (!client.includes("^\\/server\\/[A-Za-z0-9_-]{1,512}\\/session\\/[A-Za-z0-9_-]{1,128}$"))
    fail("3: client.ts lost the session-route whitelist regex")
  if (!bridge.includes("^/server/[A-Za-z0-9_-]{1,512}/session/[A-Za-z0-9_-]{1,128}$"))
    fail("3: NotificationsBridge.kt lost the session-route whitelist regex")
  for (const [content, label] of [
    [client, "client.ts"],
    [bridge, "NotificationsBridge.kt"],
  ] as const) {
    if (!content.includes("128")) fail(`3: ${label} lost the title bound`)
    if (!content.includes("256")) fail(`3: ${label} lost the body bound`)
  }
  if (!client.includes("export const TITLE_MAX = 128") || !client.includes("export const BODY_MAX = 256"))
    fail("3: client.ts lost the exported bounds")
  // OLD->NEW (issue #195): exactly-four categories on both sides, questions adjacent to
  // permissions (the settings row order / the requestTitles two-value map).
  if (!client.includes('export const NOTIFICATION_CATEGORIES = ["agent", "permissions", "questions", "errors"] as const'))
    fail("3: client.ts lost the exactly-four category set (old->new issue #195: questions adjacent to permissions)")
  if (!bridge.includes('private val CATEGORIES = setOf("agent", "permissions", "questions", "errors")'))
    fail("3: NotificationsBridge.kt lost the mirrored four-category set (issue #195)")
  // The questions channel: lazy one-time creation via ensureChannel (existing channels
  // untouched — Android channel semantics make them immutable after creation) and the
  // fixed questions title branch, with the else -> errors fallback preserved.
  if (!bridge.includes('"questions" -> "$CHANNEL_GROUP (questions)"'))
    fail("3: NotificationsBridge.kt lost the questions channel-title branch (issue #195)")
  if (!bridge.includes('else -> "$CHANNEL_GROUP (errors)"'))
    fail("3: NotificationsBridge.kt lost the else -> errors channel-title fallback")

  // Fail-closed stub semantics (equivalent to the pre-issue WebView dead point).
  if (!client.includes('notify: async () => ({ posted: false, code: "unavailable" })'))
    fail("3: client.ts lost the fail-closed notify stub")
  if (!client.includes('requestPermission: async () => ({ granted: false, code: "unavailable" })'))
    fail("3: client.ts lost the fail-closed requestPermission stub")

  // The module-level seam (app-service-operations-bridge/files-platform-bridge precedent): three functions.
  for (const anchor of [
    "export function setActiveNotificationsPort(port: NotificationsPort | undefined): void",
    "export function activeNotificationsPort(): NotificationsPort {",
    "export function notificationsBridgeInjected(): boolean {",
  ]) {
    if (!client.includes(anchor)) fail(`3: client.ts lost the seam function ${JSON.stringify(anchor)}`)
  }

  // Silent channels + private visibility + auto-cancel + zero-action on the Kotlin side.
  for (const anchor of [
    'private const val CHANNEL_PREFIX = "notifications-"',
    "channel.setSound(null, null)",
    "NotificationManager.IMPORTANCE_DEFAULT",
    ".setVisibility(Notification.VISIBILITY_PRIVATE)",
    ".setAutoCancel(true)",
  ]) {
    if (!bridge.includes(anchor)) fail(`3: NotificationsBridge.kt lost the channel/visibility anchor ${JSON.stringify(anchor)}`)
  }
  // The dist marker constant (mobile(notifications-v1)).
  const transport = await read(TRANSPORT)
  if (!transport.includes('"mobile(notifications-v1): notifications bridge transport over the platform web message channel"'))
    fail("3: transport.ts lost the mobile(notifications-v1) dist marker string")
  // The source-comment markers (minifier-stripped; asserted against SOURCE only).
  const entry = await read(ENTRY_TSX)
  const notificationSource = await read(NOTIFICATION_TSX)
  if (!entry.includes("// mobile(M-022): the notifications bridge (issue #23) — the SIXTH protocol-isolated"))
    fail("3: entry.tsx lost the mobile(M-022) source marker comment")
  if (!entry.includes("setActiveNotificationsPort(\n      createNotificationsClient(\n        createWebMessageNotificationsTransport({"))
    fail("3: entry.tsx lost the notifications-v2-2-7 seam registration shape")
  if (!notificationSource.includes("// mobile(M-023)"))
    fail("3: notification.tsx lost the mobile(M-023) source markers (re-derived by notifications-v2-2-7, issue #195)")
}

// --- 4. Safety negatives (no notification may approve a permission or stop a task) ---
{
  const bridge = await read(BRIDGE)
  const notification = await read(NOTIFICATION_TSX)
  // Zero action buttons / remote views on the native side — the only interaction is the
  // contentIntent navigation. (Call-form anchors: the class doc's own "ZERO addAction
  // calls" declaration must not self-trip the negative.)
  if (/\.addAction\(|RemoteViews/.test(bridge))
    fail("4: NotificationsBridge.kt gained addAction/RemoteViews — a notification with actions could imply approval/stop affordances; re-review units/notifications.md §⑧ before keeping it")
  // The notification domain (delivery face + native bridge) never touches the approval
  // wire: zero .reply( call faces.
  if (/\.reply\(/.test(notification))
    fail("4: notification.tsx gained a .reply( call face — the approval wire-level exhaustion is locked elsewhere (group 2); the notification face must stay navigation-only")
  if (/\.reply\(/.test(bridge))
    fail("4: NotificationsBridge.kt gained a .reply( call face — the bridge is notification-ONLY by contract")
  // Zero remote-call surface: the bridge posts LOCAL system notifications only — no HTTP
  // client of any shape (this is what makes "a notification can never stop a task"
  // structural), and no interrupt-shaped op string beyond the two-op whitelist (group 3
  // locks the set equality).
  if (/HttpURLConnection|java\.net|okhttp|retrofit|"interrupt"/.test(bridge))
    fail("4: NotificationsBridge.kt gained a network/interrupt surface — the bridge is local-notification-only")
  // Zero-value logging (the five-bridge house rule, mirrored): fixed tags + op names only.
  if (!bridge.includes("Zero-value logging: logs carry fixed tags and op names only — never a route, a title,"))
    fail("4: NotificationsBridge.kt lost the zero-value logging class-doc anchor")
  if (/Log\.[iw]\(TAG, "[^"]*(route|title|body)[^"]*"/.test(bridge))
    fail("4: NotificationsBridge.kt log lines must not name route/title/body values")
  // The op payload never carries credential-shaped fields (JS layer; the exact param-set
  // anchor in group 3 is the structural lock, this is the drift sentinel for the file).
  const client = await read(CLIENT)
  if (/password|apiKey|api_key|secret/i.test(client))
    fail("4: notifications/client.ts gained a credential-shaped identifier — the op payload is {category, title, body, route} ONLY")
  // password|apiKey|secret|authToken shapes (the class doc's "credential vault bridge"
  // protocol-isolation reference is not a secret carrier and is excluded by the pattern).
  if (/password|apiKey|api_key|secret|authToken/i.test(bridge))
    fail("4: NotificationsBridge.kt gained a credential-shaped identifier — notifications carry no secrets")
}

// --- 5. The POST_NOTIFICATIONS face (manifest + user-in-foreground request) ---
{
  const manifest = await read(MANIFEST)
  if (!manifest.includes('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'))
    fail("5: AndroidManifest.xml lost the POST_NOTIFICATIONS permission")
  // Issue #71 revision (deliberate, NOT a bypass): exactly-2 -> exactly-3 — issue #71
  // added CAMERA (the WebView pairing-scan camera, runtime-granted in-app only via
  // onPermissionRequest; first locks: verify-pairing group 6 / verify-interaction-quality
  // group 1 — re-asserted here in the same direction, the double-probe convention).
  if ((manifest.match(/<uses-permission /g) ?? []).length !== 3)
    fail("5: AndroidManifest.xml uses-permission count changed (expected exactly 3 = INTERNET + POST_NOTIFICATIONS + CAMERA; issue #71 added the latter)")

  const bridge = await read(BRIDGE)
  for (const anchor of [
    'activity.requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), REQUEST_NOTIFICATIONS)',
    "manager?.areNotificationsEnabled() == true",
    "!manager.areNotificationsEnabled()",
    'respondError(requestId, "foreground")',
    "const val REQUEST_NOTIFICATIONS = 41003",
  ]) {
    if (!bridge.includes(anchor)) fail(`5: NotificationsBridge.kt lost the permission-face anchor ${JSON.stringify(anchor)}`)
  }
  // The background-arrival refusal: the hasWindowFocus guard sits BETWEEN the granted
  // checks and the main-thread dialog start (order asserted).
  const grantedAt = bridge.indexOf("manager?.areNotificationsEnabled() == true")
  const focusAt = bridge.indexOf("if (!activity.hasWindowFocus()) {")
  const dialogAt = bridge.indexOf("activity.requestPermissions(")
  if (grantedAt < 0 || focusAt < 0 || dialogAt < 0 || !(grantedAt < focusAt && focusAt < dialogAt))
    fail("5: the requestPermission ordering changed (granted checks -> foreground refusal -> dialog start)")

  // The settings-notification-permission face (M-024 re-based over the v2.2.7 four-switch
  // page, issue #195): the verbatim request/apply/describe helpers, ALL FOUR switches
  // wrapped (agent/permissions/errors direct; questions via the hideLabel+children form —
  // the wrapper touches only onChange), the explicit status row + user-in-foreground
  // framing. The page also carries the restored sounds-interface row (the search row's
  // real page anchor — the three anchors double-probed in verify-settings-framework group 5).
  const settings = await read(SETTINGS_NOTIF_TSX)
  for (const anchor of [
    "const requestAndroidPermissionIfNeeded = async () => {",
    "activeNotificationsPort().requestPermission()",
    "const onNotificationSwitch = (apply: (checked: boolean) => void) => (checked: boolean) => {",
    "if (checked) void requestAndroidPermissionIfNeeded()",
    '"settings.general.notifications.android.granted"',
    '"settings.general.notifications.android.denied"',
    '"settings.general.notifications.android.unavailable"',
    'data-action="settings-sounds-interface"',
    "settings.sounds.interfaceEnabled()",
    "settings.sounds.setInterfaceEnabled(",
    // The four wrapped switches (issue #195: the questions switch rides the same wrapper;
    // the hideLabel+children form is preserved — the wrapper touches only onChange).
    "onChange={onNotificationSwitch((checked) => settings.notifications.setAgent(checked))}",
    "onChange={onNotificationSwitch((checked) => settings.notifications.setPermissions(checked))}",
    "onChange={onNotificationSwitch((checked) => settings.notifications.setQuestions(checked))}",
    "onChange={onNotificationSwitch((checked) => settings.notifications.setErrors(checked))}",
    "hideLabel",
    '{language.t("settings.general.notifications.questions.title")}',
    // The status-only row after the errors row.
    'title={language.t("settings.general.notifications.android.title")}',
    "description={language.t(androidPermissionDescription())}",
  ]) {
    if (!settings.includes(anchor)) fail(`5: settings/notifications/notifications.tsx lost the settings-notification-permission anchor ${JSON.stringify(anchor)}`)
  }
  if ((settings.match(/onNotificationSwitch\(\(checked\)/g) ?? []).length !== 4)
    fail("5: the wrapped notification switch count changed (expected exactly 4 = agent + permissions + questions + errors, issue #195 four-switch re-base)")
  const en = await read(EN_I18N)
  const zh = await read(ZH_I18N)
  for (const key of [
    '"settings.general.notifications.android.title"',
    '"settings.general.notifications.android.description"',
    '"settings.general.notifications.android.granted"',
    '"settings.general.notifications.android.denied"',
    '"settings.general.notifications.android.unavailable"',
  ]) {
    if (!en.includes(key)) fail(`5: en.ts lost the settings-notification-permission i18n key ${key}`)
    if (!zh.includes(key)) fail(`5: zh.ts lost the settings-notification-permission i18n key ${key}`)
  }
}

// --- 6. Tap routing (in-app PendingIntent navigation; zero deep link) ---
{
  const sessionRoute = await read(SESSION_ROUTE)
  for (const anchor of [
    "export function sessionHref(server: ServerConnection.Key, sessionID: string) {",
    "return `/server/${base64Encode(server)}/session/${sessionID}`",
    "if (!key || base64Encode(key) !== segment) throw new Error(",
  ]) {
    if (!sessionRoute.includes(anchor)) fail(`6: shell/routes/session.ts lost the anchor ${JSON.stringify(anchor)}`)
  }
  const routes = await read(ROUTES_TSX)
  if (!routes.includes('path="/server/:serverKey/session/:id"'))
    fail("6: routes.tsx lost the session route mount")

  const main = await read(MAIN_ACTIVITY)
  // The paired anchor (same direction as the revised verify-pairing group 3 — double-probe
  // mutual confirmation): onNewIntent exists ONLY alongside the pendingRoute consumer.
  if (/onNewIntent/.test(main) && !/pendingRoute/.test(main))
    fail("6: MainActivity.kt gained onNewIntent without the pendingRoute internal-route anchor")
  for (const anchor of [
    "override fun onNewIntent(intent: Intent) {",
    "setIntent(intent)",
    "private fun consumePendingRoute() {",
    "webView.loadUrl(START_URL + route)",
    "NotificationsBridge.REQUEST_NOTIFICATIONS",
    "notificationsBridge?.onPermissionResult(",
    "notificationsBridge = NotificationsBridge(this, webView)",
    "notificationsBridge?.onPageFinished()",
    "notificationsBridge?.destroy()",
  ]) {
    if (!main.includes(anchor)) fail(`6: MainActivity.kt lost the wiring anchor ${JSON.stringify(anchor)}`)
  }

  const bridge = await read(BRIDGE)
  for (const anchor of [
    "PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT",
    "addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)",
    'const val EXTRA_ROUTE = "opencode.mobile.notifications.route"',
    'val route = params.optString("route")',
    "manager.notify(category, route.hashCode(), notification)",
  ]) {
    if (!bridge.includes(anchor)) fail(`6: NotificationsBridge.kt lost the routing anchor ${JSON.stringify(anchor)}`)
  }

  // NEGATIVE sentinels: the shell stays launch-only (zero passive import).
  const manifest = await read(MANIFEST)
  if (/android\.intent\.action\.VIEW/.test(manifest))
    fail("6: AndroidManifest.xml gained a VIEW intent-filter — the notification tap is in-app PendingIntent navigation; external launch stays banned")
  if (!main.includes("deep links"))
    fail("6: MainActivity.kt lost the deep-links TODO comment (the no-deep-link declaration anchor)")
}

// --- 7. Dedup/idempotency and the best-effort delivery boundary ---
{
  // CROSS-REFERENCE declaration: the coordinator dedup anchors are first-locked in group 1
  // (this probe) and the claim-key template's writer list lives in
  // audit-secret-persistence.ts — no new writer, no re-lock here.
  const notification = await read(NOTIFICATION_TSX)
  // The merged form carries exactly 6 once-call faces (sound+system × agent/errors/
  // requests — the request pair rides the unified handleRequest).
  const onceCalls = (notification.match(/input\.coordinator\.(sound|system)\(/g) ?? []).length
  if (onceCalls !== 6)
    fail(`7: notification.tsx coordinator once-call faces changed (expected exactly 6 = sound+system x agent/errors/requests; got ${onceCalls})`)

  // The upstream best-effort truth, verbatim (the honest-boundary quote source; the
  // comment wraps across two lines upstream — the second line is the anchor).
  const connection = await read(CONNECTION_TS)
  if (!connection.includes("dies while the page is suspended, and the browser may never report that on the hung read."))
    fail("7: client/src/solid/connection.ts lost the page-suspension comment (the reliable-delivery boundary's upstream quote)")

  // The native second-layer front-focus recheck (does not rely on the JS assumption).
  const bridge = await read(BRIDGE)
  if (!bridge.includes("if (activity.hasWindowFocus()) {"))
    fail("7: NotificationsBridge.kt lost the native hasWindowFocus re-check")
  if (!bridge.includes('respondError(requestId, "foreground")'))
    fail("7: NotificationsBridge.kt lost the foreground refusal answer")

  // The recovery.md claim-table row (commit-1 D8).
  const recovery = await read(RECOVERY)
  if (!recovery.includes("| 通知去重 claim 表（issue #23 增行） |"))
    fail("7: recovery.md lost the notification claim-table row")
  if (!recovery.includes("不恢复仅防重"))
    fail("7: recovery.md lost the claim-table restore-timing wording")
}

// --- 8. Build and dist baseline ---
{
  // AndroidX WebKit is the single deliberate AndroidX dependency for the vault boundary.
  const gradle = await read(GRADLE)
  for (const anchor of [
    'implementation("org.nanohttpd:nanohttpd:2.3.1")',
    'implementation("com.github.mwiede:jsch:2.28.8")',
    'implementation("androidx.webkit:webkit:1.14.0")',
  ]) {
    if (!gradle.includes(anchor)) fail(`8: build.gradle.kts lost the dependency baseline anchor ${JSON.stringify(anchor)}`)
  }

  // Current baseline is read from a fresh Vite build of the tracked source tree.
  // The settings-mobile-gui-plugins/connection-initial-ssh-entry/connection-method-layout values below in comments/docs remain historical measurements.
  const distManifest = JSON.parse(await read(DIST_MANIFEST)) as { fileCount?: number; totalBytes?: number }
  // Issue #190 measured: the files/diff/review consolidated round
  // (files-diff-review-v2-2-7: pierre shiki-js engine + bundled theme pair, worker
  // failed-pool guard, web.ts openExternal files-bridge hunk, artifact.test cases)
  // rebuilt the payload to 5520/155572926 — same 5520 file count as the #188 build,
  // +7915 bytes of vendor delta inside existing chunks (the pierre comment block and
  // the shiki engine switch ride the existing session-ui/review chunks); prior pin
  // 5622/150022223 = issue #149.
  // Issue #195 measured (commit-3 rebuild): the notifications re-base
  // (notifications-v2-2-7: M-022 entry registration + M-023 bridge-delivery faces +
  // M-024 POST_NOTIFICATIONS face/status row + the five en/zh android.* keys) plus
  // the commit-1 four-category mobile-hosts constant rebuilt the payload to
  // 5630/155881892 — same 5630 file count as the #194 build, +18872 bytes of source
  // delta inside existing chunks; prior pin 5630/155863020 = issue #194.
  if (distManifest.fileCount !== 5630)
    fail(`8: current web-dist fileCount drifted (expected 5630, got ${String(distManifest.fileCount)})`)
  if (distManifest.totalBytes !== 155881892)
    fail(`8: current web-dist totalBytes drifted (expected 155881892, got ${String(distManifest.totalBytes)})`)
  // Dist markers, staged on a built dist (skipped when no build exists).
  const distUrl = new URL(DIST_ASSETS, repoRoot).pathname
  let distFiles: string[] = []
  try {
    distFiles = await Array.fromAsync(new Bun.Glob("*.js").scan({ cwd: distUrl }))
  } catch {
    distFiles = []
  }
  if (distFiles.length > 0) {
    let markerV1 = false
    let markerHandshake = false
    for (const name of distFiles) {
      const content = await Bun.file(new URL(`${DIST_ASSETS}${name}`, repoRoot)).text()
      if (content.includes("mobile(notifications-v1)")) markerV1 = true
      if (content.includes("opencode-mobile-notifications-handshake")) markerHandshake = true
    }
    if (!markerV1 || !markerHandshake)
      fail(`8: the built dist lost a notifications marker (mobile(notifications-v1)=${markerV1}, handshake=${markerHandshake}) across ${distFiles.length} built assets — these two are the plan-registered dist markers (RUNTIME string constants; the mobile(M-022)/mobile(M-023) strings are source comments, asserted against entry.tsx/notification.tsx above, and survive minification only in the sourcemaps)`)
  } else {
    console.log("verify-notifications: dist markers SKIPPED (no built dist present)")
  }
}

// --- 9. Docs closure anchors (anti doc<->code drift; commit-1 documents) ---
{
  const unit = await read("docs/design/units/notifications.md")
  if (!unit.includes("issue #148 M-023 投递面恢复后通知面已实现；#148 G33 真机轮已核验可达层"))
    fail("9: units/notifications.md lost the status line (issue #148 device-round wording)")
  for (const heading of [
    "## ① 上游通知面全景（已随闭包进入移动壳）",
    "## ② 事件源盘点",
    "## ③ 桥契约（第六座协议隔离桥）",
    "## ④ 触发面与门控矩阵（notifications-platform-delivery）",
    "## ⑤ tap 路由",
    "## ⑥ 前台抑制双层与后台尽力边界",
    "## ⑦ 可靠投递边界专节（验收 3 本体）",
    "## ⑧ 安全语义",
    "## ⑨ 设置面",
    "## ⑩ 不支持流清单",
  ]) {
    if (!unit.includes(heading)) fail(`9: units/notifications.md lost the section ${heading}`)
  }
  for (const sentence of [
    "上游闭包实态=死开关（设置+i18n 在册、零触发面），notifications-platform-delivery 为壳内补全",
    "通知面与两者零交（双面触达禁止）",
    "进程死亡期间发生的一切（任务完成/权限请求/错误）不产生任何通知",
    "零前台服务、零保活、零推送通道",
    "docs/project-scope.md` 开发前确认项 7",
    "通知存在 ≠ 任务定会完成或权限定会被看到",
    "无通知 ≠ 任务未完成",
    "op 白名单恰 `{notify, requestPermission}`",
    "action`（工具动作名）与 `resources`（资源路径数组）不进通知文案",
    "VISIBILITY_PRIVATE",
    "零 addAction",
    "StubNotificationsPort",
  ]) {
    if (!unit.includes(sentence)) fail(`9: units/notifications.md lost the key sentence "${sentence}"`)
  }

  const interaction = await read("docs/design/interaction.md")
  // Issue #24/#26 revisions (deliberate, NOT a bypass): the enumeration-title anchor moved
  // G1–G33 -> G1–G34 when the issue #24 G34 gate row was appended, and
  // G1–G34 -> G1–G35 when the issue #26 G35 gate row was appended to interaction.md —
  // the anchor's coverage semantics (the enumeration must cover the FULL gate set) are
  // preserved.
  if (!interaction.includes("## G1–G35 设备门禁（完整枚举）"))
    fail("9: interaction.md gate enumeration must cover G1–G35")
  if (!interaction.includes("| G33 通知运行期门禁（issue #23 **新设门禁**）"))
    fail("9: interaction.md lost the G33 gate row")
  if (!interaction.includes("第十九处落字（issue #23）"))
    fail("9: interaction.md lost the nineteenth honest wording (issue #23)")
  if (!interaction.includes("### 通知失败路径（issue #23）"))
    fail("9: interaction.md lost the notification failure-path subsection")

  const architecture = await read("docs/design/architecture.md")
  for (const anchor of [
    "| notifications（通知面） |",
    "CredentialVaultBridge（issue #58：AndroidX origin/frame-bound WebMessageListener v2",
    "ProbeBridge（issue #5：协议隔离的姊妹桥，独立握手串 opencode-mobile-probe-handshake",
    "SshTunnelBridge（issue #6：AndroidX exact-origin/frame bootstrap + 独立 SSH channel/ack",
    "ServiceOpsBridge（issue #7：第四座协议隔离桥，独立握手串 opencode-mobile-svcops-handshake",
    "FilesBridge（issue #16：第五座协议隔离桥，独立握手串 opencode-mobile-files-handshake",
    "NotificationsBridge（issue #23：第六座协议隔离桥，独立握手串 opencode-mobile-notifications-handshake",
    "| app-notifications-bridge |",
    "| notifications-platform-delivery |",
    "| settings-notification-permission |",
  ]) {
    if (!architecture.includes(anchor)) fail(`9: architecture.md lost the anchor ${JSON.stringify(anchor)}`)
  }

  const readme = await read("docs/design/README.md")
  if (!readme.includes("[units/notifications.md](units/notifications.md)"))
    fail("9: design README.md lost the notifications index row")
  if (!readme.includes("通知面（上游通知系统完整随闭包在壳内"))
    fail("9: design README.md lost the key-facts notifications sentence")
}

console.log(
  "verify-notifications: PASS (" +
    "1: upstream face anchors (four event branches incl. the permission.asked/form.created monitors + guard chains + openNotificationSession three-call sequence + the machine-face isSessionUnread watermark (old->new issue #195: watermark moved to machine.ts) + session.view report face) + coordinator once/claim-500/locks + G33① backgrounded()/syncFocus/system-gate anchors on the focus-lock-machine lifecycle (focus-lock-machine.ts untouched negative) + claim-key template cross-reference + web.ts Notification dead-point early return (:46) + platform.tsx notify signature + sound.ts Audio path; " +
    "2: settings.notifications.permissions/questions reference sets {settings page} (old->new issue #195: the computed trigger face left notification.tsx) + model.tsx definition faces + unified handleRequest anchors (two-value category map, R3 target resolution, pending() guard chain incl. autoApproves upstream form) + requestTitles map + merged delivery anchors (target form hasRunningChild + M-023 bridge delivery: 3 notify faces, 2 sessionID-routes + 1 target-route, 3 sound + 3 system faces, zero platform.notify call faces) + approval-path exhaustion re-partition (wire api.permission.reply exactly {model.ts:1}; data-layer wrapper exactly {auto-approve, inbox-model}; first lock verify-permission-requests) + playSoundById file set + title consumer sets; " +
    "3: six handshakes pairwise distinct + op whitelist exactly two + notify param set exactly {category,title,body,route} (normalized anchor) + four-code taxonomy both sides + route regex + 128/256 bounds + exactly-four categories both sides (questions adjacent to permissions, issue #195) + questions channel-title branch with else->errors preserved + fail-closed stub semantics + three-function seam + silent channels + VISIBILITY_PRIVATE + setAutoCancel + mobile(notifications-v1) marker + M-022 marker/registration shape; " +
    "4: NEGATIVE zero addAction/RemoteViews + zero .reply( in the notification domain (both faces) + zero task-control identifiers + zero-value logging anchor + zero credential-shaped identifiers in client.ts/bridge; " +
    "5: POST_NOTIFICATIONS manifest line + exactly-3 permissions (INTERNET + POST_NOTIFICATIONS + CAMERA; issue #71) + requestPermissions/areNotificationsEnabled/foreground anchors + granted->focus->dialog ordering + M-024 verbatim helpers + all four switches wrapped (questions via the hideLabel+children form) + status row + five en/zh i18n keys; " +
    "6: sessionHref/base64Encode verbatim + requireServerKey round-trip + route mount + onNewIntent/pendingRoute paired anchor (double-probe mutual confirmation with verify-pairing group 3) + consumePendingRoute loadUrl + PendingIntent IMMUTABLE/CLEAR_TOP/SINGLE_TOP + tag=category id=route.hashCode() + NEGATIVE zero VIEW intent-filter + deep-links comment preserved; " +
    "7: exactly-6 coordinator once-call faces (sound+system x agent/errors/requests on the unified handleRequest form) + connection.ts page-suspension verbatim + native hasWindowFocus second layer + recovery.md claim-table row; " +
    "8: gradle dependency baseline + pinned AndroidX WebKit vault listener + current dist fileCount/totalBytes (5630/155881892; issue #195 measured commit-3 rebuild — same 5630 file count as the #194 build, +18872 bytes of source delta inside existing chunks; prior pin 5630/155863020 = issue #194 gui-plugins rebuild; prior 5520/155572926 = issue #190 files/diff/review rebuild — the #193 settings rebuild moved the file count 5520->5630 between those pins; older chain in build-and-verify.md) + staged dist markers; " +
    "9: units/notifications.md status line + ten sections + key sentences, interaction.md G1–G35 + G33 row + nineteenth wording + failure path, architecture.md unit row + exact six bridge inventory anchors + app-notifications-bridge/notifications-platform-delivery/settings-notification-permission, design README index + baseline; " +
    "STATIC check - foreground suppression reality, background delivery, tap routing, permission dialogs, sound, lock-screen redaction and process-death behavior are G33)",
)
