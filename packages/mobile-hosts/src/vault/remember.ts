// "Remember credential" truth table v3 (issue #4, decision D3) — the pure decision core of
// the connect dialog's remember-checkbox (vendored M-009 glue calls this).
//
// Keeping the table here (first-party, unit-tested, probe-able through the in-process
// vault engine) keeps the vendored patch thin: the dialog translates the decision into
// vault calls and the constructed connection. Semantics: docs/design/units/connection.md
// 「可选记住真值表 v3」 (12 rows; row 12 resolves to row-2 semantics per review).
//
// prior semantics (review note): the prior is found at save time by normalized URL from
// server.list for BOTH the password and the link/redeem add flow (not method-gated),
// otherwise the M-006 `original` is undefined on add and the reference would orphan. Only
// the ref field is carried from the prior. Checkbox initial value is Boolean(priorRef).

import { isValidCredentialRef } from "../credential-ref"

export interface RememberInput {
  /** Dialog mode: row 8 (keep on empty) is edit-only; its add analogue aborts (row 12). */
  mode: "add" | "edit"
  /** The checkbox is rendered for the password method only (link flows never render it). */
  checkboxRendered: boolean
  /** Resolved checkbox state: the user's choice once touched, else Boolean(priorRef). */
  remember: boolean
  /** Whether the credential field is empty at save time. */
  valueEmpty: boolean
  /** The prior's credential reference (edit original, or the URL-matched prior on add). */
  priorRef?: string
}

export type RememberDecision =
  /** Construct the connection with this ref forwarded, zero vault ops (rows 6/8/11). */
  | { action: "passthrough"; ref?: string }
  /** Encrypt and store; in-place (ref stable) when existingRef is present (rows 1/3/7). */
  | { action: "put"; existingRef?: string }
  /** Drop the reference from the connection and delete the vault entry (rows 4/9/10). */
  | { action: "clear"; ref: string }
  /** Construct with no reference; zero vault ops (row 5 and its edit analogues). */
  | { action: "none" }
  /** Rows 2/12 (and the edit analogue): stop the save, inline error, nothing stored. */
  | { action: "abort"; reason: "needs-password" }

/** Checkbox initial value: checked iff the ref-bearing original has a reference. */
export function initialRemember(priorRef: string | undefined): boolean {
  return Boolean(priorRef)
}

/**
 * Evaluate one row of truth table v3. Never touches the vault itself: callers translate
 * `put`/`clear` into bridge calls and must surface any bridge failure inline (never
 * silently close the dialog).
 */
export function evaluateRemember(input: RememberInput): RememberDecision & { forcesSave: boolean } {
  const priorRef = input.priorRef !== undefined && isValidCredentialRef(input.priorRef) ? input.priorRef : undefined
  if (!input.checkboxRendered) {
    // Rows 6/11: no checkbox means no remember intent either way — the prior ref passes
    // through untouched (a missing checkbox is NOT a deletion intent).
    return { action: "passthrough", ref: priorRef, forcesSave: false }
  }
  // Early-exit forcing: a rendered checkbox whose state differs from the prior's remembered
  // flag IS a change even when url/name/password are unchanged (covers "only toggled
  // remember" and "unchecked after hydration prefill").
  const forcesSave = input.remember !== Boolean(priorRef)
  if (input.remember) {
    if (input.valueEmpty) {
      // Row 8: an edit that stays checked with nothing typed keeps the stored ref — the
      // remembered credential is still there; health checks use the resolved in-memory value.
      if (input.mode === "edit" && priorRef !== undefined) {
        return { action: "passthrough", ref: priorRef, forcesSave }
      }
      // Rows 2/12 (and the edit-without-ref analogue): "remember an empty credential" is not
      // a valid intent — abort the save with the inline needs-password message; no put, no
      // empty value ever cast into the vault.
      return { action: "abort", reason: "needs-password", forcesSave }
    }
    return { action: "put", ...(priorRef !== undefined ? { existingRef: priorRef } : {}), forcesSave }
  }
  if (priorRef !== undefined) {
    // Rows 4/9/10: unchecking clears the reference and deletes the vault entry (the entered
    // password still authorizes this very save).
    return { action: "clear", ref: priorRef, forcesSave }
  }
  // Row 5 (and its edit analogues): nothing remembered, nothing to clean up.
  return { action: "none", forcesSave }
}
