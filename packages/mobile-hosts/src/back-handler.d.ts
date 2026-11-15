/**
 * The in-app back dispatch face. NEVER throws; a chain that cannot decide answers false
 * (the Android default proceeds — the activity finishes), never blocks.
 */
export interface BackHandlerPort {
    /**
     * Offer the back press to the in-app back chain. Returns true when a layer consumed
     * the press (the activity stays); false when nobody handled it (Android default finish).
     */
    consume(): boolean;
}
/**
 * The only request shape accepted by the native back bridge. The request intentionally has
 * no URL, origin, token, or credential fields: the native side already gates the WebView to
 * the packaged app origin and passes only this opaque nonce to the main frame. The nonce is
 * schema/duplicate-tracking data, not a security capability; this binding is trusted only
 * because it is installed in the same-origin packaged app UI.
 */
export interface BackRequest {
    readonly version: 1;
    readonly type: "back";
    readonly requestId: string;
}
export declare const BACK_REQUEST_VERSION: 1;
export declare const BACK_REQUEST_TYPE: "back";
export declare const BACK_REQUEST_ID_MAX_BYTES = 256;
export declare const BACK_REQUEST_ID_HISTORY_LIMIT = 64;
/** Validate the fixed, bounded request before it reaches the synchronous chain. */
export declare function isBackRequest(value: unknown): value is BackRequest;
export interface BackHandlerBinding {
    consume(request: unknown): boolean;
    dispose(): void;
}
/**
 * Build the window-facing binding around the existing port. Requests are synchronous, but
 * the guard still rejects re-entry, reused recent request IDs, and calls after disposal so a
 * stale native callback can never consume a later press. The duplicate window is deliberately
 * bounded: native request IDs are unique per dispatch, while the binding retains only the
 * most recent finite history.
 */
export declare function createBackHandlerBinding(port: BackHandlerPort): BackHandlerBinding;
/**
 * Fail-closed stub: consumes nothing. Equivalent to the pre-#145 state (back finishes the
 * activity), so the port being absent or not yet injected changes nothing.
 */
export declare const StubBackHandlerPort: BackHandlerPort;
/** Register the chain-backed implementation (the vendored entry bootstrap). Undefined resets. */
export declare function setActiveBackHandlerPort(port: BackHandlerPort | undefined): void;
/** The active port. Never undefined: the stub is the fail-closed default. */
export declare function activeBackHandlerPort(): BackHandlerPort;
/** Whether a real (non-stub) port was injected. */
export declare function backHandlerInjected(): boolean;
