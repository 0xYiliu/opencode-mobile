# 交互基线与设备门禁

本文承载跨单元交互约束、G1–G22 与 C1–C5 设备门禁完整枚举、失败路径处置协议与凭据 notice（修订：可选记住）。事实状态图例见 [README.md](README.md)。

## 交互基线

- 交互全部由上游 app（vendored 静态构建）承载，本轮壳层不新增自有交互控件；上游交互的可用性本身是门禁核验对象，不预声称。
- 壳层自有交互仅四项（均已实现、未验证，见 [units/shell-startup.md](units/shell-startup.md)）：返回键（`canGoBack` → goBack，否则结束 Activity）、SSL 错误处理（恒 CANCEL）、控制台日志（固定 tag，不含 URL 参数/请求头/凭据）、生命周期停止范围（仅本地回环 asset server）。
- 软键盘与视口：沿用上游 `viewport`（`interactive-widget=resizes-content`、`viewport-fit=cover`），见 [visual.md](visual.md)。
- 深链：不实现（未注册 VIEW intent-filter，代码留 TODO）。
- 返回手势：壳按 `onBackPressed` 实现，manifest 显式声明 `android:enableOnBackInvokedCallback="false"`——Android 16 起 targetSdk ≥ 36 的应用默认启用 predictive back，`onBackPressed` 将不再被调用，必须显式禁用才能维持该行为；迁移平台 `OnBackInvokedCallback` 需 minSdk 守卫（API 33+），为后续 issue 事项。与计划中 onBackPressedDispatcher 表述的差异已记录（见 [docs/build-and-verify.md](../build-and-verify.md) 偏差表）。

## G1–G22 设备门禁（完整枚举）

每项列出验证目标、所需环境、当前状态。本轮全部 **BLOCKED：未执行**（无 Android SDK、无真机/模拟器、无授权远程服务；清单来源为 issue #2 验收项、计划 §5.2、issue #3 新增交互、issue #5 的 G16、issue #6 新设的 G17、issue #7 新设的 G18、issue #8 新设的 G19、issue #9 新设的 G20、issue #10 新设的 G21 与 issue #11 新设的 G22）。

