# 移动交互质量横切（Interaction Quality）

本文是「移动交互质量」横切关注点的**索引与收口层**（issue #20）：窗口与进程形态、导航与切换保持、键盘/IME/焦点、viewport/旋转/响应式、读屏/对比度/触摸目标盘点、偏好恢复与 Desktop actions 平台映射。**authority 边界声明**：本文是索引与收口层，不重定义任何单元契约——各交互契约的权威表述仍在对应单元文档与 G 门禁（各节标注），冲突时以单元文档为准并按双向变更协议回修本文。静态结构锚由 `scripts/verify-interaction-quality.ts` 锁定（与既有探针分工：只锁既有探针未覆盖之锚；交叉引用复核性断言显式标注，见各节「探针」行）。运行期行为归 **G31** 移动交互质量 walkthrough 门禁（[interaction.md](interaction.md)），G31 未过前本文全部运行期表述只声称「已实现（未验证）」（第十七处落字）。

## 一、窗口与进程形态

- **单窗口壳**：`android/app/src/main/java/ai/opencode/mobile/MainActivity.kt`——单 Activity 单 WebView（`onCreate` 内创建 WebView 并 `setContentView(webView)`）；`AndroidManifest.xml` 唯一 LAUNCHER activity（无 `launchMode`/无 `configChanges`/无 `screenOrientation`）；deep link 未注册 VIEW intent-filter（MainActivity 头注 TODO 在册，[units/shell-startup.md](units/shell-startup.md) 权威）；唯一权限 `INTERNET`。**无多窗口结构面**：壳内无 `onCreateWindow`/无 `setSupportMultipleWindows`——`window.open` 与 `target="_blank"` 链接在壳内均为**同窗导航**（G25③ 在册实态判定、G28⑦ 同源口径），不产生第二窗口。
- **返回键实态**：壳按 `onBackPressed` 实现——`webView.canGoBack()` 为真则 `webView.goBack()`，否则 `super.onBackPressed()`（结束 Activity）。manifest 显式 `android:enableOnBackInvokedCallback="false"`（Android 16 起 targetSdk ≥ 36 默认启用 predictive back，不禁用则该回调成为死代码）；迁移平台 `OnBackInvokedCallback` 需 minSdk（API 33+）守卫，为后续 issue 事项（[interaction.md](interaction.md) 交互基线在册）。
- **上游 SPA 零 History API 写入**：上游四包 src 全域 `history.pushState`/`popstate`/`history.back`/`history.go` **零命中**；唯一 History API 触点为 `app/src/runtime/platform/pwa.ts` 的 `history.replaceState(history.state, "", url.pathname + url.search + url.hash)`（PWA URL 清理）。推论：常规使用中 WebView 返回/前进列表仅初始加载一项，`canGoBack()` 恒为假——**返回键实际语义=结束 Activity**。
- **例外为一类而非单点**：发生任何 **WebView 同窗导航**之后，返回列表出现第二项、`canGoBack()` 为真、返回键语义变为「回退 WebView 历史（回上一页/回 App）」。已知形态三类：①OAuth 授权 `window.open`（G25③ 实态判定在册）；②webfetch/exa 工具输出链接 `target="_blank"`（`session-ui/src/tools/tool-renderer.tsx` 的 `exa-tool-link` 与 `basic-tool-tool-subtitle` 两处 `<a>`，移动时间线可见可点，壳内无 setSupportMultipleWindows，同为同窗导航）；③消息内 http 链接（G28⑦「外跳边界实态=G25③ 同源复测」）。**两口径并存不矛盾**：这类导航不经 History API 写入（零 pushState），「SPA 零 History API 写入」与「返回列表可出现第二项」同时成立。in-app 后退（关闭对话框/dock/抽屉）不经返回键（上游对话框由 Esc 或关闭钮关闭）。
- **旋转=Activity 重建**：manifest activity 零 `configChanges` 声明——旋转、深浅色切换、键盘可用性变更与尺寸变更（含分屏拖拽）均触发 **Activity 重建**：WebView 销毁重建、回环 asset server 重启、五桥经 `onPageFinished` 重新握手、页面完整重载；恢复走 web 层持久化链（persist flush：`visibilitychange`→hidden 与 `pagehide` 强制落盘，[recovery.md](recovery.md) 场景②③）。这是**结构实态而非缺口**；壳层实例状态恢复未实现（`onSaveInstanceState` TODO，[units/shell-startup.md](units/shell-startup.md) 权威，`verify-recovery.ts` 组 4 已锁）——返回键退出即进程终止场景的恢复链由 [recovery.md](recovery.md) 冷启动八环承接。相关核对项已预登记：G9（生命周期）、G29⑤（Office 旋转重排）、G24⑥（旋转后重连的终端陈旧尺寸）、#16 L9（SAF 保存中途旋转）。
- 探针：组 1（壳层返回键三锚+manifest 结构+`configChanges` 零命中负断言）与组 2（`pushState`/`popstate` 零命中哨兵+`replaceState` 唯一触点+`target="_blank"` 两锚）。

