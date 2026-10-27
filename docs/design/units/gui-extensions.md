# 单元：GUI 扩展管理面（gui-extensions）

覆盖范围：内建 GUI 扩展的**管理面**——可见的启用/禁用、状态与失败呈现、重试（Reload）、状态恢复，以及 13 个内建扩展在选定上游 pin 的清单与宿主能力映射。扩展的**业务行为权威不在本文**：各扩展交付的面由对应 feature 单元文档与 [agent-capabilities.md](agent-capabilities.md)（远程面）承载，冲突时以单元文档为准并按双向变更协议回修本文。本文同时固化 dev/source 扩展管理器与 packaged 信任/安装模型的区分（验收 4），并落字：**移动零安装、零移除、零扩展商店（marketplace）**——不声称任何不受支持的能力。

**状态声明（第二十一处落字）**：G35 未过前（[../interaction.md](../interaction.md)），本单元的全部运行期表述只声称「**已实现（未验证）**」——文档/探针/单测/构建级已验证，运行期已实现（未验证）。

## 一、权威边界与分工

- **本文是管理面单元**：交付的是「用户如何看待与控制内建 GUI 扩展」（启停/状态/失败/恢复），不改变任何扩展的贡献内容与业务行为。禁用某扩展导致对应单元的移动面隐藏（如禁用 review → Diff 一级 tab 消失、禁用 microsoft-office → office 工件退回上游占位）是**用户自主选择的结果**，不是对应单元验收的变更；恢复启用后面板如常（G35② 核对口径）。
- **业务行为归属**：远程 Agent/MCP/插件/扩展配置面归 [agent-capabilities.md](agent-capabilities.md)（#15，两套同名 extension 概念的区分承接自其专节）；office 查看器归 [artifact-viewers.md](artifact-viewers.md)（#18）；diff 归 [diff.md](diff.md)（#12）；终端归 [terminal.md](terminal.md)（#13）；文件归 [files.md](files.md)（#11）；browser 归 [browser.md](browser.md)（#17）；SSH 隧道归 [connection.md](connection.md)（#6）；配对归 [connection.md](connection.md) 配对专节（#22）；会话工作台归 [session-workbench.md](session-workbench.md)（#9）。
- **主进程红线（验收 3 本体）**：phone never runs Electron/Node main-process extensions——引用 [agent-capabilities.md](agent-capabilities.md) 四条独立证据链（web 无 Bridge 字段/Ipc 在 web 恒 inactive/app 零 `sdk/main` import/上游设置面 DEV+desktop 双门），本文不重证；本期增量为六 main entry 懒加载清单与五早退守卫的清单化（§二）。「document precise difference for product decision」= §二能力列与 §七：六 main 面无移动等价物可适配（updater=桌面发布流程、wsl=范围排除（[决策 0001](../../decisions/0001-wsl-exclusion.md)）、ssh=第一方 mobile-hosts 已替代（#6）、browser=桌面宿主专属（#17）、pairing=桌面侧协议、debug heap=桌面诊断），**不 adapt 任何原生能力**。

## 二、内建扩展清单（验收 1 主表，pin `b4525d79bf`）

13 个内建扩展（`gui-extensions/src/renderer.ts` compose 顺序=context, btw, debug, terminal, file, review, details, browser, pairing, updater, ssh, wsl, microsoft-office；`main.ts` 同表）。清单在 pin 更新时由探针集合断言强制刷新（`scripts/verify-gui-extensions.ts` 组 1/2——清单漂移即 FAIL，回归集随 pin 更新演练同步执行）。

| id | main entry（懒加载六者） | os 声明 | web/移动早退守卫 | token 分类 | 移动实际贡献面 | 业务 owner |
| --- | --- | --- | --- | --- | --- | --- |
| context | — | 无 | 无 | —（窗口侧 Slot/Panel） | session.header Slot（order 10）+ mobile Panel（menu, order 40） | #9（会话域） |
| btw | — | 无 | 无（命令门 `enabled: !layout.narrow() && mounted()`——移动实际不可达，如实登记） | — | 零（无 mobile Panel；窄屏命令门使按钮不可达） | #9（会话域） |
| debug | **是**（`main: () => import("./debug/main")`） | 无 | 无 | Ipc（HeapSnapshots，web 恒 inactive） | 零 UI 贡献（桌面诊断） | —（桌面诊断，无移动业务单元） |
| terminal | — | 无 | 无 | — | mobile Panel（menu, order 30） | #13 |
| file | — | 无 | 无 | Contract（file tree + openIn） | mobile Panel（menu, order 20） | #11 |
| review | — | 无 | 无 | Contract（changes） | mobile Panel（tab, order 10——Diff 一级 tab） | #12 |
| details | — | 无 | 无 | — | mobile Panel（drawer, order 50——MCP/plugins/skills/lsp server 面板） | #15 |
| browser | **是** | 无 | `browser/renderer.tsx` `if (ctx.build.platform !== "desktop") return` | Ipc（BrowserPane）+ Contract | 零（桌面宿主专属；时间线呈现链由 app 承载，见 #17） | #17 |
| pairing | **是** | 无 | `pairing/renderer.tsx` `if (!ctx.desktop) return` | Ipc（Pairing） | 零（桌面配对发起端；移动接收端归 #22） | #22（接收端） |
| updater | **是** | 无 | `updater/renderer.tsx` `if (!ctx.desktop) return` | Ipc（Updater） | 零（桌面发布流程，无移动等价物） | — |
| ssh | **是** | 无 | `ssh/renderer.tsx` `if (ctx.build.platform !== "desktop") return`（注释逐字「SSH lives in the desktop main process.」） | Ipc（Ssh） | 零（第一方 mobile-hosts SSH 已替代，#6） | #6 |
| wsl | **是** | **`os: ["windows"]`（全树唯一 os 声明）** | 无守卫但被 root.tsx os 过滤排除（web `os=undefined` → 不入 definitions） | Ipc（Wsl） | **不在移动清单**（os 过滤结构性排除；范围决策 0001） | —（范围排除） |
| microsoft-office | — | 无 | 无 | Contract（FileViewer） | office 工件三 kind 查看器（#18 渲染链） | #18 |