| 门禁 | 验证目标 | 所需环境 | 状态 |
| --- | --- | --- | --- |
| G1 assets 加载 | 打包资产经回环 asset server 完整加载：首帧、懒加载分块（dist 内 1568 个 js 分块）、字体/图标/媒体（ttf/woff/woff2/aac/png/svg） | 真机或模拟器（Android 10+，记录 WebView 版本） | BLOCKED |
| G2 loopback origin 行为 | `http://127.0.0.1:18090` 作为 origin 的 secure context 判定、localStorage 可用、未知路径回落 index.html（SPA 路由回退） | 真机或模拟器 | BLOCKED |
| G3 actual CORS | 对远程服务的真实预检（OPTIONS）与带 `Authorization` 头的跨源请求。**静态证据注记（issue #5，决策 0002）**：上游原生服务 `packages/server/src/cors.ts`（来源=上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `cec70f3`/`b4525d79bf`，vendored 闭包不含 packages/server）默认放行任意 `http://127.0.0.1:*`/`http://localhost:*` origin——本壳 origin 恰为 `http://127.0.0.1:18090`，原生上游服务对本壳 API/SSE/WS（铸票与升级）/上传跨源调用（含预检）**默认允许**；风险由「高风险无证据」修正为「低风险待实测」。任一兜底预案（B 本地反代/C 平台适配层）启用仍需用户决策 | 真机/模拟器 + 授权远程服务 | BLOCKED（低风险待实测） |
| G4 TLS/证书拒绝 | 自签名/过期/主机名不符证书被拒绝并有反馈路径；`onReceivedSslError` 恒 CANCEL 的真机复核；**issue #5 细化**：WebView（Chromium）与平台 probe 对同地址的证书判定一致（同受 netsec system-CA 约束），坏证书在保存路径呈现 `dialog.server.error.cert-*` 分类文案（probe 分类）+ 三条出路（正规 CA/SSH 隧道/后续 per-connection pin 候选） | 真机/模拟器 + 证书可控的远程服务 | BLOCKED |
| G5 cleartext 拒绝 | 对非回环地址的 `http://` 请求被 network_security_config 阻断且失败可见（回环口除外）；**issue #5 细化**：明文直连裁定本期不支持（决策 0002 D3），保存路径呈现 `dialog.server.error.cleartext-blocked` 分类文案（probe 分类，引导 HTTPS/SSH 隧道）；裸地址默认补 `http://` 的上游行为保留，由分类文案承接 | 真机/模拟器 + 局域网 HTTP 服务 | BLOCKED |
| G6 fetch ReadableStream/SSE 增量 | 事件流经 fetch 流式读取在 WebView 内增量到达（会话事件实时性） | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G7 WebSocket 二进制 PTY | 终端 PTY 经 WebSocket 二进制双向传输（含 resize 消息）；上游实现位于 vendored `packages/client/src/solid/pty.ts` | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G8 WASM/Office 加载 | dist 内 4 个 `.wasm` 资产（ghostty-web 相关）及其他重型资源在 WebView 内可加载执行 | 真机/模拟器 | BLOCKED |
| G9 生命周期 + 凭据负例 | 切后台/杀进程/旋转的生命周期行为；负例：localStorage 中检索不到 password（M-002 落地）、memory-only 符合下方 notice | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G10 PWA SW 行为 | 打包构建生成的 service worker（`sw.js`）在回环 origin 的注册、缓存与更新行为 | 真机/模拟器 | BLOCKED |
| G11 负例矩阵 | 认证失败、不兼容 server（上游含 incompatible-server-panel UI）、证书错误、断网/切网——均有反馈且可恢复，不静默；**issue #5 细化**：保存路径错误分类×反馈×恢复矩阵（401/403/坏证书/明文/超时/DNS/拒连/HTML 代理页/服务缺失/地址格式/重定向拒绝，见 [units/connection.md](units/connection.md) 错误矩阵）经 probe 分类呈现 `dialog.server.error.<code>`，probe 不可用显式退化为上游泛化文案；上游健康检查仍为保存放行的权威，probe 仅选文案 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G12 生命周期恢复口径 + 断开不杀远程 | 恢复口径与壳层「不停止远程」红线在真机一致：客户端断开/退出后远程任务存活 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G13 多 host 一窗 + 隔离（issue #3） | 多个 SSH/直连服务同窗并列：列表呈现、切换、scope 隔离（同名项目/会话不混淆）；设置 servers 标签页 host-manager 可用 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G14 连接状态呈现与恢复（issue #3） | connecting/host-key 确认/认证失败/incompatible/offline/reconnecting/connected 的用户可见呈现与可操作恢复（重试/重认证/编辑）；SSH incompatible 由状态机判定 | 真机/模拟器 + 授权远程服务（host-key 真实流另归 #6） | BLOCKED |
| G15 SSH 身份稳定（issue #3） | SSH 隧道端口变化后身份/scope/会话/设置不变（`mobile-ssh:<uuid>` 与端点解耦）；重启后主机记录恢复且无凭据形字段 | 真机/模拟器 + SSH 远程主机 | BLOCKED（依赖 #6 隧道） |
| G16 probe 桥 bring-up（issue #5） | `onPageFinished` probe 握手（独立握手串 `opencode-mobile-probe-handshake`）→ JS 形状校验捕获 port → 回发 ack → probe 端口翻转 available；与 vault 握手并存互不误捕（双方 data 严格等值校验）；重试路径 5×500ms 通道重建；重试耗尽 probe 显式 `unavailable`（保存路径显式退化为上游泛化错误文案，不伪造分类）；probe 请求头/URL/桥消息零日志值、密码不持久化的真机负例核对 | 真机/模拟器（API 23+） | BLOCKED |
| G17 三桥并存 bring-up（issue #6 **新设门禁**） | `onPageFinished` **三座桥同时**开握手轮（vault/probe/ssh 各自独立握手串）→ ack 时序真机核对（各自捕获各自 port、互不误捕、互不重置对方 ack 生命周期）；ssh 桥 cancel/disconnect 响应（拆除即时、不依赖 executor 队列排空）；**C1–C5（vault）与 G14–G16 不因第三桥扰动**的复测（bring-up 后 vault 读写、probe 分类、状态机交互行为与基线一致） | 真机/模拟器（API 23+） | BLOCKED |
| G18 四桥并存 bring-up + 服务操作交互（issue #7 **新设门禁**） | `onPageFinished` **四座桥同时**开握手轮（vault/probe/svcops/ssh 各自独立握手串）→ ack 时序真机核对（各自捕获各自 port、互不误捕、互不重置对方 ack 生命周期）；**C1–C5（vault）与 G14–G17 不因第四桥扰动**的复测；svcops 面板真机交互：发现状态卡/预览=执行全文/危险确认/执行进度/回滚入口/cancel-uncertain 呈现、occupied-port 与 permission-denied 真实路径、`survivedDisconnect` 断开存活真机触发核对（B1 触发集：迁入 ready 且前态∈{offline,reconnecting,authRequired}；T5 不触发）、svcops 面板零日志值负例、Windows `start /b` detach 存活如实呈现（detach-uncertain）；三 OS 真实 exec/安装/回滚与「远端 bash=WSL 诱饵」负例（N2）另归真 OS E2E | 真机/模拟器（API 23+）+ 授权 SSH 主机与授权远端 OS | BLOCKED |
| G19 projects-sessions 运行期门禁（issue #8 **新设门禁**） | 单窗口切换状态保持（tabs/草稿/滚动/导航栈跨切换与重启）；同名项目隔离（不同主机/不同目录同名不混淆、无数据泄漏）；空项目空态与新建门控；删除路径（确认对话框/失败 toast/行保留）；stale session ID（错误边界/notFound toast/关 tab 恢复）；并发更新（切网恢复后不覆盖本地脏值）；**归档反馈（M-017）**：归档后行消失、关联 tab 关闭、失败 toast 行保留、服务端 `time.archived` 列表过滤；**M-018 入口在 multiple() 布局下可达且不弹回 general**（守卫修订的运行时行为）；不可达/已删除路径的 `SessionLocationMissing` 恢复流与 `home.project.missing` 反馈（含 `addProjects` 静默疑点核对，缺陷成立追加 M-019）；**SSH/直连双路由各完整一遍**（选项目→建会话→fork→重命名→归档→切换→错误恢复 lifecycle E2E）。**V2/探针/构建三层对以上运行时行为均无证明力，全部归本门禁** | 真机/模拟器 + 授权远程服务（直连与 SSH 各一） | BLOCKED |
| G20 session-workbench 运行期门禁（issue #9 **新设门禁**） | 会话工作台全部运行期行为，与 G12 互补分工（G12=壳生命周期，G20=工作台行为）：**①流式增量呈现**（text/tool/reasoning delta 到达节奏与 Working shimmer，叠加 G6 传输前提）；**②长历史翻页**（`loadOlderTimeline` + cursor 分页，初始页 20/compact 40）；**③发送/停止**（仅显式用户取消可达；queued inputs 呈现与撤销）；**④断开→重连快照恢复**（含 queued inputs 刷新；offline 呈现充分性核对为**本门禁首项**——上游会话内无独立 offline 横幅，断连经由连接行/失败反馈呈现，若判定不足按失败路径四步协议交用户决策，不预设补丁）；**⑤断开不中断远端（红线机械核对四步）**：授权服务上发起真实长任务（直连与 SSH 各一遍）→ 客户端依次制造断连三态（锁屏/切后台至超时、飞行模式/断网、杀 App；SSH 路由另含隧道拆除）→ **远端侧核对任务继续执行至完成** → 恢复连接后核对时间线经服务端快照补齐缺口期消息/状态，并核对期间本地日志零 interrupt/stop 类请求命中；**⑥草稿/滚动/上下文跨切换恢复**（工作台内视角，与 G19 的 tabs 层互补）；**⑦失败反馈**（消息 retry/error、tool error 卡、执行失败三层可见且可恢复）；**⑧窄屏/读屏/焦点/触摸目标核验**（`isDesktop()` 单列布局、767px 提交 blur、reduced-motion 降级的运行期核对——README 无障碍行「后续 issue 可增补」的兑现位）。**真模型交互子项（增量呈现的真实内容）另需模型授权，单独分列**：真实模型收发的完整工作台交互（直连+SSH 双路由各一遍）。**V2/探针/上游单测三层对以上运行时行为均无证明力，全部归本门禁** | 真机/模拟器 + 授权远程服务；真模型交互子项另需模型授权 | BLOCKED |
| G21 permission-requests 运行期门禁（issue #10 **新设门禁**） | 权限请求与 Agent 提问全部运行期行为，与 G12（壳生命周期）/G20（工作台行为）互补分工：**①请求呈现**（dock 标题/操作说明/resources 逐行、composer 阻断隐藏（primary 视图；subagent 子会话视图 dock 与 composer 并存）、Working shimmer 抑制、会话树子代理请求呈现、项目头像注意态）；**②三决策**（once 继续/always 落 saved 规则+后续免批/reject 终止+批量扩散；in-flight disabled 误触核对——快速双击/连点仅一次 reply）；**③提问向导**（单/多问题、自定义回答、Esc reject、提交后 dock 消失、切 tab 草稿恢复）；**④duplicate/stale/expired 三态**（他端先答→本端 dock 消失；服务重启 pending 清空→重连 sync 后消失；对已消失请求操作的呈现——permission 决策侧失败 toast 呈现充分性核对）；**⑤断连→重连 dock 恢复**（快照补齐）；**⑥client exit 红线机械核对四步**（请求 pending 时杀 App → 远端任务保持等待不 approve 不 reject 不 stop → 重开 App dock 仍在；直连与 SSH 各一遍）；**⑦auto-approve opt-in**（命令开启→代答+toast、关闭→恢复手动）；**⑧窄屏/读屏/焦点/触摸目标首项核对**（28/32px 按钮可达性 vs 48dp 推荐、Deny 与 Allow 相邻 8px 误触风险、焦点顺序/焦点陷阱——不足则按失败路径四步协议交用户决策，候选含 M-020+，不预设）；**⑨通知/声音设置**（`notifications.permissions` 开关）呈现。真模型交互子项（真实 permission.asked 的产生依赖真实模型工具调用）另需模型授权，单独分列。**V2/探针/上游单测三层对以上运行时行为均无证明力，全部归本门禁** | 真机/模拟器 + 授权远程服务（真模型交互子项另需模型授权；④的并发核对子项另需第二客户端）；SSH/直连双路由 | BLOCKED |
| G22 remote-files 运行期门禁（issue #11 **新设门禁**） | 远程文件面全部运行期行为，与 G12（壳生命周期）/G20（工作台）/G21（请求）互补分工：**①移动 Files 视图可达**（More 抽屉 menu kind、`tree.all` 浏览与打开文件 tab 切换）；**②树浏览**（展开/折叠/懒加载/空目录/错误 toast）；**③搜索**（过滤→结果/空态/loading；**搜索失败吞为空的呈现充分性核对为本门禁首项**——上游把搜索失败吞为空结果）；**④查看四态**（text/binary/媒体/notFound/error；大文件占位与大文本手感首项核对——文本无客户端大小上限）；**⑤stale**（远端变更后打开文件重读、断连恢复后内容补齐）；**⑥上下文引用**（@-引用插入、行选择→附言/评论芯片、发送后消息呈现；真模型可读性子项另需模型授权分列）；**⑦恢复**（切 tab/杀重启后文件 tab+活动 tab+行选择+滚动 per workspace 恢复；跨 workspace 不串）；**⑧client exit 红线机械核对**（查看文件时杀 App→远端零影响（文件面只读）→重开 tab/选择恢复；直连+SSH 各一遍）；**⑨窄屏/读屏/焦点/触摸目标首项核对**（28px 树行 vs 48dp 推荐、tab 条高度与关闭按钮、树角色语义缺席、Esc 清过滤的触屏等价——不足按失败路径四步协议交用户决策，候选含 M-020+，不预设）；**⑩SSH/直连双路由**（含 `fs.list` 父/兄弟目录行为的服务端真机核对——属服务端语义，引缓存非闭包）。**V2/探针/上游单测三层对以上运行时行为均无证明力，全部归本门禁** | 真机/模拟器 + 授权远程服务（真模型可读性子项另需模型授权）；SSH/直连双路由 | BLOCKED |

