import { describe, expect, test } from "bun:test"
import { directKey, hostKey, isValidHostId, makeHostId, normalizeDirectUrl, parseHostKey, SSH_EXTENSION } from "../src/identity"

// All values in this suite are fictional (example.invalid / loopback documentation hosts).

describe("host identity", () => {
  test("uuid ids are unique and v4-shaped", () => {
    const ids = new Set(Array.from({ length: 500 }, () => makeHostId()))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(isValidHostId(id)).toBe(true)
    expect(isValidHostId("not-a-uuid")).toBe(false)
    expect(isValidHostId(42)).toBe(false)
    expect(isValidHostId(undefined)).toBe(false)
  })

  test("SSH host keys are mobile-ssh:<uuid> and round-trip", () => {
    const id = makeHostId()
    const key = hostKey(id)
    expect(key.startsWith(`${SSH_EXTENSION}:`)).toBe(true)
    expect(parseHostKey(key)).toBe(id)
    expect(parseHostKey("http://example.invalid")).toBeUndefined()
    expect(parseHostKey("mobile-ssh:not-a-uuid")).toBeUndefined()
    expect(() => hostKey("not-a-uuid")).toThrow()
  })

  test("direct identity is the normalized URL; a different port is a different identity", () => {
    expect(normalizeDirectUrl(" example.invalid:4096/ ")).toBe("http://example.invalid:4096")
    expect(normalizeDirectUrl("https://example.invalid:4096/")).toBe("https://example.invalid:4096")
    expect(directKey("https://example.invalid:4096")).toBe("https://example.invalid:4096")
    expect(directKey("")).toBeUndefined()
    // Upstream-native semantics: the port is part of the direct identity.
    expect(directKey("https://example.invalid:4096")).not.toBe(directKey("https://example.invalid:5096"))
  })

  test("SSH identity is decoupled from the tunnel port: same id, same key, any endpoint port", () => {
    const id = makeHostId()
    // The key never encodes a port or target — it is the uuid only.
    expect(hostKey(id)).toBe(hostKey(id))
    expect(hostKey(id)).not.toContain("4096")
    expect(hostKey(id)).not.toContain("example.invalid")
  })
})
