# 单元：GUI 插件管理面（gui-plugins）

覆盖范围：内建 GUI 扩展的**管理面**——可见的启用/禁用、状态与失败呈现、重试（Reload）、状态恢复，以及 15 个内建扩展在选定上游 pin 的清单与宿主能力映射（issue #66 起含 sources 与 goal，13→15）。扩展的**业务行为权威不在本文**：各扩展交付的面由对应 feature 单元文档与 [agent-capabilities.md](agent-capabilities.md)（远程面）承载，冲突时以单元文档为准并按双向变更协议回修本文。本文同时固化 dev/source 扩展管理器与 packaged 信任/安装模型的区分（验收 4），并落字：**移动零安装、零移除、零扩展商店（marketplace）**——不声称任何不受支持的能力。issue #67 起 upstream v2.2.1 删除了已安装 `.ocdx` 包的安装/移除面（宿主 Bridge.manager 恰 {initial,list,enable,disable,reload}，无 install/remove 成员——探针以该成员集为 D04 负锚）；桌面 DEV 内建管理页（settings-page-dev.tsx）按差异 D2 保留并适配——issue #109/M-052 起 D2 保留维持不变，settings-page-dev.tsx 在迁移壳上保持无引用的 DEV-face 载体（注册偏差，M-043 删除壳 DEV 门后在册）。

**状态声明（第二十一处落字）**：G35 未过前（[../interaction.md](../interaction.md)），本单元的全部运行期表述只声称「**已实现（未验证）**」——文档/探针/单测/构建级已验证，运行期已实现（未验证）。

## 一、权威边界与分工

- **本文是管理面单元**：交付的是「用户如何看待与控制内建 GUI 扩展」（启停/状态/失败/恢复），不改变任何扩展的贡献内容与业务行为。禁用某扩展导致对应单元的移动面隐藏（如禁用 review → Diff 一级 tab 消失、禁用 microsoft-office → office 工件退回上游占位）是**用户自主选择的结果**，不是对应单元验收的变更；恢复启用后面板如常（G35② 核对口径）。
- **业务行为归属**：远程 Agent/MCP/插件/扩展配置面归 [agent-capabilities.md](agent-capabilities.md)（#15，两套同名 extension 概念的区分承接自其专节）；office 查看器归 [artifact-viewers.md](artifact-viewers.md)（#18）；diff 归 [diff.md](diff.md)（#12）；终端归 [terminal.md](terminal.md)（#13）；文件归 [files.md](files.md)（#11）；browser 归 [browser.md](browser.md)（#17）；SSH 隧道归 [connection.md](connection.md)（#6）；配对归 [connection.md](connection.md) 配对专节（#22）；会话工作台归 [session-workbench.md](session-workbench.md)（#9）。
- **主进程红线（验收 3 本体）**：phone never runs Electron/Node main-process extensions——引用 [agent-capabilities.md](agent-capabilities.md) 四条独立证据链（web 无 Bridge 字段/Ipc 在 web 恒 inactive/app 零 `sdk/main` import/上游设置面 DEV+desktop 双门），本文不重证；本期增量为六 main entry 懒加载清单与五早退守卫的清单化（§二）。「document precise difference for product decision」= §二能力列与 §七：六 main 面无移动等价物可适配（updater=桌面发布流程、wsl=范围排除（[决策 0001](../../decisions/0001-wsl-exclusion.md)）、ssh=第一方 mobile-hosts 已替代（#6）、browser=桌面宿主专属（#17）、pairing=桌面侧协议、debug heap=桌面诊断），**不 adapt 任何原生能力**。

## 二、内建扩展清单（验收 1 主表，pin `b4525d79bf`）

15 个内建扩展（`gui-plugins/src/renderer.ts` compose 对象 map 顺序=context, btw, debug, terminal, file, review, details, browser, pairing, updater, ssh, wsl, microsoft-office, sources, goal；`main.ts` 同表对象 map——sources、goal 两项均无 mainEntry，六项 `mainEntry:` 懒加载清单不变；issue #67 起 renderer 侧以 `windowEntry: eager(...)` 面承载）。清单在 pin 更新时由探针集合断言强制刷新（`scripts/verify-gui-plugins.ts` 组 1/2——清单漂移即 FAIL，回归集随 pin 更新演练同步执行）。

