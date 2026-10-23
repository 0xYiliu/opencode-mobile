# 设计文档体系

本目录是 OpenCode Mobile 前端（Android WebView 壳 + 上游 OpenCode app 静态构建）的设计契约，按三视角（架构/交互/视觉）加四类横切关注点组织。设计文档与实现走双向变更协议：实现改动核对文档覆盖，文档改动核对实现符合性。

## 文档索引

| 文档 | 覆盖范围 |
| --- | --- |
| [architecture.md](architecture.md) | 架构视角：设计单元清单、结构图（含 mobile-hosts 层）、信任边界（credentialRef/host-key stub/身份键）、CORS 差异、补丁剥离面与运行时接缝（M-001…M-008）、流转矩阵 |
| [interaction.md](interaction.md) | 交互基线、G1–G15 设备门禁枚举、主机管理交互（计划中：issue #3）、失败路径处置协议、memory-only notice |
| [visual.md](visual.md) | 视觉视角：令牌与主题来源、viewport 口径、窄屏/深色、图像纪律、mobile-hosts 组件复用上游令牌 |
| [units/shell-startup.md](units/shell-startup.md) | 单元：Android 壳启动与资产服务（本轮已实现，未验证） |
| [units/connection.md](units/connection.md) | 单元：服务连接与凭据（已确认未实现，字段契约已实现；credentialRef/状态机/host-key 立桩计划中：issue #3） |
| [units/server-list.md](units/server-list.md) | 单元：服务器列表与项目选择（已确认未实现，字段契约已实现；SSH 主机注册表与 host-manager/host-dialog 计划中：issue #3） |

未产出单元文档的单元见 [architecture.md](architecture.md) 设计单元清单中的 TODO 行，均为未开始。

## 事实状态图例

设计条目按以下五种状态标注，禁止愿景与事实混写：

| 状态 | 含义 |
| --- | --- |
| 已实现 | 与当前实现一致，可指向实现位置 |
| 已实现（未验证） | 代码已实现且通过本机静态/构建级验证，但无设备运行证据 |
| 已确认未实现 | 已获确认的规划目标；显式标注状态与交付归属，不与已实现条目混排 |
| 待验证 | 逻辑上成立但依赖真机/授权远程服务才能核验；本环境标 BLOCKED |
| 未开始 | 规划中的设计单元，尚无设计产出 |

本轮的关键事实基线：Android 壳代码已实现（未编译验证，无 Android SDK，无 APK）；上游前端闭包已引入 `vendor/upstream`（pin `b4525d79bf`），web 构建本机可复现；主机注册表、身份键与连接状态机的契约为 issue #3 交付（实现前标「计划中」，实现后标「已实现（未验证）」，见 [units/connection.md](units/connection.md) 与 [units/server-list.md](units/server-list.md)）；许可审计 BLOCKED（12 项待用户决策）。全部证据见 [docs/build-and-verify.md](../build-and-verify.md)。

## 四横切适用性总表

每项横切关注点对本项目先做适用性判定（不适用也显式声明），再给当前覆盖状态。

| 横切 | 适用性判定 | 依据与当前覆盖 |
| --- | --- | --- |
| 响应式 | 适用 | 目标载体是手机 WebView，窄屏是主场景。上游 app 自带移动端 viewport（`viewport-fit=cover`、`interactive-widget=resizes-content`，见 [visual.md](visual.md)）；断点降级由上游实现承载，真机渲染待验证（G1）。本轮不新增自定义布局。 |
| 无障碍 | 适用（受上游承载） | 复用上游 DOM 结构与交互语义，本轮不改写；上游含 axe-core（无障碍审计工具依赖）说明上游自身有相关纪律。本轮门禁 G1–G12 未含独立无障碍专项，真机读屏/焦点核验未安排，作为已接受限制记录；后续 issue 可增补。 |
| 数据契约 | 适用（部分已实现） | 服务器记录字段契约（url / password / authToken / displayName / label）随闭包引入且 M-002 保证 password 不落持久化后端，见 [units/connection.md](units/connection.md)；credentialRef 为非机密引用契约、SSH 主机注册表白名单载荷（id/name/target/credentialRef/时间戳，凭据形字段拒收）计划中（issue #3）。SSH 连接方式的隧道契约未定义（归 issue #6）。会话/项目数据契约全部走上游生成代码（packages/client），本轮不另行定义。无 mock 数据：本阶段无任何 fixture/fake 事件替代真实服务（issue #2 验收红线）。 |
| 状态恢复 | 适用（壳层未实现） | Android 壳层的实例状态恢复已确认未实现（`MainActivity.onSaveInstanceState` TODO，见 [units/shell-startup.md](units/shell-startup.md)）；WebView 内的上游恢复行为待真机核验（G9/G12）。凭据恢复口径由 memory-only notice 决定：刷新/重启需重新输入密码；SSH 主机注册表恢复为白名单载荷且连接状态归 idle（计划中：issue #3）；SSH 凭据引用重启后需重新解析（归 issue #4）。见 [interaction.md](interaction.md)。 |

## 机械检查口径

- 文档内相对链接以 `test -f` 核对，随每次文档变更执行（结果记录在 [docs/build-and-verify.md](../build-and-verify.md)）。
- 设计单元清单（architecture.md）与本目录单元文档一一对应；未产出文档的单元在清单中保留 TODO 行，不允许沉默缺失。
- 令牌纪律由上游 `@opencode/ui` 体系承载，本轮不新增令牌（见 [visual.md](visual.md)），故不设本地裸值 grep 范围。
- 最小核对记录随变更交付于 [docs/build-and-verify.md](../build-and-verify.md)。
