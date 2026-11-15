// Safari before 17.4 lacks Map.groupBy and Promise.withResolvers, and Promise.try arrived in Safari 18.2. Electron's
// Chromium has all three, so these only matter for the web app.
if (!Map.groupBy) {
  Map.groupBy = function groupBy<K, T>(items: Iterable<T>, callback: (item: T, index: number) => K) {
    const groups = new Map<K, T[]>()
    let index = 0

    for (const item of items) {
      const key = callback(item, index++)
      const group = groups.get(key)

      if (group) group.push(item)
      else groups.set(key, [item])
    }

    return groups
  }
}

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: Error) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }
}

if (!Promise.try) {
  // SAFETY: the callback's return type is carried through unchanged, which is all Promise.try promises.
  Promise.try = function tryCall<T, U extends unknown[]>(callback: (...args: U) => T | PromiseLike<T>, ...args: U) {
    return new Promise<T>((resolve) => resolve(callback(...args)))
  } as typeof Promise.try
}

// Chrome before 120 (Android WebView; the Android floor this app ships on predates it) and Safari
// before 17.4 lack URL.canParse and URL.parse. Electron's Chromium has both, so like the shims
// above these only matter for the web app.
// mobile(runtime-data-v2-2-7, issue #196)
if (!URL.canParse) {
  // Same contract as the native statics: a missing argument throws, string conversion of either
  // input happens before the parse (so a throwing conversion propagates instead of answering
  // false), a URL-object base rides the same conversion, and a parse failure answers false.
  URL.canParse = function canParse(url: string | URL, base?: string | URL) {
    if (arguments.length === 0)
      throw new TypeError("Failed to execute 'canParse' on 'URL': 1 argument required, but only 0 present.")

    const input = String(url)
    const baseInput = base === undefined ? undefined : String(base)

    try {
      new URL(input, baseInput)

      return true
    } catch {
      return false
    }
  } as typeof URL.canParse
}

if (!URL.parse) {
  // The parse twin: a parse failure answers null instead of throwing, everything else as above.
  URL.parse = function parse(url: string | URL, base?: string | URL) {
    if (arguments.length === 0)
      throw new TypeError("Failed to execute 'parse' on 'URL': 1 argument required, but only 0 present.")

    const input = String(url)
    const baseInput = base === undefined ? undefined : String(base)

    try {
      return new URL(input, baseInput)
    } catch {
      return null
    }
  } as typeof URL.parse
}

// mobile(runtime-data-v2-2-7, issue #196 residual closed on-device at #199): AbortSignal.any
// shipped in Chromium 116; the Huawei WebView 114 build throws TypeError the moment any of the
// 29 composed-signal call sites mounts (measured on device 2026-11-15: opening a session hits
// the commands chunk and lands on the shell error screen). Compose via an AbortController that
// forwards each source's abort reason; the optional stop signal aborts the composition without
// leaking listeners back onto the sources. Basic-shape compatible with all 29 vendored call sites.
if (!AbortSignal.any) {
  AbortSignal.any = function any(signals: Iterable<AbortSignal>, options?: { signal?: AbortSignal }) {
    const controller = new AbortController()
    const list = [...signals]
    const forwards = new Map<AbortSignal, () => void>()
    const cleanup = () => {
      for (const [signal, forward] of forwards) signal.removeEventListener("abort", forward)
      forwards.clear()
    }
    const abortFrom = (reason: unknown) => {
      cleanup()
      controller.abort(reason)
    }
    for (const signal of list) {
      if (signal.aborted) {
        abortFrom(signal.reason)
        break
      }
      const forward = () => abortFrom(signal.reason)
      forwards.set(signal, forward)
      signal.addEventListener("abort", forward, { once: true })
    }
    options?.signal?.addEventListener("abort", () => abortFrom(options.signal!.reason), { once: true })
    return controller.signal
  } as typeof AbortSignal.any
}
