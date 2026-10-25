// verify-diff.ts — static probe for issue #12 (remote Git review, diff browsing,
// and worktree operations unit).
//
// Asserts, against the REAL vendored sources (pin b4525d79bf…), the structural
// facts the diff unit document relies on:
//
//   1. Data face wiring: review/model.ts serves the three modes (git/branch =
//      vcs.diff working/branch, turn = session.diff) with the branch gate
//      (current !== default) and the git-only turn gate, `refetchOnMount:
//      "always"`, the server.connected enabled gate, the filesystem.changed
//      refresh listener and the session-idle refresh, the bounded turn refetch
//      (context: 3), vcs.init({ location, provider: "git" }) + requestFailed
//      toast, the detailsQuery (mode: "working", demand-gated, catch → []),
//      and the location-scoped file.read for media; the generated client
//      declares vcs.init [400,401,404,409,501,503] and vcs.diff
//      [400,401,404,503]; the protocol description is quoted verbatim (this
//      pin carries the protocol group INSIDE the closure — dual-source note).
//   2. Call-face exhaustive sets (newline-tolerant, plan §2 group 2 — the B1
//      lesson: EVERY zero/exclusive assertion below uses the same normalized
//      whitespace-stripped scan; no line-level fallback): SCAN DOMAIN = app +
//      gui-extensions `src/**` ONLY. Normalized call-site sets EQUAL exactly:
//      vcs.diff → {settings/workspaces/workspaces.tsx, review/model.ts};
//      vcs.status → {workspaces.tsx}; vcs.init → {review/model.ts};
//      api.vcs.branch.list → {new-session/workspace/controller.ts};
//      worktree.remove → {workspaces.tsx}; worktree.create →
//      {workspaces/create.ts, details/workspace-menu.tsx}; vcs.base and
//      vcs.get → ZERO in this domain. Existence anchors: the sync.tsx worktree
//      accessor, the inventory.ts wrappers, and (review M1) the HAND-WRITTEN
//      client solid data layer call `api().vcs.get` feeding
//      data.location.vcs.info — the generated client.ts endpoint wrappers are
//      single-listed and NOT in the sets (N-5 layering note).
//   3. Confirmation & failure recovery: the workspace delete preflight trio
//      (vcs.status + vcs.diff(mode:"branch") adjacent pair),
//      inspectWorkspaceDeletion, DialogDeleteWorkspace with the danger button
//      disabled while pending/error (stale state never blind-confirms), the
//      force chain transact(() => remove(workspace, true, …)), the failure
//      toast, the three-state blocked interception; revert.ts
//      interrupt→wait→revert.stage adjacent steps + inbox.cancel diversion +
//      revert.clear (redo) + draft restore + the verbatim "idle no-ops" /
//      "stop at the first failure" comments; the settle-time auto commit
//      verbatim in submit.ts; the NEGATIVE assertion — `\.revert\.commit\(`
//      call-shape sites form exactly {composer/submit.ts,
//      new-session/composer-adapter.ts} (no user entry point; the
//      "revert-commit" mock strings in submit.test.ts carry a hyphen and must
//      NOT match); session.undo/redo command anchors and disabled conditions.
//   4. Large diff / binary / media: MAX_DIFF_CHANGED_LINES = 500, the verbatim
//      "binary files have empty diffs that we can't render" comment,
//      diffCanRender + the disabled Accordion trigger, renderAnyway,
//      mediaKindFromPath, REVIEW_MOUNT_MARGIN = 300, the
//      shouldVirtualizeReviewDiff virtualizer (>500) and its consumer, and the
//      ui.sessionReview.largeDiff.* i18n keys in the ui package dictionary.
//   5. Session vs project/worktree distinction: the ChangeMode literals, the
//      branch/turn gates, the per-session store pick (reviewMode/reviewFile/
//      reviewOpen), the details watch pair, the branch/basedOn context rows
//      and diffs.changed plural, and the controller branch.list candidate
//      source with its catch-to-empty swallow (#8 delivery face).
//   6. Mobile face & desktop gates: the Changes tab registration (order: 10,
//      kind: "tab"), frame.placement() === "mobile" → MobileReview, the
//      narrow-screen layout.open(KEY, …), the review LinkHandler, the
//      "mobile-diff" SettingsPage, diffStyle="unified", the wrap overflow
//      toggle, the touchstart interaction gate, the layout.scroll "review"
//      keying, en+zh i18n pairs, and the ctx.uses.openIn() contract gate
//      (button structurally absent when the desktop-only contract is absent).
//   7. Worktree operations face: workspace-menu (worktree.updated listener,
//      running-locked blocked(), move.failed toast, create + syncInfo cache
//      prefill), create.ts shared logic, paths.ts inspection type
//      ({active, linked, dirty}), inventory.ts event-driven staleTime:
//      Infinity, sync.tsx event refetch adjacency, and the Worktree
//      RemoveInput force-required schema field.
//   8. Zero host-OS conditionals (whitelist scan, #8 N-5 / #11 group 8
//      pattern): gui-extensions/src/review + gui-extensions/src/details +
//      session-ui session-review.tsx + session-ui v2/components +
//      app/src/session/revert.ts + app/src/settings/workspaces must contain
//      ZERO process.platform / navigator.platform / node:os references, with
//      a scanned-file lower bound so a directory rename can never silently
//      empty the scan (real count on this pin: 170 — review M4).
//
// HONEST BOUNDARY (same tradition as verify-files.ts): this is a static
// STRUCTURE check (text anchors / regex on source files). It proves source
// shape, NOT runtime behavior: diff rendering, mode switching, comment
// interactions, worktree deletion flows, undo/redo semantics, stale refresh
// timing, client-exit zero side effects, and touch/a11y adequacy on a device
// are covered by the G23 device gate (docs/design/interaction.md), BLOCKED at
// this verification level. Server-side vcs/worktree IMPLEMENTATION
// (packages/core/src/vcs.ts, vcs/patch.ts, plugin/vcs/{git,hg}.ts, server
// handlers) is NOT in the vendored closure and is NOT asserted here — it is
// cited from the upstream pin cache in the unit document (--no-renames diff,
// conflict code folding, MAX_TOTAL_PATCH_BYTES). The protocol/schema
// DESCRIPTIONS (packages/protocol/src/groups/{vcs,worktree}.ts,
// packages/schema/src/{vcs,file-diff,worktree}.ts) ARE in the closure and are
// asserted here; the two source layers are kept separate in the unit doc.
//
// Usage:
//   bun run scripts/verify-diff.ts
// Exit 0 = all assertions PASS.

