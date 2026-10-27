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
  parseSshTargetUser,
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
export { ServicePanel } from "./ui/service-panel"
// issue #7: service operations (fourth bridge) — taxonomy, whitelist command face,
// discovery model, authorization flow, bridge transport, port + fail-closed defaults.
export {
  SERVICE_OPS_ERROR_CODES,
  PERMISSION_DENIED_MARKERS,
  ServiceOpsError,
  classifyExecFailure,
  isServiceOpsErrorCode,
  serviceOpsErrorCodeMessageKey,
  type ExecFailureClassification,
  type ServiceOpsErrorCode,
} from "./service-ops/errors"
export {
  COMMAND_TEMPLATES,
  GOLDEN_VECTORS,
  SERVICE_PARAM_PATTERNS,
  assembleServiceCommand,
  formatBackupStamp,
  previewServiceCommand,
  serviceCommandTemplate,
  templateOsDomain,
  templatesForAction,
  type ServiceCommandTemplate,
  type ServiceOpsAction,
  type ServiceOsFamily,
  type ServiceParamPatternName,
  type TemplateOsDomain,
} from "./service-ops/commands"
export {
  LIMITATION_KEYS,
  inferInstallSource,
  limitationKeysFor,
  mergeServiceEvidence,
  parseBinaryLookup,
  parseOsFamily,
  parsePortProbe,
  parseProcessProbe,
  parseVersionOutput,
  unsupportedOsName,
  type ApiServiceEvidence,
  type ExecServiceEvidence,
  type InstallSource,
  type OsFamily,
  type ServiceSnapshot,
  type ServiceStatus,
} from "./service-ops/discovery"
export {
  FLOW_FRESHNESS_MS,
  INITIAL_FLOW_CONTEXT,
  SERVICE_FLOW_TRANSITIONS,
  transitionServiceFlow,
  type ServiceFlowContext,
  type ServiceFlowEvent,
  type ServiceFlowState,
  type ServiceFlowTransition,
} from "./service-ops/flow"
export {
  SVCOPS_BRIDGE,
  SVCOPS_HANDSHAKE,
  bridgeErrorToServiceOpsError,
  createWebMessageServiceOpsTransport,
  parseBridgeExecResult,
  type ServiceOpsBridgeOperation,
  type ServiceOpsBridgeResponse,
  type ServiceOpsBridgeTransport,
  type ServiceOpsExecResult,
  type WebMessageServiceOpsTransportOptions,
} from "./service-ops/bridge"
export {
  StubServiceOpsPort,
  activeServiceOpsPort,
  createServiceOpsClient,
  interpretExecResult,
  setActiveServiceOpsPort,
  serviceOpsBridgeInjected,
  type ServiceOpsExecInput,
  type ServiceOpsExecOutcome,
  type ServiceOpsPort,
} from "./service-ops/port"
export { shouldRefreshServiceStatus } from "./service-ops/refresh"
export {
  createPanelDriver,
  type PanelDriverDeps,
  type PanelResult,
  type PlanStep,
  type Preview,
  type PreviewAction,
} from "./service-ops/panel-driver"
// issue #16: files bridge (fifth bridge) — attachment/export/clipboard platform
// capabilities over the protocol-isolated transport, module-level seam + fail-closed
// defaults, filename sanitization and the 32 MiB bound.
export {
  FILES_ERROR_CODES,
  FilesError,
  isFilesErrorCode,
  type FilesErrorCode,
} from "./files/errors"
export {
  FILES_BRIDGE,
  FILES_HANDSHAKE,
  bridgeErrorToFilesError,
  createWebMessageFilesTransport,
  type FilesBridgeOperation,
  type FilesBridgeResponse,
  type FilesBridgeTransport,
  type WebMessageFilesTransportOptions,
} from "./files/transport"
export {
  MAX_BRIDGE_BYTES,
  StubFilesPort,
  activeFilesPort,
  base64ToBytes,
  bytesToBase64,
  createFilesClient,
  filesBridgeInjected,
  mimeFromFilename,
  sanitizeFilename,
  setActiveFilesPort,
  type FilesPort,
  type SaveFileInput,
} from "./files/client"
// issue #23: notifications bridge (sixth bridge) — task completion/permission/error system
// notifications over the protocol-isolated transport, module-level seam + fail-closed
// defaults (equivalent to the pre-#23 WebView dead point), two-layer shape validation.
export {
  NOTIFICATIONS_ERROR_CODES,
  isNotificationsErrorCode,
  type NotificationsErrorCode,
} from "./notifications/client"
export {
  NOTIFICATIONS_BRIDGE,
  NOTIFICATIONS_HANDSHAKE,
  createWebMessageNotificationsTransport,
  type NotificationsBridgeOperation,
  type NotificationsBridgeResponse,
  type NotificationsBridgeTransport,
  type WebMessageNotificationsTransportOptions,
} from "./notifications/transport"
export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATIONS_MARKER,
  BODY_MAX,
  TITLE_MAX,
  ROUTE_PATTERN,
  StubNotificationsPort,
  activeNotificationsPort,
  createNotificationsClient,
  notificationsBridgeInjected,
  setActiveNotificationsPort,
  type NotificationCategory,
  type NotifyInput,
  type NotifyOutcome,
  type NotificationsPort,
  type PermissionOutcome,
} from "./notifications/client"
// issue #26: GUI extension management — device-local disable records (`guiext.v1`) and the
// settings manager face. The reactive records instance is created once by the vendored shell
// bootstrap (root.tsx, M-025) and read by the manager UI through the shared accessor; the
// pure parse/normalize/merge layer is exported separately for the unit tests.
export {
  GUIEXT_STORAGE_KEY,
  createExtensionDisabled,
  createExtensionDisabledStore,
  isValidExtensionId,
  loadGuiext,
  mergeDisabledRecords,
  normalizeGuiextPayload,
  parseGuiext,
  saveGuiext,
  sharedExtensionDisabled,
  type ExtensionDisabled,
  type GuiextPayload,
} from "./extensions/manager"
export {
  capabilityOf,
  ExtensionManager,
  type ExtensionCapability,
  type ExtensionManagerProps,
} from "./ui/extension-manager"
