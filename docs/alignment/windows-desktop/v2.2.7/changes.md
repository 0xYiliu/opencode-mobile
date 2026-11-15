# v2.2.1 → v2.2.7 Desktop 变化总结

## 口径与可复现命令

比较对象固定为：

```text
v2.2.1 = 3ebcf9a32c7b28f658cfee80775448929361727a
v2.2.7 = fedc6f208aa2bd54c1019227214568083f6380ad
```

当前 v2.2.7 patch registry：**83 registered / 5 active / 26 absorbed / 52 deferred**；`mobilePatches` 按顺序重放 #184 scoped overlay、inherited main `server-edit-touch-compatibility` patch、历史 #185 `home-new-session-v2-2-7` patch、当前 #186 `tabs-inbox-titlebar-v2-2-7` patch 与本轮 #187 `timeline-messaging-v2-2-7` patch，构建传递依赖由独立 `closurePatches` 承载。

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

The first v2.2.7 scratch replay was intentionally run before changing the real worktree. A pristine target closure was built with 9 target upstream npm patches (including MCP client 2.4.0, Solid 1.9.17 and Vite 8.2.4; excluding the old Ghostty patch). A three-way overlay trial then compared:

```text
base  = old pristine closure (old pin + old upstream npm patches)
theirs = current v2.2.1 mobile tree (all 78 mobile adaptations)
ours  = pristine v2.2.7 closure
```

The result was **296 absorbed files, 71 clean merges, 232 conflict files and 6 mobile-added files**. The conflict count is a discovery result, not a new patch count. It proves the 78-patch chain cannot be copied unchanged and that a clean `git apply --check` pass is not a sufficient migration strategy.

The first patch (`gui-plugins-native-test-deps`) still has a valid mobile intent—remove Electron, node-pty and devtools protocol test dependencies—but v2.2.7's package manifest has a new version, a protocol devDependency and a different dependency block. The first connection reference patch is more structural: v2.2.7's connection dialog now delegates to `servers/connect/machine.ts` and `controller.ts`, so credentialRef must be reattached to the new `ServerOriginal`/`ServerSaveAction` state-machine contract rather than copied into the old dialog save object.

The real worktree was restored after the scratch trial; no partial v2.2.7 vendor tree or conflict markers are committed. The next stage must reconstruct patch dispositions by domain (connection/security, settings, session/files, GUI plugins, UI, and compatibility), then regenerate each semantic patch and replay the complete chain.

## Limitations

- No Windows v2.2.7 runtime or installer was available during this audit.
- No v2.2.7 vendor migration, Android build, device run or remote-service E2E has been claimed yet.
- The direct Desktop commit list and fixed-tag git commands are the authoritative inventory; historical v2.2.1 evidence remains in the frozen v2.2.1 directory.

## Issue #186：tabs / Inbox / titlebar crosswalk and allowlist

本节是 #186 的固定上游审计，不改变冻结的 v2.2.1 文档。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/.local/share/opencode/worktree/a66c79/feat-upstream-227-tabs-inbox-titlebar`。

### 可复现 fixed-source 命令

```bash
git -C /home/peterhan/repository/opencode log --format='%H%x09%s' \
  3ebcf9a32c7b28f658cfee80775448929361727..fedc6f208aa2bd54c1019227214568083f6380ad \
  -- packages/app/src/shell packages/app/src/runtime/plugin packages/app/src/session packages/ui/src
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727 fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/app/src/shell packages/app/src/runtime/plugin packages/app/src/session packages/ui/src \
  packages/app/e2e/regression/tabs.spec.ts packages/app/e2e/regression/side-panels.spec.ts
git -C /home/peterhan/repository/opencode show --stat --oneline <commit>
```

### 行为 crosswalk

