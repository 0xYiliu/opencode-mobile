import { describe, expect, test } from "bun:test"
import { createMobileHosts } from "../src/runtime"
import type { MobileHosts } from "../src/runtime"
import { createMemoryStorage } from "../src/storage"
import { createSshHostKeyVerifier } from "../src/ssh/host-key-verifier"
import { createSshHostTransport } from "../src/ssh/transport"
import type { SshBridgeTransport } from "../src/ssh/bridge"
import { createFakeSshBridge } from "./fake-ssh-bridge"
import type { FakeSshBridge } from "./fake-ssh-bridge"

// Driver full-flow integration tests (issue #6): the REAL SshBridgeHostKeyVerifier and
// SshBridgeHostTransport wired over the fake native bridge, driven through
// createMobileHosts exactly as M-015 wires them. The native side is mirrored as an
// in-test known_hosts store + presentable key; every failure is injected per test.
//
// Red lines re-tested at this level (decision 0003 §3.3/§6):
// - credentials are issued to NO ONE before a fingerprint is confirmed (T4 => zero
//   connects; fetchHostKey requests never carry credential material);
// - a changed key is a HARD refusal with zero connects and never an automatic overwrite
//   (recovery is the explicit forgetHostKey, then the unknown-fingerprint flow again);
// - teardown is local-only: disconnect/delete/cancel produce cancel/disconnect bridge ops
//   and nothing else — the remote service is never signalled;
// - the confirmed fingerprint flows into open(pinnedFingerprint) and the verifier is NOT
//   re-run (the store records the key only at that pinned open).

const ED25519_FINGERPRINT = "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk"
// Exactly 43 base64 chars after "SHA256:" — the format guard rejects anything else.
const RSA_FINGERPRINT = "SHA256:abcdefghijklmnopqrstuvwxy0123456789ABCDEFGH"
const TARGET = "deploy@example.invalid:22"

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5))

/** Network-layer failures hit the TCP connect — they kill the key scan too (no TCP, no KEX). */
const NETWORK_CODES = ["dns", "refused", "timeout", "unreachable"] as const

/** Healthy service face: a compatible version answer (issue #6 post-open health check). */
function healthyServiceFetch(): typeof globalThis.fetch {
  return (async () => new Response(JSON.stringify({ version: "2.1.4" }), { status: 200 })) as typeof globalThis.fetch
}

type ConnectOutcome = { ok: true; port?: number } | { ok: false; code: string }

interface NativeSsh {
  /** fingerprints the store believes in (`${host}:${port}` -> fingerprint) */
  known: Map<string, string>
  /** the key the host currently presents (mutate to stage a key change) */
  presented: string
  /** next connect() outcome */
  nextConnect: ConnectOutcome
  /** log of the mutating ops (connect/disconnect/cancel/removeHostKey) */
  ops: Array<{ op: string; params: Record<string, unknown> }>
}

function fakeNativeService() {
  const native: NativeSsh = {
    known: new Map(),
    presented: ED25519_FINGERPRINT,
    nextConnect: { ok: true },
    ops: [],
  }
  const handlers = {
    fetchHostKey(params: Record<string, unknown>) {
      // A network-layer failure kills the key scan as well: no TCP, no KEX.
      if (!native.nextConnect.ok && (NETWORK_CODES as readonly string[]).includes(native.nextConnect.code)) {
        throw Object.assign(new Error(native.nextConnect.code), { code: native.nextConnect.code })
      }
      const key = `${params["host"]}:${params["port"]}`
      const stored = native.known.get(key)
      if (stored === undefined) return { decision: "prompt", fingerprint: native.presented }
      if (stored !== native.presented) throw Object.assign(new Error("changed"), { code: "host-key-changed" })
      return { decision: "trust", fingerprint: stored }
    },
    connect(params: Record<string, unknown>) {
      native.ops.push({ op: "connect", params })
      const key = `${params["host"]}:${params["port"]}`
      const stored = native.known.get(key)
      const pinned = params["pinnedFingerprint"]
      if (typeof pinned === "string") {
        // The pinned open: the presented key MUST equal the pin (fail-closed, accept-and-store).
        if (pinned !== native.presented) throw Object.assign(new Error("changed"), { code: "host-key-changed" })
        native.known.set(key, pinned)
      } else if (stored !== undefined && stored !== native.presented) {
        // Defense in depth on the trust path: the store comparison native-side.
        throw Object.assign(new Error("changed"), { code: "host-key-changed" })
      }
      if (!native.nextConnect.ok) throw Object.assign(new Error(native.nextConnect.code), { code: native.nextConnect.code })
      return { url: `http://127.0.0.1:${native.nextConnect.port ?? 45679}` }
    },
    disconnect(params: Record<string, unknown>) {
      native.ops.push({ op: "disconnect", params })
      return {}
    },
    cancel(params: Record<string, unknown>) {
      native.ops.push({ op: "cancel", params })
      return {}
    },
    removeHostKey(params: Record<string, unknown>) {
      native.ops.push({ op: "removeHostKey", params })
      native.known.delete(`${params["host"]}:${params["port"]}`)
      return {}
    },
  }
  return { native, handlers }
}

