# 单元：connection（服务连接与凭据）

Review hardening: unknown-key confirmation snapshots host ID + exact target + effective SSH/service ports + fingerprint. Any relevant registry edit cancels the pending verification and aborts an open signal; confirmation arguments are checked again before connect, and the captured record identity is rechecked after async resolution and immediately before `transport.open`. The initial-screen handoff predicate explicitly requires the add/edit form to be closed; a ready/authenticated connection cannot dismiss an open form. Changed-target saves invalidate the old connection and require a new connect. Android SW promotion is limited to START_URL's origin, exact root scope, and packaged `/sw.js`; each async callback rechecks current page and worker identity. Fake-origin/script/scope/redirect and deferred initial-health/edit tests cover refusal and lifecycle paths.

状态：**issue #61（2026-10-30）已在 MatePad 真机完成 SSH 主链 E2E 与 G36 矩阵主体**：指纹根因闭环（提示==独立参考，历史不匹配=比对过程错位；历史重复提示=早期构建 known_hosts 序列化缺陷，已修 4a9e096）、unknown/changed key 拒绝路径、两步危险确认+forget、SSH 认证失败 authRequired+可编辑重试、不可达/目标拒绝/服务不可达分类、信任→SSH 认证→隧道→服务认证→远端会话全链、断开红线（远端进程/端口存活+请求级日志零 stop/interrupt+重启重连后会话恢复）、3 轮信任稳定零 prompt；**三模式草稿保持（#h）BLOCKED**（连接屏在存在 SSH 主机记录的设备上不可达，属 AppShell fallback 门设计实态，改进归四步协议）。共享连接单元代码承载配对链接、服务地址/密码与 inline SSH 三种可切换模式；首次 SSH 配置复用 host registry、vault、host-key prompt 与 SSH runtime。M-029 修正连接方式按钮窄屏换行，M-030（issue #58）恢复 no-server/signed-out Settings guard，并由 AppShell 在发布主机前持有初始屏所有权，直到该次所有权对应的 exact host tunnel 与 `/api/info` 健康且认证 ready 才交接；SSH 成功只在 SSH 模式 active 时交接，离开 SSH 模式的迟到回调不会窃取 Pairing/HTTP 草稿。SSH 服务返回 401/403 时保留 tunnel、InitialSshSetup 与 Settings → Server 共用独立 service-auth-prompt；重新检查成功后将密码仅放在 runtime endpoint / upstream extension 的会话内存字段，并用 UTF-8 Basic 编码；不写注册表/持久层/日志。unknown-key prompt 绑定 exact host ID/fingerprint，同时展示 host name、完整 target、SSH port、remote service port 和完整可选择/换行 fingerprint；changed key 需两步 danger confirmation 后才调用 forget。key-only import 可在首主机表单保存到 vault；更换/解绑凭据保留旧密文为凭据管理器可见的 orphan；保存前同步锁定、snapshot/validate，vault await 期间锁定编辑/Cancel，dispose 时迟到 continuation 不 publish/connect。现有 SSH/TLS 安全边界、host-key fail-closed 与远程任务断开语义不变。此前旧 screen 根因及 worker 更新证据见 [build-and-verify.md](../../build-and-verify.md)。剩余未验：三模式草稿（#h）、incompatible 真服务、任务级存活（归 G20⑤/G12）、直连路径回归（另有门禁）。

2026-10-29 补充：SSH saved-host HostKeyPrompt 核验并 Trust 后，已实测 SSH+key 隧道到达 OpenCode 服务 authentication required。Settings → Server 与 InitialSshSetup 共用 `ServiceAuthPrompt`；密码输入空值、显式 Check again。真实 service password 未提供/未输入，故服务认证成功、上游会话与远端任务行为仍未验证。

2026-10-30 补充（issue #61）：真实服务认证已在设备完成（显式启动的测试服务，401→ServiceAuthPrompt 输密码→Check again→ready→handoff→远端会话列表/工作台可达）；断开后同进程重连复用会话内存密码（零重复认证）、杀 App 后重连需重新认证（预期实态）。known_hosts 实测落盘格式：默认端口=裸主机名、非默认端口=`[host]:port`；Reject 不落盘、changed-key forget 精确移除该行。同轮记录：目标拒绝（`target-refused`）与哑监听（`service-unreachable`）分类文案的设备实证补齐了四层失败分类。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002 预应用）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `url` | String | 远程 OpenCode HTTP API 地址（含端口/协议） | 已实现（未验证） |
| `password` | optional String | 服务密码，仅存内存 | 已实现（未验证）；encode 路径恒剥离（M-002），任何持久化后端收不到 |
| `type` | `"http"` | 连接类型字面量 | 已实现（未验证） |
| `authToken` | optional Boolean | 布尔标志（是否携带 token），非机密 | 已实现（未验证） |
| `displayName` / `label` | optional String | 展示元数据 | 已实现（未验证） |

## credentialRef 契约（已实现（未验证）：issue #3）

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `http.credentialRef` | optional String（位于 `ServerHttpBase` 内，即 `http.credentialRef` 层级） | 指向凭据条目的**非机密引用**（形如 `mobile-credential:<id>`），不是凭据本身 | 已实现（未验证）（M-005 字段 + M-006 对话框透传）；探针 `scripts/verify-credential-ref.ts` PASS |

- 直连：M-005 在持久化 schema 增字段（encode 剥 password 的行为不变）；M-006 保证连接对话框 add/replace 往返保留引用，否则编辑一次就丢引用。
- SSH：主机记录原生持有 `credentialRef` 与 `servicePort`（载荷白名单字段，见 [server-list.md](server-list.md)）；credentialRef 编辑语义为「undefined=保留、空串=清空」，servicePort 为「undefined=保留、合法整数=设置」。target/身份变更裁定（issue #4，已定）：**保留 ref + 显式移除**——target 变更不清 ref，由用户在编辑表单取消勾选或经凭据管理器删除（见失效矩阵）。
- 引用解析（已实现（未验证）：issue #4）：resolver 默认 fail-closed——未注入 vault 时为 NullResolver（恒 undefined），注入 vault 时默认经 `createVaultResolver` 走 vault（vault 级 unavailable 抛错 → 主机显式 failed；条目级 corrupt/missing → undefined → 服务端认证路径）；Android 桥握手 ack 后由 vault 支撑的 resolver 解析（见下节 vault 契约）。解析结果只注入内存连接对象，永不回写持久化。
- 用户可见后果：未记住的密码重启后需重输（M-002）；已记住的凭据经 M-010 hydration 自动恢复（内存）；SSH 主机凭据引用经 vault-backed resolver 解析（SSH 连接已实现（未验证）：issue #6）；引用本身随记录保留。

## 凭据保险库契约（已实现（未验证）：issue #4）

凭据值只存在于 Android Keystore 加密的文件落盘与应用内存，永不进入 localStorage/sessionStorage/日志/构建产物/git（验收红线；机械探针 `scripts/audit-secret-persistence.ts`）。无额外解锁：不设 `setUserAuthenticationRequired`，不引入生物识别/锁屏门（设计免除：设备锁定时 App 本不可用）；**无明文回退**：vault 不可用是显式状态（unavailable），不存在任何降级到明文持久化的代码路径（探针 V-secret 断言）。

### 端口契约（`packages/mobile-hosts/src/vault/`，共享层零 Android API）

