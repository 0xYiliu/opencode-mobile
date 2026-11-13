# v2.2.7 上游对齐执行卡

## 工作单元 / 用户可观察目标

将固定的 Windows Desktop 对齐目标从 v2.2.1 切换到 v2.2.7；保留 v2.2.1 为冻结历史快照；完整记录 v2.2.1→v2.2.7 的 Desktop 与共享前端闭包变化；在不复制 Electron Desktop 运行时的前提下，重建 Android vendor 闭包和移动补丁链。

## 关联记录

- GitHub Issue：[#182](https://github.com/0xYiliu/opencode-mobile/issues/182)
- 当前子工作单元：[#184](https://github.com/0xYiliu/opencode-mobile/issues/184)（连接、配对与 SSH 共享闭包）
- 旧版本矩阵：[v2.2.1](../v2.2.1/matrix.md)
- 新版本目录：[v2.2.7](.)

## 基准与工作区

- 绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`
- 分支：`feat/upstream-227-alignment`
- 父轮审计起点：`fd898b8ea2107884729530aedfb9bf34e173a3bc`（仅历史审计，不作为本次实现基线）
- 本次实施 base：`c7441f5e8109737a06f8e914ffa61e025e188a7d`；当前实际 HEAD：本次 merge resolution commit（parents 为 c7441f5e 与 origin/main `4961ec04fa1d22b06c8fa099c4175939a8ac7e2f`；已提交，待推送）
- 本次实施 worktree：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`
- 本次实施分支：`feat/upstream-227-alignment`
- 开工状态：该 worktree 由本子工作单元独占；当前为已提交 merge-resolution 树，主工作树未修改，分支推送待完成
- 上游旧目标：v2.2.1 / `3ebcf9a32c7b28f658cfee80775448929361727a`
- 上游新目标：v2.2.7 / `fedc6f208aa2bd54c1019227214568083f6380ad`
- 新目标发布时间：2026-11-10

## 当前 vendor 与补丁基线

- 全局 vendor pin：`fedc6f208aa2bd54c1019227214568083f6380ad`（v2.2.7）
- 当前 `packageSources`：空；11 个 closure package 均从固定 v2.2.7 目标提取
- 当前移动补丁：80 registered / 2 active / 19 absorbed / 59 deferred；`vendor-manifest.json#closurePatches` 先重放 build-only closure 修复，`vendor-manifest.json#mobilePatches` 按顺序重放 #184 consolidated overlay，再重放继承自 origin/main 的 `server-edit-touch-compatibility` patch；#184 overlay 仍只包含 24 个 scoped targets
- 当前客户端身份：Android/mobile `2.2.7`，versionCode `20207`；vendor app 包为 `2.2.7`
- 当前补丁登记门禁：`python3 scripts/mobile-patches.py` PASS（80）
- 当前闭包门禁：`bash scripts/verify-closure.sh` PASS；该结果来自实际 vendor 重建、closure patch + #184 scoped overlay + inherited main server-edit patch 的有序重放和 pristine v2.2.7 等价性核对。
- 当前 merge-resolution scope audit（`git status --porcelain=v1 -uall`）：20 个预期 docs/vendor 路径（含 inherited `android-host.ts` helper），0 个 unresolved path；未发现 `.tsbuildinfo`、`.d.ts`、`node_modules`、`dist`、`.vite` 或 `.turbo` 临时产物。

## 稳定 focused-test 复跑记录（#184）

以下三组是本轮实际执行、可在当前 worktree 直接复跑的稳定选择，不是从聚合日志推算的数字。

- 公共环境：绝对工作目录 `/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`；当前 HEAD 为本次 merge resolution commit；Linux `7.0.0-38-generic x86_64`；Bun `1.4.2`（测试输出标识 `744846f84`）。测试使用仓库 fixture 与 Happy DOM preload，不使用真实凭据、Android 设备、QR physical、真实远程服务或 JSch/Windows runtime。

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

- 实际结果：**2 pass / 0 fail，4 expect calls**；实际挂载 `SettingsServerList`，覆盖 Android host 350ms 延迟与非 Android 立即编辑两条路径。

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
4. 对全部 80 条移动补丁逐条给出处置：2 条 active（#184 scoped overlay + inherited main server-edit patch）、19 条 #184 语义 absorbed、59 条 scope 外 deferred；保留重基、上游吸收、语义重写、退休或新增移动适配。
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
- [x] 80 条移动补丁逐条有 disposition、new baseline、targets、依赖和验证记录；19 条历史 payload 为 absorbed，59 条 scope 外历史补丁为 deferred，1 条 #184 scoped consolidated overlay 与 1 条 inherited main patch 为 active；build-only closure patch 单独登记。
- [x] pristine v2.2.7 closure + ordered mobile patches 可干净重放。
- [x] Android/mobile/vendor/About 身份同步为 2.2.7 / 20207。

**当前门禁状态：Stage B 已完成，Stage C 静态验证部分完成。** v2.2.7 pristine closure 已按目标源码重建，19 条 #184 历史语义由 scoped overlay 明确承载，59 条 scope 外历史差异保持 deferred；build-only closure 修复与两个 active mobile replay 分离重放；`credentialRef` 已接到 v2.2.7 的 `ServerOriginal`/`ServerSaveAction` 契约。未通过项集中在直接 `tsc` 的跨 package rootDir/TS6307、旧 settings fixture/生成类型与部分 legacy GUI 测试类型错误，不以关闭 strict 或扩大 Android 依赖解决。

### Stage C：验证与交付

- [ ] patch、closure、install、web build、typecheck、相关单测和 Android Gradle 门禁完成 before/after 对账（patch/closure/install/web/focused tests 已完成；typecheck 与 Android Gradle 尚未完成）。
- [ ] 可用设备上完成数据保留覆盖安装和受影响路径验证；无环境项明确标记未验证/阻塞。
- [ ] 远程服务版本、Windows 运行端缺失和 Desktop-only 能力边界均单独记录。
- [ ] 新矩阵、设计文档、来源证明和实现状态一致后再提交。

### #184 验收分层（独立于 v2.2.1 历史证据）

- `PASS`：目标源码/协议/闭包/补丁链/构建与适用单测在本实施 HEAD 有可复现证据。
- `PARTIAL`：共享契约、安全负例或失败状态已落地，但端到端环境只覆盖部分路径。
- `BLOCKED`：JSch 真实转发、服务端到达、完整 SSH session/stream/permission/task survival 链，或 QR physical 所需设备/服务证据缺失。
- `NOT RUN`：无设备、无真实服务或不适用的 Android/Windows 运行验证；不得以旧 vendor、旧版 PASS 或静态 DOM 代替。

## 当前结果 / 下一步

- 当前状态：**Stage A/B 已完成；Stage C 静态门禁部分完成**。当前 worktree 已提交 merge-resolution commit，待推送；vendor 本身可由 pristine v2.2.7 closure + build-only closure patch + 两个 active mobile replay 重建。
- 已完成：上游 tag 固定、差异规模盘点、Desktop commit/path 盘点、80 条补丁 disposition、目标闭包重建、upstream npm patch/lockfile 重算；连接/配对/SSH 共享状态机、凭据契约、健康/生命周期控制器和移动兼容接缝已落到源码。
- 当前证据：`bun install` PASS；Web build PASS（14.47s，2806 PWA precache entries，保留既有 CSS、chunk/dynamic-import warnings）；inherited server-edit compatibility 2 pass / 0 fail；app focused selection 137 pass / 0 fail（16 files），GUI pairing/SSH 88 pass / 0 fail（11 files），mobile-hosts 442 pass / 0 fail（40 files）；`verify:patches`、`verify:closure`、`verify-about-version`、`git diff --check` PASS。app/mobile-hosts/gui direct typecheck 仍按下方边界失败；Android Gradle/APK、设备 UI、真实服务和真实 JSch 链路继续未验证，不冒充通过。
- 关键发现：v2.2.7 已吸收部分旧移动差异；19 条 #184 历史语义明确标为 absorbed，59 条非 #184 历史 payload 保留为 deferred；#184 active overlay 只承载 scoped connection、配对、凭据/安全、server lifecycle/health 和 SSH 共享适配，继承自 origin/main 的 server-edit patch 独立重放；patchmark 与 workspace 修复仅作为 build-only closure 传递依赖重放。
- 剩余：`bunx tsc -b --pretty false`（在 `vendor/upstream/packages/app` 等项目目录执行）仍有本次 project-boundary/生成类型及 legacy fixture 错误；Android Gradle/APK、设备 UI、真实服务和真实 JSch 链路未运行。
- 停止条件：出现需要改变产品范围、安全策略、远程服务承诺或删除既有移动适配的决策时暂停并记录。

### #184 当前执行状态

- 当前状态：**共享语义实施完成 → 静态门禁部分完成**；共享连接、配对、SSH 状态机和移动兼容接线已实现，v2.2.7 closure 可重建并通过 closure gate；不声称 APK 可用或任何 Android/真实服务通过。
- 已落地的关键面：`ServerOriginal`/`ServerSaveAction` 连接保存契约、credentialRef/remember/vault hydration、URL userinfo/TLS/redirect 安全边界、tagged plugin/health 状态与旧投影、server lifecycle/health/request queue/endpoint sync machine、pairing main machine、SSH main/window machine 与保留的移动 UI 兼容面。
- 可复现验证：`python3 scripts/mobile-patches.py` PASS（80 条；2 active/19 absorbed/59 deferred）；build-only closure patch + active overlay 可重建；Web build、`verify:patches`、`verify:closure`、app/GUI/mobile-hosts focused tests 与 `git diff --check` 均按修订后实际结果记录；closure patch 不计入 `mobilePatches`，只作为 build-only prerequisite。
- 已知失败/阻塞：direct `tsc` 仍报告 app→mobile-hosts 的 rootDir/TS6307、app→gui-plugins 的 TS6307、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外的 Electron/GUI legacy 测试依赖；GUI `askpass.test.ts` 依赖未纳入 closure 的 `packages/core/test/lib/effect`。这些不能通过关闭 strict、引入 Electron 到 Android 或静默跳过来解决。
- 下一步：推送当前 merge resolution commit 到 `feat/upstream-227-alignment`；交付时继续由 reviewer 复核 active scope、closure 分类和 typecheck/Android/真实链路边界；不得合并 PR 或把 BLOCKED/NOT RUN 升级为 PASS。
- 后置阻塞：真实 SSH tunnel/session/stream/permission/task survival、QR physical、Android Gradle/APK、设备 UI 与真实服务证据仍缺失；解除条件为真实设备、授权 SSH 主机/服务端和完整链路证据，不能由静态或历史证据替代。
