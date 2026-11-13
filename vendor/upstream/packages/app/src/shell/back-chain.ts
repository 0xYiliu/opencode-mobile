// mobile(tabs-inbox-titlebar-v2-2-7): the in-app back chain for the Android bridge.
//
// The native shell offers one request to this synchronous registry. Layers are tried from
// the topmost visible surface down; the first explicit true consumes one press. A decline
// leaves the native canGoBack/goBack fallback unchanged. This module deliberately has no
// navigation product or session side effects: it only closes the surface that already owns
// the current state.

export type BackLayer = () => boolean

export const BACK_LAYER_ORDER = {
  dialog: 10,
  popover: 15,
  panelDrawer: 20,
  dockPanel: 30,
  titlebarMore: 40,
  goBack: 90,
} as const

const layers: Array<{ order: number; consume: BackLayer }> = []

export function registerBackLayer(order: number, consume: BackLayer): () => void {
  const entry = { order, consume }
  layers.push(entry)
  layers.sort((a, b) => a.order - b.order)

  return () => {
    const index = layers.indexOf(entry)
    if (index !== -1) layers.splice(index, 1)
  }
}

export function consumeBackChain(): boolean {
  for (const layer of layers) {
    try {
      if (layer.consume() === true) return true
    } catch {
      // A failed layer declines. The next visible layer or native fallback still gets a turn.
    }
  }

  return false
}

export function backLayerOrders(): number[] {
  return layers.map((layer) => layer.order)
}

/** Live open-state sentinels for Kobalte menus/popovers and the details flyout. */
export const POPOVER_OPEN_SELECTOR =
  '[role="menu"], [role="dialog"][data-expanded], .session-service-flyout[data-open]'

/** Close one open floating surface through the existing Escape handlers. */
export function consumePopoverSurface(doc: Document): boolean {
  if (!doc.querySelector(POPOVER_OPEN_SELECTOR)) return false
  doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
  return true
}

export interface DockFaces {
  desktop: boolean
  side: { opened(): boolean; toggle(): void }
  bottom: { opened(): boolean; setOpened(open: boolean): void }
}

/** Close exactly one existing wide-screen dock surface, side before bottom. */
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
