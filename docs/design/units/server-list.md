# 单元：server-list（服务器列表与项目选择）

状态：**已确认未实现（字段契约已实现；issue #3 扩展已实现（未验证））**。作为产品能力（在设备上查看服务器列表、选择远程项目并进入会话）尚未交付，依赖 connection 单元成立与 G1–G3 门禁；已实现部分：随闭包引入的持久化字段契约与上游 UI 代码，加上 issue #3 的 SSH 主机注册表（`packages/mobile-hosts/src/registry.ts` + `storage.ts`）与管理界面（host-manager / host-dialog，M-008 挂载），全部未经设备运行验证（真机归 G13/G15）。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002 预应用后）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `list` | StoredServer[] | 服务器记录列表（见 [connection.md](connection.md) 字段契约） | 已实现（未验证） |
| `hidden` | Record<key, Boolean> | 每服务器的隐藏标记 | 已实现（未验证） |
| `projects` | Record<key, { worktree, expanded }[]> | 每服务器的项目（worktree）树与展开态 | 已实现（未验证） |
| `lastProject` | Record<key, …> | 每服务器最后选中的项目 | 已实现（未验证） |

password 字段经同一 M-002 encode 剥离，列表持久化同样收不到凭据。

## SSH 主机注册表契约（已实现（未验证）：issue #3）

存储：第一方 `packages/mobile-hosts`，键 `opencode-mobile.hosts.v1`（WebView localStorage，经 `StoragePort` 适配；载荷白名单保证无凭据，不含 Android 专属 API）。**持久化载荷白名单（仅以下字段，多数字段拒收）**：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `id` | String（uuid v4） | 主机身份，创建即定、永不改 |
| `name` | String（唯一，1–100 字符） | 展示名，重名校验拒绝 |
| `target` | String（SSH 目标，`[user@]host[:port]` 形，≤500 字符） | 连接目标；格式校验失败拒收 |
| `credentialRef` | optional String（`mobile-credential:<id>` 形，≤500 字符） | 非机密引用，不是凭据；解析归 issue #4 |
| `createdAt` / `updatedAt` | String（ISO 时间戳） | 审计元数据；更新不改 id/createdAt |

- 凭据形字段（password/secret/token/privateKey 等）在载荷校验层拒收：**测试断言**持久化往返与重启恢复后的记录不含任何 password 形字段。
- 存储降级不静默：注入存储不可用（或拒绝写入）时注册表落到内存后备，`storageVolatile` 标志经 host-manager 以行内提示明示（i18n 键 `hostManager.volatileStorage`，EN/ZH）；单测覆盖降级路径。
- 白名单外字段拒收（未知键剥离或拒绝，测试锁定）。

## 身份键与隔离（已实现（未验证）：issue #3）

| 连接方式 | 身份键 | 端口变化行为 |
| --- | --- | --- |
| 直连 http | URL 本身（上游原生 `Key.make(url)`） | 端口变化 = 新身份（上游原生语义，编辑地址即新记录；本仓库不改） |
| SSH | `mobile-ssh:<uuid4>`（extension 键 `${extension}:${id}`） | 隧道端口重解析（reconnect）→ 上游 health 重新探测（checking）→ **身份/scope/会话/设置键全部不变**（单测锁定） |

- 隔离：上游 `ServerScope` 按 server 键控 projects/lastProject/hidden/recentlyClosed 与会话状态键——同名路径/项目/会话/设置在不同主机间天然隔离，不因重名混淆（键隔离随上游机制成立；设备级行为归 G13）。
- 同名校验：上游对 displayName 无唯一性约束（自由命名）；SSH 主机名由我方注册表强制唯一（重名拒绝，测试锁定）。
- 多 host 一窗：SSH 主机经 `props.servers` 注入上游 `ServersProvider`（extension 型；provided 键 `canRemove=false`，删除控制权在我方管理界面）；直连服务走上游原生注册表。注入值必须是 solid store 派生的响应式访问器（`ServersProvider` 在 `createMemo` 内读取；普通数组快照不会触发重渲染——测试锁定变更传播）。

## 管理界面挂载点（已实现（未验证）：issue #3）

| 组件 | 归属单元文档 | 挂载点 | 职责 |
| --- | --- | --- | --- |
| host-manager | 本文档 | 设置 → servers 标签页（M-008 挂载，lazy import） | SSH 主机列表：展示名称/target/状态徽标，入口到 host-dialog、删除、重连；空态引导新增 |
| host-dialog | 本文档 | host-manager 内（对话框） | SSH 主机新增/编辑表单：name（唯一）、target（格式校验）、credentialRef（引用标识，非机密）；保存失败（含健康检查不过）**保留原配置** |
| host-key-prompt | [connection.md](connection.md) | 连接状态机 hostKeyUnverified 态 | 指纹确认（stub fail-closed，BLOCKED #6） |

- 设计单元归属说明：host-manager/host-dialog 并入本单元（它们是服务器列表的管理面），host-key-prompt 并入 connection 单元（它是连接确认交互）；architecture.md 设计单元清单不单列新行。
- 诚实边界：
  - 多 host 一窗、设置页/home 内 extension 行渲染待真机核对，归 G13/G15。
  - 已知展示缺口：上游多 server 布局下（`multiple()`），设置导航以 per-server 条目取代 "servers" 标签页，此时 host-manager 入口不可达（M-008 保持最小挂载；补齐导航入口归后续 issue，先以 G13 真机核对为准）。
  - 直连服务记录仍由上游原生注册表承载（含 M-005/M-006 的 credentialRef 透传），本单元的注册表只管理 SSH 主机。

## 结构与流转

- 上游 UI 代码随闭包携带（`packages/app/src/servers/`），但未在设备上运行，流转行为待验证；本仓库未为其建立单独交互契约。
- 流转：server-list → 选择服务器/项目 → 会话列表（目标单元未开始，见 [../architecture.md](../architecture.md) 流转矩阵）；录入新服务 → connection 单元；设置 servers 标签页 → host-manager（已实现（未验证），M-008）。
- 无 SSH 形态的服务记录（归 issue #6）：注册表记录经 upstream-map 映射为 extension 型连接注入上游列表（已实现（未验证），M-007 经 props.servers 注入）。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：项目树加载的呈现待真机核对（上游实现承载） |
| 空态 | 已确认未实现：空列表形态待真机核对；SSH 主机列表空态引导已实现（未验证），真机归 G13 |
| 错误态 | 已确认未实现：服务器不可达/版本不兼容的列表反馈归 G11/G14（SSH incompatible 由我方状态机判定，见 [connection.md](connection.md)） |
| 边界态 | 已确认未实现：超多服务器/超深项目树未测；SSH：重名/非法 target/超长/重复 id 拒收（单测锁定）；权限边界不适用（无角色体系） |
| 过程态 | 不适用：本单元无多步流程（host-key 确认在 connection 单元） |
| 恢复口径 | 列表与项目树随持久化状态恢复（encode 后不含 password）；SSH 主机注册表随 `opencode-mobile.hosts.v1` 恢复（白名单载荷，无凭据形字段，重启后 connection 状态归 idle）；真机复核归 G9/G12/G15 |

## 文案口径

列表与项目文案由上游 i18n 体系承载；host-manager/host-dialog 文案由 `packages/mobile-hosts` 自含 EN/ZH 字典承载（已实现（未验证），`src/i18n.ts`），不混入上游字典。
