# 单元：设置框架（外层壳/导航/搜索/服务器上下文）——issue #101（S01–S03）

**状态行：框架已实现（未验证）。** 页面内容 S04+ 归各所属 Issue：Servers 页内面（#102/M-045）、General/Experimental 偏好页内面（#103/M-046，见下方「偏好页内面」单元）、**Providers/Models/Extensions 页内面（#105/M-048，见下方「供应商/模型/服务端扩展页内面」单元）**、Projects/Workspaces 页内面（#106/M-049）与 **Notifications 页内面（#107/M-050，见下方「通知页内面」单元）已交付**；About 页内面仍归后续 Issue；Desktop 实机视觉对照 **BLOCKED**（无 Windows 参考端）；真服务失败/恢复路径归 G 门禁。本轮运行证据：[build-and-verify.md issue #101/#105/#107 段](../../build-and-verify.md)。

## 单元边界（A/F 分界）

- **A（本单元，issue #101）**：设置外层壳（`settings/shell.tsx` 单一 RootSettings 布局）、导航（`settings/navigation.tsx`）、路由/视图模型（`settings/route.ts`）、surface 与服务器上下文（`settings/surface.tsx` 的 `surface.server()`/`selectServer`/`openServers`）、搜索（index/catalog/results/UI/focus-reveal）、设置→命令面板桥（`settings/palette.ts` + `shell/commands/palette.ts`）、共享设置 CSS、以及依赖闭包（M-042：sidebar-toggle/sidebar-peek/servers-registry label/ui slash + registry label/hint 块）。
- **F（issue #102 已完成 Servers 页部分；issue #103 已完成 General/Experimental 偏好页内面）**：Servers 页内面已随 **M-045**（0045-M-045-servers-page-target-migration.patch，双 manifest 在册第 43 个补丁）迁移至 v2.2.1 目标——`servers.tsx`/`servers/registry/row.tsx` **目标逐字**（SettingsServerGeneral 委托共享 ServerConnectionRow、Shell 段随 `healthy !== false` 健康门显隐、`settings-shell:<key>` 搜索命名线程、死代码 ServerRow 删除）、`redeem.ts` Redemption 去导出；General/Experimental 偏好页内面已随 **M-046**（第 44 个补丁）迁移——`general.tsx` 目标逐字（ShellSetting 的 M-045 action 检字与目标形重合保留，mobile(M-045) 注记随目标删除），详见下方「偏好页内面」单元；`settings/general/controllers.ts` **零改动**（两个既有 mobile hunks 保留：behavior 再导出边界 + pin 的 `config.update` 命名——生成客户端 PATCH `/api/experimental/config` 线等价，verify-appearance-settings 在册钉定，矩阵 S37 记录该保留偏离）。**Providers/Models/Extensions 页内面已随 M-048（第 46 个补丁）迁移至 v2.2.1 目标**——`providers.tsx`/`extensions.tsx`/`models.tsx`/`mcp-dialog.tsx` 目标逐字（M-043 的 headerAction/directory 挂接 hunks 被目标原生吸收）、`mcp.ts` 目标形 + 单一 mobile hunk（pin 生成客户端命名保留，线等价——生成客户端 mcp 组直接拨 `/api/experimental/mcp/…` 路径，目标自身客户端亦保 `client.mcp.*` deprecated 别名）、`runtime/plugin/extension-plugins.tsx` 与 `shell/search-list.css` 为 NEW 目标文件、`catalog/providers.ts` 目标 10 行 syncWhileBooting 重试包装、en 26 键增补（详见下方「供应商/模型/服务端扩展页内面」单元与 [providers-models.md](providers-models.md)/[agent-capabilities.md](agent-capabilities.md)）。其余配置页内容对齐（Notifications/Projects/Workspaces/About 页内面等）仍归后续 issue。
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
- **mobile(M-044) 剪除三行 → 已全部恢复**：`settings-background-activity`、`settings-timeline-width` 两行随 **issue #103/M-046** 连同 general.tsx 真实页面 anchor 一并恢复（搜索命中 → 定位真实行）；`settings-sounds-interface` 随 **issue #107/M-050** 恢复——search-catalog.ts 目录行（target 逐字 8 行）+ notifications.tsx 真实页面 anchor（`data-action="settings-sounds-interface"` Switch）双正锚，设备实测 `interface`/`sound` 查询命中 → 定位真实行在视口内。search-catalog.ts 内 `mobile(M-044)` 剪除注记**已随该行恢复而移除**（grep `mobile(M-044)` 在 search-catalog.ts 现为零命中；route.ts 保留自己的 M-044 注记——gui-extensions 移动面，owner #109）。每个可选中结果都落到真实行。
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

