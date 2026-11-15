/**
 * Throw SecureFetchError("credential-url") when the input URL embeds userinfo
 * credentials. Long-term credentials never travel in URLs (decision 0002 D-URL).
 */
export declare function assertNoUrlCredentials(input: string): void;
/** Whether `input` embeds userinfo credentials (test/inspection form of the assertion). */
export declare function hasUrlCredentials(input: string): boolean;
export type RedirectVerdict = {
    allowed: true;
} | {
    allowed: false;
    reason: "cross-host";
} | {
    allowed: false;
    reason: "downgrade";
};
/**
 * Validate the FINAL response URL against the requested URL (decision 0002 D1).
 *
 * - Same origin (scheme+host+port) → allowed (same-origin redirects keep working).
 * - Response scheme http while the request was https → downgrade → refused.
 * - Any other origin difference → cross-host → refused.
 *
 * An empty or unparseable response URL means a synthetic Response that never traversed
 * the network (the browser always populates response.url for real responses); there was
 * no cross-host delivery to guard, so it is allowed. The REQUEST url is parsed by the
 * wrapper before anything is sent, so an unparseable request never reaches this check.
 */
export declare function validateRedirectTarget(requestUrl: string, responseUrl: string): RedirectVerdict;
