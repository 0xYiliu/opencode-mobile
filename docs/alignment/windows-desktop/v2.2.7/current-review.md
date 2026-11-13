# v2.2.7 当前迁移复核

本页是 v2.2.7 迁移期间的事实入口，替代把 v2.2.1 的 E35 记录直接当作新版本结论。

- 执行卡：[execution-card.md](execution-card.md)
- 固定基准：[baseline.md](baseline.md)
- v2.2.1→v2.2.7 变化：[changes.md](changes.md)
- 稳定 ID 矩阵：[matrix.md](matrix.md)
- GitHub 跟踪：[Issue #182](https://github.com/0xYiliu/opencode-mobile/issues/182)、[#185 Home/new-session（历史）](https://github.com/0xYiliu/opencode-mobile/issues/185)、[#186 tabs/Inbox/titlebar](https://github.com/0xYiliu/opencode-mobile/issues/186)

## 当前状态

**Stage A/B：审计、文档与 vendor 重建已完成；Stage C：#186 修复后的静态验证部分完成。** 固定 tag/SHA、直接 Desktop 变化规模和 commit 盘点、共享 closure 变化规模、82 条移动补丁处置、v2.2.7 closure 重建、upstream npm patch/lockfile 重算、build-only closure patch 与四个 active mobile replay（#184 scoped overlay + inherited main server-edit patch + 历史 #185 Home overlay + 当前 #186 back bridge）均已完成；#185 worktree 仅保留为历史记录。reviewed/fix revision=`9cafaba249efbe35110988b18e2977a9c9aac04e`；提交已存在，尚未推送、创建 PR 或合并。

## 已确认事实

1. v2.2.7 为 `fedc6f208aa2bd54c1019227214568083f6380ad`，发布时间为 2026-11-10。
2. v2.2.1→v2.2.7 直接 `packages/desktop` 变化为 146 个文件，15,788 行新增、3,198 行删除。
3. 选定共享 closure 变化为 2,330 个文件，234,346 行新增、73,663 行删除；加上 Desktop 为 2,476 个文件。
4. 当前 live registry 是 **82 registered / 4 active / 19 absorbed / 59 deferred**；active 为 `v2-2-7-mobile-connection-pairing-ssh-closure`（#184 scoped overlay）、继承自 origin/main 的 `server-edit-touch-compatibility`、历史 `home-new-session-v2-2-7` 与当前 `tabs-inbox-titlebar-v2-2-7`，19 条历史 payload 由 #184 scoped overlay 明确承载，59 条 scope 外历史补丁保持 deferred；冻结 v2.2.1 的旧 registry 数字不作为当前 v2.2.7 事实。
5. `vendor-manifest.json#closurePatches` 只承载构建传递依赖修复；`vendor-manifest.json#mobilePatches` 按顺序重放 #184 scoped consolidated overlay、继承自 origin/main 的独立 `server-edit-touch-compatibility` patch、历史 #185 Home overlay 与当前 #186 back bridge。前三 patch 的顺序、hash、targets 保持不变；旧补丁文件与语义 ID 保留用于 provenance，不宣称逐条独立重基通过；19 条 #184 历史 payload 标为 absorbed，59 条 scope 外 payload 标为 deferred。
6. 修复后 patch hash 为 `1a267f74048fb0405ee9cf3fcf5ab3bb5a87547edb1f260378c25f4505325ae2`；#186 request bridge 使用 native 当前 pending requestId registry、有限 recent-request LRU 与 pagehide/Solid cleanup dispose。requestId 不是 security capability；同源 packaged app UI 是 binding trust boundary，不传敏感数据，任意未登记 ID 的行为由测试覆盖。
7. `packageSources` 为空，11 个 closure package 均从固定 v2.2.7 目标提取；上游 npm patched dependency 映射已切换为 v2.2.7 closure 实际需要的 19 项。
8. 当前 #186 证据为：app tabs/Inbox/back **138 pass / 0 fail / 383 expect / 13 files**；mobile-hosts full **446 pass / 0 fail / 3034 expect / 40 files**；back-handler focused **8 pass / 0 fail / 97 expect**；Android `BackDispatchPolicy`/Gradle/APK、Web build/copy/assets、patch registry/closure 均按修复后 revision 重跑并记录于 #186 执行段。E2E tabs/side-panels timeout 与 `verify-interaction-quality.ts` 的既有 `history.back` false positive 仍分别记为 BLOCKED；设备 hardware back、safe-area、real running session、predictive back、full typecheck 均 BLOCKED/NOT RUN。历史 #185 focused 结果只作历史证据。

## 未完成与阻塞

- `bunx tsc -b --pretty false` 仍未通过：直接错误包含 app/mobile-hosts rootDir/TS6307、app/gui-plugins source inclusion、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外 legacy GUI/Electron 测试错误。该门禁不以关闭 strict 或扩大 Android closure 解决。
- adb 安装、设备 UI、QR physical、Windows v2.2.7 运行端、真实远程服务、真实 JSch tunnel/session/stream/permission/task-survival 均未运行验证；Android Gradle/APK 仅为 build-only PASS。
- 历史 #185 worktree `feat/185-home-new-session` 的未提交状态不再是当前事实；当前 #186 worktree 为 `feat/186-tabs-inbox-titlebar`，提交已存在但尚未推送、创建 PR 或合并。版本身份已同步为 Android/mobile/About `2.2.7`、versionCode `20207`，连接服务版本仍独立展示。

因此本轮可以声明“v2.2.7 vendor/patch closure 与共享连接、配对、SSH 语义静态迁移已完成”，但不能声明 APK 可用、设备/真实服务通过或 v2.2.7 完整运行对齐完成。
