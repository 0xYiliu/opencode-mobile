// verify-provider-models.ts — static probe for issue #14 (remote providers,
// models, accounts, and runtime configuration unit).
//
// Issue #141 (FU-1, v2.2.1 provider connect flow) revisions: group 3 gains the
// command-auth chain pins (command.connect/status/cancel, tagged attempt
// wrappers, connectMethods ordering) and the Console/Go unmapping absences
// (keyProvider/CONSOLE_PROVIDERS/consoleIntegration gone); the custom-provider
// V2 stub verbatim pin became an absence assertion (v2.2.1 deleted
// providers/credentials/ and the dialog entry with it); group 6 retires the
// OPENAI_COMPATIBLE positive anchor with the deleted credentials/form.ts;
// groups 2/7 re-measure the domain at 48 code files.
//
// Issue #192 (v2.2.7 provider/model/usage absorption) re-anchor: the pin moved
// b4525d79bf… → fedc6f208a… and absorbed the v2.2.1-era connect flow and the
// model-selector/usage payloads natively (rows 69/71 of the registry flipped
// absorbed; the agent-selector re-base rides providers-models-usage-v2-2-7).
// The v2.2.7 connect surface is a state-machine family (machine.ts /
// dialog-machine.ts / form-machine.ts / mcp-machine.ts / go-upsell-hero-
// machine.ts) behind a thin controller, so the group 3 command-auth and cancel
// anchors moved from the controller into machine.ts effect emission (the
// controller now dispatches cancel through ONE unified site per API with a
// machine-owned target tag, and the machine owns stale-generation
// compensation + teardown), the poll cadence gained command/Console 500ms
// tiers, the credential.remove set grew by connect/controller.ts (the
// dialog-machine "claude.replace" effect), data.ts grew the usage-limits
// refresh prefix, and selection.tsx moved the model-selection persistence
// into a per-workspace opener keyed by ScopedKey.from(scope,
// pathKey(directory)). 33 anchors re-derived old→new (fail-fast, closed-set
// semantics preserved; cancel-site counts 2→1 per API); no anchor weakened.
//
// Asserts, against the REAL vendored sources (pin fedc6f208a…), the structural
// facts the providers-models unit document relies on:
//
//   1. Credential unidirectional flow (exhaustive sets): across the four
//      packages' src domains (app / client / gui-extensions / session-ui, the
//      two GENERATED client surfaces excluded — see below), call-shaped
//      `.credential.list(`/`.credential.create(` hits are ZERO and
//      `.credential.remove(`/`.credential.activate(`/`.credential.update(`
//      hits equal exactly {settings/providers/providers.tsx (remove),
//      settings/providers/account-actions.ts (activate/remove/update),
//      providers/connect/controller.ts (remove — the claude.replace effect
//      drops the credentials a Claude Agent re-check replaces)} — all
//      metadata operations, never value reads. The integration group anchors
//      (connect.key/external, oauth.connect/status/complete/cancel) and the
//      credential.list OpenAPI warning ("including its secret value") are
//      asserted VERBATIM in the protocol group, which IS inside the closure.
//      Receiver note: the any-receiver `.credential.X(` call shape is used
//      (stronger than the plan's `api.credential.X(`) — measured on this pin
//      the broader form still yields exactly the sets above; no comment or
//      data-string false matches exist in-domain.
//   2. Persistence-key exhaustion ("no ordinary Web storage", #4
//      audit-secret-persistence technique): the provider domain
//      (app/src/providers + app/src/settings/providers + app/src/settings/
//      models) contains EXACTLY THREE `Persist.*(` call sites, and their keys
//      are "model-selection" (serverWorkspace — per server+directory model
//      selection), "settings-v2.models.providers" (serverGlobal — collapsed
//      booleans) and "chatgpt-plan-welcome.v1" (global — seen boolean). None
//      carries a credential-shaped payload (selection schema fields =
//      providerID/modelID/variant/agent; the other two are booleans).
//      SCAN CALIBER: .ts/.tsx code files only — 72 measured on this pin
//      (providers/ 65 + settings/providers 6 + settings/models 1; the three
//      non-code files — one svg, two css — are excluded; issue #141: 48;
//      issue #192: the v2.2.7 connect state-machine family + mcp/go-upsell
//      surfaces grew the providers/ domain), lower-bound assertion 45 so both
//      calibers stay honest.
//   3. OAuth flow shape: the openBrowser/openExternal seam (two effect sites:
//      open.browser + form.open.browser, both `effect.url`), the poll cadence
//      (command and Console 500ms, oauth 1s), the complete/failed/expired
//      polled-outcome branches, the Console-specific
//      expired_token/access_denied mappings, the ONE oauth.cancel and ONE
//      command.cancel call site each in the controller (the machine owns
//      cancellation as target-tagged cancel effects: stale-generation
//      compensation in transitionProviderConnect + cleanup()), the
//      dispatched-disposition teardown (onCleanup → disposed event → machine
//      cleanup effects), the desktop-only return_window gate, the
//      mode "auto"/"code" split (machine.ts decides the signIn kind; the
//      dialog renders code/browser screens), the copy-link and user_code
//      fallbacks, the web platform's openExternal allowlist (http/https/
//      mailto → files bridge) and the browserFailed-unreachable-on-web fact
//      (web.ts has NO openBrowser), the RemoteAuthNotice loopback exclusion,
//      and the Attempt schema (mode Literals ["auto","code"], time.expires).
//   4. Server authority & event refresh: client/src/solid/data.ts handles
//      credential.updated (integration catalog refresh) and
//      credential.switched (connections reorder + model/provider invalidate)
//      in ONE adjacent block (both prefixed by the usage-limits refresh), and
//      integration.updated as a usage-limits refresh + three-directory
//      invalidate+sync — credential refresh only touches catalog data, never
//      host/project/session state keys; the Connection.Status needs_auth
//      schema comment and the RemoteAuthNotice en sentence are verbatim.
//   5. Model scope: the per-server+directory selection persistence
//      (Persist.serverWorkspace … "model-selection", opened per workspace),
//      the ScopedKey.from(scope, pathKey(directory)) composite key, the
//      session.model.selected / session.agent.selected reconcile
//      subscriptions and the session.deleted workspace dispatch, the settings
//      models serverGlobal key, the createGlobalModels
//      `Persist.global("model")` cross-server preference EXCEPTION (honest
//      anti-overclaim anchor), the settings dual-layout anchors (serverTabs /
//      nestedServerTabs / the five-entry redirect guard / two
//      SettingsServerDataScope mounts with providers+models Tabs.Content in
//      each), the SettingsServerDataScope composition, the tooltip
//      limit.context presentation, the free/paid grouping anchor and the
//      default-visibility rules.
//   6. No local model/tool execution: `from "@opencode/ai"` /
//      `from "@ai-sdk/…"` / `from "@anthropic-ai/…"` / `from "openai"`
//      IMPORT-STATEMENT shapes are ZERO across the four packages' src
//      domains. WHY import shapes and not bare substrings (F3 lesson):
//      `@opencode/ai` as a bare substring false-matches
//      select-dialog.stories.tsx (`npm: "@opencode/ai/providers/openai"` — a
//      story-fixture METADATA string, not an import); `@ai-sdk/` bare
//      substrings false-match composer.stories.tsx / story-model.tsx fixtures
//      and the global-sync utils.test.ts fixture. The measured data-string
//      surfaces do NOT match `from "…"` shapes. The POSITIVE anchor
//      `OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"` (credentials/form.ts)
//      is RETIRED (issue #141): the npm package name was a SERVER-SIDE load
//      declaration — the exact opposite of local execution — and the file is
//      deleted. app/package.json carries zero ai/@ai-sdk/openai/anthropic
//      dependency keys, and packages/mobile-hosts must stay provider-face-free
//      (zero credential/integration/provider API call shapes).
//   7. Zero host-OS conditionals (whitelist scan, #8 N-5 / #11 / #12 / #13
//      pattern): the provider domain of group 2 must contain ZERO
//      process.platform / navigator.platform / node:os / require("os") /
//      from "os" references, with the same 45 lower bound. Domain note:
//      settings/keybinds/keybinds.tsx contains navigator.platform but is NOT
//      in this unit's domain (keybinds is not provider/model configuration).
//      The provider domain was covered by NO previous probe (#8–#13
//      whitelists) — this is its first scan (cross-probe union note in the
//      unit doc).
//
// HONEST BOUNDARY (same tradition as verify-terminal.ts): this is a static
// STRUCTURE check (text anchors / regex on source files). It proves source
// shape, NOT runtime behavior: OAuth completion in a real browser round-trip,
// window.open behavior inside the Android WebView (G25 first item), token
// refresh, needs_auth presentation, scope isolation on real servers, and the
// real third-party provider services are covered by the G25 device gate
// (docs/design/interaction.md), BLOCKED at this verification level. The
// server-side credential store / OAuth callback handling / token refresh
// IMPLEMENTATION (packages/server, packages/core) is NOT in the vendored
// closure and is NOT asserted here — it is cited from the upstream pin cache
// in the unit document. The protocol/schema DESCRIPTIONS, the controller and
// dialog sources, the client solid data layer and the settings pages ARE in
// the closure and are asserted here.
//
// Usage:
//   bun run scripts/verify-provider-models.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-provider-models: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const SCHEMA = "vendor/upstream/packages/schema/"
const MOBILE_HOSTS = "packages/mobile-hosts/"