| fixed upstream commit | 目标行为 | #186 处置 | 证据/allowlist 归属 |
|---|---|---|---|
| `bb85c5414b203850110fa65a9a60c5c1fbea0c42` | New tab 才显示 side launchers；最后一个 side-region tab 关闭 region | **absorbed** | `runtime/plugin/panels.tsx`, `side-region.tsx`, `e2e/regression/side-panels.spec.ts` |
| `f99bc074456a692e5f7e240f34951056073c213a` | close button 可见、tab menu、close actions 与 touched locale | **absorbed** | `shell/titlebar/tab-nav.tsx`, `tab-strip.tsx`, `titlebar.tsx`, 全部 touched `runtime/i18n/*.ts` |
| `51625f7709fdddb95ff6abaad0b84e79ab53a3f0` | Inbox 打开 session 后保留 scroll anchor/scrollTop | **absorbed** | `shell/titlebar/inbox.tsx`, `e2e/regression/tabs.spec.ts`, `e2e/utils/mock-api.ts`, `mock-server.ts` |
| `299975163276e850aca75a2828986bb87df7a71d` | Working shelf 按 run start time 稳定排序（至少两个 run） | **absorbed** | `inbox-working.ts`, `inbox-working.test.ts`, `inbox.tsx` |
| `2bb49886d70f3da46a5f4e5193a974c56f5b7a53` | project-organized tabs、session preview、project/session row | **absorbed** | `shell/tabs/{tabs,preview,preview-machine,project-sessions}.ts*`, `titlebar/{sidebar-organized,sidebar-sessions,project-session-row}.tsx` |
| `003d24ef8568f72410b1eb571c067bc913d84ded` | Inbox unread/read 分组、mock fixture、列表状态 | **absorbed** | `inbox-model.ts`, `inbox.tsx`, `inbox-list.stories.tsx`, `e2e/regression/tabs.spec.ts`, `runtime/i18n/en.ts` |
| `7864a941527ad54e415d5875c98e038c5fc25697` | close other / close after、reopen/menu 行为 | **absorbed** | `shell/tabs/tabs.tsx`, `titlebar/{tab-nav,tab-strip,titlebar}.tsx`, `e2e/regression/tabs.spec.ts` |
| `6838d9579564438d80e68ae28bd1e0629d28fe9f` | tab promotion、route-to-tab sync、load/hydration state machine | **absorbed** | `shell/tabs/{tabs,promotion-machine,hydration-machine}.ts*`, `titlebar/{route-machine,route-sync,titlebar}.ts*` |
| `77a42852967a0ae271d5678a1be230bd0a6a6b73` | tab rename、tab load、palette/search handoff | **absorbed** | `titlebar/{tab-load-machine,tab-rename-machine,tab-nav,tab-strip}.ts*` |
| `2ec64857375142a038623c16d29fe71cf1821a8e` | mobile tabs drawer machine、popover/tab preview lifecycle | **absorbed** | `titlebar/{mobile-tabs-machine,tab-popover-machine,tab-popover,titlebar}.ts*` |
| `10db139dc437c12a3e8559b7268a560b826ccc00` | Inbox first load/delete/rename state machines | **absorbed** | `inbox-{model,settle-machine}.ts*`, `inbox.tsx`, `project-session-row.tsx` |
| `cf69a0c53e11758c84b18c9492e5b3b9fd5ad216` + `d0045aaab5872df54da8723a6c43453b61e1ee90` + `d7d85817160120fd59fb27ee6ff354f45d18b994` | SessionTabAvatar 与 ActivityRing 分离、busy/failed indicator | **absorbed** | `layout/{project-avatar-state,session-tab-avatar}.ts*`, `titlebar/tab-nav.tsx`, `home/sessions/view.tsx`, `ui/activity-ring`, `session-progress-indicator-v2` |
| `8eb3c0ceba97c2e41abd5acf1e2e800ff8cdbe24` | shell scroll pending flush | **absorbed** | `shell/state/scroll*.ts*` |
| `6b9f21471f0501a7eee89b97a3746abdb4e28d5b`, `e6338d6783fcae2c1f7686a88e6ff07e7a41db6d` | timeline-cache / composer scroll 与 Timeline/Composer 行为 | **deny** | 明确排除 Timeline/Composer；只保留 Inbox scroll 与 shell state 的审计，不重放历史 payload |
| `85dc877ea4755689f01969c24fc4b6a81f8bbdbc` | side-panel close-to-right 的 shared panel 部分与 `⌘W/⌘⇧T` native shortcut | **split** | shared `panels.tsx/side-region.tsx/closed-tabs.ts` 纳入 absorbed closure；Desktop/Electron/⌘W 部分 deny |

