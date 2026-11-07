# 单元：设置框架（外层壳/导航/搜索/服务器上下文）——issue #101（S01–S03）

> **当前校准 E35（2026-11-06）**：Settings 主要已迁入，具体运行缺口继续保留。下文各 Issue 的 not-adopted/后续登记只描述交付当时；当前 Inbox/titlebar、queue/media、backgroundActivity、S10 commentary/预设、notification.tsx、palette/session-search 已迁入，不再作为未迁移待办。真正源码剩余为 FU-1/2/3 与 home/new-session 的 pin 音效等，见 [E35](../../alignment/windows-desktop/v2.2.1/current-review.md)。本轮仅文档，无构建/设备验证。

**状态行：框架已实现（未验证）。** 页面内容 S04+ 归各所属 Issue：Servers 页内面（#102/settings-servers-migration）、General/Experimental 偏好页内面（#103/settings-general-experimental-migration，见下方「偏好页内面」单元）、**Providers/Models/Extensions 页内面（#105/settings-providers-models-extensions，见下方「供应商/模型/服务端扩展页内面」单元）**、Projects/Workspaces 页内面（#106/settings-workspaces-migration）、**Notifications 页内面（#107/settings-notifications-migration，见下方「通知页内面」单元）**与 **Shortcuts 页内面（#108/settings-keybinds-command-catalog，见下方「快捷键页内面」单元）已交付**；**About 页内面已交付（#110 复验 + 链接/暂缓态验收补齐，见下方「About 页内面」单元）**；Desktop 实机视觉对照 **BLOCKED**（无 Windows 参考端）；真服务失败/恢复路径归 G 门禁。本轮运行证据：[build-and-verify.md issue #101/#105/#107/#108/#110 段](../../build-and-verify.md)。

## 单元边界（A/F 分界）

- **A（本单元，issue #101）**：设置外层壳（`settings/shell.tsx` 单一 RootSettings 布局）、导航（`settings/navigation.tsx`）、路由/视图模型（`settings/route.ts`）、surface 与服务器上下文（`settings/surface.tsx` 的 `surface.server()`/`selectServer`/`openServers`）、搜索（index/catalog/results/UI/focus-reveal）、设置→命令面板桥（`settings/palette.ts` + `shell/commands/palette.ts`）、共享设置 CSS、以及依赖闭包（settings-framework-dependencies：sidebar-toggle/sidebar-peek/servers-registry label/ui slash + registry label/hint 块）。
- **F（issue #102 已完成 Servers 页部分；issue #103 已完成 General/Experimental 偏好页内面）**：Servers 页内面已随 **settings-servers-migration**（settings-servers-migration.patch，双 manifest 在册第 43 个补丁）迁移至 v2.2.1 目标——`servers.tsx`/`servers/registry/row.tsx` **目标逐字**（SettingsServerGeneral 委托共享 ServerConnectionRow、Shell 段随 `healthy !== false` 健康门显隐、`settings-shell:<key>` 搜索命名线程、死代码 ServerRow 删除）、`redeem.ts` Redemption 去导出；General/Experimental 偏好页内面已随 **settings-general-experimental-migration**（第 44 个补丁）迁移——`general.tsx` 目标逐字（ShellSetting 的 settings-servers-migration action 检字与目标形重合保留，mobile(M-045) 注记随目标删除），详见下方「偏好页内面」单元；`settings/general/controllers.ts` **零改动**（两个既有 mobile hunks 保留：behavior 再导出边界 + pin 的 `config.update` 命名——生成客户端 PATCH `/api/experimental/config` 线等价，verify-appearance-settings 在册钉定，矩阵 S37 记录该保留偏离）。**Providers/Models/Extensions 页内面已随 settings-providers-models-extensions（第 46 个补丁）迁移至 v2.2.1 目标**——`providers.tsx`/`extensions.tsx`/`models.tsx`/`mcp-dialog.tsx` 目标逐字（settings-framework-migration 的 headerAction/directory 挂接 hunks 被目标原生吸收）、`mcp.ts` 目标形 + 单一 mobile hunk（pin 生成客户端命名保留，线等价——生成客户端 mcp 组直接拨 `/api/experimental/mcp/…` 路径，目标自身客户端亦保 `client.mcp.*` deprecated 别名）、`runtime/plugin/extension-plugins.tsx` 与 `shell/search-list.css` 为 NEW 目标文件、`catalog/providers.ts` 目标 10 行 syncWhileBooting 重试包装、en 26 键增补（详见下方「供应商/模型/服务端扩展页内面」单元与 [providers-models.md](providers-models.md)/[agent-capabilities.md](agent-capabilities.md)）。其余配置页内容对齐（Notifications/Projects/Workspaces/About 页内面等）仍归后续 issue。
- 单一事实来源：**无第二 current-server 状态**。per-server 页显示哪台服务器由 `surface.server()` 独家决定（解析序：视图 `server` → source server → 本地已连接 → 第一台）；#102 经 `selectServer`/`onServerChange` 消费，不得另存状态。

## 壳/导航契约

- **视图模型**（target 形）：`{ type: "root", tab: SettingsRootTab | SettingsPluginTab, server?: string }` + `{ type: "project", … }`；pin 的 `{ type: "server" }` 嵌套视图与 `parent`/`nestedServerTabs` 已随目标移除（无 per-server 嵌套布局）。
- **`settingsViewRedirect`**：root 视图带 server 而服务器消失 → 原视图去 server（留在同页）；project 视图的服务器不可达（非 starting）→ 落到该服务器的 Projects 页（`{type:"root",tab:"projects",server}`）；服务器不存在 → `{type:"root",tab:"projects"}`。不再弹回 root tabs（settings-ssh-entry-guard 的 pin 守卫由目标结构吸收——servers 组无条件在 nav 中，root tab 永不被重定向）。
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

