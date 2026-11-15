/**
 * Dist-audit anchor (V-conn): this string survives minification inside the used code
 * path and lets scripts/verify-direct-connection.ts confirm the built bundle carries the
 * validated-follow wrapper, the same way mobile(M-002) / mobile(vault-v1) are checked.
 */
export declare const SECURE_FETCH_MARKER = "mobile(M-011): platform fetch validated-follow (origin + downgrade checked before body delivery)";
export type FetchLike = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;
/**
 * Build the validated-follow fetch. `underlying` defaults to globalThis.fetch; the
 * signature matches `typeof fetch` so it drops into the vendored Platform.fetch seam
 * unchanged (M-011 rollback = revert the one patch).
 */
export declare function createSecureFetch(options?: {
    underlying?: FetchLike;
}): FetchLike;
