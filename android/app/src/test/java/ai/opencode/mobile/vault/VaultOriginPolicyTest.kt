package ai.opencode.mobile.vault

import ai.opencode.mobile.BuildConfig
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultOriginPolicyTest {
    private val allowedPort get() = BuildConfig.WEB_ASSET_PORT

    @Test fun acceptsOnlyExactLoopbackHttpOrigin() {
        assertTrue(VaultOriginPolicy.isAllowed("http", "127.0.0.1", allowedPort, null))
    }

    @Test fun rejectsSchemeHostPortAndCredentialConfusion() {
        assertFalse(VaultOriginPolicy.isAllowed("https", "127.0.0.1", allowedPort, null))
        assertFalse(VaultOriginPolicy.isAllowed("http", "localhost", allowedPort, null))
        assertFalse(VaultOriginPolicy.isAllowed("http", "127.0.0.2", allowedPort, null))
        assertFalse(VaultOriginPolicy.isAllowed("http", "127.0.0.1", if (allowedPort == 18091) 18092 else 18091, null))
        assertFalse(VaultOriginPolicy.isAllowed("http", "127.0.0.1", allowedPort, "user"))
    }

    @Test fun rejectsSubframesAndUnavailableFeature() {
        assertFalse(VaultOriginPolicy.shouldAcceptMessage(false, "http", "127.0.0.1", allowedPort, null))
        assertTrue(VaultOriginPolicy.shouldAcceptMessage(true, "http", "127.0.0.1", allowedPort, null))
        assertFalse(VaultOriginPolicy.canRegister(false))
        assertTrue(VaultOriginPolicy.canRegister(true))
    }

    @Test fun navigationAndDestroyInvalidateQueuedGenerationAndReadiness() {
        val gate = VaultGenerationGate()
        val old = gate.snapshot()
        assertFalse(gate.isReady(old))
        assertTrue(gate.markReady(old))
        assertTrue(gate.isReady(old))

        val current = gate.onNavigationStarted()
        assertFalse(gate.isCurrent(old))
        assertFalse(gate.isReady(current))
        assertFalse(gate.markReady(old)) // queued readiness from the previous page is stale
        assertTrue(gate.markReady(current))
        assertTrue(gate.isReady(current))

        gate.destroy()
        assertFalse(gate.isCurrent(current))
        assertFalse(gate.markReady(current)) // destroyed Activity cannot re-arm readiness
    }
}
