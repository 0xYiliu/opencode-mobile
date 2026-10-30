# Windows Desktop v2.2.1 ↔ 本项目功能对齐矩阵

## 版本与事实口径

- 首个对齐目标：Windows Desktop **v2.2.1**，`3ebcf9a32c7b28f658cfee80775448929361727a`。
- 差异盘点快照：`origin/dev@cf1504de929bd47bc7003c62a24e6c4488f2c498`；当前集成基线：`main@4c2ec43a0440c3aaec53fb5d8ade6dcaa05a8905`，已合并 dev 与 issue-58。
- 已有 vendor 来源：**`b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`**，不是 v2.2.1。任务是现有实现到目标版本的差异核对。
- issue-58（合并 PR #59）已并入当前 main；S01/S35/S36、N04、W01/W08、M01/M02/M04 按该提交的增量核对，其他行保留原差异盘点范围。具体来源见 E13–E17。
- 实际架构为共享 Web UI + **Kotlin 原生 WebView**。
- 已有 debug APK 构建、安装和 MatePad 初始 SSH 入口/布局冒烟记录。issue #61（2026-10-30）已在同一 MatePad 完成 G36 矩阵主体与 SSH E2E 主链（信任→认证→隧道→服务认证→远端会话、失败路径、断开红线）；incompatible 真服务、任务级存活等仍留缺口（G36 #h 已以隔离诊断包补验），明细见 [build-and-verify.md](../../../build-and-verify.md) issue #61 段与 E18。
- Windows v2.2.1 安装包尚未运行验证。源码存在、构建成功、局部冒烟和完整功能对齐分别记录。

