# Windows Desktop v2.2.7：基准、来源与验收边界

## 固定目标

| 项 | 值 |
| --- | --- |
| Desktop 版本 | `v2.2.7` |
| 上游仓库 | <https://github.com/anomalyco/opencode> |
| 固定 commit | `fedc6f208aa2bd54c1019227214568083f6380ad` |
| 发布时间 | 2026-11-10 |
| 旧版基准 | `v2.2.1` / `3ebcf9a32c7b28f658cfee80775448929361727a` |
| 上游读取方式 | `/home/peterhan/repository/opencode` 的固定 git 对象；不使用工作区 HEAD 代替 tag |
| Windows 安装包运行验证 | 未提供；Desktop 原生窗口、菜单、更新器、WSL 与视觉结论只能记录源码/构建级事实 |

上游 v2.2.7 的 `packages/app/package.json` 与 `packages/gui-plugins/package.json` 均为 `2.2.7`。当前 Mobile vendor 已从固定 v2.2.7 commit 重建，11 个 closure package 均来自该目标；当前 patch registry 为 **81 registered / 3 active / 19 absorbed / 59 deferred**。构建传递依赖由独立 `closurePatches` 修复，#184 移动差异由 24-target scoped consolidated overlay 承载，继承自 origin/main 的 server-edit patch 与 #185 Home fade patch 独立重放，不宣称历史 payload 逐条独立重放。

## 目标来源范围

### Android 需要的共享闭包

当前闭包的主要共享包为 `app`、`client`、`protocol`、`schema`、`session-ui`、`ui`、`util`、`gui-plugins`、`plugin-browser`、`plugin` 和 `ai`。这些包已从目标 tag 提取，经 build-only closure patch 与 #184 scoped overlay 重放，并由 `verify-closure.sh` 核对；后续升级仍须从新固定 tag 重新核对目录、版本、依赖、导出和生成面。

### Desktop 原生包

`packages/desktop` 继续是 Android 的排除包。v2.2.7 仍需核对其对共享前端的接口和静态资源依赖，但不把 Electron main、窗口、原生菜单、Updater、WSL、本地 PTY 或系统权限实现复制到 Android。目标 tag 新增/变化的 `packages/desktop/icons/prod` 必须先通过 app 构建导入核对决定是否进入 partial assets；不能因为目录存在就扩展 closure。

### 来源与补丁

- 移动补丁唯一重放顺序：`vendor/upstream/vendor-manifest.json#mobilePatches`。
- 补丁 ID 与文件 stem 必须保持语义身份；吸收或退休须保留历史处置记录，不静默删除。
- upstream npm patch 只携带 v2.2.7 closure 实际解析且需要的子集；Desktop-only 依赖和补丁不进入 Android closure。
- `vendor/upstream/PROVENANCE.md`、`provenance.json` 与 manifest 的机器字段由 `bun run patches:refresh` 保持一致；人工叙述只解释当前 overlay 与历史 deferred 处置。

## 最小验收要求

1. v2.2.1→v2.2.7 的直接 Desktop 变化与共享 closure 变化均有可复现的 git 命令和分类结果。
2. pristine v2.2.7 closure 加上移动补丁可按唯一顺序重放，且无 dangling workspace reference。
3. 依赖、导出、协议/schema、注册/gate、持久化、凭据、安全、生命周期和 Android bridge 变化完成语义复核；`git apply --check` 不能单独作为通过证据。
4. 版本身份为 Android/mobile/vendor/About `2.2.7`，versionCode 为 `20207`；连接的远程服务版本继续独立展示。
5. Android Gradle、APK、资源身份、覆盖安装、SSH/直连和受影响 UI/恢复路径的实际证据与源码迁移分开记录。
6. 没有 Windows 运行环境、真实服务或设备证据的项目保持“未验证/阻塞”，不宣称完整 Desktop/Android 运行等价。

## 变化总结

完整变化盘点见 [changes.md](changes.md)。完整稳定 ID 矩阵见 [matrix.md](matrix.md)；矩阵保留 v2.2.1 crosswalk，但当前 v2.2.7 的源码/补丁/构建证据以本页、[current-review.md](current-review.md) 和执行卡为准。Android APK、设备 UI、Windows 运行端、真实服务与 JSch 数据面仍按验证边界记录为未验证或阻塞。