| 成员 | 签名/语义 | 状态 |
| --- | --- | --- |
| `CredentialVault.status()` | `() => "unavailable" \| "available"`；握手捕获并回发 ack 前恒 `unavailable`（响应式读取，UI 据此禁用/呈现横幅） | 已实现（未验证） |
| `put({ kind, value, label?, existingRef? })` | 加密写入并返回 `mobile-credential:<id>` 引用；`kind`: `password \| privateKey`；`existingRef` 提供时 **in-place**（保持原 id，ref 稳定）；空值/超 64KiB/私钥缺 BEGIN 头在客户端拒绝 | 已实现（未验证） |
| `remove(ref)` | 删除条目（密文文件+索引行）；未知 id 静默成功（幂等，删除竞态无害） | 已实现（未验证） |
| `get(ref)` | 解密取值（仅内存，供 resolver）；corrupt/unsupported/缺失条目返回 undefined（按条目惰性），vault 级 unavailable 抛 `VaultError("unavailable")` | 已实现（未验证） |
| `list()` | 仅元数据 `[{id, kind, label?, createdAt}]`，**不含 value 字段**（单测断言） | 已实现（未验证） |

错误分类（`VaultErrorCode`）：`unavailable`（握手未 ack/重试耗尽/非 Android 环境——显式状态非降级）、`corrupt`（密文损坏/GCM 认证失败/AAD 不匹配）、`unsupported`（信封版本不识别）、`io`（Keystore/文件系统故障与非法入参）。默认实现 `UnavailableVault`：所有操作抛 `unavailable`，fail-closed。

### 信封 v1（`src/vault/envelope.ts`，TS 纯函数 + Kotlin 镜像）

`OPMV1`（5 字节魔数即版本）+ 12 字节随机 IV + AES-256-GCM 密文（128-bit tag 追加在尾），AAD = 条目 id 的 UTF-8 编码。换绑拒绝：为 id A 加密的信封用 id B 的 AAD 解密必然 GCM 认证失败 → `corrupt`（单测锁定）；版本拒绝：魔数非 `OPMV1` → `unsupported`（单测锁定）。TS 侧经 WebCrypto（`crypto.subtle` AES-GCM，bun 1.4.2 实测可用）+ 软件引擎测试；Android 侧 AndroidKeyStore 密钥 `opencode-mobile-vault.v1`（AES-256-GCM，**不设** `setUserAuthenticationRequired`）。

### 落盘与元数据（Android 侧，`vault/VaultStore.kt`）

`filesDir/vault/<id>.bin` 保存单个 `OPMV1` 信封；`index.json` 仅保存 `id/kind/label/createdAt` 元数据，**永不存值**。既有文件名、索引和信封格式沿用，不做版本迁移或启动时清理。payload 与索引各自经临时文件写入并重命名，但这不是跨文件事务，也不保证失败时原值必然不变；put/remove 在无法确认 mutation 结果时以 `unknown` 返回，不自动重试。64KiB 为应用自选 bound：native 在入队前独立校验 UTF-8 value bytes，bridge envelope 上限 `6×64KiB + 8192` 字符覆盖 JSON control-byte 转义最坏情况；oversize 用前置 request id 相关拒绝且不入后台队列。

### 桥协议（vault v2：AndroidX origin/frame-bound WebMessageListener）

通道：AndroidX WebKit `WebViewCompat.addWebMessageListener`（`androidx.webkit:webkit:1.14.0`，Apache-2.0），以精确 `http://127.0.0.1:<asset-port>` origin rule 注册独立的 `opencodeMobileVaultV2` listener。每条消息再次核对 source origin 的 scheme/host/port、`isMainFrame` 和 request shape；feature 不可用或注册失败时保持 unavailable。该 listener 在回环资产服务绑定后、首次 `loadUrl` 前注册。它只替换 vault handshake；其余五个 bridge 保持原协议。

trust boundary 是 WebKit origin allowlist + callback 的精确 source scheme/host/port + `isMainFrame` 重校验。它不是对恶意同源脚本的隔离，也不证明已加载 JS 的字节来源。

协议 v2 使用 request/response JSON 与 request id，`ready` 只做非变更往返；JS 仅在收到 `vault-v2` readiness 回复后报告 available，并订阅时重放当前 ready 状态以覆盖响应先于 subscriber 的竞态。native 在回调线程做 envelope 上界/UTF-8 payload bound 预检，超限不入队；进程级单线程、8-entry 有界队列串行访问 `VaultStore`。navigation start/destroy 代际门使排队的陈旧请求跳过，运行中操作完成但不向旧页面回帖；每个闭包捕获原请求的 `JavaScriptReplyProxy`。put 在派发前生成并传输非秘密 candidate id；不支持自动重试。UNKNOWN response 可携带对应 credential ref，但不提供自动恢复/存储 journal。Same-origin script trust and lack of power-loss durability remain explicit limitations.

### 可选记住真值表 v3（M-009，连接对话框）

勾选框仅 `method=password` 渲染（link 流不渲染，行 6/11）；vault 不可用时禁用+说明（unavailable 显式呈现）。add 流的 prior 语义：保存时按规范化 URL 从 server.list 查既有 http 条目作为 ref 语义 prior（**password 与 link/redeem 流都套用，不区分 method**；否则 M-006 的 original 在 add 流为 undefined，覆盖后 ref 孤儿）。prior 仅承载 ref 字段。初始勾选值 = `Boolean(refOriginal?.http.credentialRef)`。SSH 主机表单（host-dialog）复用同一决策核心，装配时附传 `boundKind`（绑定条目的 kind，评审修复 B1）——决策核心 `packages/mobile-hosts/src/vault/remember.ts`，行 1–13 逐行单测+探针。

| # | 场景 | 行为 |
| --- | --- | --- |
| 1 | add 无 prior + 已勾 + 非空 | put 铸新条目并写 ref |
| 2 | add 无 prior + 空 | 行内错误「需要密码才能记住」，**保存中止、对话框保持打开**，不 put 不铸空值 |
| 3 | add 有 prior(password) + 已勾 + 非空 | put(in-place) 写 ref |
| 4 | add 有 prior(password) + 未勾 + 有 ref | 清 ref + vault.remove |
| 5 | add 有 prior(password) + 未勾 + 无 ref | ref undefined，无 vault 操作 |
| 6 | add 有 prior（link method） | 不渲染勾选框，prior ref 透传保留（M-006 语义扩展至 prior），零 vault 操作 |
| 7 | edit + 已勾 + 非空 | put(in-place) 写 ref |
| 8 | edit + 保持勾选 + 空 + 有 ref | 保留 ref；health check 用解析值（内存），不 put 不报错 |
| 9 | edit + 未勾 + 非空（M-010 hydration 预填后可达） | 清 ref + vault.remove；密码仍用于本次保存授权 |
| 10 | edit + 未勾 + 空 + 有 ref | 清 ref + vault.remove |
| 11 | edit（link 模式） | 不渲染勾选框，M-006 透传保留，勾选框缺失≠删除意图，零 vault 操作 |
| 12 | add 有 prior + 已勾 + 空 | **按行 2 语义处理**（issue #4 评审补行）：保存中止、行内报错，不 put 不铸空值——「记住一个空凭据」不是合法意图，与行 2 同解 |
| 13 | add/edit 有 prior(**privateKey**) + 已勾 + 空 | **保留绑定（passthrough）**（issue #4 评审修复，host-dialog 装配路径）：记住的凭据已存在——私钥绑定没有可输入的值，中止保存会把已导入条目变成孤儿；add 与 edit 同义。M-009（直连、password kind）不传 `boundKind`，不受影响 |

