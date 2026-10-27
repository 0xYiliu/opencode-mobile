# 命令与菜单面收口（Commands & Menus）

## 一、权威边界与探针分工

本文是「命令与菜单面」横切关注点的**索引与收口层**（issue #24）：上游 Desktop 菜单数据（`DESKTOP_MENU`）、命令注册系统（`command.register` registry）在移动壳（web 构建）的可达性实态、window.* 单窗口裁定与 Windows-only host 命令排除清单。**authority 边界声明**：本文是索引与收口层，不重定义任何单元契约——各命令的执行效果、成功/失败反馈与恢复语义的权威表述仍在对应单元文档（[units/session-workbench.md](units/session-workbench.md)、[units/diff.md](units/diff.md)、[units/terminal.md](units/terminal.md)、[units/attachments-artifacts.md](units/attachments-artifacts.md) 等）与既有 G 门禁，冲突时以单元文档为准并按双向变更协议回修本文。静态结构锚由 `scripts/verify-commands-menus.ts` 锁定（八组断言+负例四组；与既有探针分工见其头注——交叉引用锚与既有读者清册逐条声明，新锁域=六文件+指定新锚行）。运行期行为归 **G34** 命令与菜单面运行期门禁（[interaction.md](interaction.md)），**G34 未过前本文全部运行期表述只声称「已实现（未验证）」（第二十处落字）**。

§一权威面四条不得声称（全文纪律，违者即误述；完整清单见 §十）：

- **不得声称桌面菜单（`WindowsAppMenu`）或命令面板（mod+k）在移动壳可达**——菜单 face 仅在 `windows() || linux()` 渲染（web 构建结构性缺席），命令面板本体 keybind-only。
- **不得声称 `window.*` 在壳内有任何实现或运行期行为**——web 平台零 `runDesktopMenuAction` 实现，四者是纯数据成员。
- **不得混同两组 undo/redo 与两层 back/forward**——会话级 revert 与文本编辑撤销栈是两个机制；应用内标题栏历史栈与 WebView 返回列表是两个机制。
- **不得声称 zoom/全选在移动可用**——壳层零 zoom 配置、零通用全选入口（实态如实登记，归 G34④⑤ 判定）。

与 [interaction-quality.md](interaction-quality.md) §七「Desktop actions 平台映射清单」的边界：#20 已收口 slash 11 键全集、命令面板 keybind-only 实态、More 抽屉/tabs/设置移动菜单面、WebView 返回键实态与 pinchZoom desktop-only——本文不重定义其中任何已落字实态，只收口其 §七清单之外的菜单/命令面增量（七菜单全景/DesktopMenuAction 枚举映射/注册面全景/enablement 五层链/window.* 裁定）。

## 二、命令注册系统全景

- **registry 机制**（`shell/commands/command.tsx`，上游 582 行）：`command.register(key, cb)` 键控注册（同 key 后挂载者覆盖先挂载者，`addCommandRegistration` 前插 + `activeCommandRegistrations` 保每 key 首见）；不同注册面同 id 保**先见者**（`registered()` 的 `seen` 去重）；`placeAfterSlash` 让 `slashAfter` 命令挂入他面 slash 列表；全局 keydown keymap（`dialog.active` 或 suspended 早退；可编辑焦点内无 mod 且无 `editable` 让行）；键位解析 `mod` = macOS meta / 其余 ctrl；设置键位覆盖 `settings.keybinds.get(actionId(id))`（含 `"none"` 禁用）。
- **第一方静态注册面清单**（本期穷举，约 45 id）：

