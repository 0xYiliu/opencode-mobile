# 设计文档体系

本目录是 OpenCode Mobile 前端（Android WebView 壳 + 上游 OpenCode app 静态构建）的设计契约，按三视角（架构/交互/视觉）加四类横切关注点组织。设计文档与实现走双向变更协议：实现改动核对文档覆盖，文档改动核对实现符合性。

## 文档索引

| 文档 | 覆盖范围 |
| --- | --- |
| [architecture.md](architecture.md) | 架构视角：设计单元清单、结构图（含 mobile-hosts 层与 vault 桥）、信任边界（credentialRef/vault 三层信任+event.origin 平台证据/host-key stub/身份键）、CORS 差异、补丁剥离面与运行时接缝（M-001…M-010）、流转矩阵 |
| [interaction.md](interaction.md) | 交互基线、G1–G15 与 C1–C5 设备门禁枚举、主机管理交互（issue #3）与凭据绑定/凭据管理器（issue #4）、失败路径处置协议、凭据 notice（修订：可选记住） |
| [visual.md](visual.md) | 视觉视角：令牌与主题来源、viewport 口径、窄屏/深色、图像纪律、mobile-hosts 组件复用上游令牌（含 issue #4 组件） |
| [units/shell-startup.md](units/shell-startup.md) | 单元：Android 壳启动与资产服务（本轮已实现，未验证） |
| [units/connection.md](units/connection.md) | 单元：服务连接与凭据（已确认未实现，字段契约已实现；credentialRef/状态机/host-key 立桩已实现（未验证）：issue #3；vault 契约/真值表 v3/失效矩阵已实现（未验证）：issue #4） |
| [units/server-list.md](units/server-list.md) | 单元：服务器列表与项目选择（已确认未实现，字段契约已实现；SSH 主机注册表与 host-manager/host-dialog 已实现（未验证）：issue #3；credential-manager 已实现（未验证）：issue #4） |

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

本轮的关键事实基线：Android 壳代码已实现（未编译验证，无 Android SDK，无 APK）；上游前端闭包已引入 `vendor/upstream`（pin `b4525d79bf`），web 构建本机可复现；主机注册表、身份键与连接状态机已随 issue #3 实现（未验证；第一方包 `packages/mobile-hosts/` 与 vendor 补丁 M-004…M-008）；凭据保险库（vault 端口/信封 v1/桥协议/Keystore 落盘/可选记住交互）已随 issue #4 实现（未验证；vendor 补丁 M-009/M-010 与 M-007 修订，桥 bring-up 与设备门禁 C1–C5 BLOCKED，见 [units/connection.md](units/connection.md) 与 [units/server-list.md](units/server-list.md)）；许可审计 BLOCKED（12 项待用户决策）。全部证据见 [docs/build-and-verify.md](../build-and-verify.md)。

## 四横切适用性总表

每项横切关注点对本项目先做适用性判定（不适用也显式声明），再给当前覆盖状态。

| 横切 | 适用性判定 | 依据与当前覆盖 |
| --- | --- | --- |
| 响应式 | 适用 | 目标载体是手机 WebView，窄屏是主场景。上游 app 自带移动端 viewport（`viewport-fit=cover`、`interactive-widget=resizes-content`，见 [visual.md](visual.md)）；断点降级由上游实现承载，真机渲染待验证（G1）。本轮不新增自定义布局。 |
| 无障碍 | 适用（受上游承载） | 复用上游 DOM 结构与交互语义，本轮不改写；上游含 axe-core（无障碍审计工具依赖）说明上游自身有相关纪律。本轮门禁 G1–G12 未含独立无障碍专项，真机读屏/焦点核验未安排，作为已接受限制记录；后续 issue 可增补。 |
| 数据契约 | 适用（部分已实现） | 服务器记录字段契约（url / password / authToken / displayName / label）随闭包引入且 M-002 保证 password 不落持久化后端，见 [units/connection.md](units/connection.md)；credentialRef 为非机密引用契约、SSH 主机注册表白名单载荷（id/name/target/credentialRef/时间戳，凭据形字段拒收）已实现（未验证）（issue #3，`packages/mobile-hosts/`）；vault 条目契约（信封 v1 密文+无值元数据索引，`packages/mobile-hosts/src/vault/` + Android `vault/`）已实现（未验证）（issue #4）。SSH 隧道契约（servicePort 白名单字段、known_hosts 行格式、指纹 `SHA256:base64_nopad`、SshErrorCode 十四码、私钥信封 v1）已随 issue #6 实现（未验证，见 [units/connection.md](units/connection.md) 与 [../decisions/0003-ssh-transport.md](../decisions/0003-ssh-transport.md)）。会话/项目数据契约全部走上游生成代码（packages/client），本轮不另行定义。无 mock 数据：本阶段无任何 fixture/fake 事件替代真实服务（issue #2 验收红线）。 |
| 状态恢复 | 适用（壳层未实现） | Android 壳层的实例状态恢复已确认未实现（`MainActivity.onSaveInstanceState` TODO，见 [units/shell-startup.md](units/shell-startup.md)）；WebView 内的上游恢复行为待真机核验（G9/G12）。凭据恢复口径由「可选记住」notice 决定（issue #4 修订）：未记住的密码刷新/重启需重新输入；已记住的凭据经 vault 解析自动恢复（unavailable/corrupt 时按失效矩阵呈现，无明文回退）；SSH 主机注册表恢复为白名单载荷且连接状态归 idle（已实现（未验证）：issue #3）。见 [interaction.md](interaction.md)。 |

## 机械检查口径

- 文档内相对链接以 `test -f` 核对，随每次文档变更执行（结果记录在 [docs/build-and-verify.md](../build-and-verify.md)）。
- 设计单元清单（architecture.md）与本目录单元文档一一对应；未产出文档的单元在清单中保留 TODO 行，不允许沉默缺失。
- 令牌纪律由上游 `@opencode/ui` 体系承载，本轮不新增令牌（见 [visual.md](visual.md)），故不设本地裸值 grep 范围。
- 最小核对记录随变更交付于 [docs/build-and-verify.md](../build-and-verify.md)。
