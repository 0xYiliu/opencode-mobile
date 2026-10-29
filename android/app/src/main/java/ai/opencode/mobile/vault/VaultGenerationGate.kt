package ai.opencode.mobile.vault

/** Lifecycle gate shared by the listener callback and the serial worker. */
internal class VaultGenerationGate {
    private var generation = 0L
    private var readyGeneration = -1L
    private var destroyed = false

    @Synchronized fun snapshot(): Long = generation
    @Synchronized fun isDestroyed(): Boolean = destroyed
    @Synchronized fun isCurrent(token: Long): Boolean = !destroyed && token == generation
    @Synchronized fun isReady(token: Long): Boolean = isCurrent(token) && readyGeneration == token

    @Synchronized fun onNavigationStarted(): Long {
        readyGeneration = -1L
        generation += 1
        return generation
    }

    @Synchronized fun markReady(token: Long): Boolean {
        if (!isCurrent(token)) return false
        readyGeneration = token
        return true
    }

    @Synchronized fun destroy() {
        destroyed = true
        readyGeneration = -1L
        generation += 1
    }
}
