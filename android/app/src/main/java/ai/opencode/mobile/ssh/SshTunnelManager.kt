package ai.opencode.mobile.ssh

import android.util.Base64
import android.util.Log
import com.jcraft.jsch.ChannelDirectTCPIP
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import com.jcraft.jsch.UIKeyboardInteractive
import com.jcraft.jsch.UserInfo
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * The JSch tunnel engine (issue #6, decision 0003 §2/§6). Library: com.github.mwiede:jsch
 * (the maintained fork of JCraft JSch; Revised BSD) with org.bouncycastle:bcprov-jdk18on
 * (Bouncy Castle Licence) for curve25519/ed25519 on API 29-32 — both live ONLY behind this
 * bridge; the shared JS layer has zero SSH dependencies (platform boundary, AGENTS.md).
 *
 * Connect flow (decision 0003 §3.3 — credentials are issued to NO ONE before a fingerprint
 * is confirmed):
 *   1. KEY ACQUISITION (anonymous, F2): a one-shot capture session with
 *      StrictHostKeyChecking="yes" and no authentication material — the strict store makes
 *      it throw at KEX, and the PRESENTED key is read off the session afterwards. The
 *      presented fingerprint is compared against the authoritative store:
 *        store hit, same key    -> continue to (2);
 *        store hit, other key   -> HOST_KEY_CHANGED (hard refusal, never auto-overwrite);
 *        no record              -> pinned? match -> record (accept-on-first-use at the
 *                                  pinned open) : HOST_KEY_UNKNOWN (the JS driver re-drives
 *                                  after the user confirmed the fingerprint).
 *   2. AUTH + FORWARD: the real session runs StrictHostKeyChecking="yes" with a
 *      store-backed [HostKeyRepository] (defense in depth: the store stays the authority at
 *      KEX too — a mismatch throws BEFORE any authentication). Auth order:
 *      publickey, password, keyboard-interactive (same password as the challenge answer).
 *      The forward target is FIXED to the remote loopback `localhost:<servicePort>` (F7,
 *      single hop): a bounded direct-tcpip probe channel decides TARGET_REFUSED, then the
 *      local listener binds 127.0.0.1:0 (kernel-assigned) and the endpoint is
 *      `http://127.0.0.1:<assignedPort>`.
 *
 * Threading contract (F6):
 * - connect/scan run on the single work executor (never the main thread), all bounded:
 *   Session.connect(timeout) / probe connect(timeout) / listener bind.
 * - teardown (cancel/disconnect/destroy) runs on a DEDICATED single thread so a teardown
 *   never queues behind an in-flight connect; Session.disconnect() is cross-thread safe.
 * - the watchdog (own handler thread) only READS session connectivity and reports
 *   connectionLost; it never signals the remote (client-side loss detection only).
 *
 * Lifecycle red line (F8①): every teardown path — cancel, disconnect, delete, onDestroy —
 * tears down the SSH transport (SSH_MSG_DISCONNECT) and releases the LOCAL listener only.
 * The remote OpenCode service/process keeps running: a client disconnect NEVER stops a
 * remote task (AGENTS.md red line; double-written here and in docs/design/units/connection.md).
 *
 * Credential boundary: the credential (password or key envelope JSON) crosses into this
 * class exactly once per connect attempt, lives in local memory only, is never logged
 * (zero-value logging: fixed tags + op names + wire codes, no hosts, no values) and never
 * persisted. Key material goes to JSch addIdentity and nowhere else.
 */
class SshTunnelManager(context: android.content.Context) {
    companion object {
        private const val TAG = "OpencodeShell"
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val SCAN_TIMEOUT_MS = 15_000
        private const val FORWARD_PROBE_TIMEOUT_MS = 10_000
        private const val SERVER_ALIVE_INTERVAL_MS = 15_000
        private const val WATCHDOG_INTERVAL_MS = 30_000
        private const val MAX_CREDENTIAL_BYTES = 65_536 // the vault bound (decision 0003 §4)
        private const val MAX_PORT = 65_535
        private val FINGERPRINT = Regex("^SHA256:[A-Za-z0-9+/]{43}$")
        private val PEM_BEGIN = Regex("^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")
        private fun sessionKey(host: String, port: Int) = "$host:$port"
    }

    /** Client-side loss detection: the bridge routes this to the machine's T9 (offline). */
    var onConnectionLost: ((host: String, port: Int) -> Unit)? = null

    private val store = SshHostKeyStore(context)

    // Threading (F6): the BRIDGE owns the single work executor (connect/scan run there);
    // this manager owns only the dedicated teardown thread, so a teardown never queues
    // behind an in-flight connect, plus the watchdog handler thread (read-only checks).
    private val teardownThread: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "opencode-mobile-ssh-teardown").apply { isDaemon = true }
    }

    private class LiveSession(val session: Session, val host: String, val port: Int, val listenerPort: Int)

    /** Sessions with an established tunnel, keyed `host:port` (at most one per host). */
    private val live = HashMap<String, LiveSession>()
    /** Sessions still connecting (registered before connect so cancel can reach them). */
    private val pending = HashMap<String, Session>()
    private val lock = Any()

    private var destroyed = false

    /** Destroy (onDestroy): tear every session down locally and stop the threads. */
    fun destroy() {
        synchronized(lock) {
            destroyed = true
            val all = ArrayList<Session>()
            for (entry in live.values) all.add(entry.session)
            for (session in pending.values) all.add(session)
            live.clear()
            pending.clear()
            teardownThread.execute {
                for (session in all) {
                    try {
                        session.disconnect()
                    } catch (e: Exception) {
                        // A dead session must never break the destroy path.
                    }
                }
            }
        }
        teardownThread.shutdownNow()
    }

    // -------------------------------------------------------------------------
    // Key acquisition (F2: scan sessions are anonymous — see scanHostKey)
    // -------------------------------------------------------------------------

    /**
     * Scan the presented host key WITHOUT any authentication material (F2): a one-shot
     * session with StrictHostKeyChecking="yes" and an empty strict store — connect throws
     * at KEX (before any userauth could even be attempted), and the presented key is read
     * off the session afterwards. The body of this function deliberately contains no
     * password/identity wiring (scripts/verify-ssh.ts asserts it).
     */
    fun scanHostKey(host: String, port: Int): Pair<String, String> {
        val jsch = JSch()
        val session = jsch.getSession("", host, port)
        session.setConfig("StrictHostKeyChecking", "yes")
        session.setTimeout(SCAN_TIMEOUT_MS)
        try {
            session.connect(SCAN_TIMEOUT_MS) // throws at KEX: the key is unknown to the strict empty store
        } catch (e: Exception) {
            // Expected path: the presented key was captured before the refusal.
        }
        try {
            val hostKey = session.hostKey ?: throw classifySessionException(JSchException("connect failed"), "scan")
            val blob = hostKey.key ?: throw SshException(SshErrorCode.IO, "scan returned no key blob")
            val type = hostKey.type ?: SshHostKeyStore.keyTypeOf(blob) ?: throw SshException(SshErrorCode.IO, "scan returned an unknown key type")
            return Pair(type, blob)
        } finally {
            session.disconnect()
        }
    }

    /**
     * fetchHostKey for the JS verifier: scan + compare against the store. Returns the
     * decision JSON ({decision:trust|prompt, fingerprint}) or throws the wire-code failure
     * (host-key-changed / reachability codes).
     */
    fun fetchHostKeyDecision(host: String, port: Int): JSONObject {
        val (_, blob) = scanHostKey(host, port)
        val fingerprint = SshHostKeyStore.fingerprintOf(blob)
        return when (store.check(host, port, SshHostKeyStore.keyTypeOf(blob) ?: "", blob)) {
            null -> JSONObject().put("decision", "trust").put("fingerprint", fingerprint)
            SshErrorCode.HOST_KEY_CHANGED -> throw SshException(SshErrorCode.HOST_KEY_CHANGED, "presented key differs from the stored record")
            else -> JSONObject().put("decision", "prompt").put("fingerprint", fingerprint)
        }
    }

    // -------------------------------------------------------------------------
    // Connect: scan -> store decision -> auth session -> target probe -> listener
    // -------------------------------------------------------------------------

    /**
     * Open the tunnel. Runs on the work executor (the bridge enforces this). Returns the
     * loopback endpoint URL. Every failure throws [SshException] with a wire code.
     */
    fun connect(host: String, port: Int, servicePort: Int, credential: String?, pinnedFingerprint: String?): String {
        val key = sessionKey(host, port)
        synchronized(lock) {
            if (destroyed) throw SshException(SshErrorCode.BRIDGE_UNAVAILABLE, "manager destroyed")
            // Supersede any previous session for this host (a new connect is only legal
            // after the previous tunnel is gone — teardown is local, F8①).
            cancelLocked(key)
        }

        // 1. Key acquisition (anonymous) + store decision. Credentials come AFTER this.
        val (presentedType, presentedBlob) = scanHostKey(host, port)
        when (store.check(host, port, presentedType, presentedBlob)) {
            null -> {} // store hit, same key: the trust path
            SshErrorCode.HOST_KEY_CHANGED -> throw SshException(SshErrorCode.HOST_KEY_CHANGED, "presented key differs from the stored record")
            SshErrorCode.HOST_KEY_UNKNOWN -> {
                if (pinnedFingerprint == null) {
                    throw SshException(SshErrorCode.HOST_KEY_UNKNOWN, "host key not confirmed yet")
                }
                if (!FINGERPRINT.matches(pinnedFingerprint)) {
                    throw SshException(SshErrorCode.IO, "malformed pinned fingerprint")
                }
                val presented = SshHostKeyStore.fingerprintOf(presentedBlob)
                if (presented != pinnedFingerprint) {
                    // The pinned confirmation does not match what the host presented: hard
                    // refusal, never an overwrite (decision 0003 §3.3).
                    throw SshException(SshErrorCode.HOST_KEY_CHANGED, "presented key differs from the pinned fingerprint")
                }
                store.record(host, port, presentedType, presentedBlob) // accept-on-first-use at the pinned open
            }
            else -> throw SshException(SshErrorCode.IO, "unexpected host key decision")
        }

        // 2. Credential material (memory-only, one way in — see the class doc).
        var keyMaterial: Pair<ByteArray, ByteArray?>? = null
        var password: String? = null
        if (credential != null && credential.isNotEmpty()) {
            if (credential.toByteArray(Charsets.UTF_8).size > MAX_CREDENTIAL_BYTES) {
                throw SshException(SshErrorCode.IO, "credential exceeds the bound")
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

        // 3. The real session. StrictHostKeyChecking stays "yes"; the store-backed
        //    repository re-checks the presented key at KEX (mismatch throws BEFORE auth).
        val jsch = JSch()
        if (keyMaterial != null) {
            try {
                jsch.addIdentity("opencode-mobile-key", keyMaterial.first, null, keyMaterial.second)
            } catch (e: JSchException) {
                // A wrong/missing passphrase or an unparsable key surfaces here (the JS side
                // never pre-decrypts — decision 0003 §4 known limitation).
                throw SshException(SshErrorCode.KEY_DECRYPT_FAILED, "private key could not be loaded")
            }
        }
        val session = jsch.getSession(password ?: "", host, port)
        session.setConfig("StrictHostKeyChecking", "yes")
        session.hostKeyRepository = storeRepository(host, port)
        session.setConfig("PreferredAuthentications", "publickey,password,keyboard-interactive")
        session.setTimeout(CONNECT_TIMEOUT_MS)
        try {
            session.setServerAliveInterval(SERVER_ALIVE_INTERVAL_MS)
        } catch (e: JSchException) {
            throw SshException(SshErrorCode.IO, "session configuration failed")
        }
        if (password != null) {
            session.setUserInfo(passwordUserInfo(password))
        }

        synchronized(lock) {
            if (destroyed) throw SshException(SshErrorCode.BRIDGE_UNAVAILABLE, "manager destroyed")
            pending[sessionKey(host, port)] = session
        }

        try {
            try {
                session.connect(CONNECT_TIMEOUT_MS)
            } catch (e: JSchException) {
                throw classifySessionException(e, "connect")
            }
            if (destroyed) throw SshException(SshErrorCode.BRIDGE_UNAVAILABLE, "manager destroyed")

            // 4. Tunnel target layer: a bounded direct-tcpip probe to the FIXED remote
            //    loopback target (F7). An open failure here is the REMOTE refusing the
            //    target — "SSH auth succeeded, but the remote refused the forward".
            val probe = try {
                session.openChannel("direct-tcpip") as ChannelDirectTCPIP
            } catch (e: Exception) {
                throw SshException(SshErrorCode.TARGET_REFUSED, "the remote refused the forward target")
            }
            probe.setHost("localhost")
            probe.setPort(servicePort)
            try {
                probe.connect(FORWARD_PROBE_TIMEOUT_MS)
            } catch (e: Exception) {
                throw SshException(SshErrorCode.TARGET_REFUSED, "the remote refused the forward target")
            } finally {
                try {
                    probe.disconnect()
                } catch (e: Exception) {
                    // The probe channel is disposable; never mask the flow.
                }
            }

            // 5. The local listener: 127.0.0.1:0 (kernel-assigned; never a fixed port).
            val assigned = try {
                session.setPortForwardingL("127.0.0.1", 0, "localhost", servicePort)
            } catch (e: Exception) {
                throw SshException(SshErrorCode.FORWARD_FAILED, "local forwarding could not be established")
            }

            val entry = LiveSession(session, host, port, assigned)
            synchronized(lock) {
                if (destroyed) throw SshException(SshErrorCode.BRIDGE_UNAVAILABLE, "manager destroyed")
                pending.remove(key)
                live[key] = entry
            }
            scheduleWatchdog()
            return "http://127.0.0.1:$assigned"
        } catch (e: SshException) {
            synchronized(lock) { pending.remove(key) }
            // Local teardown of the failed attempt (F8①: the remote keeps running).
            teardownThread.execute { try { session.disconnect() } catch (ignored: Exception) {} }
            throw e
        }
    }

    /**
     * The store-backed repository: the authoritative KEX comparison (decision 0003 §3.3,
     * defense in depth). With StrictHostKeyChecking="yes" a CHANGED/NOTINCLUDED answer
     * makes Session.connect throw BEFORE any authentication is attempted — the red line
     * "host-key validation is never disabled" is enforced by the strict config plus this
     * fail-closed implementation. add() is a NO-OP on purpose: the ONLY recording path is
     * store.record from the pinned-open flow; there is no auto-add bypass.
     */
    private fun storeRepository(host: String, port: Int): HostKeyRepository = object : HostKeyRepository {
        override fun check(jhost: String?, presented: ByteArray?, session: Session?): Int {
            if (jhost == null || presented == null) return NOTINCLUDED
            val blob = Base64.encodeToString(presented, Base64.NO_WRAP)
            val type = SshHostKeyStore.keyTypeOf(blob) ?: return NOTINCLUDED
            return when (store.check(host, port, type, blob)) {
                null -> OK
                SshErrorCode.HOST_KEY_CHANGED -> CHANGED
                else -> NOTINCLUDED
            }
        }

        override fun add(hostkey: com.jcraft.jsch.HostKey?, ui: com.jcraft.jsch.UserInfo?) {
            // Deliberately empty: the app never auto-adds a host key (the pinned-open flow
            // is the single recording path; scripts/verify-ssh.ts locks the negative).
        }

        override fun remove(host: String?, keytype: String?): Unit = Unit
        override fun remove(host: String?, type: String?, blob: ByteArray?): Unit = Unit
        override fun getHostKey(): Array<com.jcraft.jsch.HostKey> = arrayOf()
        override fun getHostKey(host: String?, type: String?): Array<com.jcraft.jsch.HostKey> = arrayOf()
        override fun getStatus(): String = "opencode-mobile-host-key-store"
    }

    // -------------------------------------------------------------------------
    // Teardown (dedicated thread — never queued behind an in-flight connect, F6)
    // -------------------------------------------------------------------------

    /** Abort an in-flight connect. Local-only (F8①). Idempotent. */
    fun cancel(host: String, port: Int) {
        val key = sessionKey(host, port)
        val session: Session? = synchronized(lock) {
            pending.remove(key)
        }
        if (session != null) {
            teardownThread.execute { try { session.disconnect() } catch (ignored: Exception) {} }
        }
    }

    /** Tear down an established tunnel (or an in-flight attempt). Local-only (F8①). */
    fun disconnect(host: String, port: Int) {
        cancel(host, port)
        val key = sessionKey(host, port)
        val entry: LiveSession? = synchronized(lock) { live.remove(key) }
        if (entry != null) {
            teardownThread.execute {
                try {
                    try {
                        entry.session.delPortForwardingL("127.0.0.1", entry.listenerPort)
                    } catch (ignored: Exception) {
                        // session.disconnect() below releases the listener anyway.
                    }
                    entry.session.disconnect()
                } catch (ignored: Exception) {}
            }
        }
    }

    /** The explicit changed-key recovery removal (idempotent; a local file operation). */
    fun removeHostKey(host: String, port: Int) {
        store.remove(host, port)
    }

    private fun cancelLocked(key: String) {
        val pendingSession = pending.remove(key)
        val liveEntry = live.remove(key)
        if (pendingSession != null) {
            teardownThread.execute { try { pendingSession.disconnect() } catch (ignored: Exception) {} }
        }
        if (liveEntry != null) {
            teardownThread.execute {
                try {
                    try {
                        liveEntry.session.delPortForwardingL("127.0.0.1", liveEntry.listenerPort)
                    } catch (ignored: Exception) {}
                    liveEntry.session.disconnect()
                } catch (ignored: Exception) {}
            }
        }
    }

    // -------------------------------------------------------------------------
    // Watchdog: client-side loss detection only (reads isConnected; zero remote signals)
    // -------------------------------------------------------------------------

    private val watchdog = android.os.Handler(
        android.os.HandlerThread("opencode-mobile-ssh-watchdog").apply { start() }.looper,
    )

    private fun scheduleWatchdog() {
        watchdog.postDelayed({
            val lost = ArrayList<Pair<String, Int>>()
            synchronized(lock) {
                if (!destroyed) {
                    for (entry in live.values) {
                        try {
                            if (!entry.session.isConnected) lost.add(Pair(entry.host, entry.port))
                        } catch (ignored: Exception) {
                            lost.add(Pair(entry.host, entry.port))
                        }
                    }
                    for (key in lost) {
                        live.remove(sessionKey(key.first, key.second))?.let {
                            teardownThread.execute { try { it.session.disconnect() } catch (ignored: Exception) {} }
                        }
                    }
                    if (live.isNotEmpty()) scheduleWatchdog()
                }
            }
            for (key in lost) {
                Log.w(TAG, "ssh: connection lost (client side)")
                onConnectionLost?.invoke(key.first, key.second)
            }
        }, WATCHDOG_INTERVAL_MS)
    }

    // -------------------------------------------------------------------------
    // Credential material (decision 0003 §4: envelope v1 or bare key, else password)
    // -------------------------------------------------------------------------

    /**
     * Kotlin mirror of the JS parsePrivateKeyEnvelope: a credential value that starts with
     * `{` is the vault envelope {"v":1,"key":...,"passphrase":?} — the embedded key MUST
     * pass the PEM BEGIN gate; a bare PEM/OpenSSH key text goes through as-is. Anything
     * else is treated as a password (the driver only ever passes vault kind=password or
     * kind=privateKey values).
     */
    private fun resolveKeyEnvelope(credential: String): Pair<ByteArray, ByteArray?> {
        return try {
            val obj = JSONObject(credential)
            if (obj.optInt("v") != 1) throw SshException(SshErrorCode.IO, "key envelope version must be 1")
            val key = obj.optString("key")
            if (key.isEmpty()) throw SshException(SshErrorCode.IO, "key envelope carries no key")
            if (!PEM_BEGIN.containsMatchIn(key.lineSequence().firstOrNull() ?: "")) {
                throw SshException(SshErrorCode.IO, "key envelope key must be a PEM block")
            }
            val passphrase = if (obj.has("passphrase") && !obj.isNull("passphrase")) obj.optString("passphrase") else null
            Pair(key.toByteArray(Charsets.UTF_8), passphrase?.takeIf { it.isNotEmpty() }?.toByteArray(Charsets.UTF_8))
        } catch (e: SshException) {
            throw e
        } catch (e: Exception) {
            throw SshException(SshErrorCode.IO, "key envelope is not valid JSON")
        }
    }

    /** Password face for password/keyboard-interactive auth (no interactive UI in v1). */
    private fun passwordUserInfo(password: String): UserInfo = object : UserInfo, UIKeyboardInteractive {
        override fun getPassphrase(): String? = null
        override fun getPassword(): String = password
        override fun promptPassword(message: String?): Boolean = true
        override fun promptPassphrase(message: String?): Boolean = true
        override fun showMessage(message: String?) = Unit
        override fun promptYesNo(message: String?): Boolean = false
        override fun promptKeyboardInteractive(destination: String?, name: String?, instruction: String?, prompt: Array<out String>?, echo: BooleanArray?): Array<String>? =
            prompt?.map { password }?.toTypedArray()
    }

    // -------------------------------------------------------------------------
    // Failure classification (best-effort over JSch exception surfaces; the on-device
    // accuracy of every branch is BLOCKED pending G17/SSH E2E — decision 0003 §9)
    // -------------------------------------------------------------------------

    private fun classifySessionException(e: JSchException, face: String): SshException {
        val message = e.message ?: ""
        return when {
            message.contains("Auth fail", ignoreCase = true) || message.contains("AUTHFAIL", ignoreCase = true) ->
                SshException(SshErrorCode.AUTH_FAILED, "authentication failed")
            message.contains("UnknownHostKey", ignoreCase = true) || message.contains("reject HostKey", ignoreCase = true) ->
                // Defense in depth: the store pre-check should have caught this.
                SshException(SshErrorCode.HOST_KEY_CHANGED, "host key refused by the store")
            message.contains("UnknownHostException", ignoreCase = true) ->
                SshException(SshErrorCode.DNS, "ssh host name could not be resolved")
            message.contains("ConnectException", ignoreCase = true) && message.contains("refused", ignoreCase = true) ->
                SshException(SshErrorCode.REFUSED, "ssh connection refused")
            message.contains("timeout", ignoreCase = true) ->
                SshException(SshErrorCode.TIMEOUT, "ssh connection timed out")
            message.contains("NoRouteToHostException", ignoreCase = true) ||
                message.contains("Network is unreachable", ignoreCase = true) ||
                message.contains("SocketException", ignoreCase = true) ->
                SshException(SshErrorCode.UNREACHABLE, "ssh host unreachable")
            message.contains("invalid privatekey", ignoreCase = true) ->
                SshException(SshErrorCode.KEY_DECRYPT_FAILED, "private key could not be loaded")
            else -> SshException(SshErrorCode.IO, "$face failed")
        }
    }
}
