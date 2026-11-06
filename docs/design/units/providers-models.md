# 单元：远程 Provider 与模型配置（providers-models）

覆盖范围：设置 providers/models 双标签页（已连接列表/五分类来源标签/popular+View all/连接对话框/账号管理/模型目录与可见性）、连接对话框全族（方法选择/key 表单/OAuth 双视图/command 认证/取消/重试）、模型选择器族（select-dialog/tooltip limits/unpaid upsell）、模型作用域与凭据分层。能力全部由上游闭包承载（issue #14 固化契约）；**issue #105/settings-providers-models-extensions 起 providers/models 设置页内面已收敛到 v2.2.1 目标形（第 46 补丁，providers.tsx/models.tsx 目标逐字 + 目录同步重试 + en 26 键增补）**；**issue #141/provider-connect-flow-redesign 起连接对话框全族（controller/dialog/stories）已收敛到 v2.2.1 目标形（第 66 补丁：controller+dialog 目标逐字、command 认证全链、Console/Go 拆分、方法排序、四分组 picker、逐字段表单向导、en 24 键增补 + credentials 三件随目标删除；FU-1 就此交付）**；模型选择器族保持 pin 形——登记为 FU-2（同上）；**issue #142/model-selector-usage-parity 起选择器族（select-dialog/details/manage.css/manage/unpaid/provider-group/search 及 css/stories）与用量查看全流程（app/src/usage/**、/usage.view 命令、usage.limits schema/protocol/client 三层闭合、usage-exceeded standalone 出口）已收敛到 v2.2.1 目标形（第 70 补丁，25 targets；运行期验收见门禁段 BLOCKED 登记），FU-2 就此交付**。「supported providers」的 add 面以 integration catalog 为界——custom provider 保存路径已随 v2.2.1 目标删除（providers/credentials/ 三件整目录移除，见能力边界专节）。来源边界双域声明见「安全与边界」专节。

## 能力来源表

