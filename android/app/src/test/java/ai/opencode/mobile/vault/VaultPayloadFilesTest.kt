package ai.opencode.mobile.vault

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultPayloadFilesTest {
    @Test fun tempDeletionFailureKeepsCommittedPayloadForIndexRow() {
        val dir = Files.createTempDirectory("vault-payload-delete-").toFile()
        val payload = File(dir, "synthetic.bin").apply { writeText("ciphertext") }
        val temp = File(dir, "synthetic.bin.tmp").apply { writeText("partial ciphertext") }
        val attempted = mutableListOf<String>()
        try {
            val error = try {
                VaultPayloadFiles.deleteBeforeIndex(payload, temp) { file ->
                    attempted += file.name
                    false
                }
                error("expected deletion failure")
            } catch (e: VaultException) {
                e
            }

            assertEquals("io", error.code)
            assertEquals(listOf(temp.name), attempted)
            assertTrue("committed payload must not be deleted when temp deletion fails", payload.exists())
            assertTrue(temp.exists())
        } finally {
            temp.delete()
            payload.delete()
            dir.delete()
        }
    }

    @Test fun payloadDeletionFailureOccursAfterTempAndKeepsPayloadForIndexRow() {
        val dir = Files.createTempDirectory("vault-payload-delete-").toFile()
        val payload = File(dir, "synthetic.bin").apply { writeText("ciphertext") }
        val temp = File(dir, "synthetic.bin.tmp").apply { writeText("partial ciphertext") }
        val attempted = mutableListOf<String>()
        try {
            val error = try {
                VaultPayloadFiles.deleteBeforeIndex(payload, temp) { file ->
                    attempted += file.name
                    if (file == temp) file.delete() else false
                }
                error("expected deletion failure")
            } catch (e: VaultException) {
                e
            }

            assertEquals("io", error.code)
            assertEquals(listOf(temp.name, payload.name), attempted)
            assertFalse(temp.exists())
            assertTrue("payload remains while its index row is still present", payload.exists())
        } finally {
            temp.delete()
            payload.delete()
            dir.delete()
        }
    }

    @Test fun successfulDeletionRemovesTempBeforePayload() {
        val dir = Files.createTempDirectory("vault-payload-delete-").toFile()
        val payload = File(dir, "synthetic.bin").apply { writeText("ciphertext") }
        val temp = File(dir, "synthetic.bin.tmp").apply { writeText("partial ciphertext") }
        val attempted = mutableListOf<String>()
        try {
            VaultPayloadFiles.deleteBeforeIndex(payload, temp) { file ->
                attempted += file.name
                file.delete()
            }
            assertEquals(listOf(temp.name, payload.name), attempted)
            assertFalse(temp.exists())
            assertFalse(payload.exists())
        } finally {
            temp.delete()
            payload.delete()
            dir.delete()
        }
    }
}