装配语义注记（issue #4 评审）：
- 行 4/9/10 的 clear 与行 1/3/7 的 put 都发生在**健康检查通过之后**（M-009 装配顺序：决策 → 中止检查 → 早退检查 → 健康检查 → vault put/remove → 构造连接）。因此健康检查失败时 ref 与 vault 条目**原样保留**（按「保存失败」处理，行内报错、对话框保持打开）——行 10 的「清 ref+remove」以保存最终成功为前提。
- 私钥绑定期间的防覆盖：host-dialog 在 `boundMeta().kind === "privateKey"` 时**禁用密码输入位**（行内说明），密码不可能经表单 in-place 覆盖私钥条目（同 id 换 kind）；替换路径为取消勾选（清绑定+删条目）后重新绑定。
- 早退强制条件：勾选框已渲染 && `remember !== Boolean(refOriginalRef)` 时**不早退**（覆盖「仅切换记住」与「预填后取消勾选」两种纯 ref 变更）。put 失败 → 不关对话框 + 行内报错，绝不静默。UX 附注：healthPreview（连接前探测）不解析、不读 vault；权威检查在保存时。

### 失效/恢复矩阵

| 状态 | 触发 | 用户可见行为 | 恢复路径 |
| --- | --- | --- | --- |
| unavailable | 握手未 ack / 重试耗尽 / 非 Android | remember 禁用+说明；横幅；显式状态非降级 | 重载页面重握手；**不存在明文回退代码** |
| corrupt | 密文损坏 / GCM 认证失败 / AAD 不匹配 / 换绑 | resolver 对该条目返回 undefined → 直连 unauthorized 重输 / SSH authRequired；凭据管理器标红 | 重输后重存（in-place，ref 稳定）或删除条目 |
| unsupported | 信封版本不识别（未来版本） | 同 corrupt（按条目惰性） | 同 corrupt |
| recovery-needed | TEE 重置等 Keystore 失效（不含锁屏凭据变更——设计免除） | 横幅提示 + 重输或一键清除 | 重存 in-place，ref 稳定 |
| 重装 | 应用卸载（filesDir 同灭） | 无悬挂引用（注册表与 vault 同域同灭） | 重新录入 |
| target/身份变更 | SSH 主机 target 编辑 | **保留 ref + 显式移除**（裁定）：target 变更不清 ref，由用户在编辑表单显式取消勾选或凭据管理器删除 | 显式移除 |
| 锁屏凭据变更 | — | 不适用（未绑定用户认证，N/A by design） | — |

降级显式化：凭据丢失 + 重输是合法恢复路径；明文持久层降级在代码层不存在（V-secret 探针断言）。


## 连接状态机（已实现（未验证）：issue #3，SSH 主机）

SSH 主机连接由第一方 `packages/mobile-hosts` 状态机驱动，映射到上游 `ServerState`（`packages/gui-extensions/src/sdk/registries.ts`：stopped/starting/auth/ready/failed/incompatible）。直连服务不经过该状态机（上游原生健康轮询 10s + unauthorized 重认证路径承载）。

### T1–T14 转移表（六元组：来源态，事件，守卫，动作，目标态，备注）

| # | 来源态 | 事件 | 守卫 | 动作 | 目标态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | idle \| failed \| incompatible | connect | — | 解析 credentialRef（vault resolver，产出内存凭据值）→ transport.open(target, credential) | connecting | failed/incompatible 保持可操作：重新发起即新尝试；source=idle。措辞修正（F-7，issue #4 评审）：动作列原写 `transport.open(target, credentialRef)` 易误读为把非机密引用直接交给传输层——实际驱动先经 resolver 解析为内存值再传入 transport（`packages/mobile-hosts/src/runtime.ts` attemptOpen），引用本身从不出驱动层。**修订（issue #6，已实现（未验证））：来源态扩为 `idle \| failed \| incompatible \| authRequired`**（修复 authRequired 死端：T1 原不接受 authRequired 来源，编辑凭据后「连接」按钮被状态机拒绝）——其余 13 行不动（`packages/mobile-hosts/src/state-machine.ts`，单测锁定） |
| T2 | connecting | hostKeyPending | — | 指纹存内存（不持久化） | hostKeyUnverified | 弹 host-key 确认（host-key-prompt） |
| T3 | hostKeyUnverified | hostKeyConfirm | — | transport.open（携带已确认指纹）；驱动对已钉固指纹**跳过重复 verify**（确认后立即 open——store 在钉固 open 前无记录，重复 verify 会永久重弹确认） | connecting | 确认指纹即钉固指纹（fast path，决策 0003 §3.3 勘误一；T4/T8/T13 均清指纹，钉固路径必经确认；Kotlin 侧权威比对并写入 store） |
| T4 | hostKeyUnverified | hostKeyReject | — | 无 | failed | **拒绝后无任何连接尝试**（红线，测试断言） |
| T5 | connecting | ready | — | 端点入内存（仅 ready 态持有） | ready | — |
| T6 | connecting \| reconnecting | authRequired | — | — | authRequired | 行内认证按钮（上游 authenticate 路径） |
| T7 | connecting \| reconnecting | incompatible | 版本谓词判定（见下） | — | incompatible | 上游 IncompatibleServerPanel |
| T8 | connecting \| reconnecting | fail | connecting：恒迁移；reconnecting：预算（RECONNECT_MAX_RETRIES=3）耗尽 → failed，未耗尽 → offline（保留预算） | — | failed / offline | failed 终态仍可操作（T1/编辑/删除） |
| T9 | ready | connectionLost | — | — | offline | 客户端断开，远程服务/任务不受影响（红线） |
| T10 | offline | retry | — | transport.open | reconnecting | source=offline |
| T11 | reconnecting | ready | — | — | ready | 隧道端点重解析成功（端口可变，身份不变） |
| T12 | authRequired | ready | — | — | ready | 重认证成功后探测通过 |
| T13 | connecting \| hostKeyUnverified \| reconnecting \| ready \| authRequired \| incompatible \| offline \| failed | cancel | — | 无 | source（idle 或 offline） | 取消/断开恢复来源态，无残留（ready→idle 即用户断开；零 transport 调用，测试断言） |
| T14 | 任意 | delete | — | **零 transport 调用** | idle | 仅删本地记录；远程服务/任务永不停止（红线，测试断言） |

非法转移（如 idle + connectionLost、ready + connect、hostKeyUnverified + ready、failed + connectionLost）一律拒绝并保持原态（实现：`packages/mobile-hosts/src/state-machine.ts` 的 `TRANSITIONS` 表恰好 14 行；单测逐条断言）。

### 映射到上游 ServerState（全覆盖）

| 状态机态 | ServerState |
| --- | --- |
| idle | stopped |
| connecting / reconnecting / hostKeyUnverified | starting |
| ready | ready |
| authRequired | auth |
| incompatible | incompatible |
| offline / failed | failed |

### incompatible 判定（SSH 与直连的二分）

- **SSH 主机**：由我方状态机判定。规则（本仓库自定谓词，上游 web 无可复用实现；上游桌面仅在 extension main 内做同版本安装校验）：解析服务上报版本 `MAJOR.MINOR.PATCH`；**主版本必须等于 2，次版本必须 ≥ 1**（与 vendored app 2.1.x 对应），补丁号不参与判定；版本缺失或无法解析时不判 incompatible（交给 healthy/failed 路径呈现）。
- **直连 http**：**不展示 incompatible**——上游 web 原生行为（`checkServerHealth` 从不设置 incompatible 标志），本仓库不为其补齐判定；如后续需要补齐，归 issue #5。
- 诚实边界：incompatible 的真机呈现（IncompatibleServerPanel）归 G14，未验证。

### host-key 确认（已实现（未验证）：issue #6；真机核验 BLOCKED）

