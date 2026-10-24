package ai.opencode.mobile.vault

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

/**
 * The native side of the credential vault bridge (issue #4, decision D1).
 *
 * Channel establishment is NATIVE-initiated over the platform WebMessage channel (API 23+,
 * zero new dependencies, zero androidx — the androidx WebMessageListener does not exist on
 * this platform and addJavascriptInterface is rejected: no origin constraint):
 *
 *  1. onPageFinished -> createWebMessageChannel() -> [port1, port2]; port1 gets the inbound
 *     callback; the handshake string + port2 are posted with a targetOrigin of
 *     http://127.0.0.1:18090 (the platform ENFORCES targetOrigin: frames on other origins
 *     never receive port2 — trust layer 1; see docs/design/architecture.md).
 *  2. The page validates the handshake shape, captures port2 into its closure and answers
 *     {"op":"ack"} over port2. Until that ack arrives the page-side vault reports
 *     unavailable and this side serves no operations (zero capability before ack — trust
 *     layer 3). NOTE: embedder-posted messages carry an EMPTY event.origin by platform
 *     construction (AwContents.postMessageToMainFrame hardcodes sourceOrigin=null), which
 *     is why the handshake is shape-validated instead of origin-compared.
 *  3. Retries: a transferred port2 can NEVER be re-posted (IllegalStateException), so every
 *     retry REBUILDS the channel (new port pair) and closes the old port1 first. Budget:
 *     5 attempts x 500 ms. After the budget, a session that was NEVER acked is demoted to
 *     unavailable (explicit state, no plaintext fallback); an already-acked session is
 *     never demoted by the retry path.
 *  4. Ack lifecycle resets on navigation: every onPageFinished starts a new handshake
 *     round (the previous page's port is dead; acked=false again).
 *
 * Messages are JSON strings in both directions (zero binary across the bridge) with a
 * requestId correlation. Inbound operations run through a strict whitelist and shape
 * validation below — no eval, no dynamic routing, no reflection. Logs carry fixed tags and
 * op names/counters only, NEVER values (zero-value logging red line).
 */
class CredentialVaultBridge(
    context: android.content.Context,
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-vault-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://127.0.0.1:18090")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val ENTRY_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val KINDS = setOf("password", "privateKey")
        private val OPERATIONS = setOf("put", "remove", "get", "list")
    }

    private val store = VaultStore(context)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var port1: WebMessagePort? = null
    /** True once the live session answered ack; suppressed handshakes and reset on navigation. */
    private var acked = false
    private var retryAttempt = 0
    private var handshakeRound = 0
    private var destroyed = false

    /**
     * Start one handshake round. Called from WebViewClient.onPageFinished. The ack flag
     * resets here BY DESIGN: each page load opens a new handshake round (ack lifecycle
     * reset — see class doc point 4).
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
            Log.w(TAG, "vault: handshake post failed")
            // Do NOT close/bump the round here: scheduleRetry(round) must see the live round
            // or the guard would swallow this retry and the page load would get ZERO retries.
            // The retry callback itself closes the old channel before rebuilding.
            scheduleRetry(round)
            return
        }
        scheduleRetry(round)
    }

    /**
     * One bounded retry: rebuild the channel (the transferred port2 cannot be re-posted) and
     * re-post the handshake — but only while this round is current and still un-acked. A
     * never-acked session that exhausts the budget stays unavailable (explicit state); an
     * acked session never reaches this path (ack cancels the pending retry).
     */
    private fun scheduleRetry(round: Int) {
        if (destroyed || acked || round != handshakeRound) return
        retryAttempt += 1
        if (retryAttempt > MAX_RETRIES) {
            Log.w(TAG, "vault: handshake retries exhausted; vault stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "vault: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "vault: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "vault: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3, docs/design/units/connection.md):
                // operations are only served from a session that answered the handshake.
                if (!acked) {
                    Log.w(TAG, "vault: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op !in OPERATIONS) {
                    Log.w(TAG, "vault: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!ENTRY_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "vault: dropping request with malformed requestId")
                    return
                }
                respond(id) { dispatch(op, json.optJSONObject("params") ?: JSONObject()) }
            }
        }
    }

    /** Runs [block] off the response path's happy case and answers exactly one JSON response. */
    private fun respond(requestId: String, block: () -> Any?) {
        val response = try {
            JSONObject().put("id", requestId).put("ok", true).put("result", block() ?: JSONObject.NULL)
        } catch (e: VaultException) {
            JSONObject().put("id", requestId).put("ok", false).put("code", e.code).put("message", e.message ?: "")
        } catch (e: Exception) {
            Log.w(TAG, "vault: operation failed (io)")
            JSONObject().put("id", requestId).put("ok", false).put("code", "io").put("message", "")
        }
        postToPage(response)
    }

    /** Strict operation whitelist + shape validation before anything touches the store. */
    private fun dispatch(op: String, params: JSONObject): Any? {
        return when (op) {
            "put" -> {
                val kind = params.optString("kind")
                if (kind !in KINDS) throw VaultException("io", "unknown credential kind")
                val value = params.optString("value")
                if (value.isEmpty()) throw VaultException("io", "empty value (native re-check)")
                val bytes = value.toByteArray(Charsets.UTF_8)
                if (bytes.size > VaultStore.MAX_VALUE_BYTES) throw VaultException("io", "value exceeds the 64 KiB bound (native re-check)")
                val label = if (params.has("label") && !params.isNull("label")) params.optString("label").takeIf { it.isNotEmpty() } else null
                val existingId = if (params.has("existingId") && !params.isNull("existingId")) params.optString("existingId") else null
                if (existingId != null && !ENTRY_ID.matches(existingId)) throw VaultException("io", "malformed existingId")
                val newId = existingId ?: java.util.UUID.randomUUID().toString()
                store.put(newId, kind, bytes, label, existingId)
            }
            "remove" -> {
                store.remove(requireEntryId(params))
                null
            }
            "get" -> {
                val value = store.get(requireEntryId(params)) ?: return null
                String(value, Charsets.UTF_8) // empty plaintexts are never sealed, so this is total
            }
            "list" -> {
                val result = store.list()
                JSONArray().also { out ->
                    for (i in 0 until result.length()) out.put(result.getJSONObject(i))
                }
            }
            else -> throw VaultException("io", "unknown op") // unreachable behind the whitelist
        }
    }

    private fun requireEntryId(params: JSONObject): String {
        val id = params.optString("id")
        if (!ENTRY_ID.matches(id)) throw VaultException("io", "malformed entry id")
        return id
    }

    private fun postToPage(json: JSONObject) {
        val port = port1
        if (port == null) {
            Log.w(TAG, "vault: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "vault: response post failed")
        }
    }
}
