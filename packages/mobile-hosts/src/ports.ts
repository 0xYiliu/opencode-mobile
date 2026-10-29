// Platform seams (ports) for the host registry. Everything that eventually talks to the
// device or the network lives behind these interfaces; the first-party package itself has
// zero platform APIs (AGENTS.md architecture rule).
//
// Fail-closed defaults stay in charge: the verifier stub always rejects and the transport
// stub never opens — a shell that injects nothing can never connect. The real SSH
// counterparts (issue #6) are injectable factories (./ssh) and never change these port
// semantics: verify -> trust|prompt|reject, open -> {url, password?}, fingerprints and
// failure reasons live in memory only, teardown is local (the remote service keeps
// running). BLOCKED status of the runtime gates does not alter the contracts.

/**
 * The verifier's decision. `reject` carries an optional `reason` (issue #6): "changed"
 * marks the hard host-key-changed refusal (the stored key no longer matches) — it must
 * never be presented as a first-contact rejection. Absent reason = the plain refusal
 * (stub, or the user's own rejection downstream).
 */
export type HostKeyDecision =
  | { action: "trust" }
  | { action: "prompt"; fingerprint: string }
  | { action: "reject"; reason?: "changed" }

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
   * interim events (host key, connection loss) arrive through `onEvent`. Implementations
   * must never signal the remote service on teardown — closing a tunnel only tears down
   * the SSH transport (SSH_MSG_DISCONNECT) and releases the local listener; the remote
   * OpenCode process keeps running (AGENTS.md red line, F8① precise wording).
   *
   * `servicePort` (issue #6, additive optional field): the remote OpenCode service port
   * the tunnel forwards to (remote loopback `localhost:<servicePort>`). Absent means the
   * implementation default (DEFAULT_SERVICE_PORT). The open semantics themselves
   * (target/credential/pinnedFingerprint/signal -> endpoint) are unchanged.
   */
  open(input: {
    target: string
    credential?: string
    pinnedFingerprint?: string
    servicePort?: number
    signal: AbortSignal
    onEvent: (event: TransportEvent) => void
  }): Promise<TransportEndpoint>
}

/**
 * TransportEvent: `hostKey` re-enters the confirmation flow mid-attempt; `connectionLost`
 * (issue #6) reports a client-side tunnel drop — the remote service keeps running and the
 * machine routes it to offline (T9). No remote signal ever originates from an event.
 */
export type TransportEvent = { type: "hostKey"; fingerprint: string } | { type: "connectionLost" }

/** Thrown by the stub transport (and the real transport on hard failure). */
export class TransportUnavailableError extends Error {
  constructor(message = "SSH transport unavailable (no bridge injected)") {
    super(message)
    this.name = "TransportUnavailableError"
  }
}

/** Stub transport: never opens anything. Fail-closed default; the SSH tunnel needs an injected bridge transport (issue #6). */
export const StubHostTransport: HostTransport = {
  open: async () => {
    throw new TransportUnavailableError()
  },
}
