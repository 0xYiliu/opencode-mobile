import { describe, expect, test } from "bun:test"
import {
  COMMAND_TEMPLATES,
  GOLDEN_VECTORS,
  SERVICE_PARAM_PATTERNS,
  assembleServiceCommand,
  formatBackupStamp,
  previewServiceCommand,
  serviceCommandTemplate,
  templatesForAction,
} from "../src/service-ops/commands"
import { ServiceOpsError } from "../src/service-ops/errors"

// Command whitelist table (issue #7, decision 0004 §3): golden vectors (preview ==
// execution byte for byte), the N1 stdin discipline (the TWO POSIX start variants carry
// </dev/null — the Windows template has none, cmd semantics; review residual 1), the B2
// setsid support-matrix split, OS closed-domain negative assertions (cross-domain
// assembly refused on the TS face), the N2 curl POSIX closure, exhaustive template
// coverage and the parameter rejector. Synthetic values only; nothing executes.

describe("golden vectors (preview == execution, byte for byte)", () => {
  test("every vector assembles to its exact recorded command through BOTH faces", () => {
    for (const vector of GOLDEN_VECTORS) {
      const execution = assembleServiceCommand(vector.os, vector.templateId, vector.params)
      const preview = previewServiceCommand(vector.os, vector.templateId, vector.params)
      expect(execution.command).toBe(vector.command)
      expect(preview.command).toBe(vector.command)
      expect(preview).toEqual(execution) // the preview face IS the execution face
    }
  })

  test("N1 (review residual 1): the TWO POSIX start variants carry </dev/null; the Windows variant has none", () => {
    const linux = assembleServiceCommand("linux", "start.linux", { port: "4096" }).command
    const darwin = assembleServiceCommand("darwin", "start.darwin", { port: "4096" }).command
    const windows = assembleServiceCommand("windows", "start.windows", { port: "4096" }).command
    expect(linux).toContain("</dev/null")
    expect(darwin).toContain("</dev/null")
    // Full stdio discipline on POSIX: stdin from /dev/null, stdout and stderr to /dev/null.
    expect(linux).toMatch(/<\/dev\/null >\/dev\/null 2>&1 &$/)
    expect(darwin).toMatch(/<\/dev\/null >\/dev\/null 2>&1 &$/)
    // Windows: cmd semantics — no /dev/null anywhere on that variant (documented stdio
    // story: `start /b` returns immediately; decision 0004 + units/service-ops.md).
    expect(windows).not.toContain("/dev/null")
    expect(windows).not.toContain("< NUL")
  })

  test("B2: setsid is Linux-only; the macOS variant carries nohup only", () => {
    const linux = assembleServiceCommand("linux", "start.linux", { port: "4096" }).command
    const darwin = assembleServiceCommand("darwin", "start.darwin", { port: "4096" }).command
    expect(linux).toMatch(/^setsid nohup /)
    expect(darwin).toMatch(/^nohup /)
    expect(darwin).not.toContain("setsid")
  })

  test("all three start variants bind the loopback hostname and the port param verbatim", () => {
    for (const [os, id] of [
      ["linux", "start.linux"],
      ["darwin", "start.darwin"],
      ["windows", "start.windows"],
    ] as const) {
      const command = assembleServiceCommand(os, id, { port: "4123" }).command
      expect(command).toContain("opencode serve --hostname 127.0.0.1 --port 4123")
      expect(command).not.toContain("<port>")
    }
  })
})

describe("parameter validation (the injection surface is zero)", () => {
  test("metacharacters are refused before any allowlist is consulted", () => {
    const refusals = [
      "4096; rm -rf /",
      "4096 & whoami",
      "4096 | cat /etc/passwd",
      "$(reboot)",
      "`reboot`",
      "4096\nreboot",
      "4096\rreboot",
      '4096" /FO CSV',
      "'4096'",
      "4096 > file",
      "4096 < file",
      "40%PATH%",
      "40^96",
      "40!96",
      "\u0001",
    ]
    for (const port of refusals) {
      expect(() => assembleServiceCommand("linux", "start.linux", { port })).toThrow(ServiceOpsError)
      try {
        assembleServiceCommand("linux", "start.linux", { port })
      } catch (error) {
        expect((error as ServiceOpsError).code).toBe("exec-denied")
      }
    }
  })

  test("path traversal segments are refused on path-bearing params", () => {
    expect(() =>
      assembleServiceCommand("linux", "backup.linux", { binPath: "/home/user/../etc/opencode", stamp: "20261024T101500Z" }),
    ).toThrow(ServiceOpsError)
    expect(() =>
      assembleServiceCommand("windows", "backup.windows", { binPath: "C:\\Users\\..\\opencode.exe", stamp: "20261024T101500Z" }),
    ).toThrow(ServiceOpsError)
  })

  test("allowlist patterns refuse shapes outside their family", () => {
    // versionAny accepts latest/semver; versionPinned refuses latest.
    expect(() => assembleServiceCommand("linux", "install.npm.linux", { version: "latest" })).not.toThrow()
    expect(() => assembleServiceCommand("linux", "install-curl.linux", { version: "latest" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "install-curl.linux", { version: "2.1.4" })).not.toThrow()
    // method whitelist = the upstream upgrade methods only.
    expect(() => assembleServiceCommand("darwin", "upgrade.darwin", { method: "brew", version: "2.1.4" })).not.toThrow()
    expect(() => assembleServiceCommand("darwin", "upgrade.darwin", { method: "apt", version: "2.1.4" })).toThrow(ServiceOpsError)
    // port range is numeric, above the pattern.
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "0" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "65536" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "65535" })).not.toThrow()
    // non-string / empty / oversized values fail closed.
    expect(() => assembleServiceCommand("linux", "start.linux", { port: 4096 as unknown as string })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "4".repeat(201) })).toThrow(ServiceOpsError)
  })

  test("unexpected and missing params fail closed (no loose coercion)", () => {
    expect(() => assembleServiceCommand("linux", "start.linux", {})).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.linux", { port: "4096", extra: "x" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "stop.linux", {})).not.toThrow()
    expect(() => assembleServiceCommand("linux", "definitely-not-a-template", {})).toThrow(ServiceOpsError)
    try {
      assembleServiceCommand("linux", "definitely-not-a-template", {})
    } catch (error) {
      expect((error as ServiceOpsError).code).toBe("exec-denied")
    }
  })

  test("param pattern strings are the exact mirror source (Kotlin validator locks these)", () => {
    expect(SERVICE_PARAM_PATTERNS.port).toBe("^\\d{1,5}$")
    expect(SERVICE_PARAM_PATTERNS.method).toBe("^(?:curl|npm|pnpm|bun|yarn|vp|brew|winget)$")
    expect(SERVICE_PARAM_PATTERNS.versionAny).toBe("^(?:latest|\\d+\\.\\d+\\.\\d+)$")
    expect(SERVICE_PARAM_PATTERNS.versionPinned).toBe("^\\d+\\.\\d+\\.\\d+$")
    expect(SERVICE_PARAM_PATTERNS.stamp).toBe("^\\d{8}T\\d{6}Z$")
  })
})

