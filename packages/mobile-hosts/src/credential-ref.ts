// Credential reference model (issue #3, decision D3).
//
// A credentialRef is a NON-SECRET POINTER to a credential entry, never a credential value.
// It is allowed inside persisted payloads (registry whitelist, http.credentialRef via
// M-005) because it does not decode to anything without the keystore, which is issue #4.
// Resolution results are injected into in-memory connection objects only — never written
// back to any persisted store.

/** Accepted reference shape: `mobile-credential:<id>` with a short identifier. */
export const CREDENTIAL_REF_PATTERN = /^mobile-credential:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function isValidCredentialRef(value: unknown): value is string {
  return typeof value === "string" && CREDENTIAL_REF_PATTERN.test(value)
}

/** Error thrown when a value that is not a credential reference is stored as one. */
export class CredentialRefError extends Error {
  constructor(message = "credential reference: invalid-credential-ref (expected mobile-credential:<id>)") {
    super(message)
    this.name = "CredentialRefError"
  }
}

export function assertValidCredentialRef(value: string | undefined | null): void {
  if (value === undefined || value === null) return
  if (!isValidCredentialRef(value)) throw new CredentialRefError()
}

export interface CredentialResolver {
  /**
   * Resolve a reference to its secret for the current session. Returns undefined when the
   * reference has no resolvable credential. Implementations must hand the result to the
   * caller for in-memory use only; nothing here ever persists.
   */
  resolve(ref: string): Promise<string | undefined>
}

/**
 * This phase's resolver: every reference is unresolvable (keystore is issue #4 — BLOCKED).
 * It never throws and never fabricates a value.
 */
export const NullCredentialResolver: CredentialResolver = {
  resolve: async () => undefined,
}
