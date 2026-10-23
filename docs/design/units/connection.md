# 单元：connection（服务连接与凭据）

状态：**已确认未实现（字段契约已实现；issue #3 扩展已实现（未验证））**。作为产品能力（用户在设备上完成一次到远程服务的认证连接）尚未交付，依赖 G3（CORS，高风险）、G4（TLS 拒绝）、G5（cleartext 拒绝）、G6（SSE）等门禁通过；已实现的部分：随闭包引入的字段契约与凭据纪律，加上 issue #3 的 credentialRef 契约（M-005/M-006）、SSH 连接状态机与 host-key 确认立桩（host-key-prompt，stub fail-closed），实现位置 `packages/mobile-hosts/`，全部未经设备运行验证。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002 预应用）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `url` | String | 远程 OpenCode HTTP API 地址（含端口/协议） | 已实现（未验证） |
| `password` | optional String | 服务密码，仅存内存 | 已实现（未验证）；encode 路径恒剥离（M-002），任何持久化后端收不到 |
| `type` | `"http"` | 连接类型字面量 | 已实现（未验证） |
| `authToken` | optional Boolean | 布尔标志（是否携带 token），非机密 | 已实现（未验证） |
| `displayName` / `label` | optional String | 展示元数据 | 已实现（未验证） |

## credentialRef 契约（计划中：issue #3）

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `http.credentialRef` | optional String（位于 `ServerHttpBase` 内，即 `http.credentialRef` 层级） | 指向凭据条目的**非机密引用**（形如 `mobile-credential:<id>`），不是凭据本身 | 已实现（未验证）（M-005 字段 + M-006 对话框透传）；探针 `scripts/verify-credential-ref.ts` PASS |

- 直连：M-005 在持久化 schema 增字段（encode 剥 password 的行为不变）；M-006 保证连接对话框 add/replace 往返保留引用，否则编辑一次就丢引用。
- SSH：主机记录原生持有 `credentialRef`（载荷白名单字段，见 [server-list.md](server-list.md)）。
- 引用解析：`CredentialResolver` 端口本期为 NullResolver（恒返回 undefined）；解析结果只注入内存连接对象，永不回写持久化。真实解析（Keystore）归 issue #4，**BLOCKED**。
- 用户可见后果：重启后直连仍需重输密码（M-002），SSH 主机需重新解析凭据引用（本期引用无目标，SSH 连接真实建立归 #6）；引用本身会随记录保留。

## 连接状态机（已实现（未验证）：issue #3，SSH 主机）

SSH 主机连接由第一方 `packages/mobile-hosts` 状态机驱动，映射到上游 `ServerState`（`packages/gui-extensions/src/sdk/registries.ts`：stopped/starting/auth/ready/failed/incompatible）。直连服务不经过该状态机（上游原生健康轮询 10s + unauthorized 重认证路径承载）。

### T1–T14 转移表（六元组：来源态，事件，守卫，动作，目标态，备注）

| # | 来源态 | 事件 | 守卫 | 动作 | 目标态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | idle \| failed \| incompatible | connect | — | transport.open(target, credentialRef) | connecting | failed/incompatible 保持可操作：重新发起即新尝试；source=idle |
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

- 状态机显式状态 `hostKeyUnverified` + 确认 UI（host-key-prompt）均已立桩；指纹只存内存。
- `HostKeyVerifier` 端口本期为 stub：**对任何主机恒返回"拒绝"**（fail-closed），不存在"跳过校验"路径；测试断言 stub 永不放行。
- 真实指纹校验数据源与确认流归 issue #6，**BLOCKED**；真机核验归 G14。

## 凭据流（已实现（未验证））

1. 用户输入密码 → 仅内存。
2. `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 拼接 `Basic ${btoa("opencode:<password>")}` 进入 `Authorization` 请求头。
3. 持久化编码路径（`persistence.ts` encode，`MemoryOnlyPassword` codec）恒将 password 重写为 `undefined`；解码容忍历史遗留值，缺失密码进入既有认证失败路径。
4. 交付态验证：构建产物中检索 `mobile(M-002)` 标记命中（见 [docs/build-and-verify.md](../../build-and-verify.md) V-cred）；localStorage 负例的真机复核归 G9。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：直连建立过程反馈待真机定义（上游实现承载）；SSH：connecting/reconnecting 呈现已实现（未验证），真机归 G14 |
| 空态 | 已确认未实现：无任何服务记录时的引导形态待真机核对 |
| 错误态 | 已确认未实现（目标行为已存在）：认证失败、证书错误、CORS 失败、断网的反馈与恢复归 G4/G5/G11；缺失密码进入上游既有认证失败路径；SSH：failed/offline 呈现已实现（未验证），真机归 G14 |
| 边界态 | 已确认未实现：不兼容 server——直连不展示（上游 web 原生行为，补齐归 #5）；SSH 由状态机判定（规则见上），真机归 G14；host-key 确认立桩，真实流归 #6（BLOCKED）；权限边界不适用（无角色体系） |
| 过程态 | 已实现（未验证）：host-key 确认（host-key-prompt）是唯一多步交互，stub 阶段不可达（BLOCKED #6） |
| 恢复口径 | memory-only：刷新/重启需重新输入密码，配对重连需重新认证（见 [../interaction.md](../interaction.md) notice）；SSH 凭据引用重启后需重新解析（解析端口 NullResolver，真实解析归 #4）；Keystore 持久化归 issue #4 |

## 文案口径

连接相关文案由上游 i18n 体系（`packages/app/src/runtime/i18n`）承载；SSH 主机管理与 host-key 确认文案由 `packages/mobile-hosts` 自含 EN/ZH 字典承载（已实现（未验证），`src/i18n.ts`）；memory-only 行为目前无 App 内提示（上游不自带），提示文案为后续事项，当前以 [../interaction.md](../interaction.md) notice 为文档口径。
