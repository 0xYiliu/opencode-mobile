// Fake native service ops bridge (software mirror of the Kotlin ServiceOpsBridge, same
// shape as the vault/probe/ssh in-process fakes). Nothing here touches a network; all
// output is synthetic. Handlers receive the validated request params and either return a
// result object or throw an object shaped { code } to produce an error response.

import { SVCOPS_BRIDGE, createWebMessageServiceOpsTransport } from "../src/service-ops/bridge"
import type { ServiceOpsBridgeOperation, ServiceOpsBridgeTransport } from "../src/service-ops/bridge"

export type FakeSvcopsHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>

export interface FakeSvcopsBridge {
  transport: ServiceOpsBridgeTransport
  native: {
    connect(): void
    deliver(event: { data: unknown; ports?: unknown }): void
    sent(): string[]
    requests(): Array<{ id: string; op: string; params: Record<string, unknown> }>
    acked(): boolean
    push(raw: unknown): void
    setHandlers(handlers: Partial<Record<ServiceOpsBridgeOperation, FakeSvcopsHandler>>): void
  }
}

export function createFakeSvcopsBridge(
  handlers: Partial<Record<ServiceOpsBridgeOperation, FakeSvcopsHandler>> = {},
  options: { timeoutMs?: number; requestId?: () => string } = {},
): FakeSvcopsBridge {
  const sent: string[] = []
  const requests: Array<{ id: string; op: string; params: Record<string, unknown> }> = []
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  let acked = false
  let activeHandlers = handlers

  const transport = createWebMessageServiceOpsTransport({
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
        const handler = activeHandlers[op as ServiceOpsBridgeOperation]
        if (!handler) {
          push({ id, ok: false, code: "exec-failed", message: "" })
          return
        }
        try {
          const result = await handler(params)
          push({ id, ok: true, result })
        } catch (error) {
          const code = (error as { code?: unknown })?.code
          push({ id, ok: false, code: typeof code === "string" ? code : "exec-failed", message: "" })
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
        subscriber?.call(undefined, { data: SVCOPS_BRIDGE.handshake, ports: [nativePort] })
      },
      deliver(event) {
        subscriber?.call(undefined, event)
      },
      sent: () => [...sent],
      requests: () => [...requests],
      acked: () => acked,
      push,
      setHandlers(next) {
        activeHandlers = { ...activeHandlers, ...next }
      },
    },
  }
}
