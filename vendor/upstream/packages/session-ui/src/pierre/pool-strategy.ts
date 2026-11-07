// mobile(diff-worker-pool-fallback): pure helpers that make a pierre worker pool's first
// initialize() observable and bounded, so a pool that rejects — or never settles — can release
// the render gate instead of leaving viewers on the sprite + empty-pre face (#163). Nothing in
// this module may import viewer code, solid, or any worker-script module: it must stay loadable
// from a plain bun test (scripts/verify-pierre-webview-compat.test.ts exercises the matrix).

export type PoolLike = {
  initialize(): Promise<unknown>
}

export type SettlementOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" }
  | { ok: false; reason: "rejected"; cause: unknown }

/**
 * Resolves with the promise's settlement outcome, or `{ ok: false, reason: "timeout" }` when it
 * neither resolves nor rejects within `ms`. Never rejects. `timer`/`clear` are injectable so
 * tests run without real clocks.
 */
export function observeSettlement<T>(
  promise: Promise<T>,
  ms: number,
  timer: (callback: () => void, ms: number) => unknown = setTimeout,
  clear: (handle: unknown) => void = clearTimeout,
): Promise<SettlementOutcome<T>> {
  return new Promise((resolve) => {
    let done = false
    const finish = (outcome: SettlementOutcome<T>) => {
      if (done) return
      done = true
      clear(handle)
      resolve(outcome)
    }
    const handle = timer(() => finish({ ok: false, reason: "timeout" }), ms)
    promise.then(
      (value) => finish({ ok: true, value }),
      (cause) => finish({ ok: false, reason: "rejected", cause }),
    )
  })
}

export type SettlementWatcher = {
  /** True once initialize() rejected or failed to settle within the timeout. */
  isFailed(): boolean
}

/**
 * Watches a pool's first initialize(): `onError` fires with the cause on rejection, or with a
 * timeout marker error when the promise does not settle within `timeoutMs`; `onSettled` fires
 * on a healthy settle. Pierre's own initialization timeout (10s) still runs inside the pool,
 * so the probe keeps a margin over it and pool-side timeouts surface as rejections, not probe
 * timeouts.
 */
export function watchPoolSettlement(
  pool: PoolLike,
  options: {
    timeoutMs: number
    onSettled?: () => void
    onError?: (cause: unknown) => void
    timer?: (callback: () => void, ms: number) => unknown
    clear?: (handle: unknown) => void
  },
): SettlementWatcher {
  let failed = false
  void observeSettlement(pool.initialize(), options.timeoutMs, options.timer, options.clear).then((outcome) => {
    if (outcome.ok) {
      options.onSettled?.()
      return
    }
    failed = true
    options.onError?.(
      outcome.reason === "rejected" ? outcome.cause : new Error(`pool initialize did not settle within ${options.timeoutMs}ms`),
    )
  })
  return { isFailed: () => failed }
}
