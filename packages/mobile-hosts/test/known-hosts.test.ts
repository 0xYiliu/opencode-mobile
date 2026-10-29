import { describe, expect, test } from "bun:test"
import {
  matchesKnownHostsEntry,
  parseKnownHosts,
  parseKnownHostsLine,
  parseSshTargetHost,
  serializeKnownHosts,
  serializeKnownHostsEntry,
} from "../src/ssh/known-hosts"

// OpenSSH known_hosts line contract vectors. The serialized forms are accepted verbatim by
// `ssh-keygen -lf` (verified while building these vectors); the hashed/marker/pattern
// classifications mirror `sshd(8)`/`ssh(1)` documented line syntax.

const ED25519_BLOB = "AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5"
const ED25519_FINGERPRINT = "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk"

describe("known_hosts parsing", () => {
  test("plain host lines parse into entries", () => {
    const parsed = parseKnownHostsLine(`example.invalid ssh-ed25519 ${ED25519_BLOB}`, 1)
    expect(parsed).toEqual({
      hostname: "example.invalid",
      port: undefined,
      keytype: "ssh-ed25519",
      blob: ED25519_BLOB,
      foreign: false,
    })
  })

  test("[host]:port lines parse the bracketed port form", () => {
    const parsed = parseKnownHostsLine(`[example.invalid]:2222 ssh-ed25519 ${ED25519_BLOB}`, 1)
    expect(parsed && "hostname" in parsed).toBe(true)
    if (parsed && "hostname" in parsed) {
      expect(parsed.hostname).toBe("example.invalid")
      expect(parsed.port).toBe(2222)
    }
  })

  test("user@host targets never leak into the hostname (host part is host only)", () => {
    // The store never records user@host — the verifier extracts host/port from the target.
    expect(parseSshTargetHost("deploy@example.invalid:2222")).toEqual({ host: "example.invalid", port: 2222 })
    expect(parseSshTargetHost("example.invalid")).toEqual({ host: "example.invalid", port: 22 })
    expect(parseSshTargetHost("example.invalid:22")).toEqual({ host: "example.invalid", port: 22 })
  })

  test("comments and blank lines are skipped; hashed/marker/pattern/malformed lines are classified, never silently dropped", () => {
    const text = [
      "# a comment",
      "",
      `example.invalid ssh-ed25519 ${ED25519_BLOB}`,
      "|1|base64salt= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAhashed", // hashed hostname
      "@revoked example.invalid ssh-rsa AAAAB3NzaC1yc2Erevoked", // marker
      "a.invalid,b.invalid ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAApattern", // pattern list
      "only-two-fields ssh-ed25519", // malformed
      "example.invalid not-a-keytype AAAA", // malformed keytype
    ].join("\n")
    const result = parseKnownHosts(text)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.hostname).toBe("example.invalid")
    expect(result.issues.map((issue) => issue.kind)).toEqual([
      "hashed-hostname",
      "marker",
      "pattern-list",
      "malformed",
      "malformed",
    ])
  })

  test("serialization round-trips and reproduces both OpenSSH line forms", () => {
    const entry = { hostname: "example.invalid", port: undefined, keytype: "ssh-ed25519", blob: ED25519_BLOB }
    expect(serializeKnownHostsEntry(entry)).toBe(`example.invalid ssh-ed25519 ${ED25519_BLOB}`)
    expect(serializeKnownHostsEntry({ ...entry, port: 2222 })).toBe(`[example.invalid]:2222 ssh-ed25519 ${ED25519_BLOB}`)
    // Default port 22 collapses to the bare-host form (OpenSSH semantics).
    expect(serializeKnownHostsEntry({ ...entry, port: 22 })).toBe(`example.invalid ssh-ed25519 ${ED25519_BLOB}`)
    const text = serializeKnownHosts([entry, { ...entry, port: 2222 }])
    const reparsed = parseKnownHosts(text)
    expect(reparsed.issues).toHaveLength(0)
    expect(reparsed.entries).toHaveLength(2)
    expect(reparsed.entries[1]!.port).toBe(2222)
  })

  test("matcher honors default-port semantics and ignores foreign lines", () => {
    expect(matchesKnownHostsEntry({ hostname: "example.invalid", port: undefined }, "example.invalid")).toBe(true)
    expect(matchesKnownHostsEntry({ hostname: "example.invalid", port: 2222 }, "example.invalid")).toBe(false)
    expect(matchesKnownHostsEntry({ hostname: "example.invalid", port: 2222 }, "example.invalid", 2222)).toBe(true)
    expect(matchesKnownHostsEntry({ hostname: "other.invalid" }, "example.invalid")).toBe(false)
    expect(matchesKnownHostsEntry({ hostname: "example.invalid", foreign: true }, "example.invalid")).toBe(false)
  })

  test("fingerprint of a parsed entry matches the ssh-keygen vector (store interop)", async () => {
    const { computeSshFingerprint, decodeBase64KeyBlob } = await import("../src/ssh/fingerprint")
    const entry = parseKnownHostsLine(`example.invalid ssh-ed25519 ${ED25519_BLOB}`, 1)
    expect(entry && "blob" in entry).toBe(true)
    if (entry && "blob" in entry) {
      expect(await computeSshFingerprint(decodeBase64KeyBlob(entry.blob)!)).toBe(ED25519_FINGERPRINT)
    }
  })
})
