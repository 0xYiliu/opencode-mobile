// SshBridgeHostKeyVerifier (issue #6, decision 0003 §3.3) — the real HostKeyVerifier over
// the ssh bridge. The fail-closed StubHostKeyVerifier stays the runtime default; shells
// inject this verifier (M-015) and only when the bridge acks does anything change.
//
// Decision flow (decision 0003 §3.3 — credentials are issued to NO ONE before a
// fingerprint is confirmed):
//   1. bridge availability FIRST: unavailable -> SshTransportError("bridge-unavailable").
//      Never a fabricated host-key rejection (a dead bridge must not read as "bad key").
//   2. `fetchHostKey` performs the native KEX key-scan (one-shot session, ZERO
//      authentication material, explicit timeout) and compares against the authoritative
//      known_hosts store ON THE NATIVE SIDE (defense in depth: the JS side never
//      re-implements the trust decision):
//        store hit with the same key    -> { decision: "trust", fingerprint }
//        store hit with a different key -> error code "host-key-changed"
//        no store record                -> { decision: "prompt", fingerprint }
//   3. Mapping: trust -> trust; prompt -> prompt(fingerprint); changed ->
//      reject(reason:"changed") — the hard refusal that never auto-overwrites; any other
//      error code -> thrown SshTransportError (reachability/auth failures surface as
//      failures, never as host-key rejections).
//
// The fingerprint format is the documented OpenSSH representation
// (`SHA256:<base64_nopad(SHA-256(keyblob))>`, ./fingerprint); the native side computes it
// and the format guard here rejects malformed shapes before UI ever shows one.

import { isSshFingerprint } from "./fingerprint"
import { bridgeErrorToTransportError, type SshBridgeTransport } from "./bridge"
import { SshTransportError } from "../transport/ssh-errors"
import type { HostKeyDecision, HostKeyVerifier } from "../ports"
import { parseSshTargetHost } from "./known-hosts"

export function createSshHostKeyVerifier(transport: SshBridgeTransport): HostKeyVerifier {
  return {
    verify: async (input: { host: string }): Promise<HostKeyDecision> => {
      // 1. Bridge availability first (never misreport a dead bridge as a key rejection).
      if (transport.status() !== "available") {
        throw new SshTransportError("bridge-unavailable", "ssh bridge handshake not captured")
      }
      const { host, port } = parseSshTargetHost(input.host)
      // 2. Native scan + store comparison (zero authentication material on the wire).
      const response = await transport.request("fetchHostKey", { host, port })
      if (response.ok) {
        const decision = response.result["decision"]
        const fingerprint = response.result["fingerprint"]
        if (decision === "trust") return { action: "trust" }
        if (decision === "prompt" && isSshFingerprint(fingerprint)) {
          return { action: "prompt", fingerprint }
        }
        throw new SshTransportError("io", "ssh bridge returned a malformed host-key decision")
      }
      // 3. Changed key = the strict refusal with its reason; everything else throws.
      if (response.code === "host-key-changed") return { action: "reject", reason: "changed" }
      throw bridgeErrorToTransportError(response.code, response.message)
    },
  }
}

/**
 * Remove a host's stored key through the bridge (the changed-key recovery path: an
 * explicit user confirmation above this call, never an automatic overwrite — decision
 * 0003 §3.3). Idempotent native-side.
 */
export async function removeSshHostKey(transport: SshBridgeTransport, target: string): Promise<void> {
  if (transport.status() !== "available") {
    throw new SshTransportError("bridge-unavailable", "ssh bridge handshake not captured")
  }
  const { host, port } = parseSshTargetHost(target)
  const response = await transport.request("removeHostKey", { host, port })
  if (!response.ok) throw bridgeErrorToTransportError(response.code, response.message)
}
