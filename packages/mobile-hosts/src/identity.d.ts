/** The extension name used in upstream extension keys (`${extension}:${id}`). */
export declare const SSH_EXTENSION = "mobile-ssh";
/** Host record id: uuid v4. */
export type HostId = string;
/** Create a fresh host id (uuid v4). */
export declare function makeHostId(): HostId;
/** Whether `value` is a well-formed uuid v4 host id. */
export declare function isValidHostId(value: unknown): value is HostId;
/** The upstream connection key of an SSH host: `mobile-ssh:<uuid>`. Throws on a malformed id. */
export declare function hostKey(id: HostId): string;
/** Parse an upstream key back to a host id; undefined when it is not one of ours. */
export declare function parseHostKey(key: string): HostId | undefined;
/**
 * Direct connections: the identity key is the normalized URL itself (upstream-native).
 * Normalization mirrors the upstream `normalizeServerUrl`: trim, default the `http://`
 * scheme, strip trailing slashes. A different port therefore yields a different key.
 */
export declare function normalizeDirectUrl(input: string): string | undefined;
/** Direct identity key: the normalized URL (never used for SSH hosts). */
export declare function directKey(input: string): string | undefined;