| 注册面 | 文件 | 命令 id |
| --- | --- | --- |
| titlebar | `shell/titlebar/titlebar.tsx` | `common.goBack`（mod+[）、`common.goForward`（mod+]）、`home.toggle`（hidden）、`tab.new`（hidden）、`tab.close`（hidden）、`tab.reopenClosed` |
| tab-cycle | `shell/titlebar/tab-strip.tsx`（`titlebar-tab-cycle` 组） | `tab.prev`/`tab.next`（hidden）、`session.previous`/`session.next`、`session.previous.unseen`/`session.next.unseen` |
| session | `session/commands/use-session-commands.tsx`（`session` 组） | `session.new`、`session.undo`、`session.redo`、`session.compact`、`session.background`、`session.fork`、`session.export`、`session.copyID`（palette-only）、`file.open`、`file.close`、`file.tab.prev`/`file.tab.next`（hidden）、`project.copyID`（palette-only）、`context.addSelection`、`review.toggle`、`fileTree.toggle`（条件注册）、`input.focus`、`message.previous`/`message.next`、`mcp.toggle`、`permissions.autoaccept` |
| composer | `composer/commands.tsx`（`composer` 组） | `model.choose`、`model.variant.cycle`、`provider.connect`、`agent.cycle`、`agent.cycle.reverse` |
| settings | `settings/command.tsx`（`settings` 组） | `settings.open`（三个挂载点调用 `useSettingsCommand`） |
| new-session | `new-session/commands.tsx`（`new-session` 组） | `command.palette`（hidden）、`input.focus`、`project.select`、`session.location.cycle` |
| desktop 门 | `shell/commands/desktop.tsx`（`desktop` 组） | `logs.export`——**平台门** `platform.platform !== "desktop"` 时早退，web 构建永不注册 |

- **扩展命令发布**（`runtime/extension/commands.tsx`）：`${extension}.${id}` 模板发布（如 `terminal.toggle`、`browser.open`、`debug.heap`、`wsl.retry`）；13 个内建 GUI 扩展全部在 web 构建同表激活（`gui-extensions/src/renderer.ts` `builtins` 无平台门）；`enabled === false → disabled`（见 §七第④层）。内建扩展命令族：terminal `toggle`/`new`/`close`、browser `open`/`reload`/`address`/`close`/`inspect`、btw `ask`、debug `toggle`/`heap`（`if (desktop)` 条件注册——web 永不注册）、pairing `open`、updater `check`、wsl `retry`。
- **web 构建的命令可达面**（=移动实态，四面）：①composer slash 列表（软键盘；静态 11 键见 [interaction-quality.md](interaction-quality.md) §七 + 扩展动态面 `/terminal`、`/btw` 经 `slashAfter` 挂入）；②Settings > Shortcuts 页（`settings/keybinds/keybinds.tsx` 消费 `command.catalog` 持久化元数据+活体 options，键位覆盖可触屏编辑含 "none" 禁用）；③More 抽屉/一级 tab/设置入口（#20 §二/§七在册）；④全局 keydown（物理键盘）。**命令面板本体无触屏入口（keybind-only）为 #20 §七/§八在册实态，本文不推翻不重复收口**。

## 三、DESKTOP_MENU 七菜单映射主表（验收 1 本体）

上游 `shell/commands/desktop-menu.ts` 的 `DESKTOP_MENU` 是一份**纯数据声明**的桌面主机面：七菜单（id 恰 {app, file, edit, view, go, window, help}）、`DesktopMenuAction` 恰 19 值、`DesktopMenuRole` 恰 19 值、`href` 恰 4。macOS 菜单由桌面主进程消费同一份数据（**desktop 主进程不在闭包**——`vendor/upstream/packages/desktop/` 仅 Tauri 图标资产，无 package.json/源码，#23 在册口径）；`WindowsAppMenu` 仅在 `windows() || linux()`（titlebar.tsx `<Show when={windows() || linux()}>`）渲染——**web 构建（=移动壳承载的构建形态）零渲染路径**；`runDesktopMenuAction` 在 web 平台未实现（platform.tsx 可选成员，web.ts 全文零命中）——**零执行路径**。下表逐菜单给出移动映射（「触屏可达/键位可达/排除」三态；运行期实测归 G34①②）：