## C1–C5 凭据桥设备门禁（issue #4，全部 BLOCKED）

| 门禁 | 验证目标 | 所需环境 | 状态 |
| --- | --- | --- | --- |
| C1 桥握手 bring-up | `onPageFinished` 握手 → JS 捕获 port（形状校验）→ 回发 ack → vault status 翻转 available；重试路径：无 ack 时通道重建（旧 port1 close）5×500ms 后 unavailable 呈现（横幅+勾选禁用）；ack 生命周期随导航重置（重新加载页面重新握手）；**postWebMessage 抛出的失败信号同样进入有界重试**（评审修复：调度不得吞没本轮重试）；**C5a 顺序钉死：错误 origin 的握手探针必须在页面首次成功捕获之前执行**（新加载页面先投递错误 targetOrigin 握手 → 断言无捕获 → 再投递正确 origin → 可达）。**固有竞态窗口（评审 N5）**：ack 恰在重试耗尽边界在途时，本轮会以 unavailable 收场直至下次导航重握手——窗口有界（≤一个重试周期）、可见（unavailable 为显式状态+横幅）、无降级（无明文回退，重载即恢复） | 真机/模拟器（API 23+） | BLOCKED |
| C2 凭据读写端到端 | 勾选记住 → put → 重启 → M-010 hydration 免重输（密码仅内存）；不勾选/取消勾选 → ref 清理 + vault.remove；私钥导入：input file → `onShowFileChooser` → `ACTION_OPEN_DOCUMENT` → 读文本 → put(kind=privateKey) → 元数据出现在凭据管理器；**ValueCallback 全路径恰一次回调**（取消/异常 → `onReceiveValue(null)`，可再次打开 chooser）；凭据管理器删除/孤儿区清理；corrupt 恢复（重输 in-place，ref 稳定） | 真机/模拟器 + 授权远程服务 | BLOCKED |
| C3 64KiB 边界 | 恰 65536 字节凭据经桥传输成功落盘；超限在 JS 预检拒绝（native 复检为纵深，真机核对超限请求不产生文件）；错误提示可见 | 真机/模拟器 | BLOCKED |
| C4 备份排除负例 | `allowBackup=false` 主控制 + `data_extraction_rules`/`full_backup_content` 引用生效：`adb backup`/设备迁移不带走 `filesDir/vault/`；重装后 vault 空（无悬挂引用） | 真机/模拟器（adb） | BLOCKED |
| C5 桥安全探针 | **C5a** targetOrigin 强制（错误 origin 握手不可达/正确 origin 可达；顺序见 C1；**禁止伪造 event.origin 断言**——平台证据链见 [architecture.md](architecture.md)，event.origin 恒空串）；**C5b** port confinement（window 无全局 port 引用；单测锁定）；**C5c** 握手 data/ports 形状校验（单测锁定，仅形状不涉 origin）；**C5d** ack 前 vault 恒 unavailable、无明文回退（单测+真机） | 真机/模拟器（C5a/C5d 真机面）+ 本机单测（C5b/C5c） | BLOCKED（单测部分已 PASS，见 build-and-verify） |

