import type { VaultKind } from "./types";
export interface RememberInput {
    /** Dialog mode: row 8 (keep on empty) is edit-only; its add analogue aborts (row 12). */
    mode: "add" | "edit";
    /**
     * The checkbox participates in the decision only when it is rendered AND enabled: the
     * password method (link flows never render it) and the vault available. When false, the
     * prior ref passes through untouched and zero vault operations follow — an unavailable
     * vault must not silently clear a remembered credential.
     */
    checkboxRendered: boolean;
    /** Resolved checkbox state: the user's choice once touched, else Boolean(priorRef). */
    remember: boolean;
    /** Whether the credential field is empty at save time. */
    valueEmpty: boolean;
    /** The prior's credential reference (edit original, or the URL-matched prior on add). */
    priorRef?: string;
    /**
     * Kind of the credential bound to priorRef, when known (host-dialog assembly, issue #4
     * review fix). A remembered PRIVATE KEY on an empty value keeps the binding in add and
     * edit alike — a key binding has no value to type, and aborting the save would strand the
     * imported entry as an orphan. M-009 (direct servers, password kind) does not pass the
     * field and is unaffected. The UI additionally disables the password field while a key is
     * bound, so a password can never in-place overwrite a key entry through the form.
     */
    boundKind?: VaultKind;
}
export type RememberDecision = 
/** Construct the connection with this ref forwarded, zero vault ops (rows 6/8/11). */
{
    action: "passthrough";
    ref?: string;
}
/** Encrypt and store; in-place (ref stable) when existingRef is present (rows 1/3/7). */
 | {
    action: "put";
    existingRef?: string;
}
/** Drop the reference from the connection and delete the vault entry (rows 4/9/10). */
 | {
    action: "clear";
    ref: string;
}
/** Construct with no reference; zero vault ops (row 5 and its edit analogues). */
 | {
    action: "none";
}
/** Rows 2/12 (and the edit analogue): stop the save, inline error, nothing stored. */
 | {
    action: "abort";
    reason: "needs-password";
};
/** Checkbox initial value: checked iff the ref-bearing original has a reference. */
export declare function initialRemember(priorRef: string | undefined): boolean;
/**
 * Evaluate one row of truth table v3. Never touches the vault itself: callers translate
 * `put`/`clear` into bridge calls and must surface any bridge failure inline (never
 * silently close the dialog).
 */
export declare function evaluateRemember(input: RememberInput): RememberDecision & {
    forcesSave: boolean;
};
