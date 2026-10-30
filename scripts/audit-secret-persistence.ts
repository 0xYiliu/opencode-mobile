// audit-secret-persistence.ts — V-secret plaintext persistence audit (issue #4, decision D8).
//
// Mechanical audit that NO credential value can reach a plaintext persistence backend,
// never silently downgrades, and that the vault's own metadata stays value-free:
//   A. Write-path inventory: every storage write in the vendored app flows through the
//      whitelisted persistence machinery (src/runtime/persistence/storage.ts); the
//      first-party registry writes exactly its whitelist key.
//   B. Key inventory: the registered set of storage keys (global server state, its legacy
//      import key, window storage prefix, draft keys, the SSH host registry) — any change
//      must be reviewed before the audit passes again.
//   C. Per-key secret-shape assertion: the persisted server payload's encode path strips
//      password (M-002) — schema round-trip against effect@4.0.1, including the legacy
//      payload path which is DECODED but never re-encoded with the secret.
//   D. Extension connections carry no secret field (upstream ServerEntry shape + the
//      first-party extension mirror).
//   E. Draft boundary: the draft-persisted keys are user content only (registered list).
//   F. Dist markers: the built bundle carries mobile(M-002) AND mobile(vault-v1) (rebuild
//      with `bun run build:web` if dist/ is missing — the audit is a post-build gate).
//   G. Vault metadata is value-free: the client rejects value-shaped metadata and the
//      metadata type carries no value field.
//
// Disposition rule (AGENTS.md): any finding is either fixed by stripping the offending
// write (a vendored patch) or explicitly BLOCKED-registered in docs/build-and-verify.md —
// a silent plaintext downgrade is never acceptable. Exit 0 = PASS.

import { createRequire } from "node:module"
import { Persistence } from "../vendor/upstream/packages/app/src/runtime/persistence/schema"
import { serverState } from "../vendor/upstream/packages/app/src/runtime/server/persistence"

const ROOT = new URL("..", import.meta.url)
const APP_SRC = "vendor/upstream/packages/app/src"
const HOSTS_SRC = "packages/mobile-hosts/src"

function fail(message: string): never {
  console.error(`audit-secret-persistence: FAIL: ${message}`)
  console.error("audit-secret-persistence: disposition = strip the offending write via a vendored patch, or BLOCKED-register it in docs/build-and-verify.md; a silent plaintext downgrade is never acceptable.")
  process.exit(1)
}

async function read(rel: string): Promise<string> {
  return Bun.file(new URL(rel, ROOT)).text()
}

