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

## Issue #188：composer / queue / attachments crosswalk and allowlist

本节是 #188 的固定上游审计，不改变冻结的 v2.2.1 文档与前序 #186/#187 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--188-composer-queue-attachments`，分支 `feat/188-composer-queue-attachments`，base `e4a6dd1`（#187 链尾）。本轮 landing 是 active `composer-queue-attachments-v2-2-7`（#84）：v2.2.7 重 derive 已退役的 `attachments-upload-redirect-policy`（#12）/`files-platform-bridge`（#19）/`attachments-share-bridge`（#20）与 `session-media-source-safety`（#58）的 composer 侧 payload。

### 可复现 fixed-source 命令

```bash
# path set（composer / session composer / persistence / session-ui src）
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/app/src/composer packages/app/src/session/composer \
  packages/app/src/runtime/persistence packages/session-ui/src
# 逐文件 byte-compare：`git -C <upstream> rev-parse fedc6f2:<path>` 对 `git hash-object vendor/upstream/<path>`
# absence 负检：上列 D 条目在 vendored 树必须不存在
```

### 审计数字（2026-11-14 本轮可复现重放）

- 范围条目 **233 paths**（按目录：`composer` 57、`session/composer` 35、`runtime/persistence` 21、`session-ui/src` 120），对应 **116 commits**；形态分布 102 A + 125 M + 6 D（0 R）。
- 计划期审计：**227 present → 227 SAME + 0 DIFF；6 deleted-absent（0 present）**——上游删除的 `runtime/persistence/uuid{,.test}.ts` 与 `session-ui/src/components/markdown-worker-{queue,transport}{,.test}.ts` 在 vendored 树全部不存在。
- 本轮 landing 后重放（同命令同法）：**227 present → 216 SAME + 11 DIFF**——11 条 DIFF 全部是 active `composer-queue-attachments-v2-2-7` 的在册载体 hunks：`composer/{attachments/destination.ts,history/entry.ts,request.ts,request.test.ts,schema.ts,state.ts}`、`runtime/persistence/{drafts.ts,drafts.test.ts}`、`session/composer/{queue.ts,queue.test.ts,region.tsx}`（与 #187 轮 `screen.tsx` DIFF = #186 在册载体同一处理方式）；其余 216 条保持 byte-identical，absorbed by vendor pin。#84 targets 中不在本 allowlist 的文件（media/prompt/prompt-parts/persistence/fork/revert/entry/web 等）不在本审计范围内，由 `verify-closure.sh` 全树 byte-identity 覆盖。

### 行为 crosswalk

