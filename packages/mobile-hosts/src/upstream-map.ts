// Mapping from first-party host records + state machine to the upstream server model
// (issue #3, decision D2).
//
// The upstream shape mirrored here is `ServerConnection.Plugin` from
// vendor/upstream/packages/app/src/runtime/server/registry.tsx and `ServerState` from
// vendor/upstream/packages/plugin/src/gui/registries.ts. The type is duplicated
// structurally ON PURPOSE: the first-party package must not import from the vendored app
// (would drag the whole app into this package's graph and invert the dependency direction).
// test/upstream-map.test.ts locks the structural conformance, including a source-level
// cross-check of the vendored discriminant/field names (issue #90: the M-037 rename moved
// this mirror's shape from `Extension`/`extension:` to `Plugin`/`plugin:`; the stale shape
// made the vendored ServerConnection.key() switch fall through, collapsing every SSH host
// into one `undefined` registry key).

import { hostKey } from "./identity"
import type { HostRecord } from "./registry"
import type { TransportEndpoint } from "./ports"
import type { HostState } from "./state-machine"

/** Mirror of upstream gui host `ServerState`. */
export type ServerState = "stopped" | "starting" | "auth" | "ready" | "failed" | "incompatible"

/**
 * Mirror of the upstream `ServerHttpBase` shape the plugin hooks deal in
 * (reconnect resolves one). The endpoint a tunnel re-resolves to is loopback http with a
 * possibly-new port; a password is never part of it (service auth is upstream's business).
 */
export type ExtensionHttpBase = { url: string; password?: string; credentialRef?: string }

/** Mirror of upstream app `ServerConnection.Plugin` (first-party name kept: issue #90 D-naming continuity). */
export interface ExtensionConnection {
  type: "plugin"
  key: string
  plugin: string
  /** v2.2.7 tagged server status; only `ready` carries a usable endpoint. */
  status:
    | { type: "stopped" | "starting" | "auth" | "failed" | "incompatible" }
    | { type: "ready"; http: ExtensionHttpBase }
  /** Legacy inventory fields retained for older app surfaces during the migration. */
  state: ServerState
  connecting: boolean
  authenticationRequired: boolean
  /** True: the endpoint is re-resolved on drop (SSH tunnel), so health re-probes on change. */
  managed: boolean
  http: { url: string; password?: string }
  displayName?: string
  label?: string
  /**
   * Issue #6 hooks (optional, mirroring the upstream Plugin type):
   * - reconnect: re-resolves the tunnel endpoint through the machine (T10/T11 pipeline);
   *   the vendored client's connection watchdog calls it when the event stream drops.
   * - connect: backs the upstream inline sign-in (authenticate path, T6 -> T1 revised);
   *   resolves true once the connection is ready.
   */
  reconnect?: (signal: AbortSignal) => Promise<ExtensionHttpBase>
  authenticate: (onConnected?: () => void) => boolean
  connect?: () => Promise<boolean>
}

/** Upstream's sentinel endpoint for contributed servers without an endpoint yet. */
const OFFLINE_ENDPOINT = "http://127.0.0.1:0"

/**
 * Total mapping from the host state machine to the upstream ServerState
 * (docs/design/units/connection.md, "映射到上游 ServerState").
 */
export function mapStateToServerState(state: HostState): ServerState {
  switch (state) {
    case "idle":
      return "stopped"
    case "connecting":
    case "reconnecting":
    case "hostKeyUnverified":
      return "starting"
    case "ready":
      return "ready"
    case "authRequired":
      return "auth"
    case "incompatible":
      return "incompatible"
    case "offline":
    case "failed":
      return "failed"
  }
}

export interface ToExtensionConnectionInput {
  record: HostRecord
  state: HostState
  /** Resolved tunnel endpoint, memory-only; present once a transport is up (issue #6). */
  endpoint?: TransportEndpoint
  /** Tunnel re-resolution hook (issue #6) — forwarded onto the extension connection. */
  reconnect?: (signal: AbortSignal) => Promise<ExtensionHttpBase>
  /** Inline sign-in hook (issue #6) — forwarded onto the extension connection. */
  connect?: () => Promise<boolean>
}

export function toExtensionConnection(input: ToExtensionConnectionInput): ExtensionConnection {
  const serverState = mapStateToServerState(input.state)
  const http =
    input.state === "ready" && input.endpoint
      ? { url: input.endpoint.url, password: input.endpoint.password }
      : { url: OFFLINE_ENDPOINT }

  return {
    type: "plugin",
    key: hostKey(input.record.id),
    plugin: "mobile-ssh",
    // The v2.2.7 contract does not allow a ready status without an endpoint. A ready
    // state without one is an incomplete snapshot, so expose it as failed rather than
    // manufacturing a ready status that downstream health code cannot consume.
    status:
      input.state === "ready" && input.endpoint
        ? { type: "ready", http: { url: input.endpoint.url, password: input.endpoint.password } }
        : input.state === "ready"
          ? { type: "failed" }
          : { type: mapStateToServerState(input.state) as Exclude<ServerState, "ready"> },
    state: serverState,
    connecting: input.state === "connecting" || input.state === "reconnecting" || input.state === "hostKeyUnverified",
    authenticationRequired: input.state === "authRequired",
    managed: true,
    // Endpoint and service password live in memory only and only surface on the ready state.
    // A non-ready connection never exposes a real endpoint URL; no credential enters storage.
    http,
    displayName: input.record.name,
    label: "SSH",
    // The hooks are only present when provided: a shell without the ssh wiring (stub
    // phase) produces the exact pre-#6 shape. Fields must never be undefined-valued —
    // upstream branches on presence (`!!entry().reconnect`).
    ...(input.reconnect ? { reconnect: input.reconnect } : {}),
    ...(input.connect ? { connect: input.connect } : {}),
    authenticate: (onConnected) => {
      if (input.state !== "authRequired" || !input.connect) return false
      void input.connect().then((ready) => {
        if (ready) onConnected?.()
      })
      return true
    },
  }
}

/** Structural conformance check against the upstream Plugin shape. */
export function assertExtensionShape(conn: unknown): conn is ExtensionConnection {
  if (typeof conn !== "object" || conn === null) return false
  const c = conn as Record<string, unknown>
  return (
    c["type"] === "plugin" &&
    typeof c["key"] === "string" &&
    c["key"].startsWith("mobile-ssh:") &&
    typeof c["plugin"] === "string" &&
    typeof c["status"] === "object" &&
    c["status"] !== null &&
    typeof c["state"] === "string" &&
    ["stopped", "starting", "auth", "ready", "failed", "incompatible"].includes(c["state"] as string) &&
    typeof c["connecting"] === "boolean" &&
    typeof c["authenticationRequired"] === "boolean" &&
    typeof c["managed"] === "boolean" &&
    typeof c["http"] === "object" &&
    c["http"] !== null &&
    typeof (c["http"] as Record<string, unknown>)["url"] === "string"
  )
}
