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
}
