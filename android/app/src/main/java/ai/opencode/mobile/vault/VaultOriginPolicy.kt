package ai.opencode.mobile.vault

import ai.opencode.mobile.BuildConfig
import ai.opencode.mobile.WebAssetServer

/** Exact origin check is repeated for each callback; this is not a same-origin script sandbox. */
internal object VaultOriginPolicy {
    fun canRegister(featureSupported: Boolean): Boolean = featureSupported

    fun shouldAcceptMessage(isMainFrame: Boolean, scheme: String?, host: String?, port: Int, userInfo: String?): Boolean =
        isMainFrame && isAllowed(scheme, host, port, userInfo)

    fun isAllowed(scheme: String?, host: String?, port: Int, userInfo: String?): Boolean =
        scheme == "http" && host == WebAssetServer.LOOPBACK_HOST && port == BuildConfig.WEB_ASSET_PORT && userInfo == null
}
