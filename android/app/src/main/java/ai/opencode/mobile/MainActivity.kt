package ai.opencode.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
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

        webView.loadUrl(START_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = true
            // domStorage stays on for non-credential UI state; server credentials are kept
            // memory-only by the vendored M-002 patch (see docs/design/interaction.md).
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
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // androidx OnBackPressedDispatcher is unavailable (zero-androidx constraint); the
        // framework callback stays valid while enableOnBackInvokedCallback remains unset.
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
        assetServer?.stop()
        assetServer = null
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "OpencodeShell"
        private const val START_URL = "http://${WebAssetServer.LOOPBACK_HOST}:${WebAssetServer.DEFAULT_PORT}/"
    }
}
