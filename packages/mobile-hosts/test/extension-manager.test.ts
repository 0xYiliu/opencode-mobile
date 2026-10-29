import { describe, expect, test } from "bun:test"
import { createMemoryStorage } from "../src/storage"
import {
  GUIEXT_STORAGE_KEY,
  createExtensionDisabledStore,
  isValidExtensionId,
  loadGuiext,
  mergeDisabledRecords,
  normalizeGuiextPayload,
  parseGuiext,
  saveGuiext,
} from "../src/extensions/manager"

// Issue #26: device-local GUI extension disable records (`opencode-mobile.guiext.v1`).
// All values fictional. The record layer must degrade honestly: no persistent storage ->
// memory (volatile reported); corrupted JSON / unknown versions / bad id shapes -> clean
// slate; merge filters to CURRENT definition ids so renamed-away ids self-heal.

const DEFINITIONS = ["context", "btw", "debug", "terminal", "file", "review", "details", "browser", "pairing", "updater", "ssh", "microsoft-office"]

function blockingStorage() {
  return {
    getItem: () => {
      throw new Error("storage blocked")
    },
    setItem: () => {
      throw new Error("storage blocked")
    },
    removeItem: () => {
      throw new Error("storage blocked")
    },
  }
}

describe("guiext payload normalization", () => {
  test("keeps valid unique ids and drops every other shape", () => {
    const payload = normalizeGuiextPayload({
      version: 1,
      disabled: ["terminal", "review", "terminal", "", "Terminal", "with space", "ok-id.two", 42, null, { id: "x" }],
    })
    expect(payload).toEqual({ version: 1, disabled: ["terminal", "review", "ok-id.two"] })
  })

  test("caps the list and rejects invalid id shapes", () => {
    expect(isValidExtensionId("microsoft-office")).toBe(true)
    expect(isValidExtensionId("wsl")).toBe(true)
    expect(isValidExtensionId("")).toBe(false)
    expect(isValidExtensionId("Terminal")).toBe(false)
    expect(isValidExtensionId("has space")).toBe(false)
    expect(isValidExtensionId("-leading")).toBe(false)
    expect(isValidExtensionId("a".repeat(65))).toBe(false)

    const overflow = Array.from({ length: 100 }, (_, i) => `ext-${i}`)
    expect(normalizeGuiextPayload({ version: 1, disabled: overflow }).disabled.length).toBe(64)
  })

  test("parse degrades honestly on corrupted JSON, wrong versions and foreign shapes", () => {
    expect(parseGuiext(null)).toEqual({ version: 1, disabled: [] })
    expect(parseGuiext("not json {")).toEqual({ version: 1, disabled: [] })
    expect(parseGuiext('{"version":2,"disabled":["terminal"]}')).toEqual({ version: 1, disabled: [] })
    expect(parseGuiext('{"version":1,"disabled":"terminal"}')).toEqual({ version: 1, disabled: [] })
    expect(parseGuiext('{"version":1,"disabled":["terminal"]}')).toEqual({ version: 1, disabled: ["terminal"] })
  })

  test("loadGuiext survives a throwing storage port", () => {
    expect(loadGuiext(blockingStorage() as never)).toEqual({ version: 1, disabled: [] })
  })
})

describe("guiext merge (definitions filter, rename self-heal)", () => {
  test("keeps only ids still present in the definition set, deduplicated", () => {
    expect(mergeDisabledRecords(["terminal", "summary", "terminal", "review"], DEFINITIONS)).toEqual(["terminal", "review"])
  })

  test("an unknown id (renamed-away extension) drops instead of disabling nothing", () => {
    expect(mergeDisabledRecords(["oldname"], ["context", "details"])).toEqual([])
    expect(mergeDisabledRecords([], DEFINITIONS)).toEqual([])
  })
})

describe("guiext store round-trip and volatile reporting", () => {
  test("toggle persists under the versioned key and reads back", () => {
    const storage = createMemoryStorage()
    const store = createExtensionDisabledStore(storage)
    expect(store.volatile()).toBe(false)
    expect(store.ids()).toEqual([])

    store.toggle("terminal", true)
    store.toggle("review", true)
    expect(store.ids().toSorted()).toEqual(["review", "terminal"])
    expect(JSON.parse(storage.getItem(GUIEXT_STORAGE_KEY)!)).toEqual({ version: 1, disabled: ["terminal", "review"] })

    // Re-enable drops the id from the persisted payload too.
    store.toggle("terminal", false)
    expect(store.ids()).toEqual(["review"])
    expect(JSON.parse(storage.getItem(GUIEXT_STORAGE_KEY)!)).toEqual({ version: 1, disabled: ["review"] })

    // A fresh store over the same storage sees the persisted records.
    expect(createExtensionDisabledStore(storage).ids()).toEqual(["review"])
  })

  test("unavailable persistence degrades to volatile memory-only records", () => {
    const store = createExtensionDisabledStore(blockingStorage() as never)
    expect(store.volatile()).toBe(true)
    store.toggle("terminal", true)
    expect(store.ids()).toEqual(["terminal"])
    expect(saveGuiext.length).toBe(2) // save is best-effort; a throwing port must not throw through toggle
  })

  test("saveGuiext swallows storage failures (best-effort persistence)", () => {
    // Must not throw; the in-memory signal stays authoritative.
    saveGuiext(blockingStorage() as never, ["terminal"])
  })
})
