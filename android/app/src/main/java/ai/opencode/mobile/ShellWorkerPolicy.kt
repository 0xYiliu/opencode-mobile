package ai.opencode.mobile

import java.net.URI

/** Pure allowlist policy for the one packaged WebView shell and its Workbox worker. */
internal object ShellWorkerPolicy {
    private fun origin(url: String): String? {
        return try {
            val uri = URI(url)
            if (!uri.isAbsolute || uri.host.isNullOrBlank() || uri.userInfo != null) return null
            val scheme = uri.scheme.lowercase()
            if (scheme != "http" && scheme != "https") return null
            val port = if (uri.port == -1) "" else ":${uri.port}"
            "$scheme://${uri.host.lowercase()}$port"
        } catch (_: Exception) {
            null
        }
    }

    fun expectedRootScope(shellStartUrl: String): String? {
        return try {
            val uri = URI(shellStartUrl)
            if (origin(shellStartUrl) == null || uri.rawPath !in listOf("", "/") || uri.rawQuery != null || uri.rawFragment != null) {
                null
            } else {
                "${origin(shellStartUrl)}/"
            }
        } catch (_: Exception) {
            null
        }
    }

    fun expectedWorkerScript(shellStartUrl: String): String? =
        expectedRootScope(shellStartUrl)?.let { "${it}sw.js" }

    /** Same-origin navigations are allowed; redirects to another origin are not. */
    fun isTrustedShellPage(pageUrl: String, shellStartUrl: String): Boolean {
        if (expectedRootScope(shellStartUrl) == null) return false
        val expected = origin(shellStartUrl) ?: return false
        return origin(pageUrl) == expected
    }

    /** Every worker capable of being promoted must be the exact packaged script URL. */
    fun isTrustedWorkerRegistration(
        shellStartUrl: String,
        pageUrl: String,
        scope: String,
        workerScriptUrls: List<String>,
    ): Boolean {
        val expectedScope = expectedRootScope(shellStartUrl) ?: return false
        val expectedScript = expectedWorkerScript(shellStartUrl) ?: return false
        return isTrustedShellPage(pageUrl, shellStartUrl)
            && scope == expectedScope
            && workerScriptUrls.isNotEmpty()
            && workerScriptUrls.all { it == expectedScript }
    }
}
