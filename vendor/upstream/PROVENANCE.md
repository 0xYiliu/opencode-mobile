# Vendor provenance — upstream opencode frontend closure

Machine-readable twin: `provenance.json`. Acquisition/rebuild tool: `scripts/vendor-sync.sh`.
Verification: `scripts/verify-closure.sh` (V3).

## Pin

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/anomalyco/opencode |
| Branch | `dev` (upstream default branch) |
| Pin | `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43` (advanced from `cec70f3ed6b64bf0e23a7c62325850ca25d3409b` via the issue #27 update exercise; see below) |
| Pin date | 2026-10-23T10:28:20-07:00 |
| Pin subject | `fix(app,client): wire session transcript retention and evict background transcripts (#57025)` |
| Local cache | `~/.cache/opencode-upstream` (`clone --filter=blob:none`) |

Acquisition command (whole-repo copy is forbidden by policy; only the closure below is
extracted, upstream is never modified or pushed):

```
scripts/vendor-sync.sh
# git -C ~/.cache/opencode-upstream archive <pin> -- packages/<p>... LICENSE \
#   | tar -x --exclude=packages/ai/test/fixtures/recordings -C vendor/upstream
# + extract registered upstream npm patches (subset) from the same tree
# + apply registered mobile patches (git apply --check first)
```

## Closure packages (11)

`app, client, protocol, schema, session-ui, ui, util, gui-extensions, plugin-browser, plugin, ai`

- 4473 files, ~45 MB under `packages/` (git ls-files count at the pin; the earlier 4460 was
  an intermediate-state residue, corrected in review), before install; excludes install/build artifacts.
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

## Mobile patches (pre-applied, registered in `patches/mobile/manifest.json`)

| ID | Target | Change | Why |
| --- | --- | --- | --- |
| M-001 | `packages/gui-extensions/package.json` | drop `electron`, `@lydell/node-pty`, `devtools-protocol` devDeps | Electron-only test tooling; electron postinstall ≈110 MB, never needed by the web build |
| M-002 | `packages/app/src/runtime/server/persistence.ts` | encode path strips `password` (memory-only); embeds marker `mobile(M-002): password stripped at encode (memory-only)` | Web default storage is localStorage; persisting credentials violates AGENTS.md. Decode tolerates legacy values; Keystore is issue #4 |
| M-003 | `packages/{client,plugin,ai}/package.json` | strip three dangling workspace refs (`@opencode/httpapi-codegen`, `@opencode/theme` ×3 spots, `@opencode/http-recorder`) | Targets are excluded packages; Bun 1.4.2 hard-errors on dangling workspace devDeps and unsatisfied optional workspace peerDeps |

Runtime seam patches beyond the closure set — M-004…M-015 (issues #3/#4/#5/#6) — are registered with
owner/reason/upstreamBaseline/verification/rebase in `patches/mobile/manifest.json` (mirrored in
`vendor-manifest.json#mobilePatches`, 15 mobile patches since issue #6); the table above lists only the
three closure-acquisition patches that `scripts/vendor-sync.sh` re-applies itself. In one line:

- M-004–M-008 (issue #3): app vite alias to the first-party package, credentialRef field, dialog
  reference passthrough, entry bootstrap of the host registry, settings mount of the host manager.
- M-009/M-010 + M-007 amendment (issue #4): optional "remember credential" branch over the device
  vault, hydration credential resolution into memory only, vault handshake listener before first render.
- M-011–M-014 (issue #5): platform fetch injection with the validated-follow redirect policy
  (marker `mobile(M-011)`), upload XHR responseURL validation, probe-classified connect errors in the
  server dialog (`dialog.server.error.<code>`), and the endpoint-probe bridge wiring in the web entry
  (independent `opencode-mobile-probe-handshake` string, protocol-isolated from the vault bridge).
  Rationale and trust design: `docs/decisions/0002-direct-connection-transport.md`.
- M-015 (issue #6): the ssh tunnel bridge wiring in the web entry (third protocol-isolated handshake
  `opencode-mobile-ssh-handshake`; the bridge-backed host-key verifier and tunnel transport replace
  the fail-closed stubs in the shipped wiring only). Rationale and trust design:
  `docs/decisions/0003-ssh-transport.md`.

The vendor tree invariant: **tree == pin tree + registered mobile patches**, byte-identical,
zero other diff (checked by `scripts/verify-closure.sh` V3(a)).

## Upstream update exercise (issue #27 lifecycle, S3)

The pin was advanced from `cec70f3ed6b64bf0e23a7c62325850ca25d3409b` (2026-10-19,
v2.0.32) to `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43` (2026-10-23, v2.1.4 cycle).

- **Selection**: app/client-touching fix (#57025 session transcript retention); all 9
  carried patch keys verified present in the candidate lock segment with identical
  versions; M-002 target file unchanged; 241 candidate commits considered on origin/dev.
- **Closure refresh**: 289 closure files changed; root catalog/overrides re-synced
  (@pierre/highlights 0.2.0 new, @pierre/diffs 1.6.1, @opentui 0.6.8, bun-types 1.4.4
  override); candidate `[install]` bunfig mirrored (upstream itself added
  `@pierre/highlights`, `bun-types`, `typescript@7.1.0-beta` to the release-age excludes;
  `minimumReleaseAge` unchanged at 259200). First install attempt failed on
  `@pierre/highlights@0.2.0` (<3 days old) until the candidate bunfig was mirrored.
- **Patch lifecycle**: M-001/M-003 regenerated at the candidate (electron version bump
  and hunk line shifts; semantics unchanged, conflict resolutions recorded in
  `patches/mobile/manifest.json`); M-002 applied verbatim (target unchanged). Carried
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

## Discipline

- No whole-repo copy; upstream cache is read-only (`git archive` extraction only).
- No hand-editing of `node_modules`; closure gaps go through manifest amendment +
  `vendor-sync.sh` re-run (correction loop).
- Pin updates are a maintainer decision (issue #27); this file and `provenance.json` must
  record the selection rationale whenever the pin moves.
