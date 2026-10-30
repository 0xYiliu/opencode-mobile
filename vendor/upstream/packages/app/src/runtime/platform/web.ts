import { createBrowserDraftStore } from "@/runtime/persistence/drafts"
// mobile(M-020): the platform file capabilities (issue #16) read the files bridge port
// through the module-level seam at call time, so a bridge that comes up after bootstrap
// is picked up without a re-render.
import { activeFilesPort, createSecureFetch } from "@opencode-mobile/mobile-hosts"
import { createSignal, type Accessor } from "solid-js"
import { desktopZoomLevels, type DesktopZoomLevel } from "@/shell/commands/desktop-menu"
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
    // mobile(M-035): the interface zoom faces (issue #65). Upstream declares
    // zoomLevel/setZoomLevel desktop-only (Electron webContents zoom plus main-process
    // storage); this closure ships the web shell only, so the faces are implemented here
    // per the M-020 precedent: CSS `zoom` on the document element, persisted in
    // localStorage (a non-sensitive UI preference, not a credential), values validated
    // against desktopZoomLevels. Platform TYPES are unchanged; the faces join the
    // platform object through a spread so no excess property is introduced on the
    // annotated literal.
    ...createUiZoomLevel(),
    draftStore: createBrowserDraftStore(),
    version,
    openExternal(value) {
      if (!URL.canParse(value)) return
      const url = new URL(value)

      if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return
      // mobile(M-041): the shell's outbound face (issue #76). window.open is a
      // same-WebView navigation inside the shell (no setSupportMultipleWindows) — the
      // URL crosses the files bridge instead and the native side is the ENFORCED layer
      // (ACTION_VIEW over ExternalOpenPolicy: http/https only, userinfo refused; mailto
      // passes the gate above and is refused natively — a registered first-party
      // delta). Before the bridge acks the fail-closed stub answers false and the void
      // face ignores it. Rollback = revert this one patch.
      void activeFilesPort().openExternal(url.href)
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

/**
 * mobile(M-035): the interface zoom faces (issue #65). `zoomLevel` mirrors the upstream
 * desktop contract: an accessor over the saved level, applied as CSS `zoom` on the
 * document element (level 1 removes the property so the shell renders unzoomed), applied
 * synchronously when the platform is constructed and persisted in localStorage under
 * `opencode-ui-zoom-level`. Stored values are validated against `desktopZoomLevels`;
 * anything unreadable or out of set falls back to 1. `setZoomLevel` applies, persists and
 * resolves (the Platform face is async; storage failures leave the in-memory level
 * applied for the session rather than throwing into the settings Select).
 */
const UI_ZOOM_KEY = "opencode-ui-zoom-level"

function createUiZoomLevel(): {
  zoomLevel: Accessor<DesktopZoomLevel>
  setZoomLevel: (level: DesktopZoomLevel) => Promise<void>
} {
  const readStored = (): DesktopZoomLevel => {
    try {
      const raw = localStorage.getItem(UI_ZOOM_KEY)
      const parsed = raw === null ? Number.NaN : Number.parseFloat(raw)
      return (desktopZoomLevels as readonly number[]).includes(parsed) ? (parsed as DesktopZoomLevel) : 1
    } catch {
      return 1
    }
  }

  const [zoomLevel, setZoomLevel] = createSignal<DesktopZoomLevel>(readStored())

  const apply = (level: DesktopZoomLevel) => {
    if (level === 1) document.documentElement.style.removeProperty("zoom")
    else document.documentElement.style.setProperty("zoom", String(level))
  }

  apply(zoomLevel())

  return {
    zoomLevel,
    setZoomLevel: async (level) => {
      setZoomLevel(level)
      apply(level)
      try {
        localStorage.setItem(UI_ZOOM_KEY, String(level))
      } catch {
        // Persistence unavailable (storage disabled): keep the session-level zoom applied.
      }
    },
  }
}
