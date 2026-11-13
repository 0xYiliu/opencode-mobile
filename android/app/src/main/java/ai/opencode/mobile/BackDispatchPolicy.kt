package ai.opencode.mobile

import java.net.URI

/**
 * Pure decision policy for the Android system back press in the WebView shell (issue #145/#186,
 * plan T12; review B1 fix). JVM-only (no Android imports) so the whole decision surface is
 * unit-testable — same caliber as [CameraGrantPolicy].
 *
 * Dispatch order (MainActivity.onBackPressed): the in-app back chain is asked FIRST —
 * the WebView history gate must never precede it. The vendored SPA runs on @solidjs/router
 * pushState, whose entries count into WebView.canGoBack(), so after any in-app navigation
 * the WebView gate is permanently true and a history-gate-first dispatch would never
 * reach the chain (the exact G31② state this bridge replaces). In-app history rides the
 * chain itself as its last layer (common.goBack semantics); the WebView history gate is
 * only the FALLBACK for non-SPA document navigations after the chain declines.
 *
 * Stage 1 — the chain answer arrives asynchronously from the main-frame WebView evaluation of
 * window.opencodeMobileBack.consume({version:1,type:"back",requestId}). The request contains
 * no URL, token, or credential and only the exact fixed request shape is accepted by the
 * app-side binding. The JS expression is written to complete to a bare JSON boolean, so
 * "true" means a chain layer consumed the press and the activity stays. EVERYTHING ELSE —
 * "false", null, a malformed/stale/duplicate request, a JS exception, a foreign origin, or
 * the 500ms evaluation timeout — is a decline.
 *
 * Stage 2 (only after a decline) — the WebView history fallback decides between a native
 * goBack (non-SPA document history) and the Android default (finish). The policy is
 * fail-closed toward the pre-#145 behavior: a bridge that never comes up can never trap
 * the user inside the app.
 */
internal object BackDispatchPolicy {

    internal const val REQUEST_VERSION: Int = 1
    internal const val REQUEST_TYPE: String = "back"
    internal const val REQUEST_ID_MAX_BYTES: Int = 256

    /** The exact serialized result that suppresses the activity finish. */
    internal const val CONSUMED_RESULT: String = "true"

    enum class Outcome {
        /** A chain layer consumed the press: the activity stays. */
        CONSUMED,
        /** The chain declined and the WebView history has entries: native goBack. */
        WEBVIEW_BACK,
        /** The chain declined with nothing to go back to: the Android default (finish). */
        DEFAULT,
    }

    /**
     * Stage 1: the chain verdict from the serialized WebView evaluation result. Total
     * function: every input maps to a decision, no exceptions escape. Returns CONSUMED or
     * DEFAULT (a decline — the caller then runs [historyFallback]).
     */
    fun decide(evaluationResult: String?): Outcome =
        if (evaluationResult == CONSUMED_RESULT) Outcome.CONSUMED else Outcome.DEFAULT

    /**
     * Stage 2: the fallback verdict after a declined chain. Native WebView history first
     * (non-SPA document navigations — never SPA route entries, which the chain's in-app
     * history layer owns), then the Android default.
     */
    fun historyFallback(canGoBack: Boolean): Outcome =
        if (canGoBack) Outcome.WEBVIEW_BACK else Outcome.DEFAULT

    /** Validate the fixed request before it is serialized into the main-frame expression. */
    fun isValidRequest(version: Int, type: String?, requestId: String?): Boolean {
        if (version != REQUEST_VERSION || type != REQUEST_TYPE || requestId.isNullOrEmpty()) return false
        return requestId.toByteArray(Charsets.UTF_8).size <= REQUEST_ID_MAX_BYTES
    }

    /**
     * Origin gate for the app-side binding. Paths and query strings are allowed, but a
     * different scheme/host/port or any user-info authority is rejected.
     */
    fun isTrustedOrigin(url: String?, expectedUrl: String): Boolean {
        if (url == null) return false

        return try {
            val actual = URI(url)
            val expected = URI(expectedUrl)
            actual.scheme == expected.scheme &&
                actual.host == expected.host &&
                actual.port == expected.port &&
                actual.userInfo == null
        } catch (_: Exception) {
            false
        }
    }

    /** Accept a callback only for the one live dispatch; stale, duplicate and destroyed replies decline. */
    fun acceptsReply(dispatchId: Int, activeDispatchId: Int, pending: Boolean): Boolean =
        pending && dispatchId == activeDispatchId

    /** Also require the callback to carry the exact requestId registered for that dispatch. */
    fun acceptsReply(
        dispatchId: Int,
        activeDispatchId: Int,
        pending: Boolean,
        requestId: String?,
        pendingRequestId: String?,
    ): Boolean =
        acceptsReply(dispatchId, activeDispatchId, pending) &&
            requestId != null &&
            requestId == pendingRequestId
}
