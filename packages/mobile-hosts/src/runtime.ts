import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { NullCredentialResolver } from "./credential-ref"
import type { CredentialResolver } from "./credential-ref"
import { UnavailableVault } from "./vault/types"
import type { CredentialVault } from "./vault/types"
import { createVaultResolver } from "./vault/vault"
import type { HostRecord, HostRegistry } from "./registry"
import { createHostRegistry } from "./registry"
import { StubHostKeyVerifier, StubHostTransport } from "./ports"
import type { HostKeyVerifier, HostTransport } from "./ports"
import { safeStorage } from "./storage"
import type { StorageLike } from "./storage"
import { transition } from "./state-machine"
import type { HostEvent, HostState, MachineContext } from "./state-machine"
import { toExtensionConnection } from "./upstream-map"
import type { ExtensionConnection } from "./upstream-map"
import { detectLocale } from "./i18n"
import type { Locale } from "./i18n"
import { StubProbePort } from "./probe"
import type { ProbePort } from "./probe"

export interface MobileHostsOptions {
  /** WebView storage for the host registry (whitelist payload; no credentials, ever). */
  storage?: StorageLike
  /**
   * Fetch for future transport/health integration (issue #6/#4). Nothing calls it this
   * phase; accepted at the seam so the bootstrap contract does not change.
   */
  fetch?: typeof globalThis.fetch
  /**
   * Credential reference resolver. Defaults to the vault-backed resolver when a vault is
   * injected, and to NullCredentialResolver otherwise (issue #3 — unresolvable refs yield
   * undefined). A vault-level failure (e.g. bridge unavailable) throws and lands the host
   * in the explicit failed state; a corrupt/missing entry yields undefined (failure matrix).
   */
  resolver?: CredentialResolver
  /**
   * Device credential vault (issue #4). Defaults to the fail-closed UnavailableVault: an
   * explicit state, never a plaintext fallback. The Android shell injects the bridge client
   * (M-007 amendment); tests inject the in-process engine client.
   */
  vault?: CredentialVault
  /** Host key verifier. Defaults to the fail-closed stub (issue #6 — BLOCKED). */
  hostKey?: HostKeyVerifier
  /** SSH tunnel transport. Defaults to the stub that never opens (issue #6 — BLOCKED). */
  transport?: HostTransport
  /**
   * Endpoint probe (issue #5, decision 0002 D4): the shell-side error classifier for the
   * direct-connection save path. Defaults to the fail-closed stub that always answers
   * { status: "unavailable" } — the caller degrades to the upstream generic error and a
   * classification is never fabricated. The Android shell injects the bridge-backed
   * client (M-014).
   */
  probe?: ProbePort
  /** UI locale; defaults to navigator.language detection. */
  locale?: Locale
}

export interface MobileHosts {
  registry: HostRegistry
  locale: Locale
  /**
   * The device credential vault (issue #4). Fail-closed UnavailableVault unless injected;
   * UI surfaces its status explicitly (remember disabled + banner), never a downgrade.
   */
  credentials: CredentialVault
  /**
   * The endpoint probe (issue #5). Fail-closed stub unless injected: classifications are
   * an error-message helper, never an authority (decision 0002 D4).
   */
  probe: ProbePort
  /** Begin a connection attempt for a host (T1; verifier-gated, see below). */
  connect: (id: string) => void
  /** Cancel the current attempt / disconnect from the host (T13). Zero remote calls. */
  disconnect: (id: string) => void
  /** Re-enter reconnecting from offline (T10). */
  retry: (id: string) => void
  /** Delete the host record locally (T14). Zero remote calls — no transport reach at all. */
  remove: (id: string) => void
  /** Confirm a pending host key (T3). Stub phase: unreachable, verifier rejects first. */
  confirmHostKey: (id: string) => void
  /** Reject a pending host key (T4). No connection attempt follows. */
  rejectHostKey: (id: string) => void
  /** Classify the current probe as incompatible (T7/T8 path; real probe is issue #6). */
  markIncompatible: (id: string, version?: string) => void
  /** Current machine state of a host (reactive store read). */
  stateOf: (id: string) => HostState
  /**
   * True when the injected storage was unavailable (or refused writes) and the registry
   * runs on the in-memory fallback: host records last for this session only. The UI must
   * surface this, not swallow it.
   */
  storageVolatile: boolean
  /**
   * Reactive view of every SSH host as an upstream extension connection. Must be read
   * inside a tracking scope (the upstream ServersProvider reads it inside createMemo);
   * it is derived from solid stores, so registry and state changes propagate.
   */
  upstreamConnections: () => ExtensionConnection[]
}

