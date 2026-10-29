package ai.opencode.mobile.probe

import android.util.Base64
import android.util.Log
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException

/**
 * One-shot endpoint classifier for direct connections (issue #5, decision 0002 D2).
 *
 * The probe asks "why did the transport fail" and answers with one classification code;
 * it is NEVER the authority — the vendored app's health check (the WebView's own fetch)
 * decides whether a save proceeds, and a classification that conflicts with a real fetch
 * result is discarded (docs/decisions/0002-direct-connection-transport.md, D4). The probe
 * runs on the SAME route the health check uses (GET <baseUrl>/api/info) so both sides
 * talk about the same endpoint.
 *
 * TLS handling (red line, AGENTS.md): the connection uses the platform defaults — system
 * CA store as the only trust anchor, chain/expiry/hostname validation strict, and no
 * factory or verifier hook is installed or exposed here. Certificate failures are
 * CLASSIFIED (below) and reported; they are never bypassed. `scripts/verify-direct-
 * connection.ts` asserts statically that no custom trust/verifier hooks exist anywhere
 * under android/.
 *
 * Cleartext: `http://` requests to non-loopback hosts are blocked by the platform
 * network security policy (base config forbids cleartext, loopback exception only) and
 * surface here as CLEARTEXT_BLOCKED — the probe and the WebView see the same policy.
 *
 * Redirects: automatic following is DISABLED so the Authorization header built from the
 * user-entered origin can never travel to a redirect target (HttpURLConnection has no
 * browser-style cross-host header stripping). A 3xx answer is left unclassified (null),
 * which degrades to the generic error message — a classification is never fabricated.
 *
 * Credential boundary (decision 0002 F1): the password crosses the bridge once, is held
 * in memory for the duration of one request, is never logged, never persisted, and never
 * appears in the response (which carries only the classification code).
 *
 * Zero-value logging: logs carry fixed tags and counters only — never the URL, never the
 * Authorization header, never any credential or body content.
 */
