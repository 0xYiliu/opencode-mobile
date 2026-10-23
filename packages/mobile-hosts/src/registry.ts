// Host record registry (issue #3): the persisted SSH host inventory.
//
// Storage discipline (AGENTS.md red lines):
// - The persisted payload is whitelist-only: id / name / target / credentialRef / createdAt /
//   updatedAt. Credential-shaped fields (password, secret, token, ...) are rejected on input
//   and dropped when read back — tests lock both directions.
// - credentialRef is a non-secret pointer (see ./credential-ref), not a credential.
// - Deleting a host is a local operation: this layer has no transport reach at all, so a
//   delete can never make a remote call (red line; asserted in tests).

import { createStore } from "solid-js/store"
import { assertValidCredentialRef } from "./credential-ref"
import { isValidHostId, makeHostId } from "./identity"
import type { StoragePort } from "./storage"
import { loadHosts, saveHosts } from "./storage"

export interface HostRecord {
  /** Stable identity: uuid v4, fixed at creation, never rewritten. */
  id: string
  /** Display name, unique across the registry, 1..100 characters after trim. */
  name: string
  /** SSH target, `[user@]host[:port]` shape, at most 500 characters. */
  target: string
  /** Non-secret credential reference (mobile-credential:<id>), optional. */
  credentialRef?: string
  /** ISO-8601 creation timestamp. */
  createdAt: string
  /** ISO-8601 last-update timestamp. */
  updatedAt: string
}

export type HostRecordInput = { name: string; target: string; credentialRef?: string }

export type RegistryErrorCode =
  | "empty-name"
  | "name-too-long"
  | "duplicate-name"
  | "empty-target"
  | "invalid-target"
  | "target-too-long"
  | "invalid-credential-ref"
  | "invalid-id"
  | "not-found"
  | "forbidden-field"
  | "invalid-record"

export class HostRegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    detail?: string,
  ) {
    super(`host registry: ${code}${detail ? ` (${detail})` : ""}`)
    this.name = "HostRegistryError"
  }
}

const NAME_MAX = 100
const TARGET_MAX = 500
const CREDENTIAL_REF_MAX = 500 // belt-and-braces on top of the pattern's own 128-char id

// Exact-match (lowercased) rejection list for input keys. `credentialRef` is allowed and is
// NOT a credential value — see ./credential-ref.
const FORBIDDEN_INPUT_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authtoken",
  "privatekey",
  "private_key",
  "passphrase",
  "apikey",
  "api_key",
  "credential",
])

const TARGET_PATTERN = /^[A-Za-z0-9._~-]+@[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?(:\d{1,5})?$|^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?(:\d{1,5})?$/

/** Validate an SSH target (`[user@]host[:port]`; IPv6 literals are not supported this phase). */
export function validateTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new HostRegistryError("empty-target")
  if (trimmed.length > TARGET_MAX) throw new HostRegistryError("target-too-long")
  if (!TARGET_PATTERN.test(trimmed)) throw new HostRegistryError("invalid-target")
  const port = trimmed.lastIndexOf(":") === -1 ? undefined : trimmed.slice(trimmed.lastIndexOf(":") + 1)
  if (port !== undefined) {
    const n = Number(port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new HostRegistryError("invalid-target")
  }
  return trimmed
}

function validateName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new HostRegistryError("empty-name")
  if (trimmed.length > NAME_MAX) throw new HostRegistryError("name-too-long")
  return trimmed
}

function assertNoForbiddenKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key.toLowerCase())) throw new HostRegistryError("forbidden-field", String(key))
  }
}

function normalizeCredentialRef(input: string | undefined): string | undefined {
  if (input === undefined) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (trimmed.length > CREDENTIAL_REF_MAX) throw new HostRegistryError("invalid-credential-ref")
  assertValidCredentialRef(trimmed) // throws CredentialRefError-shaped values out
  return trimmed
}

function checkShape(record: HostRecord): void {
  if (!isValidHostId(record.id)) throw new HostRegistryError("invalid-id")
  if (typeof record.name !== "string" || !record.name) throw new HostRegistryError("invalid-record", "name")
  if (typeof record.target !== "string" || !record.target) throw new HostRegistryError("invalid-record", "target")
  if (typeof record.createdAt !== "string" || !record.createdAt)
    throw new HostRegistryError("invalid-record", "createdAt")
  if (typeof record.updatedAt !== "string" || !record.updatedAt)
    throw new HostRegistryError("invalid-record", "updatedAt")
}

export interface HostRegistryOptions {
  storage: StoragePort
  /** Injectable clock for tests. Defaults to Date.now ISO timestamps. */
  now?: () => string
}

export function createHostRegistry(options: HostRegistryOptions) {
  const now = options.now ?? (() => new Date().toISOString())
  const [store, setStore] = createStore<{ hosts: HostRecord[] }>({
    hosts: loadHosts(options.storage).hosts,
  })

  const persist = () => saveHosts(options.storage, store.hosts)

  const list = () => store.hosts

  const get = (id: string): HostRecord | undefined => store.hosts.find((host) => host.id === id)

  const findByName = (name: string): HostRecord | undefined =>
    store.hosts.find((host) => host.name.toLowerCase() === name.trim().toLowerCase())

  function assertUniqueName(name: string, exceptId?: string): void {
    const existing = findByName(name)
    if (existing && existing.id !== exceptId) throw new HostRegistryError("duplicate-name", name)
  }

  function add(input: HostRecordInput): HostRecord {
    assertNoForbiddenKeys(input)
    const name = validateName(input.name)
    assertUniqueName(name)
    const target = validateTarget(input.target)
    const credentialRef = normalizeCredentialRef(input.credentialRef)
    const timestamp = now()
    const record: HostRecord = {
      id: makeHostId(),
      name,
      target,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    if (credentialRef !== undefined) record.credentialRef = credentialRef
    setStore("hosts", [...store.hosts, record])
    persist()
    return record
  }

  function update(id: string, patch: Partial<HostRecordInput> & { credentialRef?: string | undefined }): HostRecord {
    const index = store.hosts.findIndex((host) => host.id === id)
    if (index === -1) throw new HostRegistryError("not-found", id)
    assertNoForbiddenKeys(patch)
    const current = store.hosts[index]!
    const name = patch.name !== undefined ? validateName(patch.name) : current.name
    assertUniqueName(name, id)
    const target = patch.target !== undefined ? validateTarget(patch.target) : current.target
    const credentialRef =
      patch.credentialRef !== undefined ? normalizeCredentialRef(patch.credentialRef) : current.credentialRef
    // id and createdAt are never rewritten by an update.
    const next: HostRecord = { ...current, name, target, updatedAt: now() }
    if (credentialRef !== undefined) next.credentialRef = credentialRef
    else delete next.credentialRef
    checkShape(next)
    setStore("hosts", index, next)
    persist()
    return next
  }

  /** Local-only delete. No transport, no network, no remote signal — by construction. */
  function remove(id: string): boolean {
    const index = store.hosts.findIndex((host) => host.id === id)
    if (index === -1) return false
    setStore(
      "hosts",
      store.hosts.filter((host) => host.id !== id),
    )
    persist()
    return true
  }

  return { list, get, add, update, remove }
}

export type HostRegistry = ReturnType<typeof createHostRegistry>