| fixed upstream commit | 目标行为 | #188 处置 | 证据/allowlist 归属 |
|---|---|---|---|
| `095098fd6a` | fix(app): drive the session queue with an explicit state machine (#61592)——queue machine 家族 | **absorbed**（vendor pin，queue-machine.ts 零改动） | `session/composer/queue-machine.test.ts` 等 SAME 集 |
| `17100fc529` | fix(app): give composer recovery, queue mutations, row stops and /reload explicit lifecycles (#62097)——queue mutation 生命周期 | **absorbed**（vendor pin）+ #84 在 queue.ts 加 per-attempt owner（machine 原生中止路径，queue.ts-local） | `session/composer/queue.ts`（DIFF = #84 在册载体）；queue.test 18/0 |
| `14df429e18` | fix(app): drive request slots and draft image retention through state machines (#61970)——drafts retention machine（drafts-machine） | **absorbed**（vendor pin，drafts-machine.ts 零改动）+ #84 drafts.ts fail-closed 媒体面 | `runtime/persistence/{drafts-machine.test.ts,drafts.test.ts}`；drafts.test 重 derive 后全绿 |
| `1c3decd370` | fix(app): drive composer history, shell mode and retry IDs through explicit state machines (#62021)——history/retry 机器 | **absorbed**（vendor pin）；#84 的 request.ts wire floor 与 v2.2.7 `retryFingerprint` 镜像共存（记录性偏差：images 不在 request.ts 重复把关，blobDataUrl 为执行点） | `composer/{history/entry.test.ts,retry.test.ts,request.test.ts}` SAME/载体集 |
| `42be645ad7` | fix(app): drive quote comment, upload and @-mention search lifecycles through state machines (#62016)——quote-comment/uploads/mention 机器 | **absorbed**（vendor pin） | `composer/{quote-comment-machine.test.ts,attachments/uploads.test.ts,suggestions/machine.test.ts}` SAME 集 |
| `65d59b9847` | fix(app): drive the composer focus handoff with an explicit state machine (#61924)——focus 机器 | **absorbed**（vendor pin） | `session/composer/focus-machine.test.ts` SAME 集 |
| `0e655ff2a2` | fix(app): keep pasted image bytes in memory so a deleted temp file can't break the send (#62057)——paste detach | **absorbed**（vendor pin）；#84 的 `sourceServerKey` 溯源与其正交（本地字节引用不携带远端 key） | `composer/attachments/uploads.test.ts` SAME；drafts.test 重 derive 集 |
| `0cb3d68f6e` + `490739afe7` | fix(app): retry failed namespace writes and settle load and clear races (#61766) / keep persisting after a localStorage quota failure (#61764)——persistence 稳健性 | **absorbed**（vendor pin）；#84 未解析引用以 `{mediaURI,sourceServerKey}` 持久化不阻塞 strict write（与其互补） | `runtime/persistence/{storage.test.ts,schema.test.ts}` SAME；drafts.test `unresolved` 用例 |

- **machine families（pin 携带）**：`09dcb47861`（composer morph/Grow springs）、`36bdbb8584`/`b6f3294e9d`（rewind/undo/redo——本轮仅 provenance threading，生命周期守卫归 #196）、`c3f9fbbce3`（optimistic prompt handoff 恢复）、`12c371e08d`（web search consent dock，#189 deny）等 `session/composer/*machine*` 与 `session-ui` 状态机族全部 byte-identical。
- **editor dom/actions 处置（一行）**：`composer/editor/{dom,actions,interaction,machine,...}` 家族 pin 携带（byte-identical），其 pin-carried 语义由 composer 门禁行使（set A 396 pass / 5 pre-existing fail 基线恒同），本轮零改动。
- **prompt-status/prompt-status-machine/comment-focus-machine/quote-comment-machine** 同为 pin 携带（SAME），#84 只加可选 `sourceServerKey` 溯源字段。

### deny audit

- **DENY（routing）** `#189` web search consent dock（`12c371e08d` 的 dock 面）：本轮不承载，保持其 owner 单元 routing。
- **DENY（routing）** `#196` runtime/server/client.tsx capture/generation/mediaApi seam 与 fork/revert 生命周期守卫套件：本轮明确不落（superseded-by-design 记录在 row 58 处置：queue.ts 本地 owner lease + 原生 client.tsx:89 media-loader 接线已覆盖其意图）。
- **DENY（routing）** `#199` 依赖升级类 payload（workspace-dependency-closure 等依赖面）：本轮不触碰。
- **EXCLUDED** `packages/core|server|schema|protocol` fs/media 服务端语义不在 vendored closure（同 #11 传统，从 pin cache 引证，不在本 probe 断言内）；`#168` 范围未触碰。

## Issue #189：request docks crosswalk and allowlist

本节是 #189 的固定上游审计（session/requests 请求 dock 面），不改变冻结的 v2.2.1 文档与前序 #186/#187/#188 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--189-request-docks`，分支 `feat/189-request-docks`，base `31f8399`（#188 链尾）。本轮 landing 方式 = **纯静态轮（零新 mobile patch）**：request docks 域 50 文件全部 byte-identical 于 v2.2.7 pin（v2.2.1-parity 性质），交付物为 `verify-permission-requests` 探针的 v2.2.7 重锚定（14 条 fact 级 old→new，全部「v2.2.7-context 漂移，非契约违约」）+ 单元文档事实同步；`patches:refresh` 未运行（登记面零改动），registry 保持 **84 registered / 6 active / 29 absorbed / 49 deferred** 不变。

### 可复现 fixed-source 命令

```bash
# ① 50 文件 docks surface 清单（canonical）
git -C /home/peterhan/repository/opencode ls-tree -r --name-only v2.2.7 -- packages/app/src/session/requests   # 34 files
# +16 extras：session-ui/src/components/{question-prompt.css,question-prompt-experimental.css,dock-prompt.tsx,message-part.css}、
#   session-ui/src/styles/index.css、ui/src/data-display/keybind/{keybind.css,keybind.tsx}、
#   app/src/session/composer/session-composer-region.tsx、app/src/session/question-switch.stories.tsx、
#   app/src/settings/experimental/experimental.tsx、app/src/settings/{model.tsx,model.test.ts,search-catalog.ts,search-results.test.ts}、
#   app/src/runtime/i18n/en.ts、ui/src/i18n/en.ts
# ② 逐文件 byte-compare：`git archive v2.2.7 packages | tar -x` 后 `cmp` 50 文件（vendor/upstream/<同路径>）
# ③ 全树核算：`diff -rq <v2.2.7 packages> vendor/upstream/packages` → Files differing 清单
```

### 审计数字（2026-11-14 本轮可复现重放）

- **docks surface：50/50 SAME + 0 DIFF + 0 MISSING**（34 requests 文件 + 16 extras 全部 byte-identical）。
- **全树核算：54 Files differing = 50 条 active-target union 成员 + 4 条 closure-trim package.json**（`ai/client/patchmark/plugin`）；50 条 DIFF 全部 ⊆ 六个 active patch 的 58-target 并集（其余 8 条为 vendor 侧新增文件，不在 pristine v2.2.7 清单内），0 条清单外 DIFF。
- 结论：request docks 域在当前链树上与 v2.2.7 上游 **零 delta**；唯一非 SAME 面与 #184–#188 在册载体完全重合（由 verify-closure.sh 全树 byte-identity 覆盖）。

### 逐 commit crosswalk（14 条 + inbox note）

| fixed upstream commit | 目标行为 | #189 处置 | 证据/allowlist 归属 |
|---|---|---|---|
| `7d0f79d2ca` | feat(app): make redesigned question dock opt-in (#59723)——question dock 重设计 opt-in 双形态 + question-state LRU 草稿缓存 | **absorbed**（vendor pin）；`newQuestionUI` 默认 false=classic 形 | `session-question-dock.tsx` thin router + `session-question-dock-{classic,experimental}.tsx` + `question-state.ts`（50-file SAME 集） |
| `9d89512e93` | fix(app): drive pane sizing and the question dock through state machines (#61949)——question/question-switch machine + 共享 controller | **absorbed**（vendor pin） | `question-machine.test.ts`/`question-switch-machine.test.ts`/`question-controller.ts`（machine 9-file 集 115/0/375） |
| `2b9216a002` | fix(app): settle permission replies and the session header fit through state machines (#61942)——permission-machine + model.ts machine reply effect + NotFound→reply.succeeded 计数 | **absorbed**（vendor pin） | `permission-machine.test.ts`；model.ts:244 reply effect、:249-257 NotFound 分类（探针组 1/2 重锚定锚） |
| `e5f2dde373` | fix(app): surface exhausted auto-approve permission requests (#61584)——auto-approve-machine | **absorbed**（vendor pin） | `auto-approve-machine.test.ts`；gave-up/idle 状态 + `needsUser` |
| `50971aedbf` | fix(app): bound MCP elicitation and auto-approve requests with explicit machines (#62111)——elicitation machine/controller + auto-approve sweep machine | **absorbed**（vendor pin） | `elicitation-machine.test.ts`/`elicitation-controller.ts`；auto-approve `dispatchSweep(sweep.start/cancel)` + `sweepLocations(signal)` |
| `12c371e08d` | fix(app): drive the web search consent dock through one state machine (#61962)——websearch machine | **absorbed**（vendor pin）；#188 deny audit 移交本单元的 routing 在此落地（零补丁需求） | `websearch-machine.test.ts`（SAME 集） |
| `443878def0` | fix(app): badge permission requests that auto-approve gave up on (#61736)——gave-up 徽标 | **absorbed**（vendor pin） | `auto-approve-machine.ts` `status: "gave-up"` + model.ts `needsUser` 消费（SAME 集） |
| `bd420e0b84` | fix(app): name the MCP tool and its input in the permission dock (#60548)——permission dock 命名 | **absorbed**（vendor pin） | `session-permission-dock.tsx`（byte-identical；三决策 ghost/neutral/submit 形在册） |
| `f73e2847ba` | fix(app): make URLs in questions, MCP prompts and errors clickable (#61514)——question 内 URL 可点 | **absorbed**（vendor pin） | dock classic/experimental byte-identical（SAME 集） |
| `d09e2c6c8d` | feat(app): add question notifications and sounds (#60358)——question 通知与声音 | **absorbed**（vendor pin）；通知投递面归 #195 | `notification.tsx`/i18n en.ts（SAME/在册集） |
| `53ad857b7a` | fix(app): preserve simultaneous request notifications (#60378)——并发请求通知保持 | **absorbed**（vendor pin） | 同上（SAME 集） |
| `524afbb2bb` | fix(session-ui): show the picked question answer as a raised card (#62896)——已选答案卡 | **absorbed**（vendor pin） | `question-prompt.css`/`question-prompt-experimental.css`/`dock-prompt.tsx`（SAME 集） |
| `bc7da10f3d` | fix(app): keep question options and submit controls reachable on mobile (#60335)——question 控件移动可达性 | **absorbed（=上游自身的 mobile fix）**：v2.2.7 已自带移动可达修复，vendored 树 byte-identical，无需移动补丁 | classic/experimental dock（SAME 集） |
| `7ed1f96e29` | feat(app): allow selecting question answer text (#60372)——答案文本可选中 | **absorbed**（vendor pin） | question dock/css（SAME 集） |

- **inbox note（a35d91bb8b，v2.2.1 pin 内既入）**：`shell/titlebar/inbox-model.ts` 的显式决策路径 `decide(entry, decision) → entry.ctx.data.session.permission.reply({…decision}).catch(requestFailed)`（v2.2.7 :450-458）由 a35d91bb8b「turn Home into a session inbox (#57281)」引入（2026-10-20，随 v2.2.1 pin 入树）。旧探针 pin `b4525d79bf` 不在该 merge 血统内（pin 晚于 a35d91bb8b），「wrapper 零 in-app caller」断言在 v2.2.1 时点已实质过期，但被探针 fail-fast 的前置断言（linear 闭集缺 auto-approve.ts）掩盖至本轮才暴露；#189 重锚定为 EXACT-SET {auto-approve.ts, shell/titlebar/inbox-model.ts}。

### 行为 crosswalk

- **question dock opt-in 双形态**（`7d0f79d2ca`）：thin router `settings.general.newQuestionUI()`（默认 false→classic），guards live 于 classic+experimental（各自 `sending()` 19 处、`if (sending()) return` 5/6 处、`disabled={sending()}` 9/10 处，grep 计数在案）；Esc reject 两形态均为 `const reject = form.dismiss` + `aria-keyshortcuts="Escape"`；draft 缓存 = `question-state.ts` `questionCache`（LRU 100），key = `ScopedKey.from(serverSDK.scope, untrack(input.request).id)`。
- **permission 三决策 once/always/reject**：dock 标签↔值映射如实登记——Deny 按钮文本标签为「Deny」，其 wired decision value = `reject`；Allow Always（neutral）= `always`；Allow Once（submit）= `once`。三按钮全部 `disabled={props.responding}`（count=3），responding 态由 permission-machine `isPermissionResponding` 承载。
- **六 machine 家族（pin 携带）**：permission（`2b9216a002`）、question/question-switch（`9d89512e93`）、auto-approve（`e5f2dde373`+`50971aedbf` sweep）、elicitation（`50971aedbf`）、websearch（`12c371e08d`）+ steer-background/question-keys（v2.2.1 既入，byte-same）。机器 9-file 测试集 **115 pass / 0 fail / 375 expect / 9 files** 恒同。
- **NotFound 显式计数为已答复**（`2b9216a002`，v2.2.7 语义重分类）：machine reply effect 中 `isPermissionNotFoundError(error) → { type: "reply.succeeded" }`（model.ts:249-257）——他端/TUI 已答的请求计为 replied 而非失败；真实失败 → `reply.failed` 携带 `error.message`，machine toast-failed effect 呈现 `common.requestFailed`。
- **auto-approve gave-up**（`443878def0`/`e5f2dde373`）：machine 状态 `gave-up` + `needsUser()` 让被放弃请求重新呈现给用户；sweep = `sweepLocations(signal)`（session.active ∪ 本地已知会话按 location 去重）+ machine `sweep.start/sweep.cancel` dispatch；「never loaded」残例注释逐字保留（:213-216）。
- **tab-strip 错峰同步（v2.2.1 pin 既入，非 v2.2.1..v2.2.7 delta）**：`running` 条件化的 `permission.sync(id)/form.sync(id)` spread + `window.setTimeout(…, 300 + props.index * 50)` + `Promise.allSettled`（2141b1ba35「defer inactive-tab sync…」#57617 引入，早于 v2.2.1）；tab-strip.tsx 不在 54-DIFF 清单（v2.2.1→v2.2.7 byte-same）。旧探针的 `permission.sync(value.id)` 锚在其书写 pin（b4525d79bf，早于 2141b1ba35 merge）成立，v2.2.1 起已实质过期，被 fail-fast 掩盖至本轮重锚定（`sync(id)` + running-conditioned 形）。

### deny audit

- **audit-only Playwright**：`e2e/regression/session-request-docks.spec.ts` 在册 byte-identical（vendor pin），本轮未运行、不作为 Android APK 门禁（#188 同口径）。
- **DENY（routing）** `appearance-motion-zoom`（→#197）：本轮不承载；其 pin 更新须同步 rebase `session-ui/src/components/question-prompt.css`/`message-part.css` 的载量（本轮 50-file SAME 集成员），#197 落地时按在册 targets 处理。
- **DENY（routing）** `settings-experimental`（→settings 单元 follow-up）：本轮不承载（`experimental/experimental.tsx`、`settings/model.tsx`、`search-catalog.ts` 等 SAME 集成员由 pin 携带）。
- **DENY（routing）** `session-goal-sources-panels`（→goal/sources 单元）：本轮不触碰。
- **DENY（routing）** notification delivery（→#195）：question/request 通知投递面不在本轮。
- **EXCLUDED** `#168` 范围未触碰；`packages/core|server|schema` permission 服务端语义不在 vendored closure（同 #10 传统，引 pin cache）。

## Issue #190：files / diff / review crosswalk and allowlist

本节是 #190 的固定上游审计（files / diff / review / Office 面），不改变冻结的 v2.2.1 文档与前序 #186–#189 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--190-files-diff-review`，分支 `feat/190-files-diff-review`，base `818b14e`（#189 链尾）。本轮 landing 是 active `files-diff-review-v2-2-7`（row 85）：v2.2.7 重 derive 四条退役 payload（rows 40/59/77/78 全部翻转 absorbed）的 files/diff/review 在册载体面。

### 可复现 fixed-source 命令

```bash
# 计划期审计命令（plan §1，2026-11-14 规划轮记录）：files/diff/review/Office surface
#   `git -C /home/peterhan/repository/opencode diff --name-status 3ebcf9a3… fedc6f20… -- <domain paths>`
#   逐文件 byte-compare：`git rev-parse fedc6f2:<path>` 对 `git hash-object vendor/upstream/<path>`
# 计划期记录结果：426 = 247 M + 175 A + 4 D → 422 present → 422 SAME + 0 DIFF；
#   4 条上游删除 = session-ui/src/components/markdown-worker-{queue,transport}{,.test}.ts 家族
#   （#188 section 已核对同一家族：上游删除文件在 vendored 树 0 present）。
# 本轮重放命令（同法、明确 19-path 口径；计划期全集 path 清单未随计划文本存档，
#   按 #187 先例以上列可复现命令与 vendored 树的当轮重放为准）：
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/session-ui/src \
  packages/app/src/workspaces packages/app/src/settings/workspaces \
  packages/app/src/session/revert.ts packages/app/src/session/revert-machine.ts \
  packages/app/src/session/revert-machine.test.ts packages/app/src/composer/submit.ts \
  packages/app/src/runtime/server/api.ts packages/app/src/runtime/server/api.test.ts \
  packages/app/src/runtime/platform/web.ts \
  packages/gui-plugins/src/file packages/gui-plugins/src/review packages/gui-plugins/src/microsoft-office \
  packages/protocol/src/groups/fs.ts packages/protocol/src/groups/vcs.ts packages/protocol/src/groups/worktree.ts \
  packages/client/src/promise/generated/client.ts packages/client/src/promise/generated/types.ts \
  packages/schema/src
# 逐文件 byte-compare：`git -C <upstream> rev-parse fedc6f2:<path>` 对 `git hash-object vendor/upstream/<path>`
# absence 负检：上列 D 条目在 vendored 树必须不存在
```

### 审计数字（2026-11-14 本轮可复现重放）

- **本轮重放（19-path 口径）**：284 entries = 146 M + 134 A + 4 D → 280 present → **277 SAME + 3 DIFF**。4 条 D = `session-ui/src/components/markdown-worker-{queue,transport}{,.test}.ts`（与计划期记录同一删除家族，vendored 树 0 present——#188 section 负检继续成立）。
- 3 条 DIFF 全部为在册载体 hunks（与 #187 轮 `screen.tsx`、#188 轮 11 条 DIFF 同一处理方式）：`app/src/session/revert.ts`（#188 active `composer-queue-attachments-v2-2-7` 的 M-016 provenance hunk）、`app/src/workspaces/files/artifact.test.ts` 与 `session-ui/src/pierre/index.ts`（本轮 active `files-diff-review-v2-2-7` 的重 derive hunks）。其余 277 条保持 byte-identical，absorbed by vendor pin。
- **补丁 targets 的澄清（诚实登记）**：`session-ui/src/pierre/worker.ts` 与 `app/src/runtime/platform/web.ts` 在 v2.2.1→v2.2.7 之间 byte-same（不在 diff entries 内，故不在 280 present 清单），其 vendored 形态与 pin 的差异完全来自在册 mobile 载体（#85 worker hunks；#184/#188 M-011/M-020 + #85 M-041）；`pierre/pool-strategy.ts` 为 vendored-new 文件（两个 pin 均不存在）。这三条由 `verify-closure.sh` 全树 byte-identity（V3 replay 含 #85 按序重放）覆盖，不重复计入本 allowlist。
- 计划期审计（426 entries → 422 SAME）与本轮重放（284 entries → 277 SAME）的差额为清点口径差（计划期 path 全集更宽，含未随计划文本存档的目录面）；两类记录的 DIFF/删除归因一致，以上列可复现命令的当轮重放为准（#187「计划期 vs 当轮重放」同一先例）。

### 逐 commit crosswalk（14 条）

| fixed upstream commit | 目标行为 | #190 处置 | 证据/allowlist 归属 |
|---|---|---|---|
| `621f0ee53f` | fix(app): explicit review folder loads, render gate and narrow scroll restore (#61999)——review diff machine 族（folder/review-diff/scroll machine） | **absorbed**（vendor pin） | `gui-plugins/src/review/{machine,folder-machine,scroll-machine,render-machine}.test.ts`（baseline c 430/0 恒同集） |
| `c9a9ac1ee8` | fix(session-ui): drive mentions, attachment media, review resize and diff mounts from machines (#62095) | **absorbed**（vendor pin） | `session-ui/src` machine 族 SAME 集 |
| `c293e53511` | fix(session-ui): drive the Pierre viewer render lifecycle with one state machine (#61938)——viewer render machine 自持 pool fallback | **absorbed**（vendor pin）；#85 不再重 derive file.tsx createPoolReady hunk（superseded，render-machine.test.ts:116-141 行为级锁定） | `session-ui/src/pierre/render-machine{,.test}.ts`；baseline (b) 27/0 恒同 |
| `fe19d9b799` | fix(session-ui): drive file media, find, sources expand and markdown parse jobs through state machines (#61980) | **absorbed**（vendor pin） | `session-ui/src` SAME 集 |
| `5ea5c5e610` | fix(gui-plugins): drive the Pierre file tree through one state machine (#61954) | **absorbed**（vendor pin）；row 78 fill chain 的 native 基础（`packages/ui/src/styles/file-tree.css:15-27` `:has(> file-tree-container)`）在此形态内 | `gui-plugins/src/file/pierre-tree{,.test}.tsx`（baseline c SAME 集） |
| `118d967743` | fix(gui-plugins): make file view scroll, Git init and Open in app explicit state machines (#62018) | **absorbed**（vendor pin） | `gui-plugins/src/file` SAME 集 |
| `91202e6faf` | fix(session-ui): render partial diffs when review expand mode is on (#62241) | **absorbed**（vendor pin） | `session-ui/src/v2/components` SAME 集 |
| `e23d54ca75` | fix(app): show Open in only in file and review headers (#62174) | **absorbed**（vendor pin）；OpenInApp contract gate 由 verify-diff 组 6 锚定 | `gui-plugins/src/review/panel.tsx`、`file/renderer.tsx`（SAME 集） |
| `b8a9e8a73f` | fix(app): show load failures in review previews, details changes, file search and Word pages (#62114)——review diff machine 失败态 + retryDetails | **absorbed**（vendor pin）；verify-diff 组 1 的 details retry 锚即此形态 | `gui-plugins/src/review/model.ts`（SAME 集） |
| `47cace689a` | fix(app): make settings account holds, worktree delete check, extension lists and picker cache explicit machines (#62103)——workspace delete machine（canDelete preflight gate + force 链） | **absorbed**（vendor pin）；verify-diff 组 3 重锚定锚（`canDelete: state.preflight.status === "ready"` + `start({ force: true })`） | `app/src/settings/workspaces/delete-machine{,.test}.ts`（SAME 集） |
| `6469454d35` | fix(app): show failed and offline review diffs instead of a clean tree (#61862) | **absorbed**（vendor pin） | review diff machine offline/failure context（SAME 集） |
| `602725f572` / `331a3b9c7f` / `d22f9b8eb3` | fix(session-ui): file line selection / focused review comment reveal / line comment drafts in explicit state machines (#61933/#61819/#61816) | **absorbed**（vendor pin） | `session-ui/src/pierre/selection-machine{,.test}.ts` 等（baseline b 27/0 恒同集） |
| `c777f9a24e` / `e42ac691d5` | fix(app): reread a workspace file changed during its read (#61818) / reload a file tree directory changed during its listing (#61814) | **absorbed**（vendor pin）；files watcher 面 pin 携带（`server.connected` 重订阅、filesystem.changed 订阅） | `app/src/workspaces/files/{watcher,content-machine,tree-machine}.test.ts`（baseline a SAME 集） |
| `66c278b559` | fix(session-ui): compute highlight styles once per subtree in Chromium (#60513) | **absorbed**（vendor pin）；#85 的 shiki-js 引擎 + pierre 内置主题对适配与其正交（引擎选择是 WebView wasm 面，不是样式计算面） | `session-ui/src/pierre/index.ts`（DIFF = #85 在册载体） |

### deny audit

- **DENY（routing）** `gui-plugins-api-migration`（@pierre/trees beta.6 基线族）不是 #190 的 payload：其 beta.6 baseline 锚由 `verify-pierre-webview-compat` dependency-baseline 测试与 verify-files 组 10 继续锁定，本轮零改动；#190 注册 reason 不承载该 patch 的 targets。
- **DENY（routing）** `session-workbench-upstream` overlap：其与 review/files 面的重叠 hunks 已随前序轮 absorbed（#188 已核对 session-workbench 面），本轮不重复登记、不翻转。
- **ALLOW（audit-only）** `packages/app/e2e` specs：作为 fixed-source 审计面 byte-identical 登记，**不作为 Android 运行门禁**（Playwright 不是 Android APK 硬门禁）；本轮未运行 e2e。
- **EXCLUDED** `packages/core|server` vcs/fs 服务端实现不在 vendored closure（同 #12 probe 传统，从 pin cache 引证，不在本 probe 断言内）；`#168` 范围未触碰。

## Issue #191：terminal / PTY crosswalk and allowlist

本节是 #191 的固定上游审计（terminal / persistent-PTY 面），不改变冻结的 v2.2.1 文档与前序 #186–#190 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--191-terminal-pty`，分支 `feat/191-terminal-pty`，base `018a60a`（#190 链尾）。本轮 landing 方式 = **纯静态轮（零新 mobile patch、零 vendor delta）**：terminal surface 全部 byte-identical 于 v2.2.7 pin（v2.2.1→v2.2.7 的 persistent-PTY 重组 **absorbed by vendor pin**），交付物为 `verify-terminal` 探针的 v2.2.7 全量重锚定（issue #13 的旧 pty 面探针退役、persistent-PTY 面新锚 + 6 条 in-memory 负注入 drill）+ `docs/design/units/terminal.md` 重写为 persistent-PTY 契约；`patches:refresh` 未运行（登记面零改动），registry 保持 **85 registered / 7 active / 33 absorbed / 45 deferred** 不变。

### 可复现 fixed-source 命令

```bash
# terminal / persistent-PTY surface（9-path 口径，2026-11-14 本轮重放）
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/gui-plugins/src/terminal \
  packages/client/src/solid/pty.ts \
  packages/client/test/solid-pty-protocol.test.ts \
  packages/client/test/solid-pty.test.ts \
  packages/protocol/src/groups/persistent-pty.ts \
  packages/protocol/src/groups/pty.ts \
  packages/protocol/src/errors.ts \
  packages/schema/src/persistent-pty.ts \
  packages/app/e2e/utils/persistent-pty.ts
# 逐文件 byte-compare：`git -C /home/peterhan/repository/opencode rev-parse fedc6f2:<path>`
#   对 `git hash-object vendor/upstream/<path>`；absence 负检：上列 4 条 D
#   （gui-plugins/src/terminal/{serialize,state}{,.test}.ts）在 vendored 树必须 0 present
#   （上游删除家族，同 #188/#190 markdown-worker 先例）。
```

### 审计数字（2026-11-14 本轮可复现重放）

- **本轮重放（9-path 口径）**：**106 entries = 22 A + 4 D + 80 M → 102 present → 102 SAME + 0 DIFF（vendored 0 absent）**。4 条 D = `gui-plugins/src/terminal/{serialize,state}{,.test}.ts`（客户端序列化快照家族：上游删除，vendored 树 0 present——客户端持久快照被服务端 snapshot/checkpoint 取代）。
- **terminal surface DIFF = 0 vs pristine**：全部 102 条 present（含 `client/test/solid-pty{,-protocol}.test.ts`、`app/e2e/utils/persistent-pty.ts` 审计面）逐文件 `git rev-parse fedc6f2:<path>` ≡ `git hash-object vendor/upstream/<path>`；零 mobile 载体 hunks、零 vendored-new——终端面本轮**纯吸收**（对比 #190 轮 3 DIFF 在册载体形态）。
- `packages/protocol/src/groups/pty.ts`（旧 pty 协议组）在两 pin 之间 byte-same（0-entry 路径入 9-path 集作**退役面记录**）；`client/src/solid/{data,index}.ts`、`schema/src/{pty,pty-ticket}.ts` 同为 byte-same 不入集。

### commit crosswalk（上游提交 → 本轮 absorbed 判定）

| commit | 主题（上游） | 判定 | 载体（vendored 形态） |
| --- | --- | --- | --- |
| `067b741783`（2026-10-29，#60323） | refactor(client): share the persistent pty protocol | **absorbed**（vendor pin） | `client/src/solid/pty.ts` 协议共享面（PersistentPtyMessage 7 变体 + persistentPtyFrame 5 字节帧 + createPersistentPtyClient）+ `client/test/solid-pty-protocol.test.ts` 新增（SAME 集） |
| `a070e11643`（2026-10-29，#60327） | test(app): mock persistent pty routes | **absorbed**（vendor pin） | `app/e2e/utils/persistent-pty.ts` 新增（SAME 集；e2e audit-only，不作为 Android 门禁） |
| `ef712d3a78`（2026-10-30，#60346） | feat(app): move the desktop terminal to persistent PTYs | **absorbed**（vendor pin） | terminal UI 整体迁移：`terminal/{terminal,model,panel,renderer,tab}.tsx(x)` 重写、`{serialize,state}{,.test}.ts` 删除（4 D）、`connection.ts`+`connection.test.ts` 新增；e2e `terminal{,-input,-focus}` spec 重排（e2e-only） |
| `65c0d83f4d`（2026-10-30，#60329） | feat(core): rename persistent terminals | **absorbed**（vendor pin） | rename + 501 面：`protocol/src/groups/persistent-pty.ts` update 描述（"Renaming fails with 501…"）+ `errors.ts` `PtyFeatureUnsupportedError`（httpApiStatus 501）+ `schema/src/persistent-pty.ts` |
| machine family（`0c441474bd`/`8f3f7b74c9`/`fff729917e`/`ee6b87031c`/`5e76d6a9b1`/`2a9c54c04f`，2026-11-04/05，#61650/#61847/#61852/#61940/#61941/#62004） | 终端面状态机化（server-list machine / surface remount / focus+rename / connection-machine / pane-machine / dispatch+quote-machine） | **absorbed**（vendor pin） | 22 A 中 18 条 machine/props 文件（machine/surface/focus/rename/pane/connection/quote 六 machine 族 + dispatch + inline-rename + props）+ machine.ts 的 stale-answer 拒绝/failed-list retry 链（SAME 集） |

### 行为 crosswalk

- **persistent-PTY 协议面**（`067b741783`）：`PersistentPtyMessage` 7 变体（attached/replay_complete/resized/controller_changed/exited/title_changed/foreground_process_changed）；`persistentPtyFrame` 二进制帧 = byte0（data?1:0）+ u16BE cols + u16BE rows + payload@5；`createPersistentPtyClient`：ticket header `x-opencode-ticket: "1"`、ws 路径 `api/experimental/persistent-pty/:ptyID/connect`、query `cursor`/`attachment_id`/`takeover`/`input_protocol`、`binaryType="arraybuffer"`、`openSocket?` 注入 seam。旧 `pty` 协议组在 `protocol/src/groups/pty.ts:9-12` 逐字存活为退役面（常量由 persistent-pty 组 re-export）——决策：**保留为退役面记录**（探针组 1 断言常量，旧端点描述退役）。
- **snapshot/cursor/takeover connect**（`ef712d3a78`）：connect 链 = `persistentPty.snapshot({ptyID})` → `connection.restore({size: snapshot.info.size, checkpoint: snapshot.checkpoint})` → `createPersistentPtyClient(...).connect({ptyID, cursor: snapshot.info.output.tail, attachmentID, takeover: true})`——快照先恢复屏幕、cursor=服务端 output.tail、takeover 显式接管；`inputProtocol !== 1` → `outdated` 分类（serverOutdated 文案）。
- **rename + 501**（`65c0d83f4d`）：`persistentPty.update({ptyID, title})`（null 清除恢复 shell 标题）；`PtyFeatureUnsupportedError`（501）→ `rename.failed kind:"unsupported"` → `toast-rename-failed` → `rename.unsupported` toast（en 逐字"Terminal renaming will be available after OpenCode's terminal service restarts"）；socket `title_changed` 消息被 connection machine **刻意忽略**（connection-machine.test「ignores what changes nothing」在册），标题经 `persistent-pty.updated` 事件 → `terminal.updated` 分发到达 UI。
- **never-reconnects**（machine family）：connection-machine.ts:19 逐字「One WebSocket attachment to a persistent PTY. It never reconnects: after a failure the surface mounts a new terminal with a new attachment and a new state.」——旧退避重连/探活 clone 家族整体退役；恢复 = surface-machine remount（missing → issued+1 → mounted；failed mount 在更新的 server connection 列表后恰重挂一次）+ failed-list retry（panel retry 按钮 → model `session.retry` → 仅 failed 列表可重试）+ stale 拒绝（list attempt 守卫 + rename attempt 守卫）。
- **disconnect 红线（v2.2.7 形态）**：terminal.tsx 零 `persistentPty.remove`/`kill(`；`close(1000)` 恰 2 处（stop() 在途 socket + aborted-connect；**旧 pin 计 3 → 本 pin 计 2 的回落如实登记**——onCleanup persist-close 随 persistTerminal 退役）；cleanup = `connection.dispose()` + `dispatch({type:"disposed"})`（dispose-only，零持久化零终止）；`persistentPty.remove` 全域恰 {model.ts close-terminal}（close.requested 单入口 + `isPtyNotFoundError → close.succeeded` 吞错配对——已退出终端的 close 不算失败）。
- **mobile face**（上游原生）：`frame.placement() === "mobile"` 分支（panel.tsx:40）+ 移动 Panel 注册 order 30/kind menu/icon terminal（renderer.tsx:230-238）+ session.panel 菜单 order 20（renderer.tsx:155-171）+ mod+w close 命令 presence（face，非调用集）；queue-resize 效应（connection-machine 3 处发射 + connection.ts writer 排序含 `\x1bc` reset + base64 checkpoint）+ pane-machine 100ms debounce/seq 守卫/首测即用/pendingInput 顺序冲刷；en+zh 终端 i18n 键（loading/close/tab.title/command.new 宽容键型）；终端目录 visualViewport 零命中记录（app 壳软键盘锚归 verify-interaction-quality，其组 3 断言 stale-on-v2.2.7 待自身重锚）。

### deny audit

- **DENY（deny replay）** `session-workbench-upstream`（absorbed）terminal sections：其 v2.2.1 目标集不含 gui-plugins/terminal 生产路径；上游终端 e2e（`terminal-input.spec.ts`/`terminal-focus.spec.ts` 删除 → `terminal.spec.ts`/`component-tests/terminal.spec.ts` 新增，`ef712d3a78`）为 **e2e-only old/new-shape**——旧形 spec 不入 vendored 回放（deny replay），新形 spec 为 audit-only（Playwright 不是 Android APK 硬门禁，本轮未运行）。
- **DENY（routing）** `gui-plugins-api-migration`（deferred）：targets 逐条核对**零 terminal 目标**（无 `gui-plugins/src/terminal/**`）——本轮不触碰，owner 不变。
- **DENY（routing）** `ghostty-web` 升级/替换 payload → `#199`（依赖升级类，同 #190 deny audit 口径）：本轮不触碰；vendored `ghostty-web@0.3.0` 由 build-dependency closure 承载（`Ghostty.load()` 加载面归 G24①）。
- **EXCLUDED / zero-touch** `app-ssh-bridge`（absorbed）：targets 恰 {`entry.tsx`}，终端面零触碰（SSH 隧道 ws 帧透传论证沿 units/terminal.md 专节）；`packages/core|server` persistent-pty 服务端实现（daemon/checkpoint/ticket 语义）不在 vendored closure（从 pin cache 引证，不在探针断言内）。

## Issue #192：provider / model / usage crosswalk and absorption audit

本节是 #192 的固定上游审计（provider 连接流 / 模型选择器 / usage 面的 v2.2.7 吸收核对），不改变冻结的 v2.2.1 文档与前序 #186–#191 section。比较对象仍为 `3ebcf9a32c7b28f658cfee80775448929361727a` → `fedc6f208aa2bd54c1019227214568083f6380ad`，审计在只读上游仓库 `/home/peterhan/repository/opencode` 完成；实现 worktree 为 `/home/peterhan/worktrees/opencode-mobile/feat--192-provider-model-usage`，分支 `feat/192-provider-model-usage`，base `ad88e80`（#191 链尾）。本轮 landing = **agent-selector 重基（唯一幸存 mobile delta，#86 patch）+ verify-provider-models v2.2.7 连接状态机面全量重锚定（33 条 old→new）+ rows 65/69/71 翻转 absorbed**；registry **86 registered / 8 active / 36 absorbed / 42 deferred**。

### 可复现 fixed-source 命令

```bash
# provider/model/usage target surface（2026-11-14 本轮重放）
git -C /home/peterhan/repository/opencode diff --name-status --find-renames \
  3ebcf9a32c7b28f658cfee80775448929361727a fedc6f208aa2bd54c1019227214568083f6380ad -- \
  packages/app/src/providers packages/app/src/usage \
  packages/app/src/session/usage-exceeded-dialogs.tsx \
  packages/schema/src packages/protocol/src packages/client/src
# 逐文件 byte-compare：`git -C /home/peterhan/repository/opencode rev-parse fedc6f2:<path>`
#   对 `git hash-object vendor/upstream/<path>`；post-#192 差异恰为 #86 载体 3 文件。
# blob-ancestry：`git -C <upstream> rev-parse <b-side-blob>^{blob}` +
#   `git log --all --find-object=<blob> --oneline`（rows 69/71 处置证据）。
```

### 审计数字（2026-11-14 本轮可复现重放）

- **本轮重放（target surface 口径）**：**85 entries = 30 A + 50 M + 2 D + R061/R071/R087（62 commits 触及）→ 83 present → 82 SAME + 1 DIFF（selection.tsx = #86 在册载体）+ 2 absent（D）**。口径注记：计划期记录「74 commits / 45 files 39M+8A+2D/R+1R071」为 plan-review 范围口径，本轮以本节命令实测为准——两口径的结论一致（见下）。
- **base（ad88e80）target-area DIFF = 0**：83 条 present 逐文件 byte-compare 全 SAME（reviewer 在册事实，本轮 byte-compare 复核一致）——v2.2.1→v2.2.7 的 provider/usage 重组 **absorbed by vendor pin**。post-#192 与 pin 的差异恰为 `providers-models-usage-v2-2-7` 的 3 targets（agent.ts / agent.test.ts / selection.tsx——前两者两 tag 间 byte-same、不入 tag-diff 集）。
- 验证面：13-file vendor provider/usage 集（双条件形）**136 pass / 0 fail / 389 expect**（c0 133/0/385 + agent.test +3 用例）；verify-provider-models 重锚定后 **rc=0**（fourPkgFiles=2204 / domainFiles=72 / osScanFiles=72）；mobile-hosts **446/0/3034**、session-ui 9-file **139/0/436** 恒同。

### commit crosswalk（上游提交 → 本轮 absorbed 判定）

| commit | 主题（上游） | 判定 | 载体（vendored 形态） |
| --- | --- | --- | --- |
| `eb06c3cfd2`（#59976） | feat(app): redesign the integrations dialog | **absorbed**（vendor pin） | connect/dialog.tsx 集成对话框重设计 origin（b-side 28b2830b 的前身） |
| `d9d3548548`（#60200） | fix(app): match search dialog radius and background | **absorbed**（vendor pin） | connect/dialog.tsx b-side blob `28b2830b` 引入者（present SAME） |
| `c8746a1c14`（#58238） | refactor(app): remove unused re-exports, dead helpers, internal-only exports | **absorbed**（vendor pin） | go-upsell-hero-art.ts `HeroPalette` unexport / controller 导出清理 origin |
| `8505041881`（#60603） | feat(app): guide Claude Agent setup before connecting | **absorbed**（vendor pin） | connect/controller.ts b-side blob `22e3c74e` 引入者 + **claude.replace 凭据移除面**（探针 G1 remove 集第三站点） |
| `5f0d45c779`（#61998） | fix(app): drive the Go hero loop, model picker flyout and drawer… through state machines | **absorbed**（vendor pin） | go-upsell-hero-machine.ts + models/select-dialog-machine.ts 新增；go-upsell-hero-art.ts b-side blob `a19c515d` 引入者 |
| `404259b212`（#61929） | fix(app): drive model selection through one workspace state machine | **absorbed**（vendor pin） | models/selection-machine.ts 新增 + selection.tsx per-workspace opener（探针 G2/G5 重锚目标） |
| `6eb22e77b7`（#61974） | fix(app): drive usage, worktree delete, MCP toggles and the QR scanner through state machines | **absorbed**（vendor pin） | usage/machine.ts + connect/mcp-machine.ts 新增 |
| `b9e8b04d21`（#61917） | fix(app): drive the connect-provider dialog and Console catalog wait with explicit state machines | **absorbed**（vendor pin） | connect/dialog-machine.ts 新增（`CONSOLE_INTEGRATION="opencode"` 现址） |
| `7f24020fb2`（#61610） | fix(app): drive provider connection from an explicit state machine | **absorbed**（vendor pin） | connect/machine.ts 新增（connectMethods「Same order as the TUI」:165-170、tagged cancel 效应、command signIn 状态现址） |
| `f39aa60608`（#62102） | fix(app): recover MCP sign-in and provider form steps that could get stuck | **absorbed**（vendor pin） | connect/form-machine.ts 新增（providerFormDefaults 行为测试现址；connect-methods.test.ts 的取代面） |
| `e42f6d1016`（#58694） | feat(core): read OpenCode Console usage limits and classify budget refusals | **absorbed**（vendor pin） | **schema/src/usage-limits.ts blob `c8b6566`（76 行）引入者**——blob-ancestry 修正：非 `3eb834b85a`（后者 #57897 触碰 `packages/tui/src/util/usage-limits.ts`） |
| `33ffc3e58d`（#58714） | feat(app): show Console budgets and Go usage where they stop you | **absorbed**（vendor pin） | usage/**（dialog/format/limits/model）+ usage-exceeded 面 origin；usage-limits schema 同 blob 在册 |
| `3eb834b85a`（#57897） | fix: type the Go and ChatGPT usage limits | **negative attribution（修正）** | 仅触及 `packages/tui/src/util/usage-limits.ts`；app schema blob 引入者为其后继 e42f6d1016/33ffc3e58d——本轮 audit record 纠正该归因 |

### rows 69/71 blob-ancestry 处置表（翻转 absorbed 的证据）

| row | b-side blob 判定（逐 target，`git rev-parse 3ebcf9a3:<path>` 对照） |
| --- | --- |
| 69 `provider-connect-flow-redesign` | chatgpt-usage-limit.stories.tsx（233bff92）与 chatgpt-welcome.stories.tsx（679f2a17）**byte-identical 于 pristine pin**；controller.ts（22e3c74e）/ dialog.tsx（28b2830b）/ dialog.stories.tsx（fecb69ce）/ go-upsell-hero-art.ts（a19c515d）**== v2.2.1 目标树 blob** 且 v2.2.7 演进面在册（行为概念 native 于 machine/dialog-machine/form-machine/mcp-machine/go-upsell-hero-machine 族）；credentials/ 三件**两 tag 均缺席**；connect-methods.test.ts（mobile 自创 d88ff605，两 tag 均无）**superseded**（form-machine.test.ts 默认值覆盖）；en.ts b-side 为 mobile i18n delta——25 键中 24 键 byte-identical 重落于 v2.2.7 en.ts，`dialog.provider.group.mcp` design-superseded（v2.2.7 将 MCP 移出 connect 流——dialog.tsx 过滤 `metadata.source !== "mcp"`，**MCP sign-in UI 面路由 #193**；计划期「3 i18n keys design-superseded」口径按本轮实测 1 键修正登记） |
| 71 `model-selector-usage-parity` | 11 条 new-file b-side 全部为上游内容：8 条 **byte-identical 于 pristine pin**（details.tsx bb84cf6 / usage/dialog.css a36d458 / usage/format.ts c8c101a / usage/limits.test.ts 833c3b9 / usage/limits.ts aba16c1 / usage/model.tsx 33c2a28 / protocol/groups/usage.ts 5c0528d / schema/usage-limits.ts c8b6566）+ 3 条 == v2.2.1 目标树（manage.css 3e2f97e / usage/dialog.stories.tsx f09f75a / usage/dialog.tsx bb94788，v2.2.7 演进面在册——usage/dialog.tsx:103/147-151 原生 signed-out 分支即本 pin 现形）；全部 modified-file b-side == v2.2.1 目标 blob（manage/provider-group/search/select-dialog 族/unpaid 族/usage-exceeded-dialogs）；generated client.ts/types.ts/data.ts/api.ts b-side 两 tag 均无——由 v2.2.7 pin 自有 usage-limits 闭合承载（vendored client/protocol/schema 面 byte-identical 于 pristine）；en.ts 86 键全部 native 重落；v2.2.7 另增 select-dialog-machine / selection-machine / usage-machine |
| 65 `session-agent-selector` | agent.ts b-side `c97ec4f` **无上游祖先（mobile delta）**；selection.tsx b-side `b3c9b69` 基于旧 v2.2.1 邻域（`store.current` 回退形）——payload 由 **#86 `providers-models-usage-v2-2-7` 重 derive 承载**（v2.2.7 形态重基：`desktopAgentsVisible` 拆分 + `list()[0]?.name` 回退门控 + android-host import）；历史 payload 与语义 ID 保留 |

### agent-selector 重基记录（#86）

- 重基点：v2.2.7 selection.tsx:337 `agentsVisible = settings.visibility.customAgents() || hasCustomAgent(list())`（desktop 语义，无 Android 感知）拆分为 `desktopAgentsVisible`（原表达式）+ `agentsVisible = shouldShowAgentSelector({android: isAndroidMobileHost(), preference: …, agents: list()})`；v2.2.7:428 的默认 agent 回退已从旧 payload 的 `store.current` 变为 `list()[0]?.name`——`current()` 门控对象改为 `desktopAgentsVisible()`，回退形保持 v2.2.7 原样。
- import 依赖：`isAndroidMobileHost()` 来自 `@/settings/servers/android-host`（`server-edit-touch-compatibility` 在册模块；导出名已核验）→ manifest `dependsOn: ["server-edit-touch-compatibility"]`（validator 支持：依赖必须 active 且序位在前）。
- 测试：pristine `agent.test.ts`（v2.2.7 上游已有）追加 3 条第一方用例（android=true → 可见；desktop 无偏好且无 custom → 隐藏；custom agent 在场 → 恒可见）——#185 fade.test.ts / #187 panel-motion.test.ts via-patch 回归测试先例。

### deny audit

- **DENY（routing）** **MCP sign-in UI 面 → #193**：v2.2.7 将 MCP 移出 connect 流——connect/dialog.tsx:247-253 过滤 `metadata.source !== "mcp"`（注释逐字「MCP servers are connected and managed from the MCP dialog, not here.」）；provider-connect-flow-redesign（row 69）历史 payload 中的 MCP picker 分组/`dialog.provider.group.mcp` 键不重 derive；MCP 连接/管理 UI 的移动适配归 issue #193。
- **DENY（ai fixes）** row 69/71 与 ai 包相关修复 **pin-carried，不重实现**：vendored `packages/ai` 为 pin 形（verify-closure byte-identity 在册）；mobile-hosts 全域 `@opencode/ai` import 零命中（探针组 6 rc=0 在册）——无移动侧 ai 载体 hunks。
- **DENY（routing）** `settings-providers-models-extensions`（row 47，deferred）：targets 中 provider 侧（`providers/connect/mcp.ts` mcp.connect/disconnect 命名 hunk、`settings/providers|models` 目标形）已被 pin 吸收或属 #86/#193 范围——provider-side targets absorbed by pin；其余 targets（extension/plugins 面）**路由 #193**，本轮不触碰。
- **DENY（routing）** `gui-plugins-api-migration`（row 37，deferred）：provider/connect 相邻 targets（`providers/connect/remote.test.ts`）属 pin 吸收面；本体（extension/plugin API 迁移）**路由 #193**，本轮零触碰。
- **EXCLUDED** 真实凭据链/设备面：no-credential 态 = v2.2.7 原生 `usage/dialog.tsx:103`（`limits === null → { kind: "signed-out" }`）+ :147-151 signed-out 分支（`usage.signedOut.title/body`）——**native，非移动补丁**；真实凭据链与设备走查 BLOCKED 边界原样保留（解除条件=真实凭据 / 授权设备）。
