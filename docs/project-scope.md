# 项目范围

本文记录已确认的产品目标，不代表功能已经实现，也不替代后续交互设计和技术方案。

## 当前事实

- 已建立独立 Git 仓库及初始化文档；上游前端闭包已引入 `vendor/upstream`（pin `b4525d79bf`，经 issue #27 更新演练推进），来源与补丁记录见 `vendor/upstream/PROVENANCE.md`。
- web 静态构建在本机可复现（bun 1.4.2；3480 个文件，共 153,441,733 字节，清单见 `web-dist/manifest.json`，issue #26 交付后 2026-10-28 刷新——M-025/M-026 与 mobile-hosts GUI 扩展管理面两模块进入构建，6182→6184 modules、字节数变更、文件数不变；issue #23 交付后时点为 153,407,024 bytes、issue #16–#22 期间为 153,367,425 bytes 同数复核，各期历史时点记录见 `docs/build-and-verify.md` 对应段，不改写）。
- Android WebView 壳代码已实现（未编译验证）；issue #55 验证使用本机 Android SDK/Gradle 构建并安装了 debug APK，完整发布流程仍不在本仓库提交产物中。
- issue #55 初始 SSH 入口已实现（未验证）：移动连接屏提供本地化 SSH hosts 动作，导航到精确 `/settings?tab=servers`；空/签出 AppShell 只放行该 root servers 视图，签出仍保留原服务地址回连。复用 M-008/M-018 的 MobileHostManager，不改 SSH transport；运行期归 G36，设备验证 BLOCKED。
- 尚无已提交的发布 APK；issue #55 工作树中已构建并安装 debug APK，初始 SSH 入口和空态管理面冒烟通过，完整 G36/SSH E2E 仍未验证。两种连接方式（SSH 隧道、服务地址直连）已实现（未验证，issue #5/#6）但未经设备端到端验证；远程项目、工作区与会话生命周期管理（浏览/选择远端目录、会话创建/打开/fork/重命名/归档/切换）已实现（未验证，issue #8）；会话工作台（流式消息/上下文/工具/子任务、发送与取消安全语义、事件缺口后经服务端快照恢复）已实现（未验证，issue #9——零新建界面/零补丁，上游闭包承载）；权限请求与 Agent 提问（请求呈现与决策三值/提问向导、duplicate/stale/expired 处置、请求身份会话作用域、auto-approve 显式 opt-in、断开零副作用、响应留痕）已实现（未验证，issue #10——零新建界面/零补丁，上游闭包承载）；远程文件浏览、搜索、查看与上下文引用（文件树/搜索/查看三端点、path identity、行范围选择附入会话上下文、按 workspace 恢复打开的文件 tab 与行选择、大文件/二进制/编码/陈旧处置）已实现（未验证，issue #11——零新建界面/零补丁，上游闭包承载；Android 文件导入/导出/分享仍归 issue #16）；远程 Git 审查与 worktree 操作（review 三模式 diff——会话 turn 快照/仓库 working/branch、移动 Changes 一级 tab、行评论、details 的 branch/worktree 上下文、worktree 迁移/创建/删除（五层确认链）/refresh、undo/redo 与 staged revert 自动 commit、大 diff/二进制/媒体处置；**git index 的 staged/unstaged 分解与 git commit 操作无上游客户端面——能力边界如实登记**）已实现（未验证，issue #12——零新建界面/零补丁，上游闭包承载）；远程终端（多 tab 全生命周期、二进制 WebSocket 输入/输出、resize、退避重连+探活+clone 恢复、2000 行快照恢复、三级断开语义——「Never send stop on client disconnect」红线；移动 IME/外接键盘/触屏选择为登记缺口归 G24 判定）已实现（未验证，issue #13——零新建界面/零补丁，上游闭包承载，见 [design/units/terminal.md](design/units/terminal.md)）；远程 Provider 与模型配置（设置 providers/models 双 tab、连接对话框方法选择/key 表单/OAuth auto+code 双视图与三重回退、账号管理、模型目录与可见性、模型选择 per 服务器+目录作用域；OAuth 服务端 attempt+轮询无 deep-link 依赖；provider 凭据服务端存储不落地设备；**custom provider 保存为上游 stub**）已实现（未验证，issue #14——零新建界面/零补丁，上游闭包承载，见 [design/units/providers-models.md](design/units/providers-models.md)）；远程 Agent 能力与扩展配置（设置 extensions 三子 tab（MCPs/plugins/skills）+ 项目级四子 tab（含 LSP）、/mcp 对话框、new-session MCP 控件与 prepare 门、会话「更多」抽屉 details server 面板、composer @skill/@agent//slash 注入；MCP 五态呈现与运行时 connect/disconnect/needs_auth 重认证（服务端运行时态 until restart/reconnect，`mcp.status.changed` 事件回推）；断开零副作用、GUI 扩展主进程移动零执行边界（两套 extension 面区分；生命周期归 issue #26）；**agents/commands/skills 只读呈现、MCP 配置增删改无客户端 UI（指回 opencode.json）、config.update 为上游 stub——能力边界如实**）已实现（未验证，issue #15——零新建界面/零补丁，上游闭包承载，见 [design/units/agent-capabilities.md](design/units/agent-capabilities.md)；设置其余 tab 仍未建立契约）；附件、工件与 Android 文件交互（附件导入/上传进度取消/工件查看器/会话导出复用上游闭包 + files 桥三 op 平台能力新面——SAF 导出落点用户可达（三态与上游 export 契约对齐）、timeline 附件 data: 分支分享（代际清理、授权一次性）、剪贴板图片（content:// image 形态）、name 双层净化与远程工件身份分离；**saveFile 桥降级=静默取消为有意行为变更**；**Office 渲染归 issue #18**；session import 入口移动隐藏为上游实态；外部 IDE/Explorer 维持排除）已实现（未验证，issue #16——**本期首次含第一方运行时代码**（`packages/mobile-hosts/src/files/` 第五桥 JS 侧）+ 壳层新 Kotlin 面（`FilesBridge`/`ShareFileProvider`，零 androidx、零新权限）+ vendor 补丁 M-020/M-021（总数 18→20），见 [design/units/attachments-artifacts.md](design/units/attachments-artifacts.md)）；远程浏览器工具与浏览器工作面板（服务端 `browser.*` Code Mode 工具命名空间 45 操作 + `experimental.browser` RPC 通道 + 桌面 app 宿主连接与工作面板 UI——**执行宿主桌面专属，手机不能也不试图充当浏览器执行宿主**；移动形态=会话时间线内的呈现：工具行/快照与评估文本输出/`browser.preview` 文件回退文件 tab/桌面产生的元素评论消息，「Open browser」命令可见但恒禁用；**截图产出 data: file part 是事实但时间线消费端无渲染链——呈现形态未知，归 G28② 实态判定，不声称截图在移动时间线可见**；「手机外部浏览器 ≠ 工作台内浏览器」结构性区分（工作台内浏览器零外跳、外跳是桌面面板显式 affordance 且移动不存在、壳无 ACTION_VIEW seam）；inspect 不入 #11 IDE/Explorer 排除清单（移动缺席=构建门控，两套机制）；错误路径（blocked URL/导航失败/auth/renderer 崩溃/工具超时与断连）与秘密不泄漏语义（凭据 URL 双端拒绝零回显、服务端凭据 main-only、事件流元数据-only、deny-until-attach）上游闭包承载）已实现（未验证，issue #17——零新建界面/零运行时代码/零壳层改动/零补丁，见 [design/units/browser.md](design/units/browser.md)）；工件查看器与 Office/富媒体渲染（文件 tab 打开的 14 kind 工件渲染面——image/svg 缩放平移、video/audio 播放、pdf/html iframe、font 字样标本、table 截断呈现、markdown/mermaid 管线；docx/xlsx/pptx 三 kind 由内建 GUI 扩展 microsoft-office 经 FileViewer 契约承载（`@betteroffice` 引擎：docx/xlsx/pptx Apache-2.0、fonts 包 Apache-2.0 AND OFL-1.1——字体族 OFL-1.1 归属由上游 notices/fonts.ts 专节携带，零新增许可义务；Rust+WASM 引擎每格式按需懒加载、每文件独立 worker；dist 闭包在册 4 wasm/3 office worker/86 ttf）；魔数预检在引擎下载前拒绝坏字节（口令保护/旧格式/伪装），引擎失败/局部失败/解码失败落可行动占位（零空白态）；worker-per-file 内存防线；无平台门控；远程工件无设备侧下载面（上游边界，工件下载候选 M-022+ 待用户决策）；**PDF iframe 实态（Android WebView 是否提供内建 PDF 渲染器）与 CJK 字体回退观感（33MB CJK add-on 不随包、中日韩以 Latin 兜底为上游裁定）两项运行实态未经判定，归 G29②⑥——不声称 PDF 在 WebView 可渲染、不声称 CJK 完整显示**）已实现（未验证，issue #18——零新建界面/零运行时代码/零壳层改动/零补丁/零依赖的上游复用固化，见 [design/units/artifact-viewers.md](design/units/artifact-viewers.md)）；配对与连接链接导入面（桌面 pairing 协议的接收端：粘贴导入四层校验（scheme 白名单/userinfo 拒/路径白名单+CODE 正则/legacy 识别拒绝）、零被动导入三锚（零 deep-link/零剪贴板监听/零自动兑换）、token memory-only 纪律（link 流不经 vault、导入面零剪贴板写、零日志零历史）、prior credentialRef 分面（dialog 面透传保 ref/screen 面重配对丢弃+重配对自愈=上游实态例外）、TLS 与 SSH 校验域零绕过零触碰；**六项不支持流如实登记：LAN 明文配对链接（netsec 阻断，支持路径=HTTPS 隧道）、相机扫描（壳层能力缺席，扫描使能候选 M-022+）、经隧道端点手工兑换、外部链接拉起 App、消息内点按链接=同窗导航、旧版 `/connect#` 凭据链接（识别即拒绝）**）已实现（未验证，issue #22——上游闭包承载，零新建界面/零补丁/零运行时代码，见 [design/units/connection.md](design/units/connection.md) 配对专节；运行期归 G32，BLOCKED）；通知面（任务完成/权限/错误通知：上游通知系统完整随闭包在壳内但最终一跳在 Android WebView 结构性死点且 permission 通知为上游死开关；第六座协议隔离桥 NotificationsBridge（白名单恰 notify/requestPermission、三类静默频道、native 前台复核、VISIBILITY_PRIVATE、零动作按钮、PendingIntent 路由零 deep-link）+ POST_NOTIFICATIONS 权限 + mobile-hosts notifications 模块（fail-closed stub）+ vendor 补丁 M-022/M-023/M-024（补丁总数 20→23）；**可靠投递边界：系统通知为 best-effort——进程死亡期间零通知、后台 socket 通常在挂起期静默死亡（回前台快照补齐）、零前台服务零保活零推送**（开发前确认项 7 落地）；**通知不得批准权限或停止任务**（op 白名单+零 addAction+审批线级恰两处与通知面双面零交，tap 仅导航）；permission 通知为壳内补全面非上游行为）已实现（未验证，issue #23——本期首含第六桥运行时代码与三补丁，见 [design/units/notifications.md](design/units/notifications.md)；运行期归 G33，BLOCKED）；设备门禁 G1–G35 全部未执行（见设计文档与 `docs/build-and-verify.md`）。恢复横切收口已实现（未验证，issue #19）：六场景机制链（SSE 断流/前后台/网络切换/进程死亡重启/隧道重建/快照恢复）、恢复数据类 persistence policy、失败类别×恢复矩阵与服务端存活核对步骤收口于 [design/recovery.md](design/recovery.md)（零补丁零运行时的索引与收口层；运行期归 G30，BLOCKED）。移动交互质量横切收口已实现（未验证，issue #20）：窗口与进程形态实态落字（单窗口壳、返回键=结束 Activity（同窗导航类例外）、旋转=Activity 重建）、导航切换保持索引、键盘/viewport/响应式断点集合、读屏/对比度/触摸目标盘点、偏好恢复索引（recovery.md「用户偏好」行）与 Desktop actions 平台映射清单（slash 11 键全集含 /model /connect /agent /mcp）收口于 [design/interaction-quality.md](design/interaction-quality.md)（零补丁零运行时的索引与收口层；运行期归 G31，BLOCKED）。命令与菜单面横切收口已实现（未验证，issue #24）：上游 Desktop 菜单（`DESKTOP_MENU` 七菜单/`DesktopMenuAction` 19 枚举）是纯数据声明的桌面主机面——web 构建结构性不渲染且 `runDesktopMenuAction` 无 web 实现，移动壳零渲染零执行路径；命令注册系统全景（七个第一方注册面+扩展 `${extension}.${id}` 发布）与 web 可达四面（slash 列表/Shortcuts 键位触屏编辑/More 抽屉与 tabs/物理键位）、菜单引用命令恰 13 与悬挂 4 命令的上游桌面 face 实态（壳内零渲染故零悬挂）、enablement「no dangling」五层结构链、window.* 单窗口四行裁定（window.new 排除/close≈返回键退出/minimize≈系统 Home/maximize N/A——不创建多窗口）、编辑/缩放/导航三族实态（两组 undo/redo 与两层 back/forward 区分、零通用全选入口、zoom 判定点）与 Windows-only host 命令排除清单收口于 [design/commands-menus.md](design/commands-menus.md)（零补丁零运行时零壳层的索引与收口层；运行期归 G34，BLOCKED；Windows 运行期菜单证据归 issue #1）。GUI 扩展管理面（13 内建扩展清单与宿主能力映射收口；移动可见启用/禁用、状态/失败呈现、Reload 重试、状态恢复——vendor 补丁 M-025（root.tsx 禁用集合并集+definitions 过滤自愈）/M-026（设置 gui-extensions tab 移动挂载+门修订+en/zh 9/9，补丁总数 23→25）+ mobile-hosts `extensions/manager`+`ui/extension-manager` 两模块（`opencode-mobile.guiext.v1` device-local 记录+/ui Switch/Button 管理面，desktop-host 四行「桌面专属」呈现）；**phone never runs Electron/Node main-process extensions**（#15 四证据链承接+六 main entry 清单与五早退守卫增量锚）；dev/source 管理器与 packaged 信任/安装模型区分，**移动零安装/零移除/零扩展商店（marketplace）落字**；禁用面板不留死菜单/不丢草稿/不停止远程工作由宿主同帧批量下线+响应式消费面+app 侧草稿+pty.remove 恰 1 非 dispose 结构性承载；扩展业务行为归属各 feature issue，禁用后果=面的隐藏非行为变更）已实现（未验证，issue #26——本期含两补丁与第一方管理面两模块，见 [design/units/gui-extensions.md](design/units/gui-extensions.md)；运行期归 G35，BLOCKED）。
- 许可审计 BLOCKED：12 项待用户决策，`NOTICE-THIRD-PARTY.md` 尚未生成。
- 服务凭据默认 memory-only（M-002 补丁，刷新/重启需重新输入密码）；可选的安全记住已实现（未验证，issue #4）：Android Keystore（AES-256-GCM 信封 v1）加密落盘，元数据索引永不存值，无额外解锁，无明文回退，备份排除已实现（未验证）。
- 主机注册表已实现（未验证，issue #3）：第一方包 `packages/mobile-hosts/` 承载 SSH 主机记录（身份键 `mobile-ssh:<uuid>`、名称唯一、载荷白名单无凭据字段；issue #6 增 servicePort 白名单字段）与连接状态机；vendor 补丁 M-004…M-008 将其接入上游 app。直连服务仍走上游原生注册表，credentialRef（M-005/M-006）为非机密引用；可选记住与凭据管理器随 issue #4 交付（M-009/M-010 与 M-007 修订，`packages/mobile-hosts/src/vault/` + `android/.../vault/`）。设备级验证（G13–G15、C1–C5、live E2E）全部 BLOCKED。
- SSH 隧道传输已实现（未验证，issue #6）：内建 SSH（无外部 SSH App/跳板机）——密码/密钥认证（密钥导入经 #4 vault，口令与私钥同信封）、未知指纹显式确认（HostKeyPrompt 已挂载）、变更密钥严格拒绝+显式恢复、known_hosts 原生 OpenSSH 行格式（`filesDir/ssh/`，备份排除）、指纹与 `ssh-keygen -lf` 互通（固定向量）、本地转发到远端回环 `localhost:<servicePort>` 单跳、失败四层分类（可达/认证/隧道目标/服务）。SSH 库（jsch 2.28.8 Revised BSD + bcprov 1.80 Bouncy Castle Licence，均宽松、不触发 V4 停点）只在 Kotlin 桥内；共享层零平台 API；fail-closed stub 保留为无注入默认。裁定与支持矩阵/失败 UI/安全评审见决策 [0003](decisions/0003-ssh-transport.md)。**真机门禁全部 BLOCKED**（G17 三桥 bring-up、SSH E2E：auth 成败/未知/已知/变更三态/目标拒绝/重连/远程任务存活）。**勘误（issue #7 S5）**：本机 SDK 在位，Kotlin 编译已过真实工具链（`:app:compileDebugKotlin` PASS）；APK 打包仅阻塞于 jsch+bcprov jar 元数据冲突（待 build.gradle.kts packaging 决策）。
- 直连传输卫生与错误分类已实现（未验证，issue #5）：vendor 补丁 M-011…M-014（mobile 补丁总数 10→14；issue #6 增 M-015 后为 15）——validated-follow 重定向策略（跨主机/降级拒交付）、userinfo 凭据 URL 拒发、端点 probe 分类器（fail-closed stub 默认，Android 桥 ack 后可用）与 `dialog.server.error.<code>` 反馈；裁定（决策 [0002](decisions/0002-direct-connection-transport.md)）：TLS 信任=system CA 唯一锚（静态负断言在册，绝不 trust-all）、**明文 HTTP 直连本期不支持**、**自签/私有 CA HTTPS 直连本期不支持**（出路：正规 CA/SSH 隧道/per-connection pin 后续候选）。probe 桥 bring-up（G16）与错误矩阵端到端（G4/G5/G11）BLOCKED。
- 远程服务发现与显式授权的安装/启动/版本处理已实现（未验证，issue #7）：第四座协议隔离桥（`opencode-mobile-svcops-handshake`）+ 白名单命令面（模板表 OS 闭域三分变体、参数双闸、全仓唯一 `setCommand` 调用点被 Kotlin 校验器门禁、零删除类模板）+ 授权流 O1–O14（无确认不执行、取消不确定性诚实呈现、回滚仅自 rollbackAvailable、**无 disconnect→stop 边——断开永不停止远端**）；两层发现（API 权威 + SSH exec 安装面，pgrep 漏报等限制直陈）；curl 管道安装仅 POSIX 且预览明示远程执行本质（N2）；凭据逐命令解析单次过桥（N7 继承 0003 §4）；断开存活复核（B1 触发集 watcher，`state-machine.ts`/`runtime.ts` 零改动）。裁定（[决策 0004](decisions/0004-service-operations.md)）：**客户端构建不隐含服务操作能力**（运行时桥下发、构建产物零执行面）；确认与执行间的 TOCTOU 残余为已接受有界竞态（exec 侧预检拒绝覆盖运行中服务）。设备/真 OS 门禁（G18 四桥 bring-up、三 OS E2E）BLOCKED；APK 打包阻塞于 jsch+bcprov jar 元数据冲突（需 build.gradle.kts packaging 块，待决策；Kotlin 编译已过真实工具链）。

