// Service operations command face (issue #7, decision 0004 §3) — the whitelist command
// surface of the fourth bridge.
//
// Security architecture (no free-command injection surface):
// - The bridge protocol carries {templateId, params} ONLY. The full command string is
//   assembled from THIS table on the JS side and mirrored by the Kotlin
//   ServiceCommandValidator (templateId set + per-template param regexes + the template's
//   OS applicability domain). There is no operation that carries a raw command in either
//   direction (scripts/verify-service-ops.ts negative).
// - Preview IS execution, byte for byte: the preview face (previewServiceCommand) and the
//   execution face (assembleServiceCommand) are the same pure function — golden vectors
//   (GOLDEN_VECTORS + test/service-commands.test.ts) lock the exact strings.
// - Param values are rejected on ANY shell metacharacter (`; | & $ ( ) < > backtick,
//   newline, quotes, control chars, cmd escapes `! ^ %`), path traversal (`..`) and out-of
//   -range ports; every value must additionally match its template's allowlist pattern.
// - Templates are OS-closed (B2/N2): each template carries its OS applicability domain and
//   cross-domain assembly is refused on BOTH sides (TS here, Kotlin validator). The curl
//   pipe installer exists ONLY for linux/darwin (N2: upstream updater.ts:198-208 itself
//   warns a bare `bash` on Windows may be the WSL launcher — the client's wsl.exe negative
//   cannot see a remote bash=WSL, so the template is withheld entirely for windows).
// - Zero delete-class templates (N8): the table contains no rm/del/rmdir template. The
//   uninstall story is copy-only text (i18n svcops.copy.uninstall.*) that the panel lets
//   the user copy — the client never executes an uninstall (probe negative).
//
// Upstream sources for the verbs (verified against the pin cache, decision 0004 §3):
// - install script: `curl -fsSL https://opencode.ai/v2/install | bash` (--version <v>)
// - npm: `npm i -g @opencode/cli@latest`; brew: `brew install opencode` (core)
// - winget: `winget install --id Anomaly.OpenCode --exact --source winget
//   --accept-source-agreements --disable-interactivity` (upstream updater.ts:59-68 verbatim)
// - serve: `opencode serve --hostname 127.0.0.1 --port <port> --cors` (hostname default
//   127.0.0.1 upstream; the template pins the loopback explicitly)
// - upgrade: `opencode upgrade --method <m> --target <v>` (methods curl|npm|pnpm|bun|yarn|vp|brew|winget)

import { ServiceOpsError } from "./errors"

export type ServiceOsFamily = "linux" | "darwin" | "windows"

/** Template OS applicability domain; "any" is reserved for the OS-detection bootstrap pair. */
export type TemplateOsDomain = ServiceOsFamily | "any"

export type ServiceOpsAction =
  | "probe"
  | "install"
  | "install-curl"
  | "start"
  | "upgrade"
  | "backup"
  | "restore"
  | "stop"

/**
 * The OS-detection bootstrap pair carries "any": the first command of a discovery cannot
 * know the remote OS yet, so both detection templates are runnable everywhere — each is a
 * fixed whitelisted string (`uname -s` / `ver`) whose OUTPUT decides the family; an
 * unparseable output is honest os-unknown, never a guess. Every other template is closed
 * to its family (the validator refuses cross-domain assembly on both sides).
 */
const OS_DETECT_DOMAIN: TemplateOsDomain = "any"

/**
 * Param allowlist patterns, mirrored VERBATIM by the Kotlin ServiceCommandValidator
 * (scripts/verify-service-ops.ts locks the two pattern sets). Patterns are allow-only;
 * the shared metacharacter/traversal rejector runs before them on every value.
 */
