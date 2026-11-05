import { expect, test } from "bun:test"
import { authFromToken, authTokenFromCredentials, createApiForServer, fileStreamUrl } from "./api"

test.each([
  [btoa("opencode:secret"), { password: "secret" }],
  [btoa("legacy:secret:with:colons"), { password: "secret:with:colons" }],
  [btoa(":secret"), { password: "secret" }],
  ["not base64", undefined],
  [btoa("missing-separator"), undefined],
])("authFromToken(%p) extracts only the password", (token, expected) => {
  expect(authFromToken(token)).toEqual(expected)
})

test("authTokenFromCredentials ignores usernames in legacy saved credentials", () => {
  const credentials = { username: "legacy", password: "secret" }
  expect(authTokenFromCredentials(credentials)).toBe(btoa("opencode:secret"))
})

test("fileStreamUrl never puts a credential in a media URL", () => {
  const input = { path: "clips/final cut.mp4", directory: "/work/app" }
  expect(fileStreamUrl({ url: "http://127.0.0.1:4096", password: "secret" }, input)).toBeUndefined()
  expect(fileStreamUrl({ url: "http://127.0.0.1:4096" }, input)).toBe(
    "http://127.0.0.1:4096/api/fs/read/clips/final%20cut.mp4?location%5Bdirectory%5D=%2Fwork%2Fapp",
  )
})

test("the authenticated binary media read never puts a credential in a media URL", async () => {
  const requests: Array<{ url: string; headers: Headers; signal?: AbortSignal | null }> = []
  const api = createApiForServer({ server: { url: "http://127.0.0.1:4096/prefix", password: "fixture-secret" },
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers), signal: init?.signal })
      return new Response(new Uint8Array([1, 2, 3]))
    }, { preconnect: globalThis.fetch.preconnect }),
  })
  const controller = new AbortController()
  expect(await api.experimental.media.get({ hash: "a".repeat(64) }, { signal: controller.signal })).toEqual(new Uint8Array([1, 2, 3]))
  expect(requests).toHaveLength(1)
  expect(requests[0]!.url).toBe(`http://127.0.0.1:4096/prefix/api/experimental/media/${"a".repeat(64)}`)
  expect(requests[0]!.url).not.toContain("fixture-secret")
  expect(requests[0]!.headers.get("authorization")).toBe(`Basic ${btoa("opencode:fixture-secret")}`)
  expect(requests[0]!.signal).toBe(controller.signal)
})

test("only message and inbox reads ask for media refs, so other cross-origin requests stay unpreflighted", async () => {
  const requests: Array<{ path: string; headers: Headers }> = []

  const api = createApiForServer({
    server: { url: "https://server.example:4096", password: "secret" },
    // SAFETY: the API client only calls fetch with a URL and init, which this stub accepts.
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        path: new URL(input instanceof Request ? input.url : input).pathname,
        headers: new Headers(init?.headers),
      })

      const pathname = requests.at(-1)!.path
      if (pathname.endsWith("/message/msg_1")) return Response.json({ data: { type: "user", id: "msg_1", text: "", time: { created: 0 } } })
      if (pathname.endsWith("/inbox")) return Response.json({ data: [] })
      return Response.json({ data: [], cursor: {} })
    }) as typeof fetch,
  })

  await api.message.list({ sessionID: "ses_1" })
  await api.message.list({ sessionID: "ses_1" }, { mediaRefs: false, headers: { "X-Trace": "1" } })
  await api.session.message.get({ sessionID: "ses_1", messageID: "msg_1" })
  await api.session.inbox.list({ sessionID: "ses_1" }, { headers: { "X-Trace": "1" } })
  await api.session.list()

  expect(
    requests.map((request) => [
      request.path,
      request.headers.get("x-opencode-capabilities"),
      request.headers.get("authorization"),
    ]),
  ).toEqual([
    ["/api/session/ses_1/message", "experimental-media-uri", `Basic ${btoa("opencode:secret")}`],
    ["/api/session/ses_1/message", null, `Basic ${btoa("opencode:secret")}`],
    ["/api/session/ses_1/message/msg_1", "experimental-media-uri", `Basic ${btoa("opencode:secret")}`],
    ["/api/session/ses_1/inbox", "experimental-media-uri", `Basic ${btoa("opencode:secret")}`],
    ["/api/session", null, `Basic ${btoa("opencode:secret")}`],
  ])
  expect(requests[1].headers.get("x-trace")).toBe("1")
  expect(requests[3].headers.get("x-trace")).toBe("1")
})

