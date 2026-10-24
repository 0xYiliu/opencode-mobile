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
import type { VaultTransport } from "./transport"

const PEM_HEADER_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/

function assertAvailable(vault: { status(): VaultStatus }): void {
  if (vault.status() !== "available") throw new VaultError("unavailable")
}

function validateValue(kind: VaultKind, value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "credential value must be a non-empty string")
  const bytes = new TextEncoder().encode(value)
  if (bytes.length > MAX_SECRET_BYTES) {
    throw new VaultError("io", `credential value exceeds the ${MAX_SECRET_BYTES}-byte limit`)
  }
  if (kind === "privateKey" && !PEM_HEADER_PATTERN.test(value.trim().split("\n")[0] ?? "")) {
    // Minimal format gate only (the BEGIN header); real parsing belongs to the SSH transport (issue #6).
    throw new VaultError("io", "private key must be a PEM block with a BEGIN PRIVATE KEY header")
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
    const response = await transport.request(op, params)
    if (response.ok) return response.result
    throw new VaultError(response.code, response.message)
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
      const id = (await request("put", {
        kind: input.kind,
        value: input.value,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(existingId !== undefined ? { existingId } : {}),
      })) as string
      if (typeof id !== "string" || !isValidCredentialRef(id)) throw new VaultError("io", "bridge returned a malformed credential reference")
      return id
    },
    async remove(ref: string): Promise<void> {
      const id = parseVaultRef(ref)
      if (id === undefined) throw new VaultError("io", "ref is not a mobile-credential:<id> reference")
      await request("remove", { id })
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