- 组件：`SearchList`/`SearchHighlight`（ui/search-list）+ `Slash` 分隔（ui/slash，settings-framework-dependencies 新依赖）；narrow = `<800px`。
- 目录：`createSettingsSearchCatalog()`（search.tsx 内，target 形）= platform/servers/selected/plugins 输入；分组/排序/60 条上限/`rankSettings(query, items)` 两参形（origin/proximity 评分已随目标移除）。
- 聚焦/定位：`surface.search.open(view, id)` 写 `searchActivation`；壳 effect 触发 `revealSettingsSearch(root, view)`——目标 anchor 缺失时**静默 no-op 不崩**（search-reveal.test.ts 锁定该机制；本轮被剪行见下）。
- **mobile(M-044) 剪除三行 → 已全部恢复**：`settings-background-activity`、`settings-timeline-width` 两行随 **issue #103/settings-general-experimental-migration** 连同 general.tsx 真实页面 anchor 一并恢复（搜索命中 → 定位真实行）；`settings-sounds-interface` 随 **issue #107/settings-notifications-migration** 恢复——search-catalog.ts 目录行（target 逐字 8 行）+ notifications.tsx 真实页面 anchor（`data-action="settings-sounds-interface"` Switch）双正锚，设备实测 `interface`/`sound` 查询命中 → 定位真实行在视口内。search-catalog.ts 内 `mobile(M-044)` 剪除注记**已随该行恢复而移除**（grep `mobile(M-044)` 在 search-catalog.ts 现为零命中；route.ts 保留自己的 settings-framework-mobile 注记——gui-extensions 移动面，issue #109/settings-gui-plugins-tab-label 已决：tab 保留，注记就地改写为已决语义）。每个可选中结果都落到真实行。
- 命令面板桥：`createSettingsPaletteEntries()` ≤5 条 `type:"setting"` 行（前缀优先排序、排除 project 实体），select → `surface.search.open(view, id)`；`palette.group.settings` 分类键；`settings.search.focus`（mod+f）隐藏命令保留。
- **#90 回归不复现**：search.tsx 目标原生读 `plugins: surface.plugins.items()`（gui-plugins-api-migration 修复吸收）；settings-search-plugin.test.tsx 源断言更新为目标形。

## i18n

本轮新增键 **en-only 9 键**：`palette.group.settings`；`settings.server.switcher.label/.unreachable/.manage`；`settings.server.unreachable.title/.description/.retry/.edit`；`server.thisComputer`（settings-framework-dependencies label/hint 链所需——计划原判「pin 已有」经实现核对为 v2.2.1 新增，登记为计划偏差）。zh 回退 en（上游 v2.2.1 实态：八键 zh-miss，`server.thisComputer` 亦 zh-miss），同 settings-interface-mode/settings-experimental en-only 先例。

## 移动面挂载（settings-framework-mobile，全部保留）

- **settings-mobile-host-manager**：`MobileHostManager` 懒挂载为目标 servers `Tabs.Content` 的**第一个子元素**（Show 之上）——空上游列表也渲染。
- **settings-mobile-gui-plugins**：`mobileGuiExtensions = platform.platform !== "desktop"` 谓词 + 守卫 `if (view.tab === "gui-extensions" && !mobileGuiExtensions) surface.open("general")` + nav 组 `...(mobileGuiExtensions ? [{ items: guiExtensionsTab… }] : [])` + `<Tabs.Content value="gui-extensions"><Suspense><MobileExtensionManager /></Suspense></Tabs.Content>`（R4-1：目标 shell 无 Suspense——settings-framework-mobile 重加 import，包裹从 pin 逐字保留）。上游 DEV+desktop 面不恢复（目标已移除；DEV 插件面在 PluginSettingsPages/settings-page-dev）。route.ts/pages.ts 的 `"gui-extensions"` root tab 恢复 = **登记的有意偏离，issue #109/settings-gui-plugins-tab-label 已决为永久保留**（D4 单元契约解决——目标注册表只承载插件自有贡献，目标 Extensions face 为 server 域仅名单呈现且内容只在 reachable-server scope 下渲染，无三集分类/wsl 零控件行承载面，详见 [gui-plugins.md](gui-plugins.md) §四 D4 解决段；settings-gui-plugins-tab-label 就地改写两文件注记并把 tab 标签改歧义为 "GUI extensions"/"GUI 扩展"，与 `settings.tab.extensions` 不再同值）。
- **appearance-motion-zoom**：zoom 目录行**不带** `available: "desktop"`（web 可用），search-catalog.ts 内留 `mobile(M-035)` 标注；search-results.test.ts 四处编辑（zoom toContain、font 长度 4、capsule 断言删、注释保留）。**issue #144 退役-恢复登记**：#140 时代 `session-workbench-upstream`/`session-client-compatibility`（mobilePatches 54/55）曾把该登记偏离静默退役（catalog 行翻回 `available:"desktop"`、测试两断言翻回目标形——两文件一度与 v2.2.1 目标逐字节相同，构成本域唯一「契约-树偏差」）；#144 恢复「目标形 + 在册 M-035 偏离」形并从两补丁仅修剪对应 hunks（session-workbench 的 search-results.test.ts 段保留 hunk 2——timeline-width/sounds-interface 两条 #103/#107 时代第一方断言随该 hunk 收敛目标形删除，verify-settings-framework 组 7 的测试面钉同步退役），`font` 查询 3→4 与 zoom 命中恢复由 settings 子集单测（86/1）+ dist chunk 实证承载，设备复测 BLOCKED（见 [matrix](../../alignment/windows-desktop/v2.2.1/matrix.md) S02 行与 [settings-acceptance.md](../../alignment/windows-desktop/v2.2.1/settings-acceptance.md)）。

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

**issue #102 增补**：服务器页目标逐字迁移后，`SettingsServerGeneral` 单服务器视图在 `healthy === false`（含 401 未授权映射）时**隐藏 Shell 偏好段**（gui-plugins-api-migration 态为有连接即显示——目标行为变化，矩阵 S37 已记录，避免被误报为回归）；行名改用 `entry.name`；单视图编辑对话框不再经 `onServerChange` 回切。`servers-page.test.tsx`（settings-servers-migration 随补丁携带）锁定上述形状：源锚在共享预载环境下运行，行为组在无共享预载的独立命令下降级为 skip（settings-search-plugin 先例），行为证据以独立运行记录为准。

# 单元：偏好页内面（General/Experimental）——issue #103（S04–S11、S13、S38）

**状态行：偏好页内面已实现（未验证）**——General 页随 **settings-general-experimental-migration**（settings-general-experimental-migration.patch，双 manifest 在册第 44 个补丁）迁移至 v2.2.1 目标（`general.tsx` 目标逐字），Experimental 页自有内容经核对已目标形（**零改动复用**；session-goal-sources-panels Sources 行为注册偏离，#109 复核保留不迁移）。运行证据：[build-and-verify.md issue #103 段](../../build-and-verify.md)。Desktop 实机视觉对照 **BLOCKED** 继承（无 Windows 参考端）；W05 Inbox 实态、W15 queue/steer 执行链**不因设置面通过而关闭**（见下）。

## General 页行清单（目标形，含默认值与顺序）

