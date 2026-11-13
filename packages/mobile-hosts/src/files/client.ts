// Files port (issue #16, plan D2/D3) — the fifth-bridge client face and its fail-closed
// default. Everything the app does with device file capabilities flows through this port;
// the shared package itself has zero platform APIs (AGENTS.md architecture rule).
//
// Fail-closed defaults stay in charge (M-015/M-016 precedent). The stub semantics are
// recorded PER FIELD because they are NOT uniformly equivalent to "no platform field":
// - clipboardImage -> null: EQUIVALENT. The paste chain silently falls through to the text
//   path, exactly as when the platform lacks readClipboardImage (upstream web today).
// - shareDataUrl -> false: EQUIVALENT. The M-021 branch falls back to the upstream
//   anchor.download on false/throw/bridge-unavailable (plan L6 fixed reading), which is
//   the upstream behavior itself.
// - saveFile -> false: NOT equivalent, and this is an INTENTIONAL behavior change (plan
//   M1/D3). Field ABSENT = downloadSessionExport anchor fallback + return true (a fake
//   success toast for a download that, inside the shell WebView, is a dead point — no
//   DownloadListener is registered and blob:/data: URLs are not resolvable natively).
//   Field PRESENT with stub false = silent cancel (no toast, no anchor). The stub is
//   deliberately false — NOT a throw — to keep the Platform contract unified ("false =
//   user cancelled") and because the GUI-extension host surface's exception propagation
//   is uncontrolled; the degraded state is MORE honest than the fake-success toast.
//   Registered in docs/design/units/attachments-artifacts.md and gated by G27⑧.
// - openExternal -> false: EQUIVALENT. The Platform `openExternal` contract is `void`
//   (fire-and-forget, upstream web silently returns on a gate miss), so a pre-ack stub
//   answering false closes the same failure path the upstream gate does — no consumer
//   reads the boolean and nothing is thrown past the seam. The enforced URL policy lives
//   NATIVELY (ExternalOpenPolicy: http/https only); issue #76, N08.
//
// Injection seam: module-level accessor (the M-016 setActiveServiceOpsPort precedent).
// The runtime bootstrap contract (runtime.ts) is deliberately UNCHANGED; the vendored
// entry (M-020) calls setActiveFilesPort once at bootstrap.
//
// Name hygiene (plan B2, JS layer of the two-layer defense): every byte path (save/share)
// passes its filename through sanitizeFilename BEFORE anything crosses the bridge. The
// sanitizer performs NO internal stripping: separators are outright rejected (a rejected
// name throws unsupported — it is never rewritten); the caller-side basename comes from
// upstream getFilename (M-021) or the defaultPath's final segment (saveFile). The Kotlin
// side re-checks with the mirrored FILENAME pattern (vault ENTRY_ID house rule) — a value
// that somehow passed here is still refused natively and never touches disk.
//
// Zero credentials cross this bridge; zero file values are logged on either side (the
// native side keeps the fixed-tag/op-name-only discipline of its four siblings).

import { FilesError } from "./errors"
import type { FilesErrorCode } from "./errors"
import { bridgeErrorToFilesError } from "./transport"
import type { FilesBridgeTransport } from "./transport"

// ---------------------------------------------------------------------------
// Size bound (plan D2; three independent bounds registered in the unit document)
// ---------------------------------------------------------------------------

/**
 * Maximum RAW byte payload of a single bridge message (32 MiB). Checked on BOTH sides:
 * here (pre-flight, before base64 encoding crosses) and in the Kotlin mirror. Distinct
 * from the upstream inline-attachment bound (20 MiB) and the media viewer bound
 * (256 MiB) — the three bounds are independent and honestly co-registered.
 */
export const MAX_BRIDGE_BYTES = 32 * 1024 * 1024

// ---------------------------------------------------------------------------
// Filename sanitization (B2 JS layer)
// ---------------------------------------------------------------------------

/**
 * The filename whitelist: starts with an alphanumeric (no leading dot — this also rules
 * out the "." and ".." path segments), then letters/digits/space/dot/underscore/hyphen/
 * common brackets, at most 128 chars. Separators and control characters cannot match,
 * and the sanitizer never rewrites: a violation throws unsupported (fail-closed, plan
 * Nit① — basename normalization is the CALLER's job, e.g. upstream getFilename).
 */
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._\-[\]()]{0,127}$/

