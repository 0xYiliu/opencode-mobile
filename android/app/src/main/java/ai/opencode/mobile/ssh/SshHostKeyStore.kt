package ai.opencode.mobile.ssh

import android.util.Log
import java.io.File
import java.util.Base64
import java.security.MessageDigest

/**
 * Host-key store (issue #6, decision 0003 §3.1): `filesDir/ssh/known_hosts` in the NATIVE
 * OpenSSH line format — `host keytype base64` (or `[host]:port keytype base64` for
 * non-default ports) — so the trust state can be cross-checked verbatim with OpenSSH
 * tooling (`ssh-keygen -lf` reads what this app writes).
 *
 * Ruling: a host key is a TRUST ANCHOR, not a credential — the file is a plain app-private
 * file (confidentiality not required; integrity comes from the app-private directory),
 * NOT a vault entry. It stays outside backup channels (the `ssh/` exclusions in
 * data_extraction_rules.xml / full_backup_content.xml): trust state belongs to this device.
 *
 * Red lines locked here:
 * - A stored key is NEVER overwritten silently: [check] answers Trust / Unknown /
 *   Changed and the caller fail-closes on Changed. The ONLY write path is [record] from
 *   the pinned-open flow (the user's explicit fingerprint confirmation — "accept on first
 *   use" happens at the pinned open, before any credential is issued) and [remove] from
 *   the explicit recovery path. There is no "add and continue" bypass.
 * - Hashed hostnames are never produced and never matched (recognized lines are preserved
 *   verbatim on rewrite, matched by nothing): plaintext hostnames are recorded honestly in
 *   the app-private directory. The hashed wire form (pipe-digit-pipe prefix) is
 *   deliberately never spelled out in this file (scripts/verify-ssh.ts negative) —
 *   recognition is by the generic leading pipe character.
 * - Marked lines (`@revoked`/`@cert-authority`...) and pattern lists are outside this
 *   app's write surface: preserved verbatim on rewrite, never matched.
 * - Zero-value logging: no hostnames, no key material, no fingerprints in logcat.
 */
class SshHostKeyStore(private val baseDir: File) {
    companion object {
        private const val TAG = "OpencodeShell"
        private const val FILE_NAME = "known_hosts"
        private val HOST = Regex("^[A-Za-z0-9._-]{1,253}$")
        private val KEY_TYPE = Regex("^(?:ssh-(?:ed25519|ed448|rsa|dss)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\\.com|rsa-sha2-(?:256|512))$")
        private val BLOB = Regex("^[A-Za-z0-9+/]+={0,2}$")

        /** The documented OpenSSH fingerprint form: `SHA256:<base64_nopad(SHA-256(blob))>`. */
        fun fingerprintOf(blobBase64: String): String? {
            val blob = try {
                Base64.getDecoder().decode(blobBase64)
            } catch (e: IllegalArgumentException) {
                return null
            }
            if (blob.isEmpty()) return null
            val digest = MessageDigest.getInstance("SHA-256").digest(blob)
            // NO_PADDING: 32 bytes -> 43 base64 chars (the trailing '=' dropped), the exact
            // `ssh-keygen -lf` output. Locked to fixed vectors by scripts/verify-ssh.ts.
            return "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(digest)
        }

        /** The wire key type is the first field of the SSH key blob: int32 length + UTF-8. */
        fun keyTypeOf(blobBase64: String): String? {
            val blob = try {
                Base64.getDecoder().decode(blobBase64)
            } catch (e: IllegalArgumentException) {
                return null
            }
            if (blob.size < 4) return null
            val length = ((blob[0].toInt() and 0xff) shl 24) or ((blob[1].toInt() and 0xff) shl 16) or
                ((blob[2].toInt() and 0xff) shl 8) or (blob[3].toInt() and 0xff)
            if (length <= 0 || 4 + length > blob.size) return null
            return String(blob, 4, length, Charsets.UTF_8)
        }

        /** Canonical `[host]:port` / `host` field for a line (the OpenSSH convention). */
        private fun hostFieldOf(host: String, port: Int): String =
            if (port == 22) host else "[$host]:$port"
    }

    constructor(context: android.content.Context) : this(File(context.filesDir, "ssh"))

    private val file: File
        get() = File(baseDir, FILE_NAME)

    private fun assertHost(host: String) {
        if (!HOST.matches(host)) throw SshException(SshErrorCode.IO, "malformed ssh host")
    }

    /**
     * One parsed line. [raw] keeps foreign lines (hashed hostnames, markers, pattern lists)
     * verbatim for rewrite; [entry] is populated only for lines this app can match.
     */
    private data class Line(val raw: String, val entry: Entry?)

    private data class Entry(val host: String, val port: Int, val keyType: String, val blob: String)

