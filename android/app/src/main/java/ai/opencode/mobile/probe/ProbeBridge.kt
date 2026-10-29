package ai.opencode.mobile.probe

import ai.opencode.mobile.WebAssetServer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The native side of the endpoint probe bridge (issue #5, decision 0002 D2/F1).
 *
 * This bridge is a protocol-isolated MIRROR of the credential vault bridge
 * (ai.opencode.mobile.vault.CredentialVaultBridge) — same channel mechanics, entirely
 * separate protocol. The two never capture each other's handshakes (each side compares
 * its handshake string by strict equality and validates the port count), and this
 * bridge's lifecycle never resets or gates the vault bridge's, so the vault gates
 * C1–C5 are not perturbed by the probe's existence.
 *
 * Channel establishment is NATIVE-initiated over the platform WebMessage channel (API
 * 23+, zero new dependencies, zero androidx):
 *
 *  1. onPageFinished -> createWebMessageChannel() -> [port1, port2]; port1 gets the
 *     inbound callback; the handshake string + port2 are posted with a targetOrigin of
 *     http://127.0.0.1:18090 (platform ENFORCED: frames on other origins never receive
 *     port2 — trust layer 1).
 *  2. The page validates the handshake SHAPE (data equality + exactly one port; event
 *     .origin is never consulted — embedder-posted messages carry an empty origin by
 *     platform construction), captures port2 into its closure (trust layer 2) and
 *     answers {"op":"ack"}. Until that ack arrives this side serves no operations
 *     (trust layer 3, zero capability before ack).
 *  3. Retries: a transferred port2 can NEVER be re-posted, so every retry REBUILDS the
 *     channel and closes the old port1 first. Budget: 5 attempts x 500 ms; a never-acked
 *     session stays unavailable afterwards (explicit state; the JS probe client answers
 *     unavailable and the dialog degrades to the generic error — no fabricated classes).
 *  4. Ack lifecycle resets on navigation (every onPageFinished starts a new round).
 *
 * Messages are JSON strings both ways with requestId correlation. Inbound requests run
 * through a strict whitelist and shape validation (no eval, no dynamic routing, no
 * reflection). Network probes execute on a single background executor (never the main
 * thread) and are bounded: connect 8s + read 8s worst case, under the JS-side 20s
 * request timeout.
 *
 * Zero-value logging red line: logs carry fixed tags and op names/counters only — never
 * the request URL, never the Authorization header, never any credential value. Probe
 * results carry only the classification code; responses never echo URLs or passwords.
 */
