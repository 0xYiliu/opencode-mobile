import { describe, expect, test } from "bun:test"
import { decideHostCredential, persistHostCredential } from "../src/ui/host-credential"
import type { CredentialVault, VaultPutInput } from "../src/vault/types"

function fakeVault(putCalls: VaultPutInput[], removeCalls: string[] = []): CredentialVault {
  return {
    status: () => "available",
    put: async (input) => { putCalls.push(input); return "mobile-credential:synthetic-1" },
    get: async () => undefined,
    list: async () => [],
    remove: async (ref) => { removeCalls.push(ref) },
  }
}

describe("SSH host credential staging", () => {
  test("an imported key-only add is a complete remembered credential, not an empty password", () => {
    const decision = decideHostCredential({
      mode: "add",
      checkboxRendered: true,
      remember: true,
      password: "",
      pendingKey: "-----BEGIN PRIVATE KEY----- synthetic fixture",
    })
    expect(decision.action).toBe("put")
    expect(decision.forcesSave).toBe(true)
    expect(decision).not.toHaveProperty("existingRef")
  })

  test("a keyless empty remembered add still aborts before a vault write", () => {
    expect(decideHostCredential({
      mode: "add",
      checkboxRendered: true,
      remember: true,
      password: "",
    })).toMatchObject({ action: "abort", reason: "needs-password" })
  })

  test("an imported key cannot be saved after unchecking Remember or losing vault availability", () => {
    expect(decideHostCredential({
      mode: "add",
      checkboxRendered: true,
      remember: false,
      password: "",
      pendingKey: "-----BEGIN PRIVATE KEY----- synthetic fixture",
    })).toMatchObject({ action: "abort", reason: "key-requires-vault" })
    expect(decideHostCredential({
      mode: "add",
      checkboxRendered: false,
      remember: true,
      password: "",
      pendingKey: "-----BEGIN PRIVATE KEY----- synthetic fixture",
    })).toMatchObject({ action: "abort", reason: "key-requires-vault" })
  })

  test("key-only save writes a new private-key entry, and unbind never removes the old one", async () => {
    const puts: VaultPutInput[] = []
    const removes: string[] = []
    const vault = fakeVault(puts, removes)
    const pendingKey = "-----BEGIN PRIVATE KEY----- synthetic fixture"
    const decision = decideHostCredential({
      mode: "add", checkboxRendered: true, remember: true, password: "", pendingKey,
    })
    const saved = await persistHostCredential({ vault, decision, password: "", pendingKey, keyPassphrase: "" })
    expect(saved).toMatchObject({ credentialRef: "mobile-credential:synthetic-1", kind: "privateKey" })
    expect(puts).toEqual([{ kind: "privateKey", value: pendingKey }])

    const unbind = decideHostCredential({
      mode: "edit", checkboxRendered: true, remember: false, password: "", priorRef: saved.credentialRef,
    })
    expect(unbind.action).toBe("clear")
    expect(await persistHostCredential({ vault, decision: unbind, password: "", keyPassphrase: "" })).toEqual({})
    expect(removes).toEqual([])
  })

  test("an encrypted key passphrase remains only in the vault envelope value", async () => {
    const puts: VaultPutInput[] = []
    const vault = fakeVault(puts)
    const pendingKey = "-----BEGIN ENCRYPTED PRIVATE KEY----- synthetic fixture"
    const passphrase = "not-real-passphrase"
    const decision = decideHostCredential({
      mode: "add", checkboxRendered: true, remember: true, password: "", pendingKey,
    })
    await persistHostCredential({ vault, decision, password: "", pendingKey, keyPassphrase: passphrase })
    expect(puts[0]).toEqual({
      kind: "privateKey",
      value: JSON.stringify({ v: 1, key: pendingKey, passphrase }),
    })
  })
})
