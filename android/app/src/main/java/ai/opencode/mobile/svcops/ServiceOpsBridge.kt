package ai.opencode.mobile.svcops

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
 * The native side of the service ops bridge (issue #7, decision 0004 §2.1) — the FOURTH
 * protocol-isolated WebMessage bridge.
 *
 * This bridge is a protocol-isolated MIRROR of the ssh bridge
 * (ai.opencode.mobile.ssh.SshTunnelBridge), which mirrors the probe bridge, which mirrors
 * the credential vault bridge — same channel mechanics, entirely separate protocol. The
 * four never capture each other's handshakes (each side compares its handshake string by
 * strict equality and validates the port count), and this bridge's lifecycle never resets
 * the other bridges' ack lifecycles: the vault gates C1–C5, the probe gate G16 and the
 * ssh behavior are not perturbed by this bridge's existence (G18 covers the four-bridge
 * bring-up on device).
 *
 * Channel establishment is NATIVE-initiated over the platform WebMessage channel — the
 * same three-layer trust as vault/probe/ssh (docs/design/architecture.md):
 *   1. platform-enforced targetOrigin (frames on other origins never receive port2);
 *   2. port confinement (the page captures port2 into its closure, never a global);
 *   3. zero capability before ack (no operation is served from an un-acked session).
 * event.origin is never consulted (embedder-posted messages carry an empty origin by
 * platform construction). Retries rebuild the channel (a transferred port2 can never be
 * re-posted); budget 5 x 500 ms; the ack lifecycle resets on every navigation.
 *
 * Messages are JSON strings both ways with requestId correlation (zero binary). Operations:
 *   exec {host, port, os, templateId, params, credential?, pinnedFingerprint?}
 *        -> {exitCode, stdout, stderr, stdoutTruncated, stderrTruncated}
 *   cancel {host, port} -> {}
 * The protocol carries {templateId, params, os} ONLY — never a command string. The
 * command is assembled natively by ServiceCommandValidator (the app's ONLY setCommand
 * call site, in ServiceOpsManager) and anything not on the whitelist is refused
 * (exec-denied, fail-closed).
 *
 * Credential boundary (N7 — verbatim inheritance of decision 0003 §4): the exec request
 * carries the per-command resolved credential ONCE; it lives for the duration of that one
 * command in memory only, is never logged, never persisted, never echoed — responses
 * carry exit codes, bounded output and classifications only. Host-key trust is NEVER
 * established here: an unknown/changed fingerprint is refused (host-key-unknown) so the
 * page routes back to the connection flow, and NO credential is issued before a
 * fingerprint is confirmed.
 *
 * Lifecycle red line (AGENTS.md, double-written with ServiceOpsManager): a cancel only
 * closes the local exec channel/session — the remote OpenCode service keeps running and
 * no remote task is ever stopped because the client disconnected or cancelled.
 *
 * Threading: exec runs on the work executor (bounded, never the main thread); cancel is
 * dispatched OFF the work executor (the manager's cancel only closes handles and returns
 * immediately), so a cancel is never queued behind an in-flight exec; responses are
 * posted to the page from the main handler (the port was created there).
 */