/**
 * Validate one filename for the save/share byte paths. Throws FilesError("unsupported")
 * on any illegal shape: empty, over 128 chars, containing "/" or "\", containing "..",
 * control characters, a leading dot, or any character outside the whitelist.
 */
export function sanitizeFilename(name: string): string {
  if (name.length === 0) throw new FilesError("unsupported", "filename must not be empty")
  if (name.length > 128) throw new FilesError("unsupported", "filename exceeds the 128 character bound")
  if (name.includes("/") || name.includes("\\")) throw new FilesError("unsupported", "filename must not contain path separators")
  if (name.includes("..")) throw new FilesError("unsupported", "filename must not contain dot segments")
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new FilesError("unsupported", "filename must not contain control characters")
  if (!FILENAME_PATTERN.test(name)) throw new FilesError("unsupported", "filename contains characters outside the whitelist")
  return name
}

// ---------------------------------------------------------------------------
// Extension -> MIME map (save op SAF type; plan L5, caliber aligned with the
// acceptTypes extension mapping and WebAssetServer.MIME_BY_EXTENSION)
// ---------------------------------------------------------------------------

const MIME_BY_FILENAME_EXTENSION: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  csv: "text/csv",
  pdf: "application/pdf",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
}

/**
 * Derive the SAF document type for a save from the (already sanitized) filename's
 * extension; unknown or missing extensions fall back to application/octet-stream
 * (plan L5 — Platform SaveFilePickerOptions carries no mime field, so the client derives
 * it). DocumentsUI saves octet-stream payloads to user-chosen locations fine.
 */
export function mimeFromFilename(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  const ext = name.slice(dot + 1).toLowerCase()
  return MIME_BY_FILENAME_EXTENSION[ext] ?? "application/octet-stream"
}

// ---------------------------------------------------------------------------
// base64 (zero-dependency; zero binary across the bridge — bytes travel encoded)
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const BASE64_LOOKUP = new Map<string, number>([...BASE64_ALPHABET].map((ch, i) => [ch, i]))

/** Encode bytes as standard base64 (no line breaks). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const has1 = i + 1 < bytes.length
    const has2 = i + 2 < bytes.length
    const b1 = has1 ? bytes[i + 1]! : 0
    const b2 = has2 ? bytes[i + 2]! : 0
    out += BASE64_ALPHABET[b0 >> 2]
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
    out += has1 ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : "="
    out += has2 ? BASE64_ALPHABET[b2 & 63] : "="
  }
  return out
}

/**
 * Decode strict standard base64 (whitespace tolerated). Throws FilesError("io") on any
 * malformed input (the io code for decode failure, plan acceptance 2).
 */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, "")
  const rem = clean.length % 4
  if (rem === 1) throw new FilesError("io", "malformed base64 payload")
  const padding = rem === 2 ? 1 : rem === 3 ? 2 : clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) - padding)
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP.get(clean[i]!)
    const c1 = BASE64_LOOKUP.get(clean[i + 1]!)
    const c2 = clean[i + 2] === "=" ? undefined : BASE64_LOOKUP.get(clean[i + 2]!)
    const c3 = clean[i + 3] === "=" ? undefined : BASE64_LOOKUP.get(clean[i + 3]!)
    if (c0 === undefined || c1 === undefined || (i + 2 < clean.length && c2 === undefined && clean[i + 2] !== "=") || (i + 3 < clean.length && c3 === undefined && clean[i + 3] !== "=")) {
      throw new FilesError("io", "malformed base64 payload")
    }
    if (o < out.length) out[o++] = (c0! << 2) | (c1! >> 4)
    if (c2 !== undefined && o < out.length) out[o++] = ((c1! & 15) << 4) | (c2! >> 2)
    if (c3 !== undefined && o < out.length) out[o++] = ((c2 ?? 0) & 3) << 6 | c3!
  }
  return out
}

// ---------------------------------------------------------------------------
// Port + fail-closed stub (per-field semantics — see the header)
// ---------------------------------------------------------------------------

export type SaveFileInput = { title?: string; defaultPath?: string }