结论：上述生产行为在 fixed v2.2.7 vendor 中逐文件 `git show fedc6f2:path` 与 `vendor/upstream/path` byte-compare 均为 **absorbed**；没有为 tabs/Inbox/titlebar 生产代码制造第二份 overlay。#186 唯一 active source delta 是必需 Android back bridge（见 `tabs-inbox-titlebar-v2-2-7.patch`），以及 root Android/first-party binding 接线。

### 逐文件 allowlist（审计面；不是复制清单）

```text
packages/app/src/runtime/plugin/{closed-tabs.ts,closed-tabs-view.tsx,panel-trigger.tsx,panels.tsx,side-region.tsx}
packages/app/src/shell/tabs/{tabs.tsx,preview.ts,preview-machine.ts,project-sessions.ts,promotion-machine.ts,promotion-machine.test.ts,hydration-machine.ts,hydration-machine.test.ts}
packages/app/src/shell/state/{session-tabs.ts,scroll.ts,scroll-machine.ts}
packages/app/src/shell/routes/{routes.tsx,session-ui-provider.tsx}
packages/app/src/shell/titlebar/{history.ts,inbox.tsx,inbox-model.ts,inbox-working.ts,inbox-working.test.ts,inbox-list.stories.tsx,mobile-tabs-machine.ts,mobile-tabs-machine.test.ts,route-machine.ts,route-machine.test.ts,route-sync.ts,tab-load-machine.ts,tab-load-machine.test.ts,tab-nav.tsx,tab-nav.css,tab-popover.tsx,tab-popover.css,tab-popover-machine.ts,tab-rename-machine.ts,tab-rename-machine.test.ts,tab-strip.tsx,titlebar.tsx,titlebar.css,project-session-row.tsx,sidebar-organized.tsx,sidebar-sessions.ts}
packages/app/src/shell/layout/{project-avatar-state.ts,session-tab-avatar.tsx}
packages/app/src/session/screen.tsx
packages/app/src/home/sessions/view.tsx
packages/session-ui/src/v2/components/session-progress-indicator-v2.tsx
packages/ui/src/feedback/activity-ring/activity-ring.tsx
packages/app/e2e/regression/{tabs.spec.ts,side-panels.spec.ts,multi-server.spec.ts}
packages/app/e2e/utils/{mock-api.ts,mock-server.ts}
packages/app/src/runtime/i18n/{am,ar,az,bg,bn,br,bs,ca,cs,da,de,dv,dz,el,en,es,et,fa,fi,fo,fr,he,hi,hr,hu,hy,id,is,it,ja,ka,km,ko,lo,lt,lv,mk,mn,ms,my,ne,nl,no,pa,pl,ro,ru,si,sk,sl,sq,sr,sv,tg,th,tk,tr,uk,ur,uz,vi,zh,zht}.ts
```

### deny audit

- **DENY** `packages/desktop/**`, Electron/native window/caption/menu/multiwindow/updater/WSL/window focus、`⌘W`/native close semantics；不因 shared panel 文件相邻而复制 Desktop runtime。
- **DENY** #185 Home/new-session、Timeline、Composer、Files、Terminal、Notifications 与 #164–#168；`6b9f...` timeline cache、`e633...` composer scroll 等只登记为 scope deny。
- **ALLOW（shared closure）** runtime/plugin panels/side-region/panel-trigger、tabs CSS、所有 touched locale、Inbox mock fixtures/tests、shell/titlebar/tabs/state/routes/session screen、avatar/activity ring；这些路径不能被“Desktop-only”规则错误 deny，但 fixed v2.2.7 已吸收，不能再复制。
- **ALLOW（required mobile delta）** only app-side back chain/binding and the one MainActivity bridge hunk. It does not add navigation, does not call `session.interrupt`/`abort`, `inbox.cancel`, `pty.remove`, `kill`, and does not stop a remote task.