class ServiceOpsBridge(
    context: android.content.Context,
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-svcops-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://127.0.0.1:18090")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val REQUEST_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val HOST = Regex("^[A-Za-z0-9._-]{1,253}$")
        // The SSH username from the target's user@ segment (review B2): a routing fact,
        // NOT a credential — validated like any request field, never logged.
        private val USERNAME = Regex("^[A-Za-z0-9._-]{1,32}$")
        private val OS_DOMAINS = setOf("linux", "darwin", "windows")
        private val TEMPLATE_ID = Regex("^[a-z0-9.-]{1,64}$")
        private const val MAX_PORT = 65535
        private const val MAX_PARAMS = 4
        private const val MAX_PARAM_BYTES = 512
        private const val MAX_CREDENTIAL_BYTES = 65_536 // the vault bound (native re-check)
        private val FINGERPRINT = Regex("^SHA256:[A-Za-z0-9+/]{43}$")
        private val OPERATIONS = setOf("exec", "cancel")
    }

    private val manager = ServiceOpsManager(context)
    private val work: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "opencode-mobile-svcops-bridge").apply { isDaemon = true }
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
     * resets here BY DESIGN (navigation-scoped ack lifecycle, mirroring vault/probe/ssh).
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
            Log.w(TAG, "svcops: handshake post failed")
            // Do NOT close/bump the round here: scheduleRetry(round) must see the live
            // round (the same failure mode the vault bridge review fixed — B2). The retry
            // callback itself rebuilds the channel.
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
            Log.w(TAG, "svcops: handshake retries exhausted; svcops bridge stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "svcops: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "svcops: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "svcops: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3).
                if (!acked) {
                    Log.w(TAG, "svcops: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op !in OPERATIONS) {
                    Log.w(TAG, "svcops: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!REQUEST_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "svcops: dropping request with malformed requestId")
                    return
                }
                val params = json.optJSONObject("params")
                if (params == null) {
                    Log.w(TAG, "svcops: dropping request without params")
                    respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                    return
                }
                // Strict shape validation before anything touches the manager (no eval,
                // no dynamic routing; values are never logged).
                val host = params.optString("host")
                val port = params.optInt("port")
                if (!HOST.matches(host) || port !in 1..MAX_PORT) {
                    Log.w(TAG, "svcops: dropping request with refused target shape")
                    respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                    return
                }
                val username =
                    if (params.has("username") && !params.isNull("username")) params.optString("username") else null
                if (username != null && !USERNAME.matches(username)) {
                    Log.w(TAG, "svcops: dropping request with malformed username")
                    respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                    return
                }
                when (op) {
                    "cancel" -> {
                        manager.cancel(host, port)
                        respondNow(id)
                    }
                    "exec" -> {
                        val os = params.optString("os")
                        if (os !in OS_DOMAINS) {
                            Log.w(TAG, "svcops: dropping exec with refused os domain")
                            respondError(id, ServiceOpsErrorCode.OS_UNKNOWN)
                            return
                        }
                        val templateId = params.optString("templateId")
                        if (!TEMPLATE_ID.matches(templateId)) {
                            Log.w(TAG, "svcops: dropping exec with refused template id shape")
                            respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                            return
                        }
                        val templateParams = params.optJSONObject("params") ?: JSONObject()
                        if (templateParams.length() > MAX_PARAMS) {
                            Log.w(TAG, "svcops: dropping exec with too many template params")
                            respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                            return
                        }
                        val paramMap = LinkedHashMap<String, String>()
                        for (paramKey in templateParams.keys()) {
                            val value = templateParams.optString(paramKey)
                            if (value.length > MAX_PARAM_BYTES) {
                                Log.w(TAG, "svcops: dropping exec with oversized param value")
                                respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                                return
                            }
                            paramMap[paramKey] = value
                        }
                        val credential =
                            if (params.has("credential") && !params.isNull("credential")) params.optString("credential") else null
                        if (credential != null && credential.toByteArray(Charsets.UTF_8).size > MAX_CREDENTIAL_BYTES) {
                            Log.w(TAG, "svcops: dropping exec with oversized credential")
                            respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                            return
                        }
                        val pinned =
                            if (params.has("pinnedFingerprint") && !params.isNull("pinnedFingerprint")) params.optString("pinnedFingerprint") else null
                        if (pinned != null && !FINGERPRINT.matches(pinned)) {
                            Log.w(TAG, "svcops: dropping exec with malformed pinned fingerprint")
                            respondError(id, ServiceOpsErrorCode.EXEC_DENIED)
                            return
                        }
                        respond(id) {
                            manager.exec(host, port, username, os, templateId, paramMap, credential, pinned)
                        }
                    }
                    else -> respondError(id, ServiceOpsErrorCode.EXEC_DENIED) // unreachable behind the whitelist
                }
            }
        }
    }

    /**
     * Runs [block] on the work executor (exec work must never touch the main thread) and
     * answers exactly one JSON response. ServiceOpsException answers its wire code;
     * anything else answers "exec-failed" — a cause is never fabricated, a value is never
     * echoed (message stays empty: zero-echo discipline).
     */
    private fun respond(requestId: String, block: () -> JSONObject) {
        work.execute {
            val response = try {
                JSONObject().put("id", requestId).put("ok", true).put("result", block())
            } catch (e: ServiceOpsException) {
                Log.w(TAG, "svcops: operation failed (${e.code.wire})")
                errorResponse(requestId, e.code)
            } catch (e: Exception) {
                Log.w(TAG, "svcops: operation failed (${ServiceOpsErrorCode.EXEC_FAILED.wire})")
                errorResponse(requestId, ServiceOpsErrorCode.EXEC_FAILED)
            }
            mainHandler.post { pushToPage(response) }
        }
    }

    /** An immediate empty-success ack for ops that were already dispatched. */
    private fun respondNow(requestId: String) {
        val response = JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject())
        mainHandler.post { pushToPage(response) }
    }

    private fun respondError(requestId: String, code: ServiceOpsErrorCode) {
        mainHandler.post { pushToPage(errorResponse(requestId, code)) }
    }

    private fun errorResponse(requestId: String, code: ServiceOpsErrorCode): JSONObject =
        JSONObject().put("id", requestId).put("ok", false).put("code", code.wire).put("message", "")

    private fun pushToPage(json: JSONObject) {
        val port = port1
        if (port == null) {
            Log.w(TAG, "svcops: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "svcops: response post failed")
        }
    }
}
