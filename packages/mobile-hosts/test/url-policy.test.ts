import { describe, expect, test } from "bun:test"
import { DIRECT_ERROR_CODES, SecureFetchError, isDirectErrorCode } from "../src/transport/connection-errors"
import { assertNoUrlCredentials, hasUrlCredentials, validateRedirectTarget } from "../src/transport/url-policy"

// URL policy + error taxonomy (issue #5, decision 0002 D1/D-URL). All URLs are synthetic
// (.invalid / loopback); nothing here contacts the network.

describe("assertNoUrlCredentials / hasUrlCredentials", () => {
  test("userinfo URL is refused", () => {
    expect(hasUrlCredentials("https://user:pass@server.example.invalid:4096/")).toBe(true)
    expect(hasUrlCredentials("https://:pass@server.example.invalid/")).toBe(true)
    expect(hasUrlCredentials("https://user@server.example.invalid/")).toBe(true)
    expect(() => assertNoUrlCredentials("https://user:pass@server.example.invalid:4096/api/info")).toThrow(
      SecureFetchError,
    )
    try {
      assertNoUrlCredentials("https://user:pass@server.example.invalid/")
      throw new Error("unreachable")
    } catch (error) {
      expect(error).toBeInstanceOf(SecureFetchError)
      expect((error as SecureFetchError).code).toBe("credential-url")
    }
  })

  test("encoded userinfo in the URL is still detected by the URL parser", () => {
    // The WHATWG parser decodes percent-encoded userinfo, so this is caught too.
    expect(hasUrlCredentials("https://user%3Atoken@server.example.invalid/")).toBe(true)
  })

  test("credentials in query/hash/path are NOT userinfo (rejected elsewhere, not here)", () => {
    expect(hasUrlCredentials("https://server.example.invalid/?password=x")).toBe(false)
    expect(hasUrlCredentials("https://server.example.invalid/#password=x")).toBe(false)
    expect(hasUrlCredentials("https://server.example.invalid/password/x")).toBe(false)
  })

  test("clean URLs pass the assertion", () => {
    expect(hasUrlCredentials("https://server.example.invalid:4096/api/info")).toBe(false)
    expect(hasUrlCredentials("http://127.0.0.1:4096/")).toBe(false)
    expect(() => assertNoUrlCredentials("http://127.0.0.1:4096/api/info")).not.toThrow()
  })

  test("unparseable input does not throw (browser refuses it anyway)", () => {
    expect(() => assertNoUrlCredentials("not a url at all")).not.toThrow()
    expect(hasUrlCredentials("::")).toBe(false)
  })
})

describe("validateRedirectTarget", () => {
  test("same-origin response is allowed (no redirect and same-origin redirect alike)", () => {
    expect(validateRedirectTarget("http://127.0.0.1:4096/api/info", "http://127.0.0.1:4096/api/info").allowed).toBe(
      true,
    )
    expect(
      validateRedirectTarget("https://server.example.invalid/a", "https://server.example.invalid/b").allowed,
    ).toBe(true)
    // Same host on the loopback alias family: origins must match exactly, so a redirect
    // from 127.0.0.1 to localhost is a DIFFERENT origin and is refused below.
  })

  test("cross-host redirect is refused", () => {
    const verdict = validateRedirectTarget(
      "https://server.example.invalid/api/info",
      "https://evil.example.invalid/api/info",
    )
    expect(verdict).toEqual({ allowed: false, reason: "cross-host" })
  })

  test("port change is a different origin and is refused", () => {
    const verdict = validateRedirectTarget(
      "https://server.example.invalid:4096/x",
      "https://server.example.invalid:8080/x",
    )
    expect(verdict).toEqual({ allowed: false, reason: "cross-host" })
  })

  test("loopback alias redirect (127.0.0.1 -> localhost) is cross-host and refused", () => {
    const verdict = validateRedirectTarget("http://127.0.0.1:4096/x", "http://localhost:4096/x")
    expect(verdict).toEqual({ allowed: false, reason: "cross-host" })
  })

  test("https -> http downgrade is refused even within the same host", () => {
    const verdict = validateRedirectTarget("https://server.example.invalid/x", "http://server.example.invalid/x")
    expect(verdict).toEqual({ allowed: false, reason: "downgrade" })
  })

  test("http -> https upgrade is ALSO refused: origin equality is strict (D1 rule 1)", () => {
    // Decision 0002 D1 refuses ANY origin change, including an upgrade: the redirect chain
    // left the requested origin, so the response is not the one the user pointed at.
    // Cleartext is unsupported anyway (D3), so the request would rarely get this far.
    const verdict = validateRedirectTarget("http://server.example.invalid/x", "https://server.example.invalid/x")
    expect(verdict).toEqual({ allowed: false, reason: "cross-host" })
  })

  test("empty or unparseable response URL means a synthetic response: allowed", () => {
    expect(validateRedirectTarget("http://127.0.0.1:4096/api/info", "").allowed).toBe(true)
  })

  test("fail-closed on an unparseable response URL that is non-empty", () => {
    const verdict = validateRedirectTarget("http://127.0.0.1:4096/api/info", "ht tp://broken")
    expect(verdict).toEqual({ allowed: false, reason: "cross-host" })
  })
})

describe("error taxonomy invariants", () => {
  test("DIRECT_ERROR_CODES is total and isDirectErrorCode agrees", () => {
    expect(DIRECT_ERROR_CODES.length).toBe(12)
    for (const code of DIRECT_ERROR_CODES) expect(isDirectErrorCode(code)).toBe(true)
    expect(isDirectErrorCode("ok")).toBe(true)
    expect(isDirectErrorCode("unavailable")).toBe(false)
    expect(isDirectErrorCode("")).toBe(false)
    expect(isDirectErrorCode(42)).toBe(false)
  })

  test("SecureFetchError keeps the message discipline (defense in depth, erratum N1)", () => {
    // Precise retry semantics: the vendored client's execute() wraps EVERY fetch exception
    // (including this one) into ClientError("Transport", {cause}) — client.ts:350 — and the
    // health check's retryable() returns true for ClientError("Transport") BEFORE its
    // message regex, so classified failures ARE retried on the health-check face (2 extra
    // fail-closed attempts; harmless). The discipline locked here is for callers that
    // consume SecureFetchError directly (the M-012 upload face rejects with no retry loop;
    // future direct consumers get a fast, unambiguous failure): the name stays distinct
    // from TypeError and messages stay free of the health-retry words.
    const retryableMessage = /network|fetch|econnreset|econnrefused|enotfound|timedout/i
    for (const code of ["redirect-cross-host", "redirect-downgrade", "credential-url"] as const) {
      const error = new SecureFetchError(code)
      expect(error.name).toBe("SecureFetchError")
      expect(error.name).not.toBe("TypeError")
      expect(retryableMessage.test(error.message)).toBe(false)
      expect(error.code).toBe(code)
    }
    expect(new SecureFetchError("redirect-cross-host").message).toContain("different origin")
    expect(new SecureFetchError("redirect-downgrade").message).toContain("downgraded")
    expect(new SecureFetchError("credential-url").message).toContain("userinfo")
  })

  test("SecureFetchError is an Error and preserves custom messages", () => {
    const error = new SecureFetchError("redirect-cross-host", "custom message")
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("custom message")
  })
})