补充 BLOCKED 项（非 G/C 组）：APK 构建（需 Android SDK，`cd android && ./gradlew :app:assembleDebug`）；live 直连 E2E（需授权服务与模型，不允许 fixture 替代）；SSH E2E（归 issue #6：auth 成败端到端、未知/已知/变更三态真机、目标拒绝、服务不可达与 incompatible 真服务、重连、**隧道/App 关闭后远程任务存活**）；host-key 真实校验流（归 issue #6）；SSH 端口变化真机验证（归 #6 配合 G15）；G17 三桥并存 bring-up（归 issue #6，见上表）；服务操作真 OS E2E 与 G18 四桥 bring-up（归 issue #7，见上表：三 OS exec 发现、install/start/upgrade/replace 全链路、occupied-port/permission-denied 真实路径、真实文件系统回滚、bash=WSL 诱饵负例、断开存活真机核对）；**G19 projects-sessions 运行期门禁与双路由 lifecycle E2E、`test-browser/session-resolution.test.ts`（需浏览器环境）与三 OS 真 OS E2E（归 issue #7 环境组）、Windows Desktop 行为映射（归 issue #1）**（issue #8，见上表 G19 行）。**验收⑤条件句（F4，第三处落字）**：G17+SSH E2E 通过前，issue #6 的全部交付只声称「静态边界已实现（未验证）」；**第四处落字（issue #7）**：G18+三 OS 真 OS E2E 通过前，issue #7 的全部交付只声称「静态边界已实现（未验证）」（[决策 0004 §8](../decisions/0004-service-operations.md)）——库/平台边界（共享层零平台 API、stub fail-closed 保留、库在 Kotlin 桥内）的最终断言依赖 G17 与 SSH E2E；门禁未过时该声称不成立；**第五处落字（issue #8）**：G19 与双路由 lifecycle E2E 通过前，issue #8 的全部交付只声称「已实现（未验证）」；**G20 session-workbench 运行期门禁、真模型 live E2E（直连+SSH 双路由真实会话收发，需授权远程服务与模型，不允许 fixture 替代）与 session-ui component-tests/playwright（需浏览器环境）归 issue #9**（见上表 G20 行）；**第六处落字（issue #9）**：G20 与真模型 live E2E 通过前，issue #9 的全部交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」；**G21 permission-requests 运行期门禁、真模型 live E2E（真实 permission.asked 依赖真实模型工具调用）与多客户端并发决策核对子项（需第二客户端）归 issue #10**（见上表 G21 行）；**第七处落字（issue #10）**：G21 与真模型 live E2E 通过前，issue #10 的全部交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」；**G22 remote-files 运行期门禁、真模型 live E2E（@-引用/行范围上下文在真实模型会话中的可读性与效果，直连+SSH 双路由，不允许 fixture 替代）与 `fs.list` 父/兄弟目录行为的服务端真机核对（属服务端语义，引缓存非闭包）归 issue #11**（见上表 G22 行）；**第八处落字（issue #11）**：G22 与真模型 live E2E 通过前，issue #11 的全部交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。

