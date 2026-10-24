import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Divider } from "@opencode/ui/divider"
import { Icon } from "@opencode/ui/icon"
import { TextInput } from "@opencode/ui/text-input"
import { useDialog } from "@opencode/ui/context/dialog"
import { useMutation } from "@tanstack/solid-query"
import {
  type Component,
  Show,
  Suspense,
  createEffect,
  createMemo,
  createSignal,
  lazy,
  onCleanup,
  onMount,
} from "solid-js"
import { createStore } from "solid-js/store"
import {
  createServerHealthPreview,
  replaceServerConnection,
  type ServerFormValues,
} from "@/servers/registry/management"
import { useGlobal } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { normalizeServerUrl, ServerConnection, useServers } from "@/runtime/server/registry"
import { useTabs } from "@/shell/tabs/tabs"
import { useCheckServerHealth } from "@/runtime/server/health"
import { usePlatform } from "@/runtime/platform/platform"
import { isMixedContent } from "./browser"
import { cameraHint, createCameraAvailability } from "./camera"
import { bareServerAddress, pairingLink, type Pairing } from "./pairing"
import { useRedeemPairing } from "./redeem"
import { ConnectMethodSwitch, type ConnectMethod } from "./method"
// mobile(M-009): the optional "remember credential" branch runs on the shell's device vault
// (bootstrapped in the entry by M-007). The truth table lives in the first-party package so
// it is unit-tested and probe-able; this dialog only translates the decision.
// mobile(M-013): the save path also consumes the shell's endpoint probe (issue #5) — the
// probe classifies a failed transport so the inline error names the actual cause, and the
// URL policy pre-check refuses userinfo credential addresses before anything is sent.
import {
  assertNoUrlCredentials,
  evaluateRemember,
  getMobileHosts,
  initialRemember,
  type DirectErrorCode,
  type ProbeResult,
} from "@opencode-mobile/mobile-hosts"
import "@/settings/settings.css"

const PairingScanner = lazy(() => import("./scanner").then((module) => ({ default: module.PairingScanner })))

type FormMode = "list" | "add" | "edit"