**issue #102 增补**：服务器页目标逐字迁移后，`SettingsServerGeneral` 单服务器视图在 `healthy === false`（含 401 未授权映射）时**隐藏 Shell 偏好段**（M-037 态为有连接即显示——目标行为变化，矩阵 S37 已记录，避免被误报为回归）；行名改用 `entry.name`；单视图编辑对话框不再经 `onServerChange` 回切。`servers-page.test.tsx`（M-045 随补丁携带）锁定上述形状：源锚在共享预载环境下运行，行为组在无共享预载的独立命令下降级为 skip（settings-search-plugin 先例），行为证据以独立运行记录为准。

# 单元：偏好页内面（General/Experimental）——issue #103（S04–S11、S13、S38）

**状态行：偏好页内面已实现（未验证）**——General 页随 **M-046**（0046-M-046-general-experimental-pages-target-migration.patch，双 manifest 在册第 44 个补丁）迁移至 v2.2.1 目标（`general.tsx` 目标逐字），Experimental 页自有内容经核对已目标形（**零改动复用**；M-036 Sources 行保留归 #109）。运行证据：[build-and-verify.md issue #103 段](../../build-and-verify.md)。Desktop 实机视觉对照 **BLOCKED** 继承（无 Windows 参考端）；W05 Inbox 实态、W15 queue/steer 执行链**不因设置面通过而关闭**（见下）。

## General 页行清单（目标形，含默认值与顺序）

- **General 段**：InterfaceModeSetting（S04 三模式 top/side/inbox，fieldset+radio+预览卡，默认 horizontal；Inbox 选项选择后的实态仍呈 Side rail——**W05 登记**，不称模式体验已对齐）→ Language → Workspace destination（默认 last-used）→ Auto-approve permissions（**默认关 = opt-in**；执行面归属 permission-requests 单元契约——S07 的代答语义、once/always 落盘与批量扩散在该单元，设置行只写 `permissions.autoApprove` 默认值）→ Show custom agents（默认 false）→ Follow-up behavior（queue/steer，默认 steer；行只写 `general.followUpBehavior`——排队/转向的执行链归属 session-workbench 单元契约（**W15 登记**），设置面通过不关闭该差距）→ Pinch zoom 行（`platform==="desktop"` 条件可见）→ PluginSettingsSections(general/general)（M-037 Plugin 命名）→ **mobile() 标题栏行**（`<768px` 才渲染：mobileTitlebarBottom 开关，目标原生）。
- **Timeline 段**（目标形）：TimelineDetailControl（M-043/M-042 早已落地，包 `border-b-[0.5px] border-v2-border-border-base` 分隔——M-046 引入）→ **Timeline width**（focused/comfortable/wide，默认 comfortable，`data-action="settings-timeline-width"`）→ **Background activity**（off/left/center/right，默认 left，`data-action="settings-background-activity"`；**composer 呈现消费链不接**——目标消费点 `session/composer/composer-lane.tsx`/`activity-chips.tsx` 在 vendored 树不存在（W05 相邻工作台面），字段+行+搜索行落地，呈现归后续）→ Turn diffs（默认 false）。
- **Terminal placement 行已消失**（目标行为；组件与渲染槽随 M-046 删除）——`terminalPlacement` schema/default/accessor 保留为登记偏离（见下），session dock 行为保持 pin 态。
- **Experimental 页**：newIcons（默认 false，S38 图标切换）+ foldUserMessages（默认 false，8lh 折叠）两行目标形（M-034 已吸收，本轮零改动）；M-036 Sources 行（插件贡献 gate）原样保留，迁移归 #109（I）。

## settings.v3 持久化边界

- 单一 persisted store `settings.v3`（`Persistence.struct` + per-field `recover()`：未知字面量**仅该字段**回退默认，兄弟字段无损——model.test.ts invalid-decode 边界锁定）。逐项修改 → 切页 → force-stop 重启后保持（设备 QA 项）。
- **`notifications.agent` 默认 true→false**（M-046 采纳目标形）：**仅影响全新 profile**；已存储 settings.v3 的 decode 保留既有值（Persistence 字段级回退只在键缺失时生效）。
- `sounds.interfaceEnabled: Schema.optional(Schema.Boolean)`（默认 true）落地为**惰性字段**——vendored 树暂无消费者；设置行与搜索行归 notifications 页所属 issue。

## Timeline width 消费链（S11 实态）

`init` 内 `dataset.timelineWidth` document effect（`document.documentElement.dataset.timelineWidth`）→ ui tailwind `:root[data-timeline-width="focused"|"wide"]` 两块 `--container-session` 覆写（488px/1000px；默认 744px）→ vendored 树**既有** 7 个 `md:max-w-session` 消费点（session/route.tsx、message-timeline.tsx、session-composer-region.tsx、preparing-composer.tsx、dropzone.tsx、btw/panel.tsx、session-timeline-row.tsx）——token 落地即生效（≥768px 断点域内时间线列宽三档实态；设备 QA 记录）。S42 zoom/字体缩放与该 token 的叠加为设备抽查项。

## 保留偏离（登记，全部有活消费者）

