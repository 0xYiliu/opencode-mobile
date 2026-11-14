// verify-pierre-webview-compat.test.ts — issue #162/#163 regression seam, re-anchored for #190.
//
// Static anchors (main): the files-diff-review-v2-2-7 patch seams must stay in the vendored
// sources (the consolidated #190 re-derivation of diff-worker-pool-fallback + files-stream-watch
// + files-open-external), and the @pierre/trees dependency baseline must stay at 1.0.0-beta.6
// (the v2.2.1 extraction). Drift on any of these anchors is exactly the failure shape that
// blanked the Open-file tree (#162: applyGitStatusPatch/getVisibleRows TypeErrors from a beta.4
// baseline) and the diff body (#163: sprite + empty PRE after the pool's initialize() rejects
// on the WebView main thread). See docs/build-and-verify.md, issue #162/#163 and #190 sections.
//
// #190: the file.tsx createPoolReady viewer-gate test is DROPPED — v2.2.7's native viewer
// render machine owns the pool fallback (pool.settled / pool.timed-out → main-thread
// fallback), behavior-tested upstream in render-machine.test.ts:116-141 ("a failed or hung
// pool falls back to the main thread"). The old mobile bypass hunk is superseded.
//
// Pure-module behavior tests (secondary): pierre/pool-strategy.ts is the only newly extracted
// module; its settle/timeout/reject × gate matrix is exercised here with injected clocks.
// file.tsx itself is NOT behavior-imported (m2 boundary).
import { expect, test } from "bun:test"
import { dirname, join } from "node:path"

const repoRoot = join(import.meta.dir, "..")
const repo = (path: string) => join(repoRoot, path)

const read = async (path: string) => await Bun.file(repo(path)).text()

const FILES = {
  worker: "vendor/upstream/packages/session-ui/src/pierre/worker.ts",
  index: "vendor/upstream/packages/session-ui/src/pierre/index.ts",
  strategy: "vendor/upstream/packages/session-ui/src/pierre/pool-strategy.ts",
  appPkg: "vendor/upstream/packages/app/package.json",
  guiPkg: "vendor/upstream/packages/gui-plugins/package.json",
  tree: "vendor/upstream/packages/gui-plugins/src/file/pierre-tree.tsx",
  rootPkg: "package.json",
  migrationPatch: "vendor/upstream/patches/mobile/gui-plugins-api-migration.patch",
  poolPatch: "vendor/upstream/patches/mobile/files-diff-review-v2-2-7.patch",
}

// --- static anchors ---

test("worker guard: failed pools are recorded and getWorkerPool hands back undefined", async () => {
  const src = await read(FILES.worker)
  expect(src).toContain('import { watchPoolSettlement } from "./pool-strategy"')
  expect(src).toContain("const POOL_PROBE_TIMEOUT_MS = 12_000")
  expect(src).toContain("failedPools.add(pool)")
  expect(src).toContain("failedPools.has(plain) ? undefined : plain")
  expect(src).toContain("failedPools.has(diff) ? undefined : diff")
  expect(src).toContain('console.error("[diff] pierre worker pool init failed", cause)')
})

test("engine: highlightOptions selects shiki-js with the bundled theme pair, never the main-thread-wasm highlights engine", async () => {
  const src = await read(FILES.index)
  expect(src).toContain('preferredHighlighter: "shiki-js"')
  expect(/preferredHighlighter:\s*"highlights"/.test(src)).toBe(false)
  // The shiki path cannot consume the Highlights-palette OpenCode registration
  // (themeResolver serves that only to the highlights engine): the pool must carry
  // pierre's bundled shiki themes instead.
  expect(src).toContain('theme: { dark: "pierre-dark", light: "pierre-light" }')
})

test("strategy module: testable exports, no solid and no worker imports", async () => {
  const src = await read(FILES.strategy)
  expect(src).toContain("export function observeSettlement")
  expect(src).toContain("export function watchPoolSettlement")
  expect(src).toContain("export type SettlementWatcher")
  expect(src).not.toContain('from "solid-js"')
  expect(src).not.toContain("?worker&url")
})

test("dependency baseline: @pierre/trees stays 1.0.0-beta.6 (v2.2.1 extraction), beta.4 gone", async () => {
  const appPkg = await read(FILES.appPkg)
  const guiPkg = await read(FILES.guiPkg)
  const rootPkg = await read(FILES.rootPkg)
  expect(appPkg).toContain('"@pierre/trees": "1.0.0-beta.6"')
  expect(guiPkg).toContain('"@pierre/trees": "1.0.0-beta.6"')
  expect(appPkg.includes("1.0.0-beta.4")).toBe(false)
  expect(guiPkg.includes("1.0.0-beta.4")).toBe(false)
  expect(rootPkg).toContain('"@pierre/trees@1.0.0-beta.6"')
  expect(rootPkg.includes("@pierre/trees@1.0.0-beta.4")).toBe(false)
  await expect(Bun.file(repo("vendor/upstream/patches/@pierre%2Ftrees@1.0.0-beta.6.patch")).exists()).resolves.toBe(true)
  await expect(Bun.file(repo("vendor/upstream/patches/@pierre%2Ftrees@1.0.0-beta.4.patch")).exists()).resolves.toBe(false)
})

