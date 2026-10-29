# 决策记录 0001：排除 WSL，保留原生 Windows 远程支持

本文是范围决策记录，只记录已确认的产品决策，不代表任何对应功能已经实现。

- 状态：已确认的范围决策
- 记录日期：2026-10-24
- 来源议题：[issue #25](https://github.com/0xYiliu/opencode-mobile/issues/25)
- 关联议题：[issue #1](https://github.com/0xYiliu/opencode-mobile/issues/1)、[issue #7](https://github.com/0xYiliu/opencode-mobile/issues/7)、[issue #21](https://github.com/0xYiliu/opencode-mobile/issues/21)

## 背景

OpenCode Desktop 在 Windows 上可能通过 WSL 发行版承载项目与工具链。移动端需要明确是否跟随该 Desktop 形态，以及相关排除是否影响 Windows 远程主机支持。

## 决策

1. Android 客户端不管理、不运行 Windows 宿主上的 WSL 发行版，也不在手机上执行 WSL 命令。
2. 不隐式隐藏该 Desktop 差异：后续界面与文档涉及远程环境形态时按明示差异处理，不把 WSL 场景呈现为已支持。
3. 原生 Windows 远程支持完整保留：远程机器为原生 Windows 时，仍通过既定的 SSH 连接与服务地址直连两种方式访问远程 OpenCode 服务。
4. 本决策不引入跳板机作为 WSL 的替代路径；SSH 能力边界仍按 [docs/project-scope.md](../project-scope.md) 的待验证项处理。

## 范围结论

| 条目 | 结论 |
| --- | --- |
| WSL 发行版管理 | 排除；客户端不发现、不启动、不停止 WSL 发行版 |
| 手机执行 WSL 命令 | 不执行 |
| Desktop 差异呈现 | 明示差异，不隐式隐藏 |
| 原生 Windows 远程主机 | 保留；经既定两种连接方式使用 |
| 跳板机 | 本决策不引入；不影响 [docs/project-scope.md](../project-scope.md) 既有待验证项 |
| 实现状态 | 仅决策记录；对应功能均未实现 |

## 对关联议题的约束

- issue #1 的兼容矩阵需记录本排除项，并同时记录原生 Windows 远程支持保留。
- issue #7 与 issue #21 不得将 WSL 排除等同于排除 Windows 操作系统远程支持。
- issue #25 及其讨论历史保留；如需关闭，仅通过正常用户验收关闭，本记录不自动关闭任何议题。

## 议题验收映射

| issue #25 验收项 | 落实位置 |
| --- | --- |
| 保留 WSL 排除；不在手机运行 WSL 命令；不隐式隐藏该 Desktop 差异 | 本文“决策”第 1、2 条与“范围结论”表 |
| 保留原生 Windows 远程支持（直连/SSH 工作流，无跳板机） | 本文“决策”第 3、4 条与“范围结论”表；README 与 [docs/project-scope.md](../project-scope.md) 已同步 |
| issue #1 矩阵记录该排除；#7/#21 不将其等同于排除 Windows 操作系统 | 本文“对关联议题的约束”；本仓库范围表已记录该排除，issue #1 矩阵待其自身更新时纳入 |
| 保留议题与历史；仅通过正常用户验收关闭 | 本文“对关联议题的约束”第三条 |

## 核对

| 条目 | 结果 |
| --- | --- |
| 与 README、docs/project-scope.md 的一致性 | 已随本记录同步更新 |
| 功能状态 | 未实现；本文不声称任何功能可用 |
| 敏感信息 | 不含凭据、令牌或真实连接配置 |
