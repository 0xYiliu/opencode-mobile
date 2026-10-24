// Disconnect-survival refresh trigger (issue #7 acceptance 4, B1 revision) — the pure
// predicate deciding when the service panel refreshes its snapshot after the CONNECTION
// state machine moves.
//
// Trigger set (B1, precise): ANY transition INTO `ready` whose previous state was
// offline, reconnecting or authRequired. Concretely in the T1–T14 table:
//   T11 reconnecting -> ready           (reconnect succeeded)
//   T12 authRequired  -> ready          (re-authentication succeeded — this path is a
//                                        re-auth review, NOT a tunnel-loss survival story:
//                                        the interruption cause was credentials, not the
//                                        tunnel; the panel words it as "after
//                                        re-authentication" and never claims a detach
//                                        survival from it. The predicate admits it so the
//                                        snapshot refreshes, the copy stays honest.)
// The actual T-table path from offline runs offline -> T10 -> reconnecting -> T11 ->
// ready; the predicate's `offline` arm is therefore a DEFENSIVE dead branch (a direct
// offline -> ready transition does not exist in the machine) kept so the predicate stays
// total over "entered ready from an unrested state".
//
// NOT in the trigger set:
//   T5 connecting -> ready (first connect): there is no established episode before it,
//   so there is no survival to verify — the panel's own on-entry discovery covers it.
//   T9 ready -> offline: leaving ready only INVALIDATES the snapshot (the flow's O14
//   connectionLost row); the refresh happens on the way back in, per the trigger set.

import type { HostState } from "../state-machine"

export function shouldRefreshServiceStatus(previous: HostState, current: HostState): boolean {
  if (current !== "ready") return false
  return previous === "offline" || previous === "reconnecting" || previous === "authRequired"
}
