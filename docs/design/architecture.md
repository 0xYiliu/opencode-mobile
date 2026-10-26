# 架构视角

本文是设计单元清单、结构与信任边界的单一事实源。事实状态图例见 [README.md](README.md)。

## 设计单元清单

| 设计单元 | 标识属性 | 适用约束 | 职责 | 状态 |
| --- | --- | --- | --- | --- |
| shell-startup | 应用进程启动 → 回环资产服务 → WebView 首帧 | 仅 `INTERNET` 权限；零 androidx；凭据不入普通存储 | 启动本地 asset server，加载打包的上游 app，承载返回键与生命周期红线 | 已实现（未验证）；交互已确认未实现，见 [units/shell-startup.md](units/shell-startup.md) |
| connection | 服务记录（`url` + `password` + 可选 `credentialRef`/`authToken`/`displayName`/`label`）；SSH 主机记录（`mobile-ssh:<uuid>` 身份键 + `name`/`target`/`credentialRef`）；凭据保险库条目（信封 v1 密文 + 元数据索引）；直连错误分类码（`DirectErrorCode` 十二码，`transport/connection-errors.ts`）；SSH 失败分类码（`SshErrorCode` 十四码，`transport/ssh-errors.ts` + Kotlin 镜像，issue #6 已实现（未验证）） | 凭据 memory-only（M-002）+ 可选记住经 vault 加密落盘（issue #4，无明文回退）；credentialRef 是非机密引用不是凭据；远端仅 HTTPS（明文直连不支持，issue #5 D3）；TLS 校验不可关闭（system CA 唯一锚，D2）；重定向 validated-follow + userinfo 拒发（D1/D-URL）；host-key stub fail-closed 为默认注入（真实校验经第三桥注入，已实现（未验证）） | 建立到远程 OpenCode HTTP API 的认证连接；承载 host-key 确认交互（host-key-prompt）与 SSH 连接状态机；承载凭据的设备侧加密存储（vault 端口/桥/Keystore）；承载直连传输卫生（secure-fetch/URL 策略）与端点 probe 分类器（probe 端口/桥传输） | 已实现（未验证）；设备交互 BLOCKED（G14、host-key/隧道归 #6、C1–C5 归 #4、G16 归 #5），见 [units/connection.md](units/connection.md) |
| server-list | 服务器列表 + 每服务器项目树；SSH 主机管理界面（host-manager/host-dialog，挂载于设置 servers 标签页）；凭据管理器（credential-manager，issue #4） | 同上；SSH 主机名唯一校验；持久化载荷白名单（id/name/target/credentialRef/时间戳）；凭据管理器仅展示元数据无值 | 选择远程服务器与项目、进入会话界面；SSH 主机增删改测的管理入口；凭据条目的元数据查看/删除与恢复 | 已实现（未验证）；设备交互 BLOCKED（G13/G15、C2 归 #4），见 [units/server-list.md](units/server-list.md) |
| service-ops | 服务状态快照（`ServiceStatus` 六态 + `checkedAt`/`survivedDisconnect`/limitations）；白名单命令模板表（`ServiceOpsAction` × OS 三分变体，OS 适用域闭域）；授权流状态机（O1–O14）；服务操作错误分类码（`ServiceOpsErrorCode` 二十一码 + Kotlin 镜像，issue #7 已实现（未验证）） | 桥协议只传 `{templateId, params, os}` 永不传命令字符串（无自由命令注入面，双门禁白名单）；预览=执行逐字节一致（golden vectors）；零删除类模板（N8）；curl 管道模板 POSIX 闭域（N2）；凭据逐命令解析单次过桥（N7，继承 0003 §4）；无确认不执行；断开永不停止远端（O14 无 disconnect→stop 边） | 发现远端服务与版本（API 权威 + exec 安装面，诚实限制清单）；显式授权 install/start/upgrade/replace/stop（预览→危险确认→执行）；断开存活复核（B1 触发集 watcher） | 已实现（未验证）；设备/真 OS BLOCKED（G18、三 OS E2E），见 [units/service-ops.md](units/service-ops.md) 与[决策 0004](../decisions/0004-service-operations.md) |
| projects-sessions（会话列表） | 会话记录（`SessionInfo`，`time.archived` 时间戳）；项目身份 = worktree 远端绝对路径（`pathKey`）+ `ServerScope` 双重键 | 路径语义全部经上游服务契约（`file.list`/`file.find`/`location`/worktree），web 平台目录选择恒远端模式（结构性保证）；客户端零手机 FS 参与代码、零 OS 条件分支（白名单负例探针）；归档为可逆元数据操作（无危险确认，本期无 unarchive 界面=上游能力边界） | 浏览/选择远程目录、创建/打开/fork/重命名/归档会话、切换项目与工作区（全部复用上游 UI/API）；M-017 归档接线；M-018 多服务器设置布局的 SSH hosts 入口+守卫修订（server-list 预登记债务承接） | 已实现（未验证）；运行期归 G19，见 [units/projects-sessions.md](units/projects-sessions.md) |
| session-workbench（会话工作台/时间线） | 会话消息与事件流（`session.*` SSE 事件全集 + HTTP 快照读，`client/src/solid/data.ts` `handleEvent`）；工具/子任务状态；草稿与滚动（`Persist.serverScoped(prompt)` + `sessionView`） | 取消仅在显式用户动作：`api.session.interrupt` 线级调用点全仓恰三处（composer 停止/空提交入口、running-menu 子会话入口、revert stage 前置序列），断开路径零 API 调用（不因客户端断开停止远程任务）；SSE live-only 无重放，恢复=服务端快照重放真相（`sync.invalidate()` + `server.connected` reconcile + connected-gated 再同步）；未知事件静默 fall-through（`handleEvent` 无 `default:`） | 渲染流式时间线与长历史、模型/代理/工具/子任务状态与失败、请求 dock 事件接线、composer 发送/排队/重试、草稿/滚动/上下文按会话保持（全部复用上游 `session-ui`+app+client 闭包，零新建第一方界面） | 已实现（未验证）；运行期归 G20，见 [units/session-workbench.md](units/session-workbench.md) |
| 终端（远程 PTY 会话） | 终端 tab（`pty.create`/`pty.remove`/`pty.update` + `pty.exited` 事件 + workspace 键 `${server}\0${directory}`）；ws 通道（一次性 ticket → `ws(s)://…/api/pty/:ptyID/connect` 升级、二进制控制帧+文本数据帧）；ghostty-web 渲染与 2000 行序列化恢复；移动入口（More 抽屉 order 30/menu kind） | tab 关闭即远端终止（显式 `pty.remove`，无 detach-only 标签操作）；断开零终止（红线：客户端断开路径零 remove/kill 调用 + 服务端 detach 不 kill）；ticket 一次性非凭据（引 [决策 0002](../decisions/0002-direct-connection-transport.md) D5）；移动输入缺口如实（IME/外接键盘/触屏选择无移动专码，G24 判定）；resize 断连期陈旧尺寸上游无重推兜底（如实登记）；新面零 OS 条件分支（白名单探针） | 多终端 tab 创建/切换/重命名/拖拽/关闭（上限 20）、远程 PTY 二进制 I/O、resize、退避重连+探活分类+clone 恢复、2000 行快照恢复、软键盘视口联动（全部复用上游闭包，零新建第一方界面） | 已实现（未验证）；运行期归 G24，见 [units/terminal.md](units/terminal.md) |
| 设置 | TODO（providers/models 配置面已于 issue #14 建立契约，见下行 providers-models；其余 tab 仍未建立契约） | — | TODO | 未开始（providers/models 除外） |
| providers-models（远程 Provider 与模型配置） | 设置 providers/models 双 tab（`SettingsProviders`/`SettingsModels`，`SettingsServerDataScope` 作用域装配）；连接对话框（方法选择/key 表单/OAuth auto+code 双视图，`integration.oauth.*` attempt 轮询 + `credential.*` 元数据操作）；模型选择器族（select-dialog/tooltip limits/unpaid）；模型选择 per 服务器+目录持久化（`Persist.serverWorkspace(…, "model-selection")`） | provider API key/OAuth token 全部服务端存储（`Credential.Entry` 权威），客户端只见元数据（`Connection.CredentialInfo` 无值字段），不落地设备、不入普通 Web 存储（持久化键穷举恰三非凭据）；OAuth 服务端 attempt+客户端轮询，无 deep-link 回跳依赖（授权回调打向服务端）；`credential.list`（含 secret 描述）零调用（负断言）；no local model/tool execution（四包 import 形态负断言 + 零 AI SDK 依赖）；custom provider 保存为上游 stub（逐字 TODO）；模型可见性/recent/variant 偏好 `Persist.global("model")` 跨服务器全局（上游实态例外）；i18n zh 部分覆盖、缺失三族回退 en（上游实态）；新面零 OS 条件分支（49 文件白名单探针） | 列出/添加/选择/配置受支持的 providers 与 models（连接对话框方法选择、账号管理 activate/rename/remove、模型目录与可见性开关）；呈现远程可用性（connected 集+integration.connections 三态）、limits（`limit {context, input?, output}`/`cost` 随 catalog+tooltip）与服务端错误（`formatServerError` 全链）；OAuth 连接的发起/轮询/取消/过期/重试与三重回退（全部复用上游闭包，零新建第一方界面） | 已实现（未验证）；运行期归 G25，见 [units/providers-models.md](units/providers-models.md) |
| permission-requests（权限请求与 Agent 提问） | 权限请求（`permission.asked`/`replied` SSE 事件 + HTTP 快照，`PermissionRequest` 生成类型）与表单类请求（`form.created`/`replied`/`cancelled`，`FormInfo` 三 kind：question/websearch.provider/mcp-elicitation）；决策三值 `once`/`always`/`reject` + form reply/cancel | 决策三值语义上游承载；请求身份会话作用域（服务端 `per_` ID + `requireOwnedRequest` 双校验）；auto-approve 默认关、显式 opt-in 才代答；断开路径零 reply 调用（线级调用点穷举恰两处，均显式动作/显式 opt-in）；事件 ephemeral、恢复靠 HTTP 快照（per-location 聚合枚举 + never-loaded 残例如实）；服务端 shutdown 全拒不静默批准 | 呈现权限/提问请求上下文与决策集（dock 三家族）、处理 approve/reject/answer、duplicate/stale/expired 处置、auto-approve opt-in、跨会话注意态、响应留痕（全部复用上游闭包，零新建第一方界面） | 已实现（未验证）；运行期归 G21，见 [units/permission-requests.md](units/permission-requests.md) |
| files（远程文件浏览/搜索/查看与上下文引用） | 远程文件树/搜索/查看（`file.list`/`file.find`/`file.read` 三端点 + `filesystem.changed` 事件）；path identity=workspace 相对路径 + `location` 作用域；行范围选择与 @-引用；文件 tab/滚动/行选择按 workspace 恢复（`SessionStateKey` 键控 + `file-view` scoped store） | 读取路径服务端围栏归一 404（NUL/词法/realpath 三重，引上游 pin 缓存）；`fs.list` 允许父/兄弟目录为上游有意设计（如实披露）；写面唯一调用点归 #16（穷举断言恰 `composer/attachments/destination.ts`）；恢复键控 `SessionStateKey`/`file-view`；移动专属面 MobileFiles；新面零 OS 条件分支（探针白名单扫描）；搜索失败吞为空结果（如实） | 浏览远程项目文件树、按名称/内容搜索、查看文本/媒体文件（四态：loading/empty/loaded/error + notFound/large/binary/encoding/stale 处置）、把选中文件/行范围附入会话上下文、恢复打开的文件 tab 与行选择（全部复用上游闭包，零新建第一方界面） | 已实现（未验证）；真机归 G22，见 [units/files.md](units/files.md) |
| diff（远程 Git 审查与 worktree 操作） | review 三模式（`ChangeMode` git/branch/turn——`vcs.diff` working/branch + `session.diff` turn）+ `vcs.status` working-copy 变更 + `vcs.branch.list` 分支候选 + worktree 四端点（list/create/remove/refresh）+ revert 三端点（stage/clear/commit）+ `filesystem.changed`/`worktree.updated`/`session.revert.*` 事件 | staged/unstaged 分解与 git commit 无上游客户端面（能力边界如实登记）；worktree.remove 显式五层确认链（唯一不可逆操作）；undo/redo 可逆对+失败即停；破坏性操作零静默；移动面 MobileReview+wrap 设置（Changes 为 tab 条一级 tab）；新面零 OS 条件分支（六域白名单探针）；远程路径恒经 `location` 作用域读取、绝不映射本地 IDE | 渲染远程 Git 变更审查（移动 Changes 一级 tab + 桌面 review 面板：三模式/大 diff 占位/二进制占位/媒体/行评论）、details 的 changes 行与 worktree/branch 上下文、worktree 迁移/创建/删除/refresh、undo/redo 与 staged revert 自动 commit（全部复用上游闭包，零新建第一方界面） | 已实现（未验证）；运行期归 G23，见 [units/diff.md](units/diff.md) |

