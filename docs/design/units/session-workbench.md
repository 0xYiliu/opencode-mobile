# 单元：session-workbench（会话工作台——流式消息、上下文、工具与子任务）

状态：**已实现（未验证）**（issue #9 检查点）。会话内的流式时间线、长历史、模型/代理/工具/子任务状态、请求 dock（permission/question/elicitation 的呈现与事件接线）、composer 发送/排队/重试、草稿与滚动保持**全部由上游闭包承载**（`packages/session-ui` + `app/src/session|composer|shell` + `client/src/solid`）。issue #9 检查点时，本仓库零新建界面、零第一方会话逻辑；当前 v2.2.7/#186/#187/#188 仍以 copy 上游实现并做必要 Android 适配为主；**issue #188 起队列/草稿归属保护不再纯上游闭包承载**——active `composer-queue-attachments-v2-2-7`（registry **84 registered / 6 active / 29 absorbed / 49 deferred**）在 `session/composer/queue.ts` 落地 per-attempt owner 捕获（composer 实例/连接/media lease 任一丢失 → machine 原生 AbortController 中止 + 发布抑制；signal 不接 HTTP 调用，远端任务不受影响），queue-machine.ts 保持零改动。旧的迁移轮次 registry 数字只属于冻结 v2.2.1 历史，不是当前事实。全部运行期行为未经设备验证：真机门禁见 **G20**（[interaction.md](../interaction.md)），真模型 live E2E（直连+SSH 双路由）BLOCKED。

行号声明：本文部分旧行号来自迁移前 vendor pin `b4525d79bf`，仅作为冻结 v2.2.1/迁移前历史定位；它们不是当前 v2.2.7 来源事实。当前源码事实以固定 pin `fedc6f208aa2bd54c1019227214568083f6380ad` 和引号内源文本锚为准。

## 能力来源（复用面，无新建第一方会话逻辑）