- **`terminalPlacement`**：type 导出 + `Literals(["side","bottom"])` + 默认 `"side"` + withFallback + set accessor——消费者 `session/screen-layout.ts:21,22`；目标已删除该设置行（行消失 = 目标行为），schema 保留直至 W04/W05 session 屏/dock 重构所属 issue 退役。
- **`showFileTree`**：`Schema.Boolean` + 默认 `false` + init accessor + store API + `visibility.fileTree`——消费者 `screen-layout.ts:26`、`use-session-commands.tsx:70,452`（fileTree.toggle 命令注册门）。目标把它移入 retired 块（Persistence.optional）——保留为活偏好直至同上收敛。
- **S10 不采纳**：`commentary: placementOnlySchema` 槽、`settings.timeline.category.commentary` 键、timeline.description.compact/.quiet 目标新文案——依赖 session-ui `timeline/detail.ts` 的 `timelineCategories` 目标形（compact/quiet 预设 subagents grouped→separate）。vendored 文案如实描述 vendored 预设现行为；目标桌面写出的含 commentary 槽的 settings 文档在本客户端 decode 时该槽被丢弃（Persistence.struct 未知键行为，M-002 先例口径）——随 S10 呈现链后续 issue 收敛，矩阵 S10「类别枚举与实际呈现尚未逐项证明等价」保持。
- **搜索目录**：`settings-background-activity`/`settings-timeline-width` 两行已随 #103 恢复（catalog 行 + general.tsx 真实 anchor 双正锚）；`settings-sounds-interface` 已随 **#107/M-050** 恢复（catalog 行 + notifications.tsx 真实 anchor 双正锚，M-044 剪除注记随之移除——见「通知页内面」单元）；**搜索目录现存唯一目录级偏离 = M-035 zoom 行**继续不带 `available:"desktop"`（route.ts 的 gui-extensions M-044 注记为另一文件的登记，owner #109）；目标 `@source stories` 改名**不采纳**（vendored 无 stories 目录）。
- **M-036 Sources**：experimental.tsx 的插件 Sources gate 行零改动，迁移归 #109。

## 历史参考

#63（S04 界面模式三态）、#64（S38 实验开关两项）的原始实现记录见 build-and-verify.md 对应段；本轮为行面/键面/消费 token 的目标收敛，行为面（模式切换实态、图标切换、折叠视觉、宽度三档）证据以 #103 段设备 QA 为准。

# 单元：外观页内面（Appearance）——issue #104（S12、S15–S17、S42）

**状态行：外观页内面已实现（未验证）**——页面与消费链在 #101/#103 壳与 schema 迁移中已随目标形落地（本轮源码**零改动复用**），唯一剩余目标差异（ui theme 组件族死导出）随 **M-047**（0047-M-047-theme-component-target-form.patch，双 manifest 在册第 45 个补丁）收敛至 v2.2.1 目标。运行证据：[build-and-verify.md issue #104 段](../../build-and-verify.md)。Desktop 实机视觉对照 **BLOCKED** 继承（无 Windows 参考端）；`<768px` 两侧联验 **BLOCKED** 继承（DPR 2.25 物理不可达 + CDP 模拟在嵌入 WebView 不生效，#103 同判据）。

## Appearance 页行清单（目标形，含默认值与顺序）

`settings/appearance/appearance.tsx`（vs target **byte-identical**，零 mobile hunks）七行依序：

1. **Color scheme**（`settings-color-scheme`）——system/light/dark 三值 Select，默认 system；选择即时生效（`data-color-scheme` 属性 + `color-scheme:` style + 背景色三通道）。
2. **Theme**（`settings-theme`）——主题名下拉，默认 `oc-2`（OpenCode）；选项集 = `ui/src/theme/themes/*.json` **36 文件集合**（设备实测下拉呈现 36 名，AMOLED…Zenburn）。
3. **UI Font**（`settings-ui-font`）——TextInput，默认空（回落 `"Inter", ui-sans-serif…` 栈）；写入即时生效 `--font-family-sans`。
4. **Code Font**（`settings-code-font`）——TextInput，默认空（回落 `"IBM Plex Mono", ui-monospace…` 栈）；写入即时生效 `--font-family-mono` + `document.fonts.load("440 13px …")` 预载。
5. **Terminal Font**（`settings-terminal-font`）——TextInput，默认空；写入 `appearance.terminal`，经 model.tsx `accessors.terminalFont` 消费（target 形；终端面呈现归 terminal 单元，不写 `--font-family-mono`）。
6. **Zoom**（`settings-zoom`）——六档 Select 100/110/125/150/175/200%（`desktopZoomLevels`），默认 100%；平台层消费见下节。
7. **Reduce motion**（`settings-reduce-motion`）——system/on/off 三值，默认 system；`dataset.motion` 仲裁 effect 消费（system 档接 `prefers-reduced-motion` media query）。