## 二、导航与切换保持索引

- **单窗口多宿主切换保持机制链**（引用不重定义）：host 级=host-manager（M-008）+ multiple() 布局入口与守卫修订（M-018）；SSH 注册表 `opencode-mobile.hosts.v1` 与直连注册表（M-010 hydration）恢复；session/project 级=身份键隔离 `SessionStateKey = ServerScope \0 route` + `pathKey`（[units/projects-sessions.md](units/projects-sessions.md) 「身份键、隔离与状态保持（单窗口切换）」节）；tab 级=tabs 四 store `Persist.window("tabs")` 携带 server key + 每标签内存态 `shell/tabs/memory.ts`。**运行期权威=G13（多 host 一窗+隔离）与 G19（单窗口切换状态保持）**；「no multiple app windows」的运行期含义=壳不产生第二窗口（§一：同窗导航为唯一窗口面）。
- **移动导航壳**：`app/src/runtime/extension/mobile.tsx` `createMobileViews`——按各面板 `mobile` 注册的 `kind` 与 `order` 分组：kind `"tab"` 进一级 tab 条（Diff=order 10，[units/diff.md](units/diff.md) 在册）；kind `"menu"`/`"drawer"` 进 More 抽屉（Files=menu order 20、Terminal=menu order 30、MCP details=drawer，各面单元文档在册）。`MobileViewTabs`（注释逐字「The narrow-screen view switcher: the conversation, each tab view, and a More drawer with the other views.」）承载「会话/各 tab 视图/More 抽屉」三段切换；`MobilePanelDrawer` 为 lazy 挂载。挂载锚 `<MobileViewTabs`（screen.tsx）由 `verify-agent-capabilities.ts` 组 3 首锁，本文不重复锁定。
- 探针：组 4（`sorted(["menu", "drawer"])`——交叉引用复核性断言，首锁 `verify-terminal.ts` 组 6；MobileViewTabs 注释锚——新锁）与组 7（`createMobileViews`/`entries`/`tabs`/`menu` 返回键+MobilePanelDrawer lazy——新锁）。

## 三、键盘、IME 与焦点

- **viewport 基线**：`app/index.html` meta viewport content 逐字 `width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover`——软键盘弹出**压缩视口而非遮挡**（[visual.md](visual.md) 在册）；`theme-color` meta 由主题系统运行期更新。
- **KeyboardInsets（上游软键盘 safe-area 联动机制）**：`app/src/runtime/platform/keyboard.ts`——`window.visualViewport` resize + `window` resize + `document` focusin + focusout **四监听**；editing 判定（`active.isContentEditable` 或非只读 input/textarea）；keyboard 判定（`editing && root.clientHeight - viewport.height * viewport.scale > 100`）；键盘弹出 → `root.style.setProperty("--safe-area-inset-bottom", "0px")`、收起 → `removeProperty`。挂载：`entry.tsx` import + `<KeyboardInsets />`。
- **终端面**（[units/terminal.md](units/terminal.md) 权威，引用不重定义）：`runtime/extension/panels.tsx` 三处 `window.visualViewport` 高度同步（dock viewport store → `scheduleFit`；**高度同步锚首锁在 `verify-terminal.ts` 组 6，本文探针标交叉引用复核性断言**）；ghostty-web 隐藏 `textarea` 承载输入与原生 IME 合成；ResizeHandle 移动分支 `md:hidden`；**六缺口在册**（软键盘 fit/滚动锚定、CJK IME 组串、外接键位透传、触屏选择/复制/粘贴、控制键软输入、读屏焦点——G24⑦⑧⑨ 权威）。
- **composer 面**：`composer/submit.ts` 逐字 `if (window.matchMedia("(max-width: 767px)").matches) input.editor()?.blur()`——窄屏提交后 blur 收起软键盘（**`verify-session-workbench.ts` 已首锁，本文探针标交叉引用**）。
- **focus 安全语义**（#10 在册）：`DockPrompt` 无内建按键语义、permission dock 不传 onKeyDown、请求面零 `autoFocus`——无键盘时**无默认审批**；question dock 完整 `role="radio"/"checkbox"`/`aria-checked`/`aria-keyshortcuts`/数字键直选/方向键/Esc=reject（[units/permission-requests.md](units/permission-requests.md) 权威）。
- **外接键盘键位面**：`shell/commands/command.tsx` 全局 keydown keymap；`DEFAULT_PALETTE_KEYBIND = "mod+k,mod+shift+p"`；session.new `mod+shift+s`、session.background `ctrl+b`、file.open `mod+p`、tab.prev/next（hidden）；`settings.v3.keybinds` record 可覆盖；终端 `terminal.toggle/new/close` keybind（G24⑧ 权威）。**软键盘无法产生 mod 类组合——全局键位命令依赖物理键盘是实态**（§七映射清单的核心标注；G31⑤ 判定）。
- 探针：组 3（viewport meta 四段+theme-color+keyboard.ts 四监听+safe-area 对+`> 100` 判定+entry 挂载+panels visualViewport 三锚——其中高度同步锚为交叉引用）。

