// SSH host-key fingerprint (issue #6, decision 0003 §3.2) — pure functions over WebCrypto.
//
// Format: `SHA256:<base64_nopad(SHA-256(keyblob))>` — byte-for-byte the output of
// `ssh-keygen -lf` (OpenSSH 7.2+ default display format): base64 WITHOUT padding,
// characters `A–Z a–z 0–9 + /` verbatim. This is the documented OpenSSH representation the
// acceptance calls for; the Kotlin side (android/ .../ssh/) mirrors it with MessageDigest
// and scripts/verify-ssh.ts locks both to fixed vectors.
//
// The fingerprint lives in memory only (never persisted by the registry — red line); the
// persisted host-key records live in the native SshHostKeyStore (filesDir/ssh/known_hosts,
// OpenSSH line format). No platform API: WebCrypto `crypto.subtle.digest` only.

const FINGERPRINT_PREFIX = "SHA256:"

function base64NoPad(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=+$/, "")
}

/** Whether `value` is well-formed `SHA256:<base64_nopad>` (43 chars of base64 for 32 bytes). */
export function isSshFingerprint(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (!value.startsWith(FINGERPRINT_PREFIX)) return false
  const body = value.slice(FINGERPRINT_PREFIX.length)
  if (body.length !== 43) return false // 32 bytes -> ceil(32/3)*4 = 44 chars minus 1 padding
  return /^[A-Za-z0-9+/]+$/.test(body)
}

/**
 * Compute the OpenSSH-documented SHA-256 fingerprint of a raw host key blob (the wire
 * bytes of the key, i.e. what known_hosts stores after the key type). Rejects empty
 * input — a zero-length blob can never be a key.
 */
export async function computeSshFingerprint(keyblob: Uint8Array): Promise<string> {
  if (keyblob.length === 0) throw new Error("ssh fingerprint: empty key blob")
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error("ssh fingerprint: WebCrypto subtle is not available in this runtime")
  const digest = await subtle.digest("SHA-256", keyblob as BufferSource)
  return FINGERPRINT_PREFIX + base64NoPad(new Uint8Array(digest))
}

/** Decode a bare base64 key blob (the trailing field of a known_hosts line) into bytes. */
export function decodeBase64KeyBlob(blob: string): Uint8Array | undefined {
  const trimmed = blob.trim()
  if (!trimmed || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return undefined
  try {
    const binary = atob(trimmed)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return undefined
  }
}
