// SshBridgeHostTransport (issue #6, decision 0003 §2) — the real HostTransport over the
// ssh bridge. The fail-closed StubHostTransport stays the runtime default; shells inject
// this transport (M-015) and only when the bridge acks can a tunnel exist at all.
//
// Session addressing: the bridge keys sessions by the parsed `host:port` of the target
// (at most one active session per host — a new connect for the same key is only legal
// after the previous attempt was aborted, which the machine's T13/T1 flows guarantee).
// The AbortSignal drives ALL teardown locally:
//   - abort while connecting -> bridge `cancel` (in-flight connect aborted)
//   - abort after established -> bridge `disconnect` (session + local listener released)
// Both are local teardowns: the bridge only tears down the SSH transport
// (SSH_MSG_DISCONNECT) and the loopback listener — the remote OpenCode process keeps
// running (AGENTS.md red line, F8① precise wording; Kotlin side double-writes it).
//
// connectionLost: the bridge pushes the unsolicited native event; this transport routes
// it to the attempt's onEvent as { type: "connectionLost" } so the machine lands in
// offline (T9). The event never carries credential material.
//
// The endpoint is loopback-only by construction and by validation (parseBridgeEndpoint):
// `http://127.0.0.1:<dynamicPort>` — the dynamic port is kernel-assigned (bind
// 127.0.0.1:0 native-side) and the forward target is the REMOTE loopback
// `localhost:<servicePort>` single hop (no jump host, no WSL, no device-side service).

import { bridgeErrorToTransportError, bridgeServicePort, parseBridgeEndpoint, type SshBridgeTransport } from "./bridge"
import { parseSshTargetHost, parseSshTargetUser } from "./known-hosts"
import { SshTransportError } from "../transport/ssh-errors"
import type { HostTransport, TransportEndpoint, TransportEvent } from "../ports"

interface OpenInput {
  target: string
  credential?: string
  pinnedFingerprint?: string
  servicePort?: number
  signal: AbortSignal
  onEvent: (event: TransportEvent) => void
}

export function createSshHostTransport(transport: SshBridgeTransport): HostTransport {
  // sessionKey `${host}:${port}` -> phase. Connecting vs established decides which
  // bridge op an abort fires (cancel vs disconnect).
  const phases = new Map<string, "connecting" | "established">()
  // sessionKey -> the open() attempt's onEvent sink (connectionLost routing).
  const sinks = new Map<string, (event: TransportEvent) => void>()

  const unsubscribeEvents = transport.onEvent((event) => {
    if (event.type !== "connectionLost") return
    const key = `${event.host}:${event.port}`
    const sink = sinks.get(key)
    if (sink) {
      phases.delete(key)
      sinks.delete(key)
      sink({ type: "connectionLost" })
    }
  })
  // The factory lives for the app's lifetime (one transport per shell, M-015); the
  // unsubscribe is retained only for structural symmetry with the other listeners.
  void unsubscribeEvents

  const teardown = (key: string, op: "cancel" | "disconnect", host: string, port: number) => {
    phases.delete(key)
    sinks.delete(key)
    // Fire-and-forget local teardown: a dead bridge must not break the abort path (the
    // bridge dying already tore the channel down native-side).
    void transport.request(op, { host, port }).catch(() => {})
  }

  return {
    open: async (input: OpenInput): Promise<TransportEndpoint> => {
      if (input.signal.aborted) throw new SshTransportError("io", "attempt already aborted")
      const { host, port } = parseSshTargetHost(input.target)
      // Review B2 (issue #7): the target's user@ segment is the SSH username — a routing
      // fact, NOT a credential — and must reach the session (the pre-B2 bug dropped it
      // here, so the native getSession received the password as the username). Absent for
      // user-less targets (the session falls back to the server's default behavior).
      const username = parseSshTargetUser(input.target)
      const servicePort = bridgeServicePort(input.servicePort)
      const key = `${host}:${port}`

      const onAbort = () => teardown(key, phases.get(key) === "established" ? "disconnect" : "cancel", host, port)
      input.signal.addEventListener("abort", onAbort, { once: true })

      phases.set(key, "connecting")
      sinks.set(key, input.onEvent)
      try {
        const response = await transport.request("connect", {
          host,
          port,
          servicePort,
          ...(username !== undefined ? { username } : {}),
          ...(input.credential !== undefined ? { credential: input.credential } : {}),
          ...(input.pinnedFingerprint !== undefined ? { pinnedFingerprint: input.pinnedFingerprint } : {}),
        })
        if (!response.ok) throw bridgeErrorToTransportError(response.code, response.message)
        const endpoint = parseBridgeEndpoint(response.result)
        if (input.signal.aborted) {
          // The attempt died while the bridge was answering: tear the fresh session down
          // locally (the runtime will drop the endpoint; the remote keeps running).
          teardown(key, "disconnect", host, port)
          throw new SshTransportError("io", "attempt aborted during open")
        }
        phases.set(key, "established")
        // The abort listener stays registered for the established phase (it drives the
        // disconnect path); a later abort of this signal tears the session down locally.
        return endpoint
      } catch (error) {
        input.signal.removeEventListener("abort", onAbort)
        phases.delete(key)
        sinks.delete(key)
        throw error
      }
    },
  }
}
