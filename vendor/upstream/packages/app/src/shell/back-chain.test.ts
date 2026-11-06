import { describe, expect, test } from "bun:test"
import {
  BACK_LAYER_ORDER,
  backLayerOrders,
  consumeBackChain,
  consumeDockPanel,
  consumePopoverSurface,
  registerBackLayer,
  type DockFaces,
} from "./back-chain"

// mobile(android-back-bridge): the chain walk semantics (issue #145, plan T12 + QA
// FAIL-A/FAIL-B). Locked here because the walk is the contract the native back dispatch
// relies on: only an explicit true from a layer suppresses the activity finish; an empty
// or all-declining chain (and a throwing layer) falls through to the Android default.
// The popover sentinels and the dock faces are pinned to their real open states (a closed
// menu unmounts, a closed popover carries data-closed, a closed flyout drops data-open),
// never to mounted-but-closed markers.

describe("back chain", () => {
  test("an empty chain declines the press (the Android default proceeds)", () => {
    expect(consumeBackChain()).toBe(false)
  })

  test("the first layer that answers true consumes the press and stops the walk", () => {
    const visited: string[] = []
    const unregisterLow = registerBackLayer(10, () => {
      visited.push("high")
      return true
    })
    const unregisterHigh = registerBackLayer(90, () => {
      visited.push("low")
      return true
    })

    expect(consumeBackChain()).toBe(true)
    expect(visited).toEqual(["high"])

    unregisterLow()
    unregisterHigh()
  })

  test("declining layers pass the press down the chain", () => {
    const unregisterDecline = registerBackLayer(10, () => false)
    const unregisterConsume = registerBackLayer(90, () => true)

    expect(consumeBackChain()).toBe(true)

    unregisterConsume()
    unregisterDecline()
    expect(consumeBackChain()).toBe(false)
  })

  test("layer order breaks registration sequence (order 40 mounted before order 10 still tries 10 first)", () => {
    const visited: string[] = []
    const unregisterLate = registerBackLayer(BACK_LAYER_ORDER.dialog, () => {
      visited.push("dialog")
      return true
    })
    const unregisterEarly = registerBackLayer(BACK_LAYER_ORDER.titlebarMore, () => {
      visited.push("titlebar")
      return true
    })

    expect(backLayerOrders()).toEqual([BACK_LAYER_ORDER.dialog, BACK_LAYER_ORDER.titlebarMore])
    expect(consumeBackChain()).toBe(true)
    expect(visited).toEqual(["dialog"])

    unregisterEarly()
    unregisterLate()
  })

  test("unregister removes exactly the layer it returned for", () => {
    const unregisterKeep = registerBackLayer(10, () => false)
    const unregisterDrop = registerBackLayer(20, () => true)

    unregisterDrop()
    expect(backLayerOrders()).toEqual([10])
    expect(consumeBackChain()).toBe(false)

    unregisterKeep()
    expect(backLayerOrders()).toEqual([])
  })

  test("a throwing layer declines the press and the chain continues", () => {
    const unregisterThrowing = registerBackLayer(10, () => {
      throw new Error("layer state error")
    })
    const unregisterFallback = registerBackLayer(BACK_LAYER_ORDER.goBack, () => true)

    expect(consumeBackChain()).toBe(true)

    unregisterFallback()
    unregisterThrowing()
    expect(consumeBackChain()).toBe(false)
  })

  test("canonical order: dialog < popover < panelDrawer < dockPanel < titlebarMore < goBack", () => {
    expect(BACK_LAYER_ORDER.dialog).toBeLessThan(BACK_LAYER_ORDER.popover)
    expect(BACK_LAYER_ORDER.popover).toBeLessThan(BACK_LAYER_ORDER.panelDrawer)
    expect(BACK_LAYER_ORDER.panelDrawer).toBeLessThan(BACK_LAYER_ORDER.dockPanel)
    expect(BACK_LAYER_ORDER.dockPanel).toBeLessThan(BACK_LAYER_ORDER.titlebarMore)
    expect(BACK_LAYER_ORDER.titlebarMore).toBeLessThan(BACK_LAYER_ORDER.goBack)
  })
})