- 状态机显式状态 `hostKeyUnverified` 已实现；确认 UI（HostKeyPrompt）**挂载点已建**（host-manager 行内渲染，`runtime.fingerprintOf(id)` 供数）与真实指纹数据源（SshBridgeHostKeyVerifier 经第三桥 `fetchHostKey`）一并交付（流程见[决策记录 0003 §3](../../decisions/0003-ssh-transport.md)：桥可用性先行 → 查 store → 未知走 fetchHostKey（仅 KEX scan、零认证材料）→ prompt(fingerprint) → 确认 → open(pinnedFingerprint) → Kotlin 权威比对并写入 known_hosts；变更=严格拒绝+显式恢复）。指纹只存内存。
- `HostKeyVerifier` 端口默认仍为 stub：**对任何主机恒返回"拒绝"**（fail-closed），不存在"跳过校验"路径；测试断言 stub 永不放行。真实校验经 M-015 注入（stub 保留为包内无注入默认）。
- 变更恢复：host-manager 失败行内危险按钮（红色警示文案）→ 一次显式危险确认 → `forgetHostKey`（无桥注入时 fail-closed 返回 false）→ 下次连接回未知指纹确认流，行内提示已移除；桥不可用绝不误报为 host-key 拒绝（`bridge-unavailable` 显式失败）。
- 真机核验（未知/已知/变更三态、桥 bring-up）**BLOCKED**（归 G14/G17）。

## 凭据流（已实现（未验证））

1. 用户输入密码 → 仅内存。
2. 可选记住（issue #4）：保存时勾选「记住密码」且 vault available → 经桥 put 加密落盘（信封 v1，Keystore 密钥加密），连接记录持有 `credentialRef`；不勾选 → 密码仅内存（M-002 语义不变）。
3. `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 拼接 `Basic ${btoa("opencode:<password>")}` 进入 `Authorization` 请求头。
4. 持久化编码路径（`persistence.ts` encode，`MemoryOnlyPassword` codec）恒将 password 重写为 `undefined`；解码容忍历史遗留值，缺失密码进入既有认证失败路径。M-010 hydration 注入的密码只写 solid store（内存），同一 encode 路径保证不落盘。
5. 交付态验证：构建产物中检索 `mobile(M-002)` 标记命中（见 [docs/build-and-verify.md](../../build-and-verify.md) V-cred）；localStorage 负例的真机复核归 G9；vault 落盘负例（index.json 无值、密文文件不进备份）归 C3/C4。

## 直连传输（已实现（未验证）：issue #5，裁定见[决策记录 0002](../../decisions/0002-direct-connection-transport.md)）

直连服务沿用上游原生注册表与连接对话框（M-005/M-006/M-009/M-010 已承载），issue #5 补齐传输卫生与错误分类：secure-fetch（M-011）、上传 XHR 校验（M-012）、probe 先行分类反馈（M-013）、probe 桥接线（M-014）。实现位置 `packages/mobile-hosts/src/transport/`、`src/probe.ts` 与 `android/app/src/main/java/ai/opencode/mobile/probe/`。

### 四通道认证覆盖表（现状=上游已统一 Authorization 头；M-011 不触头语义）

| 通道 | 载体 | 认证方式 | URL 中有无凭据 | 本轮动作 |
| --- | --- | --- | --- | --- |
| API | `api.ts createApiForServer`（Basic base64("opencode:<password>") 进 `Authorization` 头，经 `client.tsx` 的 `createServerTransport({fetch: platform.fetch})`） | 头 | 无 | M-011 注入 secure-fetch（重定向校验/userinfo 拒发），头语义不动 |
| SSE | 生成客户端 `sse()` 为 fetch body 异步迭代器（非 EventSource），同一 fetch 封装同一头 | 头 | 无 | 同上（随 M-011 覆盖） |
| WS（PTY） | `client/solid/pty.ts` 先认证铸一次性 ticket（`Authorization`+`x-opencode-ticket` 头）再 `new WebSocket(url?ticket=…)`；服务端单次消费并校验 Origin 白名单 | 铸票（头）+ 单次能力票据（URL） | URL 携带短时效单次 ticket（**非凭据**，D5 裁定接受并文档化） | 无补丁；纪律=日志零 URL 参数 |
| 文件上传 | `composer/attachments/destination.ts` XHR 显式 `setRequestHeader("authorization", …)` | 头 | 无 | M-012 load 后校验 `xhr.responseURL`（跨主机/降级 fail-closed） |
| 二进制读 | `descriptor.binary` 带头 fetch | 头 | 无 | 随 M-011 覆盖 |

URL 卫生：secure-fetch 对含 userinfo（`user:pass@host`）的请求 URL 拒发（`assertNoUrlCredentials`，纵深——对话框 link 流 `serverAddress` 已拒 userinfo，password 表单的 `normalizeServerUrl` 直存路径不拒，壳侧拒发兜底，错误呈现为 `dialog.server.error.credential-url`）。

`authFromToken` 残留评估：上游 `api.ts` 的 `authFromToken`（`?auth_token` 直通铸头）唯一消费方已被 M-007 从 entry.tsx 移除，仅 `api.test.ts` 引用——运行期无可达的 URL 凭据通路，不加补丁，此处记录评估结论。

### probe 分类与反馈（M-013/M-014）

probe 端口（`getMobileHosts().probe`）默认 fail-closed stub（恒 `unavailable`，绝不伪造分类）；Android 桥 ack 后由 `DirectEndpointProbe` 支撑。probe 是**分类器不是权威**：仅在保存路径健康检查失败时用于选择错误文案（`dialog.server.error.<code>`，app i18n en/zh；probe unavailable 显式退化为上游泛化文案 `dialog.server.add.error`）；分类与真实 fetch 冲突时以真实 fetch 为准。probe 凭据边界（带 Authorization 头的分类语义、头/URL/桥消息零日志值、不持久化、三层信任复用与协议隔离）见[决策记录 0002](../../decisions/0002-direct-connection-transport.md) probe 设计节。

### 错误分类×反馈×恢复矩阵（issue #5）

保存路径的权威判定=上游健康检查（真实 fetch）；下表是健康检查**失败后**的错误反馈与恢复路径。错误文案优先级：mixedContent（上游结构信号）→ unauthorized（健康检查 unauthorized 标志）→ probe 分类 → 泛化文案（probe unavailable/`ok`/冲突时显式退化）。双键集口径（F5）：M-013 只消费 app i18n 键 `dialog.server.error.<code>`（en 基表 + zh 表，缺键回退 en 再回退键名）；mobile-hosts 自含键 `direct.error.<code>`（EN/ZH）用于第一方 UI 面（映射 `directErrorCodeMessageKey`，全集断言单测锁定）。

| 分类码 | 触发（probe/secure-fetch/健康检查） | 用户可见反馈（app i18n 键） | 恢复路径 |
| --- | --- | --- | --- |
| `unauthorized` | probe 401 / 健康检查 unauthorized 标志（权威） | `dialog.server.error.unauthorized`（服务器拒绝凭据 401） | 检查密码重输；上游 unauthorized 流 + #4 M-009/M-010 链路 |
| `forbidden` | probe 403 | `dialog.server.error.forbidden` | 检查账号与权限 |
| `cert-expired` | probe TLS（证书过期） | `dialog.server.error.cert-expired`（续期证书/Let's Encrypt 或 SSH 隧道） | 换正规 CA 证书；SSH 隧道（#6） |
| `cert-hostname` | probe TLS（主机名不符） | `dialog.server.error.cert-hostname` | 核对地址；为本主机签发证书 |
| `cert-untrusted` | probe TLS（自签/私有 CA 不可分辨） | `dialog.server.error.cert-untrusted`（裁定：本期不支持，三条出路见 0002 D2） | 正规 CA；SSH 隧道；per-connection pin（后续候选） |
| `cleartext-blocked` | netsec 阻断明文（probe 与 WebView 同源判定） | `dialog.server.error.cleartext-blocked`（D3：本期不支持明文） | 改用 HTTPS；SSH 隧道 |
| `refused` | probe 连接拒绝 | `dialog.server.error.refused` | 确认服务运行与端口 |
| `timeout` | probe 超时（8s+8s 有界）/ 健康检查 30s 超时 | `dialog.server.error.timeout` | 检查地址/端口/网络路径 |
| `dns` | probe DNS 解析失败 | `dialog.server.error.dns` | 检查主机名 |
| `not-found` | probe 404 | `dialog.server.error.not-found` | 检查地址与端口 |
| `html-response` | probe 命中 HTML（代理/门户页，任意状态码 + content-type/侦嗅） | `dialog.server.error.html-response` | 核对地址是否指向服务本体 |
| `credential-url` | secure-fetch/userinfo 前置校验（M-011/M-012/M-013 三面一致） | `dialog.server.error.credential-url` | 从地址移除凭据，密码走密码栏 |
| 重定向跨主机/降级 | secure-fetch（M-011 fetch 面）/M-012（XHR 面）fail-closed | 健康检查失败 → 泛化文案（分类错误被上游吞为 `{healthy:false}`；两端拒交付是行为保证，矩阵登记） | 服务端修正重定向；反代保持同源 |
| 地址格式 | 上游 `serverAddress`/`normalizeServerUrl`（不动） | 上游既有文案（`server.connect.link.invalid` 等，矩阵登记） | 修正地址 |
| probe unavailable | stub 默认/桥未 ack/桥超时/畸形响应 | `dialog.server.add.error`（**显式退化**，不伪造分类） | 重载页面重握手（G16）；真机核对归 G16 |

诚实边界：会话中期的逐因分类不在本期（D4）——中期降级由上游 10s 健康轮询承载，逐因反馈归后续迭代。设备级端到端核验（G4/G5/G11）全部 BLOCKED。

### 残余 fetch 面（评审备注 F2 登记）

以下两处不经 `platform.fetch`（不受 D1 校验），登记为已知残余面、本轮不修补：①`pairing.ts:87` `OpenCode.make({baseUrl})`（配对码兑换，无认证头——以一次性 code 换 token）；②`pairing.ts:129` `checkServerHealth(…, globalThis.fetch)`（配对地址优选，带 Basic 头）。out-of-scope 理由：浏览器规范对跨源重定向子请求剥头是底线，D1 校验为纵深；两处仅存在于配对流，地址来自 `opencode pair` 链接而非服务器列表，泄漏不成立、静默跟随的内容风险窗口极小。

## 配对与连接导入（已实现（未验证）：issue #22——上游闭包承载，零新建界面/零补丁/零运行时代码/零依赖变更；文档与静态探针收口，运行期归 G32）

配对（pairing）是 connection 单元「建立认证连接」职责的导入面：桌面/CLI 发起端（`opencode pair`、桌面 app Pair 对话框）产出一次性配对链接/QR，移动端只承担**接收导入**——粘贴或扫描链接 → 语法与信任校验 → 向服务器兑换会话 token → 健康检查 → 写入 http 服务记录。上游拥有完整协议且已随闭包在本壳内（`platform: "web"`，M-007 entry 装配）功能完备；本期固化其安全语义与验证面，不新增任何传输面。本节三条安全红线逐条落字：**①scheme/host 校验不放宽**（四层校验见②）；**②秘密不经日志/剪贴板/历史**（token 纪律见④）；**③TLS/host-key 校验不绕过**（见⑤——零绕过负断言由 `scripts/verify-pairing.ts` 锁定）。

### ① 协议链路

- 端点（`vendor/upstream/packages/protocol/src/groups/server.ts`）：`server.pair` = `POST /api/pair`（"Create a short-lived, single-use code for a /auth/connect/:code pairing link"，返回 `PairingCode {code, expires_in}`）；`server.connect` = `GET /auth/connect/:code`（`PAIRING_CONNECT_PATH`，"Redeem a pairing code. Browsers receive a session cookie and a redirect to the web app; requests that accept JSON receive a session token to use as the password"，返回 `PairingSession {token}`，错误=UnauthorizedError）。
- 单次码语义（客户端证据在闭包）：`redeemPairingLink` 注释逐字「Every address may reach the same server, but the code is single-use, so at most one attempt succeeds」与「Only a server's answer proves the code is spent」。**服务端实现层交叉证据（引上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `b4525d79bf`，非闭包——vendored 闭包按策略不含 `packages/server`）**：`packages/server/src/pairing.ts` 的 `TTL = Duration.minutes(5)` 与 `consume = Cache.invalidateWhen(cache, code, () => true)`（取用即从缓存移除=结构性单次）+ consume 失败返回 `UnauthorizedError({ message: "Pairing link expired or already used" })`——**expired 与 replayed（他端已用）同落 401、同源同文案**，与客户端 401 映射互证。
- 发起端（桌面/CLI 自身面——移动端只核对接收导入，发起端产出形态归 G32① 环境前提如实记录）：CLI `opencode pair` 打印链接并出 QR；桌面 gui-ext（`packages/gui-extensions/src/pairing/`）设置页 Pair 按钮 → 开启 remote access（OpenTunnel 隧道）→ 对话框渲染 QR（`uqr` `renderSVG(JSON.stringify({ code, urls: [tunnel] }))`，QR 载荷即 `{"code","urls"}` JSON）+ 复制链接 `/auth/connect/<code>` + 有效期倒计时与到期自动换码。上游配对链接是**纯 `http(s)://<host>/auth/connect/<code>` URL**——上游六包 src 全域 `opencode://` 零命中（零自定义 scheme），壳层零 deep-link。
- 兑换与地址优选：`redeemPairingLink`（`app/src/servers/connect/pairing.ts`）对多地址 `Promise.any` 并发兑换（每地址 `AbortSignal.timeout(5_000)` 有界），401（`isUnauthorizedError`）→ `expired`，其余失败 → `unreachable`；`preferFirst` 在 token 全地址有效时优先保持用户所选首地址（本地网地址离开该网络即失效；1 秒不答不等待）。