describe("OS closed domain (B2/N2: cross-domain assembly refused on the TS face)", () => {
  test("a POSIX template refuses windows and vice versa", () => {
    expect(() => assembleServiceCommand("windows", "start.linux", { port: "4096" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("linux", "start.windows", { port: "4096" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("darwin", "probe.bin.windows", {})).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("windows", "probe.bin.linux", {})).toThrow(ServiceOpsError)
    try {
      assembleServiceCommand("windows", "start.linux", { port: "4096" })
    } catch (error) {
      expect((error as ServiceOpsError).code).toBe("exec-denied")
    }
  })

  test("N2: the curl pipe installer exists ONLY for linux/darwin — windows has no variant at all", () => {
    expect(templatesForAction("install-curl", "linux").map((t) => t.id)).toEqual(["install-curl.linux"])
    expect(templatesForAction("install-curl", "darwin").map((t) => t.id)).toEqual(["install-curl.darwin"])
    expect(templatesForAction("install-curl", "windows")).toEqual([])
    expect(serviceCommandTemplate("install-curl.windows")).toBeUndefined()
    // And even a direct cross-OS attempt at the existing variants refuses.
    expect(() => assembleServiceCommand("windows", "install-curl.linux", { version: "2.1.4" })).toThrow(ServiceOpsError)
    expect(() => assembleServiceCommand("windows", "install-curl.darwin", { version: "2.1.4" })).toThrow(ServiceOpsError)
  })

  test("the OS-detection bootstrap pair is the ONLY any-domain rows", () => {
    const anyDomain = COMMAND_TEMPLATES.filter((t) => t.os === "any").map((t) => t.id)
    expect(anyDomain.sort()).toEqual(["probe.os.posix", "probe.os.windows"].sort())
    expect(serviceCommandTemplate("probe.os.posix")!.command).toBe("uname -s")
    expect(serviceCommandTemplate("probe.os.windows")!.command).toBe("ver")
  })
})

describe("template table shape (exhaustive, zero delete-class, no uninstall execution)", () => {
  test("every action x OS is covered by a variant or explicitly absent (curl = POSIX only)", () => {
    const actions = ["probe", "install", "start", "upgrade", "backup", "restore", "stop"] as const
    const osFamilies = ["linux", "darwin", "windows"] as const
    for (const action of actions) {
      for (const os of osFamilies) {
        expect(templatesForAction(action, os).length).toBeGreaterThan(0)
      }
    }
    // install-curl is deliberately absent for windows (N2) and present for both POSIX.
    expect(templatesForAction("install-curl", "linux").length).toBe(1)
    expect(templatesForAction("install-curl", "darwin").length).toBe(1)
  })

  test("N8: zero delete-class templates and no uninstall action anywhere in the table", () => {
    for (const template of COMMAND_TEMPLATES) {
      expect(template.command).not.toMatch(/\brm\b|\bdel\b|\brmdir\b|\bRemove-Item\b|\brd \//)
      expect(template.action).not.toBe("uninstall")
    }
    // The uninstall story is copy-only (i18n); the probe asserts the client never
    // executes it — here we lock that no template even mentions uninstall.
    expect(COMMAND_TEMPLATES.some((t) => t.id.includes("uninstall"))).toBe(false)
  })

  test("every template id is globally unique and placeholder-declared", () => {
    expect(new Set(COMMAND_TEMPLATES.map((t) => t.id)).size).toBe(COMMAND_TEMPLATES.length)
    for (const template of COMMAND_TEMPLATES) {
      for (const spec of template.params) {
        expect(template.command.includes(`<${spec.name}>`)).toBe(true)
      }
    }
  })

  test("formatBackupStamp produces the stamp pattern the backup/restore templates expect", () => {
    const stamp = formatBackupStamp(new Date("2026-10-24T10:15:00Z"))
    expect(stamp).toBe("20261024T101500Z")
    expect(new RegExp(SERVICE_PARAM_PATTERNS.stamp).test(stamp)).toBe(true)
  })
})
