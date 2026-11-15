/** The handshake string the native side posts with the transferable port. */
export declare const NOTIFICATIONS_HANDSHAKE = "opencode-mobile-notifications-handshake";
/**
 * Bridge constants; `marker` anchors the dist audit (mobile(notifications-v1)) the same way
 * mobile(files-v1)/mobile(svcops-v1)/mobile(ssh-v1)/mobile(probe-v1)/mobile(vault-v1) do —
 * the string survives minification inside this used object.
 */
export declare const NOTIFICATIONS_BRIDGE: {
    readonly marker: "mobile(notifications-v1): notifications bridge transport over the platform web message channel";
    readonly handshake: "opencode-mobile-notifications-handshake";
};
export type NotificationsBridgeOperation = "notify" | "requestPermission";
export type NotificationsBridgeResponse = {
    id: string;
    ok: true;
    result: Record<string, unknown>;
} | {
    id: string;
    ok: false;
    code: string;
    message?: string;
};
export interface NotificationsBridgeTransport {
    status(): "unavailable" | "available";
    onReady(listener: (available: boolean) => void): () => void;
    /**
     * Send one request and correlate by requestId. Rejects before capture, after channel
     * death, or on a timed-out request (explicit unavailable state — never a silent hang).
     */
    request(op: NotificationsBridgeOperation, params: Record<string, unknown>): Promise<NotificationsBridgeResponse>;
    dispose(): void;
}
export interface WebMessageNotificationsTransportOptions {
    /** Subscribe to candidate handshake events (the entry wires this to window messages). */
    subscribe(handler: (event: {
        data: unknown;
        ports?: unknown;
    }) => void): () => void;
    /**
     * Per-request timeout. Must exceed real user interaction with the system
     * POST_NOTIFICATIONS dialog; default 300000ms (5 min). A hung bridge dies into an
     * explicit unavailable state.
     */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * The production transport: listens for the native notifications handshake, captures the
 * port into this closure (never a global), acks immediately and serves requestId-correlated
 * requests. The five sibling handshake strings are NOT captured here and this module's
 * handshake is not captured by them — strict data equality on both sides keeps the six
 * bridges isolated even though all listeners sit on the same window messages.
 */
export declare function createWebMessageNotificationsTransport(options: WebMessageNotificationsTransportOptions): NotificationsBridgeTransport;