### ② 四层校验与零被动导入（explicit confirmation）

四层校验全部上游既有（`pairing.ts` + 兑换接线），链接导入的唯一网络动作=对已校验 origin 的协议端点 `GET /auth/connect/:code`——**不存在「对链接任意 GET/执行任意链接动作」的通路**：

| 层 | 机制 | 拒绝结果 |
| --- | --- | --- |
| 地址层 `serverAddress` | 含 `://` 但非 `^https?://` → undefined（**scheme 白名单，`opencode-ios://` 类即拒**）；`URL.canParse` 失败 → undefined；非 http/https 协议 → undefined；**userinfo/search/hash 任一存在 → undefined**（凭据 URL 在解析层即拒） | 该地址不可用 |
| 链接层 `pairingLink` | JSON 形 → `Schema.Struct({code, urls})` 解码 + `CODE = /^[A-Za-z0-9_-]+$/` 逐码校验 + urls 全过 serverAddress + 去重，任一非法整体 undefined；URL 形 → 仅 `/^\/auth\/connect\/([^/]+)$/` 路径命中取码（**路径即动作白名单**） | 非 legacy → `server.connect.link.invalid` 行内错误，零网络动作 |
| 遗留流 `legacyPairingLink` | 识别旧 `/connect#<credentials>` 与 `/connect?data=<credentials>` 凭据链接 | **识别、报错（`server.connect.link.legacy`）、零兑换动作**——旧链接 fragment 内嵌凭据绝不执行 |
| 误入判定 `bareServerAddress` | 无路径的裸服务器地址才转交密码表单（"a bare code or a cut-off link is not mistaken for a server"） | — |

