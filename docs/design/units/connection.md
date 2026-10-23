# 单元：connection（服务连接与凭据）

状态：**已确认未实现（字段契约已实现）**。作为产品能力（用户在设备上完成一次到远程服务的认证连接）尚未交付，依赖 G3（CORS，高风险）、G4（TLS 拒绝）、G5（cleartext 拒绝）、G6（SSE）等门禁通过；已实现的部分仅限随闭包引入的字段契约与凭据纪律，见下。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002 预应用）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `url` | String | 远程 OpenCode HTTP API 地址（含端口/协议） | 已实现（未验证） |
| `password` | optional String | 服务密码，仅存内存 | 已实现（未验证）；encode 路径恒剥离（M-002），任何持久化后端收不到 |
| `type` | `"http"` | 连接类型字面量 | 已实现（未验证） |
| `authToken` | optional Boolean | 布尔标志（是否携带 token），非机密 | 已实现（未验证） |
| `displayName` / `label` | optional String | 展示元数据 | 已实现（未验证） |

不含 SSH 字段：SSH 连接方式的契约归 issue #6，本文不预设。

## 凭据流（已实现（未验证））

1. 用户输入密码 → 仅内存。
2. `packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 拼接 `Basic ${btoa("opencode:<password>")}` 进入 `Authorization` 请求头。
3. 持久化编码路径（`persistence.ts` encode，`MemoryOnlyPassword` codec）恒将 password 重写为 `undefined`；解码容忍历史遗留值，缺失密码进入既有认证失败路径。
4. 交付态验证：构建产物中检索 `mobile(M-002)` 标记命中（见 [docs/build-and-verify.md](../../build-and-verify.md) V-cred）；localStorage 负例的真机复核归 G9。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：连接建立过程的用户可见反馈待真机定义（上游实现承载） |
| 空态 | 已确认未实现：无任何服务记录时的引导形态待真机核对 |
| 错误态 | 已确认未实现（目标行为已存在）：认证失败、证书错误、CORS 失败、断网的反馈与恢复归 G4/G5/G11；缺失密码进入上游既有认证失败路径 |
| 边界态 | 已确认未实现：不兼容 server（上游含 incompatible-server-panel UI）归 G11；权限边界不适用（无角色体系） |
| 过程态 | 已确认未实现：无多步流程 |
| 恢复口径 | memory-only：刷新/重启需重新输入密码，配对重连需重新认证（见 [../interaction.md](../interaction.md) notice）；Keystore 持久化归 issue #4 |

## 文案口径

连接相关文案由上游 i18n 体系（`packages/app/src/runtime/i18n`）承载；memory-only 行为目前无 App 内提示（上游不自带），提示文案为后续事项，当前以 [../interaction.md](../interaction.md) notice 为文档口径。
