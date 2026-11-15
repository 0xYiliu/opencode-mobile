// verify-terminal.ts — static probe for issue #191 (terminal / PTY crosswalk:
// the v2.2.7 persistent-PTY surface re-anchor of the issue #13 probe).
//
// Asserts, against the REAL vendored sources (pin fedc6f208aa2bd54c1019227214568083f6380ad,
// the upstream v2.2.7 terminal surface), the structural facts the terminal
// unit document relies on. At this pin the terminal face moved from the
// short-lived `pty` surface (snapshot persisted in the client, one-shot
// tickets, client-side reconnect) to the PERSISTENT pty surface: the server
// owns the list and the screen (snapshot + checkpoint replay), one WebSocket
// attachment never reconnects, and disconnect = detach, never kill.
//
//   1. Data face: the `persistentPtyFrame` binary framing (byte 0 = data?1:0,
//      u16BE cols, u16BE rows, payload at offset 5 — client/src/solid/pty.ts
//      :40-48), the 7-variant `PersistentPtyMessage` union literals (:7-31),
//      the `decodePersistentPtyMessage` export, and `createPersistentPtyClient`
//      verbatim (:62-84: ticket header `x-opencode-ticket: "1"`, ws path
//      `api/experimental/persistent-pty/${ptyID}/connect`, query params
//      ticket/cursor/attachment_id/takeover/input_protocol, binaryType
//      arraybuffer, the `openSocket?` seam, http→ws protocol conversion); the
//      persistent-pty protocol group endpoint identifiers and descriptions
//      verbatim incl. the update/rename 501 description (persistent-pty.ts:91);
//      `PtyFeatureUnsupportedError` (httpApiStatus 501, protocol/src/errors.ts).
//      DEPRECATED-SURFACE RECORD (decision): the old `pty` group survives
//      verbatim at protocol/src/groups/pty.ts:9-12 — its connect constants are
//      asserted here as a deprecated-surface record (persistent-pty.ts
//      re-exports them); the old endpoint descriptions are dropped as retired.
//      The SCHEMA face is split the same way (review follow-up — the original
//      re-anchor dropped the old-surface schema shapes silently): the old
//      schema files (schema/src/{pty,pty-ticket}.ts, byte-same at this pin)
//      keep a deprecated-surface record (Info status literals / UpdateInput
//      size / the four pty.* events / PtyTicket.ConnectToken), and the LIVE
//      schema/src/persistent-pty.ts carries its own contract anchors
//      (Snapshot checkpoint / UpdateInput nullable title / the three
//      persistent-pty events).
//   2. Call-face exhaustive sets (NORMALIZED whitespace-stripped scan — every
//      zero/exclusive assertion below applies the same normalization, no
//      exceptions). SCAN DOMAIN = app + gui-plugins `src/**` PRODUCTION files
//      only (tests excluded by the new rule — pin-precise history: at the OLD
//      pin b4525d79bf the terminal directory carried NO model.test.ts and the
//      old `terminal.close` set was exactly {renderer.tsx}; at the NEW pin
//      model.test.ts exists and, under the old tests-in-domain rule, its
//      `server.emit("persistent-pty.…")` test-call sites would have joined
//      the subscription sets — hence production-only). Normalized call-site
//      sets EQUAL exactly:
//      persistentPty.list/create/remove/update → {terminal/model.ts}
//      (:187/:221/:253/:322/:327); persistentPty.snapshot →
//      {terminal/terminal.tsx} (:544); persistentPty.get/shutdown/handoff/
//      connectToken/connect → ZERO in-domain (connector-internal calls live in
//      the client package, outside the domain); createPersistentPtyClient →
//      exactly {terminal/terminal.tsx}; the OLD face `pty.list/create/remove/
//      update/get/connectToken/connect` + `createPtyClient` → ZERO in-domain
//      (the v2.2.1 transport instance in app client.tsx is gone);
//      `persistent-pty.added/removed/updated` event subscriptions → exactly
//      {terminal/model.ts} (:425-437). The generated client endpoint wrappers
//      are NOT part of the sets (N-5 layering note).
//   3. Disconnect red line (acceptance 2, v2.2.7 shape): terminal.tsx contains
//      ZERO `persistentPty.remove`/`kill(` (normalized) and exactly TWO
//      `close(1000)` sites (the only teardown form; OLD PIN COUNTED 3 — the
//      onCleanup persist-close was removed with the persisted snapshot; the
//      count drop is recorded, not silently lost). Cleanup = dispose-only:
//      the onCleanup block is `connection.dispose()` + `dispatch({type:
//      "disposed"})` (:591-594) — serialize-snapshot persistence is retired;
//      stop() aborts the connect controller and closes an in-flight socket
//      with 1000 (:416-431). `persistentPty.remove` lives ONLY in model.ts's
//      close command, paired with the PtyNotFoundError → close.succeeded
//      swallow (the ONLY explicit-termination entry, reached solely through
//      the `close.requested` dispatch from the session handle). The shared
//      mobile-hosts layer stays terminal-free: zero precise terminal
//      API-shape anchors (old `pty.*` AND `persistentPty.*` faces, both
//      client constructors, the @opencode/client import), zero ghostty/xterm
//      references, zero bare `pty` word — raw AND squashed. WHY precise
//      anchors: the substring `pty` false-matches the `empty` family and
//      `\bterminal\b` false-matches prose comments — measured on the old pin;
//      re-measured zero-hit on this pin's mobile-hosts src (57 files).
//   4. Recovery = remount, never reconnect: the connection-machine verbatim
//      "It never reconnects" comment (:19); the surface-machine remount chain
//      (missing mount → issued+1 → mounted(...); a failed mount remounts once
//      after a newer server connection lists the terminal); the failed-list
//      retry (panel.tsx retry button → model retry → session.retry) with the
//      stale-answer rejections (list attempt guard + stale rename guard); the
//      snapshot→restore→connect chain (terminal.tsx:543-587: persistentPty
//      .snapshot → connection.restore({size, checkpoint}) →
//      createPersistentPtyClient(...).connect({ptyID, cursor: tail,
//      attachmentID, takeover: true})); the input_protocol!==1 outdated
//      classification (connection-machine).
//   5. Lifecycle / rename: the 15s request budget (TERMINAL_REQUEST_TIMEOUT_MS,
//      machine.ts — the old 20-session/20-workspace caps are retired without
//      replacement: the server's list is the only record); the legacy storage
//      decode-dedup (model.ts LEGACY workspace:terminal + `cleared` Set
//      guard); the default-title numbering dedup; the rename face
//      (rename-machine transitionRename + save-null, inline-rename, tab.tsx
//      wiring); the title/501 classification chain (isPtyFeatureUnsupported
//      Error → rename.failed kind → toast-rename-failed → rename.unsupported
//      toast, en dictionary line) — the socket's `title_changed` message is
//      deliberately ignored by the connection machine; titles reach the UI as
//      `persistent-pty.updated` → `terminal.updated` events; the 12 terminal
//      test files presence (state.test.ts/serialize are retired — those files
//      are deleted at this pin; writer.test.ts survives).
//   6. Resize chain & mobile face: the pane measure anchors (ResizeObserver +
//      observe, window resize, document.fonts.ready — terminal.tsx:529-536),
//      the `queue-resize` effects (connection-machine effect def + the three
//      emission sites :117/:157/:163-168 and connection.ts:60-71 writer
//      ordering incl. the \x1bc reset + base64 checkpoint decode), the
//      pane-machine sized discipline (TERMINAL_SIZE_DEBOUNCE_MS 100, first
//      measurement applies at once, stale seq ignored, pendingInput held
//      until sized and flushed in order), the input face (onData →
//      connection.input), the kill-line \x15 + ctrl+shift+c copy +
//      terminal.toggle passthrough + meta-chord consumption, the mobile
//      registration (order 30 menu terminal in renderer.tsx :230-238 and the
//      order 20 session.panel menu item :155-171), the mod+w close command
//      presence (the close FACE; the call-face set is retired), the
//      frame.placement() === "mobile" branch (panel.tsx:40), the en+zh
//      terminal i18n keys (key-style tolerant), and the viewport record:
//      ZERO visualViewport references in the terminal directory on this pin —
//      the terminal face carries no viewport sync of its own (the app-shell
//      soft-keyboard anchors are verify-interaction-quality's cross-reference,
//      stale on this pin pending that probe's own re-anchor).
//   7. Zero host-OS conditionals (whitelist scan, #8 N-5 / #11 / #12 pattern):
//      gui-plugins/src/terminal (whole directory) + client/src/solid/pty.ts
//      must contain ZERO process.platform / navigator.platform / node:os /
//      require("os") / from "os" references, with a scanned-file lower bound
//      so a directory rename can never silently empty the scan (real count on
//      this pin: 101 — terminal 100 + pty.ts).
//
// RETIRED ANCHORS (explicit dropped-as-retired list — protective intent is
// either replaced by the anchors above or honestly dropped with its subject):
//   - workspace.close call-face set {tab.tsx}: the tab now closes through the
//     session handle (`props.session.close(props.terminal.id)`, tab.tsx:25);
//     the close face is covered by the model close-command pairing (group 3).
//   - terminal.close call-face set {renderer.tsx} — exactly, at the old pin
//     (the old pin's terminal directory carried no model.test.ts): at the new
//     pin the same scan would span renderer.tsx/panel.tsx plus model.test.ts
//     test-call sites under the old tests-in-domain rule, so the set is
//     retired with the production-only scan; the close command survives as a
//     BuiltinCommand — its FACE is asserted as presence (mod+w + terminal
//     scope, group 6), not as a receiver-name call set.
//   - close(1000) count 3 → 2: recorded drop (see group 3).
//   - persistTerminal + onCleanup adjacency: the client-side persisted
//     snapshot is gone at v2.2.7 (the server snapshot IS the record);
//     replaced by the dispose-only cleanup anchor (group 3) and the
//     snapshot/cursor restore chain (group 4).
//   - i18n connectionLost.* keys (title/abnormalClose/description) and the
//     en server-restart honesty line: gone from both dictionaries at this
//     pin; failure text is now failureText() → disconnected/connectionFailed/
//     serverOutdated keys (group 6 asserts the surviving mobile-face keys).
//   - reconnect family: backoff anchor (250ms→4s), liveness-probe comment,
//     gone() exited/PtyNotFoundError probe, code-1000 early return,
//     abnormalClose toast, recoverTerminal→ops.clone / markTerminalConnected
//     →ops.trim pair, and the pty.exited subscription — ALL zero-hit at this
//     pin: one attachment never reconnects (group 4 verbatim) and exit arrives
//     as a PersistentPtyMessage variant (group 1). Recovery is the
//     surface-machine remount + retry chain (group 4).
//   - MAX_TERMINAL_SESSIONS = 20 and MAX_CACHED_TERMINAL_WORKSPACES = 20:
//     neither has a replacement constant — the server's list is the only
//     record of which terminals exist; the lifecycle bound is now the 15s
//     request budget (group 5).
//   - workspace key `server\0directory`: no client-side workspace store
//     exists at this pin; sessions key `${server.id}\n${sessionID}` and the
//     legacy storage decode is a dedup'd one-shot cleanup (group 5).
//   - 2000-row persistedScrollbackRows: retired with persistTerminal; the
//     live 10_000 scrollback anchor survives (group 6-adjacent, asserted in
//     group 5 via terminal.tsx).
//   - old pty-group protocol assertions (three endpoint descriptions verbatim
//     + the pty.connect path): the old surface is deprecated-but-alive at
//     protocol/src/groups/pty.ts (:9-12 constants) — decision: keep as
//     deprecated-surface record (constants only, group 1), descriptions
//     retired.
//   - scheduleSize/lastSize/pushSize/handleOpen resize chain: replaced by the
//     pane-machine sizing discipline + queue-resize effects (group 6).
//   - old group-1 terminal.tsx binary-decode family (the binary control-frame
//     comment verbatim, the ControlFrame = Schema.fromJsonString(...) decoder,
//     the `bytes[0] !== 0` early return, the `cursor += data.length` text-frame
//     advance, the `event.data instanceof ArrayBuffer` branch): the client-side
//     decode mirror is deleted at this pin — replaced by the connector's
//     decode/framing anchors (client/src/solid/pty.ts, group 1) and the
//     checkpoint replay anchors (connection.ts `\x1bc`/atob, group 6).
//   - model.ts clone face (`clone()` deleted upstream at v2.2.7 — the clone
//     create shape `.create({location,title:pty.title})`, the
//     buffer/cursor/scrollY restore-clear chain, the "Failed to clone
//     terminal" swallow): dead-terminal replacement is now the surface-machine
//     remount + snapshot/cursor restore chain (group 4); no client-side clone
//     exists.
//   - panels.tsx `id="terminal-panel"` and `collapseThreshold={50}` (old
//     group 6): the v2.2.1 app-shell terminal dock is deleted/reshaped at
//     this pin — app-shell anchors stay with verify-interaction-quality (see
//     the visualViewport entry below).
//   - OLD-surface schema data face (schema/src/pty.ts status literals /
//     UpdateInput size / four pty.* events / pty-ticket ConnectToken): NOT
//     dropped — re-anchored as a DEPRECATED-SURFACE RECORD (both files
//     byte-same at this pin, group 1); the live face schema/src/
//     persistent-pty.ts carries its own anchors (Snapshot checkpoint /
//     UpdateInput nullable title / three persistent-pty events, group 1).
//     Corrected in the review follow-up — the original re-anchor dropped
//     these silently.
//   - panels.tsx visualViewport sync, mobile.tsx sorted menu/drawer ordering,
//     md:hidden ResizeHandle branch: app-shell anchors owned by
//     verify-interaction-quality (its group 3/4 cross-references) — stale on
//     this pin, pending that probe's own re-anchor; the terminal-face side is
//     recorded as the group 6 zero-visualViewport scan.
//   - terminal/index.ts ctrl+` toggle keybind: KEPT (group 6) — survives
//     verbatim at index.ts:6. Review follow-up: the old ctrl+alt+t keybind
//     (renderer.tsx:123) and the lazy panel chunk-split (renderer.tsx:173)
//     ALSO still hold and are re-anchored (group 6) — they had been dropped
//     without a retired entry.
//
// HONEST BOUNDARY (same tradition as verify-diff.ts): this is a static
// STRUCTURE check (text anchors / regex on source files). It proves source
// shape, NOT runtime behavior: WASM loading in WebView, tab interactions,
// snapshot/cursor replay on a live server, the detach-does-not-kill red line
// against a real PTY, input/resize races, IME/external-keyboard/touch
// behavior, takeover/controller handoff between two live clients, and ticket
// expiry are device-gate territory (docs/design/interaction.md G24), BLOCKED
// at this verification level pending SSH host authorization (issue #191
// records the SSH-tunnel PTY paths as NOT RUN). Server-side PTY
// IMPLEMENTATION (packages/core/src/pty.ts, pty/{protocol,ticket}.ts, server
// handlers) is NOT in the vendored closure and is NOT asserted here — it is
// cited from the upstream pin cache in the unit document (detach-does-not-
// kill, 2MB buffer, ticket TTL, checkpoint replay). The protocol/schema
// DESCRIPTIONS, the connector (client/src/solid/pty.ts) and the terminal UI
// (gui-plugins/src/terminal/**) ARE in the closure and are asserted here; the
// two source layers are kept separate in the unit document.
//
// Usage:
//   bun run scripts/verify-terminal.ts
// Exit 0 = all assertions PASS (including the negative drills: each drill
// injects a violation IN MEMORY, expects the named group to fire, restores,
// and expects PASS — the vendored sources are never written to).