export const SERVICE_PARAM_PATTERNS = {
  /** npm dist-tag or pinned semver (npm accepts @latest explicitly). */
  versionAny: "^(?:latest|\\d+\\.\\d+\\.\\d+)$",
  /** Pinned semver only — the curl installer and the upgrade target never guess "latest". */
  versionPinned: "^\\d+\\.\\d+\\.\\d+$",
  /** Digits only; the 1..65535 range is enforced additionally (numeric check). */
  port: "^\\d{1,5}$",
  /** Upstream upgrade methods (upstream upgrade command surface). */
  method: "^(?:curl|npm|pnpm|bun|yarn|vp|brew|winget)$",
  /** POSIX absolute binary path (no spaces — discovery paths never contain them). */
  binPathPosix: "^[A-Za-z0-9._/-]+$",
  /** Windows absolute binary path (drive colon + both slash shapes, no spaces, no %VAR%). */
  binPathWindows: "^[A-Za-z0-9._\\\\:\\/-]+$",
  /** UTC compact stamp the client formats (keeps the preview byte-deterministic). */
  stamp: "^\\d{8}T\\d{6}Z$",
} as const

export type ServiceParamPatternName = keyof typeof SERVICE_PARAM_PATTERNS

export interface ServiceParamSpec {
  name: string
  pattern: ServiceParamPatternName
}

export interface ServiceCommandTemplate {
  id: string
  action: ServiceOpsAction
  os: TemplateOsDomain
  params: readonly ServiceParamSpec[]
  /** Full command line; `<name>` placeholders are substituted by the assembler. */
  command: string
}

const P = (name: string, pattern: ServiceParamPatternName): ServiceParamSpec => ({ name, pattern })

