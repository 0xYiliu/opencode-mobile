import { describe, expect, test } from "bun:test"
import { VaultError, formatVaultRef, MAX_SECRET_BYTES } from "../src/vault/types"
import { createVaultClient, parsePrivateKeyEnvelope } from "../src/vault/vault"
import { createInProcessVaultEngine } from "../src/vault/transport"
import type { InProcessVaultHandlers } from "../src/vault/transport"

// Private key value envelope dual form (issue #6, decision 0003 §4 option C): a
// privateKey vault entry holds EITHER bare key text (issue #4 form) OR the JSON envelope
// {"v":1,"key":...,"passphrase":...} — the passphrase travels inside the same
// Keystore-encrypted envelope, never a registry field. The leading `{` selects the form;
// the embedded key must pass the same PEM BEGIN gate as a bare key. Synthetic values only.



/** Synthetic PEM, split-joined like the issue #4 fixtures (leak-scan discipline). */
const PEM_KEY = ["-----BEGIN ", "PRIVATE KEY-----", "\nMIIBsynthetic\n", "-----END ", "PRIVATE KEY-----", "\n"].join("")

describe("parsePrivateKeyEnvelope (dual form recognition)", () => {
  test("bare key text is NOT an envelope (undefined); the caller applies the plain PEM gate", () => {
    expect(parsePrivateKeyEnvelope(PEM_KEY)).toBeUndefined()
  })

  test("envelope without passphrase is recognized and carries the key", () => {
    const envelope = parsePrivateKeyEnvelope(JSON.stringify({ v: 1, key: PEM_KEY }))
    expect(envelope).toEqual({ v: 1, key: PEM_KEY })
  })

  test("envelope with a passphrase keeps both (same Keystore-encrypted value)", () => {
    const envelope = parsePrivateKeyEnvelope(JSON.stringify({ v: 1, key: PEM_KEY, passphrase: "synthetic-pass" }))
    expect(envelope).toEqual({ v: 1, key: PEM_KEY, passphrase: "synthetic-pass" })
  })

  test("malformed envelopes fail closed (io), never guess", () => {
    expect(() => parsePrivateKeyEnvelope("{not json")).toThrow(VaultError)
    expect(() => parsePrivateKeyEnvelope('{"v":2,"key":"x"}')).toThrow(/version/)
    expect(() => parsePrivateKeyEnvelope('{"v":1}')).toThrow(/no key/)
    expect(() => parsePrivateKeyEnvelope(JSON.stringify({ v: 1, key: "no pem header" }))).toThrow(/BEGIN PRIVATE KEY/)
    expect(() => parsePrivateKeyEnvelope(JSON.stringify({ v: 1, key: PEM_KEY, passphrase: "" }))).toThrow(/passphrase/)
    expect(() => parsePrivateKeyEnvelope(JSON.stringify({ v: 1, key: PEM_KEY, passphrase: 42 }))).toThrow(/passphrase/)
    expect(() => parsePrivateKeyEnvelope('{"v":1,"key":42}')).toThrow(/no key/)
    // Only a leading `{` selects the envelope form: other non-PEM text is simply "not an
    // envelope" (the caller's plain PEM gate rejects it).
    expect(parsePrivateKeyEnvelope('["v",1]')).toBeUndefined()
    expect(parsePrivateKeyEnvelope("plain text")).toBeUndefined()
  })
})

describe("vault put with the envelope form (client-side gate)", () => {
  async function softwareVault() {
    const entries = new Map<string, string>()
    const handlers: InProcessVaultHandlers = {
      handle: async (op, params) => {
        if (op === "put") {
          const value = params["value"]
          if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "empty value (native re-check)")
          if (new TextEncoder().encode(value).length > MAX_SECRET_BYTES) throw new VaultError("io", "too large")
          const id = typeof params["existingId"] === "string" ? params["existingId"]
            : typeof params["candidateId"] === "string" ? params["candidateId"] : crypto.randomUUID()
          entries.set(id, value)
          return formatVaultRef(id)
        }
        if (op === "get") return entries.get(String(params["id"])) ?? null
        if (op === "remove") {
          entries.delete(String(params["id"]))
          return null
        }
        if (op === "list") return [...entries.keys()].map((id) => ({ id, kind: "privateKey", createdAt: "2026-10-24T00:00:00.000Z" }))
        throw new VaultError("io", "unknown op")
      },
    }
    const engine = createInProcessVaultEngine(handlers)
    engine.native.connect() // capture + ack: the client reports available
    return { client: createVaultClient(engine.client), entries }
  }

  test("bare PEM still accepted (issue #4 form unbroken)", async () => {
    const { client } = await softwareVault()
    const ref = await client.put({ kind: "privateKey", value: PEM_KEY })
    expect(ref).toStartWith("mobile-credential:")
  })

  test("envelope form accepted with and without passphrase", async () => {
    const { client, entries } = await softwareVault()
    await client.put({ kind: "privateKey", value: JSON.stringify({ v: 1, key: PEM_KEY }) })
    const envelopeWithPass = JSON.stringify({ v: 1, key: PEM_KEY, passphrase: "synthetic-pass" })
    const ref = await client.put({ kind: "privateKey", value: envelopeWithPass })
    const stored = entries.get(ref.slice("mobile-credential:".length))!
    expect(await client.get(ref)).toBe(envelopeWithPass) // the vault is value-opaque; envelope round-trips as-is
    expect(stored).toContain("passphrase") // the passphrase lives inside the same encrypted value
  })

  test("envelope with a non-PEM key is refused at the client gate (smuggling path closed)", async () => {
    const { client } = await softwareVault()
    await expect(client.put({ kind: "privateKey", value: JSON.stringify({ v: 1, key: "raw bytes" }) })).rejects.toThrow(/BEGIN PRIVATE KEY/)
  })

  test("bare text without the PEM header is still refused", async () => {
    const { client } = await softwareVault()
    await expect(client.put({ kind: "privateKey", value: "just text" })).rejects.toThrow(/BEGIN PRIVATE KEY/)
  })
})
