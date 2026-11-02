/** Settings-only presentation adapter. The existing mobile runtime remains the sole owner.
 * No desktop renderer, IPC, restore, resolve or remote bootstrap is installed here.
 * This UI-parity phase intentionally fails mutations before reaching any runtime port.
 */
import { getMobileHosts, parseHostKey, type MobileHosts } from "@opencode-mobile/mobile-hosts"
import { Menu } from "@opencode/ui/menu"
import { showToast } from "@opencode/ui/toast"
import { useDialog } from "@opencode/ui/context/dialog"
import { createResource, Show } from "solid-js"
import type { BuiltinCatalog } from "@opencode/plugin/gui/builtin"
import type { ServerRow } from "@opencode/plugin/gui"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerHealthIndicator } from "@/servers/registry/row"
import type { ServerHealth } from "@/runtime/server/health"
import { DialogSsh } from "../../../../gui-plugins/src/ssh/dialog"
import SshRow from "../../../../gui-plugins/src/ssh/row"
import { createSshController } from "../../../../gui-plugins/src/ssh/state"
import type { SshConfig, SshItem } from "../../../../gui-plugins/src/ssh/contract"
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

export function MobileSshSettingsRow(props: { server: string; health: () => ServerHealth | undefined }) {
  const runtime = getMobileHosts()
  const ui = useMobileSshUi()
  const id = () => parseHostKey(props.server)!
  const item = () => mobileSshItems(runtime).find((entry) => entry.config.id === id())
  const connect = (config: SshConfig) => {
    // Only an existing challenge/incompatibility has a dialog to present. Ordinary
    // row Connect follows upstream's immediate attempt (and immediate unavailable error).
    if (item()?.prompt || item()?.stage === "incompatible") { void ui.open(config); return }
    ui.unavailable()
  }
  const row: ServerRow = {
    get key() { return props.server },
    health: props.health,
    Indicator: (indicator) => <ServerHealthIndicator health={indicator.health} connecting={indicator.connecting} authenticationRequired={indicator.auth} />,
    // Delete is intentionally not wired in this phase. Do not hide a saved host or touch credentials.
    remove: async () => { throw new Error(ui.translate("error.unavailable")) },
    Items: () => <Show when={item()?.stage !== "ready"}>
      <Menu.Item disabled={item()?.stage === "connecting"} onSelect={() => { const config = item()?.config; if (config) connect(config) }}>
        {ui.translate(item()?.stage === "authentication" ? "authenticate" : "connect")}
      </Menu.Item>
    </Show>,
  }
  return <SshRow id={id()} row={row} translate={ui.translate} onRemoveError={ui.unavailable} ssh={{
    item: () => item(),
    pending: () => item()?.stage === "connecting",
    connect,
  }} />
}