## 四、viewport、旋转与响应式

- **断点体系（收口为集合清单）**：单断点 768px。`min-width: 768px`（桌面）8 处命中 6 文件：`session/model.ts`（**isDesktop 权威定义** `const isDesktop = createMediaQuery("(min-width: 768px)")`）、`runtime/extension/panels.tsx`、`runtime/extension/host-apis.tsx`、`runtime/extension/side-region.tsx`、`session/header/session-header.tsx`、`session/timeline/virtualizer.tsx`；`max-width: 767px`（移动）13 处命中 13 文件：`composer/submit.ts`、`composer/composer.tsx`、`composer/editor/editor.tsx`、`providers/models/select-dialog.tsx`、`home/route.tsx`、`home/sessions/view.css`、`runtime/extension/settings-pages.ts`、`shell/shell.tsx`、`shell/titlebar/titlebar.tsx`、`shell/titlebar/tab-popover.tsx`、`settings/settings.css`、`settings/search.tsx`、`settings/general/general.tsx`。gui-extensions 另有两处：`details/details.css`（max-767 一处）与 `sdk/host-apis.ts`（「Viewport under 768px. Reactive.」注释锚一处）。合计 **23 处命中 21 文件**（扫描域=app/src + gui-extensions/src；探针组 4 集合断言域同此）。既有锁：`verify-session-workbench.ts` 已锁 isDesktop() 门控计数与 submit blur 行——集合断言（文件集合相等）与其（单文件计数）断言对象不同，零重复。
- **session-ui 消费面登记**：`session-ui/src/message/message-content.tsx`（两处 767px）与 `session-ui/src/pierre/index.ts`（一处 767px）为消息内容移动分支消费面——**登记于本清单但不在探针集合断言域**（扫描域显式=app/src+gui-extensions/src；session-ui 消费面语义由 session-ui 8 文件子集回归与 G20/G28 各面门禁承接）。
- **移动专属设置（与偏好恢复交叉，§六）**：`mobileTitlebarPosition`（`Schema.Literals(["top", "bottom"])`，default `"top"`；General 设置 Switch 仅 `mobile()` 渲染 + `data-action="settings-mobile-titlebar-bottom"`；消费：`shell/shell.tsx` `bottomTitlebar` 与 `shell/titlebar/titlebar.tsx`）；`mobileDiffWrap`（review extension 持有，[units/diff.md](units/diff.md) 在册）；pinchZoom 设置 `Show when={desktop()}`——**desktop-only，移动不可见（§七映射清单条目）**。
- **narrow 门控引用**（browser，#17 在册）：`available = … && !layout.narrow()`——桌面窄窗同样隐藏 pane，移动缺席与上游桌面窄屏行为一致（[units/browser.md](units/browser.md)）。
- 探针：组 4（isDesktop 逐字+768/767 文件集合相等断言（域=app/src+gui-extensions/src）+mobileTitlebarPosition 四锚）。

