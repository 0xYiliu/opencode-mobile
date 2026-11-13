import { createBrowserDraftStore } from "@/runtime/persistence/drafts"
// mobile(M-020): the platform file capabilities (issue #16) read the files bridge port
// through the module-level seam at call time, so a bridge that comes up after bootstrap
// is picked up without a re-render.
import { activeFilesPort, createSecureFetch } from "@opencode-mobile/mobile-hosts"
import type { Platform } from "./platform"

export function createWebPlatform(version: string) {
  const platform: Platform = {
    platform: "web",
    // mobile(M-011): validated-follow fetch rejects credential-bearing URLs, unsafe redirects
    // and cross-host/downgrade final responses before the response body is consumed.
    fetch: createSecureFetch(),
    // mobile(M-020): completes the Platform faces that were desktop-only declarations on
    // this platform. `readClipboardImage` fills the field whose comment anchor ("Read
    // image from clipboard (desktop only)") had no web implementation in this closure;
    // `saveFile` routes session exports and GUI-extension saves through the shell's SAF
    // save dialog (the anchor.download fallback is a dead point inside the WebView shell:
    // no DownloadListener is registered and blob:/data: URLs are not resolvable natively).
    // Both read the port through the seam PER CALL; before the bridge acks the fail-closed
    // stub answers (null / false) — saveFile false means "silently cancelled", an
    // intentional, more honest change vs the absent-field fake-success anchor fallback
    // (docs/design/units/attachments-artifacts.md, gate G27⑧). Platform TYPES are
    // unchanged: both fields are pre-existing optional members. Rollback = reverting this
    // one patch plus the entry wiring.
    readClipboardImage: createPlatformClipboardReader(),
    saveFile: createPlatformFileSaver(),
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

/**
 * mobile(M-020): the clipboard reader face. Reads the files-bridge port through the seam
 * per call and never throws (the upstream paste chain awaits it bare); the marker rides
 * the returned function the same way the M-011 fetch wrapper carries its dist marker.
 */
function createPlatformClipboardReader(): Platform["readClipboardImage"] {
  const readClipboardImage = () => activeFilesPort().clipboardImage()
  ;(readClipboardImage as unknown as { marker: string }).marker =
    "mobile(M-020): platform clipboard reader over the files bridge seam (issue #16)"
  return readClipboardImage
}

/**
 * mobile(M-020): the save face (Platform `saveFile?`). Contract per the Platform type:
 * resolves true when the content reached the user-chosen location, false when the user
 * cancelled the shell's SAF dialog, throws on hard failures (the callers' catch shows
 * their failed toast).
 */
function createPlatformFileSaver(): Platform["saveFile"] {
  const saveFile = (opts: { title?: string; defaultPath?: string }, content: string) =>
    activeFilesPort().saveFile(opts, content)
  ;(saveFile as unknown as { marker: string }).marker =
    "mobile(M-020): platform file saver over the files bridge seam (issue #16)"
  return saveFile
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
