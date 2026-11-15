/** Accepted reference shape: `mobile-credential:<id>` with a short identifier. */
export declare const CREDENTIAL_REF_PATTERN: RegExp;
export declare function isValidCredentialRef(value: unknown): value is string;
/** Error thrown when a value that is not a credential reference is stored as one. */
export declare class CredentialRefError extends Error {
    constructor(message?: string);
}
export declare function assertValidCredentialRef(value: string | undefined | null): void;
export interface CredentialResolver {
    /**
     * Resolve a reference to its secret for the current session. Returns undefined when the
     * reference has no resolvable credential. Implementations must hand the result to the
     * caller for in-memory use only; nothing here ever persists.
     */
    resolve(ref: string): Promise<string | undefined>;
}
/**
 * This phase's resolver: every reference is unresolvable (keystore is issue #4 — BLOCKED).
 * It never throws and never fabricates a value.
 */
export declare const NullCredentialResolver: CredentialResolver;
