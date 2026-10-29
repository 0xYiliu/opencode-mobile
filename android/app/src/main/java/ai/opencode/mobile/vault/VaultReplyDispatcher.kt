package ai.opencode.mobile.vault

/** Dispatches WebMessage replies to the UI thread and drops replies for stale documents. */
internal class VaultReplyDispatcher(
    private val lifecycle: VaultGenerationGate,
    private val dispatchToUi: (Runnable) -> Unit,
) {
    fun post(generation: Long, message: String, deliver: (String) -> Unit) {
        dispatchToUi(Runnable {
            if (lifecycle.isCurrent(generation)) deliver(message)
        })
    }
}
