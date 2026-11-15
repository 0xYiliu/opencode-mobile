export declare const ENVELOPE_MAGIC = "OPMV1";
/** Generate a fresh AES-256-GCM envelope key (software engine / tests only; Android keys live in Keystore). */
export declare function generateEnvelopeKey(): Promise<CryptoKey>;
/** Import raw key bytes as an envelope key (deterministic tests / software engine). */
export declare function importEnvelopeKey(raw: Uint8Array): Promise<CryptoKey>;
/** Seal a plaintext under the entry id. Returns magic || iv || ciphertext+tag. */
export declare function sealEnvelope(key: CryptoKey, id: string, plaintext: Uint8Array): Promise<Uint8Array>;
/** Open an envelope for the entry id. Corrupt/unsupported shapes throw VaultError, never fabricate. */
export declare function openEnvelope(key: CryptoKey, id: string, envelope: Uint8Array): Promise<Uint8Array>;
