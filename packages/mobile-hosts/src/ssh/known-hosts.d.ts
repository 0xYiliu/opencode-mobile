export interface KnownHostsEntry {
    /** Hostname as recorded (plaintext; never hashed). For `[host]:port` lines the host without brackets. */
    hostname: string;
    /** Explicit non-default port from `[host]:port` lines; undefined for default-port lines. */
    port?: number;
    /** SSH key type (e.g. `ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`). */
    keytype: string;
    /** Base64 key blob (the trailing field, as written). */
    blob: string;
    /** True for lines this app must not rewrite: hashed hostname, markers, pattern lists. */
    foreign: boolean;
}
export type KnownHostsParseIssue = {
    line: number;
    kind: "hashed-hostname";
} | {
    line: number;
    kind: "marker";
} | {
    line: number;
    kind: "pattern-list";
} | {
    line: number;
    kind: "malformed";
};
export interface KnownHostsParseResult {
    entries: KnownHostsEntry[];
    issues: KnownHostsParseIssue[];
}
/** One known_hosts line -> entry or classified issue. Comments/blank lines yield undefined. */
export declare function parseKnownHostsLine(line: string, lineNumber: number): KnownHostsEntry | KnownHostsParseIssue | undefined;
/** Parse a whole known_hosts file. Malformed/marked/hashed lines are reported, never dropped silently. */
export declare function parseKnownHosts(text: string): KnownHostsParseResult;
/**
 * Serialize one entry into the OpenSSH line format: `[host]:port keytype blob` for a
 * non-default port, `host keytype blob` otherwise. Hashed hostnames, markers and pattern
 * lists are never produced here (negative assertion: the store carries no hashed lines).
 */
export declare function serializeKnownHostsEntry(entry: {
    hostname: string;
    port?: number;
    keytype: string;
    blob: string;
}): string;
/** Serialize a whole entry list (one line each, trailing newline optional per caller). */
export declare function serializeKnownHosts(entries: ReadonlyArray<{
    hostname: string;
    port?: number;
    keytype: string;
    blob: string;
}>): string;
/**
 * Match a recorded entry against a target host/port (the lookup the verifier performs;
 * the Kotlin store mirrors it with its own parser). `port` defaults to 22 (OpenSSH
 * semantics: default-port lines are matched by bare hostname).
 */
export declare function matchesKnownHostsEntry(entry: {
    hostname: string;
    port?: number;
    foreign?: boolean;
}, host: string, port?: number): boolean;
/**
 * Extract the user segment from an SSH target (`[user@]host[:port]`). Undefined when the
 * target carries no user@ (the session then falls back to the SSH client's default user
 * behavior). The username is NOT a credential (issue #7 review B2) — it is a routing
 * fact that must reach the SSH session instead of being dropped here (the pre-B2 bug:
 * `getSession` received the password as the username because the user segment never
 * crossed the bridge).
 */
export declare function parseSshTargetUser(target: string): string | undefined;
/** Extract the host[:port] pieces from an SSH target (`[user@]host[:port]`). */
export declare function parseSshTargetHost(target: string): {
    host: string;
    port: number;
};
