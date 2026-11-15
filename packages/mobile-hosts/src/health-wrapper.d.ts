/** Mirror of packages/app/src/runtime/server/health.ts ServerHealth. */
export interface HealthLike {
    healthy: boolean;
    version?: string;
    incompatible?: boolean;
    checking?: boolean;
    unauthorized?: boolean;
}
export type ParsedVersion = {
    major: number;
    minor: number;
    patch: number;
};
/** Parse `MAJOR.MINOR.PATCH` (leading "v" tolerated). Undefined when unparseable. */
export declare function parseServerVersion(version?: string): ParsedVersion | undefined;
/**
 * Compatibility predicate for OpenCode servers reported through SSH (our own rule — the
 * upstream web closure has no reusable predicate; the desktop extension only checks exact
 * CLI-binary versions it installs itself).
 *
 * Rule: major must equal 2 and minor must be >= 1 (the vendored app is 2.1.x); the patch
 * number does not participate. A missing or unparseable version yields undefined — we do
 * not claim incompatibility we cannot judge; such servers surface via healthy/failed paths.
 */
export declare function isCompatibleServerVersion(version?: string): boolean | undefined;
/**
 * Whether a host of `kind` should surface as incompatible.
 * - kind "ssh": true only when the reported version parses and fails the rule above.
 * - kind "direct": always false (upstream web native behavior; gap tracked as issue #5).
 */
export declare function assessIncompatible(input: {
    kind: "ssh" | "direct";
    version?: string;
}): boolean;
