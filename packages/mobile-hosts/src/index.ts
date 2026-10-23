// @opencode-mobile/mobile-hosts — first-party host registry, stable identity and connection
// state machine for the OpenCode mobile shell (issue #3).
//
// Dependency direction: this package may depend on vendored upstream packages
// (@opencode/client, @opencode/ui); the vendored app reaches this package only through the
// M-004 build alias and the M-007/M-008 mount points. The vendored packages themselves do
// not depend on this one.
//
// Platform rule: no Android (or any other platform) API appears in this package; platform
// reach is limited to the StoragePort / HostTransport / HostKeyVerifier / CredentialResolver
// ports, injected at bootstrap.

export { SSH_EXTENSION, directKey, hostKey, isValidHostId, makeHostId, normalizeDirectUrl, parseHostKey } from "./identity"
export {
  HostRegistryError,
  createHostRegistry,
  validateTarget,
  type HostRecord,
  type HostRegistry,
  type HostRegistryOptions,
  type RegistryErrorCode,
} from "./registry"
export {
  INITIAL_CONTEXT,
  RECONNECT_MAX_RETRIES,
  restoreHostState,
  snapshotHostState,
  transition,
  TRANSITIONS,
  type HostEvent,
  type HostState,
  type MachineContext,
  type Transition,
} from "./state-machine"
export {
  StubHostKeyVerifier,
  StubHostTransport,
  TransportUnavailableError,
  type HostKeyDecision,
  type HostKeyVerifier,
  type TransportEndpoint,
  type TransportEvent,
  type HostTransport,
} from "./ports"
export {
  CREDENTIAL_REF_PATTERN,
  CredentialRefError,
  NullCredentialResolver,
  assertValidCredentialRef,
  isValidCredentialRef,
  type CredentialResolver,
} from "./credential-ref"
export { HOSTS_STORAGE_KEY, createMemoryStorage, loadHosts, safeStorage, sanitizeRecord, saveHosts, type StoragePort } from "./storage"
export { assessIncompatible, isCompatibleServerVersion, parseServerVersion, type HealthLike } from "./health-wrapper"
export { assertExtensionShape, mapStateToServerState, toExtensionConnection, type ExtensionConnection, type ServerState } from "./upstream-map"
export { createTranslator, detectLocale, messages, type Locale, type MessageKey, type Translator } from "./i18n"
export { createMobileHosts, getMobileHosts, type MobileHosts, type MobileHostsOptions } from "./runtime"
export { HostDialog } from "./ui/host-dialog"
export { HostKeyPrompt } from "./ui/host-key-prompt"
export { MobileHostManager } from "./ui/host-manager"
