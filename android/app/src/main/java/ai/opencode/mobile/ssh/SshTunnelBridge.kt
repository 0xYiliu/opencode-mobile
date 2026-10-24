package ai.opencode.mobile.ssh

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
 * The native side of the SSH tunnel bridge (issue #6, decision 0003 §2).
 *
 * This bridge is a protocol-isolated MIRROR of the probe bridge
 * (ai.opencode.mobile.probe.ProbeBridge), which is itself a mirror of the credential vault
 * bridge — same channel mechanics, entirely separate protocol. The three never capture each
 * other's handshakes (each side compares its handshake string by strict equality and
 * validates the port count), and this bridge's lifecycle never resets the other bridges'
 * ack lifecycles: the vault gates C1-C5 and the probe gate G16 are not perturbed by this
 * bridge's existence (G17 covers the three-bridge bring-up on device).
 *
 * Channel establishment is NATIVE-initiated over the platform WebMessage channel — the same
 * three-layer trust as vault/probe (docs/design/architecture.md):
 *   1. platform-enforced targetOrigin (frames on other origins never receive port2);
 *   2. port confinement (the page captures port2 into its closure, never a global);
 *   3. zero capability before ack (no operation is served from an un-acked session).
 * event.origin is never consulted (embedder-posted messages carry an empty origin by
 * platform construction). Retries rebuild the channel (a transferred port2 can never be
 * re-posted); budget 5 x 500 ms; the ack lifecycle resets on every navigation.
 *
 * Messages are JSON strings both ways with requestId correlation (zero binary). Operations:
 *   fetchHostKey {host, port}                      -> {decision:trust|prompt, fingerprint}
 *   connect {host, port, servicePort, credential?, pinnedFingerprint?} -> {url}
 *   disconnect {host, port} / cancel {host, port}  -> {}
 *   removeHostKey {host, port}                     -> {}
 * Unsolicited native event (no requestId): {"event":"connectionLost","host":...,"port":...}.
 *
 * Credential boundary (decision 0003 §4): the connect request carries the resolved
 * credential (password or key envelope) ONCE; it lives for the duration of the attempt in
 * memory only, is never logged, never persisted, never echoed — responses carry
 * classifications/endpoints only. Zero-value logging: fixed tags, op names, wire codes —
 * no hosts, no ports, no values.
 *
 * Threading (F6): connect/scan run on the work executor (bounded, never the main thread);
 * cancel/disconnect are forwarded to the manager's dedicated teardown thread so a teardown
 * never queues behind an in-flight connect; responses are posted to the page from the main
 * handler (the port was created there).
 */
