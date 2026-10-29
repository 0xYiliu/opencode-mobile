package ai.opencode.mobile.vault

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultRequestLimitsTest {
    private fun encodedJsonValue(value: String): String = value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\u0001", "\\u0001")

    @Test fun maximumUtf8PayloadWithQuotesAndBackslashesFitsSerializedEnvelope() {
        val value = ("\\\"".repeat(VaultStore.MAX_VALUE_BYTES / 2))
        assertEquals(VaultStore.MAX_VALUE_BYTES, VaultRequestLimits.utf8Bytes(value))
        val raw = "{\"id\":\"request-1\",\"op\":\"put\",\"params\":{\"value\":\"${encodedJsonValue(value)}\"}}"
        assertTrue(VaultRequestLimits.isEnvelopeWithinBound(raw))
        assertEquals("request-1", VaultRequestLimits.leadingRequestId(raw))
    }

    @Test fun maximumControlBytePayloadFitsSixfoldJsonEscapingBound() {
        val value = "\u0001".repeat(VaultStore.MAX_VALUE_BYTES)
        assertEquals(VaultStore.MAX_VALUE_BYTES, VaultRequestLimits.utf8Bytes(value))
        val raw = "{\"id\":\"request-control\",\"op\":\"put\",\"params\":{\"value\":\"${encodedJsonValue(value)}\"}}"
        assertTrue(raw.length > VaultStore.MAX_VALUE_BYTES + 4096)
        assertTrue(VaultRequestLimits.isEnvelopeWithinBound(raw))
        assertEquals("request-control", VaultRequestLimits.leadingRequestId(raw))
    }

    @Test fun oversizeSerializedEnvelopeStillExtractsTheLeadingRequestId() {
        val raw = "{\"id\":\"request-large\",\"op\":\"list\",\"params\":{},\"padding\":\"${"x".repeat(VaultRequestLimits.MAX_REQUEST_CHARS)}\"}"
        assertTrue(!VaultRequestLimits.isEnvelopeWithinBound(raw))
        assertEquals("request-large", VaultRequestLimits.leadingRequestId(raw))
    }

    @Test fun utf8BoundIsIndependentFromJsonEscaping() {
        val value = "\u0001".repeat(VaultStore.MAX_VALUE_BYTES + 1)
        assertTrue(VaultRequestLimits.utf8Bytes(value) > VaultStore.MAX_VALUE_BYTES)
    }
}