- **General 段**：InterfaceModeSetting（S04 三模式 top/side/inbox，fieldset+radio+预览卡，默认 horizontal；E35 已核实 Inbox 两文件逐字目标且 titlebar 接入，当前模式体验仍待验）→ Language → Workspace destination（默认 last-used）→ Auto-approve permissions（**默认关 = opt-in**；执行语义归 permission-requests，设置行写 `permissions.autoApprove`）→ Show custom agents（默认 false）→ Follow-up behavior（queue/steer，默认 steer；写 `general.followUpBehavior`，目标 queue 及 server/session 归属保护已迁入，W15 真服务执行/恢复待验）→ Pinch zoom 行（`platform==="desktop"` 条件可见）→ PluginSettingsSections(general/general) → **mobile() 标题栏行**（`<768px` 的 mobileTitlebarBottom 开关）。
- **Timeline 段**（目标形）：TimelineDetailControl（既有目标控件与分隔）→ **Timeline width**（focused/comfortable/wide，默认 comfortable，`data-action="settings-timeline-width"`）→ **Background activity**（off/left/center/right，默认 left，`data-action="settings-background-activity"`；E35 核实 `session/composer/composer-lane.tsx` 已消费设置、region 已接入，不再是消费文件缺失）→ Turn diffs（默认 false）。各位置与消息列宽度真实呈现尚未完整验收。
- **Terminal placement 行已消失**（目标行为；组件与渲染槽随 settings-general-experimental-migration 删除）——`terminalPlacement` schema/default/accessor 保留为登记偏离（见下），session dock 行为保持 pin 态。
- **Experimental 页**：newIcons（默认 false，S38 图标切换）+ foldUserMessages（默认 false，8lh 折叠）两行目标形（settings-experimental 已吸收，本轮零改动）；session-goal-sources-panels Sources 行（插件贡献 gate）原样保留，#109 复核保留不迁移（注册偏离维持）。

## settings.v3 持久化边界

- 单一 persisted store `settings.v3`（`Persistence.struct` + per-field `recover()`：未知字面量**仅该字段**回退默认，兄弟字段无损——model.test.ts invalid-decode 边界锁定）。逐项修改 → 切页 → force-stop 重启后保持（设备 QA 项）。
- **`notifications.agent` 默认 true→false**（settings-general-experimental-migration 采纳目标形）：**仅影响全新 profile**；已存储 settings.v3 的 decode 保留既有值（Persistence 字段级回退只在键缺失时生效）。
- `sounds.interfaceEnabled: Schema.optional(Schema.Boolean)`（默认 true）落地为**惰性字段**——vendored 树暂无消费者；设置行与搜索行归 notifications 页所属 issue。

## Timeline width 消费链（S11 实态）

`init` 内 `dataset.timelineWidth` document effect（`document.documentElement.dataset.timelineWidth`）→ ui tailwind `:root[data-timeline-width="focused"|"wide"]` 两块 `--container-session` 覆写（488px/1000px；默认 744px）→ vendored 树**既有** 7 个 `md:max-w-session` 消费点（session/route.tsx、message-timeline.tsx、session-composer-region.tsx、preparing-composer.tsx、dropzone.tsx、btw/panel.tsx、session-timeline-row.tsx）——token 落地即生效（≥768px 断点域内时间线列宽三档实态；设备 QA 记录）。S42 zoom/字体缩放与该 token 的叠加为设备抽查项。

## 保留偏离（登记，全部有活消费者）

- **`terminalPlacement`**（issue #144 更新：偏离已退役为解码存根）：目标已删除该设置行（行消失 = 目标行为）；#140 时代会话重构移除了其消费者（`screen-layout.ts` 引用已消失），schema 现为目标 retired 块形 `Persistence.optional(Schema.Literals(["side","bottom"]))` + 「Mobile-only placement preference without a remaining reader; kept so stored values still decode.」注释——保留仅为旧存储解码/round-trip，无读取面；模型实测注释在位（verify-experimental-settings 组 3 改钉退役块形，#144 归因）。
- **`showFileTree`**（issue #144 更新：偏离已退役为解码存根）：同上——#140 会话重构后 `screen-layout.ts`/`use-session-commands.tsx`（fileTree.toggle 门）消费者全部消失；schema 现为目标 retired 块形 `Persistence.optional(Schema.Boolean)`，`visibility.fileTree` 面随目标移除；保留仅为旧存储解码。
- **S10 当前校准（E35，2026-11-06）**：`session-ui/src/timeline/detail.ts` 已逐字目标，timelineCategories 含 commentary，compact/quiet 的 subagents 为 separate；settings schema 已含 `commentary: placementOnlySchema`。旧“不采纳/解码丢槽”只描述 #103 时点，不是当前差距；类别实际呈现及持久化仍待逐项运行验收。
- **搜索目录**：`settings-background-activity`/`settings-timeline-width` 两行已随 #103 恢复（catalog 行 + general.tsx 真实 anchor 双正锚）；`settings-sounds-interface` 已随 **#107/settings-notifications-migration** 恢复（catalog 行 + notifications.tsx 真实 anchor 双正锚，settings-framework-mobile 剪除注记随之移除——见「通知页内面」单元）；**搜索目录现存唯一目录级偏离 = appearance-motion-zoom zoom 行**继续不带 `available:"desktop"`（#144 恢复——其退役-恢复登记见上方「移动面挂载」单元；route.ts 的 gui-extensions settings-framework-mobile 注记经 #109/settings-gui-plugins-tab-label 改写为已决保留语义）；目标 `@source stories` 改名**不采纳**（vendored 无 stories 目录）。
- **session-goal-sources-panels Sources**：experimental.tsx 的插件 Sources gate 行零改动（**注册偏离维持**——目标无 settings 行，旋钮在 DEV motion-tuning 台；#109 不迁移，仅加锁（verify-settings-framework 组 12 四锚）与设备 QA）。
- **插件贡献行宿主承载（issue #109/S41/S14）**：General 页两处 `<PluginSettingsSections>` 挂载（`page="general" section="general"` 节点 + `page="general"` 页级节点，均目标逐字）承载插件自有节/行；review 的 Wrap-lines 行经其 `SettingsPage { id: "mobile-diff", page: "general", section: "general", entries: [{ id: "settings-mobile-diff-wrap", … }] }` 贡献落在 general/general 节点（页面 `data-action="settings-mobile-diff-wrap"`），搜索以宿主 General 节标签揭示（search-index.ts:108——`section` 在场读宿主 `settings.general.section.general`，插件 title 只是 page 级**无** `section` 贡献的节标签；settings-search-plugin.test.tsx 两个 fixture 断言锁定双形）；Experimental 页 session-goal-sources-panels Sources 行（`data-action="settings-sources"`，`storedToggle("sources.enabled")`）在册。pairing/updater 的 SettingsPage 注册在各自 `if (!ctx.desktop) return` 之后——移动上贡献结构性缺席，app 侧零平台过滤（gui-plugins.md §十登记）。

## 历史参考

