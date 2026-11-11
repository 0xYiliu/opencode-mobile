# v2.2.1 → v2.2.7 Desktop 变化总结

## 口径与可复现命令

比较对象固定为：

```text
v2.2.1 = 3ebcf9a32c7b28f658cfee80775448929361727a
v2.2.7 = fedc6f208aa2bd54c1019227214568083f6380ad
```

直接 Desktop 变化：

```bash
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  v2.2.1..v2.2.7 -- packages/desktop
git -C /home/peterhan/repository/opencode log --format='%H%x09%ad%x09%s' --date=short \
  v2.2.1..v2.2.7 -- packages/desktop
```

共享前端闭包变化：

```bash
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  v2.2.1..v2.2.7 -- packages/app packages/client packages/protocol packages/schema \
  packages/session-ui packages/ui packages/util packages/gui-plugins \
  packages/plugin-browser packages/plugin packages/ai
```

## 规模

| 范围 | 文件变化 | 新增 | 删除 | 备注 |
| --- | ---: | ---: | ---: | --- |
| `packages/desktop/**` | 146 | 15,788 | 3,198 | 67 added / 6 deleted / 73 modified；另含 2 个 prod icon 文件 |
| 共享 closure 选定包 | 2,330 | 234,346 | 73,663 | 741 added / 141 deleted / 1,426 modified，含 12 个 rename 状态 |
| 共享 closure + Desktop | 2,476 | 250,326 | 76,831 | 以固定 tag 的 git diff 为准 |

这些数字是源码变化规模，不是完成率，也不表示所有变化都应进入 Android。`packages/desktop` 必须继续排除运行时；共享包变化则需要按协议/注册/平台 gate 重新判断。

## 直接 Desktop 变化的完整 commit 清单

下面列出 v2.2.1→v2.2.7 期间触碰 `packages/desktop/**` 的全部 41 个 commit；提交顺序为从新到旧。它们是 Desktop 原生变化的完整索引，细节以固定 commit 对象和 `git show <sha> -- packages/desktop` 为准。

| Commit | 日期 | 变化 |
| --- | --- | --- |
| `fedc6f208aa2` | 2026-11-10 | release: v2.2.7 |
| `5f76acb1257` | 2026-11-10 | release: v2.2.6 |
| `dc71d5f94b1` | 2026-11-08 | restore the review shortcut |
| `088682cb1e8` | 2026-11-08 | show an error when opening a path in the default app fails |
| `23f96c6efa3` | 2026-11-06 | translate cut, copy, paste and select all in the right-click menu |
| `6973d89bf50` | 2026-11-08 | move strobe to github.com/anomalyco/strobe |
| `c64fff5bcbc` | 2026-11-05 | move the opencode.ai site into services/www and deploy with cf |
| `6666acc12cb` | 2026-11-05 | settle startup asset gate, plugin catalogs and first-launch onboarding through state machines |
| `56316217103` | 2026-11-04 | require explicit state machines for lifecycle state |
| `dbc3f507adb` | 2026-11-05 | route OS session end, CLI install, debug export and draft GC through state machines |
| `d8cb7c73d04` | 2026-11-05 | settle renderer storage, plugin menubar and fullscreen seeds against live events |
| `a4ce0b0989d` | 2026-11-05 | drive the IPC port handshake and event stream through state machines |
| `36f40c852c9` | 2026-11-04 | native menu routing and plugin instance lifecycle as state machines |
| `0d18f558b03` | 2026-11-04 | model migration poll, picked files, plugin host follow and zoom as state machines |
| `483969a8849` | 2026-11-04 | drive renderer recovery with an explicit state machine |
| `d1da4264a90` | 2026-11-04 | serialize force focus and fix the debug bar toggle |
| `1a2505118fe` | 2026-11-04 | retry failed storage writes and refuse writes after close |
| `2e5d757adcff` | 2026-11-04 | adopt the early window through an explicit state machine |
| `ce5c980f8b9` | 2026-11-04 | bound the renderer startup splash with an explicit state machine |
| `2047c0d4fdb` | 2026-11-04 | serialize background service connects through one state machine |
| `d356b9b2492` | 2026-11-04 | reveal hidden windows on a bounded fallback and before recovery dialogs |
| `1a8a369af75` | 2026-11-04 | retry plugin host and CLI loads after a transient failure |
| `4a6067d85c5` | 2026-11-04 | restart plugins when an update handoff fails |
| `9a7f22a776b` | 2026-11-04 | derive server controllers from an explicit lifecycle machine |
| `dd9a5ab6abc` | 2026-11-04 | deliver each deep link once to its window |
| `644d41f37a5` | 2026-11-04 | benchmark first launch without GPU shader caches |
| `fe046564650` | 2026-11-03 | run every benchmark with strobe |
| `4878a0e30fc` | 2026-10-30 | release: v2.2.5 |
| `171dbd6abe4` | 2026-10-30 | add worktree picker shortcuts and toggle shell mode |
| `872f694b05a` | 2026-10-30 | release: v2.2.4 |
| `78dda62d880` | 2026-10-30 | keep loopback requests off environment proxies |
| `b44b7164baaa` | 2026-10-30 | release: v2.2.3 |
| `a6212cb1b55` | 2026-10-30 | describe macOS folder access in the app bundle |
| `7b67adf7e12` | 2026-10-30 | restore maximized windows on their saved display |
| `1bf82105f09` | 2026-10-30 | ship the Icon Composer app icon on macOS |
| `f807ffeccbc` | 2026-10-30 | retain renderer permissions across shared-session windows |
| `bf94de965df` | 2026-10-30 | spellcheck toggle and system-language dictionaries |
| `1f671299361` | 2026-10-30 | sign zip data descriptors in debug log export |
| `2c49a18436c` | 2026-10-30 | prevent main bundle require collision |
| `4efad23dd8b` | 2026-10-29 | release: v2.2.2 |
| `f74b1416a8b` | 2026-10-29 | release: v2.2.1 |

