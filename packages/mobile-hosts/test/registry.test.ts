import { describe, expect, test } from "bun:test"
import { createMemoryStorage, HOSTS_STORAGE_KEY } from "../src/storage"
import { HostRegistryError, createHostRegistry, validateTarget } from "../src/registry"
import { createMobileHosts } from "../src/runtime"
import { StubHostKeyVerifier } from "../src/ports"
import type { HostTransport } from "../src/ports"

// All values in this suite are fictional (example.invalid). No real endpoint, no credential
// value anywhere — credential-shaped fields are asserted to be rejected or absent.

const VALID = { name: "work box", target: "deploy@example.invalid:22" }

function openCounter() {
  const calls: string[] = []
  const transport: HostTransport = {
    open: async (input) => {
      calls.push(input.target)
      return { url: "http://127.0.0.1:0" }
    },
  }
  return { calls, transport }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

describe("host registry validation", () => {
  test("empty and whitespace-only names are rejected", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage() })
    expect(() => registry.add({ ...VALID, name: "" })).toThrow(HostRegistryError)
    expect(() => registry.add({ ...VALID, name: "   " })).toThrow(HostRegistryError)
  })

  test("duplicate names are rejected (unique-name rule)", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage() })
    registry.add(VALID)
    expect(() => registry.add({ ...VALID, target: "other@example.invalid" })).toThrow(/duplicate-name/)
    // Uniqueness is enforced case-insensitively.
    expect(() => registry.add({ ...VALID, name: "WORK BOX" })).toThrow(/duplicate-name/)
  })

  test("invalid targets are rejected", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage() })
    expect(() => registry.add({ ...VALID, target: "" })).toThrow(/empty-target/)
    expect(() => registry.add({ ...VALID, target: "not valid host" })).toThrow(/invalid-target/)
    expect(() => registry.add({ ...VALID, target: "user@host:0" })).toThrow(/invalid-target/)
    expect(() => registry.add({ ...VALID, target: "user@host:99999" })).toThrow(/invalid-target/)
    expect(() => registry.add({ ...VALID, target: "user@-host" })).toThrow(/invalid-target/)
    expect(validateTarget("deploy@example.invalid:22")).toBe("deploy@example.invalid:22")
    expect(validateTarget("bare.example.invalid")).toBe("bare.example.invalid")
  })

  test("overlong fields are rejected", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage() })
    expect(() => registry.add({ ...VALID, name: "x".repeat(101) })).toThrow(/name-too-long/)
    expect(() => registry.add({ ...VALID, target: `user@${"h".repeat(600)}` })).toThrow(/target-too-long/)
    expect(() => registry.add({ ...VALID, credentialRef: `mobile-credential:${"x".repeat(600)}` })).toThrow(
      /invalid-credential-ref/,
    )
  })

  test("credential-shaped fields are rejected on input and malformed refs are refused", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage() })
    expect(() => registry.add({ ...VALID, ...( { password: "hunter2" } as object) })).toThrow(/forbidden-field/)
    expect(() => registry.add({ ...VALID, ...( { secret: "x" } as object) })).toThrow(/forbidden-field/)
    expect(() => registry.add({ ...VALID, credentialRef: "sk-live-abc123" })).toThrow(/invalid-credential-ref/)
    expect(() => registry.add({ ...VALID, credentialRef: "basic dXNlcjpwYXNz" })).toThrow(/invalid-credential-ref/)
  })

  test("update keeps id and createdAt, refreshes updatedAt, and validates like add", () => {
    let tick = 0
    const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString()
    const registry = createHostRegistry({ storage: createMemoryStorage(), now: clock })
    const created = registry.add(VALID)
    const second = registry.add({ name: "second", target: "second@example.invalid" })
    const updated = registry.update(created.id, { name: "renamed", target: "deploy2@example.invalid" })
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).not.toBe(created.createdAt)
    expect(updated.name).toBe("renamed")
    expect(() => registry.update("00000000-0000-4000-8000-000000000000", VALID)).toThrow(/not-found/)
    expect(() => registry.update(created.id, { name: "second" })).toThrow(/duplicate-name/)
    expect(() => registry.update(second.id, { name: "renamed" })).toThrow(/duplicate-name/)
    expect(() => registry.update(created.id, { target: "bad target" })).toThrow(/invalid-target/)
  })

  test("update reference semantics: undefined keeps, empty string clears, and clearing reaches storage", () => {
    const storage = createMemoryStorage()
    const registry = createHostRegistry({ storage })
    const created = registry.add({ ...VALID, credentialRef: "mobile-credential:entry-1" })
    expect(registry.get(created.id)?.credentialRef).toBe("mobile-credential:entry-1")

    // undefined keeps the stored value (do-not-change semantics).
    const kept = registry.update(created.id, { name: "renamed", credentialRef: undefined })
    expect(kept.credentialRef).toBe("mobile-credential:entry-1")

    // Empty string clears: the in-memory record AND the persisted payload both lose it.
    const cleared = registry.update(created.id, { credentialRef: "" })
    expect(cleared.credentialRef).toBeUndefined()
    expect(registry.get(created.id)?.credentialRef).toBeUndefined()
    const payload = JSON.parse(storage.getItem(HOSTS_STORAGE_KEY)!) as { hosts: Array<Record<string, unknown>> }
    expect(payload.hosts[0]!["credentialRef"]).toBeUndefined()
    expect(storage.getItem(HOSTS_STORAGE_KEY)).not.toContain("mobile-credential:entry-1")
    // The cleared record keeps its identity and other fields.
    expect(cleared.id).toBe(created.id)
    expect(cleared.name).toBe("renamed")
  })

  test("removing an active (connected) host performs zero transport calls", async () => {
    const { calls, transport } = openCounter()
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      transport,
      // A trusting verifier so the attempt actually reaches the transport.
      hostKey: { verify: async () => ({ action: "trust" as const }) },
    })
    const host = hosts.registry.add(VALID)
    hosts.connect(host.id)
    await flush()
    expect(hosts.stateOf(host.id)).toBe("ready")
    expect(calls.length).toBe(1)
    hosts.remove(host.id)
    expect(hosts.registry.get(host.id)).toBeUndefined()
    expect(calls.length).toBe(1) // no further transport call, no close, no remote signal
    expect(hosts.stateOf(host.id)).toBe("idle")
  })

  test("default verifier is the fail-closed stub: nothing reaches the transport", async () => {
    const { calls, transport } = openCounter()
    const hosts = createMobileHosts({ storage: createMemoryStorage(), transport })
    const host = hosts.registry.add(VALID)
    hosts.connect(host.id)
    await flush()
    // The stub rejects every host, so no connection attempt is ever made.
    expect(StubHostKeyVerifier.verify).toBeDefined()
    expect(calls.length).toBe(0)
    expect(hosts.stateOf(host.id)).toBe("failed")
  })
})

