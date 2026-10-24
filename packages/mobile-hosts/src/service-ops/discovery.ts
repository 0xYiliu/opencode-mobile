// Service discovery model (issue #7, decision 0004 §2) — the ServiceStatus model, the
// pure output parsers for the probe templates (./commands) and the evidence merge rules.
//
// Two discovery layers:
// - Layer 1 API probe (SSH and direct hosts alike, zero new code paths): the existing
//   connection flow (tunnel -> bounded GET /api/info) already yields running+version.
//   For DIRECT hosts this is ALL discovery there is — the install face (binary path,
//   source, process) is behind SSH exec and a direct connection cannot see it. That is a
//   protocol limitation the panel states verbatim (svcops.limitation.direct), never hides.
// - Layer 2 exec probe (SSH hosts only, the fourth bridge): the whitelisted probe
//   templates of ./commands run through short-lived exec sessions and their outputs are
//   parsed by the PURE functions below against fixed fixtures (documented output shapes,
//   honestly marked non-live).
//
// Merge rule (real-fetch principle, the probe classifier lesson): the API evidence is
// AUTHORITATIVE for the version and the running verdict; exec evidence supplements the
// install face (path/source/process/port). On conflict the API wins and the conflict is
// recorded (mergeNotes) — a classifier never overrides a real fetch.
//
// Honesty rules baked in here:
// - unknown is a status: an unprobed or failed probe reports { kind: "unknown" }, never a
//   guess.
// - N5: `pgrep -x opencode` matches comm==opencode only; npm/bun installs run as
//   node/bun host processes and are MISSED by the process probe. The running verdict
//   therefore never rests on the process probe alone (port + API evidence decide), and
//   the limitation is carried into every snapshot (svcops.limitation.pgrep).
// - Windows OpenSSH exec runs the registry DefaultShell (documented default cmd.exe);
//   the client cannot detect a changed shell and does NOT guess — an unparseable OS
//   probe is os-unknown/unsupported-os surfaced verbatim.
// - Statuses are memory-only (never persisted into the registry whitelist payload): a
//   stale persisted status would lie; the panel refreshes on entry and after reconnect.

import { isCompatibleServerVersion } from "../health-wrapper"
import type { ServiceOsFamily } from "./commands"

export type OsFamily = ServiceOsFamily | "unknown"

export type InstallSource = "curl" | "npm" | "brew" | "pacman" | "winget" | "unknown"

export type ServiceStatus =
  | { kind: "unknown" }
  | { kind: "not-installed" }
  | { kind: "installed-stopped"; version?: string; installPath?: string; source?: InstallSource }
  | { kind: "running"; version: string; evidence: "api" | "exec" | "both"; listenPort?: number }
  | { kind: "running-incompatible"; version: string }
  | { kind: "unsupported-os"; os: string }

/** Memory-only discovery snapshot (never persisted — a stale status would lie). */
export type ServiceSnapshot = {
  status: ServiceStatus
  /** Freshness bound (decision 0004 N3): the flow re-discovery guard reads this. */
  checkedAt: number
  /** Acceptance-4 evidence bit: the service answered after a client disconnect+reconnect. */
  survivedDisconnect?: boolean
  /** Honest limitation list (i18n keys), rendered verbatim by the panel. */
  limitations: readonly string[]
  /** Exec-face supplement evidence (path/source/process/port), kept beside the status. */
  execDetail?: {
    binaryPath?: string
    source?: InstallSource
    processAlive?: boolean
    listenPort?: number
  }
  /** Merge conflict notes (API-vs-exec disagreements; the API wins, the note stays). */
  notes?: string[]
}

// ---------------------------------------------------------------------------
// Limitations (i18n keys — EN/ZH in ../i18n; N5's pgrep miss is a mandatory entry)
// ---------------------------------------------------------------------------

export const LIMITATION_KEYS = {
  pgrep: "svcops.limitation.pgrep",
  direct: "svcops.limitation.direct",
  windowsShell: "svcops.limitation.windowsShell",
  windowsDetach: "svcops.limitation.windowsDetach",
  listenerWithoutApi: "svcops.limitation.listenerWithoutApi",
} as const

