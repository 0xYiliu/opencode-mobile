import { createBrowserDraftStore } from "@/runtime/persistence/drafts"
import { createSecureFetch } from "@opencode-mobile/mobile-hosts"
import type { Platform } from "./platform"

export function createWebPlatform(version: string) {
  const platform: Platform = {
    platform: "web",
    // mobile(M-011): the platform fetch is the validated-follow front (issue #5, decision
    // 0002 D1). It keeps redirect: "follow" (same-origin reverse proxies keep working) and
    // validates the FINAL response before its body is delivered: a cross-host final URL is
    // refused, an https->http downgrade is refused, and a request URL carrying userinfo
    // credentials is refused before anything is sent. This seam covers the server
    // transport (API/SSE/binary reads) and the health checks; the upload XHR is validated
    // separately (M-012) with the same rules, and the pairing-flow residual fetch surface
    // is registered in docs/design/units/connection.md. The signature matches
    // Platform.fetch unchanged, so rollback is reverting this one patch.
    fetch: createSecureFetch(),
    draftStore: createBrowserDraftStore(),
    version,
    openExternal(value) {
      if (!URL.canParse(value)) return
      const url = new URL(value)

      if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return
      window.open(url.href, "_blank", "noopener,noreferrer")
    },
    restart: async () => window.location.reload(),
    async notify(title, description, onClick) {
      if (!("Notification" in window)) return

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission().catch(() => "denied")
          : Notification.permission

      if (permission !== "granted") return

      if (document.visibilityState === "visible" && document.hasFocus()) return

      const notification = new Notification(title, {
        body: description ?? "",
        icon: "https://opencode.ai/favicon-96x96-v3.png",
      })

      notification.onclick = () => {
        window.focus()
        onClick?.()
        notification.close()
      }
    },
  }

  return {
    platform,
    currentServerUrl: getCurrentServerUrl(),
  }
}

function getCurrentServerUrl() {
  if (import.meta.env.VITE_OPENCODE_SERVER_MODE === "none") return undefined

  if (import.meta.env.DEV) {
    const loopback =
      location.hostname === "localhost" || location.hostname === "[::1]" || location.hostname.startsWith("127.")

    const host = import.meta.env.VITE_OPENCODE_SERVER_HOST ?? (loopback ? location.hostname : "localhost")

    return `http://${host}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`
  }

  return location.origin
}
