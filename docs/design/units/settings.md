# 单元：设置框架（外层壳/导航/搜索/服务器上下文）——issue #101（S01–S03）

**状态行：框架已实现（未验证）。** 页面内容 S04+（General 行面细节/Servers 页内面/Providers/Models/Projects/Workspaces/Notifications/About 页内面）归各所属 Issue（#102 起）；Desktop 实机视觉对照 **BLOCKED**（无 Windows 参考端）；真服务失败/恢复路径归 G 门禁。本轮运行证据：[build-and-verify.md issue #101 段](../../build-and-verify.md)。

## 单元边界（A/F 分界）

- **A（本单元，issue #101）**：设置外层壳（`settings/shell.tsx` 单一 RootSettings 布局）、导航（`settings/navigation.tsx`）、路由/视图模型（`settings/route.ts`）、surface 与服务器上下文（`settings/surface.tsx` 的 `surface.server()`/`selectServer`/`openServers`）、搜索（index/catalog/results/UI/focus-reveal）、设置→命令面板桥（`settings/palette.ts` + `shell/commands/palette.ts`）、共享设置 CSS、以及依赖闭包（M-042：sidebar-toggle/sidebar-peek/servers-registry label/ui slash + registry label/hint 块）。
- **F（issue #102 起）**：Servers 页内面（连接行/认证操作）、各配置页内容对齐。A 只搬了壳渲染所需的两个件——目标 `SettingsServerList` 与重定签名后的 `SettingsServerGeneral(entry, onAddServer)`；servers.tsx 其余行/认证内容保持 M-037 态，`ShellSetting` 的 `action` 线程未接（#102 全量迁移时接回，servers.tsx 内有 mobile(M-043) 标注）。
- 单一事实来源：**无第二 current-server 状态**。per-server 页显示哪台服务器由 `surface.server()` 独家决定（解析序：视图 `server` → source server → 本地已连接 → 第一台）；#102 经 `selectServer`/`onServerChange` 消费，不得另存状态。

## 壳/导航契约

- **视图模型**（target 形）：`{ type: "root", tab: SettingsRootTab | SettingsPluginTab, server?: string }` + `{ type: "project", … }`；pin 的 `{ type: "server" }` 嵌套视图与 `parent`/`nestedServerTabs` 已随目标移除（无 per-server 嵌套布局）。
- **`settingsViewRedirect`**：root 视图带 server 而服务器消失 → 原视图去 server（留在同页）；project 视图的服务器不可达（非 starting）→ 落到该服务器的 Projects 页（`{type:"root",tab:"projects",server}`）；服务器不存在 → `{type:"root",tab:"projects"}`。不再弹回 root tabs（M-018 的 pin 守卫由目标结构吸收——servers 组无条件在 nav 中，root tab 永不被重定向）。
- **返回语义链**：搜索选中态 `surface.search.back()`（回搜索前视图）→ 无选中查询 `search.clear()` → `surface.back()`（root 视图 → `common.goBack` 退出设置；project 视图 → 回该服务器 Projects 页）。
- **宽窄断点**：搜索 narrow = `screen.clientWidth < 800`；壳 mobile = `<768px`。宽 = 侧导航分组；窄 = 顶行「返回 + 折叠侧栏切换空间（`CollapsedSidebarToggleSpace` 48px 行）+ mobileAction」+ 分页下拉。
- **导航构成**（目标形）：serverTabs 组（per-server 页）、rootClientTabs+插件页组、servers 组（无条件；单服务器时标签回退 `pageLabels.servers`）、experimental 组、gui-extensions 组（**mobile 面，见下**）、about 组。

## 服务器上下文契约

- `SettingsServerSwitcher`（servers/switcher.tsx，target 逐字）：per-server 页 headerAction 槽；**≤1 服务器不渲染**；菜单 = RadioGroup（健康点 + `ServerLabel` + unreachable 标记）+ 分隔线 + `Manage servers…`（→ servers 页）。
- `SettingsServerUnavailable`（servers/unavailable.tsx，target 逐字）：per-server 页在所选服务器不可达时的整页态，`role="status"`；出口 = Retry（`global.servers.retry()`，等待一轮探测完成）+ Edit（http 服务器 → 编辑对话框；其余 → Manage servers）。服务移除/失效有出口（issue 验收项）。
- 五个 page-glue 文件（providers/models/extensions/projects/workspaces）真实渲染 `settings-tab-header-actions` 插槽（`props.headerAction`），switcher 因此在 per-server 页可达；extensions 页另收 `directory` prop（本轮接受不接线——页内 MCP location 布线归所属页 Issue，props 块有标注）。
- `SettingsServerDataScope`（`server-scope.tsx`）pin↔target **逐字节相同**——本单元仅引用不修改（ServerProvider + ModelsProvider 组合与 `directory` 透传保持原样）。
- `health.ts` 为 target 形（`{status, retry}` 记录 + `stageHealth` + `hostname` 上报）；`runtime.tsx` 仅取 servers 返回块（`health: serverHealth.status, retry: serverHealth.retry`）+ 三处 `serverHealth.status[key]` 下标（:84/:91/:109 守卫）。`serverCtx()` 未授权服务器不发放 ctx。

## 搜索契约

