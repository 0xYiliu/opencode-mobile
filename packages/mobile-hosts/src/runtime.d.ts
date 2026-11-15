import type { CredentialResolver } from "./credential-ref";
import type { CredentialVault } from "./vault/types";
import type { HostRegistry } from "./registry";
import type { HostKeyVerifier, HostTransport } from "./ports";
import type { StorageLike } from "./storage";
import type { HostState } from "./state-machine";
import type { ExtensionConnection } from "./upstream-map";
import type { Locale } from "./i18n";
import type { ProbePort } from "./probe";
import type { SshBridgeTransport } from "./ssh/bridge";
import type { FetchLike } from "./transport/secure-fetch";
export interface MobileHostsOptions {
    /** WebView storage for the host registry (whitelist payload; no credentials, ever). */
    storage?: StorageLike;
    /**
     * Fetch for future transport/health integration (issue #6/#4). Nothing calls it this
     * phase; accepted at the seam so the bootstrap contract does not change.
     */
    fetch?: FetchLike;
    /**
     * Credential reference resolver. Defaults to the vault-backed resolver when a vault is
     * injected, and to NullCredentialResolver otherwise (issue #3 — unresolvable refs yield
     * undefined). A vault-level failure (e.g. bridge unavailable) throws and lands the host
     * in the explicit failed state; a corrupt/missing entry yields undefined (failure matrix).
     */
    resolver?: CredentialResolver;
    /**
     * Device credential vault (issue #4). Defaults to the fail-closed UnavailableVault: an
     * explicit state, never a plaintext fallback. The Android shell injects the bridge client
     * (M-007 amendment); tests inject the in-process engine client.
     */
    vault?: CredentialVault;
    /** Host key verifier. Defaults to the fail-closed stub (issue #6 — BLOCKED). */
    hostKey?: HostKeyVerifier;
    /** SSH tunnel transport. Defaults to the stub that never opens (issue #6 — BLOCKED). */
    transport?: HostTransport;
    /**
     * Endpoint probe (issue #5, decision 0002 D4): the shell-side error classifier for the
     * direct-connection save path. Defaults to the fail-closed stub that always answers
     * { status: "unavailable" } — the caller degrades to the upstream generic error and a
     * classification is never fabricated. The Android shell injects the bridge-backed
     * client (M-014).
     */
    probe?: ProbePort;
    /**
     * The raw ssh bridge transport (issue #6): the recovery path (forgetHostKey after a
     * host-key change) speaks to the known_hosts store through it. Absent (default) makes
     * the recovery entry a no-op that reports false — the fail-closed posture again.
     */
    sshBridge?: SshBridgeTransport;
    /** UI locale; defaults to navigator.language detection. */
    locale?: Locale;
}
export interface MobileHosts {
    registry: HostRegistry;
    locale: Locale;
    /**
     * The device credential vault (issue #4). Fail-closed UnavailableVault unless injected;
     * UI surfaces its status explicitly (remember disabled + banner), never a downgrade.
     */
    credentials: CredentialVault;
    /**
     * The endpoint probe (issue #5). Fail-closed stub unless injected: classifications are
     * an error-message helper, never an authority (decision 0002 D4).
     */
    probe: ProbePort;
    /** Begin a connection attempt for a host (T1; verifier-gated, see below). */
    connect: (id: string) => void;
    /** Cancel the current attempt / disconnect from the host (T13). Zero remote calls. */
    disconnect: (id: string) => void;
    /** Re-enter reconnecting from offline (T10). */
    retry: (id: string) => void;
    /** Delete the host locally; retain its saved credential as an orphan for explicit cleanup. */
    remove: (id: string) => Promise<boolean>;
    /** Confirm a pending host key (T3). Stub phase: unreachable, verifier rejects first. */
    confirmHostKey: (id: string, expected: HostKeyConfirmation) => void;
    /** Reject a pending host key (T4). No connection attempt follows. */
    rejectHostKey: (id: string) => void;
    /**
     * Remove the stored host key for a target through the ssh bridge (issue #6 changed-key
     * recovery: an explicit danger confirmation above this call, never an automatic
     * overwrite). Resolves true when the key was removed; false when no bridge is wired or
     * the bridge refused. The next connect re-enters the unknown-fingerprint flow.
     */
    forgetHostKey: (id: string) => Promise<boolean>;
    /** Classify the current probe as incompatible (T7; wired into the post-open check). */
    markIncompatible: (id: string, version?: string) => void;
    /** Current machine state of a host (reactive store read). */
    stateOf: (id: string) => HostState;
    /** The in-memory host key fingerprint of a host (prompt flow; never persisted). */
    fingerprintOf: (id: string) => string | undefined;
    /** The in-memory failure reason of a host (classified code or transport message; never persisted). */
    failureReasonOf: (id: string) => string | undefined;
    /**
     * True when the injected storage was unavailable (or refused writes) and the registry
     * runs on the in-memory fallback: host records last for this session only. The UI must
     * surface this, not swallow it.
     */
    storageVolatile: boolean;
    /**
     * Reactive view of every SSH host as an upstream extension connection. Must be read
     * inside a tracking scope (the upstream ServersProvider reads it inside createMemo);
     * it is derived from solid stores, so registry and state changes propagate.
     */
    upstreamConnections: () => ExtensionConnection[];
    /** AppShell-owned initial SSH onboarding state; claimed before the host is published. */
    initialScreenOwned: () => boolean;
    claimInitialScreen: () => number;
    initialGeneration: () => number;
    ownInitialHost: (id: string) => void;
    releaseInitialScreen: (id?: string, generation?: number) => void;
    initialHostId: () => string | undefined;
    initialHostGeneration: () => number | undefined;
    serviceAuthRequiredOf: (id: string) => boolean;
    /** Abort and invalidate any in-flight service re-authentication check for this host. */
    cancelServiceAgain: (id: string) => void;
    checkServiceAgain: (id: string, password?: string) => Promise<boolean>;
}
export interface HostKeyConfirmation {
    target: string;
    servicePort: number;
    fingerprint: string;
}
/** The runtime bootstrapped by the entry (M-007). Throws before bootstrap. */
export declare const getMobileHosts: () => MobileHosts;
/**
 * Bootstrap the host registry + connection state machine and derive the reactive
 * upstream connections injected into the app (M-007).
 */
export declare function createMobileHosts(options?: MobileHostsOptions): MobileHosts;
