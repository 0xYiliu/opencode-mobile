// verify-credential-vault.ts — issue #4 probe (plan §3 S8; docs/build-and-verify.md V-vault).
//
// Asserts, against the REAL first-party vault modules and the REAL vendored sources:
//   1. Truth table v3, all 12 rows, through evaluateRemember — including row 2/12 wording
//      semantics ("needs-password"), the edit-only row 8 keep, the add-prior resolution that
//      is NOT method-gated, the early-exit forcing flag and the initial checkbox value.
//   2. Every row's VAULT side effect through the in-process engine running REAL envelope
//      crypto (WebCrypto AES-GCM + AAD): put mints/updates exactly one encrypted entry,
//      clear removes it, abort/none/passthrough leave the store untouched.
//   3. connection-credential-hydration static: the hydration injection in the vendored registry writes the resolved
//      password through setStore ONLY (memory-only; the connection-password-memory-only encode path strips on every
//      persist write) — no direct storage write in the injection block.
//   4. vault-androidx-listener static: AndroidX vault listener is wired before render; native callback requires
//      exact source origin + main frame and uses a bounded process-wide serial queue.
//
// Usage: bun run scripts/verify-credential-vault.ts  (exit 0 = PASS)

import { createInProcessVaultEngine } from "../packages/mobile-hosts/src/vault/transport"
import type { InProcessVaultHandlers } from "../packages/mobile-hosts/src/vault/transport"
import { MAX_SECRET_BYTES, VaultError, formatVaultRef, type VaultEntryMetadata } from "../packages/mobile-hosts/src/vault/types"
import { generateEnvelopeKey, openEnvelope, sealEnvelope } from "../packages/mobile-hosts/src/vault/envelope"
import { createVaultClient } from "../packages/mobile-hosts/src/vault/vault"
import { evaluateRemember, initialRemember } from "../packages/mobile-hosts/src/vault/remember"
import { createWebMessageChannelTransport } from "../packages/mobile-hosts/src/vault/transport"
import { VAULT_BRIDGE } from "../packages/mobile-hosts/src/vault/transport"

