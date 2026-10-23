import { describe, expect, test } from "bun:test"
import { CREDENTIAL_REF_PATTERN, CredentialRefError, NullCredentialResolver, assertValidCredentialRef, isValidCredentialRef } from "../src/credential-ref"
import { createMobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"
import type { CredentialResolver } from "../src/credential-ref"

// All values are fictional. A credential reference is a POINTER, never a credential value;
// these tests lock the format boundary and the memory-only resolution contract.

describe("credential reference format", () => {
  test("accepts mobile-credential:<id> shapes", () => {
    expect(isValidCredentialRef("mobile-credential:keystore-entry-1")).toBe(true)
    expect(isValidCredentialRef("mobile-credential:ab_01.Z")).toBe(true)
    expect(CREDENTIAL_REF_PATTERN.test("mobile-credential:a")).toBe(true)
  })

  test("rejects credential-shaped and malformed values", () => {
    for (const value of [
      "",
      "mobile-credential:",
      "sk-live-abc123",
      "password123",
      "basic dXNlcjpwYXNz",
      "hunter2",
      "https://user:pass@example.invalid",
      "mobile-credential:has space",
      "mysecret",
      undefined,
      42,
    ]) {
      expect(isValidCredentialRef(value)).toBe(false)
    }
    expect(() => assertValidCredentialRef("hunter2")).toThrow(CredentialRefError)
    expect(() => assertValidCredentialRef(undefined)).not.toThrow()
    expect(() => assertValidCredentialRef("mobile-credential:ok-1")).not.toThrow()
  })
})

describe("credential resolution", () => {
  test("NullCredentialResolver always yields undefined and never throws", async () => {
    expect(await NullCredentialResolver.resolve("mobile-credential:whatever")).toBeUndefined()
    expect(await NullCredentialResolver.resolve("")).toBeUndefined()
  })

  test("a failing resolver lands the host in failed, which stays actionable", async () => {
    const failing: CredentialResolver = {
      resolve: async () => {
        throw new Error("keystore unavailable")
      },
    }
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      resolver: failing,
      hostKey: { verify: async () => ({ action: "trust" as const }) },
    })
    const host = hosts.registry.add({
      name: "h",
      target: "user@example.invalid",
      credentialRef: "mobile-credential:missing-entry",
    })
    hosts.connect(host.id)
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    expect(hosts.stateOf(host.id)).toBe("failed")
    // Actionable recovery: the host can be deleted (local-only) and the record edited.
    expect(() => hosts.registry.update(host.id, { name: "renamed" })).not.toThrow()
    hosts.remove(host.id)
    expect(hosts.registry.get(host.id)).toBeUndefined()
  })

  test("resolution results never reach storage: memory-only contract", async () => {
    let resolved: string | undefined
    const recording: CredentialResolver = {
      resolve: async (ref) => {
        resolved = "in-memory-secret-for-" + ref
        return resolved
      },
    }
    const storage = createMemoryStorage()
    const hosts = createMobileHosts({
      storage,
      resolver: recording,
      hostKey: { verify: async () => ({ action: "trust" as const }) },
    })
    const host = hosts.registry.add({
      name: "h",
      target: "user@example.invalid",
      credentialRef: "mobile-credential:entry-9",
    })
    hosts.connect(host.id)
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    expect(resolved).toContain("in-memory-secret")
    const blob = storage.getItem("opencode-mobile.hosts.v1") ?? ""
    expect(blob).not.toContain("in-memory-secret")
    expect(blob).not.toMatch(/secret|password|token/i)
    expect(hosts.registry.get(host.id)?.credentialRef).toBe("mobile-credential:entry-9")
  })
})
