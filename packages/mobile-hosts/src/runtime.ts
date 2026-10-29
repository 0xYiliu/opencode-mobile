import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { NullCredentialResolver } from "./credential-ref"
import type { CredentialResolver } from "./credential-ref"
import { UnavailableVault } from "./vault/types"
import type { CredentialVault } from "./vault/types"
import { createVaultResolver } from "./vault/vault"
import { DEFAULT_SERVICE_PORT, createHostRegistry } from "./registry"
import type { HostRecord, HostRegistry } from "./registry"
import { StubHostKeyVerifier, StubHostTransport } from "./ports"
import type { HostKeyVerifier, HostTransport, TransportEndpoint } from "./ports"
import { safeStorage } from "./storage"
import type { StorageLike } from "./storage"
import { transition } from "./state-machine"
import type { HostEvent, HostState, MachineContext } from "./state-machine"
import { toExtensionConnection } from "./upstream-map"
import type { ExtensionConnection, ExtensionHttpBase } from "./upstream-map"
import { detectLocale } from "./i18n"
import type { Locale } from "./i18n"
import { StubProbePort } from "./probe"
import type { ProbePort } from "./probe"
import { SshTransportError } from "./transport/ssh-errors"
import { removeSshHostKey } from "./ssh/host-key-verifier"
import type { SshBridgeTransport } from "./ssh/bridge"
import { assessIncompatible } from "./health-wrapper"
import { basicAuthToken } from "./transport/basic-auth"

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
  /**
   * The raw ssh bridge transport (issue #6): the recovery path (forgetHostKey after a
   * host-key change) speaks to the known_hosts store through it. Absent (default) makes
   * the recovery entry a no-op that reports false — the fail-closed posture again.
   */
  sshBridge?: SshBridgeTransport
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
  /** Delete the host locally; retain its saved credential as an orphan for explicit cleanup. */
  remove: (id: string) => Promise<boolean>
  /** Confirm a pending host key (T3). Stub phase: unreachable, verifier rejects first. */
  confirmHostKey: (id: string, expected: HostKeyConfirmation) => void
  /** Reject a pending host key (T4). No connection attempt follows. */
  rejectHostKey: (id: string) => void
  /**
   * Remove the stored host key for a target through the ssh bridge (issue #6 changed-key
   * recovery: an explicit danger confirmation above this call, never an automatic
   * overwrite). Resolves true when the key was removed; false when no bridge is wired or
   * the bridge refused. The next connect re-enters the unknown-fingerprint flow.
   */
  forgetHostKey: (id: string) => Promise<boolean>
  /** Classify the current probe as incompatible (T7; wired into the post-open check). */
  markIncompatible: (id: string, version?: string) => void
  /** Current machine state of a host (reactive store read). */
  stateOf: (id: string) => HostState
  /** The in-memory host key fingerprint of a host (prompt flow; never persisted). */
  fingerprintOf: (id: string) => string | undefined
  /** The in-memory failure reason of a host (classified code or transport message; never persisted). */
  failureReasonOf: (id: string) => string | undefined
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
  /** AppShell-owned initial SSH onboarding state; claimed before the host is published. */
  initialScreenOwned: () => boolean
  claimInitialScreen: () => number
  initialGeneration: () => number
  ownInitialHost: (id: string) => void
  releaseInitialScreen: (id?: string, generation?: number) => void
  initialHostId: () => string | undefined
  initialHostGeneration: () => number | undefined
  serviceAuthRequiredOf: (id: string) => boolean
  /** Abort and invalidate any in-flight service re-authentication check for this host. */
  cancelServiceAgain: (id: string) => void
  checkServiceAgain: (id: string, password?: string) => Promise<boolean>
}