## 已确认目标，尚未实现

| 领域 | 目标 |
| --- | --- |
| 平台 | 优先交付 Android APK，后续允许适配其他移动平台 |
| SSH | 连接远程主机，通过 SSH 隧道访问远程 OpenCode 服务（注册表/状态机/隧道传输已实现（未验证，issue #6）；真机 E2E BLOCKED） |
| 直连 | 通过服务地址、端口和认证信息访问远程 OpenCode 服务 |
| 工作界面 | 尽量复用 Desktop 的远程项目、会话、文件、Diff、权限与终端体验（远程项目/工作区/会话生命周期已实现（未验证，issue #8，见 [design/units/projects-sessions.md](design/units/projects-sessions.md)）；会话工作台（流式消息/上下文/工具/子任务）已实现（未验证，issue #9，见 [design/units/session-workbench.md](design/units/session-workbench.md)）；权限请求与 Agent 提问已实现（未验证，issue #10，见 [design/units/permission-requests.md](design/units/permission-requests.md)）；远程文件浏览/搜索/查看与上下文引用已实现（未验证，issue #11，见 [design/units/files.md](design/units/files.md)——导入/导出/分享仍归 issue #16；远程 Git 审查与 worktree 操作已实现（未验证，issue #12，见 [design/units/diff.md](design/units/diff.md)——staged/unstaged 与 git commit 为上游能力边界；远程终端已实现（未验证，issue #13，见 [design/units/terminal.md](design/units/terminal.md)——移动 IME/外接键盘/触屏选择为登记缺口归 G24；远程 providers/models 配置已实现（未验证，issue #14，见 [design/units/providers-models.md](design/units/providers-models.md)——custom provider 保存为上游 stub，设置其余 tab 仍未建立契约）；远程 Agent 能力与扩展配置（agents/commands/skills/MCP/插件呈现与运行时启停、MCP 重认证流、GUI 扩展主进程零执行边界）已实现（未验证，issue #15，见 [design/units/agent-capabilities.md](design/units/agent-capabilities.md)——agents/commands/skills 只读、MCP 配置增删改指回 opencode.json 为上游能力边界）；附件/工件/Android 文件交互已实现（未验证，issue #16，见 [design/units/attachments-artifacts.md](design/units/attachments-artifacts.md)——SAF 导出/分享/剪贴板为平台能力新面，Office 渲染归 issue #18）；远程浏览器工具与浏览器工作面板已实现（未验证，issue #17，见 [design/units/browser.md](design/units/browser.md)——**执行宿主桌面专属、移动形态=时间线呈现，手机外部浏览器不构成工作台内浏览器能力；浏览器面板操作本体（打开/刷新/导航/关闭/inspect）是桌面宿主面，移动以时间线呈现与边界诚实承接**）；工件查看器与 Office/富媒体渲染已实现（未验证，issue #18，见 [design/units/artifact-viewers.md](design/units/artifact-viewers.md)——docx/xlsx/pptx 由 microsoft-office 扩展查看器（BetterOffice wasm 引擎）承载，PDF 实态与 CJK 回退观感归 G29②⑥ 判定，远程工件设备侧下载为候选 M-022+ 待用户决策）；**交互质量收口（窗口形态/返回键/键盘/viewport/响应式/读屏/触摸目标/偏好恢复实态落字与 Desktop actions 平台映射清单）已实现（未验证，issue #20，见 [design/interaction-quality.md](design/interaction-quality.md)——G31 walkthrough BLOCKED，机制零缺口、产品缺口（back 键集成/命令面板移动入口/触摸目标强化）登记 M-022+ 候选池待用户决策）**；**配对链接导入（桌面 pairing 接收端：扫描/导入/恢复的导入半边）已实现（未验证，issue #22，见 [design/units/connection.md](design/units/connection.md)——粘贴导入机制固化（上游闭包承载），G32 BLOCKED；LAN 明文配对与相机扫描按不支持流如实登记（验收 4「document unsupported flows without silently claiming parity」），扫描使能与外部拉起候选 M-022+ 待用户决策）**；**通知面（任务完成/权限/错误通知的远程知晓半边）已实现（未验证，issue #23，见 [design/units/notifications.md](design/units/notifications.md)——三开关三声音设置面（上游闭包）+ permission 死开关经 M-023 壳内补全 + Android 通知权限显态请求面（M-024，用户在场）；tap 路由到正确 host/会话（应用内导航零 deep-link）；**可靠投递边界按确认项 7 落字：进程死亡零通知/后台尽力而为/零保活零推送，通知存在≠任务定会完成**；通知不得批准权限或停止任务；G33 BLOCKED，默认音 dist 可播性缺口候选 M-025+ 待用户决策）**；**命令与菜单面收口（Desktop 七菜单映射与 window.* 单窗口裁定/命令注册面全景与 no-dangling 五层链/编辑缩放导航三族实态与 Windows-only host 命令排除）已实现（未验证，issue #24，见 [design/commands-menus.md](design/commands-menus.md)——G34 BLOCKED，Windows 运行期菜单证据归 issue #1；zoom 触屏实态判定与全选/撤销重做触屏等价、reload 移动入口三项新登记候选 M-025+ 待用户决策）**；**GUI 扩展管理面（设置 Extensions(GUI) tab 的移动启用/禁用、状态/失败呈现、Reload 重试与状态恢复管理面；13 内建扩展清单与宿主能力映射收口）已实现（未验证，issue #26，见 [design/units/gui-extensions.md](design/units/gui-extensions.md)——移动零安装/零移除/零 marketplace，desktop-host 四扩展呈现「桌面专属」；扩展业务行为归属各 feature issue，禁用后果=对应单元面的隐藏；G35 真机门禁 BLOCKED）**。既有 M-022+/M-025+ 候选池共 12 项自 **M-027** 起统一分配去重（M-025/M-026 为 issue #26 实施占用，先到先实编） |
| 服务位置 | 不在手机本地运行 OpenCode 服务或项目工具链 |
| 远程操作系统 | 远程主机为原生 Windows 时同等支持；不管理或不运行 Windows 宿主上的 WSL 发行版 |
| 凭据 | 用户可在设备本地安全保存私钥和服务凭据 |
| 恢复 | 网络切换或返回前台后恢复连接，并从服务端同步状态（恢复机制已实现（未验证，issue #19，见 [design/recovery.md](design/recovery.md)）；真机恢复链归 G30，BLOCKED） |
| 远程任务 | 断开客户端连接不主动停止远程服务和任务 |