| id | main entry（懒加载六者） | os 声明 | web/移动早退守卫 | token 分类 | 移动实际贡献面 | 业务 owner |
| --- | --- | --- | --- | --- | --- | --- |
| context | — | 无 | 无 | —（窗口侧 Slot/Panel） | session.header Slot（order 10）+ mobile Panel（menu, order 40） | #9（会话域） |
| btw | — | 无 | 无（命令门 `enabled: mounted()`——issue #70/M-038 放宽：桌面宽度按构造恒等（≥768px 时旧门 `!layout.narrow() && mounted()` 已等价），窄屏 slash 可达） | — | mobile Panel（menu, order 80——issue #70/M-038 窄屏入口：More 抽屉项，呈最近一条问答或诚实空态 `mobile.none`；ask 仍 select placement 不自动跳转；窄屏无 close 通道，问答在视口加宽后以 strip tabs 重现） | #9（会话域）/ #70（窄屏入口） |
| debug | **是**（`mainEntry: () => import("./debug/main")`） | 无 | 无 | Ipc（HeapSnapshots，web 恒 inactive） | web 渲染面实态（issue #73/W28 逐操作核对）：`debug.toggle` 命令无条件注册（命令面板可达——面板本体 keybind-only，[commands-menus.md](../commands-menus.md) §二在册）+ DebugBar renderer 面（`window.bottom` Slot；aside CSS `hidden md:block` 逐字——**≥768px 宽屏**可见 CLOSE/DURATION/TPS 三元素，窄屏 <768px 结构性隐藏 = 上游 web 窄窗口同构视口 CSS，非移动特判）；诊断格族/MEMORY/Motion/FOCUS 为构建期（`import.meta.env.DEV`）或 desktop 门结构性缺席（生产 web 构建无 DEV、无 main 域）；堆快照/内存诊断 main 面为桌面诊断域（web 恒 inactive） | —（桌面诊断，无移动业务单元） |
| terminal | — | 无 | 无 | — | mobile Panel（menu, order 30） | #13 |
| file | — | 无 | 无 | Contract（file tree + openIn） | mobile Panel（menu, order 20） | #11 |
| review | — | 无 | 无 | Contract（changes） | mobile Panel（tab, order 10——Diff 一级 tab） | #12 |
| details | — | 无 | 无 | — | mobile Panel（drawer, order 50——MCP/plugins/skills/lsp server 面板） | #15 |
| browser | **是** | 无 | `browser/renderer.tsx` `if (ctx.app.platform !== "desktop") return` | Ipc（BrowserPane）+ Contract | 零（桌面宿主专属；时间线呈现链由 app 承载，见 #17） | #17 |
| pairing | **是** | 无 | `pairing/renderer.tsx` `if (!ctx.desktop) return` | Ipc（Pairing） | 零（桌面配对发起端；移动接收端归 #22） | #22（接收端） |
| updater | **是** | 无 | `updater/renderer.tsx` `if (!ctx.desktop) return` | Ipc（Updater） | 零（桌面发布流程，无移动等价物） | — |
| ssh | **是** | 无 | `ssh/renderer.tsx` `if (ctx.app.platform !== "desktop") return`（issue #67 起为 app.platform；上游注释措辞随宿主迁移更新） | Ipc（Ssh） | 零（第一方 mobile-hosts SSH 已替代，#6） | #6 |
| wsl | **是** | **`os: ["windows"]`（全树唯一 os 声明）** | `wsl/renderer.tsx` `if (ctx.app.platform !== "desktop") return`（renderer 级守卫）+ root.tsx os 过滤（definitions 级，web `os=undefined` → 不入 definitions）——**双重排除**（renderer 守卫 + os 过滤，守卫在探针组 1 五早退守卫在册） | Ipc（Wsl） | **静态排除行（issue #62/N12）**：id + 禁用状态 + 原因文案（决策 0001），零操作（无 Reload/无 Switch/无任何启停安装入口）；宿主 definitions 仍不含 wsl（os 过滤不变） | —（范围排除） |
| microsoft-office | — | 无 | 无 | Contract（FileViewer） | office 工件三 kind 查看器（#18 渲染链） | #18 |
| sources | — | 无 | 无 | —（浏览器软依赖经类型化注册读取 `ctx.use(Browser)()`（issue #67 宿主形态；上游 v2.2.1 的 sources/index.ts 不再声明 uses 面）） | mobile Panel（menu, order 60）+ 宽屏侧面板 transient tab（实验 gate 关闭时 `list` 清缓存返回 `[]`，tab 收回）；数据来自消息 part（websearch/webfetch），零新 RPC | #66（W23） |
| goal | — | 无 | 无 | —（RPC 契约 `@opencode/schema/goal` 的 `opencode.goal`，get + events.changed） | mobile Panel（menu, order 70）+ 宽屏侧面板 pinned tab（仅当该会话 goal 已加载且非 null——服务端无 goal 插件时 `get` 报错被上游语义吞掉、tab 不出现，入口不存在按构造）；暂停/继续/清除走 `session.command` | #66（W22） |

