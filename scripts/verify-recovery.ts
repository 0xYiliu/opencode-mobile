// verify-recovery.ts — static probe for issue #19 (cross-cutting recovery:
// disconnect / backgrounding / network change / process recreation / tunnel
// recreation).
//
// Asserts, against the REAL sources (vendored pin b4525d79bf…, first-party
// packages/mobile-hosts, the Android shell and the docs), the structural facts
// the recovery.md cross-cutting document relies on. Division of labor with the
// existing probes: this probe only FIRST-LOCKS anchors no earlier probe covers.
// Two exceptions are deliberate CROSS-REFERENCE re-checks (referencing, not
// first locks — the originals live in verify-session-workbench.ts):
//   - group 2: `const pagehide = () => stop()` and the
//     `resync("Page returned to the foreground…")` anchor (vsw :140/:141-142),
//   - group 3: `const capacity = 4_096` and the data.ts adjacent pair
//     (vsw :154-171).
// The vsw-exhausted surfaces (interrupt call-site set equality, stop/resync
// zero-API bodies, session-resolution/requests gates, no-`default:`) are NOT
// re-asserted here.
//
//   1. Connection parameters + retry cadence (client/src/solid/connection.ts):
//      the four verbatim constants (connectTimeout 2s / reconnectDelay 1s /
//      defaultIdleTimeout 45s / foregroundIdleThreshold 20s), the attempt-reset
//      rule (live >= 1s resets the attempt counter, RAW cross-line-tolerant),
//      the forced-resync bypass (comment + `if (forced)` → continue block),
//      the per-retry `options.reconnect` hook call, the F-3 drift sentinel
//      (`await wait(reconnectDelay, …)` — the ONLY wait) plus the NEGATIVE
//      assertion that connection.ts carries NO exponential-growth formula
//      (`2 **` / `Math.pow` zero hits — a future backoff must force a
//      recovery.md re-review first).
//   2. Lifecycle/network listeners + persistence flush timing:
//      connection.ts four listener registrations (pagehide/pageshow/online/
//      visibilitychange), `pageshow → void start()`,
//      `resync("Network connection restored")`; NEGATIVE (file domain EXPLICITLY
//      connection.ts, plan F-6): zero `addEventListener("offline"` — upstream
//      has no offline listener; if a pin update adds one, re-review the
//      recovery.md wording before keeping it. persist.ts: `persistSaveDelay =
//      100`, `flushPersisted`, the hidden→flush pair and the pagehide→flush
//      registration (backgrounding/leaving the page force-flushes; dirty
//      window ≤ 100ms), and the dirty-value-priority guard (a real unsaved
//      local change wins over another window's write — the stale-snapshot
//      stance recovery.md's matrix row references; first lock here: persist.ts
//      sits outside verify-session-workbench's assertion domain).
//   3. Snapshot-authority cross-checks + the seq gap NEGATIVE: capacity 4096 +
//      data.ts adjacent early-return/invalidate pair (cross-references, see
//      above) and the NEW structural lock: every `durable` occurrence in
//      connection.ts sits inside the `options.log?.debug?.("event"` block —
//      NO durable.seq gap detection exists; the snapshot is the only recovery
//      authority (upstream design, honestly registered).
//   4. Cold-start recovery chain: HOSTS_STORAGE_KEY, storageVolatile surfacing,
//      the M-010 hydration block (mobile marker + vault.get + never-reach-a-
//      persistent-backend comment), the five tabs Persist.window keys, the
//      IndexedDB draft store, the shell's unimplemented onSaveInstanceState
//      TODO — and the NEGATIVE auto-reconnect sentinels: entry.tsx carries
//      ZERO `.connect(` calls and runtime.ts keeps the "never an auto-connect"
//      comment (a future auto-reconnect must fail here and force a
//      recovery.md/G30④ re-review first).
//   5. Tunnel recreation: the ensureTunnel bounded loop (ready → endpoint;
//      non-offline → undefined; offline → retry), the "ssh tunnel unavailable"
//      throw, RECONNECT_MAX_RETRIES = 3 + reconnectExhausted, the T9
//      "remote keeps running" comment, the managed:true + OFFLINE_ENDPOINT +
//      reconnect-forwarding trio in upstream-map.ts, and direct connections
//      having NO reconnect hook (extension/sidecar only ternary in
//      runtime/server/client.tsx).
//   6. Recovery presentation: the host-manager action Match set (offline→retry,
//      ready→disconnect, idle|failed|incompatible|authRequired→connect, in
//      order), the host-key-changed danger recovery pair, PendingSessionState
//      (skeleton fallback + component), and the svcops B1 watcher adjacent pair
//      (ready→offline/reconnecting → notifyConnectionLost) with the
//      survivedDisconnect evidence-bit comment.
//   7. Docs closure anchors (anti drift between docs and code): recovery.md
//      exists and carries the six-scenario table, the data-class table, the
//      survival-check section, the four honest-state sentences (no auto
//      reconnect / no offline listener / no durable.seq gap detection / fixed-
//      interval retry, NOT exponential) with the four "不得声称" red lines and
//      the F-6 idle-host hook-spin sentence; architecture.md's flow-matrix
//      network-switch row is no longer 未开始 and points at recovery.md + G30;
//      interaction.md carries the G30 gate row, the sixteenth honest wording
//      and the recovery failure-path subsection.
//
// HONEST BOUNDARY (same tradition as verify-session-workbench.ts /
// verify-artifacts.ts): this is a static STRUCTURE check (text anchors / regex
// on source and doc files). It proves source and doc shape, NOT runtime
// behavior: retry cadence as observed on a device, resync timing, flush
// windows, cold-start chains, tunnel re-resolution, credential/host-key
// recovery presentation and "disconnect does not stop the remote task" are
// covered by the G30 device gate (docs/design/interaction.md), BLOCKED at this
// verification level.
//
// Usage:
//   bun run scripts/verify-recovery.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-recovery: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const CLIENT = "vendor/upstream/packages/client/"
const APP = "vendor/upstream/packages/app/"
const HOSTS = "packages/mobile-hosts/"

