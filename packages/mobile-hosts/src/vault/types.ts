// Credential vault port (issue #4, decision D2).
//
// A CredentialVault stores credential VALUES encrypted at rest and hands them out for
// in-memory use only. Nothing in this module touches a platform API: the Android Keystore
// and file layout live behind the bridge (android/ .../vault/), the web side only speaks
// the JSON message protocol (see ./transport). Red lines locked here and in tests:
// - Values never persist anywhere except the vault's own encrypted envelope (AGENTS.md).
// - No extra unlock: no user-authentication binding anywhere in the contract.
// - Unavailable is an explicit state, never a silent downgrade to plaintext.

import { isValidCredentialRef } from "../credential-ref"

/** Kinds of credential the vault can hold. */
export type VaultKind = "password" | "privateKey"

/** Vault availability: an explicit status, never inferred. */
export type VaultStatus = "unavailable" | "available"

/**
 * Error taxonomy (docs/design/units/connection.md 失效矩阵):
 * - unavailable: bridge handshake not acked / retries exhausted / non-Android shell.
 * - corrupt: envelope damaged, GCM authentication failed, AAD (entry id) mismatch.
 * - unsupported: envelope version not recognized (a future envelope).
 * - io: native keystore/filesystem failures and client-side invalid input.
 */
export type VaultErrorCode = "unavailable" | "corrupt" | "unsupported" | "io"

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message?: string,
  ) {
    super(message ?? `credential vault: ${code}`)
    this.name = "VaultError"
  }
}

/** Metadata-only view of a stored entry. NEVER carries a value field. */
export interface VaultEntryMetadata {
  id: string
  kind: VaultKind
  label?: string
  createdAt: string
}

export interface VaultPutInput {
  kind: VaultKind
  /** The secret. Non-empty, at most MAX_SECRET_BYTES UTF-8 bytes; never logged, never persisted raw. */
  value: string
  /** Optional display label (non-secret). */
  label?: string
  /**
   * In-place update: overwrite the entry this reference points at while keeping its id
   * (the ref stays stable across a re-save, including the corrupt-entry healing path).
   */
  existingRef?: string
}

export interface CredentialVault {
  /** Reactive-friendly status read (backed by a solid signal in the bridge client). */
  status(): VaultStatus
  /** Encrypt and store; resolves with the `mobile-credential:<id>` reference. */
  put(input: VaultPutInput): Promise<string>
  /** Delete an entry. Unknown ids resolve silently (idempotent; delete races are harmless). */
  remove(ref: string): Promise<void>
  /** Decrypt to memory. Missing / corrupt / unsupported entries yield undefined; a vault-level failure throws. */
  get(ref: string): Promise<string | undefined>
  /** Metadata list only. Implementations must never include a value field. */
  list(): Promise<VaultEntryMetadata[]>
}

/** Application-chosen size bound for a credential value (JS pre-check + native re-check). */
export const MAX_SECRET_BYTES = 65536

const REF_PREFIX = "mobile-credential:"

/** Parse a valid reference into its entry id; undefined when the shape is wrong. */
export function parseVaultRef(ref: string): string | undefined {
  if (!isValidCredentialRef(ref)) return undefined
  return ref.slice(REF_PREFIX.length)
}

/** Build a reference from an entry id (assumes an id that satisfies the ref pattern). */
export function formatVaultRef(id: string): string {
  return `${REF_PREFIX}${id}`
}

/**
 * The fail-closed default: every operation reports `unavailable`. Injected until the
 * Android shell wires the bridge client (M-007 amendment) — the explicit state makes the
 * absence of the vault visible instead of degrading to plaintext anywhere.
 */
export const UnavailableVault: CredentialVault = {
  status: () => "unavailable",
  put: async () => {
    throw new VaultError("unavailable")
  },
  remove: async () => {
    throw new VaultError("unavailable")
  },
  get: async () => {
    throw new VaultError("unavailable")
  },
  list: async () => {
    throw new VaultError("unavailable")
  },
}