| 面 | 上游实现锚（`vendor/upstream/packages/...`） | 状态 |
| --- | --- | --- |
| 渲染（时间线） | `session-ui/src/timeline/projection.ts`（会话消息 → tagged 行投影：UserMessage/AssistantPart/TurnGap/TurnDivider/CompactionQueued/Activity/Notice/Thinking 等）+ `timeline/session-timeline-row.tsx`/`timeline/timeline-row.ts`（`createSessionTimelineRowRenderer`）；app 侧 `app/src/session/timeline/message-timeline.tsx` 虚拟化时间线（`createTimelineVirtualizer`，`virtualizer.tsx`）+ Working shimmer（`role="status"`）+ `BackgroundMoveHint` + `SessionRunningMenu` + 标题行内重命名 + timeline 内搜索（`search-bar.tsx`+`search-controller.ts`） | 已实现（未验证） |
| 渲染（工具/子任务部件） | `session-ui/src/tools/tool-renderer.tsx`（按视觉族分组）+ `components/basic-tool.tsx` + `components/tool-error-card.tsx` + `tools/shell-output.ts`；工具状态语义 `message/current-tool-state.ts`（`streaming/running/completed/error` 四态、`currentToolFailed`/`executeToolFailed`/`shellResultFailed`、error 卡默认折叠 `currentContentDefaultOpen`）；子任务 `v2/components/session-progress-indicator-v2.tsx`；流式 part/markdown：`components/message-part.tsx` + `message/current-message.tsx` + `components/markdown-stream.ts` | 已实现（未验证） |
| 事件（增量流） | `client/src/solid/data.ts` `handleEvent`（71 个 `case`：主 switch 55 + location 域失效 switch 16）；连接管理 `client/src/solid/connection.ts`（`createClientConnection`：超时/重连退避/idle watchdog/pageLifecycle）；装配 `app/src/runtime/server/client.tsx`（`flushInterval: 16`、`pageLifecycle: true`、`onEvent → events.publish`） | 已实现（未验证） |
| 发送 | `app/src/composer/submit.ts` `createComposerSubmit`（乐观准入、失败 `restoreSubmission` 回滚草稿、同 ID 重试）→ `client/src/solid/data.ts` prompt 段（乐观 admit + 每会话串行发送链 + 服务端幂等 admission ID）；排队输入经 session inbox API + `session/composer/queue-panel.tsx` | 已实现（未验证） |
| 取消 | 见下方专节（三处线级调用点枚举） | 已实现（未验证） |
| 恢复（快照） | 见下方专节（三层快照恢复 + SSE live-only 口径） | 已实现（未验证） |
| 长历史 | app 侧 `session/timeline/model.ts`（`loadOlderTimeline` + `enrichLeadingTurn` 首屏前向补页 ≤3 页）；client 侧 `message.sync`（初始页默认 20 / compact 预设 40——`app/src/runtime/server/runtime.tsx` `initialMessageLimit: () => (timelinePreset(settings.general.timelineDetail())?.id === "compact" ? 40 : 20)` 注入 data.ts `config.initialMessageLimit`）与 `message.loadMore`（cursor 分页 20/页，all 模式 200/页） | 已实现（未验证） |
| 保持（草稿/滚动/上下文） | 草稿：`composer/state.ts` `composerTarget`——会话内提示词 `Persist.prompt(Persist.serverScoped(serverScope, scope.dir, scope.id, "prompt"))`（ServerScope 键控；local scope 带 `previousKey` v2 迁移），草稿 tab 走 `Persist.prompt(Persist.draft(draftID, "prompt"))`（IndexedDB）；context items 随 prompt store 持久化（`submit.ts` `restoreSubmission` 原样恢复）；`composer/persistence.tsx` 每标签内存态 + `MAX_PROMPT_SESSIONS=20` LRU。滚动：`shell/state/layout.tsx` `sessionView`（`sessionViewSchema`、`SessionStateKey.is` 白名单过滤）+ `shell/state/scroll.ts` `createScrollPersistence`。并发：`persist.ts` 本地脏值优先 + `namespace.ts` revision 单调序。**#188 fail-closed 草稿媒体语义**：draft 媒体引用携带 `sourceServerKey` 并只从其捕获服务器解析（无跨服务器回退）；未解析引用以 `{mediaURI, sourceServerKey}` 持久化（不声明本地所有权），`blobDataUrl` 拒绝未解析引用、`buildPromptRequest` 在 wire 边界拒绝未解析 `media:` file-part url（image 面由 blobDataUrl 先行拒绝）——未解析的旧草稿保持可编辑、提交时 fail-closed；`composer/persistence.tsx` 提供 `captureOwner()` 所有权谓词供 queue/fork/revert 发布抑制 | 已实现（未验证） |
| 子任务/后台任务面 | POST `/api/session/:id/background`（生成客户端 `background:` 段，`successStatus: 204`、empty body——提交后台任务，非读取）；后台任务读取与 subagent 子会话跳转/interrupt 走 `session/header/session-running-menu.tsx`；client `session.family` 家族索引（data.ts family/resolveRoot）；subtask 描述提取 `session/timeline/controller.tsx` `taskDescription`（`task`/`subagent` tool 的 `metadata.sessionId/sessionID`） | 已实现（未验证） |

## 数据与事件契约

全部走上游生成类型与事件（`@opencode/client`，`packages/client/src/promise/generated/client.ts` + `client/src/solid/data.ts` `handleEvent`）。**本仓库不另行定义会话工作台数据/事件契约**；下表为 `handleEvent` 处理的事件全集（55 case 主 switch + 16 case location 域失效 switch，共 71）与消费侧语义。**行号漂移声明**：下述旧行号属于冻结 v2.2.1/迁移前历史定位；当前 v2.2.7 事实以固定 pin `fedc6f208aa2bd54c1019227214568083f6380ad` 的源码为准。

### 主 switch（`client/src/solid/data.ts` `handleEvent`）