- **web 定义表恰 12 个**：root.tsx `os` 过滤器在 web（`os = platform.platform === "desktop" ? platform.os : undefined`）使 wsl 不入 definitions——管理面清单即 12 行（wsl 不在列是结构性事实，G35⑦ 负例核对）。
- **硬 requires 全零**：13 个 `index.ts` 的 `requires:` 零命中——宿主 blocked 态在内建组合中结构性不出现；「missing dependency」的移动呈现=desktop-host 四行的「桌面专属」能力列（宿主能力缺席的如实呈现），而非运行时 blocked。
- **能力映射两集合**：管理面静态能力表 {context, btw, debug, terminal, file, review, details, microsoft-office} = `web`（可启停）；{browser, pairing, ssh, updater} = `desktop-host`（呈现「桌面专属」+ Switch 禁用态）；wsl 不在列。Ipc 恰 6（pairing/wsl/updater/ssh/HeapSnapshots/BrowserPane——web 上「always inactive」，core.ts 注释逐字）+ Contract 恰 3（browser/file/review）。

## 三、宿主生命周期（上游实态，引用不重锁）

- **五态**：`ExtensionStatus = "loading" | "active" | "failed" | "disabled" | "blocked"`（host.tsx）。激活失败分双 phase：`ExtensionFailure { phase: "setup" | "render" }`——setup 失败=贡献整体缺席（deactivate+fail，无死条目）；render 失败=Contribution ErrorBoundary（render.tsx 注释逐字「a contribution that throws records the error and renders nothing, and the rest of the window keeps working」）。
- **禁用注入**：宿主 `disabled: Accessor<ReadonlySet<string> | undefined>` 注入口；watcher 在 disabled 集合变化时批量 deactivate/activate（host.tsx createMemo 块）。
- **同帧批量下线**：`deactivate` 的 dispose 注释逐字「One batch: every contribution and contract of the extension disappears in the same frame.」——九个消费面（panels/slots/commands/menubar/settings pages/servers 等 registry）全部响应式读取 host entries，禁用后同一帧内全部缺席。
- **ready 启动门**：全部内建 entry settle 后窗口才渲染（root.tsx `host.ready()` 门）——启动期禁用集合适用（early-exit 语义见 §四）。
- **blocked 不出现**：内建组合 requires 全零（§二）→ blocked 态结构性不出现；该态的宿主机制保留给第三方扩展（本壳无第三方装载路径，§七）。

## 四、管理面

**上游实态**：上游 GUI 扩展开关面=`runtime/extension/settings-page-dev.tsx` 的 `GuiExtensionsSettings`（每行 definition.id+五态状态文案+failures error `<pre>`+Reload 按钮+Switch toggle），被 `settings/shell.tsx` 三重门限制在桌面 DEV：`import.meta.env.DEV` 懒加载（组件在 prod 为 undefined）+ `!!GuiExtensionsSettings && platform.platform === "desktop"` 门 + `view.tab === "gui-extensions" && !guiExtensions → surface.open("general")` 重定向。启用偏好存于桌面主进程 settings file（`bridge.manager`，`bridge.ts` 文档逐字「undefined on the web」；web 上 `installed.ts` 无 bridge 时 `initial=[]`）。**上游面在 web 双重死**：toggle 走 `bridge?.manager.enable/disable`（optional-chain no-op）、`enabled(id)` 读 `installed.list`（web 恒 `[]` → Switch 恒 true）——第一方存储是移动侧唯一正确路径。

**本期移动面（M-025/M-026 + mobile-hosts 两模块）**：