| 菜单 | 条目（类型） | 移动映射/实态 |
| --- | --- | --- |
| app（platforms:["macos"]，移动不渲染） | role about/hide/hideOthers/unhide/quit | 排除（macOS face 专属 role 族，壳内无对应 OS 面） |
| app | `settings.open`（command） | 键位 mod+, 物理键盘；设置触屏入口在 More 抽屉/标题栏（#20 在册） |
| app | `logs.export`（command）+ `view.reload`/`app.relaunch`/`app.installCli`（action） | `logs.export` web 永不注册（§七平台门）；view.reload 排除（壳内无 reload 入口，登记候选池）；app.relaunch/app.installCli 排除（§九） |
| file | `session.new`（command，/new） | **触屏可达**：/new slash + home 新建触屏（G19） |
| file | `project.open`（command） | **悬挂命令**（全仓未注册，§七）；移动等价=home 添加项目双挂载面（#8/#22 在册） |
| file | `settings.open`（command，platforms:["windows"]） | 同 settings.open 行 |
| file | `window.new`（action） | **排除**（§五单窗口裁定） |
| file | `window.close`（action+role close） | OS 级映射≈返回键退出（§五） |
| edit | `edit.undo`/`edit.redo`/`edit.cut`/`edit.copy`/`edit.paste`/`edit.delete`/`edit.selectAll`（role 族+windows 加速器） | role=原生编辑命令，移动实态=长按文本选择系统菜单 + contenteditable 原生行为（§六）；**壳内菜单 face 不渲染** |
| view | `sidebar.toggle`（command） | **悬挂命令**（§七）；移动等价=单列布局结构性缺席（#20 §四断点体系） |
| view | `terminal.toggle`（command） | **触屏可达**：/terminal slash（routed 时）+ More 抽屉 Terminal 项 |
| view | `fileTree.toggle`（command） | 键位 mod+\；移动 fileTree 随单列布局缺席（isDesktop 门控在册） |
| view | `view.reload`/`view.toggleDevTools`（action+role） | 排除（§九：toggleDevTools Windows-only host 命令；reload 壳内无入口，候选池登记） |
| view | `view.resetZoom`/`view.zoomIn`/`view.zoomOut`（action+role 族） | desktop webviewZoom 动作（platform.tsx「(desktop only)」）；壳层零 zoom 配置，pinch 实态归 G34⑤（§六） |
| view | `view.toggleFullscreen`（action+role） | 排除（手机形态无 fullscreen 切换语义；分屏/自由窗口=尺寸类配置变更，#20 §一在册） |
| go | `common.goBack`/`common.goForward`（command） | 键位 mod+[ / mod+]（物理键盘）；应用内层与 WebView 层两层关系见 §六 |
| go | `session.previous`/`session.next`（command） | 键位 alt+↑/↓；**移动等价=MobileDrawer tab 触屏切换**（#20 §二） |
| go | `project.previous`/`project.next`（command） | **悬挂命令**（§七）；移动等价=home 项目列表触屏（G19） |
| window（role windowMenu） | `window.minimize`/`window.toggleMaximize`/`window.close`（action） | §五四行裁定 |
| help | `logs.export`（command） | 同上（web 永不注册） |
| help | href ×4（documentation/supportForum/shareFeedback/reportBug） | `openExternal` 在 web 有实现（`window.open`）——help hrefs 是 openExternal 调用面穷举之一（verify-browser 在册恰 1 锚）；消息内链接同窗导航类（G28⑦） |

**菜单引用命令集合恰 13**：{session.new, settings.open, logs.export, fileTree.toggle, common.goBack, common.goForward, session.previous, session.next, terminal.toggle, project.open, project.previous, project.next, sidebar.toggle}（15 处引用，settings.open/logs.export 各出现 2 次去重）。GUI 扩展 menubar 注入经 `desktopMenuWithExtensions` + `useMenubarItems`（桌面 main 进程 bridge，web 无 bridge → items 恒空）。

## 四、DesktopMenuAction 十九枚举映射

逐 action 给移动映射（**映射/OS 级等价/排除**三态；枚举集合相等由探针组 1 锁定）：

