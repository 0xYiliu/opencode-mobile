package ai.opencode.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
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
                pendingFileChooser?.onReceiveValue(null)
                pendingFileChooser = null
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*" // private keys have no single MIME type; the JS side validates the PEM header
                }
                return try {
                    pendingFileChooser = filePathCallback
                    startActivityForResult(Intent.createChooser(intent, null), REQUEST_FILE_CHOOSER)
                    true
                } catch (e: ActivityNotFoundException) {
                    pendingFileChooser = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_FILE_CHOOSER) {
            super.onActivityResult(requestCode, resultCode, data)
            return
        }
        val callback = pendingFileChooser
        pendingFileChooser = null
        // Exactly-once on every path: cancel / no selection -> null; a picked document URI is
        // handed over once and never persisted or logged (bounded temporary access only, no
        // takePersistableUriPermission).
        val uri = if (resultCode == RESULT_OK) data?.data else null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
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
        private val START_URL = "http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}/"
    }
}