// --- 1. Connection parameters + retry cadence (connection.ts) ---
{
  const connection = await read(`${CLIENT}src/solid/connection.ts`)

  // The four verbatim constants (with values — a strengthened lock over vsw's
  // `foregroundIdleThreshold` existence check).
  for (const anchor of [
    "const connectTimeout = 2_000",
    "const reconnectDelay = 1_000",
    "export const defaultIdleTimeout = 45_000",
    "export const foregroundIdleThreshold = 20_000",
  ]) {
    if (!connection.includes(anchor)) fail(`1: connection.ts lost the ${anchor} constant`)
  }

  // Attempt reset: a connection that lived >= reconnectDelay resets the counter
  // (RAW cross-line-tolerant regex; no line-number dependence).
  if (!/>=\s*reconnectDelay\)\s*attempt = 0/.test(connection))
    fail("1: connection.ts lost the attempt-reset rule (live >= reconnectDelay → attempt = 0)")

  // Forced resync bypasses the fixed wait: comment + `if (forced)` block, comment first.
  const bypassComment = "A deliberate resync already knows the old socket is gone; reconnect without backing off."
  const commentAt = connection.indexOf(bypassComment)
  if (commentAt < 0) fail("1: connection.ts lost the forced-resync bypass comment")
  const forcedBlock = /if \(forced\) \{\s*\n\s*forced = false\s*\n\s*continue\s*\n\s*\}/.exec(connection)
  if (!forcedBlock) fail("1: connection.ts lost the forced → continue bypass block")
  if (commentAt > forcedBlock.index) fail("1: the forced bypass comment must precede its block")

  // The reconnect hook is consulted before every retry (verbatim call shape).
  if (!connection.includes("await options.reconnect(controller.signal)"))
    fail("1: connection.ts lost the per-retry options.reconnect hook call")

  // F-3 drift sentinel: the fixed wait is THE wait, and no exponential form exists.
  if (!connection.includes("await wait(reconnectDelay, controller.signal)"))
    fail("1: connection.ts lost the fixed-wait anchor (retry cadence is reconnectDelay, not a formula)")
  const exponential = /2 \*\*|Math\.pow/.exec(connection)
  if (exponential)
    fail(`1: connection.ts gained an exponential-growth form ("${exponential[0]}") — SSE retry is documented as fixed-interval in recovery.md; re-review the wording (and G30①) before keeping a backoff`)

  // Durable events are debug-logged only (group 3's structural lock lives here
  // on the same file; asserted in group 3 after this read is reused).
}