| 事件 | 消费侧语义（store 效应） |
| --- | --- |
| `server.connected` | 快照 reconcile：`session.active()` 快照与 hydration 期收到的事件合并 + location/vcs/project 刷新（重连恢复核心，见安全语义专节） |
| `project.updated` / `session.created` / `session.deleted` / `session.usage.updated` | 项目/会话索引与用量记录维护 |
| `session.agent.selected` / `session.model.selected` | 代理/模型切换 → `agent-switched`/`model-switched` 系统消息 + composer 选择面状态 |
| `session.renamed` / `session.archived` / `session.unarchived` / `session.moved` | 会话元数据（标题/归档/移动）索引更新 |
| `session.permissions` | 会话权限状态写入会话 store（`store.session.info[sessionID]` 已加载时写 `permissions` 字段；评审 F1 补录——此前表格漏列该 case） |
| `worktree.resolved` | worktree 状态（projects-sessions 单元消费） |
| `session.inbox.delivered` / `.delivery.changed` / `.cancelled` / `.enqueued` | 排队输入（queue delivery）状态；排队撤销走 `session.inbox.cancel` API |
| `session.instructions.updated` / `session.synthetic` | 会话指令与合成消息 |
| `session.shell.started` / `session.shell.ended` | 会话内 shell 活动标记 |
| `session.step.started` / `.streamed` / `.ended` / `.failed` | 执行步进生命周期；`.failed` 进消息错误面（retry/error 呈现） |
| `session.text.started` / `.delta` / `.ended` | 流式文本增量 → store（delta 事件驱动流式渲染） |
| `session.tool.input.started` / `.delta` / `.ended` | 工具输入流式增量 |
| `session.tool.called` / `.progress` / `.success` / `.failed` | 工具生命周期；`.failed` → 工具错误卡（`current-tool-state.ts` 失败判定族） |
| `session.reasoning.started` / `.delta` / `.ended` | 推理流式增量 |
| `session.retry.scheduled` | 执行重试调度呈现 |
| `session.execution.started` / `session.compaction.started` | 执行/压缩开始标记 |
| `session.execution.succeeded` / `.failed` / `.interrupted` | 执行终态（complete/error/interrupted 三路） |
| `session.viewed` | 会话已读标记 |
| `session.revert.staged` / `.cleared` / `.committed` | undo/rewind 状态 |
| `session.compaction.delta` / `.ended` / `.failed` | 压缩流式增量与终态 |
| `permission.asked` / `permission.replied` | 权限请求呈现（dock 接线；确认单元本身不在本期验收） |
| `form.replied` / `form.cancelled` | 表单类请求应答状态 |

### 第二 switch（location 域失效，同在 `handleEvent` 函数体内）

`provider.updated`、`model.updated`、`agent.updated`、`command.updated`、`skill.updated`、`vcs.branch.updated`、`form.created`、`shell.created`、`shell.exited`、`shell.deleted`、`reference.updated`、`integration.updated`、`config.updated`、`websearch.updated`、`mcp.status.changed`、`mcp.resources.changed`——均按域失效对应缓存读（location/vcs/config 等），不逐字段改写。

### malformed/未知事件容错口径

- **未知事件静默 fall-through**：`handleEvent` 共 71 个 `case`、**无 `default:` 分支**——未知/未来事件类型落空后静默返回：不写 store、不报错、不断流。含义双面：①malformed/未知事件不污染客户端状态（容错性成立）；②客户端对未识别事件零反馈，语义真相以 HTTP 快照读取为准（与 live-only 结论同向）。静态探针锁定该结构（`scripts/verify-session-workbench.ts` 的「`data.ts` 无 `default:`」负断言；上游 pin 更新若引入 default 分支则探针显式 FAIL，强制重审容错口径）。
- **未加载消息丢弃**：`editAssistant` 对未加载消息丢弃事件（源锚：「A missing target means the row was never loaded or was evicted; the event is dropped」）。
- **竞态卫生**：`pending.sync` reconcile 合并事件与 HTTP 快照；事件 Burst 合并（`settleMs`）。

## 取消与断开安全语义（验收第 2 条权威落字）

### 发送（仅在 composer 显式用户动作）

`composer/submit.ts` `createComposerSubmit`：乐观准入、失败 `restoreSubmission` 回滚草稿、同 ID 重试（`retry.current()`）；`sendPrompt` → `data.session.prompt`（乐观 admit + 每会话串行发送链 `sendAdmission` + 服务端幂等 admission ID）。排队输入经 `session/inbox` API 呈现（`queue-panel.tsx`）。

### 取消（`api.session.interrupt` 线级调用点全仓穷举恰三处）

全仓 `api.session.interrupt` 线级调用点**恰三处**（穷举核实；由静态探针的**集合相等**断言锁定，集合外任何线级命中即 FAIL）：

1. **`session/composer/adapter.ts`**——`interrupt: () => server.api.session.interrupt({ sessionID: id, resume: true }).then(() => undefined).catch(() => undefined)`（跨行书写、`resume: true`、吞错）。消费入口为 composer 停止按钮与 working 态空提交：`composer/submit.ts` 的两处 **adapter 方法触发面**（非线级）——`void input.adapter.interrupt()`（working 态空提交）与 `stop: () => (…input.adapter.interrupt()…)`（停止按钮）。
2. **`session/header/session-running-menu.tsx`**——`sdk.api.session.interrupt({ sessionID: item.sessionID })`（后台任务菜单中的 subagent 子会话；旁注锚「A subagent can only be interrupted once its child session exists.」）。
3. **`session/revert.ts`**（`stage()` 内）——undo/rewind 前置序列：`interrupt({ sessionID })` → `session.wait` → `revert.stage`（注释锚：「…both are idle no-ops.」逐字）。同函数对**未投递 prompt** 走 `inbox.cancel` 而非 interrupt（`data.session.input.has(...)` 分支）——排队输入撤销不经 interrupt。

