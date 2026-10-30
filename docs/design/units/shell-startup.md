# 单元：shell-startup（Android 壳启动与资产服务）

状态：代码**已实现（未验证）**（本机静态/构建级验证通过，无设备运行）；设备交互**已确认未实现**（G1/G2 执行前不视为交互能力已交付）。实现位置：`android/app/src/main/java/ai/opencode/mobile/`（`MainActivity.kt`、`WebAssetServer.kt`）。

## a) 布局分区

单区布局：全屏 WebView 容器，无原生工具栏/导航栏/抽屉（系统主题 `Theme.Material.NoActionBar`）。无尺寸分栏，不适用折叠行为。分区级约束仅一条：WebView 独占内容区，视觉基线见 [../visual.md](../visual.md)。

## b) 控件行为

| 控件/事件 | 位置 | 默认态 | 行为 | 备注 |
| --- | --- | --- | --- | --- |
| 返回键 | 系统 | — | `webView.canGoBack()` 为真 → `goBack()`；否则交系统结束 Activity | 预测性返回迁移留后续 issue（见 [../interaction.md](../interaction.md) 基线） |
| SSL 错误回调 | WebView | — | 恒 `handler.cancel()`，仅记录错误类别到 logcat | 绝不 proceed（红线） |
| 控制台消息 | WebView | — | 固定 tag `OpencodeShell` 写 logcat：消息文本 + 行号 | 不打 URL 查询参数/请求头/凭据 |
| 深链 | 系统 | — | 不实现（未注册 VIEW intent-filter，代码留 TODO） | TODO 状态：已确认未实现；评估完成（issue #71，[决策 0007](../../decisions/0007-pairing-deep-link.md) 提案态：推荐维持不实现，决策待用户） |
| 相机授权 | WebView 页面（扫码） | — | `WebChromeClient.onPermissionRequest`：`CameraGrantPolicy` 白名单（回环 origin 解析三元组 + 恰 video 资源）→ OS 运行时授权（请求码 41004）→ grant；拒绝/取消/无相机路径由页面既有错误/hint 呈现 | issue #71；契约权威见 [connection.md](connection.md) 配对专节⑦-2（frames 不出页面、零值日志） |
| Activity 销毁 | 系统 | — | 仅停本地回环 asset server，随后销毁 WebView | 远程服务/任务永不因客户端断开而停止（红线，代码注释双写） |

## c) 状态矩阵

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 无骨架/spinner：WebView 直接加载；首帧前的空白期长度待 G1 验证 |
| 空态 | 不适用：本单元无数据列表；资产缺失时的空壳由错误态覆盖 |
| 错误态 | ① asset server 端口绑定失败 → 记录日志并结束进程；② 资产文件缺失 → 回环口返回 index.html（SPA 回退），index.html 本身缺失 → 5xx 文本，壳不重试；③ SSL 错误 → 恒 CANCEL。均无重试交互（已实现（未验证）） |
| 边界态 | 权限边界：`INTERNET` + `POST_NOTIFICATIONS`（issue #23）+ `CAMERA`（issue #71，运行时权限仅经 WebView `onPermissionRequest` 应用内授予，见上表相机授权行）；资源边界：不适用；内容边界：dist 内超大资产（152.6 MB 含 sourcemap）的加载耗时由 G1/G8 覆盖 |
| 过程态 | 不适用：本单元无多步流程 |
| 恢复口径 | 实例状态恢复（`onSaveInstanceState`/`webView.saveState`）**已确认未实现**（代码 TODO 注明）；进程重建后重新走完整启动流程。凭据恢复口径见 [../interaction.md](../interaction.md) memory-only notice |

## d) 文案口径

本单元无自有文案（无 UI 文本）；应用名 `OpenCode Mobile`（`strings.xml`）。错误态文本目前为回环口的英文短句（`forbidden` / `asset server: …`），不面向用户展示路径；面向用户的错误文案随各业务单元在上游文案体系内处理，本壳不另立口径。
