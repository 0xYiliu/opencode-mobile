// Service panel driver (issue #7): the orchestration of the service-ops authorization
// ladder, extracted from the Solid component so the forced-rediscovery paths are unit-
// testable against the REAL flow machine and the fake bridge (review B1: the stale-
// confirm and cancel-uncertain paths must provably EXECUTE a re-discovery, not park the
// flow in `discovering` with no recovery).
//
// Dispatch discipline (the B1 fix): `discover()` is the ONLY entry that performs the O1
// `discover` transition (legal from idle|succeeded|partial|failed|previewing).
// `runDiscovery()` performs the probe sequence itself and dispatches `discovered` (O2) —
// it is for paths that have ALREADY transitioned into `discovering`:
//   - the stale-confirm path: previewing --O1 discover--> discovering -> runDiscovery();
//   - the cancel-uncertain path: cancelRequested --O12 rediscover--> discovering ->
//     runDiscovery();
//   - the post-invalidation reconnect refresh: the O14 connectionLost row already moved
//     the flow to `discovering` -> runDiscovery().
// No path ever dispatches `discover` while already in `discovering` (O1 has no such
// source — that refusal was the deadlock).
//
// The driver holds NO Solid reactivity: it pushes every state change through deps sinks;
// the panel wires signals into those sinks. All time is read through deps.now() so tests
// can drive the N3 freshness guard deterministically.

import { assembleServiceCommand, formatBackupStamp, serviceCommandTemplate } from "./commands"
import type { ServiceOsFamily } from "./commands"
import {
  inferInstallSource,
  limitationKeysFor,
  mergeServiceEvidence,
  parseBinaryLookup,
  parseOsFamily,
  parsePortProbe,
  parseProcessProbe,
  parseVersionOutput,
  unsupportedOsName,
} from "./discovery"
import type { OsFamily, ServiceSnapshot } from "./discovery"
import type { ServiceOpsErrorCode } from "./errors"
import { transitionServiceFlow } from "./flow"
import type { ServiceFlowContext, ServiceFlowEvent, ServiceFlowState } from "./flow"
import type { ServiceOpsExecOutcome } from "./port"
import { interpretExecResult } from "./port"
import type { MessageKey } from "../i18n"

export type PlanStep = { templateId: string; params: Record<string, string> }

export type PreviewAction = "start" | "install" | "install-curl" | "upgrade" | "stop" | "replace"

export type Preview = {
  action: PreviewAction
  commands: string[]
  plan: PlanStep[]
  /** The rollback step offered on failure (replace/backup flows only; never fabricated). */
  rollback?: PlanStep
  /** Defined when the post-install version re-check decides success (install faces). */
  verifyVersion?: string
}

export type PanelResult = {
  kind: "success" | "partial" | "failed"
  code?: ServiceOpsErrorCode
  stderrTail?: string
  lines?: string[]
}

export interface PanelDriverDeps {
  /** The SSH username from the target's user@ segment (B2; absent when the target has none). */
  sshUser(): string | undefined
  servicePort(): number
  fingerprint(): string | undefined
  resolveCredential(): Promise<string | undefined>
  /** One whitelisted exec through the fourth bridge (the panel fills host/port/transport). */
  execRequest(input: {
    username?: string
    templateId: string
    params: Record<string, string>
    os: ServiceOsFamily
    credential?: string
    pinnedFingerprint?: string
  }): Promise<ServiceOpsExecOutcome>
  /** Best-effort local cancel of the in-flight exec. */
  cancelExec(): Promise<void>
  /** The API face: the connection state machine says the service answered (host ready). */
  apiReachable(): boolean
  /** Injectable clock (N3 freshness guard determinism). */
  now(): number
  translate(key: MessageKey): string
  // State sinks (the panel wires signals into these).
  onFlow(state: ServiceFlowState, ctx: ServiceFlowContext): void
  onSnapshot(snapshot: ServiceSnapshot | undefined): void
  onDiscoveredOs(os: OsFamily): void
  onPreview(preview: Preview | undefined): void
  onBusy(busy: boolean): void
  onResult(result: PanelResult | undefined): void
  onInlineError(message: string | undefined): void
  onSurvived(survived: "yes" | "no" | "unknown" | undefined): void
  onReauthChecked(checked: boolean): void
}

