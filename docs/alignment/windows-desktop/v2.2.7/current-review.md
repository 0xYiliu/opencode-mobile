# v2.2.7 当前迁移复核

本页是 v2.2.7 迁移期间的事实入口，替代把 v2.2.1 的 E35 记录直接当作新版本结论。

- 执行卡：[execution-card.md](execution-card.md)
- 固定基准：[baseline.md](baseline.md)
- v2.2.1→v2.2.7 变化：[changes.md](changes.md)
- 稳定 ID 矩阵：[matrix.md](matrix.md)
- GitHub 跟踪：[Issue #182](https://github.com/0xYiliu/opencode-mobile/issues/182)

## 当前状态

**Stage A/B：审计、文档与 vendor 重建已完成；Stage C：静态验证部分完成。** 固定 tag/SHA、直接 Desktop 变化规模和 commit 盘点、共享 closure 变化规模、79 条移动补丁处置、v2.2.7 closure 重建、upstream npm patch/lockfile 重算、build-only closure patch 与唯一 scoped consolidated overlay 重放均已完成。

## 已确认事实

1. v2.2.7 为 `fedc6f208aa2bd54c1019227214568083f6380ad`，发布时间为 2026-11-10。
2. v2.2.1→v2.2.7 直接 `packages/desktop` 变化为 146 个文件，15,788 行新增、3,198 行删除。
3. 选定共享 closure 变化为 2,330 个文件，234,346 行新增、73,663 行删除；加上 Desktop 为 2,476 个文件。
4. 当前 live registry 是 **79 registered / 1 active / 19 absorbed / 59 deferred**；active 为 `v2-2-7-mobile-connection-pairing-ssh-closure`，19 条历史 payload 由 #184 scoped overlay 明确承载，59 条 scope 外历史补丁保持 deferred；冻结 v2.2.1 的旧 registry 数字不作为当前 v2.2.7 事实。
5. `vendor-manifest.json#closurePatches` 只承载构建传递依赖修复；`vendor-manifest.json#mobilePatches` 只重放 #184 scoped consolidated overlay。旧补丁文件与语义 ID 保留用于 provenance，不宣称逐条独立重基通过；19 条 #184 历史 payload 标为 absorbed，59 条 scope 外 payload 标为 deferred。
6. `packageSources` 为空，11 个 closure package 均从固定 v2.2.7 目标提取；上游 npm patched dependency 映射已切换为 v2.2.7 closure 实际需要的 19 项。
7. `bun install`、`verify:patches`、`verify:closure`、Web build、app/GUI/mobile-hosts focused tests 与 persistence regression 已通过；app stable connection/server/pairing subset 137 pass / 0 fail（16 files）、GUI pairing/SSH 88 pass / 0 fail（11 files）、mobile-hosts 442 pass / 0 fail（40 files）。精确命令、工作目录、preload 和测试文件清单见 [execution-card.md](execution-card.md) 的“稳定 focused-test 复跑记录”；旧 settings/provider fixture subset 不纳入通过证据。

## 未完成与阻塞

- `bunx tsc -b --pretty false` 仍未通过：直接错误包含 app/mobile-hosts rootDir/TS6307、app/gui-plugins source inclusion、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外 legacy GUI/Electron 测试错误。该门禁不以关闭 strict 或扩大 Android closure 解决。
- Android Gradle/APK、adb 安装、设备 UI、QR physical、Windows v2.2.7 运行端、真实远程服务、真实 JSch tunnel/session/stream/permission/task-survival 均未运行验证。
- 当前变更保持未提交、未推送、无 PR；版本身份已同步为 Android/mobile/About `2.2.7`、versionCode `20207`，连接服务版本仍独立展示。

因此本轮可以声明“v2.2.7 vendor/patch closure 与共享连接、配对、SSH 语义静态迁移已完成”，但不能声明 APK 可用、设备/真实服务通过或 v2.2.7 完整运行对齐完成。
