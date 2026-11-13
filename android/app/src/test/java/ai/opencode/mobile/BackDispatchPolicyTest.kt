package ai.opencode.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Truth-table tests for the system back dispatch policy (issue #145, plan T12). These pin
 * the fail-closed contract: ONLY the exact serialized "true" (the WebView evaluation of
 * window.opencodeMobileBack.consume() completing to a bare JSON boolean) suppresses the
 * activity finish — "false", null, empty, quoted and malformed payloads all keep today's
 * Android default (finish), so a bridge that never comes up can never trap the user.
 */
class BackDispatchPolicyTest {

    @Test
    fun onlyTheExactTrueResultIsConsumed() {
        assertEquals(BackDispatchPolicy.Outcome.CONSUMED, BackDispatchPolicy.decide("true"))
    }

    @Test
    fun falseResultKeepsTheAndroidDefaultFinish() {
        // The chain declined (no dialog/drawer/history layer handled the press): the
        // root-level back finishes the activity exactly as before the bridge.
        assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.decide("false"))
    }

    @Test
    fun nullResultKeepsTheAndroidDefaultFinish() {
        // Binding not installed yet (early press), page still loading, or the evaluation
        // callback delivered no completion value: the default proceeds.
        assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.decide(null))
    }

    @Test
    fun quotedBooleanFormIsNotAccepted() {
        // The JS expression completes to a bare boolean, so a JSON-string payload would
        // mean the script shape drifted — failing closed to the default is the safe read.
        assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.decide("\"true\""))
        assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.decide("'true'"))
    }

    @Test
    fun malformedAndForeignPayloadsKeepTheAndroidDefaultFinish() {
        for (result in listOf(
            "",
            " ",
            "TRUE", // the JS boolean serializes lowercase; any case drift is foreign
            "null",
            "{}",
            "1",
            "0",
            "consume()",
            "<script>",
        )) {
            assertEquals(
                "payload must DEFAULT: $result",
                BackDispatchPolicy.Outcome.DEFAULT,
                BackDispatchPolicy.decide(result),
            )
        }
    }

    @Test
    fun theConsumedConstantIsTheOnlyAcceptedForm() {
        // Locks the surface between the policy and the caller: MainActivity compares
        // through decide(), and CONSUMED_RESULT is the exact accepted spelling.
        assertEquals("true", BackDispatchPolicy.CONSUMED_RESULT)
        assertEquals(BackDispatchPolicy.Outcome.CONSUMED, BackDispatchPolicy.decide(BackDispatchPolicy.CONSUMED_RESULT))
    }

    @Test
    fun declinedChainFallsBackToNativeWebViewHistoryFirst() {
        // Stage 2 (review B1 fix): the chain declines, then non-SPA document history
        // (native goBack) still applies before the Android default finish. SPA route
        // entries never drive this branch: in-app history is a chain layer and answers
        // CONSUMED in stage 1 before stage 2 is ever consulted.
        assertEquals(BackDispatchPolicy.Outcome.WEBVIEW_BACK, BackDispatchPolicy.historyFallback(true))
        assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.historyFallback(false))
    }

    @Test
    fun declinedChainRootStillFinishesWhileConsumedNeverReachesStageTwo() {
        // Dispatch-order truth table (the B1 regression): the chain consumes "true" and
        // stage 2 is never consulted; every decline payload that reaches stage 2 with no
        // native history finishes — the root behavior is unchanged whether the bridge
        // answers false, is missing, or times out (null).
        assertEquals(BackDispatchPolicy.Outcome.CONSUMED, BackDispatchPolicy.decide("true"))
        for (answer in listOf("false", null, "\"true\"", "garbage")) {
            assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.decide(answer))
            assertEquals(BackDispatchPolicy.Outcome.DEFAULT, BackDispatchPolicy.historyFallback(false))
        }
    }

    @Test
    fun backRequestShapeIsFixedAndBounded() {
        assertEquals(true, BackDispatchPolicy.isValidRequest(1, "back", "opaque"))
        assertEquals(false, BackDispatchPolicy.isValidRequest(2, "back", "opaque"))
        assertEquals(false, BackDispatchPolicy.isValidRequest(1, "forward", "opaque"))
        assertEquals(false, BackDispatchPolicy.isValidRequest(1, "back", ""))
        assertEquals(
            false,
            BackDispatchPolicy.isValidRequest(1, "back", "x".repeat(BackDispatchPolicy.REQUEST_ID_MAX_BYTES + 1)),
        )
        assertEquals(
            true,
            BackDispatchPolicy.isValidRequest(BackDispatchPolicy.REQUEST_VERSION, BackDispatchPolicy.REQUEST_TYPE, "opaque"),
        )
    }

    @Test
    fun onlyThePackagedAppOriginMayReachTheBinding() {
        val expected = "http://127.0.0.1:18090/"
        assertEquals(true, BackDispatchPolicy.isTrustedOrigin(expected, expected))
        assertEquals(true, BackDispatchPolicy.isTrustedOrigin("http://127.0.0.1:18090/session/abc?tab=1", expected))
        assertEquals(false, BackDispatchPolicy.isTrustedOrigin("https://127.0.0.1:18090/", expected))
        assertEquals(false, BackDispatchPolicy.isTrustedOrigin("http://127.0.0.1:18091/", expected))
        assertEquals(false, BackDispatchPolicy.isTrustedOrigin("http://user:secret@127.0.0.1:18090/", expected))
        assertEquals(false, BackDispatchPolicy.isTrustedOrigin("http://127.0.0.2:18090/", expected))
        assertEquals(false, BackDispatchPolicy.isTrustedOrigin(null, expected))
    }

    @Test
    fun staleDuplicateAndDestroyedRepliesAreRejected() {
        assertEquals(true, BackDispatchPolicy.acceptsReply(7, 7, true))
        assertEquals(false, BackDispatchPolicy.acceptsReply(6, 7, true))
        assertEquals(false, BackDispatchPolicy.acceptsReply(7, 7, false))
        // A timeout or destroy clears pending before a late callback can arrive.
        assertEquals(false, BackDispatchPolicy.acceptsReply(7, 8, false))
    }
}
