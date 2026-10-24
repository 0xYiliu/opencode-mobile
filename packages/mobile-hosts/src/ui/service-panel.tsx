// Service panel (issue #7, decision 0004 §2.5): the first-party surface for remote
// service discovery and EXPLICITLY authorized install/start/upgrade/replace/stop actions,
// mounted inline in the host-manager row (an expandable card, HostKeyPrompt pattern).
//
// Red lines shaped into this component:
// - Nothing executes without the preview -> acknowledge -> confirm ladder (the O-flow):
//   every button opens a preview card showing the EXACT command text (byte-identical to
//   what the native side assembles — golden vectors), the impact copy, and a mandatory
//   "this will change the remote system" acknowledgement before Confirm enables.
// - Never silent: replace carries the red warning and lists all four steps in full; stop
//   says it terminates the remote process; the curl installer says it executes upstream
//   code. Failure results carry the bounded stderr tail verbatim.
// - No bridge client injected -> the whole panel renders nothing (explicit
//   degrade-hidden; stub fail-closed, the probe discipline). A client-only build implies
//   no service-operation capability.
// - B1 disconnect-survival watcher: the panel subscribes to the connection state store
//   (state-machine.ts / runtime.ts stay UNTOUCHED — subscription-side only). Entering
//   ready from offline/reconnecting/authRequired triggers one snapshot refresh and fills
//   the survivedDisconnect evidence bit by comparing the pre-disconnect snapshot with
//   the refreshed one. T5 (first connect) never triggers. authRequired is worded as a
//   re-authentication re-check, never as a detach-survival claim.
// - N3: Confirm dispatches with the current clock; a stale discovery refuses (O6 guard)
//   and the driver re-runs discovery, then re-opens the same preview.
// - Exec-side preflight: install/replace re-probes the port right before the install
//   step; a running service refuses with occupied-port — the client never installs over
//   or silently replaces a running service.
// - N7: the credential is resolved per command from the vault (memory-only), crosses the
//   bridge once per exec and is never rendered, logged or persisted here.
// - N8: there is no delete/uninstall execution face — the uninstall section is copy-only
//   text the user can take to their own terminal.

import { Show, createEffect, createSignal } from "solid-js"
import { For } from "solid-js"
import { Button } from "@opencode/ui/button"
import { createTranslator } from "../i18n"
import type { MessageKey } from "../i18n"
import { getMobileHosts } from "../runtime"
import type { HostState } from "../state-machine"
import { createVaultResolver } from "../vault/vault"
import { DEFAULT_SERVICE_PORT } from "../registry"
import { parseSshTargetHost } from "../ssh/known-hosts"
import { assembleServiceCommand, formatBackupStamp, serviceCommandTemplate } from "../service-ops/commands"
import type { ServiceOsFamily } from "../service-ops/commands"
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
} from "../service-ops/discovery"
import type { OsFamily, ServiceSnapshot } from "../service-ops/discovery"
import { serviceOpsErrorCodeMessageKey } from "../service-ops/errors"
import type { ServiceOpsErrorCode } from "../service-ops/errors"
import { transitionServiceFlow } from "../service-ops/flow"
import type { ServiceFlowContext, ServiceFlowEvent, ServiceFlowState } from "../service-ops/flow"
import { activeServiceOpsPort, interpretExecResult, serviceOpsBridgeInjected } from "../service-ops/port"
import type { ServiceOpsExecOutcome } from "../service-ops/port"
import { shouldRefreshServiceStatus } from "../service-ops/refresh"

type PlanStep = { templateId: string; params: Record<string, string> }

type Preview = {
  action: "start" | "install" | "install-curl" | "upgrade" | "stop" | "replace"
  commands: string[]
  plan: PlanStep[]
  /** The rollback step offered on failure (replace/backup flows only; never fabricated). */
  rollback?: PlanStep
  /** True when the version re-check decides success (install/replace faces). */
  verifyVersion?: string
}

type PanelResult = {
  kind: "success" | "partial" | "failed"
  code?: ServiceOpsErrorCode
  stderrTail?: string
  lines?: string[]
}