三处均为**显式用户动作**（停止按钮/空提交入口/后台任务菜单/undo-rewind），无任何断连触发路径。

### 断开零中断（红线）

`client/src/solid/connection.ts` 的 `stop()`（仅 `stream?.abort()` + `setConnection`）/`resync()`（仅 `current?.abort(reason)`）/`pagehide` 路径（pagehide→stop / pageshow→start / visibility+online→resync）**零 API 调用**；`app/src/runtime/server/client.tsx` 全文件无 `interrupt`。**客户端断开不中断/不停止远程任务**——与仓库红线（AGENTS「不因客户端断开而主动停止远程任务」、architecture.md 进程边界、svcops O14 同型语义）结构性一致。运行期复核归 G20 机械核对步骤（真实长任务→断连三态→远端存活→重连快照补齐）。

### 恢复口径的权威表述（SSE live-only，快照为恢复权威）

**SSE 事件流是 live-only，无历史重放。** `client/src/shared-events.ts`（`SharedEvents.make`）是容量 4096（`const capacity = 4_096`）的 live fan-out——断线期间事件即丢失；重连后仅把最新一条 `server.connected` 投给迟到订阅者（源锚：`if (item.value.type === "server.connected") connection.connected = item.value`），**不存在 backlog 重放**。本验收明确不声称 live-only SSE 重放历史。

**恢复 = 服务端快照（HTTP 读）重放真相，SSE 只承载增量。** 三层机制（均在 vendored 源内，零改动）：

1. 断连全量失效：`client/src/solid/data.ts` 末段 effect——非 connected 即 `sync.invalidate()` 全量失效（相邻对源锚：`if (config.connection?.status() === "connected") return` 紧邻 `sync.invalidate()`；文件头注释「Reconnect invalidates cached reads; active UI owners decide what to sync again」）。
2. `server.connected` handler：`session.active()` 快照 reconcile（与 hydration 期收到的事件合并）+ location/vcs/project 刷新。
3. 会话面 connected-gated 再同步：`session/session-resolution.ts`（`options?.connected?.()` 依赖变化重跑 `message.sync`+`pending.sync`，注释锚「Queued inputs ride along so a reconnect refreshes them with the transcript」）、`session/requests/model.ts`（三处 `serverSDK.connection.status() !== "connected"` 早退 gate + 一处 `connected: () => …status() === "connected"` 正形 gate）、`session/timeline/model.ts`（挂载同步）。

连接参数事实：连接超时 2s、重连退避 1s、idle watchdog 45s（`connection.ts`）；extension 型连接（`mobile-ssh:<uuid>`）的 `reconnect` 钩子=隧道端点重解析（`packages/mobile-hosts/src/upstream-map.ts` `ExtensionConnection.reconnect`，断流重连自动换端口同身份）。

## 状态矩阵（单元级）

| 状态 | 上游实现锚点 | 恢复口径 |
| --- | --- | --- |
| empty | 时间线投影空态 + composer 就绪门 | — |
| loading | timeline resource + `messageLoading`；初始页经 `message.sync`（默认 20/compact 40） | 首屏前向补页 ≤3 页（`enrichLeadingTurn`） |
| streaming | text/tool/reasoning delta 事件 → store；Working shimmer（`role="status"`，`message-timeline.tsx` `data-component="session-working"`） | delta 丢失由重连快照兜底 |
| complete | `session.execution.succeeded` + idle 标记 | — |
| error（三层） | ①消息层：`session.step.failed` + `session.retry.scheduled`（retry/error 呈现）；②工具层：`session.tool.failed` → tool-error-card（`currentToolFailed`/`executeToolFailed`/`shellResultFailed`，error 卡默认折叠）；③执行层：`session.execution.failed` | 反馈复用上游通道（toast/错误边界/行内错误卡） |
| offline | 上游会话内**无独立 offline 横幅**——断连状态经由连接行（host 状态）/动作失败反馈呈现；陈旧数据 + 失败反馈是断连期的用户可见形态。**该呈现是否充分归 G20 首项核对**（不足则按失败路径四步协议交用户决策，不预设补丁） | 断连即全量失效（`sync.invalidate()`） |
| reconnect | `server.connected` 快照 reconcile + connected-gated 再同步（见专节）；SSH 路由含隧道端点重解析（换端口同身份） | 恢复=服务端快照补齐缺口期消息/状态（含 queued inputs 刷新）；**不是 SSE 重放** |
| malformed/未知事件 | 未加载丢弃 + reconcile 竞态保护 + 未知事件静默 fall-through（无 `default:`） | 语义真相以 HTTP 快照读取为准 |
| tool-failure | `current-tool-state.ts` 失败判定族 + tool-error-card | 错误卡默认折叠，可展开 |