// Newline tolerance (B1 lesson from #12: EVERY zero/exclusive/set assertion
// below applies the same whitespace-stripping normalization — no exceptions;
// measured on this pin: account-actions.ts writes all three credential calls
// CROSS-LINE (`sdk.api.credential\n.activate(`), selection.tsx carries the
// Persist.serverWorkspace call on one line but the scan must not depend on
// that).
const squash = (source: string) => source.replace(/\s+/g, "")

const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/", "/generated/"]

// Collect the .ts/.tsx file set under one of the four packages' src trees.
async function srcFiles(base: string): Promise<string[]> {
  const out: string[] = []
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
    const rel = `${base}${file}`
    if (skip.some((entry) => `/${rel}`.includes(entry))) continue
    out.push(rel)
  }
  return out
}

// Scan counters surfaced in the summary line.
let fourPkgFiles = 0
let domainFiles = 0
let aiScanFiles = 0
let osScanFiles = 0

// --- 1. Credential unidirectional flow (exhaustive sets, four-package scan) ---
{
  const credZero = /\.credential\.(list|create)\(/
  const credSets: Record<string, RegExp> = {
    remove: /\.credential\.remove\(/,
    activate: /\.credential\.activate\(/,
    update: /\.credential\.update\(/,
  }
  const expectRemove = new Set([
    `${APP}src/settings/providers/providers.tsx`,
    `${APP}src/settings/providers/account-actions.ts`,
    // issue #192 re-anchor: the v2.2.7 connect controller's "claude.replace" effect removes the
    // credentials a Claude Agent re-check replaces (metadata operation, no value read).
    `${APP}src/providers/connect/controller.ts`,
  ])
  const expectActivate = new Set([`${APP}src/settings/providers/account-actions.ts`])
  const expectUpdate = new Set([`${APP}src/settings/providers/account-actions.ts`])
  const gotRemove = new Set<string>()
  const gotActivate = new Set<string>()
  const gotUpdate = new Set<string>()
  for (const base of [`${APP}src/`, `${CLIENT}src/`, `${GUI_EXT}src/`, `${SESSION_UI}src/`]) {
    for (const rel of await srcFiles(base)) {
      fourPkgFiles++
      const source = squash(await read(rel))
      if (credZero.test(source)) fail(`1: credential.list/create call shape must stay zero (secret-value read face): ${rel}`)
      if (credSets.remove.test(source)) gotRemove.add(rel)
      if (credSets.activate.test(source)) gotActivate.add(rel)
      if (credSets.update.test(source)) gotUpdate.add(rel)
    }
  }
  if (fourPkgFiles < 1200) fail(`1: four-package scan implausibly small (${fourPkgFiles} files)`)
  const assertSet = (name: string, got: Set<string>, expected: Set<string>) => {
    for (const file of got) if (!expected.has(file)) fail(`1: unexpected credential.${name} call site: ${file}`)
    for (const file of expected) if (!got.has(file)) fail(`1: expected credential.${name} call site missing: ${file}`)
  }
  assertSet("remove", gotRemove, expectRemove)
  assertSet("activate", gotActivate, expectActivate)
  assertSet("update", gotUpdate, expectUpdate)

  // The integration/credential protocol group descriptions (in-closure,
  // verbatim).
  const integration = await read(`${PROTOCOL}src/groups/integration.ts`)
  for (const quote of [
    "Run a key authentication method and store the resulting credential.",
    "Run an external authentication method and store a reference to its credential source.",
    "Start an OAuth attempt and return the authorization details.",
    "Poll the current status of an OAuth attempt.",
    "Complete a code-based OAuth attempt and store the resulting credential.",
    "Cancel an OAuth attempt and release its resources.",
  ]) {
    if (!integration.includes(quote)) fail(`1: integration protocol description moved (verbatim): ${quote}`)
  }
  const credential = await read(`${PROTOCOL}src/groups/credential.ts`)
  if (!credential.includes("List every stored integration credential, including its secret value."))
    fail("1: the credential.list secret-value OpenAPI warning moved (verbatim)")
}

// --- 2. Persistence-key exhaustion (provider domain) ---
{
  const bases = [`${APP}src/providers/`, `${APP}src/settings/providers/`, `${APP}src/settings/models/`]
  const persist = /Persist\.\w+\(/
  const hits: { file: string; source: string }[] = []
  for (const base of bases) {
    for (const rel of await srcFiles(base)) {
      domainFiles++
      const source = squash(await read(rel))
      if (persist.test(source)) hits.push({ file: rel, source })
    }
  }
  // Scan caliber: .ts/.tsx code files; 72 measured (issue #141: 48; issue #192
  // re-measure — the v2.2.7 connect state-machine family grew providers/),
  // lower bound 45 keeps both calibers honest.
  if (domainFiles < 45) fail(`2: provider domain scan covered only ${domainFiles} files — the directory set looks wrong`)

  const findKey = (file: string, key: string) => {
    const hit = hits.find((entry) => entry.file === file)
    if (!hit) fail(`2: the expected Persist call site is missing: ${file}`)
    if (!hit!.source.includes(key)) fail(`2: the Persist key "${key}" changed shape in ${file}`)
  }
  // issue #192 re-anchor: the persistence moved into openWorkspace — the scope/directory pair is
  // carried by the per-workspace opener's parameters, not read from sdk() inline.
  findKey(`${APP}src/providers/models/selection.tsx`, 'Persist.serverWorkspace(scope,directory,"model-selection")')
  findKey(`${APP}src/settings/models/models.tsx`, 'Persist.serverGlobal(serverSdk.scope,"settings-v2.models.providers")')
  findKey(`${APP}src/providers/connect/dialog.tsx`, 'Persist.global("chatgpt-plan-welcome.v1")')
  if (hits.length !== 3)
    fail(`2: provider domain must contain EXACTLY 3 Persist call sites (got ${hits.length}: ${hits.map((h) => h.file).join(", ")})`)

  // Payload honesty: the selection schema is providerID/modelID/variant/agent
  // — zero credential-shaped fields anywhere in the file (measured: zero
  // password/apiKey/secret/token substrings on this pin, so the file-wide
  // negative is the stronger and still-true form).
  const selection = squash(await read(`${APP}src/providers/models/selection.tsx`))
  for (const field of ["providerID:Schema.String,", "modelID:Schema.String,", "variant:", "agent:"]) {
    if (!selection.includes(field)) fail(`2: the model-selection schema lost the ${field} field`)
  }
  for (const banned of ["password", "apiKey", "secret", "token"]) {
    if (selection.toLowerCase().includes(banned.toLowerCase()))
      fail(`2: the model-selection persistence file carries a credential-shaped token (${banned})`)
  }
}

// --- 3. OAuth flow shape ---
{
  const controller = squash(await read(`${APP}src/providers/connect/controller.ts`))
  const machine = squash(await read(`${APP}src/providers/connect/machine.ts`))
  // Browser-open seam (issue #192 re-anchor): the machine emits open.browser /
  // form.open.browser effects and the controller runs BOTH sites with the same
  // body — openBrowser takes precedence, openExternal is the void fallback
  // that reports success (web: browserFailed unreachable).
  const seam = "if(platform.openBrowser)returnplatform.openBrowser(effect.url)platform.openExternal(effect.url)returntrue"
  const seams = controller.split(seam).length - 1
  if (seams !== 2)
    fail(`3: controller.ts must run the openBrowser/openExternal seam at exactly 2 effect sites (got ${seams})`)
  if (!controller.includes("if(platform.openBrowser)returnplatform.openBrowser(effect.url)"))
    fail("3: the platform.openBrowser seam changed")
  if (!controller.includes("platform.openExternal(effect.url)returntrue"))
    fail("3: the openExternal fallback (void call, always true) changed")
  // Poll cadence (issue #192 re-anchor): the interval lives in the controller's poll effect —
  // command sign-ins and the Console requeue at 500ms, plain oauth at 1s.
  if (!controller.includes('constinterval=effect.signIn.kind==="command"?500:isConsole?500:1_000'))
    fail("3: the poll cadence tiers (command/Console 500ms, oauth 1s) changed")
  // The polled outcome branches (controller → machine events; the machine's polled() consumes them).
  if (!controller.includes('if(status.status==="complete")returnpolled({status:"complete"})'))
    fail("3: the complete branch changed")
  if (!controller.includes('status.status==="failed"?status.message:language.t("provider.connect.command.expired")'))
    fail("3: the failed branch changed")
  if (
    !controller.includes(
      'if(status.status==="expired")returnpolled({status:"failed",error:language.t(isConsole?"provider.connect.console.expired":"provider.connect.oauth.expired"),})',
    )
  )
    fail("3: the expired branch changed")
  if (!controller.includes('message.includes("expired_token")') || !controller.includes('message.includes("access_denied")'))
    fail("3: the Console-specific expired_token/access_denied message mappings changed")
  if (!controller.includes("provider.connect.console.statusFailed")) fail("3: the console statusFailed copy key moved")
  if (!controller.includes("provider.connect.console.expired") || !controller.includes("provider.connect.oauth.expired"))
    fail("3: the expired copy keys (console + generic) moved")
  if (!controller.includes("provider.connect.console.denied")) fail("3: the console denied copy key moved")
  if (!controller.includes("provider.connect.console.startFailed")) fail("3: the console startFailed copy key moved")
  if (!controller.includes("provider.connect.console.refreshFailed")) fail("3: the console refreshFailed copy key moved")
  if (!controller.includes("provider.connect.oauth.code.invalid")) fail("3: the oauth code invalid copy key moved")
  if (!controller.includes("provider.connect.method.apiKey")) fail("3: the apiKey method fallback label moved")
  // statusFailed retry semantics (issue #192 re-anchor, machine.ts verbatim): only an OAuth
  // attempt stays open on the server after its status request fails, so only it resumes polling.
  if (!machine.includes("Thestatusrequestfailed;theattemptmaystillbeopenontheserver."))
    fail("3: the unreachable-outcome comment (attempt may still be open) changed (verbatim)")
  if (!machine.includes("OnlyanOAuthattemptstaysopenontheserverafteritsstatusrequestfails,soonlyitcanresume."))
    fail("3: the statusFailed retry comment (only oauth resumes polling) changed (verbatim)")
  // Cancellation (issue #192 re-anchor): the controller dispatches ONE unified cancel site per
  // API (machine-owned target tag); the machine emits the target-tagged cancel effects —
  // stale-generation compensation for server attempts opened after the dialog moved on, plus the
  // cleanup() teardown.
  const cancels = controller.match(/oauth\.cancel\(/g) ?? []
  if (cancels.length !== 1)
    fail(`3: controller.ts must call oauth.cancel at exactly 1 unified site (got ${cancels.length})`)
  const commandCancels = controller.match(/command\.cancel\(/g) ?? []
  if (commandCancels.length !== 1)
    fail(`3: controller.ts must call command.cancel at exactly 1 unified site (got ${commandCancels.length})`)
  if (!controller.includes('effect.target==="command"?serverSDK.api.integration.command.cancel(request):serverSDK.api.integration.oauth.cancel(request)'))
    fail("3: the unified target-tagged cancel dispatch changed")
  if (
    !machine.includes('if(event.type==="oauth.started"&&!startedHere(state,event.attempt,"oauth"))returnunchanged(state,[{type:"cancel",target:"oauth",attemptID:event.authorization.attemptID}])') ||
    !machine.includes('if(event.type==="command.started"&&!startedHere(state,event.attempt,"command"))returnunchanged(state,[{type:"cancel",target:"command",attemptID:event.command.attemptID}])')
  )
    fail("3: the machine stale-generation cancel compensation changed")
  if (
    !machine.includes('if(signIn?.kind==="browser"||signIn?.kind==="code")return[...stop,{type:"cancel",target:"oauth",attemptID:signIn.authorization.attemptID}]') ||
    !machine.includes('if(signIn?.kind==="command")return[...stop,{type:"cancel",target:"command",attemptID:signIn.command.attemptID}]')
  )
    fail("3: the machine cleanup cancel emission changed")
  // Teardown disposition (issue #192 re-anchor): onCleanup dispatches "disposed" and the machine
  // turns it into the cleanup effects (poll stop + attempt cancel).
  if (!controller.includes('onCleanup(()=>dispatch({type:"disposed"}))'))
    fail("3: the onCleanup disposition (dispatch disposed) changed")
  if (!machine.includes('if(event.type==="disposed")return{state:{status:"disposed"},effects:cleanup(state)}'))
    fail("3: the machine disposed transition (cleanup effects) changed")
  // Desktop-only return_window gate (web never triggers it).
  if (!controller.includes('platform.platform!=="desktop"')) fail("3: the desktop-only gate changed")
  if (!controller.includes('"client_id","opencode-desktop"') || !controller.includes('"return_window",platform.windowID'))
    fail("3: the Console return_window desktop parameters changed")
  if (!controller.includes("Lets the Console return link focus the window that started the sign-in.".replace(/\s+/g, "")))
    fail("3: the return_window comment changed (verbatim)")
  // auto/code mode split (issue #192 re-anchor): the machine decides the signIn kind from the
  // authorization mode; the dialog renders the matching screen.
  if (!machine.includes('if(authorization.mode==="code")'))
    fail("3: the machine code-mode split changed")
  if (!machine.includes("Sameas`opencodeauthlogin`:handtheuserstraighttothebrowserinsteadofaskingthemtoclickalink."))
    fail("3: the machine auto-mode browser-first comment changed (verbatim)")
  const dialog = squash(await read(`${APP}src/providers/connect/dialog.tsx`))
  if (!dialog.includes('<Matchwhen={kind("code")}><OAuthCodeView/>') || !dialog.includes('<Matchwhen={kind("browser")}>'))
    fail("3: the code-mode view dispatch changed")
  if (!dialog.includes("functionOAuthCodeView()")) fail("3: the OAuthCodeView (code paste form) moved")
  if (!dialog.includes("functionOAuthAutoView()")) fail("3: the OAuthAutoView (waiting + confirmation code) moved")
  if (!dialog.includes("<ConsoleAuthorization")) fail("3: the Console authorization view moved")
  // issue #192 re-anchor: copy-link lives in the controller's copyLink() over the authorization url.
  if (
    !controller.includes(
      "platform.writeClipboardText?platform.writeClipboardText(authorization.url):navigator.clipboard.writeText(authorization.url)",
    )
  )
    fail("3: the copy-link fallback chain changed")
  if (!dialog.includes('searchParams.get("user_code")')) fail("3: the user_code confirmation-code extraction changed")
  // The one-shot welcome flag (persistence group 2 counts it; shape here).
  if (!dialog.includes("chatgpt-plan-welcome.v1")) fail("3: the chatgpt-plan-welcome flag key moved")

  // Web platform: openExternal allowlist + browserFailed-unreachable fact.
  // mobile(M-041, issue #76): the outbound call now rides the files bridge (the literal
  // window.open shape is gone — negative below); the JS protocol gate + mailto branch
  // stay VERBATIM (first layer only) and the openBrowser negative + the browserFailed-
  // unreachable fact are unchanged (the client never throws).
  const web = squash(await read(`${APP}src/runtime/platform/web.ts`))
  if (!web.includes('voidactiveFilesPort().openExternal(url.href)'))
    fail("3: the web openExternal bridge-call shape changed (files-open-external, issue #76)")
  if (!web.includes("mobile(M-041)"))
    fail("3: web.ts lost the mobile(M-041) outbound-face marker")
  if (web.includes("window.open("))
    fail("3: web.ts gained a window.open call (the outbound face routes over the files bridge)")
  if (!web.includes('url.protocol!=="http:"&&url.protocol!=="https:"&&url.protocol!=="mailto:"'))
    fail("3: the web openExternal protocol allowlist changed")
  if (web.includes("openBrowser")) fail("3: web platform must NOT implement openBrowser (browserFailed is unreachable on web)")
  const platform = await read(`${APP}src/runtime/platform/platform.tsx`)
  if (!platform.includes("openBrowser?(url: string): Promise<boolean>"))
    fail("3: the Platform.openBrowser optional member moved")

  // RemoteAuthNotice: loopback exclusion + server-side storage notice.
  const remote = squash(await read(`${APP}src/providers/connect/remote.tsx`))
  if (!remote.includes('["localhost","127.0.0.1","[::1]"].includes(newURL(server.http.url).hostname)'))
    fail("3: the RemoteAuthNotice loopback exclusion changed")
  if (!remote.includes('provider.connect.remote.title') || !remote.includes("provider.connect.remote.description"))
    fail("3: the RemoteAuthNotice copy keys moved")
  const en = await read(`${APP}src/runtime/i18n/en.ts`)
  if (!en.includes("Your OpenCode credentials will be stored on this server. Models will be available through this server."))
    fail("3: the RemoteAuthNotice en sentence changed (verbatim)")

  // Attempt schema: mode auto/code + expiry.
  const integration = squash(await read(`${SCHEMA}src/integration.ts`))
  if (!integration.includes('mode:Schema.Literals(["auto","code"])')) fail("3: the Attempt mode literals changed")
  if (!integration.includes("created:Schema.Number,expires:Schema.Number")) fail("3: the Attempt time (created/expires) changed")
  for (const status of ['"pending"', '"complete"', '"failed"', '"expired"']) {
    if (!integration.includes(`status:Schema.Literal(${status})`)) fail(`3: the AttemptStatus ${status} literal moved`)
  }

  // Command authentication chain (issue #141 → issue #192 re-anchor): the
  // v2.2.7 state machine owns the command sign-in — the controller runs
  // machine effects (command.connect on "start", command.status in the poll
  // effect, ONE unified cancel site); machine.ts carries the attempt identity
  // (ProviderCommandAttempt), the command signIn state with its output
  // transcript, and the delayed requeue emission the controller's 500ms
  // command tier re-enters.
  if (!controller.includes("integration.command.connect({integrationID,methodID:effect.method.id,location})"))
    fail("3: the command.connect call shape changed")
  if (!controller.includes("integration.command.status({integrationID,attemptID:effect.signIn.command.attemptID,location})"))
    fail("3: the command.status poll call shape changed")
  if (!machine.includes('exporttypeProviderCommandAttempt=IntegrationCommandConnectOutput["data"]'))
    fail("3: the CommandAttempt type moved")
  if (
    !machine.includes(
      'readonlykind:"command"readonlymethod:Extract<ProviderConnectMethod,{type:"command"}>readonlycommand:ProviderCommandAttemptreadonlyoutput:string',
    )
  )
    fail("3: the command signIn state (attempt + output transcript) moved")
  // The machine writes each pending command.status message into the signIn output…
  if (!machine.includes('state.signIn.kind==="command"?{...state,signIn:{...state.signIn,output:outcome.output??""}}:state'))
    fail("3: the machine command output write moved")
  if (!controller.includes('polled({status:"pending",output:status.message??""})'))
    fail("3: the command pending poll outcome (output transcript) changed")
  // …and requeues the poll effect (the controller's 500ms command tier re-enters).
  if (!machine.includes('effects:[{type:"poll",attempt:state.attempt,signIn:next.signIn,delay:true}]'))
    fail("3: the command polling requeue emission moved")
  if (!controller.includes('provider.connect.command.expired'))
    fail("3: the command expired copy key moved")
  // Attempt identity is a machine-tagged cancel union, not a bare Authorization.
  if (!machine.includes('readonlytype:"cancel";readonlytarget:"oauth"|"command";readonlyattemptID:string'))
    fail("3: the tagged cancel-effect union changed")
  if (
    !machine.includes('{type:"cancel",target:"oauth",attemptID:event.authorization.attemptID}') ||
    !machine.includes('{type:"cancel",target:"command",attemptID:event.command.attemptID}')
  )
    fail("3: the tagged attempt wrappers (oauth/command) changed")
  // Method ordering: same order as the TUI — browser/command first, API key
  // last; env methods never reach the connect surface. (issue #192 re-anchor:
  // connectMethods lives in machine.ts; the controller wires it into the load
  // effect with the apiKey fallback.)
  if (!machine.includes("//SameorderastheTUI:browserandcommandsign-insfirst,APIkeyslast."))
    fail("3: the connectMethods same-order-as-the-TUI comment moved (verbatim)")
  if (!machine.includes('toSorted((a,b)=>Number(a.type==="key")-Number(b.type==="key"))'))
    fail("3: the connectMethods key-last ordering changed")
  if (!machine.includes('(method):methodisProviderConnectMethod=>method.type!=="env"'))
    fail("3: the connectMethods env filter changed")
  if (
    !controller.includes(
      'methods:integration?connectMethods(integration):[{type:"key",label:language.t("provider.connect.method.apiKey")}]',
    )
  )
    fail("3: the controller load-effect connectMethods wiring changed")
  // Console/Go unmapping (issue #141): Go connects with its own methods, the
  // same as the TUI — the Console provider set, the consoleIntegration mapping
  // and the keyProvider re-routing option are gone. (issue #192 re-anchor:
  // CONSOLE_INTEGRATION is defined in dialog-machine.ts and imported by the
  // controller alongside the dialog state machine.)
  for (const banned of ["keyProvider", "CONSOLE_PROVIDERS", "consoleIntegration"]) {
    if (controller.includes(banned)) fail(`3: controller.ts must NOT carry the Console/Go mapping symbol ${banned} (issue #141 unmapping)`)
  }
  const dialogMachine = squash(await read(`${APP}src/providers/connect/dialog-machine.ts`))
  if (!dialogMachine.includes('CONSOLE_INTEGRATION="opencode"'))
    fail("3: the CONSOLE_INTEGRATION identity moved")
  if (!controller.includes("CLAUDE_AGENT_INTEGRATION,CONSOLE_INTEGRATION,createProviderDialogState,"))
    fail("3: the controller CONSOLE_INTEGRATION import (dialog-machine) changed")
  if (controller.includes("exporttypeProviderConnectionController="))
    fail("3: the ProviderConnectionController type export came back (target-removed)")
  // Command waiting copy rides the dialog's CommandView (issue #141).
  if (!dialog.includes("provider.connect.command.waiting"))
    fail("3: the command waiting copy key moved")
  if (!dialog.includes('data-component="provider-connect-command-output"'))
    fail("3: the CommandView output pre moved")

  // Custom provider save stub → ABSENCE (issue #141): v2.2.1 deleted
  // providers/credentials/ outright and the dialog's Other/Custom entry with
  // it; the stub verbatim pins retired with the files.
  if (await Bun.file(new URL(`${APP}src/providers/credentials/dialog.tsx`, repoRoot)).exists())
    fail("3: providers/credentials/dialog.tsx must stay deleted (v2.2.1 removed the custom-provider stub)")
  for (const banned of ["CUSTOM_ID", "CustomProviderForm"]) {
    if (dialog.includes(banned)) fail(`3: connect/dialog.tsx must NOT carry the custom-provider entry (${banned})`)
  }
}

// --- 4. Server authority & event refresh ---
{
  const data = squash(await read(`${CLIENT}src/solid/data.ts`))
  if (!data.includes('if(event.type==="credential.updated"||event.type==="credential.switched")'))
    fail("4: the credential.updated/switched event block moved")
  // Issue #192 re-anchor (v2.2.7 restructure, data.ts): the pair is keyed per stored location,
  // both events refresh usage limits first, and credential.updated refreshes the integration
  // catalog via refreshLocation.
  if (!data.includes('if(event.type==="credential.updated"){refreshLocation("integration",result.location.integration,location)return}'))
    fail("4: credential.updated must refresh the integration catalog (adjacent pair)")
  if (!data.includes("connections:[active,...integration.connections.filter((connection)=>connection!==active)]"))
    fail("4: credential.switched must reorder connections (active first)")
  // Issue #142 → #192 re-anchor: the integration.updated case opens with the usage-limits
  // refresh, then measures whether the catalogs are mounted (hasLocation guard) before the
  // three invalidations; the three-catalog adjacency is preserved.
  if (
    !data.includes(
      'case"integration.updated":{refreshUsageLimits(location)constactive=hasLocation("integration",location)||hasLocation("model",location)||hasLocation("provider",location)result.location.integration.invalidate(location)result.location.model.invalidate(location)result.location.provider.invalidate(location)',
    )
  )
    fail("4: integration.updated must refresh usage limits and invalidate the three catalogs (adjacent block)")

  const connection = squash(await read(`${SCHEMA}src/connection.ts`))
  if (!connection.includes("`needs_auth`askstheusertosigninagain:*at`url`whenset(thecredentialitselfstaysvalid),otherwisebyreconnectingtheintegration"))
    fail("4: the needs_auth schema comment changed (verbatim)")
  if (!connection.includes('method:Schema.Literals(["key","oauth","external"])'))
    fail("4: the CredentialInfo method literals changed")
  if (!connection.includes("status:optional(Status)")) fail("4: the optional Connection.Status field moved")

  // Credential.Entry: server-side storage authority (secrets never on the
  // client) — value types carry refresh/access/key fields but the client
  // VISIBLE face (CredentialInfo) has no value field (asserted above by the
  // CredentialInfo shape).
  const credential = squash(await read(`${SCHEMA}src/credential.ts`))
  if (!credential.includes("refresh:Schema.String,access:Schema.String,expires:NonNegativeInt"))
    fail("4: the Credential.OAuth refresh/access/expires shape changed")
  if (!credential.includes("value:Value,")) fail("4: the Credential.Entry value field moved")
}

// --- 5. Model scope ---
{
  const selection = squash(await read(`${APP}src/providers/models/selection.tsx`))
  // Issue #192 re-anchor: the selection persistence opens per workspace — acquireWorkspace keys
  // on ScopedKey.from(scope, pathKey(directory)) and openWorkspace persists with the same
  // scope/directory pair (one machine per server+directory).
  if (!selection.includes('Persist.serverWorkspace(scope,directory,"model-selection")'))
    fail("5: the per-server+directory model-selection persistence moved")
  if (!selection.includes("constkey=ScopedKey.from(scope,pathKey(directory))"))
    fail("5: the ScopedKey composite workspace key changed")
  if (!selection.includes('serverSDK.event.on("session.model.selected",(event)=>reconcile(event.data.sessionID))'))
    fail("5: the session.model.selected reconcile subscription moved")
  if (!selection.includes('serverSDK.event.on("session.agent.selected",(event)=>reconcile(event.data.sessionID))'))
    fail("5: the session.agent.selected reconcile subscription moved")
  // Issue #192 re-anchor: session.deleted now dispatches into the owning workspace's machine.
  if (
    !selection.includes(
      'serverSDK.event.on("session.deleted",(event)=>workspace().dispatch({type:"session.deleted",sessionID:event.data.sessionID})',
    )
  )
    fail("5: the session.deleted workspace dispatch moved")

  const runtime = squash(await read(`${APP}src/runtime/server/runtime.tsx`))
  // issue #140 merge repair: the target-form runtime restores upstream's ModelState
  // binding (the scc-era modelState exception hunk retired with the target's own
  // favorites recovery semantics); the anchored FACT (the createGlobalModels
  // Persist.global("model") cross-server preference surface) is unchanged.
  if (!runtime.includes('persisted(Persist.global("model"),ModelState,{'))
    fail("5: the createGlobalModels Persist.global(\"model\") preference surface moved (anti-overclaim anchor — preferences are cross-server global upstream)")

  // Migrated (v2.2.1) single-layout mounts (issue #101 / settings-framework-migration): the pin's dual layout is
  // gone — the five-tab redirect guard and the nestedServerTabs composition are
  // target-REMOVED (absence assertions), and providers/models each mount exactly ONCE in
  // the single RootSettings layout.
  const shell = squash(await read(`${APP}src/settings/shell.tsx`))
  if (shell.includes('if(["projects","workspaces","providers","models","extensions"].includes(view.tab))surface.open("general")'))
    fail("5: the pin five-tab redirect guard came back (target-removed by the settings-framework-migration migration)")
  if (shell.includes("constnestedServerTabs=[") || shell.includes("...serverTabs,"))
    fail("5: the pin per-server nested tabs composition came back (target-removed by the settings-framework-migration migration)")
  if (!shell.includes("constserverTabs=[") || !shell.includes('{value:"providers",icon:pageIcons.providers,label:"settings.providers.title"},') || !shell.includes('{value:"models",icon:pageIcons.models,label:"settings.models.title"},'))
    fail("5: the serverTabs providers/models registration changed")
  const providersTabs = shell.match(/<Tabs\.Contentvalue="providers"/g) ?? []
  const modelsTabs = shell.match(/<Tabs\.Contentvalue="models"/g) ?? []
  if (providersTabs.length !== 1 || modelsTabs.length !== 1)
    fail(`5: providers/models Tabs.Content must mount exactly once each (single RootSettings layout; got ${providersTabs.length}/${modelsTabs.length})`)
  if ((shell.match(/SettingsServerDataScope/g) ?? []).length < 4)
    fail("5: the SettingsServerDataScope wraps are missing (per-server pages + project view)")
  const pages = await read(`${APP}src/settings/pages.ts`)
  if (!pages.includes('providers: "providers",') || !pages.includes('models: "models",'))
    fail("5: the settings pages providers/models registration moved")
  const catalog = await read(`${APP}src/settings/search-catalog.ts`)
  if (!catalog.includes('{ tab: "providers", label: "settings.providers.title", keywords: "connect api key credentials" },'))
    fail("5: the providers settings-search catalog row moved")
  if (!catalog.includes('{ tab: "models", label: "settings.models.title", keywords: "model picker visibility" },'))
    fail("5: the models settings-search catalog row moved")

  const serverScope = squash(await read(`${APP}src/settings/server-scope.tsx`))
  if (!serverScope.includes("<ServerProviderconn={props.server}>") || !serverScope.includes("<ModelsProviderdirectory={props.directory}>"))
    fail("5: the SettingsServerDataScope composition (ServerProvider + ModelsProvider) changed")

  // Models presentation: tooltip limits, free/paid grouping, visibility rules.
  const tooltip = squash(await read(`${APP}src/providers/models/tooltip.tsx`))
  if (!tooltip.includes('language.t("model.tooltip.context",{limit:props.model.limit.context.toLocaleString()})'))
    fail("5: the tooltip limit.context presentation changed")
  const providerGroup = squash(await read(`${APP}src/providers/models/provider-group.tsx`))
  if (!providerGroup.includes('group.category==="opencode"&&group.items.every((item)=>!item.cost?.input)'))
    fail("5: the free/paid grouping anchor changed")
  const models = squash(await read(`${APP}src/providers/models/models.tsx`))
  if (!models.includes("constRECENT_LIMIT=5")) fail("5: the recent-models cap changed")
  // issue #141 drift repair (new-fact registration): ae10625 extended the
  // default-visible rule with the free-set disjunction; the latest-per-family
  // clause itself is unchanged.
  if (!models.includes("if(latestSet().has(key)||freeSet().has(key))returntrue"))
    fail("5: the latest-per-family default-visible rule changed")
  if (!models.includes("return!Number.isFinite(release().get(key)??NaN)"))
    fail("5: the unparseable-release-date stays-visible rule changed")
  const settingsModels = squash(await read(`${APP}src/settings/models/models.tsx`))
  if (!settingsModels.includes("collapsed:Persistence.record(Persistence.fallback(Schema.Boolean,()=>false)),"))
    fail("5: the collapsed-booleans persistence schema changed")
}

// --- 6. No local model/tool execution ---
{
  const importShapes: RegExp[] = [
    /from\s*["']@opencode\/ai["']/,
    /from\s*["']@ai-sdk\/[^"']*["']/,
    /from\s*["']@anthropic-ai\/[^"']*["']/,
    /from\s*["']openai["']/,
  ]
  for (const base of [`${APP}src/`, `${CLIENT}src/`, `${GUI_EXT}src/`, `${SESSION_UI}src/`]) {
    for (const rel of await srcFiles(base)) {
      aiScanFiles++
      const raw = await read(rel)
      for (const shape of importShapes) {
        if (shape.test(raw)) fail(`6: local AI SDK import shape found (model execution is server-side): ${rel}`)
      }
    }
  }
  const pkg = await read(`${APP}package.json`)
  for (const banned of ["@ai-sdk", '"anthropic"', '"openai"']) {
    if (pkg.includes(banned)) fail(`6: app/package.json must not carry an AI SDK dependency key (${banned})`)
  }
  // Positive anchor RETIRED (issue #141): the custom-provider npm declaration
  // lived in providers/credentials/form.ts, which v2.2.1 deleted outright
  // (absence asserted in group 3). The server-side load declaration face is
  // still guarded by the import-shape negative scan above (any local
  // `from "@ai-sdk/…"` import would fail there).
  if (await Bun.file(new URL(`${APP}src/providers/credentials/form.ts`, repoRoot)).exists())
    fail("6: providers/credentials/form.ts must stay deleted (v2.2.1 removed the custom-provider form)")

  // Shared layer stays provider-face-free.
  const mhZero = /\.\s*credential\s*\.\s*(list|create|update|activate|remove)\(|api\s*\.\s*(integration|provider)\s*\.\s*\w+\s*\(/
  let mhFiles = 0
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${MOBILE_HOSTS}src`, repoRoot).pathname }))) {
    mhFiles++
    const source = squash(await read(`${MOBILE_HOSTS}src/${file}`))
    if (mhZero.test(source)) fail(`6: mobile-hosts shared layer must stay provider-face-free: ${MOBILE_HOSTS}src/${file}`)
  }
  if (mhFiles < 30) fail(`6: mobile-hosts scan covered only ${mhFiles} files — the directory set looks wrong`)
}

// --- 7. Zero host-OS conditionals in the whitelisted provider domain ---
{
  const osPatterns: [RegExp, string][] = [
    [/process\.platform/, "process.platform"],
    [/navigator\.platform/, "navigator.platform"],
    [/from ["']node:os["']/, 'import from "node:os"'],
    [/require\(["']os["']\)/, 'require("os")'],
    [/from ["']os["']/, 'import from "os"'],
  ]
  for (const base of [`${APP}src/providers/`, `${APP}src/settings/providers/`, `${APP}src/settings/models/`]) {
    for (const rel of await srcFiles(base)) {
      osScanFiles++
      const source = await read(rel)
      for (const [pattern, label] of osPatterns) {
        if (pattern.test(source)) fail(`7: host-OS conditional (${label}) found in whitelisted ${rel}`)
      }
    }
  }
  // Lower bound (real count on this pin: 72 .ts/.tsx code files — providers/
  // 41 + settings/providers 6 + settings/models 1; 51 counting the svg/css;
  // issue #141 re-measure: −3 credentials deletion, +1 connect test).
  if (osScanFiles < 45) fail(`7: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
  if (osScanFiles !== domainFiles) fail(`7: scan caliber mismatch between group 2 (${domainFiles}) and group 7 (${osScanFiles})`)
}

console.log(
  "verify-provider-models: PASS (" +
    "1: credential unidirectional flow — .credential.list/create ZERO across four-package src (" +
    fourPkgFiles +
    " files), .credential.remove/activate/update sets exactly {providers.tsx, account-actions.ts, connect/controller.ts (claude.replace)}, integration protocol descriptions + credential.list secret-value warning verbatim; " +
    "2: persistence-key exhaustion — exactly 3 Persist sites in the provider domain (" +
    domainFiles +
    " code files): model-selection (serverWorkspace) / settings-v2.models.providers (serverGlobal) / chatgpt-plan-welcome.v1 (global), selection schema zero credential-shaped fields; " +
    "3: OAuth flow shape — openBrowser/openExternal seam at exactly 2 effect sites, poll cadence tiers (command/Console 500ms, oauth 1s), complete/failed/expired polled branches, expired_token/access_denied mappings, exactly 1 unified oauth.cancel + 1 command.cancel site (machine-owned target-tagged cancel effects: stale-generation compensation + cleanup), disposed-dispatch teardown, desktop-only return_window gate, machine auto/code split + dialog screen dispatch, copy-link + user_code fallbacks, web openExternal allowlist + browserFailed unreachable, RemoteAuthNotice loopback exclusion, Attempt schema; command auth chain (issue #192 machine-form) — command.connect/status shapes, ProviderCommandAttempt type + command signIn output transcript, machine output write + delayed poll requeue, tagged cancel-effect union, connectMethods same-order-as-the-TUI ordering + env filter in machine.ts, Console/Go unmapping absences, CONSOLE_INTEGRATION via dialog-machine, CommandView output face, custom-provider stub absence (credentials/ deleted); " +
    "4: server authority — credential.updated/switched usage-limits-prefixed per-location block, credential.switched reorder, integration.updated usage-limits refresh + three-catalog block, needs_auth + CredentialInfo/Credential.Entry shapes, RemoteAuthNotice en sentence verbatim; " +
    "5: model scope — serverWorkspace model-selection, ScopedKey.from(scope, pathKey(directory)) workspace key, model/agent event reconcile + session.deleted workspace dispatch, Persist.global(\"model\") preference exception, dual-layout shell anchors (guard, nestedServerTabs, 2x Tabs.Content pairs, SettingsServerDataScope), pages/search-catalog registration, tooltip limits, free/paid grouping, default-visibility rules; " +
    "6: no local model/tool execution — zero AI SDK import shapes across " +
    aiScanFiles +
    " four-package files, app/package.json zero AI deps, OPENAI_COMPATIBLE positive anchor retired with credentials/ (issue #141), mobile-hosts provider-face-free; " +
    "7: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted code files (.ts/.tsx caliber; 72 measured); " +
    "STATIC check — OAuth round-trip, the outbound authorize hand-off inside the Android WebView shell (G25 first item; files-open-external routes it over the files-bridge external-open face, issue #76), token refresh, needs_auth presentation, real provider services and scope isolation on live servers are G25)",
)
