// Notifications port (issue #23, plan D3) — the sixth-bridge client face and its
// fail-closed default. Everything the app does with system notifications flows through
// this port; the shared package itself has zero platform APIs (AGENTS.md architecture rule).
//
// Fail-closed default (M-015/M-016/M-020 precedent): StubNotificationsPort answers
// notify -> {posted:false, code:"unavailable"} and requestPermission ->
// {granted:false, code:"unavailable"}. This degradation is EQUIVALENT to the pre-#23
// state (platform.notify is a structural dead point in the Android WebView — the Web
// Notification API does not exist there), so a bridge that never acks changes nothing:
// the in-app faces (sound/badge/dock/toast) carry on and the system notification is
// simply absent. Rollback-safe by construction.
//
// SAFETY SEMANTICS (issue #23 acceptance 3, mirrored from the Kotlin bridge):
// - The op set is exactly {notify, requestPermission} — there is NO reply/cancel/interrupt
//   face; a notification can never approve a permission or stop a task (the two wire-level
//   approval call sites upstream are unreachable from this port by construction).
// - The notify payload is exactly {category, title, body, route} — this module validates
//   the category whitelist, the title/body bounds and the session-route pattern BEFORE
//   anything crosses the bridge (two-layer sanitization: this JS layer + the Kotlin native
//   re-check). Permission payload fields (action/resources/message) are structurally
//   impossible to send — the input type does not carry them.
// - Injection seam: module-level accessor (the M-016 setActiveServiceOpsPort precedent).
//   The runtime bootstrap contract (runtime.ts) is deliberately UNCHANGED; the vendored
//   entry (M-022) calls setActiveNotificationsPort once at bootstrap.

import { NOTIFICATIONS_BRIDGE } from "./transport"
import type { NotificationsBridgeTransport } from "./transport"

// ---------------------------------------------------------------------------
// Wire codes (Kotlin mirror: ERROR_CODES in NotificationsBridge.kt)
// ---------------------------------------------------------------------------

/**
 * The four explicit codes the bridge answers with: unavailable (no channel/timeout),
 * permission (POST_NOTIFICATIONS denied — silent degradation, in-app faces unaffected),
 * foreground (native front-focus re-check refused the post / background arrival never
 * prompts), io (validation/native failure). A response code outside the set degrades to io.
 */
export type NotificationsErrorCode = "unavailable" | "permission" | "foreground" | "io"

/** Every NotificationsErrorCode, in canonical order. */
export const NOTIFICATIONS_ERROR_CODES = [
  "unavailable",
  "permission",
  "foreground",
  "io",
] as const satisfies readonly NotificationsErrorCode[]

