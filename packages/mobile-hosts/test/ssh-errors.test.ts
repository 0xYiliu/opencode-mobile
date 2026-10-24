import { describe, expect, test } from "bun:test"
import { SSH_ERROR_CODES, SshTransportError, isSshErrorCode, sshErrorCodeMessageKey } from "../src/transport/ssh-errors"
import { messages } from "../src/i18n"

describe("ssh error taxonomy invariants", () => {
  test("SSH_ERROR_CODES is total (14 codes) and isSshErrorCode agrees", () => {
    expect(SSH_ERROR_CODES).toHaveLength(14)
    for (const code of SSH_ERROR_CODES) expect(isSshErrorCode(code)).toBe(true)
    expect(isSshErrorCode("ok")).toBe(false)
    expect(isSshErrorCode("host-key-skipped")).toBe(false) // no skip code can ever exist
    expect(isSshErrorCode(42)).toBe(false)
    expect(isSshErrorCode(undefined)).toBe(false)
  })

  test("every code carries an actionable EN+ZH copy line (ssh.error.<code>)", () => {
    for (const code of SSH_ERROR_CODES) {
      for (const locale of ["en", "zh"] as const) {
        const table = messages[locale] as Record<string, string>
        const key = `ssh.error.${code}`
        expect(typeof table[key]).toBe("string")
        expect(table[key]!.length).toBeGreaterThan(8)
      }
      expect(sshErrorCodeMessageKey(code)).toBe(`ssh.error.${code}`)
    }
  })

  test("SshTransportError keeps the code out-of-band and defaults honest messages", () => {
    const error = new SshTransportError("target-refused")
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe("target-refused")
    expect(error.message).toContain("remote refused")
    expect(error.name).toBe("SshTransportError")
    const custom = new SshTransportError("io", "socket died mid-handshake")
    expect(custom.code).toBe("io")
    expect(custom.message).toBe("socket died mid-handshake")
  })

  test("no code implies a bypass of host-key verification", () => {
    // The red line is structural: the taxonomy has no "skip"/"accept-once" vocabulary.
    for (const code of SSH_ERROR_CODES) {
      expect(code.includes("skip")).toBe(false)
      expect(code.includes("accept")).toBe(false)
    }
  })
})