## 失败路径处置协议

任一门禁运行失败时，按以下顺序处置，不得跳步：

1. **复现失败报告**：可复现步骤、设备/API/WebView 版本、脱敏日志（不含凭据、不含 URL 查询参数）。
2. **影响范围**：明确失败影响哪些单元与验收项，哪些不受影响。
3. **备选方案**：列出可行替代（如 G3 的预案 A/B/C），含各自代价与安全影响；备选不得默认「原生重写」或「关闭浏览器/传输安全」。
4. **用户决策**：由用户选定处置后再继续产品化工作；未获决策前该路径停在那里并如实标注。

### projects-sessions 变更失败路径（issue #8）

会话/项目侧变更（create/open/fork/rename/archive/delete/移动/切换）的失败反馈**全部复用上游既有通道**，不新造错误分类：失败 toast + 行内反馈、remove/archive 前后置确认与恢复（remove 确认对话框；archive 失败不 remove，行保留）、finally invalidate 保证列表与服务端一致、stale ID 走 resolution failed 错误边界、路径缺失走 `SessionLocationMissing` 恢复流（详见 [units/projects-sessions.md](units/projects-sessions.md) 状态矩阵）。这些通道的**运行期可达性本身**归 G19；真机核对中出现的新失败形态按上述四步协议处置，不预设第三补丁（`addProjects` 静默失败疑点已预留 M-019 追加位，确认缺陷后另议）。

