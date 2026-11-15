import { SshTransportError } from "../transport/ssh-errors";
/** The second-stage handshake string native posts with the transferable request port. */
export declare const SSH_HANDSHAKE = "opencode-mobile-ssh-handshake";
/** AndroidX source-origin/main-frame signal that the page listener is ready for the port channel. */
export declare const SSH_BOOTSTRAP_MESSAGE = "opencode-mobile-ssh-bootstrap-v2";
/**
 * Bridge constants; `marker` anchors the dist audit (mobile(ssh-v1)) the same way
 * mobile(M-002)/mobile(vault-v1)/mobile(probe-v1) do — the string survives minification
 * inside this used object.
 */
export declare const SSH_BRIDGE: {
    readonly marker: "mobile(ssh-v1): ssh tunnel transport over the platform web message channel";
    readonly handshake: "opencode-mobile-ssh-handshake";
};
export type SshBridgeOperation = "connect" | "disconnect" | "fetchHostKey" | "removeHostKey" | "cancel";
/** Native-pushed event (no requestId): the client-side tunnel dropped; the remote keeps running. */
export type SshBridgeEvent = {
    type: "connectionLost";
    host: string;
    port: number;
};
export type SshBridgeResponse = {
    id: string;
    ok: true;
    result: Record<string, unknown>;
} | {
    id: string;
    ok: false;
    code: string;
    message?: string;
};
export interface SshBridgeTransport {
    status(): "unavailable" | "available";
    onReady(listener: (available: boolean) => void): () => void;
    /** Subscribe to unsolicited native events (connectionLost). Returns an unsubscribe. */
    onEvent(listener: (event: SshBridgeEvent) => void): () => void;
    /**
     * Send one request and correlate by requestId. Throws SshTransportError("bridge-unavailable")
     * before capture, after channel death, or on a timed-out request (explicit unavailable
     * state — never a silent hang).
     */
    request(op: SshBridgeOperation, params: Record<string, unknown>): Promise<SshBridgeResponse>;
    dispose(): void;
}
export interface WebMessageSshTransportOptions {
    /** Subscribe to candidate handshake events (the entry wires this to window messages). */
    subscribe(handler: (event: {
        data: unknown;
        ports?: unknown;
    }) => void): () => void;
    /** Ask native to post a channel only after the page has installed its message listener. */
    requestNativeHandshake?: () => void;
    /**
     * Per-request timeout. Must exceed the native bounds (connect 30s, key scan 15s —
     * decision 0003 F6/F2); default 45000ms. A hung bridge dies into an explicit
     * unavailable state.
     */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * The production request transport: subscribes to window messages first, then signals the
 * native AndroidX bootstrap to post the SSH channel. It captures that channel into this
 * closure (never a global), acks immediately, serves requestId-correlated requests and
 * routes unsolicited native events (connectionLost). The vault/probe channel handshakes
 * are not captured here; strict data equality keeps each transferred-port protocol isolated.
 */
export declare function createWebMessageSshTransport(options: WebMessageSshTransportOptions): SshBridgeTransport;
/** The connect result endpoint: loopback http(s) URL only — the tunnel never yields a remote origin. */
export declare function parseBridgeEndpoint(result: Record<string, unknown>): {
    url: string;
    password?: string;
};
/** Validated service port for the connect params (defense in depth above the registry). */
export declare function bridgeServicePort(servicePort: number | undefined): number;
/** Error-response -> SshTransportError (unknown codes degrade to "io", never fabricated causes). */
export declare function bridgeErrorToTransportError(code: string, message?: string): SshTransportError;
