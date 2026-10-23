# 架构视角

本文是设计单元清单、结构与信任边界的单一事实源。事实状态图例见 [README.md](README.md)。

## 设计单元清单

| 设计单元 | 标识属性 | 适用约束 | 职责 | 状态 |
| --- | --- | --- | --- | --- |
| shell-startup | 应用进程启动 → 回环资产服务 → WebView 首帧 | 仅 `INTERNET` 权限；零 androidx；凭据不入普通存储 | 启动本地 asset server，加载打包的上游 app，承载返回键与生命周期红线 | 已实现（未验证）；交互已确认未实现，见 [units/shell-startup.md](units/shell-startup.md) |
| connection | 服务记录（`url` + `password` + 可选 `credentialRef`/`authToken`/`displayName`/`label`）；SSH 主机记录（`mobile-ssh:<uuid>` 身份键 + `name`/`target`/`credentialRef`） | 凭据 memory-only（M-002）；credentialRef 是非机密引用不是凭据；远端仅 HTTPS；TLS 校验不可关闭；host-key stub fail-closed | 建立到远程 OpenCode HTTP API 的认证连接；承载 host-key 确认交互（host-key-prompt）与 SSH 连接状态机 | 计划中（issue #3，字段契约部分已实现），见 [units/connection.md](units/connection.md) |
| server-list | 服务器列表 + 每服务器项目树；SSH 主机管理界面（host-manager/host-dialog，挂载于设置 servers 标签页） | 同上；SSH 主机名唯一校验；持久化载荷白名单（id/name/target/credentialRef/时间戳） | 选择远程服务器与项目、进入会话界面；SSH 主机增删改测的管理入口 | 计划中（issue #3，字段契约部分已实现），见 [units/server-list.md](units/server-list.md) |
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
│         └─ 提供打包资产 assets/web/（scripts/copy-web-dist.sh 拷入，3330 项文件，含 PWA service worker）│
│  WebView（javaScriptEnabled / domStorageEnabled；文件与内容访问关闭；geolocation 关闭）                │
│    origin = http://127.0.0.1:18090（回环可信上下文；PWA SW 可注册，行为归 G10）                        │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                               │ 加载 UI（同源）
                                               ▼
              第一方 packages/mobile-hosts（@opencode-mobile/mobile-hosts，计划中：issue #3）
                ├─ SSH 主机注册表（opencode-mobile.hosts.v1，载荷白名单：id/name/target/credentialRef/时间戳）
                ├─ 连接状态机（idle/connecting/hostKeyUnverified/ready/authRequired/incompatible/offline/reconnecting/failed）
                └─ upstream-map：SSH 主机 → 上游 extension 型 ServerConnection（键 `mobile-ssh:<uuid>`），
                   经 props.servers 注入上游 ServersProvider；直连服务仍走上游原生注册表
                                               │
                                               ▼
                              上游 OpenCode app（vendor/upstream/packages/app 静态构建；M-004 别名 / M-007 entry 引导 / M-008 设置挂载）
                                               │ HTTP API 调用（fetch / SSE / WebSocket，跨源）
                                               ▼