**零被动导入三锚（explicit confirmation 的落点）**：①壳零 deep-link（manifest 唯一 LAUNCHER intent-filter，注释逐字「Launcher activity only; deep links are not implemented (TODO in MainActivity)」；MainActivity 零 intent 处理）——外部打开链接不可能触发 App 动作；②零剪贴板监听导入；③**零自动兑换**——对话框 `preview()` 注释逐字「A pairing link is not a server address until it is redeemed, and redeeming spends it.」，link 方法输入过程中健康预览显式取消、兑换仅发生在用户提交（screen 同构：仅 form onSubmit/按钮触发）。导入成功的确认链=**粘贴+提交（两次显式用户动作）** → 语法校验 → 兑换（服务器对单次码的裁决）→ 健康检查 → `servers.add`——任一步失败无注册表写入（screen `connect()` 先 `check` 后 add；dialog 同序且 vault 操作在健康检查之后）。**不新增「配对确认对话框」**——确认语义即上述显式动作链，不虚构不存在的 UI；扫描路径的确认=用户取景动作本身（扫描当前不可用，见⑦）。

### ③ 兑换错误分类×呈现（六形态本壳可达 + 一形态结构性不可达注记）

| 形态 | 机制 | 用户可见（i18n 键，en 基表 + 40 余 locale 在册） |
| --- | --- | --- |
| 无效串 | `pairingLink` undefined 且非 legacy | `server.connect.link.invalid`（行内错误，零网络动作） |
| 过期/已用（replayed） | 兑换 401 → `{type:"expired"}` | `server.connect.link.expired`（"expired or was already used" 一词双关覆盖两态） |
| 不可达 | 全地址无应答（`AbortSignal.timeout(5_000)` 亦有界） | `server.connect.link.unreachable`（附 URL 列表）；**本壳 LAN 明文配对失败恒落此形态**（netsec 阻断见⑦） |
| 遗留链接 | `legacyPairingLink` 命中 | `server.connect.link.legacy`（识别不执行） |
| 扫描无效码 | scanner 解码后 redeem 返回 error | `server.connect.scan.invalid`；解码失败 `server.connect.scan.failed`（三秒抑制防每帧重兑：`rejected` Map + `Date.now() + 3000`） |
| 相机错误 | `scanner.start()` 失败 | `server.connect.camera.error`；上游降级提示 `cameraHint()`（secure context 下 `server.connect.camera.unavailable`——"Enter your connection details manually"） |
| 混合内容 | `isMixedContent`（`redeem.ts`/`dialog.tsx`/`screen.tsx` web 全地址明文时） | **本壳结构性不可达注记**：`browser.ts` 的 `isMixedContent` 要求页面 origin 为 `https:` 才可能 true，本壳页面 origin 恒 `http://127.0.0.1:18090`（回环）→ 分支不可达，仅 https 页面上游场景可达——LAN 明文配对失败恒呈现 unreachable，不算本壳可达形态 |

### ④ token 秘密纪律（红线：秘密不经日志/剪贴板/历史）

- **token 流向 memory-only**：兑换得 `session.token` → 以 `password` 形进入内存连接对象（`Pairing {url, password}`）→ **link 方法不渲染「记住」勾选框**（对话框渲染门 `checkboxRendered: store.method === "password" && vaultAvailable()`——link 流恒 false → `evaluateRemember` 走 passthrough，真值表行 6/11；决策核心首锁在 `scripts/verify-credential-vault.ts`，本期探针只锁 dialog 侧渲染门锚作交叉引用）→ **配对 token 永不经 vault 落盘** → 持久化 encode 恒剥 password（M-002）→ 重启后该服务 unauthorized → 重配对自愈（单次码设计内，非缺陷；**不得声称配对 token 持久化**）。
- **prior `credentialRef` 语义分面（add 面两挂载面实态不同——上游实态例外句）**：**dialog 连接对话框面=passthrough 保 ref**（`credentialRef: decision.action === "passthrough" ? decision.ref : undefined`，M-006/M-009 prior 语义）；**screen 独立连接屏面=重配对丢弃 prior `http.credentialRef`**——机制=`servers.add(existing ? { ...existing, http } : { type: "http", http })` 的 shorthand `http`（`HttpBase {url, password}` 恒不含 ref）整体覆盖 `existing.http`，且注册表 `add()` 命中既有项时 `setStore("list", existing, conn)` 整体替换、不与旧条目合并 ref（顶层 displayName 经展开保留）；后果=该服务记录与 vault 条目的 ref 绑定静默丢失 → vault 条目转孤儿（凭据管理器孤儿区呈现）→ 重启后 unauthorized → 重配对自愈。**无安全泄漏**（ref 非机密、丢绑定只降级为重认证，不入日志不入剪贴板）；实态可接受性归 G32⑤ 双面核对，不预设行为变更补丁。
- **剪贴板分域口径**：**配对/导入面零剪贴板写**——`servers/connect/` 全目录 + `packages/mobile-hosts/src` 域内 `navigator.clipboard.write|writeText` 零命中（探针组 5 锁定；mobile-hosts 的剪贴板接触是 issue #16 `clipboardImage` **读取**面）。**域外事实（上游 app 自有剪贴板写，均不在配对流，如实声明不进断言域）**：`providers/connect/dialog.tsx`（provider OAuth copy-link 回退）、`runtime/extension/host-apis.tsx`（宿主 copy API）、`session/commands/use-session-commands.tsx`×2（sessionID/projectID 复制）。桌面 gui-ext 的「copy link」是发送端桌面自身剪贴板，不属本客户端面。TextInput 链接值仅存组件 store（`reset()` 即清），零持久化零草稿存储。
- **日志零值**：pairing/redeem/scanner/camera 四文件零 `console.`/`Log.` 类调用（探针负断言）；壳层 `onReceivedSslError` 仅记错误类、console 仅 message+行号、`setSavePassword(false)`（MainActivity）既有锚在册。
- **历史零渗漏**：兑换经 `fetch()` 非导航 → 零 WebView 历史/前进后退列表条目；链接输入 `spellcheck={false} autocapitalize="off"`；密码输入 `type="password"` + 壳 `setSavePassword(false)`。
- **direct/SSH 二分**：配对只产 **http 身份**（上游 URL 键）；SSH 主机（`mobile-ssh:<uuid>`）有独立凭据流——`servers/connect/` 全域零 known_hosts/HostKeyVerifier/hostKey 命中（探针负断言，SSH 域零交）。

### ⑤ 路由与信任保持（红线：TLS/host-key 校验不绕过）

- **host 路由**：兑换成功 → `target()`（screen）/`paired()`（dialog）——重签入保持既有地址（注释逐字 "A pairing token works on every address of its server. Signing in again to the server that signed out keeps its address"）；签出态 `shell/routes/routes.tsx` 以 `signedOut()?.http.url` 回连**同一服务器**。
- **project/session 路由**：导入只建 http 服务器记录；项目/会话选择走既有 `ServerScope` 机制（权威见 [projects-sessions.md](projects-sessions.md)，同名项目/会话不混淆），本期引用不重裁定。
- **`servers.add` 前置健康检查**：screen/dialog 四调用位均先 `check`/`checkServerHealth` 后 add——健康检查失败零注册表写入。
- **TLS 校验不绕过**：导入路径**零新增传输面**——兑换/健康检查后的一切请求走既有通道（API/SSE=platform.fetch+M-011 secure-fetch、上传=M-012）；TLS=WebView system CA（netsec trust-anchors，`onReceivedSslError` 恒 CANCEL 在册）；明文=netsec 阻断（G5）；`servers/connect/` 域内零 `rejectUnauthorized|disableCert|insecure` 命中（探针负断言）。**host-key 校验属 SSH 域**（三态流，[决策 0003](../../decisions/0003-ssh-transport.md)），配对流零触碰；配对流不引入任何「跳过校验」选项。
- 残余面引用（#5 F2 两处 raw fetch，见上「残余 fetch 面」节）：引用其 out-of-scope 在册结论，不重裁定；真机负例核对归 G32⑦。