export const DialogServer: Component<{
  mode: "add" | "edit"
  server?: ServerConnection.Http
  onSave?: (server: ServerConnection.Http) => void
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const camera = createCameraAvailability()

  const form = createFormController({
    // Close first: onSave may open the next dialog, such as the folder picker an interrupted action continues with.
    onSelect: (server) => {
      dialog.close()
      props.onSave?.(server)
    },
  })

  const [opened, setOpened] = createSignal(false)

  onMount(() => {
    if (props.mode === "add") form.start.add()

    if (props.mode === "edit" && props.server) form.start.edit(props.server)
    setOpened(true)
  })

  onCleanup(() => {
    form.reset()
  })

  createEffect(() => {
    if (!opened()) return

    if (form.state.open()) return
    dialog.close()
  })

  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    form.submit()
  }

  const title = () =>
    props.mode === "add" ? language.t("dialog.server.add.title") : language.t("dialog.server.edit.title")

  const error = () => (
    <Show when={form.state.error()}>
      <span id="dialog-server-error" class="settings-server-dialog-error" role="alert">
        {form.state.error()}
      </span>
    </Show>
  )

  const submitLabel = () => {
    if (form.state.busy()) return language.t("dialog.server.add.checking")

    if (props.mode === "add") return language.t("dialog.server.add.button")

    return language.t("common.save")
  }

  return (
    <Dialog fit class="settings-server-dialog">
      <DialogHeader hideClose={true}>
        <DialogTitle>{title()}</DialogTitle>
      </DialogHeader>
      <Divider />
      <DialogBody class="flex w-full min-w-0 flex-1 flex-col px-4 pt-4 pb-2">
        <Show
          when={!form.state.scanning()}
          fallback={
            <Suspense fallback={<p role="status">{language.t("server.connect.camera.starting")}</p>}>
              <PairingScanner
                onCancel={() => {
                  form.scan.stop()
                  void camera.refetch()
                }}
                redeem={form.scan.redeem}
                onScan={form.scan.complete}
              />
            </Suspense>
          }
        >
          <div class="flex w-full min-w-0 flex-col gap-6">
            <Show when={form.state.signedOut()}>
              <p class="settings-server-dialog-notice" role="status">
                <Icon name="lock" size="small" />
                <span>{language.t("dialog.server.signedOut")}</span>
              </p>
            </Show>
            <Show
              when={form.state.method() === "password"}
              fallback={
                <div class="flex w-full min-w-0 flex-col gap-2">
                  <label for="dialog-server-link" class="settings-server-dialog-label">
                    {language.t("server.connect.link")}
                  </label>
                  <TextInput
                    id="dialog-server-link"
                    type="text"
                    appearance="large"
                    class="!w-full self-stretch"
                    dir="ltr"
                    spellcheck={false}
                    autocapitalize="off"
                    value={form.state.link()}
                    placeholder={language.t("server.connect.link.placeholder")}
                    invalid={!!form.state.error()}
                    disabled={form.state.busy()}
                    autofocus
                    aria-describedby={form.state.error() ? "dialog-server-error" : undefined}
                    onInput={(event) => form.change.link(event.currentTarget.value)}
                    onKeyDown={keyDown}
                  />
                  {error()}
                </div>
              }
            >
              <div class="flex w-full min-w-0 flex-col gap-2">
                <label for="dialog-server-url" class="settings-server-dialog-label">
                  {language.t("dialog.server.add.url")}
                </label>
                <TextInput
                  id="dialog-server-url"
                  type="text"
                  appearance="large"
                  class="!w-full self-stretch"
                  value={form.state.value()}
                  placeholder={language.t("dialog.server.add.placeholder")}
                  invalid={!!form.state.error()}
                  disabled={form.state.busy()}
                  autofocus
                  aria-describedby={form.state.error() ? "dialog-server-error" : undefined}
                  onInput={(event) => form.change.value(event.currentTarget.value)}
                  onKeyDown={keyDown}
                />
                {error()}
              </div>
            </Show>
            <div class="flex w-full min-w-0 flex-col gap-2">
              <label for="dialog-server-name" class="settings-server-dialog-label">
                {language.t("dialog.server.add.name")}
              </label>
              <TextInput
                id="dialog-server-name"
                type="text"
                appearance="large"
                class="!w-full self-stretch"
                value={form.state.name()}
                placeholder={language.t("dialog.server.add.namePlaceholder")}
                disabled={form.state.busy()}
                onInput={(event) => form.change.name(event.currentTarget.value)}
                onKeyDown={keyDown}
              />
            </div>
            {/* mobile(M-009): optional "remember" — rendered for the password method only
                (link flows never render it and keep their prior reference untouched). With
                the vault unavailable the checkbox renders disabled plus an explicit-state
                note; there is no plaintext fallback anywhere. */}
            <Show when={form.state.method() === "password"}>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.state.remember()}
                  disabled={!form.state.rememberAvailable() || form.state.busy()}
                  onChange={(event) => form.change.remember(event.currentTarget.checked)}
                />
                <span class="settings-server-dialog-hint">{language.t("dialog.server.remember")}</span>
              </label>
              <Show when={!form.state.rememberAvailable()}>
                <p class="settings-server-dialog-hint" role="status">
                  {language.t("dialog.server.remember.unavailable")}
                </p>
              </Show>
            </Show>
            <Show when={form.state.method() === "password"}>
              <div class="flex w-full min-w-0 flex-col gap-2">
                <label for="dialog-server-password" class="settings-server-dialog-label">
                  {language.t("dialog.server.add.password")}
                </label>
                <TextInput
                  id="dialog-server-password"
                  type="password"
                  appearance="large"
                  class="!w-full self-stretch"
                  value={form.state.password()}
                  placeholder={language.t("dialog.server.add.passwordPlaceholder")}
                  disabled={form.state.busy()}
                  aria-describedby="dialog-server-password-hint"
                  onInput={(event) => form.change.password(event.currentTarget.value)}
                  onKeyDown={keyDown}
                />
                <span id="dialog-server-password-hint" class="settings-server-dialog-hint">
                  {language.t("server.connect.password.hint")}
                </span>
              </div>
            </Show>
            <Show when={form.state.method() === "link" && platform.platform === "web"}>
              <Show
                when={camera.available.latest || camera.available.loading}
                fallback={<span class="settings-server-dialog-hint">{language.t(cameraHint())}</span>}
              >
                <Button
                  variant="neutral"
                  size="large"
                  class="!w-full self-stretch"
                  disabled={form.state.busy() || !camera.available.latest}
                  onClick={form.scan.start}
                >
                  {language.t("server.connect.scan")}
                </Button>
              </Show>
            </Show>
            <ConnectMethodSwitch
              method={form.state.method()}
              disabled={form.state.busy()}
              onChange={form.change.method}
            />
          </div>
        </Show>
      </DialogBody>
      <Show when={!form.state.scanning()}>
        <DialogFooter>
          <Button variant="neutral" disabled={form.state.busy()} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="contrast" disabled={form.state.busy()} onClick={form.submit}>
            {submitLabel()}
          </Button>
        </DialogFooter>
      </Show>
    </Dialog>
  )
}