| DesktopMenuAction | 三态 | 移动语义 |
| --- | --- | --- |
| `app.installCli` | 排除 | Windows/macOS host 命令（§九，#25 CLI 范围不变量） |
| `app.relaunch` | 排除 | 桌面主进程 relaunch；移动无对应面（§九） |
| `edit.undo` / `edit.redo` | 映射（OS 级等价） | 文本编辑撤销栈=composer contenteditable 原生行为（物理键盘 Ctrl+Z 依赖，G31⑤ 在册）；**与会话级 session.undo/redo 是两个机制**（§六） |
| `edit.cut` / `edit.copy` / `edit.paste` / `edit.delete` | 映射（OS 级等价） | 长按文本选择的系统菜单（平台提供）+ 终端 clipboard 事件（#13）+ M-020 `readClipboardImage`（#16） |
| `edit.selectAll` | 映射（OS 级等价）+ 缺口登记 | 长按系统菜单随选区提供全选；**应用内零通用全选命令/按钮入口**（§六三类枚举）；候选池登记 |
| `view.reload` | 排除（候选池登记） | 壳内无 reload 入口；如 G34② 判定必需，候选 M-025+（本期不预设） |
| `view.toggleDevTools` | 排除 | Windows-only host 命令（§九） |
| `view.resetZoom` / `view.zoomIn` / `view.zoomOut` | 映射（实态判定点） | desktop `webviewZoom` 专属；壳层 WebView 零 zoom 配置，pinch/系统字体缩放实态归 G34⑤ |
| `view.toggleFullscreen` | 排除 | 手机形态 N/A |
| `window.new` | **排除** | 单窗口不变量（§五） |
| `window.close` | OS 级映射 | ≈返回键退出（§五） |
| `window.minimize` | OS 级映射 | ≈系统 Home 手势/导航（§五） |
| `window.toggleMaximize` | N/A | 手机形态 N/A（§五） |

## 五、window.* 单窗口裁定（验收 2 本体）

`window.new`/`window.close`/`window.minimize`/`window.toggleMaximize` 四者是 `DesktopMenuAction` 数据成员；执行面 `WindowsAppMenu.runAction` → `props.platform.runDesktopMenuAction?.(action)`（可选链）——**web 平台该字段未实现（web.ts 全文零命中），可选链=静默 no-op**；加速器监听（Ctrl+Shift+N→window.new 等）仅在 `WindowsAppMenu` `onMount` 注册，web 不挂载即零监听。**壳内零实现、零行为**。单窗口裁定四行（零代码，纯文档映射）：

| DesktopMenuAction | 裁定 | 移动语义与依据 |
| --- | --- | --- |
| `window.new` | **排除** | #25/#1 范围不变量「one app window with multiple hosts/projects/sessions/tabs」；新建会话/文件 tab 的触屏入口已存在即单窗内「新 surface」语义，不是新窗口 |
| `window.close` | **OS 级映射** | ≈返回键退出（结束 Activity，#20 §一在册实态）——不新增应用内关闭按钮 |
| `window.minimize` | **OS 级映射** | ≈系统 Home 手势/导航（OS 级），无应用内映射 |
| `window.toggleMaximize` | **N/A** | 手机形态 N/A；分屏/自由窗口=尺寸类配置变更（旋转=Activity 重建链在册，G31① 同源观察项不承诺） |

零多窗口结构引用（不重锁，首锁 verify-interaction-quality 组 1）：单 Activity 单 WebView、零 `setSupportMultipleWindows`/零 `onCreateWindow`、`window.open`/`target="_blank"`=同窗导航类。Windows 运行期菜单证据归 **#1**（其验收 1 矩阵 menus/commands 行 owner=#24、evidence=BLOCKED 归 #1——「source inspection is not runtime proof」）；本文 §三/§四/§九 的静态映射行与 #1 矩阵 owner 列对接。

## 六、编辑/缩放/导航三族移动实态

