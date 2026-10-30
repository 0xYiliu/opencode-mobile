package ai.opencode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Decision-matrix tests for the outbound external-open policy (issue #76, N08). These pin
 * the exact gates of [ExternalOpenPolicy.decide]: strict java.net.URI parse (parse failure
 * refuses), the protocol-layer allowlist (http/https ONLY after lowercase normalization —
 * mailto refused natively, the registered first-party delta), the userinfo refusal, the
 * host requirement and the 2048 length bound. Every refused shape is asserted
 * independently (CameraGrantPolicyTest matrix caliber).
 */
class ExternalOpenPolicyTest {

    private fun decide(raw: String) = ExternalOpenPolicy.decide(raw)

    // ------------------------------------------------------------------
    // OPEN group — the shapes that MUST pass (OAuth/self-hosted/tunnel domains
    // are unbounded by design: no domain allowlist exists at this layer).
    // ------------------------------------------------------------------

    @Test
    fun openGroup() {
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("https://opencode.ai/console"))
        // LAN / OAuth authorize shape: host + port + path + query + fragment all survive.
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("http://192.168.1.10:4096/a/b?q=1#f"))
        // IPv6 literal host.
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("https://[::1]:4096/"))
        // Shell loopback shape (the front itself) stays a legal OUTBOUND target — no
        // special-casing needed: the page it opens is public static assets, zero
        // credentials in the URL (registered in the unit doc, plan 2.2).
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("http://127.0.0.1:18090/"))
        // Default-port and empty-path shapes.
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("https://example.com"))
    }

    @Test
    fun schemeAndHostCaseNormalizationStillOpens() {
        // java.net.URI normalizes scheme and host case; the policy lowercases the scheme
        // again defensively — the uppercase spelling variant of a legal URL still opens.
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("HTTPS://EXAMPLE.COM/Path"))
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide("Http://Example.Com:4096/x"))
    }

    @Test
    fun lengthBoundBoundaryIsInclusiveAt2048() {
        val prefix = "https://example.com/" // 20 chars
        assertEquals(ExternalOpenPolicy.Decision.OPEN, decide(prefix + "a".repeat(2048 - prefix.length)))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide(prefix + "a".repeat(2049 - prefix.length)))
    }

    // ------------------------------------------------------------------
    // REFUSED group — protocol gate (every non-http/https scheme shape).
    // ------------------------------------------------------------------

    @Test
    fun nonWebProtocolsAllRefuse() {
        for (raw in listOf(
            "mailto:user@example.com", // the registered first-party delta: JS gate passes it, native refuses
            "javascript:alert(1)",
            "intent://x/#Intent;scheme=http;end",
            "file:///etc/passwd",
            "content://a/b",
            "data:text/html,x",
            "about:blank",
            "ftp://h/",
            "opencode://pair",
            "ws://h/",
            "android-app://com.example",
        )) {
            assertEquals("URL must REFUSE (protocol gate): $raw", ExternalOpenPolicy.Decision.REFUSED, decide(raw))
        }
    }

    // ------------------------------------------------------------------
    // REFUSED group — parse failures and structural gates.
    // ------------------------------------------------------------------

    @Test
    fun unparseableAndMalformedRefuse() {
        for (raw in listOf(
            "", // empty
            "   ", // blank
            "not a uri", // relative reference (no scheme -> scheme gate)
            "example.com/p", // schemeless
            "https://exa mple.com/", // space inside the authority
            "https://example.com:65536/", // port out of range
            "https://example.com/\u0000", // control character (NUL)
            "https://example.com/a\r\nX: y", // CRLF injection
            "https://example.com/\u001F", // control character (unit separator)
            "https://h/\ttoken", // tab carrier
            "http://\"", // malformed authority
        )) {
            assertEquals("URL must REFUSE (parse/structural): ${raw.replace("\u0000", "<NUL>").replace("\r", "<CR>").replace("\n", "<LF>").replace("\t", "<TAB>").replace("\u001F", "<US>")}", ExternalOpenPolicy.Decision.REFUSED, decide(raw))
        }
    }

    @Test
    fun userinfoCarriersRefuse() {
        // Both confusion shapes: explicit credentials and the @-decoy that puts the
        // "trusted" name in the userinfo slot (decision 0002 D-URL lineage).
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("https://user:pass@example.com/"))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("https://good.com@evil.com/"))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("http://@example.com/"))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("https://user@127.0.0.1:18090/"))
    }

    @Test
    fun missingHostRefuses() {
        // Opaque URIs and registry-based authorities have no parsed host.
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("mailto:user@example.com"))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("about:blank"))
        assertEquals(ExternalOpenPolicy.Decision.REFUSED, decide("http:///no-host"))
    }

    // ------------------------------------------------------------------
    // Surface shape.
    // ------------------------------------------------------------------

    @Test
    fun decisionEnumHasExactlyTwoValues() {
        assertTrue(
            "the decision surface must stay exactly {REFUSED, OPEN}",
            ExternalOpenPolicy.Decision.entries.toTypedArray().contentEquals(
                arrayOf(ExternalOpenPolicy.Decision.REFUSED, ExternalOpenPolicy.Decision.OPEN),
            ),
        )
    }
}