const repoRoot = new URL("../", import.meta.url)

class ProbeFailure extends Error {}

function fail(message: string): never {
  throw new ProbeFailure(message)
}

const rawRead = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

// In-memory overlay for the negative drills — the vendored sources are NEVER
// written to disk; every drill restores its entry before the next step. Every
// assertion read goes through `read`, so each drill's mutation is visible to
// the guard it exercises.
const overlay = new Map<string, string>()

const read = async (path: string) => overlay.get(path) ?? (await rawRead(path))

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const SCHEMA = "vendor/upstream/packages/schema/"
const MOBILE_HOSTS = "packages/mobile-hosts/"

const TERMINAL = `${GUI_EXT}src/terminal/`

// Newline tolerance (issue #13 lesson, kept): EVERY zero/exclusive assertion
// in this probe applies the same whitespace-stripping normalization — no
// exceptions. Cross-line call sites are common at this pin (model.ts's
// multi-line persistentPty.create payload, terminal.tsx's multi-line
// .connect({...}) payload); the squashed scan covers both shapes.
const squash = (source: string) => source.replace(/\s+/g, "")

// Squash memo: the drills re-run the full scan against one mutated file; the
// memo keeps repeated scans cheap without weakening any assertion.
const squashMemo = new Map<string, { src: string; sq: string }>()
const squashed = async (path: string) => {
  const src = await read(path)
  const hit = squashMemo.get(path)
  if (hit && hit.src === src) return hit.sq
  const sq = squash(src)
  squashMemo.set(path, { src, sq })
  return sq
}

