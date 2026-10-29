import { describe, expect, test } from "bun:test"
import {
  ENVELOPE_MAGIC,
  generateEnvelopeKey,
  importEnvelopeKey,
  openEnvelope,
  sealEnvelope,
} from "../src/vault/envelope"
import { VaultError } from "../src/vault/types"

// All values are synthetic; nothing here is a real credential. These tests lock the
// envelope v1 contract against the real WebCrypto AES-GCM implementation (bun runtime):
// magic+IV+GCM(128-bit tag), AAD bound to the entry id, version and re-bind rejection.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe("envelope v1 round-trip (real WebCrypto AES-GCM + AAD)", () => {
  test("seal/open restores the plaintext and embeds the OPMV1 magic", async () => {
    const key = await generateEnvelopeKey()
    const id = "a2f0c9e1-1111-4222-8333-444455556666"
    const secret = "synthetic-password- dough-not-real-123"
    const envelope = await sealEnvelope(key, id, encoder.encode(secret))
    expect(decoder.decode(envelope.slice(0, ENVELOPE_MAGIC.length))).toBe(ENVELOPE_MAGIC)
    // 5 magic + 12 IV + plaintext length + 16 tag
    expect(envelope.length).toBe(ENVELOPE_MAGIC.length + 12 + encoder.encode(secret).length + 16)
    const plain = await openEnvelope(key, id, envelope)
    expect(decoder.decode(plain)).toBe(secret)
  })

  test("envelopes are non-deterministic (fresh IV per seal)", async () => {
    const key = await generateEnvelopeKey()
    const id = "b2f0c9e1-1111-4222-8333-444455556666"
    const a = await sealEnvelope(key, id, encoder.encode("same-input"))
    const b = await sealEnvelope(key, id, encoder.encode("same-input"))
    expect([...a]).not.toEqual([...b])
  })

  test("imported raw keys open what they sealed (deterministic software engine path)", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const key = await importEnvelopeKey(raw)
    const envelope = await sealEnvelope(key, "entry-1", encoder.encode("value-1"))
    const key2 = await importEnvelopeKey(raw)
    expect(decoder.decode(await openEnvelope(key2, "entry-1", envelope))).toBe("value-1")
  })
})

describe("envelope v1 rejection paths", () => {
  test("re-binding rejected: an envelope sealed for id A fails to open under id B (AAD mismatch -> corrupt)", async () => {
    const key = await generateEnvelopeKey()
    const envelope = await sealEnvelope(key, "mobile-binding-a", encoder.encode("secret-a"))
    let caught: unknown
    try {
      await openEnvelope(key, "mobile-binding-b", envelope)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(VaultError)
    expect((caught as VaultError).code).toBe("corrupt")
  })

  test("version rejected: a foreign magic is unsupported, never force-decrypted", async () => {
    const key = await generateEnvelopeKey()
    const envelope = await sealEnvelope(key, "entry-x", encoder.encode("secret-x"))
    const tampered = new Uint8Array(envelope)
    tampered.set(new TextEncoder().encode("OPMV2"), 0)
    let caught: unknown
    try {
      await openEnvelope(key, "entry-x", tampered)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(VaultError)
    expect((caught as VaultError).code).toBe("unsupported")
  })

  test("truncated and bit-flipped envelopes are corrupt", async () => {
    const key = await generateEnvelopeKey()
    const envelope = await sealEnvelope(key, "entry-y", encoder.encode("secret-y"))
    for (const broken of [envelope.slice(0, 10), envelope.slice(0, 5 + 12)]) {
      await expect(openEnvelope(key, "entry-y", broken)).rejects.toMatchObject({ code: "corrupt" })
    }
    const flipped = new Uint8Array(envelope)
    flipped[flipped.length - 1]! ^= 0x01
    await expect(openEnvelope(key, "entry-y", flipped)).rejects.toMatchObject({ code: "corrupt" })
  })

  test("sealing an empty value is refused at the source", async () => {
    const key = await generateEnvelopeKey()
    await expect(sealEnvelope(key, "entry-z", new Uint8Array(0))).rejects.toMatchObject({ code: "io" })
  })

  test("a wrong key fails GCM authentication as corrupt (never a fabricated plaintext)", async () => {
    const keyA = await generateEnvelopeKey()
    const keyB = await generateEnvelopeKey()
    const envelope = await sealEnvelope(keyA, "entry-w", encoder.encode("secret-w"))
    await expect(openEnvelope(keyB, "entry-w", envelope)).rejects.toMatchObject({ code: "corrupt" })
  })
})
