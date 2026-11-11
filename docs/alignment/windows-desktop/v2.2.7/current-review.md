# v2.2.7 当前迁移复核

本页是 v2.2.7 迁移期间的事实入口，替代把 v2.2.1 的 E35 记录直接当作新版本结论。

- 执行卡：[execution-card.md](execution-card.md)
- 固定基准：[baseline.md](baseline.md)
- v2.2.1→v2.2.7 变化：[changes.md](changes.md)
- 稳定 ID 矩阵：[matrix.md](matrix.md)
- GitHub 跟踪：[Issue #182](https://github.com/0xYiliu/opencode-mobile/issues/182)

## 当前状态

**Stage A：审计与文档进行中。** 已完成固定 tag/SHA、直接 Desktop 变化规模和 commit 盘点、共享 closure 变化规模、当前 78 条移动补丁登记确认，以及 v2.7 目标 closure 的首次重放探测。

## 已确认事实

1. v2.2.7 为 `fedc6f208aa2bd54c1019227214568083f6380ad`，发布时间为 2026-11-10。
2. v2.2.1→v2.2.7 直接 `packages/desktop` 变化为 146 个文件，15,788 行新增、3,198 行删除。
3. 选定共享 closure 变化为 2,330 个文件，234,346 行新增、73,663 行删除；加上 Desktop 为 2,476 个文件。
4. 当前 live registry 是 78 active patches；旧文档中的 65/75 只属于历史轮次。
5. 当前第一条移动补丁在 v2.2.7 目标树上不再适用，说明移动补丁必须逐条重基，不能直接复用旧 replay 数组。

## 未完成与阻塞

- v2.2.7 vendor closure 尚未重建到工作树。
- 78 条移动补丁尚未完成逐条 disposition、重生成和语义复核。
- 依赖/lockfile/upstream npm patch 子集尚未迁移。
- Android 版本身份尚未改为 2.2.7/20207。
- 没有 Windows v2.2.7 运行端，也没有 v2.2.7 Android APK/设备/远程服务验证。

没有上述证据前，不声明“v2.2.7 完整对齐完成”。
