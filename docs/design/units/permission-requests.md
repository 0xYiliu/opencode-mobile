# 单元：permission-requests（权限请求与 Agent 提问）

状态：**已实现（未验证）**（issue #10）。远程权限请求（permission）与 Agent 提问（question/websearch provider/MCP elicitation 三 kind）的完整交互——请求呈现（dock）、决策通道（once/always/reject + form reply/cancel）、duplicate/stale/expired 处置、auto-approve 显式 opt-in、跨会话注意态、恢复——**全部由上游闭包承载**（`app/src/session/requests/*` + `app/src/session/composer/session-composer-region*` + `client/src/solid/data.ts` permission/form 域 + `session-ui` dock-prompt/question-prompt），本仓库零新建界面、零运行时代码改动、零 vendor 补丁（本期 `patches/mobile/manifest.json` 维持 18 个不变）。全部运行期行为未经设备验证：真机门禁见 **G21**（[interaction.md](../interaction.md)），真模型 live E2E（直连+SSH 双路由）BLOCKED。

行号声明：本文引用的行号为 vendor pin `b4525d79bf` 时点值，仅供定位；权威以引号内源文本锚为准。**来源边界**：服务端语义（`packages/core/src/permission.ts`、`packages/server/src/handlers/permission.ts`、`packages/schema/src/permission.ts`）**不在 vendored 闭包内**，引自上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `b4525d79bf`（同 [architecture.md](../architecture.md) CORS 节「来源表述」先例）；vendored 侧仅生成类型/端点/事件消费面可静态断言。pin 更新时缓存引文需随 PROVENANCE 演练同步。

## 能力来源（复用面，无新建第一方逻辑）

| 面 | 上游实现锚（`vendor/upstream/packages/...`） | 状态 |
| --- | --- | --- |
| 呈现（权限 dock） | `app/src/session/requests/session-permission-dock.tsx` → `session-ui/src/components/dock-prompt.tsx`（`kind="permission"`，`DockShell`/`DockTray` 纯 div 容器）：header（warning 图标 + `notification.permission.title`「Permission required」，本地化全集 66 locale 在册）+ `settings.permissions.tool.<action>.description` 操作说明（en.ts:980-999 起 read/edit/glob/grep/list/bash/task/skill/lsp/todowrite 等十余动作键；dock 侧缺键回退空串）+ `request.resources` 逐行 `<code>` 列出 + footer 三按钮 | 已实现（未验证） |
| 呈现（提问 dock 三家族） | `app/src/session/requests/session-question-dock.tsx`（多问题向导：进度 segment `aria-current="step"`、选项按钮 `role="radio"/"checkbox"` + `aria-checked` + `aria-keyshortcuts`、数字键 1-9 直选、方向键/Home/End、Esc=reject、Cmd/Ctrl+Enter=next/submit、纯 Enter 永不提交、自定义输入框 Enter 仅 commit 编辑）+ `session-elicitation-dock.tsx`（MCP 表单 text/number/flag/multiselect）+ `session-websearch-dock.tsx`（provider 同意） | 已实现（未验证） |
| 决策（权限） | `app/src/session/requests/model.ts` `decide(response: "once" \| "always" \| "reject")` → `serverSDK.api.permission.reply({ sessionID, requestID, decision })`（源码跨行书写）；`once`=本次放行、`always`=本次放行 + 服务端项目级持久规则（`saved.add({projectID, action, resources: request.save})`，core @ 缓存）、`reject`=拒绝（可带 `message`，服务端转 `CorrectedError` 进模型工具失败输出） | 已实现（未验证） |
| 决策（提问） | POST `/api/session/:sessionID/form/:formID/reply`（`FormAnswer` 键值 map）与 `form.cancel`；MCP elicitation 走 location 作用域（`"global"` sentinel + location ref，data.ts global 分支 GET `/api/form`） | 已实现（未验证） |
| 请求会话树 | `app/src/session/requests/session-request-tree.ts`：`sessionTreeIDs` 让父会话视图呈现子代理（subagent）会话的请求；`sessionTreeRequest` 每会话 dock 一次只呈现树内第一条（`find`）；kind ∈ `question` \| `websearch.provider` \| `mcp-elicitation` 过滤 | 已实现（未验证） |
| 恢复（快照） | 见恢复链专节（事件 ephemeral → HTTP 快照四处触发） | 已实现（未验证） |
| 留痕 | 见留痕专节（`permission.replied` 广播 / `always` → PermissionSaved / reject+message → CorrectedError / durable `session.permissions`） | 已实现（未验证） |
| 注意态 | `app/src/shell/layout/project-avatar-state.ts`：`needsAttention = hasPermissions() \|\| hasForms()`（受 autoApproves 抑制）——非当前会话的 pending 经项目头像注意态呈现；后台 tab 经 `shell/titlebar/tab-strip.tsx` 错峰同步 | 已实现（未验证） |