/** The limitation set for one discovery context (pure; panel renders the list verbatim). */
export function limitationKeysFor(input: { hostKind: "ssh" | "direct"; os: OsFamily }): string[] {
  const keys: string[] = [LIMITATION_KEYS.pgrep]
  if (input.hostKind === "direct") keys.push(LIMITATION_KEYS.direct)
  if (input.os === "windows") {
    keys.push(LIMITATION_KEYS.windowsShell)
    keys.push(LIMITATION_KEYS.windowsDetach)
  }
  return keys
}

// ---------------------------------------------------------------------------
// Pure parsers (fixture-driven; every parser answers "no evidence" instead of guessing)
// ---------------------------------------------------------------------------

/**
 * OS family from the detection pair outputs. POSIX `uname -s` answers Linux/Darwin;
 * Windows `ver` answers "Microsoft Windows ...". Anything else (including an
 * unparseable shape from a non-cmd DefaultShell) is honest "unknown" — never a guess.
 */
export function parseOsFamily(posixOutput: string | undefined, verOutput: string | undefined): OsFamily {
  const uname = posixOutput?.trim()
  if (uname === "Linux") return "linux"
  if (uname === "Darwin") return "darwin"
  if (verOutput && /Microsoft\s+Windows/i.test(verOutput)) return "windows"
  return "unknown"
}

/** A loose unsupported-OS reporter: the raw OS string when it is known but not supported. */
export function unsupportedOsName(posixOutput: string | undefined, verOutput: string | undefined): string | undefined {
  const uname = posixOutput?.trim()
  if (uname && uname !== "Linux" && uname !== "Darwin") return uname
  if (!uname && verOutput?.trim() && !/Microsoft\s+Windows/i.test(verOutput)) return verOutput.trim()
  return undefined
}

/**
 * Binary lookup (`command -v opencode` / `where opencode`). Exit 0 + a first line that
 * looks like a path yields the path; exit != 0 (documented: not found) yields
 * "binary-missing" evidence; any other shape yields no evidence.
 */
export function parseBinaryLookup(output: string | undefined, exitCode: number):
  | { found: true; path: string }
  | { found: false; reason: "missing" | "no-evidence" } {
  if (exitCode === 0) {
    const first = output?.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0)
    if (first && /^[/\\A-Za-z0-9]/.test(first) && !first.includes(" ")) return { found: true, path: first }
    return { found: false, reason: "no-evidence" }
  }
  if (exitCode === 1) return { found: false, reason: "missing" }
  return { found: false, reason: "no-evidence" }
}

/**
 * `opencode --version` output: extract a MAJOR.MINOR.PATCH token (leading v tolerated).
 * No token -> no evidence (the version is never invented from prose).
 */
export function parseVersionOutput(output: string | undefined): string | undefined {
  if (!output) return undefined
  const match = /v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(output)
  return match ? match[1] : undefined
}

/**
 * Process probe (N5-limited): pgrep exit 0 = pids printed (alive), exit 1 = none;
 * tasklist CSV containing the image name = alive. Only ever SUPPLEMENTARY evidence.
 */
export function parseProcessProbe(kind: "posix" | "windows", output: string | undefined, exitCode: number): boolean | undefined {
  if (kind === "posix") {
    if (exitCode === 0) return Boolean(output?.trim())
    if (exitCode === 1) return false
    return undefined
  }
  if (output && /"?opencode\.exe"?/i.test(output)) return true
  if (exitCode === 0 && output?.trim()) return false
  return undefined
}

/**
 * Port probe: `ss -tln` rows (`LISTEN ... :<port> `), `lsof -nP -iTCP:<port>
 * -sTCP:LISTEN` rows, `netstat -ano | findstr :<port>` rows with LISTENING.
 */
export function parsePortProbe(kind: "ss" | "lsof" | "netstat", output: string | undefined, port: number): number | undefined {
  if (!output) return undefined
  const lines = output.split(/\r?\n/)
  if (kind === "ss") {
    const hit = lines.some((line) => /LISTEN\b/.test(line) && new RegExp(`:${port}\\s`).test(line))
    return hit ? port : undefined
  }
  if (kind === "lsof") {
    const hit = lines.some((line) => line.includes(`LISTEN`) && line.includes(`:${port}`))
    return hit ? port : undefined
  }
  const hit = lines.some((line) => /LISTENING/i.test(line) && line.includes(`:${port}`))
  return hit ? port : undefined
}