设置的能力由上游闭包携带（`packages/app` 对应源码目录）。设置的 providers/models 配置面已建立契约（issue #14，见 [units/providers-models.md](units/providers-models.md)）；设置的其余标签页仍未建立契约，不视为已交付（会话工作台/时间线已于 issue #9、权限请求与 Agent 提问已于 issue #10、远程文件浏览/搜索/查看与上下文引用已于 issue #11、远程 Git 审查与 worktree 操作已于 issue #12、远程终端已于 issue #13 建立契约，见 [units/session-workbench.md](units/session-workbench.md)、[units/permission-requests.md](units/permission-requests.md)、[units/files.md](units/files.md)、[units/diff.md](units/diff.md) 与 [units/terminal.md](units/terminal.md)）。

## 结构图

```text
┌─────────────────────────── Android 壳（本仓库 android/，已实现（未验证）） ───────────────────────────┐
│  MainActivity                                                                                        │
│    ├─ WebAssetServer（NanoHTTPD，仅绑 127.0.0.1:18090）                                               │
│    │    └─ 提供打包资产 assets/web/（scripts/copy-web-dist.sh 拷入，含 PWA service worker）            │
│    ├─ CredentialVaultBridge（issue #4：onPageFinished 握手 → WebMessageChannel port1/port2；          │
│    │    VaultCrypto（AndroidKeyStore AES-256-GCM）+ VaultStore（filesDir/vault/ 原子落盘+index.json） │
│    ├─ ProbeBridge（issue #5：协议隔离的姊妹桥，独立握手串 opencode-mobile-probe-handshake；            │
│    │    DirectEndpointProbe（HttpURLConnection 严格默认 + 有界侦嗅 + 分类枚举，单后台线程执行）         │
│    ├─ SshTunnelBridge（issue #6：第三座协议隔离桥，独立握手串 opencode-mobile-ssh-handshake；             │
│    │    SshTunnelManager（JSch 隧道）+ SshHostKeyStore（known_hosts）+ SshErrorCode）                     │
│    └─ ServiceOpsBridge（issue #7：第四座协议隔离桥，独立握手串 opencode-mobile-svcops-handshake；          │
│         ServiceOpsManager（短命会话+ChannelExec，有界读取）+ ServiceCommandValidator（白名单门禁，         │
│         唯一 setCommand 调用点）+ ServiceOpsErrorCode）                                                   │
│  WebView（javaScriptEnabled / domStorageEnabled；文件与内容访问关闭；geolocation 关闭）                │
│    origin = http://127.0.0.1:18090（回环可信上下文；PWA SW 可注册，行为归 G10）                        │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                               │ 加载 UI（同源）+ vault/probe/svcops/ssh 四握手（平台 WebMessage channel，port 闭包）
                                               ▼
              第一方 packages/mobile-hosts（@opencode-mobile/mobile-hosts，已实现（未验证）：issue #3/#4/#5）
                ├─ SSH 主机注册表（opencode-mobile.hosts.v1，载荷白名单：id/name/target/credentialRef/时间戳）
                ├─ 连接状态机（idle/connecting/hostKeyUnverified/ready/authRequired/incompatible/offline/reconnecting/failed）
                ├─ vault（issue #4）：端口+信封 v1+桥传输（形状校验/ack/requestId；UnavailableVault fail-closed 默认）
                ├─ transport（issue #5）：connection-errors（DirectErrorCode/SecureFetchError）+ url-policy（userinfo/重定向判定）
                │   + secure-fetch（validated-follow，M-011 注入面；mobile(M-011) dist 标记）
                ├─ probe（issue #5）：ProbePort（StubProbePort fail-closed 默认）+ probe 桥传输（独立握手串）+ 分类→文案映射
                ├─ service-ops（issue #7）：命令模板表（OS 闭域+参数双闸+golden vectors）+ ServiceStatus 模型与解析器
                │   + 授权流 O1–O14 + svcops 桥传输/端口（Stub fail-closed 默认，模块级注入 seam）+ 二十一码分类
                │   + service-panel（预览→确认→执行/回滚；B1 存活刷新 watcher，订阅侧实现）
                └─ upstream-map：SSH 主机 → 上游 extension 型 ServerConnection（键 `mobile-ssh:<uuid>`），
                   经 props.servers 注入上游 ServersProvider；直连服务仍走上游原生注册表（M-010 hydration 注入内存密码）
                                               │
                                               ▼
                              上游 OpenCode app（vendor/upstream/packages/app 静态构建；M-004 别名 / M-007 entry 引导 / M-008 设置挂载）
                                               │ HTTP API 调用（fetch / SSE / WebSocket，跨源）
                                               ▼
┌───────────────────── 远程 OpenCode 服务（远程机器负责项目、Git、Shell、模型调用） ─────────────────────┐
│  服务地址直连：HTTPS 直连远程 OpenCode HTTP API（Authorization: Basic base64("opencode:<password>")；   │
│    PTY 经一次性票据 URL 参数（非凭据，D5）；明文 HTTP 不支持（D3）；TLS=system CA 唯一信任锚（D2）      │
│  SSH 连接（issue #6，已实现（未验证））：设备侧 JSch（Kotlin 桥内，jsch+bcprov）→ 本地转发 listener 绑    │
│    127.0.0.1:0（动态回环端口，会话期）→ 远端回环 localhost:<servicePort>（单跳，无跳板机）→ 远程          │
│    OpenCode HTTP API；host-key=认证会话自实现 HostKeyRepository 权威比对+scan 抛出后读 session.hostKey   │
│    + filesDir/ssh/known_hosts（OpenSSH 行格式）                                                         │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

回环监听端口只是资产/转发入口，不是本地 OpenCode 服务；手机不运行本地 OpenCode 服务（项目范围红线）。

## 信任边界

- **origin**：UI 资产来自 `http://127.0.0.1:18090`（本机任意 App 可绑定回环端口，理论上存在端口占用/冒充面；本轮按计划固定端口交付，随机端口与 origin 固化等加固留待后续 issue）。运行期其他 App 亦可连接 18090 端口读取静态资产（均为公开于 APK 的内容，无秘密）。对远程 API 的调用是跨源请求，CORS 行为见下节。
- **TLS**：仅系统 CA（network_security_config base-config 显式声明，不信任用户安装 CA）；`onReceivedSslError` 恒 CANCEL 并仅记录错误类别，绝不 proceed；不用关闭校验规避错误。
- **cleartext**：全局 `usesCleartextTraffic=false` + base-config 禁明文；仅 `127.0.0.1`/`localhost` 域名配置允许 cleartext（资产服务与 SSH 隧道回环口）；局域网 HTTP 直连放行不在本轮范围。
- **凭据流（M-002 memory-only）**：用户输入密码 → 仅存于内存 → 在 `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 处拼接 `Basic ${btoa("opencode:<password>")}` 进入 Authorization 请求头 → 持久化编码路径（`persistence.ts` encode）恒剥离 password，任何持久化后端收不到凭据；`authToken` 是布尔标志（是否带 token），非机密。完整口径与用户可见后果见 [interaction.md](interaction.md) 的 memory-only notice。
- **credentialRef（非机密引用，已实现（未验证）：issue #3）**：持久化 schema 增加的 `http.credentialRef`（M-005）与 SSH 主机记录中的 `credentialRef` 都是指向凭据条目的指针（形如 `mobile-credential:<id>` 的标识符），**不是凭据本身**，允许进入持久化载荷；它指向的凭据值存放在 vault（issue #4）。解析结果只注入内存连接对象，永不回写持久化。
- **凭据保险库（issue #4，已实现（未验证））**：凭据值唯一持久形态是 AndroidKeyStore（密钥 `opencode-mobile-vault.v1`，AES-256-GCM，不设用户认证绑定）加密的信封 v1 文件（`filesDir/vault/<id>.bin`，原子写）+ 无值元数据索引 `index.json`；信封 `OPMV1`+12B IV+GCM 128-bit tag，AAD=条目 id（换绑拒绝）。凭据值永不进入 localStorage/sessionStorage/日志/构建产物/git；无额外解锁；unavailable 是显式状态，无明文回退代码路径。契约与失效矩阵见 [units/connection.md](units/connection.md)。
- **vault 桥的三层信任（替换 origin 校验）**：平台 WebMessage channel 的 JS 侧**不做 origin 等值校验**——**勘误三（计划 F-1b）平台证据链**：embedder 经 `postWebMessage` 投递的消息其 `event.origin` 恒为空串（Chromium `AwContents.postMessageToMainFrame` 硬编码 sourceOrigin=null → blink `MessageEvent::originForBindings()` 返回 "" → 平台 `PostMessageTest` 断言 `SOURCE_ORIGIN=""`）。信任依据为：①平台 targetOrigin 强制（非该 origin 的 frame 收不到 port2，native 侧参数平台强制）；②port 能力 confinement（port 引用不暴露 window 全局，单测锁定；如实边界：同页监听者事件层面可见握手字符串，confinement 实际来源=port 引用不暴露+页面仅第一方资产——页内脚本可捕获 port ≈ 资产被篡改=应用被攻破，既有边界不新增攻击面）；③ack 前零能力（握手捕获并回发 ack 前 vault 恒 unavailable，native 不受理操作）。模拟测试禁止伪造 origin 断言。
- **host-key stub fail-closed（已实现（未验证）：issue #3）**：SSH 主机指纹校验端口 `HostKeyVerifier` 本期为 stub——对任何主机恒返回"拒绝"，状态机据此永不放行未确认指纹的连接；不存在"跳过校验"路径。确认 UI（host-key-prompt）与状态机状态均已立桩，真实验证数据源归 issue #6，**BLOCKED**。持久化载荷中不含指纹/凭据形态字段。
- **直连传输卫生（已实现（未验证）：issue #5，决策 [0002](../decisions/0002-direct-connection-transport.md)）**：M-011 注入的 secure-fetch 与 M-012 的上传 XHR 校验执行 validated-follow——重定向后最终 origin 必须与请求 origin 一致（双向严格，http→https 升级亦拒）、https→http 降级拒绝、userinfo 凭据 URL 拒发；跨源重定向子请求被浏览器剥头是规范底线，我方校验是交付前的纵深。TLS 信任=system CA 唯一锚（netsec 不变，静态负断言在 `scripts/verify-direct-connection.ts`）；明文 HTTP 本期不支持（D3）。
- **probe 桥（已实现（未验证）：issue #5，G16 BLOCKED）**：`ProbeBridge` 是 vault 桥的**协议隔离**姊妹桥——独立握手串 `opencode-mobile-probe-handshake`、独立通道、同用三层信任（平台 targetOrigin 强制/port 闭包 confinement/ack 前零能力），vault 门禁 C1–C5 不受牵连（双方按 data 严格等值校验握手，互不误捕；单测锁定）。`DirectEndpointProbe` 用平台默认栈（system CA、严格链/过期/主机名校验，**无任何自定义 trust/verifier 钩子**——静态负断言在册）；自动重定向跟随禁用，Authorization 头永不离开用户输入的 origin；**probe 是分类器不是权威**：仅在健康检查失败后选错误文案，冲突以真实 fetch 为准，分类绝不伪造。凭据边界（F1）：密码仅存活于单次请求（桥消息→内存头），头/URL/桥消息零日志值、不持久化、响应只回分类码。
- **ssh 桥（已实现（未验证）：issue #6，G17 BLOCKED）**：`SshTunnelBridge` 是第三座**协议隔离**桥——独立握手串 `opencode-mobile-ssh-handshake`、独立通道、同用三层信任，与 vault/probe 互不误捕（三桥并存互不重置对方 ack 生命周期，C1–C5/G16 不受牵连）。SSH 库（jsch 2.28.8 + bcprov-jdk18on 1.80，许可见[决策记录 0003](../decisions/0003-ssh-transport.md)）只在 Kotlin 桥内；共享层零平台 API、零 SSH 依赖。host-key 校验永不禁用（`StrictHostKeyChecking="yes"`；认证会话自实现 HostKeyRepository 权威比对、scan 会话 strict 抛出后读 session.hostKey；filesDir/ssh/known_hosts，备份排除）；转发目标固定远端回环单跳；断开仅拆 SSH 传输（远端进程存活）；凭据过桥 JSON 单向一次/零日志/零持久化/零回显；scan 会话零认证材料；凭据在指纹确认前不发出。
- **svcops 桥（已实现（未验证）：issue #7，G18 BLOCKED）**：`ServiceOpsBridge` 是第四座**协议隔离**桥——独立握手串 `opencode-mobile-svcops-handshake`、独立通道、同用三层信任，与 vault/probe/ssh 互不误捕（四桥并存互不重置对方 ack 生命周期，C1–C5/G14–G17 不受牵连）。桥协议只传 `{templateId, params, os}`，**永不传命令字符串**；命令由 Kotlin `ServiceCommandValidator`（TS 模板表的逐字镜像：templateId 全集 + 参数正则 + OS 适用域）白名单装配，全仓唯一 `setCommand` 调用点只执行校验器输出（fail-closed `exec-denied`）。短命独立 SSH 会话+`ChannelExec`（连接 30s/执行 60s、stdout/stderr 各 16 KiB 截断标记、exitStatus、每主机单飞）；host-key 信任唯一所有权归连接流（0003 §3.3），未知/变更指纹原生拒绝引导回连接流；**凭据逐命令解析、单次过桥、零日志零持久化零回显（N7 继承 0003 §4）**；生命周期红线双写：断开/取消仅本地拆除，远端服务/进程存活。
- **身份键（已实现（未验证）：issue #3）**：直连服务沿用上游原生键（URL 本身，端口变化即新身份）；SSH 主机身份为 `mobile-ssh:<uuid4>`（创建即定、永不改），与隧道回环端口解耦——端口重解析（reconnect）不改变身份/scope/会话/设置键。
- **日志纪律**：logcat 仅固定 tag（`OpencodeShell`）+ 控制台消息文本与行号；不写 URL 查询参数、请求头或凭据。
- **进程边界**：壳 `onDestroy` 仅停本地回环 asset server；远程服务/任务永不因客户端断开而停止（代码注释与本文档双写）。

## CORS 事实（G3 修正，issue #5）

**来源表述**：以下结论取自**上游 pin 提交树（采集缓存 `~/.cache/opencode-upstream` @ `cec70f3`/`b4525d79bf`）**的 `packages/server/src/cors.ts`，**不是** vendored 闭包树——vendored 闭包按策略不含 `packages/server`（手机不运行本地服务），该文件仅可从上游缓存读取（决策 [0002](../decisions/0002-direct-connection-transport.md)）。

事实：上游原生服务的 `isAllowedCorsOrigin` 默认放行任意 `http://127.0.0.1:*` 与 `http://localhost:*` origin（另有 `--cors` 配置扩展；PTY 铸票/升级与 MCP 的 `isAllowedRequestOrigin` 同白名单）。本壳 origin 恰为 `http://127.0.0.1:18090`，落在默认白名单内——**原生上游服务对本壳 API/SSE/WS（铸票与升级）/上传的跨源调用（含预检）默认允许（预案 A 零配置成立）**。G3 由「高风险无证据」修正为「低风险待实测」（设备级验证仍 BLOCKED）。桌面 Electron 主进程的宽松 CORS 注入（`packages/desktop` @ pin，不在闭包内）与本壳无关：本壳依赖的是**服务端**白名单。预案 B（本地反代）/C（平台适配层）仅对非原生/旧版/自定 CORS 策略的服务兜底，维持用户决策项，在获得决策前不续做产品化，绝不关闭浏览器安全或转原生重写。

