export type ServiceOsFamily = "linux" | "darwin" | "windows";
/** Template OS applicability domain; "any" is reserved for the OS-detection bootstrap pair. */
export type TemplateOsDomain = ServiceOsFamily | "any";
export type ServiceOpsAction = "probe" | "install" | "install-curl" | "start" | "upgrade" | "backup" | "restore" | "stop";
/**
 * Param allowlist patterns, mirrored VERBATIM by the Kotlin ServiceCommandValidator
 * (scripts/verify-service-ops.ts locks the two pattern sets). Patterns are allow-only;
 * the shared metacharacter/traversal rejector runs before them on every value.
 */
export declare const SERVICE_PARAM_PATTERNS: {
    /** npm dist-tag or pinned semver (npm accepts @latest explicitly). */
    readonly versionAny: "^(?:latest|\\d+\\.\\d+\\.\\d+)$";
    /** Pinned semver only — the curl installer and the upgrade target never guess "latest". */
    readonly versionPinned: "^\\d+\\.\\d+\\.\\d+$";
    /** Digits only; the 1..65535 range is enforced additionally (numeric check). */
    readonly port: "^\\d{1,5}$";
    /** Upstream upgrade methods (upstream upgrade command surface). */
    readonly method: "^(?:curl|npm|pnpm|bun|yarn|vp|brew|winget)$";
    /** POSIX absolute binary path (no spaces — discovery paths never contain them). */
    readonly binPathPosix: "^[A-Za-z0-9._/-]+$";
    /** Windows absolute binary path (drive colon + both slash shapes, no spaces, no %VAR%). */
    readonly binPathWindows: "^[A-Za-z0-9._\\\\:\\/-]+$";
    /** UTC compact stamp the client formats (keeps the preview byte-deterministic). */
    readonly stamp: "^\\d{8}T\\d{6}Z$";
};
export type ServiceParamPatternName = keyof typeof SERVICE_PARAM_PATTERNS;
export interface ServiceParamSpec {
    name: string;
    pattern: ServiceParamPatternName;
}
export interface ServiceCommandTemplate {
    id: string;
    action: ServiceOpsAction;
    os: TemplateOsDomain;
    params: readonly ServiceParamSpec[];
    /** Full command line; `<name>` placeholders are substituted by the assembler. */
    command: string;
}
export declare const COMMAND_TEMPLATES: readonly ServiceCommandTemplate[];
export declare function serviceCommandTemplate(id: string): ServiceCommandTemplate | undefined;
/** The OS applicability domain of a template id (unknown ids answer undefined). */
export declare function templateOsDomain(id: string): TemplateOsDomain | undefined;
export type AssembledServiceCommand = {
    templateId: string;
    action: ServiceOpsAction;
    os: TemplateOsDomain;
    /** The EXACT string the native side will setCommand — the preview shows this verbatim. */
    command: string;
};
/**
 * The single assembly point (execution face). Fail-closed: an unknown template, a
 * cross-OS assembly, an unexpected param set or any refused value throws
 * ServiceOpsError("exec-denied") — nothing is ever loosely coerced into a command.
 */
export declare function assembleServiceCommand(os: ServiceOsFamily, templateId: string, params: Record<string, string>): AssembledServiceCommand;
/**
 * The preview face. It is deliberately THE SAME function as the execution face: a preview
 * can never diverge from what executes (byte-for-byte; golden vectors lock it).
 */
export declare function previewServiceCommand(os: ServiceOsFamily, templateId: string, params: Record<string, string>): AssembledServiceCommand;
/** Templates available for an action on an OS family ("any"-domain rows included). */
export declare function templatesForAction(action: ServiceOpsAction, os: ServiceOsFamily): ServiceCommandTemplate[];
export declare const GOLDEN_VECTORS: readonly {
    templateId: string;
    os: ServiceOsFamily;
    params: Record<string, string>;
    command: string;
}[];
/** The UTC compact stamp format the backup/restore templates expect (client-formatted). */
export declare function formatBackupStamp(date: Date): string;