    /** Parse the store. Unrecognized lines are kept verbatim (never dropped, never matched). */
    private fun readLines(): MutableList<Line> {
        val lines = mutableListOf<Line>()
        if (!file.isFile) return lines
        val text = try {
            file.readText(Charsets.UTF_8)
        } catch (e: Exception) {
            Log.w(TAG, "ssh: known_hosts unreadable")
            throw SshException(SshErrorCode.IO, "host key store unreadable")
        }
        for (rawLine in text.split("\n")) {
            val trimmed = rawLine.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue
            val fields = trimmed.split("\\s+".toRegex())
            // Known foreign shapes are preserved verbatim: marker lines (@-prefixed first
            // field), hashed hostnames (leading "|"), pattern lists (comma in host field).
            if (fields[0].startsWith("@") || fields[0].startsWith("|") || fields[0].contains(",")) {
                lines.add(Line(trimmed, null))
                continue
            }
            // Everything below is the strict 3-field parse. A line that fails ANY step is
            // preserved VERBATIM and never matched (kept out of [entry]): a rewrite must
            // never destroy store content this app cannot fully interpret (review N6b —
            // behavior now matches the "never rewrite what we cannot parse" contract).
            if (fields.size != 3) {
                lines.add(Line(trimmed, null))
                continue
            }
            val hostField = fields[0]
            val keyType = fields[1]
            val blob = fields[2]
            var host = hostField
            var port = 22
            if (hostField.startsWith("[")) {
                val close = hostField.indexOf("]:")
                if (close == -1) {
                    lines.add(Line(trimmed, null))
                    continue
                }
                host = hostField.substring(1, close)
                val parsedPort = hostField.substring(close + 2).toIntOrNull()
                if (parsedPort == null) {
                    lines.add(Line(trimmed, null))
                    continue
                }
                port = parsedPort
            }
            if (!HOST.matches(host) || !KEY_TYPE.matches(keyType) || !BLOB.matches(blob) || port !in 1..65535) {
                lines.add(Line(trimmed, null))
                continue
            }
            lines.add(Line(trimmed, Entry(host, port, keyType, blob)))
        }
        return lines
    }

    /** Atomic rewrite: tmp + rename; a failure keeps the previous store intact. */
    private fun writeLines(lines: List<Line>) {
        baseDir.mkdirs()
        val tmp = File(baseDir, "$FILE_NAME.tmp")
        tmp.writeText(lines.joinToString(separator = "\n", postfix = "\n") { it.raw }, Charsets.UTF_8)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw SshException(SshErrorCode.IO, "host key store write failed")
        }
    }

    /** The trust decision for a presented key against the store. Never mutates. */
    fun check(host: String, port: Int, keyType: String, blobBase64: String): SshErrorCode? {
        assertHost(host)
        val presented = fingerprintOf(blobBase64) ?: return SshErrorCode.IO
        for (line in readLines()) {
            val entry = line.entry ?: continue // foreign lines never match
            if (entry.host != host || entry.port != port) continue
            // The stored BLOB is the authority (not just the fingerprint): byte equality.
            return if (entry.keyType == keyType && entry.blob == blobBase64) null
            else SshErrorCode.HOST_KEY_CHANGED
        }
        return SshErrorCode.HOST_KEY_UNKNOWN
    }

    /**
     * Record a confirmed key (the pinned-open path: the user confirmed this exact
     * fingerprint and the presented key matched it). Idempotent for the same key; a
     * conflicting write is refused — nothing here ever overwrites a different key.
     */
    fun record(host: String, port: Int, keyType: String, blobBase64: String) {
        assertHost(host)
        if (!KEY_TYPE.matches(keyType) || !BLOB.matches(blobBase64)) {
            throw SshException(SshErrorCode.IO, "malformed host key record")
        }
        val lines = readLines()
        val hostField = hostFieldOf(host, port)
        val newRaw = "$hostField $keyType $blobBase64"
        var replaced = false
        val next = mutableListOf<Line>()
        for (line in lines) {
            val entry = line.entry
            if (entry != null && entry.host == host && entry.port == port) {
                if (entry.blob != blobBase64) {
                    // Never overwrite a different key (defense in depth; the pinned flow
                    // already refused this upstream).
                    throw SshException(SshErrorCode.HOST_KEY_CHANGED, "refusing to overwrite a stored host key")
                }
                next.add(Line(newRaw, entry)) // same key: canonicalize the line
                replaced = true
            } else {
                next.add(line)
            }
        }
        if (!replaced) next.add(Line(newRaw, Entry(host, port, keyType, blobBase64)))
        writeLines(next)
    }

    /** The explicit changed-key recovery removal (idempotent; foreign lines preserved). */
    fun remove(host: String, port: Int) {
        assertHost(host)
        val hostField = hostFieldOf(host, port)
        val lines = readLines()
        val next = lines.filter { line ->
            val entry = line.entry
            !(entry != null && entry.host == host && entry.port == port) && line.raw != hostField
        }
        if (next.size == lines.size) return // nothing stored: silent success (idempotent)
        writeLines(next)
    }
}
