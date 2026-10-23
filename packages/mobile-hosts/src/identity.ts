// Stable host identity (issue #3, decision D2).
//
// Direct http connections keep the upstream-native identity: the normalized URL itself
// (packages/app/src/runtime/server/registry.tsx `ServerConnection.key`, `Key.make(url)`),
// so a port change is a new identity — we do not change that behavior.
//
// SSH hosts get an identity independent of any tunnel port: `mobile-ssh:<uuid4>`, created
// once and never changed. The upstream extension-key convention is `${extension}:${id}`
// (ServerConnection.Extension), and the upstream health layer re-probes a managed
// extension when its endpoint changes, so a tunnel port change keeps identity, scope,
// session and settings keys intact.

/** The extension name used in upstream extension keys (`${extension}:${id}`). */
export const SSH_EXTENSION = "mobile-ssh"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Host record id: uuid v4. */
export type HostId = string

function randomUUID(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") return cryptoRef.randomUUID()
  // Fallback for runtimes without crypto.randomUUID (still v4-shaped, from getRandomValues).
  const bytes = cryptoRef.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[7] = (bytes[7]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Create a fresh host id (uuid v4). */
export function makeHostId(): HostId {
  return randomUUID()
}

/** Whether `value` is a well-formed uuid v4 host id. */
export function isValidHostId(value: unknown): value is HostId {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

/** The upstream connection key of an SSH host: `mobile-ssh:<uuid>`. Throws on a malformed id. */
export function hostKey(id: HostId): string {
  if (!isValidHostId(id)) throw new Error(`malformed host id: ${String(id)}`)
  return `${SSH_EXTENSION}:${id}`
}

/** Parse an upstream key back to a host id; undefined when it is not one of ours. */
export function parseHostKey(key: string): HostId | undefined {
  const prefix = `${SSH_EXTENSION}:`
  if (!key.startsWith(prefix)) return undefined
  const id = key.slice(prefix.length)
  return isValidHostId(id) ? id : undefined
}

/**
 * Direct connections: the identity key is the normalized URL itself (upstream-native).
 * Normalization mirrors the upstream `normalizeServerUrl`: trim, default the `http://`
 * scheme, strip trailing slashes. A different port therefore yields a different key.
 */
export function normalizeDirectUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, "")
}

/** Direct identity key: the normalized URL (never used for SSH hosts). */
export function directKey(input: string): string | undefined {
  return normalizeDirectUrl(input)
}
