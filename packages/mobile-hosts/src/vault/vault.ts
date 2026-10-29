// Credential vault client (issue #4) — implements CredentialVault over a VaultTransport.
//
// Responsibilities:
// - Client-side validation BEFORE anything crosses the bridge: non-empty value, 64 KiB
//   application bound (MAX_SECRET_BYTES; the native side re-checks — double-written on
//   purpose), minimal PEM shape for private keys, well-formed references.
// - Vault-level vs entry-level failures: `unavailable`/`io` throw; per-entry
//   `corrupt`/`unsupported` resolve to undefined on get() (docs/design/units/connection.md
//   失效矩阵) so one bad entry never blocks the rest of the app.
// - Reactive status backed by a solid signal (readable inside JSX without extra wiring).
// - createVaultResolver adapts the vault to the CredentialResolver port used by the
//   connection driver: results are handed to the caller for in-memory use only, never
//   written back to any store.

import { createSignal } from "solid-js"
import { isValidCredentialRef } from "../credential-ref"
import { formatVaultRef, MAX_SECRET_BYTES, parseVaultRef, VaultError, type CredentialVault, type VaultEntryMetadata, type VaultKind, type VaultPutInput, type VaultStatus } from "./types"
import type { VaultResponse, VaultTransport } from "./transport"

const PEM_HEADER_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/

function newEntryId(): string {
  const crypto = globalThis.crypto
  if (!crypto) throw new VaultError("unavailable", "secure random source unavailable")
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function assertAvailable(vault: { status(): VaultStatus }): void {
  if (vault.status() !== "available") throw new VaultError("unavailable")
}

/**
 * Private key value envelope (issue #6, decision 0003 §4, option C): a privateKey vault
 * entry's value accepts TWO forms —
 *   1. the bare PEM/OpenSSH key text (issue #4 form, unchanged), or
 *   2. a JSON envelope `{"v":1,"key":"<key text>","passphrase":"<optional>"}`
 *      recognized by the leading `{`; the embedded key MUST pass the PEM BEGIN gate.
 * The passphrase travels inside the same Keystore-encrypted envelope (never a registry
 * field, never a second reference — the three rejected alternatives in decision 0003).
 * FORBIDDEN_INPUT_KEYS is untouched: the envelope lives inside the vault value, the
 * registry layer never sees it.
 */
export interface PrivateKeyEnvelope {
  v: 1
  key: string
  passphrase?: string
}

function hasPemHeader(value: string): boolean {
  return PEM_HEADER_PATTERN.test(value.trim().split("\n")[0] ?? "")
}

/**
 * Recognize the JSON envelope form. Returns undefined when the value is NOT an envelope
 * (bare key text — the caller applies the plain PEM gate). Throws VaultError("io") for a
 * value that LOOKS like an envelope but is malformed or carries a key without the PEM
 * BEGIN header — fail closed, never guess.
 */
export function parsePrivateKeyEnvelope(value: string): PrivateKeyEnvelope | undefined {
  if (!value.startsWith("{")) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new VaultError("io", "private key envelope is not valid JSON")
  }
  if (typeof parsed !== "object" || parsed === null) throw new VaultError("io", "private key envelope is not an object")
  const record = parsed as Record<string, unknown>
  if (record["v"] !== 1) throw new VaultError("io", "private key envelope version must be 1")
  const key = record["key"]
  if (typeof key !== "string" || key.length === 0) throw new VaultError("io", "private key envelope carries no key")
  if (!hasPemHeader(key)) {
    // The embedded key must pass the same BEGIN gate as a bare key — an envelope is never
    // a way to smuggle non-PEM bytes into the vault.
    throw new VaultError("io", "private key envelope key must be a PEM block with a BEGIN PRIVATE KEY header")
  }
  const passphrase = record["passphrase"]
  if (passphrase !== undefined && (typeof passphrase !== "string" || passphrase.length === 0)) {
    throw new VaultError("io", "private key envelope passphrase must be a non-empty string when present")
  }
  return passphrase !== undefined ? { v: 1, key, passphrase } : { v: 1, key }
}

function validateValue(kind: VaultKind, value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "credential value must be a non-empty string")
  const bytes = new TextEncoder().encode(value)
  if (bytes.length > MAX_SECRET_BYTES) {
    throw new VaultError("io", `credential value exceeds the ${MAX_SECRET_BYTES}-byte limit`)
  }
  if (kind === "privateKey") {
    // Dual form (issue #6): a JSON envelope (leading `{`) is validated as a whole — the
    // parser enforces the PEM BEGIN gate on the embedded key; anything else is bare key
    // text and must pass the plain PEM gate. Real parsing still belongs to the SSH
    // transport (JSch at the bridge; this is the minimal format gate only).
    const envelope = parsePrivateKeyEnvelope(value)
    if (envelope === undefined && !hasPemHeader(value)) {
      throw new VaultError("io", "private key must be a PEM block with a BEGIN PRIVATE KEY header")
    }
  }
}

