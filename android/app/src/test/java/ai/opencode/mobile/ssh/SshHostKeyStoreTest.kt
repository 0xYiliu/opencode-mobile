package ai.opencode.mobile.ssh

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SshHostKeyStoreTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `record writes OpenSSH line and check recognizes the same key after readback`() {
        val store = SshHostKeyStore(temporaryFolder.newFolder("ssh"))

        store.record(HOST, 22, "ssh-ed25519", ED25519_BLOB)

        assertEquals("$HOST ssh-ed25519 $ED25519_BLOB\n", File(temporaryFolder.root, "ssh/known_hosts").readText())
        assertNull(store.check(HOST, 22, "ssh-ed25519", ED25519_BLOB))
        assertEquals(SshErrorCode.HOST_KEY_CHANGED, store.check(HOST, 22, "ssh-rsa", RSA_BLOB))
    }

    @Test
    fun `record preserves foreign lines verbatim and appends a parseable host entry`() {
        val directory = temporaryFolder.newFolder("foreign")
        val foreign = "@revoked $HOST ssh-ed25519 $ED25519_BLOB"
        File(directory, "known_hosts").writeText("$foreign\n")
        val store = SshHostKeyStore(directory)

        store.record(HOST, 22, "ssh-ed25519", ED25519_BLOB)

        assertEquals("$foreign\n$HOST ssh-ed25519 $ED25519_BLOB\n", File(directory, "known_hosts").readText())
        assertNull(store.check(HOST, 22, "ssh-ed25519", ED25519_BLOB))
    }

    private companion object {
        const val HOST = "fixture.invalid"
        const val ED25519_BLOB = "AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5"
        const val RSA_BLOB = "AAAAB3NzaC1yc2EAAAADAQABAAABAQCYQBVcJj6kD+WqpZ03AWQ+VnA+aEmLVdKv1oNfCFR0sOMK+bowA/OWRaIS3hWKujpbBuNQVvoYlbmAkCVJTf43qKzFG1hwTCp3bhDfGFCYAne2sneDez6kP1FTAarAk6ApD/6jsapij7Tib9/0BnyaFSQpL2bvKONwp77My/WBW5L2o2jVwQdsCVpEEps+VaoVPbbUUZptWktSB+uPDXxhz0475OVM/ri/V8GGGg4nQFwKQAj4c7/7lJSq+EN/bTal+KaIkZnbWhoQOccI+65FBOFpZe78wRQa0cyO1gUwzG3YhtTksCZL/r8B0TGu1zgi9vsDGzxvW5Rh0ML1hyTJ"
    }
}
