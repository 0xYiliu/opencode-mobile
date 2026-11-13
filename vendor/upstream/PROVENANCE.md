# Vendor provenance — upstream opencode frontend closure

Machine-readable twin: `provenance.json`. Acquisition/rebuild tool: `scripts/vendor-sync.sh` (build-only closure patches replay before the scoped mobile overlay).
Verification: `scripts/verify-closure.sh` (V3).

Current mobile patch maintenance: [protocol and commands](patches/mobile/README.md).
`vendor-manifest.json#closurePatches` determines the build-only closure replay order;
`vendor-manifest.json#mobilePatches` alone determines mobile overlay replay order. The patch registry
owns IDs, paths, status and hashes; `bun run patches:refresh` generates the registry
mirrors in both machine-readable provenance files. Historical narrative inventories
below are not additional live registries. As of 2026-11-13, the v2.2.7 registry has
80 entries: two active replays — the #184 scoped `v2-2-7-mobile-connection-pairing-ssh-closure` overlay and the inherited main `server-edit-touch-compatibility` patch —,
19 absorbed historical payloads, and 59 deferred historical patches outside #184. The inherited main patch is separate from the #184 overlay scope. The historical identity migration and
source/artifact markers such as `mobile(M-002)` remain preserved; markers are evidence,
not current IDs. Historical ranges below denote replay-order intervals at the stated
revision, never lexical name ordering.
Historical hashes and PASS/FAIL/BLOCKED results retain their original revision/date scope.

## Pin

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/anomalyco/opencode |
| Branch | `dev` (upstream default branch) |
| Pin | `fedc6f208aa2bd54c1019227214568083f6380ad` (fixed Windows Desktop v2.2.7 release target) |
| Pin date | 2026-11-10T07:52:42Z |
| Pin subject | `release: v2.2.7` |
| Local cache | `~/.cache/opencode-upstream` (`clone --filter=blob:none`) |

Acquisition command (whole-repo copy is forbidden by policy; only the closure below is
extracted, upstream is never modified or pushed):

```
scripts/vendor-sync.sh
# git -C ~/.cache/opencode-upstream archive <pin> -- packages/<p>... LICENSE \
#   | tar -x --exclude=packages/ai/test/fixtures/recordings -C vendor/upstream
# + extract registered upstream npm patches (subset) from the same tree
# + apply registered build-only closure patches, then mobile patches (git apply --check first)
```

All 11 closure packages, including `packages/gui-plugins`, extract from the fixed v2.2.7 target.
`packageSources` is therefore empty; `scripts/verify-closure.sh` builds the pristine side of its
equivalence check from the same target, replays the build-only closure patch, and then replays the
two active mobile patches in `vendor-manifest.json#mobilePatches`.

## Closure packages (11)

`app, client, protocol, schema, session-ui, ui, util, gui-plugins, plugin-browser, plugin, ai`

- 5384 files, ~45 MB under `packages/` (git ls-tree count at v2.2.7, excluding registered recordings and including partial icon assets), before install; excludes install/build artifacts.
- Excluded packages: `cli, codemode, console, containers, core, desktop,
  effect-drizzle-sqlite, function, http-recorder, httpapi-codegen, identity, latex,
  merman, plugins, posts, script, sdk, server, simulation, stats, storybook, theme, tui, web`
  — only the Electron-rendered frontend (packages/app) and its transitive workspace closure
  are needed for the static web build; the phone never hosts a local OpenCode service.
- Partial packages (closure correction, correction loop): `packages/desktop/icons/dev`
  (53 files) and `packages/desktop/icons/beta` (53 files) — `packages/app/vite.icons.ts`
  reads `../desktop/icons/<channel>/*` at vite config load to emit favicons and
  webmanifest icons for the PWA, and `packages/app/src/shell/titlebar/titlebar.tsx`
  imports the dev and beta 64x64 icons unconditionally at build time. The desktop
  package itself stays excluded; `OPENCODE_CHANNEL=beta` builds are supported by this
  vendor set while `prod` builds are not (`icons/prod` is not carried).
- File-level exclusion: `packages/ai/test/fixtures/recordings/` (274 files, ~13.7 MiB,
  HTTP recorder test fixtures) — dropped during extraction and registered in the manifest.

## Current mobile patch inventory (2 active, 19 absorbed, 59 deferred; 2026-11-13)