test.each([401, 403, 404, "network"] as const)("binary media %p fails once on the same source without compatibility fallback", async (failure) => {
  let calls = 0
  const api = createApiForServer({ server: { url: "https://source-a.example", password: "fixture-password" },
    fetch: Object.assign(async (input: RequestInfo | URL) => {
      calls++
      expect(new URL(String(input)).origin).toBe("https://source-a.example")
      if (failure === "network") throw new TypeError("Synthetic offline")
      return Response.json({ _tag: failure === 404 ? "FileNotFoundError" : "UnauthorizedError" }, { status: failure })
    }, { preconnect: globalThis.fetch.preconnect }),
  })
  await expect(api.experimental.media.get({ hash: "a".repeat(64) })).rejects.toBeDefined()
  expect(calls).toBe(1)
})

test("three-read compatibility retries once without capability, retaining authentication and signal", async () => {
  const requests: Array<Headers> = []
  const controller = new AbortController()
  const api = createApiForServer({ server: { url: "https://source-a.example", password: "fixture-password" },
    fetch: Object.assign(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      requests.push(headers)
      expect(init?.signal).toBe(controller.signal)
      if (headers.has("X-OpenCode-Capabilities")) return new Response("Synthetic old server", { status: 400 })
      return Response.json({ data: [{ type: "user", id: "msg_1", text: "inline", time: { created: 0 },
        files: [{ mime: "text/plain", data: "YQ==", source: { type: "inline" } }] }] })
    }, { preconnect: globalThis.fetch.preconnect }),
  })
  const page = await api.message.list({ sessionID: "ses_1" }, { signal: controller.signal, headers: { "X-Trace": "fixture" } })
  expect(page.data[0]).toMatchObject({ type: "user", files: [{ data: "YQ==" }] })
  expect(requests.map((headers) => headers.get("x-opencode-capabilities"))).toEqual(["experimental-media-uri", null])
  expect(requests.every((headers) => headers.get("authorization") === `Basic ${btoa("opencode:fixture-password")}` && headers.get("x-trace") === "fixture")).toBe(true)
})

test("canonical media read preserves the uri variant, but export false rejects incomplete bytes and malformed references", async () => {
  let uri = `media:${"a".repeat(64)}`
  let calls = 0
  const headers: Array<Headers> = []
  const api = createApiForServer({ server: { url: "https://source-a.example" }, fetch: Object.assign(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls++
    headers.push(new Headers(init?.headers))
    return Response.json({ data: [{ type: "user", id: "msg_1", text: "media", time: { created: 0 },
      files: [{ mime: "image/png", uri, source: { type: "inline" } }] }] })
  }, { preconnect: globalThis.fetch.preconnect }) })
  expect((await api.message.list({ sessionID: "ses_1" })).data[0]).toMatchObject({ type: "user", files: [{ uri }] })
  await expect(api.message.list({ sessionID: "ses_1" }, { mediaRefs: false })).rejects.toMatchObject({ reason: "MalformedResponse" })
  expect(headers[1]!.has("X-OpenCode-Capabilities")).toBe(false)
  uri = "media:invalid"
  await expect(api.message.list({ sessionID: "ses_1" })).rejects.toBeDefined()
  expect(calls).toBe(3)
})
