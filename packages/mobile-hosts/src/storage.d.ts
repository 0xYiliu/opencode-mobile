import type { HostRecord } from "./registry";
export declare const HOSTS_STORAGE_KEY = "opencode-mobile.hosts.v1";
export interface StoragePort {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** In-memory storage used when no persistent storage is available. */
export declare function createMemoryStorage(): StoragePort;
/** Minimal shape we need from a WebView localStorage. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/**
 * Wrap a candidate storage (e.g. WebView localStorage) and fall back to memory when the
 * candidate is unavailable, throws, or refuses writes (private mode, quota).
 */
export declare function safeStorage(candidate?: StorageLike): {
    storage: StoragePort;
    volatile: boolean;
};
export interface HostsPayload {
    version: number;
    hosts: HostRecord[];
}
/**
 * Whitelist sanitizer: keep only id/name/target/credentialRef/createdAt/updatedAt (+ the
 * issue #6 `servicePort` when it is a valid port integer), and only when every kept
 * required field has a plausible value. Records carrying forbidden (credential-shaped)
 * keys are dropped entirely — fail closed for persisted data. An absent or invalid
 * servicePort takes the default path (the consumer applies DEFAULT_SERVICE_PORT); the
 * field is optional and never credential-shaped.
 */
export declare function sanitizeRecord(raw: unknown): HostRecord | undefined;
/** Load the registry payload; corrupted or foreign data falls back to an empty registry. */
export declare function loadHosts(storage: StoragePort): HostsPayload;
/** Persist the registry payload (whitelist fields only, via sanitize on write). */
export declare function saveHosts(storage: StoragePort, hosts: readonly HostRecord[]): void;
