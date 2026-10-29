import { expect, test } from "bun:test"
import { authFromToken, authTokenFromCredentials } from "./api"
import { createApiForServer } from "./api"
import { readLocalImage } from "./image"
import { toExtensionConnection } from "../../../../../../../packages/mobile-hosts/src/upstream-map"

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

test.each(["秘密", "🔐passphrase", "café"])("authTokenFromCredentials UTF-8 encodes non-ASCII password %p", (password) => {
  const bytes = Uint8Array.from(atob(authTokenFromCredentials({ password })), (character) => character.charCodeAt(0))
  expect(new TextDecoder().decode(bytes)).toBe(`opencode:${password}`)
})

test("a mapped SSH endpoint sends its Unicode service password on a subsequent upstream API request", async () => {
  const password = "ssh-service-秘密-🔐"
  const connection = toExtensionConnection({
    record: {
      id: "11111111-2222-4333-8444-555555555555",
      name: "synthetic SSH endpoint",
      target: "probe@example.invalid:22",
      createdAt: "2026-10-28T00:00:00.000Z",
      updatedAt: "2026-10-28T00:00:00.000Z",
    },
    state: "ready",
    endpoint: { url: "http://127.0.0.1:45679", password },
  })
  const requests: Array<{ url: URL; init?: RequestInit }> = []
  const api = createApiForServer({
    server: connection.http,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(input instanceof Request ? input.url : input), init })
      return new Response(new Uint8Array([0, 127, 255]))
    }) as typeof fetch,
  })

  const image = await readLocalImage(api, "/workspace/project", "synthetic.png", new AbortController().signal)
  expect(image?.type).toBe("image/png")
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url.pathname).toBe("/api/fs/read/synthetic.png")
  const authorization = new Headers(requests[0]?.init?.headers).get("authorization")
  expect(authorization?.startsWith("Basic ")).toBe(true)
  const decoded = Uint8Array.from(atob(authorization!.slice("Basic ".length)), (char) => char.charCodeAt(0))
  expect(new TextDecoder().decode(decoded)).toBe(`opencode:${password}`)
})