function fail(message: string): never {
  console.error(`verify-credential-vault: FAIL: ${message}`)
  process.exit(1)
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// ---------------------------------------------------------------------------
// Software mirror of the native vault side (same shape as the unit tests): envelope-
// encrypted map + metadata index, reached over the exact bridge protocol.
// ---------------------------------------------------------------------------
async function softwareVaultNative() {
  const key = await generateEnvelopeKey()
  const entries = new Map<string, { envelope: Uint8Array; meta: VaultEntryMetadata }>()
  const handlers: InProcessVaultHandlers = {
    handle: async (op, params) => {
      if (op === "put") {
        const kind = params["kind"]
        const value = params["value"]
        const existingId = params["existingId"]
        const candidateId = params["candidateId"]
        if (kind !== "password" && kind !== "privateKey") throw new VaultError("io", "unknown kind")
        if (typeof value !== "string" || value.length === 0) throw new VaultError("io", "empty value (native re-check)")
        if (encoder.encode(value).length > MAX_SECRET_BYTES) throw new VaultError("io", "value too large (native re-check)")
        const id = typeof existingId === "string" ? existingId
          : typeof candidateId === "string" ? candidateId : crypto.randomUUID()
        const envelope = await sealEnvelope(key, id, encoder.encode(value))
        const meta: VaultEntryMetadata = { id, kind, createdAt: "2026-10-24T00:00:00.000Z" }
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
        return decoder.decode(await openEnvelope(key, String(params["id"]), entry.envelope))
      }
      if (op === "list") {
        return [...entries.values()].map((e) => ({ ...e.meta }))
      }
      throw new VaultError("io", `unknown op: ${String(op)}`)
    },
  }
  return { engine: createInProcessVaultEngine(handlers), entries }
}

// ---------------------------------------------------------------------------
// 1 + 2: truth table rows and their vault effects.
// ---------------------------------------------------------------------------
{
  const { engine, entries } = await softwareVaultNative()
  const vault = createVaultClient(engine.client)
  engine.native.connect()
  await drain()
  if (!engine.native.acked()) fail("engine: the client ack never reached the native side")
  if (vault.status() !== "available") fail("engine: vault not available after handshake + ack")

  type Row = {
    n: number
    mode: "add" | "edit"
    checkboxRendered: boolean
    remember: boolean
    valueEmpty: boolean
    priorRef: string | undefined
    action: string
    // value to have planted in the store before the row (password text), or undefined
    plantPrior?: boolean
    expectEntries: number
    // host-dialog assembly: the kind of the entry bound to priorRef, when known
    boundKind?: "password" | "privateKey"
  }
  // expectEntries is the CUMULATIVE store size after the row (rows share one store, like
  // one device): 1 put / row1 -> 1; rows 3,7,8 plant priors (+1 each); rows 4,9,10 clear.
  const rows: Row[] = [
    { n: 1, mode: "add", checkboxRendered: true, remember: true, valueEmpty: false, priorRef: undefined, action: "put", expectEntries: 1 },
    { n: 2, mode: "add", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: undefined, action: "abort", expectEntries: 1 },
    { n: 3, mode: "add", checkboxRendered: true, remember: true, valueEmpty: false, priorRef: "mobile-credential:row3", action: "put", plantPrior: true, expectEntries: 2 },
    { n: 4, mode: "add", checkboxRendered: true, remember: false, valueEmpty: false, priorRef: "mobile-credential:row4", action: "clear", plantPrior: true, expectEntries: 2 },
    { n: 5, mode: "add", checkboxRendered: true, remember: false, valueEmpty: false, priorRef: undefined, action: "none", expectEntries: 2 },
    { n: 6, mode: "add", checkboxRendered: false, remember: false, valueEmpty: true, priorRef: "mobile-credential:row6", action: "passthrough", expectEntries: 2 },
    { n: 7, mode: "edit", checkboxRendered: true, remember: true, valueEmpty: false, priorRef: "mobile-credential:row7", action: "put", plantPrior: true, expectEntries: 3 },
    { n: 8, mode: "edit", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: "mobile-credential:row8", action: "passthrough", plantPrior: true, expectEntries: 4 },
    { n: 9, mode: "edit", checkboxRendered: true, remember: false, valueEmpty: false, priorRef: "mobile-credential:row9", action: "clear", plantPrior: true, expectEntries: 4 },
    { n: 10, mode: "edit", checkboxRendered: true, remember: false, valueEmpty: true, priorRef: "mobile-credential:row10", action: "clear", plantPrior: true, expectEntries: 4 },
    { n: 11, mode: "edit", checkboxRendered: false, remember: false, valueEmpty: true, priorRef: "mobile-credential:row11", action: "passthrough", expectEntries: 4 },
    { n: 12, mode: "add", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: "mobile-credential:row12", action: "abort", expectEntries: 4 },
    // Row 13 (issue #4 review fix, host-dialog assembly): a PRIVATE KEY imported on add with
    // nothing typed keeps its binding instead of aborting — aborting the save would strand
    // the imported entry as an orphan. add and edit are the same decision here.
    { n: 13, mode: "add", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: "mobile-credential:row13", action: "passthrough", plantPrior: true, expectEntries: 5, boundKind: "privateKey" },
    { n: 14, mode: "edit", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: "mobile-credential:row13", action: "passthrough", expectEntries: 5, boundKind: "privateKey" },
    // Row 12 stays abort for password-kind priors (boundKind reported by the assembly).
    { n: 15, mode: "add", checkboxRendered: true, remember: true, valueEmpty: true, priorRef: "mobile-credential:row12", action: "abort", expectEntries: 5, boundKind: "password" },
  ]

  const planted = new Set<string>()
  for (const row of rows) {
    // Plant the prior entry so put-in-place/clear/passthrough operate on something real.
    if (row.priorRef && row.plantPrior && !planted.has(row.priorRef)) {
      await vault.put({ kind: "password", value: `prior-of-row-${row.n}`, existingRef: row.priorRef })
      planted.add(row.priorRef)
    }
    const decision = evaluateRemember({
      mode: row.mode,
      checkboxRendered: row.checkboxRendered,
      remember: row.remember,
      valueEmpty: row.valueEmpty,
      priorRef: row.priorRef,
      ...(row.boundKind !== undefined ? { boundKind: row.boundKind } : {}),
    })
    if (decision.action !== row.action) fail(`row ${row.n}: decision ${decision.action} != expected ${row.action}`)

    // Translate the decision into vault ops exactly like the connection-remember-credential/M-host-dialog glue does.
    if (decision.action === "put") {
      const ref = await vault.put({ kind: "password", value: `row-${row.n}-value`, ...(decision.existingRef !== undefined ? { existingRef: decision.existingRef } : {}) })
      if (row.priorRef && decision.existingRef === row.priorRef && ref !== row.priorRef) {
        fail(`row ${row.n}: in-place put must keep the reference stable`)
      }
      if ((await vault.get(ref)) !== `row-${row.n}-value`) fail(`row ${row.n}: put did not round-trip the value`)
    } else if (decision.action === "clear") {
      if (decision.ref !== row.priorRef) fail(`row ${row.n}: clear targets the wrong ref`)
      await vault.remove(decision.ref)
    } else if (decision.action === "passthrough") {
      if (row.priorRef && decision.ref !== row.priorRef) fail(`row ${row.n}: passthrough dropped the prior ref`)
      // zero vault ops by contract
    } else if (decision.action === "abort") {
      if (decision.reason !== "needs-password") fail(`row ${row.n}: abort reason must be needs-password`)
      // zero vault ops by contract
    }
    if (entries.size !== row.expectEntries) {
      fail(`row ${row.n}: store holds ${entries.size} entries, expected ${row.expectEntries}`)
    }
  }

  // Early-exit forcing (plan review note 1 + 3): a rendered checkbox flipped against the
  // prior blocks the nothing-changed exit; matching states and unrendered checkboxes do not.
  const forced = [
    evaluateRemember({ mode: "add", checkboxRendered: true, remember: true, valueEmpty: false, priorRef: undefined }),
    evaluateRemember({ mode: "edit", checkboxRendered: true, remember: false, valueEmpty: false, priorRef: "mobile-credential:f" }),
  ]
  if (forced.some((d) => !d.forcesSave)) fail("early-exit forcing: flipped checkbox states must force the save")
  const unforced = [
    evaluateRemember({ mode: "edit", checkboxRendered: true, remember: true, valueEmpty: false, priorRef: "mobile-credential:f" }),
    evaluateRemember({ mode: "edit", checkboxRendered: true, remember: false, valueEmpty: false, priorRef: undefined }),
    evaluateRemember({ mode: "edit", checkboxRendered: false, remember: false, valueEmpty: false, priorRef: "mobile-credential:f" }),
  ]
  if (unforced.some((d) => d.forcesSave)) fail("early-exit forcing: matching/unrendered states must not force the save")

  // Initial checkbox value.
  if (initialRemember("mobile-credential:i") !== true || initialRemember(undefined) !== false) {
    fail("initial checkbox value must be Boolean(priorRef)")
  }
}

// ---------------------------------------------------------------------------
// 3: connection-credential-hydration static probe — hydration injection is setStore-only and gated correctly.
// ---------------------------------------------------------------------------
{
  const source = await Bun.file(new URL("../vendor/upstream/packages/app/src/runtime/server/registry.tsx", import.meta.url)).text()
  const injection = /mobile\(M-010\)[\s\S]*?const vault = \(\(\) => \{[\s\S]*?\}\)\(\)[\s\S]*?if \(vault\) \{[\s\S]*?\n    \}\n/.exec(source)
  if (!injection) fail("connection-credential-hydration: hydration injection block not found in registry.tsx")
  const block = injection[0]!
  if (!/conn\.http\.password \|\| !conn\.http\.credentialRef/.test(block)) {
    fail("connection-credential-hydration: injection is not gated on credentialRef present AND password absent")
  }
  if (!/setStore\("list", index, "http", "password", value\)/.test(block)) {
    fail("connection-credential-hydration: the resolved password is not injected through setStore")
  }
  // connection-vault-ready-wait (issue #128): the hydration awaits the feature-detected, bounded vault readiness
  // BEFORE the per-entry loop — the cold-start restore must not race the async native
  // ready roundtrip (get() one microtask early threw unavailable and restored nothing).
  if (!/if \(typeof vault\.ready === "function"\) await vault\.ready\(\)/.test(block)) {
    fail("connection-vault-ready-wait: hydration does not await vault.ready() before the credential loop (issue #128)")
  }
  // Memory-only: the injection block itself must not touch any storage backend directly.
  if (/localStorage|sessionStorage|\.setItem\(/.test(block)) {
    fail("connection-credential-hydration: the injection block writes to a storage backend directly (must be setStore-only)")
  }
  // The connection-password-memory-only strip still anchors the persist path (the injected value cannot survive it).
  const persistence = await Bun.file(new URL("../vendor/upstream/packages/app/src/runtime/server/persistence.ts", import.meta.url)).text()
  if (!persistence.includes("mobile(M-002): password stripped at encode (memory-only)")) {
    fail("connection-password-memory-only marker lost from persistence.ts — the connection-credential-hydration memory-only argument no longer holds")
  }
  if (!/encode: SchemaGetter\.transform/.test(persistence)) {
    fail("connection-password-memory-only encode-side strip missing from persistence.ts")
  }
}

// ---------------------------------------------------------------------------
// 3b: host-dialog assembly (issue #4 review fix) — the add+imported-key path completes.
// ---------------------------------------------------------------------------
{
  const dialog = await Bun.file(new URL("../packages/mobile-hosts/src/ui/host-dialog.tsx", import.meta.url)).text()
  // The save snapshots the bound kind and passes that snapshot into the pure decision.
  if (!/boundKind:\s*boundMeta\(\)\?\.kind/.test(dialog) || !/boundKind:\s*draft\.boundKind/.test(dialog)) {
    fail("host-dialog: save() does not snapshot and pass boundKind to the remember decision")
  }
  // The checkbox participates only when the vault is available (remember.ts semantics).
  if (!/checkboxRendered:\s*vaultAvailable\(\)/.test(dialog)) {
    fail("host-dialog: checkboxRendered must be vaultAvailable(), not an unconditional true")
  }
  // A bound key starts protected; after an explicit uncheck, the user can re-check and
  // stage a replacement password into a fresh vault entry (the old ref is retained orphaned).
  if (!/boundMeta\(\)\?\.kind === "privateKey" && !replaceBoundKey\(\)/.test(dialog)
    || !/if \(!checked && boundMeta\(\)\?\.kind === "privateKey"\) setReplaceBoundKey\(true\)/.test(dialog)) {
    fail("host-dialog: key-bound password replacement is not gated by explicit uncheck/re-check")
  }
  console.log("3b OK: host-dialog snapshots boundKind, gates checkbox on vault availability and requires explicit toggle before replacing a key")
}

// ---------------------------------------------------------------------------
// 4: app-mobile-hosts-bootstrap amendment — AndroidX listener wiring + legacy transport test coverage.
// ---------------------------------------------------------------------------
{
  const entry = await Bun.file(new URL("../vendor/upstream/packages/app/src/entry.tsx", import.meta.url)).text()
  for (const marker of [
    "createAndroidXVaultTransport",
    "opencodeMobileVaultV2",
    "createVaultClient",
    "createVaultResolver",
    "vault,",
  ]) {
    if (!entry.includes(marker)) fail(`app-mobile-hosts-bootstrap amendment: entry.tsx is missing ${marker}`)
  }
  // The listener client must be initialized before render, and no old window-message
  // handshake is present in production wiring.
  const subscribeAt = entry.indexOf("createAndroidXVaultTransport")
  const renderAt = entry.lastIndexOf("render(")
  if (subscribeAt === -1 || renderAt === -1 || subscribeAt > renderAt) {
    fail("app-mobile-hosts-bootstrap amendment: AndroidX listener client is not initialized before first render")
  }
  if (stripComments(entry).includes("createWebMessageChannelTransport"))
    fail("app-mobile-hosts-bootstrap amendment: production vault still uses bespoke channel transport")
  const nativeBridge = await Bun.file(new URL("../android/app/src/main/java/ai/opencode/mobile/vault/CredentialVaultBridge.kt", import.meta.url)).text()
  for (const marker of ["WebViewCompat.addWebMessageListener", "VaultOriginPolicy.shouldAcceptMessage", "VaultOriginPolicy.canRegister", "ArrayBlockingQueue(8)", "preflight(raw)", "candidateId", "recoveryRef", "replyProxy.postMessage", "VaultGenerationGate", "onNavigationStarted", '"unknown"']) {
    if (!nativeBridge.includes(marker)) fail(`vault-androidx-listener native vault boundary missing ${marker}`)
  }
  const limits = await Bun.file(new URL("../android/app/src/main/java/ai/opencode/mobile/vault/VaultRequestLimits.kt", import.meta.url)).text()
  if (!limits.includes("MAX_VALUE_BYTES * 6 + 8192") || !limits.includes("leadingRequestId") || !limits.includes("utf8Bytes"))
    fail("vault-androidx-listener vault request cap must account for JSON escaping and independently enforce UTF-8 value bytes")
  const store = await Bun.file(new URL("../android/app/src/main/java/ai/opencode/mobile/vault/VaultStore.kt", import.meta.url)).text()
  if (!store.includes('File(dir, "$id.bin")') || !store.includes('File(dir, "index.json")')
    || store.includes("VaultEntryJournal") || store.includes("payloadFile"))
    fail("vault-androidx-listener vault storage format must remain the legacy id.bin + metadata index layout")
  const nativePolicy = await Bun.file(new URL("../android/app/src/main/java/ai/opencode/mobile/vault/VaultOriginPolicy.kt", import.meta.url)).text()
  if (!nativePolicy.includes('scheme == "http"') || !nativePolicy.includes("BuildConfig.WEB_ASSET_PORT"))
    fail("vault-androidx-listener native vault origin policy is not exact HTTP loopback + configured port")
  const directDialog = await Bun.file(new URL("../vendor/upstream/packages/app/src/servers/connect/dialog.tsx", import.meta.url)).text()
  if (!directDialog.includes("connection.http.credentialRef = await vault!.put")
    || !directDialog.includes('language.t("dialog.server.remember.saveFailed")')
    || !directDialog.includes("await vault!.remove(decision.ref)"))
    fail("vault-androidx-listener direct-server credential caller lost its fail-closed save path")
  const directPutStart = directDialog.indexOf('if (decision.action === "put")')
  const directCommitStart = directDialog.indexOf('if (original?.type === "http")', directPutStart)
  const directMutationBlock = directDialog.slice(directPutStart, directCommitStart)
  if ((directDialog.match(/vault!\.put\(/g) ?? []).length !== 1
    || (directDialog.match(/vault!\.remove\(/g) ?? []).length !== 1
    || !directMutationBlock.includes("catch (error)")
    || !directMutationBlock.includes("recoveryRef")
    || !directMutationBlock.includes("return"))
    fail("vault-androidx-listener direct-server caller retries or commits a credential change after UNKNOWN")
  const runtime = await Bun.file(new URL("../packages/mobile-hosts/src/runtime.ts", import.meta.url)).text()
  const removeStart = runtime.indexOf("const remove = async (id: string)")
  const registryDelete = runtime.indexOf("registry.remove(id)", removeStart)
  const removeEnd = runtime.indexOf("const markIncompatible", removeStart)
  const removeBody = runtime.slice(removeStart, removeEnd)
  if (removeStart < 0 || registryDelete < removeStart
    || removeBody.includes("vault.remove(")
    || !removeBody.includes('send(id, { type: "delete" })'))
    fail("vault-androidx-listener SSH host removal must be local-only and retain saved credentials for explicit cleanup")

  // Legacy test harness compatibility only: production uses AndroidX protocol v2 and does
  // not register this handshake; these checks retain the old in-process envelope test engine.
  let handler: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  const received: string[] = []
  const port = {
    received,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage(message: string) {
      received.push(message)
    },
    close() {},
  }
  const transport = createWebMessageChannelTransport({
    subscribe(handler_) {
      handler = handler_
      return () => {
        handler = undefined
      }
    },
  })
  handler!({ data: VAULT_BRIDGE.handshake, ports: [port] })
  await drain()
  if (transport.status() !== "available") fail("legacy harness: well-shaped handshake did not capture")
  if (!JSON.parse(received[0] ?? "{}").op) fail("legacy harness: no ack posted over the port")
  // Malformed handshakes are ignored (shape validation is the only gate).
  const transport2 = createWebMessageChannelTransport({
    subscribe(handler_) {
      handler = handler_
      return () => {
        handler = undefined
      }
    },
  })
  handler!({ data: VAULT_BRIDGE.handshake, ports: [] })
  handler!({ data: "unrelated", ports: [port] })
  handler!({ data: VAULT_BRIDGE.handshake, ports: [{}, {}] })
  if (transport2.status() !== "unavailable") fail("app-mobile-hosts-bootstrap dynamic: malformed handshake captured (shape gate broken)")
}

// ---------------------------------------------------------------------------
// 5: no-origin rule across the whole first-party vault surface (evidence-chain guard).
// The no-origin rule binds CODE: documentation comments legitimately cite the evidence
// chain (event.origin is empty by platform construction), so comments are stripped first.
// ---------------------------------------------------------------------------
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
}

for (const file of ["vault/transport.ts", "vault/vault.ts", "vault/types.ts", "vault/envelope.ts", "vault/remember.ts"]) {
  const src = stripComments(await Bun.file(new URL(`../packages/mobile-hosts/src/${file}`, import.meta.url)).text())
  if (/event\.origin|\.origin\b/.test(src)) {
    fail(`${file} consults origin in code — forbidden (platform carries an empty origin)`)
  }
}

const distMarker = VAULT_BRIDGE.marker
if (!distMarker.startsWith("mobile(vault-v2)")) fail("vault protocol v2 marker missing from the transport module")

console.log(
  "verify-credential-vault: PASS (truth table v3 rows 1-12 + review-fix row 13 with in-process envelope-crypted vault effects; early-exit forcing + initial value; host-dialog assembly passes boundKind; connection-credential-hydration setStore-only hydration injection; vault-androidx-listener AndroidX origin/frame gate + bounded preflight + non-secret candidate refs for uncertain mutations; legacy channel harness remains test-only)",
)
