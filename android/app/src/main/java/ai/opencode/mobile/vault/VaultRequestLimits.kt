package ai.opencode.mobile.vault

/** Bounds the serialized bridge envelope separately from the UTF-8 secret value. */
internal object VaultRequestLimits {
    // JSON may expand every ASCII control byte to six characters (\\u00XX). Allow framing,
    // ids, metadata, and the 256-character label above that worst-case value expansion.
    const val MAX_REQUEST_CHARS = VaultStore.MAX_VALUE_BYTES * 6 + 8192
    private val leadingId = Regex("^\\s*\\{\\s*\"id\"\\s*:\\s*\"([A-Za-z0-9._-]{1,128})\"")

    fun isEnvelopeWithinBound(raw: String): Boolean = raw.length <= MAX_REQUEST_CHARS

    /** Requests created by JSON.stringify place id first, allowing correlation without parsing oversize input. */
    fun leadingRequestId(raw: String): String? = leadingId.find(raw.take(256))?.groupValues?.getOrNull(1)

    fun utf8Bytes(value: String): Int = value.toByteArray(Charsets.UTF_8).size
}
