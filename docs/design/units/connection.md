# 单元：connection（服务连接与凭据）

状态：**已确认未实现（字段契约已实现；issue #3 扩展已实现（未验证）；issue #4 凭据保管契约与代码已实现（未验证））**。作为产品能力（用户在设备上完成一次到远程服务的认证连接）尚未交付，依赖 G3（CORS，高风险）、G4（TLS 拒绝）、G5（cleartext 拒绝）、G6（SSE）等门禁通过；已实现的部分：随闭包引入的字段契约与凭据纪律，issue #3 的 credentialRef 契约（M-005/M-006）、SSH 连接状态机与 host-key 确认立桩（host-key-prompt，stub fail-closed），以及 issue #4 的凭据保险库（vault 端口/信封/桥协议/Android Keystore 落盘/可选记住交互，M-009/M-010 补丁），实现位置 `packages/mobile-hosts/` 与 `android/app/src/main/java/ai/opencode/mobile/vault/`，全部未经设备运行验证（桥 bring-up 与 C1–C5 门禁 BLOCKED）。

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
- SSH：主机记录原生持有 `credentialRef`（载荷白名单字段，见 [server-list.md](server-list.md)）；编辑语义为「undefined=保留、空串=清空」，主机 target/身份变更时是否清空或重确认引用归 issue #4 裁定。
- 引用解析：issue #3 本期为 NullResolver；issue #4 起 resolver 默认仍是 fail-closed 的 Unavailable 实现（显式状态，非降级），Android 桥握手 ack 后由 vault 支撑的 resolver 解析（见下节 vault 契约）；解析结果只注入内存连接对象，永不回写持久化。
- 用户可见后果：重启后直连仍需重输密码（M-002），SSH 主机需重新解析凭据引用（本期引用无目标，SSH 连接真实建立归 #6）；引用本身会随记录保留。

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

`filesDir/vault/<id>.bin` 密文文件 + `filesDir/vault/index.json`（`[{id, kind, label?, createdAt}]`，**永不存值**）。写入原子：临时文件 + rename，失败保留旧密文（in-place 更新失败不破坏既有条目）。64KiB 为应用自选 bound：JS 预检 + native 复检双写（临界值 65536 字节恰好允许、超限拒绝）。

### 桥协议（平台 WebMessage channel，三层信任替换 origin 校验）

通道：Android 平台 `WebView.createWebMessageChannel()` + `postWebMessage(WebMessage, targetOrigin)` + `WebMessagePort`（API 23+，零新依赖，零 androidx）。**勘误三（计划 F-1b，平台证据链）**：embedder 经 `postWebMessage` 投递的消息其 `event.origin` **恒为空串**——Chromium `AwContents.postMessageToMainFrame` 硬编码 sourceOrigin=null → blink `MessageEvent::originForBindings()` 返回 "" → 平台测试 `PostMessageTest` 断言 `SOURCE_ORIGIN=""`。因此 **JS 侧不做 origin 等值校验，模拟测试禁止伪造 origin 断言**。信任依据改用三层：

1. **平台 targetOrigin 强制**：非该 origin 的 frame 收不到 port2（native 侧 `postWebMessage` 的 targetOrigin 参数由平台强制）。
2. **port 能力 confinement**：port 引用不暴露到 window 全局（单测锁定）。如实边界：同页监听者在事件层面可见握手字符串；confinement 的实际来源是 port 引用不暴露+页面仅第一方资产——页内脚本若能捕获 port ≈ 资产被篡改 = 应用已被攻破，与既有威胁边界一致，不新增攻击面。
3. **ack 前零能力**：握手捕获并回发 ack 前，vault 恒 unavailable，native 不受理任何操作。

握手时序：native `onPageFinished` → `createWebMessageChannel()` → `[port1, port2]`；port1 设回调并 `postWebMessage(handshake, Uri.parse("http://127.0.0.1:18090"))`；JS 校验 `event.data === "opencode-mobile-vault-handshake"` 且 `event.ports.length === 1`（不做 origin 校验，证据链如上）→ port 捕获入闭包（不挂全局）→ 立即回发 `{op:"ack"}` → **首次捕获成功后忽略后续握手**。native 未收 ack 的每次重试**必须重建通道**（已转移的 port2 不可重投——IllegalStateException；重建前 `close()` 旧 port1）；有界重试 5×500ms。**ack 生命周期**：ack 标志随页面导航重置（每次 `onPageFinished` 开启新一轮握手）；重试耗尽仅将**从未 ack** 的会话降级 unavailable——已 ack 的会话不被误降级（本节与 Kotlin 交付物注释双写）。消息面：双向 JSON 字符串、requestId 关联；native 入站形状+操作白名单校验（无 eval/无动态路由）；跨桥零二进制。

### 可选记住真值表 v3（M-009，连接对话框）

勾选框仅 `method=password` 渲染（link 流不渲染，行 6/11）；vault 不可用时禁用+说明（unavailable 显式呈现）。add 流的 prior 语义：保存时按规范化 URL 从 server.list 查既有 http 条目作为 ref 语义 prior（**password 与 link/redeem 流都套用，不区分 method**；否则 M-006 的 original 在 add 流为 undefined，覆盖后 ref 孤儿）。prior 仅承载 ref 字段。初始勾选值 = `Boolean(refOriginal?.http.credentialRef)`。

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

