import { describe, expect, test } from "bun:test"
import { createInProcessVaultEngine } from "../src/vault/transport"
import type { InProcessVaultHandlers } from "../src/vault/transport"
import {
  MAX_SECRET_BYTES,
  UnavailableVault,
  VaultError,
  formatVaultRef,
  parseVaultRef,
  type VaultEntryMetadata,
} from "../src/vault/types"
import { openEnvelope, sealEnvelope, generateEnvelopeKey } from "../src/vault/envelope"
import { createVaultClient, createVaultResolver } from "../src/vault/vault"
import { evaluateRemember, initialRemember } from "../src/vault/remember"

// Vault client + remember truth table (issue #4). All values are synthetic; nothing here is
// a real credential. The native side is the in-process engine running REAL envelope crypto
// (WebCrypto AES-GCM with AAD), so every assertion below crosses the same message protocol
// the Android bridge speaks (JSON strings, requestId, op whitelist on the client side).

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A software mirror of the native vault: envelope-crypted map + metadata index (never a value field). */
async function softwareVaultNative(overrides?: Partial<InProcessVaultHandlers>) {
  const key = await generateEnvelopeKey()
  const entries = new Map<string, { envelope: Uint8Array; meta: VaultEntryMetadata }>()
  const base: InProcessVaultHandlers = {
    handle: async (op, params) => {
      if (op === "put") {
        const kind = params["kind"]
        const value = params["value"]
        const label = params["label"]
        const existingId = params["existingId"]
        if (kind !== "password" && kind !== "privateKey") throw new VaultError("io", "unknown kind")
        if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "empty value (native re-check)")
        if (encoder.encode(value).length > MAX_SECRET_BYTES) throw new VaultError("io", "value too large (native re-check)")
        let id: string
        if (typeof existingId === "string") {
          id = existingId // in-place: the id (and therefore the ref) stays stable
        } else {
          id = crypto.randomUUID()
        }
        const envelope = await sealEnvelope(key, id, encoder.encode(value))
        const meta: VaultEntryMetadata = {
          id,
          kind,
          ...(typeof label === "string" && label ? { label } : {}),
          createdAt: "2026-10-24T00:00:00.000Z",
        }
        entries.set(id, { envelope, meta })
        return formatVaultRef(id)
      }
      if (op === "remove") {
        entries.delete(String(params["id"]))
        return null
      }
      if (op === "get") {
        const entry = entries.get(String(params["id"]))
        if (!entry) return null
        // Corrupt/unsupported entries propagate their VaultError code to the client.
        return decoder.decode(await openEnvelope(key, String(params["id"]), entry.envelope))
      }
      if (op === "list") {
        return [...entries.values()].map((e) => ({ ...e.meta })) // metadata only, no value
      }
      throw new VaultError("io", `unknown op: ${String(op)}`)
    },
  }
  return { engine: createInProcessVaultEngine({ ...base, ...overrides }), entries }
}

async function connectedVault(overrides?: Partial<InProcessVaultHandlers>) {
  const { engine, entries } = await softwareVaultNative(overrides)
  const vault = createVaultClient(engine.client)
  engine.native.connect()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  expect(engine.native.acked()).toBe(true)
  return { vault, engine, entries }
}

