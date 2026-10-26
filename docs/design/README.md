# 设计文档体系

本目录是 OpenCode Mobile 前端（Android WebView 壳 + 上游 OpenCode app 静态构建）的设计契约，按三视角（架构/交互/视觉）加四类横切关注点组织。设计文档与实现走双向变更协议：实现改动核对文档覆盖，文档改动核对实现符合性。

## 文档索引

| 文档 | 覆盖范围 |
| --- | --- |
| [architecture.md](architecture.md) | 架构视角：设计单元清单、结构图（含 mobile-hosts 层与 vault 桥）、信任边界（credentialRef/vault 三层信任+event.origin 平台证据/host-key stub/身份键）、CORS 差异、补丁剥离面与运行时接缝（M-001…M-010）、流转矩阵 |
| [interaction.md](interaction.md) | 交互基线、G1–G28 与 C1–C5 设备门禁枚举、主机管理交互（issue #3）与凭据绑定/凭据管理器（issue #4）、失败路径处置协议（含 projects-sessions 变更失败路径（issue #8）、session-workbench 失败路径（issue #9）、permission-requests 失败路径（issue #10）、remote-files 失败路径（issue #11）、diff/vcs 失败路径（issue #12）、终端面失败路径（issue #13）、provider/model 面失败路径（issue #14）与 agent 能力面失败路径（issue #15）、附件/文件交互面失败路径（issue #16）、browser 面失败路径（issue #17））、凭据 notice（修订：可选记住） |
| [visual.md](visual.md) | 视觉视角：令牌与主题来源、viewport 口径、窄屏/深色、图像纪律、mobile-hosts 组件复用上游令牌（含 issue #4 组件） |
| [units/shell-startup.md](units/shell-startup.md) | 单元：Android 壳启动与资产服务（本轮已实现，未验证） |
| [units/connection.md](units/connection.md) | 单元：服务连接与凭据（已确认未实现，字段契约已实现；credentialRef/状态机/host-key 立桩已实现（未验证）：issue #3；vault 契约/真值表 v3/失效矩阵已实现（未验证）：issue #4；SSH 隧道契约已实现（未验证）：issue #6） |
| [units/service-ops.md](units/service-ops.md) | 单元：服务操作——发现与显式授权的安装/启动/版本处理（已实现（未验证）：issue #7；设备/真 OS G18+三 OS E2E BLOCKED；[决策 0004](../decisions/0004-service-operations.md)） |
| [units/server-list.md](units/server-list.md) | 单元：服务器列表与项目选择（已确认未实现，字段契约已实现；SSH 主机注册表与 host-manager/host-dialog 已实现（未验证）：issue #3；credential-manager 已实现（未验证）：issue #4） |
| [units/projects-sessions.md](units/projects-sessions.md) | 单元：远程项目、工作区与会话生命周期（已实现（未验证）：issue #8——上游复用为主 + M-017 归档接线 + M-018 设置入口/守卫修订；G19 与双路由 lifecycle E2E BLOCKED） |
| [units/session-workbench.md](units/session-workbench.md) | 单元：会话工作台——流式消息、上下文、工具与子任务（已实现（未验证）：issue #9——零新建界面/零补丁，全部上游闭包承载 + 文档固化；取消/断开安全语义与快照恢复口径；G20 与真模型 live E2E BLOCKED） |
| [units/permission-requests.md](units/permission-requests.md) | 单元：权限请求与 Agent 提问（已实现（未验证）：issue #10——零新建界面/零补丁，上游闭包承载 + 文档固化；决策三值/请求身份会话作用域/auto-approve opt-in/断开零副作用；G21 与真模型 live E2E BLOCKED） |
| [units/files.md](units/files.md) | 单元：远程文件浏览、搜索、查看与上下文引用（已实现（未验证）：issue #11——零新建界面/零补丁，上游闭包承载 + 文档固化；path identity/大文件/二进制/编码/陈旧处置/行范围上下文/按 workspace 恢复/安全与边界（read 三重围栏、list 父兄目录上游设计、写面唯一调用点归 #16）；G22 与真模型 live E2E BLOCKED） |
| [units/diff.md](units/diff.md) | 单元：远程 Git 审查与 worktree 操作（已实现（未验证）：issue #12——零新建界面/零补丁，上游闭包承载 + 文档固化；review 三模式（git/branch/turn）与移动 Changes 一级 tab、staged/unstaged 与 git commit 无上游客户端面（能力边界如实）、worktree.remove 五层确认链、undo/redo 可逆对、大 diff/二进制/媒体/renamed/conflict 处置分层；G23（含真实 git 仓库与 supported server OS）与真模型 live E2E BLOCKED） |
| [units/terminal.md](units/terminal.md) | 单元：终端（远程 PTY 会话）（已实现（未验证）：issue #13——零新建界面/零补丁，上游闭包承载 + 文档固化；多 tab 全生命周期/ws 铸票-升级-帧协议/resize 链/退避重连+探活+clone 恢复/三级断开语义（dock 关闭零影响≠tab 关闭显式终止≠进程自退）/「Never send stop on client disconnect」红线双侧取证；移动 IME/外接键盘/触屏选择为登记缺口归 G24；G24 与双路由+三 OS live BLOCKED） |
| [units/providers-models.md](units/providers-models.md) | 单元：远程 Provider 与模型配置（已实现（未验证）：issue #14——零新建界面/零补丁，上游闭包承载 + 文档固化；设置 providers/models 双 tab/连接对话框（方法选择/key 表单/OAuth auto+code 双视图/取消/重试）/账号管理/模型目录与可见性/选择器族 tooltip limits；OAuth 服务端 attempt+轮询无 deep-link 依赖与三重回退；凭据分层（provider 凭据服务端存储不落地设备、`credential.list` 零调用、持久化键穷举恰三非凭据）；模型选择 ServerScope 作用域与偏好全局例外；custom provider 保存为上游 stub；i18n zh 部分覆盖回退 en；no local model/tool execution 负断言；G25 与真实第三方 provider 授权 BLOCKED） |
| [units/agent-capabilities.md](units/agent-capabilities.md) | 单元：远程 Agent 能力与扩展配置（已实现（未验证）：issue #15——零新建界面/零补丁，上游闭包承载 + 文档固化；设置 extensions 三子 tab（MCPs/plugins/skills）+ 项目级四子 tab（含 LSP loadFailed retry）/`DialogSelectMcp`（/mcp）/new-session MCP 控件与 prepare 门/details 移动抽屉 server 面板/composer @skill/@agent//slash 注入；MCP 五态状态机与三处重认证流（`mcp.status.changed` 回推闭环）；**两套 extension 面区分与 GUI 扩展主进程移动零执行四证据链**（renderer 侧 details 抽屉在移动运行的防误述声明；生命周期归 #26）；断开零副作用（connection.ts 五类 API 零命中）；agents/commands/skills 只读呈现、MCP 配置增删改无客户端 UI（能力边界如实）；G26 与真实 MCP 服务测试 BLOCKED） |
| [units/attachments-artifacts.md](units/attachments-artifacts.md) | 单元：附件、工件与 Android 文件交互（已实现（未验证）：issue #16——上游闭包承载附件/进度/取消/芯片/查看器/导出六面 + 首期第一方运行时代码与壳层新面（mobile-hosts `files/` 桥模块 + `FilesBridge`/`ShareFileProvider` Kotlin 面 + M-020/M-021）；files 桥三 op（clipboardImage/SAF save/share）与 `FILES_ERROR_CODES` 六码、`MAX_BRIDGE_BYTES` 32 MiB、name 双层净化（JS+Kotlin）、身份分离（`PathAttachmentPart` vs blob、M-021 仅触 data: 分支）、URI 权限一次性与代际清理、saveFile stub=false 降级语义（M1）；saveFile fail-closed stub=静默取消为有意行为变更；Office 渲染归 #18；G27 十项 BLOCKED） |
| [units/browser.md](units/browser.md) | 单元：远程浏览器工具与工作面板（已实现（未验证）：issue #17——零新建界面/零运行时代码/零补丁，上游闭包承载 + 文档固化；服务端 `browser.*` Code Mode 工具 45 操作 + `experimental.browser` RPC 五方法 + desktop 宿主连接（CDP/partition）与面板 UI（七控件工具栏 enablement 映射/attachment 按会话 tab 键控）；移动形态=时间线呈现链四可见面（工具行/文本输出/preview 回退文件 tab/桌面元素评论消息）+「Open browser」恒禁用命令；**截图=产出事实但时间线消费端静态无渲染链——呈现形态未知，G28② 实态判定**；「手机外部浏览器 ≠ 工作台内浏览器」结构性区分（openExternal 调用面穷举）；安全专节（凭据零回显/main-only 凭据/事件流元数据-only/deny-until-attach/tunnel 语义如实）；**inspect 不入 #11 排除清单**（移动缺席=构建门控，与 `ctx.desktop` open-in-app 家族两套机制）；G28 十项（双端集成前提+桌面宿主）BLOCKED） |

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

