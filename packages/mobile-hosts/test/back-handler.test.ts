import { describe, expect, test } from "bun:test"
import {
  StubBackHandlerPort,
  activeBackHandlerPort,
  backHandlerInjected,
  setActiveBackHandlerPort,
  type BackHandlerPort,
} from "../src/back-handler"

// Back-handler port + seam (issue #145, plan T12). The fail-closed stub semantics
// (consume -> false: the Android default finish proceeds, the pre-#145 behavior) and the
// module-level injection seam (register / reset to stub / injected flag) are locked here.
// The contract that matters on the device: only an explicit `true` suppresses the
// activity finish — every other path answers false.

describe("back handler port", () => {
  test("stub consumes nothing (fail-closed: false keeps the Android default finish)", () => {
    expect(StubBackHandlerPort.consume()).toBe(false)
  })

  test("the module default is the stub before any injection", () => {
    // Reads through the same accessor the vendored window binding uses.
    setActiveBackHandlerPort(undefined)
    expect(activeBackHandlerPort()).toBe(StubBackHandlerPort)
    expect(backHandlerInjected()).toBe(false)
    expect(activeBackHandlerPort().consume()).toBe(false)
  })

  test("an injected chain-backed port is returned by the accessor and reported as injected", () => {
    const chain: BackHandlerPort = { consume: () => true }
    setActiveBackHandlerPort(chain)
    expect(activeBackHandlerPort()).toBe(chain)
    expect(backHandlerInjected()).toBe(true)
    expect(activeBackHandlerPort().consume()).toBe(true)
  })

  test("reset with undefined falls back to the stub (rollback = today's behavior)", () => {
    setActiveBackHandlerPort({ consume: () => true })
    setActiveBackHandlerPort(undefined)
    expect(backHandlerInjected()).toBe(false)
    expect(activeBackHandlerPort().consume()).toBe(false)
  })
})
