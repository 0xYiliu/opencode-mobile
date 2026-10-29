import type { HostKeyConfirmation, MobileHosts } from "../runtime"
import { DEFAULT_SERVICE_PORT } from "../registry"
import { parseSshTargetHost } from "../ssh/known-hosts"

/** Snapshot one host ID and the fingerprint presented for that exact ID. */
export function bindHostKeyPrompt(runtime: MobileHosts, hostId: string) {
  const record = runtime.registry.get(hostId)
  const target = record?.target ?? ""
  const servicePort = record?.servicePort ?? DEFAULT_SERVICE_PORT
  const fingerprint = runtime.fingerprintOf(hostId) ?? ""
  return {
    hostId,
    hostName: record?.name ?? hostId,
    target,
    sshPort: parseSshTargetHost(target).port,
    servicePort,
    fingerprint,
    confirm: () => runtime.confirmHostKey(hostId, {
      target,
      servicePort,
      fingerprint,
    } satisfies HostKeyConfirmation),
    reject: () => runtime.rejectHostKey(hostId),
  }
}