- **web 定义表恰 14 个**：root.tsx `os` 过滤器在 web（`os = platform.platform === "desktop" ? platform.os : undefined`）使 wsl 不入 definitions——宿主定义行即 14 行；管理面呈现 15 行 = 14 宿主定义行 + 1 静态排除行（issue #62/N12：wsl 行为第一方合成呈现，不读宿主状态/失败/禁用记录，G35⑦ 核对；issue #66/M-036 注册 sources、goal 后 13→15、12→14，算术同步修订于同一 commit）。
- **硬 requires 全零**：15 个 `index.ts` 的 `requires:` 零命中——宿主 blocked 态在内建组合中结构性不出现；「missing dependency」的移动呈现=desktop-host 四行的「桌面专属」能力列（宿主能力缺席的如实呈现），而非运行时 blocked。sources 的 `uses.browser` 是软依赖（宿主 `uses` accessor，未激活时 pending，不挡启动）。
- **能力映射三集合**：管理面静态能力表 {context, btw, debug, terminal, file, review, details, microsoft-office, sources, goal} = `web`（可启停；sources/goal 自 issue #66 起入表——两内建均为纯 renderer 侧，服务端能力门槛（sources 实验 gate / goal 插件在位）与能力行启停正交，行禁用=贡献整体缺席）；{browser, pairing, ssh, updater} = `desktop-host`（呈现「桌面专属」+ Switch 禁用态）；{wsl} = `excluded`（issue #62/N12 静态排除行：禁用状态 + 原因文案，零控件）。Ipc 恰 5 内建于 gui-plugins（pairing/wsl/ssh/HeapSnapshots/BrowserPane——web 上「always inactive」，core.ts 注释逐字）+ updater 的 Ipc 定义上移宿主库（`plugin/src/gui/updater.ts`，issue #67）；Contract 恰 3 且定义于宿主库（`plugin/src/gui/{browser,file,review}.ts`，issue #67）。

## 三、宿主生命周期（上游实态，引用不重锁）

- **五态**：`ExtensionStatus = "loading" | "active" | "failed" | "disabled" | "blocked"`（host.tsx）。激活失败分双 phase：`ExtensionFailure { phase: "setup" | "render" }`——setup 失败=贡献整体缺席（deactivate+fail，无死条目）；render 失败=Contribution ErrorBoundary（render.tsx 注释逐字「a contribution that throws records the error and renders nothing, and the rest of the window keeps working」）。
- **禁用注入**：宿主 `disabled: Accessor<ReadonlySet<string> | undefined>` 注入口；watcher 在 disabled 集合变化时批量 deactivate/activate（host.tsx createMemo 块）。
- **同帧批量下线**：`deactivate` 的 dispose 注释逐字「One batch: every contribution and contract of the extension disappears in the same frame.」——九个消费面（panels/slots/commands/menubar/settings pages/servers 等 registry）全部响应式读取 host entries，禁用后同一帧内全部缺席。
- **ready 启动门**：全部内建 entry settle 后窗口才渲染（root.tsx `host.ready()` 门）——启动期禁用集合适用（early-exit 语义见 §四）。
- **blocked 不出现**：内建组合 requires 全零（§二）→ blocked 态结构性不出现；该态的宿主机制保留给第三方扩展（本壳无第三方装载路径，§七）。

