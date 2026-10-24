package ai.opencode.mobile.svcops

import android.os.SystemClock
import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import com.jcraft.jsch.UIKeyboardInteractive
import com.jcraft.jsch.UserInfo
import java.io.ByteArrayOutputStream
import java.io.InputStream
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import ai.opencode.mobile.ssh.SshErrorCode
import ai.opencode.mobile.ssh.SshHostKeyStore
import ai.opencode.mobile.ssh.SshTunnelManager

/**
 * The service ops exec engine (issue #7, decision 0004 §2.1): ONE short-lived,
 * independently authenticated SSH session per command, executed over a JSch
 * [ChannelExec], torn down locally when the command completes. It deliberately does NOT
 * piggyback on the tunnel sessions: discovery/install stays decoupled from the tunnel
 * state (a broken tunnel can be repaired from the panel) and the tunnel's
 * watchdog/teardown thread contract (decision 0003 F6) is never perturbed.
 *
 * Lifecycle red line (double-written with the bridge, AGENTS.md): every teardown here is
 * LOCAL — closing the exec channel and the session never signals the remote OpenCode
 * service; a client cancel/disconnect stops nothing remote. A cancel during execution
 * closes the channel but the remote may have continued — the JS flow marks that outcome
 * cancel-uncertain and forces a re-discovery; this class never claims an abort.
 *
 * Command surface: the ONLY setCommand call site in the app sits below, and its argument
 * is exclusively the output of [ServiceCommandValidator.validate] — an unknown template,
 * a cross-OS assembly, any metacharacter or any refused parameter never reaches exec
 * (fail-closed, EXEC_DENIED).
 *
 * Host-key trust (decision 0003 §3.3 ownership, inherited verbatim — the fourth bridge
 * builds NO trust of its own): the presented key is captured anonymously
 * ([SshTunnelManager.scanHostKey], zero authentication material) and compared against the
 * authoritative [SshHostKeyStore]; a changed key routes back to the connection flow (the
 * connection flow's own store check then refuses HARD with host-key-changed and its
 * recovery UI — this face never overwrites a key); an unknown key is only accepted when
 * the request carries the fingerprint the user pinned through the connection flow's
 * confirmation (accept-on-first-use at that pinned exec, before any credential is
 * issued). Credentials are issued to NO ONE before a fingerprint is confirmed.
 *
 * Credential boundary (N7, inherited from decision 0003 §4): the credential crosses into
 * this class exactly once per command (parsed per command — 逐命令解析), lives in local
 * memory only for the duration of that one exec, is never logged (zero-value logging:
 * fixed tags + op names + wire codes, no hosts, no ports, no values), never persisted and
 * never echoed — responses carry exit codes, bounded output and classifications only.
 *
 * Bounds: stdout/stderr are each capped at 16 KiB with explicit truncation flags; the
 * whole exec is bounded by a deadline — a hung command is detached LOCALLY (channel +
 * session closed, EXEC_TIMEOUT) and the remote may still be running it.
 *
 * Threading: exec runs on the bridge's single work executor (never the main thread);
 * cancel is dispatched off-executor and only closes the live channel/session (local-only,
 * never queued behind an in-flight exec). Per-host single flight: at most one in-flight
 * exec per host:port (the JS driver is sequential per host; the gate is defensive).
 */
class ServiceOpsManager(context: android.content.Context) {
    companion object {
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val EXEC_TIMEOUT_MS = 60_000
        private const val MAX_OUTPUT_BYTES = 16 * 1024 // per stream, with explicit truncation flags
        private const val MAX_CREDENTIAL_BYTES = 65_536 // the vault bound (decision 0003 §4)
        private const val POLL_MS = 25L
        private val FINGERPRINT = Regex("^SHA256:[A-Za-z0-9+/]{43}$")
        private val HOST = Regex("^[A-Za-z0-9._-]{1,253}$")
        private val PEM_BEGIN = Regex("^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")
        private val OS_DOMAINS = setOf("linux", "darwin", "windows")
        private fun sessionKey(host: String, port: Int) = "$host:$port"
    }

    private val store = SshHostKeyStore(context)
    // Reuse of the proven anonymous key-capture path (scan sessions carry zero
    // authentication material — decision 0003 F2, locked by scripts/verify-ssh.ts).
    private val scanner = SshTunnelManager(context)