### ⑥ 取消与冷热启动

| 形态 | 机制（全部上游在册） | 用户可见后果 |
| --- | --- | --- |
| 取消 | 对话框取消钮关闭/扫描 `onCancel` 停止扫码并 refetch 相机可用性 | 关闭即弃，无注册表残留（add 仅在健康检查后） |
| 冷启动（配对中杀 App） | 表单态组件内存、零持久化 | 重启无半成品记录；单次码或已耗（他端/已兑）→ 重跑 `opencode pair`；已导入服务 unauthorized → 重配对自愈 |
| 热启动（旋转/后台） | 旋转=Activity 重建（[interaction-quality.md](../interaction-quality.md) §一）→ 表单态丢失；后台返回不重复兑换（`last` 缓存：同 code 复用 token，用户后改地址优先） | 旋转后需重新粘贴（表单态非持久化=上游实态，如实记录） |

### ⑦ 不支持流清单（验收 4 本体——如实登记，零 parity 声称）

以下六项为本壳**不支持**的桌面配对流形态，每项带机制原因与替代路径；运行期呈现归 G32 判定，不得静默声称对等：

1. **LAN 明文配对链接不可达**：`opencode pair` 默认输出形如 `http://192.168.1.2:49374/auth/connect/…` 的局域网明文地址——netsec base-config `cleartextTrafficPermitted="false"`（仅 127.0.0.1/localhost 例外）在 WebView 平台层阻断 → 兑换失败呈现 unreachable。这是[决策 0002](../../decisions/0002-direct-connection-transport.md) D3「明文直连不支持」的既有立场对配对流的自然延伸。**支持路径=桌面 remote access 的 HTTPS OpenTunnel 隧道链接（或既有 SSH 隧道经 #6 凭据流的直连记录）**。
2. **相机扫描不可用（壳层能力缺席）**：manifest 仅 INTERNET 权限（零 CAMERA）、`WebChromeClient` 零 `onPermissionRequest`（getUserMedia 在 WebView 内无法获得授权）——上游门控链 `createCameraAvailability` 止步于授权，扫描入口当前不可用；上游自带降级提示在册（`cameraHint()` → "Enter your connection details manually"）。失败呈现形态（显式错误 vs "Opening camera…" 挂起）未判定，归 G32⑧；**QR 扫描使能（manifest CAMERA + `onPermissionRequest` 运行时授权，resource+origin 双白名单、拒绝与撤销三态）登记 M-022+ 候选（隐私可见的产品决策，设计草图随候选登记），本期不实施不预设**。
3. **经隧道端点手工兑换不支持**：把 SSH 隧道回环端口当配对地址手工兑换属误用形态（隧道端口动态、身份键错配）——不支持，如实登记。
4. **外部链接拉起 App 不支持**：零 VIEW intent-filter（manifest 唯一 LAUNCHER）——外部打开配对链接不会进入 App；需求与 #14 OAuth 回跳同族合并 M-022+ 候选，不新增独立候选。替代路径=App 内粘贴导入。
5. **消息内点按配对链接=同窗导航至远端 web app**：WebView 同窗导航类既有行为（G25③ 类，见 [interaction-quality.md](../interaction-quality.md) §一）——点按消息内的配对链接导航到远端 web app 而非本壳导入流。引导口径=粘贴导入，不新增断言；实态归 G32⑨。
6. **旧版 `/connect#<credentials>` 凭据链接导入=识别即拒绝**：`legacyPairingLink` 检测 → `server.connect.link.legacy` 文案（"Update OpenCode on the server, then run opencode pair again"），零兑换动作——本客户端不承接旧流。

### ⑧ 残余面与验证面（诚实边界）

- **残余 fetch 面**：`pairing.ts` 两处 raw fetch（①`OpenCode.make` 兑换、②`checkServerHealth(…, globalThis.fetch)` 地址优选）为 #5 评审 F2 在册残余（out-of-scope 理由见上节），本期引用不重裁定；真机负例核对归 G32⑦。
- **上游单测**：`pairing.test.ts`（6 个 test 块：链接解析/QR 多地址/他类 URL 拒绝/畸形 QR 拒绝/裸地址判定/遗留链接识别）已入 app 上游回归子集（66→67 文件）真跑；`dialog.tsx`/`scanner.tsx`/`redeem.ts` 无上游单测（上游实态，如实登记）——语法层由 pairing.test.ts 承接、运行期归 G32，不为上游补测试。
- **静态探针**：`scripts/verify-pairing.ts`（八组断言+负例四组）锁定本节结构事实；docs 锚断言只防文档-代码漂移，探针为静态结构检查、对运行时行为零证明力。
- **运行期门禁**：G32 十项（扫描实态/LAN 明文呈现/ref 双面核对等判定点）全部 BLOCKED——G32 未过前本节只声称「已实现（未验证）」。
- **范围边界**：「相机使能实施/deep-link intent-filter 实施/pairing redeem 迁移 secure-fetch/screen 面丢 ref 行为变更/配对 token 持久化策略变更」明确不在 issue #22 范围。

## SSH 隧道传输（已实现（未验证）：issue #6，裁定见[决策记录 0003](../../decisions/0003-ssh-transport.md)）

SSH 连接由第三座协议隔离桥承载：JS 侧 `ssh/bridge.ts`（`SSH_HANDSHAKE`=`opencode-mobile-ssh-handshake`，ops: connect/disconnect/fetchHostKey/removeHostKey/cancel）↔ Kotlin `SshTunnelBridge`/`SshTunnelManager`（JSch）/`SshHostKeyStore`（filesDir/ssh/known_hosts）/`SshErrorCode`。库（jsch+bcprov）只在 Kotlin 桥内；共享层零平台 API；`StubHostKeyVerifier`/`StubHostTransport` fail-closed stub 保留为默认注入。转发：listener 绑 `127.0.0.1:0` 动态回环端口，目标固定**远端**回环 `localhost:<servicePort>` 单跳（servicePort 是远端 OpenCode 服务端口，默认 4096；SSH 端口在 target 内，两者语义去混淆见 [server-list.md](server-list.md)）。状态机 T1 修订：来源态扩 `authRequired`（见上表）。upstream 镜像增可选 `reconnect`（ensureTunnel：经 T10/T8 预算重试重解析端点；不可达即抛错，上游按其节奏重调，预算 RECONNECT_MAX_RETRIES 封顶无无限循环）/`connect`（connectInline：T1 修订来源态 → ready，供上游 authenticate 行内登录与 T12）。服务层权威=open 成功后有界 GET `<endpoint>/api/info`（10s 超时、redirect: error——端点为内核分配的 127.0.0.1 动态口，构造上不含 userinfo、重定向即敌意拒绝；401/403 视为服务存活，服务认证归上游流）：失败 → `service-unreachable`（T8）；版本可解析且不符 → markIncompatible（T7）。

### SSH 算法支持矩阵（静态文档；真机/服务端协商核对 BLOCKED）

「默认」= jsch fork 默认启用集；「BC 补齐」= 需 BouncyCastle 提供（minSdk 29–32 平台 JCE 缺 XDH/Ed25519）；API 33+ 平台自带仍统一走 BC 路径。`ssh-rsa`（SHA-1 签名）维持 fork 默认禁用（RFC 8332 rsa-sha2-256/512 覆盖）。