// The shell has exactly one host runtime, bootstrapped once in the app entry (M-007).
// The settings mount point (M-008) reaches it through this accessor instead of prop
// drilling through the app's provider tree. Test runs overwrite it freely; production
// calls createMobileHosts exactly once per window.
let activeInstance: MobileHosts | undefined

/** The runtime bootstrapped by the entry (M-007). Throws before bootstrap. */
export const getMobileHosts = (): MobileHosts => {
  if (!activeInstance) throw new Error("mobile hosts not bootstrapped: createMobileHosts() must run first (entry bootstrap, M-007)")
  return activeInstance
}

/**
 * Bootstrap the host registry + connection state machine and derive the reactive
 * upstream connections injected into the app (M-007).
 */
export function createMobileHosts(options: MobileHostsOptions = {}): MobileHosts {
  const vault = options.vault ?? UnavailableVault
  const resolver = options.resolver ?? (options.vault ? createVaultResolver(vault) : NullCredentialResolver)
  const hostKeyVerifier = options.hostKey ?? StubHostKeyVerifier
  const transport = options.transport ?? StubHostTransport
  const probe = options.probe ?? StubProbePort

  // volatile: the storage candidate was unavailable/refused writes, so the registry runs
  // on the in-memory fallback. Surfaced on the runtime (N5) — never silent.
  const { storage: storagePort, volatile: storageVolatile } = safeStorage(options.storage)
  const registry = createHostRegistry({ storage: storagePort })

  // Runtime machine state per host, in a store so UI and upstreamConnections react.
  // Contains states, in-memory context and the in-memory endpoint — never fingerprints,
  // never credential values.
  const [runtime, setRuntime] = createStore<
    Record<string, { state: HostState; ctx: MachineContext; endpoint?: { url: string; password?: string } }>
  >({})

  const stateOf = (id: string): HostState => runtime[id]?.state ?? "idle"
  const ctxOf = (id: string): MachineContext => runtime[id]?.ctx ?? { source: "idle", retries: 0 }

  const send = (id: string, event: HostEvent) => {
    const current = stateOf(id)
    const result = transition(current, event, ctxOf(id))
    if (!result) return false // illegal transition: keep state
    // The endpoint only means something while ready; any other state drops it.
    const endpoint = result.state === "ready" ? runtime[id]?.endpoint : undefined
    setRuntime(id, { state: result.state, ctx: result.ctx, endpoint })
    return true
  }

  const setEndpoint = (id: string, endpoint: { url: string; password?: string } | undefined) => {
    const entry = runtime[id]
    if (!entry) return
    setRuntime(id, { state: entry.state, ctx: entry.ctx, endpoint })
  }

  const endpointOf = (id: string): { url: string; password?: string } | undefined => runtime[id]?.endpoint

  // Per-host attempt AbortControllers; aborted on cancel/delete so a stub/real transport
  // attempt stops without any remote signal.
  const attempts = new Map<string, AbortController>()

  const stopAttempt = (id: string) => {
    attempts.get(id)?.abort()
    attempts.delete(id)
  }

  const attemptOpen = async (id: string) => {
    const record = registry.get(id)
    if (!record) return
    const controller = new AbortController()
    attempts.set(id, controller)
    try {
      // Resolve the credential reference first (NullResolver this phase: undefined).
      const credential = record.credentialRef ? await resolver.resolve(record.credentialRef) : undefined
      if (controller.signal.aborted) return
      // Verify the host key BEFORE any connection attempt proceeds. The stub rejects
      // everything, so with the stub no transport.open call ever happens.
      const decision = await hostKeyVerifier.verify({ host: record.target })
      if (controller.signal.aborted) return
      if (decision.action === "reject") {
        send(id, { type: "fail", reason: "host-key-rejected" })
        return
      }
      if (decision.action === "prompt") {
        send(id, { type: "hostKeyPending", fingerprint: decision.fingerprint })
        return // wait for hostKeyConfirm/hostKeyReject from the UI
      }
      const endpoint = await transport.open({
        target: record.target,
        credential,
        pinnedFingerprint: ctxOf(id).fingerprint,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "hostKey") send(id, { type: "hostKeyPending", fingerprint: event.fingerprint })
        },
      })
      if (controller.signal.aborted) return
      setEndpoint(id, endpoint)
      send(id, { type: "ready" })
      // Health/incompatible classification (kind "ssh") drives { type: "incompatible" }
      // through markIncompatible below once a real probe exists (issue #6).
    } catch (error) {
      if (controller.signal.aborted) return
      send(id, { type: "fail", reason: error instanceof Error ? error.message : "transport-error" })
    } finally {
      // Clear this attempt's controller, unless a newer attempt has replaced it.
      if (attempts.get(id) === controller) attempts.delete(id)
    }
  }

  const connect = (id: string) => {
    if (!registry.get(id)) return
    if (!send(id, { type: "connect" })) return
    void attemptOpen(id)
  }

  const disconnect = (id: string) => {
    stopAttempt(id) // local teardown only: aborts the in-flight attempt, no remote signal
    send(id, { type: "cancel" })
    setEndpoint(id, undefined)
  }

  const retry = (id: string) => {
    if (!registry.get(id)) return
    // The reconnect budget lives in the machine: T8 routes a reconnecting failure back to
    // offline while the budget lasts and into failed once it is exhausted. Auto-retry
    // timers belong to the real transport (issue #6); this phase retry is user-actionable
    // from offline.
    if (!send(id, { type: "retry" })) return
    void attemptOpen(id)
  }

  const confirmHostKey = (id: string) => {
    if (!send(id, { type: "hostKeyConfirm" })) return
    void attemptOpen(id)
  }

  const rejectHostKey = (id: string) => {
    stopAttempt(id)
    send(id, { type: "hostKeyReject" })
  }

  const remove = (id: string) => {
    const record: HostRecord | undefined = registry.get(id)
    stopAttempt(id) // delete is local-only; aborting a pending local attempt is not a remote call
    send(id, { type: "delete" })
    setEndpoint(id, undefined)
    registry.remove(id)
    // Issue #4 linkage: deleting a host deletes its vault entry (T14 regression). Best
    // effort and local-only: a failed cleanup leaves the entry visible in the credential
    // manager's orphan zone instead of blocking or retrying anything remote.
    if (record?.credentialRef) {
      void vault.remove(record.credentialRef).catch(() => {})
    }
  }

  const markIncompatible = (id: string, version?: string) => {
    send(id, { type: "incompatible", version })
  }

  // Reactive derivation: registry list + per-host runtime state -> upstream extension
  // connections. Read inside upstream ServersProvider's createMemo; solid store changes
  // propagate (test/upstream-map.test.ts locks the propagation).
  const upstreamConnections = createMemo<ExtensionConnection[]>(() =>
    registry.list().map((record: HostRecord) =>
      toExtensionConnection({
        record,
        state: stateOf(record.id),
        endpoint: endpointOf(record.id),
      }),
    ),
  )

  const instance: MobileHosts = {
    registry,
    locale: options.locale ?? detectLocale(),
    credentials: vault,
    probe,
    storageVolatile,
    connect,
    disconnect,
    retry,
    remove,
    confirmHostKey,
    rejectHostKey,
    markIncompatible,
    stateOf,
    upstreamConnections,
  }
  activeInstance = instance
  return instance
}
