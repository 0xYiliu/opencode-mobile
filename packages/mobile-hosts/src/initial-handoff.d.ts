import type { HostState } from "./state-machine";
/** A pending save may finish after mode switch; it may publish a record, but not auto-connect. */
export declare function canStartInitialSshAttempt(input: {
    activeMode: boolean;
    ownerActive: boolean;
    ownerGeneration: number | undefined;
    currentGeneration: number;
}): boolean;
/** A completed save stays selectable if the user left SSH mode while vault.put was pending. */
export declare function shouldSelectCreatedSshHost(input: {
    activeMode: boolean;
    ownerActive: boolean;
    ownerGeneration: number | undefined;
    currentGeneration: number;
}): boolean;
/** Exact-owner handoff gate for the initial SSH screen (never a generic ready-host check). */
export declare function canHandoffInitialSsh(input: {
    activeMode: boolean;
    formOpen: boolean;
    ownerActive: boolean;
    ownerHostId: string | undefined;
    hostId: string;
    ownerGeneration: number;
    currentGeneration: number;
    state: HostState;
    serviceAuthenticated: boolean;
}): boolean;
