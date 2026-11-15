import type { RememberInput, RememberDecision } from "../vault/remember";
import type { CredentialVault } from "../vault/types";
export type HostCredentialDecision = (RememberDecision & {
    forcesSave: boolean;
}) | {
    action: "abort";
    reason: "needs-password" | "key-requires-vault";
    forcesSave: boolean;
};
/** Imported key data is a credential even when the password editor is empty. */
export declare function decideHostCredential(input: Omit<RememberInput, "valueEmpty"> & {
    password: string;
    pendingKey?: string;
}): HostCredentialDecision;
export declare function persistHostCredential(input: {
    vault: CredentialVault;
    decision: HostCredentialDecision;
    password: string;
    pendingKey?: string;
    keyPassphrase: string;
}): Promise<{
    credentialRef?: string;
    kind?: "password" | "privateKey";
}>;