test("tree chain: pierre-tree keeps the beta.6-only API call sites the baseline must serve", async () => {
  const src = await read(FILES.tree)
  expect(src).toContain("tree.applyGitStatusPatch(patch)")
  expect(src).toContain("tree.getVisibleRows(startIndex, endIndex)")
})

test("migration patch: the stale beta.6→beta.4 downgrade hunk stays removed", async () => {
  const patch = await read(FILES.migrationPatch)
  expect(patch.includes('+    "@pierre/trees": "1.0.0-beta.4",')).toBe(false)
})

test("patch registration: files-diff-review-v2-2-7.patch exists and covers its five targets", async () => {
  const patch = await read(FILES.poolPatch)
  for (const target of [
    "a/packages/session-ui/src/pierre/index.ts",
    "a/packages/session-ui/src/pierre/pool-strategy.ts",
    "a/packages/session-ui/src/pierre/worker.ts",
    "a/packages/app/src/runtime/platform/web.ts",
    "a/packages/app/src/workspaces/files/artifact.test.ts",
  ])
    expect(patch).toContain(target)
  expect(patch).toContain("new file mode")
})

// --- pool-strategy behavior matrix (pure module, injected clocks) ---

import { observeSettlement, watchPoolSettlement } from "../vendor/upstream/packages/session-ui/src/pierre/pool-strategy"

/** Minimal fake clock: fire callbacks in milliseconds, manually. */
function fakeClock() {
  const pending = new Map<number, { fn: () => void; at: number }>()
  let now = 0
  let nextId = 1
  const timer = (fn: () => void, ms: number) => {
    const id = nextId++
    pending.set(id, { fn, at: now + ms })
    return id
  }
  const clear = (handle: unknown) => pending.delete(handle as number)
  return {
    timer,
    clear,
    advance(ms: number) {
      now += ms
      for (const [id, task] of [...pending.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (task.at <= now) {
          pending.delete(id)
          task.fn()
        }
      }
    },
  }
}

test("observeSettlement: resolves ok with the value", async () => {
  expect(await observeSettlement(Promise.resolve(42), 1000)).toEqual({ ok: true, value: 42 })
})

test("observeSettlement: rejects report ok:false rejected with the cause", async () => {
  const cause = new Error("boom")
  const outcome = await observeSettlement(Promise.reject(cause), 1000).catch(() => null)
  expect(outcome).toEqual({ ok: false, reason: "rejected", cause })
})

test("observeSettlement: a hanging promise times out with ok:false", async () => {
  const clock = fakeClock()
  let resolveHanging: (v: string) => void = () => {}
  const hanging = new Promise<string>((resolve) => (resolveHanging = resolve))
  const observed = observeSettlement(hanging, 5_000, clock.timer, clock.clear)
  clock.advance(6_000)
  expect(await observed).toEqual({ ok: false, reason: "timeout" })
  // A late settle after the timeout must not flip the outcome or leak the timer.
  resolveHanging("late")
  await Promise.resolve()
})

test("observeSettlement: settle before the timeout clears the timer", async () => {
  const clock = fakeClock()
  let resolveHanging: (v: number) => void = () => {}
  const hanging = new Promise<number>((resolve) => (resolveHanging = resolve))
  const observed = observeSettlement(hanging, 5_000, clock.timer, clock.clear)
  resolveHanging(7)
  await Promise.resolve()
  clock.advance(10_000)
  expect(await observed).toEqual({ ok: true, value: 7 })
})

test("watchPoolSettlement: healthy settle fires onSettled and never fails", async () => {
  const events: string[] = []
  const watcher = watchPoolSettlement({ initialize: () => Promise.resolve("ok") }, {
    timeoutMs: 1_000,
    onSettled: () => events.push("settled"),
    onError: () => events.push("error"),
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(events).toEqual(["settled"])
  expect(watcher.isFailed()).toBe(false)
})

test("watchPoolSettlement: rejection surfaces the cause through onError", async () => {
  const events: unknown[] = []
  const cause = new RangeError("wasm sync compile")
  const watcher = watchPoolSettlement({ initialize: () => Promise.reject(cause) }, {
    timeoutMs: 1_000,
    onError: (e) => events.push(e),
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(events).toEqual([cause])
  expect(watcher.isFailed()).toBe(true)
})

test("watchPoolSettlement: a pool that never settles reports a timeout error", async () => {
  const clock = fakeClock()
  const events: unknown[] = []
  const watcher = watchPoolSettlement({ initialize: () => new Promise(() => {}) }, {
    timeoutMs: 12_000,
    onError: (e) => events.push(e),
    timer: clock.timer,
    clear: clock.clear,
  })
  clock.advance(13_000)
  await Promise.resolve()
  expect(events).toHaveLength(1)
  expect(events[0]).toBeInstanceOf(Error)
  expect(String((events[0] as Error).message)).toContain("did not settle within 12000ms")
  expect(watcher.isFailed()).toBe(true)
})
