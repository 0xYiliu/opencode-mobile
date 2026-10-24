import { describe, expect, test } from "bun:test"
import { HOSTS_STORAGE_KEY, createMemoryStorage, loadHosts, safeStorage, sanitizeRecord, saveHosts } from "../src/storage"

// All values fictional. The storage layer must degrade honestly: no persistent storage ->
// memory; corrupted JSON -> clean slate; unknown versions -> clean slate via the migration
// hook table.

const GOOD_RECORD = {
  id: "33333333-4444-4555-8666-777777777777",
  name: "work box",
  target: "deploy@example.invalid:22",
  credentialRef: "mobile-credential:keystore-entry-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

function breakingStorage() {
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

describe("storage port", () => {
  test("unavailable candidate storage degrades to volatile memory", () => {
    const probeFails = {
      getItem: () => null,
      setItem: () => {
        throw new Error("private mode")
      },
      removeItem: () => {},
    }
    const fallback = safeStorage(probeFails)
    expect(fallback.volatile).toBe(true)
    fallback.storage.setItem("k", "v")
    expect(fallback.storage.getItem("k")).toBe("v")

    const throwing = safeStorage(breakingStorage())
    expect(throwing.volatile).toBe(true)
    throwing.storage.setItem("k", "v")
    expect(throwing.storage.getItem("k")).toBe("v")

    const healthy = safeStorage(createMemoryStorage())
    expect(healthy.volatile).toBe(false)
    expect(safeStorage(undefined).volatile).toBe(true)
  })

  test("corrupted JSON and non-array payloads fall back to an empty registry", () => {
    const storage = createMemoryStorage()
    storage.setItem(HOSTS_STORAGE_KEY, "{not json at all")
    expect(loadHosts(storage).hosts).toEqual([])
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify({ version: 1, hosts: "nope" }))
    expect(loadHosts(storage).hosts).toEqual([])
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify({ version: 99, hosts: [GOOD_RECORD] }))
    // Unknown future version: no migration registered -> start clean (never guess).
    expect(loadHosts(storage).hosts).toEqual([])
    // getItem throwing is tolerated as empty.
    expect(loadHosts(breakingStorage()).hosts).toEqual([])
  })

  test("v1 migration hook exists and passes records through the whitelist sanitizer", () => {
    const storage = createMemoryStorage()
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify({ version: 1, hosts: [GOOD_RECORD] }))
    const loaded = loadHosts(storage)
    expect(loaded.version).toBe(1)
    expect(loaded.hosts.length).toBe(1)
    expect(loaded.hosts[0]?.name).toBe("work box")
    expect(loaded.hosts[0]?.credentialRef).toBe("mobile-credential:keystore-entry-1")
  })

  test("whitelist sanitizer drops malformed and credential-shaped records", () => {
    expect(sanitizeRecord(GOOD_RECORD)?.id).toBe(GOOD_RECORD.id)
    expect(sanitizeRecord({ ...GOOD_RECORD, extra: "stripped" })).toEqual(GOOD_RECORD)
    expect(sanitizeRecord({ ...GOOD_RECORD, password: "hunter2" })).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, token: "t" })).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, apiKey: "k" })).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, id: 42 })).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, name: "" })).toBeUndefined()
    expect(sanitizeRecord("a string")).toBeUndefined()
    expect(sanitizeRecord(null)).toBeUndefined()
    // credentialRef is optional and stays optional.
    const { credentialRef: _drop, ...withoutRef } = GOOD_RECORD
    expect(sanitizeRecord(withoutRef)?.credentialRef).toBeUndefined()
  })

  test("save/load round-trip preserves the whitelist payload only", () => {
    const storage = createMemoryStorage()
    saveHosts(storage, [
      {
        id: GOOD_RECORD.id,
        name: GOOD_RECORD.name,
        target: GOOD_RECORD.target,
        credentialRef: GOOD_RECORD.credentialRef,
        createdAt: GOOD_RECORD.createdAt,
        updatedAt: GOOD_RECORD.updatedAt,
        // Extra runtime-only fields must not leak into the payload.
        ...({ fingerprint: "aa:bb" } as object),
      },
    ])
    const raw = storage.getItem(HOSTS_STORAGE_KEY)!
    expect(raw).not.toContain("aa:bb")
    const loaded = loadHosts(storage)
    expect(loaded.hosts.length).toBe(1)
    expect(loaded.hosts[0]).toEqual(GOOD_RECORD)
  })

  // F1 (issue #6): servicePort joins the whitelist as an optional integer; the persisted
  // payload round-trips it, invalid shapes are dropped and old payloads without the field
  // take the default path.
  test("servicePort round-trip keeps a valid integer and drops invalid shapes", () => {
    const storage = createMemoryStorage()
    saveHosts(storage, [
      { ...GOOD_RECORD, servicePort: 5051 },
      { ...GOOD_RECORD, id: "44444444-4444-4555-8666-777777777777", name: "default" },
    ] as never)
    const raw = storage.getItem(HOSTS_STORAGE_KEY)!
    expect(raw).toContain("5051")
    const loaded = loadHosts(storage)
    expect(loaded.hosts[0]!.servicePort).toBe(5051)
    expect(loaded.hosts[1]!.servicePort).toBeUndefined()
  })

  test("sanitizeRecord keeps only valid service ports and rejects credential-shaped keys regardless", () => {
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: 8080 })).toEqual({ ...GOOD_RECORD, servicePort: 8080 })
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: 0 })?.servicePort).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: 65536 })?.servicePort).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: 1.5 })?.servicePort).toBeUndefined()
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: "4096" })?.servicePort).toBeUndefined()
    // The field never opens the door to credential-shaped keys.
    expect(sanitizeRecord({ ...GOOD_RECORD, servicePort: 8080, passphrase: "x" })).toBeUndefined()
  })
})
