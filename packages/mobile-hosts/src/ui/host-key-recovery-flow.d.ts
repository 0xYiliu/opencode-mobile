export type HostKeyRecoveryPhase = "warning" | "confirming" | "busy" | "removed" | "failed";
/** Behavior core for the two-step dangerous changed-key recovery affordance. */
export declare function createHostKeyRecoveryFlow(remove: () => Promise<boolean>): {
    phase: () => HostKeyRecoveryPhase;
    subscribe(listener: (phase: HostKeyRecoveryPhase) => void): () => boolean;
    begin(): void;
    cancel(): void;
    confirm(): Promise<boolean>;
};