const repoRoot = new URL("../", import.meta.url)

function fail(message: string): never {
  console.error(`verify-diff: FAIL: ${message}`)
  process.exit(1)
}

const read = async (path: string) => await Bun.file(new URL(path, repoRoot)).text()

const APP = "vendor/upstream/packages/app/"
const CLIENT = "vendor/upstream/packages/client/"
const GUI_EXT = "vendor/upstream/packages/gui-extensions/"
const SESSION_UI = "vendor/upstream/packages/session-ui/"
const UI = "vendor/upstream/packages/ui/"
const PROTOCOL = "vendor/upstream/packages/protocol/"
const SCHEMA = "vendor/upstream/packages/schema/"

// Newline tolerance (plan R2; three measured cross-line call sites on this
// pin: workspaces.tsx `.remove({`, review/model.ts `vcs<newline>.init`,
// new-session/workspace/controller.ts `vcs<newline>.branch.list`). EVERY
// set/zero/exclusive assertion in this probe applies the same normalization —
// no exceptions (plan v2 group 2 headnote).
const squash = (source: string) => source.replace(/\s+/g, "")

// --- 1. Data face wiring (three review modes, gates, stale chain, init) ---
{
  const model = squash(await read(`${GUI_EXT}src/review/model.ts`))
  if (!model.includes(`exporttypeChangeMode="git"|"branch"|"turn"`))
    fail("1: the ChangeMode three-literal type changed")
  if (!model.includes(`mode:value==="git"?"working":value`))
    fail("1: vcs.diff must map git→working / branch→branch (newline-tolerant match)")
  if (!model.includes("session.diff({sessionID:view().id,context:3})"))
    fail("1: the bounded turn refetch (session.diff with context: 3) changed")
  if (!model.includes('refetchOnMount:"always"'))
    fail("1: diffQuery lost refetchOnMount: always (stale chain link 1)")
  if (!model.includes("enabled:!!stored()&&view().server.connected&&wantsReview()&&!!view().project?.vcs"))
    fail("1: diffQuery lost the server.connected/project.vcs enabled gate (offline face)")
  if (!model.includes(`details.type==="filesystem.changed"&&details.location?.directory===current.directory)refresh()`))
    fail("1: the filesystem.changed listener must refresh only the matching directory")
  if (!model.includes("itseventstreamfollowsarestartedserver"))
    fail("1: the filesystem.changed comment anchor changed (verbatim 'its event stream follows a restarted server')")
  if (!/goesidlehasfinisheditsturn[\s\S]{0,300}?refresh\(\)voidqueryClient\.invalidateQueries\(\{queryKey:turnKey\(\)\}\)/.test(model))
    fail("1: the session-idle refresh block (refresh + turn invalidate) changed (adjacent pair)")
  if (!model.includes("session.server.client.vcs.init({location,provider:\"git\"})"))
    fail("1: initializeGit must call vcs.init({ location, provider: \"git\" }) (newline-tolerant match)")
  if (!model.includes('ctx.t("common.requestFailed")'))
    fail("1: initializeGit lost the common.requestFailed toast")
  if (!model.includes('.server.client.vcs.diff({location:{directory:view().directory},mode:"working"})'))
    fail("1: detailsQuery must load the session directory's working diff (mode: working)")
  if (!/failedtoloadsessiondetailsdiff[\s\S]{0,80}return\[\]/.test(model))
    fail("1: detailsQuery lost its catch → [] swallow (upstream semantic, honestly registered)")
  if (!model.includes("Oversizedfull-filepatchescomebackempty;boundedcontextusuallyfits"))
    fail("1: the loadDiff bounded-context comment anchor changed (verbatim)")
  if (!model.includes("file.read({path,location:{directory:directory()}})"))
    fail("1: media preview must read through file.read with the location scope (never a local path)")
  if (!model.includes("staleTime:Number.POSITIVE_INFINITY") || !model.includes("retry:2"))
    fail("1: the loadDiff bounded fetch lost staleTime Infinity / retry 2")

  const client = squash(await read(`${CLIENT}src/promise/generated/client.ts`))
  if (!/path:`\/api\/vcs\/init`[\s\S]{0,600}?declaredStatuses:\[400,401,404,409,501,503\]/.test(client))
    fail("1: vcs.init must declare [400, 401, 404, 409, 501, 503] (unknown provider 400, no-init 501, git down 503)")
  if (!/path:`\/api\/vcs\/diff`[\s\S]{0,600}?declaredStatuses:\[400,401,404,503\]/.test(client))
    fail("1: vcs.diff must declare [400, 401, 404, 503] (503 = git unavailable face)")

  const protocol = await read(`${PROTOCOL}src/groups/vcs.ts`)
  if (
    !protocol.includes(
      "Diff HEAD to the working copy (working), the base merge-base to the working copy (branch), or the base merge-base to HEAD (committed). Omitting base preserves repository-default comparison; supplying it overrides the comparison without saving it.",
    )
  )
    fail("1: the vcs.diff protocol description moved (verbatim quote — protocol group IS in this closure)")
  const worktreeProtocol = await read(`${PROTOCOL}src/groups/worktree.ts`)
  if (!worktreeProtocol.includes("remove a saved worktree using its recorded strategy"))
    fail("1: the worktree.remove protocol description moved (verbatim quote)")
}