## 四、管理面

**上游实态**：上游 GUI 扩展开关面=`runtime/extension/settings-page-dev.tsx` 的 `GuiExtensionsSettings`（每行 definition.id+五态状态文案+failures error `<pre>`+Reload 按钮+Switch toggle），被 `settings/shell.tsx` 三重门限制在桌面 DEV：`import.meta.env.DEV` 懒加载（组件在 prod 为 undefined）+ `!!GuiExtensionsSettings && platform.platform === "desktop"` 门 + `view.tab === "gui-extensions" && !guiExtensions → surface.open("general")` 重定向。启用偏好存于桌面主进程 settings file（`bridge.manager`，`bridge.ts` 文档逐字「undefined on the web」；web 上 `installed.ts` 无 bridge 时 `initial=[]`）。**上游面在 web 双重死**：toggle 走 `bridge?.manager.enable/disable`（optional-chain no-op）、`enabled(id)` 读 `installed.list`（web 恒 `[]` → Switch 恒 true）——第一方存储是移动侧唯一正确路径。

**本期移动面（M-025/M-026 + mobile-hosts 两模块）**：

- **挂载点**：`settings/shell.tsx` 的 `gui-extensions` tab 在非桌面平台挂载第一方 `ExtensionManager`（M-026 增行 `const mobileGuiExtensions = platform.platform !== "desktop"`；guard/nav/mount 三处收敛为该单一非桌面 face——issue #101/M-043/M-044 后 redirect 守卫只剩 `view.tab === "gui-extensions" && !mobileGuiExtensions → surface.open("general")` 防御形）。包装层经 `useExtensionHost()` 取 `definitions`/`status`/`failures`/`reload` 以 props 注入——mobile-hosts 不 import app 内部模块（包边界纪律）。
  **D4 契约解决（issue #109/M-052，注册偏差就此转正为永久保留）**：此前登记的偏差条件「后续 issue 若把移动管理面移入插件设置页注册表则撤除 tab」实测不可满足，tab 保留。目标注册表无法承载管理面的证据（3ebcf9a + origin/main 实测）：(a) 目标注册表 `runtime/plugin/settings-pages.ts` 的 `PluginSettingsPages`/`PluginSettingsSections` 只承载**插件自有**贡献页/节/行；(b) 目标管理 face（`settings/providers/extensions.tsx` → `runtime/plugin/extension-plugins.tsx`，Extensions 页 Plugins tab）是 bridge/server 域的——`const own = () => !!platform.plugins && ServerConnection.builtin(serverSdk.server)`（providers/extensions.tsx:78）在 web/mobile 恒 false（`platform.plugins` undefined → 仅名单呈现、结构性零控件），内建行注释逐字「Built-ins always run and stay hidden unless they failed」（extension-plugins.tsx:52），且该页内容只在 reachable-server data scope 下渲染（shell.tsx `reachable()` memo + `SettingsServerUnavailable` fallback + `SettingsServerDataScope`——零可达服务器时什么都不渲染）——搬入注册表会把「状态/启停/Reload」门在服务器可达性之后，而第一方管理面 window-local、与布局无关；(c) 目标无任何 face 承载三集分类或 N12 wsl 零控件行（v2.2.1 全树 `GuiExtensionsSettings|guiExtensions` 零命中——DEV 管理页上游已删）。M-052 同步解决标签相撞：`settings.guiExtensions.title` 值 "Extensions"/"扩展" 与 `settings.tab.extensions` 逐字相同，削弱「GUI 行 vs 服务端 Plugins 列表区分清晰」验收——现改 "GUI extensions"/"GUI 扩展"（与 mobile-hosts 自有 `guiext.title` 口径一致）；route.ts/pages.ts 的 M-044 挂载注记就地改写为已决语义（`mobile(M-044)` marker 串不变，探针在钉）。