export function createPanelDriver(deps: PanelDriverDeps) {
  let flow: { state: ServiceFlowState; ctx: ServiceFlowContext } = { state: "idle", ctx: {} }
  let snapshot: ServiceSnapshot | undefined
  let discoveredOs: OsFamily | undefined
  let preview: Preview | undefined
  let pendingAction: PreviewAction | undefined
  let busy = false
  let result: PanelResult | undefined
  let preDisconnectRunning: boolean | undefined
  // The panel's current inputs, retained so a forced re-discovery can re-open the same
  // preview with the same values (the N3 stale-confirm re-entry).
  let lastVersionInput = ""
  let lastMethodInput = ""

  // -- getters (tests + panel) ------------------------------------------------------------
  const getFlow = () => ({ ...flow, ctx: { ...flow.ctx } })
  const getSnapshot = () => snapshot
  const getPreview = () => preview
  const isBusy = () => busy

  const setFlow = (next: { state: ServiceFlowState; ctx: ServiceFlowContext }) => {
    flow = { state: next.state, ctx: next.ctx }
    deps.onFlow(flow.state, flow.ctx)
  }
  const dispatch = (event: ServiceFlowEvent): boolean => {
    const next = transitionServiceFlow(flow.state, event, flow.ctx)
    if (!next) return false
    setFlow({ state: next.state, ctx: next.ctx })
    return true
  }

  // ---------------------------------------------------------------------------
  // N7: the credential is resolved PER COMMAND (vault-backed), memory-only, one way.
  // ---------------------------------------------------------------------------
  const execAsHost = async (templateId: string, params: Record<string, string>): Promise<ServiceOpsExecOutcome> => {
    // The OS-detection bootstrap pair carries the "any" domain and must run BEFORE any
    // family is known (the pre-B1 bug refused it with os-unknown because the gate read
    // the not-yet-discovered family). Every other template is gated on the discovered
    // family (closed domain).
    const domain = serviceCommandTemplate(templateId)?.os
    if (domain === undefined) return { ok: false, code: "exec-denied" } // unknown template: refused before any wire
    let os: ServiceOsFamily
    if (domain === "any") {
      // The OS-detection bootstrap pair runs before the family is known: the wire `os`
      // field is advisory for an any-domain template, so a placeholder family carries it.
      os = discoveredOs !== undefined && discoveredOs !== "unknown" ? discoveredOs : "linux"
    } else {
      if (discoveredOs === undefined || discoveredOs === "unknown") return { ok: false, code: "os-unknown" }
      os = discoveredOs
    }
    // TS assembly gate (preview + closed-domain refusal); the wire carries
    // {templateId, params, os, username?} only — the native side re-assembles from its
    // mirror table and never receives a command string.
    try {
      assembleServiceCommand(os, templateId, params)
    } catch {
      return { ok: false, code: "exec-denied" }
    }
    const credential = await deps.resolveCredential()
    const fingerprint = deps.fingerprint()
    return deps.execRequest({
      ...(deps.sshUser() !== undefined ? { username: deps.sshUser() } : {}),
      templateId,
      params,
      os,
      ...(credential !== undefined ? { credential } : {}),
      ...(fingerprint !== undefined ? { pinnedFingerprint: fingerprint } : {}),
    })
  }

  // ---------------------------------------------------------------------------
  // Discovery (B1 fix: runDiscovery performs the probes WITHOUT the O1 gate — it serves
  // the paths that already transitioned into `discovering`).
  // ---------------------------------------------------------------------------
  const runDiscovery = async (): Promise<void> => {
    deps.onBusy(true)
    deps.onResult(undefined)
    try {
      const posix = await execAsHost("probe.os.posix", {})
      const posixOut = posix.ok && posix.result.exitCode === 0 ? posix.result.stdout : undefined
      let verOut: string | undefined
      if (parseOsFamily(posixOut, undefined) === "unknown") {
        const win = await execAsHost("probe.os.windows", {})
        verOut = win.ok && win.result.exitCode === 0 ? win.result.stdout : undefined
      }
      const os = parseOsFamily(posixOut, verOut)
      discoveredOs = os
      deps.onDiscoveredOs(os)
      const baseLimitations = limitationKeysFor({ hostKind: "ssh", os })
      if (os === "unknown") {
        snapshot = {
          status: { kind: "unsupported-os", os: unsupportedOsName(posixOut, verOut) ?? "unknown" },
          checkedAt: deps.now(),
          limitations: baseLimitations,
        }
        deps.onSnapshot(snapshot)
        dispatch({ type: "discovered", nowTs: deps.now() })
        return
      }
      const family = os as ServiceOsFamily
      const binary = await execAsHost(`probe.bin.${family}`, {})
      const binaryInfo = binary.ok
        ? parseBinaryLookup(binary.result.stdout, binary.result.exitCode)
        : ({ found: false, reason: "no-evidence" } as const)
      const version = await execAsHost(`probe.version.${family}`, {})
      const execVersion = version.ok && version.result.exitCode === 0 ? parseVersionOutput(version.result.stdout) : undefined
      const process = await execAsHost(`probe.process.${family}`, {})
      const processAlive = process.ok
        ? parseProcessProbe(family === "windows" ? "windows" : "posix", process.result.stdout, process.result.exitCode)
        : undefined
      let listenPort: number | undefined
      if (family === "linux") {
        const r = await execAsHost("probe.port.linux", {})
        listenPort = r.ok ? parsePortProbe("ss", r.result.stdout, deps.servicePort()) : undefined
      } else if (family === "darwin") {
        const r = await execAsHost("probe.port.darwin", { port: String(deps.servicePort()) })
        listenPort = r.ok ? parsePortProbe("lsof", r.result.stdout, deps.servicePort()) : undefined
      } else {
        const r = await execAsHost("probe.port.windows", { port: String(deps.servicePort()) })
        listenPort = r.ok ? parsePortProbe("netstat", r.result.stdout, deps.servicePort()) : undefined
      }
      // The API face is authoritative and rides the connection state: a ready host has a
      // live tunnel whose post-open health check already answered (running evidence).
      const api = deps.apiReachable() ? ({ reachable: true } as const) : undefined
      const binaryMissing = !binaryInfo.found && binaryInfo.reason === "missing"
      const merged = mergeServiceEvidence({
        api,
        exec: {
          os,
          ...(binaryInfo.found ? { binaryPath: binaryInfo.path } : {}),
          ...(binaryMissing ? { binaryMissing: true } : {}),
          ...(binaryInfo.found ? { source: inferInstallSource(binaryInfo.path, os) } : {}),
          ...(execVersion !== undefined ? { execVersion } : {}),
          ...(processAlive !== undefined ? { processAlive } : {}),
          ...(listenPort !== undefined ? { listenPort } : {}),
        },
      })
      snapshot = {
        status: merged.status,
        checkedAt: deps.now(),
        limitations: merged.notes.includes("listener-without-api")
          ? [...baseLimitations, "svcops.limitation.listenerWithoutApi"]
          : baseLimitations,
      }
      deps.onSnapshot(snapshot)
      dispatch({ type: "discovered", nowTs: deps.now() })
    } finally {
      deps.onBusy(false)
      // The N3 stale-confirm re-entry: re-open the interrupted preview (same action,
      // freshly stamped by the re-discovery above).
      const again = pendingAction
      if (again) {
        pendingAction = undefined
        openPreview(again, lastVersionInput, lastMethodInput)
      }
    }
  }

  /** The user-facing discovery entry: performs the O1 transition, then the probes. */
  const discover = async (): Promise<void> => {
    if (busy) return
    if (!dispatch({ type: "discover" })) return
    await runDiscovery()
  }

  // ---------------------------------------------------------------------------
  // B1 connection-state hooks (the panel's watcher maps the predicate onto these).
  // ---------------------------------------------------------------------------
  const notifyConnectionLost = (): void => {
    preDisconnectRunning = snapshot?.status.kind === "running"
    deps.onSurvived(undefined)
    deps.onReauthChecked(false)
    dispatch({ type: "connectionLost" }) // O14: invalidate; nothing remote is signalled
  }

  const notifyReadyArrival = async (afterAuth: boolean): Promise<void> => {
    if (flow.state === "discovering") {
      // O14 (or a forced path) already moved the flow here: run the probes directly.
      await runDiscovery()
    } else {
      await discover()
    }
    if (afterAuth) {
      // T12 wording discipline: a re-authentication re-check is not a detach-survival
      // claim (the interruption cause was credentials, not the tunnel).
      deps.onReauthChecked(true)
      return
    }
    if (preDisconnectRunning === undefined) return // no established episode: no survival claim
    const running = snapshot?.status.kind === "running"
    deps.onSurvived(preDisconnectRunning && running ? "yes" : running ? "unknown" : "no")
  }

  // ---------------------------------------------------------------------------
  // Previews (the single authorization gate; commands come from the template table only)
  // ---------------------------------------------------------------------------
  const installTemplateId = (): string | undefined => {
    const os = discoveredOs
    if (os === undefined || os === "unknown") return undefined
    const source = snapshot?.execDetail?.source
    if (os === "windows") return source === "winget" ? "install.winget.windows" : "install.npm.windows"
    if (source === "brew") return `install.brew.${os}`
    return `install.npm.${os}`
  }

  const defaultUpgradeMethod = (): string => {
    const source = snapshot?.execDetail?.source
    if (source === "brew") return "brew"
    if (discoveredOs === "windows") return "winget"
    return "npm"
  }

  const assemblePreviewStep = (step: PlanStep): string | undefined => {
    const os = discoveredOs
    if (os === undefined || os === "unknown") return undefined
    try {
      return assembleServiceCommand(os, step.templateId, step.params).command
    } catch {
      return undefined
    }
  }

  const openPreview = (action: Preview["action"], versionInput: string, methodInput: string): void => {
    lastVersionInput = versionInput
    lastMethodInput = methodInput
    deps.onInlineError(undefined)
    const os = discoveredOs
    const binPath = snapshot?.execDetail?.binaryPath
    const stamp = formatBackupStamp(new Date(deps.now()))
    const portParam = String(deps.servicePort())
    // Review N3 (preview-time honesty): a running service is never offered a plain
    // install preview — the panel states the refusal instead of assembling a command
    // whose execution the preflight would refuse anyway.
    if ((action === "install" || action === "install-curl") && snapshot?.status.kind === "running") {
      deps.onInlineError(deps.translate("svcops.error.occupied-port" as MessageKey))
      return
    }
    let built: Preview | undefined
    try {
      if (action === "start") {
        built = {
          action,
          commands: [assembleServiceCommand(os as ServiceOsFamily, `start.${os}`, { port: portParam }).command],
          plan: [{ templateId: `start.${os}`, params: { port: portParam } }],
        }
      } else if (action === "install") {
        const templateId = installTemplateId()
        if (!templateId) return
        const template = serviceCommandTemplate(templateId)
        const params: Record<string, string> = {}
        if (template && template.params.some((p) => p.name === "version")) {
          params["version"] = versionInput.trim() || "latest"
        }
        const command = assembleServiceCommand(os as ServiceOsFamily, templateId, params).command
        built = {
          action,
          commands: [command],
          plan: [{ templateId, params }],
          verifyVersion: params["version"] && params["version"] !== "latest" ? params["version"] : undefined,
        }
      } else if (action === "install-curl") {
        if (os !== "linux" && os !== "darwin") return // N2: POSIX closed domain, no windows face
        const v = versionInput.trim()
        const command = assembleServiceCommand(os, `install-curl.${os}`, { version: v }).command
        built = { action, commands: [command], plan: [{ templateId: `install-curl.${os}`, params: { version: v } }], verifyVersion: v }
      } else if (action === "upgrade") {
        const method = methodInput.trim() || defaultUpgradeMethod()
        const v = versionInput.trim()
        const command = assembleServiceCommand(os as ServiceOsFamily, `upgrade.${os}`, { method, version: v }).command
        built = { action, commands: [command], plan: [{ templateId: `upgrade.${os}`, params: { method, version: v } }], verifyVersion: v }
      } else if (action === "stop") {
        built = {
          action,
          commands: [assembleServiceCommand(os as ServiceOsFamily, `stop.${os}`, {}).command],
          plan: [{ templateId: `stop.${os}`, params: {} }],
        }
      } else {
        // replace: stop -> backup -> install(pinned) -> start; the rollback restores the
        // backup. Requires a known binary path; the install step pins the version.
        if (!binPath) {
          deps.onInlineError(deps.translate("svcops.error.binary-missing" as MessageKey))
          return
        }
        const templateId = installTemplateId()
        if (!templateId) return
        const v = versionInput.trim()
        const installParams: Record<string, string> = serviceCommandTemplate(templateId)!.params.some((p) => p.name === "version")
          ? { version: v }
          : {}
        const plan: PlanStep[] = [
          { templateId: `stop.${os}`, params: {} },
          { templateId: `backup.${os}`, params: { binPath, stamp } },
          { templateId, params: installParams },
          { templateId: `start.${os}`, params: { port: portParam } },
        ]
        const commands = plan.map((s) => assemblePreviewStep(s)).filter((c): c is string => c !== undefined)
        if (commands.length !== plan.length) return
        built = { action, commands, plan, rollback: { templateId: `restore.${os}`, params: { binPath, stamp } }, verifyVersion: installParams["version"] }
      }
    } catch {
      // Assembly refused (closed domain / bad version shape): honest inline copy.
      deps.onInlineError(deps.translate("svcops.error.exec-denied" as MessageKey))
      return
    }
    dispatch({ type: "preview", action })
    preview = built
    deps.onPreview(built)
  }

  // ---------------------------------------------------------------------------
  // Execution (the confirmed ladder; preflight refuses to install over a running service)
  // ---------------------------------------------------------------------------
  const cancelRequestedNow = (): boolean => flow.state === "cancelRequested"

  /**
   * Exec-side preflight (review N3, fail-closed): a port probe WITHOUT usable evidence
   * refuses the install — "cannot prove the port is free" never installs.
   */
  const portFree = async (): Promise<boolean> => {
    const os = discoveredOs
    if (os === undefined || os === "unknown") return false
    const family = os as ServiceOsFamily
    const r =
      family === "linux"
        ? await execAsHost("probe.port.linux", {})
        : family === "darwin"
          ? await execAsHost("probe.port.darwin", { port: String(deps.servicePort()) })
          : await execAsHost("probe.port.windows", { port: String(deps.servicePort()) })
    if (!r.ok) return false // probe unavailable: no evidence -> refuse (fail-closed)
    const occupied =
      family === "linux"
        ? parsePortProbe("ss", r.result.stdout, deps.servicePort()) !== undefined
        : family === "darwin"
          ? parsePortProbe("lsof", r.result.stdout, deps.servicePort()) !== undefined
          : parsePortProbe("netstat", r.result.stdout, deps.servicePort()) !== undefined
    return !occupied
  }

  const failOutcome = (code: ServiceOpsErrorCode, stderrTail?: string): void => {
    dispatch({ type: "fail", code, rollbackAvailable: preview?.rollback !== undefined })
    result = { kind: "failed", code, stderrTail }
    deps.onResult(result)
  }

  const executePreview = async (acknowledged: boolean): Promise<void> => {
    const current = preview
    if (!current || !acknowledged || busy) return
    if (!dispatch({ type: "confirm", nowTs: deps.now() })) {
      // N3: the discovery went stale — force a re-discovery (O1 accepts previewing) and
      // re-open this preview afterwards. runDiscovery (NOT discover) does the work: the
      // flow is already in `discovering` (review B1: this path must really re-run).
      dispatch({ type: "discover" })
      pendingAction = current.action
      preview = undefined
      deps.onPreview(undefined)
      await runDiscovery()
      return
    }
    if (!dispatch({ type: "execute" })) return
    busy = true
    deps.onBusy(true)
    result = undefined
    deps.onResult(undefined)
    let installedSomething = false
    let backupOk = false
    let failure: { code: ServiceOpsErrorCode; stderrTail?: string } | undefined
    try {
      for (const step of current.plan) {
        if (cancelRequestedNow()) break
        // Exec-side preflight (N3): never install over a running service; no evidence
        // refuses too (fail-closed).
        if (step.templateId.startsWith("install") && !(await portFree())) {
          failure = { code: "occupied-port" }
          break
        }
        const outcome = await execAsHost(step.templateId, step.params)
        if (step.templateId.startsWith("backup") && outcome.ok && outcome.result.exitCode === 0) backupOk = true
        if (step.templateId.startsWith("install")) installedSomething = true
        if (!outcome.ok) {
          failure = { code: outcome.code, stderrTail: outcome.stderrTail }
          break
        }
        const interpreted = interpretExecResult(outcome.result)
        if (!interpreted.ok) {
          failure = { code: interpreted.code, stderrTail: interpreted.stderrTail }
          break
        }
      }
      if (!failure && !cancelRequestedNow() && installedSomething && current.verifyVersion) {
        // Post-install version re-check: a mismatch is a partial install (rollback face).
        const v = await execAsHost(`probe.version.${discoveredOs as ServiceOsFamily}`, {})
        const got = v.ok && v.result.exitCode === 0 ? parseVersionOutput(v.result.stdout) : undefined
        if (got !== current.verifyVersion) {
          dispatch({ type: "partial", rollbackAvailable: current.rollback !== undefined })
          result = {
            kind: "partial",
            code: "partial-install",
            lines: [
              `${deps.translate("svcops.version")}: ${got ?? "?"}`,
              `${deps.translate("svcops.preview.command")}: ${current.commands[current.commands.length - 1] ?? ""}`,
            ],
          }
          deps.onResult(result)
          return
        }
      }
      if (failure) {
        const rollbackAvailable = current.rollback !== undefined && backupOk
        dispatch({ type: "fail", code: failure.code, rollbackAvailable })
        result = { kind: "failed", code: failure.code, stderrTail: failure.stderrTail }
        deps.onResult(result)
        return
      }
      if (cancelRequestedNow()) {
        // Honest cancel face (review B1): the flow is in `cancelRequested`; O12 moves it
        // to `discovering` and runDiscovery REALLY re-runs the probes — the remote
        // outcome is decided by evidence, never claimed. The cancel-uncertain result is
        // written AFTER the re-discovery so the honest face is not overwritten by it.
        dispatch({ type: "rediscover" })
        await runDiscovery()
        result = { kind: "failed", code: "cancel-uncertain" }
        deps.onResult(result)
        return
      }
      dispatch({ type: "succeeded" })
      result = { kind: "success" }
      deps.onResult(result)
    } finally {
      busy = false
      deps.onBusy(false)
      // Clear the executed preview — unless the N3 stale path already swapped it for the
      // freshly re-opened one (a different object; that one must survive).
      if (preview === current) {
        preview = undefined
        deps.onPreview(undefined)
      }
    }
  }

  const rollback = (): void => {
    const step = preview?.rollback
    // The rollback uses the SAME preview->confirm->execute ladder: this entry only seeds
    // the preview with the restore step.
    if (!step) return
    const command = assemblePreviewStep(step)
    if (!command) return
    dispatch({ type: "preview", action: "replace" })
    preview = { action: "replace", commands: [command], plan: [step] }
    deps.onPreview(preview)
  }

  const requestCancel = async (): Promise<void> => {
    if (flow.state !== "executing") return
    await deps.cancelExec()
    dispatch({ type: "cancel" }) // O11: cancelRequested — the remote outcome is uncertain
  }

  /** Dismiss the open preview (O5: side-effect-free — nothing was executed). */
  const cancelPreview = (): void => {
    dispatch({ type: "cancel" })
    preview = undefined
    deps.onPreview(undefined)
  }

  return {
    discover,
    openPreview,
    executePreview,
    requestCancel,
    cancelPreview,
    rollback,
    notifyConnectionLost,
    notifyReadyArrival,
    getFlow,
    getSnapshot,
    getPreview,
    isBusy,
  }
}