describe("vault client over the in-process bridge", () => {
  test("put/list/get/remove round-trip through real envelope crypto", async () => {
    const { vault } = await connectedVault()
    expect(vault.status()).toBe("available")
    const ref = await vault.put({ kind: "password", value: "synthetic-op-42", label: "probe" })
    expect(parseVaultRef(ref)).toBeDefined()
    const metas = await vault.list()
    expect(metas).toHaveLength(1)
    expect(metas[0]!.kind).toBe("password")
    expect(metas[0]!.label).toBe("probe")
    expect(metas[0]).not.toHaveProperty("value")
    expect(await vault.get(ref)).toBe("synthetic-op-42")
    await vault.remove(ref)
    expect(await vault.list()).toHaveLength(0)
    expect(await vault.get(ref)).toBeUndefined()
  })

  test("in-place put keeps the reference stable and replaces the stored value", async () => {
    const { vault } = await connectedVault()
    const ref = await vault.put({ kind: "password", value: "first-secret" })
    const ref2 = await vault.put({ kind: "password", value: "second-secret", existingRef: ref })
    expect(ref2).toBe(ref)
    expect(await vault.get(ref)).toBe("second-secret")
    expect(await vault.list()).toHaveLength(1)
  })

  test("client-side validation: empty value, over-bound value, bad kind, malformed existingRef", async () => {
    const { vault, engine } = await connectedVault()
    await expect(vault.put({ kind: "password", value: "" })).rejects.toMatchObject({ code: "io" })
    await expect(vault.put({ kind: "password", value: "x".repeat(MAX_SECRET_BYTES + 1) })).rejects.toMatchObject({ code: "io" })
    // The 64 KiB boundary itself is allowed (C3 probes the same boundary on device).
    await expect(vault.put({ kind: "password", value: "x".repeat(MAX_SECRET_BYTES) })).resolves.toBeDefined()
    await expect(vault.put({ kind: "token" as never, value: "x" })).rejects.toMatchObject({ code: "io" })
    await expect(vault.put({ kind: "password", value: "x", existingRef: "not-a-ref" })).rejects.toMatchObject({ code: "io" })
    await expect(vault.put({ kind: "privateKey", value: "not a pem" })).rejects.toMatchObject({ code: "io" })
    // Nothing crossed the bridge for rejected inputs.
    expect(engine.native.sent().filter((m) => m.includes('"op":"put"'))).toHaveLength(1)
  })

  test("minimal PEM gate accepts a BEGIN PRIVATE KEY header for privateKey kind", async () => {
    const { vault } = await connectedVault()
    // Split construction keeps this synthetic fixture from matching secret-shaped greps:
    // it is a header marker, not a key (the body is not base64 and nothing here is real).
    const pem = ["-----BEGIN ", "PRIVATE KEY-----", "\nMIIBsynthetic\n", "-----END ", "PRIVATE KEY-----", "\n"].join("")
    const ref = await vault.put({ kind: "privateKey", value: pem })
    expect(await vault.get(ref)).toBe(pem)
  })

  test("per-entry corrupt resolves undefined; the client never fabricates a value", async () => {
    const { vault, entries } = await connectedVault()
    const ref = await vault.put({ kind: "password", value: "will-corrupt" })
    const id = parseVaultRef(ref)!
    const entry = entries.get(id)!
    const flipped = new Uint8Array(entry.envelope)
    flipped[flipped.length - 1]! ^= 0xff // break the GCM tag
    entries.set(id, { envelope: flipped, meta: entry.meta })
    expect(await vault.get(ref)).toBeUndefined()
  })

  test("an unsupported envelope version also resolves undefined per entry (lazy)", async () => {
    const { vault, entries } = await connectedVault()
    const ref = await vault.put({ kind: "password", value: "from-the-future" })
    const id = parseVaultRef(ref)!
    const entry = entries.get(id)!
    const forged = new Uint8Array(entry.envelope)
    forged.set(new TextEncoder().encode("OPMV9"), 0)
    entries.set(id, { envelope: forged, meta: entry.meta })
    expect(await vault.get(ref)).toBeUndefined()
  })

  test("metadata list rejects a value-shaped field crossing the bridge (defense in depth)", async () => {
    // A "buggy native" that smuggles a value field into list results must be rejected by the client.
    const { engine } = await softwareVaultNative({
      handle: async (op) => {
        if (op === "list") return [{ id: "e1", kind: "password", value: "MUST-NOT-APPEAR", createdAt: "t" }]
        throw new VaultError("io", `unexpected op ${op}`)
      },
    })
    const vault = createVaultClient(engine.client)
    engine.native.connect()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(vault.list()).rejects.toMatchObject({ code: "io" })
    expect(JSON.stringify(engine.native.sent())).not.toContain("MUST-NOT-APPEAR")
  })

  test("unavailable before handshake: explicit state, zero capability (C5d)", async () => {
    const { engine } = await softwareVaultNative()
    const vault = createVaultClient(engine.client)
    expect(vault.status()).toBe("unavailable")
    await expect(vault.put({ kind: "password", value: "x" })).rejects.toMatchObject({ code: "unavailable" })
    await expect(vault.list()).rejects.toMatchObject({ code: "unavailable" })
    // And the native side never received anything.
    expect(engine.native.sent()).toEqual([])
  })

  test("UnavailableVault is fail-closed and reports unavailable", async () => {
    expect(UnavailableVault.status()).toBe("unavailable")
    await expect(UnavailableVault.put({ kind: "password", value: "x" })).rejects.toMatchObject({ code: "unavailable" })
    await expect(UnavailableVault.get("mobile-credential:x")).rejects.toMatchObject({ code: "unavailable" })
    await expect(UnavailableVault.list()).rejects.toMatchObject({ code: "unavailable" })
    await expect(UnavailableVault.remove("mobile-credential:x")).rejects.toMatchObject({ code: "unavailable" })
  })
})

