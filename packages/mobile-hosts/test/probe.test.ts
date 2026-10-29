import { describe, expect, test } from "bun:test"
import { DIRECT_ERROR_CODES, isDirectErrorCode, type DirectErrorCode } from "../src/transport/connection-errors"
import {
  PROBE_BRIDGE,
  PROBE_HANDSHAKE,
  StubProbePort,
  createProbeClient,
  createWebMessageProbeTransport,
  directErrorCodeMessageKey,
  type ProbeBridgeResponse,
  type ProbeBridgeTransport,
  type ProbePort,
  type ProbeRequest,
} from "../src/probe"
import { createMobileHosts } from "../src/runtime"
import { createTranslator, messages } from "../src/i18n"
import { VAULT_HANDSHAKE } from "../src/vault/transport"

// Probe port + bridge transport (issue #5, decision 0002 D2/D4). The probe is a
// CLASSIFIER, never the authority: every failure path degrades to { status: "unavailable" }
// and the caller falls back to the upstream generic message. All URLs/credentials in
// tests are synthetic; nothing contacts a network.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("StubProbePort (fail-closed default)", () => {
  test("always answers unavailable, for any request shape", async () => {
    expect(await StubProbePort.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })
    expect(await StubProbePort.probe({ url: "https://server.example.invalid", password: "synthetic" })).toEqual({
      status: "unavailable",
    })
  })
})

describe("classification -> i18n key mapping (first-party key set, F5)", () => {
  test("every DirectErrorCode maps to a key present in BOTH locales with non-empty copy", () => {
    for (const code of DIRECT_ERROR_CODES) {
      const key = directErrorCodeMessageKey(code)
      expect(key).toBe(`direct.error.${code}`)
      for (const locale of ["en", "zh"] as const) {
        const table = messages[locale] as Record<string, string>
        expect(typeof table[key]).toBe("string")
        expect(table[key]!.length).toBeGreaterThan(8) // one actionable line, not a stub
      }
    }
  })

  test("the translator resolves every classification key without falling back", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = createTranslator(locale)
      for (const code of DIRECT_ERROR_CODES) {
        expect(t(directErrorCodeMessageKey(code))).not.toBe(directErrorCodeMessageKey(code))
      }
    }
  })
})