## 五、读屏、对比度与触摸目标盘点

各面「已成立/缺口」均已在册（下表为**横切盘点收口**，每行带归属门禁；零新代码缺口、零重复裁定——各面首项核对位仍在原门禁）：

| 面 | 已成立（锚） | 缺口（在册） | 归属门禁 |
| --- | --- | --- | --- |
| 工作台 | `isDesktop()` 单列、767px 提交 blur、`motion-reduce:animate-none`、Working shimmer `role="status"` | 读屏/焦点/触摸目标运行期未核验 | G20⑧ |
| 权限/提问 | in-flight 全 disabled+幂等早退、Deny 首位 ghost、无 autoFocus/无键盘默认审批、question dock 完整 aria 族 | 按钮 `normal=28px`/`large=32px`（`ui/src/actions/button/button.css`）vs 48dp 推荐；三按钮横排 gap 8px；permission 三按钮无 aria-keyshortcuts；无焦点陷阱 | G21⑧（[units/permission-requests.md](units/permission-requests.md) 专节） |
| 文件 | 行为真 `<button>`、`aria-expanded`、combobox 接线、tab 条 aria-label、`aria-pressed` | 树行 28px+40px tab 条 vs 48dp；无 tree/treeitem 角色；Esc 清过滤无触屏等价；读屏焦点顺序 | G22⑨（[units/files.md](units/files.md) 专节） |
| diff | 窄屏恒 unified、wrap Switch aria-label、`touchstart` 滚动门控 | 40px 头部、触屏行选择→评论（首项）、Select 触屏、焦点陷阱 | G23⑨（[units/diff.md](units/diff.md)） |
| 终端 | 隐藏 textarea IME 合成、clipboard 事件 copy/paste、keybind 三条 | 六缺口清单（§三；[units/terminal.md](units/terminal.md) 键盘/触摸/无障碍专节） | G24⑦⑧⑨ |
| providers/MCP/附件/browser/工件 | 模型 Switch/连接对话框表单、mcp-dialog List+Switch、upload toast `role="progressbar"`、inspect `aria-pressed`、office tabIndex | 触屏形态各面登记；附件芯片 16px 移除钮 | G25⑨/G26⑨/G27⑨/G28⑨/G29⑤⑦ |
| 主题/对比度 | token 体系（text-text-strong/weak、border-border-weak-base）、`role="alert|status"`、主题无 danger 令牌（error 用 alert 语义） | 深浅色跟随与对比度真机未验证（[visual.md](visual.md)「归 G1」）；`oc-theme-preload.js` 三 localStorage 键（§六）本期由探针组 6 锁定 | G1（复核位→G31⑧） |

**触摸目标缺口在册**（28/32px 按钮、28px 树行、40px 头部、16px 移除钮、8px 按钮间隙 vs 48dp 推荐）——是否构成真机不可用为 G31⑨ **判定点**，不足则按失败路径四步协议交用户决策（候选 M-022+ Button/触摸目标强化，与既有 G21⑧/G22⑨/G23⑨ 登记句同源，编号入池统一分配），本期不预设。**不得声称触摸目标已达 48dp 推荐**。

## 六、偏好恢复索引

