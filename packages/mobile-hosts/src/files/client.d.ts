import type { FilesBridgeTransport } from "./transport";
/**
 * Maximum RAW byte payload of a single bridge message (32 MiB). Checked on BOTH sides:
 * here (pre-flight, before base64 encoding crosses) and in the Kotlin mirror. Distinct
 * from the upstream inline-attachment bound (20 MiB) and the media viewer bound
 * (256 MiB) — the three bounds are independent and honestly co-registered.
 */
export declare const MAX_BRIDGE_BYTES: number;
/**
 * Validate one filename for the save/share byte paths. Throws FilesError("unsupported")
 * on any illegal shape: empty, over 128 chars, containing "/" or "\", containing "..",
 * control characters, a leading dot, or any character outside the whitelist.
 */
export declare function sanitizeFilename(name: string): string;
/**
 * Derive the SAF document type for a save from the (already sanitized) filename's
 * extension; unknown or missing extensions fall back to application/octet-stream
 * (plan L5 — Platform SaveFilePickerOptions carries no mime field, so the client derives
 * it). DocumentsUI saves octet-stream payloads to user-chosen locations fine.
 */
export declare function mimeFromFilename(name: string): string;
/** Encode bytes as standard base64 (no line breaks). */
export declare function bytesToBase64(bytes: Uint8Array): string;
/**
 * Decode strict standard base64 (whitespace tolerated). Throws FilesError("io") on any
 * malformed input (the io code for decode failure, plan acceptance 2).
 */
export declare function base64ToBytes(text: string): Uint8Array;
export type SaveFileInput = {
    title?: string;
    defaultPath?: string;
};
export interface FilesPort {
    /**
     * Read one image from the device clipboard. NEVER throws: every failure path (bridge
     * unavailable, explicit unsupported wire code, oversized payload, malformed response)
     * degrades to null — the Platform `readClipboardImage` contract is `File | null` and
     * the upstream paste chain awaits it without a try/catch.
     */
    clipboardImage(): Promise<File | null>;
    /**
     * Platform saveFile contract (platform.tsx `saveFile?`): resolves true when the content
     * was written to the user-chosen location, false when the user cancelled the SAF
     * dialog, throws FilesError on any hard failure (unavailable/too-large/unsupported/io/
     * busy) — upstream consumers catch the throw and show their failed toast.
     */
    saveFile(opts: SaveFileInput, content: string): Promise<boolean>;
    /**
     * Share one data: URL through the system share sheet. Resolves true when the sheet was
     * delivered to the target picker, false when the native side declined (caller falls
     * back — plan L6), throws FilesError on hard failures.
     */
    shareDataUrl(dataUrl: string, filename: string, mime: string): Promise<boolean>;
    /**
     * Hand one URL to the shell's outbound external-open face (issue #76, N08): the native
     * ACTION_VIEW over the enforced ExternalOpenPolicy (http/https only, userinfo refused).
     * NEVER throws: every failure path (bridge unavailable, policy refusal, no handler app,
     * malformed response) resolves false and the native side shows the failure Toast — the
     * Platform `openExternal` contract is `void` and upstream consumers call it without a
     * try/catch, so a throw would surface as an uncaught exception in click handlers (the
     * OAuth controller's catch -> browserFailed face stays unreachable, same as web).
     */
    openExternal(url: string): Promise<boolean>;
}
/**
 * Fail-closed stub: never touches a bridge, never fakes a capability. Per-field semantics
 * (clipboardImage null / shareDataUrl false equivalent; saveFile false an intentional
 * behavior change) are documented in the module header.
 */
export declare const StubFilesPort: FilesPort;
/** Register the bridge-backed client (the entry bootstrap, M-020). Undefined resets. */
export declare function setActiveFilesPort(port: FilesPort | undefined): void;
/** The active port. Never undefined: the stub is the fail-closed default. */
export declare function activeFilesPort(): FilesPort;
/** Whether a real (non-stub) port was injected. */
export declare function filesBridgeInjected(): boolean;
/**
 * The bridge-backed files port. Failure mapping per method: clipboardImage degrades
 * EVERYTHING to null (never throws); saveFile throws on hard failures and only resolves
 * false for the native `{saved:false}` answer (upstream "false = user cancel" contract);
 * shareDataUrl throws on hard failures and resolves false when the native side declines;
 * openExternal degrades EVERYTHING to false (never throws — the Platform `void` contract
 * has no catch upstream; the native side carries the user-visible failure Toast).
 */
export declare function createFilesClient(transport: FilesBridgeTransport): FilesPort;