| 面 | 能力 | 上游文件锚（vendored，pin `b4525d79bf`） |
| --- | --- | --- |
| 设置双 tab 与注册 | providers/models 两个设置 tab（pageIcons/pageLabels 注册、设置搜索索引 `connect api key credentials`/`model picker visibility`）；单服务器布局 RootSettings 直挂 + 多服务器布局 per-server 条目（`server:<key>` → `ServerSettings`，nestedServerTabs 含 serverTabs）双入口；两处挂载都包在 `SettingsServerDataScope`（`ServerProvider conn` + `ModelsProvider directory`）内，页内 `useServerSDK()`/`useData()` 读当前选中服务器 | `app/src/settings/pages.ts`、`app/src/settings/search-catalog.ts`（`{ tab: "providers", … keywords: "connect api key credentials" }` 与 `{ tab: "models", … keywords: "model picker visibility" }`）、`app/src/settings/shell.tsx`（`serverTabs`/`nestedServerTabs = [general, ...serverTabs]`/守卫 `["projects","workspaces","providers","models","extensions"].includes(view.tab)` 弹回 general）、`app/src/settings/server-scope.tsx` |
| providers 页（**#105/settings-providers-models-extensions 起目标逐字**） | connected 列表（integration.connections 驱动）、来源五分类 `env\|api\|account\|config\|custom`、popular 列表 + View all（#105 设备 QA：View all 打开连接对话框——**#141 起对话框为目标形四分组 picker，Other/Custom 入口随目标移除**）、连接对话框挂载 `DialogConnectProvider`（**#141 契约：原 6 props 全保留 + 新增 `standalone?`；7 个消费方零改动**）、断开链（`integration.get` → 逐凭据 `credential.remove` → toast；失败 `formatServerError` 回滚 remove 态）、Console 分组展开（`providerID === CONSOLE_INTEGRATION` 目标判定——**#141 起 `CONSOLE_PROVIDERS`/`consoleIntegration`/`keyProvider` 已随 controller 目标化删除，Go 用自有方法**）、header 服务器切换槽（`headerAction`，#102 回归面） | `app/src/settings/providers/providers.tsx`（目标逐字，10 行增量：JSX import/headerAction/min-w-0+插槽/Console 判定目标形） |
| 账号管理 | AccountMenu（radio 切换 activate/重命名 rename/移除 remove）→ `credential.activate\|update\|remove` + `refresh`（invalidate+sync integration/provider/model 三目录）+ Console 场景 `settle` 轮询（10s 上限、250ms 步进） | `app/src/settings/providers/account-actions.ts`（`sdk.api.credential` 三方法均为**跨行书写**的元数据操作）+ `accounts.ts`/`account-name.tsx`（active-first 凭据序） |
| 连接对话框（**#141/provider-connect-flow-redesign 起目标逐字**） | 方法选择（`connectMethods(integration)` 排序：browser/command 在前、API key 恒最后——注释逐字「Same order as the TUI」；env 方法过滤，env-only 集成渲染禁用行 + `dialog.provider.environmentOnly`；单方法自动开始）、key 表单（`integration.connect.key`）、OAuth 双视图（auto 轮询/code 粘贴）、**command 认证全链（`integration.command.connect` → `command.waiting` + CommandView 输出流 → `command.status` 500ms 轮询 → complete/failed/expired；`command.cancel` 双站点）**、逐字段表单向导（string/number/integer/boolean RadioGroup/multiselect Checkbox 含 minItems/maxItems/selectOne/external 链接「I finished」门控）、三重回退（copy-link/code 粘贴/确认码对照）、取消（卸载 `oauth.cancel`/`command.cancel`）、picker 四分组（connected/mcp/popular/services + 账号徽标/needsSignIn 警示）、账号面包屑 + hover-reveal 菜单 + selectAccount/remove-last-disconnects、`chatgpt-plan-welcome.v1` 欢迎页一次性标记 | `app/src/providers/connect/controller.ts`（**目标逐字**，553→628 行）+ `connect/dialog.tsx`（**目标逐字**，1617→1813 行；`copyLink` 走 `platform.writeClipboardText ?? navigator.clipboard.writeText`；`OAuthCodeView`/`OAuthAutoView` 按 `mode === "code"` 分派）+ `connect/remote.tsx`（RemoteAuthNotice）+ `connect/connect-methods.test.ts`（**#141 新增第一方纯函数测试**：connectMethods 排序/env 过滤 + providerFormDefaults when 条件 10 例） |
| 模型目录与可见性 | useModels 控制器全集：列表/搜索/按 provider 分组折叠（折叠态持久化）/每模型可见性开关/默认可见规则（hide→不显示、show→显示、每 family 最新→显示、无解析发布日期→显示）/recent 上限 5/variant 偏好；**#105/settings-providers-models-extensions：settings 页目标形（headerAction + header-actions 插槽目标原生），与选择器 pin 形共用 `useModels`**（S24 现形一致性由共享控制器承载；选择器族目标形=FU-2） | `app/src/providers/models/models.tsx`（pin 形，FU-2 范围）（`visible()` 的 default 规则、`RECENT_LIMIT = 5`）+ `app/src/settings/models/models.tsx`（**目标逐字**，6 行增量）（`Persist.serverGlobal(serverSdk.scope, "settings-v2.models.providers")` 折叠记录、`useFilteredList` key `provider.id:model.id`） |
| 模型选择器族（**#142/model-selector-usage-parity 起目标逐字**） | select-dialog 目标形（搜索/分组/favorite+recent/每模型可见性 Switch/ModelDetails 面板/ModelUsageTag/safe-triangle/keybind 提示/consoleProviderName/Manage 入口懒加载 manage）；free/paid 分组（opencode 目录免费判定）；tooltip 呈现 limits（上下文窗口 `limit.context.toLocaleString()`）；付费模型未连接 upsell 对话框（目标给 `DialogConnectProvider` 传 `selection={model}`）；Agent Android 可达性修复（session-agent-selector 双 hunk：shouldShowAgentSelector + agentsVisible 拆分）原样保留、agent.ts/selection.tsx 零触碰 | `app/src/providers/models/{details.tsx,manage.css}`（**NEW**）+ `{select-dialog.tsx,select-dialog.css,select-dialog.stories.tsx,manage.tsx,unpaid.tsx,unpaid.stories.tsx,provider-group.tsx,search.ts}`（目标逐字）+ 零触碰目标形 `models.tsx/models.test.ts/tooltip.tsx/configured.ts/variant.ts/variant.test.ts/search.test.ts/agent.test.ts`（free 判定锚不变；`normalizeModelSearch/compactModelSearch/CustomManagedProviderIcon` 随目标去导出、外部消费者为零） |
| 用量查看全流程（**#142 新增**） | `/usage.view` 命令（composer viewCommand 类目，末条 assistant 消息 `error?.status === 402` → credits 形态）；DialogUsage 五态（loading/signed-out/服务不支持/失败重试/预算数据）与不伪造额度（无数据即空态/错误态）；usage 面内 Switch model 出口（选择器弹出、选择 per 服务器+目录）；额度不足（402/预算拒绝）→ usage 缓存失效 + 连接对话框 standalone 出口；usage-exceeded Go upsell `onClose` 的 DialogConnectProvider 加 `standalone`（消费 #141 契约） | `app/src/usage/{dialog.tsx,dialog.css,format.ts,limits.ts,limits.test.ts,model.tsx,dialog.stories.tsx}`（**NEW 目标逐字**）+ `composer/commands.tsx`（目标逐字：useData/params/viewUsage/usage.view 注册）+ `client/src/solid/data.ts`（`refreshUsageLimits`「仅对已读位置刷新」门 + `usageLimits` locationResource + location store `usageLimits?`/`usage.limits` 返回值 + `session.step.failed` provider.budget-limit/model-budget-limit、credential.updated/switched、integration.updated 三处刷新）+ `session/usage-exceeded-dialogs.tsx`（1 行 standalone） |
| 作用域装配 | 模型选择 per 服务器+目录持久化（ServerScope 键控）；服务端会话权威（`session.model.selected`/`session.agent.selected` 事件 reconcile；`session.deleted` 清键）；跨路由 handoff 以 `ScopedKey.from(scope, dir, id)` 复合键 | `app/src/providers/models/selection.tsx`（`Persist.serverWorkspace(serverSDK.scope, sdk().directory, "model-selection")`）+ `app/src/runtime/server/scope.ts`（`ServerScope.fromServerKey`/`ScopedKey.from`） |

## 数据与端点契约

端点全部引用 vendored 生成面（`packages/protocol/src/groups/{integration,credential}.ts` 协议描述 + `packages/schema/src/{integration,connection,credential,model}.ts` 类型），不另行定义契约。location 均为 `{ directory }`（可选）。

**目录同步重试（#105/settings-providers-models-extensions 新增）**：`providers/catalog/providers.ts` 的 `syncWhileBooting`（目标 10 行）= 12 次重试、1s 起步 5s 封顶、仅 `isServiceUnavailableError` 门——包住 provider+model 目录同步（冷 Location 需等插件激活，可能超过服务端 5s 等待）；`useProviders` 签名不变。风险边界（在册）：慢服务器最多被拖 ~40s——QA 若见病态等待降级为 defer-list（本轮环境未复现：远端服务下线即同步失败）。

**mcp.ts 命名注记**：见上方端点表后注；接收者形态由 verify-agent-capabilities 组 1 钉定（`serverSDK\.api\s*\.\s*mcp` 容忍扫描 + 组 6 `api.mcp.connect` 形态零负）。

**integration 组（九端点，协议描述闭包内逐字）**：