搜索行七条正锚（`search-catalog.ts`）：**七行全部 `tab: "appearance"`**（color-scheme/theme/ui-font/code-font/terminal-font/zoom/reduce-motion）；general/appearance 之分只在**标签键命名空间**——zoom/reduceMotion 五键用 `settings.appearance.row.*`、colorScheme/theme/uiFont/codeFont(=font)/terminalFont 五行用 `settings.general.row.*` 标签键——设备实测搜索 zoom/motion/theme/font/scheme 全命中真实行并点击定位视口内。

## 主题机制（target-form 声明 + M-047 死代码收敛）

- `ui/src/theme/context.tsx` 438 行 vs target **byte-identical**；`themes/*.json`、`theme/v2/*`、`desktop-theme.schema.json`、`types.ts` 文件集合与 target 全等——主题选择/应用机制本轮零改动。
- 主题状态存储在 theme context **自有 localStorage 键**（不在 settings.v3）：`opencode-theme-id`（默认 oc-2）、`opencode-color-scheme`（默认 system→matchMedia）、`opencode-theme-css-light/dark`（派生 CSS 缓存，非用户偏好）——`oc-theme-preload.js` 首帧前消费，`verify-interaction-quality.ts` 组 6 在册。
- **M-047（死导出裁剪，非整族删除）**：`index.ts` 落 target 35 行 barrel（types + color 基元 + v2 resolve + context/useTheme 保留；去掉 loader 五函数、37 名 DEFAULT_THEMES 块（桶常量 + 36 主题名导出）与 generateAlphaScale/lighten/darken/resolveTheme 再导出）；`color.ts` **仅删 generateAlphaScale 函数**（其余 13 导出保持 pin 字节形=target 余部）；`resolve.ts` **仅删 resolveTheme(theme) helper + DesktopTheme import**（`resolveThemeVariant`/`themeToCss` 保留，gui-plugins terminal 消费者在册）；`loader.ts`（123 行）与 `default-themes.ts`（148 行、37 export const）**整文件删除**（vendored 树零 importer，仅 index.ts 自我再导出）。净删 359 行；5 文件内零 mobile hunks（纯 pin→target 重整）。负例演练：向 index.ts 回灌 `export { applyTheme } from "./loader"` → tsc `error TS2307: Cannot find module './loader'`（theme/index.ts:37）→ 还原 byte-identical。

## Zoom 平台层存储边界（非凭据）

六档缩放持久化在平台层 `localStorage opencode-ui-zoom-level`（`web.ts` 校验 `desktopZoomLevels` 集合，非法值回退 1=属性移除；与上游桌面 ZOOM_LEVEL_KEY 平台层存储同构，#65 裁定 A）。**存储内容仅 UI 缩放数字，非凭据**（运行真实性红线满足）；dist 检索 `opencode-ui-zoom-level` 命中 shipped chunk。

## Reduce motion 消费链

`model.tsx` `dataset.motion` 仲裁 effect（`document.documentElement.dataset.motion = reduce ? "reduce" : "full"`，system 档经 `createMediaQuery("(prefers-reduced-motion: reduce)")`）→ ui tailwind `motion-reduce` 变体 + 五文件白名单消费——权威表述见 [interaction-quality.md](../interaction-quality.md) §四（motion-reduce 接线）与 §六（偏好恢复）；设备实测 system 档在 WebView 114 退化 full（无系统映射——环境差异再登记，不加静默回退）。

## 保留偏离（登记）

- **M-035 裁定 A2**：catalog zoom 行不带 `available: "desktop"`（web 可用保留，#65）。
- **desktop-menu 菜单 face**：`desktopZoomLevels` 六档数组 byte-identical，但菜单 face 差异（session.new/project.open/role 形态、`nextDesktopZoomLevel` 不移植）为桌面 shell 域在册偏离——非外观页域，#104 只证六档数组本身。
- **WebView 114 system 映射**：reduce motion system 档无系统映射退化 full——环境差异（#65 首登记、#104 复验同态），不视为缺失。
- **pinch desktop 门控**：General 页 Pinch zoom 行 `platform==="desktop"` 条件可见，mobile 不渲染（M-046 保留、#104 设备复验 data-action 全集零 pinch 行）；WebView 手势默认态裁定见 [interaction-quality.md](../interaction-quality.md) §四（#74/E30）。

## 诚实边界

Windows Desktop v2.2.1 参考端逐区域截图对照 **BLOCKED**（无 Windows 环境；源码 byte-form + dist 检索为"与目标控件一致"的构建级证据，不冒充实机对照）；`<768px` 两侧联验 **BLOCKED**（DPR 2.25 物理不可达 + CDP `Emulation.setDeviceMetricsOverride` 在嵌入 WebView 不生效，#103 同判据）；CJK 回退栅格化运行期观察本轮不可采（en-locale 设置页无 CJK 内容）——栅格化差异按文档口径不算布局偏差；TalkBack 完整走查归 G31；设备 QA 后 localStorage 全量 dump 与 QA 前**逐键相等**（18/18，含主题 CSS 缓存键清除），font_scale 还原 1.0。


