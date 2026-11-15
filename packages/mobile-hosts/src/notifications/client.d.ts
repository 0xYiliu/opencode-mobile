import type { NotificationsBridgeTransport } from "./transport";
/**
 * The four explicit codes the bridge answers with: unavailable (no channel/timeout),
 * permission (POST_NOTIFICATIONS denied — silent degradation, in-app faces unaffected),
 * foreground (native front-focus re-check refused the post / background arrival never
 * prompts), io (validation/native failure). A response code outside the set degrades to io.
 */
export type NotificationsErrorCode = "unavailable" | "permission" | "foreground" | "io";
/** Every NotificationsErrorCode, in canonical order. */
export declare const NOTIFICATIONS_ERROR_CODES: readonly ["unavailable", "permission", "foreground", "io"];
export declare function isNotificationsErrorCode(value: unknown): value is NotificationsErrorCode;
/**
 * The exactly-four notification kinds (Kotlin mirror: CATEGORIES). "questions" sits
 * adjacent to "permissions" mirroring the settings row order and the upstream
 * requestTitles two-value map (question/mcp-elicitation -> questions) — issue #195.
 */
export declare const NOTIFICATION_CATEGORIES: readonly ["agent", "permissions", "questions", "errors"];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
/** Native re-check mirror bounds. */
export declare const TITLE_MAX = 128;
export declare const BODY_MAX = 256;
/**
 * The session-route whitelist: the route is CONSTRUCTED by the caller through the upstream
 * sessionHref (`/server/<base64url(server)>/session/<sessionID>`); this pattern + the Kotlin
 * mirror re-check its shape. The base64url alphabet carries no separators, so a shape match
 * cannot smuggle extra path segments.
 */
export declare const ROUTE_PATTERN: RegExp;
export interface NotifyInput {
    category: NotificationCategory;
    title: string;
    body: string;
    /** Upstream sessionHref output (base64url server key + sessionID). */
    route: string;
}
export interface NotifyOutcome {
    posted: boolean;
    code?: NotificationsErrorCode;
}
export interface PermissionOutcome {
    granted: boolean;
    code?: NotificationsErrorCode;
}
export interface NotificationsPort {
    /**
     * Post one system notification. NEVER throws: every failure path (bridge unavailable,
     * front-focused shell, denied permission, native failure, malformed response) degrades
     * to an explicit {posted:false, code} — the in-app faces are unaffected either way.
     */
    notify(op: NotifyInput): Promise<NotifyOutcome>;
    /**
     * Ask the user for the POST_NOTIFICATIONS runtime permission (API 33+). NEVER throws.
     * The NATIVE side only ever opens the dialog for a user-in-foreground call (a request
     * arriving while the app is backgrounded answers {granted:false, code:"foreground"});
     * below API 33 / already granted answers {granted:true} without a dialog.
     */
    requestPermission(): Promise<PermissionOutcome>;
}
/**
 * Fail-closed stub: never touches a bridge, never fakes a capability. Equivalent to the
 * pre-#23 dead point (no system notifications; the in-app faces carry on).
 */
export declare const StubNotificationsPort: NotificationsPort;
/** Register the bridge-backed client (the entry bootstrap, M-022). Undefined resets. */
export declare function setActiveNotificationsPort(port: NotificationsPort | undefined): void;
/** The active port. Never undefined: the stub is the fail-closed default. */
export declare function activeNotificationsPort(): NotificationsPort;
/** Whether a real (non-stub) port was injected. */
export declare function notificationsBridgeInjected(): boolean;
/**
 * The bridge-backed notifications port. Validation failures answer {posted:false,
 * code:"io"} BEFORE anything crosses the bridge (a rejected shape is never a fabricated
 * success); every transport failure (uncaptured handshake, timeout, channel death) degrades
 * to {posted:false, code:"unavailable"} / {granted:false, code:"unavailable"}.
 */
export declare function createNotificationsClient(transport: NotificationsBridgeTransport): NotificationsPort;
/** The dist marker constant re-exported for the probes (single source of truth). */
export declare const NOTIFICATIONS_MARKER: "mobile(notifications-v1): notifications bridge transport over the platform web message channel";