describe("vault-backed resolver", () => {
  test("resolves a stored ref into memory; entry-level failure is undefined; invalid ref is undefined", async () => {
    const { vault } = await connectedVault()
    const resolver = createVaultResolver(vault)
    const ref = await vault.put({ kind: "password", value: "resolver-probe" })
    expect(await resolver.resolve(ref)).toBe("resolver-probe")
    expect(await resolver.resolve("mobile-credential:missing-entry")).toBeUndefined()
    expect(await resolver.resolve("garbage")).toBeUndefined()
  })

  test("a vault-level failure throws (host lands in failed — explicit, not degraded)", async () => {
    const { engine } = await softwareVaultNative()
    const resolver = createVaultResolver(createVaultClient(engine.client))
    await expect(resolver.resolve("mobile-credential:any-entry")).rejects.toMatchObject({ code: "unavailable" })
  })
})

describe("remember truth table v3 (evaluateRemember)", () => {
  const ADD = { mode: "add" as const, checkboxRendered: true }
  const EDIT = { mode: "edit" as const, checkboxRendered: true }
  const NOT_RENDERED = { checkboxRendered: false }

  test("row 1: add, no prior, checked, non-empty -> put new (forces save per the plan formula)", () => {
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: false, priorRef: undefined })).toMatchObject({ action: "put", forcesSave: true })
  })
  test("row 2: add, no prior, empty -> abort save with needs-password (no empty value ever cast)", () => {
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: true, priorRef: undefined })).toMatchObject({ action: "abort", reason: "needs-password" })
  })
  test("row 3: add, prior, checked, non-empty -> put in-place (ref stable)", () => {
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: false, priorRef: "mobile-credential:p3" })).toMatchObject({ action: "put", existingRef: "mobile-credential:p3" })
  })
  test("row 4: add, prior with ref, unchecked -> clear ref + remove entry", () => {
    expect(evaluateRemember({ ...ADD, remember: false, valueEmpty: false, priorRef: "mobile-credential:p4" })).toMatchObject({ action: "clear", ref: "mobile-credential:p4", forcesSave: true })
  })
  test("row 5: add, prior without ref, unchecked -> no ref, no vault op", () => {
    expect(evaluateRemember({ ...ADD, remember: false, valueEmpty: false, priorRef: undefined })).toMatchObject({ action: "none", forcesSave: false })
  })
  test("row 6: add with prior via link method -> checkbox absent, ref passthrough, zero vault ops", () => {
    expect(evaluateRemember({ ...NOT_RENDERED, mode: "add", remember: false, valueEmpty: true, priorRef: "mobile-credential:p6" })).toEqual({ action: "passthrough", ref: "mobile-credential:p6", forcesSave: false })
  })
  test("row 7: edit, checked, non-empty -> put in-place", () => {
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: false, priorRef: "mobile-credential:p7" })).toMatchObject({ action: "put", existingRef: "mobile-credential:p7" })
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: false, priorRef: undefined })).toMatchObject({ action: "put" })
  })
  test("row 8: edit, stays checked, empty, has ref -> keep ref, no put, no error (edit-only)", () => {
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: true, priorRef: "mobile-credential:p8" })).toEqual({ action: "passthrough", ref: "mobile-credential:p8", forcesSave: false })
  })
  test("row 9: edit, unchecked after hydration prefill, non-empty -> clear + remove; password still authorizes this save", () => {
    expect(evaluateRemember({ ...EDIT, remember: false, valueEmpty: false, priorRef: "mobile-credential:p9" })).toMatchObject({ action: "clear", ref: "mobile-credential:p9", forcesSave: true })
  })
  test("row 10: edit, unchecked, empty, has ref -> clear + remove", () => {
    expect(evaluateRemember({ ...EDIT, remember: false, valueEmpty: true, priorRef: "mobile-credential:p10" })).toMatchObject({ action: "clear", ref: "mobile-credential:p10", forcesSave: true })
  })
  test("row 11: edit in link mode -> checkbox absent, ref passthrough, missing checkbox is NOT a deletion intent", () => {
    expect(evaluateRemember({ ...NOT_RENDERED, mode: "edit", remember: false, valueEmpty: true, priorRef: "mobile-credential:p11" })).toEqual({ action: "passthrough", ref: "mobile-credential:p11", forcesSave: false })
  })
  test("row 12: add, prior, checked, empty -> row-2 semantics (abort, no put, no empty value)", () => {
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: true, priorRef: "mobile-credential:p12" })).toMatchObject({ action: "abort", reason: "needs-password" })
  })
  test("edit analogue of rows 2/12: checked, empty, no ref to keep -> abort", () => {
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: true, priorRef: undefined })).toMatchObject({ action: "abort", reason: "needs-password" })
  })
  test("row 13 (issue #4 review fix): checked, empty, PRIVATE KEY bound -> keep the binding in add and edit", () => {
    // host-dialog add assembly: the key was imported before save; aborting would strand it
    // as an orphan and there is no value to type for a key binding.
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: true, priorRef: "mobile-credential:keyentry", boundKind: "privateKey" })).toEqual({
      action: "passthrough",
      ref: "mobile-credential:keyentry",
      forcesSave: false,
    })
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: true, priorRef: "mobile-credential:keyentry", boundKind: "privateKey" })).toEqual({
      action: "passthrough",
      ref: "mobile-credential:keyentry",
      forcesSave: false,
    })
  })
  test("row 12 unchanged for password-kind priors (boundKind absent or password)", () => {
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: true, priorRef: "mobile-credential:p12" })).toMatchObject({ action: "abort", reason: "needs-password" })
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: true, priorRef: "mobile-credential:p12", boundKind: "password" })).toMatchObject({ action: "abort", reason: "needs-password" })
  })
  test("early-exit forcing: a rendered checkbox flipped against the prior blocks the nothing-changed exit", () => {
    // checked over a ref-less prior / unchecked over a remembered prior
    expect(evaluateRemember({ ...ADD, remember: true, valueEmpty: false, priorRef: undefined }).forcesSave).toBe(true)
    expect(evaluateRemember({ ...EDIT, remember: false, valueEmpty: false, priorRef: "mobile-credential:pf" }).forcesSave).toBe(true)
    // matching states do not force
    expect(evaluateRemember({ ...EDIT, remember: true, valueEmpty: false, priorRef: "mobile-credential:pf" }).forcesSave).toBe(false)
    expect(evaluateRemember({ ...EDIT, remember: false, valueEmpty: false, priorRef: undefined }).forcesSave).toBe(false)
    // an unrendered checkbox never forces
    expect(evaluateRemember({ ...NOT_RENDERED, mode: "edit", remember: false, valueEmpty: false, priorRef: "mobile-credential:pf" }).forcesSave).toBe(false)
  })
  test("initial checkbox value follows the prior ref", () => {
    expect(initialRemember("mobile-credential:pi")).toBe(true)
    expect(initialRemember(undefined)).toBe(false)
  })
  test("malformed prior refs are treated as absent (registry validates on input; belt-and-braces here)", () => {
    expect(evaluateRemember({ ...ADD, remember: false, valueEmpty: false, priorRef: "hunter2" })).toMatchObject({ action: "none" })
  })
})