/**
 * Install-source inference from a binary path (path-prefix matching, honest default
 * "unknown"). POSIX: ~/.opencode/bin -> curl; /opt/homebrew or /usr/local -> brew
 * (brew prefix first on darwin per the plan matrix); node/npm shapes -> npm. Windows:
 * %USERPROFILE%\.opencode\bin -> curl; node_modules -> npm; WindowsApps/winget -> winget.
 */
export function inferInstallSource(path: string, os: OsFamily): InstallSource {
  if (os === "linux" || os === "darwin") {
    if (path.includes("/.opencode/bin/")) return "curl"
    if (path.startsWith("/opt/homebrew/") || path.startsWith("/usr/local/")) return "brew"
    if (/(node_modules|\/npm\/|\/\.npm\/|\/\.nvm\/)/.test(path)) return "npm"
    return "unknown"
  }
  if (os === "windows") {
    const lower = path.toLowerCase()
    if (lower.includes("\\.opencode\\bin\\")) return "curl"
    if (lower.includes("node_modules") || lower.includes("\\npm\\")) return "npm"
    if (lower.includes("windowsapps") || lower.includes("winget")) return "winget"
    return "unknown"
  }
  return "unknown"
}

// ---------------------------------------------------------------------------
// Merge rule (API authoritative; exec supplements; conflicts recorded)
// ---------------------------------------------------------------------------

export type ApiServiceEvidence = { reachable: boolean; version?: string }

export type ExecServiceEvidence = {
  os?: OsFamily
  binaryPath?: string
  /** The binary probe RAN and answered "missing" (exit 1) — the not-installed evidence. */
  binaryMissing?: boolean
  source?: InstallSource
  execVersion?: string
  processAlive?: boolean
  listenPort?: number
}

/**
 * Merge API and exec evidence into a ServiceStatus. The API evidence is authoritative
 * for "running" and the version; a conflict (exec version differs from API version) is
 * recorded as a note and the API value wins. The compatibility predicate is the shared
 * health-wrapper rule (major==2 && minor>=1) — the same one the connection flow uses.
 */
export function mergeServiceEvidence(input: { api?: ApiServiceEvidence; exec?: ExecServiceEvidence }): {
  status: ServiceStatus
  notes: string[]
} {
  const notes: string[] = []
  const exec = input.exec
  const api = input.api

  // Unsupported/unknown OS short-circuits: exec discovery refuses to guess past it.
  if (exec?.os === "unknown") {
    return { status: { kind: "unsupported-os", os: "unknown" }, notes }
  }
  if (exec?.os && exec.os !== "unknown") {
    // (a known family: discovery proceeds)
  }

  if (api?.reachable) {
    const version = api.version
    if (version) {
      if (exec?.execVersion && exec.execVersion !== version) {
        notes.push("version-conflict-api-wins")
      }
      if (isCompatibleServerVersion(version) === false) {
        return { status: { kind: "running-incompatible", version }, notes }
      }
      const agreeingExec = exec?.execVersion !== undefined && exec.execVersion === version
      return {
        status: { kind: "running", version, evidence: agreeingExec ? "both" : "api", listenPort: exec?.listenPort },
        notes,
      }
    }
    // API reachable but did not answer a version: running stays API-evidenced, honestly
    // version-less only if the exec face cannot supplement.
    const execVersion = exec?.execVersion
    if (execVersion) {
      if (isCompatibleServerVersion(execVersion) === false) {
        return { status: { kind: "running-incompatible", version: execVersion }, notes }
      }
      return { status: { kind: "running", version: execVersion, evidence: "exec", listenPort: exec?.listenPort }, notes }
    }
    return { status: { kind: "unknown" }, notes }
  }

  // No API answer: NOT running, whatever the process probe says (the API verdict is
  // authoritative — N5's lesson generalized). Exec evidence fills the install face.
  if (exec && (exec.binaryPath || exec.execVersion)) {
    if (exec.listenPort !== undefined) notes.push("listener-without-api")
    return {
      status: {
        kind: "installed-stopped",
        version: exec.execVersion,
        installPath: exec.binaryPath,
        source: exec.source ?? (exec.binaryPath ? inferInstallSource(exec.binaryPath, exec.os ?? "unknown") : undefined),
      },
      notes,
    }
  }
  if (exec?.binaryMissing) {
    return { status: { kind: "not-installed" }, notes }
  }
  return { status: { kind: "unknown" }, notes }
}