## 补丁剥离面与运行时接缝（M-001 / M-003 / M-002 / M-004…M-014）

上游闭包的 M-001/M-003 仅剥离构建期/安装期依赖，M-002 只改凭据编码路径；M-004–M-010（M-004–M-008 已实现（未验证）：issue #3；M-009/M-010 已实现（未验证）：issue #4）是移动运行时接缝；M-011–M-014（已实现（未验证）：issue #5）承载直连传输卫生与错误分类；M-015（已实现（未验证）：issue #6）承载 SSH 桥接线；M-016（已实现（未验证）：issue #7）承载服务操作桥接线；M-017/M-018（已实现（未验证）：issue #8）承载会话归档接线与设置入口可达性，每补丁一事：

| 补丁 | 内容 | 理由 |
| --- | --- | --- |
| M-001 | `packages/gui-extensions/package.json` devDeps 移除 `electron`、`@lydell/node-pty`、`devtools-protocol` | 仅 gui-extensions 自身测试/typecheck 使用；electron postinstall 约 110 MB |
| M-002 | `persistence.ts` encode 路径恒剥离 password（memory-only） | 凭据不入任何持久化后端；详见凭据流 |
| M-003 | `packages/client`/`plugin`/`ai` 剥离悬空 workspace 引用 | 三个目标包均不在闭包内；Bun 1.4.2 硬性报错 |
| M-004 | app vite `resolve.alias` 增 `@opencode-mobile/mobile-hosts` → 仓库根 `packages/mobile-hosts/src/index.ts`（`fileURLToPath(new URL(...))` 形式，按 importer 定位到闭包外第一方包） | 上游 app 引用第一方包的唯一构建期通道；依赖方向我方→vendor 之外的特例（仅构建别名，不改 vendor 包依赖） |
| M-005 | `ServerHttpBase` 增非机密 `credentialRef: Schema.optional(Schema.String)` | 直连服务可携带凭据引用；encode 剥 password 逻辑不变 |
| M-006 | 连接对话框 add/replace 构造连接时透传 `original.http.credentialRef` | 否则编辑服务会丢失凭据引用；"无变化早退"比较不含 ref |
| M-007 | entry.tsx：移除 `location.origin` 当作 OpenCode 服务的装配（壳 asset origin 不是 OpenCode 服务）；以 `createMobileHosts` 引导并经 `servers` 注入 SSH 主机；**M-007 修订（issue #4）**：注入 vault 客户端 + 首渲染前注册握手监听（形状校验/port 闭包/ack/重复握手忽略），resolver 换为 vault-backed | 不用 `VITE_OPENCODE_SERVER_MODE=none` 构建期变量：避免隐藏的构建配置依赖，补丁可随上游 rebase；`?auth_token` 直通流在壳内不适用（无装配服务可认证） |
| M-008 | 设置 servers 标签页挂载 `<MobileHostManager/>`（lazy import） | SSH 主机管理界面入口 |
| M-009 | 连接对话框 `dialog.tsx`：`method=password` 时渲染「记住凭据」勾选框（vault available 才可用，unavailable 禁用+说明），真值表 v3 十二行分路（含 add-prior 不分 method、早退强制条件、link 流不渲染、行 2/12 空值中止），i18n en/zh 新键 | 可选记住（issue #4）：勾选时经桥 put 加密落盘并写 credentialRef；取消勾选清 ref+删条目；不铸空值不静默失败。评审修复（B1）：决策核心增 `boundKind`——已绑定**私钥**且值为空时保留绑定（行 13，add/edit 同义），host-dialog 装配在私钥绑定期间禁用密码位防 in-place 换 kind |
| M-010 | `registry.tsx`：hydration 后对 credentialRef 有且 password 缺失的条目，经 vault resolver 解析并 **setStore 注入内存 password**（不落盘：同一 M-002 encode 路径保证） | 重启后已记住的直连服务免重输；仅内存；unavailable/corrupt 时不注入、走重输路径（失效矩阵） |
| M-011 | `platform/web.ts`：`createWebPlatform` 注入 `fetch: createSecureFetch()`（validated-follow：跨主机/降级响应拒交付、userinfo URL 拒发；含 `mobile(M-011)` dist 标记） | 直连传输卫生（issue #5，决策 0002 D1/D-URL）：覆盖 API/SSE/二进制读/健康检查全部 fetch 面；头语义不动；回滚=撤单补丁 |
| M-012 | `composer/attachments/destination.ts`：上传 XHR load 后校验 `xhr.responseURL`（同规则）+ userinfo URL 拒发 | 上传不经 platform.fetch，同一策略的第二面（issue #5 D1） |
| M-013 | `servers/connect/dialog.tsx` + i18n en/zh：保存路径 probe 先行分类 → `dialog.server.error.<code>` 行内精确错误；probe unavailable 显式退化为上游泛化文案；userinfo URL 保存前精确拒绝 | 错误反馈精确化（issue #5 D4）：probe 只选文案，健康检查仍是保存放行的唯一权威；分类冲突以真实 fetch 为准 |
| M-014 | `entry.tsx`：probe 桥握手监听（独立握手串 `opencode-mobile-probe-handshake`）+ `createProbeClient` 注入 `createMobileHosts({probe})` | probe 分类器到达 UI 的接线（issue #5）：与 vault 桥并存互不误捕（双方 data 严格等值校验）；ack 前 fail-closed |
| M-015 | `entry.tsx`：M-014 块内增 ssh 桥握手监听（独立握手串 `opencode-mobile-ssh-handshake`）+ `createWebMessageSshTransport` 与 `createSshHostKeyVerifier`/`createSshHostTransport` 注入 `createMobileHosts({hostKey, transport, sshBridge})`（替代显式 `StubHostKeyVerifier` 注入；stub 保留为包内默认） | SSH 隧道/host-key 真实校验到达驱动的接线（issue #6，已实现（未验证））：第三座协议隔离桥（与 vault/probe 互不误捕）；ack 前 fail-closed（stub 语义不变）；监听先于首渲染 |
| M-016 | `entry.tsx`：M-015 块后增 svcops 桥握手监听（独立握手串 `opencode-mobile-svcops-handshake`）+ `createServiceOpsClient`/`createWebMessageServiceOpsTransport` 经模块级 seam `setActiveServiceOpsPort` 注册（`createMobileHosts` 选项契约不变，runtime.ts 零改动） | 服务操作到达面板的接线（issue #7，已实现（未验证））：第四座协议隔离桥（与三姊妹互不误捕）；ack 前面板降级隐藏（fail-closed）；「客户端构建不隐含服务操作能力」的结构承载 |
| M-017 | `home/sessions/controller.tsx`：home 会话行 `archive` 由 stub（恒 reject）改为真实调用 `session.update({ sessionID, archived: true })`，成功后从查询缓存移除该行 + invalidate/resync，复用 `archiveHomeSession` 的 tabs 清理与 onError toast | 归档接线（issue #8）：上游 API 现存而 UI 是 stub；行为语义见 [units/projects-sessions.md](units/projects-sessions.md) |
| M-018 | `settings/shell.tsx` 两处：重定向守卫 `includes` 列表移除 `"servers"`（其余五项不动）+ `multiple()` 导航组加固定「SSH hosts」入口（`surface.select("servers")`）；`runtime/i18n/en.ts`/`zh.ts` 增 `settings.tab.sshHosts` | 多服务器设置布局下 host-manager 可达（issue #8）：仅入口不足以可达——守卫 effect 会把 "servers" 弹回 general；守卫修订是入口可达性的前提。[server-list.md](units/server-list.md) 预登记「已知入口缺口（M-008）」债务的承接 |