### session-workbench 失败路径（issue #9）

会话工作台内的失败反馈（消息 retry/error、工具失败、执行失败、断连期间的陈旧数据与动作失败、重连自愈）**全部复用上游既有通道**（toast/错误边界/行内错误卡/重连快照恢复），不新增第一方错误分类；详见 [units/session-workbench.md](units/session-workbench.md) 状态矩阵与取消/断开安全语义专节。这些通道的**运行期可达性本身**归 G20（offline 呈现充分性核对为 G20 首项：上游会话内无独立 offline 横幅，若判定不足按上述四步协议交用户决策，候选含上游呈现强化 vs 新增 M-020+，不预设）；真模型交互子项另需模型授权。

### permission-requests 失败路径（issue #10）

权限请求与 Agent 提问的失败反馈**全部复用上游既有通道**，不新增第一方错误分类：决策/应答网络失败 → 行内错误 toast `common.requestFailed`（请求保留待重试）；stale/expired → form 侧 `settleForm` 吞错自愈（NotFound/AlreadySettled + resync）、permission 决策侧无吞错（失败 toast + `permission.replied` 广播移除）；恢复 → 断连后四处快照触发补齐（含后台 tab 错峰同步）。详见 [units/permission-requests.md](units/permission-requests.md) 状态矩阵与安全语义专节。这些通道的**运行期可达性本身**归 G21（④ 核对失败 toast 呈现充分性、⑧ 核对触摸目标/焦点缺口是否构成真机不可用——不足则按上述四步协议交用户决策，候选含 M-020+，不预设）；真模型交互子项另需模型授权。