class DirectEndpointProbe(
    private val connectTimeoutMs: Int = CONNECT_TIMEOUT_MS,
    private val readTimeoutMs: Int = READ_TIMEOUT_MS,
    private val maxSniffBytes: Int = MAX_SNIFF_BYTES,
) {

    enum class Code {
        OK,
        CERT_EXPIRED,
        CERT_HOSTNAME,
        CERT_UNTRUSTED,
        CLEARTEXT_BLOCKED,
        REFUSED,
        TIMEOUT,
        DNS,
        UNAUTHORIZED,
        FORBIDDEN,
        NOT_FOUND,
        HTML_RESPONSE,
    }

    /** Classification result; null = unclassified (caller must degrade, never guess). */
    fun classify(baseUrl: String, password: String?): Code? {
        val endpoint = probeEndpointOf(baseUrl) ?: return null
        // Connection construction is inside the guarded region too: URI()/toURL()/
        // openConnection() can throw (malformed scheme details, unknown protocol), and no
        // exception may escape classify() — the bridge maps a throw to an error response,
        // but the contract here is to return null (unclassified) instead.
        val connection = try {
            open(endpoint, password)
        } catch (e: Exception) {
            Log.w(TAG, "probe: endpoint open failed")
            return null
        }
        return try {
            readVerdict(connection)
        } catch (e: IOException) {
            classifyTransportFailure(e)
        } catch (e: Exception) {
            Log.w(TAG, "probe: unclassified failure")
            null
        } finally {
            connection.disconnect()
        }
    }

    // -- endpoint assembly and validation (strict; null = refuse to probe) ----------------

    /** GET <baseUrl>/api/info — the route the upstream health check uses. */
    private fun probeEndpointOf(baseUrl: String): String? = probeEndpoint(baseUrl)

    private fun open(endpoint: String, password: String?): HttpURLConnection {
        val connection = (java.net.URI(endpoint).toURL().openConnection() as HttpURLConnection)
        connection.connectTimeout = connectTimeoutMs
        connection.readTimeout = readTimeoutMs
        // Never follow redirects automatically: the Authorization header must not leave
        // the user-entered origin (no browser-style stripping exists on this stack).
        connection.instanceFollowRedirects = false
        connection.requestMethod = "GET"
        // The Basic scheme mirrors the vendored app: base64("opencode:<password>").
        if (!password.isNullOrEmpty()) {
            val token = Base64.encodeToString("opencode:$password".toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
            connection.setRequestProperty("Authorization", "Basic $token")
        }
        return connection
    }

    private fun readVerdict(connection: HttpURLConnection): Code? {
        val status = connection.responseCode
        val contentType = connection.contentType?.lowercase() ?: ""
        val body = snif(connection, status)
        if (status in 200..299) {
            // A captive portal / proxy intercepts with an HTML page; the OpenCode API
            // route answers JSON. Sniff as a fallback for proxies that omit content-type.
            if (contentType.contains("text/html") || looksLikeHtml(body)) return Code.HTML_RESPONSE
            return Code.OK
        }
        return when (status) {
            301, 302, 303, 307, 308 -> null // redirect left the requested route: unclassified
            401 -> Code.UNAUTHORIZED
            403 -> Code.FORBIDDEN
            404 -> Code.NOT_FOUND
            else -> if (contentType.contains("text/html") || looksLikeHtml(body)) Code.HTML_RESPONSE else null
        }
    }

    /** Bounded body sniff (at most [maxSniffBytes]); the content is read, never logged. */
    private fun snif(connection: HttpURLConnection, status: Int): String {
        val stream = try {
            if (status in 200..299) connection.inputStream else connection.errorStream
        } catch (e: IOException) {
            connection.errorStream
        } ?: return ""
        return try {
            val buffer = ByteArray(maxSniffBytes)
            var offset = 0
            while (offset < maxSniffBytes) {
                val read = stream.read(buffer, offset, maxSniffBytes - offset)
                if (read == -1) break
                offset += read
            }
            String(buffer, 0, offset, Charsets.UTF_8)
        } catch (e: IOException) {
            ""
        } finally {
            try {
                stream.close()
            } catch (e: IOException) {
                // closing twice / a dead stream must never mask the verdict
            }
        }
    }

    private fun looksLikeHtml(body: String): Boolean {
        val head = body.trimStart('\uFEFF', ' ', '\t', '\r', '\n').lowercase()
        return head.startsWith("<!doctype") || head.startsWith("<html")
    }

    // -- transport failure classification (exception inspection; values never logged) -----

    private fun classifyTransportFailure(e: IOException): Code? {
        return when (e) {
            is SSLHandshakeException -> when {
                e.message?.lowercase()?.contains("expired") == true -> Code.CERT_EXPIRED
                else -> Code.CERT_UNTRUSTED // covers untrusted chains; self-signed vs private CA is indistinguishable client-side
            }
            is SSLPeerUnverifiedException -> Code.CERT_HOSTNAME
            is SSLException -> Code.CERT_UNTRUSTED
            is SocketTimeoutException -> Code.TIMEOUT
            is ConnectException -> Code.REFUSED
            is UnknownHostException -> Code.DNS
            else -> {
                // The platform network security policy reports blocked cleartext through a
                // plain IOException whose message names the traffic class; match on the
                // fixed phrase, never on any host-specific part.
                if (e.message?.lowercase()?.contains("cleartext http traffic") == true) Code.CLEARTEXT_BLOCKED
                else null // unclassified: degrade honestly
            }
        }
    }

    companion object {
        private const val TAG = "OpencodeShell"
        private const val PROBE_PATH = "/api/info"
        private const val MAX_URL_LENGTH = 2048
        private const val CONNECT_TIMEOUT_MS = 8_000
        private const val READ_TIMEOUT_MS = 8_000
        private const val MAX_SNIFF_BYTES = 16 * 1024

        /**
         * Strict URL policy, single source of truth for the instance above and for
         * ProbeBridge's native re-check: absolute http(s) only, a non-empty host, and no
         * userinfo (long-term credentials never travel in URLs — decision 0002 D-URL).
         * Returns the probe endpoint, or null when the URL is refused.
         */
        fun probeEndpoint(baseUrl: String): String? {
            val trimmed = baseUrl.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_URL_LENGTH) return null
            val lower = trimmed.lowercase()
            if (!(lower.startsWith("http://") || lower.startsWith("https://"))) return null
            val authorityStart = trimmed.indexOf("://") + 3
            val pathStart = trimmed.indexOf('/', authorityStart)
            val authority =
                if (pathStart == -1) trimmed.substring(authorityStart) else trimmed.substring(authorityStart, pathStart)
            if (authority.contains('@')) return null
            if (authority.substringBefore(':').isEmpty()) return null // no host
            return trimmed.trimEnd('/') + PROBE_PATH
        }
    }
}
