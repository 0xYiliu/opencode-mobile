// mobile(android-back-bridge): the in-app back chain registry (issue #145, plan T12).
//
// Android's system back asks the WebView whether the app consumed the press; this module
// is the aggregating registry the layers (dialog stack, panel drawers, the narrow-screen
// More drawer, in-app history) register into. Layers are tried in ascending `order`;
// the first layer that answers true has consumed the press. When every layer declines
// the Android default (finish the activity) applies — the exact pre-bridge behavior.
//
// The soft keyboard (IME) is deliberately absent: the system consumes back for the IME
// before this face is reached. The registry is a plain module (no UI framework imports)
// so the walk is synchronous and unit-testable; the layers themselves are registered
// from the mounted components that own their state (dialog context, drawer stores,
// titlebar history) and deregister on cleanup.

/** One in-app back layer: return true when this layer consumed the press, false to pass it down the chain. */
export type BackLayer = () => boolean

/** Canonical layer order (ascending; lower tries first). Kept here so registration sites stay declarative. */
export const BACK_LAYER_ORDER = {
  /** Topmost dialog closes first (dialogs render above every other surface). */
  dialog: 10,
  /** A mobile panel drawer: pop its inner sub-view first, then close the drawer. */
  panelDrawer: 20,
  /** The narrow-screen titlebar More drawer. */
  titlebarMore: 40,
  /** In-app history back (`common.goBack`); declines when there is no back path. */
  goBack: 90,
} as const

const layers: Array<{ order: number; consume: BackLayer }> = []

/**
 * Register one layer. Returns the unregister function — call it from `onCleanup` so an
 * unmounted surface (closed panel instance, torn-down provider) leaves the chain.
 * `order` breaks ties for simultaneously-mounted surfaces (e.g. several panel drawer
 * instances); registration sequence keeps it stable within one order value.
 */
export function registerBackLayer(order: number, consume: BackLayer): () => void {
  const entry = { order, consume }
  layers.push(entry)
  layers.sort((a, b) => a.order - b.order)
  return () => {
    const at = layers.indexOf(entry)
    if (at !== -1) layers.splice(at, 1)
  }
}

/**
 * Walk the chain in layer order; the first layer that answers true consumed the press.
 * False means nobody handled it — the caller (the native back bridge) falls through to
 * the Android default.
 */
export function consumeBackChain(): boolean {
  for (const layer of layers) {
    let consumed = false
    try {
      consumed = layer.consume()
    } catch {
      // A throwing layer has not consumed the press; the chain continues.
      consumed = false
    }
    if (consumed) return true
  }
  return false
}

/** Current chain shape (order values, lowest first) — diagnostics for tests and probes. */
export function backLayerOrders(): number[] {
  return layers.map((layer) => layer.order)
}
