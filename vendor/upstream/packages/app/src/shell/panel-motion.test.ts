import { expect, it } from "bun:test"
import { isRTL, panelOpacity, panelSpring } from "./panel-motion"

it("scales the shared spring's time by the square root of the distance against a 480px panel", () => {
  expect(panelSpring(480)).toEqual({ duration: 0.3, bounce: 0 })
  expect(panelSpring(260).duration).toBeCloseTo(0.2208, 3)
  expect(panelSpring(260).bounce).toBe(0)
})

it("clamps the scaled time between 0.15s and 0.3s", () => {
  expect(panelSpring(40).duration).toBe(0.15)
  expect(panelSpring(2000).duration).toBe(0.3)
})

it("keeps the shared spring when the distance is unknown", () => {
  expect(panelSpring(undefined)).toEqual({ duration: 0.3, bounce: 0 })
  expect(panelSpring(0)).toEqual({ duration: 0.3, bounce: 0 })
})

it("keeps a panel's contents solid until the last stretch of travel before closed", () => {
  expect(panelOpacity(0)).toBe("")
  expect(panelOpacity(0.5)).toBe("1")
  expect(panelOpacity(0.85)).toBe("1")
  expect(Number(panelOpacity(0.925))).toBeCloseTo(0.5, 5)
  expect(panelOpacity(1)).toBe("0")
})

// mobile(A, issue #126): the direction probe must survive WebViews that reject the `:dir()`
// pseudo-class (Huawei Chromium 114), falling back to the LTR reading without throwing.
it("isRTL falls back to LTR when the environment rejects the :dir() selector", () => {
  const element = document.createElement("div")
  document.body.appendChild(element)

  const original = element.matches.bind(element)
  element.matches = (selector: string) => {
    if (selector.includes(":dir")) throw new DOMException(":dir is not a valid selector", "SyntaxError")
    return original(selector)
  }

  expect(isRTL(element)).toBe(false)
  element.matches = original
})

it("isRTL still reports RTL when the environment supports the :dir() selector", () => {
  const element = document.createElement("div")
  element.dir = "rtl"
  document.body.appendChild(element)

  const original = element.matches.bind(element)
  element.matches = (selector: string) => {
    if (selector.includes(":dir")) return true
    return original(selector)
  }

  expect(isRTL(element)).toBe(true)
  element.matches = original
})
