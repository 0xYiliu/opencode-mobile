# v2.2.7 上游对齐执行卡

## 工作单元 / 用户可观察目标

将固定的 Windows Desktop 对齐目标从 v2.2.1 切换到 v2.2.7；保留 v2.2.1 为冻结历史快照；完整记录 v2.2.1→v2.2.7 的 Desktop 与共享前端闭包变化；在不复制 Electron Desktop 运行时的前提下，重建 Android vendor 闭包和移动补丁链。

## 关联记录

- GitHub Issue：[#182](https://github.com/0xYiliu/opencode-mobile/issues/182)
- 当前子工作单元：[#184](https://github.com/0xYiliu/opencode-mobile/issues/184)（连接、配对与 SSH 共享闭包）
- 当前子工作单元：[#185](https://github.com/0xYiliu/opencode-mobile/issues/185)（Home 与新建会话 v2.2.7 对齐）
- 当前子工作单元：[#186](https://github.com/0xYiliu/opencode-mobile/issues/186)（tabs / Inbox / titlebar 与 Android back bridge）
- 旧版本矩阵：[v2.2.1](../v2.2.1/matrix.md)
- 新版本目录：[v2.2.7](.)

## 基准与工作区

- 绝对工作目录：`/home/peterhan/.local/share/opencode/worktree/a66c79/feat-upstream-227-tabs-inbox-titlebar`
- 分支：`feat/186-tabs-inbox-titlebar`
- 父轮审计起点：`5b7f1ac1d1b707db36f6fde6e768dc4f06e3063a`（#184/#185 已进入 main 的 v2.2.7 closure 基线）
- 本次实施 base/current HEAD：base `5b7f1ac1d1b707db36f6fde6e768dc4f06e3063a`；当前 #186 diff 未提交、未创建 PR、未推送、未合并
- 本次实施 worktree：`/home/peterhan/.local/share/opencode/worktree/a66c79/feat-upstream-227-tabs-inbox-titlebar`
- 本次实施分支：`feat/186-tabs-inbox-titlebar`
- 开工状态：该 worktree 由本子工作单元独占；前三个 active patch payload/hash/order 作为硬不变量保留，新增 #186 active patch 与对应文档/验证记录
- 上游旧目标：v2.2.1 / `3ebcf9a32c7b28f658cfee80775448929361727a`
- 上游新目标：v2.2.7 / `fedc6f208aa2bd54c1019227214568083f6380ad`
- 新目标发布时间：2026-11-10

## 当前 vendor 与补丁基线

- 全局 vendor pin：`fedc6f208aa2bd54c1019227214568083f6380ad`（v2.2.7）
- 当前 `packageSources`：空；11 个 closure package 均从固定 v2.2.7 目标提取
- 当前移动补丁：82 registered / 4 active / 19 absorbed / 59 deferred；`vendor-manifest.json#closurePatches` 先重放 build-only closure 修复，`vendor-manifest.json#mobilePatches` 按顺序重放 #184 consolidated overlay、继承自 origin/main 的 `server-edit-touch-compatibility` patch、#185 `home-new-session-v2-2-7` patch，再重放 #186 `tabs-inbox-titlebar-v2-2-7` patch；#184 overlay 仍只包含 24 个 scoped targets
- 当前客户端身份：Android/mobile `2.2.7`，versionCode `20207`；vendor app 包为 `2.2.7`
- 当前补丁登记门禁：`python3 scripts/mobile-patches.py` PASS（82）
- 当前闭包门禁：`bash scripts/verify-closure.sh` PASS；该结果来自 pristine v2.2.7 tree、closure patch、#184 scoped overlay、inherited main server-edit patch、#185 Home patch 与 #186 back bridge patch 的有序重放和等价性核对。
- 当前 scope audit（`git status --porcelain=v1 -uall`）：#185 代码增量限于 Home fade helper/test、view import/use、patch registry/provenance/vendor order、生成 Web manifest 与本执行卡/设计记录；typecheck 产生的未跟踪 declaration artifacts 已清理，未保留 `.tsbuildinfo`、`node_modules`、`dist`、`.vite` 或 `.turbo` 作为交付文件。

## #185 Home / new-session 执行卡

- 用户可观察目标：以 fixed v2.2.7 为来源，对齐 Home server/project selection、session load/search/row、new-session location/project/workspace/branch 与远端 worktree picker 的目标状态机；保持既有项目身份、最近使用和恢复契约，不把它们重复算作本轮新增语义。
- 上游核对：Issue #185 的 50-file allowlist 已与 `fedc6f208aa2bd54c1019227214568083f6380ad` 逐文件 byte-compare；allowlist 内目标文件已由 v2.2.7 vendor pin 携带。历史 `project-identity-migration`、`home-new-session-parity`、`ui-typeahead-export` 保持 deferred，不作为本轮 source patch 重放。
- 本次必要移动差异：`home-new-session-v2-2-7.patch` 只抽取 `home/projects` fade threshold，接入 `view.tsx`，并以 top/middle/bottom/one-pixel tests 锁定 DOM edge attributes；patch SHA-256 为 `fa67c5df3ef687c397727106f3188e55933a5c51431b9cf2e1e25c7a29d0436d`。它排在 closure → #184 → server-edit 之后，targets 与既有 #184/server-edit active patches 不重叠。
- 正常/失败/恢复范围：Home 覆盖 cached/stale/loading/error/retry、server/project identity 与 late-result disposal；session search 覆盖 found/missing/failed/timed-out/closed/disposed；row 覆盖 long-press/menu、rename cancel/failed/late answer；new-session/picker 覆盖 branch→worktree、location history/back/cancel、directory lookup queue、combobox/tree/selection、worktree/MCP/session timeout、rollback 与 stale attempt。项目身份/最近使用持久化不改写。
- 验收：focused app selection baseline **200 pass / 0 fail / 700 expect / 17 files** → post-change **204 pass / 0 fail / 704 expect / 18 files**；Web build、patch registry、closure、Android asset verify、Gradle unit/APK 均通过。设备/真实服务的完整新建会话、worktree picker 触摸、重启/切网恢复和直连/SSH 双路由仍归 G19/G30，当前标为 BLOCKED/NOT RUN。
- 授权与停止条件：不创建 PR、不推送、不合并；若出现需要改变项目身份/最近使用语义、Android 入口范围或安全策略的取舍，停止并记录，不在 #185 内私自扩展。

## #186 tabs / Inbox / titlebar 执行卡

- 用户可观察目标：固定核对 v2.2.1→v2.2.7 的 tabs、Inbox、titlebar、mobile-tabs drawer、route/history/tab promotion/load/rename、Inbox scroll anchor/scrollTop、Working shelf start-time sort、SessionTabAvatar/ActivityRing 分离、narrow safe-area 兼容；确保这些 shared production changes 不被错误 deny。
- 上游 crosswalk：`changes.md` 的 #186 section 逐 commit/逐文件记录 fixed source；`runtime/plugin` panels/side-region/panel-trigger、tabs CSS、全部 touched locale、Inbox mock fixtures/tests、shell/titlebar/tabs/state/routes/session/avatar/activity-ring allowlist 均与 `fedc6f2` byte-identical，处置为 **absorbed / no production overlay**。Timeline/Composer/Files/Terminal/Notifications、Desktop/Electron/native window、#185 与 #164–#168 为 deny scope。
- 本次必要移动差异：现有 `MainActivity`/`BackDispatchPolicy` 保留旧 `true`/fallback 外部语义，但补齐受控 main-frame app-origin request（version=1/type=back/opaque requestId≤256 bytes）、one-pending、stale/duplicate/destroy fail-closed 生命周期；新增 `tabs-inbox-titlebar-v2-2-7` 仅含 app-side back chain/binding。`entry.tsx` 与 #184 是 shared file，明确 `dependsOn` 三个前三 patch，payload 只含 distinct binding hunk。
- back chain：IME 由系统优先；app chain 为 dialog→popover→panelDrawer→dockPanel→titlebarMore→goBack；每次只消费一层，所有 false/null/error/timeout 回到原 `canGoBack/goBack→super` fallback。chain 不调用 `session.interrupt`/`abort`、`inbox.cancel`、`pty.remove`、`kill`，running session + pending Inbox negative path 保持 no-op。
- 正常/失败/恢复：tab close/menu/rename/reopen、New tab launcher、last side-region close、Inbox open-session scroll restore、two-run Working sort、mobile tabs drawer、route/history promotion/load/rename、avatar/ring separation 为 fixed-source absorbed behavior；back 的 malformed/wrong version/type/extra secret/oversize/wrong origin/timeout/stale/duplicate/destroy 均 decline 到原 fallback。
- 验收：app focused tabs/Inbox/back **138 pass / 0 fail / 383 expect / 13 files**；mobile-hosts full **444 pass / 0 fail / 2958 expect / 40 files**；back-handler focused 6/0；Android BackDispatchPolicy + Gradle unit/APK PASS；Web build/copy/assets/closure/patch registry PASS；E2E tabs/side-panels 本轮受 fixture/dev-server 依赖与 120s budget 限制，未记为 PASS；设备/adb back/safe-area/real running session **BLOCKED / NOT RUN**。
- 先前三 patch 硬不变量：#184 `6b3b7ab713189bdbfcce9ea3222aee480576ae55b3c504e35889a6c55d341b94`、server-edit `89c7984311d897935782f56708ca3ce7d34e83193af2bb60ff5670a1800fe6f0`、#185 `fa67c5df3ef687c397727106f3188e55933a5c51431b9cf2e1e25c7a29d0436d`；#186 `1490c51926fa809a87ffd08897b9d0721317727a4e5ee850d28176dafba2098c`。前三 targets/order/behavior unchanged。
- 授权与停止条件：只提交 conventional commit，不 push、不创建 PR、不合并；没有设备/真实服务时不声称 Android runtime、safe-area、hardware back、running session 或 Windows runtime 通过；不声称 full typecheck。

## 稳定 focused-test 复跑记录（#184）

以下四组是本轮实际执行、可在当前 worktree 直接复跑的稳定选择，不是从聚合日志推算的数字。

- 公共环境：绝对工作目录 `/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`；本轮验证基准 HEAD `55df2e39f591369a01ce9647b2b4c7fe59ce11b5`，当前为其后的 diff-check 口径修复提交；Linux `7.0.0-38-generic x86_64`；Bun `1.4.2`（测试输出标识 `744846f84`）。测试使用仓库 fixture 与 Happy DOM preload，不使用真实凭据、Android 设备、QR physical、真实远程服务或 JSch/Windows runtime。

### App connection/server/pairing

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/app`
- 条件与 preload：`--conditions=solid --conditions=browser --isolate`；`../ui/test/solid-jsx.ts` 和 `./happydom.ts`。
- 显式文件清单（16 files）：`src/providers/connect/remote.test.ts`、`src/runtime/server/api.test.ts`、`src/runtime/server/client.test.ts`、`src/runtime/server/errors.test.ts`、`src/runtime/server/health-machine.test.ts`、`src/runtime/server/health.test.ts`、`src/runtime/server/machine.test.ts`、`src/runtime/server/persistence.test.ts`、`src/runtime/server/registry-hydration.test.tsx`、`src/runtime/server/registry.test.ts`、`src/runtime/server/request-queue-machine.test.ts`、`src/runtime/server/server-sync/endpoint-machine.test.ts`、`src/runtime/server/server-sync/machine.test.ts`、`src/servers/connect/machine.test.ts`、`src/servers/connect/pairing.test.ts`、`src/servers/connect/scanner-machine.test.ts`。
- 精确命令：

```bash
bun test --conditions=solid --conditions=browser --isolate --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts src/providers/connect/remote.test.ts src/runtime/server/api.test.ts src/runtime/server/client.test.ts src/runtime/server/errors.test.ts src/runtime/server/health-machine.test.ts src/runtime/server/health.test.ts src/runtime/server/machine.test.ts src/runtime/server/persistence.test.ts src/runtime/server/registry-hydration.test.tsx src/runtime/server/registry.test.ts src/runtime/server/request-queue-machine.test.ts src/runtime/server/server-sync/endpoint-machine.test.ts src/runtime/server/server-sync/machine.test.ts src/servers/connect/machine.test.ts src/servers/connect/pairing.test.ts src/servers/connect/scanner-machine.test.ts
```

- 实际结果：**137 pass / 0 fail，403 expect calls，16 files，2.22s**。

### Inherited server-edit touch compatibility

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/app`
- 精确命令：

```bash
bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/servers/servers-page.test.tsx
```

- 实际结果：**9 pass / 0 fail，38 expect calls，1 file**；恢复并适配 origin/main 的服务器页回归覆盖（General/List、availability/health gating、unauthorized Authenticate、Shell `data-action`、selected/non-selected action naming、edit dialog mode/server/onSave），并覆盖 Android host 350ms 延迟与非 Android 立即编辑两条路径。

### Diff-check boundary

- `git diff --check origin/main...HEAD` 不能记为无条件 PASS：该命令对 6 个已登记的上游 npm 生成 patch 报告 **206 条既有 whitespace diagnostics**（trailing whitespace 或 space before tab）：`@ai-sdk%2Fmistral@3.0.51.patch`、`@ff-labs%2Ffff-bun@0.10.5.patch`、`@modelcontextprotocol%2Fclient@2.4.0.patch`、`@silvia-odwyer%2Fphoton-node@0.3.4.patch`、`app-builder-lib@26.15.7.patch`、`vite@8.2.4.patch`。这些是上游生成 patch 内容，本轮未改写；`mobilePatches` 机器校验与 closure replay 仍 PASS。
- 源码/文档 diff-check 口径命令 `git diff --check origin/main...HEAD -- . ':(exclude)vendor/upstream/patches/**'`：该命令仅验证源码/文档路径，结果 **PASS**。当前工作树同口径 `git diff --check -- . ':(exclude)vendor/upstream/patches/**'`：**PASS**。
- 独立 mobile patch diff-check：`git diff --check origin/main...HEAD -- vendor/upstream/patches/mobile`，rc=0 / **PASS**。
- 独立 closure patch diff-check：`git diff --check origin/main...HEAD -- vendor/upstream/patches/closure`，rc=0 / **PASS**。

### GUI pairing/SSH

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/gui-plugins`
- 条件与 preload：`--conditions=solid --conditions=browser --isolate`；显式 `../ui/test/solid-jsx.ts`，`bunfig.toml` 自动提供 Happy DOM preload。
- 显式文件清单（11 files）：`src/pairing/copy-machine.test.ts`、`src/pairing/dispatch.test.ts`、`src/pairing/machine.test.ts`、`src/pairing/main-machine.test.ts`、`src/pairing/remote.test.ts`、`src/ssh/add-machine.test.ts`、`src/ssh/bootstrap.test.ts`、`src/ssh/command.test.ts`、`src/ssh/dialog-machine.test.ts`、`src/ssh/main-machine.test.ts`、`src/ssh/window-machine.test.ts`。
- 精确命令：

```bash
bun test --conditions=solid --conditions=browser --isolate --preload ../ui/test/solid-jsx.ts src/pairing/copy-machine.test.ts src/pairing/dispatch.test.ts src/pairing/machine.test.ts src/pairing/main-machine.test.ts src/pairing/remote.test.ts src/ssh/add-machine.test.ts src/ssh/bootstrap.test.ts src/ssh/command.test.ts src/ssh/dialog-machine.test.ts src/ssh/main-machine.test.ts src/ssh/window-machine.test.ts
```

- 实际结果：**88 pass / 0 fail，357 expect calls，11 files，1263ms**。

### `packages/mobile-hosts`

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`
- 条件与 preload：`--conditions=browser`；测试目标目录为 `packages/mobile-hosts`，不接入 Android API、设备或真实服务。
- 精确命令：

```bash
bun test --conditions=browser packages/mobile-hosts
```

- 文件清单（40 files）：`packages/mobile-hosts/test/back-handler.test.ts`、`basic-auth.test.ts`、`credential-ref.test.ts`、`extension-manager.rendered.test.tsx`、`extension-manager.test.ts`、`files-client.test.ts`、`files-transport.test.ts`、`fingerprint.test.ts`、`host-credential.test.ts`、`host-key-binding.test.ts`、`host-key-recovery-flow.test.ts`、`identity.test.ts`、`initial-handoff.test.ts`、`known-hosts.test.ts`、`notifications-client.test.ts`、`probe.test.ts`、`registry-service-port.test.ts`、`registry.test.ts`、`runtime-ssh.test.ts`、`runtime-vault.test.ts`、`secure-fetch.test.ts`、`service-bridge.test.ts`、`service-commands.test.ts`、`service-discovery.test.ts`、`service-driver.test.ts`、`service-errors.test.ts`、`service-flow.test.ts`、`service-refresh.test.ts`、`ssh-bridge.test.ts`、`ssh-errors.test.ts`、`ssh-verifier-transport.test.ts`、`state-machine.test.ts`、`storage.test.ts`、`upstream-map.test.ts`、`url-policy.test.ts`、`vault-androidx-transport.test.ts`、`vault-envelope.test.ts`、`vault-key-envelope.test.ts`、`vault.test.ts`、`vault-transport.test.ts`。
- 实际结果：**442 pass / 0 fail，2946 expect calls，40 files，2.15s**。

## 范围

### 本次包含

1. 固定比较 v2.2.1→v2.2.7 的所有 Desktop 直接变化与共享前端闭包变化。
2. 新建 v2.2.7 基准、变化总结和完整稳定 ID 矩阵。
3. 按 v2.2.7 目标源码重新推导 closure、partial assets、上游 npm patch 子集和 lockfile。
4. 对全部 81 条移动补丁逐条给出处置：3 条 active（#184 scoped overlay + inherited main server-edit patch + #185 Home overlay）、19 条 #184 语义 absorbed、59 条 scope 外 deferred；保留重基、上游吸收、语义重写、退休或新增移动适配。
5. 将 Android/mobile/About/vendor 身份同步到 2.2.7；远程服务版本继续独立展示。

### 本次不包含

- 不把 `packages/desktop` Electron 主体复制到 Android。
- 不改变 WSL 执行排除、手机本地服务排除、APK 自动更新暂缓、语音暂缓、第三方 GUI 商店排除或进程死亡推送边界。
- 不创建 tag、GitHub Release、上传 APK 或自动合并。
- 不把 v2.2.1 的历史 PASS/BLOCKED 回填成 v2.2.7 结果。

### #184 子工作单元范围

- 仅迁移 v2.2.1 (`3ebcf9a32c7b28f658cfee80775448929361727a`) → v2.2.7 (`fedc6f208aa2bd54c1019227214568083f6380ad`) 实际影响连接、配对、SSH 共享能力的 closure；当前唯一 vendor pin 是 `fedc6f208aa2bd54c1019227214568083f6380ad`，不以历史 vendor 文件存在性代替目标源码核对。
- 固定顺序：schema → protocol → client/generated → package exports/deps → runtime/state machines → Android bridge。active overlay 只纳入 connect controller/dialog/machine/screen、server registry/current/runtime/health/host API、pairing/URL、validated fetch/probe/vault/security 和 SSH shared controller/dialog/name/renderer/row/state 及对应测试；build-only `closurePatches` 单独承载 package-manager dangling workspace 修复和 patchmark 传递依赖。排除 providers、settings、session、files、terminal、notifications、通用 UI、无关 AI/package 行为、Electron/Desktop、WSL 执行、updater、手机本地服务、通用 port-forward 及未确认的 #164/#165/#167/#168。
- 凭据与安全语义必须在新 `ServerOriginal`/`ServerSaveAction` 契约上重基：`credentialRef`、`remember`、vault ready/status/generation、probe/fetch、unknown/changed host key、TLS/redirect/userinfo、pairing malformed/expired/replay、日志无 secret。JSch 隧道数据面继续 `BLOCKED`，不得把 v2.2.1 pairing paste PASS 升级为 v2.2.7 PASS；QR physical 保持 `BLOCKED`。
- 进入 Android runtime/设备验收的前置门禁：pristine scoped v2.2.7 closure、target package sources/lock/npm patches、`verify:patches`/`verify:closure`、build/typecheck；未满足时停止在语义重基与静态证据阶段。

## 验收标准

### Stage A：审计与文档

- [x] 新目标 tag/SHA、旧目标 tag/SHA 和预迁移机器基线已记录。
- [x] 直接 Desktop 变化与共享 closure 变化的范围、数量、分类方法已记录。
- [x] v2.2.7 baseline、变化总结和矩阵已建立；v2.2.1 历史文件不被重写。
- [x] 版本敏感探针、设计文档和当前目标引用完成 active/history/policy 分类。

### Stage B：vendor 与补丁迁移

- [x] v2.2.7 closure 与 partial assets 由目标源码推导完成。
- [x] upstream npm patches 与 lockfile 按 v2.2.7 closure 重算。
- [x] 81 条移动补丁逐条有 disposition、new baseline、targets、依赖和验证记录；19 条历史 payload 为 absorbed，59 条 scope 外历史补丁为 deferred，#184 scoped consolidated overlay、1 条 inherited main patch 与 #185 Home overlay 为 active；build-only closure patch 单独登记。
- [x] pristine v2.2.7 closure + ordered mobile patches 可干净重放。
- [x] Android/mobile/vendor/About 身份同步为 2.2.7 / 20207。

**当前门禁状态：Stage B 已完成，Stage C 静态验证部分完成。** v2.2.7 pristine closure 已按目标源码重建，19 条 #184 历史语义由 scoped overlay 明确承载，59 条 scope 外历史差异保持 deferred；build-only closure 修复与三个 active mobile replay 分离重放；`credentialRef` 已接到 v2.2.7 的 `ServerOriginal`/`ServerSaveAction` 契约。未通过项集中在直接 `tsc` 的跨 package rootDir/TS6307、旧 settings fixture/生成类型与部分 legacy GUI 测试类型错误，不以关闭 strict 或扩大 Android 依赖解决。

### Stage C：验证与交付

- [ ] patch、closure、install、web build、typecheck、相关单测和 Android Gradle 门禁完成 before/after 对账（patch/closure/install/web/focused tests/Android Gradle 已完成；typecheck 仍为已知 baseline failure set，需保留对账记录）。
- [ ] 可用设备上完成数据保留覆盖安装和受影响路径验证；无环境项明确标记未验证/阻塞。
- [ ] 远程服务版本、Windows 运行端缺失和 Desktop-only 能力边界均单独记录。
- [ ] 新矩阵、设计文档、来源证明和实现状态一致后再提交。

### #184 验收分层（独立于 v2.2.1 历史证据）

- `PASS`：目标源码/协议/闭包/补丁链/构建与适用单测在本实施 HEAD 有可复现证据。
- `PARTIAL`：共享契约、安全负例或失败状态已落地，但端到端环境只覆盖部分路径。
- `BLOCKED`：JSch 真实转发、服务端到达、完整 SSH session/stream/permission/task survival 链，或 QR physical 所需设备/服务证据缺失。
- `NOT RUN`：无设备、无真实服务或不适用的 Android/Windows 运行验证；不得以旧 vendor、旧版 PASS 或静态 DOM 代替。

## 当前结果 / 下一步

- 当前状态：**Stage A/B 已完成；Stage C 静态门禁部分完成；Issue #185 实施待提交**。当前 worktree 保留未提交 #185 diff；vendor 本身可由 pristine v2.2.7 closure + build-only closure patch + 三个 active mobile replay 重建。
- 已完成：上游 tag 固定、差异规模盘点、Desktop commit/path 盘点、81 条补丁 disposition、目标闭包重建、upstream npm patch/lockfile 重算；连接/配对/SSH 共享状态机、凭据契约、健康/生命周期控制器和移动兼容接缝已落到源码，#185 Home fade seam 与测试已落位。
- 关键发现：v2.2.7 已吸收部分旧移动差异；19 条 #184 历史语义明确标为 absorbed，59 条非 #184 历史 payload 保留为 deferred；#184 active overlay 只承载 scoped connection、配对、凭据/安全、server lifecycle/health 和 SSH 共享适配，继承自 origin/main 的 server-edit patch 独立重放；#185 allowlist 中的 Home/new-session state machines 已由 v2.2.7 pin 吸收，active #185 patch 只承载 fade helper/test；patchmark 与 workspace 修复仅作为 build-only closure 传递依赖重放。
- 剩余：`bun run typecheck:tsc -- --pretty false`（在 `vendor/upstream/packages/app` 执行）仍有 component-test story module/implicit-any、WebView bridge cast、generated/plugin type、legacy fixture 与 app→mobile-hosts rootDir/TS6307 等 baseline errors；设备 UI、真实服务和真实 JSch 链路未运行。
- 停止条件：出现需要改变产品范围、安全策略、远程服务承诺或删除既有移动适配的决策时暂停并记录。

### #184 当前执行状态

- 当前状态：**共享语义实施完成 → 静态门禁部分完成**；共享连接、配对、SSH 状态机和移动兼容接线已实现，v2.2.7 closure 可重建并通过 closure gate；不声称 APK 可用或任何 Android/真实服务通过。
- 已落地的关键面：`ServerOriginal`/`ServerSaveAction` 连接保存契约、credentialRef/remember/vault hydration、URL userinfo/TLS/redirect 安全边界、tagged plugin/health 状态与旧投影、server lifecycle/health/request queue/endpoint sync machine、pairing main machine、SSH main/window machine 与保留的移动 UI 兼容面。
- 可复现验证：`python3 scripts/mobile-patches.py` PASS（81 条；3 active/19 absorbed/59 deferred）；build-only closure patch + 三个 active mobile replay 可重建；Web build、`verify:patches`、`verify:closure`、完整 server-page/app/GUI/mobile-hosts focused tests、#185 Home focused tests 与 Android Gradle build 均按当前记录执行；closure patch 不计入 `mobilePatches`，只作为 build-only prerequisite。
- 已知失败/阻塞：direct `tsc` 仍报告 app→mobile-hosts 的 rootDir/TS6307、app→gui-plugins 的 TS6307、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外的 Electron/GUI legacy 测试依赖；GUI `askpass.test.ts` 依赖未纳入 closure 的 `packages/core/test/lib/effect`。这些不能通过关闭 strict、引入 Electron 到 Android 或静默跳过来解决。
- 下一步：完成 #185 文档/deny audit/diff review，按用户授权决定是否提交；不创建 PR、不推送、不合并；继续保持 typecheck 的 known-baseline、设备 UI 与真实链路的 BLOCKED/NOT RUN 边界。
- 后置阻塞：真实 SSH tunnel/session/stream/permission/task survival、QR physical、设备 UI 与真实服务证据仍缺失；Android Gradle/APK 仅有本轮 build-only PASS，不能替代安装和受影响路径验证；解除条件为真实设备、授权 SSH 主机/服务端和完整链路证据，不能由静态或历史证据替代。
