package ai.opencode.mobile.vault

import java.io.File

/** Deletes an interrupted temp payload before its committed payload and before index rewrite. */
internal object VaultPayloadFiles {
    fun deleteBeforeIndex(
        payload: File,
        temp: File,
        delete: (File) -> Boolean = { it.delete() },
    ) {
        deleteIfPresent(temp, delete)
        deleteIfPresent(payload, delete)
    }

    private fun deleteIfPresent(file: File, delete: (File) -> Boolean) {
        if (file.exists() && !delete(file) && file.exists()) {
            throw VaultException("io", "credential payload deletion failed")
        }
    }
}
