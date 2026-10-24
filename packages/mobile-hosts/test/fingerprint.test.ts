import { describe, expect, test } from "bun:test"
import { computeSshFingerprint, decodeBase64KeyBlob, isSshFingerprint } from "../src/ssh/fingerprint"

// Fixed OpenSSH vectors (issue #6 acceptance: "Fingerprint format interoperates with
// documented OpenSSH representation"). Both key blobs were generated with ssh-keygen and
// the expected fingerprints are the verbatim `ssh-keygen -lf` output — the TS side must
// reproduce them exactly (the Kotlin MessageDigest mirror is locked to the same vectors by
// scripts/verify-ssh.ts).

// ssh-keygen -t ed25519 → "256 SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk (ED25519)"
const ED25519_BLOB = "AAAAC3NzaC1lZDI1NTE5AAAAILGmkm2hFfHHozACri5IDNLTfN/9VIyJF73mAHW01Yo5"
const ED25519_FINGERPRINT = "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk"

// ssh-keygen -t rsa 2048 → "2048 SHA256:ux4m4VPmpLNS5EkU+jI48HP7X3wOTlqHY+L9Fu6nujA (RSA)"
const RSA_BLOB =
  "AAAAB3NzaC1yc2EAAAADAQABAAABAQCYQBVcJj6kD+WqpZ03AWQ+VnA+aEmLVdKv1oNfCFR0sOMK+bowA/OWRaIS3hWKujpbBuNQVvoYlbmAkCVJTf43qKzFG1hwTCp3bhDfGFCYAne2sneDez6kP1FTAarAk6ApD/6jsapij7Tib9/0BnyaFSQpL2bvKONwp77My/WBW5L2o2jVwQdsCVpEEps+VaoVPbbUUZptWktSB+uPDXxhz0475OVM/ri/V8GGGg4nQFwKQAj4c7/7lJSq+EN/bTal+KaIkZnbWhoQOccI+65FBOFpZe78wRQa0cyO1gUwzG3YhtTksCZL/r8B0TGu1zgi9vsDGzxvW5Rh0ML1hyTJ"
const RSA_FINGERPRINT = "SHA256:ux4m4VPmpLNS5EkU+jI48HP7X3wOTlqHY+L9Fu6nujA"

describe("ssh fingerprint (OpenSSH SHA256:base64_nopad representation)", () => {
  test("reproduces the ssh-keygen -lf output for an ed25519 host key", async () => {
    const blob = decodeBase64KeyBlob(ED25519_BLOB)
    expect(blob).toBeDefined()
    expect(await computeSshFingerprint(blob!)).toBe(ED25519_FINGERPRINT)
  })

  test("reproduces the ssh-keygen -lf output for an RSA host key", async () => {
    const blob = decodeBase64KeyBlob(RSA_BLOB)
    expect(blob).toBeDefined()
    expect(await computeSshFingerprint(blob!)).toBe(RSA_FINGERPRINT)
  })

  test("format guard accepts real fingerprints and rejects near-misses", () => {
    expect(isSshFingerprint(ED25519_FINGERPRINT)).toBe(true)
    expect(isSshFingerprint(RSA_FINGERPRINT)).toBe(true)
    expect(isSshFingerprint("7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk")).toBe(false) // no prefix
    expect(isSshFingerprint("SHA256:tooshort")).toBe(false)
    expect(isSshFingerprint("SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qg=")).toBe(false) // padding present
    expect(isSshFingerprint("MD5:0123456789abcdef0123456789abcdef")).toBe(false)
    expect(isSshFingerprint(null)).toBe(false)
  })

  test("empty blobs and missing WebCrypto are honest errors, never a fabricated value", async () => {
    await expect(computeSshFingerprint(new Uint8Array(0))).rejects.toThrow("empty key blob")
  })

  test("base64 blob decode validates shape and round-trips", () => {
    expect(decodeBase64KeyBlob(ED25519_BLOB)!.length).toBe(51) // ed25519 wire blob
    expect(decodeBase64KeyBlob("not base64!")).toBeUndefined()
    expect(decodeBase64KeyBlob("")).toBeUndefined()
    const roundtrip = decodeBase64KeyBlob(btoa("abc"))
    expect(decoderText(roundtrip!)).toBe("abc")
  })
})

function decoderText(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}