describe("popover faces (QA FAIL-A)", () => {
  test("an open Kobalte menu is consumed and closed by a document Escape", () => {
    const content = document.createElement("div")
    content.setAttribute("role", "menu")
    document.body.appendChild(content)

    let escapeSeen = false
    const witness = (event: Event) => {
      if ((event as KeyboardEvent).key === "Escape") escapeSeen = true
    }
    document.addEventListener("keydown", witness)

    expect(consumePopoverSurface(document)).toBe(true)
    expect(escapeSeen).toBe(true)

    document.removeEventListener("keydown", witness)
    content.remove()
    expect(consumePopoverSurface(document)).toBe(false)
  })

  test("an open Kobalte popover (role dialog + data-expanded) is consumed", () => {
    const content = document.createElement("div")
    content.setAttribute("role", "dialog")
    content.setAttribute("data-expanded", "")
    document.body.appendChild(content)

    expect(consumePopoverSurface(document)).toBe(true)

    // The closed face carries data-expanded no longer (Kobalte flips to data-closed):
    // the sentinel must not fire on mounted-but-closed markers (the M4 lesson).
    content.removeAttribute("data-expanded")
    content.setAttribute("data-closed", "")
    expect(consumePopoverSurface(document)).toBe(false)

    content.remove()
  })

  test("the details flyout is consumed through its data-open state only", () => {
    const flyout = document.createElement("div")
    flyout.className = "session-service-flyout"
    document.body.appendChild(flyout)

    // Pane present with no service list open: data-open absent — decline.
    expect(consumePopoverSurface(document)).toBe(false)

    flyout.setAttribute("data-open", "")
    expect(consumePopoverSurface(document)).toBe(true)

    flyout.remove()
  })

  test("the app dialog stack and corvu drawer markers never match the sentinel", () => {
    const dialog = document.createElement("div")
    dialog.setAttribute("data-component", "dialog-v2")
    const drawer = document.createElement("div")
    drawer.setAttribute("data-corvu-drawer-content", "")
    document.body.append(dialog, drawer)

    // Layers 10 (dialog stack) and 20 (panel drawer) own these; the popover sentinel
    // must stay exclusive.
    expect(consumePopoverSurface(document)).toBe(false)

    dialog.remove()
    drawer.remove()
  })
})

describe("dock panel faces (QA FAIL-B)", () => {
  const faces = (overrides: Partial<Omit<DockFaces, "side" | "bottom">> = {}, side = false, bottom = false): DockFaces & {
    sideToggled: boolean
    bottomSet: boolean | undefined
  } => {
    const state: DockFaces & { sideToggled: boolean; bottomSet: boolean | undefined } = {
      desktop: true,
      sideToggled: false,
      bottomSet: undefined,
      side: {
        opened: () => side,
        toggle: () => {
          state.sideToggled = true
        },
      },
      bottom: {
        opened: () => bottom,
        setOpened: (open) => {
          state.bottomSet = open
        },
      },
      ...overrides,
    }
    return state
  }

  test("an open side region is closed first (one surface per press)", () => {
    const state = faces({}, true, true)
    expect(consumeDockPanel(state)).toBe(true)
    expect(state.sideToggled).toBe(true)
    expect(state.bottomSet).toBeUndefined()
  })

  test("with the side region closed the bottom dock pane closes", () => {
    const state = faces({}, false, true)
    expect(consumeDockPanel(state)).toBe(true)
    expect(state.sideToggled).toBe(false)
    expect(state.bottomSet).toBe(false)
  })

  test("no open dock surface declines the press", () => {
    const state = faces({}, false, false)
    expect(consumeDockPanel(state)).toBe(false)
    expect(state.sideToggled).toBe(false)
    expect(state.bottomSet).toBeUndefined()
  })

  test("a narrow screen declines even with dock state open (dock is a desktop surface)", () => {
    const state = faces({ desktop: false }, true, true)
    expect(consumeDockPanel(state)).toBe(false)
    // Declined surfaces are never mutated.
    expect(state.sideToggled).toBe(false)
    expect(state.bottomSet).toBeUndefined()
  })
})
