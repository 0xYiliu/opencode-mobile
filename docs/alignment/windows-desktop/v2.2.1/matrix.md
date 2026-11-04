# Windows Desktop v2.2.1 ↔ 本项目功能对齐矩阵

## 版本与事实口径

- 更新日期：**2026-11-01**；Mobile 检查提交：**`c68ccc0c2541e4cf19be4befc706cb09fcce0690`**，本轮远端查询确认 main/dev 均为该提交。
- 上游目标：Windows Desktop **v2.2.1**，`3ebcf9a32c7b28f658cfee80775448929361727a`。本轮沿用活跃版本，未切换至上游最新分支。
- Vendor：全局 pin **`b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`**，gui-plugins 单包来源为目标 `3ebcf9a…`，叠加移动补丁；**不是整套上游已升级到 v2.2.1**。
- 架构：共享 Web UI + Kotlin 原生 WebView。已有 debug APK、MatePad 与模拟器局部运行记录；本次只核对源码和台账，没有新构建或设备测试。Windows v2.2.1 安装包尚未运行验证。
- 本轮将长篇实施历史归回证据索引，保留全部稳定 ID；当前结论与历史限制的适用边界见 [E34 当前复核](current-review.md)。原始盘点 `cf1504d`、首次集成 `4c2ec43` 是历史来源，不再充当当前基线。