describe("host registry persistence", () => {
  test("round-trips through storage and restores after a restart without credential-shaped fields", () => {
    const storage = createMemoryStorage()
    const first = createHostRegistry({ storage })
    const created = first.add({ ...VALID, credentialRef: "mobile-credential:keystore-entry-1" })
    first.add({ name: "backup", target: "backup@example.invalid" })

    const raw = storage.getItem(HOSTS_STORAGE_KEY) ?? ""
    expect(raw).not.toMatch(/password|secret|token|privatekey|passphrase/i)
    expect(raw).toContain(created.id)
    expect(raw).toContain("mobile-credential:keystore-entry-1")

    // "Restart": a fresh registry over the same storage.
    const second = createHostRegistry({ storage })
    expect(second.list().length).toBe(2)
    const restored = second.get(created.id)
    expect(restored?.name).toBe("work box")
    expect(restored?.target).toBe("deploy@example.invalid:22")
    expect(restored?.credentialRef).toBe("mobile-credential:keystore-entry-1")
    const blob = JSON.stringify(second.list())
    expect(blob).not.toMatch(/password|secret|token|privatekey|passphrase/i)
  })

  test("persisted payload is whitelist-only: extra keys and forbidden keys do not survive a reload", () => {
    const storage = createMemoryStorage()
    const registry = createHostRegistry({ storage })
    const host = registry.add(VALID)
    // Simulate a foreign/legacy writer that smuggled extra fields into the payload.
    const payload = JSON.parse(storage.getItem(HOSTS_STORAGE_KEY)!) as { hosts: Array<Record<string, unknown>> }
    payload.hosts[0]!.displayName = "sneaky"
    payload.hosts[0]!.fingerprint = "aa:bb:cc"
    payload.hosts.push({
      id: "11111111-2222-4333-8444-555555555555",
      name: "poisoned",
      target: "poison@example.invalid",
      password: "hunter2",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(payload))

    const reloaded = createHostRegistry({ storage })
    expect(reloaded.list().length).toBe(1)
    const restoredUnknown = reloaded.get(host.id) as unknown as Record<string, unknown>
    expect(restoredUnknown["displayName"]).toBeUndefined()
    expect(restoredUnknown["fingerprint"]).toBeUndefined()
    // The record carrying a password-shaped field is dropped entirely (fail closed).
    expect(reloaded.list().some((h) => h.name === "poisoned")).toBe(false)
    // The next write persists the sanitized view; the poison payload never resurfaces.
    reloaded.update(host.id, { name: "work box" })
    expect(storage.getItem(HOSTS_STORAGE_KEY)).not.toContain("hunter2")
    expect(storage.getItem(HOSTS_STORAGE_KEY)).not.toContain("sneaky")
  })

  test("duplicate ids in a payload collapse to the first record", () => {
    const storage = createMemoryStorage()
    const duplicated = {
      version: 1,
      hosts: [
        { id: "22222222-3333-4444-8555-666666666666", name: "first", target: "a@example.invalid", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "22222222-3333-4444-8555-666666666666", name: "second", target: "b@example.invalid", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    }
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(duplicated))
    const registry = createHostRegistry({ storage })
    expect(registry.list().length).toBe(1)
    expect(registry.list()[0]?.name).toBe("first")
  })
})