## Issue #187：timeline / messaging crosswalk and allowlist

本节是 #187 的固定上游审计，不改变冻结的 v2.2.1 文档与 #186 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--187-timeline-messaging`，分支 `feat/187-timeline-messaging`，base `a25ab51`。审计为两遍（pass-1 生产/测试主路径，pass-2 composer/e2e/i18n/context 辅路径）+ 一组 absence 负检，全部数字可由下列命令复现。

### 可复现 fixed-source 命令

```bash
# pass-1 path set（session / shell commands / session-ui src）
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/app/src/session packages/app/src/shell/commands packages/session-ui/src
# pass-2 path set（composer / e2e / session-ui component-tests / ui context+i18n / runtime i18n）
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/app/src/composer packages/app/e2e packages/session-ui/component-tests \
  packages/ui/src/context packages/ui/src/i18n packages/app/src/runtime/i18n
# 逐文件 byte-compare：`git -C <upstream> rev-parse fedc6f2:<path>` 对 `git hash-object vendor/upstream/<path>`
# absence 负检：pass-1/pass-2 的 D 条目与 rename 源路径在 vendored 树必须不存在
```

### 审计数字（2026-11-14 本轮可复现重放）

- **pass 1**：294 entries = 147 A + 138 M + 8 D + 1 R100（`use-session-hash-scroll.test.ts` → `message-id-from-hash.test.ts`）→ **286 present → 285 SAME + 1 DIFF**；唯一 DIFF = `packages/app/src/session/screen.tsx`，差异为 #186 back-chain hunk（active `tabs-inbox-titlebar-v2-2-7` 已登记载体），非 timeline/messaging 生产 delta。计划期审计记录为 285 present → 284 SAME + 1 DIFF，与本轮重放差 1 条清点口径（DIFF 文件一致、A/M/D/R 计数一致）；以上列命令与 vendored 树的当轮重放为准。
- **pass 2**：357 entries = 219 M + 39 A + 84 D + 15 R（R091–R100 各 1–6 条）→ **273 present → 273 SAME + 0 DIFF**。
- **absence 负检**：108 项（pass-1 8 D + 1 rename 源 + pass-2 84 D + 15 rename 源）在 vendored 树 **0 present**——上游删除/rename 移走的文件没有以任何历史 payload 形态滞留。

结论：fixed v2.2.1→v2.2.7 timeline/messaging 生产 allowlist 在 vendored（v2.2.7 pin + 在册 active patches）树中逐文件 byte-identical，**absorbed by vendor pin，不复制第二份 overlay**。#187 唯一 active source delta 是 WebView 114 `:dir()` capability guard（`timeline-messaging-v2-2-7.patch`，重基于退役 `session-android-adaptation` 的 panel-motion hunk）。

### 行为 crosswalk