// --- 2. Call-face exhaustive sets (normalized scan; scan domain written here) ---
const callSites = new Map<string, Set<string>>()
{
  // SCAN DOMAIN = app + gui-extensions `src/**` ONLY. The client GENERATED
  // surface (which carries the vcs/worktree endpoint wrappers with zero
  // callers in this domain) is single-listed below and is NOT part of the
  // sets. Tests are in-domain (the review report's 1390-file domain A counts
  // them; submit.test.ts's "revert-commit" mock strings carry a hyphen and do
  // not match the call-shape anchor).
  const skip = ["node_modules", "/dist/", "/web-dist/", "/.git/"]
  const patterns: [string, RegExp][] = [
    ["vcs.diff", /\.vcs\.diff\(/],
    ["vcs.status", /\.vcs\.status\(/],
    ["vcs.init", /\.vcs\.init\(/],
    ["vcs.branch.list", /api\.vcs\.branch\.list\(/],
    ["worktree.remove", /\.worktree\.remove\(/],
    ["worktree.create", /\.worktree\.create\(/],
    ["vcs.base", /\.vcs\.base\(/],
    ["vcs.get", /\.vcs\.get\(/],
    ["revert.commit", /\.revert\.commit\(/],
  ]
  for (const name of patterns.map(([name]) => name)) callSites.set(name, new Set())
  for (const base of [`${APP}src/`, `${GUI_EXT}src/`]) {
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    for (const file of await Array.fromAsync(glob.scan({ cwd: new URL(base, repoRoot).pathname }))) {
      const rel = `${base}${file}`
      if (skip.some((entry) => `/${rel}`.includes(entry))) continue
      const source = squash(await read(rel))
      for (const [name, pattern] of patterns) {
        if (pattern.test(source)) callSites.get(name)!.add(rel)
      }
    }
  }

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
  expect("vcs.diff", [`${APP}src/settings/workspaces/workspaces.tsx`, `${GUI_EXT}src/review/model.ts`])
  expect("vcs.status", [`${APP}src/settings/workspaces/workspaces.tsx`])
  expect("vcs.init", [`${GUI_EXT}src/review/model.ts`])
  expect("vcs.branch.list", [`${APP}src/new-session/workspace/controller.ts`])
  expect("worktree.remove", [`${APP}src/settings/workspaces/workspaces.tsx`])
  expect("worktree.create", [`${APP}src/workspaces/create.ts`, `${GUI_EXT}src/details/workspace-menu.tsx`])
  expect("vcs.base", [])
  expect("vcs.get", [])

  // Existence anchors for the wrapper/accessor layer (NOT call sites — N-5
  // layering note): the sync.tsx worktree accessor and the inventory.ts
  // wrappers stay anchored so a pin update that moves them forces re-review.
  const sync = squash(await read(`${APP}src/runtime/server/sync.tsx`))
  if (!sync.includes("api:()=>serverSDK.api.worktree"))
    fail("2: sync.tsx lost the worktree accessor injection (api: () => serverSDK.api.worktree)")
  const inventory = squash(await read(`${APP}src/workspaces/inventory.ts`))
  if (!inventory.includes(".list({projectID})") || !inventory.includes(".refresh({projectID})"))
    fail("2: inventory.ts lost the worktree list/refresh wrappers")

  // Review M1: vcs.get has a HAND-WRITTEN call in the client solid data layer
  // (outside the scan domain) feeding data.location.vcs.info — the contract
  // table must not claim "generated-only / no callers" for it.
  const data = await read(`${CLIENT}src/solid/data.ts`)
  if (!data.includes('const vcs = locationResource("vcs", (location) => api().vcs.get({ location }))'))
    fail("2: the client solid data layer vcs.get call moved (review M1 — data.location.vcs.info source)")
  if (!data.includes("vcs: { info: vcs.list, sync: vcs.sync, invalidate: vcs.invalidate }"))
    fail("2: data.location.vcs.info exposure moved (review M1)")

  // N-5 single-listing: the generated wrappers exist (outside the scan
  // domain) — pin their presence so a pin update that removes/moves them
  // forces a re-review of the layering note.
  const client = await read(`${CLIENT}src/promise/generated/client.ts`)
  if (!client.includes("path: `/api/vcs/diff`") || !client.includes("path: `/api/worktree/refresh`"))
    fail("2: the generated client vcs/worktree wrappers moved — re-check the N-5 layering note")
}

// --- 3. Confirmation & failure recovery (delete chain, revert sequence, commit semantics) ---
{
  const workspaces = squash(await read(`${APP}src/settings/workspaces/workspaces.tsx`))
  if (
    !workspaces.includes(
      'context.sdk.api.vcs.status({location:{directory:workspace.directory}}),context.sdk.api.vcs.diff({location:{directory:workspace.directory},mode:"branch"}),',
    )
  )
    fail("3: the delete preflight must pair vcs.status with vcs.diff(mode: branch) (adjacent, newline-tolerant)")
  if (!workspaces.includes("inspectWorkspaceDeletion({"))
    fail("3: the preflight must classify via inspectWorkspaceDeletion")
  if (!workspaces.includes("settings.workspaces.delete.blocked.active") || !workspaces.includes("settings.workspaces.delete.blocked.linked"))
    fail("3: the non-force three-state interception toasts (blocked.active/linked) changed")
  if (!workspaces.includes("workspace.status.dirty"))
    fail("3: the dirty-workspace interception message (workspace.status.dirty) changed")
  if (!workspaces.includes("DialogDeleteWorkspace"))
    fail("3: the single-workspace delete confirmation dialog changed")
  if (!workspaces.includes("workspace.delete.confirm"))
    fail("3: the confirmation dialog title key changed")
  if (!workspaces.includes("disabled={status.isPending||status.isError}"))
    fail("3: the danger button must be disabled while pending/error (stale state never blind-confirms)")
  if (!workspaces.includes('variant="danger"'))
    fail("3: the confirm button lost its danger variant")
  if (!workspaces.includes("transact(()=>remove(workspace,true,context))"))
    fail("3: the confirmed path must force-execute (remove(workspace, true, …) inside transact)")
  if (!workspaces.includes("workspace.delete.failed.title"))
    fail("3: the delete failure recovery toast changed")
  if (!workspaces.includes("consttransact=async(task:()=>Promise<void>)=>{"))
    fail("3: the transact wrapper (catch → toast, finally clear) changed")

  const revert = squash(await read(`${APP}src/session/revert.ts`))
  if (
    !/session\.interrupt\(\{sessionID\}\)\)\)\)return[\s\S]{0,120}session\.wait\(\{sessionID\}\)\)\)\)return[\s\S]{0,160}session\.revert\.stage\(\{sessionID,messageID:message\.id\}\)\)\)\)return/.test(
      revert,
    )
  )
    fail("3: the revert stage sequence must stay interrupt → wait → revert.stage (adjacent, each request()-wrapped)")
  if (!revert.includes("session.inbox.cancel({sessionID,inboxID:message.id})"))
    fail("3: the undelivered-prompt diversion must go through inbox.cancel (not interrupt)")
  if (!revert.includes("session.revert.clear({sessionID})"))
    fail("3: redo must clear the revert (revert.clear)")
  if (!revert.includes("restore(target,message)"))
    fail("3: the staged prompt draft/context restore changed")
  if (!revert.includes("bothareidleno-ops"))
    fail("3: the idle no-op comment anchor changed (verbatim)")
  if (!revert.includes("stopatthefirstfailureinsteadofwaitingonworkthatwasneverinterrupted"))
    fail("3: the fail-fast comment anchor changed (verbatim)")
  if (!revert.includes("redorestoreseveryrevertedmessageatonce"))
    fail("3: the redo-restore-all comment anchor changed (verbatim)")

  const submit = await read(`${APP}src/composer/submit.ts`)
  if (!submit.includes("if (session.current()?.revert) await session.api.revert.commit({ sessionID: session.id })"))
    fail("3: the settle-time auto commit line changed (verbatim in submit.ts)")
  // Negative assertion (N2 call-shape anchor): exactly two sites, no user
  // entry point. "revert-commit" mock strings (hyphen) must not match.
  expectFromGroup2("revert.commit", [`${APP}src/composer/submit.ts`, `${APP}src/new-session/composer-adapter.ts`])

  const commands = squash(await read(`${APP}src/session/commands/use-session-commands.tsx`))
  if (!commands.includes('id:"session.undo"') || !commands.includes('slash:"undo"'))
    fail("3: the session.undo command registration changed")
  if (!commands.includes('id:"session.redo"') || !commands.includes('slash:"redo"'))
    fail("3: the session.redo command registration changed")
  if (!commands.includes("actions.session.history.visibleUserMessages().length===0"))
    fail("3: the undo disabled condition (visible user messages) changed")
  if (!commands.includes("!actions.session.data.revertMessageID()"))
    fail("3: the redo disabled condition (revertMessageID present) changed")
}