- **两组 undo/redo 必须分开表述**：①会话级 `session.undo`/`session.redo` → `actions.revert.undo/redo`（#12 revert 链权威在 [units/diff.md](units/diff.md)），`/undo`//redo` slash 软键盘可达；disabled 门控=无会话 id 或零可见用户消息 / 无 revertMessageID。②文本编辑级 undo/redo=composer contenteditable 原生撤销栈，仅物理键盘 Ctrl+Z/Ctrl+Y 可达（G31⑤ 物理键盘依赖在册）；菜单 `edit.undo/redo` role 族=桌面原生编辑命令，壳内不渲染。
- **cut/copy/paste/select-all**：桌面=menu role（原生 WebContents 编辑命令）；移动实态=①WebView 长按文本选择的系统菜单（composer/终端/时间线通用平台行为，静态不可深证→G34④）；②终端 clipboard 事件 copy/paste（#13 在册）+ `Ctrl+Shift+C → document.execCommand("copy")`（terminal.tsx，前置注释「allow for toggle terminal keybinds in parent」同域）；③图片粘贴=M-020 `readClipboardImage`（#16 在册）；④`session.copyID`/`project.copyID` 剪贴板写命令 palette-only（物理键盘 mod+k 外不可达——登记）。**应用内「全选」零通用入口**：`selectAll` 形态在 app/src 第一方代码面恰三类——①desktop-menu.ts 菜单数据面（`edit.selectAll` action+`selectAll` role+labelKey）；②`shell/commands/search-keydown.ts` 第一方活代码：搜索框键盘路径 Ctrl/Cmd+A → `setSelectionRange(0, inputValue.length)` 全选**搜索框自身文本**（组件内部 helper，物理键盘-only，非通用入口）；③runtime/i18n 59 个 locale 的 `desktop.menu.selectAll` 标签键。结论：**零通用全选命令/按钮入口（搜索框内部 helper 与长按系统菜单除外）**——缺口登记候选池（G34④ 判定）。
- **zoom**：`view.resetZoom/zoomIn/zoomOut` + role 族=desktop `webviewZoom`（platform.tsx `/** Webview zoom level (desktop only) */` 逐字）；web 平台无该字段；titlebar `zoom = () => platform.webviewZoom?.() ?? 1` web 恒 1。壳层 WebView 配置**零 zoom 项**（MainActivity `configureWebView` 零 `setSupportZoom`/`setTextZoom`/`setInitialScale`——探针负断言）；viewport meta 无 `user-scalable` 禁令（#20 组 3 四段锚在册）。**pinch 缩放在壳内是否生效静态不可证 → G34⑤ 判定点**（含系统字体缩放对 WebView 文字的影响）；不可接受→四步协议，候选 M-025+（文字缩放入口/zoom 桥），本期不预设。
- **back/forward 两层**：①应用内层=`common.goBack`/`common.goForward` 命令（titlebar.tsx 注册）+`shell/titlebar/history.ts`（`MAX_TITLEBAR_HISTORY = 100`、`applyPath`/`pushPath`/`backPath`/`forwardPath`，settings 路径合并规则）——记录 solid-router 路由迁移，键位 mod+[ / mod+] **物理键盘依赖，无任何按钮渲染接线**（titlebar.tsx 渲染域 `common.goBack` 出现恰 2 处=id 行+title 行，漂移哨兵）；②WebView 层=返回键实态（#20 §一在册，零 History API 写入哨兵）。两层是独立机制，不得混同；M-022+ back 键集成候选（#20 §八在册）若承接，应同时裁定应用内栈的触屏等价——**引用不预设**。
- **tab/session 动作**：触屏=MobileDrawer tab 切换/关闭（#20 §二在册，tab 条 aria-label #22⑨ 在册）；键位族 `tab.new/close/reopenClosed/prev/next`、`session.previous/next(.unseen)`、`file.close/tab.prev/tab.next`——除触屏 tab 切换外全部键位-only（`tab.reopenClosed` mod+shift+t 为 palette+键位命令，最近关闭栈 `tabs.closed` `Persist.window` 在册）。

## 七、enablement 与「no dangling」五层结构链（验收 3 本体）

**「no dangling menu items when capabilities unavailable」在移动壳是五层结构实态**（探针组 5 逐层锚定）：

1. 命令面板 `commandPaletteOptions` 过滤 `disabled+hidden`（command.tsx）——不可用命令出面板。
2. composer slash 列表过滤 `!item.disabled && !item.id.startsWith("suggested.") && item.slash`（composer/model.ts）——/agent 在 agent 不可见时**缺席**而非悬挂。
3. 面板偏好项 `COMMON_COMMAND_IDS` 对未注册 id（含 `workspace.new`）经 `order.has` **静默跳过**（`shell/commands/palette.ts`）。
4. 扩展命令 `enabled === false → disabled: true` → 出面板出 slash 且键位关停（runtime/extension/commands.tsx + `gui-extensions/src/sdk/registries.ts` 注释逐字「False takes the command out of the palette and turns its keybind off. Defaults to true. Reactive.」）；实例：terminal `enabled: routed()`、browser 五命令 `enabled: pane.visible()…`（桌面 pane 专属，移动 pane 缺席→命令禁用出面板）、debug `heap` 的 `if (desktop)` 条件注册（注释逐字「Offered only while main answers: never on the web」）。
5. 唯一渲染禁用行的 face（`WindowsAppMenu` 的 `commandDisabled` 对未注册 id 返回 true 渲染为禁用行）在 web 不渲染。