## 移动端窄屏与无障碍承接

- 布局：`session/screen-layout.ts`——side tabs/dock/fileTree 全部 `session.isDesktop()` 门控（web/移动构建单列渲染）；`session-panel-width.ts` 面板宽度钳制；面板开合动效路径 `shell/panel-motion.ts` 的方向探针带 WebView 114 `:dir()` capability guard（active `timeline-messaging-v2-2-7` 的 `isRTL` try/catch→LTR fallback，issue #187——内部健壮性修复，桌面/现代浏览器行为不变）；`composer/submit.ts` `window.matchMedia("(max-width: 767px)")`（窄屏提交后 blur 编辑器）；`message-timeline.tsx` `md:px-6` 响应式 padding、`motion-reduce:animate-none` 动效降级。
- 视觉/视口口径见 [visual.md](../visual.md) 与 [README.md](../README.md) 无障碍行；**本期承接**：窄屏/读屏/焦点/触摸目标的运行期核验并入 **G20** 清单（不再停留于「未安排」）。
- 流式到达的传输前提是既有 **G6**（fetch ReadableStream/SSE 增量在 WebView 内到达）——G20 叠加其上，不替代。

## 门禁与验证

- **G20（新设，见 [interaction.md](../interaction.md)）**：会话工作台全部运行期行为的真机门禁——流式增量呈现、长历史翻页、发送/停止（显式取消）、断开→重连快照恢复（含 queued inputs）、草稿/滚动/上下文跨切换恢复、失败反馈、**断开不中断远端**（机械核对四步：真实长任务→断连三态→远端存活→快照补齐+零 interrupt 日志命中）、窄屏/读屏/焦点/触摸目标核验。与 G12 互补分工：G12=壳生命周期，G20=工作台行为。
- 静态探针：`scripts/verify-session-workbench.ts`（取消调用面穷举集合断言（换行容忍匹配）、SSE live-only + 快照恢复锚、按会话状态保持锚、事件面抽样 + 无 `default:` 负断言、移动适配事实；诚实标注为静态结构检查）。
- 上游定向测试子集（app 追加清单 / client 8 文件 / session-ui 6 文件）与 V2 构建冒烟：见 [../../build-and-verify.md](../../build-and-verify.md) issue #9 段（含 client/session-ui 首跑逐例归因门）。
## 诚实边界

- **权限确认、终端（PTY）、文件与 Diff 三个独立单元不在本期验收**：architecture.md 仍保留 TODO 行；本期仅记录 permission/question/elicitation dock 在工作台内的事件接线事实（`permission.asked`/`form.*` 等 case 的呈现面），不声称这三个单元已交付。
- **dock 仅作为工作台接线记录**：请求 dock 的完整交互契约归权限确认单元（后续 issue）。
- **全部运行期行为归 G20（BLOCKED）**：流式增量在 WebView 的到达节奏、断开→重连快照恢复的用户可见过程、长历史翻页手感、软键盘/视口交互、读屏/焦点/触摸目标、「断开不中断远端」的远端存活核对——G20 未过前本单元交付仅声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **真模型/真服务 live 测试（直连+SSH 双路由）BLOCKED**：需授权远程服务与模型，不允许 fixture 替代。
- **上游已知 TODO 边界**：`message-timeline.tsx` 会话内菜单无归档项（#8 已登记 N-3，归档仅 home 会话行可达）；`session-ui/src/components/line-comment.stories.tsx` 的 Storybook story 文档模板内有一处 ARIA 标注确认 TODO（非 stub、非运行时缺陷，零补丁结论不受影响）。
- 上游全量套件不作为门禁：仅定向子集如实记录（含逐例归因结论）。
