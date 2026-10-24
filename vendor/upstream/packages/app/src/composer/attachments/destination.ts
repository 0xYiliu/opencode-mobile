import type { Accessor } from "solid-js"
import { useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { authTokenFromCredentials } from "@/runtime/server/api"
import { uuid } from "@/runtime/persistence/uuid"
import { useWorkspaceLocation } from "@/workspaces/location"
// mobile(M-012): the upload XHR is the one request that bypasses the platform fetch seam
// (M-011), so it carries the same URL policy from the first-party package.
import { SecureFetchError, assertNoUrlCredentials, validateRedirectTarget } from "@opencode-mobile/mobile-hosts"
import type { ComposerControls } from "../adapter"

// Where a prompt is headed: the model that reads it and the server that runs its tools.
export type AttachmentDestination = {
  /** Input modalities the selected model reads natively. */
  input: { image: boolean; pdf: boolean }
  /** The server shares the client's filesystem, so an attachment's source path resolves as-is. */
  local: boolean
  /** Streams a file into the server's temporary directory and returns its absolute path there. */
  upload: (file: File, report: (loaded: number) => void, signal: AbortSignal) => Promise<string>
}

export function useAttachmentDestination(controls: Accessor<ComposerControls>) {
  const server = useServer()
  const sdk = useServerSDK()
  const location = useWorkspaceLocation()

  return (): AttachmentDestination => ({
    input: controls().model.selection.current()?.capabilities.input ?? { image: false, pdf: false },
    local: server.isLocal,
    upload: async (file, report, signal) => {
      const info = await sdk.api.server.info({ signal })
      // One directory per upload keeps the original filename without collisions; the server
      // normalizes the separators and returns the resolved path.
      const url = new URL("/api/experimental/fs/write", server.conn.http.url)
      url.searchParams.set("location[directory]", location().directory)
      url.searchParams.set("path", `${info.paths.tmp}/uploads/${uuid()}/${file.name}`)

      return write(url, file, server.conn.http.password, report, signal)
    },
  })
}

// fetch cannot report upload progress and Chromium only streams request bodies over HTTP/2, so
// the one request that needs both goes through XMLHttpRequest. The browser streams the File
// from disk; nothing is buffered in the renderer.
function write(url: URL, file: File, password: string | undefined, report: (loaded: number) => void, signal: AbortSignal) {
  // mobile(M-012): userinfo credential URLs are refused before anything is sent — the same
  // decision-0002 D-URL rule the platform fetch (M-011) enforces on every other channel.
  assertNoUrlCredentials(url.href)

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.responseType = "json"
    xhr.setRequestHeader("content-type", "application/octet-stream")

    if (password) xhr.setRequestHeader("authorization", `Basic ${authTokenFromCredentials({ password })}`)
    xhr.upload.addEventListener("progress", (event) => report(event.loaded))
    xhr.addEventListener("load", () => {
      // mobile(M-012): validated-follow for the upload face (issue #5, decision 0002 D1).
      // The FINAL responseURL must still be same-origin with the request and must not have
      // downgraded https->http, else the body is rejected instead of being read as the
      // server's upload receipt. Cross-origin redirect sub-requests already lost the
      // Authorization header by browser spec (the floor); this is the shell's fail-closed
      // layer on top. An empty responseURL (a synthetic response that never traversed the
      // network) falls through to the status check below, as on the fetch face.
      const verdict = validateRedirectTarget(url.href, xhr.responseURL)
      if (!verdict.allowed) {
        return reject(
          new SecureFetchError(
            verdict.reason === "downgrade" ? "redirect-downgrade" : "redirect-cross-host",
            verdict.reason === "downgrade"
              ? "blocked: the upload was downgraded from HTTPS to plaintext"
              : "blocked: the upload was redirected to a different origin than the requested one",
          ),
        )
      }
      if (xhr.status !== 200) return reject(new Error(`Upload failed with status ${xhr.status}`))
      // SAFETY: a 200 from `fs.write` is its declared success body, `Location.response(FileSystem.Write)`.
      resolve((xhr.response as { data: { path: string } }).data.path)
    })
    xhr.addEventListener("error", () => reject(new Error("Upload failed")))
    xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")))
    signal.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}
