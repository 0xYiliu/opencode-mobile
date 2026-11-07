package ai.opencode.mobile.ssh

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JVM tests for the app-owned forward listener (issue #161). Real loopback sockets
 * through the real accept loop; the injected [SshLocalForwarder.ChannelBridge] stands in
 * for the JSch direct-tcpip channel (the manager's adapter is a thin, device-verified
 * mapping onto the already-probed channel API).
 */
class SshLocalForwarderTest {
    /** Echo bridge: a daemon pump copies the connection's input back to its output. */
    private class EchoBridge : SshLocalForwarder.ChannelBridge {
        val active = AtomicInteger(0)

        override fun open(input: InputStream, output: OutputStream, remoteHost: String, remotePort: Int, channelConnectTimeoutMs: Int): AutoCloseable {
            active.incrementAndGet()
            val pump = Thread({ pump(input, output) }, "test-echo-pump")
            pump.isDaemon = true
            pump.start()
            return AutoCloseable {
                active.decrementAndGet()
                try { input.close() } catch (ignored: Exception) {}
                try { output.close() } catch (ignored: Exception) {}
            }
        }
    }

    /** Fails the FIRST connection, then echoes — the loop must survive the failure. */
    private class FlakyBridge : SshLocalForwarder.ChannelBridge {
        val attempts = AtomicInteger(0)
        val failures = AtomicInteger(0)

        override fun open(input: InputStream, output: OutputStream, remoteHost: String, remotePort: Int, channelConnectTimeoutMs: Int): AutoCloseable {
            if (attempts.incrementAndGet() == 1) {
                failures.incrementAndGet()
                throw IOException("synthetic bridge failure")
            }
            val pump = Thread({ pump(input, output) }, "test-flaky-echo-pump")
            pump.isDaemon = true
            pump.start()
            return AutoCloseable {
                try { input.close() } catch (ignored: Exception) {}
                try { output.close() } catch (ignored: Exception) {}
            }
        }
    }

    private fun connectClient(port: Int): Socket {
        val client = Socket()
        client.setSoTimeout(SOCKET_TIMEOUT_MS)
        client.connect(InetSocketAddress(InetAddress.getLoopbackAddress(), port), SOCKET_TIMEOUT_MS)
        return client
    }

    /** Round-trip one payload and return the echoed bytes (bounded by the socket timeout). */
    private fun roundTrip(client: Socket, payload: String): String {
        client.getOutputStream().write(payload.toByteArray())
        client.getOutputStream().flush()
        val expected = payload.toByteArray()
        val buffer = ByteArray(expected.size)
        var off = 0
        while (off < buffer.size) {
            val read = client.getInputStream().read(buffer, off, buffer.size - off)
            assertTrue("stream ended after $off of ${buffer.size} bytes", read > 0)
            off += read
        }
        return String(buffer)
    }

    /** Assertion-only SO_REUSEADDR rebind after a forwarder released its port. */
    private fun assertRebindable(boundPort: Int) {
        val probe = ServerSocket()
        probe.reuseAddress = true
        probe.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), boundPort))
        try {
            assertTrue(!probe.isClosed)
        } finally {
            probe.close()
        }
    }

    @Test
    fun `accepted connections echo through the accept loop`() {
        val bridge = EchoBridge()
        val forwarder = SshLocalForwarder("localhost", 4096, FORWARD_TIMEOUT_MS, bridge)
        try {
            val client = connectClient(forwarder.port)
            try {
                assertEquals(PAYLOAD, roundTrip(client, PAYLOAD))
            } finally {
                client.close()
            }
            assertEquals(1, bridge.active.get())
        } finally {
            forwarder.close()
        }
        assertEquals(0, bridge.active.get())
        assertTrue(forwarder.awaitAcceptExit(THREAD_EXIT_MS))
    }

    @Test
    fun `close unblocks the accept loop, releases the port and is idempotent`() {
        val forwarder = SshLocalForwarder("localhost", 4096, FORWARD_TIMEOUT_MS, EchoBridge())
        val bound = forwarder.port

        forwarder.close()
        forwarder.close() // idempotent: the second close is a swallowed no-op

        assertTrue(forwarder.awaitAcceptExit(THREAD_EXIT_MS))
        assertRebindable(bound)
    }

    @Test
    fun `watchdog-style eviction closes the live bridge and releases the listener`() {
        val bridge = EchoBridge()
        val forwarder = SshLocalForwarder("localhost", 4096, FORWARD_TIMEOUT_MS, bridge)
        val client = connectClient(forwarder.port)
        try {
            assertEquals(PAYLOAD, roundTrip(client, PAYLOAD)) // one fully live connection
            val bound = forwarder.port

            forwarder.close() // the eviction/teardown path (same call the manager makes)
            assertTrue(forwarder.awaitAcceptExit(THREAD_EXIT_MS))
            assertEquals(0, bridge.active.get()) // the live handle was closed best-effort
            // The evicted connection is force-closed: the client observes the EOF.
            assertEquals(-1, client.getInputStream().read())
            assertRebindable(bound)
        } finally {
            client.close()
            forwarder.close()
        }
    }

    @Test
    fun `a failing connection is isolated and the loop keeps serving`() {
        val bridge = FlakyBridge()
        val forwarder = SshLocalForwarder("localhost", 4096, FORWARD_TIMEOUT_MS, bridge)
        try {
            // First connection: the bridge fails it, the forwarder closes only that socket.
            val rejected = connectClient(forwarder.port)
            try {
                rejected.getOutputStream().write(PAYLOAD.toByteArray())
                rejected.getOutputStream().flush()
                assertEquals(-1, rejected.getInputStream().read())
            } finally {
                rejected.close()
            }
            assertEquals(1, bridge.failures.get())

            // The SAME listener still serves the next connection.
            val client = connectClient(forwarder.port)
            try {
                assertEquals(PAYLOAD, roundTrip(client, PAYLOAD))
            } finally {
                client.close()
            }
        } finally {
            forwarder.close()
        }
        assertTrue(forwarder.awaitAcceptExit(THREAD_EXIT_MS))
    }

    private companion object {
        const val PAYLOAD = "opencode-mobile-forward-ping"
        const val FORWARD_TIMEOUT_MS = 10_000
        const val SOCKET_TIMEOUT_MS = 5_000
        const val THREAD_EXIT_MS = 5_000L
    }
}

/** Copy input to output until EOF or error, then release both sides (closes the socket). */
private fun pump(input: InputStream, output: OutputStream) {
    try {
        val buffer = ByteArray(4096)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            output.flush()
        }
    } catch (ignored: IOException) {
    } finally {
        try { input.close() } catch (ignored: Exception) {}
        try { output.close() } catch (ignored: Exception) {}
    }
}