// Group-2 helper: assert a scanned set against an expected list (defined after
// the group-2 block filled `callSites`).
function expectFromGroup2(name: string, files: string[]) {
  const got = callSites.get(name)!
  const expected = new Set(files)
  for (const file of got) {
    if (!expected.has(file)) fail(`3: unexpected ${name} call site outside the closed set: ${file}`)
  }
  for (const file of expected) {
    if (!got.has(file)) fail(`3: expected ${name} call site missing from the scan: ${file}`)
  }
  if (got.size !== files.length) fail(`3: ${name} call-site set must equal exactly ${files.length} file(s), got ${got.size}`)
}

// --- 4. Large diff / binary / media ---
{
  const review = await read(`${SESSION_UI}src/components/session-review.tsx`)
  if (!review.includes("const MAX_DIFF_CHANGED_LINES = 500"))
    fail("4: the 500-line large-diff threshold anchor changed")
  if (!review.includes("binary files have empty diffs that we can't render"))
    fail("4: the binary placeholder comment anchor changed (verbatim)")
  if (!review.includes("const diffCanRender = () => diff().additions !== 0 || diff().deletions !== 0"))
    fail("4: diffCanRender changed shape (empty diff = binary = not renderable)")
  if (!review.includes("disabled={!diffCanRender()}"))
    fail("4: the Accordion trigger must be disabled for binary diffs")
  if (!review.includes("ui.sessionReview.largeDiff.renderAnyway"))
    fail("4: the renderAnyway escape hatch changed")
  if (!review.includes("ui.sessionReview.largeDiff.title"))
    fail("4: the large-diff placeholder title key changed")
  if (!review.includes("mediaKindFromPath"))
    fail("4: the media kind detection changed")
  if (!review.includes("const REVIEW_MOUNT_MARGIN = 300"))
    fail("4: the 300px virtual mount margin anchor changed")

  const virtualize = await read(`${SESSION_UI}src/v2/components/session-review-file-preview-v2-virtualize.ts`)
  if (!virtualize.includes("export function shouldVirtualizeReviewDiff(") || !virtualize.includes("const lineThreshold = 500"))
    fail("4: shouldVirtualizeReviewDiff (>500) changed")
  const preview = await read(`${SESSION_UI}src/v2/components/session-review-file-preview-v2.tsx`)
  if (!preview.includes("virtualize={shouldVirtualizeReviewDiff({"))
    fail("4: the v2 preview must consume shouldVirtualizeReviewDiff")

  const uiEn = await read(`${UI}src/i18n/en.ts`)
  for (const key of ['"ui.sessionReview.largeDiff.title"', '"ui.sessionReview.largeDiff.renderAnyway"']) {
    if (!uiEn.includes(key)) fail(`4: the ui dictionary lost ${key}`)
  }
}