| 类别 | 算法 | 集合 |
| --- | --- | --- |
| KEX | ecdh-sha2-nistp256/384/521、diffie-hellman-group14/16/18-sha256、diffie-hellman-group14-sha1、diffie-hellman-group1-sha1 | 默认 |
| KEX | curve25519-sha256、curve448-sha512 | BC 补齐 |
| 主机密钥 | ssh-ed25519、ssh-ed448 | BC 补齐 |
| 主机密钥 | ecdsa-sha2-nistp256/384/521、rsa-sha2-256/512、ssh-rsa（签名校验） | 默认 |
| 密码学 | aes128/256-gcm@openssh.com、aes128/192/256-ctr、aes128/192/256-cbc | 默认 |
| 密码学 | chacha20-poly1305@openssh.com | BC 补齐 |
| MAC | hmac-sha2-256/512、hmac-sha1 | 默认 |
| 认证 | publickey（rsa-sha2-256/512、ecdsa、ed25519）、password、keyboard-interactive（同密码应答） | 默认；keyboard-interactive 为矩阵登记项 |
| 私钥格式 | OpenSSH 新格式（bcrypt KDF，含 ed25519/rsa/ecdsa）、PEM（PKCS#1/PKCS#8）、口令加密（passphrase 走信封，见下） | 默认 + BC（新格式 ed25519 需 BC） |
| 指纹 | `SHA256:<base64_nopad(SHA-256(keyblob))>`（与 `ssh-keygen -lf` 输出逐字一致） | 双实现（TS WebCrypto + Kotlin MessageDigest），`verify-ssh.ts` 固定向量锁定 |

### SSH 失败分类×反馈×恢复矩阵

分类层（`SshErrorCode` 14 码）与状态机落点的权威描述见[决策记录 0003 §5](../../decisions/0003-ssh-transport.md)；此处登记用户可见反馈（i18n `ssh.error.<code>` EN/ZH，第一方键集）与恢复路径：

| 码 | 层 | 用户可见文案要点 | 恢复路径 |
| --- | --- | --- | --- |
| `bridge-unavailable` | 桥面 | 显式泛化（SSH 通道当前不可用；不伪造具体原因） | 重载页面重握手（G17） |
| `dns` / `refused` / `timeout` / `unreachable` | SSH 可达性 | 主机不可达/拒连/超时（区分措辞） | 检查地址/端口/网络；重试（T1） |
| `auth-failed` | SSH 认证 | 服务器拒绝认证 | 行内编辑凭据 → 连接（T1 修订来源态） |
| `key-decrypt-failed` | SSH 认证 | 私钥无法解密（passphrase 缺失/错误） | 重新导入私钥（含 passphrase） |
| `host-key-unknown` | host-key | 首次连接：指纹待确认（HostKeyPrompt） | 确认（trust，先于认证）或拒绝（T4） |
| `host-key-changed` | host-key | **危险警示**：主机密钥与已存记录不符；永不自动覆盖 | 显式危险确认 → removeHostKey → 未知确认流 |
| `host-key-rejected` | host-key | 用户已拒绝 | 重新连接时再次确认 |
| `target-refused` / `forward-failed` | 隧道目标 | **SSH 认证成功但远端拒绝转发**（服务端口/服务状态核对） | 核对 servicePort 与远端服务 |
| `service-unreachable` | 服务失败 | 隧道已建立但服务未应答 | 核对远端 OpenCode 服务（权威=有界 GET /api/info）；**服务操作入口（issue #7）**：host-manager 行内「服务操作」展开可经 SSH exec 发现安装面并显式授权修复动作（发现/安装/启动），见 [units/service-ops.md](service-ops.md) 与[决策 0004](../../decisions/0004-service-operations.md) |
| `io` | 传输面 | 传输错误（泛化） | 重试 |

### SSH 安全评审节

- **host-key 校验永不禁用**：`StrictHostKeyChecking` 恒 `"yes"`；scan 会话经默认空库在 KEX 抛 UnknownHostKey 后读 `session.hostKey`（赋值先于抛出，经 2.28.8 jar 字节码层核验），自实现 `HostKeyRepository` 承担认证会话的权威比对；变更=严格拒绝（`host-key-changed`），**无任何跳过/仅本次信任路径**；恢复=显式危险确认 + `removeHostKey`。负断言在册（`scripts/verify-ssh.ts`：无 `no/ask`、无自动 add、无 ProxyJump/ProxyCommand/setProxy*、无 hashed hostname 行、scan 零认证材料）。
- **算法降级防护**：`ssh-rsa`（SHA-1）维持 fork 默认禁用；密钥交换/密码学套件取 fork+BC 默认集（支持矩阵），不引入弱算法白名单项；服务端若仅提供已弃用算法则连接失败并落入可达性/认证分类文案（不静默降级）。
- **凭据流**：凭据值（密码/私钥/passphrase）仅存 vault（Keystore AES-GCM 信封 v1；passphrase 与私钥同信封，F10 方案 C）；过桥 JSON 单向一次、零日志（含 header）、零持久化、零回显；scan 会话零认证材料；**凭据在指纹确认前不发出**（fetchHostKey 不认证）。
- **回环 listener 残余风险（如实登记）**：本地转发口绑定 `127.0.0.1` 动态端口，本机其他 App 理论上可探测/连接该端口——缓解：会话期短生命周期（断开即关）+ 远端 OpenCode 服务自身认证兜底（隧道只透传，不扩权）；per-listener token 加固为后续候选，不在本轮。
- **断开语义精确表述（F8①）**：断开/取消/删除/销毁仅拆 SSH 传输（SSH_MSG_DISCONNECT）+ 释放本地 listener；**远端 OpenCode 进程存活**，零远程服务信号、零任务停止（Kotlin 注释、本文、interaction.md 三处双写）。
- **验收⑤条件句（F4，第二处落字）**：本节全部为**静态边界已实现（未验证）**——边界保持的最终断言依赖 G17 三桥 bring-up + SSH 端到端（真机 + 授权 SSH 主机 + 授权服务）；门禁未过前不得声称运行期边界成立。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：直连建立过程反馈待真机定义（上游实现承载）；SSH：connecting/reconnecting 呈现已实现（未验证），真机归 G14 |
| 空态 | 已确认未实现：无任何服务记录时的引导形态待真机核对 |
| 错误态 | 已确认未实现（目标行为已存在）：认证失败、证书错误、CORS 失败、断网的反馈与恢复归 G4/G5/G11；缺失密码进入上游既有认证失败路径；SSH：failed/offline 呈现已实现（未验证），真机归 G14 |
| 边界态 | 已确认未实现：不兼容 server——直连不展示（上游 web 原生行为，补齐归 #5）；SSH 由状态机判定（规则见上），真机归 G14；host-key 三态确认与变更恢复已实现（未验证），真机归 G14/G17（BLOCKED）；权限边界不适用（无角色体系） |
| 过程态 | 已实现（未验证）：host-key 确认（host-key-prompt，host-manager 挂载）是唯一多步交互；M-015 注入后可达，真机归 G14/G17（BLOCKED） |
| 恢复口径 | memory-only 基线 + 可选记住（issue #4）：未记住的密码刷新/重启需重输；已记住的凭据经 vault 解析自动恢复（unavailable/corrupt 时按上方失效矩阵呈现，无明文回退）；SSH 凭据引用重启后经 vault-backed resolver 解析（默认 UnavailableVault fail-closed）；Keystore 持久化已实现（未验证），真机归 C1–C5 |

## 文案口径

连接相关文案由上游 i18n 体系（`packages/app/src/runtime/i18n`）承载；SSH 主机管理与 host-key 确认文案由 `packages/mobile-hosts` 自含 EN/ZH 字典承载（已实现（未验证），`src/i18n.ts`）；凭据管理器与 vault 状态文案同由该字典承载（issue #4 新键，EN/ZH 成对）。M-009 的「记住密码」勾选框文案随上游字典补丁登记（EN/ZH 同步，含行 2/12「需要密码才能记住」措辞）。memory-only 行为的 App 内提示随 vault 交付为「可选记住」口径（见 [../interaction.md](../interaction.md) notice 修订）。
