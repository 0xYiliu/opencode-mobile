// Service panel (issue #7, decision 0004 §2.5): the first-party surface for remote
// service discovery and EXPLICITLY authorized install/start/upgrade/replace/stop actions,
// mounted inline in the host-manager row (an expandable card, HostKeyPrompt pattern).
//
// The orchestration (authorization ladder, discovery, forced re-discovery paths, cancel,
// rollback) lives in ../service-ops/panel-driver.ts — extracted so the B1 forced-
// rediscovery paths are unit-testable against the real flow machine. This component only
// wires Solid signals into the driver's state sinks and renders.
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
//   (state-machine.ts / runtime.ts stay UNTOUCHED — subscription-side only) and maps the
//   refresh predicate onto the driver's notify hooks. Entering ready from
//   offline/reconnecting/authRequired triggers one snapshot refresh and fills the
//   survivedDisconnect evidence bit by comparing the pre-disconnect snapshot with the
//   refreshed one. T5 (first connect) never triggers. authRequired is worded as a
//   re-authentication re-check, never as a detach-survival claim.
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
import { parseSshTargetHost, parseSshTargetUser } from "../ssh/known-hosts"
import { serviceOpsErrorCodeMessageKey } from "../service-ops/errors"
import { activeServiceOpsPort, serviceOpsBridgeInjected } from "../service-ops/port"
import { shouldRefreshServiceStatus } from "../service-ops/refresh"
import { createPanelDriver } from "../service-ops/panel-driver"
import type { PanelResult, Preview } from "../service-ops/panel-driver"

