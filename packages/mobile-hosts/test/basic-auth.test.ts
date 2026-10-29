import { describe, expect, test } from "bun:test"
import { basicAuthToken } from "../src/transport/basic-auth"

describe("UTF-8 Basic authentication encoding", () => {
  test.each(["plain-ascii", "秘密", "passphrase-🔐", "café"]) (
    "encodes %p as UTF-8 bytes before base64",
    (password: string) => {
      const token = basicAuthToken("opencode", password)
      const decodedBytes = Uint8Array.from(atob(token), (character) => character.charCodeAt(0))
      expect(new TextDecoder().decode(decodedBytes)).toBe(`opencode:${password}`)
    },
  )
})
