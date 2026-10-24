import { describe, expect, test } from "bun:test"
import {
  LIMITATION_KEYS,
  limitationKeysFor,
  inferInstallSource,
  mergeServiceEvidence,
  parseBinaryLookup,
  parseOsFamily,
  parsePortProbe,
  parseProcessProbe,
  parseVersionOutput,
  unsupportedOsName,
} from "../src/service-ops/discovery"

// Discovery model (issue #7, decision 0004 §2): pure parsers over documented output
// fixtures (honestly non-live), the merge rule (API evidence authoritative), the honest
// unknown/unsupported classifications and the N5 pgrep limitation. Synthetic text only.

describe("OS detection parsing (honest, never guessing)", () => {
  test("documented uname -s outputs map to linux/darwin", () => {
    expect(parseOsFamily("Linux", undefined)).toBe("linux")
    expect(parseOsFamily("Darwin", undefined)).toBe("darwin")
    expect(parseOsFamily("Linux\n", undefined)).toBe("linux") // trailing newline tolerated
  })

  test("documented ver output maps to windows; a POSIX box answers nothing for ver", () => {
    expect(parseOsFamily(undefined, "Microsoft Windows [Version 10.0.22631.4317]")).toBe("windows")
    expect(parseOsFamily("Linux", "Microsoft Windows [Version 10.0.22631.4317]")).toBe("linux") // uname wins when present
  })

  test("an unparseable shape (e.g. a non-cmd DefaultShell) is unknown — never a guess", () => {
    expect(parseOsFamily("'uname' is not recognized as an internal or external command", undefined)).toBe("unknown")
    expect(parseOsFamily(undefined, undefined)).toBe("unknown")
    expect(unsupportedOsName("CYGWIN_NT-10.0", undefined)).toBe("CYGWIN_NT-10.0")
    expect(unsupportedOsName(undefined, undefined)).toBeUndefined()
  })
})

describe("binary / version / process / port parsers (fixture-driven)", () => {
  test("binary lookup: found path, documented missing exit, no-evidence shape", () => {
    expect(parseBinaryLookup("/home/user/.opencode/bin/opencode", 0)).toEqual({
      found: true,
      path: "/home/user/.opencode/bin/opencode",
    })
    expect(parseBinaryLookup("C:\\Users\\user\\.opencode\\bin\\opencode.exe", 0)).toEqual({
      found: true,
      path: "C:\\Users\\user\\.opencode\\bin\\opencode.exe",
    })
    // Fixture: `command -v` exit 1 / `where` "INFO: Could not find files" exit 1 -> missing.
    expect(parseBinaryLookup(undefined, 1)).toEqual({ found: false, reason: "missing" })
    // Fixture: `where` multi-line would never carry spaces in our shape; a weird shape is no-evidence.
    expect(parseBinaryLookup("INFO: Could not find files", 0)).toEqual({ found: false, reason: "no-evidence" })
    expect(parseBinaryLookup(undefined, 127)).toEqual({ found: false, reason: "no-evidence" })
  })

  test("version output extracts a semver token and refuses to invent one from prose", () => {
    expect(parseVersionOutput("opencode 2.1.4")).toBe("2.1.4")
    expect(parseVersionOutput("v2.1.4")).toBe("2.1.4")
    expect(parseVersionOutput("2.1.4")).toBe("2.1.4")
    expect(parseVersionOutput("opencode x.y.z")).toBeUndefined()
    expect(parseVersionOutput(undefined)).toBeUndefined()
  })

  test("process probe answers boolean evidence and honestly undefined on odd shapes (N5-limited)", () => {
    expect(parseProcessProbe("posix", "12345\n67890", 0)).toBe(true)
    expect(parseProcessProbe("posix", "", 1)).toBe(false)
    expect(parseProcessProbe("posix", undefined, 2)).toBeUndefined()
    // Fixture: tasklist CSV when the image runs: "opencode.exe","1234","Services",...
    expect(parseProcessProbe("windows", '"opencode.exe","1234","Services","0"', 0)).toBe(true)
    expect(parseProcessProbe("windows", "INFO: No tasks are running which match the specified criteria.", 0)).toBe(false)
  })

  test("port probe recognizes the three documented output shapes", () => {
    // Fixture: `ss -tln` row shape: State Recv-Q Send-Q Local:Port Peer:Port Process
    const ss = "LISTEN 0 128 *:4096 *:*"
    expect(parsePortProbe("ss", ss, 4096)).toBe(4096)
    expect(parsePortProbe("ss", "LISTEN 0 128 *:22 *:*", 4096)).toBeUndefined()
    // Fixture: `lsof -nP -iTCP:4096 -sTCP:LISTEN` row.
    const lsof = "opencode 1234 user 12u IPv4 0xabc 0t0 TCP *:4096 (LISTEN)"
    expect(parsePortProbe("lsof", lsof, 4096)).toBe(4096)
    // Fixture: `netstat -ano | findstr :4096` row.
    const netstat = "TCP    0.0.0.0:4096    0.0.0.0:0    LISTENING    1234"
    expect(parsePortProbe("netstat", netstat, 4096)).toBe(4096)
    expect(parsePortProbe("netstat", "TCP    0.0.0.0:4096    0.0.0.0:0    ESTABLISHED    1234", 4096)).toBeUndefined()
    expect(parsePortProbe("ss", undefined, 4096)).toBeUndefined()
  })
})

