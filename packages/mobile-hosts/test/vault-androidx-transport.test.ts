import { describe, expect, test } from "bun:test"
import { createAndroidXVaultTransport, type VaultNativeListener } from "../src/vault/transport"
import { VaultError } from "../src/vault/types"
import { createVaultClient } from "../src/vault/vault"

function fixture() {
  const listener: VaultNativeListener = {
    onmessage: null,
    postMessage(raw) {
      const request = JSON.parse(raw)
      queueMicrotask(() => listener.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, result: request.op === "ready" ? "vault-v2" : "saved" }) }))
    },
  }
  return listener
}

describe("AndroidX vault protocol v2", () => {
  test("requires readiness roundtrip and supports requests", async () => {
    const listener = fixture()
    const transport = createAndroidXVaultTransport(listener)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(transport.status()).toBe("available")
    expect((await transport.request("put", { value: "synthetic" })).ok).toBe(true)
    transport.dispose()
  })

  test("replays readiness when the native reply beats subscriber registration", () => {
    let listener!: VaultNativeListener
    listener = {
      onmessage: null,
      postMessage(raw) {
        const request = JSON.parse(raw)
        if (request.op === "ready") listener.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, result: "vault-v2" }) })
      },
    }
    const transport = createAndroidXVaultTransport(listener)
    expect(transport.status()).toBe("available")
    const states: boolean[] = []
    transport.onReady((value) => states.push(value))
    expect(states).toEqual([true])
    transport.dispose()
  })

  test("missing native feature stays unavailable", async () => {
    const transport = createAndroidXVaultTransport(undefined)
    expect(transport.status()).toBe("unavailable")
    await expect(transport.request("list", {})).rejects.toMatchObject({ code: "unavailable" })
  })

  test("mutation timeout reports unknown and never retries", async () => {
    let calls = 0
    const listener: VaultNativeListener = { onmessage: null, postMessage() { calls++ } }
    const transport = createAndroidXVaultTransport(listener, { timeoutMs: 5, requestId: (() => { let i = 0; return () => `${++i}` })() })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(transport.request("put", { value: "synthetic" })).rejects.toMatchObject<VaultError>({ code: "unknown" })
    expect(calls).toBe(2)
    transport.dispose()
  })

  test("puts transmit a preallocated recovery candidate and expose it on timeout", async () => {
    const sent: Array<Record<string, any>> = []
    let listener!: VaultNativeListener
    listener = {
      onmessage: null,
      postMessage(raw) {
        const request = JSON.parse(raw)
        sent.push(request)
        if (request.op === "ready") listener.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, result: "vault-v2" }) })
      },
    }
    const transport = createAndroidXVaultTransport(listener, { timeoutMs: 5, requestId: (() => { let n = 0; return () => `request-${++n}` })() })
    const vault = createVaultClient(transport)
    await new Promise((resolve) => setTimeout(resolve, 0))
    let failure: unknown
    try { await vault.put({
      kind: "password",
      value: "synthetic-only",
    }) } catch (error) { failure = error }
    expect(sent).toHaveLength(2) // readiness + one mutation; no retry
    const candidateId = sent[1]!.params.candidateId as string
    expect(sent[1]).toMatchObject({ op: "put", params: { value: "synthetic-only" } })
    expect(candidateId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
    expect(failure).toMatchObject({ code: "unknown", recoveryRef: `mobile-credential:${candidateId}` })
    transport.dispose()
  })

  test("correlates reordered replies and malformed mutation replies are unknown", async () => {
    const sent: Array<{ id: string; op: string }> = []
    let id = 0
    const listener: VaultNativeListener = {
      onmessage: null,
      postMessage(raw) {
        const message = JSON.parse(raw)
        sent.push(message)
        if (message.op === "ready") queueMicrotask(() => listener.onmessage?.({ data: JSON.stringify({ id: message.id, ok: true, result: "vault-v2" }) }))
      },
    }
    const transport = createAndroidXVaultTransport(listener, { requestId: () => `r${++id}`, timeoutMs: 100 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const first = transport.request("get", { id: "a" })
    const second = transport.request("list", {})
    listener.onmessage?.({ data: JSON.stringify({ id: sent[2]!.id, ok: true, result: "second" }) })
    listener.onmessage?.({ data: JSON.stringify({ id: sent[1]!.id, ok: true, result: "first" }) })
    const firstResponse = await first
    const secondResponse = await second
    expect(firstResponse.ok && firstResponse.result).toBe("first")
    expect(secondResponse.ok && secondResponse.result).toBe("second")
    const put = transport.request("put", { value: "synthetic" })
    listener.onmessage?.({ data: JSON.stringify({ id: sent[3]!.id, malformed: true }) })
    await expect(put).rejects.toMatchObject({ code: "unknown" })
    transport.dispose()
  })
})
