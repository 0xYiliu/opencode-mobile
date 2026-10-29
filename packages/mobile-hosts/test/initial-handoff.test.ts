import { describe, expect, test } from "bun:test"
import { canHandoffInitialSsh, canStartInitialSshAttempt, shouldSelectCreatedSshHost } from "../src/initial-handoff"

const ready = {
  activeMode: true,
  formOpen: false,
  ownerActive: true,
  ownerHostId: "mobile-ssh:host-a",
  hostId: "mobile-ssh:host-a",
  ownerGeneration: 8,
  currentGeneration: 8,
  state: "ready" as const,
  serviceAuthenticated: true,
}

describe("initial SSH handoff gate", () => {
  test("a late form completion cannot auto-connect after switching away or replacing owner", () => {
    expect(canStartInitialSshAttempt({ activeMode: true, ownerActive: true, ownerGeneration: 8, currentGeneration: 8 })).toBe(true)
    expect(canStartInitialSshAttempt({ activeMode: false, ownerActive: true, ownerGeneration: 8, currentGeneration: 8 })).toBe(false)
    expect(canStartInitialSshAttempt({ activeMode: true, ownerActive: true, ownerGeneration: 8, currentGeneration: 9 })).toBe(false)
    expect(canStartInitialSshAttempt({ activeMode: true, ownerActive: false, ownerGeneration: 8, currentGeneration: 8 })).toBe(false)
  })

  test("a save that finishes off-mode stays selectable but cannot connect", () => {
    const completion = { activeMode: false, ownerActive: true, ownerGeneration: 8, currentGeneration: 8 }
    expect(shouldSelectCreatedSshHost(completion)).toBe(true)
    expect(canStartInitialSshAttempt(completion)).toBe(false)
    expect(shouldSelectCreatedSshHost({ ...completion, activeMode: true, ownerGeneration: 7 })).toBe(false)
  })

  test("only the active exact ready authenticated owner may hand off", () => {
    expect(canHandoffInitialSsh(ready)).toBe(true)
    expect(canHandoffInitialSsh({ ...ready, formOpen: true })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, activeMode: false })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, ownerHostId: "mobile-ssh:host-b" })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, hostId: "mobile-ssh:host-b" })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, currentGeneration: 9 })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, state: "failed" })).toBe(false)
    expect(canHandoffInitialSsh({ ...ready, serviceAuthenticated: false })).toBe(false)
  })
})