#63（S04 界面模式三态）、#64（S38 实验开关两项）的原始实现记录见 build-and-verify.md 对应段；本轮为行面/键面/消费 token 的目标收敛，行为面（模式切换实态、图标切换、折叠视觉、宽度三档）证据以 #103 段设备 QA 为准。

# 单元：外观页内面（Appearance）——issue #104（S12、S15–S17、S42）

**状态行：外观页内面已实现（未验证）**——页面与消费链在 #101/#103 壳与 schema 迁移中已随目标形落地（本轮源码**零改动复用**），唯一剩余目标差异（ui theme 组件族死导出）随 **theme-components-migration**（theme-components-migration.patch，双 manifest 在册第 45 个补丁）收敛至 v2.2.1 目标。运行证据：[build-and-verify.md issue #104 段](../../build-and-verify.md)。Desktop 实机视觉对照 **BLOCKED** 继承（无 Windows 参考端）；`<768px` 两侧联验 **BLOCKED** 继承（DPR 2.25 物理不可达 + CDP 模拟在嵌入 WebView 不生效，#103 同判据）。

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

## 主题机制（target-form 声明 + theme-components-migration 死代码收敛）

- `ui/src/theme/context.tsx` 438 行 vs target **byte-identical**；`themes/*.json`、`theme/v2/*`、`desktop-theme.schema.json`、`types.ts` 文件集合与 target 全等——主题选择/应用机制本轮零改动。
- 主题状态存储在 theme context **自有 localStorage 键**（不在 settings.v3）：`opencode-theme-id`（默认 oc-2）、`opencode-color-scheme`（默认 system→matchMedia）、`opencode-theme-css-light/dark`（派生 CSS 缓存，非用户偏好）——`oc-theme-preload.js` 首帧前消费，`verify-interaction-quality.ts` 组 6 在册。
- **theme-components-migration（死导出裁剪，非整族删除）**：`index.ts` 落 target 35 行 barrel（types + color 基元 + v2 resolve + context/useTheme 保留；去掉 loader 五函数、37 名 DEFAULT_THEMES 块（桶常量 + 36 主题名导出）与 generateAlphaScale/lighten/darken/resolveTheme 再导出）；`color.ts` **仅删 generateAlphaScale 函数**（其余 13 导出保持 pin 字节形=target 余部）；`resolve.ts` **仅删 resolveTheme(theme) helper + DesktopTheme import**（`resolveThemeVariant`/`themeToCss` 保留，gui-plugins terminal 消费者在册）；`loader.ts`（123 行）与 `default-themes.ts`（148 行、37 export const）**整文件删除**（vendored 树零 importer，仅 index.ts 自我再导出）。净删 359 行；5 文件内零 mobile hunks（纯 pin→target 重整）。负例演练：向 index.ts 回灌 `export { applyTheme } from "./loader"` → tsc `error TS2307: Cannot find module './loader'`（theme/index.ts:37）→ 还原 byte-identical。

## Zoom 平台层存储边界（非凭据）

六档缩放持久化在平台层 `localStorage opencode-ui-zoom-level`（`web.ts` 校验 `desktopZoomLevels` 集合，非法值回退 1=属性移除；与上游桌面 ZOOM_LEVEL_KEY 平台层存储同构，#65 裁定 A）。**存储内容仅 UI 缩放数字，非凭据**（运行真实性红线满足）；dist 检索 `opencode-ui-zoom-level` 命中 shipped chunk。

## Reduce motion 消费链

`model.tsx` `dataset.motion` 仲裁 effect（`document.documentElement.dataset.motion = reduce ? "reduce" : "full"`，system 档经 `createMediaQuery("(prefers-reduced-motion: reduce)")`）→ ui tailwind `motion-reduce` 变体 + 五文件白名单消费——权威表述见 [interaction-quality.md](../interaction-quality.md) §四（motion-reduce 接线）与 §六（偏好恢复）；设备实测 system 档在 WebView 114 退化 full（无系统映射——环境差异再登记，不加静默回退）。

## 保留偏离（登记）

- **appearance-motion-zoom 裁定 A2**：catalog zoom 行不带 `available: "desktop"`（web 可用保留，#65）。
- **desktop-menu 菜单 face**：`desktopZoomLevels` 六档数组 byte-identical，但菜单 face 差异（session.new/project.open/role 形态、`nextDesktopZoomLevel` 不移植）为桌面 shell 域在册偏离——非外观页域，#104 只证六档数组本身。
- **WebView 114 system 映射**：reduce motion system 档无系统映射退化 full——环境差异（#65 首登记、#104 复验同态），不视为缺失。
- **pinch desktop 门控**：General 页 Pinch zoom 行 `platform==="desktop"` 条件可见，mobile 不渲染（settings-general-experimental-migration 保留、#104 设备复验 data-action 全集零 pinch 行）；WebView 手势默认态裁定见 [interaction-quality.md](../interaction-quality.md) §四（#74/E30）。

## 诚实边界

Windows Desktop v2.2.1 参考端逐区域截图对照 **BLOCKED**（无 Windows 环境；源码 byte-form + dist 检索为"与目标控件一致"的构建级证据，不冒充实机对照）；`<768px` 两侧联验 **BLOCKED**（DPR 2.25 物理不可达 + CDP `Emulation.setDeviceMetricsOverride` 在嵌入 WebView 不生效，#103 同判据）；CJK 回退栅格化运行期观察本轮不可采（en-locale 设置页无 CJK 内容）——栅格化差异按文档口径不算布局偏差；TalkBack 完整走查归 G31；设备 QA 后 localStorage 全量 dump 与 QA 前**逐键相等**（18/18，含主题 CSS 缓存键清除），font_scale 还原 1.0。


# 单元：供应商/模型/服务端扩展页内面——issue #105（S21–S26）

