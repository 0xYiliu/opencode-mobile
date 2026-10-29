# 本项目实现证据：固定开发快照

## 检查身份与复现

差异盘点使用 `cf1504de929bd47bc7003c62a24e6c4488f2c498`（当时本地 `origin/dev`）；其后 `main@4c2ec43a0440c3aaec53fb5d8ade6dcaa05a8905` 合并 dev 与 issue-58。旧快照用来说明基线，不代表当前集成状态。读取命令：

```sh
git show cf1504de929bd47bc7003c62a24e6c4488f2c498:<路径>
```

issue-58 (`5a46934e7f17a32d3df5d354d18424034785efc3`) 已通过 PR #59 合并，并随 dev 经 PR #60 进入 main。其 SSH 初始连接表单、WebView worker 更新策略及相关桥修复属于当前集成实现；仍未证明完整真实 SSH/远程任务 E2E。

矩阵“已有代码”只证明功能实现的来源与契约，不保证新版本所有子行为已有，更不代表运行门禁通过。以下是分组证据索引；具体 Windows 目标及逐 ID 最小验收仍见 [baseline.md](baseline.md)。

## 证据索引

E01–E12 以原始盘点快照 `cf1504d` 为依据；E13–E17 以已集成的 `5a46934`（main `4c2ec43` 包含该提交）为依据。后者用于覆盖同项的旧架构与历史结论；本次为源码/台账核对，未重跑设备或构建测试。E18 为 issue #61（分支 `issue-61-g36-ssh-e2e`，基线 dev @ 61322dd）的真机运行证据，依据为 `docs/build-and-verify.md` issue #61 段（2026-10-30）。