describe("install-source inference (path prefixes, honest unknown)", () => {
  test("POSIX prefixes: curl install face, brew prefixes (darwin first), npm shapes", () => {
    expect(inferInstallSource("/home/user/.opencode/bin/opencode", "linux")).toBe("curl")
    expect(inferInstallSource("/home/user/.opencode/bin/opencode", "darwin")).toBe("curl")
    expect(inferInstallSource("/opt/homebrew/bin/opencode", "darwin")).toBe("brew")
    expect(inferInstallSource("/usr/local/bin/opencode", "linux")).toBe("brew")
    expect(inferInstallSource("/home/user/.nvm/versions/node/v22/bin/opencode", "linux")).toBe("npm")
    expect(inferInstallSource("/usr/lib/node_modules/@opencode/cli/bin/opencode", "linux")).toBe("npm")
    expect(inferInstallSource("/usr/bin/opencode", "linux")).toBe("unknown")
  })

  test("Windows prefixes: curl face under USERPROFILE, npm and winget shapes", () => {
    expect(inferInstallSource("C:\\Users\\user\\.opencode\\bin\\opencode.exe", "windows")).toBe("curl")
    expect(inferInstallSource("C:\\Program Files\\nodejs\\node_modules\\opencode\\opencode.exe", "windows")).toBe("npm")
    expect(inferInstallSource("C:\\Program Files\\WindowsApps\\Anomaly.OpenCode\\opencode.exe", "windows")).toBe("winget")
    expect(inferInstallSource("C:\\tools\\opencode.exe", "windows")).toBe("unknown")
    expect(inferInstallSource("/usr/bin/opencode", "unknown")).toBe("unknown")
  })
})