上游 npm 补丁按「上游 lock 解析版本 ∩ 上游 lock patchedDependencies 段」携带 9 项，清单与 not-carried 理由见 [vendor/upstream/PROVENANCE.md](../../vendor/upstream/PROVENANCE.md)。

## 流转矩阵

本阶段仅 shell-startup 已实现；其余单元的流转按其状态标注（vendored UI 内部流转待 G1–G12 真机核验后逐单元落契约；issue #3 的主机注册表/状态机流转已实现（未验证）；其设备级核验归 G13–G15（BLOCKED））。逐行穷举，无省略：

| 来源单元 | 触发点 | 目的地 | 携带参数 | 未授权/失败时行为 | 状态 |
| --- | --- | --- | --- | --- | --- |
| shell-startup | 进程启动 | WebAssetServer | 无（固定端口 18090） | 端口绑定失败 → 记录日志并结束进程 | 已实现（未验证） |
| shell-startup | asset server 就绪 | WebView 加载 `http://127.0.0.1:18090/` | 无 | 资产缺失 → 回环口返回 5xx 文本（壳不重试） | 已实现（未验证） |
| shell-startup | 返回键 | `webView.canGoBack()` 则 goBack，否则结束 Activity | 无 | — | 已实现（未验证） |
| shell-startup | Activity 销毁 | 停本地 asset server | 无 | 远程服务/任务不受影响（红线） | 已实现（未验证） |
| shell-startup | WebView 首帧 | 上游 app 启动流程 | 无 | — | 待验证（G1/G2） |
| 上游 app（vendored） | 用户录入服务 | connection | url、password（内存） | 认证失败 → 上游认证失败路径（M-002 容忍缺失密码 → 失败路径成立），反馈形态待验证 | 待验证（G3/G4/G11） |
| connection（成立后） | 认证通过 | server-list | 服务记录（无 password） | — | 已确认未实现 |
| server-list | 选择服务器/项目 | projects-sessions | 项目元数据 | — | 已实现（未验证）；见 [units/projects-sessions.md](units/projects-sessions.md) |
| server-list（已实现（未验证）） | 用户进入设置 → servers 标签页 / SSH hosts 入口（M-018） | host-manager（SSH 主机管理） | 无 | 列表为空 → 空态引导（新增主机）；多 server 布局经 M-018 入口+守卫修订可达（原 M-008 缺口已承接，未验证，见 [interaction.md](interaction.md)） | 已实现（未验证）（M-008 + M-018）；真机归 G13/G19 |
| host-manager（已实现（未验证）） | 新增/编辑 SSH 主机 | host-dialog | 主机记录（name/target/credentialRef） | 校验失败（重名/非法 target/超长）→ 行内错误，不写注册表；保存失败保留原配置 | 已实现（未验证）；真机归 G13 |
| host-dialog（已实现（未验证）） | 保存 SSH 主机 | host-manager | 注册表记录（白名单载荷） | — | 已实现（未验证）；真机归 G13 |
| 连接对话框（已实现（未验证）：issue #4，M-009） | 保存直连服务（勾选记住） | vault（桥 put） | kind=password、内存密码值、existingRef | put 失败 → 不关对话框+行内报错；vault unavailable → 勾选禁用+说明 | 已实现（未验证）；真机归 C1/C2 |
| 连接对话框（已实现（未验证）：issue #4，M-010） | 应用启动 hydration | registry（内存注入） | credentialRef → 解析值（内存） | corrupt/unavailable → 不注入 → unauthorized 重输 | 已实现（未验证）；真机归 C1 |
| credential-manager（已实现（未验证）：issue #4） | 用户删除条目/一键清除 | vault（桥 remove） | ref | io/corrupt → 行内报错不静默 | 已实现（未验证）；真机归 C2 |
| connection（已实现（未验证）） | SSH 主机发起连接 | 连接状态机（host-key-prompt） | target、credentialRef（引用） | host-key stub 恒拒绝 → failed（可重试/编辑），永不放行未确认指纹 | 已实现（未验证）；真实校验归 #6（BLOCKED） |
| 连接状态机（已实现（未验证）） | 状态迁移 | 上游 server-list 行内状态 | extension 型 ServerConnection（state 映射） | offline/reconnecting 有反馈可恢复；取消恢复来源态；删除/断开零远程调用 | 已实现（未验证）；真机归 G14 |
| service-ops 面板（已实现（未验证）） | 用户在 host-manager 行内展开「服务操作」/ `service-unreachable` 后引导 | svcops 发现（状态卡/limitations） | hostId（记录读取） | 无桥注入 → 面板整体降级隐藏（stub fail-closed）；OS 判定失败 → unsupported-os 如实呈现 | 已实现（未验证）；真机归 G18 |
| service-ops 面板（已实现（未验证）） | 预览 → 危险确认勾选 → 确认 → 执行 | 第四桥 exec（白名单命令） | `{templateId, params, os}`（永不传命令字符串）+ 逐命令凭据（N7 单次过桥） | 校验器拒绝 → exec-denied；occupied-port 预检拒绝覆盖运行中服务；失败 → 分类码 + 有界 stderr 尾部 + 回滚入口 | 已实现（未验证）；真机归 G18 |
| projects-sessions | 打开会话 | session-workbench（会话 tab） | 会话 ID | stale ID → resolution failed → 错误边界/关 tab（上游语义）；断开 → 服务端快照恢复（非 SSE 重放） | 已实现（未验证）；真机归 G19/G20 |
| session-workbench | 权限请求到达（`permission.asked`/`form.*` dock 接线） | permission-requests | 请求内容（`PermissionRequest`/`FormInfo`） | 拒绝 → 上游语义：reject 批量扩散同会话全部 pending + CorrectedError 反馈；stale/expired → form 侧吞错自愈（settleForm）、permission 决策侧失败 toast + Replied 广播移除 | 已实现（未验证）；真机归 G21 |
| permission-requests | 请求决策（once/always/reject 或 form reply/cancel） | 远程服务（POST reply 端点） | `{decision}` / `FormAnswer` | 网络失败 → 失败 toast（`common.requestFailed`），请求保留待重试；stale → 见上行；in-flight 全按钮 disabled 幂等 | 已实现（未验证）；真机归 G21 |
| 任意客户端 | 同会话请求被他端先答 | permission-requests | `permission.replied` 广播 | 本端 dock 移除，无需操作（他端先答后本端操作的呈现归 G21④） | 已实现（未验证） |
| session-workbench/composer/消息链接 | 打开文件（树/搜索/@-引用/消息内链接） | files | 路径+行范围 | 远程路径恒经 `location` 作用域读取，绝不当作手机本地路径；文件缺失→notFound 呈现 | 已实现（未验证）；真机归 G22 |
| session-workbench/details/review tab | 审查变更（diff 面三模式 git/branch/turn + 行评论 + 大 diff/二进制占位） | diff | 会话 ID + location + 模式 | noGit 空态带 initGit；四类吞错如实（detailsQuery/loadDiff/branch.list 候选→空、toast 族）；503 git 不可用声明面 | 已实现（未验证）；真机归 G23 |
| settings-workspaces/details 菜单 | worktree 删除/迁移/创建 | diff | projectID + directory | remove 五层确认链（preflight 三态拦截→确认对话框 danger 按钮 stale/pending/error disabled→force 显式执行）+ 失败 toast + tab 重指向；move 迁移 running 禁用；创建后 syncInfo 预填 | 已实现（未验证）；真机归 G23 |
| 会话列表/会话工作台 More 抽屉/命令 | 打开终端（dock） | 终端 | PTY ID+server+directory | 断开仅拆 ws 远端存活（红线）；tab 关闭显式 remove 终止；服务重启探活 clone 恢复 | 已实现（未验证）；真机归 G24 |
| 任意单元 | 用户进入设置 → providers/models 配置 | providers-models | 服务器上下文（`SettingsServerDataScope`：当前选中服务器 + 目录） | 连接/账号/模型操作失败 → `formatServerError` toast 与 OAuth 错误态/重试（上游通道）；凭据服务端存储、刷新不触碰 host/project/session 状态键 | 已实现（未验证）；真机归 G25 |
| 任意单元 | 网络断开/切换 | 失败恢复路径 | — | 有反馈可恢复，见 [interaction.md](interaction.md) 负例矩阵（G11） | 未开始 |
