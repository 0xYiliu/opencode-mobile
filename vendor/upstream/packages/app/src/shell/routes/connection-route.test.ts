import { describe, expect, test } from "bun:test"
import { isConnectionRoute } from "./connection-route"

describe("connection route", () => {
  test("allows only the root servers settings view", () => {
    expect(isConnectionRoute("/settings", "?tab=servers")).toBe(true)
    expect(isConnectionRoute("/settings", "?tab=servers&foo=bar")).toBe(false)
    expect(isConnectionRoute("/settings", "?foo=bar")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=servers&project=%2Fwork")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=servers&subtab=plugins")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=servers&tab=servers")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=servers&tab=general")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=servers%20")).toBe(false)
    expect(isConnectionRoute("/settings", "")).toBe(false)
    expect(isConnectionRoute("/settings", "?tab=general")).toBe(false)
    expect(isConnectionRoute("/settings", "?server=local&tab=servers")).toBe(false)
    expect(isConnectionRoute("/", "?tab=servers")).toBe(false)
  })
})