## 数据与事件契约

全部走上游生成类型与事件（`@opencode/client`，`packages/client/src/promise/generated/types.ts` + `client.ts`）。**本仓库不另行定义权限/提问数据契约**；六个事件 + 两个生成类型 + 六端点全部引用 vendored 生成面。

### 事件（`client/src/solid/data.ts` `handleEvent` 消费）

| 事件 | ephemeral | 消费侧语义 |
| --- | --- | --- |
| `permission.asked` | 是（schema `ephemeral({type:"permission.asked"})`，@ 缓存） | 按 ID 去重后写入 store：`store.session.permission[sessionID]?.some((request) => request.id === event.data.id)` 命中即 return（重复事件零副作用） |
| `permission.replied` | 是 | `removePermission(event.data.sessionID, event.data.requestID)`——所有客户端（含发起端与他端）经广播移除本地行并可见决策结果 |
| `session.permissions` | 否（durable，`{sessionID, permissions: Ruleset}`） | 会话权限规则集变化写入会话 info（`always` 决策后的规则集同步） |
| `form.created` | 事件本身 ephemeral 消费面 | 按 form.id 去重后写入（`some((form) => form.id === event.data.form.id)`）；`"global"` sentinel 行携带 location |
| `form.replied` / `form.cancelled` | — | `removeForm(sessionID, formID, location)`——dock 移除 |

### 请求类型（生成类型，不另行定义）

- `PermissionRequest = { id: PermissionID, sessionID, action: string, resources: string[], save?: string[], metadata?, source?, message? }`（types.ts:739 附近）；ID 为 `per_` 前缀 + 升序（schema @ 缓存，服务端铸造）。
- `FormInfo = { id: FormID, sessionID, title, metadata?{kind}, fields }`（types.ts:2460 附近）；kind ∈ `question` | `websearch.provider` | `mcp-elicitation`。
- 错误 tagged guards：`PermissionNotFoundError` / `FormNotFoundError` / `FormAlreadySettledError`（types.ts:2801/2817/2887 附近）。

### 端点（生成客户端 `client.ts`）

| 端点 | 用途 |
| --- | --- |
| POST `/api/session/:sessionID/permission/:requestID/reply`（client.ts:1688） | 权限决策（`{decision: "once"\|"always"\|"reject", message?}`） |
| GET `/api/session/:sessionID/permission`（client.ts:1646/1666） | `permission.sync` 快照（全量替换 store） |
| POST `/api/session/:sessionID/form/:formID/reply`（client.ts:1071） | 提问应答（`FormAnswer` 键值 map） |
| `/api/session/:sessionID/form/:formID`（client.ts:1060/1083） | form 读取与 cancel |
| GET `/api/form`（global 分支） | MCP elicitation 全局作用域快照 |
| `/api/permission/saved`（client.ts:1610-1634） | `always` 落下的项目级持久规则 CRUD（设置页权限管理消费） |

## 状态矩阵（单元级）

