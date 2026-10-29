import type { HostState } from "./state-machine"

/** A pending save may finish after mode switch; it may publish a record, but not auto-connect. */
export function canStartInitialSshAttempt(input: {
  activeMode: boolean
  ownerActive: boolean
  ownerGeneration: number | undefined
  currentGeneration: number
}): boolean {
  return input.activeMode && input.ownerActive && input.ownerGeneration !== undefined && input.ownerGeneration === input.currentGeneration
}

/** A completed save stays selectable if the user left SSH mode while vault.put was pending. */
export function shouldSelectCreatedSshHost(input: {
  activeMode: boolean
  ownerActive: boolean
  ownerGeneration: number | undefined
  currentGeneration: number
}): boolean {
  return !input.ownerActive || !input.activeMode || canStartInitialSshAttempt(input)
}

/** Exact-owner handoff gate for the initial SSH screen (never a generic ready-host check). */
export function canHandoffInitialSsh(input: {
  activeMode: boolean
  formOpen: boolean
  ownerActive: boolean
  ownerHostId: string | undefined
  hostId: string
  ownerGeneration: number
  currentGeneration: number
  state: HostState
  serviceAuthenticated: boolean
}): boolean {
  return (
    input.activeMode &&
    !input.formOpen &&
    input.ownerActive &&
    input.ownerHostId === input.hostId &&
    input.ownerGeneration === input.currentGeneration &&
    input.state === "ready" &&
    input.serviceAuthenticated
  )
}
