import { formatVaultRef, type CredentialVault } from "./types";
import type { VaultTransport } from "./transport";
/**
 * Private key value envelope (issue #6, decision 0003 §4, option C): a privateKey vault
 * entry's value accepts TWO forms —
 *   1. the bare PEM/OpenSSH key text (issue #4 form, unchanged), or
 *   2. a JSON envelope `{"v":1,"key":"<key text>","passphrase":"<optional>"}`
 *      recognized by the leading `{`; the embedded key MUST pass the PEM BEGIN gate.
 * The passphrase travels inside the same Keystore-encrypted envelope (never a registry
 * field, never a second reference — the three rejected alternatives in decision 0003).
 * FORBIDDEN_INPUT_KEYS is untouched: the envelope lives inside the vault value, the
 * registry layer never sees it.
 */
export interface PrivateKeyEnvelope {
    v: 1;
    key: string;
    passphrase?: string;
}
/**
 * Recognize the JSON envelope form. Returns undefined when the value is NOT an envelope
 * (bare key text — the caller applies the plain PEM gate). Throws VaultError("io") for a
 * value that LOOKS like an envelope but is malformed or carries a key without the PEM
 * BEGIN header — fail closed, never guess.
 */
export declare function parsePrivateKeyEnvelope(value: string): PrivateKeyEnvelope | undefined;
/**
 * The bridge-backed vault. The transport decides availability (handshake captured + acked);
 * this client never fakes it and never falls back to plaintext.
 */
export declare function createVaultClient(transport: VaultTransport): CredentialVault;
/**
 * Adapter to the CredentialResolver port (connection driver). Resolving hands the value to
 * the caller for in-memory use only; entry-level failures (missing/corrupt/unsupported)
 * yield undefined so the connection proceeds into the server's auth path; vault-level
 * unavailability throws and lands the host in the explicit failed state.
 */
export declare function createVaultResolver(vault: CredentialVault): {
    resolve(ref: string): Promise<string | undefined>;
};
export { formatVaultRef };
