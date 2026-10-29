import { evaluateRemember } from "../vault/remember"
import type { RememberInput, RememberDecision } from "../vault/remember"
import type { CredentialVault } from "../vault/types"

export type HostCredentialDecision = (RememberDecision & { forcesSave: boolean }) | {
  action: "abort"
  reason: "needs-password" | "key-requires-vault"
  forcesSave: boolean
}

/** Imported key data is a credential even when the password editor is empty. */
export function decideHostCredential(input: Omit<RememberInput, "valueEmpty"> & {
  password: string
  pendingKey?: string
}): HostCredentialDecision {
  const forcesSave = input.remember !== Boolean(input.priorRef)
  // The SSH driver resolves credentialRefs. A staged key must remain explicitly vault-backed;
  // never persist it behind an unchecked/unavailable Remember choice or silently drop it.
  if (input.pendingKey !== undefined && (!input.checkboxRendered || !input.remember)) {
    return { action: "abort", reason: "key-requires-vault", forcesSave }
  }
  return evaluateRemember({
    mode: input.mode,
    checkboxRendered: input.checkboxRendered,
    remember: input.remember,
    priorRef: input.priorRef,
    ...(input.boundKind ? { boundKind: input.boundKind } : {}),
    valueEmpty: input.password.length === 0 && input.pendingKey === undefined,
  })
}

export async function persistHostCredential(input: {
  vault: CredentialVault
  decision: HostCredentialDecision
  password: string
  pendingKey?: string
  keyPassphrase: string
}): Promise<{ credentialRef?: string; kind?: "password" | "privateKey" }> {
  if (input.decision.action === "abort") throw new Error(`host credential save blocked: ${input.decision.reason}`)
  if (input.pendingKey !== undefined) {
    if (input.decision.action !== "put") throw new Error("imported key is not selected for remembered storage")
    const value = input.keyPassphrase.length > 0
      ? JSON.stringify({ v: 1, key: input.pendingKey, passphrase: input.keyPassphrase })
      : input.pendingKey
    return { credentialRef: await input.vault.put({ kind: "privateKey", value }), kind: "privateKey" }
  }
  if (input.decision.action === "put") {
    return { credentialRef: await input.vault.put({ kind: "password", value: input.password }), kind: "password" }
  }
  if (input.decision.action === "passthrough") {
    return { ...(input.decision.ref !== undefined ? { credentialRef: input.decision.ref } : {}) }
  }
  // `clear` intentionally drops only the record reference; old encrypted values remain in
  // the vault's orphan list until the user explicitly deletes them in CredentialManager.
  return {}
}