// --- 2. Lifecycle/network listeners + persistence flush timing ---
{
  const connection = await read(`${CLIENT}src/solid/connection.ts`)

  // Four listener registrations, verbatim.
  for (const anchor of [
    'window.addEventListener("pagehide", pagehide)',
    'window.addEventListener("pageshow", pageshow)',
    'window.addEventListener("online", online)',
    'document.addEventListener("visibilitychange", visibility)',
  ]) {
    if (!connection.includes(anchor)) fail(`2: connection.ts lost the ${anchor} listener registration`)
  }
  if (!connection.includes("const pageshow = () => void start()"))
    fail("2: connection.ts lost the pageshow → start() routing")
  if (!connection.includes('resync("Network connection restored")'))
    fail("2: connection.ts lost the network-restored resync anchor")

  // CROSS-REFERENCE re-checks (referencing, NOT first locks — first-locked by
  // verify-session-workbench.ts :140/:141-142; kept here so the recovery
  // document's premises fail loudly in one place too):
  if (!connection.includes("const pagehide = () => stop()"))
    fail("2: connection.ts pagehide must route to stop() (cross-reference with verify-session-workbench group 1)")
  if (!connection.includes('resync("Page returned to the foreground after the event stream went quiet")'))
    fail("2: connection.ts foreground resync anchor changed (cross-reference with verify-session-workbench group 1)")

  // NEGATIVE (file domain EXPLICITLY connection.ts — plan F-6): no offline listener.
  if (connection.includes('addEventListener("offline"'))
    fail("2: connection.ts gained an offline listener — upstream has none; re-review the recovery.md wording (and G30③) before keeping it")

  // Persistence flush timing (app/src/runtime/persistence/persist.ts).
  const persist = await read(`${APP}src/runtime/persistence/persist.ts`)
  if (!persist.includes("export const persistSaveDelay = 100"))
    fail("2: persist.ts lost the 100ms save-debounce constant")
  if (!persist.includes("export function flushPersisted"))
    fail("2: persist.ts lost the flushPersisted export")
  if (!persist.includes('window.addEventListener("pagehide", flushPersisted)'))
    fail("2: persist.ts lost the pagehide → flushPersisted registration (leaving the page must force-flush)")
  if (!persist.includes('if (document.visibilityState === "hidden") flushPersisted()'))
    fail("2: persist.ts lost the hidden → flushPersisted pair (backgrounding must force-flush)")
  // F-R1: the dirty guard is the stale-snapshot mechanism recovery.md's matrix row
  // references ("本地脏值优先（persist dirty 守卫）") — first-locked HERE (RAW
  // whitespace-tolerant; persist.ts is not in verify-session-workbench's domain,
  // so this is no duplicate).
  if (!/if \(dirty\) \{\s*remote = data\.newValue\s*return\s*\}/.test(persist))
    fail("2: persist.ts lost the dirty-value-priority guard (a real unsaved local change must win over another window's write — the stale-snapshot stance recovery.md relies on)")
}

