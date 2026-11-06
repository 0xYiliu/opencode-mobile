package ai.opencode.mobile

/**
 * Pure decision policy for the Android system back press in the WebView shell (issue #145,
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
 * Stage 1 — the chain answer arrives asynchronously from the WebView evaluation of
 * window.opencodeMobileBack.consume(): the JS expression is written to complete to a bare
 * JSON boolean, so "true" means a chain layer (topmost dialog, open drawer/panel, in-app
 * history) consumed the press and the activity stays. EVERYTHING ELSE — "false", null
 * (binding not installed yet, JS exception, page still loading, evaluation timeout), a
 * quoted string, any other payload — is a decline.
 *
 * Stage 2 (only after a decline) — the WebView history fallback decides between a native
 * goBack (non-SPA document history) and the Android default (finish). The policy is
 * fail-closed toward the pre-#145 behavior: a bridge that never comes up can never trap
 * the user inside the app.
 */
internal object BackDispatchPolicy {

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
}