function wireSshRuntime(handlers: Record<string, (params: Record<string, unknown>) => unknown>, fetch?: typeof globalThis.fetch) {
  const bridge = createFakeSshBridge(handlers as never)
  bridge.native.connect() // handshake + ack: the bridge is up before the attempt starts
  const hosts = createMobileHosts({
    storage: createMemoryStorage(),
    hostKey: createSshHostKeyVerifier(bridge.transport as SshBridgeTransport),
    transport: createSshHostTransport(bridge.transport as SshBridgeTransport),
    fetch: fetch ?? healthyServiceFetch(),
    sshBridge: bridge.transport as SshBridgeTransport,
  })
  return { hosts, bridge: bridge as FakeSshBridge }
}

describe("driver full flow over the ssh bridge (issue #6)", () => {
  test("unknown host -> prompt -> confirm -> pinned open -> healthy -> ready (no re-scan after confirm)", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts, bridge } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET, servicePort: 8080 })
    hosts.connect(host.id)
    await settle()
    // T2: prompt with the native-computed fingerprint (memory-only, accessor-visible).
    expect(hosts.stateOf(host.id)).toBe("hostKeyUnverified")
    expect(hosts.fingerprintOf(host.id)).toBe(ED25519_FINGERPRINT)
    expect(bridge.native.requests().filter((r) => r.op === "fetchHostKey").length).toBe(1)
    // Scan discipline: the key scan never carries credential material.
    const scan = bridge.native.requests().find((r) => r.op === "fetchHostKey")!
    expect("credential" in scan.params).toBe(false)
    hosts.confirmHostKey(host.id)
    await settle()
    // T5: the pinned open succeeded and the service check passed.
    expect(hosts.stateOf(host.id)).toBe("ready")
    // The confirmed fingerprint reached the connect request; the (mirrored) store now
    // knows the key. Exactly ONE scan total: the confirmation goes straight to the pinned
    // open — re-running the verifier would re-prompt forever (the store records the key
    // only at that pinned open).
    expect(bridge.native.requests().filter((r) => r.op === "fetchHostKey").length).toBe(1)
    const connectOp = native.ops.find((op) => op.op === "connect")!
    expect(connectOp.params["pinnedFingerprint"]).toBe(ED25519_FINGERPRINT)
    expect(connectOp.params["servicePort"]).toBe(8080)
    expect(native.known.get("example.invalid:22")).toBe(ED25519_FINGERPRINT)
    // The upstream extension connection carries the endpoint and the #6 hooks.
    const conn = hosts.upstreamConnections()[0]!
    expect(conn.key.startsWith("mobile-ssh:")).toBe(true)
    expect(conn.state).toBe("ready")
    expect(conn.http.url).toBe("http://127.0.0.1:45679")
    expect(typeof conn.reconnect).toBe("function")
    expect(typeof conn.connect).toBe("function")
  })

  test("no credentialRef -> the connect request carries no credential field", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("ready")
    const connectOp = native.ops.find((op) => op.op === "connect")!
    expect("credential" in connectOp.params).toBe(false)
  })

  test("changed key -> hard refusal, zero connects; forgetHostKey recovery re-enters the prompt flow", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    // First contact: establish the trust baseline.
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("ready")
    hosts.disconnect(host.id)
    await settle()
    expect(native.ops.filter((op) => op.op === "connect").length).toBe(1)
    // The host's key changed (server rebuild / interception).
    native.presented = RSA_FINGERPRINT
    hosts.connect(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("failed")
    expect(hosts.failureReasonOf(host.id)).toBe("host-key-changed")
    // RED LINE: the changed-key refusal connected to NO ONE — no second connect op.
    expect(native.ops.filter((op) => op.op === "connect").length).toBe(1)
    // Recovery: the explicit removal (the danger confirmation lives in the UI above).
    expect(await hosts.forgetHostKey(host.id)).toBe(true)
    await settle()
    expect(native.ops.some((op) => op.op === "removeHostKey")).toBe(true)
    expect(native.known.has("example.invalid:22")).toBe(false)
    // The next connect re-enters the UNKNOWN-fingerprint confirmation flow (the new key is
    // shown for explicit verification — never auto-accepted).
    hosts.connect(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("hostKeyUnverified")
    expect(hosts.fingerprintOf(host.id)).toBe(RSA_FINGERPRINT)
    hosts.rejectHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("failed")
    expect(native.ops.filter((op) => op.op === "connect").length).toBe(1)
  })

  test("forgetHostKey without a wired bridge reports false (fail-closed no-op)", async () => {
    const hosts = createMobileHosts({ storage: createMemoryStorage() })
    const host = hosts.registry.add({ name: "box", target: TARGET })
    expect(await hosts.forgetHostKey(host.id)).toBe(false)
  })

  test("auth failure lands in authRequired; the revised T1 re-drives it to ready (upstream connect hook)", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("ready")
    hosts.disconnect(host.id)
    await settle()
    // Next attempt: the server rejects the (unchanged) credential.
    native.nextConnect = { ok: false, code: "auth-failed" }
    hosts.connect(host.id)
    await settle()
    // T6: authRequired — NOT failed; the credential can be edited and re-driven.
    expect(hosts.stateOf(host.id)).toBe("authRequired")
    expect(hosts.failureReasonOf(host.id)).toBeUndefined()
    // The upstream inline sign-in hook (authenticate path) re-drives from authRequired.
    native.nextConnect = { ok: true, port: 45680 }
    const conn = hosts.upstreamConnections()[0]!
    expect(conn.authenticationRequired).toBe(true)
    expect(await conn.connect!()).toBe(true)
    expect(hosts.stateOf(host.id)).toBe("ready")
    expect(hosts.upstreamConnections()[0]!.http.url).toBe("http://127.0.0.1:45680")
  })

  test("key-decrypt failure also lands in authRequired (re-import path)", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    hosts.disconnect(host.id)
    await settle()
    native.nextConnect = { ok: false, code: "key-decrypt-failed" }
    hosts.connect(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("authRequired")
  })

  test("tunnel-target refusal and reachability failures land in failed with the classified reason", async () => {
    for (const code of ["target-refused", "refused", "dns", "timeout", "unreachable", "forward-failed"]) {
      const { native, handlers } = fakeNativeService()
      const { hosts } = wireSshRuntime(handlers)
      const host = hosts.registry.add({ name: "box", target: TARGET })
      native.nextConnect = { ok: false, code }
      hosts.connect(host.id)
      await settle()
      // Network-layer codes fail the scan itself (no key to verify); post-auth codes
      // (auth/target/forward) surface only after the fingerprint was confirmed.
      if (hosts.stateOf(host.id) === "hostKeyUnverified") {
        expect(hosts.fingerprintOf(host.id)).toBe(ED25519_FINGERPRINT)
        hosts.confirmHostKey(host.id)
        await settle()
      }
      expect(hosts.stateOf(host.id)).toBe("failed")
      expect(hosts.failureReasonOf(host.id)).toBe(code)
    }
  })

  test("tunnel up but service dead -> service-unreachable (the service layer's own verdict)", async () => {
    const { handlers } = fakeNativeService()
    const { hosts, bridge } = wireSshRuntime(handlers, (async () => new Response("nope", { status: 502 })) as typeof globalThis.fetch)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("failed")
    expect(hosts.failureReasonOf(host.id)).toBe("service-unreachable")
    // The health check ran through the tunnel endpoint (its own authority face).
    expect(bridge.native.requests().some((r) => r.op === "connect")).toBe(true)
  })

  test("incompatible service version -> incompatible (T7; the upstream panel's driver)", async () => {
    const { handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers, (async () =>
      new Response(JSON.stringify({ version: "1.9.9" }), { status: 200 })) as typeof globalThis.fetch)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("incompatible")
    expect(hosts.upstreamConnections()[0]!.state).toBe("incompatible")
  })

  test("connectionLost -> offline (T9); the reconnect hook re-resolves to a NEW port with the SAME identity", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts, bridge } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("ready")
    const keyBefore = hosts.upstreamConnections()[0]!.key
    // The native tunnel dropped (client-side loss; the remote keeps running).
    native.nextConnect = { ok: true, port: 45700 }
    bridge.native.pushEvent({ event: "connectionLost", host: "example.invalid", port: 22 })
    await settle()
    expect(hosts.stateOf(host.id)).toBe("offline")
    expect(hosts.upstreamConnections()[0]!.http.url).toBe("http://127.0.0.1:0") // endpoint dropped off ready
    // The upstream reconnect hook re-resolves through the machine (T10 -> ready, T11).
    const endpoint = await hosts.upstreamConnections()[0]!.reconnect!(new AbortController().signal)
    expect(endpoint.url).toBe("http://127.0.0.1:45700")
    expect(hosts.stateOf(host.id)).toBe("ready")
    // Identity survived the port change (issue #3 ruling; the acceptance's reconnect case).
    expect(hosts.upstreamConnections()[0]!.key).toBe(keyBefore)
  })

  test("reconnect hook is bounded: a host that keeps failing exhausts the budget into failed, no infinite loop", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts, bridge } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    hosts.confirmHostKey(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("ready")
    // The tunnel drops -> offline (T9); then every redial fails.
    native.nextConnect = { ok: false, code: "refused" }
    bridge.native.pushEvent({ event: "connectionLost", host: "example.invalid", port: 22 })
    await settle()
    expect(hosts.stateOf(host.id)).toBe("offline")
    const conn = hosts.upstreamConnections()[0]!
    await expect(conn.reconnect!(new AbortController().signal)).rejects.toThrow("ssh tunnel unavailable")
    expect(hosts.stateOf(host.id)).toBe("failed") // budget exhausted, actionable again
  })

  test("reconnect hook refuses to run from a resting state (idle) — no drive-by connects", async () => {
    const { handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    void host
    const conn = hosts.upstreamConnections()[0]!
    await expect(conn.reconnect!(new AbortController().signal)).rejects.toThrow("ssh tunnel unavailable")
    expect(hosts.stateOf(host.id)).toBe("idle")
  })

  test("red lines: disconnect and delete are local-only (cancel/disconnect ops, nothing else)", async () => {
    const { native, handlers } = fakeNativeService()
    const { hosts } = wireSshRuntime(handlers)
    const host = hosts.registry.add({ name: "box", target: TARGET })
    // Delete mid-prompt: zero connects, zero teardowns (T14).
    hosts.connect(host.id)
    await settle()
    hosts.remove(host.id)
    await settle()
    expect(native.ops.length).toBe(0)
    expect(hosts.stateOf(host.id)).toBe("idle")
    // Disconnect from ready: exactly one local disconnect op, no other op ever.
    const host2 = hosts.registry.add({ name: "box2", target: "other@elsewhere.invalid" })
    hosts.connect(host2.id)
    await settle()
    hosts.confirmHostKey(host2.id)
    await settle()
    expect(hosts.stateOf(host2.id)).toBe("ready")
    hosts.disconnect(host2.id)
    await settle()
    expect(native.ops.filter((op) => op.op === "connect").length).toBe(1)
    expect(native.ops.filter((op) => op.op === "disconnect").length).toBe(1)
    expect(native.ops.filter((op) => op.op === "cancel").length).toBe(0)
    expect(native.ops.every((op) => op.op === "connect" || op.op === "disconnect")).toBe(true)
  })

  test("cancel mid-connect fires the local cancel op (bounded, no hang)", async () => {
    const { native, handlers } = fakeNativeService()
    // The key is already in the store (verify -> trust), and the connect op never answers
    // on its own: the AbortSignal is the only way out.
    native.known.set("example.invalid:22", ED25519_FINGERPRINT)
    // A connect that never resolves: no timer, nothing to leak past the suite.
    const bridge = createFakeSshBridge({
      ...handlers,
      connect: () => new Promise<never>(() => {}),
    } as never)
    bridge.native.connect()
    const hosts = createMobileHosts({
      storage: createMemoryStorage(),
      hostKey: createSshHostKeyVerifier(bridge.transport as SshBridgeTransport),
      transport: createSshHostTransport(bridge.transport as SshBridgeTransport),
      fetch: healthyServiceFetch(),
      sshBridge: bridge.transport as SshBridgeTransport,
    })
    const host = hosts.registry.add({ name: "box", target: TARGET })
    hosts.connect(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("connecting")
    hosts.disconnect(host.id)
    await settle()
    expect(hosts.stateOf(host.id)).toBe("idle")
    // The cancel op reached the bridge (local teardown of the in-flight connect).
    expect(bridge.native.requests().some((r) => r.op === "cancel")).toBe(true)
  })
})
