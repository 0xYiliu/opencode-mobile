import { describe, expect, test } from "bun:test"
import { createInProcessVaultEngine } from "../src/vault/transport"
import type { InProcessVaultHandlers } from "../src/vault/transport"
import { MAX_SECRET_BYTES, UnavailableVault, VaultError, formatVaultRef, type VaultEntryMetadata } from "../src/vault/types"
import { generateEnvelopeKey, openEnvelope, sealEnvelope } from "../src/vault/envelope"
import { createVaultClient } from "../src/vault/vault"
import { createMobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A software mirror of the native vault: envelope-crypted map + metadata index (never a value field). */
async function softwareVaultNative() {
  const key = await generateEnvelopeKey()
  const entries = new Map<string, { envelope: Uint8Array; meta: VaultEntryMetadata }>()
  const handlers: InProcessVaultHandlers = {
    handle: async (op, params) => {
      if (op === "put") {
        const kind = params["kind"]
        const value = params["value"]
        const existingId = params["existingId"]
        if (kind !== "password" && kind !== "privateKey") throw new VaultError("io", "unknown kind")
        if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "empty value (native re-check)")
        if (encoder.encode(value).length > MAX_SECRET_BYTES) throw new VaultError("io", "value too large (native re-check)")
        const id = typeof existingId === "string" ? existingId : crypto.randomUUID()
        const envelope = await sealEnvelope(key, id, encoder.encode(value))
        const meta: VaultEntryMetadata = { id, kind, createdAt: "2026-10-24T00:00:00.000Z" }
        entries.set(id, { envelope, meta })
        return formatVaultRef(id)
      }
      if (op === "remove") {
        entries.delete(String(params["id"]))
        return null
      }
      if (op === "get") {
        const entry = entries.get(String(params["id"]))
        if (!entry) return null
        return decoder.decode(await openEnvelope(key, String(params["id"]), entry.envelope))
      }
      if (op === "list") {
        return [...entries.values()].map((e) => ({ ...e.meta }))
      }
      throw new VaultError("io", `unknown op: ${String(op)}`)
    },
  }
  return { engine: createInProcessVaultEngine(handlers), entries }
}

describe("runtime wiring (vault option, credentials accessor, remove linkage)", () => {
  test("runtime defaults to the fail-closed UnavailableVault and exposes it as credentials", () => {
    const hosts = createMobileHosts({ storage: createMemoryStorage() })
    expect(hosts.credentials).toBe(UnavailableVault)
    expect(hosts.credentials.status()).toBe("unavailable")
  })

  test("an injected vault is exposed and backs the default resolver (unavailable -> failed host)", async () => {
    const { engine } = await softwareVaultNative()
    const vault = createVaultClient(engine.client)
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      vault,
      hostKey: { verify: async () => ({ action: "trust" as const }) },
      transport: {
        open: async () => {
          throw new Error("not reached")
        },
      },
    })
    expect(hosts.credentials).toBe(vault)
    const host = hosts.registry.add({ name: "h", target: "user@example.invalid", credentialRef: "mobile-credential:no-bridge-yet" })
    hosts.connect(host.id)
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    // Explicit failure (not a silent no-credential connection): resolver throws unavailable.
    expect(hosts.stateOf(host.id)).toBe("failed")
  })

  test("delete (T14) clears the vault entry; still zero transport calls", async () => {
    const { engine } = await softwareVaultNative()
    const vault = createVaultClient(engine.client)
    engine.native.connect()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    let transportCalls = 0
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      vault,
      hostKey: { verify: async () => ({ action: "trust" as const }) },
      transport: {
        open: async () => {
          transportCalls++
          return { url: "http://127.0.0.1:0" }
        },
      },
    })
    const ref = await vault.put({ kind: "password", value: "t14-secret" })
    const host = hosts.registry.add({ name: "h", target: "user@example.invalid", credentialRef: ref })
    hosts.remove(host.id)
    expect(hosts.registry.get(host.id)).toBeUndefined()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(await vault.list()).toHaveLength(0)
    expect(transportCalls).toBe(0) // T14 red line: delete never touches the transport
  })
})