- **禁用记录 schema**：key `opencode-mobile.guiext.v1`，payload `{ version: 1, disabled: string[] }`（id 形态校验+未知 id 丢弃）；第一方 `packages/mobile-hosts/src/extensions/manager.ts` 承载，safeStorage 复用（不可持久化时 volatile 回退并如实上报——禁用仅本会话有效）。**device-local**：不跨设备、不与桌面 settings file、不与远端 opencode.json 同步。
- **toggle 链**：Switch（checked⇔启用）→ Kobalte onChange 交付 checked 新值 → 调用点取反 `!next`（issue #96 修复，extension-manager.tsx——checked⇔启用对 setDisabled 的禁用意图恰为取反；直传 `next` 的旧接线把语义反转成恒 no-op，#26 引入、#96 修复）→ `manager.toggle(id, 禁用意图)`（store 契约 true=禁用）→ 记录更新 → M-025 在 root.tsx disabled memo 中把移动记录**并集**进上游 Set（`for (const id of mobileDisabled.ids()) if (ids.has(id)) merged.add(id)`——**过滤到当前 definitions id 集合**，rename 后未知 id 自愈丢弃）→ 宿主 watcher deactivate/activate → 九消费面同帧响应。上游 `extensionEnabled` 桌面行与 `installed.enableState()` 门零改动（early-exit 语义：initial 资源解析前桌面行与移动记录均暂不生效，与今日 web 启动行为一致，如实登记）。
- **desktop-host 行呈现**：browser/pairing/ssh/updater 四行呈现「桌面专属」+ Switch 禁用态（其宿主状态恒 Active 是机制实态而非可用性声明——不以 host.status 断言移动可用）；wsl 以**静态排除行**呈现（issue #62/N12）：行首 id（`dir="ltr"`）+ 复用「已禁用/Disabled」状态文案 + 决策 0001 原因文案（`guiext.excluded.wsl.reason`，en/zh 对称），**零操作**——无 Reload、无 Switch（范围排除不渲染任何开关，避免暗示启停语义）、不读宿主状态/失败/禁用记录；防御性条件渲染：宿主 definitions 已含某排除 id 时不重复渲染静态行（definitions 行优先）。
- **状态与失败呈现**：每行呈现宿主五态之一（loading/active/failed/disabled/blocked）+ failure error 文案；**Reload**（`host.reload(id)`）为 renderer 侧重试（web 可用；宿主注释「`next` replaces the definition, e.g. after a development hot update」）。
- **语义外溢（M-018 spillover 先例如实登记）**：M-025 在 desktop DEV 构建同样生效（桌面行∪设备记录），而桌面不渲染移动面、桌面 localStorage 无 guiext.v1 → 并集空 no-op；M-026 的 `platform !== "desktop"` 判定使桌面行为零变化。回滚=M-026 单行回退。

## 五、三条保证（验收 2 后半）

1. **no dead menu（禁用面板不留死菜单）**：deactivate 同帧批量（§三）+ 九消费面全响应式。最强证据：mobile More 触发器条件渲染 `<Show when={props.views.menu().length}>`（mobile.tsx）——零 menu/drawer 项时触发器本体消失；扩展命令 `enabled === false → disabled` 五层链（#24 在册）的第⑤层宿主级实例。
2. **loses no draft（不丢草稿）**：composer 草稿是 app 侧 `Persist.prompt`（#9 在册）——扩展生命周期零触碰；扩展面板自身状态在 extension stores（`extension.<id>.<name>` 键，经 `Persist.global/window` 持久化——web 落 WebView localStorage，`persistence/storage.ts` localStorageWithPrefix/localStorageDirect）与面板 strip 键（panels.tsx `Persist.window("tabs")`+legacy 重写仅当面板在场+transient 键随面板缺席清除）；extension server 停机保持=servers.tsx 注释逐字「One that reloads, fails or has not started keeps its last inventory as stopped entries, so its servers' tabs, drafts and routes outlive the outage.」+ ExtensionServerCover（server-shell.tsx 注释逐字「Keep the route mounted so reconnecting preserves its draft and local UI state.」）。
3. **does not stop remote work（不停止远程工作）**：web GUI 扩展纯 renderer（#15 四证据链引用）；`pty.remove` 全扩展域恰 1 处=terminal/model.ts:396 显式 close-tab 动作内（`.catch` 吞错），`model.dispose()` 仅 workspace entry.dispose **零 remove**——禁用 terminal 走 dispose 路径，远端 PTY 按 #13 三级断开语义服务端 detach 存活（首锁归属：verify-terminal 组 2 `expect("pty.remove", [model.ts])` 集合相等+组 3 close()/pty.remove 配对锚——本期探针只新锁 dispose 域零 remove 负断言）；`api.session.interrupt` 三处全在 app/session 域零扩展命中（#9 在册穷举引用）。

