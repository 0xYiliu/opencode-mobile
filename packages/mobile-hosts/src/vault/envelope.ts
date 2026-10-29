// Credential envelope v1 (issue #4, decision D2) — the wire/disk format of one stored secret.
//
// Layout: "OPMV1" magic (5 bytes; the magic doubles as the version) || 12-byte random IV ||
// AES-256-GCM ciphertext with a 128-bit authentication tag appended by WebCrypto.
// AAD = the entry id (UTF-8). Consequences locked by tests:
// - Re-binding rejection: an envelope sealed for id A cannot be opened with id B's AAD
//   (GCM authentication fails -> corrupt).
// - Version rejection: a magic other than OPMV1 -> unsupported.
// The Kotlin side (android/ .../vault/VaultCrypto.kt) mirrors this layout byte-for-byte
// with its AndroidKeyStore key; this module is the TS mirror used by tests and the software
// engine. Pure functions over WebCrypto — no solid, no DOM, no platform API.

import { VaultError } from "./types"

export const ENVELOPE_MAGIC = "OPMV1"
const IV_BYTES = 12
const TAG_BITS = 128
const HEADER_BYTES = ENVELOPE_MAGIC.length + IV_BYTES
const MIN_ENVELOPE_BYTES = HEADER_BYTES + TAG_BITS / 8

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function assertCryptoAvailable(): void {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new VaultError("io", "WebCrypto subtle is not available in this runtime")
}

/** Generate a fresh AES-256-GCM envelope key (software engine / tests only; Android keys live in Keystore). */
export async function generateEnvelopeKey(): Promise<CryptoKey> {
  assertCryptoAvailable()
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
}

/** Import raw key bytes as an envelope key (deterministic tests / software engine). */
export async function importEnvelopeKey(raw: Uint8Array): Promise<CryptoKey> {
  assertCryptoAvailable()
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
}

/** Seal a plaintext under the entry id. Returns magic || iv || ciphertext+tag. */
export async function sealEnvelope(key: CryptoKey, id: string, plaintext: Uint8Array): Promise<Uint8Array> {
  assertCryptoAvailable()
  if (plaintext.length === 0) throw new VaultError("io", "refusing to seal an empty credential value")
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(id) as BufferSource, tagLength: TAG_BITS },
    key,
    plaintext as BufferSource,
  )
  const envelope = new Uint8Array(ENVELOPE_MAGIC.length + IV_BYTES + cipher.byteLength)
  envelope.set(encoder.encode(ENVELOPE_MAGIC), 0)
  envelope.set(iv, ENVELOPE_MAGIC.length)
  envelope.set(new Uint8Array(cipher), ENVELOPE_MAGIC.length + IV_BYTES)
  return envelope
}

/** Open an envelope for the entry id. Corrupt/unsupported shapes throw VaultError, never fabricate. */
export async function openEnvelope(key: CryptoKey, id: string, envelope: Uint8Array): Promise<Uint8Array> {
  assertCryptoAvailable()
  if (envelope.length < MIN_ENVELOPE_BYTES) throw new VaultError("corrupt", "envelope shorter than the v1 header")
  const magic = decoder.decode(envelope.slice(0, ENVELOPE_MAGIC.length))
  if (magic !== ENVELOPE_MAGIC) throw new VaultError("unsupported", `envelope magic ${JSON.stringify(magic)} is not ${ENVELOPE_MAGIC}`)
  const iv = envelope.slice(ENVELOPE_MAGIC.length, ENVELOPE_MAGIC.length + IV_BYTES)
  const cipher = envelope.slice(HEADER_BYTES)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(id) as BufferSource, tagLength: TAG_BITS },
      key,
      cipher as BufferSource,
    )
    return new Uint8Array(plain)
  } catch {
    // GCM authentication failure: wrong key, tampered bytes, or an AAD mismatch (re-bind).
    throw new VaultError("corrupt", "envelope failed GCM authentication (wrong key, tamper or re-bind)")
  }
}