export interface HostKeyConfirmation {
  target: string
  servicePort: number
  fingerprint: string
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
  const sshBridge = options.sshBridge
  const fetchFn = options.fetch ?? ((...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args))

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
  const [initialOwned, setInitialOwned] = createSignal(false)
  const [initialHost, setInitialHost] = createSignal<string>()
  const [initialHostGeneration, setInitialHostGeneration] = createSignal<number>()
  const [initialGeneration, setInitialGeneration] = createSignal(0)
  const [serviceAuthRequired, setServiceAuthRequired] = createStore<Record<string, boolean>>({})

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
  const pendingHostKey = new Map<string, HostKeyConfirmation>()
  // Session-only service auth is independent from SSH credentials and never persisted.
  const sessionServicePasswords = new Map<string, string>()
  const serviceAuthCheckGeneration = new Map<string, number>()
  const serviceAuthCheckControllers = new Map<string, AbortController>()
  const cancelServiceAgain = (id: string) => {
    serviceAuthCheckGeneration.set(id, (serviceAuthCheckGeneration.get(id) ?? 0) + 1)
    serviceAuthCheckControllers.get(id)?.abort()
    serviceAuthCheckControllers.delete(id)
  }
  // Invalidates reconnect promises that were already waiting when the user disconnects
  // or changes/removes a host. Monotonic even if the same host ID is later reconnected.
  const hostSessionGeneration = new Map<string, number>()
  const invalidateHostSession = (id: string) => {
    hostSessionGeneration.set(id, (hostSessionGeneration.get(id) ?? 0) + 1)
    cancelServiceAgain(id)
  }

  const stopAttempt = (id: string) => {
    attempts.get(id)?.abort()
    attempts.delete(id)
  }

  // Editing or deleting a host invalidates any displayed first-contact confirmation and
  // aborts an in-flight open. The confirmation remains scoped to the exact record identity
  // that produced its fingerprint; no stale UI callback may open a newly edited target.
  registry.subscribe(({ id, previous, next }) => {
    if (!previous || !next) {
      invalidateHostSession(id)
      pendingHostKey.delete(id)
      sessionServicePasswords.delete(id)
      stopAttempt(id)
      if (stateOf(id) !== "idle") send(id, { type: "cancel" })
      setEndpoint(id, undefined)
      setServiceAuthRequired(id, false)
      return
    }
    const identityChanged = previous.name !== next.name
      || previous.target !== next.target
      || (previous.servicePort ?? DEFAULT_SERVICE_PORT) !== (next.servicePort ?? DEFAULT_SERVICE_PORT)
      || previous.credentialRef !== next.credentialRef
    if (!identityChanged) return
    invalidateHostSession(id)
    pendingHostKey.delete(id)
    sessionServicePasswords.delete(id)
    stopAttempt(id)
    if (stateOf(id) !== "idle") send(id, { type: "cancel" })
    setEndpoint(id, undefined)
    setServiceAuthRequired(id, false)
  })

  // ---------------------------------------------------------------------------
  // Post-open service health check (issue #6, decision 0003 §5 — the SERVICE layer)
  // ---------------------------------------------------------------------------
  // The tunnel being up proves nothing about the service behind it: a bounded GET
  // <endpoint>/api/info decides service-unreachable (T8) and detects the server version
  // for the incompatible predicate (T7 via markIncompatible). A 401/403 still proves the
  // service is alive — service authentication is the upstream flow's business, never this
  // check's (SSH credentials are NOT service credentials and are never sent here).

  const SERVICE_HEALTH_TIMEOUT_MS = 10000

