package ai.opencode.mobile.svcops

/**
 * The native whitelist gate for the fourth bridge (issue #7, decision 0004 §2.1).
 *
 * The bridge protocol carries {templateId, params, os} ONLY — never a command string.
 * This validator is the MIRROR of the JS-side template table
 * (packages/mobile-hosts/src/service-ops/commands.ts): the template id set, the
 * per-template parameter allowlist patterns (verbatim, locked by
 * scripts/verify-service-ops.ts) and each template's OS applicability domain. It returns
 * the assembled command string or null — the manager's setCommand call site (the ONLY
 * one in the app) executes nothing that did not come out of [validate]. Fail-closed:
 * an unknown template, a cross-domain assembly, an unexpected/missing parameter, any
 * shell metacharacter, a path-traversal segment or an out-of-range port is refused.
 *
 * Zero delete-class templates exist here (N8) and there is no removal face: the removal
 * story is copy-only text on the JS side and never an executable template.
 *
 * OS applicability (B2/N2): every non-detection template is closed to its family. The
 * OS-detection bootstrap pair (`probe.os.posix` / `probe.os.windows`) carries the "any"
 * domain — the first exec of a discovery cannot know the remote OS yet, and both are
 * fixed whitelisted strings whose OUTPUT decides the family (an unparseable output is
 * honest os-unknown, never a guess). The curl pipe installer exists ONLY for
 * linux/darwin (N2: upstream updater.ts:198-208 itself warns a bare bash on Windows may
 * be the WSL launcher — the template is withheld for windows entirely).
 */
object ServiceCommandValidator {

    /** Param allowlist patterns — verbatim mirror of SERVICE_PARAM_PATTERNS (JS side). */
    private val PATTERNS = mapOf(
        "versionAny" to Regex("^(?:latest|\\d+\\.\\d+\\.\\d+)$"),
        "versionPinned" to Regex("^\\d+\\.\\d+\\.\\d+$"),
        "port" to Regex("^\\d{1,5}$"),
        "method" to Regex("^(?:curl|npm|pnpm|bun|yarn|vp|brew|winget)$"),
        "binPathPosix" to Regex("^[A-Za-z0-9._/-]+$"),
        "binPathWindows" to Regex("^[A-Za-z0-9._\\\\:\\/-]+$"),
        "stamp" to Regex("^\\d{8}T\\d{6}Z$"),
    )

    private class Template(val os: String, val params: Map<String, Regex>)