- 组件：`SearchList`/`SearchHighlight`（ui/search-list）+ `Slash` 分隔（ui/slash，M-042 新依赖）；narrow = `<800px`。
- 目录：`createSettingsSearchCatalog()`（search.tsx 内，target 形）= platform/servers/selected/plugins 输入；分组/排序/60 条上限/`rankSettings(query, items)` 两参形（origin/proximity 评分已随目标移除）。
- 聚焦/定位：`surface.search.open(view, id)` 写 `searchActivation`；壳 effect 触发 `revealSettingsSearch(root, view)`——目标 anchor 缺失时**静默 no-op 不崩**（search-reveal.test.ts 锁定该机制；本轮被剪行见下）。
- **mobile(M-044) 剪除三行**：`settings-background-activity`、`settings-timeline-width`、`settings-sounds-interface` 三个目标目录行的 reveal anchor 只存在于 S04+ 页面内容——连同行一起剪除，search-catalog.ts 内留 `mobile(M-044)` owner 标注；各所属页 Issue 恢复行时必须同时恢复页面 anchor（grep `mobile(M-044)` 可审计）。剪除后每个可选中结果都落到真实行。
- 命令面板桥：`createSettingsPaletteEntries()` ≤5 条 `type:"setting"` 行（前缀优先排序、排除 project 实体），select → `surface.search.open(view, id)`；`palette.group.settings` 分类键；`settings.search.focus`（mod+f）隐藏命令保留。
- **#90 回归不复现**：search.tsx 目标原生读 `plugins: surface.plugins.items()`（M-037 修复吸收）；settings-search-plugin.test.tsx 源断言更新为目标形。

## i18n

本轮新增键 **en-only 9 键**：`palette.group.settings`；`settings.server.switcher.label/.unreachable/.manage`；`settings.server.unreachable.title/.description/.retry/.edit`；`server.thisComputer`（M-042 label/hint 链所需——计划原判「pin 已有」经实现核对为 v2.2.1 新增，登记为计划偏差）。zh 回退 en（上游 v2.2.1 实态：八键 zh-miss，`server.thisComputer` 亦 zh-miss），同 M-033/M-034 en-only 先例。

## 移动面挂载（M-044，全部保留）

- **M-008**：`MobileHostManager` 懒挂载为目标 servers `Tabs.Content` 的**第一个子元素**（Show 之上）——空上游列表也渲染。
- **M-026**：`mobileGuiExtensions = platform.platform !== "desktop"` 谓词 + 守卫 `if (view.tab === "gui-extensions" && !mobileGuiExtensions) surface.open("general")` + nav 组 `...(mobileGuiExtensions ? [{ items: guiExtensionsTab… }] : [])` + `<Tabs.Content value="gui-extensions"><Suspense><MobileExtensionManager /></Suspense></Tabs.Content>`（R4-1：目标 shell 无 Suspense——M-044 重加 import，包裹从 pin 逐字保留）。上游 DEV+desktop 面不恢复（目标已移除；DEV 插件面在 PluginSettingsPages/settings-page-dev）。route.ts/pages.ts 的 `"gui-extensions"` root tab 恢复 = **登记的有意偏离**（D4 单元契约；插件页注册表接管时移除）。
- **M-035**：zoom 目录行**不带** `available: "desktop"`（web 可用），search-catalog.ts 内留 `mobile(M-035)` 标注；search-results.test.ts 四处编辑（zoom toContain、font 长度 4、capsule 断言删、注释保留）。

## 状态矩阵（框架层）

| 状态 | 行为 |
| --- | --- |
| 加载 | `useSettingsServersLoaded` 为假时恢复路由不重定向（contributed servers 异步加载） |
| 空 | 无服务器：本地设置可进（General/Appearance/About/Shortcuts/Notifications/Experimental）；per-server 组不可用；switcher 不渲染 |
| 服务器不可达 | per-server 页 → `SettingsServerUnavailable`（Retry/Edit/Manage 出口）；服务器被删 → redirect 去 server |
| 搜索 | 关键词 → 分组结果 → 选中 → focus reveal → back 回搜索前视图；anchor 缺失 no-op 不崩 |
| 边界 | `settings.tab.sshHosts` 键仍在册（live consumer servers/connect/screen.tsx）；`settingsProjects` 导出已移除（四个消费者全部随迁移更新）；`new-session` openWorkspaces 改 `openServers(draft?.server)`（登记偏差——取计划 §2.2 具名备选：复用既有 API 成员、保留 draft 服务器上下文、不为即将重做的 new-session 增设待移除的过渡 shim；评审实证：计划 shim 形 `{root,tab,server}` 经 settingsViewUrl/parseSettingsView 对全部 pin 调用形均可忠实 round-trip（目标 rootTabs 含 per-server tabs），拒绝理由非解析限制。vendored screen.tsx 内注释仍为被取代的旧表述，以本条与 manifest reason 为准） |

## 诚实边界

无 Windows Desktop 参考端（视觉对照 BLOCKED）；真 SSH/直连服务行为、失败反馈、重启恢复归 G 门禁；TalkBack/覆盖面完整走查归 G31；参考 renderer 预检仅组件/响应式级（截图 /tmp，不提交），mobile dev 构建被连接门拦（无活服务不进壳）如实登记。