# 单元：供应商/模型/服务端扩展页内面——issue #105（S21–S26）

**状态行：已实现，运行期部分验证。** M-048（0048-M-048-providers-models-extensions-target-migration.patch，双 manifest 第 46 补丁）把三个页内面收敛到 v2.2.1 目标（3ebcf9a）。设备 QA（.145，APK `57eeba6c…`）：三页 + 三子 tab 目标形渲染、header 服务器切换槽双向切换、Connect provider 对话框（View all 面）、Skills 外链、搜索定位（通用行）、三类 SSH 失败面 PASS；**目录分组/搜索/可见性切换与 MCP 行面（本地 stdio）BLOCKED**（三台远端主机全部不可达/服务下线，见 [build-and-verify.md issue #105 段](../../build-and-verify.md)）；Desktop 视觉对照与 <768px 继承 BLOCKED。

## 交付清单（M-048，九文件）

- `settings/providers/providers.tsx` / `settings/models/models.tsx` / `settings/providers/extensions.tsx`：**目标逐字**——M-043 的 mobile hunks（headerAction prop、`settings-tab-header-actions` 插槽、min-w-0 头、extensions `directory` prop）被目标原生吸收；providers.tsx 的 `CONSOLE_PROVIDERS.has(providerID)` → `providerID === CONSOLE_INTEGRATION`（controller 的 `CONSOLE_PROVIDERS` 导出保留服务 FU-1 面）；extensions.tsx MCP 行迁移到数据层（`data.location.mcp.server.sync/list` + per-directory `location()` 叠 default-Location 覆盖 + 名称排序）、`data-status` 状态点 + `statusLabels` 映射、failed→View error 按钮（开 `DialogMcp`）、needs_auth→Sign in 按钮、busy 经 `toggleMcp.variables`、plugins tab → `<ExtensionPlugins>`（`own = !!platform.plugins && ServerConnection.builtin(serverSdk.server)`）。
- `providers/connect/mcp.ts`：目标 17 行增量（`onSuccess` 收窄 `() => void`、mutationFn request 对象重构、pending 门 `request.enabled === undefined`）+ **单一 mobile hunk**：`api.mcp.connect/disconnect` 保 pin 生成客户端命名——线等价（目标的生成客户端保留 deprecated 别名 `client.mcp.connect = client.experimental.mcp.connect`，同 `/api/experimental/mcp/:server/*` 路径；本 vendored 客户端的 mcp 组已直接拨该路径）；`api.mcp.list` 两侧不变。
- `providers/connect/mcp-dialog.tsx`：目标逐字（326 行增量）——`DialogSelectMcp` 保零参 wrapper（use-session-commands 懒 import 不受影响）+ 新增 `DialogMcp {directory, server?}`（数据层 list/sync、fuzzysort 搜索、逐服务器错误详情/copy/disable/retry、sign-in、SearchList UI）。
- `runtime/plugin/extension-plugins.tsx` + `app/src/shell/search-list.css`：NEW 目标文件（对 vendored host/installed/root/builtins/Bridge.manager API 逐成员核验零适配 hunk；css 含上游原生 `@media (prefers-reduced-motion: reduce)` 待机点守卫 → verify-appearance-settings 组 7 WHITELIST 第 6 项）。
- `providers/catalog/providers.ts`：目标 10 行 `syncWhileBooting` 重试包装（12 次、1s–5s、`isServiceUnavailableError` 门）——provider/model 目录冷启动加载可靠性（#105 验收相关渲染面）。
- `runtime/i18n/en.ts`：26 键 en-only 增补（14 `dialog.mcp.*` + 12 `settings.plugins.*`）——**target en.ts 键集 parity** 口径（`dialog.mcp.error.title`/`error.open` 为 target 死键，带集等价保位）；`dialog.mcp.description` 死键保留（跨 ~40 locale 清理归 FU-1）；zh 3 键/`settings.plugins` zh 0 不动（base 合并回退 en）。结果族：`dialog.mcp` en 3→17；`settings.plugins` en 0→12。**静默缺键防护**：verify-agent-capabilities 组 5 新增五迁移文件 file-wide `language.t("…")` 引号字面量 ⊆ en.ts 护栏（负例演练在册）。

## MCP 行面矩阵（S25，目标形）

| 行态 | 呈现 | 出口 |
| --- | --- | --- |
| connected | 绿点（`mcp-status-dot[data-status]`）+ 无词文案（Switch checked） | Switch off → `mutate({name, enabled:false})` |
| failed | 红点 + **View error 按钮** | 开 `DialogMcp(directory, server)`（错误详情/copy/disable/retry）；retry 重连既有配置 |
| needs_auth + integrationID | **Sign in 按钮**（busy→Signing in…） | `toggle.mutate(name)` → 重认证链（integration.get→oauth.connect→外跳） |
| pending | 点待机动效（reduced-motion 关停）+ Switch disabled | 无（等状态机迁移） |
| disabled | 灰点 + Switch off | Switch on → 显式启用（覆盖 disabled 配置直至重启） |

## 登记为 Milestone 1 后续工作（owner：协调者 carve 后续 issue）

- **FU-1 连接对话框族目标重设计**：`providers/connect/controller.ts`（143 行增量：command 认证方法、`CONSOLE_PROVIDERS` 移除、`connectMethods` 排序、keyProvider 移除）+ `providers/connect/dialog.tsx`（1617→1813 重设计：Integrations 对话框、command 方法 UI、`dialog.provider.*` 键族）+ stories + `providers/credentials/` 三件目标删除（并入 FU-1 范围注记）。S21/S22 剩余差异列指向 FU-1。取消/过期/失败恢复在当前对话框形**已可达**（pin controller 的 `oauth.cancel` 两处/complete/failed/expired 分支/statusFailed retry/`onCleanup`——verify-provider-models 组 3 钉定，[providers-models.md](providers-models.md) 状态矩阵/OAuth 专节）。
- **FU-2 模型选择器族目标形**：`providers/models/*`（select-dialog 988、models.tsx 87、selection.tsx 67、details.tsx +175 NEW、manage/unpaid/provider-group/search 小增量、css +203/+108 NEW、models.test.ts +55 NEW）。S24 剩余差异列指向 FU-2；设置页目标形与选择器 pin 形共用 `useModels`（现形一致性由共享控制器承载）。
- **FU-3 运行期项目持久层目标形**（#106 登记）：target `runtime/server/registry.tsx` `createServerProjects` 存储形迁移（`usedProjectIDs`/`lastProjectID` 按项目 ID 键控、`hostnames` 按连接键控，替代 pin 目录键控 `projects`/`lastProject`/`recentlyClosed`）+ `runtime/server/runtime.tsx` ctx.projects 新面（`add`/`unique`/`used`/`forDirectory`/`hide`/`last`/`touch(directory→id)`，165 行）+ `home/model.ts` add/used/last 消费链 + 相邻 `shell/state/layout.tsx`（343 行，`LocalProject` 去 `expanded`）——合计 ~343+165 行，owner = home/layout 工作单元。S27/S28 剩余差异列指向 FU-3；projects-sessions.md #8 吞错缺口（add.ts 校验失败被 `catch(() => undefined)` 吞）的收敛随 FU-3（原「预留 M-019」无主表述改指 FU-3）；#106 设备实测 S29 auto-accept 行因 pin 形项目无 `id` 而 `<Show when={key()}>` 门控为潜伏面，数据供给随 FU-3 落地。S27 页面级等价不依赖 FU-3。
- `settings/pages.ts` 的 `gui-extensions` 移除**归 #109**（插件页注册表接管；M-026 登记偏离届时移除）。

# 单元：项目/工作区页内面——issue #106（S27–S34）

**状态行：页面目标形已实现；运行期编辑/删除/逐字段实态 BLOCKED（需授权测试项目与可达服务器）。** M-049（0049-M-049-workspaces-pages-target-form.patch，双 manifest 第 47 补丁）把 `settings/workspaces/` 四个有 delta 文件收敛到 v2.2.1 目标（3ebcf9a）；其余 8 文件（project-extensions/project-folder-missing/project-lsp+test/project-model/project-row/project.css/queries）实测逐字节等于目标（零改动复用）。设备 QA（.145，APK `68d9d457…`）：S27 项目页/S28 项目设置壳/S30 启动脚本编辑面/S33 四子 tab 目标形渲染（min-w-0 ×2 与 `registry.label` 服务器标签 DOM 实测）、服务器切换槽三主机、文件选择取消零变化 PASS；Worktrees 列表与 LSPs 列表内容 Loading 不返（远端查询挂起，环境）、S29 auto-accept 行潜伏（FU-3 边界）——详见 [build-and-verify.md issue #106 段](../../build-and-verify.md)。

## 交付清单（M-049，3 targets）与逐 hunk 处置

- `workspaces.tsx`：**目标逐字**（677 行，3 hunk 采纳）——页头 `min-w-0`（与 M-043 `settings-tab-header-actions` 槽同形在位）+ DialogDeleteWorkspaces/DialogDeleteWorkspace Cancel 按钮 `autofocus`（删除确认默认焦点落取消，裸 Enter 不直接武装 danger 删除按钮；vendored Button 的 Kobalte `autofocus` prop 有 **5 处真实 Button 先例**：`providers/connect/chatgpt-welcome.tsx:31`、`runtime/plugin/dialogs.tsx:26/:31/:50`、`providers/connect/chatgpt-usage-limit.tsx:29`——`mcp-dialog.tsx:146` 为原生 `<button>`、`manage.tsx:119` 为 TextInput，非 Button 先例）。
- `projects.tsx`：仅采纳目标 `min-w-0` 页头（target l.62）；`addProject onSelect` **保持 vendored pin 同步守卫形**（登记 mobile hunk，M-043 注释行保留）——目标异步链（add.ts async + `ctx.projects.add` + home/model.ts 消费）依赖 FU-3；#8 吞错缺口保持登记，收敛归属改指 FU-3。
- `project.tsx`：采纳目标 import 行（`type ServerConnection, useServers`）+ `const registry = useServers()` + `<bdi dir="auto">{registry.label(props.server)}</bdi>`（替换 pin `serverName(...) || ServerConnection.key(...)`；registry.label/tag/hint 为 M-042 在册成员）；**M-043 mobile onClose 三行保留**（注释 + `onClose?: () => void` + ProjectOptions 透传）。
- `project-options.tsx`：**不在补丁内**——M-043 mobile hunks（onClose prop、close() helper、Menu.Separator + close Menu.Item）已在位，内容对 target 零 delta；verify-projects-sessions 正锚防目标化回退时静默丢失移动关闭入口。
- 零新增 i18n 键（三个内容 hunk 均不含 `language.t`；zh 不动）。

## S27–S34 页内面口径

- **S27 项目列表/搜索**：页头 min-w-0 + Add project + 服务器切换槽（多服务器渲染切换、单服务器不渲染）；搜索进入=设置搜索面板 + `projectSettings` 目录 10 行（name/icon/color/auto-accept-permissions + workspaces + extensions 四子 tab 含 lsps）。add 链剩余差异=FU-3（S27 剩余差异列指向）。
- **S28 名称/图标/颜色**：project.tsx 页面壳目标形（`data-action` 锚 settings-project-name/icon/color 在位）；保存链（`project.update` 写服务端）BLOCKED——需授权测试项目；avatar `generated` 面随 FU-3 同域登记。
- **S29 权限继承/开/关**：`AutoAcceptPermissionsSetting` 页面行目标形（`<Show when={key()}>` 门控）；**设备实测行潜伏**——pin 形 `createServerProjects.open()` 建目录键控 `{worktree, expanded}` 无 `id`，`projectSettingsKey(scope, undefined)` 为 undefined（结构性 FU-3 边界，非迁移缺陷；负例探针钉定代码形）；写盘实态 BLOCKED。
- **S30 启动脚本**：编辑面目标形（textarea + `$OPENCODE_WORKTREE_BASE`/`$OPENCODE_WORKTREE_PATH` 提示文案）渲染 PASS；保存协议/失败路径 BLOCKED（需授权测试项目+真实仓库）。
- **S31 工作区筛选/占用/关联会话**：页面头目标形；列表内容 BLOCKED（远端 worktree inventory 查询挂起不返——环境，同 #105 服务器状态退化口径）。
- **S32 删除/批量清理**：确认链目标形（preflight/inspect/blocked 双 toast/dirty/danger disabled/transact force 十一锚在册，verify-diff 组 3）+ Cancel `autofocus` 采纳（负例机检：剥 autofocus → verify-projects-sessions FAIL → 还原）；对话框视觉焦点与不可逆执行 BLOCKED（仅可在授权测试仓库执行）。
- **S33 项目扩展作用域**：四子 tab（MCPs/Plugins/Skills/LSPs）页面零 delta 目标形复验，MCPs 空态 + Manage in opencode.json 渲染 PASS；作用域差集实态 BLOCKED（需带项目级 opencode.json 的测试项目）。
- **S34 LSP**：只读呈现（`config.list` 的 `info.lsp` + loadFailed retry 按钮）零 delta 目标形复验，**不新增配置编辑器**；子 tab + 「Auto-detected from file types」渲染 PASS，列表内容 BLOCKED（同 S31 环境口径）。

## 诚实边界

Windows Desktop v2.2.1 参考端逐区域截图对照 **BLOCKED** 继承（无 Windows 参考端）；`<768px` 两侧联验 **BLOCKED** 继承（DPR 2.25 物理不可达）；TalkBack/外接键盘完整走查归 G 门禁。同名项目/不同服务不串写的结构性双键隔离在册（ServerScope+pathKey，projects-sessions.md），双服务同名实态 BLOCKED（布置）。删除/脚本写入的用户工作目录零副作用红线本轮全程保持（QA 前后 localStorage 全量 dump 逐键相等 18/18、hosts.v1 credentialRef 引用形白名单）。

# 单元：通知页内面（Notifications）——issue #107（S18–S19）

## 交付清单（M-050，4 targets）与逐 hunk 处置

M-050（0050-M-050-notifications-page-target-form.patch，双 manifest 在册第 48 个补丁，47→48）四 targets：

- `settings/notifications/notifications.tsx`：采纳目标的 **11 行 sounds-interface SettingsRow**（`settings.general.sounds.interface.title/.description`，control = `div[data-action="settings-sounds-interface"]` 包 `Switch checked={settings.sounds.interfaceEnabled()} onChange={(checked) => settings.sounds.setInterfaceEnabled(checked)}`），插入在三个 `SoundSetting` 行之后与目标同位；M-024 Android 权限面 hunks（createSignal 导入、`activeNotificationsPort` seam 导入 + 注记、请求逻辑块、3× `onChange={onNotificationSwitch(...)}` 包装、Android 状态行 + 注记）逐字保留——两段面互不相交，结果 189 行 = 目标 139 + M-024 残留 50。`model.tsx` 的 interfaceEnabled schema/默认/accessor/setInterfaceEnabled 链为 M-046 在册交付，本轮零改动；i18n 两键已在 vendored en.ts（与 target 逐字同文，zh 双侧缺席 = target parity），**零新增键**。
- `settings/search-catalog.ts`：`settings-sounds-interface` 目录行恢复（8 行，target 逐字：keywords `sound audio interface effects wordmark logo`），替换 M-044 剪除注记——**search-catalog.ts 内 `mobile(M-044)` 注记随之消失**（grep 零命中）；`mobile(M-035)` zoom 注记保留为目录级唯一登记偏离；route.ts 自有的 gui-extensions M-044 注记不动（owner #109）。
- `settings/search-results.test.ts`：sounds-interface 断言负翻正（`.toBe(false)` → `.toBe(true)`，#103 恢复行/timeline-width 正锚先例）+ `mobile(#107)` 注记——**蓄意的第一方扩展**（target 无该断言），双向探针钉定（verify-settings-framework 组 5/7 + verify-appearance-settings 组 9 要求正形）；expect 计数不变。
- `shell/notifications/sound.ts`：采纳目标 3 个 export 关键字移除（`SoundOption`/`SoundID`/`soundSrc` 转模块私有，vendored 树内 measured 零消费者；`playSoundById`/`SOUND_OPTIONS` 双侧保持导出）——文件与 target **逐字节相同**。

## S18/S19 口径

三类通知开关（agent/permissions/errors）+ Android 状态行（M-024 权限面）+ 三类声音 Select + **Interface 声音行**（字段 + Switch + 持久化 + 搜索行）全部落地目标形；Interface 行的**播放消费者惰性**登记（target 在 new-session/view.tsx wordmark/PinBoard/弹珠面消费 `sounds.interfaceEnabled`——整个消费族不在 vendored 树，vendored wordmark.tsx 为 17 行 stub；呈现归后续 new-session issue，S11 backgroundActivity 先例）。

## 不采纳登记（owner 明示）

- `shell/notifications/notification.tsx` 目标 +16 `hasRunningChild` subagent 守卫——投递面（工作台/S18 呈现层），非 Settings 层；owner = 后续 notification-face/workbench issue，G33 域；M-023 不动。
- **`shell/notifications/toast.tsx` no-owner-gap**：目标 dead-export 收敛（移除 `dismissToast` 导出 + `toaster` 导入，vendored 树 measured 零消费者）**不采纳**——本轮 shell/notifications 源面在两个在册 target 文件（notifications.tsx 域的 sound.ts）之外零触碰；显式登记为**无主缺口**（当前无 carve 的后续 issue），candidate rider = 未来 notification-face / dead-export-sweep issue；登记落在 M-050 manifest reason + notifications.md ⑨ + 本单元。
- notifications 桥**冻结**：零桥/Kotlin/mobile-hosts 改动，op 白名单保持恰 `{notify, requestPermission}`，不新增读权限状态 op（冻结白名单红线 + issue「只在迁移影响时调整 notifications 桥」）。

## 诚实边界

三类开关/声音选择/静音/搜索返回/界面行持久化 + 重启恢复：设备 QA PASS（DBY2-AL00，深浅双 sweep，QA 前后 localStorage 逐键相等 18/18）；声音**播放路径**机证（`Audio.prototype.play` promise resolution：emitted `alert-01` + 内联 data-URL `staplebops-01/-02` 双形态；emitted 文件 loads-phase fetch 200）+ logcat AudioTrack 归因（`createTrack … pkgName ai.opencode.mobile`）——**人耳可听性不可验**（无声学通路），如实登记。Android 权限面：行语义设备验证（OFF→ON 触发请求 → 结果落显式状态行，零 dialog，OS 授权态零 adb 变更）；本轮环境 seam fail-closed → 行呈 unavailable 文案，API<33 granted:true 直答保真**未在本环境可观察**（探针钉定代码证据 + 登记保真上限）；同进程页切换行保留上次结果（组件 keep-alive），跨重启回中性文案（session-signal 设计，信号不持久）已验证。真实通知投递/点击路由/失败恢复 **BLOCKED**（无可达服务——G33 不动）；allow/deny/revoke 全矩阵 **BLOCKED**（API 31 无 runtime POST_NOTIFICATIONS dialog，API 33+ 模拟器缺）；Desktop 视觉对照 / `<768px` / TalkBack **BLOCKED** 继承。
