import { createSignal, lazy, onMount, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useMutation } from "@tanstack/solid-query"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { Wordmark } from "@opencode/ui/wordmark"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCheckServerHealth } from "@/runtime/server/health"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { bareServerAddress, serverAddress, type Pairing } from "./pairing"
import { useRedeemPairing } from "./redeem"
import { isMixedContent } from "./browser"
import { cameraHint, createCameraAvailability } from "./camera"
import { ConnectMethodSwitch, type ConnectMethod } from "./method"
import { getMobileHosts, InitialSshSetup } from "@opencode-mobile/mobile-hosts"
import "./screen.css"

const PairingScanner = lazy(() => import("./scanner").then((module) => ({ default: module.PairingScanner })))

export function ConnectServerScreen(props: { url?: string } = {}) {
  const language = useLanguage()
  const platform = usePlatform()
  const servers = useServers()
  const check = useCheckServerHealth()
  const redeem = useRedeemPairing()
  const camera = createCameraAvailability()
  const mobileHosts = getMobileHosts()
  // The shell exposes only a non-secret build flag. A missing or malformed response
  // retains the standard password keyboard outside the Android shell.
  const [normalPasswordKeyboard, setNormalPasswordKeyboard] = createSignal(false)
  onMount(() => {
    if (location.protocol !== "http:" || location.hostname !== "127.0.0.1" || location.port !== "18090") return
    void fetch("/mobile-keyboard-config.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : undefined)
      .then((config) => setNormalPasswordKeyboard(config?.passwordKeyboard === false && CSS.supports("-webkit-text-security", "disc")))
      .catch(() => {})
  })
  const chooseMethod = (method: ConnectMethod | "ssh") => {
    setState({ method, error: "" })
  }

  const [state, setState] = createStore<{
    method: ConnectMethod | "ssh"
    link: string
    url: string
    password: string
    error: string
    scanning: boolean
  }>({
    method: "link",
    link: "",
    url: props.url ?? "",
    password: "",
    error: "",
    scanning: false,
  })

  // A pairing token works on every address of its server. Signing in again to the server that signed out keeps its
  // address (e.g. localhost) even when the link names another one (e.g. 127.0.0.1 from opencode pair).
  const target = async (pairing: Pairing) => {
    if (!props.url || props.url === pairing.url) return pairing
    const http = { url: props.url, password: pairing.password }

    return (await check(http)).healthy ? http : pairing
  }

  const connect = async (http: ServerConnection.HttpBase) => {
    const result = await check(http)

    if (!result.healthy) {
      setState("error", connectionError(http.url))

      return
    }

    // Signing in again keeps the name the user gave this server.
    const existing = servers.list.find(
      (server): server is ServerConnection.Http => server.type === "http" && server.http.url === http.url,
    )

    // mobile(M-010): the initial connection screen is also a persistent sign-in path.
    // The registry already hydrates credentialRef values from the Android vault on the
    // next launch, but without this write the first connection would lose its password
    // when the WebView process ends and the user would have to sign in again. Never put
    // the secret in WebView persistence; an unavailable vault intentionally keeps the
    // existing memory-only fallback for non-Android/web environments.
    let saved = http
    if (http.password && mobileHosts.credentials.status() === "available") {
      const credentialRef = await mobileHosts.credentials.put({
        kind: "password",
        value: http.password,
        existingRef: existing?.http.credentialRef,
      })
      saved = { ...http, credentialRef }
    }

    servers.add(existing ? { ...existing, http: saved } : { type: "http", http: saved })
    // An earlier SSH mode switch may own the initial screen. A successful authenticated
    // direct connection is also a valid initial handoff; merely switching modes is not.
    mobileHosts.releaseInitialScreen()
  }

  const connectionError = (url: string) =>
    language.t(
      platform.platform === "web" && isMixedContent(location.href, url)
        ? "server.connect.mixedContent"
        : "server.connect.failed",
    )

  const request = useMutation(() => ({
    mutationFn: async () => {
      if (state.method === "link") {
        const redeemed = await redeem(state.link)

        if (redeemed && "error" in redeemed) return void setState("error", redeemed.error)

        if (redeemed) return connect(await target(redeemed.pairing))
        // A server address typed here belongs to the password form.
        const address = bareServerAddress(state.link)

        if (address) return void setState({ method: "password", url: address, link: "", error: "" })

        return void setState("error", language.t("server.connect.link.invalid"))
      }

      // A pairing link pasted into the address field still pairs.
      const redeemed = await redeem(state.url)

      if (redeemed && "error" in redeemed) return void setState("error", redeemed.error)

      if (redeemed) return connect(await target(redeemed.pairing))
      const url = serverAddress(state.url)

      if (!url) return void setState("error", language.t("server.connect.address.invalid"))

      await connect({ url, password: state.password || undefined })
    },
    onError: () => setState("error", connectionError(state.method === "link" ? state.link : state.url)),
  }))

  const submit = () => {
    if (request.isPending) return
    setState("error", "")
    request.mutate()
  }

  return (
    <main data-component="connect-server" aria-labelledby="server-connect-title">
      <div class="server-connect-content">
        <div class="server-connect-brand" role="img" aria-label="OpenCode">
          <Wordmark />
        </div>
        <header>
          <h1 id="server-connect-title">{language.t("server.connect.title")}</h1>
          <p>
            {language.t(state.method === "link" ? "server.connect.description.pairing" : "server.connect.description")}
          </p>
        </header>
        <Show
          when={!state.scanning}
          fallback={
            <Suspense fallback={<p role="status">{language.t("server.connect.camera.starting")}</p>}>
              <PairingScanner
                redeem={redeem}
                onCancel={() => {
                  setState("scanning", false)
                  void camera.refetch()
                }}
                onScan={(link) => {
                  setState({ method: "link", link, error: "", scanning: false })
                  request.mutate()
                }}
              />
            </Suspense>
          }
        >
          <Show when={state.method !== "ssh"}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <Show
              when={state.method === "password"}
              fallback={
                <div class="server-connect-field">
                  <label for="server-connect-link">{language.t("server.connect.link")}</label>
                  <TextInput
                    id="server-connect-link"
                    name="link"
                    dir="ltr"
                    type="text"
                    inputMode="url"
                    autocapitalize="off"
                    spellcheck={false}
                    required
                    appearance="large"
                    placeholder={language.t("server.connect.link.placeholder")}
                    value={state.link}
                    disabled={request.isPending}
                    aria-describedby={state.error ? "server-connect-error" : undefined}
                    onInput={(event) => setState({ link: event.currentTarget.value, error: "" })}
                  />
                </div>
              }
            >
              <div class="server-connect-field">
                <label for="server-connect-url">{language.t("dialog.server.add.url")}</label>
                <TextInput
                  id="server-connect-url"
                  name="server"
                  dir="ltr"
                  type="text"
                  inputMode="url"
                  autocomplete="url"
                  autocapitalize="off"
                  spellcheck={false}
                  required
                  appearance="large"
                  placeholder={language.t("dialog.server.add.placeholder")}
                  value={state.url}
                  disabled={request.isPending}
                  aria-describedby={state.error ? "server-connect-error" : undefined}
                  onInput={(event) => setState({ url: event.currentTarget.value, error: "" })}
                />
              </div>
              <div class="server-connect-field">
                <label for="server-connect-password">{language.t("dialog.server.add.password")}</label>
                <TextInput
                  id="server-connect-password"
                  name="password"
                  type={normalPasswordKeyboard() ? "text" : "password"}
                  style={normalPasswordKeyboard() ? { "-webkit-text-security": "disc" } : undefined}
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck={false}
                  autocomplete={normalPasswordKeyboard() ? "off" : "current-password"}
                  appearance="large"
                  value={state.password}
                  disabled={request.isPending}
                  aria-describedby="server-connect-password-hint"
                  onInput={(event) => setState({ password: event.currentTarget.value, error: "" })}
                />
                <p id="server-connect-password-hint" class="server-connect-hint">
                  {language.t("server.connect.password.hint")}
                </p>
              </div>
            </Show>
            <Show when={state.error}>
              <p id="server-connect-error" class="server-connect-error" role="alert">
                {state.error}
              </p>
            </Show>
            <Button
              type="submit"
              variant="contrast"
              size="large"
              disabled={request.isPending || !(state.method === "link" ? state.link : state.url).trim()}
            >
              {language.t(request.isPending ? "dialog.server.add.checking" : "server.connect.button")}
            </Button>
          </form>
          </Show>
          <div hidden={state.method !== "ssh"}>
            <InitialSshSetup runtime={mobileHosts} active={() => state.method === "ssh"} />
          </div>
          <Show when={state.method === "link" && platform.platform === "web"}>
            <Show
              when={camera.available.latest || camera.available.loading}
              fallback={<p>{language.t(cameraHint())}</p>}
            >
              <Button
                variant="neutral"
                size="large"
                disabled={request.isPending || !camera.available.latest}
                onClick={() => setState("scanning", true)}
              >
                {language.t("server.connect.scan")}
              </Button>
            </Show>
          </Show>
          <Show
            when={platform.platform !== "desktop"}
            fallback={
              <ConnectMethodSwitch
                method={state.method === "ssh" ? "link" : state.method}
                disabled={request.isPending}
                onChange={(method) => setState({ method, error: "" })}
              />
            }
          >
            <div class="flex min-h-7 flex-col items-center gap-1 text-[13px]">
              <span class="text-v2-text-text-faint">
                {language.t(state.method === "link" ? "server.connect.password.prompt" : "server.connect.link.prompt")}
              </span>
              <div data-component="server-connect-method" class="flex flex-wrap items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="ghost-muted"
                  class="whitespace-nowrap"
                  disabled={request.isPending}
                  onClick={() => chooseMethod(state.method === "link" ? "password" : "link")}
                >
                  {language.t(state.method === "link" ? "server.connect.password.use" : "server.connect.link.use")}
                </Button>
                <Button type="button" variant="ghost-muted" class="whitespace-nowrap" disabled={request.isPending} onClick={() => chooseMethod("link")}>
                  {language.t("server.connect.link")}
                </Button>
                <Button type="button" variant="ghost-muted" class="whitespace-nowrap" disabled={request.isPending} onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  mobileHosts.claimInitialScreen()
                  setState({ method: "ssh", error: "", scanning: false })
                }}>{language.t("settings.tab.sshHosts")}</Button>
              </div>
            </div>
          </Show>
          <Show when={state.method === "link"}>
            <footer>
              <p>{language.t("server.connect.pair.link")}</p>
              <code dir="ltr">opencode pair</code>
            </footer>
          </Show>
        </Show>
      </div>
    </main>
  )
}
