import { type Accessor } from "solid-js";
import { type StorageLike, type StoragePort } from "../storage";
export declare const GUIEXT_STORAGE_KEY = "opencode-mobile.guiext.v1";
export interface GuiextPayload {
    version: number;
    disabled: string[];
}
export declare function isValidExtensionId(id: string): boolean;
/** Whitelist normalizer: keep only valid, deduplicated ids; drop every other shape. */
export declare function normalizeGuiextPayload(payload: unknown): GuiextPayload;
/** Merge stored records into the current definition id set (rename self-heal: unknown ids drop). */
export declare function mergeDisabledRecords(records: readonly string[], definitionIds: readonly string[]): string[];
/** Parse the raw stored value; corrupted JSON, wrong versions and bad shapes degrade to empty. */
export declare function parseGuiext(raw: string | null): GuiextPayload;
/** Load the record payload through a storage port. */
export declare function loadGuiext(storage: StoragePort): GuiextPayload;
/** Persist the record payload (best-effort: storage failures keep the in-memory state). */
export declare function saveGuiext(storage: StoragePort, disabled: readonly string[]): void;
/** The reactive disable record: an accessor over the id set plus the toggle action. */
export interface ExtensionDisabled {
    /** The disabled id set, reactive. */
    readonly disabled: Accessor<ReadonlySet<string>>;
    /** Current disabled ids as an array (the union consumer iterates once per memo run). */
    ids(): readonly string[];
    /** Set the record for one extension: `next=true` disables, `next=false` re-enables. */
    toggle(id: string, next: boolean): void;
    /** True when persistence is unavailable (records last for this session only). */
    volatile(): boolean;
}
/** Pure factory (no singleton registration) — the unit tests drive isolated instances. */
export declare function createExtensionDisabledStore(candidate?: StorageLike): ExtensionDisabled;
/** Create the shell-wide instance. The first call wins; later calls return the same object. */
export declare function createExtensionDisabled(candidate?: StorageLike): ExtensionDisabled;
/** The shell-wide instance, if the bootstrap created it; otherwise undefined (read-only UI). */
export declare function sharedExtensionDisabled(): ExtensionDisabled | undefined;