### remote-files 失败路径（issue #11）

远程文件面的失败反馈**全部复用上游既有通道**，不新增第一方错误分类：目录列表失败 → `dir.error` 三态 + `toast.file.listFailed` toast；文件加载失败 → 查看器行内错误 + `toast.file.loadFailed` toast；文件缺失 → `isFileNotFoundError` 归一 notFound 态（`tab.notFound` 文案，已打开文件静默不弹 toast）；**搜索失败被上游吞为空结果**（`model.tsx` search 非 abort `.catch → []`）——该呈现的充分性核对为 G22③ 首项；断连期搜索不发起（`enabled: connected && ...`）、动作失败走既有 toast，重连后 `filesystem.changed` watcher 与快照语义补齐。详见 [units/files.md](units/files.md) 状态矩阵与陈旧专节。这些通道的**运行期可达性本身**归 G22（③ 搜索吞错呈现、④ 大文本手感、⑨ 触摸目标/读屏缺口是否构成真机不可用——不足则按上述四步协议交用户决策，候选含 M-020+，不预设）；真模型可读性子项另需模型授权。

## 凭据 notice（修订：可选记住，issue #4）

凭据基线为 memory-only（M-002）；issue #4 起提供**可选**的安全记住（vault 加密落盘），用户须知晓并接受以下行为：

- **不勾选「记住」时，刷新或重启 App 后需重新输入服务密码**：密码只存在于内存，不写入任何持久化后端（localStorage、桌面存储、草稿存储均收不到）。
- **勾选「记住」时**（vault available，issue #4）：密码经 Android Keystore 加密落盘（信封 v1，无明文形态），重启后由 M-010 hydration 自动恢复到内存；勾选框仅在 vault available 时可用，unavailable 时禁用+说明（显式状态，无明文回退）。
- **配对重连需重新认证**：连接中断后重连不能复用已落盘的凭据（memory-only 语义未被 vault 改变）。
- **credentialRef 不是凭据（issue #3 扩展）**：主机记录与连接记录中的 `credentialRef` 是指向凭据条目的非机密引用标识符，随记录持久化；它**不携带任何凭据值**。引用的目标现在真实存在（vault 条目），解析经 vault-backed resolver 仅入内存。
- **失效与恢复**（issue #4）：vault unavailable（握手未 ack/非 Android）→ 记住功能禁用+横幅；条目 corrupt/unsupported → 该条目按失效矩阵标红，重输后重存（in-place，ref 稳定）或删除；TEE 重置等 Keystore 失效 → 横幅+重输或一键清除。恢复=丢失+重输，合法且显式；无额外解锁（不设生物识别/锁屏门，设计免除：设备锁定时 App 本不可用）。
- 上游界面不自带 memory-only 提示；「记住」勾选框的禁用说明（M-009 i18n）与凭据管理器横幅（mobile-hosts i18n）是 App 内提示口径，本 notice 为文档口径。

该 notice 的真机核验（localStorage 负例、重启后行为、vault 落盘形态）归 G9/G11 与 C1–C4。

## 主机管理交互（已实现（未验证）：issue #3；设备核验 BLOCKED，归 G13–G15）

