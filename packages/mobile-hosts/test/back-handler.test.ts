import { describe, expect, test } from "bun:test"
import {
  BACK_REQUEST_ID_MAX_BYTES,
  BACK_REQUEST_ID_HISTORY_LIMIT,
  BACK_REQUEST_TYPE,
  BACK_REQUEST_VERSION,
  StubBackHandlerPort,
  activeBackHandlerPort,
  backHandlerInjected,
  createBackHandlerBinding,
  isBackRequest,
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

  test("the window request accepts only the fixed bounded back shape", () => {
    const request = {
      version: BACK_REQUEST_VERSION,
      type: BACK_REQUEST_TYPE,
      requestId: "opaque-request-1",
    } as const

    expect(isBackRequest(request)).toBe(true)
    expect(isBackRequest({ ...request, version: 2 })).toBe(false)
    expect(isBackRequest({ ...request, type: "forward" })).toBe(false)
    expect(isBackRequest({ ...request, requestId: "" })).toBe(false)
    expect(
      isBackRequest({
        ...request,
        requestId: "x".repeat(BACK_REQUEST_ID_MAX_BYTES + 1),
      }),
    ).toBe(false)
    expect(isBackRequest({ ...request, url: "http://user:secret@example.invalid" })).toBe(false)
  })

  test("the binding rejects duplicates, re-entry, and calls after disposal", () => {
    const request = { version: 1, type: "back", requestId: "opaque-request-2" } as const
    let calls = 0
    let binding: ReturnType<typeof createBackHandlerBinding>
    const port: BackHandlerPort = {
      consume: () => {
        calls += 1
        expect(binding.consume(request)).toBe(false)
        return true
      },
    }

    binding = createBackHandlerBinding(port)
    expect(binding.consume(request)).toBe(true)
    expect(calls).toBe(1)
    expect(binding.consume(request)).toBe(false)

    binding.dispose()
    expect(binding.consume({ version: 1, type: "back", requestId: "opaque-request-3" })).toBe(false)
    expect(calls).toBe(1)
  })

  test("keeps duplicate protection for the recent bounded request window", () => {
    let calls = 0
    const binding = createBackHandlerBinding({
      consume: () => {
        calls += 1
        return true
      },
    })

    const ids = Array.from({ length: BACK_REQUEST_ID_HISTORY_LIMIT + 8 }, (_, index) => `window-${index}`)
    for (const requestId of ids) {
      expect(binding.consume({ version: 1, type: "back", requestId })).toBe(true)
    }

    expect(binding.consume({ version: 1, type: "back", requestId: ids[ids.length - 1] })).toBe(false)
    expect(calls).toBe(ids.length)
  })

  test("does not treat an arbitrary requestId as a security capability", () => {
    let calls = 0
    const binding = createBackHandlerBinding({
      consume: () => {
        calls += 1
        return true
      },
    })

    expect(binding.consume({ version: 1, type: "back", requestId: "not-issued-by-native" })).toBe(true)
    expect(calls).toBe(1)
  })
})
