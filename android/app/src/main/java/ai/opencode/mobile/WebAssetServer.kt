package ai.opencode.mobile

import android.content.res.AssetManager
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.net.URLDecoder

/**
 * Loopback static asset server for the WebView shell.
 *
 * Binds to 127.0.0.1 only and serves the packaged web build from assets/web/
 * (payload copied by scripts/copy-web-dist.sh; recorded by web-dist/manifest.json).
 * This server hosts app files, never an OpenCode service.
 */
class WebAssetServer(
    private val assets: AssetManager,
    port: Int = DEFAULT_PORT,
) : NanoHTTPD(LOOPBACK_HOST, port) {

    override fun serve(session: IHTTPSession): Response {
        // NanoHTTPD 2.3.1 strips the query string before decodeHeader populates session.uri;
        // substringBefore stays as defense in depth so a '?' can never select asset files.
        val path = resolveAssetPath((session.uri ?: "/").substringBefore('?'))
            ?: return plain(Response.Status.FORBIDDEN, "forbidden\n")
        return serveAsset(path)
    }

    private fun serveAsset(path: String): Response {
        val assetPath = path.ifEmpty { INDEX_HTML }
        val mime = mimeFor(assetPath)
        return try {
            newChunkedResponse(Response.Status.OK, mime, openAsset(assetPath))
        } catch (e: FileNotFoundException) {
            // SPA fallback: unknown paths (client-side routes) get the app shell.
            try {
                newChunkedResponse(Response.Status.OK, MIME_HTML, openAsset(INDEX_HTML))
            } catch (e: IOException) {
                plain(Response.Status.INTERNAL_ERROR, "asset server: index.html missing\n")
            }
        } catch (e: IOException) {
            plain(Response.Status.INTERNAL_ERROR, "asset server: read failure\n")
        }
    }

    private fun openAsset(path: String) = assets.open("$ASSETS_ROOT/$path", AssetManager.ACCESS_STREAMING)

    /**
     * Normalizes the request path and refuses anything that is not a plain relative
     * segment list. Returns null for rejected paths (traversal attempts included) and
     * an empty string for the root. Decoding model: NanoHTTPD 2.3.1 has already
     * percent-decoded the URI once before it reaches session.uri, and this decodes a
     * second time, so every smuggle form (%2e%2e, %2f, %252e%252e, %255c, raw '+')
     * resolves to its literal characters before the checks below — never relax them on
     * the assumption that the input is still encoded.
     */
    private fun resolveAssetPath(rawPath: String): String? {
        if (!rawPath.startsWith("/")) return null
        val segments = ArrayList<String>()
        for (segment in rawPath.split('/')) {
            if (segment.isEmpty() || segment == ".") continue
            // Defense in depth: after NanoHTTPD's decode and the second decode below, a
            // '+' can only come from a literal or double-encoded request; no packaged
            // asset name contains one, so '+' is rejected outright.
            if (segment.contains('+')) return null
            val decoded = try {
                URLDecoder.decode(segment, "UTF-8")
            } catch (e: IllegalArgumentException) {
                return null
            }
            if (decoded.isEmpty() || decoded == "..") return null
            if (decoded.contains('/') || decoded.contains('\\') || decoded.contains('\u0000')) return null
            segments.add(decoded)
        }
        return segments.joinToString("/")
    }

    private fun mimeFor(path: String): String {
        val name = path.substringAfterLast('/')
        val dot = name.lastIndexOf('.')
        if (dot <= 0) return DEFAULT_MIME
        return MIME_BY_EXTENSION[name.substring(dot + 1).lowercase()] ?: DEFAULT_MIME
    }

    private fun plain(status: Response.Status, text: String): Response {
        val payload = text.toByteArray()
        return newFixedLengthResponse(status, MIME_PLAINTEXT, ByteArrayInputStream(payload), payload.size.toLong())
    }

    companion object {
        const val LOOPBACK_HOST = "127.0.0.1"
        const val DEFAULT_PORT = 18090
        const val ASSETS_ROOT = "web"

        private const val INDEX_HTML = "index.html"
        private const val MIME_HTML = "text/html; charset=utf-8"
        private const val DEFAULT_MIME = "application/octet-stream"

        /** Explicit MIME table; unknown extensions fall back to octet-stream. */
        private val MIME_BY_EXTENSION = mapOf(
            "html" to MIME_HTML,
            "js" to "text/javascript; charset=utf-8",
            "mjs" to "text/javascript; charset=utf-8",
            "css" to "text/css; charset=utf-8",
            "json" to "application/json",
            "map" to "application/json",
            "webmanifest" to "application/manifest+json",
            "wasm" to "application/wasm",
            "txt" to "text/plain; charset=utf-8",
            "xml" to "application/xml",
            "svg" to "image/svg+xml",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "gif" to "image/gif",
            "webp" to "image/webp",
            "avif" to "image/avif",
            "ico" to "image/x-icon",
            "woff" to "font/woff",
            "woff2" to "font/woff2",
            "ttf" to "font/ttf",
            "otf" to "font/otf",
            "aac" to "audio/aac",
            "mp3" to "audio/mpeg",
            "mp4" to "video/mp4",
            "pdf" to "application/pdf",
            "zip" to "application/zip",
        )
    }
}