- **settings.v3**（`settings/model.tsx` 逐字 `persisted({ key: "settings.v3" }, settingsPersistence, defaultSettings)`）：七段——`general`（showFileTree/timelineDetail 六类/showCustomAgents/showTurnDiffs/**newIcons**/**foldUserMessages**——issue #64 S38 对齐 v2.2.1 实验两开关，默认均 `false`，Experimental 标签两行 Switch 写入；缺省字段 `withFallback` 回落 `false`，旧值不受影响/**mobileTitlebarPosition**/**mobileDiffWrap**/terminalPlacement/followUpBehavior）、`appearance`（fontSize/mono/sans/terminal/tabLayout 三值 `horizontal`/`vertical`/`inbox`——issue #63 S04 对齐 v2.2.1，默认 `horizontal`，General 分节 Interface 三模式卡写入；`inbox` 为上游标记的实验值）、`keybinds`（覆盖 record）、`permissions`（autoApprove + autoApproveProjects）、`workspaces`（defaultDestination + lastUsed）、`notifications`（agent/permissions/errors）、`sounds`（六键）——全量 `Persist` 持久化、冷启动 hydrate、legacy 迁移（`settingsPersistence` migrate 链）；解码失败按 schema `recover()` 对 objects AST **逐字段**回落（`runtime/persistence/schema.ts` `propertySignatures` 逐字段递归：仅失效字段回落 defaultSettings 对应默认值，同段其余字段如 fontSize/mono/sans/terminal 原样保留——例如旧构建读到 `tabLayout: "inbox"` 时仅该字段回落 `"horizontal"`，外观其余偏好不丢）。
- **语言**：General 设置 `LanguageSetting` Select（`language.setLocale`）→ `persisted(Persist.global("language"), languageSchema, { locale: initial })` 持久化；初始检测 `navigator.languages`（zh→zh 否则 en，`loadInitialLocale`）；`opencode.global.dat:language` 裸读为迁移兼容路径。
- **主题**：`oc-theme-preload.js`（构建内联，`vite.js` readFileSync 内联机制）——首帧前读 `opencode-theme-id`（默认 `oc-2`）+ `opencode-color-scheme`（默认 system→`matchMedia("(prefers-color-scheme: dark)")`）→ `data-theme`/`data-color-scheme`/背景色 + theme-color meta 更新；自定义主题 CSS 走 `opencode-theme-css-<mode>`。
- **模型偏好**：`Persist.global("model")`（`runtime/server/runtime.tsx`——**`verify-provider-models.ts` 已首锁，交叉引用**）；model-selection per 服务器+目录（vpm 首锁）。
- **恢复策略承接**：本节四类偏好已回修增入 [recovery.md](recovery.md) 恢复数据类总表「用户偏好」行（venue/键控/恢复时机/失败呈现/权威五要素）——偏好写入同受已落字的 persist 时机约束（脏窗口 ≤100ms，[recovery.md](recovery.md) 场景②，引用不重定义）；运行期贯通实测归 G31⑩。
- 探针：组 6（settings.v3 逐字+七段键+defaultSettings `mobileTitlebarPosition: "top"`+language 三锚+主题三 localStorage 键+`Persist.global("model")` 交叉引用）。

## 七、Desktop actions 平台映射清单

验收 3 本体：每个桌面动作都有映射行或「桌面专属+移动替代呈现」行——**映射缺口作为实态显式文档化并挂候选，不静默省略**。

- **命令面板（核心实态）**：`DEFAULT_PALETTE_KEYBIND = "mod+k,mod+shift+p"`；三处上下文注册（home/sessions/controller.tsx、session/composer/region.tsx、new-session/commands.tsx）均 `hidden: true`——**命令面板本体无触屏按钮入口（keybind-only）是实态**；面板本体组件有完整触屏可用 DOM（Dialog/ScrollView/listbox 行），打开方式是缺口而非组件；`DialogCommandPalette` 另经 file.open（`mod+p` 或 **/open slash**）可达。
- **slash 等价映射（软键盘可达，全集 11 键）**：`slash` 是 Command 通用字段，composer 输入 `/` 即触达；**11 键全部软键盘可达**。分文件列示：
  - `session/commands/use-session-commands.tsx` **8 键**：`/new`（会话新建）、`/undo`（撤销）、`/redo`（重做）、`/compact`（会话压缩）、`/fork`（分叉）、`/export`（导出）、`/open`（文件打开→DialogCommandPalette）、`/mcp`（MCP 对话框，`mcp.toggle`）；
  - `composer/commands.tsx` **3 键**：`/model`（模型选择→DialogSelectModel）、`/connect`（provider 连接→DialogConnectProvider）、`/agent`（agent 切换，以 `local.agent.visible()` 为条件 disabled——如实标注）。
  - **动态面声明**：扩展命令可经 `slashAfter` 机制动态挂入 slash 列表——静态探针只锁第一方静态注册 11 键（集合断言），动态挂入面不锁、本清单只声明其存在。