// --- 5. Session vs project/worktree distinction ---
{
  const model = await read(`${GUI_EXT}src/review/model.ts`)
  if (!model.includes('export type ChangeMode = "git" | "branch" | "turn"'))
    fail("5: the ChangeMode literals changed")
  if (!model.includes("vcs()?.branch.current !== vcs()?.branch.default"))
    fail("5: the branch-mode gate (current !== default) changed")
  if (!model.includes('project?.vcs === "git" && view().id'))
    fail("5: the turn-mode gate (git project + view id) changed")
  if (!model.includes("view().server.data.location.vcs.info({ directory: directory() })"))
    fail("5: the review vcs memo must read data.location.vcs.info (review M1 consumption)")

  const index = squash(await read(`${GUI_EXT}src/review/index.ts`))
  for (const anchor of ["entry.reviewMode", "entry.reviewFile", "entry.reviewOpen"]) {
    if (!index.includes(anchor)) fail(`5: the per-session store pick lost ${anchor}`)
  }

  const detailsRenderer = await read(`${GUI_EXT}src/details/renderer.tsx`)
  if (!detailsRenderer.includes('service.watch(props.screen, "details")'))
    fail("5: the details renderer watch (on-demand load) changed")
  const popover = await read(`${GUI_EXT}src/details/popover.tsx`)
  if (!popover.includes('service.watch(screen, "details")'))
    fail("5: the details popover watch changed")
  const detailsPanel = await read(`${GUI_EXT}src/details/panel.tsx`)
  if (!detailsPanel.includes("data().location.vcs.info({ directory: props.session.directory })?.branch.current"))
    fail("5: the branch context row must read data.location.vcs.info (review M1 consumption)")
  if (!detailsPanel.includes("basedOn"))
    fail("5: the basedOn (base branch) context row changed")
  if (!detailsPanel.includes('ctx.plural("ui.sessionTurn.diffs.changed"'))
    fail("5: the changes row plural label changed")

  const controller = squash(await read(`${APP}src/new-session/workspace/controller.ts`))
  if (!controller.includes("branch.list({location:{directory},search,limit:50})"))
    fail("5: the branch candidate source anchor changed (newline-tolerant)")
  if (!controller.includes(".catch(()=>({directory,search,data:[]}))"))
    fail("5: the branch-list swallow-to-empty tail changed (#8 delivery face, honestly registered)")
}

