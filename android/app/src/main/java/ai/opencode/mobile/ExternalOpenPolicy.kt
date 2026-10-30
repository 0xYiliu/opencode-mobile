package ai.opencode.mobile

import java.net.URI

/**
 * Pure allowlist policy for the shell's OUTBOUND external-open face (issue #76, N08):
 * every URL handed over the files bridge's openExternal op passes here before the caller
 * builds the ACTION_VIEW intent.
 *
 * JVM-only (java.net.URI, zero Android imports — same caliber as [CameraGrantPolicy] and
 * [ShellWorkerPolicy]) so the whole decision surface is unit-testable. The caller
 * (FilesBridge.handleOpenExternal) runs the decision on its background parse thread and
 * never logs the URL (zero-value logging house rule).
 *
 * Security semantics (plan 2.2; docs/design/units/attachments-artifacts.md):
 *  - java.net.URI STRICT parse: blank/whitespace/control characters/relative references/
 *    malformed authorities never parse — parse failure refuses (fail-closed).
 *  - Protocol-layer allowlist ONLY: scheme lowercase-normalized must be exactly http or
 *    https. Everything else refuses — including mailto: (the upstream JS gate keeps its
 *    mailto branch verbatim; mailto passing the JS gate is refused NATIVELY and answers
 *    {opened:false} with the failure Toast — a registered first-party delta; the one
 *    real in-tree mailto consumer is the Office document link chain (#18/G29 domain),
 *    which has no usable shell rendering surface to fall back to today).
 *  - No userinfo: rawUserInfo != null refuses (decision 0002 D-URL lineage: credentials
 *    never ride in a URL that leaves the app; this also kills the
 *    https://good.com@evil.com/ confusion shape).
 *  - Host required: a null/empty host (registry-based or opaque authority shapes) refuses.
 *  - Port range hardened: java.net.URI parses out-of-range ports (e.g. :65536) without
 *    throwing — a shape other URL parsers reject; anything outside -1..65535 refuses
 *    (fail-closed parser-differential defense, registered strictness).
 *  - Length bound: raw.length > 2048 refuses (VaultRequestLimits bound precedent).
 *  - No domain allowlist ON PURPOSE: the three real consumption classes (OAuth authorize
 *    URLs, MCP elicitation `external` fields, GUI-plugin host-API calls) draw from
 *    unbounded / remote-controlled domain sets; a hard domain list would break
 *    self-hosted-server OAuth (G25) and the list itself would become the attack surface.
 *    The protocol gate + userinfo refusal + strict parse + length bound are the enforced
 *    layer; the upstream JS gate (canParse + http/https/mailto, kept verbatim) is only
 *    the first layer and is NOT trusted.
 *
 * Parser-differential discipline (plan R2): the intent is constructed from THE SAME
 * string this policy accepted (Uri.parse(accepted)) — no second normalization step, so a
 * string java.net.URI refuses can never reach android.net.Uri.parse, and no
 * URI-vs-Uri divergence can smuggle a different target past the single enforced check.
 */
internal object ExternalOpenPolicy {

    /** Bound for one outbound URL (VaultRequestLimits length-bound precedent). */
    internal const val MAX_URL_LENGTH = 2048

    /** Policy decisions, in refuse-first order. */
    enum class Decision {
        /** Any gate failed: unparseable, non-http(s) scheme, userinfo, missing host, over-long. */
        REFUSED,
        /** All gates passed: hand the SAME string to ACTION_VIEW. */
        OPEN,
    }

    /**
     * The whole decision. Pure function — every input is a value, the decision is total
     * (no exceptions escape: URI parse failures fold into REFUSED).
     */
    fun decide(raw: String): Decision {
        if (raw.length > MAX_URL_LENGTH) return Decision.REFUSED
        val uri = try {
            URI(raw)
        } catch (_: Exception) {
            return Decision.REFUSED
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return Decision.REFUSED
        if (uri.rawUserInfo != null) return Decision.REFUSED
        val host = uri.host
        if (host.isNullOrEmpty()) return Decision.REFUSED
        // Port-range hardening (registered strictness, CameraGrantPolicy deny-first
        // precedent): java.net.URI parses an out-of-range port (e.g. :65536) WITHOUT
        // throwing — a shape other parsers reject. Fail closed on anything a valid
        // URL cannot carry (undefined = -1).
        if (uri.port !in -1..65535) return Decision.REFUSED
        return Decision.OPEN
    }
}
