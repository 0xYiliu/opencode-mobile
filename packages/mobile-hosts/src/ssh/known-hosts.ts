// OpenSSH known_hosts line contract (issue #6, decision 0003 §3.1) — parse/serialize the
// native line format so the TS mirror and the Kotlin SshHostKeyStore agree byte-for-byte
// (interop story: `ssh-keygen -lf` reads what we write).
//
// Ruling (decision 0003 §3.1): the host-key store is a PLAIN app-private file
// (filesDir/ssh/known_hosts), NOT a vault entry — a host key is a trust anchor, not a
// credential; confidentiality is not required and integrity comes from the app-private
// directory. The native line format is kept so the store can be cross-checked with
// OpenSSH tooling.
//
// Honest scope (statically asserted by scripts/verify-ssh.ts):
// - Lines written by this app are `host keytype base64` (or `[host]:port keytype base64`
//   for non-default ports) — single host, no patterns.
// - Hashed hostnames (`|1|…`) are PARSE-RECOGNIZED and reported as such, never produced
//   by the serializer and never matched — plaintext hostnames are recorded honestly in
//   the app-private directory (negative assertion forbids hashed lines in the store).
// - Marked lines (`@revoked`, `@cert-authority`, `@cert-authority` variants) and
//   multi-host/comma pattern lists are outside this app's write surface: the parser
//   classifies them (so a foreign line is never silently re-written) and the matcher
//   ignores them.

export interface KnownHostsEntry {
  /** Hostname as recorded (plaintext; never hashed). For `[host]:port` lines the host without brackets. */
  hostname: string
  /** Explicit non-default port from `[host]:port` lines; undefined for default-port lines. */
  port?: number
  /** SSH key type (e.g. `ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`). */
  keytype: string
  /** Base64 key blob (the trailing field, as written). */
  blob: string
  /** True for lines this app must not rewrite: hashed hostname, markers, pattern lists. */
  foreign: boolean
}

export type KnownHostsParseIssue =
  | { line: number; kind: "hashed-hostname" }
  | { line: number; kind: "marker" }
  | { line: number; kind: "pattern-list" }
  | { line: number; kind: "malformed" }

export interface KnownHostsParseResult {
  entries: KnownHostsEntry[]
  issues: KnownHostsParseIssue[]
}

const KEYTYPE_PATTERN = /^(?:ssh-(?:ed25519|ed448|rsa|dss)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com|rsa-sha2-(?:256|512))$/
const PORT_SUFFIX_PATTERN = /^\[(.+)\]:(\d+)$/

/** One known_hosts line -> entry or classified issue. Comments/blank lines yield undefined. */
export function parseKnownHostsLine(line: string, lineNumber: number): KnownHostsEntry | KnownHostsParseIssue | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return undefined
  const fields = trimmed.split(/\s+/)
  let index = 0
  let marker: string | undefined
  if (fields[0]?.startsWith("@")) {
    marker = fields[0]
    index = 1
  }
  const hostField = fields[index]
  const keytype = fields[index + 1]
  const blob = fields[index + 2]
  if (!hostField || !keytype || !blob || fields.length !== index + 3) {
    return { line: lineNumber, kind: "malformed" }
  }
  if (marker) return { line: lineNumber, kind: "marker" }
  if (hostField.startsWith("|1|")) return { line: lineNumber, kind: "hashed-hostname" }
  if (hostField.includes(",")) return { line: lineNumber, kind: "pattern-list" }
  let hostname = hostField
  let port: number | undefined
  const bracketed = PORT_SUFFIX_PATTERN.exec(hostField)
  if (bracketed) {
    hostname = bracketed[1]!
    const parsedPort = Number(bracketed[2])
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { line: lineNumber, kind: "malformed" }
    }
    port = parsedPort
  }
  if (!KEYTYPE_PATTERN.test(keytype)) return { line: lineNumber, kind: "malformed" }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) return { line: lineNumber, kind: "malformed" }
  return { hostname, port, keytype, blob, foreign: false }
}

/** Parse a whole known_hosts file. Malformed/marked/hashed lines are reported, never dropped silently. */
export function parseKnownHosts(text: string): KnownHostsParseResult {
  const entries: KnownHostsEntry[] = []
  const issues: KnownHostsParseIssue[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseKnownHostsLine(lines[i]!, i + 1)
    if (parsed === undefined) continue
    if ("kind" in parsed) issues.push(parsed)
    else entries.push(parsed)
  }
  return { entries, issues }
}

/**
 * Serialize one entry into the OpenSSH line format: `[host]:port keytype blob` for a
 * non-default port, `host keytype blob` otherwise. Hashed hostnames, markers and pattern
 * lists are never produced here (negative assertion: the store carries no hashed lines).
 */
export function serializeKnownHostsEntry(entry: { hostname: string; port?: number; keytype: string; blob: string }): string {
  const host = entry.port !== undefined && entry.port !== 22 ? `[${entry.hostname}]:${entry.port}` : entry.hostname
  return `${host} ${entry.keytype} ${entry.blob}`
}

/** Serialize a whole entry list (one line each, trailing newline optional per caller). */
export function serializeKnownHosts(entries: ReadonlyArray<{ hostname: string; port?: number; keytype: string; blob: string }>): string {
  return entries.map(serializeKnownHostsEntry).join("\n")
}

/**
 * Match a recorded entry against a target host/port (the lookup the verifier performs;
 * the Kotlin store mirrors it with its own parser). `port` defaults to 22 (OpenSSH
 * semantics: default-port lines are matched by bare hostname).
 */
export function matchesKnownHostsEntry(entry: { hostname: string; port?: number; foreign?: boolean }, host: string, port = 22): boolean {
  if (entry.foreign) return false
  if (entry.hostname !== host) return false
  return (entry.port ?? 22) === port
}

/**
 * Extract the user segment from an SSH target (`[user@]host[:port]`). Undefined when the
 * target carries no user@ (the session then falls back to the SSH client's default user
 * behavior). The username is NOT a credential (issue #7 review B2) — it is a routing
 * fact that must reach the SSH session instead of being dropped here (the pre-B2 bug:
 * `getSession` received the password as the username because the user segment never
 * crossed the bridge).
 */
export function parseSshTargetUser(target: string): string | undefined {
  const trimmed = target.trim()
  const at = trimmed.lastIndexOf("@")
  if (at === -1) return undefined
  const user = trimmed.slice(0, at)
  return user.length > 0 ? user : undefined
}

/** Extract the host[:port] pieces from an SSH target (`[user@]host[:port]`). */
export function parseSshTargetHost(target: string): { host: string; port: number } {
  const trimmed = target.trim()
  const at = trimmed.lastIndexOf("@")
  const hostPart = at === -1 ? trimmed : trimmed.slice(at + 1)
  const colon = hostPart.lastIndexOf(":")
  if (colon === -1) return { host: hostPart, port: 22 }
  const port = Number(hostPart.slice(colon + 1))
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { host: hostPart, port: 22 }
  return { host: hostPart.slice(0, colon), port }
}
