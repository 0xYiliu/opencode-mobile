# Vendor provenance — upstream opencode frontend closure

Machine-readable twin: `provenance.json`. Acquisition/rebuild tool: `scripts/vendor-sync.sh`.
Verification: `scripts/verify-closure.sh` (V3).

## Pin

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/anomalyco/opencode |
| Branch | `dev` (upstream default branch) |
| Pin | `cec70f3ed6b64bf0e23a7c62325850ca25d3409b` |
| Pin date | 2026-10-19T13:06:20+02:00 |
| Pin subject | `test(gui-extensions): wait for worker rpc handlers to start before aborting (#55988)` |
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

- 4379 files, ~43 MB under `packages/` (measured at pin, before install).
- Excluded packages: `cli, codemode, console, containers, core, desktop,
  effect-drizzle-sqlite, function, http-recorder, httpapi-codegen, identity, latex,
  merman, plugins, posts, script, sdk, server, simulation, stats, storybook, theme, tui, web`
  — only the Electron-rendered frontend (packages/app) and its transitive workspace closure
  are needed for the static web build; the phone never hosts a local OpenCode service.
- Partial package (closure correction, correction loop): `packages/desktop/icons/dev`
  (53 files) — `packages/app/vite.icons.ts` reads `../desktop/icons/dev/*` unconditionally
  at vite config load to emit favicons and webmanifest icons for the PWA. The desktop
  package itself stays excluded; `OPENCODE_CHANNEL=beta|prod` builds are outside this
  vendor set.
- File-level exclusion: `packages/ai/test/fixtures/recordings/` (274 files, ~13.7 MiB,
  HTTP recorder test fixtures) — dropped during extraction and registered in the manifest.

## Mobile patches (pre-applied, registered in `patches/mobile/manifest.json`)

| ID | Target | Change | Why |
| --- | --- | --- | --- |
| M-001 | `packages/gui-extensions/package.json` | drop `electron`, `@lydell/node-pty`, `devtools-protocol` devDeps | Electron-only test tooling; electron postinstall ≈110 MB, never needed by the web build |
| M-002 | `packages/app/src/runtime/server/persistence.ts` | encode path strips `password` (memory-only); embeds marker `mobile(M-002): password stripped at encode (memory-only)` | Web default storage is localStorage; persisting credentials violates AGENTS.md. Decode tolerates legacy values; Keystore is issue #4 |
| M-003 | `packages/{client,plugin,ai}/package.json` | strip three dangling workspace refs (`@opencode/httpapi-codegen`, `@opencode/theme` ×3 spots, `@opencode/http-recorder`) | Targets are excluded packages; Bun 1.4.2 hard-errors on dangling workspace devDeps and unsatisfied optional workspace peerDeps |

The vendor tree invariant: **tree == pin tree + registered mobile patches**, byte-identical,
zero other diff (checked by `scripts/verify-closure.sh` V3(a)).

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
- `@modelcontextprotocol/client@2.0.0`, `@silvia-odwyer/photon-node@0.3.4`,
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