export function ServicePanel(props: { hostId: string }) {
  const runtime = getMobileHosts()
  const t = createTranslator(runtime.locale)
  // Fail-closed degrade-hidden: without an injected bridge client this panel does not
  // exist at all (the injection happens at entry bootstrap, M-016, before first render).
  const injected = serviceOpsBridgeInjected()
  const port = activeServiceOpsPort()

  const [flow, setFlow] = createSignal<{ state: ServiceFlowState; ctx: ServiceFlowContext }>({
    state: "idle",
    ctx: {},
  })
  const [snapshot, setSnapshot] = createSignal<ServiceSnapshot | undefined>(undefined)
  const [discoveredOs, setDiscoveredOs] = createSignal<OsFamily | undefined>(undefined)
  const [preview, setPreview] = createSignal<Preview | undefined>(undefined)
  const [pendingAction, setPendingAction] = createSignal<Preview["action"] | undefined>(undefined)
  const [acknowledged, setAcknowledged] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [result, setResult] = createSignal<PanelResult | undefined>(undefined)
  const [inlineError, setInlineError] = createSignal<string | undefined>(undefined)
  const [versionInput, setVersionInput] = createSignal("")
  const [methodInput, setMethodInput] = createSignal("")
  const [survived, setSurvived] = createSignal<"yes" | "no" | "unknown" | undefined>(undefined)
  const [reauthChecked, setReauthChecked] = createSignal(false)
  // Pre-disconnect running evidence for the survival comparison (memory-only).
  let preDisconnectRunning: boolean | undefined = undefined

  const record = () => runtime.registry.get(props.hostId)
  const ssh = () => parseSshTargetHost(record()?.target ?? "")
  const servicePort = () => record()?.servicePort ?? DEFAULT_SERVICE_PORT

  const dispatch = (event: ServiceFlowEvent): boolean => {
    const current = flow()
    const next = transitionServiceFlow(current.state, event, current.ctx)
    if (!next) return false
    setFlow({ state: next.state, ctx: next.ctx })
    return true
  }

  // ---------------------------------------------------------------------------
  // N7: the credential is resolved PER COMMAND (vault-backed), memory-only, one way.
  // ---------------------------------------------------------------------------
  const resolveCredential = async (): Promise<string | undefined> => {
    const ref = record()?.credentialRef
    if (!ref) return undefined
    try {
      return await createVaultResolver(runtime.credentials).resolve(ref)
    } catch {
      return undefined
    }
  }

  const execTemplate = async (
    templateId: string,
    params: Record<string, string>,
    credential?: string,
  ): Promise<ServiceOpsExecOutcome> => {
    const rec = record()
    if (!rec) return { ok: false, code: "svcops-unavailable" }
    const os = discoveredOs()
    if (os === undefined || os === "unknown") return { ok: false, code: "os-unknown" }
    // TS assembly gate (preview + closed-domain refusal); the wire carries
    // {templateId, params} only — the native side re-assembles from its mirror table.
    try {
      assembleServiceCommand(os, templateId, params)
    } catch {
      return { ok: false, code: "exec-denied" }
    }
    const fingerprint = runtime.fingerprintOf(props.hostId)
    return port.exec({
      host: ssh().host,
      port: ssh().port,
      templateId,
      params,
      os,
      ...(credential !== undefined ? { credential } : {}),
      ...(fingerprint !== undefined ? { pinnedFingerprint: fingerprint } : {}),
    })
  }

  /** One exec with the per-command vault-resolved credential (N7: 逐命令解析). */
  const execAsHost = async (templateId: string, params: Record<string, string>): Promise<ServiceOpsExecOutcome> =>
    execTemplate(templateId, params, await resolveCredential())

  // ---------------------------------------------------------------------------
  // Discovery (two layers; the API face rides the connection state, the exec face runs
  // the whitelisted probe templates and the pure parsers).
  // ---------------------------------------------------------------------------
  const discover = async (): Promise<void> => {
    if (!record()) return
    if (!dispatch({ type: "discover" })) return
    setBusy(true)
    setResult(undefined)
    try {
      const posix = await execAsHost("probe.os.posix", {})
      const posixOut = posix.ok && posix.result.exitCode === 0 ? posix.result.stdout : undefined
      let verOut: string | undefined
      if (parseOsFamily(posixOut, undefined) === "unknown") {
        const win = await execAsHost("probe.os.windows", {})
        verOut = win.ok && win.result.exitCode === 0 ? win.result.stdout : undefined
      }
      const os = parseOsFamily(posixOut, verOut)
      setDiscoveredOs(os)
      const baseLimitations = limitationKeysFor({ hostKind: "ssh", os })
      if (os === "unknown") {
        setSnapshot({
          status: { kind: "unsupported-os", os: unsupportedOsName(posixOut, verOut) ?? "unknown" },
          checkedAt: Date.now(),
          limitations: baseLimitations,
        })
        dispatch({ type: "discovered", nowTs: Date.now() })
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
        listenPort = r.ok ? parsePortProbe("ss", r.result.stdout, servicePort()) : undefined
      } else if (family === "darwin") {
        const r = await execAsHost("probe.port.darwin", { port: String(servicePort()) })
        listenPort = r.ok ? parsePortProbe("lsof", r.result.stdout, servicePort()) : undefined
      } else {
        const r = await execAsHost("probe.port.windows", { port: String(servicePort()) })
        listenPort = r.ok ? parsePortProbe("netstat", r.result.stdout, servicePort()) : undefined
      }
      // The API face is authoritative and rides the connection state: a ready host has a
      // live tunnel whose post-open health check already answered (running evidence).
      const api = runtime.stateOf(props.hostId) === "ready" ? ({ reachable: true } as const) : undefined
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
      setSnapshot({
        status: merged.status,
        checkedAt: Date.now(),
        limitations: merged.notes.includes("listener-without-api")
          ? [...baseLimitations, "svcops.limitation.listenerWithoutApi"]
          : baseLimitations,
      })
      dispatch({ type: "discovered", nowTs: Date.now() })
    } finally {
      setBusy(false)
      // A stale-confirm re-entry: re-open the preview that was interrupted by the N3
      // re-discovery (same action, freshly stamped).
      const again = pendingAction()
      if (again) {
        setPendingAction(undefined)
        openPreview(again)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // B1 watcher: subscription-side only (state-machine.ts / runtime.ts zero changes).
  // ---------------------------------------------------------------------------
  createEffect((previous: HostState | undefined) => {
    const current = runtime.stateOf(props.hostId)
    if (previous !== undefined && previous !== current) {
      if (previous === "ready" && (current === "offline" || current === "reconnecting")) {
        // Client-side loss mid-flow: invalidate (O14 — never any remote signal) and keep
        // the survival evidence baseline.
        preDisconnectRunning = snapshot()?.status.kind === "running"
        setSurvived(undefined)
        setReauthChecked(false)
        dispatch({ type: "connectionLost" })
      }
      if (shouldRefreshServiceStatus(previous, current)) {
        void refreshAfterReconnect(previous === "authRequired")
      }
    }
    return current
  })

  const refreshAfterReconnect = async (afterAuth: boolean): Promise<void> => {
    if (snapshot() === undefined) {
      // No established episode to compare against: run the plain discovery instead.
      await discover()
      return
    }
    await discover()
    if (afterAuth) {
      // T12 wording discipline: a re-authentication re-check is not a detach-survival
      // claim (the interruption cause was credentials, not the tunnel).
      setReauthChecked(true)
      return
    }
    const running = snapshot()?.status.kind === "running"
    setSurvived(preDisconnectRunning === undefined ? "unknown" : preDisconnectRunning && running ? "yes" : running ? "unknown" : "no")
  }

  // ---------------------------------------------------------------------------
  // Previews (the single authorization gate; commands come from the template table only)
  // ---------------------------------------------------------------------------
  const installTemplateId = (): string | undefined => {
    const os = discoveredOs()
    if (os === undefined || os === "unknown") return undefined
    const source = snapshot()?.execDetail?.source
    if (os === "windows") return source === "winget" ? "install.winget.windows" : "install.npm.windows"
    if (source === "brew") return `install.brew.${os}`
    return `install.npm.${os}`
  }

  const defaultUpgradeMethod = (): string => {
    const source = snapshot()?.execDetail?.source
    if (source === "brew") return "brew"
    if (discoveredOs() === "windows") return "winget"
    return "npm"
  }

  const assemblePreviewStep = (step: PlanStep): string | undefined => {
    const os = discoveredOs()
    if (os === undefined || os === "unknown") return undefined
    try {
      return assembleServiceCommand(os, step.templateId, step.params).command
    } catch {
      return undefined
    }
  }

  const openPreview = (action: Preview["action"]): void => {
    setInlineError(undefined)
    setAcknowledged(false)
    const os = discoveredOs()
    const binPath = snapshot()?.execDetail?.binaryPath
    const stamp = formatBackupStamp(new Date())
    const portParam = String(servicePort())
    let built: Preview | undefined
    try {
      if (action === "start") {
        built = { action, commands: [assembleServiceCommand(os as ServiceOsFamily, `start.${os}`, { port: portParam }).command], plan: [{ templateId: `start.${os}`, params: { port: portParam } }] }
      } else if (action === "install") {
        const templateId = installTemplateId()
        if (!templateId) return
        const template = serviceCommandTemplate(templateId)
        const params: Record<string, string> = {}
        if (template && template.params.some((p) => p.name === "version")) {
          const v = versionInput().trim() || "latest"
          params["version"] = v
        }
        const command = assembleServiceCommand(os as ServiceOsFamily, templateId, params).command
        built = { action, commands: [command], plan: [{ templateId, params }], verifyVersion: params["version"] && params["version"] !== "latest" ? params["version"] : undefined }
      } else if (action === "install-curl") {
        if (os !== "linux" && os !== "darwin") return // N2: POSIX closed domain, no windows face
        const v = versionInput().trim()
        const command = assembleServiceCommand(os, `install-curl.${os}`, { version: v }).command
        built = { action, commands: [command], plan: [{ templateId: `install-curl.${os}`, params: { version: v } }], verifyVersion: v }
      } else if (action === "upgrade") {
        const method = methodInput().trim() || defaultUpgradeMethod()
        const v = versionInput().trim()
        const command = assembleServiceCommand(os as ServiceOsFamily, `upgrade.${os}`, { method, version: v }).command
        built = { action, commands: [command], plan: [{ templateId: `upgrade.${os}`, params: { method, version: v } }], verifyVersion: v }
      } else if (action === "stop") {
        built = { action, commands: [assembleServiceCommand(os as ServiceOsFamily, `stop.${os}`, {}).command], plan: [{ templateId: `stop.${os}`, params: {} }] }
      } else {
        // replace: stop -> backup -> install(pinned) -> start; the rollback restores the
        // backup. Requires a known binary path; the install step pins the version.
        if (!binPath) {
          setInlineError(t("svcops.error.binary-missing"))
          return
        }
        const templateId = installTemplateId()
        if (!templateId) return
        const v = versionInput().trim()
        const installParams: Record<string, string> = serviceCommandTemplate(templateId)!.params.some((p) => p.name === "version") ? { version: v } : {}
        const plan: PlanStep[] = [
          { templateId: `stop.${os}`, params: {} },
          { templateId: `backup.${os}`, params: { binPath, stamp } },
          { templateId, params: installParams },
          { templateId: `start.${os}`, params: { port: portParam } },
        ]
        const commands = plan.map((s) => assemblePreviewStep(s)).filter((c): c is string => c !== undefined)
        if (commands.length !== plan.length) return
        const rollback = { templateId: `restore.${os}`, params: { binPath, stamp } }
        built = {
          action,
          commands,
          plan,
          rollback,
          verifyVersion: installParams["version"],
        }
      }
    } catch {
      // Assembly refused (closed domain / bad version shape): honest inline copy.
      setInlineError(t("svcops.error.exec-denied" as MessageKey))
      return
    }
    dispatch({ type: "preview", action })
    setPreview(built)
  }

  // ---------------------------------------------------------------------------
  // Execution (the confirmed ladder; preflight refuses to install over a running service)
  // ---------------------------------------------------------------------------
  const cancelRequestedSignal = (): boolean => flow().state === "cancelRequested"

  const portFree = async (): Promise<boolean> => {
    const os = discoveredOs()
    if (os === undefined || os === "unknown") return false
    const family = os as ServiceOsFamily
    const r =
      family === "linux"
        ? await execAsHost("probe.port.linux", {})
        : family === "darwin"
          ? await execAsHost("probe.port.darwin", { port: String(servicePort()) })
          : await execAsHost("probe.port.windows", { port: String(servicePort()) })
    if (!r.ok) return true // probe unavailable: the exec-side preflight cannot refuse on missing evidence
    const occupied =
      family === "linux"
        ? parsePortProbe("ss", r.result.stdout, servicePort()) !== undefined
        : family === "darwin"
          ? parsePortProbe("lsof", r.result.stdout, servicePort()) !== undefined
          : parsePortProbe("netstat", r.result.stdout, servicePort()) !== undefined
    return !occupied
  }

  const failOutcome = (code: ServiceOpsErrorCode, stderrTail?: string): void => {
    dispatch({ type: "fail", code, rollbackAvailable: preview()?.rollback !== undefined })
    setResult({ kind: "failed", code, stderrTail })
  }

  const execute = async (): Promise<void> => {
    const current = preview()
    if (!current) return
    if (!dispatch({ type: "confirm", nowTs: Date.now() })) {
      // N3: the discovery went stale — force a re-discovery and re-open this preview.
      dispatch({ type: "discover" })
      setPendingAction(current.action)
      setPreview(undefined)
      void discover()
      return
    }
    if (!dispatch({ type: "execute" })) return
    setBusy(true)
    setResult(undefined)
    let installedSomething = false
    let backupOk = false
    let failure: { code: ServiceOpsErrorCode; stderrTail?: string } | undefined
    try {
      for (const step of current.plan) {
        if (cancelRequestedSignal()) break
        // Exec-side preflight (N3 mitigation): never install over a running service.
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
      if (!failure && !cancelRequestedSignal() && installedSomething && current.verifyVersion) {
        // Post-install version re-check: a mismatch is a partial install (rollback face).
        const v = await execAsHost(`probe.version.${discoveredOs() as ServiceOsFamily}`, {})
        const got = v.ok && v.result.exitCode === 0 ? parseVersionOutput(v.result.stdout) : undefined
        if (got !== current.verifyVersion) {
          dispatch({ type: "partial", rollbackAvailable: current.rollback !== undefined })
          setResult({
            kind: "partial",
            code: "partial-install",
            lines: [
              `${t("svcops.version")}: ${got ?? "?"}`,
              `${t("svcops.preview.command")}: ${current.commands[current.commands.length - 1] ?? ""}`,
            ],
          })
          return
        }
      }
      if (failure) {
        const rollbackAvailable = (current.rollback !== undefined && backupOk) || false
        dispatch({ type: "fail", code: failure.code, rollbackAvailable })
        setResult({ kind: "failed", code: failure.code, stderrTail: failure.stderrTail })
        return
      }
      if (cancelRequestedSignal()) {
        // Honest cancel face: the remote outcome is uncertain; a forced re-check runs now.
        dispatch({ type: "rediscover" })
        setResult({ kind: "failed", code: "cancel-uncertain" })
        await discover()
        return
      }
      dispatch({ type: "succeeded" })
      setResult({ kind: "success" })
    } finally {
      setBusy(false)
      setPreview(undefined)
      setAcknowledged(false)
    }
  }

  const rollback = async (): Promise<void> => {
    const step = preview()?.rollback
    // The rollback uses the SAME preview->confirm->execute ladder: this entry only seeds
    // the preview with the restore step.
    if (!step) return
    const command = assemblePreviewStep(step)
    if (!command) return
    dispatch({ type: "preview", action: "replace" })
    setPreview({ action: "replace", commands: [command], plan: [step] })
  }

  const requestCancel = async (): Promise<void> => {
    if (flow().state !== "executing") return
    await port.cancel({ host: ssh().host, port: ssh().port })
    dispatch({ type: "cancel" }) // O11: cancelRequested — the remote outcome is uncertain
  }

  const statusKey = (): MessageKey => {
    const kind = snapshot()?.status.kind
    return `svcops.status.${kind ?? "unknown"}` as MessageKey
  }

  const actionsAvailable = (): boolean => flow().state === "discovered" && !busy()
  const status = () => snapshot()?.status
  const osKnown = (): boolean => discoveredOs() !== undefined && discoveredOs() !== "unknown"
  const showStop = (): boolean => status()?.kind === "running"
  const showReplace = (): boolean => Boolean(snapshot()?.execDetail?.binaryPath)
  const posixOs = (): boolean => discoveredOs() === "linux" || discoveredOs() === "darwin"
  const versionLine = (): string | undefined => {
    const s = snapshot()?.status
    if (!s) return undefined
    if (s.kind === "running" || s.kind === "running-incompatible") return s.version
    if (s.kind === "installed-stopped") return s.version
    return undefined
  }

  return (
    <Show when={injected}>
      <div class="mt-2 flex w-full min-w-0 flex-col gap-2 rounded-[12px] border border-border-weak-base p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-12-medium text-text-strong">{t("svcops.title")}</span>
          <Button size="small" variant="neutral" disabled={busy() || flow().state === "discovering"} onClick={() => void discover()}>
            {snapshot() === undefined ? t("svcops.check") : t("svcops.refresh")}
          </Button>
        </div>
        <Show when={snapshot()}>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-12-regular text-text-strong" role="status">
              {t(statusKey())}
            </span>
            <Show when={versionLine() !== undefined}>
              <span class="text-12-regular text-text-weak">
                {t("svcops.version")}: {versionLine()}
              </span>
            </Show>
            <Show when={snapshot()?.execDetail?.binaryPath !== undefined}>
              <span class="truncate text-12-regular text-text-weak" dir="ltr">
                {t("svcops.installPath")}: {snapshot()?.execDetail?.binaryPath}
              </span>
            </Show>
            <Show when={snapshot()?.execDetail?.source !== undefined}>
              <span class="text-12-regular text-text-weak">
                {t("svcops.source")}: {t(`svcops.source.${snapshot()?.execDetail?.source}` as MessageKey)}
              </span>
            </Show>
          </div>
          <For each={[...(snapshot()?.limitations ?? [])]}>
            {(key) => (
              <p class="text-12-regular text-text-weak">{t(key as MessageKey)}</p>
            )}
          </For>
        </Show>
        <Show when={reauthChecked()}>
          <p class="text-12-regular text-text-weak" role="status">
            {t("svcops.survived.reauth")}
          </p>
        </Show>
        <Show when={survived() !== undefined}>
          <p class="text-12-regular text-text-weak" role="status">
            {t("svcops.survived.title")} {t(`svcops.survived.${survived()}` as MessageKey)}
          </p>
        </Show>
        <Show when={flow().state === "discovering"}>
          <p class="text-12-regular text-text-weak">{t("svcops.flow.discovering")}</p>
        </Show>
        <Show when={flow().state === "cancelRequested"}>
          <p class="text-12-regular text-text-strong" role="alert">
            {t("svcops.flow.cancelRequested")}
          </p>
        </Show>
        <Show when={inlineError() !== undefined}>
          <span class="text-12-regular text-text-strong" role="alert">
            {inlineError()}
          </span>
        </Show>
        {/* Actions: only from a fresh `discovered` state — every one re-enters the ladder */}
        <Show when={actionsAvailable() && osKnown() && snapshot() !== undefined}>
          <div class="flex flex-wrap items-center gap-1">
            <Button size="small" variant="neutral" onClick={() => openPreview("start")}>
              {t("svcops.action.start")}
            </Button>
            <Button size="small" variant="neutral" onClick={() => openPreview("install")}>
              {t("svcops.action.install")}
            </Button>
            <Show when={posixOs()}>
              <Button size="small" variant="neutral" onClick={() => openPreview("install-curl")}>
                {t("svcops.action.install-curl")}
              </Button>
            </Show>
            <Button size="small" variant="neutral" onClick={() => openPreview("upgrade")}>
              {t("svcops.action.upgrade")}
            </Button>
            <Show when={showStop()}>
              <Button size="small" variant="danger" onClick={() => openPreview("stop")}>
                {t("svcops.action.stop")}
              </Button>
            </Show>
            <Show when={showReplace()}>
              <Button size="small" variant="neutral" onClick={() => openPreview("replace")}>
                {t("svcops.action.replace")}
              </Button>
            </Show>
            <Show when={result()?.kind === "failed" && flow().state === "discovered" && flow().ctx.rollbackAvailable === true && preview() === undefined}>
              <Button size="small" variant="danger" onClick={() => void rollback()}>
                {t("svcops.action.rollback")}
              </Button>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-12-regular text-text-weak">{t("svcops.versionInput")}</span>
            <input
              class="w-32 rounded-[8px] border border-border-weak-base px-2 py-1 text-12-regular text-text-strong"
              placeholder={t("svcops.versionInputPlaceholder")}
              value={versionInput()}
              onInput={(e) => setVersionInput(e.currentTarget.value)}
            />
            <span class="text-12-regular text-text-weak">{t("svcops.methodInput")}</span>
            <input
              class="w-24 rounded-[8px] border border-border-weak-base px-2 py-1 text-12-regular text-text-strong"
              placeholder={defaultUpgradeMethod()}
              value={methodInput()}
              onInput={(e) => setMethodInput(e.currentTarget.value)}
            />
          </div>
        </Show>
        <Show when={flow().state === "executing"}>
          <div class="flex items-center justify-between gap-2">
            <p class="text-12-regular text-text-strong">{t("svcops.flow.executing")}</p>
            <Button size="small" variant="neutral" onClick={() => void requestCancel()}>
              {t("svcops.preview.cancel")}
            </Button>
          </div>
        </Show>
        <Show when={result()}>
          <div class="flex min-w-0 flex-col gap-1 rounded-[8px] border border-border-weak-base p-2">
            <span class="text-12-regular text-text-strong" role={result()!.kind === "success" ? "status" : "alert"}>
              {result()!.kind === "success" ? t("svcops.flow.succeeded") : result()!.kind === "partial" ? t("svcops.flow.partial") : t("svcops.flow.failed")}
            </span>
            <Show when={result()?.code !== undefined}>
              <span class="text-12-regular text-text-weak">{t(serviceOpsErrorCodeMessageKey(result()!.code!) as MessageKey)}</span>
            </Show>
            <Show when={result()?.lines !== undefined}>
              <For each={result()!.lines}>
                {(line) => (
                  <span class="text-12-regular text-text-weak" dir="ltr">
                    {line}
                  </span>
                )}
              </For>
            </Show>
            <Show when={result()?.stderrTail !== undefined}>
              <span class="text-12-regular text-text-weak">{t("svcops.result.output")}</span>
              <code class="max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-12-mono text-text-weak" dir="ltr">
                {result()!.stderrTail}
              </code>
            </Show>
            <Show when={result()?.kind !== "success" && flow().ctx.rollbackAvailable === true}>
              <span class="text-12-regular text-text-weak">{t("svcops.result.rollbackAvailable")}</span>
            </Show>
          </div>
        </Show>
        {/* Preview/confirmation card (HostKeyPrompt inline pattern) — the ONLY door to execution */}
        <Show when={preview()}>
          <div class="flex w-full min-w-0 flex-col gap-2 rounded-[12px] border border-border-weak-base p-3" role="alertdialog" aria-label={t("svcops.preview.title")}>
            <h4 class="text-14-medium text-text-strong">{t("svcops.preview.title")}</h4>
            <Show when={preview()!.action === "replace"}>
              <p class="text-12-regular text-text-strong" role="alert">
                {t("svcops.preview.replaceWarning")}
              </p>
            </Show>
            <p class="text-12-regular text-text-weak">{t(`svcops.preview.impact.${preview()!.action}` as MessageKey)}</p>
            <span class="text-12-regular text-text-weak">{t("svcops.preview.command")}</span>
            <For each={preview()!.commands}>
              {(command, index) => (
                <code class="whitespace-pre-wrap break-all text-12-mono text-text-strong" dir="ltr">
                  {preview()!.commands.length > 1 ? `${index() + 1}. ` : ""}
                  {command}
                </code>
              )}
            </For>
            <label class="flex items-center gap-2 text-12-regular text-text-strong">
              <input type="checkbox" checked={acknowledged()} onChange={(e) => setAcknowledged(e.currentTarget.checked)} />
              {t("svcops.preview.acknowledge")}
            </label>
            <div class="flex items-center justify-end gap-2">
              <Button
                size="small"
                variant="neutral"
                onClick={() => {
                  setPreview(undefined)
                  dispatch({ type: "cancel" })
                }}
              >
                {t("svcops.preview.cancel")}
              </Button>
              <Button size="small" variant="danger" disabled={!acknowledged() || busy()} onClick={() => void execute()}>
                {t("svcops.preview.confirm")}
              </Button>
            </div>
          </div>
        </Show>
        {/* Uninstall: copy-only, never executed (N8) */}
        <details class="flex min-w-0 flex-col gap-1">
          <summary class="cursor-pointer text-12-regular text-text-weak">{t("svcops.uninstall.title")}</summary>
          <p class="text-12-regular text-text-weak">{t("svcops.uninstall.hint")}</p>
          <For each={["npm", "brew", "winget"] as const}>
            {(source) => (
              <code class="whitespace-pre-wrap break-all text-12-mono text-text-weak" dir="ltr">
                {t(`svcops.uninstall.line.${source}` as MessageKey)}
              </code>
            )}
          </For>
        </details>
      </div>
    </Show>
  )
}
