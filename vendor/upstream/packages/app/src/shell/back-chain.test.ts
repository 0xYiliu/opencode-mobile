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

describe("android back chain", () => {
  test("declines when no layer owns the press", () => {
    expect(consumeBackChain()).toBe(false)
  })

  test("uses layer order and stops after one consuming layer", () => {
    const visited: string[] = []
    const removeDialog = registerBackLayer(BACK_LAYER_ORDER.dialog, () => {
      visited.push("dialog")
      return true
    })
    const removeHistory = registerBackLayer(BACK_LAYER_ORDER.goBack, () => {
      visited.push("history")
      return true
    })

    expect(consumeBackChain()).toBe(true)
    expect(visited).toEqual(["dialog"])

    removeHistory()
    removeDialog()
    expect(backLayerOrders()).toEqual([])
  })

  test("a throwing layer declines without blocking the next layer", () => {
    const removeThrowing = registerBackLayer(10, () => {
      throw new Error("broken layer")
    })
    const removeFallback = registerBackLayer(90, () => true)

    expect(consumeBackChain()).toBe(true)

    removeFallback()
    removeThrowing()
  })

  test("keeps the canonical one-layer order", () => {
    expect(BACK_LAYER_ORDER.dialog).toBeLessThan(BACK_LAYER_ORDER.popover)
    expect(BACK_LAYER_ORDER.popover).toBeLessThan(BACK_LAYER_ORDER.panelDrawer)
    expect(BACK_LAYER_ORDER.panelDrawer).toBeLessThan(BACK_LAYER_ORDER.dockPanel)
    expect(BACK_LAYER_ORDER.dockPanel).toBeLessThan(BACK_LAYER_ORDER.titlebarMore)
    expect(BACK_LAYER_ORDER.titlebarMore).toBeLessThan(BACK_LAYER_ORDER.goBack)
  })
})

describe("floating surfaces", () => {
  test("only live popover markers consume", () => {
    const menu = document.createElement("div")
    menu.setAttribute("role", "menu")
    document.body.appendChild(menu)

    let escaped = false
    const listener = (event: Event) => {
      escaped = (event as KeyboardEvent).key === "Escape"
    }
    document.addEventListener("keydown", listener)

    expect(consumePopoverSurface(document)).toBe(true)
    expect(escaped).toBe(true)

    menu.remove()
    document.removeEventListener("keydown", listener)
    expect(consumePopoverSurface(document)).toBe(false)
  })

  test("mounted closed faces do not consume", () => {
    const popover = document.createElement("div")
    popover.setAttribute("role", "dialog")
    popover.setAttribute("data-closed", "")
    document.body.appendChild(popover)

    expect(consumePopoverSurface(document)).toBe(false)

    popover.setAttribute("data-expanded", "")
    expect(consumePopoverSurface(document)).toBe(true)
    popover.remove()
  })
})

describe("dock surfaces", () => {
  const faces = (desktop: boolean, side: boolean, bottom: boolean) => {
    const state = { sideClosed: false, bottomClosed: false }
    const value: DockFaces = {
      desktop,
      side: {
        opened: () => side,
        toggle: () => {
          state.sideClosed = true
        },
      },
      bottom: {
        opened: () => bottom,
        setOpened: (open) => {
          state.bottomClosed = !open
        },
      },
    }
    return { value, state }
  }

  test("closes side before bottom and never both", () => {
    const { value, state } = faces(true, true, true)
    expect(consumeDockPanel(value)).toBe(true)
    expect(state).toEqual({ sideClosed: true, bottomClosed: false })
  })

  test("closes the bottom dock when side is closed", () => {
    const { value, state } = faces(true, false, true)
    expect(consumeDockPanel(value)).toBe(true)
    expect(state.bottomClosed).toBe(true)
  })

  test("does not close a dock on a narrow layout", () => {
    const { value, state } = faces(false, true, true)
    expect(consumeDockPanel(value)).toBe(false)
    expect(state).toEqual({ sideClosed: false, bottomClosed: false })
  })
})

// Keep the negative contract visible: this module never calls session interrupt/abort,
// inbox cancel, pty removal, or process kill. Back only consumes an owned UI surface.
