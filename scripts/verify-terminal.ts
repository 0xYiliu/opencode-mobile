// verify-terminal.ts — static probe for issue #13 (remote terminal: input,
// tabs, resize, and reconnect unit).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…), the structural
// facts the terminal unit document relies on:
//
//   1. WebSocket channel data face: the binary control-frame decoder comment +
//      `bytes[0] !== 0` + the ControlFrame schema + the cursor advance; the
//      connector in client/src/solid/pty.ts (ticket header, connect path,
//      ticket query param, binaryType arraybuffer, the `openSocket?` seam);
//      the protocol constants and the three endpoint descriptions verbatim
//      (protocol group IS inside the closure); the schema types (status
//      literals, UpdateInput size, PtyTicket.ConnectToken).
//   2. Call-face exhaustive sets (NORMALIZED whitespace-stripped scan — the B1
//      lesson: EVERY zero/exclusive assertion below applies the same
//      normalization, no exceptions; measured on this pin: cross-line call
//      sites are exactly three — model.ts `pty\n.create(` (clone + new) and
//      terminal.tsx `pty\n.update(` (pushSize); single-line two — model.ts
//      `pty.update(` (:247) and `pty.remove(` (:396). The enumeration is
//      evidence, not the assertion: the normalized scan covers both shapes).
//      SCAN DOMAIN = app + gui-extensions `src/**` ONLY. Normalized call-site
//      sets EQUAL exactly: pty.create → {terminal/model.ts}; pty.remove →
//      {terminal/model.ts}; pty.update → {terminal/model.ts,
//      terminal/terminal.tsx}; pty.get → {terminal/terminal.tsx}; pty.list /
//      pty.connectToken / pty.connect → ZERO in this domain (connector-internal
//      calls live in the client package, outside the domain); createPtyClient →
//      {terminal/terminal.tsx, app/src/runtime/server/client.tsx} — the latter
//      is the transport-layer per-server endpoint pty instance, NOT a terminal
//      UI path (anti-misread note, mirrored in the unit doc; the :66/:128
//      `ReturnType<typeof createPtyClient>` type references do NOT match the
//      call-shape pattern); workspace.close → {terminal/tab.tsx};
//      terminal.close → {terminal/renderer.tsx} (the mod+w command; the
//      receiver is named `terminal`, not `workspace`); `persistentPty`
//      (experimental surface) → ZERO in this domain. The generated client
//      endpoint wrappers are NOT part of the sets (N-5 layering note).
//   3. Disconnect red line (acceptance 2): terminal.tsx contains ZERO
//      `pty.remove`/`kill(` (normalized) and exactly three `.close(1000)`
//      call sites (the only teardown form), with persistTerminal adjacent in
//      the onCleanup block (disconnect = serialize a snapshot, never
//      terminate); model.ts close() pairs pty.remove with the
//      console.error swallow (the ONLY explicit-termination entry; a failed
//      remove leaves the remote process alive with zero UI awareness — not a
//      toast); packages/mobile-hosts/src must contain ZERO precise terminal
//      API-shape anchors (shared layer never touches the terminal face). WHY
//      these anchors and not broader substrings: the substring `pty` false-
//      matches the `empty` family (i18n keys empty/emptyName/
//      credentialManager.empty + dozens of comments) and `\bterminal\b`
//      false-matches two comments ("transport failure is terminal",
//      "their own terminal") — measured on this pin; the precise anchors below
//      are zero-hit on all 39 mobile-hosts ts/tsx files (raw AND squashed).
//   4. Reconnect & target-refusal classification: the backoff anchor, the
//      verbatim "A failed connection does not mean the PTY exited" comment,
//      the gone() probe (status === "exited" / PtyNotFoundError), the
//      code-1000 early return + abnormalClose toast, the panel recovery pair
//      (recoverTerminal → ops.clone, markTerminalConnected → ops.trim), and
//      the en+zh i18n dictionaries (KEY-STYLE TOLERANT anchors: `loading` and
//      `close` are unquoted keys, the rest quoted — both spellings matched).
//   5. Lifecycle / concurrency / restore: MAX_TERMINAL_SESSIONS = 20,
//      MAX_CACHED_TERMINAL_WORKSPACES = 20, the workspace key
//      (server\0directory), the pty.exited subscription, the 2000-row
//      scrollback persistence, the TerminalState {active, all} decode-dedup
//      shape, the new() create shape and the clone restore chain (buffer/
//      cursor/scrollY cleared), state.test.ts / writer.test.ts presence.
//   6. Resize chain & mobile face: scheduleSize 100ms debounce + lastSize
//      dedup with UPDATE-BEFORE-PUSH on both paths and the swallowed pushSize
//      failure, handleOpen's size re-push (semantics per the unit doc: only
//      effective when the dedup misses — NOT a safety net), `t.onResize` →
//      scheduleSize and window resize → scheduleFit (review N5 wiring
//      direction), the panels.tsx visualViewport sync, the mobile registration
//      (order 30 / kind menu / icon terminal, mod+w scope), the mobile.tsx
//      sorted menu/drawer ordering, the \x15 kill-line key handler, the
//      ctrl+shift+c copy handler, and the mobile ResizeHandle branch.
//   7. Zero host-OS conditionals (whitelist scan, #8 N-5 / #11 / #12 pattern):
//      gui-extensions/src/terminal (whole directory) + client/src/solid/pty.ts
//      must contain ZERO process.platform / navigator.platform / node:os /
//      require("os") / from "os" references, with a scanned-file lower bound so
//      a directory rename can never silently empty the scan (real count on
//      this pin: 80 — terminal 79 + pty.ts).
//
// HONEST BOUNDARY (same tradition as verify-diff.ts): this is a static
// STRUCTURE check (text anchors / regex on source files). It proves source
// shape, NOT runtime behavior: WASM loading in WebView, tab interactions,
// reconnect/restore flows, the disconnect-survival red line on a live server,
// IME/external-keyboard/touch behavior, resize races, and ticket expiry are
// covered by the G24 device gate (docs/design/interaction.md), BLOCKED at this
// verification level. Server-side PTY IMPLEMENTATION (packages/core/src/pty.ts,
// pty/{protocol,ticket}.ts, server/src/handlers/{pty,pty-socket}.ts) is NOT in
// the vendored closure and is NOT asserted here — it is cited from the upstream
// pin cache in the unit document (detach-does-not-kill, 2MB buffer, EXITED_LIMIT
// 25, ticket TTL 60s single-use, close code 4404). The protocol/schema
// DESCRIPTIONS (packages/protocol/src/groups/pty.ts, packages/schema/src/
// {pty,pty-ticket}.ts), the connector (client/src/solid/pty.ts) and the
// terminal UI (gui-extensions/src/terminal/**) ARE in the closure and are
// asserted here; the two source layers are kept separate in the unit doc.
//
// Usage:
//   bun run scripts/verify-terminal.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-terminal: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-plugins/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const SCHEMA = "vendor/upstream/packages/schema/"
const MOBILE_HOSTS = "packages/mobile-hosts/"

