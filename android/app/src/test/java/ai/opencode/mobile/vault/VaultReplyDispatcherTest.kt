package ai.opencode.mobile.vault

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultReplyDispatcherTest {
    @Test fun postsOnUiDispatcherAndRechecksGenerationWhenReplyRuns() {
        val lifecycle = VaultGenerationGate()
        val queued = mutableListOf<Runnable>()
        var onUi = false
        val delivered = mutableListOf<String>()
        val dispatcher = VaultReplyDispatcher(lifecycle) { runnable -> queued += runnable }

        val generation = lifecycle.snapshot()
        dispatcher.post(generation, "fresh") { message ->
            assertTrue("reply must run on the UI dispatcher", onUi)
            delivered += message
        }
        assertTrue(delivered.isEmpty())
        onUi = true
        queued.removeAt(0).run()
        assertEquals(listOf("fresh"), delivered)

        onUi = false
        dispatcher.post(generation, "stale") { message ->
            assertTrue("stale reply must not be delivered", false)
            delivered += message
        }
        lifecycle.onNavigationStarted()
        onUi = true
        queued.removeAt(0).run()
        assertEquals(listOf("fresh"), delivered)
    }
}