/**
 * The bridge-backed vault. The transport decides availability (handshake captured + acked);
 * this client never fakes it and never falls back to plaintext.
 */
export function createVaultClient(transport: VaultTransport): CredentialVault {
  const [status, setStatus] = createSignal<VaultStatus>(transport.status())
  transport.onReady((available) => setStatus(available ? "available" : "unavailable"))

  const request = async (op: Parameters<VaultTransport["request"]>[0], params: Record<string, unknown>): Promise<unknown> => {
    assertAvailable({ status })
    const response: VaultResponse = await transport.request(op, params)
    if (response.ok) return response.result
    throw new VaultError(response.code, response.message, response.recoveryRef)
  }

  return {
    status,
    async put(input: VaultPutInput): Promise<string> {
      if (input.kind !== "password" && input.kind !== "privateKey") throw new VaultError("io", `unknown credential kind: ${String(input.kind)}`)
      validateValue(input.kind, input.value)
      let existingId: string | undefined
      if (input.existingRef !== undefined) {
        existingId = parseVaultRef(input.existingRef)
        if (existingId === undefined) throw new VaultError("io", "existingRef is not a mobile-credential:<id> reference")
      }
      const candidateId = existingId ?? newEntryId()
      const candidateRef = formatVaultRef(candidateId)
      let id: unknown
      try {
        id = await request("put", {
        kind: input.kind,
        value: input.value,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(existingId !== undefined ? { existingId } : {}),
        candidateId,
        })
      } catch (error) {
        if (error instanceof VaultError && error.code === "unknown")
          throw new VaultError("unknown", error.message, error.recoveryRef ?? candidateRef)
        throw error
      }
      if (typeof id !== "string" || !isValidCredentialRef(id))
        throw new VaultError("unknown", "credential write outcome unknown; retain this reference for inspection", candidateRef)
      return id
    },
    async remove(ref: string): Promise<void> {
      const id = parseVaultRef(ref)
      if (id === undefined) throw new VaultError("io", "ref is not a mobile-credential:<id> reference")
      try { await request("remove", { id }) }
      catch (error) {
        if (error instanceof VaultError && error.code === "unknown")
          throw new VaultError("unknown", error.message, error.recoveryRef ?? formatVaultRef(id))
        throw error
      }
    },
    async get(ref: string): Promise<string | undefined> {
      if (!isValidCredentialRef(ref)) return undefined
      try {
        const value = (await request("get", { id: parseVaultRef(ref)! })) as unknown
        return typeof value === "string" && value.length > 0 ? value : undefined
      } catch (error) {
        // Per-entry lazy failure: a corrupt/unsupported entry resolves to undefined and the
        // failure matrix (re-entry, manager banner) takes over. Vault-level failures throw.
        if (error instanceof VaultError && (error.code === "corrupt" || error.code === "unsupported")) return undefined
        throw error
      }
    },
    async list(): Promise<VaultEntryMetadata[]> {
      const entries = (await request("list", {})) as unknown
      if (!Array.isArray(entries)) throw new VaultError("io", "bridge returned a malformed metadata list")
      const metas: VaultEntryMetadata[] = []
      for (const raw of entries) {
        if (typeof raw !== "object" || raw === null) continue
        const e = raw as Record<string, unknown>
        // Defense in depth: a value-shaped field must never cross back over the bridge.
        if ("value" in e) throw new VaultError("io", "bridge metadata carried a forbidden value field")
        if (
          typeof e["id"] !== "string" ||
          (e["kind"] !== "password" && e["kind"] !== "privateKey") ||
          typeof e["createdAt"] !== "string"
        ) {
          continue
        }
        metas.push({
          id: e["id"],
          kind: e["kind"],
          ...(typeof e["label"] === "string" && e["label"] ? { label: e["label"] } : {}),
          createdAt: e["createdAt"],
        })
      }
      return metas
    },
  }
}

/**
 * Adapter to the CredentialResolver port (connection driver). Resolving hands the value to
 * the caller for in-memory use only; entry-level failures (missing/corrupt/unsupported)
 * yield undefined so the connection proceeds into the server's auth path; vault-level
 * unavailability throws and lands the host in the explicit failed state.
 */
export function createVaultResolver(vault: CredentialVault): { resolve(ref: string): Promise<string | undefined> } {
  return {
    resolve: async (ref: string) => {
      if (!isValidCredentialRef(ref)) return undefined
      return vault.get(ref)
    },
  }
}

export { formatVaultRef }
