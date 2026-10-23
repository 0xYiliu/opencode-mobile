# 架构视角

本文是设计单元清单、结构与信任边界的单一事实源。事实状态图例见 [README.md](README.md)。

## 设计单元清单

| 设计单元 | 标识属性 | 适用约束 | 职责 | 状态 |
| --- | --- | --- | --- | --- |
| shell-startup | 应用进程启动 → 回环资产服务 → WebView 首帧 | 仅 `INTERNET` 权限；零 androidx；凭据不入普通存储 | 启动本地 asset server，加载打包的上游 app，承载返回键与生命周期红线 | 已实现（未验证）；交互已确认未实现，见 [units/shell-startup.md](units/shell-startup.md) |
| connection | 服务记录（`url` + `password` + 可选 `authToken`/`displayName`/`label`） | 凭据 memory-only（M-002）；远端仅 HTTPS；TLS 校验不可关闭 | 建立到远程 OpenCode HTTP API 的认证连接 | 已确认未实现（字段契约已实现），见 [units/connection.md](units/connection.md) |
| server-list | 服务器列表 + 每服务器项目树 | 同上 | 选择远程服务器与项目、进入会话界面 | 已确认未实现（字段契约已实现），见 [units/server-list.md](units/server-list.md) |
| 会话列表 | TODO | — | TODO | 未开始 |
| 时间线 | TODO | — | TODO | 未开始 |
| 终端 | TODO | — | TODO | 未开始 |
| 设置 | TODO | — | TODO | 未开始 |
| 权限确认 | TODO | — | TODO | 未开始 |
| 文件与 Diff | TODO | — | TODO | 未开始 |

会话列表、时间线、终端、设置、权限确认、文件与 Diff 的能力由上游闭包携带（`packages/app` 对应源码目录），但本仓库尚未为它们建立设计契约，均不视为已交付。

## 结构图

