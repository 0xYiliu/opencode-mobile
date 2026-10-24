package ai.opencode.mobile.vault

import android.content.Context
import android.util.Log
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/**
 * Encrypted-at-rest store (issue #4, decision D2).
 *
 * Layout: `filesDir/vault/<id>.bin` holds one envelope (see [VaultCrypto]); `filesDir/vault/index.json`
 * holds metadata ONLY — `[{id, kind, label?, createdAt}]` — and NEVER a credential value
 * (red line; asserted by scripts/audit-secret-persistence.ts expectations on the metadata
 * shape and by C4 backup exclusion probing the whole directory).
 *
 * Writes are atomic: payload and index go to a `.tmp` sibling first and are renamed into
 * place, so a failed in-place update preserves the previous ciphertext (D6: re-save keeps
 * the binding stable). The 64 KiB value bound is re-checked here even though the JS side
 * pre-checks — the bound is an application decision double-written on both sides of the
 * bridge (C3 probes the exact boundary on device).
 */
class VaultStore(context: Context) {
    companion object {
        /** Application-chosen bound for one credential value, in UTF-8 bytes. */
        const val MAX_VALUE_BYTES = 65536
        private const val TAG = "OpencodeShell"
        private val ENTRY_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val KINDS = setOf("password", "privateKey")
    }

    private val dir = File(context.filesDir, "vault")
    private val indexFile = File(dir, "index.json")

    private fun assertId(id: String) {
        if (!ENTRY_ID.matches(id)) throw VaultException("io", "malformed entry id")
    }

    private fun entryFile(id: String): File {
        assertId(id)
        return File(dir, "$id.bin")
    }

    private fun readIndex(): JSONArray {
        if (!indexFile.isFile) return JSONArray()
        return try {
            JSONArray(indexFile.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            // A corrupted index is an io-level failure: report, never silently wipe entries
            // whose ciphertext files still exist.
            Log.w(TAG, "vault: index unreadable")
            throw VaultException("io", "credential index unreadable")
        }
    }

    /** Atomic index write: tmp + rename. POSIX rename atomically overwrites the target; a
     *  failure must only remove the tmp file — the previous index stays intact (an index
     *  row whose ciphertext was already replaced is repaired by the caller's error path,
     *  never by destroying the old payload). */
    private fun writeIndex(index: JSONArray) {
        val tmp = File(dir, "index.json.tmp")
        tmp.writeText(index.toString(), Charsets.UTF_8)
        if (!tmp.renameTo(indexFile)) {
            tmp.delete()
            throw VaultException("io", "credential index write failed")
        }
    }

    /**
     * Atomic payload write: tmp + rename. POSIX rename atomically overwrites the target, so
     * a failure keeps the previous ciphertext intact — the fallback "delete target, retry
     * rename" branch is deliberately absent: its second-failure path would DESTROY the old
     * ciphertext while its index row still references it (issue #4 review N1). A failed
     * rename only removes the tmp file and reports io.
     */
    private fun writeEntry(id: String, envelope: ByteArray) {
        dir.mkdirs()
        val target = entryFile(id)
        val tmp = File(dir, "$id.bin.tmp")
        tmp.writeBytes(envelope)
        if (!tmp.renameTo(target)) {
            tmp.delete()
            throw VaultException("io", "credential write failed")
        }
    }

    /**
     * Encrypt and store. `existingId` (optional) updates in place — the id (and therefore
     * the reference) stays stable, including the corrupt-entry healing path where the id is
     * referenced but its entry is missing: the put recreates it under the same id.
     */
    fun put(id: String, kind: String, value: ByteArray, label: String?, existingId: String?): String {
        assertId(id)
        if (kind !in KINDS) throw VaultException("io", "unknown credential kind")
        if (value.isEmpty()) throw VaultException("io", "empty value (native re-check)")
        if (value.size > MAX_VALUE_BYTES) throw VaultException("io", "value exceeds the 64 KiB bound (native re-check)")
        val targetId = if (existingId != null) {
            assertId(existingId)
            existingId
        } else {
            id
        }
        val envelope = VaultCrypto.seal(targetId, value)
        writeEntry(targetId, envelope)

        val index = readIndex()
        val next = JSONArray()
        var replaced = false
        val entry = JSONObject().apply {
            put("id", targetId)
            put("kind", kind)
            if (!label.isNullOrEmpty()) put("label", label)
            put("createdAt", nowIso())
        }
        for (i in 0 until index.length()) {
            val row = index.getJSONObject(i)
            if (row.optString("id") == targetId) {
                next.put(entry)
                replaced = true
            } else {
                next.put(row)
            }
        }
        if (!replaced) next.put(entry)
        writeIndex(next)
        return "mobile-credential:$targetId"
    }

    /** Delete an entry (payload + index row). Unknown ids are a silent success (idempotent). */
    fun remove(id: String) {
        assertId(id)
        entryFile(id).delete()
        val index = readIndex()
        val next = JSONArray()
        for (i in 0 until index.length()) {
            val row = index.getJSONObject(i)
            if (row.optString("id") != id) next.put(row)
        }
        writeIndex(next)
    }

    /** Decrypt to memory. Missing -> null; corrupt/unsupported throw their taxonomy codes. */
    fun get(id: String): ByteArray? {
        assertId(id)
        val file = entryFile(id)
        if (!file.isFile) return null
        return VaultCrypto.open(id, file.readBytes())
    }

    /** Metadata list only — the value field never exists here (client asserts this too). */
    fun list(): JSONArray {
        val index = readIndex()
        val result = JSONArray()
        for (i in 0 until index.length()) {
            val row = index.getJSONObject(i)
            val clean = JSONObject()
            clean.put("id", row.optString("id"))
            clean.put("kind", row.optString("kind"))
            if (row.has("label") && !row.optString("label").isNullOrEmpty()) clean.put("label", row.optString("label"))
            clean.put("createdAt", row.optString("createdAt"))
            result.put(clean)
        }
        return result
    }

    private fun nowIso(): String =
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }.format(java.util.Date())
}
