import { createMemo, lazy, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { extensionEnabled } from "@opencode/gui-extensions/sdk/bridge"
import type { Definition } from "@opencode/gui-extensions/sdk"
// mobile(M-025): the first-party mobile disable records feed the disabled union below.
import { createExtensionDisabled } from "@opencode-mobile/mobile-hosts"
import { builtins } from "./builtins"
import { createInstalled } from "./installed"
import { createMenubarItems, MenubarItemsProvider } from "./menubar-items"
import { usePlatform } from "@/runtime/platform/platform"
import { ExtensionHostProvider, useExtensionHost } from "./host"
import { createIpcClients } from "./ipc"
import { createExtensionAttachment, createHostApis, ExtensionAttachmentProvider, type HostApis } from "./host-apis"
import { ExtensionCommands } from "./commands"
import { ExtensionStyles } from "./render"
import { ExtensionServersProvider } from "./servers"
import { ExtensionServerEndpoints } from "./server-shell"
import { createContext, useContext } from "solid-js"

const HostApisContext = createContext<HostApis>()

const ExtensionHotReload = import.meta.env.DEV ? lazy(() => import("./hmr")) : undefined

export function useHostApis() {
  const value = useContext(HostApisContext)

  if (!value) throw new Error("Host APIs are unavailable")

  return value
}

/** Mounts the extension host for the window. Lives above the app interface so extensions can contribute servers. */
export function ExtensionRoot(props: ParentProps) {
  const platform = usePlatform()
  const apis = createHostApis()
  const bridge = platform.extensions
  const menubar = createMenubarItems(bridge)
  const ipcs = createIpcClients(bridge)
  onCleanup(ipcs.dispose)
  const installed = createInstalled(bridge)
  // mobile(M-025): one shell-wide record instance; the settings manager UI reads the same.
  // WebView localStorage is the persistence candidate (M-007 shape); safeStorage degrades
  // to memory and reports volatile when persistence is unavailable.
  const mobileDisabled = createExtensionDisabled(window.localStorage)

  const os = platform.platform === "desktop" ? platform.os : undefined

  // Built-ins only: installed `.ocdx` archives run their main entry until that format ships renderer bundles.
  const definitions = builtins.filter(
    (definition: Definition) => !definition.os || (!!os && definition.os.includes(os)),
  )

  // Only enable preferences cross this boundary; the host derives blocked status from live hard dependencies.
  const disabled = createMemo(() => {
    const state = installed.enableState()

    if (!state) return undefined

    // mobile(M-025): union the desktop enable rows with the device-local mobile records,
    // filtered to the current definitions so ids unknown after a rename self-heal away.
    // Desktop builds never render the mobile face and carry no such records — the union is
    // empty there and behavior is unchanged (M-018 spillover precedent).
    const ids = new Set(definitions.map((definition) => definition.id))
    const merged = new Set(definitions.flatMap((definition) => (extensionEnabled(definition, state) ? [] : [definition.id])))
    for (const id of mobileDisabled.ids()) if (ids.has(id)) merged.add(id)
    return merged
  })

  const failed = (id: string) => installed.list().some((item) => item.id === id && item.error !== undefined)

  return (
    <HostApisContext.Provider value={apis}>
      <ExtensionHostProvider
        definitions={definitions}
        disabled={disabled}
        apis={apis.apis}
        whenMounted={apis.whenMounted}
        ipc={bridge ? (token) => ipcs.client(token) : undefined}
        generation={ipcs.generation}
        failed={failed}
      >
        <ExtensionStyles />
        {ExtensionHotReload && (
          <Suspense>
            <ExtensionHotReload />
          </Suspense>
        )}
        <MenubarItemsProvider value={menubar}>
          <ExtensionServersProvider failed={failed}>{props.children}</ExtensionServersProvider>
        </MenubarItemsProvider>
      </ExtensionHostProvider>
    </HostApisContext.Provider>
  )
}

/** Attaches the session and layout HostApis and publishes extension commands. Renders once extensions are active. */
export function ExtensionAttachment(props: ParentProps) {
  const host = useExtensionHost()
  const attachment = createExtensionAttachment(useHostApis())

  return (
    <ExtensionAttachmentProvider value={attachment}>
      <ExtensionCommands />
      <ExtensionServerEndpoints />
      <Show when={host.ready()}>
        <MountedInterface attach={attachment.attach} />
        {props.children}
      </Show>
    </ExtensionAttachmentProvider>
  )
}

/**
 * The app interface as the HostApis see it, mounted as the routes first render and not before: writes and dialogs made
 * while extensions set up wait until then.
 */
function MountedInterface(props: { attach: () => () => void }) {
  onCleanup(props.attach())

  return null
}