describe("merge rule: the API evidence is authoritative", () => {
  test("API reachable decides running; version from API; exec evidence adds 'both'", () => {
    expect(mergeServiceEvidence({ api: { reachable: true, version: "2.1.4" } }).status).toEqual({
      kind: "running",
      version: "2.1.4",
      evidence: "api",
    })
    expect(
      mergeServiceEvidence({ api: { reachable: true, version: "2.1.4" }, exec: { execVersion: "2.1.4" } }).status,
    ).toEqual({ kind: "running", version: "2.1.4", evidence: "both" })
  })

  test("a version conflict is recorded and the API value wins (never the classifier)", () => {
    const merged = mergeServiceEvidence({ api: { reachable: true, version: "2.1.4" }, exec: { execVersion: "1.0.0" } })
    expect(merged.status).toEqual({ kind: "running", version: "2.1.4", evidence: "api" })
    expect(merged.notes).toContain("version-conflict-api-wins")
  })

  test("the shared health-wrapper compatibility predicate routes running-incompatible", () => {
    expect(mergeServiceEvidence({ api: { reachable: true, version: "1.9.0" } }).status).toEqual({
      kind: "running-incompatible",
      version: "1.9.0",
    })
    expect(mergeServiceEvidence({ api: { reachable: true, version: "3.0.0" } }).status).toEqual({
      kind: "running-incompatible",
      version: "3.0.0",
    })
  })

  test("no API answer means NOT running — even when the process probe says alive (N5 lesson generalized)", () => {
    const merged = mergeServiceEvidence({ exec: { os: "linux", binaryPath: "/usr/bin/opencode", execVersion: "2.1.4", processAlive: true } })
    expect(merged.status.kind).toBe("installed-stopped")
    expect(merged.status).toEqual({
      kind: "installed-stopped",
      version: "2.1.4",
      installPath: "/usr/bin/opencode",
      source: "unknown",
    })
  })

  test("a listener without an API answer is installed-stopped plus a recorded note", () => {
    const merged = mergeServiceEvidence({ exec: { os: "linux", binaryPath: "/usr/bin/opencode", listenPort: 4096 } })
    expect(merged.status).toEqual({ kind: "installed-stopped", installPath: "/usr/bin/opencode", source: "unknown" })
    expect(merged.notes).toContain("listener-without-api")
  })

  test("binary-missing exec evidence maps to not-installed; nothing at all is unknown", () => {
    expect(mergeServiceEvidence({ exec: { os: "linux", binaryMissing: true } }).status).toEqual({ kind: "not-installed" })
    expect(mergeServiceEvidence({}).status).toEqual({ kind: "unknown" })
    expect(mergeServiceEvidence({ api: { reachable: false } }).status).toEqual({ kind: "unknown" })
  })

  test("an unknown OS short-circuits into the honest unsupported-os classification", () => {
    expect(mergeServiceEvidence({ exec: { os: "unknown" } }).status).toEqual({ kind: "unsupported-os", os: "unknown" })
  })

  test("API reachable without any version and without exec evidence stays unknown (no fabrication)", () => {
    expect(mergeServiceEvidence({ api: { reachable: true } }).status).toEqual({ kind: "unknown" })
    // But exec CAN supplement the version the API endpoint did not answer.
    expect(mergeServiceEvidence({ api: { reachable: true }, exec: { execVersion: "2.1.4" } }).status).toEqual({
      kind: "running",
      version: "2.1.4",
      evidence: "exec",
    })
  })
})

describe("limitations (N5 mandatory; direct and windows faces)", () => {
  test("pgrep miss is a mandatory limitation on every snapshot context", () => {
    for (const hostKind of ["ssh", "direct"] as const) {
      for (const os of ["linux", "darwin", "windows", "unknown"] as const) {
        expect(limitationKeysFor({ hostKind, os })).toContain(LIMITATION_KEYS.pgrep)
      }
    }
  })

  test("direct hosts carry the no-install-face limitation; windows carries shell+detach", () => {
    expect(limitationKeysFor({ hostKind: "direct", os: "unknown" })).toEqual([
      LIMITATION_KEYS.pgrep,
      LIMITATION_KEYS.direct,
    ])
    expect(limitationKeysFor({ hostKind: "ssh", os: "windows" })).toEqual([
      LIMITATION_KEYS.pgrep,
      LIMITATION_KEYS.windowsShell,
      LIMITATION_KEYS.windowsDetach,
    ])
    expect(limitationKeysFor({ hostKind: "ssh", os: "linux" })).toEqual([LIMITATION_KEYS.pgrep])
  })
})
