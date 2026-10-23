# 单元：server-list（服务器列表与项目选择）

状态：**已确认未实现（字段契约已实现）**。作为产品能力（在设备上查看服务器列表、选择远程项目并进入会话）尚未交付，依赖 connection 单元成立与 G1–G3 门禁；已实现部分仅限随闭包引入的持久化字段契约与上游 UI 代码。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002 预应用后）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `list` | StoredServer[] | 服务器记录列表（见 [connection.md](connection.md) 字段契约） | 已实现（未验证） |
| `hidden` | Record<key, Boolean> | 每服务器的隐藏标记 | 已实现（未验证） |
| `projects` | Record<key, { worktree, expanded }[]> | 每服务器的项目（worktree）树与展开态 | 已实现（未验证） |
| `lastProject` | Record<key, …> | 每服务器最后选中的项目 | 已实现（未验证） |

password 字段经同一 M-002 encode 剥离，列表持久化同样收不到凭据。

## 结构与流转

- 上游 UI 代码随闭包携带（`packages/app/src/servers/`），但未在设备上运行，流转行为待验证；本仓库未为其建立单独交互契约。
- 流转：server-list → 选择服务器/项目 → 会话列表（目标单元未开始，见 [../architecture.md](../architecture.md) 流转矩阵）；录入新服务 → connection 单元。
- 无 SSH 形态的服务记录（归 issue #6）。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：项目树加载的呈现待真机核对（上游实现承载） |
| 空态 | 已确认未实现：空列表形态待真机核对 |
| 错误态 | 已确认未实现：服务器不可达/版本不兼容的列表反馈归 G11 |
| 边界态 | 已确认未实现：超多服务器/超深项目树未测；权限边界不适用（无角色体系） |
| 过程态 | 不适用：本单元无多步流程 |
| 恢复口径 | 列表与项目树随持久化状态恢复（encode 后不含 password）；真机复核归 G9/G12 |

## 文案口径

由上游 i18n 体系承载，本单元不另立口径。