// ---------------------------------------------------------------------------
// The whitelist table — the single source of the client's entire command surface.
// scripts/verify-service-ops.ts asserts: no delete-class template (N8), no uninstall
// action, every action x OS is covered by a variant or explicitly absent (curl).
// ---------------------------------------------------------------------------
export const COMMAND_TEMPLATES: readonly ServiceCommandTemplate[] = [
  // -- discovery: OS detection bootstrap pair (domain "any", see above) ----------------
  { id: "probe.os.posix", action: "probe", os: OS_DETECT_DOMAIN, params: [], command: "uname -s" },
  { id: "probe.os.windows", action: "probe", os: OS_DETECT_DOMAIN, params: [], command: "ver" },
  // -- discovery: binary / version / process / port (three-way variants, B2) ----------
  { id: "probe.bin.linux", action: "probe", os: "linux", params: [], command: "command -v opencode" },
  { id: "probe.bin.darwin", action: "probe", os: "darwin", params: [], command: "command -v opencode" },
  { id: "probe.bin.windows", action: "probe", os: "windows", params: [], command: "where opencode" },
  { id: "probe.version.linux", action: "probe", os: "linux", params: [], command: "opencode --version" },
  { id: "probe.version.darwin", action: "probe", os: "darwin", params: [], command: "opencode --version" },
  { id: "probe.version.windows", action: "probe", os: "windows", params: [], command: "opencode --version" },
  // N5: pgrep -x matches comm==opencode only — npm/bun hosts (comm=node/bun) are
  // missed; the running verdict never rests on this probe alone (discovery.ts merge).
  { id: "probe.process.linux", action: "probe", os: "linux", params: [], command: "pgrep -x opencode" },
  { id: "probe.process.darwin", action: "probe", os: "darwin", params: [], command: "pgrep -x opencode" },
  {
    id: "probe.process.windows",
    action: "probe",
    os: "windows",
    params: [],
    command: 'tasklist /FI "IMAGENAME eq opencode.exe" /FO CSV /NH',
  },
  { id: "probe.port.linux", action: "probe", os: "linux", params: [], command: "ss -tln" },
  { id: "probe.port.darwin", action: "probe", os: "darwin", params: [P("port", "port")], command: "lsof -nP -iTCP:<port> -sTCP:LISTEN" },
  { id: "probe.port.windows", action: "probe", os: "windows", params: [P("port", "port")], command: "netstat -ano | findstr :<port>" },
  // -- install: package-manager-first (the curl pipe is its own closed action) --------
  { id: "install.npm.linux", action: "install", os: "linux", params: [P("version", "versionAny")], command: "npm install -g @opencode/cli@<version>" },
  { id: "install.npm.darwin", action: "install", os: "darwin", params: [P("version", "versionAny")], command: "npm install -g @opencode/cli@<version>" },
  { id: "install.npm.windows", action: "install", os: "windows", params: [P("version", "versionAny")], command: "npm install -g @opencode/cli@<version>" },
  { id: "install.brew.linux", action: "install", os: "linux", params: [], command: "brew install opencode" },
  { id: "install.brew.darwin", action: "install", os: "darwin", params: [], command: "brew install opencode" },
  // N6: the winget verb `install` is winget's standard verb and the argument string is
  // verbatim upstream updater.ts:59-68 (decision 0004 §3 writes down the source).
  {
    id: "install.winget.windows",
    action: "install",
    os: "windows",
    params: [],
    command: "winget install --id Anomaly.OpenCode --exact --source winget --accept-source-agreements --disable-interactivity",
  },
  // N2: curl pipe installer — POSIX closed domain ONLY (see the header note).
  {
    id: "install-curl.linux",
    action: "install-curl",
    os: "linux",
    params: [P("version", "versionPinned")],
    command: "curl -fsSL https://opencode.ai/v2/install | bash -s -- --version <version>",
  },
  {
    id: "install-curl.darwin",
    action: "install-curl",
    os: "darwin",
    params: [P("version", "versionPinned")],
    command: "curl -fsSL https://opencode.ai/v2/install | bash -s -- --version <version>",
  },
  // -- start (B2 three-way split; N1 stdin discipline) --------------------------------
  // N1: the two POSIX variants carry the FULL stdio redirect including </dev/null (a
  // ChannelExec that waits on stdin hangs otherwise). The windows variant has no
  // /dev/null (cmd semantics); its stdio story is `start /b` immediate-return, recorded
  // in decision 0004 and units/service-ops.md (review residual 1).
  {
    id: "start.linux",
    action: "start",
    os: "linux",
    params: [P("port", "port")],
    // B2: setsid is util-linux and Linux-only; the new session detaches from the SSH
    // exec channel's process group.
    command: "setsid nohup opencode serve --hostname 127.0.0.1 --port <port> </dev/null >/dev/null 2>&1 &",
  },
  {
    id: "start.darwin",
    action: "start",
    os: "darwin",
    params: [P("port", "port")],
    // B2: macOS base system has no setsid; nohup (SIGHUP immunity) is the macOS story.
    command: "nohup opencode serve --hostname 127.0.0.1 --port <port> </dev/null >/dev/null 2>&1 &",
  },
  {
    id: "start.windows",
    action: "start",
    os: "windows",
    params: [P("port", "port")],
    // Honest boundary (detach-uncertain): a `start /b` child's survival after the SSH
    // session ends is NOT guaranteed on Windows — surfaced as a limitation, never claimed.
    command: "start /b opencode serve --hostname 127.0.0.1 --port <port>",
  },
  // -- upgrade ------------------------------------------------------------------------
  { id: "upgrade.linux", action: "upgrade", os: "linux", params: [P("method", "method"), P("version", "versionPinned")], command: "opencode upgrade --method <method> --target <version>" },
  { id: "upgrade.darwin", action: "upgrade", os: "darwin", params: [P("method", "method"), P("version", "versionPinned")], command: "opencode upgrade --method <method> --target <version>" },
  { id: "upgrade.windows", action: "upgrade", os: "windows", params: [P("method", "method"), P("version", "versionPinned")], command: "opencode upgrade --method <method> --target <version>" },
  // -- replace-plan steps: backup / restore (the rollback face; cp is symmetric) ------
  { id: "backup.linux", action: "backup", os: "linux", params: [P("binPath", "binPathPosix"), P("stamp", "stamp")], command: "cp <binPath> <binPath>.bak-opencode-mobile-<stamp>" },
  { id: "backup.darwin", action: "backup", os: "darwin", params: [P("binPath", "binPathPosix"), P("stamp", "stamp")], command: "cp <binPath> <binPath>.bak-opencode-mobile-<stamp>" },
  {
    id: "backup.windows",
    action: "backup",
    os: "windows",
    params: [P("binPath", "binPathWindows"), P("stamp", "stamp")],
    command: "copy /Y <binPath> <binPath>.bak-opencode-mobile-<stamp>",
  },
  { id: "restore.linux", action: "restore", os: "linux", params: [P("binPath", "binPathPosix"), P("stamp", "stamp")], command: "cp <binPath>.bak-opencode-mobile-<stamp> <binPath>" },
  { id: "restore.darwin", action: "restore", os: "darwin", params: [P("binPath", "binPathPosix"), P("stamp", "stamp")], command: "cp <binPath>.bak-opencode-mobile-<stamp> <binPath>" },
  {
    id: "restore.windows",
    action: "restore",
    os: "windows",
    params: [P("binPath", "binPathWindows"), P("stamp", "stamp")],
    command: "copy /Y <binPath>.bak-opencode-mobile-<stamp> <binPath>",
  },
  // -- stop (an independent authorized action; NEVER wired to any client disconnect) --
  { id: "stop.linux", action: "stop", os: "linux", params: [], command: "pkill -x opencode" },
  { id: "stop.darwin", action: "stop", os: "darwin", params: [], command: "pkill -x opencode" },
  { id: "stop.windows", action: "stop", os: "windows", params: [], command: "taskkill /IM opencode.exe /F" },
]