export interface FilesPort {
  /**
   * Read one image from the device clipboard. NEVER throws: every failure path (bridge
   * unavailable, explicit unsupported wire code, oversized payload, malformed response)
   * degrades to null — the Platform `readClipboardImage` contract is `File | null` and
   * the upstream paste chain awaits it without a try/catch.
   */
  clipboardImage(): Promise<File | null>
  /**
   * Platform saveFile contract (platform.tsx `saveFile?`): resolves true when the content
   * was written to the user-chosen location, false when the user cancelled the SAF
   * dialog, throws FilesError on any hard failure (unavailable/too-large/unsupported/io/
   * busy) — upstream consumers catch the throw and show their failed toast.
   */
  saveFile(opts: SaveFileInput, content: string): Promise<boolean>
  /**
   * Share one data: URL through the system share sheet. Resolves true when the sheet was
   * delivered to the target picker, false when the native side declined (caller falls
   * back — plan L6), throws FilesError on hard failures.
   */
  shareDataUrl(dataUrl: string, filename: string, mime: string): Promise<boolean>
  /**
   * Hand one URL to the shell's outbound external-open face (issue #76, N08): the native
   * ACTION_VIEW over the enforced ExternalOpenPolicy (http/https only, userinfo refused).
   * NEVER throws: every failure path (bridge unavailable, policy refusal, no handler app,
   * malformed response) resolves false and the native side shows the failure Toast — the
   * Platform `openExternal` contract is `void` and upstream consumers call it without a
   * try/catch, so a throw would surface as an uncaught exception in click handlers (the
   * OAuth controller's catch -> browserFailed face stays unreachable, same as web).
   */
  openExternal(url: string): Promise<boolean>
}

/**
 * Fail-closed stub: never touches a bridge, never fakes a capability. Per-field semantics
 * (clipboardImage null / shareDataUrl false equivalent; saveFile false an intentional
 * behavior change) are documented in the module header.
 */
export const StubFilesPort: FilesPort = {
  clipboardImage: async () => null,
  saveFile: async () => false,
  shareDataUrl: async () => false,
  openExternal: async () => false,
}

// ---------------------------------------------------------------------------
// Module-level injection seam (M-016 precedent; runtime.ts stays untouched)
// ---------------------------------------------------------------------------

let activePort: FilesPort = StubFilesPort

/** Register the bridge-backed client (the entry bootstrap, M-020). Undefined resets. */
export function setActiveFilesPort(port: FilesPort | undefined): void {
  activePort = port ?? StubFilesPort
}

/** The active port. Never undefined: the stub is the fail-closed default. */
export function activeFilesPort(): FilesPort {
  return activePort
}

/** Whether a real (non-stub) port was injected. */
export function filesBridgeInjected(): boolean {
  return activePort !== StubFilesPort
}

// ---------------------------------------------------------------------------
// Bridge-backed client
// ---------------------------------------------------------------------------

/**
 * The bridge-backed files port. Failure mapping per method: clipboardImage degrades
 * EVERYTHING to null (never throws); saveFile throws on hard failures and only resolves
 * false for the native `{saved:false}` answer (upstream "false = user cancel" contract);
 * shareDataUrl throws on hard failures and resolves false when the native side declines;
 * openExternal degrades EVERYTHING to false (never throws — the Platform `void` contract
 * has no catch upstream; the native side carries the user-visible failure Toast).
 */