**菜单引用命令对账表**（13 行；探针组 2 集合相等断言，文档缺行即 FAIL）：

| 菜单引用 command | 注册状态 | 注册位置 | 移动可达 |
| --- | --- | --- | --- |
| `session.new` | 已注册 | use-session-commands.tsx（`session` 组） | `/new` slash + home 新建触屏（G19） |
| `settings.open` | 已注册 | settings/command.tsx | 键位 mod+,；设置触屏入口在 More 抽屉/标题栏（#20 在册） |
| `logs.export` | 已注册（desktop 门） | shell/commands/desktop.tsx | **web 永不注册**——Windows-only host 命令（§九） |
| `fileTree.toggle` | 已注册 | use-session-commands.tsx（条件注册） | 键位 mod+\；移动 fileTree 随单列布局缺席 |
| `common.goBack` | 已注册 | shell/titlebar/titlebar.tsx | 键位-only，移动不可达（§六两层） |
| `common.goForward` | 已注册 | shell/titlebar/titlebar.tsx | 同上 |
| `session.previous` | 已注册 | shell/titlebar/tab-strip.tsx | 键位 alt+↑；移动等价=MobileDrawer tab 触屏切换 |
| `session.next` | 已注册 | shell/titlebar/tab-strip.tsx | 同上 |
| `terminal.toggle` | 已注册（扩展发布） | gui-extensions terminal renderer（`id: "toggle"`）+ extension/commands.tsx 模板 | `/terminal` slash（routed 时）+ More 抽屉 Terminal 项 |
| `project.open` | **未注册** | —（`command.project.open` i18n 键有四处 UI 标题消费：home/projects/controller.tsx、workspaces/selection/dialog.tsx、new-session/project/selector.tsx、settings/workspaces/projects.tsx——全部 `language.t` 标题形态，**零 `command.register` 消费**，非命令） | 桌面菜单 face 恒禁用行；移动等价=home 添加项目双挂载面（#8/#22） |
| `project.previous` | **未注册** | — | 同上；移动等价=home 项目列表触屏（G19） |
| `project.next` | **未注册** | — | 同上 |
| `sidebar.toggle` | **未注册** | — | 同上；移动等价=单列布局结构性缺席（#20 §四） |

**上游两姿态对照**（悬挂命令是上游桌面 face 自身的实态，不是我方缺陷）：面板姿态=未注册 id 静默缺席（`order.has` 跳过）；桌面菜单姿态=未注册 id 渲染为**禁用行**（`commandDisabled` 返回 true）。移动壳只承载面板姿态——**壳内没有任何命令 face 能产生不可用而悬挂的条目**；上游 4 个悬挂命令（project.open/project.previous/project.next/sidebar.toggle）在壳内零渲染故零悬挂，如实登记为上游桌面 face 实态。

**成功/失败反馈**：各命令 onSelect 复用上游既有通道（session.compact `formatServerError` toast、session.export 保存链 toast（#16 契约）、fork/rename 对话框、permissions.autoaccept toast——各单元在册）——零新增错误分类，收口声明引用各单元权威（[interaction.md](interaction.md) 失败路径处置协议「命令与菜单面失败路径」节）。

## 八、focus、无障碍与状态恢复

- **focus**：命令面板 `TextInput` autofocus + Esc 关闭 + ArrowUp/Down + Enter（dialog.tsx）；`input.focus` 命令（ctrl+l）与 new-session `restoreFocus`；`WindowsAppMenu` `rememberFocus`/edit.* 动作后 `lastFocused.focus({ preventScroll: true })`（桌面 face）；权限/提问 dock 无 autoFocus 无键盘默认审批（#10 在册）。palette 对话框焦点陷阱与读屏实态归 G31⑦ 复核位（G34⑧ 引用不重锁）。
- **无障碍**：面板行 `role="option"`/`aria-selected`/listbox 容器（dialog.tsx）；`WindowsAppMenu` `aria-label={language.t("desktop.menu.ariaLabel")}`（桌面 face）；菜单 i18n 全量在册（`desktop.menu.*` zh 45 键；en 经 `DESKTOP_NATIVE_ENGLISH` 汇入）。
- **状态恢复**：①键位覆盖=`settings.v3.keybinds` record（#20 §六在册）+ `keybindRenames` 迁移（旧 id 目录清理，Shortcuts 每命令列一次）；②命令元数据目录=`command.catalog.v1`（`persisted(Persist.global("command.catalog.v1"), CommandCatalog, {})`）——持久化 title/description/category/section/keybind/slash/hidden，**显式剥离可执行字段**（上游单测 command.test.ts 第 1 块锁定）；Shortcuts 页据此在 owner 未挂载时仍列出命令；③命令触发的导航落 tabs 持久化链（`Persist.window("tabs")`/`tabs.closed`，#8/#19 在册）；④会话级命令效果随快照恢复（#9/#19 权威）。运行期贯通归 G31⑩/G19（G34⑨ 复核位）。