// --- 3. Snapshot-authority cross-checks + the seq-gap NEGATIVE ---
{
  const shared = await read(`${CLIENT}src/shared-events.ts`)
  // CROSS-REFERENCE re-check (first lock: verify-session-workbench group 2).
  if (!shared.includes("const capacity = 4_096"))
    fail("3: shared-events.ts live capacity anchor changed (cross-reference with verify-session-workbench group 2)")

  const data = await read(`${CLIENT}src/solid/data.ts`)
  // CROSS-REFERENCE re-check (first lock: verify-session-workbench group 2).
  if (!/status\(\) === "connected"\) return\s*\n\s*sync\.invalidate\(\)/.test(data))
    fail("3: data.ts disconnect invalidation adjacent pair changed (cross-reference with verify-session-workbench group 2)")

  // NEW: every `durable` occurrence in connection.ts sits inside the debug-log
  // block — no sequence-number gap detection exists; the snapshot is the only
  // recovery authority.
  const connection = await read(`${CLIENT}src/solid/connection.ts`)
  const durableBlock = /if \("durable" in event\.value && event\.value\.durable\)\s*\n\s*options\.log\?\.debug\?\.\("event", \{[\s\S]*?\}\)/.exec(
    connection,
  )
  if (!durableBlock) fail("3: connection.ts lost the durable debug-log block")
  const rest = connection.replace(durableBlock![0], "")
  if (rest.includes("durable"))
    fail("3: connection.ts gained a durable consumer outside the debug-log block — a seq-gap detector appeared; re-review the recovery.md wording (and G30①) before keeping it")
}