// --- 6. Mobile face & desktop gates ---
{
  const renderer = squash(await read(`${GUI_EXT}src/review/renderer.tsx`))
  if (!renderer.includes('plural("mobile.title",0)') || !renderer.includes('order:10,kind:"tab"'))
    fail("6: Changes must be a first-class mobile tab (plural mobile.title, order 10, kind tab)")
  if (!renderer.includes('frame.placement()==="mobile"'))
    fail("6: the mobile placement branch anchor changed (review N1: frame, not panel)")
  if (!renderer.includes("<MobileReview"))
    fail("6: the mobile branch must render MobileReview")
  if (!renderer.includes("layout.narrow()"))
    fail("6: the narrow-screen detection changed")
  if (!renderer.includes("layout.open(KEY,session)"))
    fail("6: narrow screens must switch to the Changes view (layout.open(KEY, session))")
  if (!renderer.includes('link.origin==="review"'))
    fail("6: the review LinkHandler (composer comment reveal) changed")
  if (!renderer.includes('id:"mobile-diff"'))
    fail("6: the mobile-diff settings page registration changed")

  const mobile = await read(`${GUI_EXT}src/review/mobile.tsx`)
  if (!mobile.includes('diffStyle="unified"'))
    fail("6: mobile must keep the unified diff style (no split on narrow screens)")
  if (!mobile.includes('mobileDiff.value.wrap ? "wrap" : "scroll"'))
    fail("6: the wrap/scroll overflow toggle changed")
  if (!mobile.includes('"touchstart"'))
    fail("6: the scroll-restore interaction gate lost touchstart (N3: listener set lives in review/mobile.tsx)")
  if (!mobile.includes('layout.scroll.get(props.session, "review")'))
    fail("6: the scroll restoration key (review) changed")

  const guiEn = await read(`${GUI_EXT}src/review/i18n/en.ts`)
  const guiZh = await read(`${GUI_EXT}src/review/i18n/zh.ts`)
  for (const key of ['"mobile.title.one"', '"empty.git"', '"settings.wrapLines.title"']) {
    if (!guiEn.includes(key)) fail(`6: review en lost the ${key} key`)
    if (!guiZh.includes(key)) fail(`6: review zh lost the ${key} key`)
  }

  const panel = await read(`${GUI_EXT}src/review/panel.tsx`)
  if (!panel.includes("ctx.uses.openIn()"))
    fail("6: the OpenInApp toolbar contract consumption changed")
  if (!panel.includes("<Show when={openIn()}>") || !panel.includes("openIn().Button"))
    fail("6: the open-in-app button must be structurally absent when the contract is not provided (desktop-only)")
  const fileRenderer = await read(`${GUI_EXT}src/file/renderer.tsx`)
  if (!fileRenderer.includes("if (desktop) {") || !fileRenderer.includes("<Show when={desktop}>"))
    fail("6: the desktop-only OpenInApp provide gate moved (#11 locked face)")
}

