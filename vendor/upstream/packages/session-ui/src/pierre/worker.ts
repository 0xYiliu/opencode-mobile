import { WorkerPoolManager } from "@pierre/diffs/worker"
import DiffsWorkerUrl from "@pierre/diffs/worker/worker.js?worker&url"
import { watchPoolSettlement } from "./pool-strategy"
import { highlightOptions } from "./index"

// mobile(diff-worker-pool-fallback): pierre gives up on its own initialization after 10s; probe
// with a margin over that so pool-side timeouts surface as rejections rather than probe timeouts.
const POOL_PROBE_TIMEOUT_MS = 12_000

// mobile(diff-worker-pool-fallback): a pool whose first initialize() rejects — or never settles —
// must not gate rendering forever (#163). Such a pool is recorded here and getWorkerPool() hands
// back undefined, so viewers construct without a pool and render rows on the main-thread path
// (word-level diff/highlight semantics degrade to pierre's no-pool face; registered in
// docs/design/units/diff.md). The probe lives in pool-strategy.ts so bun tests can exercise it.
const failedPools = new WeakSet<WorkerPoolManager>()

function createPool(lineDiffType: "none" | "word-line") {
  const pool = new WorkerPoolManager(
    {
      workerFactory: () => new Worker(DiffsWorkerUrl, { type: "module" }),
      // poolSize defaults to 8. More workers = more parallelism but
      // also more memory. Too many can actually slow things down.
      // NOTE: 2 is probably better for OpenCode, as I think 8 might be
      // a bit overkill, especially because Safari has a significantly slower
      // boot up time for workers
      poolSize: 2,
    },
    {
      ...highlightOptions,
      lineDiffType,
      // Pierre renders with the pool's options, not the viewer's, whenever the pool works. The "none" pool only
      // serves diffs above the large-file threshold, so it carries the plain-text fallback the viewer requests.
      ...(lineDiffType === "none" && { maxLineDiffLength: 0, tokenizeMaxLineLength: 1 }),
    },
  )

  watchPoolSettlement(pool, {
    timeoutMs: POOL_PROBE_TIMEOUT_MS,
    onError: (cause) => {
      failedPools.add(pool)
      console.error("[diff] pierre worker pool init failed", cause)
    },
  })

  void pool.initialize()

  return pool
}

let plain: WorkerPoolManager | undefined

let diff: WorkerPoolManager | undefined

export function getWorkerPool(lineDiffType: "none" | "word-line" = "word-line"): WorkerPoolManager | undefined {
  if (typeof window === "undefined") return

  if (lineDiffType === "none") {
    if (!plain) plain = createPool("none")

    return failedPools.has(plain) ? undefined : plain
  }

  if (!diff) diff = createPool("word-line")

  return failedPools.has(diff) ? undefined : diff
}