## 六、状态恢复与迁移

- **桌面侧**：`EnableState { id, enabled }` 行存桌面主进程 settings file（**不在闭包**，不声称其持久化语义）；`extensionEnabled` 解析=当前 id→legacy id（newest first）→缺省 true（bridge.ts）；`Definition.legacy` 注释逐字「preserve desktop enable state after a rename…This restores the enable preference only; hard dependencies still gate activation and can leave it blocked」——rename 迁移机制在册。
- **移动侧**：禁用记录 `opencode-mobile.guiext.v1`（versioned envelope+volatile 回退+迁移钩子——storage.ts 先例模式）；合并时**过滤到当前 definitions 集合**（rename 后未知 id 自愈丢弃）。两侧差异如实登记：桌面行按 legacy 链解析保留偏好；移动记录对未知 id 直接丢弃（definitions 过滤自愈），与桌面语义互补而非同构。
- **扩展自身状态**：窗口 store `extension.<id>.<name>`（stores 键前缀）经 Persist 持久化；迁移=`Store.from` settings.v3 pick（review mobileDiff/details prefs/updater releaseNotes 三处迁移锚）+ schema 宽松解码（失败读 initial）；面板 strip 键=Persist.window("tabs")+transient 清理（panels.tsx）。**跨升级存活依赖 WebView 数据保留**：覆盖安装升级后记录与扩展 store 存活（G35④ 如实核对）；用户清除应用数据=全部本地状态（含禁用记录）丢失——平台实态，不承诺。manager 记录残键无清理路径（localStorage 残留无害，如实登记）。

## 七、dev/source 管理器 vs packaged 信任/安装模型（验收 4）

- **Build 四字段**：`Build { version, channel: "local"|"dev"|"beta"|"prod", platform: "web"|"desktop", packaged }`（core.ts；packaged 注释逐字「A packaged desktop app, not a development run. Always false on the web.」）；app 侧取值=host-apis.tsx `channel: (import.meta.env.VITE_OPENCODE_CHANNEL ?? "local")`、`packaged: platform.extensions?.packaged ?? false`。
- **dev/source manager**（桌面 DEV 三件套）：settings-page-dev 设置页 + hmr.tsx（「Development only: reloads…」）+ builtins.ts `BUILTINS_UPDATED`/`import.meta.hot.accept`。
- **packaged install 面**（桌面 bridge 专属）：`bridge.manager.install(source)/remove`（remove 注释逐字「Built-ins refuse.」）/source/asset——**全部 desktop bridge，web undefined**；root.tsx 注释逐字「Built-ins only: installed `.ocdx` archives run their main entry until that format ships renderer bundles.」。
- **移动信任模型**：内建扩展随应用编译进 dist（vendored pin+M-001 剥 Electron 依赖在册），无第三方代码装载路径——**移动零安装/零移除/零商店面（marketplace）结构性成立并落字**；本单元与 #15 的「零 GUI 扩展安装入口」声明衔接：启停入口自本期新增，安装入口保持为零。

## 八、与远程 Agent/MCP 配置的区分（#15 承接）

两套同名「extension」概念的区分表见 [agent-capabilities.md](agent-capabilities.md) GUI 边界专节：①远程服务器扩展（设置 extensions tab 的 MCPs/Plugins/Skills+项目级 lsps——服务器 opencode.json 配置的呈现与运行时启停）归 #15；②GUI 扩展宿主（本单元）——本期起其**生命周期管理面**（enable/disable/reload/状态呈现/设置 gui-extensions tab）以第一方移动面存在，install/remove/.ocdx 仍桌面 bridge 专属。远程 extensions 三子 tab 零触碰；两 tab 的文案区分自 issue #109/M-052 起落字：管理面 tab 标签为 **"GUI extensions"/"GUI 扩展"**（`settings.guiExtensions.title`），服务端页为 "Extensions"/"扩展"（`settings.tab.extensions`）——不再同值，区分不再依赖图形位；视觉区分呈现仍归 G35①（G26⑥ 复核位）。

