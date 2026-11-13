import { type Accessor, createEffect, createMemo, createSignal, on, onCleanup, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCheckServerHealth } from "@/runtime/server/health"
import { normalizeServerUrl, ServerConnection, useServers } from "@/runtime/server/registry"
import { replaceServerConnection } from "@/servers/registry/management"
import {
  assertNoUrlCredentials,
  evaluateRemember,
  getMobileHosts,
  initialRemember,
  type ProbeResult,
} from "@opencode-mobile/mobile-hosts"
import {
  selectServerConnectView,
  startServerConnect,
  transitionServerConnect,
  type ServerCameraSupport,
  type ServerConnectEffect,
  type ServerConnectEvent,
  type ServerConnectState,
  type ServerConnectTarget,
  type ServerOriginal,
} from "./machine"
import { useRedeemPairing } from "./redeem"
import { isMixedContent } from "./browser"

export type ServerConnectControllerOptions =
  | { readonly surface: "screen"; readonly target: Extract<ServerConnectTarget, { kind: "connect" }> }
  | {
      readonly surface: "dialog"
      readonly target: Exclude<ServerConnectTarget, { kind: "connect" }>
      /** The edited server as the registry lists it now; undefined once it is removed. */
      readonly original?: Accessor<ServerOriginal | undefined>
      readonly removeTabs: (key: ServerConnection.Key) => void
      /** Closes the dialog. `saved` is the server a successful save stored. */
      readonly onClose: (saved: ServerConnection.Http | undefined) => void
      /** True once the dialog starts closing, so a check that finishes during its exit animation saves nothing. */
      readonly closing?: Accessor<boolean>
    }