// --- 7. Worktree operations face ---
{
  const menu = await read(`${GUI_EXT}src/details/workspace-menu.tsx`)
  if (!menu.includes('on("worktree.updated"'))
    fail("7: the move menu lost its worktree.updated listener")
  if (!menu.includes('data().session.status(props.session.id) === "running"') || !menu.includes("blocked()"))
    fail("7: the running-session lock (blocked()) changed")
  if (!menu.includes('"move.failed"'))
    fail("7: the move failure toast changed")
  if (!menu.includes("client.worktree.refresh({ projectID: props.project.id })"))
    fail("7: the move menu refresh call changed")
  if (!menu.includes("client.worktree.create({ projectID: project.id, from: project.canonical })"))
    fail("7: the move menu create call changed")
  if (!menu.includes("client.session.move({ sessionID, directory: destination })"))
    fail("7: the session.move execution changed")
  if (!menu.includes("// Populate the client cache before the destination session mounts."))
    fail("7: the syncInfo cache-prefill comment anchor changed (verbatim)")

  const create = await read(`${APP}src/workspaces/create.ts`)
  if (!create.includes("// Populate the client cache before the destination session mounts."))
    fail("7: create.ts lost the syncInfo cache-prefill comment (verbatim)")
  if (!create.includes("data.location.syncInfo({ directory: created.directory })"))
    fail("7: create.ts lost the syncInfo prefill call")

  const paths = await read(`${APP}src/workspaces/paths.ts`)
  if (!paths.includes("export function inspectWorkspaceDeletion(input: {"))
    fail("7: inspectWorkspaceDeletion changed shape")
  if (!paths.includes("export type WorkspaceDeleteInspection = {"))
    fail("7: the inspection type changed")
  for (const field of ["active: boolean", "linked: boolean", "dirty: boolean"]) {
    if (!paths.includes(field)) fail(`7: the inspection type lost ${field}`)
  }

  const inventory = await read(`${APP}src/workspaces/inventory.ts`)
  if (!inventory.includes("staleTime: Infinity") || !inventory.includes("retry: false"))
    fail("7: the inventory must trust events, not time (staleTime Infinity + retry false)")
  if (!inventory.includes("`worktree.updated` and reconnect invalidation drive list reloads"))
    fail("7: the event-driven inventory comment anchor changed")

  const sync = squash(await read(`${APP}src/runtime/server/sync.tsx`))
  if (!sync.includes('if(event.type==="worktree.updated"){voidworktrees.list(event.data.projectID)voidbootstrap.refetch()'))
    fail("7: the sync.tsx worktree.updated refetch adjacency changed")

  const worktreeSchema = await read(`${SCHEMA}src/worktree.ts`)
  if (!worktreeSchema.includes("force: Schema.Boolean,"))
    fail("7: Worktree.RemoveInput must require force (schema anchor)")
}

