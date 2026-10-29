// @refresh reload

import "@/runtime/polyfills"
import { init } from "@sentry/solid"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { loadInitialLocale } from "@/runtime/i18n/language"
import { PlatformProvider } from "@/runtime/platform/platform"
import { createWebPlatform } from "@/runtime/platform/web"
import { isStandalone, PwaRoutePersistence, restorePwaRoute } from "@/runtime/platform/pwa"
import { KeyboardInsets } from "@/runtime/platform/keyboard"
import en from "@/runtime/i18n/en"
import zh from "@/runtime/i18n/zh"
import pkg from "../package.json"
import {
  createFilesClient,
  createMobileHosts,
  createNotificationsClient,
  createProbeClient,
  createServiceOpsClient,
  createSshHostKeyVerifier,
  createSshHostTransport,
  SSH_BOOTSTRAP_MESSAGE,
  createVaultClient,
  createVaultResolver,
  createAndroidXVaultTransport,
  createWebMessageFilesTransport,
  createWebMessageNotificationsTransport,
  createWebMessageProbeTransport,
  createWebMessageServiceOpsTransport,
  createWebMessageSshTransport,
  setActiveFilesPort,
  setActiveNotificationsPort,
  setActiveServiceOpsPort,
} from "@opencode-mobile/mobile-hosts"

const getLocale = () => {
  if (typeof navigator === "undefined") return "en" as const
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]

  for (const language of languages) {
    if (!language) continue

    if (language.toLowerCase().startsWith("zh")) return "zh" as const
  }

  return "en" as const
}

const getRootNotFoundError = () => {
  const key = "error.dev.rootNotFound" as const
  const locale = getLocale()

  return locale === "zh" ? (zh[key] ?? en[key]) : en[key]
}

const root = document.getElementById("root")

if (!(root instanceof HTMLElement) && import.meta.env.DEV) {
  throw new Error(getRootNotFoundError())
}

// mobile(M-007): the ?auth_token URL passthrough and its cleanup helper are removed with the
// location.origin server assembly — this shell never assembles a server from the URL, so
// there is nothing to authenticate here.

const web = createWebPlatform(pkg.version)

// Create the SSH message listener synchronously during module evaluation. Native currently
// starts its bounded port handshake from onPageFinished; waiting for loadInitialLocale() here
// can miss that window on a slow device and leave every later connect unavailable.
const ssh = createWebMessageSshTransport({
  subscribe: (handler) => {
    window.addEventListener("message", handler as EventListener)
    return () => window.removeEventListener("message", handler as EventListener)
  },
  requestNativeHandshake: () => {
    const bootstrap = (window as any).opencodeMobileSshBootstrapV2
    if (bootstrap && typeof bootstrap.postMessage === "function") bootstrap.postMessage(SSH_BOOTSTRAP_MESSAGE)
  },
})

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"), { once: true })
}