export function createServerConnectController(options: ServerConnectControllerOptions) {
  const language = useLanguage()
  const platform = usePlatform()
  const servers = useServers()
  const check = useCheckServerHealth()
  // Shared with the scanner, so a retry after a failed check reuses the token of a spent one-time code.
  const redeem = useRedeemPairing()
  const initial = startServerConnect(options.target, cameraSupport(platform.platform))
  const [machine, setMachine] = createSignal(initial.state)
  let timer: ReturnType<typeof setTimeout> | undefined
  let cameraTimer: ReturnType<typeof setTimeout> | undefined
  let rememberOverride: boolean | undefined

  // Mobile capabilities are optional at this shared boundary. A non-Android/web build has no
  // host bootstrap and therefore stays fail-closed: no vault or probe operation is attempted.
  const mobileHosts = (() => {
    try {
      return getMobileHosts()
    } catch {
      return undefined
    }
  })()
  const vault = mobileHosts?.credentials
  const probe = mobileHosts?.probe
  const vaultAvailable = () => vault?.status() === "available"

  const priorRef = (state: ServerConnectState, resolvedUrl?: string) => {
    if (state.target.kind === "edit") return state.target.original.credentialRef

    const normalized = normalizeServerUrl(resolvedUrl ?? state.draft.url)
    if (!normalized) return undefined

    const prior = servers.list.find(
      (server): server is ServerConnection.Http => server.type === "http" && server.http.url === normalized,
    )

    return prior?.http.credentialRef
  }

  const effectiveRemember = (state: ServerConnectState, resolvedUrl?: string) =>
    rememberOverride !== undefined ? rememberOverride : state.draft.remember || initialRemember(priorRef(state, resolvedUrl))

  const rememberDecision = (state: ServerConnectState, http: ServerConnection.HttpBase) =>
    evaluateRemember({
      mode: state.target.kind === "edit" ? "edit" : "add",
      checkboxRendered: state.draft.method === "password" && vaultAvailable(),
      remember: effectiveRemember(state, http.url),
      valueEmpty: !http.password,
      priorRef: priorRef(state, http.url),
    })

  const withoutCredentialRef = (http: ServerConnection.HttpBase): ServerConnection.HttpBase => {
    const { credentialRef: _credentialRef, ...rest } = http

    return rest
  }

  const prepareHttp = async (state: ServerConnectState, http: ServerConnection.HttpBase) => {
    // The first connect screen is also the initial sign-in surface. When the Android
    // vault is ready, persist only a vault reference so the next process can restore the
    // password; an unavailable vault intentionally keeps the memory-only behavior.
    if (options.surface === "screen" && http.password && vaultAvailable()) {
      const credentialRef = await vault!.put({
        kind: "password",
        value: http.password,
        ...(priorRef(state, http.url) !== undefined ? { existingRef: priorRef(state, http.url) } : {}),
      })

      return { ...http, credentialRef }
    }

    const decision = rememberDecision(state, http)

    if (decision.action === "abort") throw new Error(language.t("dialog.server.remember.needsPassword"))

    if (decision.action === "put") {
      if (!vault) throw new Error(language.t("dialog.server.remember.saveFailed"))
      const credentialRef = await vault.put({
        kind: "password",
        value: http.password!,
        ...(decision.existingRef !== undefined ? { existingRef: decision.existingRef } : {}),
      })

      return { ...http, credentialRef }
    }

    if (decision.action === "clear") {
      if (!vault) throw new Error(language.t("dialog.server.remember.saveFailed"))
      await vault.remove(decision.ref)

      return withoutCredentialRef(http)
    }

    if (decision.action === "passthrough" && decision.ref) return { ...http, credentialRef: decision.ref }

    return withoutCredentialRef(http)
  }

  const connectError = async (url: string, result: { readonly type: string }, probePromise?: Promise<ProbeResult>) => {
    if (platform.platform === "web" && isMixedContent(location.href, url)) return language.t("server.connect.mixedContent")
    if (result.type === "unauthorized") return language.t("dialog.server.error.unauthorized")

    const probed = await probePromise?.catch(() => undefined)
    if (probed?.status === "available" && probed.code !== "ok") {
      return language.t(`dialog.server.error.${probed.code}` as never)
    }

    return language.t(options.surface === "screen" ? "server.connect.failed" : "dialog.server.add.error")
  }

  const commit = (event: ServerConnectEvent) => {
    const prev = untrack(machine)
    const next = transitionServerConnect(prev, event)

    if (next.state !== prev) setMachine(next.state)
    next.effects.forEach(run)
  }

  const dispatch = (event: ServerConnectEvent) => {
    const prev = untrack(machine)

    if (event.type === "remember.changed") rememberOverride = event.remember

    if (event.type === "submitted" && prev.status === "editing") {
      if (prev.draft.method === "password") {
        try {
          assertNoUrlCredentials(prev.draft.url)
        } catch {
          commit({
            type: "validation.failed",
            error: { type: "connection-failed", url: prev.draft.url, message: language.t("dialog.server.error.credential-url") },
          })
          return
        }

        if (rememberDecision(prev, { url: prev.draft.url, password: prev.draft.password || undefined }).action === "abort") {
          commit({
            type: "validation.failed",
            error: { type: "connection-failed", url: prev.draft.url, message: language.t("dialog.server.remember.needsPassword") },
          })
          return
        }
      }
    }

    if (event.type === "submit.succeeded" && prev.status === "submitting" && prev.attempt === event.attempt) {
      void prepareHttp(prev, event.http).then(
        (http) => commit({ ...event, http }),
        (error: unknown) =>
          commit({
            type: "submit.failed",
            attempt: event.attempt,
            error: {
              type: "connection-failed",
              url: event.http.url,
              message: error instanceof Error ? error.message : language.t("dialog.server.remember.saveFailed"),
            },
          }),
      )
      return
    }

    commit(event)
  }

  const run = (effect: ServerConnectEffect) => {
    if (effect.type === "timer.start") {
      clearTimeout(timer)
      timer = setTimeout(() => dispatch({ type: "submit.timed-out", attempt: effect.attempt }), effect.timeoutMs)

      return
    }

    if (effect.type === "timer.stop") {
      clearTimeout(timer)
      timer = undefined

      return
    }

    if (effect.type === "camera.probe") {
      clearTimeout(cameraTimer)
      cameraTimer = setTimeout(() => dispatch({ type: "camera.timed-out", attempt: effect.attempt }), effect.timeoutMs)
      void Promise.try(probeCamera).then(
        (available) => dispatch({ type: "camera.settled", attempt: effect.attempt, available }),
        () => dispatch({ type: "camera.settled", attempt: effect.attempt, available: false }),
      )

      return
    }

    if (effect.type === "camera.timer.stop") {
      clearTimeout(cameraTimer)
      cameraTimer = undefined

      return
    }

    if (effect.type === "connect.http") {
      const probePromise = probe
        ? Promise.try(() => probe.probe({ url: effect.http.url, password: effect.http.password }))
        : undefined
      const failed = (result: { readonly type: string } = { type: "unreachable" }) =>
        void connectError(effect.http.url, result, probePromise).then((message) =>
          dispatch({
            type: "submit.failed",
            attempt: effect.attempt,
            error: { type: "connection-failed", url: effect.http.url, message },
          }),
        )

      void Promise.try(() => check(effect.http)).then(
        (result) =>
          result.type === "healthy"
            ? dispatch({ type: "submit.succeeded", attempt: effect.attempt, http: effect.http })
            : failed(result),
        () => failed(),
      )

      return
    }

    if (effect.type === "connect.link") {
      void Promise.try(() => pair(effect)).then(dispatch, () =>
        dispatch({
          type: "submit.failed",
          attempt: effect.attempt,
          error: { type: "connection-failed", url: effect.fallbackUrl },
        }),
      )

      return
    }

    if (effect.type === "save") {
      const action = effect.action

      if (action.type === "connect") {
        // Signing in again keeps the name the user gave this server.
        const existing = servers.list.find(
          (server): server is ServerConnection.Http => server.type === "http" && server.http.url === action.http.url,
        )

        servers.add(existing ? { ...existing, http: action.http } : { type: "http", http: action.http })
        if (options.surface === "screen") mobileHosts?.releaseInitialScreen()

        return
      }

      if (action.type === "add" || options.surface !== "dialog") return void servers.add(action.connection)
      replaceServerConnection(ServerConnection.Key.make(action.originalUrl), action.connection, {
        removeTabs: options.removeTabs,
        add: (server) => servers.add(server),
        remove: (key) => servers.remove(key),
      })

      return
    }

    if (options.surface === "dialog") options.onClose(effect.saved)
  }

  const pair = async (effect: Extract<ServerConnectEffect, { type: "connect.link" }>): Promise<ServerConnectEvent> => {
    const redeemed = await redeem(effect.link)

    if (!redeemed) return { type: "submit.failed", attempt: effect.attempt, error: { type: "link-invalid" } }

    if ("error" in redeemed)
      return { type: "submit.failed", attempt: effect.attempt, error: { type: "redeem", message: redeemed.error } }
    const password = redeemed.pairing.password

    if (effect.preferredUrl && effect.preferredUrl !== redeemed.pairing.url) {
      const http = { url: effect.preferredUrl, password }

      if ((await check(http)).type === "healthy") return { type: "submit.succeeded", attempt: effect.attempt, http }
    }

    const http = { url: redeemed.pairing.url, password }

    if ((await check(http)).type === "healthy") return { type: "submit.succeeded", attempt: effect.attempt, http }

    return { type: "submit.failed", attempt: effect.attempt, error: { type: "connection-failed", url: http.url } }
  }

  // Runs once the dialog is in the stack, so a server removed before then closes this dialog, not the one below.
  if (options.surface === "dialog" && options.original)
    createEffect(on(options.original, (original) => dispatch({ type: "original.synced", original })))

  if (options.surface === "dialog" && options.closing) {
    const closing = options.closing
    createEffect(() => {
      if (closing()) dispatch({ type: "disposed" })
    })
  }

  onCleanup(() => dispatch({ type: "disposed" }))
  initial.effects.forEach(run)

  const view = createMemo(() => {
    const state = machine()
    const selected = selectServerConnectView(state, {
      surface: options.surface,
      pageHref: platform.platform === "web" ? location.href : undefined,
      t: (key) => language.t(key),
    })

    return {
      ...selected,
      rememberAvailable: vaultAvailable(),
      draft: { ...selected.draft, remember: effectiveRemember(state) },
    }
  })

  return { view, dispatch, redeem }
}

function cameraSupport(platform: string): ServerCameraSupport {
  if (platform !== "web") return "none"

  if (!window.isSecureContext) return "insecure"

  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices.enumerateDevices) return "unavailable"

  return "probe"
}

async function probeCamera() {
  const denied = await navigator.permissions?.query({ name: "camera" }).then(
    (permission) => permission.state === "denied",
    () => false,
  )

  if (denied) return false

  const devices = await navigator.mediaDevices.enumerateDevices()

  return devices.some((device) => device.kind === "videoinput")
}
