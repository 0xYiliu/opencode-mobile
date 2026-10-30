package ai.opencode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Decision-matrix tests for the WebView getUserMedia grant policy (issue #71). These pin the
 * exact comparison semantics of the origin gate (parsed scheme/host/port triple equality —
 * the ONE passing origin shape is http://127.0.0.1:18090) and the resource gate (exactly the
 * single video-capture resource).
 */
class CameraGrantPolicyTest {

    private val scheme = "http"
    private val host = "127.0.0.1"
    private val port = 18090
    private val video = "android.webkit.resource.VIDEO_CAPTURE"
    private val audio = "android.webkit.resource.AUDIO_CAPTURE"

    private fun decide(origin: String, resources: List<String>, granted: Boolean = false) =
        CameraGrantPolicy.decide(origin, resources, scheme, host, port, granted)

    @Test
    fun exactLoopbackOriginWithExactlyVideoGateOnOsPermissionState() {
        // The one passing origin+resource shape: OS-authorized -> GRANT (silent re-grant),
        // not yet authorized -> PROMPT_RUNTIME (the OS dialog path).
        assertEquals(
            CameraGrantPolicy.Decision.PROMPT_RUNTIME,
            decide("http://127.0.0.1:18090", listOf(video), granted = false),
        )
        assertEquals(
            CameraGrantPolicy.Decision.GRANT,
            decide("http://127.0.0.1:18090", listOf(video), granted = true),
        )
    }

    @Test
    fun foreignOriginsAllDeny() {
        for (origin in listOf(
            "http://127.0.0.2:18090", // loopback alias network
            "https://127.0.0.1:18090", // scheme drift
            "http://127.0.0.1:18091", // port drift
            "http://localhost:18090", // hostname alias
            "http://attacker.invalid:18090", // foreign host
            "http://127.0.0.1.evil.invalid:18090", // suffix look-alike
            "http://127.0.0.1", // default port (no explicit port)
            "", // empty
            "   ", // blank
            "not a uri", // unparseable relative reference
            "http://127.0.0.1:18090/auth/connect/abc", // a full URL is not an origin
            "http://user@127.0.0.1:18090", // userinfo carrier
            "http://127.0.0.1:18090?x=1", // query carrier
            "http://127.0.0.1:18090#f", // fragment carrier
            "127.0.0.1:18090", // no scheme
        )) {
            assertEquals(
                "origin must DENY_FOREIGN_ORIGIN: $origin",
                CameraGrantPolicy.Decision.DENY_FOREIGN_ORIGIN,
                decide(origin, listOf(video)),
            )
        }
    }

    @Test
    fun parsedComparisonIsCaseNormalizedButStillExact() {
        // java.net.URI normalizes scheme/host case: the uppercase-spelling variant of the one
        // origin still parses to the same triple and passes (normalization pinned here).
        assertEquals(
            CameraGrantPolicy.Decision.GRANT,
            decide("HTTP://127.0.0.1:18090", listOf(video), granted = true),
        )
        assertEquals(
            CameraGrantPolicy.Decision.GRANT,
            CameraGrantPolicy.decide(
                "http://127.0.0.1:18090", listOf(video), "HTTP", "127.0.0.1", port, cameraPermissionGranted = true,
            ),
        )
    }

    @Test
    fun resourceSetMustBeExactlyOneVideoResource() {
        for (resources in listOf(
            emptyList(), // nothing requested
            listOf(audio), // audio only — never granted (RECORD_AUDIO undeclared)
            listOf(video, audio), // video+audio
            listOf(video, video), // duplicated — not exactly one
            listOf("android.webkit.resource.unknown"),
            listOf("android.webkit.resource.video_capture"), // case drift is a different string
        )) {
            assertEquals(
                "resources must DENY_UNSUPPORTED_RESOURCE: $resources",
                CameraGrantPolicy.Decision.DENY_UNSUPPORTED_RESOURCE,
                decide("http://127.0.0.1:18090", resources, granted = true),
            )
        }
    }

    @Test
    fun denyOrderingPutsForeignOriginBeforeResourceVerdict() {
        // A foreign origin with a bad resource set still reports the origin verdict (deny-first).
        assertEquals(
            CameraGrantPolicy.Decision.DENY_FOREIGN_ORIGIN,
            decide("http://attacker.invalid:18090", listOf(audio)),
        )
    }

    @Test
    fun grantableResourcesIsExactlyTheVideoResource() {
        val grantable = CameraGrantPolicy.grantableResources()
        assertEquals(listOf(video), grantable)
        assertTrue(grantable.none { it == audio })
    }
}
