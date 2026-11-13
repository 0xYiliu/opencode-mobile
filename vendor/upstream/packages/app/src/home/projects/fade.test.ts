import { describe, expect, test } from "bun:test"
import { homeProjectsFadeState } from "./fade"

describe("home project list edge fades", () => {
  test.each([
    ["top", { scrollTop: 0, clientHeight: 100, scrollHeight: 220 }, { top: false, bottom: true }],
    ["middle", { scrollTop: 40, clientHeight: 100, scrollHeight: 220 }, { top: true, bottom: true }],
    ["bottom", { scrollTop: 120, clientHeight: 100, scrollHeight: 220 }, { top: true, bottom: false }],
    ["one-pixel tolerance", { scrollTop: 119, clientHeight: 100, scrollHeight: 220 }, { top: true, bottom: false }],
  ])("marks the %s edge state", (_name, metrics, expected) => {
    expect(homeProjectsFadeState(metrics)).toEqual(expected)
  })
})