export function createFilesClient(transport: FilesBridgeTransport): FilesPort {
  return {
    clipboardImage: async (): Promise<File | null> => {
      try {
        if (transport.status() !== "available") return null
        const response = await transport.request("clipboardImage", {})
        if (!response.ok) return null // unsupported/busy/... degrade to null at the Platform seam (wire codes stay on the bridge face)
        const result = response.result as Record<string, unknown> | null
        if (!result || typeof result !== "object") return null // native answered "no image"
        const name = result["name"]
        const mime = result["mime"]
        const data = result["data"]
        if (typeof name !== "string" || typeof mime !== "string" || typeof data !== "string") return null
        if (name.length === 0 || data.length === 0) return null
        if (Math.floor((data.length * 3) / 4) > MAX_BRIDGE_BYTES) return null // native re-check breach: degrade, never throw past the seam
        const bytes = base64ToBytes(data) // malformed base64 -> FilesError -> caught below
        // Copy into an owned ArrayBuffer: newer DOM typings reject Uint8Array<ArrayBufferLike>
        // as a BlobPart because the bridge decoder may be backed by SharedArrayBuffer.
        const owned = new Uint8Array(bytes.byteLength)
        owned.set(bytes)
        return new File([owned.buffer], name, { type: mime })
      } catch {
        return null
      }
    },

    saveFile: async (opts: SaveFileInput, content: string): Promise<boolean> => {
      if (transport.status() !== "available") throw new FilesError("unavailable", "files bridge handshake not captured")
      const rawName = lastPathSegment(opts.defaultPath) || opts.title || "download"
      const name = sanitizeFilename(rawName) // throws unsupported on illegal shapes — nothing crosses, nothing is written
      const mime = mimeFromFilename(name) // plan L5: extension-derived, octet-stream fallback
      const bytes = new TextEncoder().encode(content)
      if (bytes.byteLength > MAX_BRIDGE_BYTES) throw new FilesError("too-large", "content exceeds the 32 MiB bridge bound")
      const response = await transport.request("save", { name, mime, data: bytesToBase64(bytes) })
      if (!response.ok) {
        throw bridgeErrorToFilesError(response.code, response.message)
      }
      const saved = (response.result as Record<string, unknown> | null)?.["saved"]
      if (typeof saved !== "boolean") throw new FilesError("io", "malformed save result")
      return saved // false = user cancelled the SAF dialog (RESULT_CANCELED) — the upstream contract
    },

    shareDataUrl: async (dataUrl: string, filename: string, mime: string): Promise<boolean> => {
      if (transport.status() !== "available") throw new FilesError("unavailable", "files bridge handshake not captured")
      const name = sanitizeFilename(filename)
      if (!dataUrl.startsWith("data:")) throw new FilesError("unsupported", "shareDataUrl requires a data: URL")
      const comma = dataUrl.indexOf(",")
      if (comma < 0) throw new FilesError("unsupported", "malformed data: URL")
      const encoded = dataUrl.slice(comma + 1)
      if (encoded.length === 0) throw new FilesError("unsupported", "empty data: URL payload")
      if (Math.floor((encoded.length * 3) / 4) > MAX_BRIDGE_BYTES) throw new FilesError("too-large", "payload exceeds the 32 MiB bridge bound")
      base64ToBytes(encoded) // decode-validate; the encoded form itself crosses the bridge (zero-copy)
      const resolvedMime = mime.trim().length > 0 ? mime.trim() : dataUrl.slice(5, comma)
      const response = await transport.request("share", { name, mime: resolvedMime, data: encoded })
      if (!response.ok) {
        throw bridgeErrorToFilesError(response.code, response.message)
      }
      const shared = (response.result as Record<string, unknown> | null)?.["shared"]
      if (typeof shared !== "boolean") throw new FilesError("io", "malformed share result")
      return shared // false = the native side declined to launch the sheet (caller falls back to anchor.download)
    },

    openExternal: async (url: string): Promise<boolean> => {
      // Never throws (issue #76): the Platform `openExternal` contract is `void`, upstream
      // consumers (OAuth controller, feedback links, elicitation dock) call it without a
      // try/catch. Every failure — bridge not acked yet, policy refusal, no handler app,
      // malformed/native-declined answer, hard wire error — resolves false; the native
      // side owns the user-visible Toast (zero URL content). The enforced URL policy is
      // NATIVE (ExternalOpenPolicy); this face adds no second gate (the upstream JS gate
      // stays verbatim in web.ts as the first layer only).
      try {
        if (transport.status() !== "available") return false
        const response = await transport.request("openExternal", { url })
        if (!response.ok) return false
        const opened = (response.result as Record<string, unknown> | null)?.["opened"]
        if (typeof opened !== "boolean") return false
        return opened
      } catch {
        return false
      }
    },
  }
}

/** Final path segment of a defaultPath (the caller-side basename for saveFile). */
function lastPathSegment(path: string | undefined): string {
  if (!path) return ""
  const segments = path.split(/[\\/]/)
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    if (segment.length > 0) return segment
  }
  return ""
}
