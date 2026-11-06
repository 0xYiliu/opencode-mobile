import { describe, expect, test } from "bun:test"
import { BACK_LAYER_ORDER, backLayerOrders, consumeBackChain, registerBackLayer } from "./back-chain"

// mobile(android-back-bridge): the chain walk semantics (issue #145, plan T12). Locked
// here because the walk is the contract the native back dispatch relies on: only an
// explicit true from a layer suppresses the activity finish; an empty or all-declining
// chain (and a throwing layer) falls through to the Android default.

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

  test("canonical order: dialog < panelDrawer < titlebarMore < goBack", () => {
    expect(BACK_LAYER_ORDER.dialog).toBeLessThan(BACK_LAYER_ORDER.panelDrawer)
    expect(BACK_LAYER_ORDER.panelDrawer).toBeLessThan(BACK_LAYER_ORDER.titlebarMore)
    expect(BACK_LAYER_ORDER.titlebarMore).toBeLessThan(BACK_LAYER_ORDER.goBack)
  })
})