// Scan counters surfaced in the summary line.
let prodFilesScanned = 0
let mhFilesScanned = 0
let osScanFiles = 0

const TEST_FILES = [
  "connection-machine.test.ts",
  "connection.test.ts",
  "dispatch.test.ts",
  "focus-machine.test.ts",
  "machine.test.ts",
  "model.test.ts",
  "pane-machine.test.ts",
  "quote-machine.test.ts",
  "rename-machine.test.ts",
  "surface-machine.test.ts",
  "terminal-key-event.test.ts",
  "writer.test.ts",
]

async function scan() {
  prodFilesScanned = 0
  mhFilesScanned = 0
  osScanFiles = 0

  // --- 1. Persistent-PTY data face ---
  {
    const pty = await read(`${CLIENT}src/solid/pty.ts`)
    // Binary framing (pty.ts:40-48): byte 0 = data?1:0, u16BE cols at 1,
    // u16BE rows at 3, payload at offset 5.
    if (!pty.includes("export function persistentPtyFrame(size: { cols: number; rows: number }, data?: Uint8Array) {"))
      fail("1: the persistentPtyFrame signature changed")
    if (!pty.includes("const frame = new Uint8Array(5 + (data?.byteLength ?? 0))"))
      fail("1: the persistentPtyFrame 5-byte header layout changed")
    if (!pty.includes("frame[0] = data ? 1 : 0")) fail("1: the frame kind byte (data?1:0) changed")
    if (!pty.includes("view.setUint16(1, size.cols)") || !pty.includes("view.setUint16(3, size.rows)"))
      fail("1: the u16BE cols/rows encoding changed")
    if (!pty.includes("if (data) frame.set(data, 5)")) fail("1: the payload offset (5) changed")
    // The 7-variant PersistentPtyMessage union (pty.ts:7-31).
    for (const variant of [
      "attached",
      "replay_complete",
      "resized",
      "controller_changed",
      "exited",
      "title_changed",
      "foreground_process_changed",
    ]) {
      if (!pty.includes(`Schema.Literal("${variant}")`)) fail(`1: the PersistentPtyMessage "${variant}" variant moved`)
    }
    if (!pty.includes('role: Schema.optional(Schema.Literals(["controller", "observer"]))'))
      fail("1: the attached role literals changed")
    if (!pty.includes("export function decodePersistentPtyMessage(text: string)"))
      fail("1: the decodePersistentPtyMessage export moved")
    // The connector (pty.ts:62-84) verbatim.
    if (!pty.includes('"x-opencode-ticket": "1"'))
      fail("1: the connector lost the x-opencode-ticket token header value")
    if (!pty.includes("api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/connect"))
      fail("1: the persistent-pty ws connect path template changed")
    if (!pty.includes('url.searchParams.set("ticket", token.ticket)'))
      fail("1: the ticket query param assignment changed")
    if (!pty.includes('url.searchParams.set("cursor", String(input.cursor))'))
      fail("1: the cursor query param (replay position) changed")
    if (!pty.includes('url.searchParams.set("attachment_id", input.attachmentID)'))
      fail("1: the attachment_id query param changed")
    if (!pty.includes('url.searchParams.set("takeover", String(input.takeover ?? false))'))
      fail("1: the takeover query param changed")
    if (!pty.includes('url.searchParams.set("input_protocol", "1")'))
      fail("1: the input_protocol query param changed")
    if (!pty.includes('socket.binaryType = "arraybuffer"'))
      fail("1: the socket binaryType (arraybuffer) changed")
    if (!pty.includes("readonly openSocket?: (url: URL) => WebSocket"))
      fail("1: the openSocket injection seam moved (registered platform replacement point)")
    if (!pty.includes('url.protocol = url.protocol === "https:" ? "wss:" : "ws:"'))
      fail("1: the http(s)→ws(s) protocol conversion changed")

    const protocol = await read(`${PROTOCOL}src/groups/persistent-pty.ts`)
    if (!protocol.includes('PERSISTENT_PTY_CONNECT_PATH = "/api/experimental/persistent-pty/:ptyID/connect"'))
      fail("1: PERSISTENT_PTY_CONNECT_PATH constant moved")
    if (!protocol.includes("export { PTY_CONNECT_TICKET_QUERY, PTY_CONNECT_TOKEN_HEADER, PTY_CONNECT_TOKEN_HEADER_VALUE }"))
      fail("1: the persistent-pty group lost the deprecated pty constant re-export")
    if (
      !protocol.includes(
        "Resize when size is present and rename when title is present; a null title clears the user title so the shell's title shows again. Renaming fails with 501 while the terminal service predates renaming.",
      )
    )
      fail("1: the persistentPty.update rename/501 description moved (verbatim quote — in-closure)")
    if (!protocol.includes("Stream persistent PTY output through the OpenCode server."))
      fail("1: the persistentPty.connect protocol description moved (verbatim quote — in-closure)")
    if (!protocol.includes("Read the last physical rows without changing selection or taking control."))
      fail("1: the persistentPty.read protocol description moved (verbatim quote — in-closure)")
    if (!protocol.includes('title: "persistentPty"') || !protocol.includes("Prototype persistent PTY routes."))
      fail("1: the persistent-pty group title annotation moved")
    for (const id of ["read", "list", "create", "update", "remove", "snapshot", "connectToken", "connect"]) {
      if (!protocol.includes(`identifier: "experimental.persistentPty.${id}"`))
        fail(`1: the experimental.persistentPty.${id} endpoint identifier moved`)
    }

    // DEPRECATED-SURFACE RECORD: the old pty group survives verbatim at
    // pty.ts:9-12; its constants are still the ticket-face truth
    // (persistent-pty.ts re-exports them). The old endpoint descriptions are
    // retired (see the header list).
    const oldProtocol = await read(`${PROTOCOL}src/groups/pty.ts`)
    if (!oldProtocol.includes('PTY_CONNECT_TICKET_QUERY = "ticket"')) fail("1: PTY_CONNECT_TICKET_QUERY constant moved (deprecated-surface record)")
    if (!oldProtocol.includes('PTY_CONNECT_TOKEN_HEADER = "x-opencode-ticket"'))
      fail("1: PTY_CONNECT_TOKEN_HEADER constant moved (deprecated-surface record)")
    if (!oldProtocol.includes('PTY_CONNECT_TOKEN_HEADER_VALUE = "1"'))
      fail("1: PTY_CONNECT_TOKEN_HEADER_VALUE constant moved (deprecated-surface record)")
    if (!oldProtocol.includes('PTY_CONNECT_PATH = "/api/pty/:ptyID/connect"'))
      fail("1: PTY_CONNECT_PATH constant moved (deprecated-surface record)")

    const errors = await read(`${PROTOCOL}src/errors.ts`)
    if (!errors.includes('export class PtyFeatureUnsupportedError extends Schema.TaggedError<PtyFeatureUnsupportedError>()('))
      fail("1: PtyFeatureUnsupportedError moved (the rename-501 error face)")
    if (!errors.includes('"PtyFeatureUnsupportedError"') || !errors.includes("{ httpApiStatus: 501 }"))
      fail("1: PtyFeatureUnsupportedError lost its tag or 501 status")

    // SCHEMA data face. DEPRECATED-SURFACE RECORD: the old-surface schema
    // files survive byte-same at this pin (byte-compared against the pin in
    // the #191 audit) — the old pty.Info/ticket shapes keep a guard here. LIVE
    // FACE: the persistent schema is the contract source the unit document
    // cites — Snapshot (checkpoint) / UpdateInput (nullable title) / the three
    // persistent-pty events each carry their own anchors.
    const schemaPty = await read(`${SCHEMA}src/pty.ts`)
    if (!schemaPty.includes('status: Schema.Literals(["running", "exited"])'))
      fail("1: deprecated record — pty.Info status literals changed")
    if (!squash(schemaPty).includes("title:optional(Schema.String),size:optional(Schema.Struct({rows:PositiveInt,cols:PositiveInt,}),"))
      fail("1: deprecated record — pty.UpdateInput shape changed")
    for (const ev of ['"pty.created"', '"pty.updated"', '"pty.exited"', '"pty.deleted"']) {
      if (!schemaPty.includes(`type: ${ev}`)) fail(`1: deprecated record — the ${ev} event definition moved`)
    }
    const schemaTicket = await read(`${SCHEMA}src/pty-ticket.ts`)
    if (!schemaTicket.includes("ticket: Schema.String") || !schemaTicket.includes("expires_in: PositiveInt"))
      fail("1: deprecated record — PtyTicket.ConnectToken shape changed")
    if (!schemaTicket.includes('identifier: "PtyTicket.ConnectToken"'))
      fail("1: deprecated record — PtyTicket.ConnectToken identifier moved")
    const schemaPersistent = await read(`${SCHEMA}src/persistent-pty.ts`)
    if (!schemaPersistent.includes('identifier: "PersistentPty.Snapshot"'))
      fail("1: the PersistentPty.Snapshot schema identifier moved")
    if (!schemaPersistent.includes("checkpoint: Schema.Uint8Array"))
      fail("1: the snapshot checkpoint field changed (the replay contract)")
    if (!schemaPersistent.includes('identifier: "PersistentPty.UpdateInput"') ||
      !squash(schemaPersistent).includes("title:optional(Schema.NullOr(Schema.String)),"))
      fail("1: the PersistentPty.UpdateInput nullable-title (rename) contract changed")
    for (const ev of ['"persistent-pty.added"', '"persistent-pty.removed"', '"persistent-pty.updated"']) {
      if (!schemaPersistent.includes(`type: ${ev}`)) fail(`1: the ${ev} event schema definition moved`)
    }
  }

  // --- 2. Call-face exhaustive sets (normalized scan; scan domain written here) ---
  {
    // SCAN DOMAIN = app + gui-plugins `src/**` PRODUCTION files only — test
    // files are excluded by the #191 rule (pin-precise history: at the OLD
    // pin the terminal dir carried no model.test.ts and the old
    // `terminal.close` set was exactly {renderer.tsx}; at the NEW pin
    // model.test.ts exists and its `server.emit(...)` test-call sites would
    // have joined the sets under the old tests-in-domain rule — hence
    // production-only). The client GENERATED surface (endpoint wrappers with
    // zero terminal-UI callers) is NOT part of the sets (N-5 layering note).
    // The connector's own token/connect calls live in the client package,
    // outside this domain.
    const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/"]
    const isTest = (rel: string) => /\.test\.tsx?$/.test(rel)
    const patterns: [string, RegExp][] = [
      ["persistentPty.list", /persistentPty\.list\(/],
      ["persistentPty.create", /persistentPty\.create\(/],
      ["persistentPty.remove", /persistentPty\.remove\(/],
      ["persistentPty.update", /persistentPty\.update\(/],
      ["persistentPty.snapshot", /persistentPty\.snapshot\(/],
      ["persistentPty.get", /persistentPty\.get\(/],
      ["persistentPty.shutdown", /persistentPty\.shutdown\(/],
      ["persistentPty.handoff", /persistentPty\.handoff\(/],
      ["persistentPty.connectToken", /persistentPty\.connectToken\(/],
      ["persistentPty.connect", /persistentPty\.connect\(/],
      ["createPersistentPtyClient", /createPersistentPtyClient\(/],
      ["pty.create (old face)", /pty\.create\(/],
      ["pty.remove (old face)", /pty\.remove\(/],
      ["pty.update (old face)", /pty\.update\(/],
      ["pty.get (old face)", /pty\.get\(/],
      ["pty.list (old face)", /pty\.list\(/],
      ["pty.connectToken (old face)", /pty\.connectToken\(/],
      ["pty.connect (old face)", /pty\.connect\(/],
      ["createPtyClient (old face)", /createPtyClient\(/],
      ["persistent-pty.added", /persistent-pty\.added/],
      ["persistent-pty.removed", /persistent-pty\.removed/],
      ["persistent-pty.updated", /persistent-pty\.updated/],
    ]
    const callSites = new Map<string, Set<string>>()
    for (const name of patterns.map(([name]) => name)) callSites.set(name, new Set())
    for (const base of [`${APP}src/`, `${GUI_EXT}src/`]) {
      const glob = new Bun.Glob("**/*.{ts,tsx}")
      for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
        const rel = `${base}${file}`
        if (skip.some((entry) => `/${rel}`.includes(entry)) || isTest(rel)) continue
        prodFilesScanned++
        const source = await squashed(rel)
        for (const [name, pattern] of patterns) {
          if (pattern.test(source)) callSites.get(name)!.add(rel)
        }
      }
    }
    if (prodFilesScanned < 1500)
      fail(`2: scan domain implausibly small (${prodFilesScanned} production files) — the directory set looks wrong`)

    const expect = (name: string, files: string[]) => {
      const got = callSites.get(name)!
      const expected = new Set(files)
      for (const file of got) {
        if (!expected.has(file)) fail(`2: unexpected ${name} call site outside the closed set: ${file}`)
      }
      for (const file of expected) {
        if (!got.has(file)) fail(`2: expected ${name} call site missing from the scan: ${file}`)
      }
      if (got.size !== files.length) fail(`2: ${name} call-site set must equal exactly ${files.length} file(s), got ${got.size}`)
    }
    // The persistent surface: requests run in model.ts's machine commands
    // (load-list :187, close-terminal :221, rename-terminal :253, and the
    // createTerminal pair :322/:327); the pane's snapshot face is
    // terminal.tsx's connect chain.
    expect("persistentPty.list", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistentPty.create", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistentPty.remove", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistentPty.update", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistentPty.snapshot", [`${GUI_EXT}src/terminal/terminal.tsx`])
    expect("persistentPty.get", [])
    expect("persistentPty.shutdown", [])
    expect("persistentPty.handoff", [])
    expect("persistentPty.connectToken", [])
    expect("persistentPty.connect", [])
    // F1 (v2.2.7): terminal.tsx:549 is the ONLY client-constructor call — the
    // old transport-layer instance in app client.tsx is gone at this pin.
    expect("createPersistentPtyClient", [`${GUI_EXT}src/terminal/terminal.tsx`])
    // The OLD face is zero in-domain (anti-misread note, mirrored in the unit
    // document): `pty.list(` etc. are case-sensitive shapes that cannot match
    // `persistentPty.list(` (capital P), and `createPtyClient(` is not a
    // substring of `createPersistentPtyClient(`.
    expect("pty.create (old face)", [])
    expect("pty.remove (old face)", [])
    expect("pty.update (old face)", [])
    expect("pty.get (old face)", [])
    expect("pty.list (old face)", [])
    expect("pty.connectToken (old face)", [])
    expect("pty.connect (old face)", [])
    expect("createPtyClient (old face)", [])
    // The server-event subscription face: only model.ts watches the
    // persistent-pty events (model.test.ts's `server.emit(...)` test-call
    // sites are tests, outside the production scan).
    expect("persistent-pty.added", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistent-pty.removed", [`${GUI_EXT}src/terminal/model.ts`])
    expect("persistent-pty.updated", [`${GUI_EXT}src/terminal/model.ts`])
  }

  // --- 3. Disconnect red line (acceptance 2) ---
  {
    const term = await squashed(`${TERMINAL}terminal.tsx`)
    if (term.includes("persistentPty.remove(") || term.includes("kill("))
      fail("3: RED LINE — terminal.tsx must contain zero persistentPty.remove/kill calls (disconnect = detach, never terminate)")
    // Counting caliber (review R4, kept): this is a normalized SOURCE-TEXT
    // count — the squashed file is matched for the literal "close(1000)", so
    // a comment carrying that string would over-count and FAIL. That is the
    // conservative, fail-closed direction. Measured on this pin: exactly the
    // two code sites (stop()'s in-flight close :430 and the aborted-connect
    // close :557) — the OLD PIN COUNTED 3; the onCleanup persist-close is
    // retired with the persisted snapshot (recorded drop, header list).
    const closes = term.match(/close\(1000\)/g) ?? []
    if (closes.length !== 2)
      fail(`3: terminal.tsx must close its sockets with code 1000 at exactly 2 sites (got ${closes.length}; was 3 on the retired pin — the persist-close is retired with the persisted snapshot)`)
    // Dispose-only cleanup (terminal.tsx:591-594).
    if (!term.includes('onCleanup(()=>{connection.dispose()dispatch({type:"disposed"})})'))
      fail("3: the onCleanup block must be the dispose-only cleanup (connection.dispose + disposed dispatch — no persistence, no termination)")
    if (!term.includes("handles.connect?.abort()"))
      fail("3: stop() must abort the in-flight connect controller (the abort detaches the socket's listeners)")
    if (!term.includes("if(socket?.readyState===WebSocket.CONNECTING||socket?.readyState===WebSocket.OPEN)socket.close(1000)"))
      fail("3: stop()'s in-flight socket close (CONNECTING/OPEN guard → close 1000) changed")

    // The ONLY explicit-termination entry: the model close command. The
    // remove runs under close-terminal, pairs with the PtyNotFoundError →
    // close.succeeded swallow (a terminal that already exited is closed), and
    // is reached solely through the handle's close.requested dispatch.
    const model = await squashed(`${TERMINAL}model.ts`)
    if (!model.includes("(signal)=>server.client.experimental.persistentPty.remove({ptyID:command.ptyID},{signal})"))
      fail("3: model.ts close-terminal must be the ONLY persistentPty.remove site (explicit-close entry)")
    if (!model.includes('failed:(error)=>isPtyNotFoundError(error)?{type:"close.succeeded"'))
      fail("3: model.ts close() must pair the remove with the PtyNotFoundError → close.succeeded swallow (a failed remove of an exited terminal is not an error)")
    if (!model.includes('dispatch(session().server,{type:"close.requested",sessionID:initial.id,ptyID:id})'))
      fail("3: the session handle's close must dispatch close.requested (the only path into the remove)")

    // F3 (kept from #13, anchors updated to the persistent face): the shared
    // layer never touches the terminal face. Precise API-shape anchors ONLY —
    // the measured false-match surfaces of broader substrings are listed in
    // the head note of the old probe and re-measured zero-hit on this pin.
    // Anchors are applied to BOTH raw and squashed text.
    const negAnchors: [RegExp, RegExp, string][] = [
      [/\bpty\s*\.\s*(list|create|get|update|remove|connectToken|connect)\b/, /\bpty\.(list|create|get|update|remove|connectToken|connect)\b/, "pty API shape (old face)"],
      [/persistentPty\s*\.\s*(list|create|get|update|remove|snapshot|shutdown|handoff|connectToken|connect)\b/, /persistentPty\.(list|create|get|update|remove|snapshot|shutdown|handoff|connectToken|connect)\b/, "persistentPty API shape"],
      [/createPtyClient|createPersistentPtyClient/, /createPtyClient|createPersistentPtyClient/, "terminal client constructors"],
      [/from ["']@opencode\/client/, /from"@opencode\/client/, 'from "@opencode/client'],
    ]
    const regexAnchors: [RegExp, string][] = [
      [/ghostty|xterm/i, "ghostty|xterm (case-insensitive)"],
      [/\bpty\b/, "\\bpty\\b word boundary"],
    ]
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${MOBILE_HOSTS}src`, repoRoot).pathname }))) {
      mhFilesScanned++
      const rel = `${MOBILE_HOSTS}src/${file}`
      const raw = await read(rel)
      const sq = squash(raw)
      for (const [rawRe, sqRe, label] of negAnchors) {
        if (rawRe.test(raw) || sqRe.test(sq)) fail(`3: mobile-hosts shared layer must stay terminal-free (${label}): ${rel}`)
      }
      for (const [re, label] of regexAnchors) {
        if (re.test(raw)) fail(`3: mobile-hosts shared layer must stay terminal-free (${label}): ${rel}`)
      }
    }
    if (mhFilesScanned < 30) fail(`3: mobile-hosts scan covered only ${mhFilesScanned} files — the directory set looks wrong`)
  }

  // --- 4. Recovery = remount, never reconnect ---
  {
    const machine = await read(`${TERMINAL}connection-machine.ts`)
    if (!machine.includes("One WebSocket attachment to a persistent PTY. It never reconnects: after a failure the surface mounts a new terminal"))
      fail("4: the never-reconnects comment anchor changed (verbatim, connection-machine.ts:19)")
    if (!machine.includes("with a new attachment and a new state."))
      fail("4: the never-reconnects comment tail changed (verbatim, connection-machine.ts:21)")
    // The outdated classification: a server whose protocol is older answers
    // attached with inputProtocol !== 1.
    const machineSq = await squashed(`${TERMINAL}connection-machine.ts`)
    if (!machineSq.includes('if(message.inputProtocol!==1)return{state:{status:"failed",failure:"outdated"},effects:[{type:"fail",failure:"outdated"}]}'))
      fail("4: the input_protocol!==1 outdated classification changed")

    // The surface-machine remount chain: a shown terminal the server still
    // lists but no surface keeps gets a fresh mount (issued+1); a failed
    // mount remounts once after a newer server connection lists the terminal.
    const surfaceSq = await squashed(`${TERMINAL}surface-machine.ts`)
    if (!surfaceSq.includes('if(event.type==="surface.failed")return{state:failed(state,event.mount),effects:QUIET}'))
      fail("4: the surface.failed event handling changed")
    if (!surfaceSq.includes("constmissing=shown!==null&&!kept.some((surface)=>surface.id===shown)"))
      fail("4: the missing-surface detection changed")
    if (!surfaceSq.includes("constissued=missing?state.issued+1:state.issued"))
      fail("4: the remount issued+1 chain changed")
    if (!surfaceSq.includes("?[...kept,mounted(event.session,shown,issued,event.connection)]"))
      fail("4: the remount mount() construction changed")
    if (!surfaceSq.includes("if(state.connection>current.connection){") ||
      !surfaceSq.includes("surfaces:swap(state.surfaces,current,mounted(state.session,current.id,issued,state.connection)),"))
      fail("4: the failed-mount remount-once-after-newer-connection chain changed")
    if (!surfaceSq.includes("readonlystatus:\"live\"|\"failed\""))
      fail("4: the Surface live/failed status union changed")

    // The failed-list retry + stale-answer rejections.
    const panelSq = await squashed(`${TERMINAL}panel.tsx`)
    if (!panelSq.includes("onClick={()=>terminal().retry()}"))
      fail("4: the failed-list retry button must route through terminal().retry()")
    const modelSq = await squashed(`${TERMINAL}model.ts`)
    if (!modelSq.includes('retry:()=>dispatch(session().server,{type:"session.retry",sessionID:initial.id})'))
      fail("4: the model retry dispatch changed")
    const stateRaw = await read(`${TERMINAL}machine.ts`)
    const stateSq = await squashed(`${TERMINAL}machine.ts`)
    if (!stateSq.includes('if(event.type==="session.retry")returnlist?.status==="failed"?load(state,event.sessionID):unchanged(state)'))
      fail("4: the session.retry guard (retry only a failed list) changed")
    if (!stateRaw.includes("Only the latest request for a session still loaded may settle it.") ||
      !stateSq.includes("list.attempt!==event.attempt)returnunchanged(state)"))
      fail("4: the stale-list-answer rejection changed")
    if (
      !stateRaw.includes(
        "An older rename's answer is stale: the newer one decides, and the server's update event reports the result.",
      ) ||
      !stateSq.includes("if(current.renames[event.ptyID]?.attempt!==event.attempt)returnunchanged(state)"))
      fail("4: the stale-rename-answer rejection changed")

    // The snapshot → restore → connect chain (terminal.tsx:543-587).
    const term = await squashed(`${TERMINAL}terminal.tsx`)
    if (!term.includes("constsnapshot=awaitserver.client.experimental.persistentPty.snapshot({ptyID})"))
      fail("4: the connect chain must fetch the persistentPty snapshot first")
    if (!term.includes("connection.restore({size:snapshot.info.size,checkpoint:snapshot.checkpoint})"))
      fail("4: the snapshot must flow into connection.restore({size, checkpoint})")
    if (!term.includes("awaitcreatePersistentPtyClient(server.client,{url:server.url}).connect({"))
      fail("4: the mount-time ServerRef capture connect shape changed (intentional mount-time capture — ref object, not a URL snapshot)")
    if (!term.includes(".connect({ptyID,cursor:snapshot.info.output.tail,attachmentID,takeover:true,})"))
      fail("4: the connect payload must carry cursor=snapshot tail + attachmentID + takeover=true")
    if (!term.includes("if(signal.aborted){socket.close(1000)"))
      fail("4: the aborted-connect socket close (code 1000) changed")
  }

  // --- 5. Lifecycle / rename ---
  {
    const state = await read(`${TERMINAL}machine.ts`)
    if (!state.includes("export const TERMINAL_REQUEST_TIMEOUT_MS = 15_000"))
      fail("5: the 15s request-budget anchor changed (the retired 20-session/20-workspace caps have no replacement constant)")
    if (!state.includes("readonly status: \"unsupported\"") || !state.includes('CreateFailure = "unsupported" | "failed" | "cancelled"'))
      fail("5: the machine unsupported/failed classification union changed")

    const model = await read(`${TERMINAL}model.ts`)
    if (!model.includes('const LEGACY = { key: "terminals", from: "workspace:terminal" }'))
      fail("5: the legacy storage decode face (pre-server terminals) moved")
    if (!model.includes("const cleared = new Set<string>()") || !model.includes("if (cleared.has(id)) return"))
      fail("5: the legacy storage decode-dedup (cleared Set guard) changed")
    if (!model.includes("const used = new Set(known.flatMap((info) => titleNumber(info.title) ?? []))"))
      fail("5: the default-title numbering dedup changed")
    if (!model.includes("title: defaultTitle(number),")) fail("5: the new() default-title create shape changed")
    if (!model.includes('data.on("persistent-pty.added"') || !model.includes('data.on("persistent-pty.removed"') ||
      !model.includes('data.on("persistent-pty.updated"'))
      fail("5: the persistent-pty event subscriptions moved (the retired pty.exited has no replacement)")
    if (!model.includes('{\n          type: "terminal.updated",'))
      fail("5: the persistent-pty.updated → terminal.updated classification changed")
    if (!model.includes('kind: isPtyFeatureUnsupportedError(error) ? "unsupported" : "failed",'))
      fail("5: the rename failure must classify PtyFeatureUnsupportedError as unsupported (the 501 face)")
    if (!model.includes('title: input.t("rename.unsupported")'))
      fail("5: the unsupported-rename toast (rename.unsupported) moved")
    if (!model.includes("input.storage.remove(LEGACY.key, { scope: value, from: LEGACY.from })"))
      fail("5: the legacy storage removal changed")

    const stateSq = await squashed(`${TERMINAL}machine.ts`)
    if (!stateSq.includes('if(event.type==="rename.failed")returnchanged(next,[{type:"toast-rename-failed",kind:event.kind,error:event.error}])'))
      fail("5: the rename.failed → toast-rename-failed classification changed")

    const en = await read(`${TERMINAL}i18n/en.ts`)
    if (!en.includes('"rename.unsupported": "Terminal renaming will be available after OpenCode\'s terminal service restarts"'))
      fail("5: en lost the rename.unsupported 501 honesty line")

    // The rename face: machine + inline field + tab wiring.
    const rename = await read(`${TERMINAL}rename-machine.ts`)
    if (!rename.includes("export function transitionRename") || !rename.includes("export const initialRenameState"))
      fail("5: the rename machine moved")
    if (!rename.includes('{ type: "save", title: state.draft.trim() || null }'))
      fail("5: the rename save effect must carry null for an emptied field")
    const inline = await read(`${TERMINAL}inline-rename.ts`)
    if (!inline.includes("export function createInlineRename")) fail("5: the inline-rename hook moved")
    const tab = await read(`${TERMINAL}tab.tsx`)
    if (!tab.includes("createInlineRename({ title: () => props.terminal.title, rename: () => props.rename })"))
      fail("5: the tab's inline-rename wiring changed")
    if (!tab.includes("const close = () => props.session.close(props.terminal.id)"))
      fail("5: the tab close must route through the session handle (the retired workspace.close face)")

    // The tab-list decode dedup: stored open tabs ∩ the server's list, in the
    // server's order, without duplicates.
    const machineSq = await squashed(`${TERMINAL}machine.ts`)
    if (!machineSq.includes("return[...newSet([...open.filter((id)=>live.has(id)),...live])]"))
      fail("5: the viewTabs stored-vs-server dedup shape changed")

    const term = await read(`${TERMINAL}terminal.tsx`)
    if (!term.includes("scrollback: 10_000,")) fail("5: the 10k live scrollback anchor changed")

    // The 12 test files (state.test.ts + its serialize sibling are retired —
    // deleted at this pin; writer.test.ts survives).
    for (const file of TEST_FILES) {
      const test = await read(`${TERMINAL}${file}`)
      if (!test.includes("bun:test")) fail(`5: the terminal test file ${file} moved or lost its bun:test import`)
    }
  }

  // --- 6. Resize chain & mobile face ---
  {
    const termRaw = await read(`${TERMINAL}terminal.tsx`)
    if (!termRaw.includes("const observer = new ResizeObserver(measure)"))
      fail("6: the ResizeObserver measure anchor changed")
    if (!termRaw.includes("observer.observe(container)")) fail("6: the ResizeObserver observe wiring changed")
    if (!termRaw.includes('window.addEventListener("resize", measure)'))
      fail("6: window resize must drive measure (N5 wiring direction)")
    if (!termRaw.includes("void document.fonts.ready.then(measure)"))
      fail("6: the font-load remeasure anchor changed")
    if (!termRaw.includes("const onData = t.onData((data) => connection.input(data))"))
      fail("6: the input path (onData → connection.input) changed")
    if (!termRaw.includes("t.attachCustomKeyEventHandler((event) => {"))
      fail("6: the custom key event handler moved")
    if (!termRaw.includes('event.ctrlKey && event.shiftKey && !event.metaKey && key === "c"'))
      fail("6: the ctrl+shift+c copy handler changed")
    if (!termRaw.includes('keybinds.matches("terminal.toggle", event)'))
      fail("6: the terminal.toggle keybind passthrough changed")
    if (!termRaw.includes("consumeTerminalMetaKey(event, {")) fail("6: the meta-chord consumption (paste/copy) moved")

    const keyEvent = await read(`${TERMINAL}terminal-key-event.ts`)
    if (!keyEvent.includes('return "\\x15"')) fail("6: the meta+Backspace kill-line (\\x15) anchor changed")

    // The queue-resize face: effect definition + the three emission sites +
    // the writer-ordered execution (resize, then the \x1bc reset + base64
    // checkpoint decode).
    const machineSq = await squashed(`${TERMINAL}connection-machine.ts`)
    if (!machineSq.includes('readonlytype:"queue-resize"')) fail("6: the queue-resize effect definition moved")
    if (!machineSq.includes('effects:[{type:"queue-resize",size:event.size,checkpoint:event.checkpoint}]'))
      fail("6: the snapshot.restored queue-resize emission (checkpoint anchor) changed")
    if (!machineSq.includes('effects:[{type:"queue-resize",size:message.info.size}],'))
      fail("6: the attached queue-resize emission (server canonical size) changed")
    if (!machineSq.includes('type:"queue-resize",size:{cols:message.cols,rows:message.rows},checkpoint:message.checkpoint,reset:true,'))
      fail("6: the resized queue-resize emission (checkpoint + reset) changed")
    const connectionSq = await squashed(`${TERMINAL}connection.ts`)
    if (!connectionSq.includes('if(effect.type==="queue-resize"){constsize=effect.sizewriter.push(()=>input.resize(size))'))
      fail("6: the queue-resize execution must push the resize through the writer first")
    if (!connectionSq.includes('constcheckpoint=(effect.reset?"\\x1bc":"")+atob(effect.checkpoint)'))
      fail("6: the \\x1bc reset + base64 checkpoint decode changed")

    // The pane-machine sized discipline: first measurement applies at once;
    // later resizes debounce at 100ms with a seq guard; held input flushes in
    // order once sized.
    const pane = await read(`${TERMINAL}pane-machine.ts`)
    if (!pane.includes("export const TERMINAL_SIZE_DEBOUNCE_MS = 100")) fail("6: the 100ms debounce delay anchor changed")
    if (!pane.includes("effects: [{ type: \"schedule-size-timer\", seq, delayMs: TERMINAL_SIZE_DEBOUNCE_MS }]"))
      fail("6: the resize debounce scheduling changed")
    const paneSq = await squashed(`${TERMINAL}pane-machine.ts`)
    if (!paneSq.includes("if(!sizing.pending||sizing.seq!==event.seq)return{state,effects:NONE}"))
      fail("6: the stale size-timer seq guard changed")
    if (!paneSq.includes("if(!sizing.size)return{state:{...state,sizing:{seq:sizing.seq,size:proposed,pending:undefined}},effects:[{type:\"apply-size\",size:proposed}],}"))
      fail("6: the first-measurement-applies-at-once anchor changed")
    const connMachineSq = await squashed(`${TERMINAL}connection-machine.ts`)
    if (!connMachineSq.includes("readonlypendingInput:readonlyUint8Array[]"))
      fail("6: the pendingInput held-input field moved")
    if (!connMachineSq.includes("if(held.pendingInput.length>0)returnheld.pendingInput.map((data)=>send(size,data))"))
      fail("6: the held-input flush-in-order discipline changed")

    // The mobile face: placement branch + both registrations + the close
    // command presence + the i18n keys.
    const panel = await read(`${TERMINAL}panel.tsx`)
    if (!panel.includes('const mobile = () => frame.placement() === "mobile"'))
      fail("6: the frame.placement() mobile branch changed")
    const renderer = await read(`${TERMINAL}renderer.tsx`)
    if (!renderer.includes('menu: "session.panel"') || !renderer.includes("order: 20,"))
      fail("6: the session.panel menu registration (order 20) changed")
    const rendererSq = await squashed(`${TERMINAL}renderer.tsx`)
    if (!rendererSq.includes('order:30,kind:"menu",icon:"terminal",cached:true,'))
      fail("6: the mobile Panel registration (order 30, kind menu, icon terminal) changed")
    if (!renderer.includes('bind: "mod+w"') || !renderer.includes("scope: '[data-component=\"terminal\"]'"))
      fail("6: the close command face (mod+w, terminal scope — presence, not a call-face set) changed")
    // Review follow-up: both anchors STILL hold at this pin (old group 6 had
    // them; the first re-anchor dropped them without a retired entry).
    if (!renderer.includes('bind: "ctrl+alt+t"'))
      fail("6: the new-terminal command keybind (ctrl+alt+t, renderer.tsx:123) changed (review re-added anchor)")
    if (!renderer.includes('const TerminalPanel = lazy(() => import("./panel"))'))
      fail("6: the lazy panel chunk split changed (renderer.tsx:173, review re-added anchor)")
    const termIndex = await read(`${TERMINAL}index.ts`)
    if (!termIndex.includes('bind: "ctrl+`"')) fail("6: the toggle command keybind changed (terminal/index.ts)")

    const en = await read(`${TERMINAL}i18n/en.ts`)
    const zh = await read(`${TERMINAL}i18n/zh.ts`)
    for (const [dict, label] of [
      [en, "en"],
      [zh, "zh"],
    ] as const) {
      // Key-style tolerant anchors (review N2, kept): `loading` and `close`
      // are unquoted keys, the rest quoted — both spellings matched.
      if (!/\bloading:/.test(dict)) fail(`6: ${label} lost the unquoted loading key`)
      if (!/\bclose:/.test(dict)) fail(`6: ${label} lost the unquoted close key`)
      if (!dict.includes('"tab.title"')) fail(`6: ${label} lost the tab.title key`)
      if (!dict.includes('"command.new"')) fail(`6: ${label} lost the command.new key`)
    }

    // Viewport record (v2.2.7): the terminal directory carries NO
    // visualViewport sync of its own — the app-shell soft-keyboard anchors
    // belong to verify-interaction-quality (stale cross-reference on this
    // pin). A reintroduced terminal-face viewport sync must re-home here.
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(TERMINAL, repoRoot).pathname }))) {
      const source = await read(`${TERMINAL}${file}`)
      if (source.includes("visualViewport"))
        fail(`6: the terminal directory carries a visualViewport reference on this pin — the terminal-face viewport record is no longer zero: ${file}`)
    }
  }

  // --- 7. Zero host-OS conditionals in the whitelisted terminal-face domains ---
  {
    // Directories are scanned recursively; single files count once. The
    // terminal directory was covered by NO previous probe (#8–#12 whitelists) —
    // this is its first scan (cross-probe union note in the unit doc).
    const whitelist: [string, "dir" | "file"][] = [
      [`${GUI_EXT}src/terminal`, "dir"],
      [`${CLIENT}src/solid/pty.ts`, "file"],
    ]
    const osPatterns: [RegExp, string][] = [
      [/process\.platform/, "process.platform"],
      [/navigator\.platform/, "navigator.platform"],
      [/from ["']node:os["']/, 'import from "node:os"'],
      [/require\(["']os["']\)/, 'require("os")'],
      [/from ["']os["']/, 'import from "os"'],
    ]
    // Issue #67 measured exception, re-confirmed on this pin: terminal/quote.tsx
    // carries one navigator.platform mac-pointer gate on the quote button.
    const osExceptions = new Set([`${GUI_EXT}src/terminal/quote.tsx`])
    for (const [base, kind] of whitelist) {
      const targets: string[] = []
      if (kind === "file") {
        targets.push(base)
      } else {
        const glob = new Bun.Glob("**/*.{ts,tsx}")
        for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
          targets.push(`${base}/${file}`)
        }
      }
      for (const target of targets) {
        osScanFiles++
        const source = await read(target)
        if (osExceptions.has(target)) continue
        for (const [pattern, label] of osPatterns) {
          if (pattern.test(source)) fail(`7: host-OS conditional (${label}) found in whitelisted ${target}`)
        }
      }
    }
    // Lower bound (real count on this pin: 101 — terminal 100 + solid/pty.ts):
    // a directory rename must never silently empty the scan.
    if (osScanFiles < 101) fail(`7: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
  }
}

// --- Negative-drill harness ---
// Each drill: inject a violation IN MEMORY (overlay), re-run the full scan and
// expect the NAMED guard to fire, restore, and expect PASS. A drill that does
// not fail, fires the wrong group, or cannot restore is a probe bug — fail
// closed. The vendored sources are never written to.
const drills: string[] = []

async function drill(name: string, target: string, mutate: (source: string) => string, expectPrefix: string, expectLabel: string) {
  const original = await rawRead(target)
  const mutated = mutate(original)
  if (mutated === original) fail(`drill "${name}" mutation was a no-op — its injection anchor drifted`)
  overlay.set(target, mutated)
  try {
    let threw: ProbeFailure | undefined
    try {
      await scan()
    } catch (error) {
      if (!(error instanceof ProbeFailure)) throw error
      threw = error
    }
    if (!threw) fail(`drill "${name}" injected violation did NOT fail the probe — the guard it exercises is dead`)
    if (!threw.message.startsWith(expectPrefix) || !threw.message.includes(expectLabel))
      fail(`drill "${name}" fired the wrong guard: got "${threw.message}", expected prefix "${expectPrefix}" containing "${expectLabel}"`)
  } finally {
    overlay.delete(target)
  }
  await scan()
  drills.push(`${name}: inject→FAIL(${expectPrefix})→restore→PASS`)
}

await scan()

await drill(
  "third createPersistentPtyClient caller",
  `${GUI_EXT}src/terminal/panel.tsx`,
  (s) => `${s}\nvoid createPersistentPtyClient(props.model as never, { url: "" })\n`,
  "2:",
  "unexpected createPersistentPtyClient call site",
)
await drill(
  "ticket header value flipped",
  `${CLIENT}src/solid/pty.ts`,
  (s) => s.replace('"x-opencode-ticket": "1"', '"x-opencode-ticket": "2"'),
  "1:",
  "x-opencode-ticket",
)
await drill(
  "takeover param removed",
  `${CLIENT}src/solid/pty.ts`,
  (s) => s.replace('      url.searchParams.set("takeover", String(input.takeover ?? false))\n', ""),
  "1:",
  "takeover",
)
await drill(
  "persistentPty.remove injected in terminal cleanup",
  `${TERMINAL}terminal.tsx`,
  (s) => s.replace('    dispatch({ type: "disposed" })\n  })', '    dispatch({ type: "disposed" })\n    void props.server.client.experimental.persistentPty.remove({ ptyID })\n  })'),
  "2:",
  "unexpected persistentPty.remove call site",
)
await drill(
  "kill() injected in terminal cleanup",
  `${TERMINAL}terminal.tsx`,
  (s) => s.replace('    dispatch({ type: "disposed" })\n  })', '    dispatch({ type: "disposed" })\n    void kill(socket)\n  })'),
  "3:",
  "RED LINE",
)
await drill(
  "process.platform injected in terminal face",
  `${TERMINAL}dispatch.ts`,
  (s) => `${s}\nif (process.platform === "android") void 0\n`,
  "7:",
  "host-OS conditional",
)

console.log(
  "verify-terminal: PASS (" +
    "1: persistent-pty data face (frame 5-byte header + 7-variant message union + decode export; connector ticket header/path/query params/binaryType/openSocket seam; protocol group identifiers + update-501/connect/read descriptions verbatim; deprecated pty.ts constants record; PtyFeatureUnsupportedError 501; schema deprecated record — pty.Info/UpdateInput/4 events/ConnectToken byte-same; live PersistentPty schema — Snapshot checkpoint/UpdateInput nullable title/3 events); " +
    "2: normalized exhaustive sets over " +
    prodFilesScanned +
    " production files — persistentPty.list/create/remove/update {model.ts}, snapshot {terminal.tsx}, get/shutdown/handoff/connectToken/connect ZERO, createPersistentPtyClient {terminal.tsx}, OLD pty.* face + createPtyClient ZERO, persistent-pty.added/removed/updated {model.ts}; " +
    "3: disconnect red line — terminal.tsx zero persistentPty.remove/kill + exactly 2 close(1000) (drop from 3 recorded) + dispose-only onCleanup + stop() abort-close + model close-terminal ONLY remove site with PtyNotFoundError swallow + mobile-hosts " +
    mhFilesScanned +
    " files zero terminal-face anchors; " +
    "4: recovery = remount never reconnects (never-reconnects verbatim + inputProtocol outdated + surface remount/issued+1 chain + failed-list retry + stale list/rename rejections + snapshot→restore→connect cursor=tail/takeover chain); " +
    "5: lifecycle/rename — 15s request budget + legacy storage decode-dedup + title numbering dedup + rename machine/inline field/tab wiring + PtyFeatureUnsupportedError→rename.unsupported 501 classification + persistent-pty event subscriptions + 10k scrollback + " +
    TEST_FILES.length +
    " test files; " +
    "6: resize chain — ResizeObserver/window/font measure + queue-resize effect and 3 emissions + writer-ordered \\x1bc checkpoint + pane-machine 100ms debounce/seq guard/first-size/pendingInput flush + kill-line \\x15 + ctrl+shift+c + toggle passthrough + order-30/order-20 registrations + mod+w close face + ctrl+alt+t keybind + lazy panel chunk-split (review re-added) + frame.placement mobile + en/zh i18n + zero visualViewport terminal-face record; " +
    "7: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted files (terminal directory + client solid/pty.ts); " +
    "drills: " +
    drills.join(" | ") +
    "; " +
    "STATIC check - WASM loading, tab interactions, snapshot/cursor replay on a live server, the detach-does-not-kill red line against a real PTY, takeover/controller handoff, IME/keyboard/touch behavior and resize races are device-gate (G24), BLOCKED pending SSH host authorization)",
)
