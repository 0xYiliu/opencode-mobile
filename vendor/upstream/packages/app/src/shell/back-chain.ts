// mobile(android-back-bridge): the in-app back chain registry (issue #145, plan T12).
//
// Android's system back asks the WebView whether the app consumed the press; this module
// is the aggregating registry the layers (dialog stack, popover faces, panel drawers, the
// wide-screen panel dock, the narrow-screen More drawer, in-app history) register into.
// Layers are tried in ascending `order`; the first layer that answers true has consumed
// the press. When every layer declines the Android default (finish the activity) applies
// — the exact pre-bridge behavior.
//
// The soft keyboard (IME) is deliberately absent: the system consumes back for the IME
// before this face is reached. The registry is a plain module (no UI framework imports)
// so the walk is synchronous and unit-testable; the layers themselves are registered
// from the mounted components that own their state (dialog context, popover faces,
// drawer stores, session dock, titlebar history) and deregister on cleanup.

/** One in-app back layer: return true when this layer consumed the press, false to pass it down the chain. */
export type BackLayer = () => boolean

/** Canonical layer order (ascending; lower tries first). Kept here so registration sites stay declarative. */
export const BACK_LAYER_ORDER = {
  /** Topmost dialog closes first (dialogs render above every other surface). */
  dialog: 10,
  /** An open popover face (menu / Kobalte popover / details flyout) closes next. */
  popover: 15,
  /** A mobile panel drawer: pop its inner sub-view first, then close the drawer. */
  panelDrawer: 20,
  /** The wide-screen panel dock: the side region first, then the bottom dock pane. */
  dockPanel: 30,
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

// ---------------------------------------------------------------------------
// Popover faces (issue #145 QA FAIL-A) — DOM open-state sentinels, no per-site registration
// ---------------------------------------------------------------------------

/**
 * The real open-state markers of every popover face in the shell, all of which close on a
 * document Escape:
 * - `[role="menu"]`: Kobalte menu content (DropdownMenu/ContextMenu — the titlebar
 *   recently-closed menu, servers/home/composer menus, the settings manager menus).
 *   The portal content exists in the DOM ONLY while the menu is open.
 * - `[role="dialog"][data-expanded]`: open Kobalte Popover content (the session details
 *   popover, composer todo/plugin pills, workspace selector, project picker, browser
 *   panel, model select dialog). `data-expanded` is present only while open; the app's
 *   own dialog stack (`data-component="dialog-v2"`) and the corvu drawer render neither
 *   role nor this marker, so layers that own those surfaces stay exclusive.
 * - `.session-service-flyout[data-open]`: the details server flyout — `data-open` is the
 *   live "a service list is open" state, dropped the moment it closes.
 */
export const POPOVER_OPEN_SELECTOR =
  '[role="menu"], [role="dialog"][data-expanded], .session-service-flyout[data-open]'

/**
 * Close the topmost open popover face, if any (issue #145 QA FAIL-A). Returns true when a
 * face was open. Every marker family above closes on a document `Escape` keydown —
 * Kobalte's `createEscapeKeyDown` listens on the document for `key === "Escape"` for both
 * menus and popovers, and the details flyout's own capture handler closes it first (one
 * synthetic press closes exactly the topmost face).
 */
export function consumePopoverSurface(doc: Document): boolean {
  const open = doc.querySelector(POPOVER_OPEN_SELECTOR)
  if (!open) return false
  doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
  return true
}

// ---------------------------------------------------------------------------
// Wide-screen panel dock (issue #145 QA FAIL-B) — the per-tab region dock faces
// ---------------------------------------------------------------------------

/** The live dock faces one session screen owns (the `session.layout.view()` region state). */
export interface DockFaces {
  /** The wide-screen layout: the dock is a desktop surface; narrow screens decline. */
  desktop: boolean
  /** The side region (Review / Open file tabs). */
  side: { opened(): boolean; toggle(): void }
  /** The bottom dock pane (terminal). */
  bottom: { opened(): boolean; setOpened(open: boolean): void }
}

/**
 * Close one dock surface (issue #145 QA FAIL-B): the side region first — the primary
 * panel dock — then the bottom dock pane; deterministic so every back press closes
 * exactly one surface, and neither open means the layer declines (the chain falls
 * through). Narrow screens decline: the dock faces are wide-screen surfaces there
 * invisible (their narrow counterparts are the drawer layers).
 */
export function consumeDockPanel(faces: DockFaces): boolean {
  if (!faces.desktop) return false
  if (faces.side.opened()) {
    faces.side.toggle()
    return true
  }
  if (faces.bottom.opened()) {
    faces.bottom.setOpened(false)
    return true
  }
  return false
}
