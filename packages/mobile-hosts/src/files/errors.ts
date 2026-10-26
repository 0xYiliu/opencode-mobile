// Files bridge error taxonomy (issue #16, plan D2/D3) — the six explicit codes spoken by
// the Android FilesBridge (Kotlin mirrors these exact wire strings, vault ENTRY_ID house
// rule) and thrown/returned by the first-party files client.
//
// - unavailable: the bridge handshake was never captured/acked, the channel died, or a
//   request timed out (explicit degraded state — never a silent hang, never a fabricated
//   success).
// - too-large: a single message's raw byte payload exceeds MAX_BRIDGE_BYTES (32 MiB,
//   checked on BOTH sides — JS pre-check here, Kotlin native re-check).
// - unsupported: a malformed/forbidden shape — a filename rejected by the two-layer name
//   sanitization (JS sanitizeFilename + Kotlin FILENAME re-check), a clipboard item that
//   is not a content:// + image/* URI, or a non-data: URL passed to shareDataUrl.
// - io: native write/read failure (SAF stream write, clipboard stream read, base64
//   decode failure).
// - busy: a save is already pending (pendingSave exactly-once; the SAF dialog is still
//   up — refused, never queued or overwritten, mirroring the file chooser discipline).
// - cancelled: an in-flight operation was abandoned (channel death during a pending
//   request); user cancellation of the SAF dialog is NOT an error — it returns
//   { saved: false } per the upstream "false = user cancel" Platform contract.

export type FilesErrorCode =
  | "unavailable"
  | "too-large"
  | "unsupported"
  | "io"
  | "busy"
  | "cancelled"

/** Every FilesErrorCode, in canonical order. */
export const FILES_ERROR_CODES = [
  "unavailable",
  "too-large",
  "unsupported",
  "io",
  "busy",
  "cancelled",
] as const satisfies readonly FilesErrorCode[]

export function isFilesErrorCode(value: unknown): value is FilesErrorCode {
  return typeof value === "string" && (FILES_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Thrown by the files bridge transport and client on hard failures. `false` returns
 * (user cancellation per the Platform saveFile contract) never travel through here.
 */
export class FilesError extends Error {
  readonly code: FilesErrorCode

  constructor(code: FilesErrorCode, message?: string) {
    super(message ?? defaultFilesErrorMessage(code))
    this.name = "FilesError"
    this.code = code
  }
}

function defaultFilesErrorMessage(code: FilesErrorCode): string {
  switch (code) {
    case "unavailable":
      return "files bridge unavailable"
    case "too-large":
      return "payload exceeds the files bridge size bound"
    case "unsupported":
      return "unsupported file shape"
    case "io":
      return "file operation failed"
    case "busy":
      return "another save is already pending"
    case "cancelled":
      return "file operation was cancelled"
  }
}