[推进规则](../../workflow.md) · [Windows 源码和最小验收映射](baseline.md#source-map) · [本项目固定快照证据](implementation.md)

## 状态定义

- **已有代码**：已有 vendor 或第一方实现；不等于与 v2.2.1 完全等价，也不等于设备验收通过。
- **部分实现**：已明确有实现且有缺口；差异列说明范围。
- **待核对**：证据不足以裁定目标行为；不能写成未实现，更不能要求用户重作已有决定。
- **未实现**：已检查并定位缺失能力。**不实现**：有明确产品范围/决策依据。
- 策略为对齐、适配、新增、排除、待决策；技术调查/运行验证不足不是产品待决策。
- 证据 E01–E17 见 `implementation.md`，Windows 每个原 ID 的映射保留在 `baseline.md`。未特别注明的运行状态均为**目标版本等价性未验证**；历史通过只适用于对应构建和步骤。

## A. Settings

| ID | 功能/Windows v2.2.1 目标 | 本项目实现 | 策略与实际差距 | 本项目证据/验证 |
| --- | --- | --- | --- | --- |
| S01 | 设置导航、进入/退出与返回上下文 | 已有代码 | 适配；已修复 Server 页 keyed Show 值被误作 accessor 导致的崩溃；初始 SSH 改为原地表单，撤销无连接时访问 Settings 的 M-027 路由例外；返回/键盘仍需验收 | E02/E13；Server 页有历史设备记录 |
| S02 | 搜索设置并定位设置行 | 已有代码 | 对齐；核对新旧搜索索引及插件行定位差异 | E02 |
| S03 | 设置中的服务器选择与数据隔离 | 已有代码 | 对齐；已有 ServerScope，需验证跨服务不串数据 | E02/E04 |
| S04 | Top / Side / Inbox 模式 | 已有代码及设备运行证据 | 适配（issue #63，M-033）：设置页呈现 Top/Side/Inbox 三模式（v2.2.1 InterfaceModeSetting 三预览卡逐字 + `inbox` 枚举 + 搜索目录 + en 八键），shell 谓词对齐 `!== "horizontal"`；**设备已验（MatePad，2026-10-30）**：三卡含 Experimental 徽标呈现、选 Inbox → ≥768px 呈现 Side 同款侧栏会话 rail 且**分组/聚合/徽标零存在（差异实态确认）**、重启持久化保持、zh 卡面回退英文实态、a11y 树+DOM 双通道读屏链路、install -r 真实数据升级路径 horizontal 用户无感；**窄屏（≤767px）视觉 UX 方法受限未宣称**（设备 CSS 视口下限 818px，CDP 合成覆盖不可代表真机 face，源码 `!mobile()` 语义已锁）——**Inbox 分组列表（needs-you/done/running）、跨服务器聚合与 unread 徽标未移植（~5300 行，W05 域），Inbox 呈现 = Side 同款 rail，差异登记于 E19**；TerminalPlacement 行按 pin 保留；zh 文案回退英文（上游实态） | E02/E19 |
| S05 | 语言切换 | 已有代码 | 对齐；检查新增翻译键及回退 | E02 |
| S06 | 默认工作区目的地 | 已有代码 | 对齐；继续核对目标默认值与远程执行语义 | E02/E03 |
| S07 | 默认自动批准权限 | 已有代码 | 对齐；已有权限契约，真服务审批门禁未完成 | E02/E03，G21 |
| S08 | 显示自定义 Agent | 已有代码 | 对齐；按现有 Agent 能力契约核对新增行为 | E02/E04 |
| S09 | 后续消息 queue / steer | 已有代码 | 对齐；核对目标队列状态与提交行为 | E02/E03 |
| S10 | 时间线详情分类与预设 | 已有代码 | 对齐；逐类别核对新旧枚举，不能仅以设置页存在判等价 | E02/E03 |
| S11 | 时间线宽度、后台活动位置、每轮 Diff | 已有代码 | 适配；新旧字段与窄屏效果仍待逐项核对 | E02/E03 |
| S12 | 捏合缩放 | 待核对 | 适配；检查现有 WebView 手势及平台桥，再确定目标控件接法 | E02/E11 |
| S13 | 窄屏标题栏顶部/底部 | 已有代码 | 适配；与返回键、安全区、软键盘联验 | E02/E11 |
| S14 | Diff 换行 | 已有代码 | 对齐；已有 review 扩展设置，迁移时保留偏好 | E05 |
| S15 | 主题与系统/浅色/深色 | 已有代码 | 对齐；保留现有主题实现 | E02 |
| S16 | 界面/代码/终端字体 | 已有代码 | 适配；已有三类字体设置，Android 回退字体仍需验收 | E02 |
| S17 | 减少动效 system/on/off | 已有代码（设置呈现+动效接线，issue #65，M-035；运行期行为待设备 QA） | 对齐（issue #65，M-035）：Appearance 呈现 Reduce motion 三态 Select（`settings-reduce-motion`，默认 system）+ `dataset.motion` 仲裁 effect（v2.2.1 逐字）；动效消费链**全 vendored 树 25 CSS 文件 31 块**转 `:root[data-motion="reduce"]` + 3 TS 消费者走 `prefersReducedMotion()` + tailwind `motion-reduce:`/`motion-safe:` 变体 + ui motion/reduced.ts 回退模块——设置真实改变动效表现；**已知边界**：go-upsell hero 画布恒随系统（上游未转换面）、首帧到 hydrate 间隙动效可见（上游同态）、system 态在 Android WebView 的系统映射与观测点实测归设备 QA 十项（未执行）；zh 文案回退英文 | E02/E21 |
| S18 | Agent/权限/错误系统通知 | 已有代码 | 适配；已有 JS/Kotlin 桥、权限、点击路由；沿用存活期间 best-effort，不重问后台范围 | E08，G33 未完成 |
| S19 | 任务声音选择、预览与界面音效 | 已有代码 | 适配；沿用共享设置，WebView 声音限制待运行验证 | E02/E08 |
| S20 | 快捷键搜索、修改、冲突与恢复 | 已有代码 | 适配；已有命令/菜单契约，触摸可达性与外接键盘联验 | E02/E11 |
| S21 | 供应商列表、来源与连接/断开 | 已有代码 | 对齐；已有来源限制和真实缺口登记，按目标版本复核 | E04，G25 |
| S22 | 供应商 API key / OAuth | 已有代码 | 适配；已有服务端 attempt+轮询方案，不重新要求选择 deep link；凭据范围按既有契约 | E04，G25 |
| S23 | 供应商多账号管理 | 已有代码 | 对齐；逐操作核对目标行为及目录同步 | E04，G25 |
| S24 | 模型搜索、分组与显示/隐藏 | 已有代码 | 对齐；核对选择器与设置一致性 | E04，G25 |
| S25 | MCP 状态、启停、认证和错误 | 已有代码 | 适配；已有五态及重认证流，授权窗口实态待验 | E04，G26 |
| S26 | 服务端 Plugins / Skills 列表 | 已有代码 | 对齐；与手机 GUI 管理分开，沿用既有作用域 | E04/E09 |
| S27 | 项目列表、搜索及项目设置 | 已有代码 | 对齐；已有入口补丁与生命周期契约 | E03，G19 |
| S28 | 项目名称、图标和颜色 | 已有代码 | 适配；核对 Android 文件选择与保存失败 | E03/E06 |
| S29 | 项目自动批准权限继承/开/关 | 已有代码 | 对齐；已有权限语义，跨服务/项目隔离待验 | E03，G21 |
| S30 | 工作区启动脚本 | 已有代码 | 对齐；脚本在远程执行，需核对目标保存协议 | E03 |
| S31 | 工作区筛选、占用与关联会话 | 已有代码 | 对齐；已有工作区设置，逐字段差异待核 | E03 |
| S32 | 工作区删除与批量清理 | 已有代码 | 对齐；已有风险/确认契约，运行失败路径待验 | E03/E05，G19/G23 |
| S33 | 项目专有/共享 MCP、Plugins、Skills | 已有代码 | 对齐；已有项目扩展页，继续核对作用域变化 | E02/E04 |
| S34 | 项目 LSP 配置列表与状态 | 已有代码 | 对齐；只读状态展示，不扩成配置编辑器 | E02/E04 |
| S35 | HTTP 服务管理、认证与健康状态 | 已有代码 | 适配；已有直连实现；UTF-8 Basic auth 同时修复共享 API 和 mobile health；SSH 后的 OpenCode 服务密码与 SSH 凭据分开，显式 Check again，成功密码仅存运行期内存 | E10/E14/**E18**；**issue #61 真机已实测**：服务认证 401→显式认证→ready→远端会话/工作台可达；断开后重启 App 重连需重新认证（会话内存=预期）；错密码/无凭据 authRequired+可编辑重试。非 ASCII 密码设备实态仍归后续门禁 |
| S36 | SSH 连接、认证、隧道与恢复 | 已有代码及设备运行证据 | 适配；三模式原地切换，exact-owner 隧道及服务认证均 ready 才进入工作界面；JS 先订阅再 bootstrap/ack 建 SSH channel；主机信任与服务认证为独立阶段 | E10/E13–E16/**E18**；**issue #61 真机主链 PASS**（添加/编辑/连接、unknown/changed key 拒绝路径、SSH 认证失败、不可达、target-refused/service-unreachable 分类、信任→认证→隧道→服务认证→远端会话、断开红线三通道证据、3 轮信任稳定）；#h 三模式草稿保持已以隔离诊断包补验 PASS（E18；主应用有记录态连接屏不可达为门设计实态注记，非缺陷判定） |
| S37 | 每服务器 Shell 选择 | 待核对 | 对齐；不能从存在 General 页推定目标读写接口已经覆盖 | E02 |
| S38 | 新图标、折叠长用户消息 | 已有代码（实验入口 + 两开关接线，M-034） | 适配（issue #64）：`experimentalSettingsAvailable` false→true（v2.2.1 逐字、无平台门控，settings/shell.tsx :309/:362 两门控零改动），Experimental 标签呈现 v2.2.1 同款 newIcons/foldUserMessages 两开关 + 搜索目录两条目 + en 六键（app 4 + ui 2，zh 回退英文=上游实态）；newIcons 链逐字移植（new-icons.ts 42 artwork + 70 replacements、icon.tsx 双 symbol/pixelSize 函数化/viewBox 切换；catalog 仅采纳 minus/outline-chevron-right，其余 15 新增名与 sidebar-right 删除及 trash/copy body 改写不采纳——保实验可见差异）；fold 链 fold-only sub-hunk 手术（USER_MESSAGE_FOLD {over:12,show:8}/ResizeObserver/8lh+mask/aria 切换/disclosure 展开态跨行回收保留），timeline 大重写（user-runs/quote/sources/plugin）零混入；**desktop-only 项=空集**（两开关消费链全 renderer 层）；差异登记 E20 八条（gui-plugins panel.tsx newIcons 消费点不在闭包、sprite 常驻 +56,655 bytes、降级不可移植等）；上游定向子集 41/0 + session-ui 146/0 + 第一方 423/0、V3 33=33、探针 verify-experimental-settings.ts 含 15 负断言+artwork 锁+两组负例注入实测；**设备 QA 待执行**（开关真实视觉行为/fold 折叠展开/lh 单位/TalkBack/性能） | E02/E20 |
| S39 | About、版本、许可与声明 | 已有代码（v2.2.1 面对齐 + 移动版本面，issue #72，M-040；运行期行为待设备 QA） | 对齐（issue #72，双轨分离）。**轨 1 上游对齐（目标面缺口清零）**：差异核对实测 pin→v2.2.1 的 About 面 delta 极小且不含任何版本展示变化——notices dialog.tsx 取 v2.2.1 逐字（ScrollView→`div.settings-notices-scroll[data-scrollable]`，恰 3 hunk）+ settings.css 恰一行 `overflow-y: auto` 使能行（v2.2.1 该文件其余 100+ 行 delta 不搭载），补后 dialog.tsx 与 v2.2.1 逐字节相同；**轨 2 基线意图（登记差异，非上游形态）**：证伪结论——上游 v2.2.1 全量 i18n 恰两个版本键（`settings.about.version`/`error.page.version`，同源 `platform.version`），**无**应用/服务/构建三行展示，「三种」实为移动版本身份问题：`createWebPlatform(MOBILE_APP_VERSION)`（0.1.0，三方同步锁 gradle versionName=mobile-hosts package.json=常量；Sentry 行保留 `pkg.version` 逐字负锁）使 About/错误页不再冒充基座 2.1.4 + about 基座行（vendored `pkg.version`=2.1.4，pin 决定不随 v2.2.1）+ 服务行（**首个排序项（含隐藏；单主机等价）**，health 按 `ServerConnection.key(item)` 取 `/api/info` 版本；降级显式：零条目不渲染、undefined/checking→checking、unauthorized/不健康/版本缺失不可呈→unavailable；多主机仅示排序首项，完整版本面以 servers 设置行 tooltip 为准——E28 边界登记）+ en 恰 4 键 zh 回退（en-only 谱系定型）；二阶效应 E28 登记（错误页如实显 0.1.0=改进；`ctx.app.version` 随注入至 0.1.0，全仓无版本比较消费，移动可达仅 updater What's New 已读水位 S40/E24 在册）。回归：V3 38=38（M-039 reserved-absent，apply --check 中间树 rc=0 + 回写字节一致）、settings 41/0/98 + contributors 2/0、第一方 423/0/2885、vendored tsc 388=388、build 3516/159,542,120、APK `48d7faba…1a39c`（markers 全命中）、新探针 verify-about-version rc=0 + 负例五、sweep 25/29（四例在册归因）、leak-scan 零新增；**设备 QA 六项待执行** | E01/E02/E11/**E28** |
| S40 | 更新检查、安装与发行说明 | 未实现（APK 更新） | 待决策；可行性已核对（[ADR 0005 草案](../../../decisions/0005-apk-update.md)，提案态）：目标 updater 为 gui-plugins 插件（feed=generic `https://opencode.ai/update/api/{dev\|beta\|latest}/desktop/opencode/`、channel 恒 latest、状态机 9 态、UpdateTarget 双模式 restart/external——**external 为契约预留位，v2.2.1 无生产 provider**）；移动端 vendored updater 仅 whatsNew 面可达（默认开启的桌面版发行说明外联，R1 已登记三选项谱系）、updater 操作面属 desktop-host 禁用行、Android 壳无 `REQUEST_INSTALL_PACKAGES`、release 构建无签名配置、versionCode=1；三案对比（(a) 应用内 PackageInstaller/(b) 外部引导安装/(c) 不做）与推荐（**暂缓：(c) 为当前运营姿态，(b) 登记为上游 external 契约同型未来形态；激活条件=首个对外可下载的已签名 release 产物+版本清单存在**）见 ADR §3/§4；实施前置条件清单见 ADR §5；**决策待用户** | E09/E24 |
| S41 | 扩展贡献设置页、分区和设置行 | 已有代码（issue #67，M-037；运行期行为待设备 QA） | 对齐（issue #67）：gui-extensions→gui-plugins@v2.2.1 三树一体迁移（包经 manifest packageSources 自 3ebcf9a 抽取；plugin/src/gui 宿主库 24 文件；runtime/extension→runtime/plugin；34 消费端 + conn 判别面手术；Plugin* 设置命名管线；settings-pages v2.2.1 形态——`available` 字段删除 D3，pairing/updater 页宽屏外溢正向对齐；移动 tab id "gui-extensions" 与 `settings.guiExtensions.*` 9 键保留 D4；桌面 DEV 管理页保留适配 D2）。注册面 15 内建（compose 对象 map/windowEntry/mainEntry 面）、Ipc 5 内建+updater 宿主化、Contract 3 宿主化、Bridge.manager 无 install/remove（D04 负锚）；goal Panel 重表壳 D1、sources 窄屏面重落；ui 真 motion-tuning 模块（M-036 shim 退役、门 helpers 合并）+ search-list/typeahead/6 图标采纳。回归：settings 41/0、session-ui 151/0/421、ui 19/0、gui-plugins 3/0、第一方 423/0/2885、28 探针 rc=0 + 负例×6（含图标闭包 179/820）、V3 36=36、净门全零、build 6412 modules、dist 3516/159,532,385、APK `0895c35e…`；**设备 QA 待执行** | E23 |
| S42 | 界面缩放比例 | 已有代码（设置呈现+web 缩放面，issue #65，M-035；运行期行为待设备 QA） | 对齐（issue #65，M-035，裁定 A+A2）：Appearance 呈现 Zoom 六档 Select（100%–200%，`settings-zoom`，`<Show when={appearance.zoom.available()}>` 门控）+ 控制器段 v2.2.1 :94-99 逐字；**web 平台面自主补齐**（M-020 先例）：CSS `zoom` 于 documentElement + localStorage `opencode-ui-zoom-level`（值校验 desktopZoomLevels），platform.tsx 类型文件保持 pin 字节一致；搜索条目删 `available: "desktop"`（裁定 A2，移动搜索可命中；search-results 'font' 期望 3→4）；`nextDesktopZoomLevel` 不移植（S12/#74 捏合域）；与系统字号联动（乘法叠加 + Chromium 41297766 rem 缺陷观察）归设备 QA（未执行）；zh 文案回退英文 | E02/E21 |
| S43 | GUI 启停、状态、失败与 Reload | 已有代码 | 适配；已持久化启停并提供失败/Reload，不重新决定是否做管理器 | E09，G35 |

## B. 工作界面

| ID | 功能/Windows v2.2.1 目标 | 本项目实现 | 策略与实际差距 | 本项目证据/验证 |
| --- | --- | --- | --- | --- |
| W01 | 项目/位置选择、创建并进入会话 | 已有代码 | 对齐；初始 SSH 交接按 exact host/代际/认证状态判断，编辑表单打开时不跳转；已有一次用户认证后列表呈现记录，创建任务及完整项目生命周期仍待验 | E03/E13/E14/**E18**；**issue #61 已实测**：SSH 隧道 handoff 后远端会话列表与既有会话工作台可达（真实远端数据渲染）；创建新任务/完整生命周期仍待验 |
| W02 | 发送、流式输出、权限交互 | 已有代码 | 对齐；已有工作台和审批链，不再按从零建设规划 | E03，G20/G21 |
| W03 | 文件浏览与 Diff | 已有代码 | 适配；已有 file/review，触摸和真实仓库门禁待验 | E05，G22/G23 |
| W04 | 多终端创建、显示、关闭 | 已有代码 | 适配；已有 PTY/重连契约，控制键和尺寸等缺口已登记 | E05，G24 |
| W05 | 会话标签与后台活动 | 已有代码 | 适配；与目标 Inbox/后台行为作增量核对 | E03 |
| W06 | 附件选择与上传 | 已有代码 | 适配；已有 Android FilesBridge 和共享上传链 | E06 |
| W07 | 断开客户端不停止远程任务 | 已有代码/约束 | 对齐；已有生命周期契约，仍需直连/SSH/进程退出实测 | E05/E10/E11/**E18**；**issue #61 SSH 链路已实测**：应用内 Disconnect 后远端进程存活+端口仍监听+请求级日志零 stop/interrupt 命中+杀 App 重启重连后会话恢复（任务级存活未验，归 G20⑤/G12）；直连路径与进程死亡路径仍待验 |
| W08 | 偏好、草稿与导航恢复 | 已有代码 | 适配；初始表单保留交接中的编辑草稿；服务密码草稿按主机/模式/表单生命周期清除，不能与普通草稿一并持久化；重连拒绝迟到状态与旧 endpoint | E11/E13/E14/**E18**；**issue #61 已实测**：杀 App 重启后本地草稿仍在、服务密码需重新认证（会话内存=预期实态）；进程级恢复其余形态仍待验 |
| W09 | 会话搜索与列表筛选 | 已有代码 | 对齐；作用域和新旧搜索行为待核 | E03 |
| W10 | 重命名、归档、删除 | 已有代码 | 对齐；已有归档接线 M-017，运行失败路径未验全 | E03 |
| W11 | Undo / Redo / Fork | 已有代码 | 对齐；命令存在不等于文件与消息回退已真服务验证 | E03/E11 |
| W12 | 上下文压缩 | 已有代码 | 对齐；核对当前模型、禁用状态及失败提示 | E03/E11 |
| W13 | 导出会话、复制 ID | 部分实现 | 适配；共享命令和原生文件桥已有，导出命令到 Android 保存的整链待核 | E03/E06/E11 |
| W14 | 问题、多步回答与结构化表单 | 已有代码 | 适配；已有请求契约，逐类核对 v2.2.1 差异 | E03，G21 |
| W15 | 后续消息和队列 | 已有代码 | 对齐；重连、编辑和提交语义待运行核验 | E03 |
| W16 | 文件选区加入上下文 | 已有代码 | 适配；已有文件引用契约，触摸路径待验 | E05，G22 |
| W17 | Agent、模型与变体切换 | 已有代码 | 对齐；保留现有能力与作用域，不重做范围选择 | E04 |
| W18 | 用量与上下文面板 | 已有代码 | 对齐；旧 context 扩展已注册，服务数据缺失行为待核 | E03/E09 |
| W19 | Desktop 内置浏览器面板 | 部分实现（远程输出链） | 适配；既定手机不作浏览器宿主，原生面板入口禁用；已有远程工具输出/preview fallback，截图呈现未验 | E07，G28 |
| W20 | Office 文档预览 | 已有代码 | 适配；已有 renderer 和资源；PDF/WebView、CJK、大文件属于运行缺口，不重问是否实现 Office | E06 |
| W21 | /btw 侧问 | 已有代码（命令+transient Panel，M-038 窄屏入口） | 适配（issue #70）：v2.2.1 的 btw 仍保留 desktop-width 命令门（`enabled: !layout.narrow() && mounted()` 逐字）且无 mobile face——迁移后五文件 blob 与 v2.2.1 `3ebcf9a` 逐字节相同（双侧 git hash-object 实测），本行为第一方移动特判（M-038，恰 2 目标文件 renderer.tsx + i18n/en.ts；model/panel/index 三文件 v2.2.1 content-sha1 守恒探针锁）。**D1**：BuiltinPanel 注册 `mobile: { order: 80, kind: "menu" }`（More 抽屉项排 goal 70 之后，不动既有 face 编号——order 集合 {10..80} 无重号探针锁）；**D2**：移动渲染路径以面板 id `"main"` 分派（chat id 恒 UUID 不冲突），取最近一条 chat 渲染（store ready 前空容器防闪空态，ready 且零问答才出诚实空态 `mobile.none`），桌面 strip 路径逐字不动；**D3**：命令门放宽为 `enabled: mounted()`——桌面宽度按构造恒等（≥768px 时 `!narrow()` 恒真，旧门已等价于新门），窄屏（<768px，含窄桌面窗口——与上游六 mobile face 的视口驱动口径一致，非平台判据）slash 面出现 /btw；**D4 保持声明**：ask 仍 `tab: "select"`（上游 select 保留窄屏当前视图语义，不触发宿主 selectMobile 分支——避开 transient 存储沼泽），提问后不自动跳转 face。**上游既有存储效应说全（登记不补）**：窄屏 select 分支的 `layout.panel.append` 不受窄屏守卫约束——窄屏期间积累的问答在视口加宽后以 strip tabs 重现（恢复 close 通道）；窄屏 face 本身无 close 通道（chat 只增不删，删除走桌面 strip close）。i18n en +2 键（mobile.title/mobile.none；zh 回退 en——btw 插件级 i18n en-only 与 sources/goal 一致）。**设备 QA 待执行**（QA-1 slash 可达与空参 toast、QA-2 抽屉入口 order 80 排 goal 后/最近问答/复制/retry/第二次 /btw 后 face 跟随更新一条、QA-3 诚实空态、QA-4 桌面宽度 strip 行为不变、QA-5 TalkBack） | E26 |
| W22 | Goal 状态/暂停/继续/清除 | 已有代码（Panel 注册 + 服务能力降级，M-036） | 适配（issue #66）：goal 契约逐字移植（schema/opencode.goal RPC 含三处 `Schema.toStandardSchemaV1` 包裹——实施证明闭包内 effect@4.0.1 导出该 API 且 PortableDefinition 必需该形态，计划的剥离适配被证伪，逐字形态落地并锁定）+ renderer 数据层（server+session store/createKeyed 订阅/heard 丢弃/错误吞掉注释逐字）+ status 三态映射 + `session.command` 三词与错误 toast；UI 以旧宿主 Panel 重表壳（pinned/transient side tab 仅当 goal 加载且非 null、mobile face order 70、空态诚实呈现）——**差异 D1 登记**：ComposerPill 呈现位置与 popover 菜单形态延迟 #67（四 token 四域零命中负断言）；服务能力降级三态有结论（无 RPC→入口不存在按构造/命令失败→错误 toast/有插件无 goal→同空态，全部上游自身行为）；服务端 goal 插件不移植（远程服务域，探针负断言）；**设备 QA 待执行**（对 v2.2.1 服务端的 goal 往返与对 pin 版服务端的入口缺席双对照、命令失败 toast、窄屏空态） | E22 |
| W23 | Sources 来源面板 | 已有代码（实验 gate + 注册 + 移动面，M-036） | 适配（issue #66）：按 `0f379f0a33` 旧宿主形态逐字移植四文件（`uses:{browser}` 软依赖/transient side Panel 实验关闭收回/LinkHandler/tab.count）+ session-ui sources 子系统八文件（含上游 sources.test.ts，在册子集破例 +1 已登记）+ 三处时间线钩子增量（不携带 user-runs/quote 域——八 token 与修订后 M-034 探针保留集互证）+ app SourcesProvider + ui en 9 键；实验 gate 以最小 motion-tuning shim（上游 `opencode.motion.v2` 存储格式四面、默认 false 无 auto-enable、不经 settings store）+ 设置 Experimental Sources 行实现移动可达——**差异 D2 登记**（上游开关在桌面 Knobs dev 台）；窄屏 More 抽屉项（order 60，goal 70）呈最近有来源 turn 或空态——**差异 D3 登记**（chip 唤起保持上游逐字，桌面宽度生效）；icons choice 无 UI 恒 letters=零第三方 favicon 请求（隐私正向）；motion spring/loop 逐字移植（M-035 耦合在 M-036 rebase 字段声明）；**设备 QA 待执行**（gate 开→chip→面板往返、关闭收回、重启默认关保持、抓包零 favicon） | E22 |
| W24 | 非 prod 实验语音通话 | 未实现（语音通话） | 待决策；可行性已核对（[ADR 0006 草案](../../../decisions/0006-voice-call.md)，提案态）：上游面存在但四重条件锁死（desktop 平台门 composer.tsx:43-44 + 非 prod 渠道 + 默认关实验 knob :19-25 + 服务端 realtime 凭据门）；移动 web 平台被上游门控结构性排除（M-011 platform="web"）——移动现状与上游 web 平台行为一致，非对齐缺口；移动端实施前提七项全未满足（平台门语义分歧、18 个 .ts/.tsx + voice.css 移植、RECORD_AUDIO+onPermissionRequest（#71/D03 同型）、WebView WebRTC/autoplay 运行探针、服务端 v2.2.1+realtime 凭据、隧道外手机↔OpenAI RTC 直连路径、语音 knob 移动 face）；pin 服务端契约为版本化残留（voice.ts=回退前超集 f7577a1f65 进/8d95ef805b 出、realtime.ts 缺 3330b3cf38 增量，两侧均≠v2.2.1；iOS 交接时间线基础呈现已在 message-timeline.tsx:301，v2.2.1 transcript_delta 增量不在树）；三案对比与推荐（**暂缓：默认不做当前运营姿态 + 激活条件登记；不计作生产默认能力约束在任何实施中保持**）见 ADR §3/§4；实施前提清单见 ADR §5；**决策待用户** | E02/E11/E25 |
| W25 | 会话详情、工作区位置菜单 | 已有代码 | 适配；旧 details 已注册，逐个工作区操作差异待核 | E03/E09 |
| W26 | 命令面板统一检索 | 已有代码 | 适配；已有命令/菜单契约，新增命令与触摸入口待核 | E11 |
| W27 | 会话内容搜索与高亮 | 已有代码 | 适配；WebView CSS highlights 与长历史定位待验 | E03 |
| W28 | Debug bar、堆快照、动效诊断 | 部分实现 | 适配已核对（issue #73，零代码纯核对+登记，implementation.md W28/E29 小节 13 行逐操作矩阵）：web 可用子集 = `debug.toggle` 命令（无条件注册，先于 desktop 门行）+ **≥768px 宽屏** DebugBar CLOSE/DURATION/TPS（aside CSS `hidden md:block` 逐字；窄屏 <768px 结构性隐藏=上游 web 窄窗口同构视口 CSS，非移动特判，登记不补）；desktop-only 项全部诚实缺席/元素级不渲染、无误报——`debug.heap` 命令级永不注册（verify-commands-menus 组 5 + commands-menus.md 在册先锁，引用不重锁）、诊断格族与 Motion=`import.meta.env.DEV` 构建期缺席、MEMORY=web 恒 inactive（无 main 域）、FOCUS 三重门（diagnostics Show + desktop Show + `if (!desktop) return`，评审 MINOR-4）、main 侧运行面结构性不存在（gui-plugins.md §一红线在册）；**titlebar 渠道开关两移动列均不渲染**（移动构建渠道 env 未设——titlebar.tsx:787 `if (!channel || channel === "prod") return null` 任何视口早退，无入口；评审 MAJOR-1 修正：宽屏亦非「非交互静态徽章」）；placement 消费者读不存在字段 = pin 内混合代际漂移（E29 小节上游漂移登记——非 M-037 漏迁、非本仓适配缺口，评审 MINOR-2）；管理面 debug 行=web 可启停行语义自洽（分类判据=在册注释 whole contribution runs renderer-side，评审 MINOR-3）；设备 QA 待执行指针见 build-and-verify.md issue #73 段（QA-1..QA-3，keybind-only 可达路径） | E09/E29 |

## C. Windows 宿主与连接

| ID | 功能 | 本项目实现 | 策略与实际差距 | 本项目证据/验证 |
| --- | --- | --- | --- | --- |
| N01 | 本机服务与 CLI 引导 | 不实现 | 排除；手机只作为远程客户端 | E01 |
| N02 | 本机 WSL 发现、安装及启动 | 不实现 | 排除执行；显示禁用入口另见 N12 | E01；执行不适用 |
| N03 | 手机管理远端 Windows 的 WSL | 不实现 | 排除；已有 ADR 明确不发现/启停/管理 Windows 主机 WSL，不能写成待决策 | E01；不适用 |
| N04 | SSH 认证与主机指纹挑战 | 已有代码及设备运行证据 | 适配；确认绑定 pending target/有效端口/指纹，编辑使提示失效；修复 known_hosts 写入 Line.raw；未知与变更密钥不绕过校验 | E10/E16/**E18**；**issue #61 真机闭环**：提示指纹与独立参考相等布尔 true（双通道采样一致）→历史「提示不匹配」裁定为比对过程错位（H2），非应用缺陷；unknown/changed 拒绝路径、两步危险确认+forget、Reject 不落盘、Trust 落盘格式（默认端口裸主机名）均实测通过 |
| N05 | SSH 服务发现、安装、启动及不兼容处理 | 已有代码 | 适配；已有白名单命令及显式授权流，不静默替换服务 | E10，G18 |
| N06 | 手机作为配对服务提供方 | 不实现 | 排除；客户端链接接入见 D03 | E01；不适用 |
| N07 | 服务提供方配对页屏幕常亮 | 不实现（该页面） | 排除；属于 N06 的主机侧流程；一般客户端常亮不据此新增需求 | E01 |
| N08 | 文件保存/分享/选择、剪贴板和外部打开 | 部分实现 | 适配；FilesBridge 已有；Windows Explorer/本机路径语义不搬到手机 | E06/E11 |
| N09 | Windows 安装更新及 beta notes | 未实现（APK 等价流程） | 待决策；与 S40 同一问题（ADR 0005 一并覆盖检查/安装/发行说明面，含 beta notes 三通道核对）；远程服务升级已有独立实现（决策 0004 第四桥 upgrade 模板）——升级远端 OpenCode 服务 ≠ 升级 APK 客户端，0004 不覆盖本行；推荐暂缓 + (b) 外部引导形态登记为契约同型未来形态，激活条件见 ADR §4.2；**决策待用户** | E09/E10/E24 |
| N10 | 平台快捷键与窗口控制 | 部分实现 | 适配；已有命令菜单、Android 壳和返回逻辑；不需复制 Windows 窗口控件 | E11 |
| N11 | GUI 宿主、注册与 OS 过滤 | 已有代码（issue #67，M-037；运行期行为待设备 QA） | 对齐（issue #67）：宿主迁移不回退——`usePluginHost` 四面（definitions/state.status/failures/reload）与 M-026 包装器一一对应；OS 过滤同语义换 `runsOn(definition, os)`（os gate 行逐字不变；wsl `os:["windows"]` 字面量原样）；移动白名单三集（web 10 含 sources/goal / desktop-host 4 / excluded {wsl} 静态排除行零操作）与 mobile face order {10..70} 不变；M-025 禁用并集重落于 runtime/plugin/root.tsx（definitions 过滤自愈+两 marker）；desktop-host 禁用行语义保持。证据同 S41 行（探针 runsOn 双锚/os 字面量/三集/零安装面/图标闭包断言全绿；APK `0895c35e…`；设备 QA 1–3/6 待执行） | E23 |
| N12 | Android WSL 入口可见但禁用 | 已有代码 | 适配；用户已确认；移动管理面以静态排除行显示名称、禁用状态与原因（不发现/不安装/不启停/不管理/不执行命令，含 Windows 宿主，决策 0001），零操作入口；OS 过滤的宿主定义不变，桌面行为不变 | E09；探针/单测/构建已验，运行期呈现归 G35⑦，未验证 |

## D. 范围差异

| ID | 能力 | 本项目实现 | 策略/既有决定 | 本项目证据/验证 |
| --- | --- | --- | --- | --- |
| D01 | 手机本地服务与工具链 | 不实现 | 排除；任务与工具在远程执行 | E01；不适用 |
| D02 | 手机服务开放给其他设备 | 不实现 | 排除；不影响手机作为连接方 | E01；不适用 |
| D03 | 配对链接接入及扫码 | 部分实现 | 对齐（issue #71）：**相机扫码已实现**——壳接入 manifest CAMERA（运行时权限仅经 WebView `onPermissionRequest` 应用内授予）+ `CameraGrantPolicy` origin/资源白名单（JVM 23/0/0 + 探针启用态修订 + 负例×4）；**设备验收子态（MatePad 实测，E27）**：QA-0 判定枚举原生成立（videoinput kind 完好，M-039 放宽未触发、零 vendor 补丁）、授权链/临时拒绝/永久拒绝/零重复弹窗/撤销恢复/旋转取消竞态/痕迹负例全实测（QR 解码与兑换全链段归 G32①② BLOCKED 如实）；三态呈现复用共享 i18n；相机帧不出页面。**外链唤起评估完成未实施**（[ADR 0007 草案](../../../decisions/0007-pairing-deep-link.md) 提案态：App Links 对用户自管服务器域结构性不可适用、自定义 scheme 可行但独立 issue 体量且引入隐式唤起信任面，推荐不实施 + 激活条件登记；QA-8 真机负例：VIEW intent 由浏览器接管、`opencode://` 无解析目标；**决策待用户**）；粘贴/导入不变；不能把整项写成未实现或完全实现 | E10/E27 |
| D04 | 第三方 GUI 完整运行兼容 | 不实现（当前范围） | 排除；现有管理器不提供 install/remove/marketplace/第三方加载；不影响服务端插件列表 | E09 |
| D05 | 进程死亡期间仍收到通知 | 不实现（当前范围） | 排除；已决定不做前台服务/保活/推送，存活期间 best-effort | E08；不适用 |

## E. Android 平台适配

| ID | 能力 | 本项目实现 | 策略与差距 | 本项目证据/验证 |
| --- | --- | --- | --- | --- |
| M01 | APK 安装与启动 | 已有代码及历史运行证据 | 新增；inline SSH 已集成；修复旧 Service Worker 控制新 APK 资源的问题，更新限定可信 shell origin/root scope/packaged sw.js，不清应用数据 | E11–E13/E17；不同 APK 的构建、安装、UI 与 worker 证据分别记录 |
| M02 | 安全凭据存储 | 已有代码 | 适配；M-032 改为 AndroidX origin/main-frame listener v2，代际校验回复、限制队列/请求；保持 OPMV1 信封，修复 Keystore IV 与删除失败反馈；主机删除保留可见孤立凭据 | E10/E15；设备失败/升级门禁 C1–C6 尚未全部通过 |
| M03 | 返回、安全区与软键盘 | 部分实现 | 适配；已有 MainActivity 与交互质量契约；完整无障碍/键盘门禁未通过 | E11/E12 |
| M04 | 网络变化与前台恢复 | 已有代码 | 适配；事件流/隧道重建复用会话内服务密码，重新 health 后发布 endpoint；断开/编辑/删除清除密码并拒绝迟到成功；check 请求代际与取消隔离 | E10/E11/E14/**E18**；**issue #61 已实测**：同进程 disconnect/reconnect 以会话内存密码重连成功（#k 观察：3 轮 Connect 后即为 Connected 且 ServiceAuthPrompt 零重现）；杀 App 进程后重连需重新认证；网络切换形态仍待验 |
| M05 | 通知渠道与系统权限 | 已有代码 | 适配；已有 NotificationsBridge 和授权入口，沿用既有通知边界 | E08，G33 |

## 剩余决定与推进口径

1. **既定范围**：通知边界、手机不作浏览器宿主、内置 GUI 管理范围、Office、链接配对、WSL 执行排除按既有决定执行。
2. **已批准的新要求**：N12 显示禁用 WSL。现有隐藏行为必须改，不能把执行排除当作 UI 已完成。（已实施：移动管理面静态排除行——名称/禁用状态/原因文案/零操作，决策 0001 本身不变；运行期呈现归 G35⑦。）
3. **明确的版本增量**：Inbox、实验设置入口、减少动效/缩放设置呈现、Goal/Sources 注册，以及 gui-plugins API/宿主迁移；先做技术差异核对，保留现有移动补丁。
4. **候选产品选择**：APK 更新机制；是否额外承诺非生产语音。/btw 窄屏、扫码/外链等缺口先核对设计和可行性，再讨论具体方案。
5. **优先次序**：沿用“先闭环，再补全”和无线 ADB MatePad 验证。源码复用继续独立维护、逐版本对比。