const TERMINAL = `${GUI_EXT}src/terminal/`

// Newline tolerance (plan R2/F6; measured on this pin: cross-line call sites
// are exactly three — model.ts `pty\n.create(` twice (clone/new) and
// terminal.tsx `pty\n.update(` (pushSize); single-line two — model.ts
// `pty.update(` and `pty.remove(`). EVERY set/zero/exclusive assertion in this
// probe applies the same normalization — no exceptions.
const squash = (source: string) => source.replace(/\s+/g, "")

const BTICK = String.fromCharCode(96)

// Scan counters surfaced in the summary line.
let mhFilesScanned = 0

// --- 1. WebSocket channel data face ---
{
  const term = squash(await read(`${TERMINAL}terminal.tsx`))
  if (!term.includes(`//Theserver'sbinarycontrolframescarryJSONsuchastheoutputcursor.`))
    fail("1: the binary control-frame comment anchor changed (verbatim)")
  if (!term.includes(`constControlFrame=Schema.fromJsonString(Schema.Struct({cursor:Schema.optional(Schema.Number)}))`))
    fail("1: the ControlFrame decoder changed shape")
  if (!term.includes("if(bytes[0]!==0)return"))
    fail("1: the binary control-frame early return (bytes[0] !== 0) changed")
  if (!term.includes("cursor+=data.length"))
    fail("1: the text-frame cursor advance changed")
  if (!term.includes("event.datainstanceofArrayBuffer"))
    fail("1: the binary control-frame branch (ArrayBuffer) changed in terminal.tsx")

  const pty = await read(`${CLIENT}src/solid/pty.ts`)
  if (!pty.includes(`"x-opencode-ticket": "1"`))
    fail("1: the connector lost the x-opencode-ticket token header value")
  if (!pty.includes("api/pty/${encodeURIComponent(input.ptyID)}/connect"))
    fail("1: the ws connect path template changed")
  if (!pty.includes('url.searchParams.set("ticket", result.data.ticket)'))
    fail("1: the ticket query param assignment changed")
  if (!pty.includes('socket.binaryType = "arraybuffer"'))
    fail("1: the socket binaryType (arraybuffer) changed")
  if (!pty.includes("readonly openSocket?: (url: URL) => WebSocket"))
    fail("1: the openSocket injection seam moved (registered platform replacement point)")
  if (!pty.includes('url.protocol = url.protocol === "https:" ? "wss:" : "ws:"'))
    fail("1: the http(s)→ws(s) protocol conversion changed")

  const protocol = await read(`${PROTOCOL}src/groups/pty.ts`)
  if (!protocol.includes('PTY_CONNECT_TICKET_QUERY = "ticket"')) fail("1: PTY_CONNECT_TICKET_QUERY constant moved")
  if (!protocol.includes('PTY_CONNECT_TOKEN_HEADER = "x-opencode-ticket"'))
    fail("1: PTY_CONNECT_TOKEN_HEADER constant moved")
  if (!protocol.includes('PTY_CONNECT_PATH = "/api/pty/:ptyID/connect"')) fail("1: PTY_CONNECT_PATH constant moved")
  if (!protocol.includes("Create a short-lived single-use ticket for opening a PTY WebSocket connection."))
    fail("1: the pty.connectToken protocol description moved (verbatim quote — in-closure)")
  if (!protocol.includes("Establish a WebSocket connection streaming PTY output and accepting terminal input."))
    fail("1: the pty.connect protocol description moved (verbatim quote — in-closure)")
  if (!protocol.includes("Terminate and remove one PTY session."))
    fail("1: the pty.remove protocol description moved (verbatim quote — in-closure)")

  const schemaPty = await read(`${SCHEMA}src/pty.ts`)
  if (!schemaPty.includes('status: Schema.Literals(["running", "exited"])'))
    fail("1: Pty.Info status literals changed")
  if (!squash(schemaPty).includes("size:optional(Schema.Struct({rows:PositiveInt,cols:PositiveInt,})"))
    fail("1: Pty.UpdateInput size shape changed")
  for (const ev of ['"pty.created"', '"pty.updated"', '"pty.exited"', '"pty.deleted"']) {
    if (!schemaPty.includes(`type: ${ev}`)) fail(`1: the ${ev} event definition moved`)
  }
  const schemaTicket = squash(await read(`${SCHEMA}src/pty-ticket.ts`))
  if (!schemaTicket.includes("ticket:Schema.String,expires_in:PositiveInt"))
    fail("1: PtyTicket.ConnectToken shape changed")
}