// ---------------------------------------------------------------------------
// A. Write-path inventory.
// ---------------------------------------------------------------------------
{
  // Every `localStorage.setItem` / `sessionStorage.setItem` in the vendored app must live
  // in the persistence machinery or one of the REGISTERED non-secret UI writers below
  // (key + content are asserted). Any new writer is a finding until registered here.
  const proc = Bun.spawnSync(
    ["grep", "-rln", "--include=*.ts", "--include=*.tsx", "--include=*.js", "-e", "localStorage.setItem", "-e", "sessionStorage.setItem", `${APP_SRC}/`, "vendor/upstream/packages/app/public/"],
    { cwd: ROOT.pathname },
  )
  const writers = proc.stdout
    .toString()
    .split("\n")
    .filter(Boolean)
    // Test files and Playwright e2e specs are not shipped.
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx") && !f.includes("/e2e/"))
  const registered: Record<string, (src: string) => void> = {
    [`${APP_SRC}/runtime/persistence/storage.ts`]: (src) => {
      // The machinery routes every write through the schema encode path (M-002 strip).
      if (!src.includes("mobile(M-002): password stripped at encode (memory-only)")) {
        fail("persistence machinery lost the M-002 strip marker")
      }
    },
    [`${APP_SRC}/runtime/platform/pwa.ts`]: (src) => {
      if (!src.includes('const LAST_ROUTE_KEY = "opencode.pwa.last-route"')) {
        fail("pwa.ts writes an unexpected key — re-register this writer with its key")
      }
    },
    [`${APP_SRC}/shell/notifications/coordinator.ts`]: (src) => {
      if (!src.includes("`opencode:notification-${kind}`")) {
        fail("notifications coordinator writes an unexpected key — re-register this writer with its key")
      }
    },
    // Issue #67 sweep finding (writer shipped by M-035, issue #65): the web zoom face persists
    // the six-level UI zoom as a number under a fixed non-secret key.
    [`${APP_SRC}/runtime/platform/web.ts`]: (src) => {
      if (!src.includes("const UI_ZOOM_KEY = \"opencode-ui-zoom-level\"")) {
        fail("platform web.ts writes an unexpected zoom key — re-register this writer with its key")
      }
    },
  }
  for (const file of writers) {
    const check = registered[file]
    if (!check) fail(`direct localStorage/sessionStorage writer outside the registered set: ${file}`)
    check(await read(file.replace(/^vendor\/upstream\/packages\/app\/public\//, "vendor/upstream/packages/app/public/")))
  }
  // The raw localStorage handle may only be handed to the persistence machinery's write()
  // (the encode/strip path); no other module touches it directly.
  const procHandle = Bun.spawnSync(
    ["grep", "-rln", "--include=*.ts", "--include=*.tsx", "--include=*.js", "-e", "write(localStorage", "-e", "localStorage.getItem", `${APP_SRC}/`, "vendor/upstream/packages/app/public/"],
    { cwd: ROOT.pathname },
  )
  const handleUsers = procHandle.stdout
    .toString()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx") && !f.includes("/e2e/"))
  const registeredReaders: Record<string, true> = {
    [`${APP_SRC}/runtime/persistence/storage.ts`]: true, // machinery: write(localStorage) + reads
    [`${APP_SRC}/runtime/platform/pwa.ts`]: true, // registered writer (route key)
    [`${APP_SRC}/runtime/i18n/language.tsx`]: true, // reads opencode.global.dat:language (locale, non-secret)
    [`${APP_SRC}/shell/notifications/coordinator.ts`]: true, // registered writer (claim ids)
    [`${APP_SRC}/shell/notifications/coordinator.tsx`]: true,
    // Issue #67: the closed-tabs drag-in reads two DEV-only debug modifiers (no writes).
    [`${APP_SRC}/runtime/plugin/closed-tabs.ts`]: true,
    // M-035's web zoom face reads its persisted level back (write registered above).
    [`${APP_SRC}/runtime/platform/web.ts`]: true,
    // public/oc-theme-preload.js reads theme keys only (no setItem — asserted by the writers list above).
    ["vendor/upstream/packages/app/public/oc-theme-preload.js"]: true,
  }
  for (const file of handleUsers) {
    if (!registeredReaders[file]) fail(`raw localStorage handle used outside the registered set: ${file}`)
  }

  // The first-party registry persists exactly its whitelist key through StoragePort.
  const hostsStorage = await read(`${HOSTS_SRC}/storage.ts`)
  if (!hostsStorage.includes('export const HOSTS_STORAGE_KEY = "opencode-mobile.hosts.v1"')) {
    fail("the SSH host registry storage key changed — re-register the key inventory (B)")
  }
  if (!/saveHosts[\s\S]*storage\.setItem\(HOSTS_STORAGE_KEY/.test(hostsStorage)) {
    fail("saveHosts no longer writes through the StoragePort with the whitelist key")
  }
  // The machinery identity check: storage.ts funnels the raw handle through write() and the
  // M-002 strip marker anchors the encode path.
  const machinery = await read(`${APP_SRC}/runtime/persistence/storage.ts`)
  if (!machinery.includes("function write(storage: Storage")) {
    fail("the persistence machinery write() funnel drifted")
  }
  // The vault module never touches DOM storage (checked here so the audit covers the whole
  // credential surface in one gate; section G re-asserts it on the client half).
  const procVault = Bun.spawnSync(["grep", "-rln", "-e", "localStorage", "-e", "sessionStorage", `${HOSTS_SRC}/vault/`], { cwd: ROOT.pathname })
  if (procVault.stdout.toString().trim() !== "") fail("a vault module touches DOM storage")
  console.log("A OK: storage writes flow through the whitelisted machinery + 2 registered non-secret UI writers; vault modules never touch DOM storage")
}

// ---------------------------------------------------------------------------
// B. Key inventory (registered; a diff here must be reviewed by a human).
// ---------------------------------------------------------------------------
{
  const storage = await read(`${APP_SRC}/runtime/persistence/storage.ts`)
  const globalStorage = /const GLOBAL_STORAGE = "([^"]+)"/.exec(storage)?.[1]
  const localPrefix = /const LOCAL_PREFIX = "([^"]+)"/.exec(storage)?.[1]
  const draftKeys = /const DRAFT_PERSISTED_KEYS = \[([^\]]+)\]/.exec(storage)?.[1]
  if (globalStorage !== "opencode.global.dat") fail(`GLOBAL_STORAGE drifted: ${String(globalStorage)}`)
  if (localPrefix !== "opencode.") fail(`LOCAL_PREFIX drifted: ${String(localPrefix)}`)
  const registered = {
    // Persist.global("server") -> "<global storage>:server" via the prefixed view; legacy
    // import key "server.v3" via the direct view; drafts are user content (see E).
    serverKey: `${globalStorage}:server`,
    legacyServerKey: "server.v3",
    hostsKey: "opencode-mobile.hosts.v1",
  }
  const registry = await read(`${APP_SRC}/runtime/server/registry.tsx`)
  if (!registry.includes('previousKey: "server.v3"')) fail("legacy server import key drifted")
  if (!registry.includes('Persist.global("server")')) fail("server persist target drifted")
  console.log(`B OK: key inventory intact (server=${registered.serverKey}, legacy=${registered.legacyServerKey}, hosts=${registered.hostsKey}, drafts=${(draftKeys ?? "").replace(/\s/g, " ")})`)
  if (globalStorage === undefined || draftKeys === undefined) fail("key inventory constants not found in storage.ts")
}

