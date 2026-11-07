package ai.opencode.mobile.ssh

import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/**
 * App-owned local port-forward listener (issue #161): the SSH tunnel's accept side moves
 * from JSch's internal PortWatcher machinery (setPortForwardingL) into this class. The
 * JSch session stays responsible for the SSH layer and each connection's direct-tcpip
 * channel — the manager wires [ChannelBridge] to it (see SshTunnelManager).
 *
 * Why it exists (issue #161): on the affected Android 12 device, JSch's internal listener
 * machinery bound the port but never serviced accepted connections — HTTP requests hung
 * while the same jsch on a host JVM worked. The fix owns ONLY the accept loop, keeping
 * PortWatcher's socket semantics on purpose: a PLAIN loopback bind (no explicit
 * SO_REUSEADDR) and no soTimeout on the listener or on accepted sockets (PortWatcher
 * parity — connection lifetimes are driven by the channel, not by a timer).
 *
 * Contract:
 * - One daemon accept-loop thread per forwarder; [bridge] is invoked on that thread once
 *   per accepted connection with the socket's input/output streams (each stream's close
 *   also closes the socket, so a channel-side EOF tears the whole connection down, like
 *   PortWatcher's pump teardown did). It returns a close handle for the wired connection;
 *   the forwarder tracks live handles and closes them best-effort on [close].
 * - A [bridge] failure is per-connection: the accepted socket is closed and the loop
 *   continues serving later connections. The loop exits only when the listener closes.
 * - [close] is idempotent and exception-swallowing (safe from any teardown thread, any
 *   number of times, while traffic races): it closes the ServerSocket — which unblocks a
 *   blocked accept() — and then every tracked connection handle and socket.
 */
class SshLocalForwarder(
    private val remoteHost: String,
    private val remotePort: Int,
    private val channelConnectTimeoutMs: Int,
    private val bridge: ChannelBridge,
) {
    /** Wires ONE accepted connection; called on the accept thread. */
    fun interface ChannelBridge {
        fun open(input: InputStream, output: OutputStream, remoteHost: String, remotePort: Int, channelConnectTimeoutMs: Int): AutoCloseable
    }

    // PortWatcher parity: plain ServerSocket bind, no SO_REUSEADDR, backlog 0 (system
    // default). Port 0 = kernel-assigned; the bound port is the endpoint the JS layer gets.
    private val listener = ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))

    /** The kernel-assigned loopback port; the tunnel endpoint is `http://127.0.0.1:<port>`. */
    val port: Int = listener.localPort

    private val closed = AtomicBoolean(false)

    private class Connection(val socket: Socket, val handle: AutoCloseable)

    /** Live connections; entries whose socket already closed are pruned on accept. */
    private val connections = ArrayList<Connection>()

    private val acceptThread = Thread({ acceptLoop() }, "opencode-mobile-ssh-forward-:$port").apply {
        isDaemon = true
        start()
    }

    private fun acceptLoop() {
        while (true) {
            val socket = try {
                listener.accept()
            } catch (ignored: Exception) {
                // Listener closed (close()): the blocked accept unblocks and the loop ends.
                return
            }
            if (closed.get()) {
                try { socket.close() } catch (ignored: IOException) {}
                return
            }
            pruneClosed()
            val handle = try {
                bridge.open(
                    SocketClosingInputStream(socket),
                    SocketClosingOutputStream(socket),
                    remoteHost,
                    remotePort,
                    channelConnectTimeoutMs,
                )
            } catch (ignored: Exception) {
                // Per-connection failure: this socket dies, the loop continues.
                try { socket.close() } catch (ignored: IOException) {}
                continue
            }
            synchronized(connections) { connections.add(Connection(socket, handle)) }
        }
    }

    /** Drop bookkeeping for connections that already ended (their socket is closed). */
    private fun pruneClosed() {
        synchronized(connections) {
            connections.removeAll { it.socket.isClosed }
        }
    }

    /** Idempotent, exception-swallowing teardown of the listener and all live connections. */
    fun close() {
        if (!closed.compareAndSet(false, true)) return
        try {
            listener.close() // unblocks accept(); accept() throws and the loop exits
        } catch (ignored: IOException) {
        }
        val toClose = synchronized(connections) {
            val all = connections.toList()
            connections.clear()
            all
        }
        for (connection in toClose) {
            try { connection.handle.close() } catch (ignored: Exception) {}
            try { connection.socket.close() } catch (ignored: IOException) {}
        }
    }

    /** Bounded wait for the accept thread to exit (test/teardown seam; never sleep-based). */
    fun awaitAcceptExit(timeoutMs: Long): Boolean {
        acceptThread.join(timeoutMs)
        return !acceptThread.isAlive
    }

    /** Each stream handed to the bridge closes the accepted socket when it is closed. */
    private class SocketClosingInputStream(private val socket: Socket) : FilterInputStream(socket.getInputStream()) {
        override fun close() {
            try {
                super.close()
            } finally {
                try { socket.close() } catch (ignored: IOException) {}
            }
        }
    }

    private class SocketClosingOutputStream(private val socket: Socket) : FilterOutputStream(socket.getOutputStream()) {
        override fun close() {
            try {
                super.close()
            } finally {
                try { socket.close() } catch (ignored: IOException) {}
            }
        }
    }
}