const TEMPLATE_BY_ID = new Map(COMMAND_TEMPLATES.map((t) => [t.id, t]))

export function serviceCommandTemplate(id: string): ServiceCommandTemplate | undefined {
  return TEMPLATE_BY_ID.get(id)
}

/** The OS applicability domain of a template id (unknown ids answer undefined). */
export function templateOsDomain(id: string): TemplateOsDomain | undefined {
  return TEMPLATE_BY_ID.get(id)?.os
}

// ---------------------------------------------------------------------------
// Parameter validation (shared rejector + per-template allowlist)
// ---------------------------------------------------------------------------

/**
 * Shell metacharacters and cmd escapes — ANY occurrence in ANY param value refuses the
 * assembly (exec-denied). This is the first gate; the per-param allowlist pattern is the
 * second. `!` `^` `%` are cmd-specific escapes/expansion faces and are refused too.
 */
const PARAM_METACHAR = /[;|&$`()<>"'\r\n\0!^%]|[\x01-\x1f\x7f]/

const PARAM_MAX_LENGTH = 200

function validateParamValue(templateId: string, spec: ServiceParamSpec, value: unknown): string {
  if (typeof value !== "string") throw new ServiceOpsError("exec-denied", `${templateId}: param ${spec.name} must be a string`)
  if (value.length === 0 || value.length > PARAM_MAX_LENGTH) {
    throw new ServiceOpsError("exec-denied", `${templateId}: param ${spec.name} length out of bounds`)
  }
  if (PARAM_METACHAR.test(value)) {
    throw new ServiceOpsError("exec-denied", `${templateId}: param ${spec.name} carries a refused character`)
  }
  if (value.includes("..")) {
    throw new ServiceOpsError("exec-denied", `${templateId}: param ${spec.name} carries a path-traversal segment`)
  }
  if (!new RegExp(SERVICE_PARAM_PATTERNS[spec.pattern]).test(value)) {
    throw new ServiceOpsError("exec-denied", `${templateId}: param ${spec.name} fails the allowlist pattern`)
  }
  if (spec.pattern === "port") {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceOpsError("exec-denied", `${templateId}: port out of range`)
    }
  }
  return value
}

export type AssembledServiceCommand = {
  templateId: string
  action: ServiceOpsAction
  os: TemplateOsDomain
  /** The EXACT string the native side will setCommand — the preview shows this verbatim. */
  command: string
}

/**
 * The single assembly point (execution face). Fail-closed: an unknown template, a
 * cross-OS assembly, an unexpected param set or any refused value throws
 * ServiceOpsError("exec-denied") — nothing is ever loosely coerced into a command.
 */
export function assembleServiceCommand(
  os: ServiceOsFamily,
  templateId: string,
  params: Record<string, string>,
): AssembledServiceCommand {
  const template = TEMPLATE_BY_ID.get(templateId)
  if (!template) throw new ServiceOpsError("exec-denied", `unknown template id: refused`)
  if (template.os !== "any" && template.os !== os) {
    throw new ServiceOpsError("exec-denied", `template ${templateId} is not applicable to the requested OS domain`)
  }
  const specs = template.params
  const requested = Object.keys(params)
  const declared = specs.map((s) => s.name)
  for (const name of requested) {
    if (!declared.includes(name)) throw new ServiceOpsError("exec-denied", `${templateId}: unexpected param refused`)
  }
  for (const name of declared) {
    if (!(name in params)) throw new ServiceOpsError("exec-denied", `${templateId}: missing param ${name}`)
  }
  let command = template.command
  for (const spec of specs) {
    const value = validateParamValue(templateId, spec, params[spec.name])
    command = command.split(`<${spec.name}>`).join(value)
  }
  return { templateId, action: template.action, os: template.os, command }
}

/**
 * The preview face. It is deliberately THE SAME function as the execution face: a preview
 * can never diverge from what executes (byte-for-byte; golden vectors lock it).
 */
export function previewServiceCommand(os: ServiceOsFamily, templateId: string, params: Record<string, string>): AssembledServiceCommand {
  return assembleServiceCommand(os, templateId, params)
}

/** Templates available for an action on an OS family ("any"-domain rows included). */
export function templatesForAction(action: ServiceOpsAction, os: ServiceOsFamily): ServiceCommandTemplate[] {
  return COMMAND_TEMPLATES.filter((t) => t.action === action && (t.os === "any" || t.os === os))
}

// ---------------------------------------------------------------------------
// Golden vectors — exact preview==execution strings (asserted byte-for-byte by
// test/service-commands.test.ts and re-checked by scripts/verify-service-ops.ts).
// ---------------------------------------------------------------------------

export const GOLDEN_VECTORS: readonly { templateId: string; os: ServiceOsFamily; params: Record<string, string>; command: string }[] = [
  {
    templateId: "start.linux",
    os: "linux",
    params: { port: "4096" },
    command: "setsid nohup opencode serve --hostname 127.0.0.1 --port 4096 </dev/null >/dev/null 2>&1 &",
  },
  {
    templateId: "start.darwin",
    os: "darwin",
    params: { port: "4096" },
    command: "nohup opencode serve --hostname 127.0.0.1 --port 4096 </dev/null >/dev/null 2>&1 &",
  },
  {
    templateId: "start.windows",
    os: "windows",
    params: { port: "4096" },
    command: "start /b opencode serve --hostname 127.0.0.1 --port 4096",
  },
  {
    templateId: "install-curl.linux",
    os: "linux",
    params: { version: "2.1.4" },
    command: "curl -fsSL https://opencode.ai/v2/install | bash -s -- --version 2.1.4",
  },
  {
    templateId: "install.npm.windows",
    os: "windows",
    params: { version: "latest" },
    command: "npm install -g @opencode/cli@latest",
  },
  {
    templateId: "install.winget.windows",
    os: "windows",
    params: {},
    command:
      "winget install --id Anomaly.OpenCode --exact --source winget --accept-source-agreements --disable-interactivity",
  },
  {
    templateId: "stop.windows",
    os: "windows",
    params: {},
    command: "taskkill /IM opencode.exe /F",
  },
  {
    templateId: "backup.linux",
    os: "linux",
    params: { binPath: "/home/user/.opencode/bin/opencode", stamp: "20261024T101500Z" },
    command: "cp /home/user/.opencode/bin/opencode /home/user/.opencode/bin/opencode.bak-opencode-mobile-20261024T101500Z",
  },
  {
    templateId: "restore.windows",
    os: "windows",
    params: { binPath: "C:\\Users\\user\\.opencode\\bin\\opencode.exe", stamp: "20261024T101500Z" },
    command: "copy /Y C:\\Users\\user\\.opencode\\bin\\opencode.exe.bak-opencode-mobile-20261024T101500Z C:\\Users\\user\\.opencode\\bin\\opencode.exe",
  },
]

/** The UTC compact stamp format the backup/restore templates expect (client-formatted). */
export function formatBackupStamp(date: Date): string {
  const pad = (n: number, w: number) => String(n).padStart(w, "0")
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`
  )
}
