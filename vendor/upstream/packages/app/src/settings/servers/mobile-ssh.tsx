/** Settings-only presentation adapter for first-party SSH host rows (mobile-ssh: keys).
 * The existing mobile runtime remains the sole owner. No desktop renderer, IPC, restore
 * or remote bootstrap is installed here. Row-menu Connect and Delete drive that runtime
 * directly (issue #161 semantics on the generic ServerRowMenu architecture); the
 * challenge dialog path is the only UI-local flow.
 */
import { getMobileHosts, parseHostKey, KeyedHostKeyPrompt, type MobileHosts } from "@opencode-mobile/mobile-hosts"
import { showToast } from "@/shell/notifications/toast"
import { useDialog } from "@opencode/ui/context/dialog"
import { createMemo, createResource, type Accessor } from "solid-js"
import type { BuiltinCatalog } from "@opencode/plugin/gui/builtin"
import type { SshItem } from "../../../../gui-plugins/src/ssh/contract"
import { useLanguage } from "@/runtime/i18n/language"
import { DialogSsh } from "../../../../gui-plugins/src/ssh/dialog"
import { createSshController } from "../../../../gui-plugins/src/ssh/state"
import type { SshConfig } from "../../../../gui-plugins/src/ssh/contract"
import en from "../../../../gui-plugins/src/ssh/i18n/en"
import definition from "../../../../gui-plugins/src/ssh/index"
import "../../../../gui-plugins/src/ssh/ssh.css"

export function mobileSshItems(runtime: MobileHosts): SshItem[] {
  return runtime.registry.list().map((host) => {
    const state = runtime.stateOf(host.id)
    const stage: SshItem["stage"] = state === "ready" ? "ready"
      : state === "incompatible" ? "incompatible"
      : state === "authRequired" || state === "hostKeyUnverified" ? "authentication"
      : state === "failed" ? "failed"
      : state === "connecting" || state === "reconnecting" ? "connecting"
      : "disconnected"
    const fingerprint = state === "hostKeyUnverified" ? runtime.fingerprintOf(host.id) : undefined
    return {
      config: { id: host.id, target: host.target, name: host.name }, saved: true, stage, detail: "",
      ...(fingerprint ? { prompt: { id: `host-key:${host.id}`, text: `${host.target}\n${fingerprint}`, confirm: true } } : {}),
    }
  })
}

export function useMobileSshUi() {
  const language = useLanguage()
  const dialog = useDialog()
  const [messages] = createResource(language.locale, async (locale) => {
    const catalog = definition.i18n as BuiltinCatalog
    const entry = catalog[locale]
    const messages = typeof entry === "function" ? (await entry()).default : entry ?? en
    return { locale, messages }
  })
  const translate = (key: string, params?: Record<string, string>) => {
    // Neither resource() nor .latest is safe before the first value. Keep the
    // existing UI mounted while loading, and never display a previous locale's catalog.
    const loaded = messages.state === "ready" || messages.state === "refreshing"
    const latest = loaded ? messages.latest : undefined
    const dict: Record<string, string> = latest?.locale === language.locale() ? latest.messages : en
    const text = dict[key] ?? language.t(key as Parameters<typeof language.t>[0])
    return text.replace(/{{\s*(\w+)\s*}}/g, (_, name) => params?.[name] ?? "")
  }
  const unavailable = () => showToast({ variant: "error", title: translate("error.unavailable") })
  const open = (config?: SshConfig) => dialog.push(() => {
    const runtime = getMobileHosts()
    const ssh = createSshController({
      // A ready runtime snapshot predates this UI attempt and cannot make it succeed.
      items: () => mobileSshItems(runtime).map((item) => item.stage === "ready" ? { ...item, stage: "disconnected" as const } : item),
      api: () => undefined,
      refresh: async () => {},
      error: unavailable,
    })
    return <DialogSsh ssh={ssh} translate={translate} config={config} />
  })
  return { translate, unavailable, open }
}

/** The row-menu actions of one mobile SSH host (D2: the generic ServerRowMenu gains the
 * runtime face; nothing here renders a dedicated row). */
export type MobileSshMenuActions = {
  /** True while a connect/reconnect attempt is in flight (the menu item stays disabled). */
  connecting: () => boolean
  /** The connect item's label for the host's current state. */
  label: () => string
  /** Starts the runtime action for the current state. */
  connect: () => void
  /** T14: local-only registry removal, zero transport calls; the remote host keeps running. */
  remove: () => Promise<boolean>
}

/** Row-menu actions for one mobile SSH host; undefined when the key is not one. */
export function useMobileSshMenuActions(id: Accessor<string | undefined>): MobileSshMenuActions | undefined {
  const hostId = createMemo(id)
  // Solid hooks are owner-scoped, not index-based: a non-SSH row never builds the
  // catalog resource or touches the runtime.
  if (!hostId()) return undefined
  const host = hostId()
  const runtime = getMobileHosts()
  const ui = useMobileSshUi()
  const dialog = useDialog()
  const item = createMemo(() => mobileSshItems(runtime).find((entry) => entry.config.id === host))
  const connecting = () => {
    const state = runtime.stateOf(host)

    return state === "connecting" || state === "reconnecting"
  }
  const connect = () => {
    const current = item()
    const config = current?.config

    if (!config) return
    // The host-key challenge presents the first-party prompt (T3 confirm / T4 reject via
    // runtime.confirmHostKey/rejectHostKey); the incompatible row presents the upstream
    // update dialog. Everything else drives the shared runtime directly (issue #161):
    // offline re-enters through the T10 retry path, every other state starts a fresh
    // attempt (T1 sources idle/failed/incompatible/authRequired, so a failed row is
    // actionable again).
    if (runtime.stateOf(host) === "hostKeyUnverified") {
      dialog.push(() => <KeyedHostKeyPrompt runtime={runtime} hostId={hostId} onClose={() => dialog.close()} />)
      return
    }
    if (current.stage === "incompatible") {
      void ui.open(config)
      return
    }
    if (runtime.stateOf(host) === "offline") runtime.retry(host)
    else runtime.connect(host)
  }
  const label = () => (item()?.stage === "authentication" ? ui.translate("authenticate") : ui.translate("connect"))
  const remove = async () => {
    // Delete is a local-only registry removal (T14, issue #161): zero transport calls,
    // the remote host keeps running. A bound vault credential stays as an explicit
    // orphan for the user to review in Credentials (runtime remove contract).
    const removed = await runtime.remove(host)

    if (!removed) ui.unavailable()
    return removed
  }

  return { connecting, label, connect, remove }
}

/** The settings row key of a mobile SSH host, or undefined for every other server. */
export function mobileSshHostId(key: string): string | undefined {
  return parseHostKey(key)
}
