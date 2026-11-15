/** Whether `value` is well-formed `SHA256:<base64_nopad>` (43 chars of base64 for 32 bytes). */
export declare function isSshFingerprint(value: unknown): value is string;
/**
 * Compute the OpenSSH-documented SHA-256 fingerprint of a raw host key blob (the wire
 * bytes of the key, i.e. what known_hosts stores after the key type). Rejects empty
 * input — a zero-length blob can never be a key.
 */
export declare function computeSshFingerprint(keyblob: Uint8Array): Promise<string>;
/** Decode a bare base64 key blob (the trailing field of a known_hosts line) into bytes. */
export declare function decodeBase64KeyBlob(blob: string): Uint8Array | undefined;
