# 单元：远程 Agent 能力与扩展配置（agent-capabilities）

覆盖范围：远程 Agent、commands、skills、MCP 与插件配置的呈现与运行时启停（设置 extensions 三子 tab、项目级 extensions 四子 tab 含 LSP、`DialogSelectMcp`（/mcp）、new-session MCP 控件与 prepare 门、会话「更多」抽屉 details server 面板、composer @skill/@agent//slash 注入）、MCP 五态状态机与重认证流、断开语义、GUI 扩展主进程零执行边界。能力**全部由上游闭包承载**（issue #15，零新建界面、零运行时代码改动、零 vendor 补丁）；本文固化契约、状态矩阵与安全语义，并把「远程服务器扩展配置」（设置 extensions tab）与「GUI 扩展宿主」（gui-extensions tab——上游面 desktop+DEV 专属；其生命周期管理面自 issue #26 起以第一方移动面存在，见 [gui-extensions.md](gui-extensions.md)）两套上游同名概念显式区分（验收 1 落字）。Agent/Command/Skill 的**配置增删改无客户端 UI**（上游实态，见能力边界专节）——本文不虚构「可在手机上编辑 opencode.json」。

## 能力来源表

| 面 | 能力 | 上游文件锚（vendored，pin `b4525d79bf`） |
| --- | --- | --- |
| 设置 extensions 三子 tab | MCPs（`mcp.list` 驱动行列表 + Switch，`enabled = server.status.status === "connected"`，toggle 走 `useMcpToggle`）/ Plugins（`plugin.list` → `pluginLabels` 过滤 `source.type === "builtin"` → 只读行列表）/ Skills（`data.location.skill.list()` 只读行列表 + 「How to add skills」外链 `https://opencode.ai/v2/docs/skills`）；头部文案自证服务器侧：`settings.extensions.description` = 「Manage extensions available on this server」、`settings.extensions.manageConfig` = 「Manage in opencode.json」 | `app/src/settings/providers/extensions.tsx`（`SettingsExtensions`，三子 tab mcps/plugins/skills；`// Reading `.latest` rethrows a failed fetch, so these lists fall back to empty instead of crashing the page.` 注释 + `.catch(() => [])` 回落）+ `app/src/providers/catalog/plugin.ts`（`pluginLabels` 的 builtin 过滤） |
| 项目级 extensions 四子 tab | mcps/plugins/skills/**lsps**（project 独有；`settings/route.ts` 的 `nested === "lsps" ? undefined : nested` 归一——lsps 仅 project 视图合法）；MCP 分「本项目独有」（按 global 集差集）与「Shared（全局）」折叠区，均带 Switch；LSP 子面 = `configuredLanguageServers(config.list)` 呈现 enabled/disabled + **loadFailed + retry 按钮** | `app/src/settings/workspaces/project-extensions.tsx`（`ProjectSettingsExtensions`；`SharedSection` 折叠；`ProjectLanguageServers` 的 config 查询 + `project.settings.extensions.lsp.loadFailed`/`lsp.retry`）+ `app/src/settings/workspaces/project-lsp.ts`（合并纯逻辑 + test）+ `app/src/settings/route.ts`（lsps 归一） |
| `DialogSelectMcp`（/mcp） | 命令面板 `mcp.toggle`（`slash: "mcp"`，keybind `mod+;`）打开的 MCP 对话框：statusLabels 恰四键 `connected/failed/needs_auth/disabled`（**pending 无行内标签但 Switch disabled**——上游实态如实）、failed 的 `error` 行内呈现、enabled/total 计数描述、空态 `dialog.mcp.empty` | `app/src/providers/connect/mcp-dialog.tsx`（`statusLabels` 四键字面 + `disabled={status() === "pending" || …}`）+ `app/src/session/commands/use-session-commands.tsx`（`chooseMcp` → lazy import mcp-dialog；`slash: "mcp"`/`keybind: "mod+;"`） |
| new-session MCP 控件与 prepare 门 | draft 级 MCP 状态记忆（`tabs.updateDraft(… mcp: { target, states })`）+ 发送前门 `prepare()`：catalog 复查可用性（缺失 → throw `session.summary.mcp.unavailable`）→ 逐个 toggle 到期望态 → 终态复查（未达 → throw `session.summary.mcp.signInBeforeSend`（needs_auth）或 `session.summary.mcp.notReady`）→ 失败 toast `session.summary.mcp.prepareFailed` | `app/src/new-session/mcp.ts`（`createDraftMcpControls`；四键 en+zh 全量在册） |
| details 移动抽屉 server 面板 | details GUI 扩展 renderer 侧注册 `mobile: { order: 50, kind: "drawer", icon: "info" }` Panel 渲染 `SessionServerPanel`（mcp/plugins/skills/lsp 服务菜单，自带窄屏 drawer 变体 + loading/error+retry/empty 三态通用骨架）；app 会话屏 `session/screen.tsx` 挂载 `<MobileViewTabs>`（`runtime/extension/mobile.tsx` 收集带 `mobile` 的 host Panel 条目）——移动端「更多」抽屉内可达 MCP 状态/开关/重认证面 | `gui-extensions/src/details/renderer.tsx`（mobile 注册锚）+ `gui-extensions/src/details/server-panel.tsx`（`McpMenu`：状态圆点 `data-status` + label（pending→`connecting`）+ error tooltip + **needs_auth 行点击 = 触发 sign-in 而非 toggle**——注释逐字 `// Outside the switch itself, a row that requires sign-in starts sign-in instead of toggling.`）+ `app/src/session/screen.tsx`（`<MobileViewTabs>` 挂载锚）+ `app/src/runtime/extension/mobile.tsx` |
| composer 注入与会话面 | skills 以 `@skill-id` mention 建议（`kind: "skill"`）；**subagent 型 agents** 以 `@agent-name` mention 建议（`.filter((agent) => !agent.hidden && agent.mode !== "primary")`）；commands 以 `/command` slash 建议（`slashCommands()` = `data.location.command.list` 的 `custom.*` + 内置 `slash` 命令）；命令执行 = `session.command`（**全源恰一调用方** `new-session/composer-adapter.ts`）；agent 主选切换（normalizeAgentList）与 #9/#14 已登记会话面衔接 | `app/src/composer/model.ts`（`kind: "skill" as const`、agents 过滤、`custom.${item.name}`）+ `app/src/new-session/composer-adapter.ts`（`session.command` 调用锚） |

## 数据与端点契约

端点全部引用 vendored 生成面（`packages/protocol/src/groups/{agent,command,skill,plugin,mcp}.ts` 协议描述 + `packages/schema/src/{agent,command,skill,plugin,mcp}.ts` 类型），不另行定义契约。location 均为 `{ directory }`——五类能力全部是 **location 作用域**的 locationResource（`client/src/solid/data.ts`）。

**agent/command/skill/plugin 组（协议描述闭包内逐字）**：

| 端点 | 方法+路径 | 调用方 | 协议描述（闭包内逐字） |
| --- | --- | --- | --- |
| `agent.list` | GET `/api/agent` | 无 API 直调——经 client solid 数据层 `data.location.agent` 目录同步（accessor 读取经 composer/model.ts 等消费） | "Retrieve currently registered agents." |
| `agent.get` | GET `/api/agent/:agentID` | 无调用方 | "Retrieve a single currently registered agent." |
| `command.list` | GET `/api/command` | 同上——`data.location.command` 目录（composer slash 建议） | "Retrieve currently registered commands."（组级 "Experimental command routes."） |
| `skill.list` | GET `/api/skill` | 同上——`data.location.skill` 目录（设置 skills 行列表 + composer @skill 建议） | "Retrieve currently registered skills."（组级 "Experimental skill routes."） |
| `plugin.list` | GET `/api/plugin` | 恰 {`settings/providers/extensions.tsx`、`settings/workspaces/project-extensions.tsx`}（两处均 `.catch(() => [])` 回落） | "Retrieve enabled server plugins and their current status." |
| `plugin.check` | POST `/api/plugin/check` | **零 UI 调用方**（promise 生成客户端在册，`client/src/promise/generated/client.ts` `check:` 在册） | "Check one or all package plugins for available updates." |
| `plugin.update` | POST `/api/plugin/update` | **零 UI 调用方** | "Update package plugins concurrently and notify active locations to reload them. Responds once every update has finished; fails when any update fails." |

**mcp 组（协议描述闭包内逐字；`mcp.list` 调用方按两段式登记）**：

| 端点 | 方法+路径 | 调用方（归一化扫描；接收者容忍 `\b(api|client)\s*(\(\s*\))?\s*\.`——全可选括号组，与探针实现一致） | 协议描述（闭包内逐字） |
| --- | --- | --- | --- |
| `mcp.list` | GET `/api/mcp` | **UI 调用面恰五**（`providers/connect/mcp.ts`、`runtime/server/sync.tsx`、gui-ext `details/server-panel.tsx`、`new-session/mcp.ts`、`settings/providers/extensions.tsx`——末者为跨行书写 `serverSdk.api.mcp\n.list()`，归一化必查）**+ 数据层访问器恰一**（`client/src/solid/data.ts` `locationResource("mcpServer", (location) => api().mcp.list({ location }))`，函数调用式 `api()` 接收者）——**端点全调用面恰六文件** | "Retrieve configured MCP servers and their connection status." |
| `mcp.add` | PUT `/api/experimental/mcp/:server` | **app/gui-extensions 源码零调用**（promise 生成客户端在册）——运行时只做 connect/disconnect/enable 切换，增删改指回 opencode.json（`manageConfig` 文案锚） | "Add an MCP server at runtime or replace an existing one, connecting it immediately." |
| `mcp.remove` | DELETE `/api/experimental/mcp/:server` | **零调用**（同上） | "Stop an MCP server and remove it from the runtime set until restart." |
| `mcp.connect` | POST `…/mcp/:server/connect` | **恰三文件**（`providers/connect/mcp.ts` 经 `serverSDK.api.mcp.`、`runtime/server/sync.tsx` 经 `serverSDK.api.mcp.`、gui-ext `details/server-panel.tsx` 经 promise 客户端 `client.mcp.`——同一端点面、两种接收者形态都属调用面；全部是用户 toggle/sign-in 显式触发） | "Connect an MCP server at runtime, overriding a disabled configuration until restart." |
| `mcp.disconnect` | POST `…/mcp/:server/disconnect` | **恰三文件**（同上三处） | "Disconnect an MCP server at runtime, removing its tools until reconnected." |
| `mcp.resource.catalog` | GET `/api/mcp/resource` | 数据层访问器 `data.location.mcp.resource`（`api().mcp.resource.catalog(`，locationResource 定义处） | "Retrieve resources and resource templates from connected MCP servers." |
| `mcp.clientToken`/`mcp.client` | POST+GET `/api/experimental/client-mcp…` | **零调用**——客户端反向托管 MCP（浏览器作 MCP server）experimental 面，移动语义未核对（见诚实边界） | "Upgrade to a WebSocket over which the client hosts an MCP server named after `name`; its tools stay available while the socket is open. Experimental" |

**类型**：`Agent.Info { id, name, model?, mode: Literals(["subagent","primary","all"]), hidden, color?, steps?, permissions: Permission.Ruleset, … }`（`permissions` 是服务端执行域规则集，#10 permission-requests 的 ask 流承接，本面零决策代码）；`Command.Info { name, description? }`；`Skill.Info { id, name, description?, autoinvoke?, path, content }`（`path` 为服务端 AbsolutePath、`content` 为 skill 正文——**随 list 下发**）；`Plugin.Info`（`source: { type: "package"|"local"|"builtin"|"…", … }`，设置面过滤 builtin）；`Mcp.Server { name, status, integrationID? }`——**无任何 config 回显字段**（headers/command/environment 等配置值永不出现在 list 响应中；`integrationID` 注释逐字「Set for remote servers registered as OAuth integrations; lets clients act on the right integration without matching by name, which could collide with provider or plugin integrations.」）；`Mcp.Status` 五态 tagged union：`connected | pending | disabled | failed { error } | needs_auth { error }`；`Mcp.ResourceCatalog { resources[], templates[] }`。

**事件（SSE，`client/src/solid/data.ts`）**：`mcp.status.changed` → mcp.server invalidate+settle sync（注释逐字「Authenticating an MCP integration reconnects its server, which emits mcp.status.changed, so the mcp list syncs here rather than off integration.updated. The server emits one event per MCP server as each settles, so a location booting nine servers emitted nine refetches.」——**重认证完成后的状态回推不依赖轮询**）；`mcp.resources.changed` → mcp.resource；`agent.updated`/`command.updated`/`skill.updated` → 各 location 目录 invalidate+sync；`plugin.updated` 事件在 gui-ext details `ServiceCatalog` 消费（`createKeyed(data, …on("plugin.updated"…))`）；bootstrap/重连同步段含 agent/command/mcp.server/mcp.resource/skill 目录（`data.ts` sync/invalidate 全量列表在册）。

**服务端注册语义（来源分层，非闭包）**：Agent/Command/Skill 注册与 MCP client 进程管理在服务端（packages/core、packages/server 不在 `vendor/upstream/packages`——引 `~/.cache/opencode-upstream` @ pin `b4525d79bf`，来源表述同 [../architecture.md](../architecture.md) 先例）；客户端只见上述只读投影与事件。`LocalConfig { type: "local", command[], cwd, environment }` 的 MCP 进程在**服务端工作目录**执行（`cwd` schema 描述逐字「Working directory for the MCP server process. Relative paths resolve from the workspace directory.」）——**手机零 MCP 进程执行面**。

## MCP 状态机与重认证专节（验收 1/2 核心面）

**五态 × 四呈现面矩阵**（`Mcp.Status`：connected/pending/disabled/failed{error}/needs_auth{error}）：

| 态 | 设置/项目行（Switch） | `DialogSelectMcp` 行 | details 圆点行 | 语义（协议逐字锚） |
| --- | --- | --- | --- | --- |
| connected | enabled=true | 标签 `mcp.status.connected`，Switch on | 圆点 `data-status` + label | 运行中（disconnect 即摘除工具 until reconnected） |
| pending | 呈现，toggle 走 `toggleMcp` no-op | **无行内标签但 Switch disabled**（上游实态如实） | label `connecting` | 连接建立中 |
| disabled | enabled=false | 标签 `mcp.status.disabled`，Switch off | 圆点 + label | 配置在册、运行时停用（connect 覆盖 until restart） |
| failed { error } | enabled=false | 标签 `mcp.status.failed` + **error 行内呈现** | 圆点 + error tooltip | 连接失败（可重试 connect） |
| needs_auth { error } | enabled=false，toggle 分派 authenticate | 标签 `mcp.status.needs_auth` | **行点击 = 触发 sign-in 而非 toggle** | 需 OAuth 重认证 |

**单一状态机函数**（`runtime/server/global-sync/mcp.ts` `toggleMcp`，全文 18 行）：`pending` → no-op 早退；其余按分派表逐字 `{ connected: input.disconnect, needs_auth: input.authenticate, disabled: input.connect, failed: input.connect }[input.status]()` 然后 `refresh()`。

**三处等价调用点**（MCP 面恰三文件，均为「needs_auth → 取 OAuth 方法 → 服务端 attempt → openExternal」同构）：

1. `app/src/providers/connect/mcp.ts`（`useMcpToggle`——设置页/项目页/mcp-dialog/new-session 共用 hook）：`mcp.list` 快照判定（`pending` 早退）→ connect/disconnect → **invalidate+sync 后重读 current** → `needs_auth && integrationID` 分支 = `integration.get(integrationID)` → 选 `type === "oauth" && !form?.length` 方法（无则 throw `mcp.auth.interactiveForm`）→ `integration.oauth.connect` → `platform.openExternal(attempt.data.url)` → 终态复查（注释逐字 `// A successful HTTP response can still leave the MCP connection in a failed state.` + `if (status?.status === "failed") throw new Error(\`${name}: ${status.error}\`)`）；onError → `common.requestFailed` toast。
2. `app/src/runtime/server/sync.tsx`（`mcp.toggle(directory, name)`，经 `toggleMcp` 分派）：authenticate 分支同型，interactiveForm 错误文案逐字 `MCP server ${name} requires an interactive authentication form`、无 integration 文案 `MCP server ${name} has no authentication integration`。
3. `gui-extensions/src/details/server-panel.tsx`（`McpMenu`）：同型，经 `ctx.t("mcp.interactiveAuth")` + `system.openExternal`。

provider 面的 `providers/connect/controller.ts` 合法共存 `integration.get`+`oauth.connect` 对（provider 连接流，非 MCP 面，不计入三处；排他性由 mcp.connect/disconnect 调用面穷举间接约束）。

**重认证回推闭环**：authenticate → 服务端 attempt → `openExternal`（跨效应注记 issue #76：壳内实态已落定=files 桥 ACTION_VIEW 外跳 + native 强制策略 + 失败固定文案 Toast——web.ts 的 `window.open("_blank")` 同窗导航形态已由 M-041 移除，与 G25③ 同源实态同步更新）→ 用户在授权页完成 → 服务端重连该 server → **`mcp.status.changed` 事件回推 → mcp.server invalidate+settle sync → connected**——「切出完成授权→切回」路径无需回跳即更新状态。

**local 型 = 服务端进程（防误读）**：`LocalConfig { command[], cwd }` 是**服务端**进程（cwd 相对服务端 workspace）——客户端零 MCP 进程执行面（mobile-hosts 全域 `api.mcp|agent|command|skill|plugin`/`integration` 零命中负断言双锁）；「在手机上跑 MCP 进程」不成立，手机上发生的是对服务端进程状态的查询与启停指令。

## GUI 扩展边界专节（验收 1「区分」与验收 2「不执行」落字）

**上游自身存在两套「extension」概念，本单元只交付第一套的呈现，并固化第二套在移动端的结构性缺席**：

| 维度 | ①远程服务器扩展（本单元） | ②GUI 扩展宿主（#26 边界） |
| --- | --- | --- |
| 设置面 | `extensions` tab：MCPs/Plugins/Skills（+项目级 lsps） | `gui-extensions` tab：13 个内建（context/btw/debug/terminal/file/review/details/browser/pairing/updater/ssh/wsl/microsoftOffice，`gui-extensions/src/renderer.ts` compose） |
| 头部文案自证 | 「Manage extensions available on this server」/「Manage in opencode.json」——服务器侧配置的呈现 | 「Built-in GUI extensions in this window. Development builds only.」 |
| 实质 | 服务端 opencode.json 配置的呈现 + 运行时启停（MCP connect/disconnect） | 桌面窗口的 GUI extension host（Bridge/Ipc/main 进程面） |

**「不执行 Electron/Node 主进程扩展」的四条独立证据链（结构性负断言，探针锁定）**：

1. **web 平台无 Bridge**：`runtime/platform/web.ts` `createWebPlatform` 的 `Platform` 对象**无 `extensions` 字段**（实锚）；`gui-extensions/src/sdk/bridge.ts` 的 `extensions?: Bridge` 文档逐字「What the desktop preload exposes to the renderer host; undefined on the web.」——Bridge（Ipc call/subscribe/manager list/enable/disable/reload/install/remove/embed/capture）只由 packages/desktop 的 preload 提供。**desktop 包源码不在闭包**——闭包内 `vendor/upstream/packages/desktop/` 仅存 106 个 icons 资产文件（2 icns + 2 ico + 98 png + 4 xml），无源码/preload/package.json（实测）。
2. **Ipc 在 web 恒 inactive**：`gui-extensions/src/sdk/core.ts` Ipc 定义文档逐字「On the web, where no main process runs, it is always inactive.」
3. **main 入口不进 app**：`gui-extensions/src/main.ts` 的 main compose（debug/browser/pairing/updater/ssh/wsl 六个 `main:` 入口）只被 desktop main host 消费；app 全源 `@opencode/gui-extensions` import specifier 集合**恰为 `{sdk(34), sdk/bridge(8), renderer(2), updater(1)}`**——**零 `main`/`sdk/main` import**；app/src `from "electron"` import 形态零命中（唯一 grep 命中为许可证文本内的无关词）。
4. **设置入口双门槛**：`settings/shell.tsx` `const GuiExtensionsSettings = import.meta.env.DEV ? lazy(…) : undefined`（**DEV 构建才存在**——上游面）+ `const guiExtensions = !!GuiExtensionsSettings && platform.platform === "desktop"`（**desktop 平台才可达**——上游面）+ 守卫 `view.tab === "gui-extensions" && !guiExtensions && !mobileGuiExtensions → surface.open("general")`（**issue #26 修订：非桌面平台经 `mobileGuiExtensions` 放行第一方管理面**；上游设置页本身在 prod web 构建仍结构性缺席——本条证据链的「main 进程面不进 app」结论不变）。

**防「全排除」误述——web 上真实运行的是 renderer 侧**：`ExtensionRoot`（`runtime/extension/root.tsx`，`app.tsx` 挂载锚）在 web 照常挂载，`builtins.filter(… !definition.os || (!!os && definition.os.includes(os)))` 仅按 OS 过滤（唯一 os 过滤项 = wsl `os: ["windows"]`，全树唯一）；web 上 `os = platform.platform === "desktop" ? platform.os : undefined` → undefined。renderer 侧贡献（panels/slots/commands/settings pages——**含 details 的移动抽屉**）是**纯 SolidJS UI，经 `useServerSDK()`/client API 读服务端数据**，不存在本地进程执行；`installed.ts` 在无 bridge 时 `bridge ? bridge.manager.initial… : []`、`if (!bridge) return`、`list()=[]`——无 bridge 即无安装/启停生命周期，**GUI 扩展生命周期中依赖主进程 Bridge 的 install/remove/.ocdx 面仍不在 web/手机存在；enable/disable/reload/状态呈现的管理面自 issue #26 起以第一方移动面存在**（见 [gui-extensions.md](gui-extensions.md)；root.tsx 注释逐字「Built-ins only: installed `.ocdx` archives run their main entry until that format ships renderer bundles.」——archive 执行同样挂在 bridge manager 之下，web 不可达）。

**与 #26 的边界（自 issue #26 起为承接声明）**：#15 预留的 GUI 扩展**生命周期管理面**（enable/disable/reload/状态呈现/设置 gui-extensions tab 移动可达）已由 issue #26 交付（M-025 禁用集合并集 + M-026 设置 tab 移动挂载 + mobile-hosts manager 模块，见 [gui-extensions.md](gui-extensions.md)）；本期（#15）只固化「移动不执行主进程扩展代码」的结构性负断言与「两套 extension 面」的区分素材。install/remove/.ocdx 与零扩展商店声明保持（#26 §七）。

## 断开语义专节（验收 3 落字）

- **客户端断开/重连路径对五类能力零副作用调用**：`client/src/solid/connection.ts` 全文零 mcp/agent/command/skill/plugin API 调用（唯一 api 使用为 `api.event.subscribe`；`stop()/resync()/pagehide` 只 abort 本地流）——与 #9 interrupt 三处穷举、#13「Never send stop on client disconnect」、#7 O14「无 disconnect→stop 边」同构。
- **运行时启停只发生在显式用户动作**：mcp.connect/disconnect 调用点恰三文件（上表），全部是用户 toggle/sign-in 触发；语义为**服务端运行时态、直到重启/重连**（`mcp.connect` 描述「overriding a disabled configuration until restart」、`mcp.disconnect`「removing its tools until reconnected」、`mcp.remove`「until restart」）——**MCP server 进程由远端主机承载**，杀 App/断网不动它。
- **断开后重连恢复**：`sync.invalidate()` 全量失效 + 重连同步段五目录重同步（agent/command/mcp.server/mcp.resource/skill）——与 #9 快照恢复口径一致；状态快照（五态）由服务端权威下发，客户端不缓存决策。
- **Windows Desktop 映射（验收 3 后半）**：上游设置/会话面与 Desktop **同一源码面**（本表契约以 vendored 源文件锚逐项映射）；GUI 扩展 main-process 能力（updater/wsl/ssh main/browser CDP）为 Desktop 专属、移动结构性缺席——**属 parity gap 登记归 #1 账本**，本期以源码同源声明+本专节兑现，不虚构独立验证。

## 作用域与安全专节

- **作用域**：五类能力全部是 location（`{ directory }`）作用域的 locationResource——per 服务器+目录；项目级 extensions 面以「global 集 + project 独有集差集」呈现两级；**本面零客户端持久化新增**（extensions.tsx/project-extensions.tsx/mcp-dialog/new-session mcp 全文零 `Persist.*` 调用）；`SettingsServerDataScope` 装配（#14 已锁）保证多服务器布局换 scope。
- **配置安全（沿用 #14 分层结论）**：MCP `RemoteConfig.headers`/`OAuthConfig.client_secret` 等配置值只存服务端 opencode.json；**list 响应零回显**（`Mcp.Server { name, status, integrationID? }` schema 锚）；客户端对 config 文档的唯一读取 = LSP 呈现（`config.list` 的 `info.lsp`）与配置路径复制（`config.get` → 过滤 `\.jsonc?$` document → 远端服务器 = `system.copy(path)` 复制路径；local+desktop 才 `desktop.reveal/launch`——server-panel `ServiceConfigLink` 的 `!local() || desktop` 门，手机恒走 copy-path 分支，零本地文件系统访问）。OAuth 重认证的 client_secret/attempt 交换全在服务端（#14 OAuth 专节结论直接适用）。#4 vault 只管设备侧 SSH 凭据，两套凭据面零交集（分层声明沿用 [providers-models.md](providers-models.md) 凭据分层专节口径）。

## 状态矩阵

| 态 | 触发 | 上游锚点与恢复口径 |
| --- | --- | --- |
| 列表 loading | mcp/plugin 目录同步中 | `data.location.mcp.server.list()` undefined → details 面骨架 `ready` 门 |
| 列表 unavailable | `mcp.list`/`plugin.list` fetch 失败 | `.catch(() => [])` 回落空态（注释逐字见能力来源表）+ `dialog.mcp.empty`/`plugins.empty`/`skills.empty` 空态文案——不崩页 |
| connected | 状态机五态之一 | 四呈现面矩阵见 MCP 专节；toggle = disconnect |
| pending | 连接建立中 | Switch disabled/`toggleMcp` no-op/`useMcpToggle` 快照早退；details 面有 `connecting` 标签（mcp-dialog 无行内标签——两呈现面粒度差异如实） |
| disabled | 配置在册未连 | toggle = connect（「overriding a disabled configuration until restart」） |
| failed { error } | 连接失败 | 行内/tooltip error 呈现；toggle = connect 重试；**toggle 后终态复查 failed → throw → `common.requestFailed` toast**（注释逐字见 MCP 专节） |
| needs_auth | OAuth 过期/未认证 | toggle = authenticate → 重认证流（MCP 专节三处）；interactiveForm 错误形态（`mcp.auth.interactiveForm`/`requires an interactive authentication form`/`mcp.interactiveAuth`）；`mcp.status.changed` 回推闭环 |
| 事件回推（stale 防护） | 服务端状态变更 | 五事件（`mcp.status.changed`/`mcp.resources.changed`/`agent.updated`/`command.updated`/`skill.updated`/`plugin.updated`）+ 重连全量失效重同步；toggle 流程内自防陈旧（动作后重读 current 决策） |
| prepare 门失败 | new-session 发送前复查 | `session.summary.mcp.unavailable`（catalog 缺失）/`signInBeforeSend`（needs_auth）/`notReady`（未达期望态）→ toast `prepareFailed` |
| LSP loadFailed | project config 读取失败 | `project.settings.extensions.lsp.loadFailed` + retry 按钮（`config.refetch()`） |
| plugin 行 | `plugin.list` 行（builtin 过滤后只读） | `plugin.state` active/failed 呈现；check/update 零 UI 调用（能力边界） |
| agents/commands/skills | 只读呈现 | @-mention//slash 注入 + 设置只读列表 + skills 外链；无任何配置 UI（能力边界） |
| offline/断开 | 客户端断连 | 见断开语义专节：零副作用调用；重连快照补齐 |

## 能力边界专节（上游实态，非本期缺口，防误述）

1. **MCP 配置增删改无客户端 UI**：`mcp.add`/`mcp.remove` 协议在册、promise 生成客户端在册，app/gui-extensions 源码零调用——配置管理指回 opencode.json（`settings.extensions.manageConfig`「Manage in opencode.json」文案自证）。
2. **`config.update` 客户端 stub**：`runtime/server/sync.tsx` `updateConfigMutation` 注释逐字 `// TODO: Restore config updates when the V2 client exposes a config API.` + `throw new Error(\`Config updates are unavailable: …fields were not saved\`)`——设置面不改服务端 opencode.json。
3. **agents/commands/skills 只读呈现**：无任何客户端配置 UI（源头是服务端 opencode.json/文件，注册语义引缓存分层）。
4. **`plugin.check`/`plugin.update` 零 UI 调用方**（promise 生成客户端在册，`check:`/`update:` 行在册）。
5. **`session.skill` 端点零 UI 调用**（experimental，生成客户端在册）。
6. **GUI 扩展上游设置面 desktop+DEV-only**：`settings.guiExtensions.*` i18n en 9 键 / zh 9 键（issue #26 起对齐——此前 en 8/zh 0 的诚实缺口已由 M-026 mobile.description 与 zh 全量补齐关闭，见 [gui-extensions.md](gui-extensions.md) §四）；上游设置页本体仍 desktop+DEV 专属，移动可达的是 #26 第一方管理面。
7. **`mcp-dialog` pending 态无行内标签**（Switch disabled；details 面有 `connecting` 标签——两呈现面粒度差异如实）。
8. **`mcp.clientToken`/`mcp.client`** 客户端反向托管 MCP（浏览器作 MCP server）experimental 面移动语义未核对（归 G26 备查，不预设）。

## 门禁与验证

- **G26**（[../interaction.md](../interaction.md) 新设）：agent 能力面运行期真机清单十项（①移动入口可达四路（设置 extensions 双布局 + 项目级 extensions + /mcp + 更多抽屉 details server 面板）；②MCP 五态呈现与 toggle 全链（真实远端 MCP 服务）；③MCP needs_auth 重认证（外跳实态——issue #76 后=files 桥 ACTION_VIEW + 强制策略/Toast，见 G26③ 注记 G25③ 同源核对 + `mcp.status.changed` 回推 + interactiveForm 错误呈现）；④new-session MCP 控件与 prepare 门三失败形态；⑤agents/commands/skills 呈现（@-mention//slash/设置只读列表/外链）；⑥区分断言呈现核对（「Manage in opencode.json」文案、移动 gui-extensions tab=#26 第一方管理面（与远程 extensions 三子 tab 的区分保持）；零 GUI 扩展安装入口保持）；⑦断开红线机械核对（MCP 会话中杀 App/断网→远端 MCP server 与任务存活→重连状态快照补齐；直连+SSH 各一遍）；⑧错误路径矩阵；⑨窄屏/读屏/焦点/触摸目标首项核对；⑩SSH/直连双路由 + 真实 MCP 服务（remote OAuth 型 + local stdio 型各一）+ 配置安全负例）。
- 探针：`scripts/verify-agent-capabilities.ts` 七组断言（调用面穷举——具名包含断言+集合外零命中/重认证三处包含断言/GUI 扩展负断言组/数据面五事件/错误恢复链/配置写入边界/零 OS 首扫）——**static STRUCTURE check, no runtime proof**。
- 上游子集：app 组合 64 文件（#14 的 60 + 本期新增 4：`runtime/server/global-sync/mcp.test.ts`、`runtime/server/global-sync/child-store.test.ts`、`settings/workspaces/project-lsp.test.ts`、`runtime/extension/ipc.test.ts`——首跑逐例归因门适用）；gui-extensions 9/session-ui 8/client 9 零新增回归；mobile-hosts 307 零新增。

## 诚实边界

- **G26 全部运行期行为 BLOCKED**（四路入口可达手感、MCP 五态真实呈现与 toggle、外跳实态（issue #76 后=外跳面 + 拒绝 Toast）与重认证回推、prepare 门失败形态、agents/commands/skills 注入呈现、区分断言呈现、断开红线远端存活、错误路径矩阵、抽屉/popover 触屏形态、双路由+真实 MCP 服务+配置安全负例）；G26 未过前本期交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **真实 MCP 服务测试 BLOCKED**（remote OAuth 型需真实 OAuth MCP 服务；local stdio 型需远端主机配置——不允许 fixture 替代）。
- **服务端实现语义来源边界**：agent/command/skill 注册、MCP client 进程管理、plugin 加载在服务端（packages/server、packages/core 不在 `vendor/upstream/packages`——引 `~/.cache/opencode-upstream` @ pin，来源表述同 [../architecture.md](../architecture.md) 先例）；协议/schema/客户端连接器/设置 UI/details 扩展全在闭包内可静态锚定——两类来源在本文显式分层。pin 更新时缓存引文随 PROVENANCE 演练同步。
- **上游能力边界**：见能力边界专节八项——特别不声称「MCP 配置可在手机上增删改」「MCP headers 已受 #4 保险库保护」（正确表述=服务端存储+客户端零回显）；GUI 扩展管理面（enable/disable/reload/状态呈现）自 #26 起为第一方移动面实态（[gui-extensions.md](gui-extensions.md)），但 **install/remove/扩展商店（marketplace）仍为零**——不声称移动存在任何扩展安装能力。
- **details 面装配层无上游直接单测**（server-panel/renderer/panel 上游零直接测试——`configured-lsp.test.ts` 纯逻辑在册）：覆盖=探针（结构）+ V2（构建）+ G26（真机）三层，与 #10–#13 同型。
- **stories/浏览器测试**（pairing/page.stories、ssh/dialog.stories 等）需浏览器环境——BLOCKED；`session-ui` component-tests/playwright 既有账本不变。
- 设置单元的其余标签页（general/appearance/notifications/shortcuts/experimental/about）仍为 [../architecture.md](../architecture.md) 未建立契约面；本期仅 extensions 配置面（+gui-extensions tab 的边界事实）建立契约，不声称「设置」整体已交付。