| 状态 | 上游锚点与语义 |
| --- | --- |
| pending | dock 呈现于 composer 区位（`session-composer-region.tsx`）；请求上下文完整：标题 + 操作说明（`settings.permissions.tool.<action>.description`）+ resources 逐行 + 三决策按钮。**模态范围按视图类型（F5）**：primary 会话视图请求 pending 时 `blocked` 为真 → composer 隐藏（`session-composer-region-controller.ts:22` `showComposer: () => !input.state.blocked() || !!input.parentID()`）；subagent 子会话视图（`parentID()` 非空）dock 与 composer 并存；父会话视图经 `sessionTreeIDs` 呈现子代理请求时 composer 同样隐藏（主路径不受影响）。Working shimmer 同步抑制（`message-timeline.tsx:344` permission/form 列表非空即 `return false`） |
| responding（in-flight） | `store.responding === perm.id` 早退（幂等）+ 三按钮全部 `disabled={props.responding}`；question dock `sending()`（`replyMutation.isPending || rejectMutation.isPending`）早退所有动作并 disable 全部按钮——快速连点仅发出一次 reply |
| decided | dock 移除 + `permission.replied` 广播；`always` 另落服务端项目级规则（durable `session.permissions` 广播同步）；`reject`（带 message）→ `CorrectedError.feedback` 进模型可见工具失败输出 |
| stale / expired | **分层（F2）**：①form 侧——`settleForm` 吞 `FormNotFoundError`/`FormAlreadySettledError`（且 `error.id === input.formID` 才吞）+ invalidate/resync 自愈（data.ts:328-338；reply/cancel 确经 settleForm）；②permission 决策侧——**无吞错**：`decide()` catch → `common.requestFailed` toast（model.ts:176-181），请求行随后经 `permission.replied` 广播移除；G21④ 核对 toast 呈现充分性。data.ts 的 `isPermissionNotFoundError` 吞错包装（data.ts:1815-1817）在 app 内**零调用者**（归一扫描实证），单列为包装层事实、不作决策侧统一语义。服务端侧 expired = awaiting fiber 死亡/中断 → `Effect.ensuring(pending.delete)` 清条目（core @ 缓存；任务取消/会话结束即过期，无定时器过期语义）；外部 API `session.permission.create` 可在空闲会话驻留请求 |
| offline | composer 隐藏照旧（blocked 态不依赖连接）；决策动作失败 → 失败 toast（请求保留待重试）；快照读失效（`status() !== "connected"` gate） |
| reconnect | 恢复链四处触发（见下节）；事件流 live-only 不重放，快照为恢复权威（与 session-workbench 恢复口径同构） |
| auto-approve-on | 显式 opt-in（默认关）：会话命令 `permissions.autoaccept`（keybind `mod+shift+a`）或设置页；开启/关闭均有 toast 明示（en/zh `toast.permissions.autoaccept.on/off.*` 四键成对；`project.*` 两键仅 en 在册，zh 回退 en——上游 i18n 缺键回退语义）。开启时 dock 隐藏（`permissionRequest()` 返回 undefined）且 auto-approve 以 `decision: "once"` 代答（`auto-approve.ts:148-149`），`state.responded.has(permission.id)` 去重、`covers(projectID)` 项目门 |
| 多请求队列 | 客户端每会话 dock 一次只呈现树内第一条；`reply("reject")` 服务端把同会话**全部** pending 一并拒绝并逐个广播 Replied（批量扩散，core @ 缓存注释「Feedback applies to the whole batch, so parallel asks don't end the step」）；`always` 同型扩散到此后 evaluate=allow 的同会话请求 |

### 恢复链（事件 ephemeral，快照为恢复权威）

权限/表单事件是 ephemeral（不落盘、无重放，schema @ 缓存）——恢复只能靠 HTTP 快照，与 session-workbench「SSE live-only、快照为恢复权威」结论同构。四个触发点：

1. `requests/model.ts:25-26` 会话 gate：`status() !== "connected"` 早退紧邻 `permission.sync(id)`；
2. `requests/model.ts:33-35` 会话树 gate：`sessionTreeIDs` 逐子会话 `form.sync`；
3. `requests/model.ts:53-54` elicitation location gate：`form.sync("global", ref)`；
4. `shell/titlebar/tab-strip.tsx:163-171` 非活跃 tab 错峰同步：`300 + index*50`ms 后 `Promise.allSettled([...permission.sync(value.id), form.sync(value.id), ...])`——后台 tab 的 pending 恢复不依赖前台。

auto-approve 开启时另有 connect sweep（`auto-approve.ts:35-39` 注释「sweep on every connect while the setting is on」）：事件流不重放断连期间的请求，故每次连接全量列举后逐条补答。**该列举是 per-location 聚合（F3）**：sweepLocations = 活跃会话 ∪ 本地已知会话按 location 去重（`auto-approve.ts:93-127`），**不是全服列举**；上游注释自认残例「A detached request on a session this client never loaded is the one case that stays uncovered」（:91-92）——该残例非不可恢复：打开该会话时触发点 1 的 connected-gate 仍会补齐。

## 安全语义专节（验收第 2/4 条权威落字）

### 请求身份 = 服务端铸 ID + 会话绑定双校验（session-scoped）

`Permission.ID.create()`（`per_` + ascending）由服务端铸造；HTTP reply 前 `requireOwnedRequest(sessionID, requestID)` 同时校验存在性与 `request.sessionID === sessionID`，任一不成立 → `PermissionNotFoundError`（server handler @ 缓存）——**请求身份是会话作用域的，跨会话回复不可能成立**。服务端重复 pending ID 铸造 = 缺陷级 die（core @ 缓存「Duplicate pending permission ID」）。

### duplicate / stale / expired（分层口径，F2）

