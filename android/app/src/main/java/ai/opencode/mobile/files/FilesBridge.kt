package ai.opencode.mobile.files

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipDescription
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

/**
 * The native side of the files bridge (issue #16) — the FIFTH protocol-isolated mirror of
 * the credential vault bridge (ai.opencode.mobile.vault.CredentialVaultBridge): same
 * channel mechanics, entirely separate protocol (handshake "opencode-mobile-files-handshake").
 * None of the five bridges can capture another's handshake (each compares its handshake
 * string by strict equality and validates the port count), and this bridge's lifecycle
 * never resets or gates the siblings', so the vault gates C1–C5, the probe gate (G16), the
 * ssh behavior and the G18 four-bridge bring-up are not perturbed (G27① re-checks on
 * device).
 *
 * Channel establishment is NATIVE-initiated over the platform WebMessage channel (API 23+,
 * zero new dependencies, zero androidx) — see the vault bridge class doc for the full
 * three-layer trust chain: platform-enforced targetOrigin, port confinement (the JS side
 * captures port2 into its closure), zero capability before ack, 5 x 500 ms channel-rebuild
 * retries, ack lifecycle navigation-scoped.
 *
 * Whitelist: exactly THREE operations (no dynamic routing, no reflection):
 *  - clipboardImage: reads ONE image from the system clipboard, only in the content://
 *     URI whose MIME is an image type (ClipDescription wildcard), through a one-shot
 *     ContentResolver.openInputStream (no persistable grant), bounded to 10 s and to
 *     MAX_BRIDGE_BYTES raw bytes; bitmap Intents and every other shape answer an explicit
 *     "unsupported" (the JS Platform seam degrades those to null — the paste chain falls
 *     through to text, upstream behavior).
 *  - save: validates the payload, then starts the system save dialog
 *     (Intent.ACTION_CREATE_DOCUMENT + CATEGORY_OPENABLE + EXTRA_TITLE = the sanitized
 *     name). The user picks a user-reachable location (Downloads, Drive, ...); the result
 *     URI is written ONCE through ContentResolver.openOutputStream — a non-persistable,
 *     activity-result-scoped grant whose lifecycle the system manages (nothing to revoke;
 *     no persistable permission is ever taken). Exactly one save may be in flight
 *     (the saveInFlight gate; the decoded payload waits in pendingSave): a second request
 *     answers "busy" — refused, never queued, never
 *     overwritten (mirrors the file chooser's exactly-once discipline). Three-state
 *     contract with the upstream consumers: {saved:true} = written, {saved:false} =
 *     RESULT_CANCELED (the upstream "false = user cancel" contract), {ok:false,code} =
 *     hard failure (the upstream catch shows the failed toast).
 *  - share: stages the payload under cacheDir/share/<uuid>/<sanitized-name> and launches
 *     ACTION_SEND through a chooser with FLAG_GRANT_READ_URI_PERMISSION on BOTH the send
 *     intent and the chooser intent (the createChooser trap — without the second flag the
 *     target app receives no read grant). The only content:// face is ShareFileProvider
 *     (exported=false + grantUriPermissions=true), which serves cacheDir/share/ read-only.
 *     Generational cleanup (plan L1): the CURRENT generation is kept, every OLDER
 *     generation is deleted once the new one is fully staged; onDestroy clears the whole
 *     share root. ACTION_SEND has no completion callback, so "delete after share" is not
 *   observable — the generation window is the honest minimum.
 *
 * Wire discipline: JSON in both directions, requestId correlation, ZERO binary across the
 * bridge (payloads travel base64-encoded) and a hard MAX_BRIDGE_BYTES = 32 MiB bound on
 * raw bytes — mirrored from the JS side (a value that passed there is still refused here).
 * The filename is re-checked natively against the FILENAME whitelist (the JS sanitizeFilename
 * mirror — the vault ENTRY_ID house rule): a rejected name answers "unsupported" and NEVER
 * touches disk, so a polluted remote part name cannot escape the <uuid> staging directory.
 *
 * Threading (plan M2): parsing/validation, base64 decode, clipboard reads and staging
 * writes run on ONE background HandlerThread (zero new dependencies); only the
 * startActivityForResult/startActivity calls and the port.postMessage replies run on the
 * main thread (the vault mainHandler precedent). Nothing large ever executes on the main
 * thread. The port's onMessage callback fires on the main looper, so the raw message is
 * handed to the parse thread before decoding (review F2): inbound dispatch is a
 * backgroundHandler.post, and fields shared across the two loops (acked/destroyed/
 * saveInFlight/pendingSave) are @Volatile.
 *
 * Zero-value logging red line: logs carry fixed tags and op names/counters only — never a
 * filename, never a payload, never a URI, never any content value.
 */
class FilesBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-files-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://127.0.0.1:18090")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val REQUEST_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val OPERATIONS = setOf("clipboardImage", "save", "share")

        /**
         * Filename whitelist — the Kotlin mirror of the JS sanitizeFilename pattern
         * (issue #16 plan B2). Starts alphanumeric (no leading dot, which also rules out
         * the "."/".." segments), then letters/digits/space/dot/underscore/hyphen/common
         * brackets, at most 128 chars. The sanitizer never rewrites: illegal -> unsupported.
         */
        private val FILENAME = Regex("^[A-Za-z0-9][A-Za-z0-9 ._\\-\\[\\]()]{0,127}$")

        /** Single-message raw byte bound (JS mirror: MAX_BRIDGE_BYTES in files/client.ts). */
        private const val MAX_BRIDGE_BYTES = 32 * 1024 * 1024

        /** Bound for one clipboard stream read (plan D2: 10 s timeout). */
        private const val CLIPBOARD_TIMEOUT_MS = 10_000L

        /** Independent request code for the SAF save dialog (chooser uses 41001). */
        const val REQUEST_SAVE_DOCUMENT = 41002

        private const val SHARE_ROOT = "share"

        /** The wire error-code set (JS mirror: FILES_ERROR_CODES). */
        private val ERROR_CODES = setOf("unavailable", "too-large", "unsupported", "io", "busy", "cancelled")
    }

    /** One in-flight SAF save: exactly one at a time (busy refusal for concurrent requests). */
    private class PendingSave(val requestId: String, val bytes: ByteArray)

    /** Typed carrier so the respond face can answer with the right wire code. */
    private class FilesOpException(val code: String, message: String) : Exception(message)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val backgroundThread = HandlerThread("opencode-mobile-files").apply { start() }
    private val backgroundHandler = Handler(backgroundThread.looper)

    private var port1: WebMessagePort? = null
    /**
     * True once the live session answered ack; suppressed handshakes and reset on navigation.
     * Volatile (issue #16 review F2): the ack lands on the background parse thread while the
     * handshake retry guards read it on the main looper.
     */
    @Volatile
    private var acked = false
    private var retryAttempt = 0
    private var handshakeRound = 0
    /** Volatile (review F2): written on the main looper (destroy), read on the parse thread. */
    @Volatile
    private var destroyed = false
    /**
     * The exactly-once gate for the SAF save face (review F2 threading): reserved on the
     * background parse thread (all inbound messages are serialized there), cleared on every
     * completion path. Volatile — also cleared from the main looper (onActivityResult/destroy).
     */
    @Volatile
    private var saveInFlight = false
    /**
     * The decoded payload of the one in-flight save, installed on the main looper right
     * before the SAF dialog starts and consumed by onActivityResult (B1: the dialog's
     * result writes exactly this array — the slot NEVER holds a placeholder). Volatile —
     * written on main, cleared from both loops.
     */
    @Volatile
    private var pendingSave: PendingSave? = null

    /**
     * Start one handshake round. Called from WebViewClient.onPageFinished. The ack flag
     * resets here BY DESIGN: each page load opens a new handshake round (navigation-
     * scoped ack lifecycle, mirroring the four sibling bridges).
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
        saveInFlight = false
        pendingSave = null
        mainHandler.removeCallbacksAndMessages(null)
        backgroundHandler.removeCallbacksAndMessages(null)
        backgroundThread.quitSafely()
        closeChannel()
        clearShareStaging()
    }

    /**
     * Receives the SAF save dialog result. Called from MainActivity.onActivityResult when
     * requestCode == REQUEST_SAVE_DOCUMENT. Three-state contract: RESULT_OK + a URI ->
     * one-shot write (background) -> {saved:true} / io error; RESULT_CANCELED / no URI ->
     * {saved:false} (the upstream false = user cancel contract; silent return upstream).
     * A lost dialog (process death / activity rebuild) leaves nothing behind: this bridge
     * instance dies with its activity and the JS side times out into unavailable.
     */
    fun onActivityResult(resultCode: Int, data: Intent?) {
        val pending = pendingSave
        pendingSave = null
        saveInFlight = false
        if (pending == null) return // stale result for an already-answered request
        val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
        if (uri == null) {
            respondRaw(JSONObject().put("id", pending.requestId).put("ok", true).put("result", JSONObject().put("saved", false)))
            return
        }
        backgroundHandler.post {
            val response = try {
                activity.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                    output.write(pending.bytes)
                    output.flush()
                } ?: throw FilesOpException("io", "no output stream for the chosen location")
                JSONObject().put("id", pending.requestId).put("ok", true).put("result", JSONObject().put("saved", true))
            } catch (e: FilesOpException) {
                errorBody(pending.requestId, e.code)
            } catch (e: Exception) {
                Log.w(TAG, "files: save write failed (io)")
                errorBody(pending.requestId, "io")
            }
            mainHandler.post { postToPage(response) }
        }
    }

    // ------------------------------------------------------------------
    // Channel mechanics (vault-bridge mirror — see the class doc)
    // ------------------------------------------------------------------

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
                    // Review F2 (issue #16): the port callback runs on the main looper, but a
                    // bridge message can carry a ~32 MiB payload (base64 of the bound ≈ tens
                    // of MB of JSON) — JSONObject parsing must never run on the main thread
                    // (plan M2). The raw string is handed to the single background thread for
                    // parse + whitelist + dispatch; ordering is preserved by that thread's
                    // FIFO queue, and every answer is posted back to the main looper by the
                    // respond faces.
                    val raw = message.data ?: return
                    backgroundHandler.post { handleClientMessage(raw) }
                }
            },
        )
        port1 = nativePort
        try {
            // platform-enforced targetOrigin: the page on another origin never sees pagePort.
            webView.postWebMessage(WebMessage(HANDSHAKE, arrayOf(pagePort)), TARGET_ORIGIN)
        } catch (e: Exception) {
            Log.w(TAG, "files: handshake post failed")
            // Do NOT close/bump the round here: scheduleRetry(round) must see the live round
            // or the guard would swallow this retry (vault review B2 lesson).
            scheduleRetry(round)
            return
        }
        scheduleRetry(round)
    }

    private fun scheduleRetry(round: Int) {
        if (destroyed || acked || round != handshakeRound) return
        retryAttempt += 1
        if (retryAttempt > MAX_RETRIES) {
            Log.w(TAG, "files: handshake retries exhausted; files stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "files: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    // ------------------------------------------------------------------
    // Inbound dispatch (single background parse thread — review F2) —
    // whitelist + shape validation
    // ------------------------------------------------------------------

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "files: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "files: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3).
                if (!acked) {
                    Log.w(TAG, "files: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op !in OPERATIONS) {
                    Log.w(TAG, "files: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!REQUEST_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "files: dropping request with malformed requestId")
                    return
                }
                when (op) {
                    "clipboardImage" -> respond(id) { opClipboardImage() }
                    "save" -> handleSave(id, json.optJSONObject("params") ?: JSONObject())
                    "share" -> handleShare(id, json.optJSONObject("params") ?: JSONObject())
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // clipboardImage
    // ------------------------------------------------------------------

    /**
     * One image from the system clipboard: content:// URI with an image MIME shape only,
     * one-shot
     * stream read bounded to 10 s and MAX_BRIDGE_BYTES. Returns JSONObject.NULL when
     * there is no usable image (the JS face answers null); every other shape answers an
     * explicit unsupported wire code.
     */
    private fun opClipboardImage(): Any? {
        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
            ?: return JSONObject.NULL
        val clip: ClipData = clipboard.primaryClip ?: return JSONObject.NULL
        val description: ClipDescription? = clip.description
        if (description == null || !description.hasMimeType("image/*")) return JSONObject.NULL
        for (i in 0 until clip.itemCount) {
            val uri = clip.getItemAt(i).uri ?: continue
            if (uri.scheme != "content") throw FilesOpException("unsupported", "clipboard image must be a content URI")
            val mime = activity.contentResolver.getType(uri)
            if (mime == null || !mime.startsWith("image/")) throw FilesOpException("unsupported", "clipboard URI is not an image")
            val bytes = readUriBounded(uri)
            return JSONObject()
                .put("name", "clipboard${extensionForMime(mime)}")
                .put("mime", mime)
                .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
        return JSONObject.NULL
    }

    /**
     * Bounded one-shot read: a one-off worker thread is joined with a 10 s timeout (a
     * hung provider must not wedge the single background thread forever); the stream is
     * capped at MAX_BRIDGE_BYTES raw bytes (over -> too-large).
     */
    private fun readUriBounded(uri: Uri): ByteArray {
        var worker: Thread? = null
        var result: ByteArray? = null
        var failure: FilesOpException? = null
        val done = java.util.concurrent.CountDownLatch(1)
        worker = Thread({
            try {
                val input = activity.contentResolver.openInputStream(uri)
                    ?: throw FilesOpException("io", "no input stream for the clipboard URI")
                input.use { stream ->
                    val buffer = java.io.ByteArrayOutputStream()
                    val chunk = ByteArray(64 * 1024)
                    while (true) {
                        val read = stream.read(chunk)
                        if (read < 0) break
                        if (buffer.size() + read > MAX_BRIDGE_BYTES) {
                            failure = FilesOpException("too-large", "clipboard image exceeds the 32 MiB bound")
                            return@Thread
                        }
                        buffer.write(chunk, 0, read)
                    }
                    result = buffer.toByteArray()
                }
            } catch (e: FilesOpException) {
                failure = e
            } catch (e: FileNotFoundException) {
                failure = FilesOpException("unsupported", "clipboard URI is gone")
            } catch (e: SecurityException) {
                failure = FilesOpException("unsupported", "clipboard URI grant is not readable")
            } catch (e: IOException) {
                failure = FilesOpException("io", "clipboard read failed")
            } finally {
                done.countDown()
            }
        }, "opencode-mobile-files-clipboard").apply { isDaemon = true }
        worker.start()
        val finished = done.await(CLIPBOARD_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
        if (!finished) {
            // The read is abandoned; the thread dies on its own (daemon). Never blocks the
            // background thread beyond the bound.
            throw FilesOpException("io", "clipboard read timed out")
        }
        failure?.let { throw it }
        return result ?: throw FilesOpException("io", "clipboard read produced no bytes")
    }

    // ------------------------------------------------------------------
    // save (SAF ACTION_CREATE_DOCUMENT)
    // ------------------------------------------------------------------

    /**
     * Validates the payload on the background parse thread (this runs there — review F2
     * moved inbound dispatch off the main looper), then starts the SAF dialog on the main
     * thread. saveInFlight is reserved SYNCHRONOUSLY (all inbound messages are serialized
     * on the single parse thread) so a concurrent save answers busy before any work starts;
     * validation failure releases the slot. No immediate response: the answer arrives
     * through onActivityResult.
     *
     * B1 (issue #16 code review): the exactly-once gate (saveInFlight) and the payload slot
     * (pendingSave) are SEPARATE. The gate is reserved up front; the slot is installed on
     * the main looper with the DECODED bytes immediately before startActivityForResult —
     * onActivityResult writes exactly that array, so a placeholder slot must never exist.
     */
    private fun handleSave(requestId: String, params: JSONObject) {
        if (saveInFlight) {
            Log.w(TAG, "files: save refused (busy)")
            respondError(requestId, "busy")
            return
        }
        saveInFlight = true // reserve the exactly-once gate (serialized on the parse thread)
        try {
            val name = validatedName(params)
            val mime = validatedMime(params)
            val bytes = validatedBytes(params)
            mainHandler.post {
                if (destroyed || !saveInFlight) return@post
                // Install the real payload BEFORE the dialog exists: onActivityResult can
                // only fire after startActivityForResult, and both run on this looper, so
                // the slot is fully populated before any result can observe it.
                pendingSave = PendingSave(requestId, bytes)
                try {
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = mime
                        putExtra(Intent.EXTRA_TITLE, name)
                    }
                    activity.startActivityForResult(intent, REQUEST_SAVE_DOCUMENT)
                } catch (e: ActivityNotFoundException) {
                    saveInFlight = false
                    pendingSave = null
                    respondError(requestId, "unsupported")
                } catch (e: Exception) {
                    saveInFlight = false
                    pendingSave = null
                    respondError(requestId, "io")
                }
            }
        } catch (e: FilesOpException) {
            saveInFlight = false
            respondError(requestId, e.code)
        } catch (e: Exception) {
            saveInFlight = false
            respondError(requestId, "io")
        }
    }

    // ------------------------------------------------------------------
    // share (ACTION_SEND + generational staging under cacheDir/share/)
    // ------------------------------------------------------------------

    private fun handleShare(requestId: String, params: JSONObject) {
        backgroundHandler.post {
            var generation: String? = null
            try {
                val name = validatedName(params)
                val mime = validatedMime(params)
                val bytes = validatedBytes(params)
                val current = java.util.UUID.randomUUID().toString()
                generation = current
                val dir = File(shareRoot(), current)
                dir.mkdirs()
                File(dir, name).writeBytes(bytes)
                // Generational cleanup (plan L1): keep the CURRENT generation, delete every
                // OLDER one — the new generation is fully staged at this point, so the old
                // exposure window closes here.
                cleanupShareGenerations(keep = current)
                mainHandler.post {
                    if (destroyed) return@post
                    try {
                        // Grant flag on BOTH intents (plan L8): createChooser wraps the send
                        // intent, and the target app only receives the read grant if the
                        // flag is set on the chooser intent too.
                        val contentUri = Uri.parse("content://${ShareFileProvider.AUTHORITY}/$current/${Uri.encode(name)}")
                        val send = Intent(Intent.ACTION_SEND).apply {
                            type = mime
                            putExtra(Intent.EXTRA_STREAM, contentUri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        val chooser = Intent.createChooser(send, null).apply {
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        activity.startActivity(chooser)
                        respondRaw(
                            JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject().put("shared", true)),
                        )
                    } catch (e: ActivityNotFoundException) {
                        deleteGeneration(current)
                        respondError(requestId, "unsupported")
                    } catch (e: Exception) {
                        deleteGeneration(current)
                        respondError(requestId, "io")
                    }
                }
            } catch (e: FilesOpException) {
                respondError(requestId, e.code)
            } catch (e: Exception) {
                Log.w(TAG, "files: share staging failed (io)")
                respondError(requestId, "io")
            }
        }
    }

    private fun shareRoot(): File = File(activity.cacheDir, SHARE_ROOT)

    /** Deletes every generation directory except [keep] (plan L1 generational cleanup). */
    private fun cleanupShareGenerations(keep: String) {
        val root = shareRoot()
        val children = root.listFiles() ?: return
        for (child in children) {
            if (child.name != keep) deleteGeneration(child.name)
        }
    }

    private fun deleteGeneration(generation: String) {
        // Segment-validated: only plain single-segment names under the share root.
        if (generation.isEmpty() || generation.contains('/') || generation.contains('\\') || generation.contains("..") || generation.contains('\u0000')) return
        val dir = File(shareRoot(), generation)
        if (dir.exists()) dir.deleteRecursively()
    }

    /** onDestroy face (called from MainActivity.onDestroy via destroy()): the whole root goes. */
    private fun clearShareStaging() {
        shareRoot().deleteRecursively()
    }

    // ------------------------------------------------------------------
    // Native re-checks (vault ENTRY_ID / MAX_VALUE_BYTES house rule mirrors)
    // ------------------------------------------------------------------

    /** FILENAME whitelist re-check: an illegal name NEVER reaches disk (plan B2). */
    private fun validatedName(params: JSONObject): String {
        val name = params.optString("name")
        if (name.isEmpty()) throw FilesOpException("unsupported", "empty filename (native re-check)")
        if (name.length > 128) throw FilesOpException("unsupported", "filename exceeds the 128 character bound (native re-check)")
        if (name.contains('/') || name.contains('\\')) throw FilesOpException("unsupported", "filename contains a path separator (native re-check)")
        if (name.contains("..")) throw FilesOpException("unsupported", "filename contains a dot segment (native re-check)")
        if (!FILENAME.matches(name)) throw FilesOpException("unsupported", "filename outside the whitelist (native re-check)")
        return name
    }

    private fun validatedMime(params: JSONObject): String {
        val mime = params.optString("mime")
        if (mime.isEmpty() || mime.length > 255 || mime.contains('/') == false || mime.contains("..")) {
            throw FilesOpException("unsupported", "malformed mime (native re-check)")
        }
        return mime
    }

    /** Base64 payload decode with the 32 MiB raw-byte mirror bound (decode failure -> io). */
    private fun validatedBytes(params: JSONObject): ByteArray {
        val data = params.optString("data")
        if (data.isEmpty()) throw FilesOpException("io", "empty payload (native re-check)")
        val bytes = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            throw FilesOpException("io", "malformed base64 payload (native re-check)")
        }
        if (bytes.size > MAX_BRIDGE_BYTES) throw FilesOpException("too-large", "payload exceeds the 32 MiB bound (native re-check)")
        return bytes
    }

    private fun extensionForMime(mime: String): String = when (mime) {
        "image/png" -> ".png"
        "image/jpeg" -> ".jpg"
        "image/gif" -> ".gif"
        "image/webp" -> ".webp"
        else -> ".img"
    }

    // ------------------------------------------------------------------
    // Response face (exactly one JSON response per request; replies on the main thread)
    // ------------------------------------------------------------------

    /** Runs [block] on the single background thread and answers exactly one JSON response. */
    private fun respond(requestId: String, block: () -> Any?) {
        backgroundHandler.post {
            val response = try {
                JSONObject().put("id", requestId).put("ok", true).put("result", block() ?: JSONObject.NULL)
            } catch (e: FilesOpException) {
                errorBody(requestId, e.code)
            } catch (e: Exception) {
                Log.w(TAG, "files: operation failed (io)")
                errorBody(requestId, "io")
            }
            mainHandler.post { postToPage(response) }
        }
    }

    private fun errorBody(requestId: String, code: String): JSONObject {
        // Defensive: only the six wire codes ever leave this bridge (JS mirror FILES_ERROR_CODES).
        val safeCode = if (code in ERROR_CODES) code else "io"
        return JSONObject().put("id", requestId).put("ok", false).put("code", safeCode).put("message", "")
    }

    private fun respondError(requestId: String, code: String) {
        respondRaw(errorBody(requestId, code))
    }

    private fun respondRaw(json: JSONObject) {
        mainHandler.post { postToPage(json) }
    }

    private fun postToPage(json: JSONObject) {
        val port = port1
        if (port == null) {
            Log.w(TAG, "files: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "files: response post failed")
        }
    }
}