| 端点 | 方法+路径 | 调用方（app+gui-extensions `src/**` 归一扫描） | 协议描述（闭包内逐字） |
| --- | --- | --- | --- |
| `integration.list` | GET `/api/integration` | 无 API 直调——经 client solid 数据层目录同步（`data.location.integration.list(…)` accessor 读取恰 {`providers/catalog/integrations.ts`, `providers/models/select-dialog.tsx`}） | "Retrieve available integrations and their authentication methods." |
| `integration.get` | GET `/api/integration/:integrationID` | 恰 {`settings/providers/providers.tsx`（disconnect 前取凭据）、`providers/connect/controller.ts`（方法目录）、`providers/connect/mcp.ts` + `runtime/server/sync.tsx` + gui-ext `details/server-panel.tsx`（三者均为 MCP `needs_auth` 重认证面：mcp.list → integration.get → oauth.connect）} | "Retrieve one integration and its authentication methods." |
| `integration.wellknown.add` | POST `/api/experimental/integration/wellknown` | 无调用方（experimental 面，移动可达性未核对） | "Discover and persist an experimental wellknown integration source." |
| `integration.connect.key` | POST `…/connect/key` | 恰 `providers/connect/controller.ts`（`connectKey`） | "Run a key authentication method and store the resulting credential." |
| `integration.connect.external` | POST `…/connect/external` | 恰 `providers/connect/controller.ts`（external 分支） | "Run an external authentication method and store a reference to its credential source." |
| `integration.oauth.connect` | POST `…/connect/oauth` | 恰 {`providers/connect/controller.ts`（`select`）, `providers/connect/mcp.ts`、`runtime/server/sync.tsx`、gui-ext `details/server-panel.tsx`（MCP needs_auth 重认证）} | "Start an OAuth attempt and return the authorization details." |

**mcp.connect/disconnect 命名注记（#105/settings-providers-models-extensions）**：`providers/connect/mcp.ts` 目标增量保留 pin 生成客户端命名 `serverSDK.api.mcp.connect/disconnect`（单一 mobile hunk）——线等价：本 vendored 客户端 mcp 组直接拨 `/api/experimental/mcp/:server/*` 路径，且目标的生成客户端自身保留 deprecated 别名 `client.mcp.connect = client.experimental.mcp.connect`（同函数对象）；`api.mcp.list` 两侧不变。
| `integration.oauth.status` | GET `…/connect/oauth/:attemptID` | 恰 `providers/connect/controller.ts`（`poll`，每 `pollInterval ?? 1_000` ms） | "Poll the current status of an OAuth attempt." |
| `integration.oauth.complete` | POST `…/connect/oauth/:attemptID/complete` | 恰 `providers/connect/controller.ts`（`completeCode`） | "Complete a code-based OAuth attempt and store the resulting credential." |
| `integration.oauth.cancel` | DELETE `…/connect/oauth/:attemptID` | 恰 `providers/connect/controller.ts`（两处：`cancelAttempt` 与换代迟到授权补 cancel） | "Cancel an OAuth attempt and release its resources." |

另有 `integration.command.connect/status/cancel` 三端点（command 认证方法，依赖服务端本地进程执行——**#141 起 `providers/connect/controller.ts` 为 app 域唯一调用方**（connect/status 各一处、cancel 两处：卸载与换代补 cancel），移动场景语义归 G25 核对，见能力边界）。

**usage 组（一端点，#142 新增，协议描述闭包内逐字）**：`usage.limits`（GET `/api/experimental/usage/limits`，LocationQuery，success `NullOr(UsageLimits.Info)`，error ServiceUnavailableError；OpenAPI 描述逐字 "Return the OpenCode Go allowance and Console budgets of the OpenCode Console workspace the location is signed in to, or null when it isn't signed in."）。调用方恰 `client/src/solid/data.ts` 的 `usageLimits` locationResource（`api().experimental.usage.limits({ location })`）。schema 依据 `packages/schema/src/usage-limits.ts`（Meter/Go/BudgetModel/Budget/Info + Money.USD/USDPerMillionTokens；经 `@opencode/schema/usage-limits` exports 通配解析，index.ts 零改动）。客户端生成类型 `UsageLimitsInfo/Go/Meter/Budget/BudgetModel` + `ExperimentalUsageLimits{Input,Output}` + deprecated 别名随 #142 补入 generated/types.ts，`usage.limits` 方法入 generated/client.ts 的 `experimental:` 块（`file:` 块零触碰，前像 = 0..57 重放后形态）。

**credential 组（五端点）**：`credential.list`（GET，OpenAPI 描述逐字 "List every stored integration credential, **including its secret value**."——app/gui-extensions/session-ui 源码零调用，见凭据分层专节）、`credential.create`（零调用——存储经 `integration.connect.*` 间接完成）、`credential.update`（恰 `account-actions.ts` rename）、`credential.activate`（恰 `account-actions.ts` activate）、`credential.remove`（恰 {`settings/providers/providers.tsx`, `settings/providers/account-actions.ts`}）。

**类型**：`Integration.Info { id, name, methods[], connections: Connection.Info[] }`；`Integration.Method` 五分类 tagged union（oauth/command/key/external/env）；`Integration.Attempt { attemptID, url, instructions, mode: Literals(["auto","code"]), time: { created, expires } }`；`Integration.AttemptStatus` 四态 pending/complete/failed(message)/expired；`Connection.Info` = `CredentialInfo { id, label, method: Literals(["key","oauth","external"]), status? }` | `EnvInfo { name, status? }`（**客户端只见元数据，无凭据值字段**）；`Connection.Status { status: Literals(["needs_auth"]), message, url? }`（schema 注释逐字：「`needs_auth` asks the user to sign in again: at `url` when set (the credential itself stays valid), otherwise by reconnecting the integration」）；`Credential.Entry { id, integrationID, label, active, value: OAuth{refresh,access,expires}|Key|External }`（**服务端存储权威**）；`Model.Info` 的 `limit: { context, input?, output }`（input 为 optional）与 `cost: Array(Cost)` 随 catalog 下发，tooltip 消费 `limit.context`。

**事件（SSE，`client/src/solid/data.ts`）**：`credential.updated` → integration 目录 invalidate+resync；`credential.switched` → connections 重序（active 提前）+ model/provider invalidate；`integration.updated` → integration/model/provider 三目录 invalidate+sync。**凭据刷新只动目录数据，不触碰客户端 host/project/session 状态键**。

## OAuth 与回跳专节（验收 2 落字）

**结构性结论（本单元核心事实）：OAuth 完成检测是客户端对服务端 attempt 的轮询（`integration.oauth.status`），授权回调由 Console/provider 打向 OpenCode 服务端——移动壳无需 deep-link 回跳即可走通协议流。** 客户端从不接收 OAuth redirect；桌面专属分支以 `platform.platform === "desktop"` 门控（`client_id=opencode-desktop` + `return_window`——「Lets the Console return link focus the window that started the sign-in」），web 恒不触发。

