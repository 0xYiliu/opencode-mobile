# 本项目实现证据：固定开发快照

## 检查身份与复现

差异盘点使用 `cf1504de929bd47bc7003c62a24e6c4488f2c498`（当时本地 `origin/dev`）；其后 `main@4c2ec43a0440c3aaec53fb5d8ade6dcaa05a8905` 合并 dev 与 issue-58。旧快照用来说明基线，不代表当前集成状态。读取命令：

```sh
git show cf1504de929bd47bc7003c62a24e6c4488f2c498:<路径>
```

issue-58 (`5a46934e7f17a32d3df5d354d18424034785efc3`) 已通过 PR #59 合并，并随 dev 经 PR #60 进入 main。其 SSH 初始连接表单、WebView worker 更新策略及相关桥修复属于当前集成实现；仍未证明完整真实 SSH/远程任务 E2E。

矩阵“已有代码”只证明功能实现的来源与契约，不保证新版本所有子行为已有，更不代表运行门禁通过。以下是分组证据索引；具体 Windows 目标及逐 ID 最小验收仍见 [baseline.md](baseline.md)。

## 证据索引

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
| E13 | `android/app/src/main/java/ai/opencode/mobile/ShellWorkerPolicy.kt`、`packages/mobile-hosts/src/ssh/`、`vendor/upstream/patches/mobile/manifest.json`、`docs/build-and-verify.md` issue-58 段 | 当前 main 已集成 M-029–M-031；inline SSH form render G37 PASS，桥接、WebView worker 和凭据修复有对应构建/设备记录；主机密钥及真实 SSH 服务认证仍未完成验收 |

## 历史构建证据的适用范围

- M-027：台账记录第一方包 371 tests / 0 fail、连接/路由 14 tests / 0 fail；APK SHA-256 `f78f1a34cc8d6d0fdae77eed53317229c126a3187ded07be72390f77efc4fd1e`；MatePad 安装、初始 SSH hosts 入口与空态管理面通过。
- M-028：台账记录 web 构建、assembleDebug 和 MatePad 两行布局冒烟通过；APK SHA-256 `13f6c72aaf9799e2ad26a0e5c93684f815e1e52e54b6373c87c9f34e0d5fff01`。该轮部分上游测试因依赖缺失 BLOCKED。
- 设备记录为 HUAWEI DBY2-AL00 / Android 12。这里只引用去除设备网络地址后的证据摘要。
- 上述结果不能证明所有连接/主机指纹/失败恢复/真模型任务流程已经验收，也不能证明已对齐 Windows v2.2.1。
- issue-58 的设备及构建结果按 `docs/build-and-verify.md` 对应记录引用；历史/受限冒烟只适用于列明的 APK 和步骤，不外推为 SSH 服务连接通过。
