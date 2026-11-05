# 移动补丁维护

移动补丁用于从固定上游来源重建当前 vendor 源码。功能差异与验收记在[功能矩阵](../../../../docs/alignment/windows-desktop/v2.2.1/matrix.md)，具体代码历史由 Git/PR 保存；不要求每个矩阵行、适配点或 commit 单独建立 patch。

## 身份与顺序

- 新 ID 与文件名使用小写 `功能域-用途`，例如 ID `connection-vault-ready-wait`、文件 `connection-vault-ready-wait.patch`。不使用全局递增编号，不绑定 Issue；有 Issue/PR 可在原因或验证记录中引用。
- ID 与用途明确后保持稳定；同名冲突先判断是否重复工作，必要时细化用途，不通过抢“下一个序号”解决。
- 历史数字 ID、数字文件名、`P126-*` 及其他已登记名称原样保留，不要求 ID 与旧文件名相同。登记工具兼容历史命名；新命名规则由变更审阅核对。
- 一组同目的修改可跨多个文件组成一个补丁。修订已有适配可更新所属补丁，但必须验证后续链仍能重放；独立目的或需独立控制的修改再新增补丁。
- **唯一执行顺序是 `vendor/upstream/vendor-manifest.json#mobilePatches` 数组。** 不从文件名、ID、登记表或来源镜像排序，不增加数字 `order`。

## 唯一事实来源与生成字段

| 内容 | 维护位置 |
| --- | --- |
| ID、路径、用途、targets、状态、hash | `manifest.json#patches`；路径相对 `vendor/upstream`，为 `patches/mobile/<名称>.patch` |
| 生效顺序 | `../../vendor-manifest.json#mobilePatches` |
| 可选依赖 | 登记条目的 `dependsOn`，引用稳定 ID；生效依赖须先于当前补丁，不能用它自动排序 |
| 机器镜像 | `../../vendor-manifest.json` 和 `../../provenance.json` 的 `mobilePatchRegistry`、`deferredMobilePatches`，由工具生成，禁止手工重复维护 |
| 来源解释与历史证据 | `../../PROVENANCE.md`、`../../provenance.json` 的其余字段；不决定当前生效顺序 |

状态仅为 `active` 或 `deferred`。active 必须且只能在生效数组出现一次；deferred 必须不在数组中。所有 `.patch` 文件均需登记；依赖不得缺失、自引用、重复或成环。

`provenance.json#p126RuntimePatchSources` 是 #126 在 `813e68d` 交付时的逐文件来源快照，`mobilePatches` 是历次来源叙述，不是额外的当前登记表。后续修订不手工刷新这些历史 hash；当前 hash 以登记表及生成镜像为准，实际来源变化另在对应 PR 说明。

## 日常操作

1. 确认固定上游、当前分支及补丁所处层次；新增补丁相对其前序补丁应用后的树生成，不将整个 upstream→当前差异重复塞入新补丁。
2. 修改源码及相应 patch，填写登记条目的 ID、路径、targets、reason、verification、status 等信息。新条目 `sha256` 可暂空，由刷新命令计算；只把需生效的路径加入唯一顺序数组。
3. 在仓库根运行：

   ```sh
   bun run patches:refresh  # 显式更新 hash 和生成镜像
   bun run verify:patches   # 只读校验登记、文件、依赖、状态与镜像
   bun run verify:closure   # 逐个重放，再比较内容、文件类型、可执行位和 symlink
   ```

4. 审阅 diff，确认 patch 内容与源码改动一致，再做本次适配所需的构建与运行验证。刷新 hash 只是登记事实，**不证明补丁可应用或行为正确**。

刷新工具先检查结构，结构错误时不写入；它不会创建 patch、修改内容、改变 ID/状态/顺序，或重写历史叙述。写入按文件原子替换；中途 I/O 失败时可能只更新部分镜像，修复环境后重新刷新并检查即可，不视为通过。

并行任务独立命名和登记；合并时保留双方条目，基于最新 main 明确数组顺序，重新刷新与重放。即使名称不同，修改相同代码仍可能发生真实冲突，需要解决补丁层次或内容，不能自动排序掩盖。`vendor-sync.sh` 会重建源码，先保存工作；它在删除前执行相同登记预检，但预检通过不保证后续 git apply 不会失败。

## 本工具的验证

`python3 scripts/test_mobile_patches.py` 覆盖两个无编号补丁并行登记与重放、重复身份/路径、状态与顺序、依赖、缺文件/符号链接/hash、镜像漂移、刷新幂等、sync 在无效登记时保留源码，以及完整 closure 对 packages/LICENSE 执行位变化的拒绝。协议测试不替代真实补丁链的 `verify:closure`。