class ProbeBridge(
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-probe-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val REQUEST_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private const val OPERATION_PROBE = "probe"
        private const val MAX_URL_LENGTH = 2048
        private const val MAX_PASSWORD_BYTES = 4096
    }

    private val probe = DirectEndpointProbe()
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "opencode-mobile-probe").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var port1: WebMessagePort? = null
    /** True once the live session answered ack; suppressed handshakes and reset on navigation. */
    private var acked = false
    private var retryAttempt = 0
    private var handshakeRound = 0
    private var destroyed = false

    /**
     * Start one handshake round. Called from WebViewClient.onPageFinished. The ack flag
     * resets here BY DESIGN: each page load opens a new handshake round (navigation-
     * scoped ack lifecycle, mirroring the vault bridge).
     */
    fun onPageFinished() {
        if (destroyed) return
        closeChannel()
        acked = false
        retryAttempt = 0
        startHandshake()
    }

    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
        closeChannel()
    }

    private fun closeChannel() {
        handshakeRound += 1 // invalidate any in-flight retry for the previous round
        try {
            port1?.close()
        } catch (e: Exception) {
            // Closing a dead port must never mask the handshake flow.
        }
        port1 = null
    }

    private fun startHandshake() {
        val round = handshakeRound
        val channel = webView.createWebMessageChannel()
        val nativePort = channel[0]
        val pagePort = channel[1]
        nativePort.setWebMessageCallback(
            object : WebMessagePort.WebMessageCallback() {
                override fun onMessage(port: WebMessagePort, message: WebMessage) {
                    handleClientMessage(message.data ?: return)
                }
            },
        )
        port1 = nativePort
        try {
            // platform-enforced targetOrigin: the page on another origin never sees pagePort.
            webView.postWebMessage(WebMessage(HANDSHAKE, arrayOf(pagePort)), TARGET_ORIGIN)
        } catch (e: Exception) {
            Log.w(TAG, "probe: handshake post failed")
            // Do NOT close/bump the round here: scheduleRetry(round) must see the live round
            // or the guard would swallow this retry and the page load would get ZERO retries
            // (same failure mode the vault bridge review fixed — B2).
            scheduleRetry(round)
            return
        }
        scheduleRetry(round)
    }

    /**
     * One bounded retry: rebuild the channel (the transferred port2 cannot be re-posted)
     * and re-post the handshake — but only while this round is current and still
     * un-acked. A never-acked session that exhausts the budget stays unavailable; an
     * acked session never reaches this path (ack cancels the pending retry).
     */
    private fun scheduleRetry(round: Int) {
        if (destroyed || acked || round != handshakeRound) return
        retryAttempt += 1
        if (retryAttempt > MAX_RETRIES) {
            Log.w(TAG, "probe: handshake retries exhausted; probe stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "probe: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "probe: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "probe: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3): probes are only served from
                // a session that answered the handshake.
                if (!acked) {
                    Log.w(TAG, "probe: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op != OPERATION_PROBE) {
                    Log.w(TAG, "probe: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!REQUEST_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "probe: dropping request with malformed requestId")
                    return
                }
                val params = json.optJSONObject("params")
                if (params == null) {
                    Log.w(TAG, "probe: dropping request without params")
                    respondError(id, "io")
                    return
                }
                val url = params.optString("url")
                val password = if (params.has("password") && !params.isNull("password")) params.optString("password") else null
                // Native re-check of the URL policy (decision 0002 D-URL + shape bounds).
                // The URL is validated, never logged; a refused shape answers an error and
                // the JS side degrades to unavailable.
                if (url.isEmpty() || url.length > MAX_URL_LENGTH || DirectEndpointProbe.probeEndpoint(url) == null) {
                    Log.w(TAG, "probe: dropping request with refused url shape")
                    respondError(id, "io")
                    return
                }
                if (password != null && password.toByteArray(Charsets.UTF_8).size > MAX_PASSWORD_BYTES) {
                    Log.w(TAG, "probe: dropping request with oversized password")
                    respondError(id, "io")
                    return
                }
                respond(id) {
                    val code = probe.classify(url, password)
                    // null = unclassified (transport answered oddly / 3xx left the route):
                    // an error response keeps the JS side honest — unavailable, not a guess.
                    // The enum is mapped to its JS wire string here (the respond face takes
                    // the already-mapped name; first Kotlin compile probe of issue #7 S5
                    // surfaced this latent type error from issue #5 — never compiled
                    // before for lack of an SDK).
                    code?.let { codeName(it) } ?: throw ProbeRefusedException()
                }
            }
        }
    }

    private class ProbeRefusedException : Exception("probe refused")

    /**
     * Runs [block] on the probe executor (network must never touch the main thread) and
     * answers exactly one JSON response. The result payload carries ONLY the
     * classification code string — no URL, no header, no credential echo.
     */
    private fun respond(requestId: String, block: () -> String) {
        executor.execute {
            val response = try {
                JSONObject()
                    .put("id", requestId)
                    .put("ok", true)
                    .put("result", JSONObject().put("code", block()))
            } catch (e: ProbeRefusedException) {
                JSONObject().put("id", requestId).put("ok", false).put("code", "io").put("message", "")
            } catch (e: Exception) {
                Log.w(TAG, "probe: classification failed (io)")
                JSONObject().put("id", requestId).put("ok", false).put("code", "io").put("message", "")
            }
            mainHandler.post { postToPage(response) }
        }
    }

    /** Enum name -> the JS-side DirectErrorCode wire string. */
    private fun codeName(code: DirectEndpointProbe.Code): String = when (code) {
        DirectEndpointProbe.Code.OK -> "ok"
        DirectEndpointProbe.Code.CERT_EXPIRED -> "cert-expired"
        DirectEndpointProbe.Code.CERT_HOSTNAME -> "cert-hostname"
        DirectEndpointProbe.Code.CERT_UNTRUSTED -> "cert-untrusted"
        DirectEndpointProbe.Code.CLEARTEXT_BLOCKED -> "cleartext-blocked"
        DirectEndpointProbe.Code.REFUSED -> "refused"
        DirectEndpointProbe.Code.TIMEOUT -> "timeout"
        DirectEndpointProbe.Code.DNS -> "dns"
        DirectEndpointProbe.Code.UNAUTHORIZED -> "unauthorized"
        DirectEndpointProbe.Code.FORBIDDEN -> "forbidden"
        DirectEndpointProbe.Code.NOT_FOUND -> "not-found"
        DirectEndpointProbe.Code.HTML_RESPONSE -> "html-response"
    }

    private fun respondError(requestId: String, code: String) {
        val response = JSONObject().put("id", requestId).put("ok", false).put("code", code).put("message", "")
        mainHandler.post { postToPage(response) }
    }

    private fun postToPage(json: JSONObject) {
        val port = port1
        if (port == null) {
            Log.w(TAG, "probe: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "probe: response post failed")
        }
    }
}