- **duplicate**：客户端 `permission.asked`/`form.created` 按 ID 去重（见事件表）；UI 层 responding/sending 幂等守卫防重复提交。
- **stale/expired 客户端**：form 侧 `settleForm` 吞错自愈；permission 决策侧**无吞错**——失败 toast + `permission.replied` 广播移除（详见状态矩阵行）。
- **stale/expired 服务端**：pending 存于服务端内存 Map；awaiting fiber 死亡/被中断 → 清条目；服务关闭（close finalizer，core @ 缓存 ~:120-133）把全部 pending 以 **reject** 结案并广播（`Deferred.fail(DeclinedError)`，uninterruptible）——**shutdown 也绝不批准**。

### reject 批量扩散与 auto-approve 竞态隔离

`reply("reject")` 批量扩散同会话全部 pending（见状态矩阵）；auto-approve 与用户决策结构性隔离：autoApprove 开启 → dock 隐藏（`permissionRequest()` 返回 undefined）；settings 为 client-local；`covers()` 门护 retry 路径 + `responded` 集合去重。多客户端并发（他端先答）呈现归 G21④ 可选子项。

### client exit 零副作用（红线；`permission.reply` 全仓调用点分层穷举，F1）

换行容忍归一后（`permission\s*\.\s*reply`），全 vendored 树恰 **6 文件**，分四层：

1. **app 线级调用点恰两处**（决策通道的全部入口）：
   - `app/src/session/requests/model.ts` `decide()`——决策按钮，显式用户动作（源码跨行书写 `serverSDK.api.permission\n      .reply(`）；
   - `app/src/session/requests/auto-approve.ts` `approve()`——显式 opt-in 设置开启时的代答。
2. **client 包装层**：`client/src/solid/data.ts` `data.session.permission.reply`（含 `isPermissionNotFoundError` 吞错 + `removePermission`；**app 内零调用者**——归一扫描实证）+ generated 传输（`client/src/promise|effect/generated/client.ts`）。
3. **protocol 端点定义**：`protocol/src/groups/permission.ts`（端点声明，非调用）。
4. **plugin 适配面**：`plugin/src/promise/adapter.ts`（服务端插件 host 面；app 零 import、不打包进 web）。

app/session-ui/ui 三包内线级调用恰两处成立。`client/src/solid/connection.ts` 全文零 `permission`/`reply`/`form`/`interrupt` 引用（stop/resync/pagehide 路径不触碰响应通道）；`app/src/runtime/server/client.tsx` 无 `.permission`。**无任何断连/退出/生命周期触发路径**：杀 App → SSE 断开零副作用，远端任务保持等待。反向佐证：服务端 close finalizer 全部 pending 以 reject 结案（非 approve）并广播——即使服务重启也不静默批准；请求 pending 时远端执行 fiber 挂在 `Deferred.await` 上，客户端断开不影响其存活（真机核对归 G21⑥）。静态探针锁定（`scripts/verify-permission-requests.ts` 断言组 1：集合相等 + session-ui/ui 两包零命中负断言）。

### 留痕（验收第 3 条「record response outcome」）

- **事件留痕**：`permission.replied` 广播 `{sessionID, requestID, reply}` → 所有客户端移除本地行并可见决策结果；durable `session.permissions` 广播会话规则集变化。
- **持久留痕**：`always` → `PermissionSaved` 项目级规则（`/api/permission/saved` CRUD + 设置页权限管理）；`reject` 带 message → `CorrectedError.feedback` 进模型可见的工具失败输出（模型可据此继续）。
- **客户端本地**：无独立响应日志（toast 仅失败路径）；留痕语义 = 事件流 + 服务端 saved 规则，**本文档不声称本地审计日志**。

## 「无歧义默认审批」专节（验收第 1 条权威落字）

四条结构锚（静态探针组 4 锁定）：

1. **无键盘默认审批**：`DockPrompt` 无内建按键语义（仅透传 `onKeyDown`，permission dock **不传**）；`requests/` 目录零 `autoFocus`——焦点不会自动落在任何决策按钮上，回车/物理键盘无法触发 approve。
2. **`variant="submit"` 仅视觉样式**（`ui/src/actions/button/button.tsx` data-variant 属性 + css），无表单 submit/默认按钮行为；三按钮均为 `onClick` 显式动作（Deny `variant="ghost"` | Allow Always `variant="neutral"` | Allow Once `variant="submit"`）。
3. **自动批准默认关闭且显式 opt-in**：settings 默认 `permissions: { autoApprove: false, autoApproveProjects: {} }`（`settings/model.tsx:289`）；开启路径 = 会话命令 `permissions.autoaccept`（keybind `mod+shift+a`）或设置页，开启/关闭均有 toast 明示（`toast.permissions.autoaccept.on.description`「Permission requests will be automatically approved」）；开启时以 `decision: "once"` 代答。
4. **服务端无静默批准路径**：规则缺省 effect=`ask`（`evaluate` 回退 `{action, resource:"*", effect:"ask"}`）、agent 未配置权限=deny-all（`missingAgentPermissions`）、服务关闭 close finalizer 全部 pending 以 reject 结案（core @ 缓存）。