SSH 隧道的设备回环监听端口只是网络转发入口，不是本地 OpenCode 服务。

WSL 排除与原生 Windows 保留是已确认的范围决策，见[决策记录 0001](decisions/0001-wsl-exclusion.md)；该排除不等同于排除 Windows 远程支持。

## 建议架构，待技术验证

```text
共享移动端界面与业务逻辑
  ├─ 服务地址直连 ────────────────→ 远程 OpenCode HTTP API
  └─ 平台 SSH 适配 → 加密隧道 ──→ 远程 OpenCode HTTP API

平台适配层
  ├─ Android：SSH、凭据保护、文件选择、生命周期
  └─ 其他移动平台：后续适配，当前不实现
```

可评估 Capacitor/WebView 加原生 SSH 桥接，但尚未锁定框架、SSH 库和最低系统版本。共享代码不应直接依赖 Android API。

## 开发前待确认与验证

1. **上游复用**：选择前端源码和客户端契约的引入方式、版本固定与更新策略；复用代码时保留许可证及版权声明。
2. **SSH 兼容范围**：确认密码认证、私钥格式、加密私钥、交互认证、配置别名和跳板机需求，不默认等价于系统 OpenSSH 的全部功能。
3. **远程引导**：远程服务发现、安装、启动和版本不兼容处理已实现（未验证，issue #7，见[决策记录 0004](decisions/0004-service-operations.md)）：替换现有远程服务需显式危险确认且 exec 侧预检拒绝覆盖运行中服务，绝不静默；三 OS 真 OS E2E BLOCKED。
4. **传输**：验证 HTTP、事件流和远程终端经过 SSH 转发及 Android WebView 的端到端行为。
5. **安全存储**：确定 Keystore 保护方案、备份和卸载行为、私钥导入方式，以及生物识别解锁与后台重连的取舍。
6. **直连安全**（issue #5 已裁定，见[决策记录 0002](decisions/0002-direct-connection-transport.md)，设备级验证待实测）：TLS 信任流程=system CA 唯一锚，链/过期/主机名严格校验，不关闭全局校验、绝不 trust-all；自签/私有 CA HTTPS 直连本期不支持（反馈正规 CA、SSH 隧道与 per-connection pin 候选三条出路）；局域网明文 HTTP 本期不支持，逐连接知情授权为前瞻方案、留用户决策；重定向跨主机/降级 fail-closed；凭据不进 URL（WS 单次票据为能力凭证，非凭据）。
7. **生命周期**：明确前台恢复与持续后台连接的不同承诺；不默认承诺进程被杀后仍保活或收到通知。
8. **移动体验**：确定窄屏布局、返回键、软键盘、触摸与无障碍，以及页面、草稿和滚动位置的恢复口径。
9. **交付**：确定包名、最低 Android 版本、APK 签名与发布方式；签名密钥不得提交仓库。

