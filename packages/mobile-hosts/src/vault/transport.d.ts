import { type VaultErrorCode } from "./types";
/** @deprecated Test-only legacy handshake marker; production protocol v2 does not use it. */
export declare const VAULT_HANDSHAKE = "opencode-mobile-vault-handshake";
/**
 * Bridge constants object; `marker` anchors the v2 dist audit (docs/build-and-verify.md):
 * the string survives minification inside this used object and lets the built bundle be
 * checked for the vault contract (mobile(vault-v2)) the same way mobile(M-002) is.
 */
export declare const VAULT_BRIDGE: {
    readonly marker: "mobile(vault-v2): Keystore envelope v1 over origin-bound AndroidX WebMessageListener";
    readonly handshake: "opencode-mobile-vault-handshake";
};
export type VaultOperation = "put" | "remove" | "get" | "list";
/** AndroidX WebViewCompat.addWebMessageListener injected object (protocol v2). */
export interface VaultNativeListener {
    postMessage(message: string): void;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
}
export declare function createAndroidXVaultTransport(listener: VaultNativeListener | undefined, options?: {
    timeoutMs?: number;
    requestId?: () => string;
}): VaultTransport;
export type VaultResponse = {
    id: string;
    ok: true;
    result: unknown;
} | {
    id: string;
    ok: false;
    code: VaultErrorCode;
    message?: string;
    recoveryRef?: string;
};
/** Minimal view of the message event the subscriber receives (data/ports only — never origin). */
export interface VaultHandshakeEvent {
    data: unknown;
    ports?: unknown;
}
/** The duck-typed port surface this module relies on (Android WebMessagePort and the test engine both match it). */
export interface VaultPortLike {
    postMessage(message: string): void;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
    close?: () => void;
}
export interface VaultTransport {
    /** Current availability (available after the v2 non-mutating readiness roundtrip). */
    status(): "unavailable" | "available";
    /** Subscribe to availability flips; returns an unsubscribe function. */
    onReady(listener: (available: boolean) => void): () => void;
    /**
     * Send one request over the captured port and correlate the response by requestId.
     * Throws VaultError("unavailable") before capture or after the channel died.
     */
    request(op: VaultOperation, params: Record<string, unknown>): Promise<VaultResponse>;
    /** Tear down: unsubscribe, close the port, reject pending requests. Idempotent. */
    dispose(): void;
}
export interface WebMessageChannelTransportOptions {
    /**
     * Subscribe to candidate handshake events (the entry wires this to window "message"
     * events; tests feed synthetic events). The handler receives the event as-is.
     */
    subscribe(handler: (event: VaultHandshakeEvent) => void): () => void;
    /** Per-request timeout; a dead bridge must not hang callers. Default 15000ms. */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * Legacy in-process test transport: listens for the former native handshake, captures its
 * port and serves request/response correlation. Production never calls this function.
 */
export declare function createWebMessageChannelTransport(options: WebMessageChannelTransportOptions): VaultTransport;
export interface InProcessVaultHandlers {
    /** Handle one validated native-side operation. Throwing a VaultError maps to an error response. */
    handle(op: VaultOperation, params: Record<string, unknown>): Promise<unknown>;
}
export interface InProcessVaultEngine {
    client: VaultTransport;
    native: {
        /** Deliver the handshake to the client subscriber (as the WebView would) and process the ack. */
        connect(): void;
        /** Deliver an arbitrary event shape to the subscriber (malformed-handshake tests). */
        deliver(event: VaultHandshakeEvent): void;
        /** Messages the client posted on the port, oldest first (raw JSON strings). */
        sent(): string[];
        /** Push a JSON message to the client as the native side would (handcrafted responses). */
        push(raw: unknown): void;
        /** Run queued client messages through the operation handlers (auto-invoked by default). */
        pump(): Promise<void>;
        /** Whether the client's ack arrived. */
        acked(): boolean;
    };
}
/**
 * A fake native bridge in-process. By default it auto-pumps client messages through the
 * supplied handlers (so put/remove/get/list round-trip synchronously-ish); tests can also
 * drive handcrafted responses via push().
 */
export declare function createInProcessVaultEngine(handlers: InProcessVaultHandlers, options?: {
    timeoutMs?: number;
    requestId?: () => string;
}): InProcessVaultEngine;
