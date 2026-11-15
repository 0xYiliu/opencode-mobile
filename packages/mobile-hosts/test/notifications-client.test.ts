import { describe, expect, test } from "bun:test"
import {
  BODY_MAX,
  NOTIFICATION_CATEGORIES,
  NOTIFICATIONS_ERROR_CODES,
  ROUTE_PATTERN,
  StubNotificationsPort,
  TITLE_MAX,
  activeNotificationsPort,
  createNotificationsClient,
  notificationsBridgeInjected,
  setActiveNotificationsPort,
  type NotificationsPort,
} from "../src/notifications/client"
import { NOTIFICATIONS_HANDSHAKE, createWebMessageNotificationsTransport } from "../src/notifications/transport"

// Notifications port client + seam (issue #23, plan D3; issue #195 four-category set).
// The fail-closed stub semantics, the four-code taxonomy, the two-layer shape validation
// (JS layer: category set exactly four / title+body bounds / session-route pattern) and
// the safety op set are locked here. All payloads are synthetic.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type NativeReply = Record<string, unknown>

function createEngine(serve: (op: string, params: Record<string, unknown>) => NativeReply | "silence") {
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  const requests: { op: string; params: Record<string, unknown> }[] = []

  const transport = createWebMessageNotificationsTransport({
    subscribe(handler) {
      subscriber = handler
      return () => {
        subscriber = undefined
      }
    },
  })

  const nativePort = {
    postMessage(raw: string) {
      void (async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (typeof parsed !== "object" || parsed === null) return
        const record = parsed as Record<string, unknown>
        if (record["op"] === "ack") return
        if (typeof record["id"] !== "string" || typeof record["op"] !== "string") return
        const params = (typeof record["params"] === "object" && record["params"] !== null ? record["params"] : {}) as Record<string, unknown>
        requests.push({ op: record["op"], params })
        const reply = serve(record["op"], params)
        if (reply === "silence") return
        nativePort.onmessage?.({ data: JSON.stringify({ id: record["id"], ...reply }) })
      })()
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
  }

  return {
    transport,
    client: createNotificationsClient(transport),
    requests,
    native: {
      connect: () => subscriber?.call(undefined, { data: NOTIFICATIONS_HANDSHAKE, ports: [nativePort] }),
    },
  }
}

const VALID = { category: "agent", title: "Response ready", body: "session title", route: "/server/c2VydmVy/session/abc" }

// ---------------------------------------------------------------------------
// Seam + fail-closed stub
// ---------------------------------------------------------------------------

describe("StubNotificationsPort + module-level seam (fail-closed defaults)", () => {
  test("stub notify answers {posted:false, code:'unavailable'} (equivalent to the pre-#23 dead point)", async () => {
    expect(await StubNotificationsPort.notify({ ...VALID })).toEqual({ posted: false, code: "unavailable" })
  })

  test("stub requestPermission answers {granted:false, code:'unavailable'} (no dialog anywhere)", async () => {
    expect(await StubNotificationsPort.requestPermission()).toEqual({ granted: false, code: "unavailable" })
  })

  test("the seam defaults to the stub and registration swaps it in; undefined resets", async () => {
    expect(activeNotificationsPort()).toBe(StubNotificationsPort)
    expect(notificationsBridgeInjected()).toBeFalse()
    const custom: NotificationsPort = {
      notify: async () => ({ posted: true }),
      requestPermission: async () => ({ granted: true }),
    }
    setActiveNotificationsPort(custom)
    expect(activeNotificationsPort()).toBe(custom)
    expect(notificationsBridgeInjected()).toBeTrue()
    setActiveNotificationsPort(undefined)
    expect(activeNotificationsPort()).toBe(StubNotificationsPort)
    expect(notificationsBridgeInjected()).toBeFalse()
  })
})

// ---------------------------------------------------------------------------
// Taxonomy + shape validation (JS layer of the two-layer defense)
// ---------------------------------------------------------------------------