## 后续验收方向

实施前应将以下方向细化为可执行测试与真机冒烟清单。目前均未验证。

- 两种连接方式均能进入真实远程会话并完成任务交互。
- SSH 主机指纹变化、认证失败、直连证书错误有明确反馈和恢复路径。
- 文件、Diff、权限确认与远程终端通过同一服务连接正常工作。
- 切后台、网络中断和切换网络后，可恢复连接而不丢失服务端任务状态。
- 凭据不以明文写入普通前端存储、日志、备份或构建产物。
- 断开连接或退出 APK 不主动关闭远程 OpenCode 服务。

## 本次初始化核对

| 条目 | 交付位置 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| 产品边界 | README 与本文 | 核对用户确认的双连接、远程执行、Android 优先范围 | 已记录；功能未实现 |
| 实现状态 | README、本文与 `docs/build-and-verify.md` | 明确壳代码已实现（未编译验证）、无 APK，不将 vendored 能力写成已交付 | 已记录 |
| 凭据纪律 | README、AGENTS 与 .gitignore | 初始化文档人工核对、常见凭据标记扫描和 `git check-ignore` 检查；M-002 memory-only 静态验证；issue #4 明文持久化审计（`scripts/audit-secret-persistence.ts`）与 vault 探针（`scripts/verify-credential-vault.ts`） | 已检查；真机核验（G9/G11、C1–C4）未执行 |