function createFormController(options: { onSelect?: (server: ServerConnection.Http) => void } = {}) {
  const platform = usePlatform()
  const server = useServers()
  const tabs = useTabs()
  const global = useGlobal()
  const language = useLanguage()
  const checkServerHealth = useCheckServerHealth()
  const redeem = useRedeemPairing()
  const healthPreview = createServerHealthPreview(checkServerHealth)

  // mobile(M-009): the shell's credential vault. Outside the mobile shell there is no
  // bootstrap (getMobileHosts throws) and remember stays inert — the checkbox renders
  // disabled and the decision degrades to a passthrough, never to a vault write.
  const vault = (() => {
    try {
      return getMobileHosts().credentials
    } catch {
      return undefined
    }
  })()
  const vaultAvailable = () => vault !== undefined && vault.status() === "available"
  // mobile(M-013): the shell's endpoint probe port (fail-closed stub by default, the
  // bridge-backed client when the native probe handshake was acked). Outside the shell
  // there is no bootstrap, so the probe is undefined — classification then degrades to
  // the generic message, the same explicit-availability pattern as the vault above.
  const probe = (() => {
    try {
      return getMobileHosts().probe
    } catch {
      return undefined
    }
  })()

  // mobile(M-013): probe-first error classification for the save path (issue #5, decision
  // 0002 D4). The upstream health check stays THE authority: its verdict alone decides
  // whether the save proceeds, and a probe verdict can never pass a save it refused. The
  // probe (dispatched before the check so its classification is usually already resolved)
  // only chooses the error WORDING after the check failed, in a fixed precedence: the
  // upstream mixed-content structural signal first, then the check's own unauthorized
  // flag (authoritative 401), then the probe's transport classification
  // (dialog.server.error.<code>), and the generic upstream message as the EXPLICIT
  // degrade when the probe is unavailable, answered ok, or when its classification
  // conflicts with the real fetch — a classification is never fabricated. App-i18n keys
  // only (en base merged with the locale table; a missing key falls back to en, then to
  // the key itself — the first-party mobile-hosts keys are a separate set).
  type ConnectErrorKey =
    | "server.connect.mixedContent"
    | "dialog.server.add.error"
    | "dialog.server.error.credential-url"
    | `dialog.server.error.${Exclude<DirectErrorCode, "ok">}`
  const connectErrorKey = async (
    http: { url: string },
    unauthorized: boolean | undefined,
    probePromise: Promise<ProbeResult> | undefined,
  ): Promise<ConnectErrorKey> => {
    if (platform.platform === "web" && isMixedContent(location.href, http.url)) return "server.connect.mixedContent"
    if (unauthorized) return "dialog.server.error.unauthorized"
    const probeResult = await probePromise
    if (probeResult && probeResult.status === "available" && probeResult.code !== "ok") {
      return `dialog.server.error.${probeResult.code}`
    }
    return "dialog.server.add.error"
  }

  const [store, setStore] = createStore<{
    mode: FormMode
    method: ConnectMethod
    originalUrl: string | undefined
    link: string
    values: ServerFormValues
    scanning: boolean
    error: string
    status: boolean | undefined
  }>({
    mode: "list",
    method: "link",
    originalUrl: undefined,
    link: "",
    values: { url: "", name: "", password: "" },
    scanning: false,
    error: "",
    status: undefined,
  })

  // mobile(M-009): the remember checkbox is the user's explicit choice once touched; before
  // that it follows the prior's remembered flag (truth-table "initial value").
  const [rememberOverride, setRememberOverride] = createSignal<boolean | undefined>(undefined)

  // The prior carrying the ref semantics: the edited original, or — on add, regardless of
  // the connect method (password AND link/redeem) — the stored http record with the same
  // normalized URL. Only the reference field is taken from it. Without the URL lookup, the
  // M-006 `original` would be undefined on add and re-adding a remembered server would
  // orphan its credential reference.
  const priorRef = (): string | undefined => {
    if (store.mode === "edit") return editing()?.http.credentialRef
    const normalized = normalizeServerUrl(store.values.url)
    if (!normalized) return undefined
    const prior = server.list.find((item) => item.type === "http" && item.http.url === normalized)
    return prior?.type === "http" ? prior.http.credentialRef : undefined
  }

  const remember = () => rememberOverride() ?? initialRemember(priorRef())

  onCleanup(healthPreview.cancel)

  const reset = () => {
    healthPreview.cancel()
    setRememberOverride(undefined) // mobile(M-009): a fresh dialog follows the prior again
    setStore({
      mode: "list",
      method: "link",
      originalUrl: undefined,
      link: "",
      values: { url: "", name: "", password: "" },
      scanning: false,
      error: "",
      status: undefined,
    })
  }

  const allServers = () => {
    return server.list
  }

  const editing = createMemo(() =>
    allServers().find((item) => item.type === "http" && item.http.url === store.originalUrl),
  )

  const add = (connection: ServerConnection.Http) => server.add(connection)

  const replace = (originalKey: ServerConnection.Key, next: ServerConnection.Http) =>
    replaceServerConnection(originalKey, next, {
      removeTabs: (key) => tabs.removeServer(key),
      add,
      remove: (key) => server.remove(key),
    })

  // A pairing token works on every address of its server. Signing in again to the edited server keeps its address
  // (e.g. localhost) even when the link names another one (e.g. 127.0.0.1 from opencode pair).
  const paired = async (pairing: Pairing) => {
    const original = store.mode === "edit" ? editing() : undefined

    if (!original || original.http.url === pairing.url) return pairing
    const http = { url: original.http.url, password: pairing.password }

    return (await checkServerHealth(http)).healthy ? http : pairing
  }

  // Where the form points: a scanned or pasted pairing link wins, else the address and password fields.
  const target = async (): Promise<ServerConnection.HttpBase | undefined> => {
    if (store.method === "link") {
      const redeemed = await redeem(store.link)

      if (redeemed && "error" in redeemed) return void setStore("error", redeemed.error)

      if (redeemed) return paired(redeemed.pairing)
      // A server address typed here belongs to the password form.
      const address = bareServerAddress(store.link)

      if (address) {
        setStore({ method: "password", link: "", values: { ...store.values, url: address } })
        preview()

        return
      }

      return void setStore("error", language.t("server.connect.link.invalid"))
    }

    // A pairing link pasted into the address field still pairs.
    const redeemed = await redeem(store.values.url)

    if (redeemed && "error" in redeemed) return void setStore("error", redeemed.error)

    if (redeemed) return paired(redeemed.pairing)
    const url = normalizeServerUrl(store.values.url)

    if (!url) return void reset()

    return { url, password: store.values.password || undefined }
  }

  const request = useMutation(() => ({
    mutationFn: async () => {
      const http = await target()

      if (!http) return
      const normalized = http.url
      const original = store.mode === "edit" ? editing() : undefined

      if (store.mode === "edit" && !original) return
      const name = store.values.name.trim() || undefined
      const password = http.password

      // mobile(M-013): URL policy pre-check (decision 0002 D-URL). A userinfo credential
      // URL is refused with the precise message before any request is built — no probe,
      // no health check; the address itself has to be fixed first.
      try {
        assertNoUrlCredentials(normalized)
      } catch {
        setStore("error", language.t("dialog.server.error.credential-url"))

        return
      }

      // mobile(M-009): resolve the remember decision BEFORE the early exit. The prior
      // carries the ref semantics for both the edit and the add flow (URL lookup, not
      // method-gated). The checkbox only participates when rendered AND the vault is
      // available; otherwise the decision is a passthrough and no vault op can happen.
      const decision = evaluateRemember({
        mode: store.mode === "edit" ? "edit" : "add",
        checkboxRendered: store.method === "password" && vaultAvailable(),
        remember: remember(),
        valueEmpty: !password,
        priorRef: priorRef(),
      })

      // Truth-table rows 2/12: remembering an EMPTY credential stops the save with an inline
      // message — no put, no empty value ever cast, the dialog stays open.
      if (decision.action === "abort") {
        setStore("error", language.t("dialog.server.remember.needsPassword"))

        return
      }

      // Nothing changed: close, unless the server rejects these credentials, so saving checks them and the action that
      // asked for sign-in can continue. mobile(M-009): the exit is FORCED OFF when a rendered
      // checkbox state differs from the prior's remembered flag — toggling remember (on or
      // off) is a change even when url/name/password are identical.
      if (
        !decision.forcesSave &&
        original?.type === "http" &&
        !global.servers.health[ServerConnection.key(original)]?.unauthorized &&
        normalized === original.http.url &&
        name === original.displayName &&
        password === original.http.password
      ) {
        reset()

        return
      }

      const connection: ServerConnection.Http = {
        type: "http",
        displayName: name,
        http: {
          url: normalized,
          password,
          // mobile(M-006)+(M-009): the reference comes from the remember decision — the
          // passthrough keeps the prior's ref (edit original, or the URL-matched prior on
          // add); put/clear resolve after the health check below. The early-exit comparison
          // above deliberately does not consult it.
          credentialRef: decision.action === "passthrough" ? decision.ref : undefined,
        },
      }

      // mobile(M-013): the probe is dispatched FIRST (before the authoritative health
      // check) so its classification is usually already resolved when the verdict
      // arrives. The password crosses the probe bridge once, lives for the duration of
      // the request, and is never logged or persisted (decision 0002 F1).
      const probePromise = probe?.probe({ url: normalized, password: password ?? undefined })

      const result = await checkServerHealth(connection.http)

      if (!result.healthy) {
        setStore("error", language.t(await connectErrorKey(connection.http, result.unauthorized, probePromise)))

        return
      }

      // mobile(M-009): cast/clear the vault entry only after the health check passed. A
      // failed put or remove keeps the dialog open with an inline error — never silently
      // close with a half-applied binding. The entered password still authorizes THIS save.
      if (decision.action === "put") {
        try {
          connection.http.credentialRef = await vault!.put({
            kind: "password",
            value: password!,
            ...(decision.existingRef !== undefined ? { existingRef: decision.existingRef } : {}),
          })
        } catch {
          setStore("error", language.t("dialog.server.remember.saveFailed"))

          return
        }
      } else if (decision.action === "clear") {
        try {
          await vault!.remove(decision.ref)
        } catch {
          setStore("error", language.t("dialog.server.remember.saveFailed"))

          return
        }
      }

      if (original?.type === "http") {
        if (normalized === original.http.url) add(connection)

        if (normalized !== original.http.url) replace(ServerConnection.key(original), connection)
        reset()
        options.onSelect?.(connection)

        return
      }

      reset()
      add(connection)
      options.onSelect?.(connection)
    },
  }))

  const preview = () => {
    // A pairing link is not a server address until it is redeemed, and redeeming spends it.
    if (store.method === "link" || pairingLink(store.values.url)) {
      healthPreview.cancel()
      setStore("status", undefined)

      return
    }

    void healthPreview.preview(store.values, (status) => setStore("status", status))
  }

  const change = (field: keyof ServerFormValues, value: string) => {
    if (request.isPending) return
    setStore("values", field, value)
    setStore("error", "")

    if (field !== "name") preview()
  }

  const startAdd = () => {
    reset()
    setStore("mode", "add")
  }

  const startEdit = (connection: ServerConnection.Http) => {
    reset()
    setStore({
      mode: "edit",
      // A signed-out server needs a new pairing link; otherwise editing starts from its address.
      method: global.servers.health[ServerConnection.key(connection)]?.unauthorized ? "link" : "password",
      originalUrl: connection.http.url,
      values: {
        url: connection.http.url,
        name: connection.displayName ?? "",
        password: connection.http.password ?? "",
      },
      error: "",
      status: global.servers.health[ServerConnection.key(connection)]?.healthy,
    })
  }

  const submit = () => {
    if (store.mode === "list" || request.isPending) return
    setStore("error", "")
    request.mutate()
  }

  const pair = (link: string) => {
    healthPreview.cancel()
    setStore({ method: "link", link, scanning: false, error: "" })
    request.mutate()
  }

  createEffect(() => {
    if (store.mode !== "edit") return

    if (editing()) return
    reset()
  })

  return {
    state: {
      mode: () => store.mode,
      open: () => store.mode !== "list",
      adding: () => store.mode === "add",
      busy: () => request.isPending,
      method: () => store.method,
      link: () => store.link,
      value: () => store.values.url,
      name: () => store.values.name,
      password: () => store.values.password,
      remember,
      rememberAvailable: vaultAvailable,
      scanning: () => store.scanning,
      error: () => store.error,
      status: () => store.status,
      signedOut: () => {
        const original = editing()

        return !!original && !!global.servers.health[ServerConnection.key(original)]?.unauthorized
      },
    },
    change: {
      method: (method: ConnectMethod) => {
        if (request.isPending) return
        setStore({ method, error: "" })
        preview()
      },
      link: (value: string) => {
        if (request.isPending) return
        setStore({ link: value, error: "" })
      },
      value: (value: string) => change("url", value),
      name: (value: string) => change("name", value),
      password: (value: string) => change("password", value),
      remember: (value: boolean) => {
        if (request.isPending) return
        setRememberOverride(value)
      },
    },
    scan: {
      start: () => setStore("scanning", true),
      stop: () => setStore("scanning", false),
      complete: pair,
      redeem,
    },
    start: { add: startAdd, edit: startEdit },
    reset,
    submit,
  }
}