describe("taxonomy + JS-side shape validation", () => {
  test("the category set is exactly the four kinds, questions adjacent to permissions (issue #195)", () => {
    // Exact order locked (not sorted): questions sits adjacent to permissions, mirroring
    // the settings row order and the upstream requestTitles two-value map
    // (question/mcp-elicitation -> questions). The Kotlin CATEGORIES mirror re-checks
    // membership only; this order is the shared package's canonical declaration.
    expect([...NOTIFICATION_CATEGORIES]).toEqual(["agent", "permissions", "questions", "errors"])
  })

  test("the wire code set is exactly the four codes", () => {
    expect([...NOTIFICATIONS_ERROR_CODES]).toEqual(["unavailable", "permission", "foreground", "io"])
  })

  test("route pattern: legal sessionHref shapes pass", () => {
    expect(ROUTE_PATTERN.test("/server/c2VydmVy/session/abc")).toBeTrue()
    expect(ROUTE_PATTERN.test("/server/a-b_c/session/ses_123-x")).toBeTrue()
    expect(ROUTE_PATTERN.test(`/server/${"A".repeat(512)}/session/${"s".repeat(128)}`)).toBeTrue()
  })

  test("route pattern: extra segments, traversal, wrong scheme and oversized shapes fail", () => {
    expect(ROUTE_PATTERN.test("/server/abc/session/abc/extra")).toBeFalse()
    expect(ROUTE_PATTERN.test("/server/../session/abc")).toBeFalse()
    expect(ROUTE_PATTERN.test("/other/abc/session/abc")).toBeFalse()
    expect(ROUTE_PATTERN.test("/server/abc/session/abc?x=1")).toBeFalse()
    expect(ROUTE_PATTERN.test(`/server/${"A".repeat(513)}/session/abc`)).toBeFalse()
    expect(ROUTE_PATTERN.test(`/server/abc/session/${"s".repeat(129)}`)).toBeFalse()
  })

  test("notify refuses an out-of-whitelist category BEFORE anything crosses the bridge", async () => {
    const engine = createEngine(() => ({ ok: true, result: { posted: true } }))
    engine.native.connect()
    const result = await engine.client.notify({ ...VALID, category: "marketing" as never })
    expect(result).toEqual({ posted: false, code: "io" })
    expect(engine.requests).toHaveLength(0)
  })

  test("notify refuses an illegal route / oversized title+body before the bridge", async () => {
    const engine = createEngine(() => ({ ok: true, result: { posted: true } }))
    engine.native.connect()
    expect(await engine.client.notify({ ...VALID, route: "/server/../session/x" })).toEqual({ posted: false, code: "io" })
    expect(await engine.client.notify({ ...VALID, title: "t".repeat(TITLE_MAX + 1) })).toEqual({ posted: false, code: "io" })
    expect(await engine.client.notify({ ...VALID, body: "b".repeat(BODY_MAX + 1) })).toEqual({ posted: false, code: "io" })
    expect(engine.requests).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Bridge-backed client over a fake native port
// ---------------------------------------------------------------------------

describe("createNotificationsClient (bridge-backed)", () => {
  test("before the handshake every call degrades to 'unavailable' (fail-closed)", async () => {
    const engine = createEngine(() => ({ ok: true, result: { posted: true } }))
    expect(await engine.client.notify({ ...VALID })).toEqual({ posted: false, code: "unavailable" })
    expect(await engine.client.requestPermission()).toEqual({ granted: false, code: "unavailable" })
  })

  test("notify posts with the exact {category,title,body,route} payload and maps {posted:true}", async () => {
    const engine = createEngine((op) => {
      expect(op).toBe("notify")
      return { ok: true, result: { posted: true } }
    })
    engine.native.connect()
    const result = await engine.client.notify({ ...VALID })
    expect(result).toEqual({ posted: true })
    expect(engine.requests).toHaveLength(1)
    expect(Object.keys(engine.requests[0]!.params).sort()).toEqual(["body", "category", "route", "title"])
    expect(engine.requests[0]!.params).toEqual({ category: "agent", title: "Response ready", body: "session title", route: VALID.route })
  })

  test("the questions category is a deliverable kind (issue #195): posts through the bridge like agent", async () => {
    const engine = createEngine((op) => {
      expect(op).toBe("notify")
      return { ok: true, result: { posted: true } }
    })
    engine.native.connect()
    const result = await engine.client.notify({ ...VALID, category: "questions" })
    expect(result).toEqual({ posted: true })
    expect(engine.requests).toHaveLength(1)
    expect(engine.requests[0]!.params).toEqual({
      category: "questions",
      title: "Response ready",
      body: "session title",
      route: VALID.route,
    })
  })

  test("native error responses map onto the four-code taxonomy (unknown code degrades to io)", async () => {
    for (const code of ["permission", "foreground", "unavailable", "io", "something-else"]) {
      const engine = createEngine(() => ({ ok: false, code }))
      engine.native.connect()
      const expected = (["permission", "foreground", "unavailable", "io"] as string[]).includes(code) ? code : "io"
      expect(await engine.client.notify({ ...VALID })).toEqual({ posted: false, code: expected })
    }
  })

  test("requestPermission carries an empty payload and maps {granted:true/false}", async () => {
    const granted = createEngine(() => ({ ok: true, result: { granted: true } }))
    granted.native.connect()
    expect(await granted.client.requestPermission()).toEqual({ granted: true })
    expect(granted.requests).toHaveLength(1)
    expect(granted.requests[0]!.op).toBe("requestPermission")
    expect(granted.requests[0]!.params).toEqual({})

    const denied = createEngine(() => ({ ok: true, result: { granted: false } }))
    denied.native.connect()
    expect(await denied.client.requestPermission()).toEqual({ granted: false })

    const foreground = createEngine(() => ({ ok: false, code: "foreground" }))
    foreground.native.connect()
    expect(await foreground.client.requestPermission()).toEqual({ granted: false, code: "foreground" })
  })

  test("a hung native port dies into an explicit 'unavailable' (never a silent hang)", async () => {
    let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const transport = createWebMessageNotificationsTransport({
      subscribe(handler) {
        subscriber = handler
        return () => {
          subscriber = undefined
        }
      },
      timeoutMs: 20,
    })
    const client = createNotificationsClient(transport)
    subscriber?.call(undefined, {
      data: NOTIFICATIONS_HANDSHAKE,
      ports: [{ postMessage() {}, onmessage: null }],
    })
    const result = await client.notify({ ...VALID })
    expect(result).toEqual({ posted: false, code: "unavailable" })
    expect(transport.status()).toBe("unavailable")
  })

  test("handshake isolation: a sibling handshake string is never captured by this transport", async () => {
    let sub: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const transport = createWebMessageNotificationsTransport({
      subscribe(handler) {
        sub = handler
        return () => {
          sub = undefined
        }
      },
    })
    const client = createNotificationsClient(transport)
    // Feed the FILES bridge's handshake to the notifications transport: strict data
    // equality means the port is never captured.
    sub?.call(undefined, { data: "opencode-mobile-files-handshake", ports: [{ postMessage() {}, onmessage: null }] })
    expect(await client.notify({ ...VALID })).toEqual({ posted: false, code: "unavailable" })
    expect(transport.status()).toBe("unavailable")
  })
})