## 九、移动形态与无障碍

- 管理面挂载于设置 gui-extensions tab（多服务器布局同样可达——`mobileGuiExtensions` 判定与布局无关，G35① 复核位）；与 More 抽屉/一级 tab 的扩展注册面关系引用 [interaction-quality.md](../interaction-quality.md)（#20 §二在册——本期禁用行为是其响应式机制的运行时演练，G31⑤② 为 G35①② 复核位）。
- 组件来源=`@opencode/ui` 的 Switch 与 Button（mobile-hosts 既有五 UI 文件的先例面）+自研轻量列表（语义化容器+`data-component` 标记+上游视觉令牌——host-manager 先例「Reuses @opencode/ui primitives and tokens — no new visual decisions, no bare values」）；文案=mobile-hosts 自包含 i18n（`guiext.*` 键 en+zh——host-manager 先例「Deliberately not wired into the upstream i18n provider」）。
- 读屏/焦点/触摸目标归 G35⑨（G31⑦ 复核位）：列表读屏走查、Switch 标签、错误文案读屏、触摸目标。静态排除行（issue #62/N12）为纯文本行：id 使用 `dir="ltr"` 保障双向文本语境下的原始 id 呈现，原因文案为普通 span（不占用 alert 语义——范围排除是常驻事实而非事件）；行内零控件即零可聚焦控件，无焦点陷阱面，读屏可读出 id/状态/原因——G35⑨ 抽查位。
- **移动面板注册表（issue #66 起）**：既有五注册 review（tab, 10）/file（menu, 20）/terminal（menu, 30）/context（menu, 40）/details（drawer, 50）之外，sources（menu, order 60）、goal（menu, order 70）与 btw（menu, order 80——issue #70/M-038）入表——编号与 compose 序一致，无重号（order 集合 {10..80} 由 `verify-goal-sources` 组 1 集合等式锁）。窄屏 More 抽屉项恒在：sources 在实验 gate 关闭时呈空态文案（不移植上游「渲染 null」的空白面）、gate 开启但无来源时呈「最近有来源的 turn 或空态」；goal 无 goal 时呈空态文案（服务能力降级契约的诚实呈现）；btw 呈「最近一条问答或诚实空态」（store ready 前空容器防闪空态；窄屏无 close 通道，问答在视口加宽后以 strip tabs 重现——上游存储效应登记，见 matrix W21/E26）。差异 D3 如实登记：宽屏时间线 sources chip 的唤起路径保持上游逐字（不加 narrow 守卫），`layout.open` 对窄屏 transient tab 的无效切换为上游同态事实——窄屏入口以抽屉项为主、chip 唤起在桌面宽度（MatePad ≥768px）生效。
- **实验 gate 存储（issue #66/D2）**：sources gate 走 `ui/src/motion-tuning.ts` 最小 shim（仅上游 Knobs dev 台被消费的四面：toggle/choice/spring/subscribe），存储沿用上游 `opencode.motion.v2` localStorage 记录格式（toggle 0/1、choice 存选项索引、spring `<id>.duration`/`<id>.bounce`、非默认条目才落盘、空记录移除键），默认 false、无 auto-enable 路径、不经 settings.v3；设置 → Experimental → Sources 行是唯一写入面。#67 若引入真 motion-tuning 台，shim 可被原位替换（同键同格式，已存值不丢）。
- **与 #67 的衔接（gui-plugins 迁移映射，防返工）**：sources 迁移=宿主 API 机械改名（`../sdk`→`@opencode/plugin/gui`、`Setup`→`Plugin.Setup`、`useExtension`→`usePlugin`、`ctx.uses.browser()`→`ctx.use(Browser)()`、`Browser` from `../browser/contract`→`@opencode/plugin/gui/browser`、`onIdle` 自 sdk→`@opencode/plugin/gui/builtin`、`Extension.define`→`Plugin.define`——v2.2.1 gui-plugins 版即对照答案）；goal 迁移=数据层（schema 契约+createStore 订阅+command 路径）零改动，Panel 注册届时二选一（保留 Panel 或升级 ComposerPill，由 #67 范围决定）。本期全部增量（goal Panel 形态、gate shim、两个 mobile face、设置开关行）为第一方登记差异（D1/D2/D3），不阻塞宿主迁移。