- **挂载点**：`settings/shell.tsx` 的 `gui-extensions` tab 在非桌面平台挂载第一方 `ExtensionManager`（M-026 增行 `const mobileGuiExtensions = platform.platform !== "desktop"`；redirect 条件与 nav 条件随之修订；upstream 分支保持 DEV+desktop 原样——桌面行为零变化）。包装层经 `useExtensionHost()` 取 `definitions`/`status`/`failures`/`reload` 以 props 注入——mobile-hosts 不 import app 内部模块（包边界纪律）。
- **禁用记录 schema**：key `opencode-mobile.guiext.v1`，payload `{ version: 1, disabled: string[] }`（id 形态校验+未知 id 丢弃）；第一方 `packages/mobile-hosts/src/extensions/manager.ts` 承载，safeStorage 复用（不可持久化时 volatile 回退并如实上报——禁用仅本会话有效）。**device-local**：不跨设备、不与桌面 settings file、不与远端 opencode.json 同步。
- **toggle 链**：Switch → `manager.toggle(id, next)` → 记录更新 → M-025 在 root.tsx disabled memo 中把移动记录**并集**进上游 Set（`for (const id of mobileDisabled.ids()) if (ids.has(id)) merged.add(id)`——**过滤到当前 definitions id 集合**，rename 后未知 id 自愈丢弃）→ 宿主 watcher deactivate/activate → 九消费面同帧响应。上游 `extensionEnabled` 桌面行与 `installed.enableState()` 门零改动（early-exit 语义：initial 资源解析前桌面行与移动记录均暂不生效，与今日 web 启动行为一致，如实登记）。
- **desktop-host 行呈现**：browser/pairing/ssh/updater 四行呈现「桌面专属」+ Switch 禁用态（其宿主状态恒 Active 是机制实态而非可用性声明——不以 host.status 断言移动可用）；wsl 不在列。
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

两套同名「extension」概念的区分表见 [agent-capabilities.md](agent-capabilities.md) GUI 边界专节：①远程服务器扩展（设置 extensions tab 的 MCPs/Plugins/Skills+项目级 lsps——服务器 opencode.json 配置的呈现与运行时启停）归 #15；②GUI 扩展宿主（本单元）——本期起其**生命周期管理面**（enable/disable/reload/状态呈现/设置 gui-extensions tab）以第一方移动面存在，install/remove/.ocdx 仍桌面 bridge 专属。远程 extensions 三子 tab 零触碰；两 tab 的视觉/文案区分呈现归 G35①（G26⑥ 复核位）。

## 九、移动形态与无障碍

- 管理面挂载于设置 gui-extensions tab（多服务器布局同样可达——`mobileGuiExtensions` 判定与布局无关，M-018 同型核对归 G35①）；与 More 抽屉/一级 tab 的扩展注册面关系引用 [interaction-quality.md](../interaction-quality.md)（#20 §二在册——本期禁用行为是其响应式机制的运行时演练，G31⑤② 为 G35①② 复核位）。
- 组件来源=`@opencode/ui` 的 Switch 与 Button（mobile-hosts 既有五 UI 文件的先例面）+自研轻量列表（语义化容器+`data-component` 标记+上游视觉令牌——host-manager 先例「Reuses @opencode/ui primitives and tokens — no new visual decisions, no bare values」）；文案=mobile-hosts 自包含 i18n（`guiext.*` 键 en+zh——host-manager 先例「Deliberately not wired into the upstream i18n provider」）。
- 读屏/焦点/触摸目标归 G35⑨（G31⑦ 复核位）：列表读屏走查、Switch 标签、错误文案读屏、触摸目标。

## 十、诚实边界（本期不声称）

- **G35 全部运行期行为 BLOCKED**（十项）——未过前只声称「文档/探针/单测/构建级已验证，运行期已实现（未验证）」（§首第二十一处落字）。
- **桌面主进程侧不声称**：EnableState 持久化语义、manager.reload main 面、.ocdx install/remove 行为、桌面 DEV 面运行实态——packages/desktop 不在闭包（仅图标资产）。
- **移动禁用记录 device-local**：不跨设备、不与桌面 settings file、不与远端 opencode.json 同步；volatile 回退时禁用仅本会话有效并如实提示。
- **desktop-host 四扩展（browser/pairing/ssh/updater）呈现「桌面专属」**：其 Active 状态是宿主机制实态而非可用性声明；wsl 不在移动清单；btw 移动不可达（窄屏命令门+无 mobile Panel）——管理面仍列出（定义在表），能力列如实。
- **失败注入不可控**：上游无 fault-injection 面——G35③ 以 Reload 行为+呈现面核对承载，不虚构故障演练。
- **extension store 跨升级存活依赖 WebView 数据保留**（§六）。
- **探针证明力**：`scripts/verify-gui-extensions.ts` 是 static STRUCTURE check（文本锚/归一化扫描/集合相等/负例实测），零运行时证明力；交叉引用锚（#15 四证据链/#24 五层链/#20 More 抽屉/#13 pty 语义——首锁 verify-terminal 组 2/组 3/#9 interrupt 穷举/root.tsx VAC 四锚）引用不重锁，首锁归属在探针头注逐条声明。
- **上游宿主无单测**：host.tsx 生命周期（activate/deactivate/watcher）上游零直接测试——结构面由探针+V2 承载，行为面归 G35。