早退强制条件：勾选框已渲染 && `remember !== Boolean(refOriginalRef)` 时**不早退**（覆盖「仅切换记住」与「预填后取消勾选」两种纯 ref 变更）。put 失败 → 不关对话框 + 行内报错，绝不静默。UX 附注：healthPreview（连接前探测）不解析、不读 vault；权威检查在保存时。

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
| T1 | idle \| failed \| incompatible | connect | — | 解析 credentialRef（vault resolver，产出内存凭据值）→ transport.open(target, credential) | connecting | failed/incompatible 保持可操作：重新发起即新尝试；source=idle。措辞修正（F-7，issue #4 评审）：动作列原写 `transport.open(target, credentialRef)` 易误读为把非机密引用直接交给传输层——实际驱动先经 resolver 解析为内存值再传入 transport（`packages/mobile-hosts/src/runtime.ts` attemptOpen），引用本身从不出驱动层 |
| T2 | connecting | hostKeyPending | — | 指纹存内存（不持久化） | hostKeyUnverified | 弹 host-key 确认（host-key-prompt） |
| T3 | hostKeyUnverified | hostKeyConfirm | — | transport.open（携带已确认指纹） | connecting | 仅 stub 阶段不可达（stub 恒拒绝）；真实校验归 #6 |
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

### host-key 确认（已实现（未验证）的立桩，真实校验 BLOCKED #6）

- 状态机显式状态 `hostKeyUnverified` 已实现；确认 UI 组件（HostKeyPrompt）已立桩并随包导出，但**挂载点未建**（host-manager 尚未在行内渲染该提示）——stub 阶段本组件不可达；挂载与真实指纹数据源一并归 issue #6。指纹只存内存。
- `HostKeyVerifier` 端口本期为 stub：**对任何主机恒返回"拒绝"**（fail-closed），不存在"跳过校验"路径；测试断言 stub 永不放行。
- 真实指纹校验数据源与确认流归 issue #6，**BLOCKED**；真机核验归 G14。

## 凭据流（已实现（未验证））

1. 用户输入密码 → 仅内存。
2. 可选记住（issue #4）：保存时勾选「记住密码」且 vault available → 经桥 put 加密落盘（信封 v1，Keystore 密钥加密），连接记录持有 `credentialRef`；不勾选 → 密码仅内存（M-002 语义不变）。
3. `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 拼接 `Basic ${btoa("opencode:<password>")}` 进入 `Authorization` 请求头。
4. 持久化编码路径（`persistence.ts` encode，`MemoryOnlyPassword` codec）恒将 password 重写为 `undefined`；解码容忍历史遗留值，缺失密码进入既有认证失败路径。M-010 hydration 注入的密码只写 solid store（内存），同一 encode 路径保证不落盘。
5. 交付态验证：构建产物中检索 `mobile(M-002)` 标记命中（见 [docs/build-and-verify.md](../../build-and-verify.md) V-cred）；localStorage 负例的真机复核归 G9；vault 落盘负例（index.json 无值、密文文件不进备份）归 C3/C4。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：直连建立过程反馈待真机定义（上游实现承载）；SSH：connecting/reconnecting 呈现已实现（未验证），真机归 G14 |
| 空态 | 已确认未实现：无任何服务记录时的引导形态待真机核对 |
| 错误态 | 已确认未实现（目标行为已存在）：认证失败、证书错误、CORS 失败、断网的反馈与恢复归 G4/G5/G11；缺失密码进入上游既有认证失败路径；SSH：failed/offline 呈现已实现（未验证），真机归 G14 |
| 边界态 | 已确认未实现：不兼容 server——直连不展示（上游 web 原生行为，补齐归 #5）；SSH 由状态机判定（规则见上），真机归 G14；host-key 确认立桩，真实流归 #6（BLOCKED）；权限边界不适用（无角色体系） |
| 过程态 | 已实现（未验证）：host-key 确认（host-key-prompt）是唯一多步交互，stub 阶段不可达（BLOCKED #6） |
| 恢复口径 | memory-only 基线 + 可选记住（issue #4）：未记住的密码刷新/重启需重输；已记住的凭据经 vault 解析自动恢复（unavailable/corrupt 时按上方失效矩阵呈现，无明文回退）；SSH 凭据引用重启后经 vault-backed resolver 解析（默认 UnavailableVault fail-closed）；Keystore 持久化已实现（未验证），真机归 C1–C5 |

## 文案口径

连接相关文案由上游 i18n 体系（`packages/app/src/runtime/i18n`）承载；SSH 主机管理与 host-key 确认文案由 `packages/mobile-hosts` 自含 EN/ZH 字典承载（已实现（未验证），`src/i18n.ts`）；凭据管理器与 vault 状态文案同由该字典承载（issue #4 新键，EN/ZH 成对）。M-009 的「记住密码」勾选框文案随上游字典补丁登记（EN/ZH 同步，含行 2/12「需要密码才能记住」措辞）。memory-only 行为的 App 内提示随 vault 交付为「可选记住」口径（见 [../interaction.md](../interaction.md) notice 修订）。