- **debug bar 移动实态（issue #73/W28）**：debug 的移动贡献面为纯 renderer 侧——`debug.toggle` 命令（无条件注册，先于 renderer 的 desktop 门行）+ DebugBar（`window.bottom` Slot，`hidden md:block`：≥768px 宽屏 CLOSE/DURATION/TPS 三元素；窄屏结构性隐藏）；desktop-only 面（诊断格族/MEMORY/Motion/FOCUS/堆快照与内存诊断 main 域）在移动构建全部诚实缺席或元素级不渲染、无误报；titlebar 渠道开关在移动构建不渲染（渠道 env 未设——titlebar.tsx `if (!channel || channel === "prod") return null` 任何视口早退，评审 MAJOR-1 修正，明细见 implementation.md W28/E29 小节）；静态探针 `scripts/verify-debug-bar.ts`（四组 + 负例四组）在册。

## 十、诚实边界（本期不声称）

- **G35 全部运行期行为 BLOCKED**（十项）——未过前只声称「文档/探针/单测/构建级已验证，运行期已实现（未验证）」（§首第二十一处落字）。
- **贡献设置行无需 app 侧移动能力过滤（issue #109/S41 如实登记）**：插件向 `PluginSettingsPages`/`PluginSettingsSections` 的注册发生在插件自己的桌面守卫之后——pairing 与 updater 均在 `if (!ctx.desktop) return` 之后才 `ctx.add(SettingsPage, …)`——移动构建上这些贡献结构性缺席：app 侧零平台过滤面、零 live root 插件页（verify-settings-framework 组 12 静态在钉；过滤属插件自有语义，宿主注册表不做平台过滤）。
- **桌面主进程侧不声称**：EnableState 持久化语义、manager.reload main 面、.ocdx install/remove 行为、桌面 DEV 面运行实态——packages/desktop 不在闭包（仅图标资产）。
- **移动禁用记录 device-local**：不跨设备、不与桌面 settings file、不与远端 opencode.json 同步；volatile 回退时禁用仅本会话有效并如实提示。
- **desktop-host 四扩展（browser/pairing/ssh/updater）呈现「桌面专属」**：其 Active 状态是宿主机制实态而非可用性声明；wsl 以静态排除行呈现（issue #62/N12，决策 0001——不发现/不安装/不启停/不管理/不执行命令，原因文案明示且含 Windows 宿主，末句声明原生 Windows 远程主机支持保留）；btw 移动可达（issue #70/M-038：命令门放宽为 `mounted()` + mobile Panel menu order 80——**视口判据口径**：`narrow()` 为 <768px 视口而非平台判据，窄桌面窗口同样生效，与上游六 mobile face 的视口驱动机制一致；桌面 ≥768px 行为按构造不变）——管理面仍列出（定义在表），能力列如实。
- **失败注入不可控**：上游无 fault-injection 面——G35③ 以 Reload 行为+呈现面核对承载，不虚构故障演练。
- **extension store 跨升级存活依赖 WebView 数据保留**（§六）。
- **探针证明力**：`scripts/verify-gui-extensions.ts` 是 static STRUCTURE check（文本锚/归一化扫描/集合相等/负例实测），零运行时证明力；交叉引用锚（#15 四证据链/#24 五层链/#20 More 抽屉/#13 pty 语义——首锁 verify-terminal 组 2/组 3/#9 interrupt 穷举/root.tsx VAC 四锚）引用不重锁，首锁归属在探针头注逐条声明。
- **上游宿主无单测**：host.tsx 生命周期（activate/deactivate/watcher）上游零直接测试——结构面由探针+V2 承载，行为面归 G35。
- **debug bar 窄屏 face 源码级未真机宣称（issue #73/W28）**：窄屏 <768px 隐藏与 titlebar 渠道徽章不渲染均为源码级核对（设备 CSS 视口下限 818px，S04 在册——窄屏 face 不可真机演练，CDP 合成覆盖不代表真机 face）；宽屏呈现、命令面板可达（keybind-only：物理键盘 mod+k、Settings > Shortcuts、CDP）与管理面启停行为归设备 QA 待执行（build-and-verify.md issue #73 段 QA-1..QA-3）。