流形态：方法选择 → `oauth.connect`（返回 Attempt）→ `auth.waiting` + `open()`（`if (platform.openBrowser) return platform.openBrowser(url); platform.openExternal(url); return true`）→ auto 模式每 1s `poll` → complete → `finish()`（invalidate+sync integration/provider/model 三目录 → `state: "ready"`）。`mode: "code"` 时走 `OAuthCodeView`（授权码表单 → `oauth.complete` POST code，纯服务端完成，无需任何回跳）。

**web 平台实态（防误述；跨效应注记 issue #76）**：`runtime/platform/web.ts` 无 `openBrowser` 实现；`openExternal` 上游门仅放行 `http:`/`https:`/`mailto:`（files-open-external 后**逐字保留**）→ 外跳调用点已改为 `void activeFilesPort().openExternal(url.href)`（files 桥 ACTION_VIEW 外跳 + native `ExternalOpenPolicy` 强制 http/https、mailto native 拒绝为在册 delta + 失败固定文案 Toast），且调用后恒返回 true——**`browserFailed` 态在 web 平台不可达**（该 UI 只对实现了 openBrowser 的平台有意义；client 永不 throw，不可达性保持）。

**三重回退（上游自带）**：①copy-link（Console 与 OAuth 视图均有入口）；②code 粘贴模式；③auto 视图的确认码对照（`user_code` 自授权 URL searchParams 或 instructions 提取，只读可复制）。

**冷/热回跳实态**：热=切出完成授权→切回，1s 轮询仍在（对话框未销毁）→ complete → 目录刷新；冷=杀 App → 对话框状态丢失（settings 路由为 URL 驱动 `/settings?server=…&tab=…`，surface 无持久化）→ 重开后重新发起连接；未及 cancel 的 in-flight attempt 靠服务端 `Attempt.time.expires` 自然过期收敛，无客户端残留（上游无跨进程 attempt 恢复面）。

**取消双路径**：对话框卸载 `onCleanup` → `cancelAttempt()`（`oauth.cancel` DELETE 释放服务端资源）+ `cancelPolling()` generation 失效；授权请求迟到（已换代）时对返回的 attempt 补 cancel。

**壳层能力边界（如实登记；issue #76 交付更新）**：壳无 VIEW intent-filter（`MainActivity.kt` 注释逐字「Not implemented (TODO): deep links (no VIEW intent-filter is registered)…」——入站面不变，外链唤起已确认不实施（决策 0007，2026-10-31））；**外跳浏览器 seam 已随 issue #76 落定**：FilesBridge 第四 op `openExternal` + native `ExternalOpenPolicy`（http/https 强制、拒绝/失败固定文案 Toast）经 files-open-external 承接 `window.open`——既往「`window.open("_blank")` 在壳 WebView 内的实际行为（同窗导航 vs 静默阻断）是唯一真实不确定点」的表述已随该交付消解，G25③ 首项实测对象改为外跳面浏览器打开实态（QA-1）与拒绝路径 Toast（QA-2/QA-3）。协议流本身不依赖回跳（轮询），三回退中 copy-link 与 code 粘贴在「能切出 App 手动完成」的前提下可用。

**凭据刷新/过期**：OAuth token 刷新是服务端行为（`Credential.OAuth { refresh, access, expires }`——secret 只存服务端）；客户端可见的失效形态=`Connection.Status.needs_auth`（重新走 connect 流程）；服务端凭据变更经 SSE 事件推进客户端（见契约表）——凭据刷新不触碰客户端任何 host/project/session 状态键（host/project/session 由 ServerScope 机制承载，凭据面与状态面正交）。

## 凭据分层专节（验收 3 落字）

**#4 vault 管「设备侧 SSH 凭据」（私钥/passphrase，`mobile-credential:<id>` 引用、Keystore AES-GCM 信封 v1，见 [connection.md](connection.md)）；provider API key/OAuth token 不经过设备存储**——只在 HTTP 请求体中穿过 SSH 隧道回环口/HTTPS 到远端服务端，存储权威是服务端 credential store（`Credential.Entry`）。两套凭据面零交集、零代码衔接点——是**分层而非衔接**关系。AGENTS.md「设备端凭据使用平台安全能力保护」由「provider 凭据根本不落地设备」的更强形态满足；「不放入 WebView 的普通 localStorage」由持久化键穷举负断言锁定（下）。

- **写路径**：API key=`integration.connect.key` POST payload（key 值仅在连接对话框内存态 formStore 中，提交后不落任何本地存储）；OAuth=`oauth.connect`/`oauth.complete` 服务端换取并存储；custom 表单（若未来启用）支持 `{env:VAR}` 间接引用。
- **读路径负断言**：`credential.list` 在协议在册且描述含 "including its secret value"——**app/gui-extensions/session-ui 源码零调用**（`api.credential` 调用恰为 providers.tsx `remove` + account-actions.ts `activate|remove|update`，全是元数据操作）；`credential.create` 同样零调用。
- **持久化键穷举（实测恰三）**：provider 域（settings/providers + settings/models + providers/）恰三个 `Persist.*` 调用——`selection.tsx` 的 `Persist.serverWorkspace(…, "model-selection")`（providerID/modelID/variant/agent，无凭据）、`settings/models/models.tsx` 的 `Persist.serverGlobal(…, "settings-v2.models.providers")`（collapsed 布尔）、`connect/dialog.tsx` 的 `Persist.global("chatgpt-plan-welcome.v1")`（seen 布尔）——全部非凭据载荷。
- **RemoteAuthNotice（SSH 路由用户提示锚）**：非 builtin 且非 loopback（`["localhost","127.0.0.1","[::1]"]`）的服务器连接时显示 notice——「Your OpenCode credentials will be stored on this server. Models will be available through this server.」（移动 SSH 主机为 extension 型、非 builtin，命中该提示）。

## 作用域专节（验收 3 落字）