本轮的关键事实基线：Android 壳代码已实现（未编译验证，无 Android SDK，无 APK）；上游前端闭包已引入 `vendor/upstream`（pin `b4525d79bf`），web 构建本机可复现；主机注册表、身份键与连接状态机已随 issue #3 实现（未验证；第一方包 `packages/mobile-hosts/` 与 vendor 补丁 M-004…M-008）；凭据保险库（vault 端口/信封 v1/桥协议/Keystore 落盘/可选记住交互）已随 issue #4 实现（未验证；vendor 补丁 M-009/M-010 与 M-007 修订，桥 bring-up 与设备门禁 C1–C5 BLOCKED，见 [units/connection.md](units/connection.md) 与 [units/server-list.md](units/server-list.md)）；许可审计 BLOCKED（12 项待用户决策）；服务操作（发现+显式授权安装/启动，第四桥+白名单命令面+授权流）已随 issue #7 实现（未验证；vendor 补丁 M-016，G18 与三 OS 真 OS E2E BLOCKED）；远程项目/工作区/会话生命周期（浏览选择远端目录、会话 create/open/fork/rename/archive/切换、路径边界与状态保持）已随 issue #8 实现（未验证；vendor 补丁 M-017/M-018，G19 与双路由 lifecycle E2E BLOCKED，见 [units/projects-sessions.md](units/projects-sessions.md)）；会话工作台（流式消息/上下文/工具/子任务、发送与取消安全语义、快照恢复口径）已随 issue #9 实现文档固化（零新建界面/零补丁，上游闭包承载，G20 与真模型 live E2E BLOCKED，见 [units/session-workbench.md](units/session-workbench.md)）；权限请求与 Agent 提问（请求呈现/决策三值/提问向导、duplicate/stale/expired 处置、请求身份会话作用域、auto-approve opt-in、断开零副作用、响应留痕）已随 issue #10 实现文档固化（零新建界面/零补丁，上游闭包承载，G21 与真模型 live E2E BLOCKED，见 [units/permission-requests.md](units/permission-requests.md)）；远程文件浏览、搜索、查看与上下文引用（树/搜索/查看三端点、path identity、大文件/二进制/编码/陈旧处置、行范围上下文引用、按 workspace 恢复、安全与边界固化）已随 issue #11 实现文档固化（零新建界面/零补丁，上游闭包承载，G22 与真模型 live E2E BLOCKED，见 [units/files.md](units/files.md)）；远程 Git 审查与 worktree 操作（review 三模式 diff、移动 Changes 一级 tab、行评论、details 上下文、worktree 迁移/创建/删除/refresh、undo/redo 与 staged revert 自动 commit；staged/unstaged 分解与 git commit 无上游客户端面——能力边界如实登记）已随 issue #12 实现文档固化（零新建界面/零补丁，上游闭包承载，G23 与真模型 live E2E BLOCKED，见 [units/diff.md](units/diff.md)）；远程终端（多 tab 全生命周期、二进制 WebSocket I/O、resize、退避重连+探活+clone 恢复、三级断开语义与「Never send stop on client disconnect」红线；移动 IME/外接键盘/触屏选择为登记缺口）已随 issue #13 实现文档固化（零新建界面/零补丁，上游闭包承载，G24 与双路由+三 OS live BLOCKED，见 [units/terminal.md](units/terminal.md)）；远程 Provider 与模型配置（设置 providers/models 双 tab、连接对话框方法选择/key 表单/OAuth 双视图、账号管理、模型目录与可见性、模型选择 per 服务器+目录作用域；OAuth 服务端 attempt+轮询无 deep-link 依赖；provider 凭据服务端存储不落地设备；custom provider 保存为上游 stub）已随 issue #14 实现文档固化（零新建界面/零补丁，上游闭包承载，G25 与真实第三方 provider 授权 BLOCKED，见 [units/providers-models.md](units/providers-models.md)）；远程 Agent 能力与扩展配置（agents/commands/skills/MCP/插件呈现与运行时启停、MCP 五态状态机与重认证流、断开零副作用、GUI 扩展主进程移动零执行边界与两套 extension 面区分、配置增删改无客户端 UI 的能力边界）已随 issue #15 实现文档固化（零新建界面/零补丁，上游闭包承载，G26 与真实 MCP 服务测试 BLOCKED，见 [units/agent-capabilities.md](units/agent-capabilities.md)）；附件、工件与 Android 文件交互（附件导入/上传进度取消/工件查看器复用 + files 桥三 op 平台能力新面——SAF 导出落点用户可达、分享代际清理、剪贴板图片、name 双层净化与身份分离；saveFile 桥降级=静默取消的有意行为变更；Office 渲染归 #18）已随 issue #16 实现（未验证；首期第一方运行时代码 `packages/mobile-hosts/src/files/` + 壳层 Kotlin 面 + vendor 补丁 M-020/M-021，G27 与真机/真服务核对 BLOCKED，见 [units/attachments-artifacts.md](units/attachments-artifacts.md)）；远程浏览器工具与工作面板（服务端 `browser.*` 45 操作工具 + desktop 宿主连接与面板 UI + 移动时间线呈现链；执行宿主桌面专属、移动零执行面；截图产出事实但时间线消费端无渲染链——呈现形态未知归 G28②；「手机外部浏览器 ≠ 工作台内浏览器」结构性区分；inspect 不入 #11 排除清单）已随 issue #17 实现文档固化（零新建界面/零运行时代码/零补丁，上游闭包承载，G28 与真机/真服务/桌面宿主核对 BLOCKED，见 [units/browser.md](units/browser.md)）。全部证据见 [docs/build-and-verify.md](../build-and-verify.md)。

