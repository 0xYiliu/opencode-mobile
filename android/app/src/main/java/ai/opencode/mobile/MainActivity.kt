package ai.opencode.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import ai.opencode.mobile.files.FilesBridge
import ai.opencode.mobile.probe.ProbeBridge
import ai.opencode.mobile.ssh.SshTunnelBridge
import ai.opencode.mobile.svcops.ServiceOpsBridge
import ai.opencode.mobile.vault.CredentialVaultBridge
import fi.iki.elonen.NanoHTTPD
import java.io.IOException

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
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null

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

        // Credential vault bridge (issue #4): handshake is (re)started on every page load.
        vaultBridge = CredentialVaultBridge(this, webView)
        // Endpoint probe bridge (issue #5): protocol-isolated sibling of the vault bridge;
        // its own handshake string and channel, restarted on every page load alongside the
        // vault handshake. Until the page acks, the probe port stays unavailable.
        probeBridge = ProbeBridge(webView)
        // SSH tunnel bridge (issue #6): the THIRD protocol-isolated sibling — its own
        // handshake string (opencode-mobile-ssh-handshake) and channel, restarted on every
        // page load alongside the vault and probe handshakes. Until the page acks, the ssh
        // transport stays unavailable (fail-closed stub on the JS side).
        sshBridge = SshTunnelBridge(this, webView)
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

        webView.loadUrl(START_URL)
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

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // Each page load opens a new vault handshake round; the ack flag resets here
                // (ack lifecycle is navigation-scoped — see CredentialVaultBridge).
                vaultBridge?.onPageFinished()
                // The probe bridge (issue #5) runs its own, protocol-isolated handshake
                // round alongside the vault one (see ProbeBridge); its ack lifecycle is
                // likewise navigation-scoped.
                probeBridge?.onPageFinished()
                // The ssh bridge (issue #6) is the third protocol-isolated handshake round
                // (see SshTunnelBridge); ack lifecycle navigation-scoped like the others.
                sshBridge?.onPageFinished()
                // The svcops bridge (issue #7) is the fourth protocol-isolated handshake
                // round (see ServiceOpsBridge); ack lifecycle navigation-scoped like the
                // others.
                svcopsBridge?.onPageFinished()
                // The files bridge (issue #16) is the fifth protocol-isolated handshake
                // round (see FilesBridge); ack lifecycle navigation-scoped like the others.
                filesBridge?.onPageFinished()
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
        }
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
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
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
        private val START_URL = "http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}/"

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