- **选择持久化**：`Persist.serverWorkspace(serverSDK.scope, sdk().directory, "model-selection")`——per 服务器+目录；scope 机制=`runtime/server/scope.ts`（`ServerScope.fromServerKey`、`ScopedKey.from`）；会话级选择存 `saved.session[sessionID]`，跨路由 handoff 以 `ScopedKey.from(scope, dir, id)` 复合键；会话删除清键。
- **服务端权威与 reconcile**：`session.model.selected`/`session.agent.selected` 事件 reconcile；`durable()?.model`（服务端读）优先于本地 draft 的确认链；模型变更经会话 API 提交到远端会话——模型选择的服务端真相在会话上，客户端 draft 仅在确认前本地。
- **装配 scope**：`SettingsServerDataScope`（ServerProvider conn + ModelsProvider directory）——多服务器布局下 per-server entry 天然换 scope；`ServerRef` 活 getter 语义（#6/#13 已锁）保证隧道换端口后 scope 键不变。
- **全局例外（如实，防「已隔离」误述）**：模型可见性/recent/variant 偏好 = `Persist.global("model")`（`runtime/server/runtime.tsx` `createGlobalModels`）——**跨服务器全局**（上游实态）。影响面=模型列表的可见性过滤、recent 排序与 variant 偏好，**不是「会话模型选择」本身**；验收「Keep model changes scoped to selected remote identity」的承诺对象=会话模型选择与 provider/model 目录（均按 ServerScope/服务端作用域）。不虚构偏好级隔离。

## no local model/tool execution 专节（验收 3 落字）

- **零 AI SDK import**：`@opencode/ai`（闭包内 `packages/ai`，服务端 LLM 客户端）的 package.json 级消费恰 {ai 自身, plugin}；app/client/gui-extensions/session-ui 四包 src 域 `from "@opencode/ai"` / `from "@ai-sdk/…"` / `from "@anthropic-ai"` / `from "openai"` **import 语句形态零命中**。**三类数据字符串误中面（如实列明防误读）**：`select-dialog.stories.tsx` 的 `npm: "@opencode/ai/providers/openai"`（story fixture 元数据字符串，非 import）、`credentials/form.ts` 的 `OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"`（**正锚**：custom provider 配置里声明**服务端应加载的 npm 包名**——模型调用在服务端执行的正面语义锚）、`runtime/server/global-sync/utils.test.ts` 与两个 stories 文件的 `@ai-sdk/*` fixture 串。app/package.json 零 `ai`/`@ai-sdk/*`/`openai`/`anthropic` 依赖键。
- **工具执行**：客户端工具渲染（session-ui `tools/*`）只是事件投影（#9 已锁）；执行面在服务端。mobile-hosts 全域 `api.credential|api.integration|api.provider` 零命中——共享层零 provider 面介入。

## 状态矩阵

| 态 | 触发 | 上游锚点与恢复口径 |
| --- | --- | --- |
| 方法选择 | 打开连接对话框 | **#141 目标形**：`connectMethods` 排序（browser/command 在前、key 恒最后）；env-only 集成 = 空方法列表 → environmentOnly 禁用行（**不再回退 key 表单**）；单方法自动开始；`manual` 门控跳过自动 |
| key 表单 | 选 key 方法 | required/格式校验（上游 form）；提交 `connectKey` → `integration.connect.key`；失败 `formatServerError` toast/行内 |
| oauth pending | 选 oauth 方法 | `auth.pending` → `oauth.connect`；startFailed → Console 专属文案或 formatServerError |
| oauth waiting | attempt 建立 | waiting 态 + open() 拉浏览器 + 确认码对照（`user_code`）；code 模式走 OAuthCodeView 表单 |
| oauth 轮询中 | auto 模式 | 每 1s `oauth.status`；complete → `refreshing`（三目录 invalidate+sync）→ `ready` |
| oauth failed | status failed | Console 专属 `expired_token`/`access_denied` 文案映射，否则透传 message；retry 重选方法重发起 |
| oauth expired | status expired | Console/通用 `expired` 文案（**en、zh 回退**——i18n 实态见能力边界）；retry 重发起 |
| command waiting | 选 command 方法（**#141 新增**） | `command.connect`（无表单）→ `command.waiting` + CommandView（`provider.connect.command.waiting` + output `<pre data-component="provider-connect-command-output">`）；服务端本地进程执行（语义归 G25，见能力边界） |
| command 轮询中 | command attempt 建立（**#141 新增**） | 每 500ms `command.status`；pending → 写 `command.output`（`status.message ?? ""`）；complete → `finish()` |
| command failed/expired | status failed/未知终态（**#141 新增**） | failed 透传 message；其余未知终态复用 `provider.connect.command.expired` 文案（目标逐字语义） |
| env-only 集成行 | 集成仅 env 方法（**#141 新增**） | picker 行禁用 + `dialog.provider.environmentOnly` 文案 + 图标 50% 透明；无可连方法且无账号 |
| 账号 needsSignIn | connection.status = needs_auth（**#141 新增呈现**） | picker 行 `needsSignIn` 警示（`--v2-state-fg-warning`）；providers 设置页行内状态仍不渲染（上游实态，见能力边界 2） |
| statusFailed | 轮询请求失败 | `retry()` 恢复轮询**既有** attempt（注释逐字「The attempt is still open on the server; a retry resumes polling it」），不新建 |
| 浏览器打开失败 | open() 返回 false | `browserFailed` 态 + copy-link/code 回退入口；**web 平台不可达**（openExternal void 链恒 true） |
| 取消 | 对话框关闭/卸载 | `onCleanup` → `cancelAttempt`（`oauth.cancel` DELETE，服务端释放）+ `cancelPolling`；服务端 attempt 终止 |
| 冷回跳 | 杀 App 后重开 | 对话框状态丢失（settings 路由 URL 驱动、surface 无持久化）→ 重新发起；旧 attempt 服务端 `time.expires` 过期收敛 |
| needs_auth 失效 | 凭据失效（refresh 失败等） | `Connection.Status.needs_auth`（「asks the user to sign in again」）；**providers 设置页不渲染该行内状态**（上游实态）——用户可见路径=模型调用失败或重新走 connect；呈现充分性归 G25⑤ 核对 |
| 断开 disconnect | 连接行 Disconnect | `integration.get` → 逐凭据 `credential.remove` → 目录收缩 toast；失败 `formatServerError` + 回滚 remove 态（行恢复） |
| 账号操作 | AccountMenu | radio activate（`credential.activate`+refresh+Console settle 轮询）/rename（`credential.update`）/remove（`credential.remove`，final 时走断开文案）；每步失败 formatServerError toast |
| 模型目录 loading | catalog 同步中 | `list.grouped.loading` → loading 文案 |
| 模型目录 empty | catalog 空 | `dialog.model.empty` 空态；搜索无结果走 SettingsSearchEmpty |
| 可见性变更 | 每模型 Switch | `setVisibility`（show/hide 写入 `Persist.global("model")` user 记录——全局偏好，见作用域专节例外） |
| provider reveal | providers 页模型联动 | `provider` prop → models 页展开对应分组并滚动定位（保持其它 provider 折叠布局） |
| 付费未连接 upsell | 选择未连接付费模型 | `DialogSelectModelUnpaid`（`unpaid.tsx`，#142 目标形：`DialogConnectProvider selection={model}`） |
| usage loading（**#142 新增**） | 打开 DialogUsage / /usage.view | limits 资源首次 sync（`syncWhileBooting` 域外；usage 面按 `refreshUsageLimits`「仅对已读位置刷新」门惰性加载） |
| usage signed-out（**#142 新增**） | location 未连接 Console（服务返回 null） | `usage.signedOut.title/body` 空态 + 连接出口；不伪造任何数字 |
| usage 服务不支持（**#142 新增**） | 实例无 `/api/experimental/usage/limits` 路由（503/404 形） | `usage.error` + Try again（`usage.retry`）可达 |
| usage 失败重试（**#142 新增**） | 网络失败 | error 态 + retry；恢复后重新 sync |
| usage 有数据（**#142 新增**；需已授权 Console 账号） | 返回 `UsageLimits.Info` | Go 三窗口（rolling/weekly/monthly）+ Console budgets 呈现；`usage.note.currentModel`/paused 族按目标 |
| usage 额度不足 402（**#142 新增**；需已授权 Console 账号） | 末条 assistant `error.status === 402` 或 `session.step.failed` 的 `provider.budget-limit`/`provider.model-budget-limit` | credits 形态 + Switch model 出口；缓存经 `refreshUsageLimits` 失效 |
| usage 面切模型（**#142 新增**） | Switch model | 选择器弹出（chooseModel 复用）；选择按服务器+目录隔离（`Persist.serverWorkspace("model-selection")`） |

