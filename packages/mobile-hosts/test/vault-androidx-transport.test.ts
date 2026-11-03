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

  // mobile(M-062, issue #128): cold-start restore seam — the client's bounded readiness
  // wait must cross the async native ready roundtrip instead of racing get() into
  // "unavailable" one microtask early.
  test("delayed native ready reply: ready() crosses the roundtrip and get() pre-ready still fails closed", async () => {
    let listener!: VaultNativeListener
    let deliverReady: (() => void) | undefined
    listener = {
      onmessage: null,
      postMessage(raw) {
        const request = JSON.parse(raw)
        if (request.op !== "ready") return
        deliverReady = () => listener.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, result: "vault-v2" }) })
      },
    }
    const transport = createAndroidXVaultTransport(listener)
    const vault = createVaultClient(transport)
    expect(vault.status()).toBe("unavailable")
    // get() before readiness keeps its explicit-unavailability semantics: immediate throw.
    await expect(vault.get("mobile-credential:pre-ready")).rejects.toMatchObject({ code: "unavailable" })
    const whenReady = vault.ready!()
    // The wait is bounded by the deadline, not by the subscription's synchronous false
    // replay — still pending after a macrotask while the native reply has not landed.
    const early = await Promise.race([whenReady.then(() => "resolved"), new Promise((resolve) => setTimeout(() => resolve("pending"), 10))])
    expect(early).toBe("pending")
    deliverReady!()
    await expect(whenReady).resolves.toBe("available")
    expect(vault.status()).toBe("available")
    // Once available, a fresh ready() takes the fast path (no subscription, no delay).
    expect(await vault.ready!()).toBe("available")
    transport.dispose()
  })

  test("never-ready transport: ready(timeout) resolves unavailable at the deadline and posts exactly one ready probe", async () => {
    const posted: Array<Record<string, any>> = []
    const listener: VaultNativeListener = {
      onmessage: null,
      postMessage(raw) {
        posted.push(JSON.parse(raw))
      },
    }
    const transport = createAndroidXVaultTransport(listener)
    const vault = createVaultClient(transport)
    const started = Date.now()
    await expect(vault.ready!(30)).resolves.toBe("unavailable")
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    // Exactly the construction-time readiness probe; the wait itself posts nothing.
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ op: "ready" })
    // A second wait after dispose also resolves (never rejects) — failAll must not break it.
    transport.dispose()
    await expect(vault.ready!(5)).resolves.toBe("unavailable")
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
