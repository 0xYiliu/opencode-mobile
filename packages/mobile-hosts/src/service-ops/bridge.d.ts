import { ServiceOpsError } from "./errors";
/** The handshake string the native side posts with the transferable port. */
export declare const SVCOPS_HANDSHAKE = "opencode-mobile-svcops-handshake";
/**
 * Bridge constants; `marker` anchors the dist audit (mobile(svcops-v1)) the same way
 * mobile(ssh-v1)/mobile(vault-v1)/mobile(probe-v1) do — the string survives minification
 * inside this used object.
 */
export declare const SVCOPS_BRIDGE: {
    readonly marker: "mobile(svcops-v1): service ops exec transport over the platform web message channel";
    readonly handshake: "opencode-mobile-svcops-handshake";
};
export type ServiceOpsBridgeOperation = "exec" | "cancel";
/** One executed whitelisted command: bounded output, explicit truncation, real exit code. */
export type ServiceOpsExecResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
};
export type ServiceOpsBridgeResponse = {
    id: string;
    ok: true;
    result: ServiceOpsExecResult;
} | {
    id: string;
    ok: false;
    code: string;
    message?: string;
};
export interface ServiceOpsBridgeTransport {
    status(): "unavailable" | "available";
    onReady(listener: (available: boolean) => void): () => void;
    /**
     * Send one request and correlate by requestId. Throws ServiceOpsError("svcops-unavailable")
     * before capture, after channel death, or on a timed-out request (explicit unavailable
     * state — never a silent hang).
     */
    request(op: ServiceOpsBridgeOperation, params: Record<string, unknown>): Promise<ServiceOpsBridgeResponse>;
    dispose(): void;
}
export interface WebMessageServiceOpsTransportOptions {
    /** Subscribe to candidate handshake events (the entry wires this to window messages). */
    subscribe(handler: (event: {
        data: unknown;
        ports?: unknown;
    }) => void): () => void;
    /**
     * Per-request timeout. Must exceed the native exec bounds (decision 0004 F-svcops);
     * default 60000ms. A hung bridge dies into an explicit unavailable state.
     */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * The production transport: listens for the native svcops handshake, captures the port
 * into this closure (never a global), acks immediately and serves requestId-correlated
 * requests. The vault/probe/ssh handshake strings are NOT captured here and this
 * module's handshake is not captured by them — strict data equality on both sides keeps
 * the four bridges isolated even though all listeners sit on the same window messages.
 */
export declare function createWebMessageServiceOpsTransport(options: WebMessageServiceOpsTransportOptions): ServiceOpsBridgeTransport;
/** Validate one exec result shape (bounded strings + explicit truncation flags). */
export declare function parseBridgeExecResult(result: Record<string, unknown>): ServiceOpsExecResult;
/**
 * Error-response -> ServiceOpsError. A recognized wire code keeps its classification;
 * an unknown code degrades to exec-failed (a cause is never fabricated — the ssh
 * bridgeErrorToTransportError lesson).
 */
export declare function bridgeErrorToServiceOpsError(code: string, message?: string): ServiceOpsError;