// --- 2. Call-face exhaustive sets (normalized scan; scan domain written here) ---
const callSites = new Map<string, Set<string>>()
{
  // SCAN DOMAIN = app + gui-extensions `src/**` ONLY (tests in-domain; none of
  // the in-domain test files call these endpoints). The client GENERATED
  // surface (endpoint wrappers with zero terminal-UI callers) is NOT part of
  // the sets (N-5 layering note). The connector's own token/connect calls live
  // in the client package, outside this domain.
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/"]
  const patterns: [string, RegExp][] = [
    ["pty.create", /pty\.create\(/],
    ["pty.remove", /pty\.remove\(/],
    ["pty.update", /pty\.update\(/],
    ["pty.get", /pty\.get\(/],
    ["pty.list", /pty\.list\(/],
    ["pty.connectToken", /pty\.connectToken\(/],
    ["pty.connect", /pty\.connect\(/],
    ["createPtyClient", /createPtyClient\(/],
    ["workspace.close", /workspace\.close\(/],
    ["terminal.close", /terminal\.close\(/],
  ]
  for (const name of patterns.map(([name]) => name)) callSites.set(name, new Set())
  let scanned = 0
  for (const base of [`${APP}src/`, `${GUI_EXT}src/`]) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const rel = `${base}${file}`
      if (skip.some((entry) => `/${rel}`.includes(entry))) continue
      scanned++
      const source = squash(await read(rel))
      for (const [name, pattern] of patterns) {
        if (pattern.test(source)) callSites.get(name)!.add(rel)
      }
    }
  }
  if (scanned < 1000) fail(`2: scan domain implausibly small (${scanned} files) — the directory set looks wrong`)

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
  expect("pty.create", [`${GUI_EXT}src/terminal/model.ts`])
  expect("pty.remove", [`${GUI_EXT}src/terminal/model.ts`])
  expect("pty.update", [`${GUI_EXT}src/terminal/model.ts`, `${GUI_EXT}src/terminal/terminal.tsx`])
  expect("pty.get", [`${GUI_EXT}src/terminal/terminal.tsx`])
  expect("pty.list", [])
  expect("pty.connectToken", [])
  expect("pty.connect", [])
  // F1: client.tsx:135 `pty: createPtyClient(api, { url: http.url })` is the
  // transport-layer per-server endpoint instance — NOT a terminal UI path
  // (anti-misread note in the unit doc). Type references (:66/:128) carry `>`
  // after the name and do not match the call shape.
  expect("createPtyClient", [`${GUI_EXT}src/terminal/terminal.tsx`, `${APP}src/runtime/server/client.tsx`])
  // F2: the close trigger face splits by receiver name — `workspace.close` in
  // the tab (closeButton/middle-click/context-menu entries converge there),
  // `terminal.close` in the renderer's mod+w command.
  expect("workspace.close", [`${GUI_EXT}src/terminal/tab.tsx`])
  expect("terminal.close", [`${GUI_EXT}src/terminal/renderer.tsx`])

  // persistentPty (experimental desktop surface): zero consumption in this
  // domain (mobile never consumes it) — anti-misread note mirrored in the
  // unit doc.
  for (const base of [`${APP}src/`, `${GUI_EXT}src/`]) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const rel = `${base}${file}`
      if (skip.some((entry) => `/${rel}`.includes(entry))) continue
      if ((await read(rel)).includes("persistentPty")) fail(`2: experimental persistentPty surfaced in-domain: ${rel}`)
    }
  }
}

// --- 3. Disconnect red line (acceptance 2) ---
{
  const term = squash(await read(`${TERMINAL}terminal.tsx`))
  if (term.includes("pty.remove(") || term.includes("kill("))
    fail("3: RED LINE — terminal.tsx must contain zero pty.remove/kill calls on the disconnect/unmount paths")
  // Counting caliber (review R4): this is a normalized SOURCE-TEXT count —
  // the squashed file is matched for the literal "close(1000)", so a comment
  // carrying that string would over-count and FAIL. That is the conservative,
  // fail-closed direction: the caliber can never silently under-count a real
  // teardown site. Measured on this pin: exactly the three code sites, zero
  // comment occurrences.
  const closes = term.match(/close\(1000\)/g) ?? []
  if (closes.length !== 3)
    fail(`3: terminal.tsx must close its sockets with code 1000 at exactly 3 sites (got ${closes.length})`)
  if (!/onCleanup\(\(\)=>\{disposed=true[\s\S]{0,300}?ws\.close\(1000\)[\s\S]{0,200}?persistTerminal\(/.test(term))
    fail("3: the onCleanup block must persist the serialized snapshot adjacent to the 1000-close (disconnect = snapshot, not termination)")

  const model = squash(await read(`${TERMINAL}model.ts`))
  if (
    !model.includes(
      'awaitinput.server.client.pty.remove({ptyID:id,location}).catch((error)=>{console.error("Failedtocloseterminal",error)})',
    )
  )
    fail("3: model.ts close() must pair pty.remove with the console.error swallow (explicit-close failure = remote alive, zero UI awareness)")

  // F3 redesigned negative assertion (shared layer never touches the terminal
  // face). Precise API-shape anchors ONLY — measured false-match surfaces of
  // broader substrings are listed in the head note. Anchors are applied to
  // BOTH raw and squashed text.
  const negAnchors: [RegExp, RegExp, string][] = [
    [/\bpty\s*\.\s*(list|create|get|update|remove|connectToken|connect)\b/, /\bpty\.(list|create|get|update|remove|connectToken|connect)\b/, "pty API shape"],
    [/createPtyClient/, /createPtyClient/, "createPtyClient"],
    [/from ["']@opencode\/client/, /from"@opencode\/client/, 'from "@opencode/client'],
  ]
  const regexAnchors: [RegExp, string][] = [
    [/ghostty|xterm/i, "ghostty|xterm (case-insensitive)"],
    [/\bpty\b/, "\\bpty\\b word boundary"],
  ]
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  let mhFiles = 0
  for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(`${MOBILE_HOSTS}src`, repoRoot).pathname }))) {
    mhFiles++
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
  if (mhFiles < 30) fail(`3: mobile-hosts scan covered only ${mhFiles} files — the directory set looks wrong`)
  mhFilesScanned = mhFiles
}

// --- 4. Reconnect & target-refusal classification ---
{
  const term = squash(await read(`${TERMINAL}terminal.tsx`))
  if (!term.includes("constms=Math.min(250*2**Math.min(tries,4),4_000)"))
    fail("4: the reconnect backoff anchor (250ms→4s cap) changed")
  if (!term.includes("AfailedconnectiondoesnotmeanthePTYexited;retrychecksitsstatusfirst."))
    fail("4: the liveness-probe comment anchor changed (verbatim)")
  if (!term.includes('.then((result)=>result.data.status==="exited")'))
    fail("4: the gone() probe lost the exited-status check")
  if (!term.includes('Predicate.isTagged(err,"PtyNotFoundError")'))
    fail("4: the gone() probe lost the PtyNotFoundError classification")
  if (!term.includes("if(event.code===1000)return"))
    fail("4: the code-1000 (own normal close) early return changed")
  if (!term.includes('connectionLost.abnormalClose'))
    fail("4: the abnormal-close toast key changed")
  if (!term.includes("constsocket=awaitcreatePtyClient(server.client,{url:server.url})"))
    fail("4: the mount-time ServerRef capture connect shape changed (intentional mount-time capture — ref object, not a URL snapshot)")

  const panel = squash(await read(`${TERMINAL}panel.tsx`))
  if (!panel.includes("recoverTerminal(surface.key,surface.pty.id,(terminalID)=>surface.ops.clone(terminalID))"))
    fail("4: onConnectError must route through recoverTerminal → ops.clone (dead-terminal replacement)")
  if (!panel.includes("markTerminalConnected(surface.key,surface.pty.id,(terminalID)=>surface.ops.trim(terminalID))"))
    fail("4: onConnect must route through markTerminalConnected → ops.trim (restore snapshot trimmed)")
  if (!panel.includes("if(store.recovered[key])return"))
    fail("4: the once-per-key recovery bookkeeping changed")

  const en = await read(`${TERMINAL}i18n/en.ts`)
  const zh = await read(`${TERMINAL}i18n/zh.ts`)
  for (const [dict, label] of [
    [en, "en"],
    [zh, "zh"],
  ] as const) {
    // Key-style tolerant anchors (review N2): `loading` and `close` are
    // unquoted keys, the rest quoted — assert both spellings explicitly.
    if (!dict.includes('"connectionLost.title"')) fail(`4: ${label} lost the connectionLost.title key`)
    if (!dict.includes('"connectionLost.abnormalClose"')) fail(`4: ${label} lost the connectionLost.abnormalClose key`)
    if (!dict.includes('"command.new"')) fail(`4: ${label} lost the command.new key`)
    if (!dict.includes('"tab.title"')) fail(`4: ${label} lost the tab.title key`)
    if (!/\bloading:/.test(dict)) fail(`4: ${label} lost the unquoted loading key`)
    if (!/\bclose:/.test(dict)) fail(`4: ${label} lost the unquoted close key`)
  }
  if (!en.includes("This can happen when the server restarts.")) fail("4: en connectionLost.description server-restart honesty line changed")
  if (!zh.includes("这可能发生在服务器重启时。")) fail("4: zh connectionLost.description server-restart honesty line changed")
}

// --- 5. Lifecycle / concurrency / restore ---
{
  const state = await read(`${TERMINAL}state.ts`)
  if (!state.includes("export const MAX_TERMINAL_SESSIONS = 20"))
    fail("5: the 20-concurrent-terminal cap anchor changed")
  if (!state.includes("active: optional(Schema.String)")) fail("5: the TerminalState active field changed")
  if (!state.includes("all: array(PTY)")) fail("5: the TerminalState all field changed")
  if (!state.includes("const seen = new Set<string>()") || !state.includes("if (seen.has(pty.id)) return []"))
    fail("5: the TerminalState decode-dedup restore shape changed")

  const panel = await read(`${TERMINAL}panel.tsx`)
  if (!panel.includes("const MAX_CACHED_TERMINAL_WORKSPACES = 20"))
    fail("5: the 20-cached-workspace surfaces cap anchor changed")

  const model = squash(await read(`${TERMINAL}model.ts`))
  if (!model.includes('constworkspaceKey=(server:string,directory:string)=>`${server}\\0${directory}`'))
    fail("5: the workspace key (server\\0directory) changed")
  if (!model.includes('data.on("pty.exited"')) fail("5: the pty.exited subscription moved")
  if (!model.includes(".create({location,title:defaultTitle(nextNumber)})"))
    fail("5: the new() create call shape changed (newline-tolerant)")
  if (!model.includes(".create({location,title:pty.title})"))
    fail("5: the clone() create call shape changed (newline-tolerant)")
  if (!model.includes("buffer:undefined,cursor:undefined,scrollY:undefined,rows:undefined,cols:undefined,"))
    fail("5: the clone restore chain must clear buffer/cursor/scrollY (and size)")
  if (!model.includes('console.error("Failedtocloneterminal",error)'))
    fail("5: the clone failure console.error swallow changed")

  const term = squash(await read(`${TERMINAL}terminal.tsx`))
  if (!term.includes("constpersistedScrollbackRows=2_000"))
    fail("5: the 2000-row scrollback persistence anchor changed")
  if (!term.includes("scrollback:10_000")) fail("5: the 10k live scrollback anchor changed")

  const stateTest = await read(`${TERMINAL}state.test.ts`)
  if (!stateTest.includes("bun:test") || !stateTest.includes("TerminalState"))
    fail("5: state.test.ts (pure-logic restore coverage) moved or changed shape")
  const writerTest = await read(`${TERMINAL}writer.test.ts`)
  if (!writerTest.includes("bun:test")) fail("5: writer.test.ts (pure-logic write queue coverage) moved or changed shape")
}

// --- 6. Resize chain & mobile face ---
{
  const term = squash(await read(`${TERMINAL}terminal.tsx`))
  if (!term.includes("if(lastSize?.cols===cols&&lastSize?.rows===rows){"))
    fail("6: the scheduleSize lastSize dedup head changed")
  if (!term.includes("if(!lastSize){lastSize=pendingSizevoidpushSize(cols,rows)"))
    fail("6: the first-send path must update lastSize BEFORE push (dedup-suppression semantics anchor)")
  if (!term.includes("lastSize=nextvoidpushSize(next.cols,next.rows)"))
    fail("6: the debounce path must update lastSize BEFORE push (dedup-suppression semantics anchor)")
  if (!term.includes("sizeTimer=setTimeout(()=>{sizeTimer=undefinedconstnext=pendingSize"))
    fail("6: the 100ms debounce merge shape changed")
  if (!term.includes("},100)")) fail("6: the 100ms debounce delay anchor changed")
  if (!term.includes('.catch((err)=>{debugTerminal("failedtosyncterminalsize",err)})'))
    fail("6: the pushSize failure swallow changed (F5: no retry-after-reconnect backstop exists upstream)")
  if (!term.includes("consthandleOpen=()=>{if(disposed)returntries=0local.onConnect?.()scheduleSize(t.cols,t.rows)"))
    fail("6: handleOpen must re-schedule the size push (effective only when the lastSize dedup misses — F5 honest semantics)")
  // Review N5 wiring direction: t.onResize → scheduleSize (fit result synced
  // back to the server); window resize → scheduleFit.
  if (!term.includes("constonResize=t.onResize((size)=>{scheduleSize(size.cols,size.rows)})"))
    fail("6: t.onResize must call scheduleSize (N5 wiring direction)")
  if (!term.includes("handleResize=scheduleFit") || !term.includes('window.addEventListener("resize",handleResize)'))
    fail("6: window resize must drive scheduleFit (N5 wiring direction)")
  if (!term.includes("t.attachCustomKeyEventHandler((event)=>{"))
    fail("6: the custom key event handler moved")
  if (!term.includes('event.ctrlKey&&event.shiftKey&&!event.metaKey&&key==="c"'))
    fail("6: the ctrl+shift+c copy handler changed")
  if (!term.includes('keybinds.matches("terminal.toggle",event)'))
    fail("6: the terminal.toggle keybind passthrough changed")
  if (!term.includes("constonData=t.onData((data)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(data)"))
    fail("6: the input path (onData → ws text frame) changed")

  const keyEvent = squash(await read(`${TERMINAL}terminal-key-event.ts`))
  if (!keyEvent.includes('return"\\x15"')) fail("6: the meta+Backspace kill-line (\\x15) anchor changed")

  const renderer = squash(await read(`${TERMINAL}renderer.tsx`))
  if (!renderer.includes("order:30") || !renderer.includes('kind:"menu"') || !renderer.includes('icon:"terminal"'))
    fail("6: the mobile Panel registration (order 30, kind menu, icon terminal) changed")
  if (!renderer.includes(`bind:"mod+w"`) || !renderer.includes(`scope:'[data-component="terminal"]'`))
    fail("6: the close command (mod+w, terminal scope) changed")
  // Issue #67: v2.2.1 hosts the keybind literals in terminal/index.ts's shared command
  // consts (spaces inside the object literal).
  const termIndex = await read(`${GUI_EXT}src/terminal/index.ts`)
  if (!termIndex.includes('bind: "ctrl+`"')) fail("6: the toggle command keybind changed (terminal/index.ts)")
  if (!renderer.includes('bind:"ctrl+alt+t"')) fail("6: the new-terminal command keybind changed")
  // Issue #67: v2.2.1 closes via the pty handle (`void terminal.close(pty.id)`).
  if (!renderer.includes("voidterminal.close(pty.id)")) fail("6: the close command execution changed")
  if (!renderer.includes("lazy(()=>import(\"./panel\"))") && !renderer.includes("lazy(()=>import('./panel'))"))
    fail("6: the lazy panel chunk split changed")

  const mobile = squash(await read(`${APP}src/runtime/plugin/mobile.tsx`))
  if (!mobile.includes('sorted(["menu","drawer"])')) fail("6: the mobile menu/drawer sorter changed")
  if (!mobile.includes("a.mobile.order-b.mobile.order")) fail("6: the mobile order comparison changed")

  const panels = squash(await read(`${APP}src/runtime/plugin/panels.tsx`))
  if (!panels.includes("window.visualViewport?.height??window.innerHeight"))
    fail("6: the visualViewport height sync (soft-keyboard awareness) changed")
  if (!panels.includes('id="terminal-panel"')) fail("6: the terminal panel aside id changed")
  if (!panels.includes("md:hidden")) fail("6: the mobile ResizeHandle branch changed")
  if (!panels.includes("collapseThreshold={50}")) fail("6: the mobile collapse threshold changed")
}

// --- 7. Zero host-OS conditionals in the whitelisted terminal-face domains ---
let osScanFiles = 0
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
  // Issue #67 measured exception: gui-plugins@v2.2.1's terminal/quote.tsx carries one
  // navigator.platform mac-pointer gate on the quote button (registered, same shape as the
  // verify-files renderer.tsx exception).
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
  // Lower bound (real count on this pin: 80 — terminal 79 + solid/pty.ts): a
  // directory rename must never silently empty the scan.
  if (osScanFiles < 70) fail(`7: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
}

console.log(
  "verify-terminal: PASS (" +
    "1: ws channel data face (control-frame comment verbatim + bytes[0]!==0 + ControlFrame + cursor advance; connector ticket header/path/query/binaryType/openSocket seam; protocol three constants + three verbatim descriptions; schema status literals/UpdateInput size/ConnectToken + four events); " +
    "2: normalized exhaustive sets — pty.create {model.ts}, pty.remove {model.ts}, pty.update {model.ts, terminal.tsx}, pty.get {terminal.tsx}, pty.list/connectToken/connect ZERO in-domain, createPtyClient {terminal.tsx, client.tsx (transport instance, not terminal UI)}, workspace.close {tab.tsx}, terminal.close {renderer.tsx}, persistentPty ZERO; " +
    "3: disconnect red line — terminal.tsx zero pty.remove/kill + exactly 3 close(1000) + onCleanup persistTerminal adjacency + model.ts close/remove→console.error swallow + mobile-hosts " +
    mhFilesScanned +
    " files zero precise API-shape anchors; " +
    "4: backoff anchor + liveness-probe verbatim + gone() exited/PtyNotFound + code-1000 early return + abnormalClose + recoverTerminal→ops.clone / markTerminalConnected→ops.trim + en+zh i18n (key-style tolerant); " +
    "5: MAX_TERMINAL_SESSIONS/MAX_CACHED_TERMINAL_WORKSPACES 20 + workspace key + pty.exited + 2000-row persistence + TerminalState dedup + create/clone shapes + state/writer test presence; " +
    "6: resize chain (lastSize update-before-push both paths, 100ms debounce, swallowed push failure, handleOpen re-push) + onResize→scheduleSize / window-resize→scheduleFit (N5) + \\x15 kill-line + ctrl+shift+c + order-30 menu registration + sorted menu/drawer + visualViewport + md:hidden ResizeHandle; " +
    "7: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted files (terminal directory + client solid/pty.ts); " +
    "STATIC check - WASM loading, tab interactions, reconnect/restore flows, the disconnect-survival red line on a live server, IME/keyboard/touch behavior and resize races are G24)",
)