- **host-manager（设置 → servers 标签页）**：SSH 主机列表（名称/target/状态徽标），行内动作：编辑（→ host-dialog）、删除、连接/重连；空态引导新增。删除为本地操作——**零远程调用**，远程服务/任务不受影响（红线，测试断言）；删除活跃主机不弹「停止远程」类操作。
- **host-dialog（SSH 主机新增/编辑）**：字段 name（唯一校验，重名行内报错不写入）、target（格式校验 `[user@]host[:port]`）；凭据绑定块（issue #4 重构，见上）；保存前校验失败保留表单；**保存/健康检查失败保留原配置**（不写入注册表）。取消/关闭不产生任何变更。
- **取消切换语义**：连接发起后取消（connect 过程、host-key 确认、重连过程）恢复进入前的来源态（idle 或 offline），无残留副作用（状态机 T13，测试锁定）。
- **host-key-prompt（stub）**：状态机进入 hostKeyUnverified 时展示指纹确认；当前 stub 恒拒绝——确认 UI 组件已立桩但**挂载点未建**（无任何界面渲染它），在本构建不可达（真实校验与挂载归 #6，BLOCKED）；**不存在"跳过校验"选项**。
- **host-key 三态交互与变更恢复（issue #6，已实现（未验证））**：①**未知**（首次连接）——HostKeyPrompt 行内挂载于 host-manager，展示 `SHA256:…` 指纹，仅「信任并连接」/「拒绝」两动作（确认先于任何认证材料发出）；②**已知**——store 命中即 trust，无弹窗；③**变更**——硬失败 `host-key-changed`，**永不自动覆盖**；恢复入口=行内危险按钮（红色警示，明示主机密钥已变化、可能中间人），一次显式危险确认后 `removeHostKey` → 下次连接回未知确认流。三态 UI 与挂载随 #6 实现交付，真机核验归 G14/G17。
- **服务端口（issue #6，已实现（未验证））**：host-dialog 增 servicePort 输入位（默认 4096）并与 target 内 SSH 端口双标签去混淆（「SSH 端口」vs「服务端口（远端 OpenCode 服务）」，见 [units/server-list.md](units/server-list.md)）。
- **凭据绑定与凭据管理器（已实现（未验证）：issue #4）**：
  - host-dialog 凭据绑定块取代 #3 的自由文本 ref 输入：表单不再存在任何凭据值/引用标识输入位；SSH 主机行内显示已绑定指示，凭据管理器入口在 host-manager 头部。
  - 直连服务的「记住」勾选随上游连接对话框（M-009，真值表见 [units/connection.md](units/connection.md)）；**healthPreview 附注**：连接前健康预览（输入过程中的探测）不解析凭据引用、不读 vault——预览只验证地址可达性，权威的凭据检查发生在保存时。
  - 凭据管理器：仅元数据（kind/label/时间，无值）；unavailable 横幅、corrupt/recovery-needed 标红与恢复动作（重输/一键清除）；孤儿区（无宿主引用的条目）列出对账并可删除。
  - **link 流 stale-ref 附注（issue #4 评审）**：link/redeem 重配对产生的新连接会带原条目的 credentialRef 透传（M-006/M-009 prior 语义）；若该 ref 已成孤儿（条目已删/换绑），M-010 hydration 解析不到值 → unauthorized → 用户重输自愈（重输后重存 in-place，ref 稳定）；孤儿条目本身由凭据管理器孤儿区兜底呈现。重配对后旧 ref 注入失败不静默、不阻断，恢复路径始终可达。
- **已知入口缺口（M-008）——已由 M-018 承接（未验证）**：上游多 server 布局下，设置导航以 per-server 条目取代 "servers" 标签页，host-manager 在该布局不可达（单 server/空列表布局可达，且空列表时可创建首个 SSH 主机）。issue #8 的 M-018 以「入口 + 守卫修订」承接：`multiple()` 导航组加固定「SSH hosts」入口，重定向守卫 `includes` 列表移除 `"servers"`（守卫修订是入口可达性的前提）。运行期可达性（入口可达且不弹回 general）归 G19；M-018 同时是 [server-list.md](units/server-list.md) 预登记债务的承接，非 issue #8 验收项本身。
- **断开语义**：ready 态的「断开」走状态机 T13（cancel）：恢复来源态 idle、清空内存端点，零 transport 调用；「删除」走 T14：仅删本地记录，零 transport 调用。两者均不向远程发出任何信号（红线，单测断言）。
- **状态可见性**：SSH 主机行状态由状态机映射的上游 ServerState 呈现（starting/auth/ready/failed/incompatible）；offline/reconnecting 有明确反馈与恢复入口（重试/编辑/删除），不静默（G14 真机核验）。