## 能力边界专节（上游实态，非本期缺口，防误述）

1. **custom provider 保存 stub（v2.2.1 已删除；#141 随目标移除）**：上游 v2.2.1 整目录删除 `providers/credentials/`（dialog.tsx/form.ts/form.test.ts 三件，547 行），连接对话框的 Other/Custom 入口（`CUSTOM_ID`/`CustomProviderForm`）随之移除——「supported providers」的 add 面以 integration catalog 为界（**#141 起为唯一形态**，picker 无 Other 分组）。`provider.custom.*` 37 键成为在册死键保留于 en.ts（zh 族原样）；探针以 absence 断言钉定（credentials/ 目录不存在 + dialog 零 CUSTOM_ID/CustomProviderForm）。
2. **provider 行内 needs_auth 状态不渲染**：providers 设置页零 `.status` 引用；`needs_auth` 的消费面在 MCP 集成（`connect/mcp.ts` + mcp-dialog）。
3. **web 平台 `browserFailed` 不可达**（见 OAuth 专节）。
4. **模型可见性/recent/variant 偏好跨服务器全局**（`Persist.global("model")`）。
5. **in-flight OAuth attempt 无跨进程恢复**（冷杀后重新发起，旧 attempt 服务端过期）。
6. **i18n zh 部分覆盖（上游实态）**：`provider.connect.*` en **85 键**（#141 后：71 + `command.*` 2 + `form.*` 12）；zh 恰 **21 键在册**（含 `oauth.code.*` 与 `auto.confirmationCode`），**其余 64 键缺失、经 base 合并回退 en**；`dialog.provider.*` en **33 键**（#141 后：23 + title/description/group.mcp/group.services/environmentOnly/signInRequired/needsSignIn/connected/connections.count ×2），zh 恰 16 键、其余 17 键缺失回退 en——#141 的 24 个新增键全部 en-only（zh 缺失经 base 合并回退 en——与 #105 en-only 先例同型）；目标删除的 49 键（12 连接域 + 37 `provider.custom.*`）作为**在册死键保留于 en.ts**（#105 `dialog.mcp.description` 死键先例；跨 locale 清扫属后续独立事项，zh 现有键零变化）；运行期经 `runtime/i18n/language.tsx` 的 base 合并回退 en（`const base = flatten({ ...en, ...dict })` + `{ ...base, ...flatten(...) }`）——中文用户在连接对话框新面（四分组/向导/command 视图）及 Console OAuth 流程/过期提示等处将见英文混排（已知局限；可接受性与恢复路径可发现性归 G25⑤ 观感核对）。
7. **`integration.command.*` 认证方法**：依赖服务端本地进程执行命令认证。**#141 起 UI/控制器全链已随目标迁入**（connect/waiting/status/cancel + CommandView 输出流），但**移动场景语义未核对**——command 在服务端本地跑进程，移动客户端仅触发与展示；可用性归 G25 如实登记，不预设。

## 安全与边界专节

