// Back-handler port (issue #145/#186, plan T12) — the in-app back dispatch face and its
// fail-closed default. Android's system back (deprecated onBackPressed face — the shell
// is zero-androidx by registered constraint) asks the WebView whether the in-app back
// chain consumed the press; `consume() -> true` means a layer (dialog, drawer, panel,
// in-app history) handled it and the activity must NOT exit, `false` means nobody
// handled it and Android keeps its default finish behavior.
//
// Fail-closed default (M-016/M-020/M-022 precedent): StubBackHandlerPort answers false —
// exactly the pre-#145 behavior, where every back not consumed by webView.canGoBack()
// finished the activity. A shell that injects nothing can never have back "swallowed" by
// an unbacked port: worst case equals today's behavior. Rollback-safe by construction.
//
// The chain itself (dialog stack, drawers, panels, in-app history) lives in the vendored
// shell — this package has zero platform APIs and no UI framework (AGENTS.md architecture
// rule), so the port is a pure seam: the vendored entry registers the aggregating
// implementation through the module-level injection seam, and the native-facing window
// binding consults the active port. The consume call is synchronous BY CONTRACT: every
// chain layer is a synchronous state mutation (dialog close, store flag, router
// navigate), so the native side can read the answer directly from its WebView
// evaluation callback and keep its own in-flight dedupe window.
//
// Injection seam: module-level accessor (the M-016 setActiveServiceOpsPort precedent).
// The runtime bootstrap contract (runtime.ts) is deliberately UNCHANGED; the vendored
// entry calls setActiveBackHandlerPort once at bootstrap.

/**
 * The in-app back dispatch face. NEVER throws; a chain that cannot decide answers false
 * (the Android default proceeds — the activity finishes), never blocks.
 */
export interface BackHandlerPort {
  /**
   * Offer the back press to the in-app back chain. Returns true when a layer consumed
   * the press (the activity stays); false when nobody handled it (Android default finish).
   */
  consume(): boolean
}

/**
 * The only request shape accepted by the native back bridge. The request intentionally has
 * no URL, origin, token, or credential fields: the native side already gates the WebView to
 * the packaged app origin and passes only this opaque nonce to the main frame. The nonce is
 * schema/duplicate-tracking data, not a security capability; this binding is trusted only
 * because it is installed in the same-origin packaged app UI.
 */
export interface BackRequest {
  readonly version: 1
  readonly type: "back"
  readonly requestId: string
}

export const BACK_REQUEST_VERSION = 1 as const
export const BACK_REQUEST_TYPE = "back" as const
export const BACK_REQUEST_ID_MAX_BYTES = 256
export const BACK_REQUEST_ID_HISTORY_LIMIT = 64

function isBackRequestId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  return new TextEncoder().encode(value).byteLength <= BACK_REQUEST_ID_MAX_BYTES
}

/** Validate the fixed, bounded request before it reaches the synchronous chain. */
export function isBackRequest(value: unknown): value is BackRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)

  if (keys.length !== 3 || !keys.every((key) => key === "version" || key === "type" || key === "requestId")) {
    return false
  }

  if (record.version !== BACK_REQUEST_VERSION || record.type !== BACK_REQUEST_TYPE) return false
  if (!isBackRequestId(record.requestId)) return false

  return true
}

export interface BackHandlerBinding {
  consume(request: unknown): boolean
  dispose(): void
}

/**
 * Build the window-facing binding around the existing port. Requests are synchronous, but
 * the guard still rejects re-entry, reused recent request IDs, and calls after disposal so a
 * stale native callback can never consume a later press. The duplicate window is deliberately
 * bounded: native request IDs are unique per dispatch, while the binding retains only the
 * most recent finite history.
 */
export function createBackHandlerBinding(port: BackHandlerPort): BackHandlerBinding {
  let disposed = false
  let pending = false
  const recentRequestIds = new Set<string>()

  return {
    consume(request) {
      if (disposed || pending || !isBackRequest(request)) return false
      if (recentRequestIds.has(request.requestId)) return false

      recentRequestIds.add(request.requestId)
      if (recentRequestIds.size > BACK_REQUEST_ID_HISTORY_LIMIT) {
        const oldest = recentRequestIds.values().next().value
        if (typeof oldest === "string") recentRequestIds.delete(oldest)
      }
      pending = true

      try {
        return port.consume() === true
      } catch {
        return false
      } finally {
        pending = false
      }
    },
    dispose() {
      disposed = true
      pending = false
      recentRequestIds.clear()
    },
  }
}

/**
 * Fail-closed stub: consumes nothing. Equivalent to the pre-#145 state (back finishes the
 * activity), so the port being absent or not yet injected changes nothing.
 */
export const StubBackHandlerPort: BackHandlerPort = {
  consume: () => false,
}

// ---------------------------------------------------------------------------
// Module-level injection seam (M-016/M-020/M-022 precedent; runtime.ts stays untouched)
// ---------------------------------------------------------------------------

let activePort: BackHandlerPort = StubBackHandlerPort

/** Register the chain-backed implementation (the vendored entry bootstrap). Undefined resets. */
export function setActiveBackHandlerPort(port: BackHandlerPort | undefined): void {
  activePort = port ?? StubBackHandlerPort
}

/** The active port. Never undefined: the stub is the fail-closed default. */
export function activeBackHandlerPort(): BackHandlerPort {
  return activePort
}

/** Whether a real (non-stub) port was injected. */
export function backHandlerInjected(): boolean {
  return activePort !== StubBackHandlerPort
}
