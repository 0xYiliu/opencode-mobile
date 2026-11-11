# v2.2.7 上游对齐执行卡

## 工作单元 / 用户可观察目标

将固定的 Windows Desktop 对齐目标从 v2.2.1 切换到 v2.2.7；保留 v2.2.1 为冻结历史快照；完整记录 v2.2.1→v2.2.7 的 Desktop 与共享前端闭包变化；在不复制 Electron Desktop 运行时的前提下，重建 Android vendor 闭包和移动补丁链。

## 关联记录

- GitHub Issue：[#182](https://github.com/0xYiliu/opencode-mobile/issues/182)
- 旧版本矩阵：[v2.2.1](../v2.2.1/matrix.md)
- 新版本目录：[v2.2.7](.)

## 基准与工作区

- 绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`
- 分支：`feat/upstream-227-alignment`
- 开工 base / 当前 HEAD：`fd898b8ea2107884729530aedfb9bf34e173a3bc`
- 开工状态：干净；主工作树未修改
- 上游旧目标：v2.2.1 / `3ebcf9a32c7b28f658cfee80775448929361727a`
- 上游新目标：v2.2.7 / `fedc6f208aa2bd54c1019227214568083f6380ad`
- 新目标发布时间：2026-11-10

## 当前 vendor 与补丁基线

- 全局 vendor pin：`b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`
- 当前 `packageSources.gui-plugins`：v2.2.1 / `3ebcf9a…`
- 当前移动补丁：78 registered / 78 active / 0 deferred；唯一重放顺序为 `vendor-manifest.json#mobilePatches`
- 当前客户端身份：Android/mobile `2.2.1`，versionCode `20201`；vendor app 包仍为旧 pin 的 `2.1.4`
- 当前预迁移门禁：`python3 scripts/mobile-patches.py` PASS（78）
- 当前预迁移闭包：`verify-closure.sh` FAIL；现有工作树报告额外的 `vendor/upstream/packages/app/vendor` 目录。该结果只作为基线事实，不作为 v2.2.7 迁移结果。

## 范围

### 本次包含

1. 固定比较 v2.2.1→v2.2.7 的所有 Desktop 直接变化与共享前端闭包变化。
2. 新建 v2.2.7 基准、变化总结和完整稳定 ID 矩阵。
3. 按 v2.2.7 目标源码重新推导 closure、partial assets、上游 npm patch 子集和 lockfile。
4. 对现有 78 条移动补丁逐条给出处置：保留重基、上游吸收、语义重写、退休或新增移动适配。
5. 将 Android/mobile/About/vendor 身份同步到 2.2.7；远程服务版本继续独立展示。

### 本次不包含

- 不把 `packages/desktop` Electron 主体复制到 Android。
- 不改变 WSL 执行排除、手机本地服务排除、APK 自动更新暂缓、语音暂缓、第三方 GUI 商店排除或进程死亡推送边界。
- 不创建 tag、GitHub Release、上传 APK 或自动合并。
- 不把 v2.2.1 的历史 PASS/BLOCKED 回填成 v2.2.7 结果。

## 验收标准

### Stage A：审计与文档

- [x] 新目标 tag/SHA、旧目标 tag/SHA 和预迁移机器基线已记录。
- [x] 直接 Desktop 变化与共享 closure 变化的范围、数量、分类方法已记录。
- [x] v2.2.7 baseline、变化总结和矩阵已建立；v2.2.1 历史文件不被重写。
- [ ] 版本敏感探针、设计文档和当前目标引用完成 active/history/policy 分类。

### Stage B：vendor 与补丁迁移

- [ ] v2.2.7 closure 与 partial assets 由目标源码推导完成。
- [ ] upstream npm patches 与 lockfile 按 v2.2.7 closure 重算。
- [ ] 78 条移动补丁逐条有 disposition、new baseline、targets、依赖和验证记录。
- [ ] pristine v2.2.7 closure + ordered mobile patches 可干净重放。
- [ ] Android/mobile/vendor/About 身份同步为 2.2.7 / 20207。

**当前门禁状态：暂阻塞于语义重基，不是产品决策阻塞。** v2.2.7 pristine closure 与旧 v2.2.1 mobile tree 的三方试算得到：296 个文件的移动差异已被上游吸收，71 个文件可自动三方合并，232 个文件存在真实冲突（主要为 app 225、ui 31、session-ui 30；统计按重叠目录会重复计数）。首个结构性冲突是 `connection-dialog-credential-reference`：v2.2.7 已将连接表单迁移到 `servers/connect/machine.ts` + `controller.ts`，旧补丁不能只重写行号，必须把 credentialRef 语义接到新状态机的 `ServerOriginal`/`ServerSaveAction` 契约。

### Stage C：验证与交付

- [ ] patch、closure、install、web build、typecheck、相关单测和 Android Gradle 门禁完成 before/after 对账。
- [ ] 可用设备上完成数据保留覆盖安装和受影响路径验证；无环境项明确标记未验证/阻塞。
- [ ] 远程服务版本、Windows 运行端缺失和 Desktop-only 能力边界均单独记录。
- [ ] 新矩阵、设计文档、来源证明和实现状态一致后再提交。

## 当前结果 / 下一步

- 当前状态：**Stage A 审计与文档进行中**。
- 已完成：上游 tag 固定、差异规模盘点、Desktop commit/path 盘点、78 条补丁现状确认、目标闭包首次重放探测。
- 关键发现：v2.2.7 已吸收部分旧移动差异；`gui-plugins-native-test-deps` 需要保留“删除 Electron 测试依赖”的语义，但必须在 v2.2.7 的 package.json（新增 protocol devDependency、依赖移除形态变化）上重新生成。
- 剩余：按连接/设置/会话/UI/platform 域逐条重写冲突补丁；完成 upstream npm patch/lockfile 重建后才能运行实际 vendor replay。
- 停止条件：出现需要改变产品范围、安全策略、远程服务承诺或删除既有移动适配的决策时暂停并记录。
