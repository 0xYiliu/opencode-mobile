package ai.opencode.mobile.notifications

import ai.opencode.mobile.WebAssetServer
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import org.json.JSONObject

/**
 * The native side of the notifications bridge (issue #23) — the SIXTH protocol-isolated
 * mirror of the credential vault bridge: same channel mechanics, entirely separate protocol
 * (handshake "opencode-mobile-notifications-handshake"). None of the six bridges can capture
 * another's handshake (each compares its handshake string by strict equality and validates
 * the port count), and this bridge's lifecycle never resets or gates the siblings', so the
 * vault gates C1–C5, the probe gate (G16), the ssh behavior, the G18 four-bridge bring-up,
 * the G27 five-bridge bring-up and every sibling gate are not perturbed (G33 re-checks on
 * device).
 *
 * SAFETY SEMANTICS (issue #23 acceptance 3 — the red lines this class embodies):
 *  - NO notification may approve a permission or stop a task. The op whitelist is exactly
 *    {notify, requestPermission} — there is no reply/cancel/interrupt-shaped op, the class
 *    has ZERO addAction calls (the only interaction is the contentIntent navigation), and
 *    the bridge performs zero remote calls (it posts local system notifications only). The
 *    two wire-level approval call sites upstream (auto-approve + the dock's decide()) are
 *    unreachable from here by construction.
 *  - Content minimization: the notify op carries {category, title, body, route} ONLY —
 *    title/body bounds are re-checked natively, the route must match the session-route
 *    whitelist, and permission payloads (action/resources/message) NEVER reach this bridge
 *    (the JS caller consumes sessionID + session title only). Lock-screen visibility is
 *    VISIBILITY_PRIVATE (secure lock screen shows the app name, body hidden).
 *  - Zero-value logging: logs carry fixed tags and op names only — never a route, a title,
 *    a body or any content value.
 *
 * Face contract:
 *  - notify {category, title, body, route}: category ∈ {agent, permissions, questions,
 *    errors} (issue #195 four-category set); a front-focused shell answers {posted:false,
 *    code:"foreground"} (native re-check — the JS-side document.hasFocus() suppression
 *    stays the first layer, this one does not rely on that assumption); a denied
 *    notification permission answers {posted:false, code:"permission"} (silent
 *    degradation — the in-app sound/badge/dock faces are unaffected). Otherwise one
 *    notification is posted on the category channel:
 *    tag = category, id = route.hashCode() (same-session same-kind notifications REPLACE,
 *    never stack), autoCancel, IMPORTANCE_DEFAULT channel with setSound(null, null) — the
 *    45-sound setting plays through the upstream Audio path (single sound source; "sound
 *    off" means truly silent, no second source, no double-chime). Channels are created once
 *    (Android channel semantics make them immutable after creation).
 *  - requestPermission {}: API < 33 or already granted answers {granted:true} immediately;
 *    a request arriving WITHOUT window focus answers {granted:false, code:"foreground"}
 *    WITHOUT any dialog (the platform does not allow background permission prompts and we
 *    never try); otherwise the system dialog is started on the main thread and the answer
 *    arrives through onPermissionResult when the user decides. A second request while one
 *    is pending replaces the pending slot — the superseded request is deliberately never
 *    answered and dies into the JS transport timeout (an explicit unavailable state, never
 *    a silent hang); the settings face issues one request at a time.
 *
 * Channel mechanics are NATIVE-initiated over the platform WebMessage channel (zero new
 * dependencies, zero androidx — android.app.Notification.Builder, NOT NotificationCompat).
 * Threading mirrors the files bridge: parsing/validation runs on ONE background
 * HandlerThread; only the permission-dialog start and the port.postMessage replies run on
 * the main thread; fields shared across the two loops (acked/destroyed/pendingPermission)
 * are @Volatile.
 */
class NotificationsBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    companion object {
        private const val TAG = "OpencodeShell"
        const val HANDSHAKE = "opencode-mobile-notifications-handshake"
        private val TARGET_ORIGIN: Uri = Uri.parse("http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}")
        private const val MAX_RETRIES = 5
        private const val RETRY_DELAY_MS = 500L
        private val REQUEST_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val OPERATIONS = setOf("notify", "requestPermission")

        /**
         * The category whitelist — exactly the four notification kinds (JS mirror:
         * NOTIFICATION_CATEGORIES; issue #195 adds "questions" adjacent to "permissions",
         * mirroring the settings row order and the upstream requestTitles two-value map).
         */
        private val CATEGORIES = setOf("agent", "permissions", "questions", "errors")

        /** The wire error-code set (JS mirror: NOTIFICATIONS_ERROR_CODES). */
        private val ERROR_CODES = setOf("unavailable", "permission", "foreground", "io")

        /** Native re-check bounds (JS mirror: TITLE_MAX/BODY_MAX in notifications/client.ts). */
        private const val TITLE_MAX = 128
        private const val BODY_MAX = 256

        /**
         * Session-route whitelist (JS mirror: ROUTE_PATTERN). The route is CONSTRUCTED by
         * the JS side through the upstream sessionHref and re-checked here by shape only —
         * the base64url segments carry no separator characters, so the shape check is the
         * whole defense (files-bridge two-layer calibration). INTERNAL (not private) so
         * MainActivity's consumption side re-checks the same shape before loadUrl (review
         * L1: the activity is exported, a forged extra must not reach the WebView).
         */
        internal val ROUTE = Regex("^/server/[A-Za-z0-9_-]{1,512}/session/[A-Za-z0-9_-]{1,128}$")

        /** The one intent extra the contentIntent carries to MainActivity (exactly one). */
        const val EXTRA_ROUTE = "opencode.mobile.notifications.route"

        /** Independent request code for POST_NOTIFICATIONS (chooser 41001 / SAF save 41002). */
        const val REQUEST_NOTIFICATIONS = 41003