- **零 OS 条件分支**：扫描域 = `app/src/providers`（41 个 .ts/.tsx，#141 后：−3 credentials 删除 +1 connect-methods.test.ts）+ `app/src/settings/providers`（6）+ `app/src/settings/models`（1）——**代码文件 48 实测**（providers/ 另含 3 个非代码文件：svg + 两个 css，全部文件 51）。四模式（`process.platform`/`navigator.platform`/`node:os`/`require("os")`/`from "os"`）在代码文件域零命中（探针组 7，扫描文件数下限断言 45）。**域外命中注记**：`settings/keybinds/keybinds.tsx` 含 `navigator.platform` 但不在本期域内（keybinds 面不属 provider/model 配置）。**跨探针并集注记**：本域此前未被任何探针覆盖（#8–#13 白名单均不含）——#13 期首扫。
- **凭据单向流**：见凭据分层专节；探针组 1 穷举集合断言锁定（`credential.list|create` 零调用、`credential.remove|activate|update` 恰两文件、`integration.connect.*(key|external)`/`integration.oauth.*` 锚在 protocol 组逐字）。
- **服务端实现语义来源边界**：服务端 credential store、OAuth provider 回调处理、token refresh 逻辑不在闭包（packages/server、packages/core 不在 `vendor/upstream/packages`——引 `~/.cache/opencode-upstream` @ pin，来源表述同 [../architecture.md](../architecture.md) 先例）；协议/schema/客户端连接器/设置 UI 全在闭包内可静态锚定。pin 更新时缓存引文随 PROVENANCE 演练同步。
- **Windows Desktop 证据映射（验收 4）**：上游 provider/model 设置面与 Windows Desktop **同一源码面**（本表与上方契约表以 vendored 源文件锚逐项映射：设置双 tab/连接对话框/选择器即 Desktop 的 settings providers/models 面本身；桌面 stories——`select-dialog.stories.tsx` 等——在册为桌面形态旁证）。深化行为映射归既有「Windows Desktop 行为映射（归 issue #1）」BLOCKED 账本，本期以源码同源声明+本文契约表兑现，不虚构独立验证。

## 门禁与验证

**issue #141 交付验证（2026-11-06，worktree feat--221-provider-auth，base `3310b808`）**：vendor 重放 verify:patches/verify:closure **66/66**（新补丁 `provider-connect-flow-redesign` 11 targets 含 new-file hunk 与 3 个 deletion hunk；负例演练 = deferred+摘除 → closure FAIL（`Only in …connect-methods.test.ts` + 类型差异）→ 还原 PASS）；app 单测（无 seam）基线 627/5/46/44/2010 → 交付 **635/5/46/44/2018**（+10 新测试全绿 − form.test 2 例退册；fail/error 集与基线**逐项全等**，零新失败）；typecheck:tsc **419** 与基线逐文件分布全等；`connect-methods.test.ts` **10 pass/0 fail**；verify-provider-models（组 3 command 钉 + Console/Go absence + custom-provider absence、组 6 正锚退役、组 2/7 域 48 文件）**rc=0**、verify-agent-capabilities（connect dialog 入 consumed-keys 护栏 81 字面量 + ui i18n universe）**rc=0**；build:web + copy **5617 files/149,595,730 bytes**（dist 正例：`dialog.provider.connected`/`provider.connect.form.selectOne` 命中 language chunk、`provider-connect-command-output` 命中 dialog chunk）；leak-scan 高置信恰既有 5 条 fixture 行、audit-secret-persistence PASS；Gradle `:app:testDebugUnitTest :app:assembleDebug` **31/0 + APK `021a315d…`**（`app-debug.apk` 64,282,794 bytes；r1 证据更正：初版 `b1117c40…` 为相对路径误读主检出陈旧 APK，现值为 worktree 在盘产物实测，assembleDebug 重跑 up-to-date 复核一致——详见 build-and-verify.md #141 段）。探针普查 rc=1 集为 main@3310b80 预存漂移（干净 HEAD worktree 同败同文，样本：about-version/appearance/diff/notifications 等 23 项——非本期引入；本轮另将 provider-models/agent-capabilities 两探针自 rc=1 修复至 rc=0）。**真机 QA BLOCKED（无 adb 设备在场，`adb devices` 空）**——入口导航/返回/取消链、Console/Go 分流运行态、localStorage 18/18 红线复验、OAuth/command 真实授权链均待设备与测试实例（缺凭据路径沿用 #105 忠实登记口径）。

**issue #142 交付验证（2026-11-06，worktree feat--221-models-usage，base `c6a31fd148`）**：vendor 重放 verify:patches/verify:closure **70/70** 字节级（新补丁 `model-selector-usage-parity` 25 targets = 11 new-file（usage/** 7 + details.tsx + manage.css + schema usage-limits.ts + protocol groups/usage.ts）+ 14 modified；`session-client-compatibility` 两 hunk 退役（commands.tsx usage.view 移除 hunk、select-dialog drawer/manage 回退 hunk——均被目标形吸收）；负例演练 = deferred+摘除 mobilePatches → closure FAIL（`Only in …/details.tsx|manage.css`）→ 还原 PASS）；重放树 commands.tsx 逐字节含 usage.view 接线（cmp 对 checkpoint 实证，R2 正例）；`test_mobile_patches.py` **8/8**；app 单测基线 **636/5/46/44/1965**（687 tests/129 files）→ 交付 **641/5/46/44/1986**（692 tests/130 files；+5 = `usage/limits.test.ts` 全绿；fail/error 集与基线**逐项全等**——10 失败全为预存 solid server Client-only API 族，stash 双跑对照）；受影响子集 `src/providers/models src/usage src/session src/composer` 207/10/10 → **212/10/10**（+5 pass/+1 文件）；typecheck:tsc **416** 与基线**逐文件分布全等**（83 文件 uniq diff 为空，触碰域零新增）；探针普查 rc=0 集**不缩小**（7→7 pre-build，post-build 7→10：direct-connection/service-ops/ssh 随 dist 重建恢复——#141 同型）；`verify-provider-models` 组 4 锚随目标形修订（integration.updated 首句 refreshUsageLimits，三目录 invalidate 相邻保持）rc=0；leak-scan = 恰既有 5 条 host-credential synthetic fixture 行（新增/修改文件零命中）；audit-secret-persistence **PASS**（A–G 七段，dist 标记命中新 dist）；build:web + copy **5620 files/149,993,084 bytes**（dist 正例：`usage.title`/`command.usage.view`/`model.details.usage` 命中 language chunk、`/api/experimental/usage/limits` 命中 effect+promise chunks）；Gradle `:app:testDebugUnitTest :app:assembleDebug` **31 tests/0 failures**（8 XML）；APK **`6b08ee7b554c0896485f1e46c89c3d8fe404c47a27b726dbeafc90e78937dd13`**（`app-debug.apk` 64,431,345 bytes，绝对路径 worktree 在盘产物）。**真机 QA BLOCKED（MatePad .145 Smart Cover 物理锁触）**：adb connect/覆盖安装（lastUpdateTime 2026-11-06 08:33:49，firstInstallTime 2026-10-28 数据保留）/am start 均成功，但屏显「Smart Cover is enabled. Please adjust your cover to operate the screen」——TP 输入被盖态锁死，WAKEUP/POWER/dismiss-keyguard/BACK/tap 与 `cover_enabled` secure 设置临时切换（已还原）均无效，CDP HTTP 挂起（WebView paused）；选择器族/usage 五态/切模型/键盘/发送一致性/目录未就绪六项均未执行，解除条件 = 物理调整/取下盖后按本轮 APK SHA 复测。

