// GUI extension disable records (issue #26): key `opencode-mobile.guiext.v1`.
//
// The upstream enable preference lives in the desktop main process settings file
// (bridge.manager) and is undefined on the web; the first-party record below is the
// device-local mobile counterpart consumed by the vendored root's disabled-set union
// (M-025). Records are pure id lists — no capability, marketplace or install semantics
// attach to them (mobile has zero install/remove surface; built-ins ship compiled).
//
// - localStorage is reached through the shared safeStorage seam (memory fallback when
//   persistence is unavailable; the volatile state is reported honestly — a volatile
//   disable lasts for the session only).
// - Corrupted or foreign payloads fall back to an empty set (records are user-reversible;
//   nothing here is a credential or a secret).
// - Versioned envelope with a migration hook, mirroring ./storage.ts (hosts.v1).
// - On merge, records are filtered to the CURRENT definition ids: ids that no longer exist
//   (e.g. after an upstream rename) self-heal away instead of disabling nothing silently.

import { createSignal, type Accessor } from "solid-js"
import { safeStorage, type StorageLike, type StoragePort } from "../storage"

export const GUIEXT_STORAGE_KEY = "opencode-mobile.guiext.v1"

export interface GuiextPayload {
  version: number
  disabled: string[]
}

// Conservative id shape for built-in extension ids ("context", "microsoft-office", ...).
// Anything else is dropped on load — a hostile payload cannot smuggle non-id strings in.
const ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/

// The disable list stays bounded: 64 ids is far above the built-in count and keeps a
// corrupted payload from growing without limit.
const MAX_DISABLED_IDS = 64
const MAX_ID_LENGTH = 64

export function isValidExtensionId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID_LENGTH && ID_PATTERN.test(id)
}

/** Whitelist normalizer: keep only valid, deduplicated ids; drop every other shape. */
export function normalizeGuiextPayload(payload: unknown): GuiextPayload {
  const disabled: string[] = []
  const seen = new Set<string>()
  if (typeof payload === "object" && payload !== null && Array.isArray((payload as { disabled?: unknown })["disabled"])) {
    for (const raw of (payload as { disabled: unknown[] })["disabled"]) {
      if (typeof raw !== "string" || !isValidExtensionId(raw)) continue
      if (seen.has(raw)) continue
      if (disabled.length >= MAX_DISABLED_IDS) break
      seen.add(raw)
      disabled.push(raw)
    }
  }
  return { version: 1, disabled }
}

/** Merge stored records into the current definition id set (rename self-heal: unknown ids drop). */
export function mergeDisabledRecords(records: readonly string[], definitionIds: readonly string[]): string[] {
  const known = new Set(definitionIds)
  const merged: string[] = []
  for (const id of records) if (known.has(id) && !merged.includes(id)) merged.push(id)
  return merged
}

/** Parse the raw stored value; corrupted JSON, wrong versions and bad shapes degrade to empty. */
export function parseGuiext(raw: string | null): GuiextPayload {
  if (!raw) return { version: 1, disabled: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { version: 1, disabled: [] }
  }
  const version =
    typeof parsed === "object" && parsed !== null && typeof (parsed as { version?: unknown })["version"] === "number"
      ? (parsed as { version: number })["version"]
      : 1
  if (version !== 1) return { version: 1, disabled: [] } // unknown future version: start clean
  try {
    return normalizeGuiextPayload(parsed)
  } catch {
    return { version: 1, disabled: [] }
  }
}

/** Load the record payload through a storage port. */
export function loadGuiext(storage: StoragePort): GuiextPayload {
  try {
    return parseGuiext(storage.getItem(GUIEXT_STORAGE_KEY))
  } catch {
    return { version: 1, disabled: [] }
  }
}

/** Persist the record payload (best-effort: storage failures keep the in-memory state). */
export function saveGuiext(storage: StoragePort, disabled: readonly string[]): void {
  const payload: GuiextPayload = { version: 1, disabled: normalizeGuiextPayload({ version: 1, disabled }).disabled }
  try {
    storage.setItem(GUIEXT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Persistence is best-effort; the in-memory signal stays authoritative for the session.
  }
}

/** The reactive disable record: an accessor over the id set plus the toggle action. */
export interface ExtensionDisabled {
  /** The disabled id set, reactive. */
  readonly disabled: Accessor<ReadonlySet<string>>
  /** Current disabled ids as an array (the union consumer iterates once per memo run). */
  ids(): readonly string[]
  /** Set the record for one extension: `next=true` disables, `next=false` re-enables. */
  toggle(id: string, next: boolean): void
  /** True when persistence is unavailable (records last for this session only). */
  volatile(): boolean
}

/** Pure factory (no singleton registration) — the unit tests drive isolated instances. */
export function createExtensionDisabledStore(candidate?: StorageLike): ExtensionDisabled {
  const { storage, volatile } = safeStorage(candidate)
  const [disabled, setDisabled] = createSignal<ReadonlySet<string>>(new Set(loadGuiext(storage).disabled))

  return {
    disabled,
    ids: () => Array.from(disabled()),
    toggle(id: string, next: boolean) {
      const nextSet = new Set(disabled())
      if (next) nextSet.add(id)
      else nextSet.delete(id)
      saveGuiext(storage, Array.from(nextSet))
      setDisabled(nextSet)
    },
    volatile: () => volatile,
  }
}

// The vendored shell bootstrap (root.tsx, M-025) creates the one reactive instance; the
// manager UI (ui/extension-manager.tsx) reads the SAME instance so a toggle reaches the
// host's disabled union in the same tick. Nothing in this package falls back to a second
// reactive copy — a missing bootstrap yields undefined and the UI degrades to read-only.
let shared: ExtensionDisabled | undefined

/** Create the shell-wide instance. The first call wins; later calls return the same object. */
export function createExtensionDisabled(candidate?: StorageLike): ExtensionDisabled {
  if (!shared) shared = createExtensionDisabledStore(candidate)
  return shared
}

/** The shell-wide instance, if the bootstrap created it; otherwise undefined (read-only UI). */
export function sharedExtensionDisabled(): ExtensionDisabled | undefined {
  return shared
}
