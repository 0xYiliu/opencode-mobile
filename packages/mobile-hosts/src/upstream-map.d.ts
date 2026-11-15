import type { HostRecord } from "./registry";
import type { TransportEndpoint } from "./ports";
import type { HostState } from "./state-machine";
/** Mirror of upstream gui host `ServerState`. */
export type ServerState = "stopped" | "starting" | "auth" | "ready" | "failed" | "incompatible";
/**
 * Mirror of the upstream `ServerHttpBase` shape the plugin hooks deal in
 * (reconnect resolves one). The endpoint a tunnel re-resolves to is loopback http with a
 * possibly-new port; a password is never part of it (service auth is upstream's business).
 */
export type ExtensionHttpBase = {
    url: string;
    password?: string;
    credentialRef?: string;
};
/** Mirror of upstream app `ServerConnection.Plugin` (first-party name kept: issue #90 D-naming continuity). */
export interface ExtensionConnection {
    type: "plugin";
    key: string;
    plugin: string;
    /** v2.2.7 tagged server status; only `ready` carries a usable endpoint. */
    status: {
        type: "stopped" | "starting" | "auth" | "failed" | "incompatible";
    } | {
        type: "ready";
        http: ExtensionHttpBase;
    };
    /** Legacy inventory fields retained for older app surfaces during the migration. */
    state: ServerState;
    connecting: boolean;
    authenticationRequired: boolean;
    /** True: the endpoint is re-resolved on drop (SSH tunnel), so health re-probes on change. */
    managed: boolean;
    http: {
        url: string;
        password?: string;
    };
    displayName?: string;
    label?: string;
    /**
     * Issue #6 hooks (optional, mirroring the upstream Plugin type):
     * - reconnect: re-resolves the tunnel endpoint through the machine (T10/T11 pipeline);
     *   the vendored client's connection watchdog calls it when the event stream drops.
     * - connect: backs the upstream inline sign-in (authenticate path, T6 -> T1 revised);
     *   resolves true once the connection is ready.
     */
    reconnect?: (signal: AbortSignal) => Promise<ExtensionHttpBase>;
    authenticate: (onConnected?: () => void) => boolean;
    connect?: () => Promise<boolean>;
}
/**
 * Total mapping from the host state machine to the upstream ServerState
 * (docs/design/units/connection.md, "映射到上游 ServerState").
 */
export declare function mapStateToServerState(state: HostState): ServerState;
export interface ToExtensionConnectionInput {
    record: HostRecord;
    state: HostState;
    /** Resolved tunnel endpoint, memory-only; present once a transport is up (issue #6). */
    endpoint?: TransportEndpoint;
    /** Tunnel re-resolution hook (issue #6) — forwarded onto the extension connection. */
    reconnect?: (signal: AbortSignal) => Promise<ExtensionHttpBase>;
    /** Inline sign-in hook (issue #6) — forwarded onto the extension connection. */
    connect?: () => Promise<boolean>;
}
export declare function toExtensionConnection(input: ToExtensionConnectionInput): ExtensionConnection;
/** Structural conformance check against the upstream Plugin shape. */
export declare function assertExtensionShape(conn: unknown): conn is ExtensionConnection;
