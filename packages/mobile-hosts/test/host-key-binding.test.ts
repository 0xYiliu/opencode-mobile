import { describe, expect, test } from "bun:test"
import { bindHostKeyPrompt } from "../src/ui/host-key-binding"
import type { MobileHosts } from "../src/runtime"

describe("host-key prompt identity binding", () => {
  test("a prompt snapshot can only confirm the host whose fingerprint it shows", () => {
    const confirmed: Array<{ id: string; expected: unknown }> = []
    const rejected: string[] = []
    const fingerprints: Record<string, string> = {
      "host-a": `SHA256:${"fingerprint-a".repeat(8)}`,
      "host-b": `SHA256:${"fingerprint-b".repeat(8)}`,
    }
    const runtime = {
      registry: {
        get: (id: string) => ({
          id,
          name: id === "host-a" ? "Production build host" : "Staging build host",
          target: id === "host-a" ? "release@build-a.example.invalid:2222" : "deploy@build-b.example.invalid:2200",
          servicePort: id === "host-a" ? 4096 : 8181,
        }),
      },
      fingerprintOf: (id: string) => fingerprints[id],
      confirmHostKey: (id: string, expected: unknown) => confirmed.push({ id, expected }),
      rejectHostKey: (id: string) => rejected.push(id),
    } as unknown as MobileHosts
    const promptA = bindHostKeyPrompt(runtime, "host-a")
    const promptB = bindHostKeyPrompt(runtime, "host-b")

    expect(promptA).toMatchObject({
      hostId: "host-a",
      hostName: "Production build host",
      target: "release@build-a.example.invalid:2222",
      sshPort: 2222,
      servicePort: 4096,
      fingerprint: fingerprints["host-a"],
    })
    expect(promptB).toMatchObject({
      hostId: "host-b",
      hostName: "Staging build host",
      target: "deploy@build-b.example.invalid:2200",
      sshPort: 2200,
      servicePort: 8181,
      fingerprint: fingerprints["host-b"],
    })
    promptA.confirm()
    promptB.reject()
    expect(confirmed).toEqual([{
      id: "host-a",
      expected: {
        target: "release@build-a.example.invalid:2222",
        servicePort: 4096,
        fingerprint: fingerprints["host-a"],
      },
    }])
    expect(rejected).toEqual(["host-b"])
  })
})