// ---------------------------------------------------------------------------
// C. Per-key secret-shape assertion: encode strips, decode tolerates (legacy path only).
// ---------------------------------------------------------------------------
{
  const vendoredRequire = createRequire(new URL("../vendor/upstream/packages/app/package.json", import.meta.url))
  const { Schema } = vendoredRequire("effect") as typeof import("effect")

  const initial = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {} }
  const schema = Persistence.withInitial(serverState(), initial)
  const input = {
    list: [
      {
        type: "http",
        displayName: "audit-probe",
        http: { url: "https://audit.example.invalid:4096", password: "audit-synthetic-secret-value", credentialRef: "mobile-credential:audit-entry-1" },
      },
    ],
    hidden: {},
    projects: {},
    lastProject: {},
    recentlyClosed: {},
  }
  const decoded = Schema.decodeUnknownSync(schema)(input)
  const encoded = JSON.stringify(Schema.encodeSync(schema)(decoded))
  if (encoded.includes("audit-synthetic-secret-value")) fail("M-002 regression: password survived the encode path into the persisted payload")
  if (!encoded.includes("mobile-credential:audit-entry-1")) fail("credentialRef lost from the encoded payload (M-005 regression)")
  // Legacy tolerance: a stored password DECODES (so an old client keeps working) and is
  // stripped again on encode — the legacy path never becomes a plaintext writer.
  const legacy = Schema.decodeUnknownSync(schema)({
    list: [{ url: "https://legacy.example.invalid", password: "legacy-synthetic-secret" }],
    hidden: {},
    projects: {},
    lastProject: {},
    recentlyClosed: {},
  })
  const legacyEncoded = JSON.stringify(Schema.encodeSync(schema)(legacy))
  if (legacyEncoded.includes("legacy-synthetic-secret")) fail("legacy payload re-encoded with its password intact")
  console.log("C OK: encode strips password (M-002), legacy payloads decode-tolerate and never re-encode secrets")
}

