import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { type Component, Show } from "solid-js"
import type { ServerActionsController } from "@/servers/registry/controller"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
// mobile(S36): a first-party SSH host row drives the shared mobile runtime from this
// generic row menu; the adapter lives in the settings servers domain (issue #161
// semantics: T1 connect / T10 retry / T14 local-only delete, challenge dialogs).
import { parseHostKey } from "@opencode-mobile/mobile-hosts"
import { useMobileSshMenuActions, type MobileSshMenuActions } from "@/settings/servers/mobile-ssh"

export const ServerRowMenu: Component<{
  server: ServerConnection.Any
  domain: ServerActionsController
  onEdit: (server: ServerConnection.Http) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}> = (props) => {
  const language = useLanguage()
  const key = ServerConnection.key(props.server)
  const sshId = parseHostKey(key)
  // Unconditional call: the adapter returns undefined (and builds nothing — no catalog
  // resource, no runtime access) for every non-mobile-SSH key.
  const ssh = useMobileSshMenuActions(() => sshId)

  return (
    <ServerRowMenuView
      server={props.server}
      labels={serverMenuLabels(language)}
      canRemove={ssh ? true : props.domain.connection.canRemove(key)}
      canHide={ssh ? undefined : props.domain.connection.canHide(key)}
      hidden={ssh ? undefined : props.domain.connection.isHidden(key)}
      onEdit={props.onEdit}
      onRemove={() => (ssh ? void ssh.remove() : props.domain.connection.remove(key))}
      onHide={() => props.domain.connection.setHidden(key, true)}
      onShow={() => props.domain.connection.setHidden(key, false)}
      open={props.open}
      onOpenChange={props.onOpenChange}
      mobileSsh={ssh}
    />
  )
}

export function serverMenuLabels(language: ReturnType<typeof useLanguage>) {
  return {
    more: language.t("common.moreOptions"),
    server: language.t("settings.section.server"),
    edit: language.t("dialog.server.menu.edit"),
    remove: language.t("dialog.server.menu.remove"),
    hide: language.t("dialog.server.menu.hide"),
    show: language.t("dialog.server.menu.show"),
  }
}

export const ServerRowMenuView: Component<{
  server: ServerConnection.Any
  labels: ReturnType<typeof serverMenuLabels>
  canRemove: boolean
  canHide?: boolean
  hidden?: boolean
  onEdit: (server: ServerConnection.Http) => void
  onRemove: () => void
  onHide?: () => void
  onShow?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Present for a first-party mobile SSH row: connect/retry replaces the edit/hide face. */
  mobileSsh?: MobileSshMenuActions
}> = (props) => {
  const builtin = () => ServerConnection.builtin(props.server)
  const httpServer = () => (props.server.type === "http" ? props.server : undefined)

  return (
    <Menu gutter={6} modal={false} placement="bottom-end" open={props.open} onOpenChange={props.onOpenChange}>
      <Menu.Trigger
        as={IconButton}
        variant="ghost-muted"
        size="small"
        icon={<Icon name="outline-dots" />}
        aria-label={props.labels.more}
      />
      <Menu.Portal>
        <Menu.Content>
          <Menu.Group>
            <Menu.GroupLabel>{props.labels.server}</Menu.GroupLabel>
            <Show
              when={props.mobileSsh}
              fallback={
                <>
                  <Menu.Item
                    disabled={builtin() || !httpServer()}
                    onSelect={() => {
                      const server = httpServer()

                      if (server) props.onEdit(server)
                    }}
                  >
                    {props.labels.edit}
                  </Menu.Item>
                  <Show when={props.hidden}>
                    <Menu.Item onSelect={props.onShow}>{props.labels.show}</Menu.Item>
                  </Show>
                  <Show when={!props.hidden && props.canHide}>
                    <Menu.Item onSelect={props.onHide}>{props.labels.hide}</Menu.Item>
                  </Show>
                </>
              }
            >
              {(ssh) => (
                <Menu.Item disabled={ssh().connecting()} onSelect={() => ssh().connect()}>
                  {ssh().label()}
                </Menu.Item>
              )}
            </Show>
            <Show when={props.canRemove}>
              <Menu.Separator />
              <Menu.Item onSelect={props.onRemove}>{props.labels.remove}</Menu.Item>
            </Show>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
