// Secure fetch wrapper (issue #5, decision 0002 D1) — the validated-follow front for
// platform.fetch (vendored seam, M-011 injection in createWebPlatform).
//
// Keeps redirect: "follow" (legitimate same-origin reverse proxies keep working) and
// validates the FINAL response before its body is delivered to the app:
//   1. final origin != request origin  -> SecureFetchError("redirect-cross-host");
//   2. https request answered over http -> SecureFetchError("redirect-downgrade");
//   3. request URL with userinfo credentials is refused BEFORE sending (D-URL).
// Cross-origin redirect sub-requests already lost their Authorization header (browser
// spec — the floor); this wrapper is the shell's own fail-closed layer on top: the
// cross-host body is never delivered.
//
// Coverage: platform.fetch feeds createServerTransport (API/SSE/binary reads) and the
// health checks. The upload XHR (destination.ts) is validated separately by M-012 with
// the same rules; the pairing-flow residual fetch surface is registered in
// docs/design/units/connection.md (out of scope, decision 0002 F2 note).

import { SecureFetchError } from "./connection-errors"
import { assertNoUrlCredentials, validateRedirectTarget } from "./url-policy"

/**
 * Dist-audit anchor (V-conn): this string survives minification inside the used code
 * path and lets scripts/verify-direct-connection.ts confirm the built bundle carries the
 * validated-follow wrapper, the same way mobile(M-002) / mobile(vault-v1) are checked.
 */
export const SECURE_FETCH_MARKER =
  "mobile(M-011): platform fetch validated-follow (origin + downgrade checked before body delivery)"

type FetchInit = Parameters<typeof globalThis.fetch>[1]

function requestUrlOf(input: Request | URL | string): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url // Request: already absolute
}

/**
 * Build the validated-follow fetch. `underlying` defaults to globalThis.fetch; the
 * signature matches `typeof fetch` so it drops into the vendored Platform.fetch seam
 * unchanged (M-011 rollback = revert the one patch).
 */
export function createSecureFetch(options?: { underlying?: typeof globalThis.fetch }): typeof globalThis.fetch {
  const underlying = options?.underlying ?? globalThis.fetch
  const secureFetch = async (input: Request | URL | string, init?: FetchInit): Promise<Response> => {
    const url = requestUrlOf(input)
    // Rule 3 (D-URL): long-term credentials never travel in URLs. Refuse before sending.
    assertNoUrlCredentials(url)
    const response = await underlying(input, init)
    const verdict = validateRedirectTarget(url, response.url)
    if (!verdict.allowed) {
      // Release the connection instead of leaving a body to drain; a refused response is
      // never read, never surfaced to the app as data.
      try {
        await response.body?.cancel()
      } catch {
        // A failed cancel must never mask the policy violation below.
      }
      throw new SecureFetchError(verdict.reason === "downgrade" ? "redirect-downgrade" : "redirect-cross-host")
    }
    return response
  }
  // Reference the marker from the live code path so minifiers cannot drop the string.
  void SECURE_FETCH_MARKER
  return secureFetch
}
