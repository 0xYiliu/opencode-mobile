package ai.opencode.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import ai.opencode.mobile.files.FilesBridge
import ai.opencode.mobile.notifications.NotificationsBridge
import ai.opencode.mobile.probe.ProbeBridge
import ai.opencode.mobile.ssh.SshTunnelBridge
import ai.opencode.mobile.svcops.ServiceOpsBridge
import ai.opencode.mobile.vault.CredentialVaultBridge
import fi.iki.elonen.NanoHTTPD
import java.io.IOException
import java.util.UUID

/**
 * WebView shell: starts the loopback asset server and renders the packaged OpenCode
 * frontend from http://127.0.0.1:<port>/. No OpenCode service runs on the phone.
 *
 * Not implemented (TODO): deep links (no VIEW intent-filter is registered) and
 * instance-state restoration (see onSaveInstanceState).
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var assetServer: WebAssetServer? = null
    private var vaultBridge: CredentialVaultBridge? = null
    private var probeBridge: ProbeBridge? = null
    private var sshBridge: SshTunnelBridge? = null
    private var svcopsBridge: ServiceOpsBridge? = null
    private var filesBridge: FilesBridge? = null
    private var notificationsBridge: NotificationsBridge? = null
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    /**
     * The one in-flight WebView getUserMedia permission request (issue #71 pairing QR scan;
     * main-thread confined — WebChromeClient permission callbacks and
     * onRequestPermissionsResult all arrive on the main looper). Replaced, never queued:
     * a second request while one is pending DENIES the old one first (fileChooser
     * "refuse rather than queue" precedent).
     */
    private var pendingCameraRequest: PermissionRequest? = null
    /**
     * The notification tap route (issue #23), consumed once: on a warm instance
     * onNewIntent consumes it immediately; on a cold start the first onPageFinished
     * consumes it after the shell page is up. The extra is written ONLY by the
     * NotificationsBridge contentIntent (the route was already whitelist-validated
     * there before anything was posted).
     */
    @Volatile
    private var pendingRoute: String? = null
    /**
     * The one in-flight in-app back dispatch (issue #145): the WebView evaluation callback
     * is asynchronous on the main looper, so a second press arriving inside the window is
     * DROPPED — the pending dispatch decides, and the dropped press can simply be repeated.
     * Main-thread confined exactly like pendingCameraRequest (both callbacks arrive on the
     * main looper).
     */
    private var backConsumePending = false
    /**
     * Dispatch generation guard (issue #145 review M1): the bounded timeout releases a
     * window whose evaluation reply never arrives (WebView teardown, renderer death);
     * the guard turns a LATE reply after that release into a no-op, so exactly one
     * fallback application happens per accepted press.
     */
    private var backConsumeDispatchId = 0
    private val backConsumeTimeout = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)
        configureWebView(webView)

        val server = WebAssetServer(assets)
        try {
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
        } catch (e: IOException) {
            Log.e(TAG, "asset server failed to start on ${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}")
            finish()
            return
        }
        assetServer = server

        // Register the origin-bound AndroidX listener after binding loopback and before loadUrl.
        vaultBridge = CredentialVaultBridge(this, webView)
        vaultBridge?.register()
        // Endpoint probe bridge (issue #5): protocol-isolated sibling of the vault bridge;
        // its own handshake string and channel, restarted on every page load alongside the
        // vault handshake. Until the page acks, the probe port stays unavailable.
        probeBridge = ProbeBridge(webView)
        // SSH tunnel bridge (issue #6): register its strict-origin AndroidX bootstrap before
        // loadUrl so the page can request a confined channel as soon as its listener exists.
        sshBridge = SshTunnelBridge(this, webView)
        if (sshBridge?.register() != true) Log.e(TAG, "ssh: bootstrap listener unavailable")
        // Service ops bridge (issue #7): the FOURTH protocol-isolated sibling — its own
        // handshake string (opencode-mobile-svcops-handshake) and channel, restarted on
        // every page load alongside the other three. Until the page acks, the service ops
        // panel stays degraded-hidden (fail-closed stub on the JS side); its command face
        // is a native-side whitelist (ServiceCommandValidator), never free commands.
        svcopsBridge = ServiceOpsBridge(this, webView)
        // Files bridge (issue #16): the FIFTH protocol-isolated sibling — its own handshake
        // string (opencode-mobile-files-handshake) and channel, restarted on every page
        // load alongside the other four. Until the page acks, the platform capabilities
        // stay fail-closed stubs on the JS side (clipboardImage null / saveFile false /
        // shareDataUrl false). It holds the activity reference (vault-bridge shape) for
        // the SAF save dialog (startActivityForResult) and the share intent launches.
        filesBridge = FilesBridge(this, webView)
        // Notifications bridge (issue #23): the SIXTH protocol-isolated sibling — its own
        // handshake string (opencode-mobile-notifications-handshake) and channel, restarted
        // on every page load alongside the other five. Until the page acks, the notification
        // port stays a fail-closed stub on the JS side (the pre-#23 dead point). The bridge
        // is notification-ONLY: whitelist {notify, requestPermission}, zero action buttons,
        // zero remote calls — a notification can never approve a permission or stop a task.
        notificationsBridge = NotificationsBridge(this, webView)

        // A cold start launched from a notification tap carries the route extra; it is
        // consumed after the first page load (onPageFinished) so the SPA is up to take it.
        pendingRoute = intent?.getStringExtra(NotificationsBridge.EXTRA_ROUTE)

        webView.loadUrl(START_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Warm-instance notification tap (issue #23): CLEAR_TOP|SINGLE_TOP redelivers the
        // existing instance. setIntent keeps the latest intent authoritative (mirrors the
        // onSaveInstanceState TODO note — this is in-app PendingIntent navigation ONLY,
        // never an external deep link: no VIEW intent-filter exists).
        setIntent(intent)
        val route = intent.getStringExtra(NotificationsBridge.EXTRA_ROUTE) ?: return
        pendingRoute = route
        consumePendingRoute()
    }

    /** Consumes the pending route exactly once (loadUrl is idempotent-safe: the slot is cleared first). */
    private fun consumePendingRoute() {
        val route = pendingRoute ?: return
        pendingRoute = null
        // Review L1 (issue #23): the consumption side re-checks the route shape — the
        // extra is only ever written by this app's own PendingIntent, but the activity is
        // exported (launcher), so a forged extra must not reach loadUrl. A shape violation
        // is dropped with a fixed-tag log (zero value content: the route is never logged).
        if (!NotificationsBridge.ROUTE.matches(route)) {
            Log.w(TAG, "notifications: dropping malformed navigation extra")
            return
        }
        if (::webView.isInitialized) {
            webView.loadUrl(START_URL + route)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = true
            // domStorage stays on for non-credential UI state; server credentials are kept
            // memory-only by the vendored M-002 patch (see docs/design/interaction.md) and
            // remembered ones are vault-encrypted by the bridge (never in DOM storage).
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            setSavePassword(false)
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(false)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // TLS validation is never disabled to work around errors (AGENTS.md):
                // default CANCEL, log only the error class, never the request URL.
                handler.cancel()
                Log.w(TAG, "ssl error: primaryError=${error.primaryError}")
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // A full-document navigation invalidates any reply for the previous main
                // frame. The dispatch token makes the late callback a no-op.
                cancelBackConsume()
                vaultBridge?.onNavigationStarted()
                sshBridge?.onNavigationStarted()
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // APK updates can leave the previous PWA worker controlling the new WebView
                // document. Workbox intentionally keeps a complete prior build until clients
                // close (skipWaiting=false); Android has one shell document and APK replacement
                // is the deployment boundary, so promote its waiting packaged worker and reload
                // once it activates. This touches only worker lifecycle, not DOM storage/vault.
                if (ShellWorkerPolicy.isTrustedShellPage(url, START_URL)) {
                    activateWaitingShellWorker(view)
                }
                // The probe bridge (issue #5) runs its own, protocol-isolated handshake
                // round alongside the vault one (see ProbeBridge); its ack lifecycle is
                // likewise navigation-scoped.
                probeBridge?.onPageFinished()
                // The svcops bridge (issue #7) is the fourth protocol-isolated handshake
                // round (see ServiceOpsBridge); ack lifecycle navigation-scoped like the
                // others.
                svcopsBridge?.onPageFinished()
                // The files bridge (issue #16) is the fifth protocol-isolated handshake
                // round (see FilesBridge); ack lifecycle navigation-scoped like the others.
                filesBridge?.onPageFinished()
                // The notifications bridge (issue #23) is the sixth protocol-isolated
                // handshake round (see NotificationsBridge); ack lifecycle navigation-scoped
                // like the others.
                notificationsBridge?.onPageFinished()
                // A cold-start notification tap route rides the first finished page load
                // (the warm path consumes immediately in onNewIntent; the slot is cleared
                // first, so a double call is a no-op).
                consumePendingRoute()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                // Fixed tag; message text and line number only — no request URLs,
                // headers or credentials are written to logcat.
                Log.i(TAG, "console: ${message.message()} (line ${message.lineNumber()})")
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?,
            ) {
                callback?.invoke(origin, false, false)
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                // Issue #4 private-key import. The ValueCallback must be invoked EXACTLY once
                // on every path (new chooser, cancel, error) or the chooser breaks until the
                // page reloads; a still-pending callback is answered with null and the new
                // request is refused rather than queued (no double-invoke).
                // Issue #16 enhancements (plan D5②): MODE_OPEN_MULTIPLE -> EXTRA_ALLOW_MULTIPLE
                // (results resolve from ClipData in onActivityResult); acceptTypes mapping —
                // elements may be MIME types (used directly) or extensions (mapped through a
                // small built-in table, WebAssetServer.MIME_BY_EXTENSION caliber, unknown
                // extensions ignored); a single mapped MIME becomes the intent type, several
                // ride EXTRA_MIME_TYPES with the primary type set to */* (Android requires
                // */* when EXTRA_MIME_TYPES is present). ACTION_OPEN_DOCUMENT falling to
                // ACTION_GET_CONTENT is the extended ActivityNotFoundException fallback.
                // Exactly-once and "no takePersistableUriPermission" are unchanged.
                pendingFileChooser?.onReceiveValue(null)
                pendingFileChooser = null
                val intent = buildOpenIntent(fileChooserParams)
                return try {
                    pendingFileChooser = filePathCallback
                    startActivityForResult(Intent.createChooser(intent, null), REQUEST_FILE_CHOOSER)
                    true
                } catch (e: ActivityNotFoundException) {
                    // ACTION_OPEN_DOCUMENT has no handler -> ACTION_GET_CONTENT fallback
                    // (same result contract, wider handler coverage on older/weird skins).
                    val fallback = buildFallbackIntent(intent)
                    if (fallback == null) {
                        pendingFileChooser = null
                        filePathCallback.onReceiveValue(null)
                        false
                    } else {
                        try {
                            pendingFileChooser = filePathCallback
                            startActivityForResult(Intent.createChooser(fallback, null), REQUEST_FILE_CHOOSER)
                            true
                        } catch (e2: ActivityNotFoundException) {
                            pendingFileChooser = null
                            filePathCallback.onReceiveValue(null)
                            false
                        }
                    }
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // Issue #71 pairing QR scan (getUserMedia for the shared PairingScanner).
                // Decision is policy-owned (CameraGrantPolicy, JVM-tested): the origin must
                // parse to EXACTLY the shell loopback origin and the resource set must be
                // EXACTLY the video-capture resource (audio never granted); otherwise deny.
                // The request object is answered EXACTLY once on every path — grant / deny
                // (both policy branches) / prompt-then-grant / prompt-then-deny / supersede
                // (old slot denied first) / canceled (slot cleared WITHOUT answering: the
                // canceled request object is dead on the Chromium side and must never be
                // touched) / destroy (onDestroy denies the pending slot) / lost system dialog
                // (activity death; the page times out into its explicit error face). Zero
                // value logging: no origin string, no resource list, no URLs in logcat.
                val decision = CameraGrantPolicy.decide(
                    origin = request.origin?.toString() ?: "",
                    resources = request.resources?.toList() ?: emptyList(),
                    expectedScheme = "http",
                    expectedHost = WebAssetServer.LOOPBACK_HOST,
                    expectedPort = WebAssetServer.DEFAULT_PORT,
                    cameraPermissionGranted = checkSelfPermission(android.Manifest.permission.CAMERA)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED,
                )
                when (decision) {
                    CameraGrantPolicy.Decision.DENY_FOREIGN_ORIGIN -> {
                        Log.i(TAG, "camera: denied foreign origin request")
                        request.deny()
                    }
                    CameraGrantPolicy.Decision.DENY_UNSUPPORTED_RESOURCE -> {
                        Log.i(TAG, "camera: denied non-video resource request")
                        request.deny()
                    }
                    // OS CAMERA permission already held: the WebView grant takes effect
                    // immediately (Chromium behavior: WebView authorization requires the App
                    // to hold the OS runtime permission; order is OS first, grant second).
                    CameraGrantPolicy.Decision.GRANT -> request.grant(CAMERA_GRANT)
                    CameraGrantPolicy.Decision.PROMPT_RUNTIME -> promptCameraRuntime(request)
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                // Issue #71: the page withdrew the getUserMedia call (scanner disposed /
                // navigation). Clear the pending slot WITHOUT granting or denying: the
                // request object is already dead on the Chromium side and answering it is
                // both pointless and forbidden; a non-pending request's cancellation is a
                // no-op. (Canceled requests sit outside the exactly-once grant/deny contract
                // — the slot release is the only obligation.)
                if (pendingCameraRequest === request) pendingCameraRequest = null
            }
        }
    }

    /**
     * Drives the OS CAMERA runtime dialog for a policy-approved WebView request (issue #71).
     * Single pending slot, replace-never-queue: a superseded request is denied immediately
     * (exactly-once answered) and the new one takes the slot. No window-focus precheck is
     * applied (unlike the notifications bridge): onPermissionRequest can only be triggered
     * by a foreground page gesture chain — getUserMedia is always started by the user
     * tapping the scan entry, so the foreground condition is structural. A failing
     * requestPermissions start clears the slot and denies the request (notifications-bridge
     * precedent): the page gets an explicit denial, never a silent hang.
     */
    private fun promptCameraRuntime(request: PermissionRequest) {
        pendingCameraRequest?.deny()
        pendingCameraRequest = request
        try {
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), REQUEST_CAMERA)
        } catch (e: Exception) {
            pendingCameraRequest = null
            request.deny()
        }
    }

    /** Promote only the exact packaged shell root registration and packaged sw.js. */
    private fun activateWaitingShellWorker(view: WebView) {
        val trustedStartUrl = START_URL
        val script = """
            (async function() {
              if (!("serviceWorker" in navigator)) return;
              try {
                const shellStartUrl = ${JSONObject.quote(trustedStartUrl)};
                const shellOrigin = new URL(shellStartUrl).origin;
                const shellScope = shellStartUrl;
                const expectedScript = new URL("sw.js", shellStartUrl).href;
                const trustedPage = () => new URL(location.href).origin === shellOrigin;
                const registrations = () => navigator.serviceWorker.getRegistrations();
                const workerUrls = (item) => [item.active, item.waiting, item.installing]
                  .filter(Boolean).map((worker) => worker.scriptURL);
                const trustedRegistration = (item) => trustedPage()
                  && item.scope === shellScope
                  && workerUrls(item).length > 0
                  && workerUrls(item).every((url) => url === expectedScript);
                const registration = async () => {
                  if (!trustedPage()) return undefined;
                  return (await registrations()).find(trustedRegistration);
                };
                let reloaded = false;
                const reloadOnce = () => {
                  if (reloaded || !trustedPage()) return;
                  reloaded = true;
                  location.reload();
                };
                const promote = async () => {
                  const current = await registration();
                  const waiting = current && current.waiting;
                  if (!waiting || !trustedRegistration(current)) return false;
                  const onControllerChange = () => {
                    if (trustedPage() && navigator.serviceWorker.controller?.scriptURL === expectedScript) reloadOnce();
                  };
                  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
                  if (waiting.state === "activated") {
                    if (trustedPage() && trustedRegistration(current)
                      && navigator.serviceWorker.controller?.scriptURL === expectedScript) reloadOnce();
                    return true;
                  }
                  waiting.addEventListener("statechange", () => {
                    void (async () => {
                      const latest = await registration();
                      if (waiting.state === "activated" && latest === current
                        && latest.waiting === waiting && trustedRegistration(latest)
                        && navigator.serviceWorker.controller?.scriptURL === expectedScript) reloadOnce();
                    })();
                  });
                  const latest = await registration();
                  if (latest !== current || latest.waiting !== waiting || !trustedRegistration(latest)) return false;
                  waiting.postMessage({ type: "SKIP_WAITING" });
                  return true;
                };
                const watchInstalling = (worker) => {
                  if (!worker || worker.scriptURL !== expectedScript || !trustedPage()) return;
                  const check = () => {
                    if (worker.scriptURL === expectedScript && trustedPage() && worker.state === "installed") void promote();
                  };
                  worker.addEventListener("statechange", check);
                  check();
                };
                if (!trustedPage()) return "untrusted-page";
                const current = await registration();
                if (!current) return "no-registration";
                if (await promote()) return "promoted";
                current.addEventListener("updatefound", () => watchInstalling(current.installing));
                watchInstalling(current.installing);
                // The entry registers on window.load. Check its packaged script and keep
                // state listeners active through the complete precache/install operation.
                try { await current.update(); } catch (_) {}
                if (await promote()) return "promoted";
                watchInstalling(current.installing);
                return current.installing ? "watching-installation" : "no-waiting-worker";
              } catch (_) {
                // Fail closed to the currently controlled complete build; never clear user data.
                return "error";
              }
            })();
        """.trimIndent()
        view.evaluateJavascript(script, null)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FilesBridge.REQUEST_SAVE_DOCUMENT) {
            // Issue #16 SAF save result: routed to the files bridge (its exactly-once
            // pendingSave discipline mirrors the chooser's below).
            filesBridge?.onActivityResult(resultCode, data)
            return
        }
        if (requestCode != REQUEST_FILE_CHOOSER) {
            super.onActivityResult(requestCode, resultCode, data)
            return
        }
        val callback = pendingFileChooser
        pendingFileChooser = null
        // Exactly-once on every path: cancel / no selection -> null; a picked document URI is
        // handed over once and never persisted or logged (bounded temporary access only, no
        // takePersistableUriPermission).
        // Issue #16: a MODE_OPEN_MULTIPLE result carries the extra URIs in ClipData; the
        // primary URI stays data.data. Order matters for the page-side consumer only in
        // that every picked URI is present — duplicates collapse.
        if (resultCode != RESULT_OK) {
            callback?.onReceiveValue(null)
            return
        }
        val uris = ArrayList<Uri>()
        data?.data?.let { uris.add(it) }
        val clip = data?.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) {
                val uri = clip.getItemAt(i).uri ?: continue
                if (!uris.contains(uri)) uris.add(uri)
            }
        }
        callback?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NotificationsBridge.REQUEST_NOTIFICATIONS) {
            // Issue #23 POST_NOTIFICATIONS result: routed to the notifications bridge (its
            // single pendingPermission slot answers the waiting request exactly once).
            notificationsBridge?.onPermissionResult(
                grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED,
            )
            return
        }
        if (requestCode == REQUEST_CAMERA) {
            // Issue #71 CAMERA result: the single pendingCameraRequest slot is taken and
            // cleared first, then answered EXACTLY once — granted -> WebView grant (video
            // resource only), denied -> WebView deny. A stale result (slot already empty:
            // superseded/canceled/destroyed meanwhile) is silently dropped; the canceled or
            // superseded request objects were already answered or are dead and are never
            // touched here. Log carries the fixed tag and the verdict class only.
            val pending = pendingCameraRequest
            pendingCameraRequest = null
            val granted = grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) Log.i(TAG, "camera: runtime permission denied")
            if (pending != null) {
                if (granted) pending.grant(CAMERA_GRANT) else pending.deny()
            }
        }
    }

    /**
     * The ACTION_OPEN_DOCUMENT intent for a file chooser request: CATEGORY_OPENABLE, the
     * multiple flag from the JS mode, and the mapped MIME face from acceptTypes (issue #16
     * plan D5-2/L3 — single MIME becomes the intent type; several ride EXTRA_MIME_TYPES
     * with the primary type set to the wildcard star-slash-star, which Android requires
     * whenever EXTRA_MIME_TYPES is present; extensions map through MIME_BY_EXTENSION,
     * unknown ones are ignored).
     */
    private fun buildOpenIntent(params: WebChromeClient.FileChooserParams): Intent {
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*" // default: private keys have no single MIME type; the JS side validates the PEM header
            if ((params.mode and WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) != 0) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            val mimes = mappedAcceptMimes(params.acceptTypes)
            if (mimes.size == 1) {
                type = mimes[0]
            } else if (mimes.size > 1) {
                // EXTRA_MIME_TYPES only applies under a */* primary type (Android contract).
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            }
        }
    }

    /** The ACTION_GET_CONTENT fallback shares the open intent's type and extras. */
    private fun buildFallbackIntent(openIntent: Intent): Intent {
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = openIntent.type ?: "*/*"
            openIntent.extras?.let { putExtras(it) }
        }
    }

    /**
     * acceptTypes -> distinct non-wildcard MIME list. Elements may be MIME types (e.g.
     * the PDF MIME, used directly) or extensions (".pdf", mapped through the built-in
     * table; an unknown extension is ignored — plan L3). Anything else is ignored.
     */
    private fun mappedAcceptMimes(acceptTypes: Array<out String>?): List<String> {
        if (acceptTypes == null) return emptyList()
        val mimes = LinkedHashSet<String>()
        for (raw in acceptTypes) {
            val value = raw.trim().lowercase()
            if (value.isEmpty() || value == "*/*") continue
            if (value.contains('/')) {
                mimes.add(value)
            } else if (value.startsWith(".")) {
                MIME_BY_EXTENSION[value.substring(1)]?.let { mimes.add(it) }
            }
        }
        return mimes.toList()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // androidx OnBackPressedDispatcher is unavailable (zero-androidx constraint). The
        // manifest sets enableOnBackInvokedCallback="false" because Android 16 defaults
        // predictive back ON for targetSdk >= 36 apps, which would make this callback dead
        // code. Migrating to the platform OnBackInvokedCallback needs a minSdk guard
        // (API 33+) — follow-up issue.
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }
        // Issue #145 (review B1 fix): the in-app back chain is asked FIRST — dialogs,
        // drawers/panels, then in-app history. The WebView history gate must NOT precede
        // the chain: the vendored SPA runs on @solidjs/router pushState, whose entries
        // count into webView.canGoBack(), so after any in-app navigation the gate is
        // permanently true and a history-gate-first dispatch would never reach the chain
        // (the exact G31② state this bridge replaces). In-app history rides the chain as
        // its last layer (common.goBack semantics); the WebView history gate now serves
        // only as the post-decline fallback for non-SPA document navigations.
        // The reply races a double press, so exactly one dispatch is in flight at a time
        // and a second press inside the window is dropped; a reply that never arrives is
        // released by a bounded timeout (issue #145 review M1) so back can never wedge.
        // No binding yet / JS exception / false / timeout all decline the chain — the
        // fallback then decides, and the root keeps the exact pre-#145 finish behavior.
        // evaluateJavascript always targets the WebView's main frame. The origin gate is
        // still explicit: a page opened outside the packaged loopback shell can only use the
        // old native history/default fallback and never receives a back request.
        if (!isTrustedBackPage()) {
            applyWebViewHistoryFallback()
            return
        }
        if (backConsumePending) return
        val dispatchId = ++backConsumeDispatchId
        val requestId = "back-$dispatchId-${UUID.randomUUID()}"
        if (!BackDispatchPolicy.isValidRequest(BackDispatchPolicy.REQUEST_VERSION, BackDispatchPolicy.REQUEST_TYPE, requestId)) {
            applyWebViewHistoryFallback()
            return
        }

        val requestJson = JSONObject()
            .put("version", BackDispatchPolicy.REQUEST_VERSION)
            .put("type", BackDispatchPolicy.REQUEST_TYPE)
            .put("requestId", requestId)
            .toString()

        backConsumePending = true
        backConsumeTimeout.postDelayed({ onBackConsumeTimeout(dispatchId) }, BACK_CONSUME_TIMEOUT_MS)
        try {
            webView.evaluateJavascript(backConsumeScript(requestJson)) { result ->
                onBackConsumeResult(dispatchId, result)
            }
        } catch (_: Throwable) {
            // A destroyed or unavailable WebView is a decline, never a consumed press.
            onBackConsumeResult(dispatchId, null)
        }
    }

    private fun isTrustedBackPage(): Boolean =
        BackDispatchPolicy.isTrustedOrigin(webView.url, START_URL)

    private fun cancelBackConsume() {
        if (!backConsumePending) return
        backConsumeDispatchId += 1
        backConsumePending = false
        backConsumeTimeout.removeCallbacksAndMessages(null)
    }

    /**
     * Applies the serialized chain answer (issue #145): CONSUMED keeps the activity; a
     * decline runs the WebView history fallback (non-SPA document navigation), whose
     * decline is the Android default. Stale replies (timeout already released the window)
     * are ignored. Private members so the super call stays in method scope.
     */
    private fun onBackConsumeResult(dispatchId: Int, result: String?) {
        if (!BackDispatchPolicy.acceptsReply(dispatchId, backConsumeDispatchId, backConsumePending)) return
        backConsumePending = false
        backConsumeTimeout.removeCallbacksAndMessages(null)
        if (BackDispatchPolicy.decide(result) == BackDispatchPolicy.Outcome.CONSUMED) return
        applyWebViewHistoryFallback()
    }

    /**
     * Releases a window whose evaluation reply never arrived (issue #145 review M1) and
     * runs the same fallback a declined chain would: WebView history first, then the
     * Android default. Stale timeouts (reply already applied) are ignored.
     */
    private fun onBackConsumeTimeout(dispatchId: Int) {
        if (!BackDispatchPolicy.acceptsReply(dispatchId, backConsumeDispatchId, backConsumePending)) return
        backConsumePending = false
        applyWebViewHistoryFallback()
    }

    private fun applyWebViewHistoryFallback() {
        if (BackDispatchPolicy.historyFallback(::webView.isInitialized && webView.canGoBack()) ==
            BackDispatchPolicy.Outcome.WEBVIEW_BACK
        ) {
            webView.goBack()
            return
        }
        super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // TODO(state-restore): webView.saveState(outState) — 已确认未实现 (plan section 3).
    }

    override fun onDestroy() {
        // Only the local loopback asset server is torn down here. Remote OpenCode services
        // and tasks are never stopped because the client disconnects (AGENTS.md red line).
        pendingFileChooser?.onReceiveValue(null)
        pendingFileChooser = null
        // Issue #71: a pending WebView camera request is answered with deny (exactly-once
        // destroy path — the request object must never dangle unanswered across the
        // activity's death; the page's getUserMedia then rejects into its own error face).
        pendingCameraRequest?.deny()
        pendingCameraRequest = null
        vaultBridge?.destroy()
        vaultBridge = null
        probeBridge?.destroy()
        probeBridge = null
        // The ssh bridge tears down every tunnel LOCALLY (session disconnect + local
        // listener release only) — the remote OpenCode service/process keeps running
        // (AGENTS.md red line; F8① in decision 0003).
        sshBridge?.destroy()
        sshBridge = null
        // The svcops bridge tears down locally too (exec channel + short-lived session
        // close only) — the remote OpenCode service/process keeps running; a cancel never
        // stops a remote task (AGENTS.md red line; decision 0004).
        svcopsBridge?.destroy()
        svcopsBridge = null
        // The files bridge (issue #16) tears down locally only (channel + background
        // thread + SAF pendingSave slot); its destroy also clears the cacheDir/share/
        // staging root — the generational cleanup lifecycle's end (no remote state is
        // touched; the AGENTS.md red line does not arise here because the share face
        // never reaches a remote service).
        filesBridge?.destroy()
        filesBridge = null
        // The notifications bridge (issue #23) tears down locally only (channel +
        // background thread + pending permission slot). It holds zero remote state and
        // zero scheduled work — posted notifications are the system's, and remote
        // services/tasks are never touched by this teardown (AGENTS.md red line).
        notificationsBridge?.destroy()
        notificationsBridge = null
        // Issue #145 review M1: a back dispatch pending at destroy time has no callee left
        // — release the timeout window so it can never leak past the activity's death.
        backConsumeTimeout.removeCallbacksAndMessages(null)
        backConsumeDispatchId += 1
        backConsumePending = false
        assetServer?.stop()
        assetServer = null
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "OpencodeShell"
        private const val REQUEST_FILE_CHOOSER = 41001
        // REQUEST_SAVE_DOCUMENT = 41002 lives on FilesBridge (its SAF dialog's request
        // code, routed in onActivityResult).
        // REQUEST_NOTIFICATIONS = 41003 lives on NotificationsBridge.
        private const val REQUEST_CAMERA = 41004
        /** The WebView grant payload — exactly the policy's video whitelist (issue #71). */
        private val CAMERA_GRANT = CameraGrantPolicy.grantableResources().toTypedArray()
        private val START_URL = "http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}/"

        /**
         * The main-frame request wrapper (issue #186): only the fixed version/type/requestId
         * shape reaches the app binding, and the expression still completes to a bare JSON
         * boolean so BackDispatchPolicy's old fail-closed semantics remain unchanged.
         */
        private fun backConsumeScript(requestJson: String): String =
            "(function (request) { try { " +
                "if (!request || request.version !== 1 || request.type !== 'back' || " +
                "typeof request.requestId !== 'string' || request.requestId.length === 0) return false; " +
                "return window.opencodeMobileBack && " +
                "typeof window.opencodeMobileBack.consume === 'function' " +
                "? window.opencodeMobileBack.consume(request) === true : false " +
                "} catch (_) { return false } })($requestJson)"

        /**
         * Bound on the in-app back dispatch window (issue #145 review M1): well above a
         * healthy WebView round trip, short enough that a wedged evaluation cannot eat
         * more than this one press.
         */
        private const val BACK_CONSUME_TIMEOUT_MS = 500L

        /**
         * acceptTypes extension mapping (issue #16 plan L3): small built-in table, caliber
         * aligned with WebAssetServer.MIME_BY_EXTENSION (explicit table, unknown falls
         * through / is ignored).
         */
        private val MIME_BY_EXTENSION = mapOf(
            "pdf" to "application/pdf",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "gif" to "image/gif",
            "webp" to "image/webp",
            "svg" to "image/svg+xml",
            "txt" to "text/plain",
            "json" to "application/json",
            "csv" to "text/csv",
            "zip" to "application/zip",
            "html" to "text/html",
        )
    }
}