if (import.meta.env.VITE_SENTRY_DSN) {
  init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `web@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "web",
      },
    },
    integrations: (integrations) => {
      return integrations.filter(
        (i) =>
          i.name !== "Breadcrumbs" && !(import.meta.env.OPENCODE_CHANNEL === "prod" && i.name === "GlobalHandlers"),
      )
    },
  })
}

if (root instanceof HTMLElement && root.dataset.opencodeMounted === undefined) {
  // Lazy chunks can import the entry chunk back under a distinct URL, so claim the root before async startup.
  root.dataset.opencodeMounted = ""
  void loadInitialLocale().then((locale) => {
    const standalone = isStandalone()
    root.dataset.standalone = String(standalone)

    if (standalone) restorePwaRoute()

    // mobile(M-007): the shell asset origin (http://127.0.0.1:18090) is not an OpenCode
    // server — the previous assembly of `location.origin` into a ServerConnection could only
    // fail its health check, so it is removed. SSH hosts come from the first-party registry
    // as managed extension connections (stable mobile-ssh:<uuid> identity); direct servers
    // are added through the app's own dialog into the upstream persisted list. The
    // ?auth_token passthrough is inapplicable in this shell (no assembled server to
    // authenticate), so its handling is removed with this patch.
    //
    // mobile vault protocol v2 uses the native origin-bound AndroidX listener. It remains
    // unavailable until its non-mutating readiness roundtrip completes.
    const vault = createVaultClient(
      createAndroidXVaultTransport((window as any).opencodeMobileVaultV2),
    )
    // mobile(M-014): the endpoint probe bridge (issue #5) — a protocol-isolated sibling of
    // the vault bridge on the same window message events. The handshake strings differ
    // ("opencode-mobile-probe-handshake" vs the vault's) and each transport captures only
    // its own string with exactly one port, so neither can capture the other's handshake;
    // neither consults event.origin (platform carries an empty origin by construction).
    // The port is captured into the transport closure and acked immediately; before that
    // ack the probe stays unavailable (fail-closed), and when the bridge never comes up
    // the dialog degrades to the generic error — no fabricated classification.
    const probe = createProbeClient(
      createWebMessageProbeTransport({
        subscribe: (handler) => {
          window.addEventListener("message", handler as EventListener)
          return () => window.removeEventListener("message", handler as EventListener)
        },
      }),
    )
    // mobile(M-015): the ssh tunnel bridge (issue #6) — the THIRD protocol-isolated sibling
    // of the vault and probe bridges on the same window message events. Its handshake
    // string ("opencode-mobile-ssh-handshake") is captured only by this transport (strict
    // data equality + exactly one port), so none of the three bridges can capture another's
    // handshake; event.origin is never consulted (embedder-posted messages carry an empty
    // origin by platform construction). The port is captured into the transport closure and
    // acked immediately; before that ack every ssh attempt fails explicitly
    // (bridge-unavailable) — no tunnel can exist unverified.
    // mobile(M-016): the service ops bridge (issue #7) — the FOURTH protocol-isolated
    // sibling of the vault/probe/ssh bridges on the same window message events. Its
    // handshake string ("opencode-mobile-svcops-handshake") is captured only by this
    // transport (strict data equality + exactly one port), so none of the four bridges
    // can capture another's handshake; event.origin is never consulted (embedder-posted
    // messages carry an empty origin by platform construction). The port is captured
    // into the transport closure and acked immediately; before that ack the service ops
    // panel stays degraded-hidden (fail-closed stub) — a client-only build implies no
    // service-operation surface. The bridge protocol carries {templateId, params, os}
    // ONLY (never a command string): the command face is the native-side whitelist,
    // assembled by the mirrored validator, never free commands. Registration goes through
    // the module-level service ops seam (setActiveServiceOpsPort) so the runtime bootstrap
    // contract (createMobileHosts options) stays unchanged; the credential is resolved
    // per command by the panel and crosses one way, once, never logged or echoed (N7).
    setActiveServiceOpsPort(
      createServiceOpsClient(
        createWebMessageServiceOpsTransport({
          subscribe: (handler) => {
            window.addEventListener("message", handler as EventListener)
            return () => window.removeEventListener("message", handler as EventListener)
          },
        }),
      ),
    )
    // mobile(M-020): the files bridge (issue #16) — the FIFTH protocol-isolated sibling of
    // the vault/probe/ssh/svcops bridges on the same window message events. Its handshake
    // string ("opencode-mobile-files-handshake") is captured only by this transport
    // (strict data equality + exactly one port), so none of the five bridges can capture
    // another's handshake; event.origin is never consulted (embedder-posted messages
    // carry an empty origin by platform construction). The port is captured into the
    // transport closure and acked immediately; before that ack the platform file
    // capabilities stay fail-closed stubs (clipboardImage null / saveFile false /
    // shareDataUrl false). Registration goes through the module-level files seam
    // (setActiveFilesPort) so the runtime bootstrap contract stays unchanged — the same
    // shape as the service ops registration directly above.
    setActiveFilesPort(
      createFilesClient(
        createWebMessageFilesTransport({
          subscribe: (handler) => {
            window.addEventListener("message", handler as EventListener)
            return () => window.removeEventListener("message", handler as EventListener)
          },
        }),
      ),
    )
    // mobile(M-022): the notifications bridge (issue #23) — the SIXTH protocol-isolated
    // sibling of the vault/probe/ssh/svcops/files bridges on the same window message
    // events. Its handshake string ("opencode-mobile-notifications-handshake") is captured
    // only by this transport (strict data equality + exactly one port), so none of the six
    // bridges can capture another's handshake; event.origin is never consulted
    // (embedder-posted messages carry an empty origin by platform construction). The port
    // is captured into the transport closure and acked immediately; before that ack the
    // notifications port stays a fail-closed stub — the exact pre-issue state (the Web
    // Notification API behind platform.notify does not exist in the Android WebView), so
    // the in-app faces carry on either way. Registration goes through the module-level
    // notifications seam (setActiveNotificationsPort) so the runtime bootstrap contract
    // stays unchanged — the same shape as the files registration directly above. The
    // bridge is notification-ONLY: its op whitelist {notify, requestPermission} has no
    // reply/cancel/interrupt face, so a notification can never approve a permission or
    // stop a task (issue #23 acceptance 3).
    setActiveNotificationsPort(
      createNotificationsClient(
        createWebMessageNotificationsTransport({
          subscribe: (handler) => {
            window.addEventListener("message", handler as EventListener)
            return () => window.removeEventListener("message", handler as EventListener)
          },
        }),
      ),
    )
    const hosts = createMobileHosts({
      storage: window.localStorage,
      fetch: globalThis.fetch.bind(globalThis),
      vault,
      probe,
      resolver: createVaultResolver(vault),
      // Issue #6: the fail-closed stubs (StubHostKeyVerifier / StubHostTransport) give way
      // to the bridge-backed counterparts ONLY in this shipped wiring. Without the acked
      // bridge no connection is attempted beyond an explicit failure; the stubs remain the
      // package's no-injection default (fail-closed posture unchanged).
      hostKey: createSshHostKeyVerifier(ssh),
      transport: createSshHostTransport(ssh),
      sshBridge: ssh,
    })

    render(
      () => (
        <PlatformProvider value={web.platform}>
          <AppBaseProviders locale={locale}>
            <AppInterface servers={hosts.upstreamConnections()}>
              <KeyboardInsets />
              {standalone && <PwaRoutePersistence />}
            </AppInterface>
          </AppBaseProviders>
        </PlatformProvider>
      ),
      root,
    )
  })
}
