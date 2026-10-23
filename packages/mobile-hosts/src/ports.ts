// Platform seams (ports) for the host registry. Everything that eventually talks to the
// device or the network lives behind these interfaces; the first-party package itself has
// zero platform APIs (AGENTS.md architecture rule).
//
// This phase ships fail-closed stubs only:
// - HostKeyVerifier stub: always "reject" — an unverified host key is NEVER bypassed and
//   there is no "skip verification" path anywhere. Real fingerprint verification lands
//   with the SSH transport, issue #6. BLOCKED.
// - HostTransport stub: always fails to open — the SSH tunnel is issue #6. BLOCKED.
// - CredentialResolver: see ./credential-ref (NullResolver returns undefined; real
//   keystore-backed resolution is issue #4). BLOCKED.

export type HostKeyDecision = { action: "trust" } | { action: "prompt"; fingerprint: string } | { action: "reject" }

export interface HostKeyVerifier {
  /** Decide what to do with a host's key before any connection attempt proceeds. */
  verify(input: { host: string }): Promise<HostKeyDecision>
}

/**
 * Fail-closed stub: rejects every host. It never returns "trust" and never "prompt"
 * (nothing real to prompt with), so no connection is ever attempted against an
 * unverified host key. Tests lock this in.
 */
export const StubHostKeyVerifier: HostKeyVerifier = {
  verify: async () => ({ action: "reject" }),
}

/** The endpoint a transport exposes once a tunnel is up. Memory-only. */
export type TransportEndpoint = { url: string; password?: string }

export interface HostTransport {
  /**
   * Open the tunnel for a target. Resolves with the loopback endpoint to call through;
   * interim events (host key) arrive through `onEvent`. Implementations must never
   * signal the remote service on teardown — closing a tunnel only releases the local
   * listener (remote tasks keep running, AGENTS.md red line).
   */
  open(input: {
    target: string
    credential?: string
    pinnedFingerprint?: string
    signal: AbortSignal
    onEvent: (event: TransportEvent) => void
  }): Promise<TransportEndpoint>
}

export type TransportEvent = { type: "hostKey"; fingerprint: string }

/** Thrown by the stub transport (and real transport on hard failure). */
export class TransportUnavailableError extends Error {
  constructor(message = "SSH transport unavailable (tunnel is issue #6)") {
    super(message)
    this.name = "TransportUnavailableError"
  }
}

/** Stub transport: never opens anything. SSH tunnel is issue #6 — BLOCKED. */
export const StubHostTransport: HostTransport = {
  open: async () => {
    throw new TransportUnavailableError()
  },
}
