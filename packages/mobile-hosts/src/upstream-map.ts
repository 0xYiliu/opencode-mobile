// Mapping from first-party host records + state machine to the upstream server model
// (issue #3, decision D2).
//
// The upstream shape mirrored here is `ServerConnection.Extension` from
// vendor/upstream/packages/app/src/runtime/server/registry.tsx and `ServerState` from
// vendor/upstream/packages/gui-extensions/src/sdk/registries.ts. The type is duplicated
// structurally ON PURPOSE: the first-party package must not import from the vendored app
// (would drag the whole app into this package's graph and invert the dependency direction).
// test/upstream-map.test.ts locks the structural conformance.

import { hostKey } from "./identity"
import type { HostRecord } from "./registry"
import type { TransportEndpoint } from "./ports"
import type { HostState } from "./state-machine"

/** Mirror of upstream gui-extensions `ServerState`. */
export type ServerState = "stopped" | "starting" | "auth" | "ready" | "failed" | "incompatible"

/**
 * Mirror of the upstream `ServerHttpBase` shape the Extension hooks deal in
 * (reconnect resolves one). The endpoint a tunnel re-resolves to is loopback http with a
 * possibly-new port; a password is never part of it (service auth is upstream's business).
 */
export type ExtensionHttpBase = { url: string; password?: string; credentialRef?: string }

/** Mirror of upstream app `ServerConnection.Extension`. */
export interface ExtensionConnection {
  type: "extension"
  key: string
  extension: string
  state: ServerState
  connecting: boolean
  authenticationRequired: boolean
  /** True: the endpoint is re-resolved on drop (SSH tunnel), so health re-probes on change. */
  managed: boolean
  http: { url: string; password?: string }
  displayName?: string
  label?: string
  /**
   * Issue #6 hooks (optional, mirroring the upstream Extension type):
   * - reconnect: re-resolves the tunnel endpoint through the machine (T10/T11 pipeline);
   *   the vendored client's connection watchdog calls it when the event stream drops.
   * - connect: backs the upstream inline sign-in (authenticate path, T6 -> T1 revised);
   *   resolves true once the connection is ready.
   */
  reconnect?: (signal: AbortSignal) => Promise<ExtensionHttpBase>
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
  return {
    type: "extension",
    key: hostKey(input.record.id),
    extension: "mobile-ssh",
    state: serverState,
    connecting: input.state === "connecting" || input.state === "reconnecting" || input.state === "hostKeyUnverified",
    authenticationRequired: input.state === "authRequired",
    managed: true,
    // Endpoint and service password live in memory only and only surface on the ready state.
    // A non-ready connection never exposes a real endpoint URL; no credential enters storage.
    http:
      input.state === "ready" && input.endpoint
        ? { url: input.endpoint.url, password: input.endpoint.password }
        : { url: OFFLINE_ENDPOINT },
    displayName: input.record.name,
    label: "SSH",
    // The hooks are only present when provided: a shell without the ssh wiring (stub
    // phase) produces the exact pre-#6 shape. Fields must never be undefined-valued —
    // upstream branches on presence (`!!entry().reconnect`).
    ...(input.reconnect ? { reconnect: input.reconnect } : {}),
    ...(input.connect ? { connect: input.connect } : {}),
  }
}

/** Structural conformance check against the upstream Extension shape. */
export function assertExtensionShape(conn: unknown): conn is ExtensionConnection {
  if (typeof conn !== "object" || conn === null) return false
  const c = conn as Record<string, unknown>
  return (
    c["type"] === "extension" &&
    typeof c["key"] === "string" &&
    c["key"].startsWith("mobile-ssh:") &&
    typeof c["extension"] === "string" &&
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
