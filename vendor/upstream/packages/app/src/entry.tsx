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
  createMobileHosts,
  createProbeClient,
  createServiceOpsClient,
  createSshHostKeyVerifier,
  createSshHostTransport,
  createVaultClient,
  createVaultResolver,
  createWebMessageChannelTransport,
  createWebMessageProbeTransport,
  createWebMessageServiceOpsTransport,
  createWebMessageSshTransport,
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
    // mobile(M-007 amendment, issue #4): wire the device credential vault. The transport
    // subscribes BEFORE first render so the native handshake (posted from
    // onPageFinished with a transferable port) cannot be missed: the handler validates the
    // handshake SHAPE only — event.origin is never consulted because embedder-posted
    // messages carry an empty origin by platform construction (see
    // docs/design/architecture.md, three-layer trust). The port is captured inside the
    // transport's closure (never a global), acked immediately, and later handshakes are
    // ignored. Before that ack the vault is unavailable — an explicit state; there is no
    // plaintext fallback anywhere.
    const vault = createVaultClient(
      createWebMessageChannelTransport({
        subscribe: (handler) => {
          window.addEventListener("message", handler as EventListener)
          return () => window.removeEventListener("message", handler as EventListener)
        },
      }),
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
    const ssh = createWebMessageSshTransport({
      subscribe: (handler) => {
        window.addEventListener("message", handler as EventListener)
        return () => window.removeEventListener("message", handler as EventListener)
      },
    })
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
