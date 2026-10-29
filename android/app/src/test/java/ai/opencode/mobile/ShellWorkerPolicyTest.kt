package ai.opencode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellWorkerPolicyTest {
    private val start = "http://127.0.0.1:18090/"
    private val scope = "http://127.0.0.1:18090/"
    private val script = "http://127.0.0.1:18090/sw.js"

    @Test
    fun acceptsOnlyThePackagedShellOriginRootScopeAndWorkerScript() {
        assertTrue(
            ShellWorkerPolicy.isTrustedWorkerRegistration(
                start, "http://127.0.0.1:18090/", scope, listOf(script, script),
            ),
        )
        assertTrue(ShellWorkerPolicy.isTrustedShellPage("http://127.0.0.1:18090/session/abc", start))
    }

    @Test
    fun rejectsUnrelatedOriginsRedirectsScopesAndWorkerScripts() {
        assertFalse(ShellWorkerPolicy.isTrustedShellPage("https://attacker.invalid/", start))
        assertFalse(ShellWorkerPolicy.isTrustedShellPage("http://127.0.0.2:18090/", start))
        assertFalse(
            ShellWorkerPolicy.isTrustedWorkerRegistration(
                start, "https://attacker.invalid/", scope, listOf(script),
            ),
        )
        assertFalse(
            ShellWorkerPolicy.isTrustedWorkerRegistration(
                start, "http://127.0.0.1:18090/", "http://127.0.0.1:18090/app/", listOf(script),
            ),
        )
        assertFalse(
            ShellWorkerPolicy.isTrustedWorkerRegistration(
                start, "http://127.0.0.1:18090/", scope, listOf("https://attacker.invalid/sw.js"),
            ),
        )
        // A registration with one trusted worker and one redirected/foreign worker is rejected.
        assertFalse(
            ShellWorkerPolicy.isTrustedWorkerRegistration(
                start, "http://127.0.0.1:18090/", scope, listOf(script, "http://127.0.0.1:18090/redirected.js"),
            ),
        )
    }

    @Test
    fun rejectsNonRootShellStartAndOriginConfusion() {
        assertFalse(ShellWorkerPolicy.isTrustedShellPage("http://127.0.0.1:18090/", "http://127.0.0.1:18090/app/"))
        assertFalse(ShellWorkerPolicy.isTrustedShellPage("http://user@127.0.0.1:18090/", start))
        assertFalse(ShellWorkerPolicy.isTrustedShellPage("http://127.0.0.1.evil.invalid:18090/", start))
    }
}