  const checkServiceHealth = async (
    endpoint: TransportEndpoint,
    signal: AbortSignal,
    fetcher: typeof fetch = fetchFn,
  ): Promise<{ ok: true; version?: string; authenticated: boolean } | { ok: false; authenticated: false }> => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    const timer = setTimeout(abort, SERVICE_HEALTH_TIMEOUT_MS)
    try {
      // The tunnel endpoint is loopback; a redirect there is hostile — fail closed.
      const response = await fetcher(`${endpoint.url}/api/info`, { signal: controller.signal, redirect: "error" })
      if (response.status === 401 || response.status === 403) return { ok: true, authenticated: false } // alive, auth-gated
      if (!response.ok) return { ok: false, authenticated: false }
      const body = (await response.json().catch(() => undefined)) as { version?: unknown } | undefined
      const version = typeof body?.["version"] === "string" ? body["version"] : undefined
      return { ok: true, version, authenticated: true }
    } catch {
      return { ok: false, authenticated: false }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
    }
  }

  const serviceAuthFetch = (password?: string): typeof fetch => password
    ? (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("authorization", `Basic ${basicAuthToken("opencode", password)}`)
        return fetchFn(input, { ...init, headers })
      }
    : fetchFn

  // ---------------------------------------------------------------------------
  // Attempt pipeline (T1/T10 entry): verifier -> open -> post-open health -> ready
  // ---------------------------------------------------------------------------

  const attemptOpen = async (id: string) => {
    const record = registry.get(id)
    if (!record) return
    const attemptIdentity = {
      name: record.name,
      target: record.target,
      servicePort: record.servicePort ?? DEFAULT_SERVICE_PORT,
      credentialRef: record.credentialRef,
    }
    const identityStillCurrent = () => {
      const current = registry.get(id)
      return !!current
        && current.name === attemptIdentity.name
        && current.target === attemptIdentity.target
        && (current.servicePort ?? DEFAULT_SERVICE_PORT) === attemptIdentity.servicePort
        && current.credentialRef === attemptIdentity.credentialRef
    }
    // A new attempt supersedes whatever is registered for this host: aborting a LIVE
    // session's controller drives its local disconnect (the established case), aborting an
    // in-flight attempt drives cancel. A new connect for the same host:port is only legal
    // after the previous tunnel is gone (the transport keys sessions by host:port).
    stopAttempt(id)
    const controller = new AbortController()
    attempts.set(id, controller)
    // True once transport.open resolved for this attempt: the session is live and the
    // controller must stay registered so a later disconnect/remove can abort it (the abort
    // drives the local disconnect — see the established-branch comment in stopAttempt).
    let established = false
    try {
      // Resolve the credential reference first (NullResolver: undefined). The resolved
      // value is the SSH credential (password or key envelope JSON) — memory-only.
      const credential = record.credentialRef ? await resolver.resolve(record.credentialRef) : undefined
      if (controller.signal.aborted || !identityStillCurrent()) return
      // Verify the host key BEFORE any connection attempt proceeds. The stub rejects
      // everything, so with the stub no transport.open call ever happens. A bridge-backed
      // verifier (issue #6) answers trust (store hit) / prompt (unknown) / reject+changed.
      //
      // Confirmed-fingerprint fast path (decision 0003 §3.3): a fingerprint already in the
      // machine context IS the user's T2->T3 confirmation — the attempt proceeds straight
      // to open(pinnedFingerprint) and the NATIVE side enforces presented-key == pinned
      // (fail-closed, accept-and-store on match). Re-running the verifier here would
      // re-prompt forever: the store records the key only at that pinned open. No path
      // reaches this branch without a confirmation — T4/T8/T13 all clear the fingerprint.
      if (!ctxOf(id).fingerprint) {
        const decision = await hostKeyVerifier.verify({ host: record.target })
        if (controller.signal.aborted || !identityStillCurrent()) return
        if (decision.action === "reject") {
          // A changed key is the hard refusal (never an automatic overwrite); a plain
          // rejection covers the user's own T4 flow and the stub.
          send(id, { type: "fail", reason: decision.reason === "changed" ? "host-key-changed" : "host-key-rejected" })
          return
        }
        if (decision.action === "prompt") {
          pendingHostKey.set(id, {
            target: record.target,
            servicePort: attemptIdentity.servicePort,
            fingerprint: decision.fingerprint,
          })
          send(id, { type: "hostKeyPending", fingerprint: decision.fingerprint })
          return // wait for hostKeyConfirm/hostKeyReject from the UI
        }
      }
      // This check is adjacent to open() so edits while credential/verifier promises were
      // pending cannot reuse a fingerprint against a different endpoint.
      if (controller.signal.aborted || !identityStillCurrent()) return
      pendingHostKey.delete(id)
      const endpoint = await transport.open({
        target: record.target,
        credential,
        servicePort: record.servicePort,
        pinnedFingerprint: ctxOf(id).fingerprint,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "hostKey") send(id, { type: "hostKeyPending", fingerprint: event.fingerprint })
          else if (event.type === "connectionLost") send(id, { type: "connectionLost" }) // T9; remote keeps running
        },
      })
      if (controller.signal.aborted) return
      established = true // the tunnel is live; the controller stays registered (see above)
      // Service-layer authority: only after the tunnel answered do we speak to the service.
      const sessionPassword = sessionServicePasswords.get(id)
      const health = await checkServiceHealth(endpoint, controller.signal, serviceAuthFetch(sessionPassword))
      if (controller.signal.aborted) return
      if (!health.ok) {
        setEndpoint(id, endpoint)
        send(id, { type: "fail", reason: "service-unreachable" })
        return
      }
      if (!health.authenticated) {
        sessionServicePasswords.delete(id)
        setEndpoint(id, endpoint)
      } else {
        setEndpoint(id, sessionPassword === undefined ? endpoint : { ...endpoint, password: sessionPassword })
      }
      // incompatible is OUR machine's decision for SSH hosts (health-wrapper predicate):
      // wired here so the upstream IncompatibleServerPanel can take over (T7).
       if (assessIncompatible({ kind: "ssh", version: health.version })) {
        markIncompatible(id, health.version)
        return
       }
       setServiceAuthRequired(id, !health.authenticated)
       send(id, { type: "ready" })
    } catch (error) {
      if (controller.signal.aborted) return
      // Four-layer classification (decision 0003 §5): SSH-auth failures land in
      // authRequired (T6) so the credential can be edited and the attempt re-driven (T1,
      // revised source set); every other failure is a classified fail (T8) whose reason
      // is the SshErrorCode wire string when available — never a parsed message.
      if (error instanceof SshTransportError && (error.code === "auth-failed" || error.code === "key-decrypt-failed")) {
        send(id, { type: "authRequired" })
        return
      }
      send(id, {
        type: "fail",
        reason: error instanceof SshTransportError ? error.code : error instanceof Error ? error.message : "transport-error",
      })
    } finally {
      // Clear this attempt's controller — unless the session it opened is still live (the
      // controller must remain reachable so disconnect/remove can abort it and drive the
      // local disconnect), or a newer attempt has replaced it.
      if (!established && attempts.get(id) === controller) attempts.delete(id)
    }
  }

  const connect = (id: string) => {
    if (!registry.get(id)) return
    if (!send(id, { type: "connect" })) return
    void attemptOpen(id)
  }

  const disconnect = (id: string) => {
    invalidateHostSession(id)
    pendingHostKey.delete(id)
    sessionServicePasswords.delete(id)
    stopAttempt(id) // local teardown only: aborts the in-flight attempt, no remote signal
    send(id, { type: "cancel" })
    setEndpoint(id, undefined)
    setServiceAuthRequired(id, false)
  }

  const retry = (id: string) => {
    if (!registry.get(id)) return
    // The reconnect budget lives in the machine: T8 routes a reconnecting failure back to
    // offline while the budget lasts and into failed once it is exhausted. The automatic
    // retry driver is the upstream reconnect hook (ensureTunnel below) — the vendored
    // client's connection watchdog calls it when the tunnel's event stream drops; the
    // budget bounds the loop and there is no retry timer of our own.
    if (!send(id, { type: "retry" })) return
    void attemptOpen(id)
  }

  const confirmHostKey = (id: string, expected: HostKeyConfirmation) => {
    const current = registry.get(id)
    const pending = pendingHostKey.get(id)
    if (!current || !pending
      || pending.target !== expected.target
      || pending.servicePort !== expected.servicePort
      || pending.fingerprint !== expected.fingerprint
      || current.target !== expected.target
      || (current.servicePort ?? DEFAULT_SERVICE_PORT) !== expected.servicePort
      || ctxOf(id).fingerprint !== expected.fingerprint
      || stateOf(id) !== "hostKeyUnverified") {
      pendingHostKey.delete(id)
      stopAttempt(id)
      if (stateOf(id) === "hostKeyUnverified") send(id, { type: "cancel" })
      return
    }
    pendingHostKey.delete(id)
    if (!send(id, { type: "hostKeyConfirm" })) return
    void attemptOpen(id)
  }

  const rejectHostKey = (id: string) => {
    pendingHostKey.delete(id)
    stopAttempt(id)
    send(id, { type: "hostKeyReject" })
  }

  const remove = async (id: string): Promise<boolean> => {
    if (!registry.get(id)) return false
    // Keep any bound credential in the vault. It becomes an explicit orphan, visible in
    // Credentials, where the user can review and delete it separately. In particular, host
    // deletion never awaits a destructive vault operation that could race an edit/rebind.
    // Remove the registry node before notifying the runtime state so synchronous reactive
    // observers cannot edit a still-present record between teardown and deletion.
    if (!registry.remove(id)) return false
    send(id, { type: "delete" })
    setEndpoint(id, undefined)
    return true
  }

  const markIncompatible = (id: string, version?: string) => {
    send(id, { type: "incompatible", version })
  }

  const checkServiceAgain = async (id: string, password?: string): Promise<boolean> => {
    const endpoint = endpointOf(id)
    const controller = attempts.get(id)
    if (!endpoint || !controller || stateOf(id) !== "ready") return false
    cancelServiceAgain(id)
    const checkGeneration = (serviceAuthCheckGeneration.get(id) ?? 0) + 1
    serviceAuthCheckGeneration.set(id, checkGeneration)
    const checkController = new AbortController()
    serviceAuthCheckControllers.set(id, checkController)
    const abortWithAttempt = () => checkController.abort()
    controller.signal.addEventListener("abort", abortWithAttempt, { once: true })
    let health: Awaited<ReturnType<typeof checkServiceHealth>>
    try {
      health = await checkServiceHealth(endpoint, checkController.signal, serviceAuthFetch(password))
    } finally {
      controller.signal.removeEventListener("abort", abortWithAttempt)
      if (serviceAuthCheckControllers.get(id) === checkController) serviceAuthCheckControllers.delete(id)
    }
    if (serviceAuthCheckGeneration.get(id) !== checkGeneration
      || !health.ok
      || !health.authenticated
      || checkController.signal.aborted
      || controller.signal.aborted
      || attempts.get(id) !== controller
      || endpointOf(id) !== endpoint) return false
    // The service credential is session-only: it travels on the extension connection's
    // in-memory http shape, never the registry record or persisted server list.
    if (password !== undefined) sessionServicePasswords.set(id, password)
    else sessionServicePasswords.delete(id)
    setEndpoint(id, password === undefined ? endpoint : { ...endpoint, password })
    setServiceAuthRequired(id, !health.authenticated)
    return true
  }

  // ---------------------------------------------------------------------------
  // Changed-key recovery + tunnel re-resolution (issue #6)
  // ---------------------------------------------------------------------------

  const forgetHostKey = async (id: string): Promise<boolean> => {
    const record = registry.get(id)
    if (!record || !sshBridge) return false
    try {
      // The dangerous confirmation lives in the UI above this call; the removal itself is
      // a single idempotent bridge op. The machine stays in failed — the next connect
      // re-enters the unknown-fingerprint confirmation flow (never an auto-connect).
      await removeSshHostKey(sshBridge, record.target)
      return true
    } catch {
      return false
    }
  }

  const fingerprintOf = (id: string): string | undefined => ctxOf(id).fingerprint

  const failureReasonOf = (id: string): string | undefined => ctxOf(id).reason

  // Wait until the machine leaves the transient attempt states (or the caller aborts).
  // Resolves the settled HostState, "aborted" or "timeout". The timeout bounds the wait to
  // several native connect timeouts — the caller never hangs forever on a dead bridge.
  const ATTEMPT_WAIT_TIMEOUT_MS = 120000
  const ATTEMPT_WAIT_POLL_MS = 100

  const waitForAttempt = (id: string, signal?: AbortSignal): Promise<HostState | "aborted" | "timeout"> =>
    new Promise((resolve) => {
      // Each waiter owns only the controller current at creation. A signal from an older
      // reconnect call must never cancel a later attempt that reused this host ID.
      const watchedAttempt = attempts.get(id)
      const startedAt = Date.now()
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer)
          const state = stateOf(id)
          if (watchedAttempt && attempts.get(id) === watchedAttempt
            && (state === "connecting" || state === "reconnecting")) {
            stopAttempt(id)
            send(id, { type: "cancel" })
          }
          resolve("aborted")
          return
        }
        const state = stateOf(id)
        if (state !== "connecting" && state !== "reconnecting") {
          clearInterval(timer)
          resolve(state)
          return
        }
        if (Date.now() - startedAt > ATTEMPT_WAIT_TIMEOUT_MS) {
          clearInterval(timer)
          resolve("timeout")
        }
      }, ATTEMPT_WAIT_POLL_MS)
    })

  /**
   * Re-resolve the tunnel endpoint through the machine (the upstream reconnect hook):
   * from offline it drives T10 -> attemptOpen (verifier store-hit -> trust, open,
   * post-open health) and re-drives while the T8 budget keeps landing back in offline;
   * ready returns the live endpoint. Anything else (failed budget, prompt, auth,
   * incompatible) needs user action — the hook reports failure by returning undefined and
   * the vendored client's own loop re-calls it at its cadence. Bounded: at most
   * RECONNECT_MAX_RETRIES + 1 attempts, no infinite loop.
   */
  const ensureTunnel = async (id: string, signal?: AbortSignal): Promise<{
    endpoint: TransportEndpoint
    attempt: AbortController
  } | undefined> => {
    for (;;) {
      if (signal?.aborted) return undefined
      const state = stateOf(id)
      if (state === "ready") {
        const endpoint = endpointOf(id)
        const attempt = attempts.get(id)
        if (endpoint && attempt && !attempt.signal.aborted) return { endpoint, attempt }
        return undefined
      }
      if (state !== "offline") return undefined
      retry(id)
      const settled = await waitForAttempt(id, signal)
      if (settled !== "ready" && settled !== "offline") return undefined
      // ready -> endpoint; offline (budget remains) -> one more bounded hop; anything
      // else (failed/authRequired/incompatible/hostKeyUnverified/idle) -> give up.
    }
  }

  const reconnectEndpoint = async (id: string, signal: AbortSignal): Promise<ExtensionHttpBase> => {
    const recordAtStart = registry.get(id)
    const generationAtStart = hostSessionGeneration.get(id) ?? 0
    const session = await ensureTunnel(id, signal)
    // The vendored client catches the throw and re-calls the hook. Revalidate after the
    // await so disconnect/edit/delete/replacement cannot publish a stale endpoint or secret.
    if (!session || signal.aborted || !recordAtStart) throw new Error("ssh tunnel unavailable")
    const recordNow = registry.get(id)
    if (!recordNow
      || (hostSessionGeneration.get(id) ?? 0) !== generationAtStart
      || stateOf(id) !== "ready"
      || endpointOf(id) !== session.endpoint
      || attempts.get(id) !== session.attempt
      || session.attempt.signal.aborted
      || recordNow.name !== recordAtStart.name
      || recordNow.target !== recordAtStart.target
      || (recordNow.servicePort ?? DEFAULT_SERVICE_PORT) !== (recordAtStart.servicePort ?? DEFAULT_SERVICE_PORT)
      || recordNow.credentialRef !== recordAtStart.credentialRef) {
      throw new Error("ssh tunnel unavailable")
    }
    // The current session map is authoritative. Never fall back to a password captured on
    // an endpoint before the await; explicit teardown clears the map in flight.
    const password = sessionServicePasswords.get(id)
    return { url: session.endpoint.url, ...(password !== undefined ? { password } : {}) }
  }

  /** The upstream authenticate hook (T6 -> T1 revised -> ready/failed), "resolves true once ready". */
  const connectInline = async (id: string): Promise<boolean> => {
    const state = stateOf(id)
    if (state === "ready") return true
    if (state !== "idle" && state !== "failed" && state !== "incompatible" && state !== "authRequired") return false
    connect(id)
    const settled = await waitForAttempt(id)
    return settled === "ready"
  }

  // Reactive derivation: registry list + per-host runtime state -> upstream extension
  // connections. Read inside upstream ServersProvider's createMemo; solid store changes
  // propagate (test/upstream-map.test.ts locks the propagation). The reconnect/connect
  // hooks (issue #6) ride along per host: reconnect re-resolves the tunnel endpoint
  // through the machine, connect backs the upstream inline sign-in (authenticate path).
  const upstreamConnections = () =>
    registry.list().map((record: HostRecord) =>
      toExtensionConnection({
        record,
        state: stateOf(record.id),
        endpoint: endpointOf(record.id),
        reconnect: (signal) => reconnectEndpoint(record.id, signal),
        connect: () => connectInline(record.id),
      }),
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
    forgetHostKey,
    markIncompatible,
    stateOf,
    fingerprintOf,
    failureReasonOf,
    upstreamConnections,
    initialScreenOwned: initialOwned,
    claimInitialScreen: () => {
      if (!initialOwned()) setInitialGeneration((generation) => generation + 1)
      setInitialOwned(true)
      return initialGeneration()
    },
    initialGeneration,
    ownInitialHost: (id) => {
      setInitialHost(id)
      setInitialHostGeneration(initialGeneration())
    },
    releaseInitialScreen: (id, generation) => {
      if ((id === undefined || initialHost() === id) && (generation === undefined || initialGeneration() === generation)) {
        setInitialOwned(false)
        setInitialHost(undefined)
        setInitialHostGeneration(undefined)
      }
    },
    initialHostId: initialHost,
    initialHostGeneration,
    serviceAuthRequiredOf: (id) => serviceAuthRequired[id] === true,
    cancelServiceAgain,
    checkServiceAgain,
  }
  activeInstance = instance
  return instance
}
