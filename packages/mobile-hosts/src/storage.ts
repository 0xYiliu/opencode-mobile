// Host registry storage (issue #3): key `opencode-mobile.hosts.v1`.
//
// - The payload is the whitelist-only host list (see ./registry). No credential-shaped
//   field can appear here: the registry rejects them on input and drops them on load.
// - localStorage is a WebView capability reached through the StoragePort seam — the shared
//   layer itself touches no platform API. When storage is unavailable, an in-memory store
//   takes over (records last for the session only, honestly reported to callers via
//   `volatile`).
// - Corrupted JSON falls back to an empty registry (records are user-recreatable; no
//   credential is ever at risk in that payload).
// - Versioned envelope with a migration hook: v1 is the current version; future versions
//   register a migration instead of silently re-reading.

import type { HostRecord } from "./registry"

export const HOSTS_STORAGE_KEY = "opencode-mobile.hosts.v1"

export interface StoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** In-memory storage used when no persistent storage is available. */
export function createMemoryStorage(): StoragePort {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

/** Minimal shape we need from a WebView localStorage. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

const PROBE_KEY = "opencode-mobile.hosts.probe"

/**
 * Wrap a candidate storage (e.g. WebView localStorage) and fall back to memory when the
 * candidate is unavailable, throws, or refuses writes (private mode, quota).
 */
export function safeStorage(candidate?: StorageLike): { storage: StoragePort; volatile: boolean } {
  if (candidate) {
    try {
      candidate.setItem(PROBE_KEY, "1")
      if (candidate.getItem(PROBE_KEY) === "1") {
        candidate.removeItem(PROBE_KEY)
        return { storage: candidate as StoragePort, volatile: false }
      }
    } catch {
      // fall through to memory
    }
  }
  return { storage: createMemoryStorage(), volatile: true }
}

export interface HostsPayload {
  version: number
  hosts: HostRecord[]
}

type Migration = (payload: unknown) => HostsPayload

/** Migration hooks keyed by the version they upgrade FROM. v1 is current; identity hook. */
const MIGRATIONS: Record<number, Migration> = {
  1: (payload) => normalize(payload),
}

function normalize(payload: unknown): HostsPayload {
  const hosts: HostRecord[] = []
  const seen = new Set<string>()
  if (typeof payload === "object" && payload !== null && Array.isArray((payload as { hosts?: unknown })["hosts"])) {
    for (const raw of (payload as { hosts: unknown[] })["hosts"]) {
      const record = sanitizeRecord(raw)
      if (!record) continue
      // Duplicate ids collapse to the first occurrence: the registry keys records by id.
      if (seen.has(record.id)) continue
      seen.add(record.id)
      hosts.push(record)
    }
  }
  return { version: 1, hosts }
}

/**
 * Whitelist sanitizer: keep only id/name/target/credentialRef/createdAt/updatedAt, and only
 * when every kept field has a plausible value. Records carrying forbidden (credential-
 * shaped) keys are dropped entirely — fail closed for persisted data.
 */
export function sanitizeRecord(raw: unknown): HostRecord | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const source = raw as Record<string, unknown>
  for (const key of Object.keys(source)) {
    const lowered = key.toLowerCase()
    if (
      lowered === "password" ||
      lowered === "secret" ||
      lowered === "token" ||
      lowered === "authtoken" ||
      lowered === "privatekey" ||
      lowered === "private_key" ||
      lowered === "passphrase" ||
      lowered === "apikey" ||
      lowered === "api_key" ||
      lowered === "credential"
    ) {
      return undefined
    }
  }
  const id = source["id"]
  const name = source["name"]
  const target = source["target"]
  const createdAt = source["createdAt"]
  const updatedAt = source["updatedAt"]
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof target !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string" ||
    !name ||
    !target ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined
  }
  const record: HostRecord = { id, name, target, createdAt, updatedAt }
  const credentialRef = source["credentialRef"]
  if (typeof credentialRef === "string" && credentialRef) record.credentialRef = credentialRef
  return record
}

/** Load the registry payload; corrupted or foreign data falls back to an empty registry. */
export function loadHosts(storage: StoragePort): HostsPayload {
  let raw: string | null = null
  try {
    raw = storage.getItem(HOSTS_STORAGE_KEY)
  } catch {
    return { version: 1, hosts: [] }
  }
  if (!raw) return { version: 1, hosts: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { version: 1, hosts: [] } // corrupted JSON: start clean
  }
  const version =
    typeof parsed === "object" && parsed !== null && typeof (parsed as { version?: unknown })["version"] === "number"
      ? (parsed as { version: number })["version"]
      : 1
  const migration = MIGRATIONS[version]
  if (!migration) return { version: 1, hosts: [] } // unknown future version: start clean
  try {
    const migrated = migration(parsed)
    return { version: 1, hosts: migrated.hosts }
  } catch {
    return { version: 1, hosts: [] }
  }
}

/** Persist the registry payload (whitelist fields only, via sanitize on write). */
export function saveHosts(storage: StoragePort, hosts: readonly HostRecord[]): void {
  const payload: HostsPayload = {
    version: 1,
    hosts: hosts.map((host) => {
      const record: Record<string, string> = {
        id: host.id,
        name: host.name,
        target: host.target,
        createdAt: host.createdAt,
        updatedAt: host.updatedAt,
      }
      if (host.credentialRef !== undefined) record["credentialRef"] = host.credentialRef
      return record as unknown as HostRecord
    }),
  }
  try {
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Persistence is best-effort this phase; the registry keeps working in memory.
  }
}
