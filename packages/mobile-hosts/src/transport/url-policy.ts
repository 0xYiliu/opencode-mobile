// URL policy (issue #5, decision 0002 D1/D-URL) — pure functions, no platform APIs.
//
// Two rules, shared by the fetch wrapper (M-011) and the upload XHR validation (M-012):
//  - assertNoUrlCredentials: a request URL that embeds userinfo credentials
//    (https://user:pass@host/…) is refused before it is sent (defense in depth; the
//    dialog's link-form serverAddress already rejects userinfo, but the password form's
//    normalizeServerUrl path does not, so the shell refuses at the transport).
//  - validateRedirectTarget: after the browser followed redirects (redirect: "follow" is
//    kept for legitimate same-origin reverse proxies), the FINAL response URL must still
//    be same-origin with the request and must not have downgraded https→http. Cross-origin
//    sub-requests already lost their Authorization header (browser spec = the floor); this
//    check is the shell's own fail-closed layer: the cross-host body is never delivered.

import { SecureFetchError } from "./connection-errors"

/**
 * Synthetic base used only to resolve relative inputs for inspection. The client always
 * calls fetch with absolute URLs (baseUrl assembly), so this branch is defensive; a
 * relative path resolves to the synthetic origin and can never gain userinfo by itself.
 */
const INSPECTION_BASE = "http://opencode-mobile.invalid"

function parseForInspection(input: string): URL | undefined {
  try {
    return new URL(input)
  } catch {
    try {
      return new URL(input, INSPECTION_BASE)
    } catch {
      return undefined
    }
  }
}

/**
 * Throw SecureFetchError("credential-url") when the input URL embeds userinfo
 * credentials. Long-term credentials never travel in URLs (decision 0002 D-URL).
 */
export function assertNoUrlCredentials(input: string): void {
  const url = parseForInspection(input)
  // Unparseable input: nothing embeddable was parsed, and the browser will refuse it
  // anyway; the credential rule is about parseable userinfo.
  if (!url) return
  if (url.username !== "" || url.password !== "") {
    throw new SecureFetchError("credential-url")
  }
}

/** Whether `input` embeds userinfo credentials (test/inspection form of the assertion). */
export function hasUrlCredentials(input: string): boolean {
  const url = parseForInspection(input)
  if (!url) return false
  return url.username !== "" || url.password !== ""
}

export type RedirectVerdict =
  | { allowed: true }
  | { allowed: false; reason: "cross-host" }
  | { allowed: false; reason: "downgrade" }

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
export function validateRedirectTarget(requestUrl: string, responseUrl: string): RedirectVerdict {
  const request = parseForInspection(requestUrl)
  if (!request) return { allowed: false, reason: "cross-host" } // fail-closed (defensive)
  if (responseUrl === "") return { allowed: true } // synthetic response, never left the origin
  const response = parseForInspection(responseUrl)
  if (!response) return { allowed: false, reason: "cross-host" } // fail-closed on garbage
  if (request.protocol === "https:" && response.protocol !== "https:") {
    return { allowed: false, reason: "downgrade" }
  }
  if (response.origin !== request.origin) return { allowed: false, reason: "cross-host" }
  return { allowed: true }
}
