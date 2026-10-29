export type HostKeyRecoveryPhase = "warning" | "confirming" | "busy" | "removed" | "failed"

/** Behavior core for the two-step dangerous changed-key recovery affordance. */
export function createHostKeyRecoveryFlow(remove: () => Promise<boolean>) {
  let phase: HostKeyRecoveryPhase = "warning"
  const listeners = new Set<(phase: HostKeyRecoveryPhase) => void>()
  const setPhase = (next: HostKeyRecoveryPhase) => {
    phase = next
    for (const listener of listeners) listener(phase)
  }

  return {
    phase: () => phase,
    subscribe(listener: (phase: HostKeyRecoveryPhase) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    begin() {
      if (phase === "warning") setPhase("confirming")
    },
    cancel() {
      if (phase === "confirming" || phase === "failed") setPhase("warning")
    },
    async confirm() {
      // Neither a warning click nor a stale event may call the destructive port.
      if (phase !== "confirming" && phase !== "failed") return false
      setPhase("busy")
      try {
        const removed = await remove()
        setPhase(removed ? "removed" : "failed")
        return removed
      } catch {
        setPhase("failed")
        return false
      }
    },
  }
}