移动端**不改变**该语义的声明：本期零补丁、零运行时代码——auto-approve opt-in 语义、决策三值、服务端缺省 ask/shutdown 全拒在移动构建与桌面构建同源。请求上下文呈现（标题/操作说明/resources/决策集）与 composer 阻断共同保证「display request context, affected operation and available decisions」；运行期呈现归 G21①②。

## 触摸目标与无障碍现状（缺口如实，G21⑧ 首项核对）

- **已成立（结构面）**：in-flight 全按钮 disabled + 幂等早退；Deny 排首位（ghost 弱化）；无键盘默认审批、无 autoFocus；question dock 完整 role/aria-checked/aria-keyshortcuts/aria-label（minimize/restore、progress segments）；permission 按钮文本标签。
- **缺口（如实，不预设补丁）**：①按钮高度 `normal=28px`（permission dock）/`large=32px`（question dock）（`ui/src/actions/button/button.css`），低于移动端 48dp 触摸目标推荐；②三按钮横排 gap 仅 8px（`session-ui/src/components/message-part.css` `[data-slot="permission-footer-actions"]`），Allow Once（submit 视觉强调）居最右，与高频滑动区重叠；③permission 三按钮无 `aria-keyshortcuts`（question dock 有）；④DockPrompt 无焦点陷阱（页面其余部分仍可聚焦）。**是否构成真机不可用需 G21⑧ 首项核对判定**；不足则按 [interaction.md](../interaction.md) 失败路径四步协议交用户决策（候选含上游 Button/dock 无障碍强化补丁 M-022+ vs 接受上游桌面语义），决策前不产品化。

## 门禁与验证

- **G21**（[interaction.md](../interaction.md) 新设）：权限/提问运行期真机清单九项（呈现充分性、三决策、duplicate/stale/expired 三态、断连恢复、client exit 红线机械核对、auto-approve opt-in、通知设置呈现、窄屏/读屏/焦点/触摸目标首项核对、SSH/直连双路由）。G21 未过前本期交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **V-probe**：`scripts/verify-permission-requests.ts`（静态结构检查，对运行时行为零证明力）——断言组 1 决策调用面穷举集合（含 F1 两包零命中负断言）、组 2 duplicate/stale/expired 分层锚、组 3 恢复链四处触发、组 4 无歧义默认审批四锚、组 5 事件与端点契约抽样；负例控制演示留档。
- **V-upstream**：app 子集追加 3 文件（`session/requests/websearch.test.ts`、`settings/model.test.ts`、`runtime/server/global-sync/utils.test.ts`）首跑逐例归因门；既有三包子集（app 46 + client 8 + session-ui 6）回归——client 的 `solid-eviction`（permission store 家族存活于 eviction）/`shared-events`（permission.asked fan-out）覆盖事件层语义。
- **覆盖口径**：`requests/model.ts`/`auto-approve.ts`/三个 dock 组件上游**无单测**（装配层）——覆盖 = 探针（结构）+ V2（构建）+ G21（真机）三层，与 #8 M-017 覆盖口径同型。

## 诚实边界

- **G21 全部运行期行为**（dock 呈现到达、三决策真实效果、in-flight 误触、stale/expired 真机呈现、断连恢复过程、client exit 红线的远端存活核对、auto-approve 代答、通知呈现、读屏/焦点/触摸目标）——BLOCKED。
- **真模型/真服务 live 测试（直连+SSH 双路由）**——真实 `permission.asked` 的产生依赖真实模型工具调用；需授权远程服务与模型，不允许 fixture 替代——BLOCKED。
- **多客户端并发决策核对**（他端先答/批量扩散呈现）——需第二客户端环境——BLOCKED（G21 可选子项）。
- **服务端语义来源边界**：core/server/schema 的 permission 文件不在 vendored 闭包内，本文语义引自采集缓存 @ pin；pin 更新时缓存引文需随 PROVENANCE 演练同步。
- **dock 装配层无上游单测**：model/auto-approve/dock 组件的 Solid 装配未在运行时执行；探针为静态结构检查。
- **session-ui component-tests/playwright**（dock-prompt.stories 等浏览器级）——需浏览器环境——BLOCKED。
- 终端（PTY，G7）与文件与 Diff 两个单元仍为 architecture.md TODO 行，本期不声称已交付；#9 诚实边界中「权限确认独立单元不在本期验收」的保留项由本期承接。
