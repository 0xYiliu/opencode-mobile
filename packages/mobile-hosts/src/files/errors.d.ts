export type FilesErrorCode = "unavailable" | "too-large" | "unsupported" | "io" | "busy" | "cancelled";
/** Every FilesErrorCode, in canonical order. */
export declare const FILES_ERROR_CODES: readonly ["unavailable", "too-large", "unsupported", "io", "busy", "cancelled"];
export declare function isFilesErrorCode(value: unknown): value is FilesErrorCode;
/**
 * Thrown by the files bridge transport and client on hard failures. `false` returns
 * (user cancellation per the Platform saveFile contract) never travel through here.
 */
export declare class FilesError extends Error {
    readonly code: FilesErrorCode;
    constructor(code: FilesErrorCode, message?: string);
}
