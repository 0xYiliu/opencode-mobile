// Fake native SSH bridge (software mirror of the Kotlin SshTunnelBridge, same shape as the
// vault/probe in-process engines). Shared by the bridge isolation tests, the
// verifier/transport tests and the runtime full-flow tests.
//
// Handlers receive the validated request params and either return a result object or
// throw an object shaped { code } to produce an error response. Nothing here touches a
// network; all key material is synthetic.

import { SSH_BRIDGE, createWebMessageSshTransport } from "../src/ssh/bridge"
import type { SshBridgeOperation, SshBridgeTransport } from "../src/ssh/bridge"

export type FakeSshHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>

export interface FakeSshBridge {
  transport: SshBridgeTransport
  native: {
    /** Deliver the ssh handshake (as the WebView would) and let the client ack. */
    connect(): void
    /** Deliver an arbitrary event shape (malformed-handshake tests). */
    deliver(event: { data: unknown; ports?: unknown }): void
    /** Raw JSON strings the client posted, oldest first (request/param inspection). */
    sent(): string[]
    /** Parse of the client's requests, oldest first (id + op + params). */
    requests(): Array<{ id: string; op: string; params: Record<string, unknown> }>
    /** Whether the client's ack arrived. */
    acked(): boolean
    /** Push a handcrafted JSON response to the client. */
    push(raw: unknown): void
    /** Push a native unsolicited event (connectionLost). */
    pushEvent(raw: Record<string, unknown>): void
    /** Replace the operation handlers (mid-test failure injection). */
    setHandlers(handlers: Partial<Record<SshBridgeOperation, FakeSshHandler>>): void
  }
}

export function createFakeSshBridge(
  handlers: Partial<Record<SshBridgeOperation, FakeSshHandler>> = {},
  options: { timeoutMs?: number; requestId?: () => string } = {},
): FakeSshBridge {
  const sent: string[] = []
  const requests: Array<{ id: string; op: string; params: Record<string, unknown> }> = []
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  let acked = false
  let activeHandlers = handlers

  const transport = createWebMessageSshTransport({
    timeoutMs: options.timeoutMs,
    requestId: options.requestId,
    subscribe(handler) {
      subscriber = handler
      return () => {
        subscriber = undefined
      }
    },
  })

  const nativePort = {
    postMessage(raw: string) {
      sent.push(raw)
      void (async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (typeof parsed !== "object" || parsed === null) return
        const record = parsed as Record<string, unknown>
        if (record["op"] === "ack") {
          acked = true
          return
        }
        const id = record["id"]
        const op = record["op"]
        const params = (typeof record["params"] === "object" && record["params"] !== null ? record["params"] : {}) as Record<string, unknown>
        if (typeof id !== "string" || typeof op !== "string") return
        requests.push({ id, op, params })
        const handler = activeHandlers[op as SshBridgeOperation]
        if (!handler) {
          push({ id, ok: false, code: "io", message: "" })
          return
        }
        try {
          const result = await handler(params)
          push({ id, ok: true, result })
        } catch (error) {
          const code = (error as { code?: unknown })?.code
          push({ id, ok: false, code: typeof code === "string" ? code : "io", message: "" })
        }
      })()
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
    close() {
      /* engine port close is a no-op */
    },
  }

  function push(raw: unknown) {
    nativePort.onmessage?.({ data: JSON.stringify(raw) })
  }

  return {
    transport,
    native: {
      connect() {
        subscriber?.call(undefined, { data: SSH_BRIDGE.handshake, ports: [nativePort] })
      },
      deliver(event) {
        subscriber?.call(undefined, event)
      },
      sent: () => [...sent],
      requests: () => [...requests],
      acked: () => acked,
      push,
      pushEvent: (raw) => push(raw),
      setHandlers(next) {
        activeHandlers = { ...activeHandlers, ...next }
      },
    },
  }
}
