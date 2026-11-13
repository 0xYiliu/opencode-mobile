# v2.2.7 当前迁移复核

本页是 v2.2.7 迁移期间的事实入口，替代把 v2.2.1 的 E35 记录直接当作新版本结论。

- 执行卡：[execution-card.md](execution-card.md)
- 固定基准：[baseline.md](baseline.md)
- v2.2.1→v2.2.7 变化：[changes.md](changes.md)
- 稳定 ID 矩阵：[matrix.md](matrix.md)
- GitHub 跟踪：[Issue #182](https://github.com/0xYiliu/opencode-mobile/issues/182)、[#185 Home/new-session（历史）](https://github.com/0xYiliu/opencode-mobile/issues/185)、[#186 tabs/Inbox/titlebar](https://github.com/0xYiliu/opencode-mobile/issues/186)、[#187 timeline/messaging](https://github.com/0xYiliu/opencode-mobile/issues/187)

**Provenance（#187 轮）**：implementation revision=`4b86f9b`（commit 1，panel-motion guard + patch 注册——implementation/fix revision binding）；registry/absorption revision=`004ed54`；web payload revision=`c8163a3`；documentation/final revision=本轮 docs-only commit（完整 SHA 在交付报告记录，binding 注记见 #187 执行卡——documentation/final revision binding）。本页及同轮事实入口的当前最终 HEAD 通过该 docs-only commit 追溯；不改代码、patch scope、registry、replay 或验证边界。前轮（#186）binding `9cafaba…`/`b6568fe…` 保持历史有效。

## 当前状态

**Stage A/B：审计、文档与 vendor 重建已完成；Stage C：#187 轮静态验证完成（设备面维持 BLOCKED）。** 固定 tag/SHA、直接 Desktop 变化规模和 commit 盘点、共享 closure 变化规模、83 条移动补丁处置、v2.2.7 closure 重建、upstream npm patch/lockfile 重算、build-only closure patch 与五个 active mobile replay（#184 scoped overlay + inherited main server-edit patch + 历史 #185 Home overlay + #186 back bridge + 本轮 #187 panel-motion guard）均已完成；#185/#186 worktree 仅保留为历史记录。#187 implementation revision=`4b86f9b`；提交已存在，尚未推送、创建 PR 或合并。

## 已确认事实

1. v2.2.7 为 `fedc6f208aa2bd54c1019227214568083f6380ad`，发布时间为 2026-11-10。
2. v2.2.1→v2.2.7 直接 `packages/desktop` 变化为 146 个文件，15,788 行新增、3,198 行删除。
3. 选定共享 closure 变化为 2,330 个文件，234,346 行新增、73,663 行删除；加上 Desktop 为 2,476 个文件。
4. 当前 live registry 是 **83 registered / 5 active / 26 absorbed / 52 deferred**；active 为 `v2-2-7-mobile-connection-pairing-ssh-closure`（#184 scoped overlay）、继承自 origin/main 的 `server-edit-touch-compatibility`、历史 `home-new-session-v2-2-7`、`tabs-inbox-titlebar-v2-2-7`（#186）与本轮 `timeline-messaging-v2-2-7`（#187），26 条历史 payload 明确承载（19 条由 #184 scoped overlay + 7 条 #187 轮翻转：vendor pin byte-identity / `timeline-messaging-v2-2-7` panel-motion / `tabs-inbox-titlebar-v2-2-7` back bridge），52 条 scope 外历史补丁保持 deferred（其中 5 条带 #187 owner routing note）；冻结 v2.2.1 的旧 registry 数字不作为当前 v2.2.7 事实。
5. `vendor-manifest.json#closurePatches` 只承载构建传递依赖修复；`vendor-manifest.json#mobilePatches` 按顺序重放 #184 scoped consolidated overlay、继承自 origin/main 的独立 `server-edit-touch-compatibility` patch、历史 #185 Home overlay、#186 back bridge 与本轮 #187 panel-motion guard。前四 patch 的顺序、hash、targets 保持不变；旧补丁文件与语义 ID 保留用于 provenance，不宣称逐条独立重基通过；absorbed/deferred 的当前分布见事实 4。
6. 修复后 patch hash 为 `1a267f74048fb0405ee9cf3fcf5ab3bb5a87547edb1f260378c25f4505325ae2`（#186）；本轮 #187 patch SHA-256=`602b9ac14bc06d4f19e605e1fccc11d88a6a6f1cd753721b494c57fe8a0b1a99`（targets 仅 `shell/panel-motion.ts`+`panel-motion.test.ts`，从退役 `session-android-adaptation` 重基；#197 不得双落）。#186 request bridge 使用 native 当前 pending requestId registry、有限 recent-request LRU 与 pagehide/Solid cleanup dispose。requestId 不是 security capability；同源 packaged app UI 是 binding trust boundary，不传敏感数据，任意未登记 ID 的行为由测试覆盖。
7. `packageSources` 为空，11 个 closure package 均从固定 v2.2.7 目标提取；上游 npm patched dependency 映射已切换为 v2.2.7 closure 实际需要的 19 项。
8. 当前 #186 证据为：app tabs/Inbox/back **138 pass / 0 fail / 383 expect / 13 files**；mobile-hosts full **446 pass / 0 fail / 3034 expect / 40 files**；back-handler focused **8 pass / 0 fail / 97 expect**；Android `BackDispatchPolicy`/Gradle/APK、Web build/copy/assets、patch registry/closure 均按修复后 revision 重跑并记录于 #186 执行段。E2E tabs/side-panels timeout 与 `verify-interaction-quality.ts` 的既有 `history.back` false positive 仍分别记为 BLOCKED；设备 hardware back、safe-area、real running session、predictive back、full typecheck 均 BLOCKED/NOT RUN。历史 #185 focused 结果只作历史证据。
9. 当前 #187 证据为：session-ui focused（9 文件）**139 pass / 0 fail / 436 expect**；app focused（14 文件，两条件形）**182 pass / 0 fail / 704 expect**（计划基线 180/702 恰 +2 isRTL 期望；逐字命令与重建清单口径见 #187 执行卡与 build-and-verify #187 段）；mobile-hosts **446 pass / 0 fail / 3034 expect / 40 files**；`mobile-patches.py` PASS（83）、`test_mobile_patches.py` OK（9/9）、`verify-closure.sh` PASS（DANGLING=0）、`git diff --check` PASS、Web build/copy/assets PASS（5520 files / 155,503,085 bytes；manifest 已刷新提交）、Gradle JVM 47/0 + APK `b5332707…`（66,052,781 bytes，未安装）。上游审计：pass-1 285 SAME + 1 DIFF（#186 screen.tsx hunk）、pass-2 273 SAME、absence 108 项 0 present。#187 设备面（WebView 114 `:dir()` 回归、面板 RTL 走查、长历史 UX、menu 触摸、锚点跳转）**NOT RUN**。历史 #185/#186 focused 结果按各自轮次保留。

## 未完成与阻塞

- `bunx tsc -b --pretty false` 仍未通过：直接错误包含 app/mobile-hosts rootDir/TS6307、app/gui-plugins source inclusion、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外 legacy GUI/Electron 测试错误。该门禁不以关闭 strict 或扩大 Android closure 解决。
- adb 安装、设备 UI、QR physical、Windows v2.2.7 运行端、真实远程服务、真实 JSch tunnel/session/stream/permission/task-survival 均未运行验证；Android Gradle/APK 仅为 build-only PASS。#187 轮新增 NOT RUN 项：WebView 114 真机 `:dir()` 崩溃场景回归（vendored guard 的目标缺陷环境）、面板开合 RTL/RTL-less 实机走查、长历史会话 UX、menu 触摸、锚点跳转——解除条件均为授权设备（与一次性长历史测试会话）。
- 历史 #185 worktree `feat/185-home-new-session` 的未提交状态不再是当前事实；当前 #186 worktree 为 `feat/186-tabs-inbox-titlebar`，提交已存在但尚未推送、创建 PR 或合并。版本身份已同步为 Android/mobile/About `2.2.7`、versionCode `20207`，连接服务版本仍独立展示。

因此本轮可以声明“v2.2.7 vendor/patch closure 与共享连接、配对、SSH 语义静态迁移已完成”，但不能声明 APK 可用、设备/真实服务通过或 v2.2.7 完整运行对齐完成。