// --- 4. Cold-start recovery chain ---
{
  const storage = await read(`${HOSTS}src/storage.ts`)
  if (!storage.includes('export const HOSTS_STORAGE_KEY = "opencode-mobile.hosts.v1"'))
    fail("4: storage.ts lost the hosts storage key")

  const runtime = await read(`${HOSTS}src/runtime.ts`)
  const volatileSurfacing = runtime.match(/storageVolatile/g)?.length ?? 0
  if (volatileSurfacing < 2)
    fail(`4: runtime.ts storageVolatile surfacing thinned (expected >= 2, got ${volatileSurfacing})`)
  if (!runtime.includes("never an auto-connect"))
    fail("4: runtime.ts lost the never-an-auto-connect comment (cold-start hosts must stay manual)")

  // M-010 hydration: in-memory-only password injection after hydrate.
  const registry = await read(`${APP}src/runtime/server/registry.tsx`)
  if (!registry.includes("mobile(M-010)")) fail("4: registry.tsx lost the mobile(M-010) patch marker")
  if (!registry.includes("can never reach a persistent backend"))
    fail("4: registry.tsx lost the never-reach-a-persistent-backend comment")
  if (!registry.includes("await vault.get(conn.http.credentialRef)"))
    fail("4: registry.tsx lost the vault-backed hydration resolution")
  if (!registry.includes("conn.http.password || !conn.http.credentialRef"))
    fail("4: registry.tsx lost the only-if-referenced-and-unset hydration guard")

  // The five tabs stores.
  const tabs = await read(`${APP}src/shell/tabs/tabs.tsx`)
  for (const key of ["tabs", "tabs.recent", "tabs.info", "tabs.panes", "tabs.closed"]) {
    if (!tabs.includes(`Persist.window("${key}")`)) fail(`4: tabs.tsx lost the Persist.window("${key}") store`)
  }

  // Drafts ride IndexedDB.
  const web = await read(`${APP}src/runtime/platform/web.ts`)
  if (!web.includes("draftStore: createBrowserDraftStore()"))
    fail("4: web.ts lost the browser draft store wiring")

  // NEGATIVE sentinels: no startup auto-connect anywhere in the entry assembly.
  const entry = await read(`${APP}src/entry.tsx`)
  if (!entry.includes("createMobileHosts({"))
    fail("4: entry.tsx lost the createMobileHosts bootstrap (M-007)")
  const connectHit = /\.connect\(/.exec(entry)
  if (connectHit)
    fail(`4: entry.tsx gained a startup connect call ("${connectHit[0]}") — hosts recover as idle with MANUAL reconnect; re-review recovery.md and G30④ before keeping an auto-reconnect`)

  // Shell instance-state restoration stays honestly unimplemented.
  const mainActivity = await read("android/app/src/main/java/ai/opencode/mobile/MainActivity.kt")
  if (!mainActivity.includes("override fun onSaveInstanceState(outState: Bundle)"))
    fail("4: MainActivity.kt lost the onSaveInstanceState override")
  if (!mainActivity.includes("// TODO(state-restore): webView.saveState(outState) — 已确认未实现 (plan section 3)."))
    fail("4: MainActivity.kt lost the state-restore TODO anchor (shell instance-state must stay honestly unimplemented)")
}

// --- 5. Tunnel recreation ---
{
  const runtime = await read(`${HOSTS}src/runtime.ts`)

  // ensureTunnel: bounded loop with the ready/early-exit/retry shape.
  const tunnel = /const ensureTunnel = async \(id: string, signal\?: AbortSignal\): Promise<TransportEndpoint \| undefined> => \{[\s\S]*?\n  \}/.exec(
    runtime,
  )
  if (!tunnel) fail("5: runtime.ts lost the ensureTunnel function")
  const body = tunnel![0]
  if (!body.includes("for (;;)")) fail("5: ensureTunnel lost its bounded loop")
  if (!body.includes('if (state === "ready") return endpointOf(id)'))
    fail("5: ensureTunnel lost the ready early-return")
  if (!body.includes('if (state !== "offline") return undefined'))
    fail("5: ensureTunnel lost the non-offline give-up (idle hosts get NO hidden attempt)")
  if (!body.includes("retry(id)")) fail("5: ensureTunnel lost the retry driver")
  if (!runtime.includes("RECONNECT_MAX_RETRIES + 1 attempts, no infinite loop."))
    fail("5: runtime.ts lost the bounded-budget comment")
  if (!runtime.includes('if (!endpoint) throw new Error("ssh tunnel unavailable")'))
    fail("5: runtime.ts lost the ssh tunnel unavailable throw")

  // The budget lives in the machine.
  const machine = await read(`${HOSTS}src/state-machine.ts`)
  if (!machine.includes("export const RECONNECT_MAX_RETRIES = 3"))
    fail("5: state-machine.ts lost the reconnect budget constant")
  if (!machine.includes("return retries > RECONNECT_MAX_RETRIES"))
    fail("5: state-machine.ts lost the reconnectExhausted rule")
  if (!machine.includes("// T9 ready --connectionLost--> offline (client-side loss; remote keeps running)"))
    fail("5: state-machine.ts lost the T9 remote-keeps-running comment")

  // The mapping keeps the tunnel identity re-resolution faces.
  const map = await read(`${HOSTS}src/upstream-map.ts`)
  if (!map.includes('const OFFLINE_ENDPOINT = "http://127.0.0.1:0"'))
    fail("5: upstream-map.ts lost the offline endpoint sentinel")
  if (!map.includes("managed: true,")) fail("5: upstream-map.ts lost the managed flag")
  if (!map.includes("...(input.reconnect ? { reconnect: input.reconnect } : {})"))
    fail("5: upstream-map.ts lost the reconnect hook forwarding")

  // Direct connections have NO reconnect hook (extension/sidecar only).
  const clientAssembly = await read(`${APP}src/runtime/server/client.tsx`)
  if (
    !clientAssembly.includes(
      'const reconnect = server.type === "extension" || server.type === "sidecar" ? server.reconnect : undefined',
    )
  )
    fail("5: client.tsx lost the extension/sidecar-only reconnect ternary (direct connections must stay hook-free)")
}

// --- 6. Recovery presentation ---
{
  const manager = await read(`${HOSTS}src/ui/host-manager.tsx`)

  // The three row actions, in Match order: retry (offline) → disconnect (ready) → connect (rest).
  const retryAt = manager.indexOf('onClick={() => runtime.retry(host.id)}')
  const disconnectAt = manager.indexOf('onClick={() => runtime.disconnect(host.id)}')
  const connectAt = manager.indexOf('onClick={() => runtime.connect(host.id)}')
  if (retryAt < 0 || disconnectAt < 0 || connectAt < 0)
    fail("6: host-manager.tsx lost a row action button (retry/disconnect/connect)")
  if (!(retryAt < disconnectAt && disconnectAt < connectAt))
    fail("6: host-manager.tsx row action order changed (expected retry → disconnect → connect)")
  if (!/<Match when=\{runtime\.stateOf\(host\.id\) === "offline"\}>/.test(manager))
    fail("6: host-manager.tsx lost the offline → retry Match")
  if (!/<Match when=\{runtime\.stateOf\(host\.id\) === "ready"\}>/.test(manager))
    fail("6: host-manager.tsx lost the ready → disconnect Match")
  if (
    !/runtime\.stateOf\(host\.id\) === "idle"\s*\|\|\s*runtime\.stateOf\(host\.id\) === "failed"\s*\|\|\s*runtime\.stateOf\(host\.id\) === "incompatible"\s*\|\|\s*runtime\.stateOf\(host\.id\) === "authRequired"/.test(
      manager,
    )
  )
    fail("6: host-manager.tsx lost the idle|failed|incompatible|authRequired → connect Match set")

  // Host-key-changed danger recovery chain.
  if (!manager.includes('runtime.failureReasonOf(host.id) === "host-key-changed"'))
    fail("6: host-manager.tsx lost the host-key-changed failure guard")
  if (!manager.includes("recoverHostKey")) fail("6: host-manager.tsx lost the recoverHostKey action")
  if (!manager.includes('{t("hostKey.changed.recover")}'))
    fail("6: host-manager.tsx lost the hostKey.changed.recover danger button")

  // Pending session skeleton (not blank, not an error).
  const route = await read(`${APP}src/session/route.tsx`)
  if (!route.includes('<Show when={directory()} fallback={<PendingSessionState sessionID={params.id} />}>'))
    fail("6: session/route.tsx lost the PendingSessionState fallback")
  if (!route.includes("function PendingSessionState(props: { sessionID: string })"))
    fail("6: session/route.tsx lost the PendingSessionState component")

  // svcops survival evidence bit (B1 watcher adjacent pair).
  const panel = await read(`${HOSTS}src/ui/service-panel.tsx`)
  if (
    !/previous === "ready" && \(current === "offline" \|\| current === "reconnecting"\)\) \{\s*\n\s*driver\.notifyConnectionLost\(\)/.test(
      panel,
    )
  )
    fail("6: service-panel.tsx lost the B1 connection-lost adjacent pair")
  if (!panel.includes("void driver.notifyReadyArrival(previous === \"authRequired\")"))
    fail("6: service-panel.tsx lost the ready-arrival snapshot refresh")
  if (!panel.includes("survivedDisconnect"))
    fail("6: service-panel.tsx lost the survivedDisconnect evidence-bit comment")
}

// --- 7. Docs closure anchors (docs ↔ code drift guards) ---
{
  const recovery = await read("docs/design/recovery.md")

  // Structure.
  for (const anchor of ["恢复数据类总表", "六场景处置表", "服务端存活核对步骤", "authority 边界声明"]) {
    if (!recovery.includes(anchor)) fail(`7: recovery.md lost the ${anchor} section`)
  }

  // The four honest-state sentences + their red lines.
  if (!recovery.includes("SSH 主机无自动重连"))
    fail("7: recovery.md lost the no-auto-reconnect honest-state sentence")
  if (!recovery.includes("无 offline 监听"))
    fail("7: recovery.md lost the no-offline-listener honest-state sentence")
  if (!recovery.includes("无 durable.seq 缺口检测"))
    fail("7: recovery.md lost the no-seq-gap-detection honest-state sentence")
  if (!recovery.includes("固定间隔重试（非指数退避）"))
    fail("7: recovery.md lost the fixed-interval-retry honest-state sentence (F-3)")
  if (!recovery.includes("不得声称存在自动重连"))
    fail("7: recovery.md lost the no-auto-reconnect red line")
  if (!recovery.includes("不得声称网络切换有 offline 事件感知"))
    fail("7: recovery.md lost the no-offline-awareness red line")
  if (!recovery.includes("不得声称有序列号缺口检测"))
    fail("7: recovery.md lost the no-seq-detection red line")
  if (!recovery.includes("不得写「SSE 指数退避」"))
    fail("7: recovery.md lost the no-exponential-backoff red line")

  // F-6: the idle-host hook-spin sentence (pre-registered so G30④ observers do
  // not misread the ~1s idle hook polling as a hidden auto-reconnect).
  if (!recovery.includes("恢复的会话 tab 挂在 idle SSH 宿主上时"))
    fail("7: recovery.md lost the idle-host hook-spin honest-state sentence (F-6)")

  // The architecture flow-matrix network-switch row: no longer 未开始.
  const architecture = await read("docs/design/architecture.md")
  const matrixRow = architecture.split("\n").find((line) => line.includes("| 任意单元 | 网络断开/切换 |"))
  if (!matrixRow) fail("7: architecture.md lost the network-switch flow-matrix row")
  if (matrixRow!.includes("未开始"))
    fail("7: architecture.md flow-matrix network-switch row regressed to 未开始")
  if (!matrixRow!.includes("已实现（未验证）") || !matrixRow!.includes("recovery.md") || !matrixRow!.includes("G30"))
    fail("7: architecture.md flow-matrix network-switch row must point at recovery.md and G30")

  // interaction.md carries the G30 gate and the sixteenth honest wording. The
  // enumeration-title anchor was revised G1–G30 -> G1–G33 by issue #23 and
  // G1–G33 -> G1–G34 by issue #24 (deliberate
  // sentinel revisions, NOT a bypass: each issue's commit-1 renamed the interaction.md
  // gate enumeration title when its gate row was added — the anchor's coverage
  // semantics are preserved, it tracks the FULL gate set).
  const interaction = await read("docs/design/interaction.md")
  if (!interaction.includes("## G1–G34 设备门禁（完整枚举）"))
    fail("7: interaction.md gate enumeration must cover G1–G34")
  if (!interaction.includes("| G30 recovery 横切恢复门禁（issue #19"))
    fail("7: interaction.md lost the G30 gate row")
  if (!interaction.includes("第十六处落字（issue #19）"))
    fail("7: interaction.md lost the sixteenth honest wording (issue #19)")
  if (!interaction.includes("恢复横切面失败路径（issue #19）"))
    fail("7: interaction.md lost the recovery failure-path subsection")
}

console.log(
  "verify-recovery: PASS (" +
    "1: connection constants 2s/1s/45s/20s verbatim, attempt-reset rule, forced-resync bypass comment+block, per-retry reconnect hook, fixed-wait anchor + NEGATIVE zero exponential form; " +
    "2: four lifecycle/network listeners, pageshow→start, network-restored resync, CROSS-REFERENCE pagehide→stop + foreground resync (vsw first locks), NEGATIVE zero offline listener (file domain: connection.ts), persist flush timing (100ms debounce + hidden/pagehide force-flush) + dirty-value-priority guard (F-R1); " +
    "3: CROSS-REFERENCE capacity 4096 + data.ts adjacent pair (vsw first locks), NEGATIVE durable consumed only inside the debug-log block (no seq-gap detection); " +
    "4: HOSTS_STORAGE_KEY + storageVolatile surfacing + M-010 hydration block + five tabs stores + IndexedDB drafts + shell onSaveInstanceState TODO, NEGATIVE zero .connect( in entry.tsx + never-an-auto-connect comment; " +
    "5: ensureTunnel bounded loop (ready/non-offline/retry) + ssh-tunnel-unavailable throw + RECONNECT_MAX_RETRIES budget + T9 remote-keeps-running + OFFLINE_ENDPOINT/managed/reconnect-forwarding + direct connections hook-free; " +
    "6: host-manager action Match set in order + host-key-changed danger recovery + PendingSessionState skeleton + svcops B1 watcher + survivedDisconnect evidence bit; " +
    "7: recovery.md structure + four honest-state sentences + four 不得声称 red lines + idle-hook-spin sentence, architecture.md network-switch row pointing at recovery.md/G30, interaction.md G1–G34 enumeration (issue #24 revision) + G30 row + sixteenth honest wording + recovery failure path; " +
    "STATIC check - retry cadence, resync/flush timing, cold-start chains, tunnel re-resolution, credential/host-key recovery presentation and remote-task survival on a device are G30)",
)