    /** The whitelisted table — template id -> (OS domain, param name -> allowlist). */
    private val TEMPLATES: Map<String, Template> = buildMap {
        // discovery: OS detection bootstrap pair (domain "any")
        put("probe.os.posix", Template("any", emptyMap()))
        put("probe.os.windows", Template("any", emptyMap()))
        // discovery: binary / version / process / port
        put("probe.bin.linux", Template("linux", emptyMap()))
        put("probe.bin.darwin", Template("darwin", emptyMap()))
        put("probe.bin.windows", Template("windows", emptyMap()))
        put("probe.version.linux", Template("linux", emptyMap()))
        put("probe.version.darwin", Template("darwin", emptyMap()))
        put("probe.version.windows", Template("windows", emptyMap()))
        put("probe.process.linux", Template("linux", emptyMap()))
        put("probe.process.darwin", Template("darwin", emptyMap()))
        put("probe.process.windows", Template("windows", emptyMap()))
        put("probe.port.linux", Template("linux", emptyMap()))
        put("probe.port.darwin", Template("darwin", mapOf("port" to PATTERNS["port"]!!)))
        put("probe.port.windows", Template("windows", mapOf("port" to PATTERNS["port"]!!)))
        // install: package-manager-first
        put("install.npm.linux", Template("linux", mapOf("version" to PATTERNS["versionAny"]!!)))
        put("install.npm.darwin", Template("darwin", mapOf("version" to PATTERNS["versionAny"]!!)))
        put("install.npm.windows", Template("windows", mapOf("version" to PATTERNS["versionAny"]!!)))
        put("install.brew.linux", Template("linux", emptyMap()))
        put("install.brew.darwin", Template("darwin", emptyMap()))
        put("install.winget.windows", Template("windows", emptyMap()))
        // N2: curl pipe installer — POSIX closed domain only
        put("install-curl.linux", Template("linux", mapOf("version" to PATTERNS["versionPinned"]!!)))
        put("install-curl.darwin", Template("darwin", mapOf("version" to PATTERNS["versionPinned"]!!)))
        // start (B2 three-way split; N1 POSIX stdin discipline)
        put("start.linux", Template("linux", mapOf("port" to PATTERNS["port"]!!)))
        put("start.darwin", Template("darwin", mapOf("port" to PATTERNS["port"]!!)))
        put("start.windows", Template("windows", mapOf("port" to PATTERNS["port"]!!)))
        // upgrade
        put(
            "upgrade.linux",
            Template("linux", mapOf("method" to PATTERNS["method"]!!, "version" to PATTERNS["versionPinned"]!!)),
        )
        put(
            "upgrade.darwin",
            Template("darwin", mapOf("method" to PATTERNS["method"]!!, "version" to PATTERNS["versionPinned"]!!)),
        )
        put(
            "upgrade.windows",
            Template("windows", mapOf("method" to PATTERNS["method"]!!, "version" to PATTERNS["versionPinned"]!!)),
        )
        // replace-plan steps: backup / restore (cp/copy symmetric; no deletion anywhere)
        put(
            "backup.linux",
            Template("linux", mapOf("binPath" to PATTERNS["binPathPosix"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        put(
            "backup.darwin",
            Template("darwin", mapOf("binPath" to PATTERNS["binPathPosix"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        put(
            "backup.windows",
            Template("windows", mapOf("binPath" to PATTERNS["binPathWindows"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        put(
            "restore.linux",
            Template("linux", mapOf("binPath" to PATTERNS["binPathPosix"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        put(
            "restore.darwin",
            Template("darwin", mapOf("binPath" to PATTERNS["binPathPosix"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        put(
            "restore.windows",
            Template("windows", mapOf("binPath" to PATTERNS["binPathWindows"]!!, "stamp" to PATTERNS["stamp"]!!)),
        )
        // stop (independent authorized action; NEVER wired to any client disconnect)
        put("stop.linux", Template("linux", emptyMap()))
        put("stop.darwin", Template("darwin", emptyMap()))
        put("stop.windows", Template("windows", emptyMap()))
    }

    private val TEMPLATE_IDS = TEMPLATES.keys.toList()
    fun templateIds(): List<String> = TEMPLATE_IDS

    /** Shell metacharacters and cmd escapes — any occurrence refuses the assembly. */
    private val METACHAR = Regex("[;|&$`()<>\"'\\r\\n!^%]|[\\u0000-\\u001f\\u007f]")

    private const val PARAM_MAX_LENGTH = 200
    private val OS_DOMAINS = setOf("linux", "darwin", "windows", "any")

    /**
     * Validate and assemble. Returns the exact command string for the (single, gated)
     * setCommand call site, or null when anything is refused — the caller answers
     * EXEC_DENIED (fail-closed) and executes nothing.
     */
    fun validate(os: String, templateId: String, params: Map<String, String>): String? {
        if (os !in OS_DOMAINS) return null
        val template = TEMPLATES[templateId] ?: return null
        if (template.os != "any" && template.os != os) return null // closed domain (B2/N2)
        if (params.size != template.params.size) return null
        for ((name, value) in params) {
            val pattern = template.params[name] ?: return null // unexpected param
            if (value.isEmpty() || value.length > PARAM_MAX_LENGTH) return null
            if (METACHAR.containsMatchIn(value)) return null
            if (value.contains("..")) return null // path traversal segment
            if (!pattern.matches(value)) return null
            if (name == "port" && (value.toIntOrNull() ?: 0) !in 1..65535) return null
        }
        var command = TEMPLATE_COMMANDS[templateId] ?: return null
        for ((name, value) in params) {
            command = command.replace("<$name>", value)
        }
        return command
    }

    /**
     * The command bodies — verbatim mirror of the JS table's `command` fields (locked by
     * the golden vectors on the JS side and the structure check in the static probe).
     */
    private val TEMPLATE_COMMANDS: Map<String, String> = mapOf(
        "probe.os.posix" to "uname -s",
        "probe.os.windows" to "ver",
        "probe.bin.linux" to "command -v opencode",
        "probe.bin.darwin" to "command -v opencode",
        "probe.bin.windows" to "where opencode",
        "probe.version.linux" to "opencode --version",
        "probe.version.darwin" to "opencode --version",
        "probe.version.windows" to "opencode --version",
        "probe.process.linux" to "pgrep -x opencode",
        "probe.process.darwin" to "pgrep -x opencode",
        "probe.process.windows" to "tasklist /FI \"IMAGENAME eq opencode.exe\" /FO CSV /NH",
        "probe.port.linux" to "ss -tln",
        "probe.port.darwin" to "lsof -nP -iTCP:<port> -sTCP:LISTEN",
        "probe.port.windows" to "netstat -ano | findstr :<port>",
        "install.npm.linux" to "npm install -g @opencode/cli@<version>",
        "install.npm.darwin" to "npm install -g @opencode/cli@<version>",
        "install.npm.windows" to "npm install -g @opencode/cli@<version>",
        "install.brew.linux" to "brew install opencode",
        "install.brew.darwin" to "brew install opencode",
        "install.winget.windows" to
            "winget install --id Anomaly.OpenCode --exact --source winget --accept-source-agreements --disable-interactivity",
        "install-curl.linux" to "curl -fsSL https://opencode.ai/v2/install | bash -s -- --version <version>",
        "install-curl.darwin" to "curl -fsSL https://opencode.ai/v2/install | bash -s -- --version <version>",
        "start.linux" to "setsid nohup opencode serve --hostname 127.0.0.1 --port <port> </dev/null >/dev/null 2>&1 &",
        "start.darwin" to "nohup opencode serve --hostname 127.0.0.1 --port <port> </dev/null >/dev/null 2>&1 &",
        "start.windows" to "start /b opencode serve --hostname 127.0.0.1 --port <port>",
        "upgrade.linux" to "opencode upgrade --method <method> --target <version>",
        "upgrade.darwin" to "opencode upgrade --method <method> --target <version>",
        "upgrade.windows" to "opencode upgrade --method <method> --target <version>",
        "backup.linux" to "cp <binPath> <binPath>.bak-opencode-mobile-<stamp>",
        "backup.darwin" to "cp <binPath> <binPath>.bak-opencode-mobile-<stamp>",
        "backup.windows" to "copy /Y <binPath> <binPath>.bak-opencode-mobile-<stamp>",
        "restore.linux" to "cp <binPath>.bak-opencode-mobile-<stamp> <binPath>",
        "restore.darwin" to "cp <binPath>.bak-opencode-mobile-<stamp> <binPath>",
        "restore.windows" to "copy /Y <binPath>.bak-opencode-mobile-<stamp> <binPath>",
        "stop.linux" to "pkill -x opencode",
        "stop.darwin" to "pkill -x opencode",
        "stop.windows" to "taskkill /IM opencode.exe /F",
    )
}
