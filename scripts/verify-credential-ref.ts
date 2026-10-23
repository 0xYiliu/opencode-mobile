// verify-credential-ref.ts — N2 probe for M-005/M-006 (issue #3).
//
// Asserts, against the REAL vendored schema and dialog source:
//   1. Constructing a connection with http.credentialRef and passing it through the
//      persistence schema's decode/encode (the add/replace persistence round-trip) keeps
//      the reference...
//   2. ...while the password is still stripped on encode (M-002 unchanged), including for
//      legacy payloads without a reference.
//   3. M-006 statically: the dialog forwards original.http.credentialRef into the
//      constructed connection and the early-exit comparison does not consult it. Running
//      the live Solid dialog needs the app's happy-dom harness; that boundary is recorded
//      honestly in docs/build-and-verify.md (targeted probe + reasoning, not an E2E run).
//
// Usage:
//   bun run scripts/verify-credential-ref.ts
// (effect is resolved through the vendored app's own dependency graph via createRequire —
// the isolated linker means scripts/ cannot import it directly. Exit 0 = PASS.)

import { createRequire } from "node:module"
import { Persistence } from "../vendor/upstream/packages/app/src/runtime/persistence/schema"
import { serverState } from "../vendor/upstream/packages/app/src/runtime/server/persistence"

// Same effect@4.0.1 as the vendored closure (resolved from packages/app's dependency set).
const vendoredRequire = createRequire(new URL("../vendor/upstream/packages/app/package.json", import.meta.url))
const { Schema } = vendoredRequire("effect") as typeof import("effect")

const initial = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {} }

function fail(message: string): never {
  console.error(`verify-credential-ref: FAIL: ${message}`)
  process.exit(1)
}

const schema = Persistence.withInitial(serverState(), initial)

// 1. Round-trip keeps the reference and strips the password.
const input = {
  list: [
    {
      type: "http",
      displayName: "probe",
      http: { url: "https://probe.example.invalid:4096", password: "definitely-a-secret", credentialRef: "mobile-credential:probe-entry-1" },
    },
    { type: "http", http: { url: "https://legacy.example.invalid" } },
  ],
  hidden: {},
  projects: {},
  lastProject: {},
  recentlyClosed: {},
}

const decoded = Schema.decodeUnknownSync(schema)(input)
const first = decoded.list[0] as { http: { url: string; credentialRef?: string; password?: string } }
const second = decoded.list[1] as { http: { url: string; credentialRef?: string } }

if (first.http.credentialRef !== "mobile-credential:probe-entry-1") {
  fail(`credentialRef did not survive decode: ${JSON.stringify(first)}`)
}
if (second.http.credentialRef !== undefined) {
  fail("missing reference did not decode as absent")
}

const encoded = Schema.encodeSync(schema)(decoded)
const encodedFirst = encoded.list[0] as { http: { credentialRef?: string; password?: string } }
if (encodedFirst.http.credentialRef !== "mobile-credential:probe-entry-1") {
  fail(`credentialRef did not survive the encode half (add/replace persistence round-trip)`)
}
if ("password" in (encodedFirst.http ?? {}) && encodedFirst.http.password !== undefined) {
  fail("password survived encode — M-002 regression")
}
const blob = JSON.stringify(encoded)
if (/definitely-a-secret/.test(blob)) fail("password value leaked into the encoded payload")
if (!/mobile-credential:probe-entry-1/.test(blob)) fail("reference lost from the encoded payload")

// 2. A legacy payload (no reference) decodes and re-encodes unchanged in shape.
const legacy = Schema.decodeUnknownSync(schema)({
  list: [{ url: "https://old.example.invalid", password: "legacy-secret" }],
  hidden: {},
  projects: {},
  lastProject: {},
  recentlyClosed: {},
})
const legacyEncoded = JSON.stringify(Schema.encodeSync(schema)(legacy))
if (/legacy-secret/.test(legacyEncoded)) fail("legacy password survived encode")
if (!/old\.example\.invalid/.test(legacyEncoded)) fail("legacy url lost")

// 3. Static M-006 check: the dialog forwards the reference on add/replace and the
//    early-exit comparison does not consult it.
const dialogSource = new URL("../vendor/upstream/packages/app/src/servers/connect/dialog.tsx", import.meta.url)
const dialog = await Bun.file(dialogSource).text()
const constructsHttp = /const connection: ServerConnection\.Http = \{[\s\S]*?http: \{[\s\S]*?\}/.exec(dialog)
if (!constructsHttp) fail("dialog connection construction block not found")
if (!/credentialRef:\s*original\?\.http\.credentialRef/.test(constructsHttp[0]!)) {
  fail("M-006: dialog does not forward original.http.credentialRef into the constructed connection")
}
const earlyExit = /Nothing changed[\s\S]*?\}\s*\[\s*\]\s*\)?/.exec(dialog) ?? /normalized === original\.http\.url &&[\s\S]*?password === original\.http\.password/.exec(dialog)
if (!earlyExit) fail("dialog early-exit comparison not found")
if (/credentialRef/.test(earlyExit[0]!)) {
  fail("M-006: the early-exit comparison consults credentialRef (must not)")
}

console.log("verify-credential-ref: PASS (schema round-trip keeps credentialRef, strips password; M-006 forwards the reference and keeps it out of the early-exit comparison)")