// ---------------------------------------------------------------------------
// In-process probe bridge engine (software mirror of the native side, same shape as the
// vault engine; lets the client be exercised over the exact message protocol).
// ---------------------------------------------------------------------------
type EngineVerdict = DirectErrorCode | "error" | "malformed"
function createInProcessProbeEngine(classify: (url: string, password?: string) => EngineVerdict) {
  const sent: string[] = []
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  let acked = false

  const transport = createWebMessageProbeTransport({
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
        if (typeof id !== "string" || op !== "probe") return
        const verdict = classify(String(params["url"]), typeof params["password"] === "string" ? params["password"] : undefined)
        if (verdict === "malformed") {
          // A response whose code is not a DirectErrorCode at all (bridge contract breach).
          push({ id, ok: true, result: { code: "TOTALLY-UNKNOWN-CODE" } })
          return
        }
        const response: ProbeBridgeResponse =
          verdict === "error"
            ? { id, ok: false, code: "io", message: "" }
            : { id, ok: true, result: { code: verdict } }
        push(response)
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
    client: createProbeClient(transport),
    native: {
      connect: () => subscriber?.call(undefined, { data: PROBE_BRIDGE.handshake, ports: [nativePort] }),
      deliver: (event: { data: unknown; ports?: unknown }) => subscriber?.call(undefined, event),
      sent: () => [...sent],
      acked: () => acked,
    },
  }
}

describe("probe bridge transport + client", () => {
  test("before handshake + ack the client degrades to unavailable without sending anything", async () => {
    const engine = createInProcessProbeEngine(() => "ok")
    expect(engine.transport.status()).toBe("unavailable")
    expect(await engine.client.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })
    expect(engine.native.sent().length).toBe(0) // zero capability before ack
  })

  test("handshake capture + ack flips availability; classification round-trips", async () => {
    const engine = createInProcessProbeEngine(() => "cert-untrusted")
    engine.native.connect()
    await drain()
    expect(engine.native.acked()).toBe(true)
    expect(engine.transport.status()).toBe("available")
    expect(await engine.client.probe({ url: "https://server.example.invalid", password: "synthetic-pw" })).toEqual({
      status: "available",
      code: "cert-untrusted",
    })
    // The password crossed the bridge exactly as a probe param (never logged, never
    // stored — the engine records the raw message, which is what the native side parses).
    const sent = engine.native.sent().map((raw) => JSON.parse(raw) as Record<string, unknown>)
    expect(sent.some((m) => m["op"] === "probe" && (m["params"] as Record<string, unknown>)["password"] === "synthetic-pw")).toBe(true)
  })

  test("vault handshake is NOT captured by the probe transport (protocol isolation)", async () => {
    const engine = createInProcessProbeEngine(() => "ok")
    engine.native.deliver({ data: VAULT_HANDSHAKE, ports: [nativePortLike()] })
    await drain()
    expect(engine.transport.status()).toBe("unavailable")
    expect(engine.native.acked()).toBe(false)
  })

  test("malformed handshakes are ignored (shape validation: data equality + exactly one port)", async () => {
    const engine = createInProcessProbeEngine(() => "ok")
    engine.native.deliver({ data: PROBE_HANDSHAKE, ports: [] })
    engine.native.deliver({ data: PROBE_HANDSHAKE, ports: [nativePortLike(), nativePortLike()] })
    engine.native.deliver({ data: 42, ports: [nativePortLike()] })
    engine.native.deliver({ data: PROBE_HANDSHAKE })
    await drain()
    expect(engine.transport.status()).toBe("unavailable")
    // A valid capture still wins afterwards (earlier garbage never consumed the round).
    engine.native.connect()
    await drain()
    expect(engine.transport.status()).toBe("available")
  })

  test("error responses and malformed codes degrade to unavailable, never fabricate a classification", async () => {
    const erroring = createInProcessProbeEngine(() => "error")
    erroring.native.connect()
    await drain()
    expect(await erroring.client.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })

    const malformed = createInProcessProbeEngine(() => "malformed")
    malformed.native.connect()
    await drain()
    expect(await malformed.client.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })
  })

  test("userinfo URLs never cross the bridge (credentials stay out of probe requests)", async () => {
    const engine = createInProcessProbeEngine(() => "ok")
    engine.native.connect()
    await drain()
    expect(
      await engine.client.probe({ url: "https://user:pass@server.example.invalid", password: "synthetic-pw" }),
    ).toEqual({ status: "unavailable" })
    const sent = engine.native.sent().map((raw) => JSON.parse(raw) as Record<string, unknown>)
    expect(sent.some((m) => m["op"] === "probe")).toBe(false) // request never crossed
  })

  test("non-http(s) schemes are refused client-side without crossing the bridge", async () => {
    const engine = createInProcessProbeEngine(() => "ok")
    engine.native.connect()
    await drain()
    expect(await engine.client.probe({ url: "file:///etc/passwd" })).toEqual({ status: "unavailable" })
    expect(await engine.client.probe({ url: "not a url" })).toEqual({ status: "unavailable" })
    expect(engine.native.sent().some((raw) => raw.includes("probe"))).toBe(false)
  })

  test("a hung bridge times out into an explicit unavailable state", async () => {
    let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
    const silentPort = {
      postMessage(raw: string) {
        // ack arrives, but probe responses never do
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (parsed["op"] === "ack") acked = true
      },
      onmessage: null as ((event: { data: unknown }) => void) | null,
    }
    let acked = false
    const transport = createWebMessageProbeTransport({
      timeoutMs: 30,
      subscribe(handler) {
        subscriber = handler
        return () => {
          subscriber = undefined
        }
      },
    })
    subscriber?.call(undefined, { data: PROBE_BRIDGE.handshake, ports: [silentPort] })
    await drain()
    expect(acked).toBe(true)
    const client = createProbeClient(transport)
    expect(await client.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })
  })

  test("dispose stops the transport and late responses are ignored", async () => {
    const engine = createInProcessProbeEngine(() => "timeout")
    engine.native.connect()
    await drain()
    engine.transport.dispose()
    expect(engine.transport.status()).toBe("unavailable")
    expect(await engine.client.probe({ url: "https://server.example.invalid" })).toEqual({ status: "unavailable" })
  })
})

function nativePortLike() {
  return {
    postMessage: () => {},
    onmessage: null as ((event: { data: unknown }) => void) | null,
  }
}

describe("runtime probe wiring", () => {
  test("default runtime probe is the fail-closed stub", () => {
    const hosts = createMobileHosts()
    expect(hosts.probe).toBe(StubProbePort)
  })

  test("an injected probe port is exposed unchanged", async () => {
    const calls: ProbeRequest[] = []
    const probe: ProbePort = {
      probe: async (request) => {
        calls.push(request)
        return { status: "available", code: "refused" }
      },
    }
    const hosts = createMobileHosts({ probe })
    expect(hosts.probe).toBe(probe)
    expect(await hosts.probe.probe({ url: "https://server.example.invalid" })).toEqual({
      status: "available",
      code: "refused",
    })
    expect(calls.length).toBe(1)
  })
})

describe("bridge constants", () => {
  test("handshake is distinct from the vault handshake and the marker anchors the dist audit", () => {
    expect(PROBE_HANDSHAKE).toBe("opencode-mobile-probe-handshake")
    expect(PROBE_HANDSHAKE).not.toBe(VAULT_HANDSHAKE)
    expect(PROBE_BRIDGE.marker).toContain("mobile(probe-v1)")
    expect(PROBE_BRIDGE.handshake).toBe(PROBE_HANDSHAKE)
  })

  test("isDirectErrorCode guards the response boundary", () => {
    expect(isDirectErrorCode("refused")).toBe(true)
    expect(isDirectErrorCode("SOMETHING_ELSE")).toBe(false)
  })
})

// ProbeBridgeTransport type usage guard (compile-time shape check).
const _transportShape: ProbeBridgeTransport | undefined = undefined
void _transportShape
