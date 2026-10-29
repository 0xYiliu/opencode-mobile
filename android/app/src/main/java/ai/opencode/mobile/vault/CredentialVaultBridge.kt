package ai.opencode.mobile.vault

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import ai.opencode.mobile.BuildConfig
import ai.opencode.mobile.WebAssetServer
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Origin/frame constrained AndroidX WebKit vault message listener (protocol v2). */
class CredentialVaultBridge(context: Context, private val webView: WebView) {
    companion object {
        const val JS_OBJECT = "opencodeMobileVaultV2"
        private const val PROTOCOL_MARKER = "mobile(vault-v2): Keystore envelope v1 over origin-bound AndroidX WebMessageListener"
        private const val TAG = "OpencodeShell"
        private val worker = ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
            ArrayBlockingQueue(8), { r -> Thread(r, "vault-serial").apply { isDaemon = true } },
            ThreadPoolExecutor.AbortPolicy())
    }

    private val store = VaultStore(context.applicationContext)
    private val lifecycle = VaultGenerationGate()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val replyDispatcher = VaultReplyDispatcher(lifecycle) { task -> mainHandler.post(task) }

    /** Register after the asset listener is bound, before the first loadUrl. */
    fun register(): Boolean {
        if (!VaultOriginPolicy.canRegister(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))) {
            Log.e(TAG, "vault: WebMessageListener unsupported; unavailable")
            return false
        }
        return try {
            WebViewCompat.addWebMessageListener(webView, JS_OBJECT, setOf("http://${WebAssetServer.LOOPBACK_HOST}:${BuildConfig.WEB_ASSET_PORT}")) { _, message, sourceOrigin, isMainFrame, replyProxy ->
                if (lifecycle.isDestroyed() || !VaultOriginPolicy.shouldAcceptMessage(isMainFrame, sourceOrigin.scheme, sourceOrigin.host, sourceOrigin.port, sourceOrigin.userInfo)) return@addWebMessageListener
                val token = lifecycle.snapshot()
                val raw = message.data ?: return@addWebMessageListener
                val preflightFailure = preflight(raw)
                if (preflightFailure != null) {
                    replyDispatcher.post(token, preflightFailure.toString()) { response ->
                        try { replyProxy.postMessage(response) }
                        catch (_: Exception) { /* navigation may have invalidated this frame */ }
                    }
                    return@addWebMessageListener
                }
                try {
                    worker.execute {
                        if (!lifecycle.isCurrent(token)) return@execute
                        val response = process(raw, token)
                        replyDispatcher.post(token, response.toString()) { mainResponse ->
                            try { replyProxy.postMessage(mainResponse) }
                            catch (_: Exception) { /* navigation may have invalidated this frame */ }
                        }
                    }
                } catch (_: java.util.concurrent.RejectedExecutionException) {
                    val response = errorResponse(JSONObject(raw).optString("id"), "unavailable", "vault busy").toString()
                    replyDispatcher.post(token, response) { mainResponse ->
                        try { replyProxy.postMessage(mainResponse) }
                        catch (_: Exception) { /* navigation may have invalidated this frame */ }
                    }
                }
            }
            Log.i(TAG, "vault: AndroidX listener registered")
            true
        } catch (_: Exception) {
            Log.e(TAG, "vault: listener registration failed; unavailable")
            false
        }
    }

    /** Called on top-level navigation start; running storage work finishes but cannot reply. */
    fun onNavigationStarted() { lifecycle.onNavigationStarted() }

    fun destroy() {
        lifecycle.destroy()
        try { WebViewCompat.removeWebMessageListener(webView, JS_OBJECT) } catch (_: Exception) { }
    }

    /** Reject oversized and oversized-secret requests before they occupy a worker queue slot. */
    private fun preflight(raw: String): JSONObject? {
        if (!VaultRequestLimits.isEnvelopeWithinBound(raw)) {
            val id = VaultRequestLimits.leadingRequestId(raw)
            return id?.let { errorResponse(it, "io", "request too large") }
                ?: JSONObject().put("id", "").put("ok", false).put("code", "io").put("message", "request too large")
        }
        val request = try { JSONObject(raw) } catch (_: Exception) {
            val id = VaultRequestLimits.leadingRequestId(raw)
            return JSONObject().put("id", id ?: "").put("ok", false).put("code", "io").put("message", "malformed request")
        }
        val id = request.optString("id")
        if (!id.matches(Regex("^[A-Za-z0-9._-]{1,128}$"))) return JSONObject().put("id", id).put("ok", false).put("code", "io").put("message", "malformed request id")
        if (request.optString("op") == "put") {
            val value = request.optJSONObject("params")?.opt("value") as? String
                ?: return errorResponse(id, "io", "invalid credential value")
            if (value.isEmpty()) return errorResponse(id, "io", "invalid credential value")
            if (VaultRequestLimits.utf8Bytes(value) > VaultStore.MAX_VALUE_BYTES)
                return JSONObject().put("id", id).put("ok", false).put("code", "io").put("message", "value exceeds the 64 KiB bound")
        }
        return null
    }

    private fun errorResponse(id: String, code: String, message: String): JSONObject =
        JSONObject().put("id", id).put("ok", false).put("code", code).put("message", message)

    private fun process(raw: String, requestGeneration: Long): JSONObject {
        val request = try { JSONObject(raw) } catch (_: Exception) { return errorResponse("", "io", "malformed request") }
        val id = request.optString("id")
        if (!id.matches(Regex("^[A-Za-z0-9._-]{1,128}$"))) return errorResponse(id, "io", "malformed request id")
        val op = request.optString("op")
        val p = request.optJSONObject("params") ?: JSONObject()
        if (op == "ready") {
            if (p.optString("protocol") != PROTOCOL_MARKER) return JSONObject().put("id", id).put("ok", false).put("code", "unavailable").put("message", "vault protocol mismatch")
            if (lifecycle.markReady(requestGeneration)) {
                Log.i(TAG, "vault: protocol v2 ready")
            }
            return JSONObject().put("id", id).put("ok", true).put("result", "vault-v2")
        }
        if (!lifecycle.isReady(requestGeneration)) return JSONObject().put("id", id).put("ok", false).put("code", "unavailable").put("message", "vault not ready")
        return try {
            val result: Any? = when (op) {
                "put" -> {
                    val kind = p.optString("kind")
                    val value = p.opt("value") as? String ?: throw VaultException("io", "invalid credential")
                    if (kind !in setOf("password", "privateKey") || value.isEmpty() || VaultRequestLimits.utf8Bytes(value) > VaultStore.MAX_VALUE_BYTES)
                        throw VaultException("io", "invalid credential")
                    val rawLabel = p.opt("label")
                    if (rawLabel != null && rawLabel !is String) throw VaultException("io", "invalid label")
                    val label = (rawLabel as? String)?.takeIf { it.isNotEmpty() }
                    if (label != null && label.length > 256) throw VaultException("io", "invalid label")
                    val rawExisting = p.opt("existingId")
                    if (rawExisting != null && rawExisting !is String) throw VaultException("io", "invalid reference")
                    val existing = (rawExisting as? String)?.takeIf { it.isNotEmpty() }
                    if (existing != null && !existing.matches(Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"))) throw VaultException("io", "invalid reference")
                    val candidateId = p.opt("candidateId") as? String ?: throw VaultException("io", "malformed candidate id")
                    if (!candidateId.matches(Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"))) throw VaultException("io", "malformed candidate id")
                    val targetId = existing ?: candidateId
                    try { store.put(candidateId, kind, value.toByteArray(Charsets.UTF_8), label, existing) }
                    catch (_: Exception) {
                        throw VaultException("unknown", "mutation outcome unknown", "mobile-credential:$targetId")
                    }
                }
                "remove" -> {
                    val idValue = requireId(p)
                    try { store.remove(idValue); null }
                    catch (e: VaultException) {
                        if (e.code == "io") throw e
                        throw VaultException("unknown", "mutation outcome unknown", "mobile-credential:$idValue")
                    }
                    catch (_: Exception) { throw VaultException("unknown", "mutation outcome unknown", "mobile-credential:$idValue") }
                }
                "get" -> store.get(requireId(p))?.let { String(it, Charsets.UTF_8) }
                "list" -> store.list()
                else -> throw VaultException("io", "unsupported operation")
            }
            JSONObject().put("id", id).put("ok", true).put("result", result ?: JSONObject.NULL)
        } catch (e: VaultException) {
            JSONObject().put("id", id).put("ok", false).put("code", e.code).put("message", e.message ?: "")
                .also { e.recoveryRef?.let { ref -> it.put("recoveryRef", ref) } }
        } catch (_: Exception) {
            JSONObject().put("id", id).put("ok", false).put("code", if (op == "put" || op == "remove") "unknown" else "io").put("message", "")
                .also {
                    when (op) {
                        "put" -> it.put("recoveryRef", "mobile-credential:${p.optString("existingId").ifEmpty { p.optString("candidateId") }}")
                        "remove" -> it.put("recoveryRef", "mobile-credential:${p.optString("id")}")
                    }
                }
        }
    }

    private fun requireId(p: JSONObject): String {
        val id = p.optString("id")
        if (!id.matches(Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"))) throw VaultException("io", "invalid entry id")
        return id
    }
}