class SshTunnelBridge(
    context: android.content.Context,
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-ssh-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://127.0.0.1:18090")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val REQUEST_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val HOST = Regex("^[A-Za-z0-9._-]{1,253}$")
        // The SSH username from the target's user@ segment (issue #7 review B2): a
        // routing fact, NOT a credential — validated like any request field, never logged.
        private val USERNAME = Regex("^[A-Za-z0-9._-]{1,32}$")
        private const val MAX_PORT = 65535
        private const val MAX_CREDENTIAL_BYTES = 65_536 // the vault bound (native re-check)
        private val FINGERPRINT = Regex("^SHA256:[A-Za-z0-9+/]{43}$")
        private val OPERATIONS = setOf("connect", "disconnect", "fetchHostKey", "removeHostKey", "cancel")
    }

    private val manager = SshTunnelManager(context)
    private val work: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "opencode-mobile-ssh-bridge").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var port1: WebMessagePort? = null
    /** True once the live session answered ack; suppressed handshakes and reset on navigation. */
    private var acked = false
    private var retryAttempt = 0
    private var handshakeRound = 0
    private var destroyed = false

    init {
        // Client-side tunnel loss -> the machine's T9 (offline; the remote keeps running).
        // The watchdog thread only reads state; the event is posted to the page from here.
        manager.onConnectionLost = { host, port ->
            val payload = JSONObject()
                .put("event", "connectionLost")
                .put("host", host)
                .put("port", port)
            mainHandler.post { pushToPage(payload) }
        }
    }

    /**
     * Start one handshake round. Called from WebViewClient.onPageFinished. The ack flag
     * resets here BY DESIGN (navigation-scoped ack lifecycle, mirroring vault/probe).
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
        manager.destroy()
        work.shutdownNow()
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
            Log.w(TAG, "ssh: handshake post failed")
            // Do NOT close/bump the round here: scheduleRetry(round) must see the live round
            // or the guard would swallow this retry (same failure mode the vault bridge
            // review fixed — B2). The retry callback itself rebuilds the channel.
            scheduleRetry(round)
            return
        }
        scheduleRetry(round)
    }

    /** One bounded retry: rebuild the channel (port2 cannot be re-posted) and re-post. */
    private fun scheduleRetry(round: Int) {
        if (destroyed || acked || round != handshakeRound) return
        retryAttempt += 1
        if (retryAttempt > MAX_RETRIES) {
            Log.w(TAG, "ssh: handshake retries exhausted; ssh bridge stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "ssh: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "ssh: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "ssh: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3).
                if (!acked) {
                    Log.w(TAG, "ssh: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op !in OPERATIONS) {
                    Log.w(TAG, "ssh: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!REQUEST_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "ssh: dropping request with malformed requestId")
                    return
                }
                val params = json.optJSONObject("params")
                if (params == null) {
                    Log.w(TAG, "ssh: dropping request without params")
                    respondError(id, SshErrorCode.IO)
                    return
                }
                // Strict shape validation before anything touches the manager (no eval, no
                // dynamic routing; values are never logged).
                val host = params.optString("host")
                val port = params.optInt("port")
                if (!HOST.matches(host) || port !in 1..MAX_PORT) {
                    Log.w(TAG, "ssh: dropping request with refused target shape")
                    respondError(id, SshErrorCode.IO)
                    return
                }
                when (op) {
                    "fetchHostKey" -> respond(id) { manager.fetchHostKeyDecision(host, port) }
                    "removeHostKey" -> respond(id) {
                        manager.removeHostKey(host, port)
                        JSONObject()
                    }
                    // cancel/disconnect (review N2): dispatched OFF the work executor —
                    // manager.cancel/disconnect only enqueue on the manager's dedicated
                    // teardown thread and return immediately, so a teardown is never queued
                    // behind an in-flight connect (F6). The ack is posted right away.
                    "cancel" -> {
                        manager.cancel(host, port)
                        respondNow(id)
                    }
                    "disconnect" -> {
                        manager.disconnect(host, port)
                        respondNow(id)
                    }
                    "connect" -> {
                        val username =
                            if (params.has("username") && !params.isNull("username")) params.optString("username") else null
                        if (username != null && !USERNAME.matches(username)) {
                            Log.w(TAG, "ssh: dropping connect with malformed username")
                            respondError(id, SshErrorCode.IO)
                            return
                        }
                        val servicePort = params.optInt("servicePort")
                        if (servicePort !in 1..MAX_PORT) {
                            Log.w(TAG, "ssh: dropping connect with refused service port")
                            respondError(id, SshErrorCode.IO)
                            return
                        }
                        val credential = if (params.has("credential") && !params.isNull("credential")) params.optString("credential") else null
                        if (credential != null && credential.toByteArray(Charsets.UTF_8).size > MAX_CREDENTIAL_BYTES) {
                            Log.w(TAG, "ssh: dropping connect with oversized credential")
                            respondError(id, SshErrorCode.IO)
                            return
                        }
                        val pinned = if (params.has("pinnedFingerprint") && !params.isNull("pinnedFingerprint")) params.optString("pinnedFingerprint") else null
                        if (pinned != null && !FINGERPRINT.matches(pinned)) {
                            Log.w(TAG, "ssh: dropping connect with malformed pinned fingerprint")
                            respondError(id, SshErrorCode.IO)
                            return
                        }
                        respond(id) {
                            JSONObject().put("url", manager.connect(username, host, port, servicePort, credential, pinned))
                        }
                    }
                    else -> respondError(id, SshErrorCode.IO) // unreachable behind the whitelist
                }
            }
        }
    }

    /**
     * Runs [block] on the work executor (SSH work must never touch the main thread) and
     * answers exactly one JSON response. SshException answers its wire code; anything else
     * answers "io" — a cause is never fabricated, a value is never echoed.
     */
    private fun respond(requestId: String, block: () -> JSONObject) {
        work.execute {
            val response = try {
                JSONObject().put("id", requestId).put("ok", true).put("result", block())
            } catch (e: SshException) {
                Log.w(TAG, "ssh: operation failed (${e.code.wire})")
                JSONObject().put("id", requestId).put("ok", false).put("code", e.code.wire).put("message", "")
            } catch (e: Exception) {
                Log.w(TAG, "ssh: operation failed (${SshErrorCode.IO.wire})")
                JSONObject().put("id", requestId).put("ok", false).put("code", SshErrorCode.IO.wire).put("message", "")
            }
            mainHandler.post { pushToPage(response) }
        }
    }

    /** An immediate empty-success ack for ops that were already dispatched (review N2). */
    private fun respondNow(requestId: String) {
        val response = JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject())
        mainHandler.post { pushToPage(response) }
    }

    private fun respondError(requestId: String, code: SshErrorCode) {
        val response = JSONObject().put("id", requestId).put("ok", false).put("code", code.wire).put("message", "")
        mainHandler.post { pushToPage(response) }
    }

    private fun pushToPage(json: JSONObject) {
        val port = port1
        if (port == null) {
            Log.w(TAG, "ssh: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "ssh: response post failed")
        }
    }
}