**issue #105 局部 QA（2026-11-01，.145，APK `57eeba6c…`，CDP 注入 + 截图）**：①Providers/Models 页目标形渲染 + header 切换槽双向切换 PASS；②View all→连接对话框（搜索 + Other/Custom 入口——**该入口已随 #141 目标形移除，历史 QA 记录保持原样**）PASS；③三类 SSH 失败面（超时/认证成功但服务拒转/端口拒绝）如实呈现 PASS——本轮三台远端主机全部不可达/远端服务下线，**API key/OAuth 连接链、账号操作、MCP needs_auth 重认证、目录分组/搜索/可见性切换与持久化 BLOCKED（缺凭据+缺可达服务，忠实登记）**；④localStorage 全量 dump QA 前后 18/18 键、零凭据形新键（hosts.v1 保持 credentialRef 引用形）——凭据红线 PASS。

- **G25**（[../interaction.md](../interaction.md) 新设）：provider/model 面运行期真机清单十项（①移动入口可达双布局；②API key 连接全链（真实兼容服务）；③**OAuth 浏览器打开形态（本门禁首项）**——`window.open("_blank")` 壳内实态+热回跳+三回退；④冷回跳/取消/过期/失败呈现；⑤凭据刷新与 needs_auth 呈现充分性+跨回跳 host/project/session 上下文保持+i18n zh 缺失 50 键（7 族）混排观感；⑥model 选择跨服务器作用域隔离机械核对（含偏好全局例外实态）；⑦断开/账号操作链；⑧limits/可用性呈现；⑨窄屏/读屏/焦点/触摸目标首项核对；⑩SSH/直连双路由+真实第三方 provider 授权+凭据负例）。
- 探针：`scripts/verify-provider-models.ts` 六组断言 + 零 OS 首扫（凭据单向流穷举集合/持久化键穷举/OAuth 流形态/服务端权威事件锚/model 作用域/no local execution import 形态负断言）——**static STRUCTURE check, no runtime proof**。
- 上游子集：app 组合 60 文件（#13 的 53 + 本期新增 7：`settings/providers/accounts.test.ts`、`settings/route.test.ts`、`settings/search-results.test.ts`、`providers/credentials/form.test.ts`、`providers/models/{agent,search,variant}.test.ts`——`settings/model.test.ts` 自 #10 起已在册回归，不适用首跑口径）；client 9/session-ui 8/gui-extensions 9 零新增回归；mobile-hosts 307 零新增。

## 诚实边界

- **FU-1 已随 issue #141 交付（2026-11-06，provider-connect-flow-redesign）**：连接对话框族目标重设计（controller 553→628 目标逐字/dialog 1617→1813 目标逐字/dialog.provider.* 键族/stories/go-upsell-hero-art/credentials 三件删除/command 认证全链/Console-Go 拆分）——**运行期行为仍未真机验证**（G25 清单继承，见门禁段 BLOCKED 行）。**FU-2 已随 issue #142 交付（2026-11-06，model-selector-usage-parity）**：模型选择器族目标形 + usage 全流程（usage/**、/usage.view、usage.limits 三层闭合、usage-exceeded standalone）——**运行期行为未真机验证**（设备 Smart Cover 物理锁，见门禁段 #142 BLOCKED 行；G25 清单继承）；models.test.ts/tooltip.tsx 等已目标形文件零触碰，选择器族运行差异归 G25/S24 复验。
- **G25 全部运行期行为 BLOCKED**（入口双布局可达手感、API key 全链、外跳实态（issue #76 后=外跳面浏览器打开 + 拒绝 Toast）与热回跳、冷回跳/取消/过期/失败呈现、needs_auth 呈现充分性与 i18n 混排观感、跨回跳上下文保持、跨服务器作用域隔离、limits/可用性呈现、对话框族触屏形态、凭据存储负例）；G25 未过前本期交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **真实第三方 provider 服务测试 BLOCKED**（OpenAI/Anthropic/Console/Google 等真实账号授权的连接与模型调用——需真实凭据，不允许 fixture 替代）；连接后的真实模型调用子项另需模型授权，单列。
- **壳层能力边界（本期不交付、不预设）**：deep-link 回跳（VIEW intent-filter）与外部浏览器拉起（ACTION_VIEW seam）当前不存在；上游协议流不依赖它们；若 G25 判定需要，归后续壳层 issue（候选含 移动适配候选），交用户决策。
- **上游能力边界**：见能力边界专节七项——特别不声称「OAuth 回跳已适配移动」「provider 凭据已入保险库」「custom provider 可配置」（v2.2.1 已随目标删除该入口）「provider 连接文案已中文化」（zh 缺口 64+17 键回退 en）。
- **装配层上游单测覆盖有限**：providers.tsx/dialog.tsx/selection.tsx 等装配面无上游直接组件测试——覆盖=探针（结构）+ V2（构建）+ G25（真机）三层；纯逻辑部分（accounts/route/form/agent/search/variant/model）已入 app 子集。
- **stories/浏览器测试**（select-dialog.stories、dialog.stories、unpaid.stories）需浏览器环境——BLOCKED。
- 设置单元的其余标签页（general/appearance/notifications/shortcuts/extensions 的 LSP 子面/experimental/about）仍为 [../architecture.md](../architecture.md) 未建立契约面；本期仅 providers/models 配置面建立契约，不声称「设置」整体已交付。