## 九、Windows-only host 命令排除清单（per #1）

「Keep unsupported Windows-only host commands documented/excluded per #1」落字（每行排除理由与在册依据；运行期证据归 #1）：

| 命令/动作 | 排除理由 |
| --- | --- |
| `app.installCli` | 桌面 CLI 安装 host 命令；#25 范围不变量（壳内无 CLI 安装面） |
| `app.relaunch` | 桌面主进程 relaunch；移动重启=OS 级杀/重启 App，无应用内等价需求 |
| `view.toggleDevTools` | 桌面开发工具；移动构建无 devtools 面 |
| `logs.export` | 平台门 `platform.platform !== "desktop"`——web 构建**永不注册**（结构性排除，非选择） |
| `window.new` | 单窗口不变量（§五，#25/#1） |
| `updater.check`（扩展发布，hidden） | 桌面更新检查；移动更新通道归 APK 发布流程（未在范围） |
| `debug.heap` | `if (desktop)` 条件注册——web 构建永不注册（注释逐字「never on the web」） |
| `wsl.retry` | WSL 排除是已确认范围决策（决策 0001；#25）；远端为 Windows 原生时本命令按扩展 enabled 门控呈现语义 |

## 十、诚实边界（本期不声称）

- **G34 全部运行期行为 BLOCKED**（十项）——G34 未过前只声称「文档/探针/单测级已验证，运行期已实现（未验证）」（第二十处落字）。
- **Windows 运行期菜单证据不声称**（归 #1；本环境无 Windows 宿主；#1 验收 1「source inspection is not runtime proof」逐字呼应）。
- **桌面主进程不在闭包**——macOS/Linux 菜单行为不对比、不声称 parity；menu role 的原生执行语义属桌面宿主。
- **pinch zoom/系统字体缩放/长按编辑菜单实态静态不可证**（G34④⑤ 判定点）；键位-only 命令（command.palette、common.goBack/goForward、session.copyID/project.copyID、tab.reopenClosed、session.previous/next 等）无外接键盘不可达为实态。
- **扩展动态 slash 面（/terminal、/btw 等）不锁集合**（#20 组 5 口径沿用，动态挂入面只声明存在）。
- **上游 4 个悬挂命令是上游桌面 face 实态**，壳内零渲染零悬挂——不得声称悬挂命令是我方缺陷，亦不得声称我方「修复」了它们。
- **上游单测覆盖边界**：coordinator 类运行时行为（keymap/suspended/dialog.active 早退）无上游单测（上游实态），静态锚+G34 承接。
- **探针证明力**：静态结构检查零运行时证明力；交叉引用锚（slash 11 键/undo-redo 对/多窗口负例/dist 基线/patch 计数/terminal.toggle 键位透传）引用不重锁，首锁归属在探针头注逐条声明。
- **M-022+/M-025+ 候选池更新**：本期新登记三项——文字缩放入口/zoom 桥（G34⑤）、文本编辑全选/撤销重做触屏等价（G34④）、reload 移动入口（如 G34② 判定必需）——与既有池（#18 三+#19 两+#20 两+#22 相机+#23 音频资产）合并，自 **M-025** 起统一分配去重；back 集成/命令面板移动入口维持 #20 在册表述不重复登记。
- **Settings 单元契约仍未建立**（[architecture.md](architecture.md) TODO 行不变）——本文只索引 Shortcuts 键位覆盖面，不建设置单元。
