import { FilesError } from "./errors";
/** The handshake string the native side posts with the transferable port. */
export declare const FILES_HANDSHAKE = "opencode-mobile-files-handshake";
/**
 * Bridge constants; `marker` anchors the dist audit (mobile(files-v1)) the same way
 * mobile(svcops-v1)/mobile(ssh-v1)/mobile(probe-v1)/mobile(vault-v1) do — the string
 * survives minification inside this used object.
 */
export declare const FILES_BRIDGE: {
    readonly marker: "mobile(files-v1): file bridge transport over the platform web message channel";
    readonly handshake: "opencode-mobile-files-handshake";
};
export type FilesBridgeOperation = "clipboardImage" | "save" | "share" | "openExternal";
export type FilesBridgeResponse = {
    id: string;
    ok: true;
    result: Record<string, unknown>;
} | {
    id: string;
    ok: false;
    code: string;
    message?: string;
};
export interface FilesBridgeTransport {
    status(): "unavailable" | "available";
    onReady(listener: (available: boolean) => void): () => void;
    /**
     * Send one request and correlate by requestId. Throws FilesError("unavailable") before
     * capture, after channel death, or on a timed-out request (explicit unavailable state —
     * never a silent hang).
     */
    request(op: FilesBridgeOperation, params: Record<string, unknown>): Promise<FilesBridgeResponse>;
    dispose(): void;
}
export interface WebMessageFilesTransportOptions {
    /** Subscribe to candidate handshake events (the entry wires this to window messages). */
    subscribe(handler: (event: {
        data: unknown;
        ports?: unknown;
    }) => void): () => void;
    /**
     * Per-request timeout. Must exceed real user interaction with the system SAF/share
     * sheets; default 300000ms (5 min). A hung bridge dies into an explicit unavailable
     * state.
     */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * The production transport: listens for the native files handshake, captures the port
 * into this closure (never a global), acks immediately and serves requestId-correlated
 * requests. The vault/probe/ssh/svcops handshake strings are NOT captured here and this
 * module's handshake is not captured by them — strict data equality on both sides keeps
 * the five bridges isolated even though all listeners sit on the same window messages.
 */
export declare function createWebMessageFilesTransport(options: WebMessageFilesTransportOptions): FilesBridgeTransport;
/**
 * Error-response -> FilesError. A recognized wire code keeps its classification; an
 * unknown code degrades to io (a cause is never fabricated — the ssh
 * bridgeErrorToTransportError lesson).
 */
export declare function bridgeErrorToFilesError(code: string, message?: string): FilesError;
