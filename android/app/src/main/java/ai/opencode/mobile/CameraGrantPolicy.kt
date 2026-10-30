package ai.opencode.mobile

import java.net.URI

/**
 * Pure allowlist policy for WebView getUserMedia authorization (issue #71 pairing QR scan).
 *
 * Decision input is the [android.webkit.PermissionRequest] face, but this class is JVM-only
 * (java.net.URI, no Android imports) so the whole decision surface is unit-testable — same
 * caliber as [ShellWorkerPolicy]. The caller (MainActivity WebChromeClient) passes the
 * request's origin string and resource array plus the App's own OS CAMERA runtime state;
 * the policy never touches Android APIs itself.
 *
 * Security semantics (connection.md pairing section 7-2):
 *  - The origin must parse as EXACTLY the shell loopback origin: scheme/host/port triple
 *    equality after java.net.URI parsing — no startsWith/suffix matching, no localhost
 *    aliases, no 127.0.0.2, no port drift, no userinfo/path/query/fragment carriers
 *    (an "origin" is scheme://host:port only; anything else is foreign). Unparseable,
 *    null or empty input denies.
 *  - The requested resource set must be EXACTLY the single video-capture resource — audio
 *    is never granted (RECORD_AUDIO stays undeclared); fewer, more, or different resources
 *    deny.
 *  - Both gates passed, the OS CAMERA runtime permission state decides between an immediate
 *    grant (App already authorized — silent re-grant, zero repeated dialogs: WebView does
 *    not persist site-level grants, the OS permission state is the single source of truth)
 *    and a runtime prompt (MainActivity drives the OS dialog with the single-pending-slot
 *    discipline).
 */
internal object CameraGrantPolicy {

    /** The one WebView resource this shell ever grants (Android constant value, JVM copy). */
    internal const val RESOURCE_VIDEO_CAPTURE: String = "android.webkit.resource.VIDEO_CAPTURE"
    private const val RESOURCE_AUDIO_CAPTURE: String = "android.webkit.resource.AUDIO_CAPTURE"

    /** Policy decisions, in deny-first order. */
    enum class Decision {
        /** Origin missing/malformed/not exactly the shell loopback origin. */
        DENY_FOREIGN_ORIGIN,
        /** Resource set is not exactly the single video-capture resource. */
        DENY_UNSUPPORTED_RESOURCE,
        /** Both gates passed and the App already holds the OS CAMERA permission. */
        GRANT,
        /** Both gates passed; the OS CAMERA runtime permission must be requested first. */
        PROMPT_RUNTIME,
    }

    /**
     * The whole decision: origin gate, then resource gate, then the OS permission state.
     * Pure function — every input is a value, the decision is total (no exceptions escape:
     * URI parse failures fold into DENY_FOREIGN_ORIGIN).
     */
    fun decide(
        origin: String,
        resources: List<String>,
        expectedScheme: String,
        expectedHost: String,
        expectedPort: Int,
        cameraPermissionGranted: Boolean,
    ): Decision {
        if (!isExactLoopbackOrigin(origin, expectedScheme, expectedHost, expectedPort)) {
            return Decision.DENY_FOREIGN_ORIGIN
        }
        if (resources.size != 1 || resources[0] != RESOURCE_VIDEO_CAPTURE) {
            // Exactly-one-video: empty sets, audio-only, video+audio, duplicated or unknown
            // resources all land here (audio capture is never granted by this shell).
            return Decision.DENY_UNSUPPORTED_RESOURCE
        }
        return if (cameraPermissionGranted) Decision.GRANT else Decision.PROMPT_RUNTIME
    }

    /** The grant payload the caller may hand to PermissionRequest.grant — exactly the video resource. */
    fun grantableResources(): List<String> = listOf(RESOURCE_VIDEO_CAPTURE)

    /**
     * Strict origin equality: java.net.URI parse, then scheme/host/port triple equality
     * (case-normalized). Anything that is not scheme://host:port — userinfo, a path beyond
     * the empty root, a query or a fragment — is foreign even when the triple matches, so a
     * full URL can never ride through the origin gate. Parse failure (null/empty/malformed,
     * including a relative reference or an unparsable authority) denies.
     */
    private fun isExactLoopbackOrigin(origin: String, expectedScheme: String, expectedHost: String, expectedPort: Int): Boolean {
        if (origin.isBlank()) return false
        val uri = try {
            URI(origin)
        } catch (_: Exception) {
            return false
        }
        if (uri.userInfo != null) return false
        if (!uri.rawPath.isNullOrEmpty() && uri.rawPath != "/") return false
        if (uri.rawQuery != null || uri.rawFragment != null) return false
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        if (uri.port == -1) return false // explicit port required: the default-port shape is not this shell's origin
        return scheme == expectedScheme.lowercase() && host == expectedHost.lowercase() && uri.port == expectedPort
    }
}
