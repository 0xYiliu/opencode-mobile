package ai.opencode.mobile.vault

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Error taxonomy mirrored from the first-party vault port (packages/mobile-hosts
 * src/vault/types.ts). `code` crosses the bridge verbatim in error responses; messages are
 * diagnostic only and never contain credential values (zero-value logging red line).
 */
class VaultException(val code: String, message: String) : Exception(message)

/**
 * Keystore-backed envelope crypto (issue #4, decision D2) — the Kotlin mirror of
 * packages/mobile-hosts src/vault/envelope.ts.
 *
 * Layout: "OPMV1" magic (5 bytes; the magic doubles as the version) || 12-byte IV ||
 * AES-256-GCM ciphertext with the 128-bit tag appended by the platform cipher.
 * AAD = the entry id (UTF-8), which makes re-binding an envelope to another id fail GCM
 * authentication (locked by the first-party tests on the TS side and by construction here).
 *
 * Red lines:
 * - The key never leaves AndroidKeyStore and carries NO user-authentication binding
 *   (setUserAuthenticationRequired is deliberately NOT set): no extra unlock gate, by
 *   decision D6 (locked-device is exempt because the app itself is unusable when locked).
 * - Failures surface as VaultException(corrupt|unsupported|io); nothing is ever decrypted
 *   "best effort" and no plaintext fallback exists.
 */
object VaultCrypto {
    private const val TAG = "OpencodeShell"
    const val KEY_ALIAS = "opencode-mobile-vault.v1"
    private const val ANDROID_KEY_STORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val KEY_BITS = 256
    private const val TAG_BITS = 128
    private const val IV_BYTES = 12
    private val MAGIC = "OPMV1".toByteArray(Charsets.US_ASCII)

    fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_BITS)
                // Deliberately NO setUserAuthenticationRequired: no extra unlock (issue #4).
                .build(),
        )
        return generator.generateKey()
    }

    /** Seal plaintext under the entry id -> magic || IV || ciphertext+tag. */
    fun seal(id: String, plaintext: ByteArray): ByteArray {
        if (plaintext.isEmpty()) throw VaultException("io", "refusing to seal an empty credential value")
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, ByteArray(IV_BYTES).also { java.security.SecureRandom().nextBytes(it) }))
        cipher.updateAAD(id.toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(plaintext)
        val envelope = ByteArray(MAGIC.size + IV_BYTES + encrypted.size)
        System.arraycopy(MAGIC, 0, envelope, 0, MAGIC.size)
        System.arraycopy(cipher.iv, 0, envelope, MAGIC.size, IV_BYTES)
        System.arraycopy(encrypted, 0, envelope, MAGIC.size + IV_BYTES, encrypted.size)
        return envelope
    }

    /** Open an envelope for the entry id; corrupt/unsupported shapes throw, never fabricate. */
    fun open(id: String, envelope: ByteArray): ByteArray {
        val header = MAGIC.size + IV_BYTES + TAG_BITS / 8
        if (envelope.size < header) throw VaultException("corrupt", "envelope shorter than the v1 header")
        if (!MAGIC.copyOfRange(0, MAGIC.size).contentEquals(envelope.copyOfRange(0, MAGIC.size))) {
            throw VaultException("unsupported", "envelope magic is not OPMV1")
        }
        val iv = envelope.copyOfRange(MAGIC.size, MAGIC.size + IV_BYTES)
        val encrypted = envelope.copyOfRange(MAGIC.size + IV_BYTES, envelope.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(id.toByteArray(Charsets.UTF_8))
        return try {
            cipher.doFinal(encrypted)
        } catch (e: javax.crypto.AEADBadTagException) {
            // Wrong key state (e.g. TEE reset), tampering, or an AAD mismatch (re-bind).
            Log.w(TAG, "vault: envelope failed GCM authentication")
            throw VaultException("corrupt", "envelope failed GCM authentication")
        }
    }
}