## 四横切适用性总表

每项横切关注点对本项目先做适用性判定（不适用也显式声明），再给当前覆盖状态。

| 横切 | 适用性判定 | 依据与当前覆盖 |
| --- | --- | --- |
| 响应式 | 适用 | 目标载体是手机 WebView，窄屏是主场景。上游 app 自带移动端 viewport（`viewport-fit=cover`、`interactive-widget=resizes-content`，见 [visual.md](visual.md)）；断点降级由上游实现承载，真机渲染待验证（G1）。本轮不新增自定义布局。 |
| 无障碍 | 适用（受上游承载） | 复用上游 DOM 结构与交互语义，本轮不改写；上游含 axe-core（无障碍审计工具依赖）说明上游自身有相关纪律。运行期读屏/焦点/触摸目标核验已并入 **G20** 清单（issue #9，见 [interaction.md](interaction.md)），未执行前作为已接受限制如实记录。 |
| 数据契约 | 适用（部分已实现） | 服务器记录字段契约（url / password / authToken / displayName / label）随闭包引入且 M-002 保证 password 不落持久化后端，见 [units/connection.md](units/connection.md)；credentialRef 为非机密引用契约、SSH 主机注册表白名单载荷（id/name/target/credentialRef/时间戳，凭据形字段拒收）已实现（未验证）（issue #3，`packages/mobile-hosts/`）；vault 条目契约（信封 v1 密文+无值元数据索引，`packages/mobile-hosts/src/vault/` + Android `vault/`）已实现（未验证）（issue #4）。SSH 隧道契约（servicePort 白名单字段、known_hosts 行格式、指纹 `SHA256:base64_nopad`、SshErrorCode 十四码、私钥信封 v1）已随 issue #6 实现（未验证，见 [units/connection.md](units/connection.md) 与 [../decisions/0003-ssh-transport.md](../decisions/0003-ssh-transport.md)）。会话/项目数据契约全部走上游生成代码（packages/client），本轮不另行定义。无 mock 数据：本阶段无任何 fixture/fake 事件替代真实服务（issue #2 验收红线）。 |
| 状态恢复 | 适用（壳层未实现） | Android 壳层的实例状态恢复已确认未实现（`MainActivity.onSaveInstanceState` TODO，见 [units/shell-startup.md](units/shell-startup.md)）；WebView 内的上游恢复行为待真机核验（G9/G12）。凭据恢复口径由「可选记住」notice 决定（issue #4 修订）：未记住的密码刷新/重启需重新输入；已记住的凭据经 vault 解析自动恢复（unavailable/corrupt 时按失效矩阵呈现，无明文回退）；SSH 主机注册表恢复为白名单载荷且连接状态归 idle（已实现（未验证）：issue #3）。见 [interaction.md](interaction.md)。 |

## 机械检查口径

- 文档内相对链接以 `test -f` 核对，随每次文档变更执行（结果记录在 [docs/build-and-verify.md](../build-and-verify.md)）。
- 设计单元清单（architecture.md）与本目录单元文档一一对应；未产出文档的单元在清单中保留 TODO 行，不允许沉默缺失。
- 令牌纪律由上游 `@opencode/ui` 体系承载，本轮不新增令牌（见 [visual.md](visual.md)），故不设本地裸值 grep 范围。
- 最小核对记录随变更交付于 [docs/build-and-verify.md](../build-and-verify.md)。