// --- 8. Zero host-OS conditionals in the whitelisted diff-face domains ---
let osScanFiles = 0
{
  // Directories are scanned recursively; single files count once.
  const whitelist: [string, "dir" | "file"][] = [
    [`${GUI_EXT}src/review`, "dir"],
    [`${GUI_EXT}src/details`, "dir"],
    [`${SESSION_UI}src/components/session-review.tsx`, "file"],
    [`${SESSION_UI}src/v2/components`, "dir"],
    [`${APP}src/session/revert.ts`, "file"],
    [`${APP}src/settings/workspaces`, "dir"],
  ]
  const osPatterns: [RegExp, string][] = [
    [/process\.platform/, "process.platform"],
    [/navigator\.platform/, "navigator.platform"],
    [/from ["']node:os["']/, 'import from "node:os"'],
    [/require\(["']os["']\)/, 'require("os")'],
  ]
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
      for (const [pattern, label] of osPatterns) {
        if (pattern.test(source)) fail(`8: host-OS conditional (${label}) found in whitelisted ${target}`)
      }
    }
  }
  // Lower bound (real count on this pin: 170 — review M4): a directory rename
  // must never silently empty the scan.
  if (osScanFiles < 150) fail(`8: whitelist scan covered only ${osScanFiles} files — the directory set looks wrong`)
}

console.log(
  "verify-diff: PASS (" +
    "1: three-mode data face (git/branch→vcs.diff working/branch, turn→session.diff bounded context:3), gates, refetchOnMount always + connected gate, filesystem.changed + idle refresh, vcs.init + requestFailed, detailsQuery working/catch→[], location-scoped file.read, generated statuses init [400,401,404,409,501,503]/diff [400,401,404,503], protocol verbatim (in-closure); " +
    "2: normalized exhaustive sets — vcs.diff {workspaces.tsx, review/model.ts}, vcs.status/vcs.init/vcs.branch.list/worktree.remove singletons, worktree.create {create.ts, workspace-menu.tsx}, vcs.base/vcs.get ZERO in app+gui-extensions (M1: handwritten data.ts vcs.get anchored outside), revert.commit negative deferred to group 3, wrapper layer anchored; " +
    "3: delete confirmation chain (preflight trio, three-state interception, dialog, danger disabled while pending/error, force transact, failure toast) + revert interrupt→wait→stage + inbox.cancel + revert.clear + verbatim comments + settle auto-commit + revert.commit set {submit.ts, composer-adapter.ts} + undo/redo command anchors; " +
    "4: 500-line large-diff placeholder + renderAnyway, binary empty-diff disabled trigger (verbatim comment), mediaKind, 300px mount margin, shouldVirtualizeReviewDiff, largeDiff i18n; " +
    "5: ChangeMode literals + branch/turn gates + per-session store pick + details watch pair + branch/basedOn rows + controller branch.list candidate with catch→[]; " +
    "6: mobile tab (order 10, kind tab), frame.placement mobile → MobileReview, narrow layout.open, review LinkHandler, mobile-diff settings page, unified/wrap/touchstart/scroll keying, en+zh i18n, openIn contract gate; " +
    "7: workspace-menu (updated listener, running lock, move.failed, create+refresh), create.ts, paths inspection trio, inventory event-driven Infinity, sync refetch adjacency, RemoveInput force schema; " +
    "8: zero host-OS conditionals across " +
    osScanFiles +
    " whitelisted files (review/details/session-review/v2/revert/settings-workspaces); " +
    "STATIC check - diff rendering, mode switching, comments, worktree flows, undo/redo, stale timing, client-exit red line and touch/a11y adequacy are G23)",
)
