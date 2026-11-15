import type { MessageKey } from "./i18n";
import { type DirectErrorCode } from "./transport/connection-errors";
export type ProbeRequest = {
    url: string;
    password?: string;
};
export type ProbeResult = {
    status: "available";
    code: DirectErrorCode;
} | {
    status: "unavailable";
};
export interface ProbePort {
    /** Classify one endpoint. Never throws: every failure path degrades to unavailable. */
    probe(request: ProbeRequest): Promise<ProbeResult>;
}
/** Fail-closed stub: never classifies, never fakes. The caller shows the generic error. */
export declare const StubProbePort: ProbePort;
/**
 * The mobile-hosts i18n key of a classification ("direct.error.<code>"). This is the
 * FIRST-PARTY key set (used by first-party UI surfaces); the vendored connect dialog
 * (M-013) consumes the separate app-i18n keys dialog.server.error.<code> — two key sets,
 * two consumers, documented in docs/design/units/connection.md.
 */
export declare function directErrorCodeMessageKey(code: DirectErrorCode): MessageKey;
/** The handshake string the native side posts with the transferable port. */
export declare const PROBE_HANDSHAKE = "opencode-mobile-probe-handshake";
/**
 * Bridge constants; `marker` anchors the V-conn dist audit the same way mobile(M-002)/
 * mobile(vault-v1) do — the string survives minification inside this used object.
 */
export declare const PROBE_BRIDGE: {
    readonly marker: "mobile(probe-v1): endpoint probe classifier over the platform web message channel";
    readonly handshake: "opencode-mobile-probe-handshake";
};
export type ProbeBridgeResponse = {
    id: string;
    ok: true;
    result: {
        code: DirectErrorCode;
    };
} | {
    id: string;
    ok: false;
    code: string;
    message?: string;
};
export interface ProbeBridgeTransport {
    status(): "unavailable" | "available";
    onReady(listener: (available: boolean) => void): () => void;
    request(op: "probe", params: Record<string, unknown>): Promise<ProbeBridgeResponse>;
    dispose(): void;
}
export interface WebMessageProbeTransportOptions {
    /** Subscribe to candidate handshake events (the entry wires this to window messages). */
    subscribe(handler: (event: {
        data: unknown;
        ports?: unknown;
    }) => void): () => void;
    /** Per-request timeout; a dead bridge must not hang callers. Default 20000ms. */
    timeoutMs?: number;
    /** Injectable request id source (tests); defaults to crypto.randomUUID. */
    requestId?: () => string;
}
/**
 * The production transport: listens for the native probe handshake, captures the port
 * into this closure (never a global), acks immediately, serves requestId-correlated
 * probe requests. The vault handshake string is NOT captured here and this module's
 * handshake is not captured by the vault transport — the strict data equality on both
 * sides guarantees the two bridges stay isolated even though both listeners sit on the
 * same window message events.
 */
export declare function createWebMessageProbeTransport(options: WebMessageProbeTransportOptions): ProbeBridgeTransport;
/**
 * The bridge-backed probe port. EVERY failure path (bridge unavailable, error response,
 * malformed code, transport throw) degrades to { status: "unavailable" } — the caller
 * shows the upstream generic message; a classification is never invented here. A
 * credential-bearing (userinfo) URL never crosses the bridge: the transport-level
 * credential-url refusal is surfaced by the URL policy at the save path, not by a probe
 * that would have to send those credentials.
 */
export declare function createProbeClient(transport: ProbeBridgeTransport): ProbePort;