export function isNotificationsErrorCode(value: unknown): value is NotificationsErrorCode {
  return typeof value === "string" && (NOTIFICATIONS_ERROR_CODES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Shape validation (the JS layer of the two-layer defense)
// ---------------------------------------------------------------------------

/** The exactly-three notification kinds (Kotlin mirror: CATEGORIES). */
export const NOTIFICATION_CATEGORIES = ["agent", "permissions", "errors"] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

/** Native re-check mirror bounds. */
export const TITLE_MAX = 128
export const BODY_MAX = 256

/**
 * The session-route whitelist: the route is CONSTRUCTED by the caller through the upstream
 * sessionHref (`/server/<base64url(server)>/session/<sessionID>`); this pattern + the Kotlin
 * mirror re-check its shape. The base64url alphabet carries no separators, so a shape match
 * cannot smuggle extra path segments.
 */
export const ROUTE_PATTERN = /^\/server\/[A-Za-z0-9_-]{1,512}\/session\/[A-Za-z0-9_-]{1,128}$/

export interface NotifyInput {
  category: NotificationCategory
  title: string
  body: string
  /** Upstream sessionHref output (base64url server key + sessionID). */
  route: string
}

export interface NotifyOutcome {
  posted: boolean
  code?: NotificationsErrorCode
}

export interface PermissionOutcome {
  granted: boolean
  code?: NotificationsErrorCode
}

export interface NotificationsPort {
  /**
   * Post one system notification. NEVER throws: every failure path (bridge unavailable,
   * front-focused shell, denied permission, native failure, malformed response) degrades
   * to an explicit {posted:false, code} — the in-app faces are unaffected either way.
   */
  notify(op: NotifyInput): Promise<NotifyOutcome>
  /**
   * Ask the user for the POST_NOTIFICATIONS runtime permission (API 33+). NEVER throws.
   * The NATIVE side only ever opens the dialog for a user-in-foreground call (a request
   * arriving while the app is backgrounded answers {granted:false, code:"foreground"});
   * below API 33 / already granted answers {granted:true} without a dialog.
   */
  requestPermission(): Promise<PermissionOutcome>
}

/**
 * Fail-closed stub: never touches a bridge, never fakes a capability. Equivalent to the
 * pre-#23 dead point (no system notifications; the in-app faces carry on).
 */
export const StubNotificationsPort: NotificationsPort = {
  notify: async () => ({ posted: false, code: "unavailable" }),
  requestPermission: async () => ({ granted: false, code: "unavailable" }),
}

// ---------------------------------------------------------------------------
// Module-level injection seam (M-016/M-020 precedent; runtime.ts stays untouched)
// ---------------------------------------------------------------------------

let activePort: NotificationsPort = StubNotificationsPort

/** Register the bridge-backed client (the entry bootstrap, M-022). Undefined resets. */
export function setActiveNotificationsPort(port: NotificationsPort | undefined): void {
  activePort = port ?? StubNotificationsPort
}

/** The active port. Never undefined: the stub is the fail-closed default. */
export function activeNotificationsPort(): NotificationsPort {
  return activePort
}

/** Whether a real (non-stub) port was injected. */
export function notificationsBridgeInjected(): boolean {
  return activePort !== StubNotificationsPort
}

// ---------------------------------------------------------------------------
// Bridge-backed client
// ---------------------------------------------------------------------------

function codeOf(response: { ok: boolean; code?: string }): NotificationsErrorCode {
  return isNotificationsErrorCode(response.code) ? response.code : "io"
}

function validate(op: NotifyInput): string | null {
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(op.category)) return "category outside the whitelist"
  if (typeof op.title !== "string" || op.title.length === 0 || op.title.length > TITLE_MAX) return "title out of bounds"
  if (typeof op.body !== "string" || op.body.length > BODY_MAX) return "body out of bounds"
  if (typeof op.route !== "string" || !ROUTE_PATTERN.test(op.route)) return "route outside the session-route whitelist"
  return null
}

/**
 * The bridge-backed notifications port. Validation failures answer {posted:false,
 * code:"io"} BEFORE anything crosses the bridge (a rejected shape is never a fabricated
 * success); every transport failure (uncaptured handshake, timeout, channel death) degrades
 * to {posted:false, code:"unavailable"} / {granted:false, code:"unavailable"}.
 */
export function createNotificationsClient(transport: NotificationsBridgeTransport): NotificationsPort {
  return {
    notify: async (op: NotifyInput): Promise<NotifyOutcome> => {
      const invalid = validate(op)
      if (invalid) return { posted: false, code: "io" }
      if (transport.status() !== "available") return { posted: false, code: "unavailable" }
      try {
        const response = await transport.request("notify", {
          category: op.category,
          title: op.title,
          body: op.body,
          route: op.route,
        })
        if (!response.ok) return { posted: false, code: codeOf(response) }
        const posted = (response.result as Record<string, unknown> | null)?.["posted"]
        if (typeof posted !== "boolean") return { posted: false, code: "io" }
        return posted ? { posted: true } : { posted: false, code: "io" }
      } catch {
        return { posted: false, code: "unavailable" }
      }
    },

    requestPermission: async (): Promise<PermissionOutcome> => {
      if (transport.status() !== "available") return { granted: false, code: "unavailable" }
      try {
        const response = await transport.request("requestPermission", {})
        if (!response.ok) return { granted: false, code: codeOf(response) }
        const granted = (response.result as Record<string, unknown> | null)?.["granted"]
        if (typeof granted !== "boolean") return { granted: false, code: "io" }
        return granted ? { granted: true } : { granted: false }
      } catch {
        return { granted: false, code: "unavailable" }
      }
    },
  }
}

/** The dist marker constant re-exported for the probes (single source of truth). */
export const NOTIFICATIONS_MARKER = NOTIFICATIONS_BRIDGE.marker
