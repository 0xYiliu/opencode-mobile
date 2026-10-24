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
  validateServicePort,
  validateTarget,
  DEFAULT_SERVICE_PORT,
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
export {
  MAX_SECRET_BYTES,
  UnavailableVault,
  VaultError,
  formatVaultRef,
  parseVaultRef,
  type CredentialVault,
  type VaultEntryMetadata,
  type VaultErrorCode,
  type VaultKind,
  type VaultPutInput,
  type VaultStatus,
} from "./vault/types"
export { ENVELOPE_MAGIC, generateEnvelopeKey, importEnvelopeKey, openEnvelope, sealEnvelope } from "./vault/envelope"
export {
  VAULT_BRIDGE,
  VAULT_HANDSHAKE,
  createInProcessVaultEngine,
  createWebMessageChannelTransport,
  type InProcessVaultEngine,
  type VaultOperation,
  type VaultPortLike,
  type VaultResponse,
  type VaultTransport,
} from "./vault/transport"
export { createVaultClient, createVaultResolver, parsePrivateKeyEnvelope, type PrivateKeyEnvelope } from "./vault/vault"
export { evaluateRemember, initialRemember, type RememberDecision, type RememberInput } from "./vault/remember"
export { HOSTS_STORAGE_KEY, createMemoryStorage, loadHosts, safeStorage, sanitizeRecord, saveHosts, type StoragePort } from "./storage"
export { assessIncompatible, isCompatibleServerVersion, parseServerVersion, type HealthLike } from "./health-wrapper"
export { assertExtensionShape, mapStateToServerState, toExtensionConnection, type ExtensionConnection, type ExtensionHttpBase, type ServerState } from "./upstream-map"
export { createTranslator, detectLocale, messages, type Locale, type MessageKey, type Translator } from "./i18n"
export {
  DIRECT_ERROR_CODES,
  SURFACEABLE_ERROR_CODES,
  SecureFetchError,
  isDirectErrorCode,
  type DirectErrorCode,
  type SecureFetchErrorCode,
} from "./transport/connection-errors"
export {
  SSH_ERROR_CODES,
  SshTransportError,
  isSshErrorCode,
  sshErrorCodeMessageKey,
  type SshErrorCode,
  type SshErrorInfo,
} from "./transport/ssh-errors"
export { computeSshFingerprint, decodeBase64KeyBlob, isSshFingerprint } from "./ssh/fingerprint"
export {
  matchesKnownHostsEntry,
  parseKnownHosts,
  parseKnownHostsLine,
  parseSshTargetHost,
  serializeKnownHosts,
  serializeKnownHostsEntry,
  type KnownHostsEntry,
  type KnownHostsParseIssue,
  type KnownHostsParseResult,
} from "./ssh/known-hosts"
export {
  SSH_BRIDGE,
  SSH_HANDSHAKE,
  bridgeErrorToTransportError,
  bridgeServicePort,
  createWebMessageSshTransport,
  parseBridgeEndpoint,
  type SshBridgeEvent,
  type SshBridgeOperation,
  type SshBridgeResponse,
  type SshBridgeTransport,
  type WebMessageSshTransportOptions,
} from "./ssh/bridge"
export { createSshHostKeyVerifier, removeSshHostKey } from "./ssh/host-key-verifier"
export { createSshHostTransport } from "./ssh/transport"
export {
  assertNoUrlCredentials,
  hasUrlCredentials,
  validateRedirectTarget,
  type RedirectVerdict,
} from "./transport/url-policy"
export { SECURE_FETCH_MARKER, createSecureFetch } from "./transport/secure-fetch"
export {
  PROBE_BRIDGE,
  PROBE_HANDSHAKE,
  StubProbePort,
  createProbeClient,
  createWebMessageProbeTransport,
  directErrorCodeMessageKey,
  type ProbeBridgeResponse,
  type ProbeBridgeTransport,
  type ProbePort,
  type ProbeRequest,
  type ProbeResult,
  type WebMessageProbeTransportOptions,
} from "./probe"
export { createMobileHosts, getMobileHosts, type MobileHosts, type MobileHostsOptions } from "./runtime"
export { HostDialog } from "./ui/host-dialog"
export { HostKeyPrompt } from "./ui/host-key-prompt"
export { MobileHostManager } from "./ui/host-manager"
export { CredentialManager } from "./ui/credential-manager"
