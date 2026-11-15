import type { StoragePort } from "./storage";
export interface HostRecord {
    /** Stable identity: uuid v4, fixed at creation, never rewritten. */
    id: string;
    /** Display name, unique across the registry, 1..100 characters after trim. */
    name: string;
    /** SSH target, `[user@]host[:port]` shape, at most 500 characters. */
    target: string;
    /** Non-secret credential reference (mobile-credential:<id>), optional. */
    credentialRef?: string;
    /**
     * Remote OpenCode service port (issue #6): the tunnel forwards to the REMOTE loopback
     * `localhost:<servicePort>`. Non-secret, whitelist payload field, optional — absent
     * means the default applies (DEFAULT_SERVICE_PORT). Distinct from the SSH port inside
     * `target` (dialog labels disambiguate the two).
     */
    servicePort?: number;
    /** ISO-8601 creation timestamp. */
    createdAt: string;
    /** ISO-8601 last-update timestamp. */
    updatedAt: string;
}
/** Default remote OpenCode service port (issue #6, F7): applied when a record omits it. */
export declare const DEFAULT_SERVICE_PORT = 4096;
export type HostRecordInput = {
    name: string;
    target: string;
    credentialRef?: string;
    servicePort?: number;
};
export type RegistryErrorCode = "empty-name" | "name-too-long" | "duplicate-name" | "duplicate-target" | "empty-target" | "invalid-target" | "target-too-long" | "invalid-credential-ref" | "invalid-service-port" | "invalid-id" | "not-found" | "forbidden-field" | "invalid-record";
export declare class HostRegistryError extends Error {
    readonly code: RegistryErrorCode;
    constructor(code: RegistryErrorCode, detail?: string);
}
/** Validate an SSH target (`[user@]host[:port]`; IPv6 literals are not supported this phase). */
export declare function validateTarget(input: string): string;
/**
 * Validate the remote service port (issue #6): an integer 1..65535. `undefined` is the
 * default path (DEFAULT_SERVICE_PORT applies at the consumer). The service port is NOT
 * the SSH port — that one lives inside `target` and is validated there.
 */
export declare function validateServicePort(input: number | undefined): number | undefined;
export interface HostRegistryOptions {
    storage: StoragePort;
    /** Injectable clock for tests. Defaults to Date.now ISO timestamps. */
    now?: () => string;
}
export declare function createHostRegistry(options: HostRegistryOptions): {
    list: () => HostRecord[];
    get: (id: string) => HostRecord | undefined;
    add: (input: HostRecordInput) => HostRecord;
    update: (id: string, patch: Partial<HostRecordInput> & {
        credentialRef?: string | undefined;
    }) => HostRecord;
    remove: (id: string) => boolean;
    validate: (input: HostRecordInput, exceptId?: string) => void;
    subscribe(listener: (change: {
        id: string;
        previous?: HostRecord;
        next?: HostRecord;
    }) => void): () => boolean;
};
export type HostRegistry = ReturnType<typeof createHostRegistry>;