| 编号 | 固定快照内路径 | 已核事实与限制 |
| --- | --- | --- |
| E01 | `vendor/upstream/PROVENANCE.md`、`docs/project-scope.md`、`docs/decisions/0001-wsl-exclusion.md` | vendor pin 为 b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43；已有 11 包闭包及移动补丁；WSL 排除包括 Windows 主机的发现/启停/管理。访问已暴露的远程服务与管理 WSL 是不同能力 |
| E02 | `vendor/upstream/packages/app/src/settings/shell.tsx`、`vendor/upstream/packages/app/src/settings/search.tsx`、`vendor/upstream/packages/app/src/settings/server-scope.tsx`、`vendor/upstream/packages/app/src/settings/general/general.tsx`、`vendor/upstream/packages/app/src/settings/general/controllers.ts`、`vendor/upstream/packages/app/src/settings/model.tsx`、`vendor/upstream/packages/app/src/settings/appearance/appearance.tsx`、`vendor/upstream/packages/app/src/settings/experimental/experimental.tsx` | Settings 已引入；General 有 horizontal/vertical、语言、workspace、权限、queue/steer 等；Appearance 为 scheme/theme/fonts；experimentalSettingsAvailable=false。不能把旧设置页整体视为目标版本等价 |
| E03 | `docs/design/units/projects-sessions.md`、`docs/design/units/session-workbench.md`、`docs/design/units/permission-requests.md`、`vendor/upstream/packages/app/src/session/commands/use-session-commands.tsx`、`vendor/upstream/packages/app/src/session/timeline/search-controller.ts`、`vendor/upstream/packages/app/src/settings/workspaces/project.tsx`、`vendor/upstream/packages/app/src/settings/workspaces/workspaces.tsx` | 已有会话、项目、请求和工作区共享实现及 M-017/M-018；G19/G20/G21 等运行门禁未完成。大项内具体目标差异仍需细化 |
| E04 | `docs/design/units/providers-models.md`、`docs/design/units/agent-capabilities.md`、`vendor/upstream/packages/app/src/settings/providers/providers.tsx`、`vendor/upstream/packages/app/src/settings/providers/extensions.tsx`、`vendor/upstream/packages/app/src/settings/models/models.tsx`、`vendor/upstream/packages/app/src/settings/workspaces/project-extensions.tsx` | provider、model、Agent、MCP 和服务端扩展已有实现。既有文档已列 custom provider stub、授权窗口和翻译缺口；不能以“已有代码”抹平这些缺口；G25/G26 待运行 |
| E05 | `docs/design/units/files.md`、`docs/design/units/diff.md`、`docs/design/units/terminal.md`、`vendor/upstream/packages/gui-extensions/src/file/renderer.tsx`、`vendor/upstream/packages/gui-extensions/src/review/renderer.tsx`、`vendor/upstream/packages/gui-extensions/src/terminal/renderer.tsx` | file/review/terminal 已集成；真实文件、Git、PTY 和断线门禁 G22/G23/G24 未完成 |
| E06 | `docs/design/units/attachments-artifacts.md`、`docs/design/units/artifact-viewers.md`、`packages/mobile-hosts/src/files/client.ts`、`android/app/src/main/java/ai/opencode/mobile/files/FilesBridge.kt`、`vendor/upstream/packages/gui-extensions/src/microsoft-office/renderer.tsx` | 文件桥、附件与 Office 查看器已有；PDF Android WebView、CJK 和大文件效果不可从打包成功推定 |
| E07 | `docs/design/units/browser.md`、`vendor/upstream/packages/gui-extensions/src/browser/renderer.tsx` | browser renderer 有非 desktop 早退；手机不是执行宿主；远程输出/preview fallback 已有共享路径，截图呈现形态及 G28 未验证 |
| E08 | `docs/design/units/notifications.md`、`packages/mobile-hosts/src/notifications/client.ts`、`android/app/src/main/java/ai/opencode/mobile/notifications/NotificationsBridge.kt` | JS/Kotlin 通知桥、权限与点击路由已有；已决定存活期间 best-effort、进程死亡期间无通知、不提供前台服务/keepalive/push；G33 未完成 |
| E09 | `docs/design/units/gui-extensions.md`、`packages/mobile-hosts/src/extensions/manager.ts`、`packages/mobile-hosts/src/ui/extension-manager.tsx`、`vendor/upstream/packages/gui-extensions/src/renderer.ts`、`vendor/upstream/packages/gui-extensions/src/btw/renderer.tsx` | 13 个旧内置定义，mobile 因 OS 过滤只有 12 行；WSL 被隐藏。管理器已有启停持久化/状态/失败/Reload；四个 desktop-host 行禁用；没有第三方加载/安装/移除/商店。btw 受 narrow gate 限制；旧 registry 无 goal/sources。G35 未完成 |
| E10 | `docs/decisions/0002-direct-connection-transport.md`、`docs/decisions/0003-ssh-transport.md`、`docs/decisions/0004-service-operations.md`、`docs/design/units/connection.md`、`packages/mobile-hosts/src/registry.ts`、`packages/mobile-hosts/src/state-machine.ts`、`packages/mobile-hosts/src/ssh/transport.ts`、`packages/mobile-hosts/src/ssh/host-key-verifier.ts`、`packages/mobile-hosts/src/service-ops/flow.ts`、`packages/mobile-hosts/src/vault/vault.ts`、`android/app/src/main/java/ai/opencode/mobile/vault/VaultCrypto.kt`、`vendor/upstream/packages/app/src/servers/connect/pairing.ts` | 已有直连、SSH、指纹、服务操作、Keystore 和链接配对。密码/密钥兼容与错误路径按已有 ADR/实现验收；相机扫码与外链唤起不能从链接导入推定。完整 G36/SSH E2E 未完成 |
| E11 | `android/app/build.gradle.kts`、`android/app/src/main/java/ai/opencode/mobile/MainActivity.kt`、`docs/design/interaction-quality.md`、`docs/design/recovery.md`、`docs/design/commands-menus.md` | Kotlin/WebView 壳；ai.opencode.mobile，minSdk 29，compile/target 36，versionName 0.1.0；已有返回/恢复/命令契约，不是待选框架的空项目 |
| E12 | `docs/build-and-verify.md` | M-027/M-028 的历史构建、安装和 MatePad 入口/布局冒烟；完整 G36 与多个运行门禁仍 BLOCKED |
| E13 | `packages/mobile-hosts/src/ui/initial-ssh-setup.tsx`、`packages/mobile-hosts/src/initial-handoff.ts`、`vendor/upstream/packages/app/src/servers/connect/screen.tsx`、`vendor/upstream/packages/app/src/settings/shell.tsx`、`vendor/upstream/patches/mobile/manifest.json` | M-029/M-030 原地三模式与 SSH 表单；exact-owner/代际/认证 handoff，编辑中不跳转；撤销 M-027 无连接 Settings 例外；修复 keyed Show accessor 误用。G37 有局部 UI 历史证据 |
| E14 | `packages/mobile-hosts/src/ui/service-auth-prompt.tsx`、`packages/mobile-hosts/src/runtime.ts`、`packages/mobile-hosts/src/transport/basic-auth.ts`、`vendor/upstream/packages/app/src/runtime/server/api.ts`、`packages/mobile-hosts/test/runtime-ssh.test.ts`、`packages/mobile-hosts/test/service-auth-prompt.rendered.tsx`、`vendor/upstream/packages/app/src/runtime/server/client.test.ts` | 服务密码显式 Check again；仅运行期内存存储，断开/编辑/删除清除；重连再 health 后发布 endpoint，异步请求代际与取消保护；M-031 UTF-8 Basic auth。台账记录合成竞态、渲染及共享客户端测试通过，不替代真机重连 |
| E15 | `packages/mobile-hosts/src/vault/transport.ts`、`android/app/src/main/java/ai/opencode/mobile/vault/CredentialVaultBridge.kt`、`android/app/src/main/java/ai/opencode/mobile/vault/VaultGenerationGate.kt`、`android/app/src/main/java/ai/opencode/mobile/vault/VaultOriginPolicy.kt`、`android/app/src/main/java/ai/opencode/mobile/vault/VaultPayloadFiles.kt`、`android/app/src/main/java/ai/opencode/mobile/vault/VaultCrypto.kt`、`packages/mobile-hosts/test/vault-androidx-transport.test.ts` | M-032 AndroidX listener v2 取代旧 vault port 握手；精确 origin/main-frame gate、导航代际与主线程回复、请求/队列限制；OPMV1 格式不变，由 Keystore 生成 IV；删除失败保留元数据、后续写入结果不确定报 UNKNOWN，无新增事务/journal。C1–C6 设备门禁未验全 |
| E16 | `packages/mobile-hosts/src/ui/host-key-binding.ts`、`packages/mobile-hosts/src/ui/host-key-recovery-flow.ts`、`packages/mobile-hosts/src/ssh/bridge.ts`、`android/app/src/main/java/ai/opencode/mobile/ssh/SshTunnelBridge.kt`、`android/app/src/main/java/ai/opencode/mobile/ssh/SshHostKeyStore.kt`、`android/app/src/test/java/ai/opencode/mobile/ssh/SshHostKeyStoreTest.kt` | SSH 同步订阅后用独立 AndroidX bootstrap 请求 ack-gated channel；确认绑定目标/端口/指纹；known_hosts 以 Line.raw 序列化，JVM 测试覆盖写入回读、变更拒绝及外来行保留。~~最终设备提示与独立参考不一致，未继续信任和认证~~ **该差异已由 issue #61 裁定关闭（E18）：提示与独立参考相等布尔 true，历史不匹配为比对过程错位；known_hosts 取证证实应用一贯存储 bastion 真实公钥（历史重复提示根因=早期构建 writeLines 序列化缺陷，已修 4a9e096）** |
| E17 | `android/app/src/main/java/ai/opencode/mobile/ShellWorkerPolicy.kt`、`android/app/src/main/java/ai/opencode/mobile/MainActivity.kt`、`android/app/src/test/java/ai/opencode/mobile/ShellWorkerPolicyTest.kt`、`scripts/verify-connection-inline-ssh.ts`、`docs/build-and-verify.md` | 修复 APK/旧 worker 资源不同步；仅操作精确 shell origin/root scope/packaged sw.js，异步回调重检身份，无清数据；worker 有策略/JVM/模拟测试及特定旧构建 CDP 证据，不将某次 UI dump 当作 worker 状态验证 |
| E18 | `docs/build-and-verify.md`（issue #61 段，2026-10-30） | issue #61 真机运行证据（MatePad DBY2-AL00，主应用包 `install -r`，APK SHA-256 `d3bcd579…733ab`）：E1 bastion 端点六形式指纹 6/6 相等；E2 提示双通道采样（uiautomator+CDP）==ED25519 参考且两通道一致；E3 known_hosts 取证 4/4 blob==参考（H1/H3 排除、H2 裁定）；G36 矩阵 #a–#g、#i–#k PASS（含 unknown/changed key 拒绝、两步确认+forget、authRequired 可编辑重试、refused/target-refused/service-unreachable 分类、全链 401→认证→远端会话/工作台、断开红线三通道证据、3 轮信任稳定零 prompt）；#h 三模式草稿保持以临时 isolated applicationId 隔离包（`ai.opencode.mobile.sshg36h20261030`，APK SHA-256 `bea7ba14…ced90`，C6 先例方法，构建后 applicationId 已恢复）补验 PASS——无记录初始态连接屏可达、example.invalid 草稿两轮全往复三模式各自保留、零连接动作；主应用有记录态连接屏不可达（AppShell fallback 门 + extension 条目常驻 servers.list + signedOut 仅认 lone http server）为门设计实态注记、可选 UX 改进候选；任务级存活未验（归 G20⑤/G12）；incompatible 真服务未验 |