        private const val CHANNEL_PREFIX = "notifications-"
        private const val CHANNEL_GROUP = "OpenCode notifications"
    }

    /** The one in-flight POST_NOTIFICATIONS request (user-in-dialog; replaced, never queued). */
    private class PendingPermission(val requestId: String)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val backgroundThread = HandlerThread("opencode-mobile-notifications").apply { start() }
    private val backgroundHandler = Handler(backgroundThread.looper)

    private var port1: WebMessagePort? = null
    /** True once the live session answered ack; reset on navigation (navigation-scoped lifecycle). */
    @Volatile
    private var acked = false
    private var retryAttempt = 0
    private var handshakeRound = 0
    /** Volatile: written on the main looper (destroy), read on the parse thread. */
    @Volatile
    private var destroyed = false
    /** Volatile: installed/consumed on the main looper, guarded on the parse thread. */
    @Volatile
    private var pendingPermission: PendingPermission? = null

    /**
     * Start one handshake round. Called from WebViewClient.onPageFinished. The ack flag
     * resets here BY DESIGN: each page load opens a new handshake round (navigation-scoped
     * ack lifecycle, mirroring the five sibling bridges).
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
        pendingPermission = null
        mainHandler.removeCallbacksAndMessages(null)
        backgroundHandler.removeCallbacksAndMessages(null)
        backgroundThread.quitSafely()
        closeChannel()
    }

    /**
     * Receives the POST_NOTIFICATIONS dialog result. Called from
     * MainActivity.onRequestPermissionsResult when requestCode == REQUEST_NOTIFICATIONS.
     * A lost dialog (process death / activity rebuild) leaves nothing behind: this bridge
     * instance dies with its activity and the JS side times out into unavailable.
     */
    fun onPermissionResult(granted: Boolean) {
        val pending = pendingPermission
        pendingPermission = null
        if (pending == null) return // stale result for an already-superseded request
        respondRaw(
            JSONObject().put("id", pending.requestId).put("ok", true).put("result", JSONObject().put("granted", granted)),
        )
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
                    // The port callback runs on the main looper; the raw string is handed to
                    // the single background thread for parse + whitelist + dispatch (files
                    // bridge review-F2 precedent). Every answer is posted back to the main
                    // looper by the respond faces.
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
            Log.w(TAG, "notifications: handshake post failed")
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
            Log.w(TAG, "notifications: handshake retries exhausted; notifications stays unavailable")
            closeChannel()
            return
        }
        mainHandler.postDelayed({
            if (destroyed || acked || round != handshakeRound) return@postDelayed
            Log.w(TAG, "notifications: handshake retry (no ack yet)")
            closeChannel() // closes the old port1 BEFORE rebuilding (rebuild, not re-post)
            startHandshake()
        }, RETRY_DELAY_MS)
    }

    // ------------------------------------------------------------------
    // Inbound dispatch (single background parse thread) — whitelist + shape validation
    // ------------------------------------------------------------------

    private fun handleClientMessage(raw: String) {
        val json = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "notifications: dropping malformed message")
            return
        }
        when (json.optString("op")) {
            "ack" -> {
                if (!acked) {
                    acked = true
                    mainHandler.removeCallbacksAndMessages(null)
                    Log.i(TAG, "notifications: channel acked")
                }
                // Duplicate acks are ignored (suppression mirror of the page side).
            }
            else -> {
                // Zero capability before ack (trust layer 3).
                if (!acked) {
                    Log.w(TAG, "notifications: dropping operation before ack")
                    return
                }
                val op = json.optString("op")
                if (op !in OPERATIONS) {
                    Log.w(TAG, "notifications: dropping non-whitelisted op")
                    return
                }
                val id = json.optString("id")
                if (!REQUEST_ID.matches(id) || id.length > 128) {
                    Log.w(TAG, "notifications: dropping request with malformed requestId")
                    return
                }
                when (op) {
                    "notify" -> handleNotify(id, json.optJSONObject("params") ?: JSONObject())
                    "requestPermission" -> handleRequestPermission(id)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // notify (LOCAL system notification — zero remote calls, zero actions)
    // ------------------------------------------------------------------

    /**
     * Posts one local notification after the full native re-check chain. Answers exactly
     * one response: {posted:true} / {posted:false, code}. The op NEVER triggers a system
     * dialog and NEVER carries an action button.
     */
    private fun handleNotify(requestId: String, params: JSONObject) {
        val category = params.optString("category")
        if (category !in CATEGORIES) {
            respondError(requestId, "io")
            return
        }
        val title = params.optString("title")
        if (title.isEmpty() || title.length > TITLE_MAX) {
            respondError(requestId, "io")
            return
        }
        val body = params.optString("body")
        if (body.length > BODY_MAX) {
            respondError(requestId, "io")
            return
        }
        val route = params.optString("route")
        if (!ROUTE.matches(route)) {
            respondError(requestId, "io")
            return
        }
        mainHandler.post {
            if (destroyed) return@post
            // Native foreground re-check (second layer; the JS document.hasFocus() early
            // return stays the first). A front-focused shell never posts.
            if (activity.hasWindowFocus()) {
                respondError(requestId, "foreground")
                return@post
            }
            val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (manager == null) {
                respondError(requestId, "io")
                return@post
            }
            // Denied notification permission -> silent degradation (the in-app faces are
            // unaffected); no retry, no fabricated success.
            if (!manager.areNotificationsEnabled()) {
                respondError(requestId, "permission")
                return@post
            }
            try {
                ensureChannel(manager, category)
                val notification = buildNotification(category, title, body, route)
                // tag = category, id = route.hashCode(): same-session same-kind replace.
                manager.notify(category, route.hashCode(), notification)
                respondRaw(
                    JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject().put("posted", true)),
                )
            } catch (e: Exception) {
                Log.w(TAG, "notifications: post failed (io)")
                respondError(requestId, "io")
            }
        }
    }

    /** Platform Notification.Builder (API 26+; minSdk 29) — NOT NotificationCompat (zero androidx). */
    private fun buildNotification(category: String, title: String, body: String, route: String): Notification {
        val intent = Intent(activity, activity.javaClass).apply {
            // In-app navigation only: CLEAR_TOP|SINGLE_TOP reach onNewIntent on a warm
            // instance or onCreate cold. NO VIEW intent-filter exists or is added here.
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(EXTRA_ROUTE, route)
        }
        val contentIntent = PendingIntent.getActivity(
            activity,
            route.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(activity, channelFor(category))
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(activity.applicationInfo.icon)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            // Secure lock screen shows the app name only; the body stays hidden.
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build()
    }

    /** Lazy one-time channel creation: IMPORTANCE_DEFAULT, NO sound (single sound source). */
    private fun ensureChannel(manager: NotificationManager, category: String) {
        val id = channelFor(category)
        if (manager.getNotificationChannel(id) != null) return
        val channel = NotificationChannel(id, channelTitle(category), NotificationManager.IMPORTANCE_DEFAULT)
        // Silent channel: the 45-sound setting plays through the upstream Audio path
        // (single source; "sound off" = truly silent — no second source, no double chime).
        channel.setSound(null, null)
        manager.createNotificationChannel(channel)
    }

    private fun channelFor(category: String): String = "$CHANNEL_PREFIX$category"

    /** Fixed user-facing channel names (this shell carries no localized Android resources). */
    private fun channelTitle(category: String): String = when (category) {
        "agent" -> CHANNEL_GROUP
        "permissions" -> "$CHANNEL_GROUP (permissions)"
        "questions" -> "$CHANNEL_GROUP (questions)"
        else -> "$CHANNEL_GROUP (errors)"
    }

    // ------------------------------------------------------------------
    // requestPermission (user-in-foreground only; background arrival never prompts)
    // ------------------------------------------------------------------

    private fun handleRequestPermission(requestId: String) {
        if (Build.VERSION.SDK_INT < 33) {
            // POST_NOTIFICATIONS is a runtime permission only on API 33+; below it the
            // notification face needs no prompt.
            respondRaw(
                JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject().put("granted", true)),
            )
            return
        }
        val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (manager?.areNotificationsEnabled() == true) {
            respondRaw(
                JSONObject().put("id", requestId).put("ok", true).put("result", JSONObject().put("granted", true)),
            )
            return
        }
        // A request arriving without window focus NEVER opens a dialog (the platform does
        // not allow background permission prompts and we never try).
        if (!activity.hasWindowFocus()) {
            respondError(requestId, "foreground")
            return
        }
        mainHandler.post {
            if (destroyed) return@post
            // Replace semantics: a second dialog request supersedes the pending one; the
            // superseded request is never answered (JS transport timeout = explicit
            // unavailable). The settings face issues one request at a time.
            pendingPermission = PendingPermission(requestId)
            try {
                activity.requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), REQUEST_NOTIFICATIONS)
            } catch (e: Exception) {
                pendingPermission = null
                respondError(requestId, "io")
            }
        }
    }

    // ------------------------------------------------------------------
    // Response face (exactly one JSON response per request; replies on the main thread)
    // ------------------------------------------------------------------

    private fun errorBody(requestId: String, code: String): JSONObject {
        // Defensive: only the four wire codes ever leave this bridge (JS mirror NOTIFICATIONS_ERROR_CODES).
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
            Log.w(TAG, "notifications: no channel to answer on")
            return
        }
        try {
            port.postMessage(WebMessage(json.toString()))
        } catch (e: Exception) {
            Log.w(TAG, "notifications: response post failed")
        }
    }
}