    // cancel never queues behind an in-flight exec (F6 mirror): a dedicated teardown
    // thread closes the live channel/session.
    private val teardownThread: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "opencode-mobile-svcops-teardown").apply { isDaemon = true }
    }

    /** One in-flight exec seat; the handles fill in once the channel exists. */
    private class LiveExec(val channel: ChannelExec?, val session: Session?)

    /** Per-host single flight, keyed `host:port`. */
    private val inFlight = HashMap<String, LiveExec>()
    private val lock = Any()
    private var destroyed = false

    fun destroy() {
        synchronized(lock) {
            destroyed = true
            val all = ArrayList<LiveExec>(inFlight.values)
            inFlight.clear()
            for (exec in all) closeLocal(exec)
        }
        scanner.destroy()
        teardownThread.shutdown()
    }

    /**
     * Best-effort LOCAL cancel of an in-flight exec for a host: the channel and session
     * close; the remote process may continue (never a remote signal — red line).
     */
    fun cancel(host: String, port: Int) {
        val exec: LiveExec? = synchronized(lock) { inFlight.remove(sessionKey(host, port)) }
        if (exec != null) closeLocal(exec)
    }

    private fun closeLocal(exec: LiveExec?) {
        if (exec == null) return
        teardownThread.execute {
            try {
                try {
                    exec.channel?.disconnect()
                } catch (ignored: Exception) {}
                try {
                    exec.session?.disconnect()
                } catch (ignored: Exception) {}
            } catch (ignored: Exception) {}
        }
    }

    /**
     * Run one whitelisted command. Returns the result JSON
     * {exitCode, stdout, stderr, stdoutTruncated, stderrTruncated}. Every failure throws
     * [ServiceOpsException] with its wire classification.
     */
    fun exec(
        host: String,
        port: Int,
        username: String?,
        os: String,
        templateId: String,
        params: Map<String, String>,
        credential: String?,
        pinnedFingerprint: String?,
    ): JSONObject {
        if (destroyed) throw ServiceOpsException(ServiceOpsErrorCode.SVCOPS_UNAVAILABLE, "manager destroyed")
        if (!HOST.matches(host) || port !in 1..65535) {
            throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "refused target shape")
        }
        if (os !in OS_DOMAINS) throw ServiceOpsException(ServiceOpsErrorCode.OS_UNKNOWN, "undetermined remote OS")

        // The single command gate: setCommand executes ONLY validator output (fail-closed).
        val command = ServiceCommandValidator.validate(os, templateId, params)
            ?: throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "the requested command was refused by the whitelist")

        var session: Session? = null
        var channel: ChannelExec? = null
        val key = sessionKey(host, port)
        // N2 (issue #7 review): the seat is taken atomically (putIfAbsent semantics) and
        // the channel registration re-checks ownership so a cancel that removed the seat
        // during session establishment can never be resurrected by this exec.
        var current = LiveExec(null, null)
        synchronized(lock) {
            if (destroyed) throw ServiceOpsException(ServiceOpsErrorCode.SVCOPS_UNAVAILABLE, "manager destroyed")
            if (inFlight.putIfAbsent(key, current) != null) {
                // Defensive single flight (the JS driver is sequential per host).
                throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "an exec is already in flight for this host")
            }
        }
        try {
            // 1. Host-key gate BEFORE any credential exists (decision 0003 §3.3 verbatim).
            val (presentedType, presentedBlob) = scanner.scanHostKey(host, port)
            when (store.check(host, port, presentedType, presentedBlob)) {
                null -> {} // store hit, same key: the trust path
                SshErrorCode.HOST_KEY_CHANGED ->
                    // Route back to the connection flow: its own store check refuses HARD
                    // (host-key-changed + recovery UI). This face never overwrites a key.
                    throw ServiceOpsException(ServiceOpsErrorCode.HOST_KEY_UNKNOWN, "presented key differs from the stored record")
                else -> {
                    if (pinnedFingerprint == null) {
                        throw ServiceOpsException(ServiceOpsErrorCode.HOST_KEY_UNKNOWN, "host key not confirmed yet")
                    }
                    if (!FINGERPRINT.matches(pinnedFingerprint)) {
                        throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "malformed pinned fingerprint")
                    }
                    val presented = SshHostKeyStore.fingerprintOf(presentedBlob)
                    if (presented == null || presented != pinnedFingerprint) {
                        throw ServiceOpsException(ServiceOpsErrorCode.HOST_KEY_UNKNOWN, "presented key differs from the pinned fingerprint")
                    }
                    store.record(host, port, presentedType, presentedBlob) // accept-on-first-use at the pinned exec
                }
            }

            // 2. Credential material — parsed PER COMMAND, memory-only (N7).
            var keyMaterial: Pair<ByteArray, ByteArray?>? = null
            var password: String? = null
            if (credential != null && credential.isNotEmpty()) {
                if (credential.toByteArray(Charsets.UTF_8).size > MAX_CREDENTIAL_BYTES) {
                    throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "credential exceeds the bound")
                }
                val trimmed = credential.trimStart()
                if (trimmed.startsWith("{")) {
                    keyMaterial = resolveKeyEnvelope(credential)
                } else if (PEM_BEGIN.containsMatchIn(credential.lineSequence().firstOrNull() ?: "")) {
                    keyMaterial = Pair(credential.toByteArray(Charsets.UTF_8), null)
                } else {
                    password = credential
                }
            }

            // 3. The short-lived session (StrictHostKeyChecking stays "yes"; the store is
            //    the authoritative KEX comparison — validation is never disabled).
            val jsch = JSch()
            if (keyMaterial != null) {
                try {
                    jsch.addIdentity("opencode-mobile-svcops-key", keyMaterial.first, null, keyMaterial.second)
                } catch (e: JSchException) {
                    throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "private key could not be loaded")
                }
            }
            // Review B2: the username comes from the target's user@ segment (a routing
            // fact, not a credential) — the pre-B2 bug passed the PASSWORD here, so every
            // session authenticated as the wrong user (or an empty one for key auth).
            // Absent username = the target carried no user@ (server default behavior).
            val sessionUser = username?.takeIf { it.isNotEmpty() } ?: ""
            val execSession = jsch.getSession(sessionUser, host, port)
            session = execSession
            execSession.setConfig("StrictHostKeyChecking", "yes")
            execSession.setTimeout(EXEC_TIMEOUT_MS)
            if (password != null) {
                execSession.setUserInfo(passwordUserInfo(password))
            }
            try {
                execSession.connect(CONNECT_TIMEOUT_MS)
            } catch (e: JSchException) {
                throw classifySessionException(e)
            }

            // 4. The exec channel: the app's ONLY setCommand call site, fed exclusively by
            //    the validator's output.
            val execChannel = try {
                execSession.openChannel("exec") as ChannelExec
            } catch (e: Exception) {
                throw ServiceOpsException(ServiceOpsErrorCode.EXEC_FAILED, "the exec channel could not be opened")
            }
            channel = execChannel
            synchronized(lock) {
                if (destroyed) throw ServiceOpsException(ServiceOpsErrorCode.SVCOPS_UNAVAILABLE, "manager destroyed")
                if (inFlight[key] !== current) {
                    // The seat was cancelled during session establishment: do not
                    // resurrect it (review N2) — tear down locally and report honestly.
                    throw ServiceOpsException(ServiceOpsErrorCode.CANCELLED, "cancelled during session establishment")
                }
                current = LiveExec(execChannel, execSession)
                inFlight[key] = current
            }
            execChannel.setCommand(command)
            execChannel.setInputStream(null) // stdin: nothing locally; the templates self-redirect (N1)
            val stdout = execChannel.inputStream
            val stderr = execChannel.errStream
            execChannel.connect(CONNECT_TIMEOUT_MS)

            // 5. Bounded reads + bounded wait + exit status.
            val deadline = SystemClock.elapsedRealtime() + EXEC_TIMEOUT_MS
            val (outBytes, outTruncated) = readBounded(stdout, deadline, execChannel)
            val (errBytes, errTruncated) = readBounded(stderr, deadline, execChannel)
            while (!execChannel.isClosed) {
                if (SystemClock.elapsedRealtime() > deadline) {
                    // Detached LOCALLY: the remote may still be running the command — the
                    // JS face carries that honesty (exec-timeout), never a fake result.
                    throw ServiceOpsException(ServiceOpsErrorCode.EXEC_TIMEOUT, "the command did not finish in time")
                }
                Thread.sleep(POLL_MS)
            }
            val exitCode = execChannel.exitStatus
            return JSONObject()
                .put("exitCode", exitCode)
                .put("stdout", String(outBytes, Charsets.UTF_8))
                .put("stderr", String(errBytes, Charsets.UTF_8))
                .put("stdoutTruncated", outTruncated)
                .put("stderrTruncated", errTruncated)
        } finally {
            synchronized(lock) {
                // Remove only if we still own the seat (a cancel may already have removed
                // it — and a NEWER exec may legitimately hold a fresh seat afterwards).
                if (inFlight[key] === current) inFlight.remove(key)
            }
            // Local teardown only (red line): the remote process/service keeps running.
            closeLocal(LiveExec(channel, session))
        }
    }

    /** Bounded drain of one output stream: EOF/closed or the 16 KiB cap, never a hang. */
    private fun readBounded(stream: InputStream, deadline: Long, channel: ChannelExec): Pair<ByteArray, Boolean> {
        val buffer = ByteArrayOutputStream()
        val chunk = ByteArray(4096)
        var truncated = false
        while (buffer.size() < MAX_OUTPUT_BYTES) {
            if (SystemClock.elapsedRealtime() > deadline) {
                truncated = true
                break
            }
            val available = try {
                stream.available()
            } catch (e: Exception) {
                break
            }
            if (available > 0) {
                val want = minOf(chunk.size, available, MAX_OUTPUT_BYTES - buffer.size())
                val read = try {
                    stream.read(chunk, 0, want)
                } catch (e: Exception) {
                    truncated = true
                    break
                }
                if (read < 0) break // EOF
                buffer.write(chunk, 0, read)
            } else {
                if (channel.isClosed) break // closed: no more output will arrive
                try {
                    Thread.sleep(POLL_MS)
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                    truncated = true
                    break
                }
            }
        }
        if (buffer.size() >= MAX_OUTPUT_BYTES) truncated = true
        return Pair(buffer.toByteArray(), truncated)
    }

    // -------------------------------------------------------------------------
    // Credential material (mirror of SshTunnelManager's envelope resolution — kept
    // byte-compatible: {"v":1,"key":...,"passphrase":?} with the PEM gate, a bare
    // PEM/OpenSSH key text, or a password; N7: parsed per command, never persisted)
    // -------------------------------------------------------------------------
    private fun resolveKeyEnvelope(credential: String): Pair<ByteArray, ByteArray?> {
        return try {
            val obj = JSONObject(credential)
            if (obj.optInt("v") != 1) throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "key envelope version must be 1")
            val key = obj.optString("key")
            if (key.isEmpty()) throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "key envelope carries no key")
            if (!PEM_BEGIN.containsMatchIn(key.lineSequence().firstOrNull() ?: "")) {
                throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "key envelope key must be a PEM block")
            }
            val passphrase = if (obj.has("passphrase") && !obj.isNull("passphrase")) obj.optString("passphrase") else null
            Pair(key.toByteArray(Charsets.UTF_8), passphrase?.takeIf { it.isNotEmpty() }?.toByteArray(Charsets.UTF_8))
        } catch (e: ServiceOpsException) {
            throw e
        } catch (e: Exception) {
            throw ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "key envelope is not valid JSON")
        }
    }

    /** Password face for password/keyboard-interactive auth (mirror of the tunnel flow). */
    private fun passwordUserInfo(password: String): UserInfo = object : UserInfo, UIKeyboardInteractive {
        override fun getPassphrase(): String? = null
        override fun getPassword(): String = password
        override fun promptPassword(message: String?): Boolean = true
        override fun promptPassphrase(message: String?): Boolean = true
        override fun showMessage(message: String?) = Unit
        override fun promptYesNo(message: String?): Boolean = false
        override fun promptKeyboardInteractive(
            destination: String?,
            name: String?,
            instruction: String?,
            prompt: Array<out String>?,
            echo: BooleanArray?,
        ): Array<String>? = prompt?.map { password }?.toTypedArray()
    }

    // -------------------------------------------------------------------------
    // Failure classification for the session-establishment face (mirror of the tunnel
    // flow's best-effort mapping; on-device accuracy is BLOCKED pending G18 — decision
    // 0004 §8). Only selects the copy face; fail-closed behavior never depends on it.
    // -------------------------------------------------------------------------
    private fun classifySessionException(e: JSchException): ServiceOpsException {
        val message = e.message ?: ""
        return when {
            message.contains("Auth fail", ignoreCase = true) || message.contains("AUTHFAIL", ignoreCase = true) ->
                ServiceOpsException(ServiceOpsErrorCode.EXEC_FAILED, "authentication failed")
            message.contains("UnknownHostKey", ignoreCase = true) || message.contains("reject HostKey", ignoreCase = true) ->
                ServiceOpsException(ServiceOpsErrorCode.EXEC_DENIED, "host key refused by the store")
            message.contains("UnknownHostException", ignoreCase = true) ->
                ServiceOpsException(ServiceOpsErrorCode.EXEC_FAILED, "ssh host name could not be resolved")
            message.contains("timeout", ignoreCase = true) ->
                ServiceOpsException(ServiceOpsErrorCode.EXEC_TIMEOUT, "ssh connection timed out")
            else -> ServiceOpsException(ServiceOpsErrorCode.EXEC_FAILED, "exec failed")
        }
    }
}