- **移动菜单面清单**：More 抽屉（menu/drawer：Files/Terminal/details server 面板）+ 一级 tab（Diff）+ 设置（General 移动节/providers/models/extensions/SSH hosts（M-018）/keybinds/搜索）+ `/mcp` 对话框（G26① 四路入口之一）。
- **桌面专属面既有映射（已文档化，引用不重裁定）**：browser pane=桌面专属，移动形态=时间线呈现（#17）；gui-extensions 设置 tab 移动不可达（上游实态，G26⑥）；pinchZoom 设置 desktop-only（§四）；外跳系统浏览器零第一方入口（#17⑦ 负例）；多窗/OS 级桌面动作不适用（单窗口壳，§一）；窗口管理类键位（tab.prev/next 等）依赖物理键盘。命令与菜单面全景收口（七菜单/DesktopMenuAction/注册面全景/enablement 五层链/window.* 裁定）见 [commands-menus.md](commands-menus.md)（issue #24，G34）。
- **映射缺口（如实登记两项）**：①命令面板触屏入口（keybind-only 实态，§八）；②全局键位命令的物理键盘依赖（软键盘无 mod 组合）——G31⑤ 实测判定 slash+移动菜单映射的可发现性充分性；不足→四步协议，候选 M-022+ 命令面板移动入口，本期不预设。
- 探针：组 5（`DEFAULT_PALETTE_KEYBIND` 逐字+三文件 `id: "command.palette"` 且 `hidden: true`+slash 11 键两文件集合相等+全域「恰 11 处恰 2 文件」漂移哨兵+`dialog.show(() => <x.DialogCommandPalette />)` 锚）。

## 八、诚实边界（上游/第一方实态，本期不声称）

- **返回键=退出**：上游 SPA 零 History API 写入，常规使用中返回键实际语义=结束 Activity；例外为一**类**——同窗导航发生后（OAuth `window.open`（G25③）/webfetch-exa 工具链接 `target="_blank"`/消息内链接（G28⑦ 同源））返回键=回退 WebView 历史。可接受性判定归 G31②（不足→四步协议，候选 M-022+ back 键集成：OnBackInvokedCallback 迁移+minSdk 33+ 守卫+in-app 返回桥接）。**不得声称返回键可作 in-app 后退**（对话框/dock/抽屉关闭不经返回键）。
- **命令面板 keybind-only**、无触屏入口——slash 11 键是替代映射面而非命令面板入口，两实态分开表述；**不得声称命令面板移动可达**。
- **Esc 类键盘交互**（对话框关闭/question dock Esc=reject）依赖物理或软键盘。
- **终端触屏**无长按选择菜单/无控制键软输入（六缺口在册，G24⑦⑧⑨ 权威）。
- **全局键位命令**（mod+k 等）依赖物理键盘。
- **预测性返回迁移未做**（显式禁用+注释，[interaction.md](interaction.md) 交互基线在册）。
- **触摸目标缺口在册**（§五），未达 48dp 推荐；是否构成不可用归 G31⑨ 判定。
- **对比度与读屏未验证**：归 G1/G31⑦⑧（TalkBack walkthrough 需真机+系统读屏，模拟器读屏行为有差异——优先真机，模拟器结果如实标注环境）。
- **旋转=Activity 重建**是结构实态；**不得写「壳层以 configChanges/防抖处理旋转」类虚构**。
- **设置单元契约仍未建立**（architecture.md TODO 行不变）——本文只做偏好恢复横切索引，不建设置单元。
- **M-022+ 候选池**：本期登记两项（back 键集成、命令面板移动入口）+触摸目标强化候选（沿用 G21⑧/G22⑨/G23⑨ 既有登记句）——与 #18 三候选（工件下载/PDF 查看面/CJK 字体包）、#19 两候选（host 级自动重连策略、恢复呈现强化）**同池共七项+触摸目标类，编号在用户决策承接时统一分配去重**；均待 G31 判定+用户决策，不预设不阻塞。

## 九、验证与门禁

- 静态结构锚：`scripts/verify-interaction-quality.ts`（八组断言+负例四组；诚实头注声明静态结构检查与交叉引用锚分工——组 3 panels visualViewport 锚、组 4 sorted 键与 blur 锚、组 5 slash undo/redo 对、组 6 model 偏好锚的首锁分别在 verify-terminal.ts/verify-session-workbench.ts/verify-diff.ts/verify-provider-models.ts）。
- 运行期：**G31** 移动交互质量 walkthrough 门禁十项（[interaction.md](interaction.md)）——G31 是 G13/G19/G9/G1/G20⑧/G21⑧/G22⑨/G23⑨/G24⑦⑧⑨/G25③⑨/G26⑨/G27⑨/G28⑦⑨/G29⑤⑦/G30② 的横切复核与贯通验证位，不替代任何单元门禁；G31 未过前本文全部运行期表述只声称「已实现（未验证）」（第十七处落字）。
