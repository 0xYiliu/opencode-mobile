import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { For, onCleanup, Show } from "solid-js"
import { useServerAddItems } from "@/runtime/plugin/servers"
import { useLanguage } from "@/runtime/i18n/language"
import { isAndroidMobileHost } from "@/settings/servers/android-host"
import { useMobileSshUi } from "@/settings/servers/mobile-ssh"

/** The settings header's add control: on the Android shell it becomes the N12 menu
 * (Add server / Add SSH server / disabled WSL); elsewhere it is the upstream menu. */
export function SettingsAddServerMenu(props: { onAddServer: () => void; checkAndroid?: boolean }) {
  return <AddServerMenu onAddServer={props.onAddServer} unsupportedWsl={!!props.checkAndroid && isAndroidMobileHost()} />
}

/** The add-server button; plugins that add their own kinds of server turn it into a menu. */
export function AddServerMenu(props: { onAddServer: () => void; compact?: boolean; unsupportedWsl?: boolean }) {
  const language = useLanguage()
  const ssh = useMobileSshUi()
  const items = useServerAddItems(() => (props.unsupportedWsl ? "wsl" : undefined))
  let pendingAdd: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(pendingAdd))

  return (
    <Show
      when={props.unsupportedWsl || items().length > 0}
      fallback={
        <Show
          when={props.compact}
          fallback={
            <Button variant="ghost-muted" icon="plus" onClick={props.onAddServer}>
              {language.t("dialog.server.add.button")}
            </Button>
          }
        >
          <IconButton
            variant="ghost-muted"
            size="small"
            icon={<Icon name="plus" />}
            aria-label={language.t("dialog.server.add.button")}
            onClick={props.onAddServer}
          />
        </Show>
      }
    >
      <Menu gutter={4} modal={false} placement="bottom-end">
        <Show
          when={props.compact}
          fallback={
            <Menu.Trigger as={Button} variant="ghost-muted" icon="plus">
              {language.t("dialog.server.add.button")}
            </Menu.Trigger>
          }
        >
          <Menu.Trigger
            as={IconButton}
            variant="ghost-muted"
            size="small"
            icon={<Icon name="plus" />}
            aria-label={language.t("dialog.server.add.button")}
          />
        </Show>
        <Menu.Portal>
          <Menu.Content>
            <Menu.Item onSelect={() => {
              // Android WebView 114 can deliver a compatibility click after touch selection.
              // Opening immediately lets that trailing click dismiss the new dialog's backdrop.
              // Wait past the 300ms compatibility-click window; cleanup cancels a stale open.
              if (props.unsupportedWsl) {
                clearTimeout(pendingAdd)
                pendingAdd = setTimeout(props.onAddServer, 350)
                return
              }
              props.onAddServer()
            }}>{language.t("dialog.server.add.button")}</Menu.Item>
            <For each={items()}>{(item) => <Menu.Item onSelect={() => item.run()}>{item.title}</Menu.Item>}</For>
            <Show when={props.unsupportedWsl}>
              <Menu.Item onSelect={() => {
                clearTimeout(pendingAdd)
                pendingAdd = setTimeout(() => void ssh.open(), 350)
              }}>{ssh.translate("add")}</Menu.Item>
              <Menu.Item disabled>
                {language.t("dialog.server.add.wsl")}
              </Menu.Item>
            </Show>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </Show>
  )
}
