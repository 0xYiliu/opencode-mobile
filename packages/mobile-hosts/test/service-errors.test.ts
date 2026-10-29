import { describe, expect, test } from "bun:test"
import {
  PERMISSION_DENIED_MARKERS,
  SERVICE_OPS_ERROR_CODES,
  ServiceOpsError,
  classifyExecFailure,
  isServiceOpsErrorCode,
  serviceOpsErrorCodeMessageKey,
} from "../src/service-ops/errors"

// Service ops error taxonomy (issue #7, decision 0004): set totalness, the dedicated
// permission-denied code (N4) with its stderr-tail classifier fixtures (documented output
// shapes, honestly non-live), and the honest degrade path. Synthetic text only.

describe("service ops error taxonomy", () => {
  test("the canonical set is total over the guard and carries no duplicates", () => {
    expect(SERVICE_OPS_ERROR_CODES.length).toBe(21)
    expect(new Set(SERVICE_OPS_ERROR_CODES).size).toBe(SERVICE_OPS_ERROR_CODES.length)
    for (const code of SERVICE_OPS_ERROR_CODES) {
      expect(isServiceOpsErrorCode(code)).toBe(true)
      expect(serviceOpsErrorCodeMessageKey(code)).toBe(`svcops.error.${code}`)
    }
    expect(isServiceOpsErrorCode("exec-failed")).toBe(true)
    expect(isServiceOpsErrorCode("bridge-unavailable")).toBe(false) // the ssh taxonomy, not this one
    expect(isServiceOpsErrorCode("nonsense")).toBe(false)
    expect(isServiceOpsErrorCode(42)).toBe(false)
  })

  test("the permission-denied dedicated code exists (N4) and is distinct from exec-failed", () => {
    expect(SERVICE_OPS_ERROR_CODES).toContain("permission-denied")
    expect(SERVICE_OPS_ERROR_CODES).toContain("exec-failed")
    // rollback-available is the flow-state marker riding the same set (not an error face).
    expect(SERVICE_OPS_ERROR_CODES).toContain("rollback-available")
  })

  test("ServiceOpsError carries the classification out-of-band of the message", () => {
    const error = new ServiceOpsError("exec-denied", "cross-domain assembly refused")
    expect(error.code).toBe("exec-denied")
    expect(error.message).toContain("refused")
    expect(new ServiceOpsError("occupied-port").message).toContain("occupied-port")
  })
})

describe("stderr-tail permission classification (N4)", () => {
  test("documented POSIX permission outputs promote to permission-denied", () => {
    // Fixture: `brew install opencode` refused by a read-only prefix (documented shape,
    // non-live): "Error: Permission denied @ dir_s_mkdir - /usr/local/Homebrew"
    expect(classifyExecFailure({ exitCode: 1, stderrTail: "Error: Permission denied @ dir_s_mkdir - /usr/local/Homebrew" })).toEqual({
      code: "permission-denied",
      marker: "permission denied",
    })
    // Fixture: apt/npm global prefix refusal (documented shape, non-live):
    // "npm ERR! Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'"
    expect(classifyExecFailure({ exitCode: 1, stderrTail: "npm ERR! Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'" })).toEqual({
      code: "permission-denied",
      marker: "permission denied",
    })
    // Fixture: POSIX errno face (documented shape, non-live): "pkill: Operation not permitted"
    expect(classifyExecFailure({ exitCode: 1, stderrTail: "pkill: Operation not permitted" })).toEqual({
      code: "permission-denied",
      marker: "operation not permitted",
    })
  })

  test("documented Windows elevation outputs promote to permission-denied", () => {
    // Fixture: cmd `access is denied.` (documented shape, non-live).
    expect(classifyExecFailure({ exitCode: 5, stderrTail: "Access is denied." })).toEqual({
      code: "permission-denied",
      marker: "access is denied",
    })
    // Fixture: winget elevation wording (documented shape, non-live).
    expect(classifyExecFailure({ exitCode: 1603, stderrTail: "This app package requires elevation to install" })).toEqual({
      code: "permission-denied",
      marker: "requires elevation",
    })
    expect(classifyExecFailure({ exitCode: 1, stderrTail: "This operation requires administrator privileges" })).toEqual({
      code: "permission-denied",
      marker: "requires administrator",
    })
  })

  test("matching is case-insensitive and scans the whole bounded tail", () => {
    const tail = ["warning: something unrelated", "npm ERR! code EACCES", "npm ERR! Permission denied"].join("\n")
    expect(classifyExecFailure({ exitCode: 1, stderrTail: tail }).code).toBe("permission-denied")
  })

  test("a non-permission failure degrades honestly to exec-failed and keeps the tail with the caller", () => {
    // Fixture: command-not-found (documented shape, non-live). NOT a permission story.
    const classification = classifyExecFailure({ exitCode: 127, stderrTail: "bash: opencode: command not found" })
    expect(classification).toEqual({ code: "exec-failed" })
    // The caller presents the tail verbatim — the classifier never swallows evidence.
    expect(classification.marker).toBeUndefined()
    expect(classifyExecFailure({ exitCode: 1, stderrTail: "" })).toEqual({ code: "exec-failed" })
    expect(classifyExecFailure({ exitCode: -1, stderrTail: "killed by signal" })).toEqual({ code: "exec-failed" })
  })

  test("the marker list itself stays small and verbatim (no broad patterns)", () => {
    for (const marker of PERMISSION_DENIED_MARKERS) {
      expect(marker).not.toMatch(/[*+?[\]\\]/)
      expect(marker.length).toBeGreaterThan(3)
    }
  })
})