// ---------------------------------------------------------------------------
// D. Extension connections carry no secret field.
// ---------------------------------------------------------------------------
{
  // Issue #67: ServerEntry moved from the gui-extensions sdk into the plugin gui host library.
  const sdk = await read("vendor/upstream/packages/plugin/src/gui/registries.ts")
  const entryBlock = /export interface ServerEntry \{[\s\S]*?\n\}/.exec(sdk)?.[0]
  if (!entryBlock) fail("ServerEntry shape not found in plugin/src/gui registries")
  // The http block of a provided extension connection carries url/username/password by
  // upstream contract — that password is handed over BY THE HOST for the current session
  // (memory-only) and is never persisted by this app (C proves the persisted payload is
  // clean). What must NOT exist: credential-shaped fields OUTSIDE that http block.
  const outsideHttp = entryBlock!.replace(/http\?:\s*\{[\s\S]*?\n\s*\}/, "")
  if (/\b(secret|token|apiKey|api_key|privateKey|private_key)\b/i.test(outsideHttp)) {
    fail("ServerEntry gained a credential-shaped field outside http — re-review the extension contract")
  }
  const mirror = await read(`${HOSTS_SRC}/upstream-map.ts`)
  const mirrorBlock = /export interface ExtensionConnection \{[\s\S]*?\n\}/.exec(mirror)?.[0]
  if (!mirrorBlock) fail("first-party ExtensionConnection mirror not found")
  if (/\b(secret|token|apiKey|api_key|privateKey|private_key)\b/i.test(mirrorBlock!)) {
    fail("first-party extension mirror gained a credential-shaped field")
  }
  console.log("D OK: extension connection shapes carry no credential field beyond the session-scoped http.password contract")
}

// ---------------------------------------------------------------------------
// E. Draft boundary: drafts persist USER CONTENT only (registered list).
// ---------------------------------------------------------------------------
{
  const storage = await read(`${APP_SRC}/runtime/persistence/storage.ts`)
  const draftKeys = /const DRAFT_PERSISTED_KEYS = \[([^\]]+)\]/.exec(storage)?.[1] ?? ""
  const keys = (draftKeys.match(/"([^"]+)"/g) ?? []).map((k) => k.slice(1, -1))
  const registered = ["prompt", "comments", "file-view", "layout"]
  if (JSON.stringify(keys) !== JSON.stringify(registered)) {
    fail(`draft persisted keys drifted: ${keys.join(", ")} — a new draft key must be reviewed against the secret boundary before this audit passes`)
  }
  console.log("E OK: draft boundary registered (user content keys only: " + keys.join(", ") + ")")
}

// ---------------------------------------------------------------------------
// F. Dist markers: the built bundle carries both markers.
// ---------------------------------------------------------------------------
{
  const distDir = new URL("vendor/upstream/packages/app/dist/_assets/", ROOT)
  const distExists = (await Array.fromAsync(new Bun.Glob("*").scan({ cwd: distDir.pathname }))).length > 0
  if (!distExists) {
    console.warn("audit-secret-persistence: WARN: dist/ missing — run `bun run build:web` for the dist-marker half; source-level checks above still applied")
  } else {
    const proc = Bun.spawnSync(["grep", "-rl", "-e", "mobile(M-002)", "dist/_assets/"], { cwd: new URL("vendor/upstream/packages/app/", ROOT).pathname })
    if (proc.stdout.toString().trim() === "") fail("dist marker mobile(M-002) not found in built assets")
    const proc2 = Bun.spawnSync(["grep", "-rl", "-e", "mobile(vault-v1)", "dist/_assets/"], { cwd: new URL("vendor/upstream/packages/app/", ROOT).pathname })
    if (proc2.stdout.toString().trim() === "") fail("dist marker mobile(vault-v1) not found in built assets")
    console.log("F OK: dist markers mobile(M-002) and mobile(vault-v1) present in built assets")
  }
}

// ---------------------------------------------------------------------------
// G. Vault metadata is value-free (the vault never hands values back through metadata).
// ---------------------------------------------------------------------------
{
  const types = await read(`${HOSTS_SRC}/vault/types.ts`)
  const metaBlock = /export interface VaultEntryMetadata \{[\s\S]*?\n\}/.exec(types)?.[0]
  if (!metaBlock || /\bvalue\b/.test(metaBlock!)) fail("VaultEntryMetadata gained a value-shaped field")
  const client = await read(`${HOSTS_SRC}/vault/vault.ts`)
  if (!client.includes("bridge metadata carried a forbidden value field")) {
    fail("the vault client no longer rejects value-shaped metadata from the bridge")
  }
  console.log("G OK: vault metadata is value-free and the vault client rejects value-shaped bridge responses")
}

console.log("audit-secret-persistence: PASS")