export function ServicePanel(props: { hostId: string }) {
  const runtime = getMobileHosts()
  const t = createTranslator(runtime.locale)
  // Fail-closed degrade-hidden: without an injected bridge client this panel does not
  // exist at all (the injection happens at entry bootstrap, M-016, before first render).
  const injected = serviceOpsBridgeInjected()
  const port = activeServiceOpsPort()

  const [flow, setFlow] = createSignal<{ state: string; ctx: { action?: string; rollbackAvailable?: boolean } }>({
    state: "idle",
    ctx: {},
  })
  const [snapshot, setSnapshot] = createSignal<
    | {
        status: { kind: string; version?: string }
        execDetail?: { binaryPath?: string; source?: string }
        limitations?: readonly string[]
      }
    | undefined
  >(undefined)
  const [discoveredOs, setDiscoveredOs] = createSignal<string | undefined>(undefined)
  const [preview, setPreview] = createSignal<Preview | undefined>(undefined)
  const [acknowledged, setAcknowledged] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [result, setResult] = createSignal<PanelResult | undefined>(undefined)
  const [inlineError, setInlineError] = createSignal<string | undefined>(undefined)
  const [versionInput, setVersionInput] = createSignal("")
  const [methodInput, setMethodInput] = createSignal("")
  const [survived, setSurvived] = createSignal<"yes" | "no" | "unknown" | undefined>(undefined)
  const [reauthChecked, setReauthChecked] = createSignal(false)

  const record = () => runtime.registry.get(props.hostId)
  const ssh = () => parseSshTargetHost(record()?.target ?? "")

  const driver = createPanelDriver({
    sshUser: () => (record() ? parseSshTargetUser(record()!.target) : undefined),
    servicePort: () => record()?.servicePort ?? DEFAULT_SERVICE_PORT,
    fingerprint: () => runtime.fingerprintOf(props.hostId),
    resolveCredential: async () => {
      const ref = record()?.credentialRef
      if (!ref) return undefined
      try {
        return await createVaultResolver(runtime.credentials).resolve(ref)
      } catch {
        return undefined
      }
    },
    execRequest: (input) =>
      port.exec({
        host: ssh().host,
        port: ssh().port,
        ...(input.username !== undefined ? { username: input.username } : {}),
        templateId: input.templateId,
        params: input.params,
        os: input.os,
        ...(input.credential !== undefined ? { credential: input.credential } : {}),
        ...(input.pinnedFingerprint !== undefined ? { pinnedFingerprint: input.pinnedFingerprint } : {}),
      }),
    cancelExec: async () => {
      await port.cancel({ host: ssh().host, port: ssh().port })
    },
    apiReachable: () => runtime.stateOf(props.hostId) === "ready",
    now: () => Date.now(),
    translate: (key) => t(key),
    onFlow: (state, ctx) => setFlow({ state, ctx }),
    onSnapshot: (s) => setSnapshot(s),
    onDiscoveredOs: (os) => setDiscoveredOs(os),
    onPreview: (p) => setPreview(p),
    onBusy: (b) => setBusy(b),
    onResult: (r) => setResult(r),
    onInlineError: (m) => setInlineError(m),
    onSurvived: (s) => setSurvived(s),
    onReauthChecked: (c) => setReauthChecked(c),
  })

  // ---------------------------------------------------------------------------
  // B1 watcher: subscription-side only (state-machine.ts / runtime.ts zero changes).
  // The predicate maps onto the driver's notify hooks; the driver owns the forced-
  // rediscovery paths (unit-tested in test/service-driver.test.ts).
  // ---------------------------------------------------------------------------
  createEffect((previous: HostState | undefined) => {
    const current = runtime.stateOf(props.hostId)
    if (previous !== undefined && previous !== current) {
      if (previous === "ready" && (current === "offline" || current === "reconnecting")) {
        driver.notifyConnectionLost()
      }
      if (shouldRefreshServiceStatus(previous, current)) {
        void driver.notifyReadyArrival(previous === "authRequired")
      }
    }
    return current
  })

  const statusKey = (): MessageKey => `svcops.status.${snapshot()?.status.kind ?? "unknown"}` as MessageKey

  const actionsAvailable = (): boolean => flow().state === "discovered" && !busy()
  const status = () => snapshot()
  const osKnown = (): boolean => discoveredOs() !== undefined && discoveredOs() !== "unknown"
  const showStop = (): boolean => status()?.status.kind === "running"
  const showReplace = (): boolean => Boolean(status()?.execDetail?.binaryPath)
  const posixOs = (): boolean => discoveredOs() === "linux" || discoveredOs() === "darwin"
  const versionLine = (): string | undefined => {
    const s = status()
    if (!s) return undefined
    if (s.status.kind === "running" || s.status.kind === "running-incompatible" || s.status.kind === "installed-stopped") {
      return s.status.version
    }
    return undefined
  }

  return (
    <Show when={injected}>
      <div class="mt-2 flex w-full min-w-0 flex-col gap-2 rounded-[12px] border border-border-weak-base p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-12-medium text-text-strong">{t("svcops.title")}</span>
          <Button size="small" variant="neutral" disabled={busy() || flow().state === "discovering"} onClick={() => void driver.discover()}>
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
            <Show when={status()?.execDetail?.binaryPath !== undefined}>
              <span class="truncate text-12-regular text-text-weak" dir="ltr">
                {t("svcops.installPath")}: {status()?.execDetail?.binaryPath}
              </span>
            </Show>
            <Show when={status()?.execDetail?.source !== undefined}>
              <span class="text-12-regular text-text-weak">
                {t("svcops.source")}: {t(`svcops.source.${status()?.execDetail?.source}` as MessageKey)}
              </span>
            </Show>
          </div>
          <For each={[...(status()?.limitations ?? [])] as string[]}>
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
            <Button size="small" variant="neutral" onClick={() => driver.openPreview("start", versionInput(), methodInput())}>
              {t("svcops.action.start")}
            </Button>
            <Button size="small" variant="neutral" onClick={() => driver.openPreview("install", versionInput(), methodInput())}>
              {t("svcops.action.install")}
            </Button>
            <Show when={posixOs()}>
              <Button size="small" variant="neutral" onClick={() => driver.openPreview("install-curl", versionInput(), methodInput())}>
                {t("svcops.action.install-curl")}
              </Button>
            </Show>
            <Button size="small" variant="neutral" onClick={() => driver.openPreview("upgrade", versionInput(), methodInput())}>
              {t("svcops.action.upgrade")}
            </Button>
            <Show when={showStop()}>
              <Button size="small" variant="danger" onClick={() => driver.openPreview("stop", versionInput(), methodInput())}>
                {t("svcops.action.stop")}
              </Button>
            </Show>
            <Show when={showReplace()}>
              <Button size="small" variant="neutral" onClick={() => driver.openPreview("replace", versionInput(), methodInput())}>
                {t("svcops.action.replace")}
              </Button>
            </Show>
            <Show
              when={
                result()?.kind === "failed" &&
                flow().state === "discovered" &&
                flow().ctx.rollbackAvailable === true &&
                preview() === undefined
              }
            >
              <Button size="small" variant="danger" onClick={() => driver.rollback()}>
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
              placeholder="npm"
              value={methodInput()}
              onInput={(e) => setMethodInput(e.currentTarget.value)}
            />
          </div>
        </Show>
        <Show when={flow().state === "executing"}>
          <div class="flex items-center justify-between gap-2">
            <p class="text-12-regular text-text-strong">{t("svcops.flow.executing")}</p>
            <Button size="small" variant="neutral" onClick={() => void driver.requestCancel()}>
              {t("svcops.preview.cancel")}
            </Button>
          </div>
        </Show>
        <Show when={result()}>
          <div class="flex min-w-0 flex-col gap-1 rounded-[8px] border border-border-weak-base p-2">
            <span class="text-12-regular text-text-strong" role={result()!.kind === "success" ? "status" : "alert"}>
              {result()!.kind === "success"
                ? t("svcops.flow.succeeded")
                : result()!.kind === "partial"
                  ? t("svcops.flow.partial")
                  : t("svcops.flow.failed")}
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
          <div
            class="flex w-full min-w-0 flex-col gap-2 rounded-[12px] border border-border-weak-base p-3"
            role="alertdialog"
            aria-label={t("svcops.preview.title")}
          >
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
                onClick={() => driver.cancelPreview()}
              >
                {t("svcops.preview.cancel")}
              </Button>
              <Button
                size="small"
                variant="danger"
                disabled={!acknowledged() || busy()}
                onClick={() => void driver.executePreview(acknowledged())}
              >
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