| ID | Target | Change | Why |
| --- | --- | --- | --- |
| `v2-2-7-mobile-connection-pairing-ssh-closure` | v2.2.7 connection/pairing/SSH shared closure | Scoped #184 overlay: connection/pairing, credential/vault/probe/fetch/security, server lifecycle/health/loopback/host API compatibility, and shared SSH state/renderer seams. Provider, settings, session, files, terminal, notifications, generic UI, patchmark and unrelated package behavior are excluded. | One reproducible #184 scoped overlay; its 24-target scope is unchanged. Nineteen historical payloads are explicitly absorbed; 59 remain deferred outside #184. |

| `server-edit-touch-compatibility` | inherited main baseline patch | Rebased from origin/main onto pristine v2.2.7; delays the Android WebView 114 server-row Edit action and remains outside the #184 overlay target list. | Inherited main change, replayed separately after the #184 overlay. |
The 78 historical deferred payload files remain in `patches/mobile/manifest.json` and the generated
registry mirrors with their original payloads, hashes and semantic identities. They are historical
file artifacts, not 78 current deferred patches: 19 are marked `absorbed` when the scoped overlay
explicitly carries their semantics, and the current disposition has **59 deferred patches** outside #184.
Neither class is replayed from the historical files. `scripts/vendor-sync.sh` replays the separate
build-only closure patch first, then only the active mobile array. The following narrative records
their historical introduction and is not a second live registry:

- app-mobile-hosts-alias–settings-mobile-host-manager (issue #3): app vite alias to the first-party package, credentialRef field, dialog
  reference passthrough, entry bootstrap of the host registry, settings mount of the host manager.
- connection-remember-credential/connection-credential-hydration + app-mobile-hosts-bootstrap amendment (issue #4): optional "remember credential" branch over the device
  vault, hydration credential resolution into memory only, vault handshake listener before first render.
- connection-platform-fetch-policy–app-connection-probe-bridge (issue #5): platform fetch injection with the validated-follow redirect policy
  (marker `mobile(M-011)`), upload XHR responseURL validation, probe-classified connect errors in the
  server dialog (`dialog.server.error.<code>`), and the endpoint-probe bridge wiring in the web entry
  (independent `opencode-mobile-probe-handshake` string, protocol-isolated from the vault bridge).
  Rationale and trust design: `docs/decisions/0002-direct-connection-transport.md`.
- app-ssh-bridge (issue #6): the ssh tunnel bridge wiring in the web entry. Its listener subscribes
  synchronously before asynchronous locale loading and requests the existing port channel through a
  strict-origin/main-frame AndroidX bootstrap; the channel retains its `opencode-mobile-ssh-handshake`
  protocol and ack-gated bridge-backed host-key verifier/tunnel transport. Rationale and trust design:
  `docs/decisions/0003-ssh-transport.md`.
- connection-initial-ssh-entry (issue #55, historical and superseded by connection-inline-ssh): originally introduced the mobile
  `/settings?tab=servers` SSH hosts detour and special empty/signed-out guard exception.
  connection-inline-ssh removes the exception and the navigation helper/test; only the historical patch remains
  in the chain to preserve rebase provenance.
- connection-method-layout (issue #55, historical layout layer): centered `No pairing link?` and put password/SSH
  controls on a row. The new three-mode screen from connection-inline-ssh revises that row; its no-wrap intent is
  carried forward in connection-label-nowrap (`connection-label-nowrap.patch`).
- connection-label-nowrap (carried forward from the uncommitted issue-55-layout worktree): preserve the
  single-line mobile method actions with `whitespace-nowrap`; no source was changed in that
  worktree. Registered as `connection-label-nowrap.patch` after connection-method-layout.
- connection-inline-ssh (issue #58): replace the Settings detour with in-place Pairing/address/SSH modes on
  `ConnectServerScreen`, restore the original no-server/signed-out Settings guard, and let
  AppShell retain the initial connection surface while a specifically owned SSH host is
  connecting. The first-party runtime claims ownership before host publication and hands off
  only after tunnel readiness plus authenticated `/api/info` health; unknown/changed host-key
  and service-auth paths reuse existing security components. Registered as
  `connection-inline-ssh.patch`, layered after connection-label-nowrap. The implementation does not alter
  SSH transport or permit auto-connect on restart.
- connection-utf8-basic-auth (issue #58 review): encode upstream Basic-auth username/password as UTF-8 bytes before
  base64, so Unicode service passwords survive both the SSH `/api/info` recheck and subsequent
  upstream API/SSE requests. Existing ASCII behavior is unchanged. The layered patch is
  `connection-utf8-basic-auth.patch`; `api.test.ts` verifies UTF-8 byte vectors and a mapped
  SSH API request, while `client.test.ts` verifies that `transport.update` carries a Unicode
  service password into the subsequent API request.
- vault-androidx-listener (issue #58): replace only the credential vault's bespoke window-message channel
  handshake with the native AndroidX WebKit origin/frame-bound listener and v2 readiness;
  other five bridge protocols remain unchanged. The bridge sends a non-secret candidate id
  before put. Existing `<id>.bin`, metadata index and envelope formats remain unchanged;
  no storage journal, format migration, or automatic retry is introduced. Uncertain put or
  remove outcomes are reported as `UNKNOWN` with a non-secret credential reference.
  Serialized JSON is bounded for worst-case escaping and independently checks UTF-8 secret
  bytes before queueing.
  Registered layered patch `vault-androidx-listener.patch`; AndroidX WebKit 1.14.0
  is Apache-2.0. JS tests, Android JVM unit tests, web build, and V3 closure pass. An
  isolated ephemeral build exercised synthetic AndroidX-listener/Keystore CRUD and reload
  on MatePad API 31; service-worker promotion was skipped only in the temp test copy.
  No main-app/device data was cleared; real SSH E2E remains BLOCKED.

The active vendor tree invariant: **tree == v2.2.7 target tree + the build-only closure patches listed in
`vendor-manifest.json#closurePatches` + the active mobile patches listed in `vendor-manifest.json#mobilePatches`**,
byte-identical, zero other diff (checked by
`scripts/verify-closure.sh`, with registered partial assets and patch-created packages). The
current active array has two entries: the #184 overlay and the inherited main server-edit patch; the 78 historical deferred payload files are retained for
provenance and are not replayed. They do not define the current disposition count: the current
registry has 59 deferred patches.

## Build-only closure patch (separate from #184 mobile overlay)

- `vendor-manifest.json#closurePatches` replays `patches/closure/v2-2-7-build-dependency-closure.patch`
  before the active mobile overlay. It removes five dangling `workspace:*` references introduced by
  extracting only the web closure (`@opencode/httpapi-codegen`, `@opencode/theme`,
  `@opencode/http-recorder`) and carries the minimal `@opencode/patchmark` package required by
  the v2.2.7 `session-ui` workspace dependency.
- Closure patch SHA-256: `127840237babf53466c548fb455e47adecf0e922f6d01a1160a1b9f096362d57`.
- This patch is a build/install dependency correction, not a product/mobile delta: it is deliberately
  outside `patches/mobile/manifest.json`, outside `mobilePatches`, and excluded from the active #184
  target list. It is retained because removing it makes V3(b) fail with five dangling workspace refs.

## Upstream update exercise (issue #27 lifecycle, S3)

The pin was advanced from `cec70f3ed6b64bf0e23a7c62325850ca25d3409b` (2026-10-19,
v2.0.32) to `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43` (2026-10-23, v2.1.4 cycle).

- **Selection**: app/client-touching fix (#57025 session transcript retention); all 9
  carried patch keys verified present in the candidate lock segment with identical
  versions; connection-password-memory-only target file unchanged; 241 candidate commits considered on origin/dev.
- **Closure refresh**: 289 closure files changed; root catalog/overrides re-synced
  (@pierre/highlights 0.2.0 new, @pierre/diffs 1.6.1, @opentui 0.6.8, bun-types 1.4.4
  override); candidate `[install]` bunfig mirrored (upstream itself added
  `@pierre/highlights`, `bun-types`, `typescript@7.1.0-beta` to the release-age excludes;
  `minimumReleaseAge` unchanged at 259200). First install attempt failed on
  `@pierre/highlights@0.2.0` (<3 days old) until the candidate bunfig was mirrored.
- **Patch lifecycle**: gui-plugins-native-test-deps/workspace-dependency-closure regenerated at the candidate (electron version bump
  and hunk line shifts; semantics unchanged, conflict resolutions recorded in
  `patches/mobile/manifest.json`); connection-password-memory-only applied verbatim (target unchanged). Carried
  upstream patch files are byte-identical between pins; upstream's
  `@modelcontextprotocol/client` patch move (2.0.0→2.3.1) and photon-node patch change
  affect only our explicit not-carried set.
- **Regression**: V1 PASS (9/9 patch segment, no silent skip), V2 PASS (6138 modules,
  3330 dist files), V3 PASS, V-cred PASS, V7 PASS, V4 BLOCKED unchanged (same 12
  user-decision items as before the update — no new license class).
- **Rollback demo**: performed for real (git restore to the previous pin + vendor-sync +
  clean reinstall + rebuild). Preferred sha256-identity criterion met for 3110/3138
  dist files; the 28 differing files are all `.map` sourcemaps (vite/rolldown map
  emission is not byte-reproducible across runs); fallback criterion (V3 + V2) met —
  rollback SUCCESS with that caveat recorded. Operational finding: swapping
  `bun.lock` back requires removing `node_modules` first — bun 1.4.2 reported
  "no changes" against a stale superset store.
- **Gate report**: Gradle/Android build, device gates G1–G12 and live-service E2E are
  BLOCKED (not passed) — no Android SDK, no device, no authorized service.
- **Decision**: pin advanced; rationale and full record in `provenance.json`
  (`pinUpdateExercise`).

## Upstream npm patches — carried subset (9)

Derivation rule: carried = (packages resolved by upstream `bun.lock`) ∩ (patchedDependencies
segment actually recorded in upstream `bun.lock`). Upstream `package.json` declares 17
patched dependencies; the lock segment holds 13; the closure uses 9.

| Key | Patch file |
| --- | --- |
| `@corvu/drawer@0.2.4` | `patches/@corvu%2Fdrawer@0.2.4.patch` |
| `@dnd-kit/dom@0.5.0` | `patches/@dnd-kit%2Fdom@0.5.0.patch` |
| `@npmcli/agent@4.0.2` | `patches/@npmcli%2Fagent@4.0.2.patch` |
| `@pierre/trees@1.0.0-beta.4` | `patches/@pierre%2Ftrees@1.0.0-beta.4.patch` |
| `@tanstack/virtual-core@3.17.8` | `patches/@tanstack%2Fvirtual-core@3.17.8.patch` |
| `ghostty-web@github:anomalyco/ghostty-web#83c0a07` | `patches/ghostty-web@0.3.0.patch` |
| `pacote@21.5.1` | `patches/pacote@21.5.1.patch` |
| `solid-js@1.9.15` | `patches/solid-js@1.9.15.patch` |
| `vite@8.2.2` | `patches/vite@8.2.2.patch` |

Not carried, with reasons (explicit deviation protocol — no silent dead entries):

- `gcp-metadata@8.1.2` — declared in upstream `package.json` but **absent from the upstream
  lock's patchedDependencies segment** (lock resolves `gcp-metadata@8.1.4`); Bun silently
  skips version-mismatched keys, so carrying it would be a dead entry.
- `@ai-sdk/google@3.0.73`, `@ai-sdk/mistral@3.0.51`, `@standard-community/standard-openapi@0.2.9`
  — same: declared upstream, absent from the lock segment.
- `@modelcontextprotocol/client@2.3.1` (key was 2.0.0 at the previous pin; upstream moved
  the patch during the update exercise), `@silvia-odwyer/photon-node@0.3.4`,
  `@ff-labs/fff-bun@0.10.5`, `@ai-sdk/openai-compatible@2.0.41` — in the lock segment but
  outside the closure dependency graph.

## Git dependencies

- `ghostty-web` = `github:anomalyco/ghostty-web#83c0a07b8628b748aed073b232cb4b52a6ca11c1`
  (resolved commit from the spec at pin; fetched during `bun install`).

## Lockfile and license

- Root `bun.lock` is generated by bun 1.4.2 (= upstream `packageManager`) from this closure;
  its sha256 is recorded in `provenance.json` after the first reproducible install.
- `LICENSE` (MIT, "Copyright (c) 2025 opencode") is extracted with the closure.
  Third-party notice: `NOTICE-THIRD-PARTY.md`, generated by `scripts/license-audit.ts`.
- Issue #67: `knobs` (npm alias `npm:@kitlangton/knobs@0.4.0-next.22`, MIT) is the ONLY new
  npm dependency of this closure — consumed by `ui/src/motion-tuning-fields.ts` (the Knobs
  dev-console field constructors), so it enters the lockfile but not the production web
  bundle (DEV-console-only consumers).

## Discipline

- No whole-repo copy; upstream cache is read-only (`git archive` extraction only).
- No hand-editing of `node_modules`; closure gaps go through manifest amendment +
  `vendor-sync.sh` re-run (correction loop).
- Pin updates are a maintainer decision (issue #27); this file and `provenance.json` must
  record the selection rationale whenever the pin moves.

## Historical P126 Block 1 candidate inventory (2026-11-04; superseded)

This isolated Block 1 candidate was based on repository commit `d37260c002b4390060f7d6cd78ffe6a11e9e1012`.
At that time the closure retained the 56-entry active set from that base, and six candidate
source files were `deferred-source-only`. The historical `p126-replay-order.json` was a
future-order contract, not a successful replay record. The table preserves original candidate
hashes; surviving files are cross-referenced by current semantic name, not claimed to retain
these hashes today. Current hashes/status are exclusively in the registry and generated mirrors.

| ID | Source patch | SHA-256 | Status |
| --- | --- | --- | --- |
| `session-workbench-upstream` | `patches/mobile/session-workbench-upstream.patch` | `999102046b0b9e559875e9afcc0aa734558e6e8c4087d11daacdb160ce1b5fb1` | `deferred-source-only` |
| `session-client-compatibility` | `patches/mobile/session-client-compatibility.patch` | `f32f9e6289d97c2a3e8b965e9d0ddfc41283bb48105827f57b9b5c79a3e5e359` | `deferred-source-only` |
| `session-media-source-safety` | `patches/mobile/session-media-source-safety.patch` | `384326345d18cc9e0822a2abaa7ace24e1bf4fbee759cc5fe22aa73f73fb48c2` | `deferred-source-only` |
| `session-android-adaptation` | `patches/mobile/session-android-adaptation.patch` | `1592f92778e4916476b2e15b0ce0664925a39be88ebcfcb88bb30fa997f44f73` | `deferred-source-only` |
| `session-agent-selector` | `patches/mobile/session-agent-selector.patch` | `f82b2b480e60662975039c7b673033f7e7079922d4f161088ed2752a8513dc4b` | historical `deferred-source-only`; subsequently active |
| historical `M-064` (removed) | Historical file named P126-S-session-ownership-whitespace.patch; removed during runtime cleanup, no current file or registry entry | `8291ac3b2706058702587750e73d47b5f299eb54736087652e1f3b4d2063ab5c` | historical `deferred-source-only` |

The historical future ordering contract was base gui-plugins-native-test-deps…settings-server-menu excluding the later-positioned connection-initial-credential-persistence/connection-vault-ready-wait, then
P126 U/C/S/A, then connection-initial-credential-persistence/connection-vault-ready-wait, then agent-selector and session-ownership-whitespace. It does not
authorize applying these patches in that block. Current replay and tree checks consume only
`vendor-manifest.json#mobilePatches` (now two active v2.2.7 replays: the #184 consolidated entry and the inherited main server-edit patch; 78 historical payload files remain outside the current active replays).

## P126 session runtime source cleanup snapshot (2026-11-05)

The following hashes and verification claims belong to that cleanup delivery, before the
identity migration; they are not a new verification of the current tree. Current status/count
is given above, and current hashes are in `patches/mobile/manifest.json`.

The historical source overlay in this snapshot targeted upstream `v2.2.1` commit
`3ebcf9a32c7b28f658cfee80775448929361727a`; active replay order is the `mobilePatches` array in
`vendor-manifest.json`. session-agent-selector is active at the replay tail after session-composer-test-fixture. Its Android marker only
exposes the existing server-provided Agent selector; an empty catalog stays hidden and the original
Desktop preference/custom-Agent condition and selection fallback remain unchanged. The previously
deferred test hunk is excluded. session-project-open-compatibility retains only the production
`projects.add` → `projects.open(directory)` host API adaptation. The `patchmark` workspace is added
by the client-compat source patch and is registered as patch-created, not extracted as a package at
the older pin.

| ID | Source patch | SHA-256 | Status |
| --- | --- | --- | --- |
| `session-project-open-compatibility` | `patches/mobile/session-project-open-compatibility.patch` | `afe2cc951547c87470b99ab3e0a0ba647d17d6909cc0106097e8f6e6cec883db` | `active` |
| `session-e2e-runtime-compatibility` | `patches/mobile/session-e2e-runtime-compatibility.patch` | `aa7e8e67c54f3483942e6b1e0dae3b69683db01e4d3191d254495f4f735785fc` | `active` |
| `session-composer-test-fixture` | `patches/mobile/session-composer-test-fixture.patch` | `666267b9085248693f88db39083aa20745659a8a4697a16ab37f2a4de1e7b0fe` | `active` |

session-e2e-runtime-compatibility carries only the exact target `mockPluginsActivating` helper; session-composer-test-fixture carries only the exact target
`app-direction.fixture.tsx` copy. Both copies were byte-compared with the fixed release tree. The
Composer E2E suite is restored byte-for-byte to that target, without local server-seed edits. The M-066
matcher patch, standalone host API test, three client-compat tests absent from the fixed target,
optimizer-only Vite override, and whitespace-only M-064 patch were removed; the whitespace line is
kept in the owning session-media-source-safety source patch rather than as a separate registry entry.
`verify-closure.sh` is restored to the generic implementation from
`d37260c002b4390060f7d6cd78ffe6a11e9e1012`.
