package ai.opencode.mobile.files

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException

/**
 * The minimal read-only ContentProvider behind the files bridge's share face (issue #16).
 *
 * Zero androidx: androidx.core.content.FileProvider is unavailable (the shell's sole
 * runtime dependencies are nanohttpd/jsch/bcprov), so this hand-written provider carries
 * exactly the surface a share target needs and nothing more:
 *
 *  - openFile: READ-ONLY ("r" only). The URI must be exactly
 *    content://ai.opencode.mobile.share/<generation>/<name>; BOTH segments are validated
 *    (the WebAssetServer.resolveAssetPath segment-validation style): a generation is a
 *    UUID-shaped token, a name must match the same FILENAME whitelist the bridge enforced
 *    before staging — path traversal (.., separators, encoded escapes) can never resolve
 *    outside cacheDir/share/<generation>/. A canonical-path re-check closes the symlink
 *    lane (defense in depth: nothing in the staging tree is expected to be a symlink).
 *  - query: only the two OpenableColumns share targets actually read (DISPLAY_NAME, SIZE)
 *    plus MIME — no projection gymnastics, no data beyond metadata (never file content).
 *  - getType: the extension-derived MIME (MimeTypeMap), octet-stream fallback.
 *  - insert/update/delete: refused outright (no write capability of any kind).
 *
 * Manifest registration (plan D5): android:exported="false" +
 * android:grantUriPermissions="true" — the URI is handed only to the ACTION_SEND chooser
 * with FLAG_GRANT_READ_URI_PERMISSION on both the send and the chooser intent (plan L8);
 * nothing else can reach this provider.
 *
 * Zero-value logging: no filename, no size, no URI is ever logged here.
 */
class ShareFileProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "ai.opencode.mobile.share"

        /** The same whitelist as FilesBridge.FILENAME / JS sanitizeFilename (plan B2). */
        private val FILENAME = Regex("^[A-Za-z0-9][A-Za-z0-9 ._\\-\\[\\]()]{0,127}$")

        /** UUID-shaped generation token (as produced by FilesBridge UUID.randomUUID). */
        private val GENERATION = Regex("^[A-Za-z0-9-]{1,64}$")

        private val COLUMNS = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, "mime")
    }

    private fun shareRoot(): File {
        val context = context ?: throw FileNotFoundException("provider context is gone")
        return File(context.cacheDir, "share")
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("share provider is read-only")
        val segments = uri.pathSegments
        if (segments.size != 2) throw FileNotFoundException("malformed share URI shape")
        val generation = segments[0]
        val name = segments[1]
        if (!GENERATION.matches(generation)) throw FileNotFoundException("malformed share generation")
        if (!FILENAME.matches(name)) throw FileNotFoundException("malformed share name")
        val context = context ?: throw FileNotFoundException("provider context is gone")
        val root = shareRoot()
        val file = File(File(root, generation), name)
        // Canonical re-check (defense in depth against symlinked staging entries).
        if (!file.canonicalPath.startsWith(root.canonicalPath + File.separator)) {
            throw FileNotFoundException("share path escaped the staging root")
        }
        if (!file.isFile) throw FileNotFoundException("no staged share entry")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        val segments = uri.pathSegments
        val name = if (segments.size == 2) segments[1] else ""
        val file = if (segments.size == 2 && GENERATION.matches(segments[0]) && FILENAME.matches(name)) {
            File(File(shareRoot(), segments[0]), name)
        } else {
            null
        }
        val cursor = MatrixCursor(COLUMNS)
        cursor.addRow(
            arrayOf(
                name,
                file?.length() ?: 0L,
                getType(uri),
            ),
        )
        return cursor
    }

    override fun getType(uri: Uri): String {
        val segments = uri.pathSegments
        val name = if (segments.size == 2) segments[1] else return "application/octet-stream"
        val dot = name.lastIndexOf('.')
        if (dot < 0) return "application/octet-stream"
        val ext = MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(name.substring(dot + 1).lowercase())
        return ext ?: "application/octet-stream"
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0

    override fun onCreate(): Boolean = true
}