┌───────────────────── 远程 OpenCode 服务（远程机器负责项目、Git、Shell、模型调用） ─────────────────────┐
│  服务地址直连：HTTPS 直连远程 OpenCode HTTP API（Authorization: Basic base64("opencode:<password>")）  │
│  SSH 连接：[占位，归 issue #6] 平台 SSH 适配 → 设备侧加密隧道回环端口 → 远程 OpenCode HTTP API          │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

回环监听端口只是资产/转发入口，不是本地 OpenCode 服务；手机不运行本地 OpenCode 服务（项目范围红线）。

## 信任边界

- **origin**：UI 资产来自 `http://127.0.0.1:18090`（本机任意 App 可绑定回环端口，理论上存在端口占用/冒充面；本轮按计划固定端口交付，随机端口与 origin 固化等加固留待后续 issue）。运行期其他 App 亦可连接 18090 端口读取静态资产（均为公开于 APK 的内容，无秘密）。对远程 API 的调用是跨源请求，CORS 行为见下节。
- **TLS**：仅系统 CA（network_security_config base-config 显式声明，不信任用户安装 CA）；`onReceivedSslError` 恒 CANCEL 并仅记录错误类别，绝不 proceed；不用关闭校验规避错误。
- **cleartext**：全局 `usesCleartextTraffic=false` + base-config 禁明文；仅 `127.0.0.1`/`localhost` 域名配置允许 cleartext（资产服务与 SSH 隧道回环口）；局域网 HTTP 直连放行不在本轮范围。
- **凭据流（M-002 memory-only）**：用户输入密码 → 仅存于内存 → 在 `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 处拼接 `Basic ${btoa("opencode:<password>")}` 进入 Authorization 请求头 → 持久化编码路径（`persistence.ts` encode）恒剥离 password，任何持久化后端收不到凭据；`authToken` 是布尔标志（是否带 token），非机密。完整口径与用户可见后果见 [interaction.md](interaction.md) 的 memory-only notice。
- **credentialRef（非机密引用，计划中：issue #3）**：持久化 schema 增加的 `http.credentialRef`（M-005）与 SSH 主机记录中的 `credentialRef` 都是指向凭据条目的指针（形如 `mobile-credential:<id>` 的标识符），**不是凭据本身**，允许进入持久化载荷；它指向的凭据值在 Keystore 方案（issue #4）交付前不存在，解析端口 `CredentialResolver` 本期为 NullResolver（恒返回 undefined）。解析结果只注入内存连接对象，永不回写持久化。依赖该引用的真实解析行为归 issue #4，**BLOCKED**。
- **host-key stub fail-closed（计划中：issue #3）**：SSH 主机指纹校验端口 `HostKeyVerifier` 本期为 stub——对任何主机恒返回"拒绝"，状态机据此永不放行未确认指纹的连接；不存在"跳过校验"路径。确认 UI（host-key-prompt）与状态机状态均已立桩，真实验证数据源归 issue #6，**BLOCKED**。持久化载荷中不含指纹/凭据形态字段。
- **身份键（计划中：issue #3）**：直连服务沿用上游原生键（URL 本身，端口变化即新身份）；SSH 主机身份为 `mobile-ssh:<uuid4>`（创建即定、永不改），与隧道回环端口解耦——端口重解析（reconnect）不改变身份/scope/会话/设置键。
- **日志纪律**：logcat 仅固定 tag（`OpencodeShell`）+ 控制台消息文本与行号；不写 URL 查询参数、请求头或凭据。
- **进程边界**：壳 `onDestroy` 仅停本地回环 asset server；远程服务/任务永不因客户端断开而停止（代码注释与本文档双写）。

## CORS 差异（桌面 Electron vs 本壳）

上游桌面渲染器在 Electron 主进程为所有服务响应注入宽松 CORS（`packages/desktop/src/main/windows/headers.ts` @ pin `b4525d79bf`：`Access-Control-Allow-Origin: *`；服务未自带 `Access-Control-Allow-Headers` 时补 `*, authorization`——Chromium 仅在预检结果显式列出 `authorization` 时复用预检缓存，`*` 不覆盖它；`Access-Control-Max-Age: 7200`）。该包不在闭包内，WebView 也没有等价注入 API：远程服务不回 CORS 时，本壳的跨源 API 调用会在预检或响应读取处失败。这是 G3 列为高风险门禁的依据；预案 A（部署侧补 CORS）/ B（Android 本地反代，凭据留在 App 进程，需设计评审）/ C（平台适配层改造）均为用户决策项，在获得决策前不续做产品化，绝不关闭浏览器安全或转原生重写。

## 补丁剥离面与运行时接缝（M-001 / M-003 / M-002 / M-004…M-008）

上游闭包的 M-001/M-003 仅剥离构建期/安装期依赖，M-002 只改凭据编码路径；M-004–M-008（计划中：issue #3）是移动运行时接缝，每补丁一事：

| 补丁 | 内容 | 理由 |
| --- | --- | --- |
| M-001 | `packages/gui-extensions/package.json` devDeps 移除 `electron`、`@lydell/node-pty`、`devtools-protocol` | 仅 gui-extensions 自身测试/typecheck 使用；electron postinstall 约 110 MB |
| M-002 | `persistence.ts` encode 路径恒剥离 password（memory-only） | 凭据不入任何持久化后端；详见凭据流 |
| M-003 | `packages/client`/`plugin`/`ai` 剥离悬空 workspace 引用 | 三个目标包均不在闭包内；Bun 1.4.2 硬性报错 |
| M-004 | app vite `resolve.alias` 增 `@opencode-mobile/mobile-hosts` → 仓库根 `packages/mobile-hosts/src/index.ts`（`fileURLToPath(new URL(...))` 形式，按 importer 定位到闭包外第一方包） | 上游 app 引用第一方包的唯一构建期通道；依赖方向我方→vendor 之外的特例（仅构建别名，不改 vendor 包依赖） |
| M-005 | `ServerHttpBase` 增非机密 `credentialRef: Schema.optional(Schema.String)` | 直连服务可携带凭据引用；encode 剥 password 逻辑不变 |
| M-006 | 连接对话框 add/replace 构造连接时透传 `original.http.credentialRef` | 否则编辑服务会丢失凭据引用；"无变化早退"比较不含 ref |
| M-007 | entry.tsx：移除 `location.origin` 当作 OpenCode 服务的装配（壳 asset origin 不是 OpenCode 服务）；以 `createMobileHosts` 引导并经 `servers` 注入 SSH 主机 | 不用 `VITE_OPENCODE_SERVER_MODE=none` 构建期变量：避免隐藏的构建配置依赖，补丁可随上游 rebase；`?auth_token` 直通流在壳内不适用（无装配服务可认证） |
| M-008 | 设置 servers 标签页挂载 `<MobileHostManager/>`（lazy import） | SSH 主机管理界面入口 |

上游 npm 补丁按「上游 lock 解析版本 ∩ 上游 lock patchedDependencies 段」携带 9 项，清单与 not-carried 理由见 [vendor/upstream/PROVENANCE.md](../../vendor/upstream/PROVENANCE.md)。

## 流转矩阵

本阶段仅 shell-startup 已实现；其余单元的流转按其状态标注（vendored UI 内部流转待 G1–G12 真机核验后逐单元落契约；issue #3 的主机注册表/状态机流转以「计划中」先行落契，实现后改为「已实现（未验证）」）。逐行穷举，无省略：

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
| server-list（计划中） | 用户进入设置 → servers 标签页 | host-manager（SSH 主机管理） | 无 | 列表为空 → 空态引导（新增主机） | 计划中（M-008） |
| host-manager（计划中） | 新增/编辑 SSH 主机 | host-dialog | 主机记录（name/target/credentialRef） | 校验失败（重名/非法 target/超长）→ 行内错误，不写注册表；保存失败保留原配置 | 计划中 |
| host-dialog（计划中） | 保存 SSH 主机 | host-manager | 注册表记录（白名单载荷） | — | 计划中 |
| connection（计划中） | SSH 主机发起连接 | 连接状态机（host-key-prompt） | target、credentialRef（引用） | host-key stub 恒拒绝 → failed（可重试/编辑），永不放行未确认指纹 | 计划中（真实校验归 #6，BLOCKED） |
| 连接状态机（计划中） | 状态迁移 | 上游 server-list 行内状态 | extension 型 ServerConnection（state 映射） | offline/reconnecting 有反馈可恢复；取消恢复来源态；删除/断开零远程调用 | 计划中（G14） |
| 会话列表 | 打开会话 | 时间线 | 会话 ID | — | 未开始 |
| 时间线 | 权限请求到达 | 权限确认 | 请求内容 | 拒绝 → 任务按上游语义继续/中止 | 未开始 |
| 时间线 | 打开文件/Diff | 文件与 Diff | 文件路径 | — | 未开始 |
| 会话列表/时间线 | 打开终端 | 终端 | PTY 会话 | — | 未开始 |
| 任意单元 | 用户进入设置 | 设置 | — | — | 未开始 |
| 任意单元 | 网络断开/切换 | 失败恢复路径 | — | 有反馈可恢复，见 [interaction.md](interaction.md) 负例矩阵（G11） | 未开始 |
