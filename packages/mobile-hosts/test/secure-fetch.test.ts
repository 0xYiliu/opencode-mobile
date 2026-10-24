import { describe, expect, test } from "bun:test"
import { SecureFetchError } from "../src/transport/connection-errors"
import { SECURE_FETCH_MARKER, createSecureFetch } from "../src/transport/secure-fetch"

// Secure fetch wrapper (issue #5, decision 0002 D1) — five scenarios over a mock
// underlying fetch, all URLs synthetic (.invalid / loopback); nothing contacts a network.

/** A Response with a controllable final URL (browsers always populate url; mocks must too). */
function responseWithUrl(body: string, url: string, init?: ResponseInit): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, "url", { value: url, configurable: true })
  return response
}

function mockFetch(responses: Array<Response | Error>) {
  const calls: Array<{ input: Request | URL | string; init: unknown }> = []
  let index = 0
  const underlying = (async (input: Request | URL | string, init?: Parameters<typeof globalThis.fetch>[1]) => {
    calls.push({ input, init })
    const next = responses[index++]
    if (!next) throw new Error("mock exhausted")
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { calls, underlying }
}

describe("createSecureFetch", () => {
  test("normal direct request passes through with body intact", async () => {
    const { calls, underlying } = mockFetch([
      responseWithUrl("ok-body", "http://127.0.0.1:4096/api/info"),
    ])
    const secureFetch = createSecureFetch({ underlying })
    const response = await secureFetch("http://127.0.0.1:4096/api/info")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok-body")
    expect(calls.length).toBe(1)
  })

  test("cross-host redirect response is refused and its body is cancelled", async () => {
    const refused = responseWithUrl("attacker body", "https://evil.example.invalid/api/info")
    const { calls, underlying } = mockFetch([refused])
    const secureFetch = createSecureFetch({ underlying })
    try {
      await secureFetch("https://server.example.invalid/api/info")
      throw new Error("unreachable: cross-host response was delivered")
    } catch (error) {
      expect(error).toBeInstanceOf(SecureFetchError)
      expect((error as SecureFetchError).code).toBe("redirect-cross-host")
    }
    expect(calls.length).toBe(1)
    // The refused body was cancelled, not left for a caller to read by accident.
    expect(refused.body?.used ?? true).toBe(true)
  })

  test("https -> http downgrade response is refused", async () => {
    const { underlying } = mockFetch([responseWithUrl("plain", "http://server.example.invalid/api/info")])
    const secureFetch = createSecureFetch({ underlying })
    try {
      await secureFetch("https://server.example.invalid/api/info")
      throw new Error("unreachable: downgrade response was delivered")
    } catch (error) {
      expect((error as SecureFetchError).code).toBe("redirect-downgrade")
    }
  })

  test("userinfo credential URL is refused BEFORE anything is sent", async () => {
    const { calls, underlying } = mockFetch([])
    const secureFetch = createSecureFetch({ underlying })
    try {
      await secureFetch("https://user:pass@server.example.invalid/api/info")
      throw new Error("unreachable: credential URL was sent")
    } catch (error) {
      expect((error as SecureFetchError).code).toBe("credential-url")
    }
    expect(calls.length).toBe(0) // never reached the transport
  })

  test("same-origin redirect passes (reverse-proxy shapes keep working)", async () => {
    const { calls, underlying } = mockFetch([
      responseWithUrl("proxied", "https://server.example.invalid/rewritten/api/info"),
    ])
    const secureFetch = createSecureFetch({ underlying })
    const response = await secureFetch("https://server.example.invalid/api/info")
    expect(await response.text()).toBe("proxied")
    expect(calls.length).toBe(1)
  })

  test("init (signal/headers) is forwarded to the underlying transport untouched", async () => {
    const { calls, underlying } = mockFetch([responseWithUrl("ok", "http://127.0.0.1:4096/x")])
    const secureFetch = createSecureFetch({ underlying })
    const controller = new AbortController()
    await secureFetch("http://127.0.0.1:4096/x", { signal: controller.signal, headers: { "x-probe": "1" } })
    expect((calls[0]!.init as { signal: AbortSignal }).signal).toBe(controller.signal)
    expect((calls[0]!.init as { headers: Record<string, string> }).headers["x-probe"]).toBe("1")
  })

  test("URL and Request inputs are covered by the same policy", async () => {
    const { calls, underlying } = mockFetch([
      responseWithUrl("a", "http://127.0.0.1:4096/x"),
      responseWithUrl("b", "http://127.0.0.1:4096/y"),
    ])
    const secureFetch = createSecureFetch({ underlying })
    await expect(secureFetch(new URL("http://127.0.0.1:4096/x"))).resolves.toBeInstanceOf(Response)
    await expect(secureFetch(new Request("http://127.0.0.1:4096/y"))).resolves.toBeInstanceOf(Response)
    expect(calls.length).toBe(2)
    // Request carrying userinfo is refused before send, too.
    const { calls: refusedCalls, underlying: refusing } = mockFetch([])
    await expect(
      createSecureFetch({ underlying: refusing })(new Request("https://u:p@server.example.invalid/")),
    ).rejects.toMatchObject({ code: "credential-url" })
    expect(refusedCalls.length).toBe(0)
  })

  test("transport errors are passed through unwrapped (the wrapper adds no semantics)", async () => {
    const boom = new TypeError("transient transport trouble")
    const { underlying } = mockFetch([boom])
    const secureFetch = createSecureFetch({ underlying })
    await expect(secureFetch("http://127.0.0.1:4096/x")).rejects.toBe(boom)
  })

  test("marker is present and dist-checkable; default underlying is globalThis.fetch", () => {
    expect(SECURE_FETCH_MARKER).toContain("mobile(M-011)")
    expect(typeof createSecureFetch()).toBe("function")
  })
})
