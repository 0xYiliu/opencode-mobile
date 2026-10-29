import { describe, expect, test } from "bun:test"
import { DEFAULT_SERVICE_PORT, HostRegistryError, createHostRegistry, validateServicePort } from "../src/registry"
import { createMemoryStorage, loadHosts } from "../src/storage"

// servicePort contract (issue #6, F1/F7): the remote OpenCode service port is a whitelist
// payload field — an optional integer 1..65535, default 4096 at the consumer, distinct
// from the SSH port inside `target`. It is NOT credential-shaped (FORBIDDEN_INPUT_KEYS
// untouched); persisted payloads round-trip it; hostile shapes are refused.

const NOW = () => "2026-10-24T00:00:00.000Z"

describe("registry servicePort (issue #6)", () => {
  test("add stores a valid servicePort; the field is optional", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage(), now: NOW })
    const withPort = registry.add({ name: "a", target: "user@example.invalid", servicePort: 8080 })
    expect(withPort.servicePort).toBe(8080)
    // Distinct targets: the registry enforces unique targets (review N5).
    const withoutPort = registry.add({ name: "b", target: "user2@example.invalid" })
    expect(withoutPort.servicePort).toBeUndefined() // default applies at the consumer
    expect(DEFAULT_SERVICE_PORT).toBe(4096)
  })

  test("invalid service ports are refused with a dedicated code", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage(), now: NOW })
    for (const bad of [0, -1, 65536, 1.5, Number.NaN]) {
      expect(() => registry.add({ name: "a", target: "user@example.invalid", servicePort: bad })).toThrow(HostRegistryError)
      try {
        registry.add({ name: "retry", target: "user@example.invalid", servicePort: bad })
      } catch (error) {
        expect((error as HostRegistryError).code).toBe("invalid-service-port")
      }
    }
    expect(() => validateServicePort(70000)).toThrow(HostRegistryError)
    expect(validateServicePort(undefined)).toBeUndefined()
    expect(validateServicePort(1)).toBe(1)
    expect(validateServicePort(65535)).toBe(65535)
  })

  test("update: undefined keeps the stored port, a valid integer replaces it", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage(), now: NOW })
    const host = registry.add({ name: "a", target: "user@example.invalid", servicePort: 4097 })
    registry.update(host.id, { name: "a", target: "user@example.invalid" })
    expect(registry.get(host.id)!.servicePort).toBe(4097)
    registry.update(host.id, { name: "a", target: "user@example.invalid", servicePort: 9000 })
    expect(registry.get(host.id)!.servicePort).toBe(9000)
    registry.update(host.id, { name: "a", target: "user@example.invalid" })
    expect(registry.get(host.id)!.servicePort).toBe(9000)
  })

  test("servicePort round-trips through persistence; old payloads without it still load (F1)", () => {
    const storage = createMemoryStorage()
    const registry = createHostRegistry({ storage, now: NOW })
    const host = registry.add({ name: "a", target: "user@example.invalid", servicePort: 5051 })
    const reloaded = createHostRegistry({ storage, now: NOW })
    expect(reloaded.get(host.id)!.servicePort).toBe(5051)
    // A pre-#6 payload (no servicePort field) loads with the field absent (default path).
    storage.setItem(
      "opencode-mobile.hosts.v1",
      JSON.stringify({
        version: 1,
        hosts: [
          {
            id: "33333333-4444-4555-8666-777777777777",
            name: "legacy",
            target: "user@example.invalid",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    )
    expect(loadHosts(storage).hosts[0]!.servicePort).toBeUndefined()
  })

  test("credential-shaped keys remain forbidden (the envelope lives inside the vault value, not the record)", () => {
    const registry = createHostRegistry({ storage: createMemoryStorage(), now: NOW })
    expect(() => registry.add({ name: "a", target: "user@example.invalid", passphrase: "x" } as never)).toThrow(/forbidden-field/)
    const host = registry.add({ name: "b", target: "user@example.invalid", servicePort: 4096 })
    expect(() =>
      registry.update(host.id, { name: "b", target: "user@example.invalid", privateKey: "x" } as never),
    ).toThrow(/forbidden-field/)
  })
})