[推进规则](../../workflow.md) · [Windows 源码及验收映射](baseline.md#source-map) · [E01–E33 历史实现证据](implementation.md) · [E34 当前源码/台账复核](current-review.md) · [运行验证台账](../../../build-and-verify.md)

## 状态定义

- **已有代码**：可定位实现；未发现具体缺失不等于已证明目标版本等价。
- **部分实现**：有实现且已定位未覆盖的子能力或目标行为；缺口具体写入差异列。
- **待核对**：证据不足，不能推定未实现。**未实现**：已定位能力缺失。**不实现**：有既定产品范围依据；暂缓另注明激活条件。
- 策略为对齐、适配、新增、排除。源码、历史局部运行与当前集成版全链验收分开；未特别说明均为**目标版本运行等价性未验证**。
- “有待补验”不自动降低为“未实现”；“局部 PASS”不自动提升整行或整版本为完成。

## 当前差距摘要

| 类别 | 关键结论 | 关联 ID |
| --- | --- | --- |
| 明确的版本增量缺口 | Inbox 只有设置面、仍呈 Side rail；queue 仍为 pin 实现，缺目标乐观编辑/重排、失败恢复及媒体保留链；导出未带目标 `mediaRefs: false` | S04/W05、S09/W15、W13 |
| 已有能力的呈现差异 | 搜索保留旧组件交互；Goal 保留侧面板而非 ComposerPill；Sources、btw 有第一方窄屏适配 | S02、W21–W23 |
| 已补齐的移动/版本能力 | gui-plugins 宿主、实验设置、减少动效/缩放、About、相机授权、原生外跳已有；Settings 崩溃、主机塌缩、管理器开关已修复并有局部真机复验 | S17/S38/S39/S41/S42、S27/S35/S43、N08/N11、D03 |
| 最大验收缺口 | 当前集成版真实任务收发/权限/恢复双路由闭环，以及文件、Diff、PTY、Office、通知等运行门禁仍未全过 | W01–W20、M02–M05 |
| 已确认范围差异 | 手机不托管本地服务/浏览器、无第三方 GUI 完整运行、无进程死亡通知；APK 更新/语音暂缓，外链唤起不实施 | N01–N03/N06/N07/N09、D01–D05、S40/W24 |

## A. Settings

| ID | 功能/Windows v2.2.1 目标 | 本项目实现 | 策略与当前差距 | 证据/验证 |
| --- | --- | --- | --- | --- |
| S01 | 设置导航、进入/退出与返回上下文 | 已实现（未验证） | 对齐；**框架已迁移至 v2.2.1（issue #101/M-043/M-044）**：单一 RootSettings 布局 + CollapsedSidebarToggleSpace 48px 返回行 + view 模型（root{server?}/project，pin 嵌套 server 视图移除）+ settingsViewRedirect 出口表；返回链（search.back→clear→surface.back→common.goBack）与键盘避让设备冒烟 PASS（DBY2-AL00）；宽窄导航一致性的 Desktop 对照仍 BLOCKED（无 Windows 参考端） | E13/E31/E34；#90 补验 Settings 可达 PASS |
| S02 | 搜索设置并定位设置行 | 已实现（未验证） | 对齐；**目标 SearchList/SearchHighlight/Slash 分组搜索已迁移（issue #101/M-043）**，聚焦定位（searchActivation→revealSettingsSearch，anchor 缺失 no-op 不崩）与命令面板桥（≤5 条 setting 行）；mobile(M-044) 剪除的**三悬挂目录行已全部恢复**：background-activity/timeline-width 随 #103/M-046 连同 general.tsx 页 anchor 恢复（设备实测 capsule/timeline width 命中→定位→行可见）；`settings-sounds-interface` 随 **issue #107/M-050** 连同 notifications 页真实 anchor 恢复（catalog 行 + `data-action="settings-sounds-interface"` Switch 双正锚；search-catalog.ts 的 M-044 剪除注记随之移除，route.ts 自有 M-044 注记归 #109；设备实测 `interface`/`sound` 查询命中「Interface｜Sound effects」→ 定位真实行在视口内）；#90 回归不复现（源断言+设备实测）；设备冒烟 font→4 结果含 Zoom→定位→返回 PASS；分组/聚焦 Desktop 对照 BLOCKED | E02/E31/E34；#90 搜索命中 PASS；#103 搜索复验 PASS |
| S03 | 设置中的服务器选择与数据隔离 | 已实现（未验证） | 对齐；**server scope 单一事实来源已迁移（issue #101/M-043/M-044）**：surface.server() 解析序（视图 server→source→本地连接→第一台）、selectServer/openServers、目标 SettingsServerSwitcher（≤1 不渲染，RadioGroup+健康点+Manage 出口）与 SettingsServerUnavailable（Retry/Edit 出口）；设备冒烟：三服务器 switcher 换选保页 PASS（authorized-bastion→bastion-main）；**真服务隔离（项目列表归属核对）仍待真服务验证**；Unavailable 整页态未在冒烟中捕获（服务器停留 Loading 态）——结构+单测锁定，实态归 G 门禁 | E02/E04，G13 |
| S04 | Top / Side / Inbox 模式 | 部分实现 | **设置面已目标形（issue #103/M-046）**：InterfaceModeSetting 三模式行随 general.tsx 目标逐字迁移（设置与持久化已有）；Inbox 选择后的实际呈现仍是 Side rail，缺分组/跨服务聚合/相应徽标（W05 保持）——不以设置面存在推定模式体验对齐 | E19/E34；MatePad 宽屏实态已验，<768px 未验；#103 设备逐项持久化见台账 |
| S05 | 语言切换 | 已实现（未验证） | 对齐；#103 新增 13 键 en-only（backgroundActivity 6/width 5/sounds.interface 2），回退英文为上游 v2.2.1 实态，不能宣称全量中文覆盖；被移除的 terminalPlacement 4 键只清 en 与 9 个 typed locale 字典（其余 53 个无类型 locale 的滞留键惰性保留） | E02/E20–E23 |
| S06 | 默认工作区目的地 | 已实现（未验证） | 对齐；WorkspaceDestinationSetting 行经 #103 逐字核对=目标形（默认 last-used、三选项序）；远程目录执行语义仍归 G 运行面 | E02/E03 |
| S07 | 默认自动批准权限 | 已实现（未验证） | 对齐；AutoApprovePermissionsSetting 行经 #103 逐字核对=目标形，**默认关（opt-in）保持**；代答执行面（once/always 落盘/批量扩散）归属 permission-requests 单元契约，真服务审批门禁归 G21 | E02/E03，G21 |
| S08 | 显示自定义 Agent | 已实现（未验证） | 对齐；行经 #103 逐字核对=目标形（默认 false），开关/能力契约已有，新增行为待核 | E02/E04 |
| S09 | 后续消息 queue / steer | 部分实现 | **设置行对齐（issue #103/M-046）**：FollowUpBehaviorSetting 行随 general.tsx 目标逐字（默认 steer、mod+enter 描述）；执行链仍为旧 queue（W15 保持）——设置面通过不关闭执行链差距 | E03/E34 |
| S10 | 时间线详情分类与预设 | 已实现（未验证） | **timeline-detail 控件零增量复用（pin=target 逐字节）**；预设/枚举呈现链明确登记为 session-ui 后续：`timelineCategories` 目标形增 commentary、compact/quiet 预设 subagents grouped→separate——对应 `commentary` placement 槽与 `settings.timeline.category.commentary` 键/新文案**不采纳**（M-046 登记，避免 copy 与 vendored 预设行为不符）；目标写出的含 commentary 槽文档 decode 丢槽；「类别枚举与实际呈现尚未逐项证明等价」保持 | E02/E03 |
| S11 | 时间线宽度、后台活动位置、每轮 Diff | 已实现（未验证） | **字段+行+搜索行+宽度消费 token 已落地（issue #103/M-046）**：backgroundActivity（默认 left）/timelineWidth（默认 comfortable）schema+defaults+store API+设置行+恢复的搜索目录行；`dataset.timelineWidth` → `:root[data-timeline-width=…]` → `--container-session`（488/744/1000px）→ 7 个既有 `md:max-w-session` 消费点（≥768px 断点域）；**逐项实测口径**（不再以设置页存在推定等价）：宽度三档实态/重启保持为 #103 设备 QA 项；backgroundActivity 的 composer 呈现消费不接（目标消费文件在 vendored 树不存在，W05 相邻面登记）；每轮 Diff（turnDiffs）行目标形已有 | E02/E03；#103 设备宽度三档记录 |
| S12 | 捏合缩放 | 已有代码（平台默认态） | 适配；保持 WebView 默认，不移植 desktop-only 捏合开关；MatePad 主页捏合/双击无缩放且无布局破损；#102 服务器页迁移未触及捏合行（General 页逐字保留）；#103 General 页目标迁移后捏合行与 desktop 条件门在目标形中原样保留（桌面平台条件可见）；#104 换壳复验：新设置壳下 General 页 data-action 全集零 pinch/zoom 行（desktop 门控行 mobile 不渲染）+ viewport meta 无 user-scalable 负锚复验 + 工作台 zoom=2 交叉场景双击观察（visualViewport.scale 恒 1、零横向溢出、零布局破损——双指捏合注入未执行，#74 WebView 默认裁定与代码负锚为准） | E30；界面放大另见 S42 |
| S13 | 窄屏标题栏顶部/底部 | 已实现（未验证） | **设置面无增量**（mobile() 标题栏行目标原生含于 M-046 迁移的 general.tsx）；返回键、安全区、软键盘及 <768px 实态仍需联验——设备 DPR 2.25 下最小原生 CSS 宽 ≈818px>768，物理达不到窄断点；CDP `Emulation.setDeviceMetricsOverride` 路径可用则实测，否则 BLOCKED 并记录 DPR 依据 | E02/E32；#103 按可做/阻塞口径记录 |
| S14 | Diff 换行 | 已有代码及局部运行证据 | 对齐；review 贡献设置已有且经 #109 宿主承载核验（PluginSettingsSections general/general 挂载 + 搜索揭示 target=settings-mobile-diff-wrap、节标签=宿主 Preferences/General 实测命中）+ wrap 偏好跨重启保持实测通过；真实长 Diff overflow 翻转待验（无可达服务会话面，如实登记） | E05/E23，G23；issue #109 |
| S15 | 主题与系统/浅色/深色 | 已有代码及运行证据（issue #104） | 对齐；外观页内面目标形（appearance.tsx byte-identical + context.tsx 438 行 byte-identical + themes/*.json 36 文件集合全等 + M-047 死代码收敛）；设备 DBY2-AL00 复验：system/light/dark 即时生效（data-color-scheme+背景+style color-scheme 三通道）、Dark 跨重启保持、Theme 名下拉 36 选项集呈现、Dracula 选择即时生效并跨重启保持；Windows Desktop 实机对照保持 BLOCKED（无参考端） | E02；#104 补验 |
| S16 | 界面/代码/终端字体 | 已有代码及运行证据（issue #104） | 对齐；外观页内面三类 TextInput 行目标形（settings-ui-font/settings-code-font/settings-terminal-font）；设备复验：UI=--font-family-sans、code=--font-family-mono+document.fonts.load 即时生效，terminal 经 appearance accessor 消费（target 形，终端面呈现归 terminal 单元），自定义值跨重启保持、清空回落默认（Inter/IBM Plex Mono 栈）；CJK 内容回退栅格化观察本轮 en-locale 设置页无 CJK 内容不可采，栅格化差异按文档口径不算布局偏差，运行期核对保持 G31 | E02，G31；#104 补验 |
| S17 | 减少动效 system/on/off | 已有代码及运行证据（issue #104 复验） | 对齐；设置与消费链已接通，显式 On/Off 与持久化已验；#104 换壳复验：On→dataset.motion=reduce 即时+采样 transition 0s、Off→full、On/Off 各自跨重启保持（写后 ≥10s 再 force-stop——写后即刻 force-stop 会落入 Chromium localStorage 提交窗口丢末次写，QA 方法注记非应用缺陷）；System 档实测平台映射=full（WebView 114 无系统映射，环境差异再登记，不加静默回退） | E21/E34；#65/#104 补验 |
| S18 | Agent/权限/错误系统通知 | **已实现（页面目标形已验；issue #107/M-050）** | 对齐；设置页随 #107 收敛目标形（三开关 + Android 状态行 + M-024 权限面逐字保留；not-adopted 登记：target notification.tsx +16 hasRunningChild 工作台面归后续 issue、toast.tsx dead-export 收敛 no-owner-gap）；.145 设备 QA：页面目标形渲染 + 开关持久化跨重启 + OFF→ON 请求零 dialog + 状态行 session-signal 语义（同进程保留/跨重启回中性）PASS；**真实通知投递/点击路由/失败恢复 BLOCKED**（无可达服务），allow/deny/revoke 全矩阵 BLOCKED（API 31 无 runtime dialog）——存活期间 best-effort 不变，完整事件到达/点击门禁归 G33 | E08，G33；M-050；D05 为范围边界；#107 |
| S19 | 任务声音选择、预览与界面音效 | **已实现（页面目标形已验；issue #107/M-050）** | 对齐；设置页随 #107 收敛目标形：三类声音 Select + **Interface 声音行**（字段+Switch+持久化+搜索行恢复——播放消费者惰性登记：target 的 new-session wordmark/PinBoard 消费族不在 vendored 树，呈现归后续 new-session issue，S11 先例）；45 音资源双侧同树 hash（26 emitted + 19 内联，三默认音内联）；sound.ts 随目标收敛 3 个 export（零消费者）；.145 设备 QA：选择持久化跨重启 + 静音（None→零 `new Audio` 构造）+ **播放路径机证**（`Audio.prototype.play` promise resolution：emitted `alert-01` + 内联 data-URL 双形态；emitted 文件 loads-phase fetch 200）+ logcat AudioTrack 归因 PASS——**人耳可听性与 WebView 后台音频不可验**（无声学通路，如实登记），不能写已全部可听 | E02/E08；G33③；M-050；#107 |
| S20 | 快捷键搜索、修改、冲突与恢复 | **已实现（触摸可达面已验；issue #108/M-051）** | 对齐；Shortcuts 页内面 + 命令目录/键位执行核心 + 键位迁移收敛到 v2.2.1 目标（keybinds.tsx/migration.ts/command.tsx/command.test.ts 目标逐字 + composer/model.ts 最小消费方适配 + en +1 键 + ui button ghost-danger 三件套）；.145 设备 QA：页面目标形（50 行/六分组/深浅双 sweep）、搜索（model/terminal/zzz 空态/清除）、捕获开合 toggle 零残留零 toast、Unbind（ghost-danger）置 none 持久化跨重启、Reset to defaults（toast+清空+默认回显）三轮 PASS、旧 id 迁移种子实测（存储改写新 id + 零崩溃）；**冲突反馈/捕获完成/实际命令触发 BLOCKED**（.145 无外接键盘——dumpsys QA 始末双查 IsExternal 全 false；CDP 合成按键不作证据，issue 明文；冲突优先级/skip/decline-false 由 command.test.ts 目标块单测锁定）；not-adopted 登记：palette/dialog/search 本体 + command-search/session-search/safe-triangle 新文件归后续 palette/搜索 issue，desktop-menu 族红线不动 | E02/E11，G34；M-051；#108 |
| S21 | 供应商列表、来源与连接/断开 | **已实现（运行期部分验证；issue #105/M-048）** | providers.tsx 目标逐字（headerAction 切换槽、`providerID === CONSOLE_INTEGRATION` 目标判定）；.145 设备 QA：页面目标形渲染 + 服务器切换槽双向切换 + View all→连接对话框（搜索 + Other/Custom 入口）PASS，三类 SSH 失败面如实呈现；目录行/连接链运行证据 BLOCKED（三远端主机不可达/服务下线，见 #105 段）；custom provider 保存 stub 保持既有上游边界；**剩余差异=连接对话框族目标重设计（FU-1，登记为 Milestone 1 后续工作：controller 143 行增量/dialog 重设计/dialog.provider.* 键族）** | E04，G25；M-048；#105 |
| S22 | 供应商 API key / OAuth | **已实现（运行期部分验证；issue #105）** | 服务端 attempt/轮询/取消/过期/失败恢复在当前对话框形**全部可达**（pin controller `oauth.cancel` 两处/complete/failed/expired 分支/statusFailed retry/`onCleanup`——verify-provider-models 组 3 与 providers-models.md 状态矩阵钉定）；真实授权链 BLOCKED（缺凭据，忠实登记）；**剩余差异=FU-1 重设计自身的增量（command 认证方法 UI、Console/Go 拆分、方法排序）在 #105 验收面之外，归 FU-1（Milestone 1 后续工作）** | E04/E33，G25；#105 |
| S23 | 供应商多账号管理 | 已有代码（#105/M-048 零上游增量） | account-actions.ts/accounts.ts/account-name.tsx **零目标 delta、逐字复用**（AGENTS.md 复用条款）；逐操作与 Console settle 轮询真账号验证 BLOCKED（缺凭据） | E04，G25；#105 复核 |
| S24 | 模型搜索、分组与显示/隐藏 | **已实现（运行期部分验证；issue #105/M-048）** | settings/models.tsx 目标逐字（6 行增量：headerAction/插槽目标原生），与选择器 pin 形**共用 `useModels`**（现形一致性由共享控制器承载）；目录同步 `syncWhileBooting` 重试（12×1s–5s、service-unavailable 门）落地；.145 QA：Models 页目标形 + 搜索框 + 空态 PASS，分组/可见性切换/重启持久化 BLOCKED（远端服务下线，目录空）；**剩余差异=选择器族目标形（FU-2，登记为 Milestone 1 后续工作：select-dialog/details/manage/unpaid/provider-group/search/css/models.test）** | E04，G25；M-048；#105 |
| S25 | MCP 状态、启停、认证和错误 | **已实现（运行期部分验证；issue #105/M-048）** | extensions.tsx MCP 行目标形（数据层 sync/list、`mcp-status-dot[data-status]` 状态点、failed→View error 按钮（`DialogMcp`）、needs_auth→Sign in 按钮、显式态 mutate、busy 门）+ mcp-dialog 目标形（`DialogMcp {directory, server?}`）+ mcp.ts 目标增量（pin `api.mcp.*` 命名单 hunk 保留，线等价——目标客户端自身保 deprecated 别名同路径）；.145 QA：MCPs 子 tab 渲染 PASS；行面（本地 stdio 配置的连接/启停/View error/retry）BLOCKED（远端 opencode 服务全部下线）；真实 MCP OAuth 重认证回流 BLOCKED（需真实服务，忠实登记） | E04/E33，G26；M-048；#105 |
| S26 | 服务端 Plugins / Skills 列表 | **已实现（运行期部分验证；issue #105/M-048）** | plugins tab → `<ExtensionPlugins>` 目标新文件（`own` 门=桌面自有服务器才挂控制面；fallback=纯名称行，mobile/web 恒 fallback）+ Skills 只读行 + 「How to add skills」外链；.145 QA：Plugins/Skills 子 tab 渲染、空态可读、外链在位 PASS；非空列表呈现 BLOCKED（远端服务下线）；与 #26 手机 GUI 管理器的区分保持（settings extensions tab=远程服务端面 ≠ gui-extensions tab=第一方管理面） | E04/E09；M-048；#105 |
| S27 | 项目列表、搜索及项目设置 | **已实现（页面级；issue #106/M-049）** | projects.tsx 目标 min-w-0 页头（addProject onSelect 保 vendored 同步守卫形——目标异步 add 链依赖 **FU-3**）；.145 设备 QA：Projects 页目标形（min-w-0 DOM 实测 + header 切换槽三主机下拉）+ 项目行两真实项目渲染 PASS，设置搜索 `language` 机制命中（projects/workspaces 目录行受 search-index connected 门控，#105 同 caveat 如实登记）；**剩余差异=add 链/持久层目标形（FU-3，登记为 Milestone 1 后续工作：registry usedProjectIDs/lastProjectID + runtime ctx.projects 新面 + home/model.ts）**；完整生命周期/失败路径仍待验（BLOCKED：需授权测试项目） | E03/E31/E34，G19；M-049；#106 |
| S28 | 项目名称、图标和颜色 | **已实现（页面级；issue #106/M-049）** | project.tsx 目标形（registry.label 服务器标签 + M-043 onClose 保留；`data-action` 锚 settings-project-name/icon/color 在位）；.145 QA：General 页全字段渲染（名称/图标/九色板/启动脚本）+ registry.label 服务器链接 PASS；**剩余差异=持久层目标形（FU-3，登记为 Milestone 1 后续工作）+ avatar `generated` 面（FU-3 同域登记）**；保存链（project.update）BLOCKED——需授权测试项目 | E03/E06；M-049；#106 |
| S29 | 项目自动批准权限继承/开/关 | **已实现（页面行；issue #106/M-049）** | `AutoAcceptPermissionsSetting` 行目标形（三值 Select 写服务端项目配置；零契约变更，决策语义归 permission-requests 单元）；设备实测行潜伏——pin 形项目无 `id`，`<Show when={key()}>` 门控不满足（结构性 FU-3 边界，代码形由探针钉定）；写盘实态 BLOCKED（需授权测试项目） | E03，G21；M-049；#106 |
| S30 | 工作区启动脚本 | **已实现（编辑面；issue #106/M-049）** | project.tsx 启动脚本编辑面目标形（textarea + `$OPENCODE_WORKTREE_BASE`/`$OPENCODE_WORKTREE_PATH` 提示）渲染 PASS（.145 QA）；远程执行、目标保存协议及失败路径 BLOCKED（需授权测试项目+真实仓库） | E03；M-049；#106 |
| S31 | 工作区筛选、占用与关联会话 | **已实现（页面级；issue #106/M-049）** | workspaces.tsx 目标逐字（页头 min-w-0 DOM 实测）；列表内容 BLOCKED——远端 worktree inventory 查询挂起不返（环境，同 #105 服务器退化口径），逐字段实态待核 | E03；M-049；#106 |
| S32 | 工作区删除与批量清理 | **已实现（确认链；issue #106/M-049）** | 确认链目标形（verify-diff 组 3 十一锚）+ DialogDeleteWorkspaces/DialogDeleteWorkspace Cancel `autofocus` 目标采纳（默认焦点=取消，负例机检在册；diff.md 第 3 层注记）；对话框视觉焦点与不可逆执行 BLOCKED（仅授权测试仓库；用户工作目录零副作用红线全程保持） | E03/E05，G19/G23；M-049；#106 |
| S33 | 项目专有/共享 MCP、Plugins、Skills | **已实现（页面零 delta 复验；issue #106）** | project-extensions.tsx 等八文件对 target 3ebcf9a 逐字节零 delta（M-049 不触及，复用条款）；.145 QA：四子 tab 渲染 + MCPs 空态 + Manage in opencode.json PASS；作用域差集实态 BLOCKED（需带项目级 opencode.json 的测试项目） | E02/E04；#106 复验 |
| S34 | 项目 LSP 配置列表与状态 | **已实现（只读零 delta 复验；issue #106）** | project-lsp.ts/project-extensions.tsx LSP 子面对 target 零 delta（只读呈现 + loadFailed retry 按钮，零新增配置编辑器）；.145 QA：LSPs 子 tab + 「Auto-detected from file types」渲染 PASS，列表内容 BLOCKED（远端查询挂起——环境），失败重试实态随之 BLOCKED | E02/E04；#106 复验 |
| S35 | HTTP 服务管理、认证与健康状态 | 已有代码及局部运行证据 | 适配；#102 服务器页已迁移至 v2.2.1 目标（M-045）：目标行组件/健康门/`settings-shell:<key>` 搜索命名/`entry.name` 行名已落地，DBY2-AL00 复核三 SSH 主机独立呈列、切换器双向切换与 Manage servers… 可达；一次性记录经存储注入后真 401 响应映射为红点健康门（Shell 段隐藏），但行内 Authenticate 子面未呈现、对话框保存路径自动化未通（见 #102 段），认证/编辑面动态证据 PARTIAL；UTF-8 Basic auth、当前活服务全链、非 ASCII 密码仍未验 | E14/E18/E31/E34；M-045；#102 |
| S36 | SSH 连接、认证、隧道与恢复 | 已有代码及历史主链证据 | 适配；#102 构建上以开发机辅助 sshd 复验指纹两径：未知键（Verify host 面显示真实指纹 SHA256 与本机密钥逐字一致）→ Reject → Failed + known_hosts 零新增；变更键（:2222 旧信任 vs 新密钥）→ DANGER 面拒绝连接、明示未发凭据未建隧道，known_hosts 原条目零改动（forget 步骤在册未执行——不改动用户信任态）；SSH 后服务认证/隧道全链在 #102 构建的复验仍未完成，incompatible、换端口/任务存活仍有缺口 | E13–E18/E34；#102 |
| S37 | 每服务器 Shell 选择 | 已有代码 | 对齐；#102 服务器页已迁移至 v2.2.1 目标（M-045）：servers.tsx/row.tsx 目标逐字，ShellSetting action 搜索命名线程接通，Shell 段随服务器健康门显隐；候选/读写/回滚线协议已核等价，保留 pin 的 config.update 命名；写入成功/失败回滚有单测与探针回滚序锚，真服务动态往返仍未验 | E30/E31/E34；M-045；#102 |
| S38 | 新图标、折叠长用户消息 | 已有代码及局部运行证据 | 适配；实验入口及消费链已接通；图标切换/持久化、8lh 支持已验；长消息折叠展开与性能仍阻塞；#103/M-046 零改动复用（Experimental 页自有行经核对已目标形），回归确认归 #103 设备 QA（图标切换、8lh 折叠行为不变） | E20/E34；#64 补验；#103 回归确认 |
| S39 | About、版本、许可与声明 | **已实现（复验收口；issue #110）** | 对齐/适配；notices 滚动目标差异已补齐（`data-scrollable` 目标形，#110 复验 scrollH 5327/clientH 404 滚动不回退）；另显示移动版本与基座，服务版本取排序首项为移动边界；#110 新基线复验：三行实显 + 搜索命中 PASS、服务行诚实降级串实测（checking 恒驻与 #72 同形）、zh 回退不回退；链接实测为**目标形 plain `target=_blank` 原位打开**（非 M-041 消费者——计划前提经设备实测更正，链接可打开 + 返回复原成立；显式失败半边继承 #76 JVM/AVD 证据）；服务行真服务展示 BLOCKED 维持（需可达服务） | E28/E34；#72 补验；#110 复验；完整许可审计另见台账 V4 |
| S40 | 更新检查、安装与发行说明 | 不实现（当前暂缓） | 已确认暂缓；当前只保留已有 What's New 外联面，APK 更新待已签名 release 与版本清单等激活条件；上游 external 契约不等于已有生产实现；**#110 复核：暂缓维持、呈现不误导已验**（更新操作三负例成立——updater=desktop-host 禁用行、零 Updates 页、About 零更新控件；冷启动无伪弹窗，seen 水位 = 0.1.0；真实跃迁触发路径 BLOCKED，激活条件不变） | E24；[ADR 0005](../../../decisions/0005-apk-update.md)；#110 复核 |
| S41 | 扩展贡献设置页、分区和设置行 | 已有代码及局部运行证据 | 对齐；#109 完成宿主承载面收口：PluginSettingsPages 壳挂载 + General 页双 PluginSettingsSections 放置（目标逐字）实测渲染 review wrap 行；GUI tab 标签改歧义 "GUI extensions"/"GUI 扩展"（与服务端 Extensions 不再同值，设备实测两 tab 并存）；贡献无需 app 侧移动过滤（pairing/updater 桌面守卫后注册，结构性缺席）探针在钉；旧 pane 结构与 Goal Panel 等差异保留 | E23/E34；issue #109；面板回归未全验 |
| S42 | 界面缩放比例 | 已有代码及运行证据（issue #104 复验） | 适配；100%–200% 六档，以 CSS zoom 实现并持久化；#104 换壳复验：六档逐档 documentElement.style.zoom 生效（100% 档属性移除）、`opencode-ui-zoom-level` 逐档持久、零横向溢出、200% 跨重启保持；系统字号 1.3 × zoom 200% 组合下设置页可垂直滚动（scrollHeight 898 > clientHeight 644）、末行可达无遮挡、软键盘避让正常（聚焦输入全程可见）、恢复默认可逆；非法存储值回退 1（属性移除）实态复验；非 Desktop 原生窗口缩放机制 | E21/E34；#65/#104 补验 |
| S43 | GUI 启停、状态、失败与 Reload | 已有代码及局部运行证据 | 适配；#109 设备轮：D4 契约已决（专用 tab 保留）、管理面 15 行三集分类 DOM 实测（web 10 可启停/desktop-host 4 禁用+桌面专属/excluded 1 零控件）、review+terminal 双向启停存储逐步实测、禁用跨 force-stop 重启存活双向实测、Reload 活性行零崩溃；会话面板撤除/恢复与失败注入全链仍待验（无可达服务，如实登记） | E09/E23/E34；G35；issue #109 |

## B. 工作界面

| ID | 功能/Windows v2.2.1 目标 | 本项目实现 | 策略与当前差距 | 证据/验证 |
| --- | --- | --- | --- | --- |
| W01 | 项目/位置选择、创建并进入会话 | 已有代码及局部运行证据 | 对齐；#61 已到远端既有会话；新建任务与完整生命周期、当前集成版双路由回归仍待验 | E03/E18/E34，G19 |
| W02 | 发送、流式输出、权限交互 | 已有代码 | 对齐；工作台/审批链已存在，真实模型发送→流式→工具/权限闭环未完成。P126 runtime candidate 的 M-066 仅为失败准入恢复测试断言兼容（完整 prompt/context 形状）；不修改生产行为、不升级运行期状态 | E03，G20/G21；[#126 M-066](../../../build-and-verify.md#p126-session-runtime-continuation-m066-test-only) |
| W03 | 文件浏览与 Diff | 已有代码 | 适配；file/review 已有，触屏行选择/评论、真实仓库与失败恢复未验 | E05，G22/G23 |
| W04 | 多终端创建、显示、关闭 | 已有代码 | 适配；PTY/重连链已有；WebView WASM、IME/尺寸、控制键软输入与三远端 OS 验收未完成 | E05，G24；不能由旧 dock 文档推定当前 side panel 运行通过 |
| W05 | 会话标签与后台活动 | 部分实现 | 适配；旧 tabs/活动已有；目标 Inbox 列表与聚合未移植，和 S04 同一缺口 | E03/E19/E34 |
| W06 | 附件选择与上传 | 已有代码 | 适配；Android FilesBridge 与上传链已有；目标媒体引用/队列保留链未全迁移，真实附件上传待验 | E06/E34，G27 |
| W07 | 断开客户端不停止远程任务 | 已有代码/约束 | 对齐；#61 断开后进程/端口/会话恢复有历史证据；真实长任务存活、直连与进程死亡路径未验全 | E18/E34，G20⑤/G12/G30 |
| W08 | 偏好、草稿与导航恢复 | 已有代码 | 适配；普通草稿与服务密码生命周期分开；局部重启证据已有，队列失败草稿恢复缺目标增量，完整进程/切网恢复未验。M-066 锁定的是 composer failed-admission 单测形状，不是 durable inbox、重启或切网恢复证据 | E11/E14/E18/E34，G30；[#126 M-066](../../../build-and-verify.md#p126-session-runtime-continuation-m066-test-only) |
| W09 | 会话搜索与列表筛选 | 已有代码 | 对齐；作用域与目标搜索差异待核 | E03 |
| W10 | 重命名、归档、删除 | 已有代码 | 对齐；M-017 归档接线已有，运行失败路径未验全 | E03，G19 |
| W11 | Undo / Redo / Fork | 已有代码 | 对齐；命令存在，文件与消息真实回退未验全 | E03/E11，G23 |
| W12 | 上下文压缩 | 已有代码 | 对齐；当前模型、禁用态及失败提示待真服务验证 | E03/E11 |
| W13 | 导出会话、复制 ID | 部分实现 | 适配；导出→Platform.saveFile→FilesBridge→SAF 源码链已接通；缺目标导出 `mediaRefs: false` 参数，真实保存/产物完整性未验；桥降级静默取消 | E03/E06/E34，G27；不再把保存桥接线列为未知 |
| W14 | 问题、多步回答与结构化表单 | 已有代码 | 适配；请求契约已有，逐类目标差异及真实并发/过期响应待验 | E03，G21 |
| W15 | 后续消息和队列 | 部分实现 | 对齐；queue.ts 仍逐字等于 pin，缺目标按会话串行、乐观编辑/重排、失败草稿恢复、已接纳后不重发与媒体 pin 链；现有 queue/steer 不等于缺失全部功能 | E34；真服务竞态未验 |
| W16 | 文件选区加入上下文 | 已有代码 | 适配；引用契约已有，触摸选区与真实模型上下文路径未验 | E05，G22 |
| W17 | Agent、模型与变体切换 | 已有代码 | 对齐；能力与作用域已有，运行一致性待验 | E04 |
| W18 | 用量与上下文面板 | 已有代码 | 对齐；context 已注册，服务数据缺失及目标面板差异待核 | E03/E23 |
| W19 | Desktop 内置浏览器面板 | 部分实现（远程输出链） | 适配；手机不作浏览器宿主，原生 pane 禁用；远程文本/preview 回退已有；工具 file 截图消费链的缺口与真实呈现仍需 G28 核对 | E07，G28；不是计划在手机复制 Electron 浏览器 |
| W20 | Office 文档预览 | 已有代码 | 适配；renderer/资产已有；PDF/WebView、CJK、大文件与失败样本未验，mailto 外跳受原生 http/https 策略限制 | E06/E33，G29 |
| W21 | /btw 侧问 | 已有代码 | 适配；M-038 放宽窄屏命令门并加 More 入口，呈最近 chat；不自动跳面，窄屏无 close 通道；真实会话与 <768px QA 阻塞 | E26/E34；不是上游本来已有的窄屏入口 |
| W22 | Goal 状态/暂停/继续/清除 | 已有代码（呈现不同） | 适配；RPC/三状态/命令链已有；#67 后仍保留 side Panel + mobile face，未改为目标 ComposerPill/popover；真实服务往返/降级未验 | E22/E23/E34；不再写“等待 #67” |
| W23 | Sources 来源面板 | 已有代码（移动适配） | 适配；实验 gate、时间线来源钩子、窄屏最近 turn 面已有；gate 持久化已验，chip→面板/关闭收回未验 | E22/E23/E34 |
| W24 | 非 prod 实验语音通话 | 未实现（已确认暂缓） | 当前暂缓；上游受 desktop/非 prod/实验开关/服务凭据门控，不是生产默认能力；满足 ADR 激活条件再重启 | E25；[ADR 0006](../../../decisions/0006-voice-call.md)；非待用户决策 |
| W25 | 会话详情、工作区位置菜单 | 已有代码 | 适配；details 已注册，逐个工作区操作及失败路径待核 | E03/E23 |
| W26 | 命令面板统一检索 | 已有代码 | 适配；命令契约已有；触屏入口覆盖、外接键盘与新增命令仍待核，不能由 CDP mod+k 成功推定触屏可达 | E11/E29，G34 |
| W27 | 会话内容搜索与高亮 | 已有代码 | 适配；WebView CSS highlights 与长历史定位未验 | E03 |
| W28 | Debug bar、堆快照、动效诊断 | 部分实现（web 子集） | 适配；宽屏 debug.toggle 三元素及持久化已验；heap/主进程诊断/DEV 调参缺席符合宿主边界，窄屏 bar 隐藏；禁用→撤除链仍待复验 | E29/E34；#96 仅解除管理开关阻塞 |

## C. Windows 宿主与连接

| ID | 功能 | 本项目实现 | 策略与当前差距 | 证据/验证 |
| --- | --- | --- | --- | --- |
| N01 | 本机服务与 CLI 引导 | 不实现 | 排除；手机只作为远程客户端 | E01 |
| N02 | 本机 WSL 发现、安装及启动 | 不实现 | 排除执行；显示禁用行另见 N12 | E01 |
| N03 | 手机管理远端 Windows 的 WSL | 不实现 | 排除发现/启停/管理；可访问已暴露的远程服务，不等于管理 WSL | E01；ADR 0001 |
| N04 | SSH 认证与主机指纹挑战 | 已有代码及设备运行证据 | 适配；pending target/端口/指纹绑定及 known_hosts 修复已有；#61 unknown/changed 拒绝、信任落盘与比对闭环通过 | E16/E18；历史不匹配已裁定为比对错位 |
| N05 | SSH 服务发现、安装、启动及不兼容处理 | 已有代码 | 适配；白名单命令与显式授权流已有；三 OS 服务操作、回滚与 incompatible 真服务未验全 | E10，G18 |
| N06 | 手机作为配对服务提供方 | 不实现 | 排除；手机连接方见 D03 | E01 |
| N07 | 服务提供方配对页屏幕常亮 | 不实现 | 排除；属于 N06 主机侧流程 | E01 |
| N08 | 文件保存/分享/选择、剪贴板和外部打开 | 已有代码及局部运行证据 | 适配；FilesBridge/SAF/分享已有；#76 openExternal 原生 http/https 外跳有模拟器验证；mailto 拒绝、原始锚链接及真实 OAuth 回流仍有边界，完整文件交互待验 | E06/E33/E34，G27；不搬 Windows 本地路径/Explorer 语义 |
| N09 | Windows 安装更新及 beta notes | 不实现（APK 等价流程暂缓） | 与 S40 同一决定；远程服务升级是另一能力，不代表 APK 更新完成 | E24；ADR 0005 |
| N10 | 平台快捷键与窗口控制 | 部分实现 | 适配；单窗口 Android/返回逻辑已有，不复制 Windows 窗口控件；核心动作触摸/外接键盘仍待验 | E11/E32，G34 |
| N11 | GUI 宿主、注册与 OS 过滤 | 已有代码及局部运行证据 | 对齐/适配；#109 设备轮新增：15 行呈现 DOM 复验（14 宿主定义 + 1 静态排除）、三集映射与 VGP 组 7 锁定集合逐 id 一致、#96 开关持久化双向复验；会话面板/生命周期全链未验 | E23/E34；web 10、desktop-host 4、WSL 排除行 1；issue #109 |
| N12 | Android WSL 入口可见但禁用 | 已有代码及局部呈现证据 | 适配；#109 设备轮零操作专项实测：wsl 行零控件（零 button/switch/alert/可聚焦元素）、id dir=ltr、决策 0001 原因文案在视口内；完整读屏走查仍登记（TalkBack 未走查，行语义 DOM 级已核） | E09/E23/E34，G35⑦；issue #109 |

## D. 范围差异

| ID | 能力 | 本项目实现 | 策略/既有决定 | 证据/验证 |
| --- | --- | --- | --- | --- |
| D01 | 手机本地服务与工具链 | 不实现 | 排除；任务与工具在远程执行 | E01 |
| D02 | 手机服务开放给其他设备 | 不实现 | 排除；不影响手机作为连接方 | E01 |
| D03 | 配对链接接入及扫码 | 部分实现 | 对齐/适配；粘贴/导入与相机授权已有；相机允许/拒绝/恢复/旋转竞态真机已验，QR 解码→兑换→进入会话未闭环；外链唤起已确认不实施 | E27；G32；[ADR 0007](../../../decisions/0007-pairing-deep-link.md) |
| D04 | 第三方 GUI 完整运行兼容 | 不实现（当前范围） | 排除；内置管理器不提供第三方加载/install/remove/marketplace，不影响服务端插件列表；#109 负锚复验零变化（Bridge.manager 成员集负锚与 D04 句随 M-052 复核） | E09/E23；issue #109 |
| D05 | 进程死亡期间仍收到通知 | 不实现（当前范围） | 排除；不做前台服务/保活/推送；存活期间 best-effort | E08 |

## E. Android 平台适配

| ID | 能力 | 本项目实现 | 策略与当前差距 | 证据/验证 |
| --- | --- | --- | --- | --- |
| M01 | APK 安装与启动 | 已有代码及历史运行证据 | 新增；APK 打包/安装、inline SSH 与 worker 更新修复已有；不同构建证据分别记录，不推定全部设备适用 | E11–E13/E17；当前轮未构建 |
| M02 | 安全凭据存储 | 已有代码 | 适配；AndroidX origin/main-frame listener、代际/队列限制及 Keystore/OPMV1 已有；C1–C6 设备失败/升级门禁未全部通过 | E15；不将 SSH 能读取一个密钥视为保险库全验收 |
| M03 | 返回、安全区与软键盘 | 部分实现 | 适配；模拟器返回键通常结束 Activity（SPA 历史不入 canGoBack），不是应用内分层返回；原生窗口 resize/输入避让局部已验，hwschromium、会话面、Android 15+ 仍待验 | E32，G31②③⑦ |
| M04 | 网络变化与前台恢复 | 已有代码及局部运行证据 | 适配；代际/取消保护、重新 health 后发布 endpoint 已有；同进程重连及杀进程后重新认证有历史记录，真实切网/任务补齐未验 | E14/E18，G30 |
| M05 | 通知渠道与系统权限 | 已有代码 | 适配；NotificationsBridge 与授权入口已有，真实后台到达/点击/权限矩阵未验全 | E08，G33 |

## 下一实施工作单元：Settings 整体界面对齐

**状态：待处理（目标已确认，尚未实施）。** 本节是该工作单元的推进主记录；S/W/N/D/M 功能 ID 保持原义，不新增一套功能编号。分阶段执行，不把阶段分别算作功能完成。后续实施提交、验证结果及剩余差异回填本节和关联功能行。

### 目标、边界与关联项

| 项 | 约定 |
| --- | --- |
| 用户可验收结果 | 相同 CSS 视口、主题、语言、缩放、字体配置、数据及交互状态下，Settings 共享区域与 Desktop v2.2.1 的布局、导航、控件、间距、图标、颜色及状态呈现一致；交互保持相同结果。窄屏沿用目标上游同宽窗口的响应式界面。 |
| 固定上游 | `v2.2.1 / 3ebcf9a32c7b28f658cfee80775448929361727a`；不使用浮动 dev 代替参考。 |
| 实施基线 | 开工时重新记录 main/dev、工作分支精确 SHA、vendor pin、packageSources 与移动补丁状态；E34 的 `c68ccc0` 仅是本轮检查快照。 |
| 主关联范围 | **S01–S43 的设置界面层**：设置壳/导航/搜索、General、Appearance、通知、快捷键、Servers、Providers/Models、项目/工作区、Experimental、插件贡献与管理、About。 |
| 交叉回归 | N04/N05/N08/N11/N12、D03/D04、M02/M03/M05：SSH/服务操作、文件及外跳、插件宿主/WSL 禁用行、配对、凭据、键盘与系统权限。只验证本次迁移影响的接入，不据此宣称这些大项完整闭环。 |
| 保留的平台接入 | SSH 主机与凭据管理、Android 通知权限、原生文件/外跳桥、内置 GUI 管理器、移动版本身份；安放于目标结构，采用目标组件和样式。具体差异需逐区域登记，不能以“移动适配”概括跳过共享界面。 |
| 范围约束 | 不改变 ADR 0001、0005–0007 及 D01–D05 的既定边界。界面一致性不要求新增 APK 更新、语音、外链唤起或手机本地服务。Inbox 实际列表、队列/媒体执行链仍按各自行推进；三模式设置面通过不能关闭 W05/W15。 |
| 现有事实 | 旧 pin 设置壳/导航/样式叠加局部移植，整体对齐未完成；#90/#96 的可达性与开关补验只作回归基线，不能替代视觉验收。 |

### 执行顺序与产出

| 顺序 | 具体工作 | 涉及实现/功能 | 完成依据 | 当前状态 |
| --- | --- | --- | --- | --- |
| 1. 基线与参考 | 对比当前实际树与固定目标，逐页列出差异、移动补丁、依赖及可达条件；采集上游参考，记录版本、构建、视口和主题 | `app/src/settings/`、`ui` 及 `runtime/plugin`；S01–S43 | 明确每个页面哪些可直接复用、哪些依赖需迁移、哪些是平台例外；不得将 pin→目标的原始 diff 全当作剩余缺口 | 待处理 |
| 2. 设置框架迁移 | 迁移目标设置壳、导航、路由、搜索及共用样式，连同必要共享依赖；按仓库规则登记可重放的 vendor 补丁 | `shell.tsx`、`navigation.tsx`、`route.ts`、`surface.tsx`、`search*`、`settings.css`；S01–S03 | 导航/搜索/返回上下文符合目标；离线与远程不可用时有出口，服务器身份不串；不以旧结构覆盖 CSS 模仿目标 | **已完成（issue #101，M-042/M-043/M-044）**：worktree issue-101-settings-framework @ 3ebcf9a 框架迁移（基线 c9339b2）；verify:closure PASS、app 单测无新失败（keyed 冻结失败升级为通过）、build+dist 3517/159,606,524、探针全量 33 个：28 rc=0、3 预存 rc=1（pinch-shell-settings/debug-bar/inline-ssh-device——对 base c9339b2 复测逐字节同败，非本轮引入）、2 仅在 gradle build 产物在场时误报（permission-requests/session-workbench——源树 rc=0）、设备冒烟（DBY2-AL00 @192.168.3.145）六步中五步 PASS（详见 build-and-verify.md issue #101 段）；页面内容（阶段 3）与对照回归（阶段 4）归后续 Issue/轮次 |
| 3. 页面与接入 | 按目标统一所有设置页及贡献区域；重接移动主机、凭据、权限和 GUI 管理面，保留已有数据与偏好 | S04–S43；`servers/` 的切换/不可用态、第一方 mobile-hosts、Android 适配边界 | 各页面正常/不可用状态呈现可对照，移动差异逐项有依据；既有 SSH、设置搜索和插件开关修复不回退 | **Servers 页部分完成（issue #102，M-045）**：`settings/servers/*`+`row.tsx` 目标逐字、ShellSetting action 线程、redeem 去导出、`persistence.test.ts` M-002 对齐；verify:closure PASS（43 补丁）、单测无新失败（persistence 冻结失败升级为通过）、dist 3517/159,599,027、探针 31 rc=0 + 2 预存 rc=1、设备 DBY2-AL00 Tier A 通过 + 指纹两径复验（详见 build-and-verify.md issue #102 段）。**General/Experimental 偏好页内面部分完成（issue #103，M-046）**：general.tsx 目标逐字（S04/S09/S11 设置行 + BackgroundActivity/TimelineWidth 组件 + timeline-width 消费 token）、model.tsx 目标 schema 面 + terminalPlacement/showFileTree 登记偏离、搜索两行恢复、en +13/−4、九 typed locale 同步清键；**Appearance 页内面部分完成（issue #104，M-047）**：外观页内面目标形收口——appearance.tsx/controllers/search-catalog 外观七行/i18n en 22 键/web.ts zoom 面/desktop-menu 六档数组均已 byte-form 核验（本轮零改动复用），唯一剩余差异 ui theme 组件族死导出经 M-047（0047-M-047-theme-component-target-form.patch，双 manifest 第 45 补丁）收敛至 v2.2.1 目标（index.ts 35 行 barrel + color.ts/resolve.ts 函数级裁剪（保留全部活导出与 gui-plugins terminal 消费）+ loader.ts/default-themes.ts 整文件删除，净删 359 行）；verify:closure PASS（45 补丁）、app 单测 646/4/24/1986 恒同、mobile-hosts 434/0/2920、tsc 391 逐文件恒同、dist 3517/159,599,796（-1,225 bytes）、探针 31 rc=0 + 2 预存 rc=1、设备 DBY2-AL00 外观页走查与 S15/S16/S17/S42 全项复验通过（详见 build-and-verify.md issue #104 段）；**Providers/Models/Extensions 页内面部分完成（issue #105，M-048）**：三页 + mcp-dialog + extension-plugins + search-list.css + catalog/providers.ts（syncWhileBooting 重试）+ en 26 键收敛到 v2.2.1 目标（0048-M-048-providers-models-extensions-target-migration.patch，双 manifest 第 46 补丁；mcp.ts 单 mobile hunk 保 pin 生成客户端命名——线等价，目标客户端自身保 deprecated 别名同路径）；verify:closure PASS（46 补丁字节级重放）、app 单测（无 seam）646/4/24/1986 恒同、seam 口径 791/4/1 恒同（唯一 fail=预存 settings-search-plugin 行为组）、mobile-hosts 434/0/2920、tsc 391 逐文件恒同、dist **3520/159,663,930**（+3 文件/+64,134 bytes——净新增 = mcp-dialog css 分块 + 共享 TruncatedText 分块，ExtensionPlugins 并入改名 shell 分块）、探针 31 rc=0 + 2 预存 rc=1（post-gradle 29/4 按设计）、APK `57eeba6c…`、.145 设备 QA：三页/三子 tab 目标形渲染 + 切换槽 + 连接对话框 + 外链 + 搜索通用行 + 三类 SSH 失败面 + localStorage 18/18 红线 PASS，目录/MCP 行面/连接链/账号操作 BLOCKED（远端服务下线+缺凭据，见 #105 段）；FU-1/FU-2 登记为 Milestone 1 后续工作（S21/S22/S24 剩余差异列）；`settings/pages.ts` gui-extensions 移除归 #109；**Projects/Workspaces 页内面部分完成（issue #106，M-049）**：workspaces.tsx 目标逐字（页头 min-w-0 + 删除确认 Cancel `autofocus` ×2）、projects.tsx 目标 min-w-0 页头（addProject 保 vendored 形）、project.tsx 目标 registry.label 服务器标签（M-043 onClose 保留）、project-options.tsx 零 delta（M-043 关闭面保留）；八文件零 delta 复验（S33/S34 复用）；FU-3（运行期项目持久层目标形：registry usedProjectIDs/lastProjectID + runtime ctx.projects 新面 + home/model.ts + layout.tsx，~343+165 行，owner=home/layout 单元）登记为 Milestone 1 后续工作（S27/S28 剩余差异列指向）；verify:closure PASS（47 补丁字节级重放，双 manifest 47=47）、app 单测恒同两口径、mobile-hosts 434/0/2920、tsc 391 逐文件恒同、dist **3520/159,664,027**（+97 bytes，同 3520 文件数）、探针 31 rc=0 + 2 预存 rc=1（post-gradle 29/4 按设计）、APK `68d9d457…`、.145 设备 QA：S27/S28/S30/S33 页面目标形（min-w-0 ×2 与 registry.label DOM 实测）+ 切换槽三主机 + 文件选择取消零变化 + 搜索通用行 + localStorage 18/18 红线 PASS，Worktrees/LSPs 列表内容 Loading 不返（环境）、S29 行潜伏（FU-3 边界）、编辑/删除实态 BLOCKED（需授权测试项目，见 #106 段）；**Notifications 页内面部分完成（issue #107，M-050）**：notifications.tsx 目标 11 行 sounds-interface SettingsRow（M-024 Android 权限面 hunks 逐字保留，189 行 = 目标 139 + M-024 残留 50）、search-catalog.ts `settings-sounds-interface` 行恢复（M-044 注记移除——三悬挂目录行全部回归）、search-results.test.ts 断言负翻正（蓄意第一方扩展，双向探针钉定）、sound.ts 目标 3 export 收敛（零消费者，文件与 target 逐字节相同）；not-adopted 登记：target notification.tsx +16 hasRunningChild（工作台/G33 域）、toast.tsx dead-export 收敛（**no-owner-gap**，candidate rider = 未来 notification-face/dead-export-sweep issue）；桥冻结零改动；verify:closure PASS（48 补丁字节级重放，双 manifest 48=48）、app 单测恒同（无 seam 646/4/24/1986）、mobile-hosts 434/0/2920、tsc 391 逐文件恒同、dist **3520/159,665,590**（+1,563 bytes，同 3520 文件数）、探针 31 rc=0 + 2 预存 rc=1（post-gradle 29/4 按设计）、APK `5147d5ef…`、.145 设备 QA：页面目标形渲染（深浅双 sweep）+ 开关持久化跨重启 + 声音选择/播放路径机证（play-resolved 双形态 + loads-phase fetch 200 + AudioTrack 归因）+ 静音 + **sounds-interface 搜索返回→定位真实行在视口内** + 权限行 session-signal 语义 + localStorage 18/18 红线 PASS，真实投递/点击路由/失败恢复 BLOCKED（无可达服务）、allow/deny/revoke 全矩阵 BLOCKED（API 31）、可听性不可验（无声学通路），见 #107 段；**Shortcuts 页内面部分完成（issue #108，M-051）**：keybinds.tsx/migration.ts/command.tsx/command.test.ts/ui button 三件套目标逐字（八文件零既有 mobile hunk，M-051 唯一 owner）+ composer/model.ts 最小消费方适配（目标 trigger 的 decline-false 返回类型 vs vendored clientCommand 回调 TS2322——采纳目标自身 async 包装 hunk 逐字，文件不整体目标化）+ en +1 键（unbind，en-only target parity；触 en.ts 既有补丁实测 14 个、非计划初稿的 5 个，区段零重叠）；not-adopted 登记：palette/dialog/search 本体 + command-search/session-search/safe-triangle 新文件（palette keybind-only 在册实态不变）+ desktop-menu 族（Windows 红线）；verify:closure PASS（49 补丁字节级重放，双 manifest 49=49）、app 单测（无 seam）653/4/24/1997（+7 pass = command.test 目标块，24 错误集与基线全等零新失败）、seam 口径 798/4/1（唯一 fail = 预存 settings-search-plugin）、mobile-hosts 434/0/2920、tsc 双口径 391/391 → 389/389（同工作树同法 stash 双跑对账；分布 diff = 恰 runtime/plugin/commands.tsx 两条 CommandSource 既有错误解析，零新增——预注册兑现）、dist 3520/159,672,996（+7,406 bytes，同 3520 文件数）、探针 31 rc=0 + 2 预存 rc=1（post-gradle 29/4 按设计）、APK `93d61eda…`、.145 设备 QA：S20 验收链触摸可达项全 PASS（目标形 50 行六分组深浅 sweep、搜索过滤/空态/清除、捕获 toggle 零残留、Unbind ghost-danger 置 none 跨重启、Reset toast 三轮、旧 id 迁移种子实测零崩溃）+ localStorage 18/18 红线（QA 深色 sweep 残留键识别并移除后全等）；冲突反馈/捕获完成/实际命令触发 BLOCKED（无外接键盘，CDP 合成按键不作证据——issue 明文），见 #108 段；**GUI 插件管理与贡献设置对齐部分完成（issue #109，M-052）**：D4 契约已决——专用 gui-extensions tab **永久保留**（目标注册表只承载插件自有贡献、目标 Extensions face 为 server 域仅名单呈现且内容只在 reachable-server scope 下渲染、无三集分类/WSL 零控件行承载面，§四实测证据；route.ts/pages.ts M-044 注记就地改写为已决语义，mobile(M-044) marker 保留）+ 标签改歧义（settings.guiExtensions.title = "GUI extensions"/"GUI 扩展"，与 settings.tab.extensions 不再同值；6 targets（4 注释/标签 + 2 测试回归锁随补丁携带），双 manifest 50=50 字节重放 verify:closure PASS）；verify:closure PASS（50 补丁）、app 单测（无 seam）655/4/24/2000（+2 pass = route.test gui-extensions 解析与 host-tab 优先两例；24 错误集与基线全等零新失败）、seam 口径 802/4/1/2367（+4 pass/+4 tests = route+search-plugin fixture 四例；唯一 fail = 预存 settings-search-plugin）、mobile-hosts 434/0/2920（桥冻结零改动；重启持久化测试在册绿）、tsc 双口径 389/389（分布 diff = 基线逐字节恒同，零新增）、dist **3520/159,673,641**（+645 bytes，同 3520 文件数——两 i18n 标签值+注释剥离入既有分块）、探针 31 rc=0 + 2 预存 rc=1（post-gradle 29/4 按设计；计数三探针 50、VSF 组 12 新锁 S41/S14/Sources、VGP 组 4 宿主锚+组 8 哨兵回填）、泄漏扫描恰 5 条预存 fixture 行、audit-secret-persistence PASS、git diff --check clean、APK `6dea775b…`（65,349,007 bytes，install -r 数据保留）、.145 设备 QA：步骤 1/2/3/4/5/9 全 PASS（双 tab 标签区分 DOM 实测、15 行三集逐 id 一致、review+terminal 双向启停+撤除恢复（wrap 行+搜索揭示 0↔1 翻转+节标签=宿主 Preferences/General 实测）、禁用跨 force-stop 双向存活、WSL 行零控件/ltr/决策文案、Reload 活性行零崩溃）+ 步骤 6/7 行面 PASS（wrap 偏好写读+跨重启+复原、Sources 行默认关+motion 键零残留）+ localStorage 18/18 全等（QA 物化默认值键移除后）——会话 strip/抽屉撤除恢复、真实长 Diff overflow 翻转、Sources chip、服务端 Plugins 名单呈现 BLOCKED（无可达服务，见 #109 段）；**About 页内面复验收口（issue #110，零新补丁）**：about 域源码级剩余 delta = 0 逐文件 blob 实测（animated-wordmark/notices dialog vendored==target、about.tsx=M-040 已批准例外、contributors.test.ts 2 例保持全绿、settings.css==target blob、updater 79 文件==target）；verify:closure PASS（50 补丁）、单测双口径 655/4/24/2000 + 802/4/1/2367 与基线恒同、mobile-hosts 434/0/2920、tsc 389/389、dist 重建**逐字节恒同 3520/159,673,641**（哨兵零改动；清单体仅 generatedAt+28 sourcemap hash 非确定性churn，零 js/css 资产变化）、探针勘误（陈旧见证串 49=49/39=39×3/stale expected-dist/38=38 头注，断言零改动 + 负例演练三组）、APK `24a4a290…`、.145 设备 QA：S39 三行实显+搜索命中、notices 滚动复验、S39 链接原位打开形态（目标形 `target=_blank` 非原生外跳——计划前提实测更正）、S40 三负例 + 无伪弹窗 + seen 水位 0.1.0、zh 回退抽查、localStorage 18/18 全等 PASS——服务行真服务展示/whatsNew 真实跃迁触发 BLOCKED 继承（见 #110 段）；阶段 4 Desktop 对照回归归后续轮次（视觉对照 BLOCKED 继承） |
| 4. 对照与回归 | 执行下表验收；修正视觉与交互偏差，记录实际构建、服务版本、截图和结果 | 全部受影响设置单元及交叉回归项 | 对应代码检查/构建通过；必要模拟器或真机检查通过；无法执行的项目标未验证并保留阻塞原因 | 待处理，依赖 3 |
| 5. 回填交付 | 更新受影响设计条目、逐行矩阵与运行台账，提交实现 PR | 本节、关联 S 行、`docs/design/`、`docs/build-and-verify.md` | 已实现/局部通过/未验证分别标记；所有承诺验收通过才可写本单元已闭环 | 待处理，依赖 4 |

### 最小验收清单

| 验收面 | 操作/条件 | 预期与证据要求 | 当前结果 |
| --- | --- | --- | --- |
| 视觉一致 | 目标 Desktop 与移动构建逐页在匹配条件下截图；覆盖浅/深色、宽屏 ≥768px 与窄屏 <768px，并记录实际尺寸 | 共享区域布局、尺寸、文字层级、图标与状态一致；平台字体栅格化差异单独说明，不能掩盖样式偏差。浏览器运行上游 renderer 可作预检，但不冒充 Windows Desktop 实机证据 | 未验证 |
| 导航与搜索 | 打开设置→进入子页→搜索定位→返回；单/多服务器布局各走一遍 | 搜索结果/定位/选中态正确，返回上下文保留，无崩溃或错误跳页 | 未验证 |
| 数据状态 | 覆盖加载、空列表、服务断开/认证失效、保存中、保存失败与重试、超长名称 | 状态形态遵循目标；失败有反馈及恢复出口，不把错误呈成成功或静默空态；数据保持正确服务器/项目归属 | 未验证 |
| 控件与无障碍 | 检查默认/选中/聚焦/禁用、弹窗与关闭；触屏、键盘及 TalkBack 操作核心路径 | 核心操作可达，焦点与名称可识别；不能为截图一致破坏触摸或无障碍语义。确有平台冲突时登记，不静默另做样式 | 未验证 |
| 偏好与恢复 | 修改已有偏好、切页、重启及覆盖安装；切换服务器；表单取消/重建 | 偏好和既有数据按原契约保留，服务器身份隔离；凭据不进入普通 WebView 存储，取消/失败可恢复 | 未验证 |
| 移动平台回归 | 验证 SSH/凭据入口、服务认证、通知权限、文件选择/外跳、GUI 启停、WSL 排除行；软键盘与安全区实测 | 接入有效且范围不扩大；迁移不重新引入 #90/#96 缺陷，不因客户端退出停止远程任务。涉及连接/安全的实际改动须有真实失败路径及设备 E2E | 未验证 |
| 工程验证 | 运行实施时适用的类型/单测、vendor 补丁重放/闭包、Web 与 APK 构建检查 | 命令和真实结果写入台账；构建通过不代替视觉或运行验收 | 未执行 |

**实施前环境准备**：可运行的固定版本上游参考、移动模拟器/真机、代表性设置数据，以及远程页所需的授权服务。当前没有新增环境验证结果；某环境缺失只阻塞相应验收，不把整个工作退回产品待决策。

**推进回填栏**：实施分支：`issue-108-keybinds`（M-051 实施提交链，未 push；前轮 `issue-107-notifications` M-050 链已并入 main）；前轮 `issue-106-projects-workspaces` M-049 链已并入 main）；实现 PR：由协调者创建（本 issue 实施面）；构建/运行证据：verify:closure PASS(49)、app 单测（无 seam 653/4/24/1997；seam 798/4/1）、mobile-hosts 434/0/2920、tsc 双口径 389/389（基线 391/391，恰两条 CommandSource 既有错误解析）、dist 3520/159,672,996、APK `93d61eda…`、.145 设备 QA（见阶段 3 回填与 build-and-verify.md issue #108 段）；剩余差异：FU-1/FU-2（#105）/FU-3（运行期项目持久层目标形，S27/S28 剩余差异列指向）、hasRunningChild 工作台面与 toast.tsx dead-export 收敛（no-owner-gap，candidate rider 登记）为 Milestone 1 后续工作，About 页内面与阶段 4 对照回归归后续 Issue/轮次。

## 推进口径

1. **下一项实施为上节 Settings 整体界面对齐工作单元**，按框架→页面与移动接入→对照验收推进，不再仅逐个补开关。
2. 当前集成版 **SSH/HTTPS → 新建会话 → 发送/流式/权限 → 断线恢复与任务存活**仍是整体版本完成的必要门禁；历史 #61 到达既有会话不能替代。Settings 之后继续队列/媒体链、导出参数与 Inbox 的明确增量，保留已有移动适配。
3. 文件/Diff/PTY/Office/通知/扫码兑换与 <768px 手机交互需要对应真实环境；补验通过前保持运行缺口。
4. ADR 0005–0007 已收口：APK 更新/语音暂缓，外链唤起不实施；无新增待决项。WSL 禁用行已实现，执行排除决定不变。
5. 不按行数计算完成率；整体完成必须满足范围内行为、跨功能核心流程与必要设备门禁。详情见 [本轮复核与优先级](current-review.md)。