```text
┌─────────────────────────── Android 壳（本仓库 android/，已实现（未验证）） ───────────────────────────┐
│  MainActivity                                                                                        │
│    └─ WebAssetServer（NanoHTTPD，仅绑 127.0.0.1:18090）                                               │
│         └─ 提供打包资产 assets/web/（scripts/copy-web-dist.sh 拷入，3329 项静态文件 + sw.js）          │
│  WebView（javaScriptEnabled / domStorageEnabled；文件与内容访问关闭；geolocation 关闭）                │
│    origin = http://127.0.0.1:18090（回环可信上下文；PWA SW 可注册，行为归 G10）                        │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                               │ 加载 UI（同源）
                                               ▼
                              上游 OpenCode app（vendor/upstream/packages/app 静态构建）
                                               │ HTTP API 调用（fetch / SSE / WebSocket，跨源）
                                               ▼
┌───────────────────── 远程 OpenCode 服务（远程机器负责项目、Git、Shell、模型调用） ─────────────────────┐
│  服务地址直连：HTTPS 直连远程 OpenCode HTTP API（Authorization: Basic base64("opencode:<password>")）  │
│  SSH 连接：[占位，归 issue #6] 平台 SSH 适配 → 设备侧加密隧道回环端口 → 远程 OpenCode HTTP API          │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

回环监听端口只是资产/转发入口，不是本地 OpenCode 服务；手机不运行本地 OpenCode 服务（项目范围红线）。

## 信任边界

- **origin**：UI 资产来自 `http://127.0.0.1:18090`（本机任意 App 可绑定回环端口，理论上存在端口占用/冒充面；本轮按计划固定端口交付，随机端口与 origin 固化等加固留待后续 issue）。对远程 API 的调用是跨源请求，CORS 行为见下节。
- **TLS**：仅系统 CA（network_security_config base-config 显式声明，不信任用户安装 CA）；`onReceivedSslError` 恒 CANCEL 并仅记录错误类别，绝不 proceed；不用关闭校验规避错误。
- **cleartext**：全局 `usesCleartextTraffic=false` + base-config 禁明文；仅 `127.0.0.1`/`localhost` 域名配置允许 cleartext（资产服务与 SSH 隧道回环口）；局域网 HTTP 直连放行不在本轮范围。
- **凭据流（M-002 memory-only）**：用户输入密码 → 仅存于内存 → 在 `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 处拼接 `Basic ${btoa("opencode:<password>")}` 进入 Authorization 请求头 → 持久化编码路径（`persistence.ts` encode）恒剥离 password，任何持久化后端收不到凭据；`authToken` 是布尔标志（是否带 token），非机密。完整口径与用户可见后果见 [interaction.md](interaction.md) 的 memory-only notice。
- **日志纪律**：logcat 仅固定 tag（`OpencodeShell`）+ 控制台消息文本与行号；不写 URL 查询参数、请求头或凭据。
- **进程边界**：壳 `onDestroy` 仅停本地回环 asset server；远程服务/任务永不因客户端断开而停止（代码注释与本文档双写）。

## CORS 差异（桌面 Electron vs 本壳）

上游桌面渲染器在 Electron 主进程为所有服务响应注入宽松 CORS（`packages/desktop/src/main/windows/headers.ts` @ pin `b4525d79bf`：`Access-Control-Allow-Origin: *`；服务未自带 `Access-Control-Allow-Headers` 时补 `*, authorization`——Chromium 仅在预检结果显式列出 `authorization` 时复用预检缓存，`*` 不覆盖它；`Access-Control-Max-Age: 7200`）。该包不在闭包内，WebView 也没有等价注入 API：远程服务不回 CORS 时，本壳的跨源 API 调用会在预检或响应读取处失败。这是 G3 列为高风险门禁的依据；预案 A（部署侧补 CORS）/ B（Android 本地反代，凭据留在 App 进程，需设计评审）/ C（平台适配层改造）均为用户决策项，在获得决策前不续做产品化，绝不关闭浏览器安全或转原生重写。

## 补丁剥离面（M-001 / M-003）

上游闭包仅剥离构建期/安装期依赖，不改运行时逻辑（运行时行为补丁仅 M-002，见凭据流）：

| 补丁 | 剥离内容 | 理由 |
| --- | --- | --- |
| M-001 | `packages/gui-extensions/package.json` devDeps 移除 `electron`、`@lydell/node-pty`、`devtools-protocol` | 仅 gui-extensions 自身测试/typecheck 使用；electron postinstall 约 110 MB |
| M-003 | `packages/client` devDeps 移除 `@opencode/httpapi-codegen`；`packages/plugin` 从 devDependencies、peerDependencies、peerDependenciesMeta 三处移除 `@opencode/theme`；`packages/ai` devDeps 移除 `@opencode/http-recorder` | 三个目标包均不在闭包内；Bun 1.4.2 对悬空 workspace devDep 与未满足 workspace peerDep 硬性报错 |

上游 npm 补丁按「上游 lock 解析版本 ∩ 上游 lock patchedDependencies 段」携带 9 项，清单与 not-carried 理由见 [vendor/upstream/PROVENANCE.md](../../vendor/upstream/PROVENANCE.md)。

## 流转矩阵

本阶段仅 shell-startup 已实现；其余单元的流转按其状态标注（vendored UI 内部流转待 G1–G12 真机核验后逐单元落契约）。逐行穷举，无省略：

| 来源单元 | 触发点 | 目的地 | 携带参数 | 未授权/失败时行为 | 状态 |
| --- | --- | --- | --- | --- | --- |
| shell-startup | 进程启动 | WebAssetServer | 无（固定端口 18090） | 端口绑定失败 → 记录日志并结束进程 | 已实现（未验证） |
| shell-startup | asset server 就绪 | WebView 加载 `http://127.0.0.1:18090/` | 无 | 资产缺失 → 回环口返回 5xx 文本（壳不重试） | 已实现（未验证） |
| shell-startup | 返回键 | `webView.canGoBack()` 则 goBack，否则结束 Activity | 无 | — | 已实现（未验证） |
| shell-startup | Activity 销毁 | 停本地 asset server | 无 | 远程服务/任务不受影响（红线） | 已实现（未验证） |
| shell-startup | WebView 首帧 | 上游 app 启动流程 | 无 | — | 待验证（G1/G2） |
| 上游 app（vendored） | 用户录入服务 | connection | url、password（内存） | 认证失败 → 上游认证失败路径（M-002 容忍缺失密码 → 失败路径成立），反馈形态待验证 | 待验证（G3/G4/G11） |
| connection（成立后） | 认证通过 | server-list | 服务记录（无 password） | — | 已确认未实现 |
| server-list | 选择服务器/项目 | 会话列表 | 项目元数据 | — | 已确认未实现 |
| 会话列表 | 打开会话 | 时间线 | 会话 ID | — | 未开始 |
| 时间线 | 权限请求到达 | 权限确认 | 请求内容 | 拒绝 → 任务按上游语义继续/中止 | 未开始 |
| 时间线 | 打开文件/Diff | 文件与 Diff | 文件路径 | — | 未开始 |
| 会话列表/时间线 | 打开终端 | 终端 | PTY 会话 | — | 未开始 |
| 任意单元 | 用户进入设置 | 设置 | — | — | 未开始 |
| 任意单元 | 网络断开/切换 | 失败恢复路径 | — | 有反馈可恢复，见 [interaction.md](interaction.md) 负例矩阵（G11） | 未开始 |