## 历史构建证据的适用范围

- M-027：台账记录第一方包 371 tests / 0 fail、连接/路由 14 tests / 0 fail；APK SHA-256 `f78f1a34cc8d6d0fdae77eed53317229c126a3187ded07be72390f77efc4fd1e`；MatePad 安装、初始 SSH hosts 入口与空态管理面通过。
- M-028：台账记录 web 构建、assembleDebug 和 MatePad 两行布局冒烟通过；APK SHA-256 `13f6c72aaf9799e2ad26a0e5c93684f815e1e52e54b6373c87c9f34e0d5fff01`。该轮部分上游测试因依赖缺失 BLOCKED。
- 设备记录为 HUAWEI DBY2-AL00 / Android 12。这里只引用去除设备网络地址后的证据摘要。
- 上述结果不能证明所有连接/主机指纹/失败恢复/真模型任务流程已经验收，也不能证明已对齐 Windows v2.2.1。
- issue-58 的设备及构建结果按 `docs/build-and-verify.md` 对应记录引用；历史/受限冒烟只适用于列明的 APK 和步骤，不外推为 SSH 服务连接通过。

### issue-58 验证记录的分界

- **入口与设置**：G37 inline form render 有历史通过；Server 设置页崩溃修复后有设备主机行/提示呈现记录。
- **一次认证后观察**：台账记录用户在设备上私下完成服务认证后，只读 CDP 确认 home route 和非空 session row；没有发送任务，没有做 disconnect/reconnect。不能写成“从未认证成功”，也不能据此判定完整任务或重连通过。
- **后续已知主机修复**：known_hosts 序列化修复有 JVM 证据；对应无诊断 APK 安装后，当前提示仍未与独立参考匹配，因此未信任，最终实连复验继续 BLOCKED。
- **多构建边界**：台账同时保留 built-not-installed、特定 APK 的安装/UI/CDP 记录及后续补充；不汇总为统一的“最新 APK 全部通过”。TypeScript 全项目检查仍有既存诊断。