The table contains all 41 commits returned by the fixed-tag Desktop path query, including release, benchmark and cross-package commits that touch the Desktop package. The audit command above remains authoritative for full subjects and path-level attribution.

## Direct Desktop change categories

### 1. Packaging, build and benchmark

- `electron-builder` and Electron Vite configuration changed for the v2.2.7 packaging line.
- A production Icon Composer asset was added under `packages/desktop/icons/prod/`; the existing Android closure must not copy the whole Desktop package merely because this asset exists.
- Startup benchmark scripts moved from `script/bench-startup.ts` / `bench-variant.ps1` to `perf/startup.bench.ts`; bundle verification was added and an old source-profile script was removed.
- Debug-log ZIP data descriptors and main-bundle CommonJS `require` collision handling were fixed.

### 2. Native window, startup and recovery lifecycle

- Deep links became single-delivery per target window.
- Hidden-window recovery, renderer splash, early window adoption, startup asset gates and first-launch onboarding became explicit state machines with bounded fallback paths.
- Background service connection, IPC port handshake/event stream, renderer recovery, storage writes and OS-session-end handling became serialized state-machine flows.
- Native menu routing, plugin instance lifecycle, plugin/CLI loading and update-handoff failure recovery gained retry/restart and explicit state transitions.

### 3. Native interaction and platform behavior

- Windows/macOS window restore, saved-display maximization, force-focus serialization, fullscreen seed synchronization and macOS traffic/icon packaging changed.
- Desktop zoom behavior is now part of an explicit machine and includes migration/state handling; this is Desktop host behavior, not an Android pinch-zoom feature.
- Desktop spellcheck toggles and system-language dictionaries were added.
- Right-click Cut/Copy/Paste/Select all labels are translated.
- Opening a path in the default application now surfaces a failure instead of silently returning a failed result.
- Review shortcut behavior was restored.

### 4. Shared Desktop-adjacent changes

The selected shared closure changed in 2,330 files across 465 commits. The largest source families are `app/src` (1,812 changed paths), `gui-plugins/src` (484), `ai/src`/tests, `ui/src`, and `session-ui/src`. The main Desktop-visible themes are:

- explicit state machines for settings, routes, panels, menus, theme, tooltip, dialog, segmented controls, provider/MCP sign-in, session/new-session, terminal, file/review, browser, pairing, SSH, WSL, updater, notifications, usage, sources and goal;
- new or changed session, composer, queue, permission/question, file/Diff, terminal, Office, browser and provider/model surfaces;
- generated protocol/schema/client updates and new endpoint/type contracts;
- GUI plugin registration, settings contribution, plugin lifecycle, updater and host API changes;
- typography, theme, motion, menu, dialog, tabs and responsive-layout changes;
- dependency and package export changes, including Effect 4.1.0, OpenTUI 0.8.1, Solid 1.9.17, Vite 8.2.4, MCP client 2.4.0, `@pierre/trees` beta.6 and a new `@hona/strobe` dependency.

These shared changes are not all Android changes. Each affected mobile patch must be classified as absorbed, re-based, semantically adapted, or intentionally excluded.

## Mobile disposition rules

| Upstream change class | Android disposition |
| --- | --- |
| Electron main/window/native menu/Updater/WSL/local PTY implementation | Exclude; retain an explicit Desktop-only or product-scope boundary |
| Shared app/session/settings/plugin/UI implementation | Include in the v2.2.7 closure, then re-review mobile patches and platform gates |
| `packages/desktop/icons/*` imported by the web build | Include only the exact target partial assets proven by v2.2.7 imports |
| Protocol/schema/generated client changes | Reconcile with bridge, remote-service compatibility and real failure paths |
| Existing mobile credential/security/lifecycle adaptation | Re-base semantically; clean application is not proof of equivalence |
| Upstream behavior already matching a mobile patch | Retire or absorb with an explicit registry/history disposition |

## First migration evidence

The first v2.2.7 scratch replay was intentionally run before changing the real worktree. After deriving the target upstream npm patch set, the first mobile patch (`gui-plugins-native-test-deps`) did not apply because v2.2.7 already has the target dependency shape. This proves the 78-patch chain cannot be copied unchanged; it does not by itself prove that every mobile behavior is absorbed. The next stage must reconstruct each patch disposition from the target tree.

## Limitations

- No Windows v2.2.7 runtime or installer was available during this audit.
- No v2.2.7 vendor migration, Android build, device run or remote-service E2E has been claimed yet.
- The direct Desktop commit list and fixed-tag git commands are the authoritative inventory; historical v2.2.1 evidence remains in the frozen v2.2.1 directory.