| fixed upstream commit | 目标行为 | #187 处置 | 证据/allowlist 归属 |
|---|---|---|---|
| `6b9f21471f0501a7eee89b97a3746abdb4e28d5b` | perf(app): keep each tab's timeline when switching directories (#59168)——每标签 timeline 缓存，切目录不丢 | **absorbed**（vendor pin） | `app/src/session/timeline/cache.ts`、`cache-machine.test.ts` 等 pass-1 SAME 集 |
| `0bf67d540128459327ed6503887888175b660b52` | feat(app): page the timeline from the composer (#59426)——composer 分页时间线 | **absorbed**（vendor pin） | pass-1 `session/timeline` SAME 集 |
| `589c62db60a4ae25e845e440eef64dd007101dc9` + `3ed47315d532391519198e90978c59bfe9e2eacb` + `f7cf3a10f48ae7632111fd494acca969531cc86d` + `8263ac0ec10827db82d8ff1db113c78ef18a83ac` | user message actions 菜单族：move into a menu (#60208)、explicit machine (#61657)、footer flicker fix (#62144)、Copy message full prompt (#62116) | **absorbed**（vendor pin） | `session-ui/src/message/*`（`action-machine.test.ts` 等）pass-1 SAME 集 |
| `7ab721a97f383b89a8d901c87866b1565c1cfd9c` | fix(session-ui): scroll Markdown fragment links to their heading (#59550)——锚点跳转 | **absorbed**（vendor pin） | `session-ui/src/components/markdown-fragment-links.test.ts`（Set A 成员） |
| `cf69a0c53e11758c84b18c9492e5b3b9fd5ad216` | fix(app): keep project avatars on busy session rows (#60384) | **absorbed**（#186 已核对，本 round 不重复登记 payload） | #186 crosswalk 行；pass-1 同树 byte-identity |
| timeline machine family | `ae3de411ae`（timeline sync/quote toolbar/queue panel/scroll reconnect）、`4c8b83ff84`（follow mode）、`1e4ad07511`（cursor）、`c5105b8d81`（older-history paging）、`b6f3294e9d`（rewind/undo/redo）、`36bdbb8584`（cold reveal）、`4cb790123c`（Find fenced seek）、`24cddd1659`（hash targets）、`b4c5c9cae3`（turn diffs retry + compaction entrance）等 `app/src/session/timeline` 状态机族 | **absorbed**（vendor pin） | `session/timeline/{machine,cursor-machine,history-machine,search-machine,model,...}.test.ts` pass-1 SAME 集 |
| session-ui machines | `f8b951cb38`（tool/message disclosures）、`6f725c68d1`（live turn phase）、`6f4fd90078`（shell runs/paced text/copy feedback）、`883249d729`（markdown readiness/steer grow-in/tool status titles）、`c9a9ac1ee8`（mentions/attachment media/review resize/diff mounts）、`1eea2d4d60`（pending steer model）等 `session-ui` 状态机族 | **absorbed**（vendor pin） | `session-ui/src/{timeline,message}/*machine*.test.ts` pass-1 SAME 集（`steer-arrival-machine`、`turn-phase-machine`、`paced-text-machine`、`compaction-entrance-machine` 等 Set A 成员） |
| `ed0171f08ac4018ae648fcca7315b3d717989d50` | feat(app): mark sessions read or unread from their menus (#62889)——session_read menu | **absorbed**（vendor pin） | titlebar/inbox 面归 #186 allowlist；locale 键入 pass-2 SAME 集 |
| session content search | `10db139dc4`（#62106 引入 `shell/commands/session-search-machine`）、`32ab1f3a9e`（#62170 stop loading every session for search，palette 检索索引化） | **absorbed**（vendor pin） | `shell/commands/{session-search-machine,search-machine}.test.ts` pass-1 SAME 集；#140 退役的 catalog 兼容差异不再回归 |

### deny audit

- **DENY（desktop-only）** `packages/desktop/**`、Electron/native window/菜单/updater/WSL；shared timeline 文件相邻不构成复制 Desktop runtime 的理由。
- **ALLOW（audit-only）** `packages/app/e2e`（Playwright spec/fixture/mock-server）：作为 fixed-source 审计面 byte-identical 登记（pass-2 SAME），**不作为 Android 运行门禁**——Playwright 不是 Android APK 硬门禁；本轮未运行 e2e。
- **DENY（routing）** 历史 M-021/files-bridge 类平台桥 payload 不由 #187 承载：`files-platform-bridge`/`attachments-share-bridge` 等 platform-bridge 家族保持 deferred，归 files/attachments 桥 owner 单元。
- **routing notes（7 absorbed + 5 deferred）**：7 条 absorbed（rows 56/57/60/63/64/74/75）按「v2.2.7 vendor pin byte-identity / active `timeline-messaging-v2-2-7`（panel-motion guard）/ active `tabs-inbox-titlebar-v2-2-7`（row 75 back bridge）」三类载体登记；5 条 deferred（`session-goal-sources-panels`→goal/sources 单元、`session-media-source-safety`→composer/media 单元 #188/#196 lineage、`settings-experimental`→settings/experimental 单元、`gui-plugins-api-migration`→gui-plugins/extensions 单元、`project-identity-migration`→identity 单元 #140 lineage）加「本轮未触碰 + owner」routing note，状态不翻转。panel-motion `:dir()` guard 是本轮唯一 active delta，#197 不得双落。