**状态行：已实现，运行期部分验证。** settings-providers-models-extensions（settings-providers-models-extensions.patch，双 manifest 第 46 补丁）把三个页内面收敛到 v2.2.1 目标（3ebcf9a）。设备 QA（.145，APK `57eeba6c…`）：三页 + 三子 tab 目标形渲染、header 服务器切换槽双向切换、Connect provider 对话框（View all 面）、Skills 外链、搜索定位（通用行）、三类 SSH 失败面 PASS；**目录分组/搜索/可见性切换与 MCP 行面（本地 stdio）BLOCKED**（三台远端主机全部不可达/服务下线，见 [build-and-verify.md issue #105 段](../../build-and-verify.md)）；Desktop 视觉对照与 <768px 继承 BLOCKED。

## 交付清单（settings-providers-models-extensions，九文件）

- `settings/providers/providers.tsx` / `settings/models/models.tsx` / `settings/providers/extensions.tsx`：**目标逐字**——settings-framework-migration 的 mobile hunks（headerAction prop、`settings-tab-header-actions` 插槽、min-w-0 头、extensions `directory` prop）被目标原生吸收；providers.tsx 的 `CONSOLE_PROVIDERS.has(providerID)` → `providerID === CONSOLE_INTEGRATION`（controller 的 `CONSOLE_PROVIDERS` 导出保留服务 FU-1 面）；extensions.tsx MCP 行迁移到数据层（`data.location.mcp.server.sync/list` + per-directory `location()` 叠 default-Location 覆盖 + 名称排序）、`data-status` 状态点 + `statusLabels` 映射、failed→View error 按钮（开 `DialogMcp`）、needs_auth→Sign in 按钮、busy 经 `toggleMcp.variables`、plugins tab → `<ExtensionPlugins>`（`own = !!platform.plugins && ServerConnection.builtin(serverSdk.server)`）。
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
- `settings/pages.ts` 的 `gui-extensions` 移除**原归 #109**——#109 已决：不移除，tab 保留（settings-gui-plugins-tab-label 注记改写 + 标签改歧义；settings-mobile-gui-plugins 登记偏离转正为永久保留，证据链见 [gui-plugins.md](gui-plugins.md) §四 D4 解决段）。

# 单元：项目/工作区页内面——issue #106（S27–S34）

**状态行：页面目标形已实现；运行期编辑/删除/逐字段实态 BLOCKED（需授权测试项目与可达服务器）。** settings-workspaces-migration（settings-workspaces-migration.patch，双 manifest 第 47 补丁）把 `settings/workspaces/` 四个有 delta 文件收敛到 v2.2.1 目标（3ebcf9a）；其余 8 文件（project-extensions/project-folder-missing/project-lsp+test/project-model/project-row/project.css/queries）实测逐字节等于目标（零改动复用）。设备 QA（.145，APK `68d9d457…`）：S27 项目页/S28 项目设置壳/S30 启动脚本编辑面/S33 四子 tab 目标形渲染（min-w-0 ×2 与 `registry.label` 服务器标签 DOM 实测）、服务器切换槽三主机、文件选择取消零变化 PASS；Worktrees 列表与 LSPs 列表内容 Loading 不返（远端查询挂起，环境）、S29 auto-accept 行潜伏（FU-3 边界）——详见 [build-and-verify.md issue #106 段](../../build-and-verify.md)。

## 交付清单（settings-workspaces-migration，3 targets）与逐 hunk 处置

- `workspaces.tsx`：**目标逐字**（677 行，3 hunk 采纳）——页头 `min-w-0`（与 settings-framework-migration `settings-tab-header-actions` 槽同形在位）+ DialogDeleteWorkspaces/DialogDeleteWorkspace Cancel 按钮 `autofocus`（删除确认默认焦点落取消，裸 Enter 不直接武装 danger 删除按钮；vendored Button 的 Kobalte `autofocus` prop 有 **5 处真实 Button 先例**：`providers/connect/chatgpt-welcome.tsx:31`、`runtime/plugin/dialogs.tsx:26/:31/:50`、`providers/connect/chatgpt-usage-limit.tsx:29`——`mcp-dialog.tsx:146` 为原生 `<button>`、`manage.tsx:119` 为 TextInput，非 Button 先例）。
- `projects.tsx`：仅采纳目标 `min-w-0` 页头（target l.62）；`addProject onSelect` **保持 vendored pin 同步守卫形**（登记 mobile hunk，settings-framework-migration 注释行保留）——目标异步链（add.ts async + `ctx.projects.add` + home/model.ts 消费）依赖 FU-3；#8 吞错缺口保持登记，收敛归属改指 FU-3。
- `project.tsx`：采纳目标 import 行（`type ServerConnection, useServers`）+ `const registry = useServers()` + `<bdi dir="auto">{registry.label(props.server)}</bdi>`（替换 pin `serverName(...) || ServerConnection.key(...)`；registry.label/tag/hint 为 settings-framework-dependencies 在册成员）；**settings-framework-migration mobile onClose 三行保留**（注释 + `onClose?: () => void` + ProjectOptions 透传）。
- `project-options.tsx`：**不在补丁内**——settings-framework-migration mobile hunks（onClose prop、close() helper、Menu.Separator + close Menu.Item）已在位，内容对 target 零 delta；verify-projects-sessions 正锚防目标化回退时静默丢失移动关闭入口。
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

## 交付清单（settings-notifications-migration，4 targets）与逐 hunk 处置

settings-notifications-migration（settings-notifications-migration.patch，双 manifest 在册第 48 个补丁，47→48）四 targets：

- `settings/notifications/notifications.tsx`：采纳目标的 **11 行 sounds-interface SettingsRow**（`settings.general.sounds.interface.title/.description`，control = `div[data-action="settings-sounds-interface"]` 包 `Switch checked={settings.sounds.interfaceEnabled()} onChange={(checked) => settings.sounds.setInterfaceEnabled(checked)}`），插入在三个 `SoundSetting` 行之后与目标同位；settings-notification-permission Android 权限面 hunks（createSignal 导入、`activeNotificationsPort` seam 导入 + 注记、请求逻辑块、3× `onChange={onNotificationSwitch(...)}` 包装、Android 状态行 + 注记）逐字保留——两段面互不相交，结果 189 行 = 目标 139 + settings-notification-permission 残留 50。`model.tsx` 的 interfaceEnabled schema/默认/accessor/setInterfaceEnabled 链为 settings-general-experimental-migration 在册交付，本轮零改动；i18n 两键已在 vendored en.ts（与 target 逐字同文，zh 双侧缺席 = target parity），**零新增键**。
- `settings/search-catalog.ts`：`settings-sounds-interface` 目录行恢复（8 行，target 逐字：keywords `sound audio interface effects wordmark logo`），替换 settings-framework-mobile 剪除注记——**search-catalog.ts 内 `mobile(M-044)` 注记随之消失**（grep 零命中）；`mobile(M-035)` zoom 注记保留为目录级唯一登记偏离；route.ts 自有的 gui-extensions settings-framework-mobile 注记不动（owner #109）。
- `settings/search-results.test.ts`：sounds-interface 断言负翻正（`.toBe(false)` → `.toBe(true)`，#103 恢复行/timeline-width 正锚先例）+ `mobile(#107)` 注记——**蓄意的第一方扩展**（target 无该断言），双向探针钉定（verify-settings-framework 组 5/7 + verify-appearance-settings 组 9 要求正形）；expect 计数不变。
- `shell/notifications/sound.ts`：采纳目标 3 个 export 关键字移除（`SoundOption`/`SoundID`/`soundSrc` 转模块私有，vendored 树内 measured 零消费者；`playSoundById`/`SOUND_OPTIONS` 双侧保持导出）——文件与 target **逐字节相同**。

## S18/S19 口径

三类通知开关（agent/permissions/errors）+ Android 状态行（settings-notification-permission 权限面）+ 三类声音 Select + **Interface 声音行**（字段 + Switch + 持久化 + 搜索行）全部落地目标形；Interface 行的**播放消费者惰性**登记（target 在 new-session/view.tsx wordmark/PinBoard/弹珠面消费 `sounds.interfaceEnabled`——整个消费族不在 vendored 树，vendored wordmark.tsx 为 17 行 stub；呈现归后续 new-session issue，S11 backgroundActivity 先例）。

## 不采纳登记（owner 明示）

- `shell/notifications/notification.tsx` 目标 +16 `hasRunningChild` subagent 守卫——投递面（工作台/S18 呈现层），非 Settings 层；owner = 后续 notification-face/workbench issue，G33 域；notifications-platform-delivery 不动。
- **`shell/notifications/toast.tsx` no-owner-gap**：目标 dead-export 收敛（移除 `dismissToast` 导出 + `toaster` 导入，vendored 树 measured 零消费者）**不采纳**——本轮 shell/notifications 源面在两个在册 target 文件（notifications.tsx 域的 sound.ts）之外零触碰；显式登记为**无主缺口**（当前无 carve 的后续 issue），candidate rider = 未来 notification-face / dead-export-sweep issue；登记落在 settings-notifications-migration manifest reason + notifications.md ⑨ + 本单元。
- notifications 桥**冻结**：零桥/Kotlin/mobile-hosts 改动，op 白名单保持恰 `{notify, requestPermission}`，不新增读权限状态 op（冻结白名单红线 + issue「只在迁移影响时调整 notifications 桥」）。

## 诚实边界

三类开关/声音选择/静音/搜索返回/界面行持久化 + 重启恢复：设备 QA PASS（DBY2-AL00，深浅双 sweep，QA 前后 localStorage 逐键相等 18/18）；声音**播放路径**机证（`Audio.prototype.play` promise resolution：emitted `alert-01` + 内联 data-URL `staplebops-01/-02` 双形态；emitted 文件 loads-phase fetch 200）+ logcat AudioTrack 归因（`createTrack … pkgName ai.opencode.mobile`）——**人耳可听性不可验**（无声学通路），如实登记。Android 权限面：行语义设备验证（OFF→ON 触发请求 → 结果落显式状态行，零 dialog，OS 授权态零 adb 变更）；本轮环境 seam fail-closed → 行呈 unavailable 文案，API<33 granted:true 直答保真**未在本环境可观察**（探针钉定代码证据 + 登记保真上限）；同进程页切换行保留上次结果（组件 keep-alive），跨重启回中性文案（session-signal 设计，信号不持久）已验证。真实通知投递/点击路由/失败恢复 **BLOCKED**（无可达服务——G33 不动）；allow/deny/revoke 全矩阵 **BLOCKED**（API 31 无 runtime POST_NOTIFICATIONS dialog，API 33+ 模拟器缺）；Desktop 视觉对照 / `<768px` / TalkBack **BLOCKED** 继承。

# 单元：快捷键页内面（Shortcuts）——issue #108（S20）

**状态行：已实现；触摸可达面设备验证 PASS（搜索/捕获开合/Unbind/恢复默认/迁移+重启保持），外接键盘执行链 BLOCKED（.145 无外接键盘，CDP 合成按键不作证据——issue 明文）。** settings-keybinds-command-catalog（settings-keybinds-command-catalog.patch，双 manifest 在册第 49 个补丁，48→49）把 Shortcuts 页内面、命令目录/键位执行核心与键位迁移收敛到 v2.2.1 目标（3ebcf9a）。设备 QA（.145，APK `93d61eda…`）详见 [build-and-verify.md issue #108 段](../../build-and-verify.md)；Desktop 视觉对照与 `<768px` 继承 BLOCKED。

## 交付清单（settings-keybinds-command-catalog，9 targets）与逐 hunk 处置

- `settings/keybinds/keybinds.tsx`（512→546）：**目标逐字**（该文件 vendored==base 零既有 mobile hunk，整体替换即目标形）——`usePluginHost().definitions()` 插件过滤（`listFor` 第 4 参，已卸载插件命令从列表剔除）、follower 收敛（`opt.follows` 且自身无覆盖的命令不单列）、提取 `unbind(id)` + 捕获态 `gap-1` 包装 div + **Unbind 按钮**（`variant="ghost-danger"`，`onUnbind={controller.capture.unbind}` 置 `"none"`）、`Predicate.isString` ×3、SSR `IS_MAC`/`document` 守卫 `!=="undefined"`、`settings.current.keybinds` 可选 `?? {}`、类型化 `createStore<{active}>`、行边框 `border-v2-border-border-base`。
- `settings/keybinds/migration.ts`（40→42）：**目标逐字**——`keybindRenames` 新增 `"home.sessions.search.focus": "sessions.search"`（注释 2 行）+ extension→plugin 措辞；`migrateKeybinds` 机制不变（新 id 已有覆盖时旧值让位、旧 id 必清）。
- `shell/commands/command.tsx`（582→610）：**目标逐字**——`CommandOption`/持久化 `CommandCatalogItem` schema 增 `plugin?`/`keywords?`/`follows?` 元数据字段（`Schema.optional`，旧 v1 目录向后兼容）；catalog 写入带 `plugin:`/`follows:`（Shortcuts 在 owner 未挂载时仍可过滤/列绑定）；**导出 `commandKeymap(options, custom)`：用户自定义绑定排在同键默认之前（配置真正作用于命令的核心语义，上游单测锁定）**；`skip?: (event)=>boolean`（键让行给目标）+ `onSelect` 返回 `false` 拒绝按键；`bind(id, def, follows?)` follows 兜底自定义键；`CommandSource`/`COMMAND_SEARCH_ID` 转导出（前者顺带解析 vendored `runtime/plugin/commands.tsx` 既有 TS2459/TS2322 两条类型错误）、`KeybindConfig`/`CommandCatalogItem` 去导出（vendored 树实测零外部消费者）；keys/named 改 `Map`、`Predicate.isString`、`bracketKey`（⇧[ 布局修正）、`suspendCount` 类型化。
- `shell/commands/command.test.ts`（110→138，+28）：**目标逐字**——commandKeymap 自定义优先级测试、`skip` 让行 `test.each` ×2 参数、bracketKey `test.each` +4 行（含俄文 х 与 Dvorak 用例）、`acme.open` plugin 字段 catalog fixture。
- `composer/model.ts`（**最小消费方适配，计划 8-target 表外经 clean tsc 实测浮现**）：目标 `trigger` 获得 decline-false 返回（boolean|undefined）后，vendored base 形 `clientCommand` 回调 `return () => command.trigger(...)` 触发 TS2322（boolean 不可赋 void|Promise）——恰一错（391 基线分布唯一新错）；采纳**目标自身对该 hunk 的适配逐字**（注释 "A command declines only keys, so a slash command's `false` means nothing more." + async 包装 await trigger）。文件**不整体目标化**（其余 base→target delta——plugin/gui imports、session-search、quoteSource、readImage——归后续 plugin/session-search 面；gui-plugins-api-migration 同文件 hunks 位于不相交区段，累积树 `git apply --check` 验证零冲突；verify-files 组 7 / verify-commands-menus 组 5 锚点均在其他区段不受影响）。
- `runtime/i18n/en.ts`（+1 行）：`"settings.shortcuts.unbind": "Unbind",` 插在 pressKeys 与 search.placeholder 之间——**en-only = target parity**（target locale 均为 Partial 无此键；15/15 抽查 locale 双侧无 unbind；九 loader typed locale `satisfies Partial<Record<Keys,string>>` 不加键不破坏 typecheck）；锚为 pin 字节，与既有 14 个触 en.ts 补丁（connection-remember-credential/013/018/024/026/032/033/034/035/036/040/043/046/048——修正普查口径，计划初稿「5 个」为低估；方法不变）的区段零重叠。
- `packages/ui/src/actions/button/button.tsx`（+1）/ `button.css`（+19）/ `button.stories.tsx`（16 行）：**目标逐字**——`ghost-danger` variant union 行、`[data-component="button-v2"][data-variant="ghost-danger"]` 四规则块（hover/active/disabled）、Ghost danger story——Unbind 按钮硬依赖，ui/button 三件套随目标收敛逐字节。

## S20 口径（验收链逐项，诚实标注）

- **搜索**：页内 `Search shortcuts` 过滤（`model`→1 行 / `terminal`→2 行 / `zzz`→`SettingsSearchEmpty` 空态）+ 清除恢复全列（50 行）——设备实测 PASS。
- **编辑-取消**：行内绑定按钮 → 捕获态（`data-expanded` + Press keys + Unbind 并列）→ 再点同按钮 toggle 关闭，零残留零 toast——设备实测 PASS。
- **Unbind/禁用**：捕获态点 Unbind（ghost-danger，`data-variant` DOM 实测）→ 值置 `none`、行显 Unassigned、`settings.v3.keybinds["tab.close"]="none"` 实测 → force-stop（写后 ≥11s）重启存活——设备实测 PASS。
- **恢复默认**：Reset to defaults → toast（Shortcuts reset / Keyboard shortcuts have been reset…）+ keybinds 清空 + 默认键回显（Ctrl+W）→ 重启复核——设备实测 PASS（三轮）。
- **冲突反馈/捕获完成/实际命令触发**：**BLOCKED**——需物理按键（`dumpsys input` QA 始末双查：全部 `IsExternal:false`，仅虚拟 ALPHAKEY）；CDP 合成按键**不作证据**（issue 明文）；冲突消解（commandKeymap 自定义优先）、`skip` 让行、decline-false 由 command.test.ts 目标块 + 定向子集（63 pass/0 fail）单测锁定。
- **已有自定义键位迁移**：种子数据法（如实标注「localStorage 播种 + 应用真实启动迁移」）——预置旧 id `home.sessions.search.focus` 覆盖 → 重启 → `migrateKeybinds` 把存储改写为新 id `sessions.search`（旧 id 条目清零）+ 零崩溃；绑定落新 id 行（行显 Ctrl+Alt+F）——设备实测 PASS。**诚实边界**：新 id 行标题呈裸 id、旧行仍单列——上游的跟随塌缩（follower collapse）与人性化标题依赖 session-search 插件面（`command-search.tsx`/`session-search.tsx` 等，本轮**不采纳**，见下），vendored 树内旧命令（home/sessions/search.ts:95 注册，默认 mod+f）仍带自身默认键位注册在册；该呈现差随 palette/搜索后续 issue 收敛。

## 不采纳登记（owner 明示）

- 命令面板本体（`palette.ts`、`dialog.tsx`/`dialog.css`、`search.ts`）与 target 新文件 `command-search.tsx`/`session-search.tsx`/`safe-triangle.ts`——palette 在移动壳 keybind-only（commands-menus.md 在册实态）；command.tsx 目标形不 import 上述任何文件（import 闭包已核对），catalog 核心独立可迁；owner = 后续 palette/搜索 issue。
- `desktop-menu.ts`/`desktop-menu.test.ts`/`desktop.tsx`（Windows 菜单 face）——AGENTS.md 红线：不搬 Windows 窗口命令；N10 门控沿用。
- `settings/model.tsx` keybinds 面：base→target 零 delta，零改动（既有 21 行 first-party 偏离属 #103 登记，不扩大）。

## 诚实边界

Desktop 参考端无 → 视觉对照 BLOCKED 继承；`<768px` 两侧联验 BLOCKED 继承（#107 工具链注记）；TalkBack 走查按适用面登记（捕获态/Unbind 行为语义已 DOM 级实测，读屏描述串实态未走查）；命令面板本体移动可达性不变（keybind-only 在册）；设备 QA 前后 localStorage 全量 dump **逐键相等 18/18**（QA 侧深色 sweep 残留键 `opencode-color-scheme` 已识别并移除，恢复全等），hosts.v1 credentialRef 引用形白名单不变。

# 单元：About 页内面（About、许可与发行说明）——issue #110（S39–S40）

**状态行：已实现（新基线复验 + 探针勘误 + 链接/暂缓态验收补齐，零新补丁）。** about 域源码级剩余 delta = 0（settings-about-version 已批准区域级例外保留）：`animated-wordmark.tsx`/`notices/dialog.tsx` vendored blob 与 v2.2.1 目标逐字节相同（分别随 appearance-motion-zoom/settings-about-version 轨 1 带入）、about.tsx 为 settings-about-version 轨 2 在册移动例外（`c71e0d9`，pin==target `01ce931`）、`contributors.ts`/`contributors.test.ts`/`legal.svg`/`anomaly-brush.svg` 与 notices 六数据文件 pin==target==vendored 零触碰；`settings.css` vendored==目标 blob（`.settings-notices-scroll{overflow-y:auto}` 使能行在位，settings-about-version「恰 +1/−0」R6 守卫不变）；updater 整目录 79 文件（16 非 i18n + 63 i18n，`contract.ts` 正确缺席）与目标逐字节相同。设备 QA（.145，APK `24a4a290…`）详见 [build-and-verify.md issue #110 段](../../build-and-verify.md)；Desktop 视觉对照 BLOCKED 继承。

## 版本身份契约（settings-about-version 例外保留，三行展示）

- 三行实显（设备 DOM 实测）：`Version 0.1.0`（壳 `MOBILE_APP_VERSION`，不冒充 Desktop）、`Upstream OpenCode 2.1.4`（vendored `package.json` 基座行）、服务行（`useServerCollectionController` 健康链）。`settings-about-versions` data-component 锚持有基座+服务两行，壳版本行相邻渲染（探针组 2 全锚钉定）。
- 服务行诚实降级：无可达服务稳态实显 `Checking server version…`（explicit checking 键，health undefined；12s 稳态观察六次采样恒同——与 #72 所见同形，settings-framework-migration 框架迁移未改变本环境下该行时序）。判定锚「显式降级串、非空白、无伪版本」PASS；checking→version→unavailable 全转换链与真服务展示 **BLOCKED**（无可达服务，继承 #105/#106/#109 总边界）。
- 设置搜索 `version license credits` 命中 About 行（search-catalog.ts :23 目标逐字行，设备实测揭示 About 页）。

## notices 目标形与滚动契约

`notices/dialog.tsx` 目标形（`div.settings-notices-scroll[data-scrollable]` + `overflow-y: auto`，ScrollView 包装与导入清零）设备复验：容器 clientH 404 / scrollH 5327，scrollTop 0→2929（55%，BetterOffice/Apache 段）→4923（=max，License texts/crates 段），长文行可读（截图在册）；动态 import 失败 Toast 面由代码 + verify-open-external 探针组 1 承载（本机不做故障注入）。

## ExternalLink 外跳链（S39 链接验收，设备实测形态更正）

- about.tsx/notices 弹窗的全部外联（website `www.opencode.ai`、contributors（如 `github.com/thdxr`）、notices entry.url（如 `github.com/openooxml/betteroffice`）为 **ExternalLink 组件目标形 plain `<a target="_blank" rel="noopener noreferrer">`**（external-link.tsx vendored==目标 `133e752e`）；**不是 files-open-external `platform.openExternal` 消费者**——files-open-external face（web.ts `activeFilesPort().openExternal`，targets 恰 [web.ts]）服务于在册显式消费者（connect/mcp/usage-limit/error page/host-apis），#76 设备/JVM 证据归属不变。
- 设备实测（.145，真触 tap rect×dpr+72 标定 + CDP 双证）：三链接真触点击均**在本 WebView 内原位打开目标页**（CDP page target 实测 `https://opencode.ai/`、`https://github.com/thdxr`、`https://github.com/openooxml/betteroffice`；dumpsys topResumedActivity 恒为本 app——无浏览器切换）；系统返回键回退 WebView 历史后 About 态完整复原。合成 JS click 不触发该导航（trusted-event 行为差，如实登记）。
- **形态更正（诚实登记，非回归）**：计划「About 页全部 ExternalLink 经 files-open-external 原生外跳」与实态不符——移动 WebView（无 `setSupportMultipleWindows`/`onCreateWindow`）下目标 `_blank` 语义为同窗回退。链接「可打开」半边成立（目标内容打开 + 返回复原）；「明确失败」半边不可从 About 链接触发（全部为合法 https，无 refused 域）——继承 #76 JVM 31/0 + AVD Toast 显式失败证据（M-3 登记）。`{opened:false}` Toast / mailto delta 面不改（N08 外跳边界不在本期扩大）。

## S40 暂缓呈现契约（ADR 0005，呈现不误导已验）

- **更新操作三负例全部成立**（设备实测）：①gui-extensions updater 行 = desktop-host 禁用行（15 行中 browser/pairing/updater/ssh 四行 `data-capability="desktop-host"`，Switch `aria-disabled=true` + `disabled` + "Desktop only" 能力列）；②设置导航/搜索零 Updates/What's New 页（13 个 tab 集合实测无 update/whats-new/beta 面——上游 Updates 页在 `ctx.desktop` 门后不注册）；③About 页零更新操作控件。
- **whatsNew 邻外面保留**（ADR 0005 §6 R1 裁定 (c) 维持）：冷启动无发行说明弹窗自发弹出（seen==current 早退）；seen 水位实测 `opencode.global.dat:plugin.updater.seen = {"version":"0.1.0"}`（=MOBILE_APP_VERSION，`ctx.app.version = platform.version ?? ""` 仅作水位输入，E27 在册）；启动期零 changelog 拉取失败可见错误。**#149 release 轮注记（模拟器 API 34）**：2.2.1 release APK 全新首装后冷启动同样无 whatsNew 弹窗自发出现（首装分支形态，seen 写入未单独 dump——如实登记）；**真实版本跃迁已首次实测收口（#149 真机 Phase D，0.1.0→2.2.1）**：whats-new chunk 与 `opencode.ai/changelog.json` 均 HTTP 200（fetch 成功）、无弹窗、水位即推进为 `{"version":"2.2.1"}`——与上游 `whats-new.spec.ts`「范围内无合格 desktop highlights → 仅记忆版本」路径三件套吻合（`settings.v3` 无 releaseNotes 键，排除用户关闭路径）；**弹窗呈现面**待上游 changelog 出现合格 highlights 的下一次真实跃迁自然观察（非缺陷、非本轮门禁）。不用合成 localStorage 伪造 previous 的红线维持。

## i18n

en.ts 上游 `settings.about.*` 键集与目标全等 + settings-about-version 四键恰 4（:783–786，zh/zht 零键 = 组 4 负锚）；zh 回退抽查：既有行中文（版本0.1.0/根据麻省理工学院许可证发布）、settings-about-version 两行英文（en-base-first 合并链在册形态，非缺陷），English 已复原。

## 诚实边界

- 服务行真服务版本展示 **已收口（#149）**：2.2.1 release APK 在模拟器实连本地服务后 About 页实显 `Server OpenCode 2.2.1`（真实连接服务版本，与 client 行 2.2.1 / base 行 2.1.4 三行独立不混淆，截图留证 build-and-verify.md #149 段）；诚实降级串（checking/unavailable）设备复验继承 #110 在册证据。Desktop 视觉对照 **BLOCKED** 继承（无 Windows 参考端）；whatsNew 真实跃迁触发已实测（#149 Phase D：fetch 200+无弹窗+水位推进）；弹窗呈现面待上游内容激活。
- 结构锁（三行同步、settings-about-version 五 targets、目标形、负边界）由 verify-about-version 12 组静态探针承担；about 域无 about 页面单测——`contributors.test.ts`（2 例）为该目录唯一 vendored 单测且保持全绿（683 tests/115 files 全量口径内）。
- 许可审计 V4 12 项待用户决策保持未决引用；`docs/decisions/0005-apk-update.md` 零改动（引用不改变）。
