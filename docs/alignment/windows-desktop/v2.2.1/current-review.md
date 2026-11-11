# 当前实现复核（E35，2026-11-06）

> **历史复核已冻结（2026-11-12）**：E35 及以下记录只说明 v2.2.1 轮次，不能直接作为 v2.2.7 运行或对齐结论。当前迁移状态见 [v2.2.7 current-review](../v2.2.7/current-review.md)。

## E35 当前基线与执行卡

- 目标：校准 v2.2.1 发布规划的源码事实与验收边界；固定上游 `3ebcf9a32c7b28f658cfee80775448929361727a`，从 `/home/peterhan/repository/opencode` 的 git 对象读取；本地共享源码均在 `vendor/upstream/`。
- 工作目录：`/home/peterhan/worktrees/opencode-mobile/docs--221-release-plan`；分支 `docs/221-release-plan`；开工 base/HEAD `740ce386cd74569afc11722182247092b0b6390a`，开工干净。主代理远端查询确认 main 同值；dev 仍为 `c9339b240c3b295dbe02a9cff8844a2dbf593579`，不是当前集成基线。
- 范围与授权：文档事实校准、总/子 Issue 与并行依赖安排；无运行代码修改、构建或设备操作。验收为固定来源比较、93 个稳定 ID 不变、本地相对链接、diff 和实际 GitHub 关系检查。文档 PR 不代表授权合并；运行等价性仍未全验。
- 当前用户授权覆盖旧的不另建总任务安排；已创建总任务 [#139](https://github.com/0xYiliu/opencode-mobile/issues/139) 与子项 #140–#149，原生子关系 10 条、blocked-by 26 条已通过 API 回读核实。首批可并行开发 #140/#141/#143；其余准备工作与最终依赖见[矩阵](matrix.md)。任务边界经独立检查及定向复审通过；已补 W12 压缩验收并明确验收任务允许零源码/零补丁变更。
- 全局 vendor pin 仍为 `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`，gui-plugins 包来源为目标 SHA，另有目标迁移补丁，不能凭全局 pin 判定未迁移。当前补丁为 **65 active / 0 deferred**；历史重放通过仅证明重放，不证明版本可发布。本轮未重跑。
- 版本仍待同步：Android `versionName=0.1.0` / `versionCode=1`，mobile app `0.1.0`，vendored app `2.1.4`；目标为 `2.2.1`，远端服务版本另记。

## E35 源码核实与真实剩余

路径均相对 `vendor/upstream/packages/`；“逐字”指与固定目标字节相同，不代表实际可用或完整运行等价。

| 关联 ID | 当前核实 | 剩余验收或迁移 |
| --- | --- | --- |
| S02/S20/W09/W26 | Settings 搜索已经迁移；`app/src/shell/commands/palette.ts`、`session-search.tsx` 为目标形加 `ctx.projects.catalog.list` 兼容 | 触摸入口、外接键盘、跨服务搜索与失败路径仍待完整验证，不能再列整族未迁移 |
| S04/W05 | `app/src/shell/titlebar/inbox.tsx` 与 `inbox-model.ts` 逐字目标，`titlebar.tsx` 已 import/渲染 SidebarInbox | 聚合、分组、未读与跨服务实态待验；E19/E34 的 Side rail 结论仅属历史 |
| S09/W06/W08/W11/W15 | queue 已迁入目标串行、乐观编辑/重排、失败草稿恢复与已接纳不重发链；额外以 server+session scope、capture/current 守卫保护归属；`app/src/composer/media.ts`、session fork/revert 的 `pinPromptMedia` 链已有 | 真服务竞态、切服务器/会话、附件与恢复端到端未全验 |
| W13/N08 | `app/src/session/commands/export.ts` 逐字目标，两处 `mediaRefs: false` 已有；Android 保存桥链已有 | SAF 保存、取消/失败及产物完整性仍归 G27 |
| W22 | `gui-plugins/src/goal/renderer.tsx` 逐字目标 ComposerPill；composer region 已消费 SessionPluginPills | Goal 往返、菜单与降级待运行验证，不再是旧 Panel 缺口 |
| S10/S11 | `session-ui/src/timeline/detail.ts` 逐字目标，categories 已含 commentary，compact/quiet 的 subagents 为 separate；settings schema 已含 commentary；`session/composer/composer-lane.tsx` 已消费 backgroundActivity | 分类实际呈现、位置偏好、消息列宽度仍待验；旧“不采纳/消费文件不存在”结论失效 |
| S18/W24 | `app/src/shell/notifications/notification.tsx`、`app/src/session/timeline/voice-delegation.ts` 逐字目标 | 通知真实投递/点击仍待验；交接解析已迁入不改变 ADR 0006 的语音通话暂缓决定 |
| W01/S19/W25 | home/new-session 仍旧结构，目标 `location/dialog`、pin-board、pin-sound 缺失 | 按完整首页/新会话与位置流程迁移；界面音效消费者随之补齐 |
| S21/S22 | FU-1：providers/connect/controller 仍为 key/oauth/external，无 command 认证，Console/Go 仍旧映射 | 目标连接对话框/认证方法与真实授权失败恢复 |
| S24/W17 | FU-2：models/select-dialog 旧结构，details/manage.css 缺失 | 选择器目标结构、非空目录及模型/变体切换 |
| W18 | context 面板已有；`app/src/usage` 缺失，composer commands 无 `usage.view` | usage.view 是 W18 的明确子能力，不新增矩阵 ID；需迁移入口、数据与状态 |
| S27–S30/W01/W08 | FU-3：registry 仍目录型 projects/lastProject，未迁至 usedProjectIDs/lastProjectID | 项目身份/最近使用持久化迁移、导航和恢复 |
| W03/W16/M04 | `app/src/workspaces/files/model.tsx` 缺目标 stream HEAD、watch/unwatch 与 reconnect 重订阅 | 文件刷新/订阅生命周期及真实切网恢复 |

## E36 增量核实（2026-11-06，issue #143 实施轮）

- 基线：worktree `feat--221-file-viewing`，分支 `feat/221-file-viewing`，base `3310b808c27ddb4b5f861912081e4f10ef652f75`；上游目标仍 `3ebcf9a32c7b28f658cfee80775448929361727a`。
- W03/W16/M04 行增量：E35 所列「缺目标 stream HEAD、watch/unwatch 与 reconnect 重订阅」已按目标 copy 迁入——`model.tsx`/`artifact.ts`（gui-plugins-api-migration hunks 重生成）+ `protocol/fs.ts`、`client.ts`、`types.ts`、`api.ts`（新 files-stream-watch.patch，0-based 58）；model.tsx 仅 2 行调用点适配（`api.experimental.file.*` → `api.file.*`，vendored 生成面命名，mobile 注记在位）。vendored `api.ts` 为移动适配形态（connection-utf8-basic-auth/session-client-compatibility 在先），`fileStreamUrl` 以追加 hunk 落位。typecheck 总数 419→417（mounted-session watch/unwatch TS2339 对闭合）；watch 路由在 v2.2.1 服务（desktop-ssh 2.2.1 实例）实测存在（POST/DELETE 204，未知路由 404 负例）。**运行验收未闭合**：本轮设备 adb 不可达，G22①–⑨/G22⑤/G29/G28 全部 BLOCKED，解除条件=恢复设备无线 ADB（设备屏物理操作）后按本轮 APK（SHA-256 `1c8c440ab868555051338a16a987974dc2675443e58308963bc233f8825e6d6f`）复测。

## E37 增量核实（2026-11-06，issue #146 验收轮）

- 基线：worktree `feat--221-core-recovery`，分支 `feat/221-core-recovery`，base/HEAD `1059377a851189b3d79bb1541dc7376594d7a243`（= origin/main，含 #140–#145 前置）；零源码、零补丁变更（纯验收轮）；APK SHA-256 `42d4b47effa5b0bf0f0e5eef015fd5b4cf9ea0391a2dcf8574bc295e813804e3`（安装回读相等）。
- 直连路由（LAN 实例 2.2.1）：真实模型闭环（发送→流式→Write 工具→完成，产物服务端逐字节核对）、权限三决策矩阵（once/always 落盘+命令粒度/deny）、队列按序消费零丢失零重发、/compact（9.6K→1.2K、摘要准确、压缩后可继续）、断连红线（杀 App → 服务端完成 → 快照补齐）全部 PASS——G20⑤/G21②③ 的直连子集首次以当前集成版闭环。
- SSH 路由：添加/持久化/指纹挑战（=独立参考）/Trust/密钥认证/服务认证 UI 全链 PASS 至服务认证；**隧道数据面复现阻断缺陷**（JSch 2.28.8 本地转发在 Android 12 设备监听绑定但每连接挂起；同密钥 OpenSSH 主机转发与主机 JVM 同库同序列均正常）——SSH 向全部下游验收继承 BLOCKED，修复候选与四通道证据见 build-and-verify.md #146 段。
- 结构性发现：idle SSH 主机在无已连接 HTTP 服务时无任何可达重连入口（settings 行 Connect/Delete 按源码注释本阶段有意失败、连接屏因 idle plugin 条目占据 servers.list 不可达）——G30④ 恢复路径判定为不可接受，待用户决策修复取向；SSH 桥冷启动握手竞态一次复现（reload 后 acked，后续冷启动正常）。

## E38 增量核实（2026-11-07，issue #147 验收轮）

- 基线：worktree `feat--221-workspace-operations`，分支 `feat/221-workspace-operations`，base/HEAD `24f5547`（= origin/main，含 #140–#146 前置）；零源码、零补丁变更（纯验收轮）；APK SHA-256 `25c0252effc0c0c10dcc8090d503e59d8f00760009b9fb0caca07957fc940e06`（安装回读相等）。测试仓库 `oc-147-repo`（main d4b4e25 + feature/base 37ec835）+ 附件样本三件 md5 双侧相等。全程证据：build-and-verify.md #147 段；台账 `/home/peterhan/qa-tmp/oc147-evidence.md`（四会话）。
- 直连路由（LAN 实例 2.2.1）：项目注册（计数 30→31 canonical 相等 true）、发送→应答→**权限 dock（edit ask）→ Write → Undo（UI 隐藏+文件消失+git 回初态——验收清单第 2 条核心证据成立）→ Redo（消息+文件回归）→ settle-drop（23→21）→ Fork（新会话+composer 预填，原会话不变）→ turn diff 空态=server** 全链 PASS——G20③/G23⑤ 的操作闭环子集以当前集成版闭环；undo=stage/redo=clear/commit-drop 语义经源码+实测一致（D17）。P7.2 noGit/initGit 真机 PASS：noGit 目录注册（vcs 无值、composer 零 changes/分支行）→ 模型 `git init` → host `.git` 产生 + `git status` 可用（注册前置=路径建议行点击）；M-021 分享桥 data:-唯一分支语义核实（D16 范围收窄为 timeline 图片芯片 data: URL 点击单形态）。
- 项目面：name/color 保存链（服务端相等 true）+ 失焦即保存语义、三值 Auto-accept Select（autoApproveProjects 键机证）、Worktrees 列表实时渲染、启动脚本真实执行（marker 逐字节两轮）+ exit 3 失败无伪成功、删除确认链（Enter 负例/dirty 警示/批量 scoped+per-workspace blocked toast）、Move session to（directory 相等 true）、Export→SAF 全链（slug/JSON 合法/count 40=server/mediaRefs:false）+ SAF 取消静默 + force-stop 恢复——S27–S32/W10/W13/W25 增量 PASS（剩余见门禁）。
- 结构性发现：①归档入口三重不可达（SHOW_HOME_SESSION_ARCHIVE=false 上游 pin + M-017 dead entry + unarchive 仅 verticalTabs 分支）——Android 可达面无归档/恢复 UI，解除条件=用户裁决；②**pierre 查看器组件族空渲染（D10/D12）**：Open file tabpanel 恒 0/0（0 fs 请求，fetch 钩子实证）+ `<diffs-container>` shadowRoot 仅图标 sprite——P3.1/3.2/3.3/3.4/3.6/3.7 BLOCKED（files/diff 单元）；③**宽屏双栏布局漂移至单栏不可恢复（D14，跨重启）+ 漂移期终端输入未达 shell（D15）**——P5.3 红线两段/P5.4/P5.5 终端路径 BLOCKED（detach 红线①间接固化：PTY pid 3835281 跨 app 死亡存活）；④timeline external-link 点击未走 openExternal 桥（mailto→WebView ERR_UNKNOWN_URL_SCHEME、http 未起浏览器，D16）。
- 剩余门禁：SSH 双路由向继承 #146 隧道缺陷 BLOCKED；P3 files/diff 族（D10/D12）；P5.3 红线②/stty/IME（D14/R6）；P6.2 取消变体、P6.3 断网失败（裁定）、P6.4 设备路径剪贴板；三 OS 矩阵；P1.6 icon 落地。明细与四要素见 build-and-verify.md #147 段。

## E39 增量核实（2026-11-07，issue #148 实施轮）

- 基线：worktree `feat--221-platform-events`，分支 `feat/221-platform-events`，base `24f5547`（= origin/main，含 #140–#146 前置）；提交链 `87a5da2`→`d7b9e78`→`4a4af28`→`0bd5ff8`→`0f4cc0f`→`d923276`+文档回填；补丁 **74→75 active**；APK SHA-256 `b94e9d87db0f1c1a355f74831d880767955f7cf4049418c28def0b011390ebd1`（设备 payload 身份经 CDP 回读核对）。设备/服务：MatePad DBY2-AL00（Android 12/API 31/WebView Chrome/114）+ LAN 直连 2.2.1 实服务 + 可丢弃项目 oc-148（MCP/Plugins/Skills/LSP 测试数据）。
- **B0+G33① 源码阶段**：M-023 通知投递面恢复（#144 F2 登记缺口收口——notifications-platform-delivery 字节不动为恢复面本体、session-workbench-upstream 修剪 6→2 目标形 hunks，verify:closure 字节级重放 PASS）；探针重锚（组 2/3/7/8/9 + 三发负例演练）；**G33① 真实缺陷修复**：WebView `document.hasFocus()` 前后台恒 true（CDP 轨迹实测）→ 前台门与共享 FOCUS_LOCK 卡抑制态，补丁 notifications-webview-focus-gate 令门与锁跟随 visibilityState，修复后前台抑制复验 PASS（dumpsys 0×三类别）。工程基线全轮恒同（app 子集 119/7/6err、mobile-hosts 442/0、gradle 9/39/0）。
- **分阶段判定**：Stage A——粘贴导入全链（对话框面）PASS、失败分支全 PASS 零残留、**扫码物理解码 BLOCKED**（相机平放无法入画）；Stage B——前台抑制/权限 dock 真触点/错误面/类别开关门控/force-stop 边界（D05 形）PASS，**后台到达 PLATFORM-BLOCKED**（渲染器失焦 ≤2.6s 冻结、五样本零事件派发；resync 补齐已证，按在册 G33② PASS 形记录）；Stage C——GUI 扩展开关链/远端 PTY 红线/Reload/force-stop 持久化/覆盖升级存活 PASS（关闭 #109 会话面残项），goal pill BLOCKED（环境）；sources gate PASS；Stage D——MCP connected/failed/disabled+状态推送回流 PASS、pending 不可捕获（诚实）、needs_auth/OAuth BLOCKED、Plugins/Skills 真实非空列表与项目作用域差集 PASS、LSP 空态归因 PASS。逐项证据见 build-and-verify.md #148 段。
- **结构性发现（登记）**：① **G32⑤ ref 语义实态为方法门控**——link/QR 方法重配对即使在对话框面也丢 `credentialRef`+重置 displayName（`priorRef()` 按密码表单地址字段查 prior、link 方法恒空；文件内注释声称覆盖 link 流与实现不符）——connection.md 已按双向变更协议更正为「dialog+password 保 / dialog+link 丢 / screen 丢」，上游修复决策待定（候选=移动补丁从解析链接 URL 解析 prior）；② **goal 贡献在 WebView 114 结构性失败**——`AbortSignal.any is not a function`（vendored `plugin/src/promise/adapter.ts:110`，Chrome <116 缺该 API；git log 空=预存非 #148 归因；宿主 containment 成立），解除条件=WebView ≥116 或 polyfill 决策；③ **后台渲染器冻结为平台实态**——EMUI Android 12 cached-app freezer 使 WebView 失焦 ≤2.6s 即冻结（电池白名单/standby-bucket 不豁免），后台通知到达与 tap 路由在该设备结构性不可达；④ **LAN 明文兑换可达**——G32④ 预声明 HTTPS 隧道前提本轮不适用，按现产品实态记录（明文 LAN 直连可完成兑换全链）。
- **维持 OPEN**：扫码物理解码（物理协助）、后台到达/tap 路由（G33②④⑦）、G33⑥⑧⑩、MCP needs_auth/OAuth 完整回流、goal pill、TalkBack 走查（G35⑨）、G32⑤ 上游修复决策、连接屏粘贴链残面——解除条件逐条在 build-and-verify.md #148 段未验收清单。

## E40 增量核实（2026-11-07，issue #149 release 轮）

- 基线：worktree `feat--221-release-221`，分支 `feat/221-release-221`，base `265790c`（= origin/main，#159 合入，#140–#148 全部在内）；提交链 `c03dff3`（签名接线）→ `bb75c0c`（2.2.1 身份同步 + 全轮唯一 web 构建）→ `bbc3104`（探针扫描域 + dist 见证回填 + web-dist/manifest.json）→ `6e83db6`（六补丁 upstreamBaseline）→ c6+ 文档；**RC = `6e83db6`**（git status clean 冻结登记）；未 push。本轮零 vendored 树改动、零新补丁、patch 文件字节不动。
- **工程门禁全过**：verify:patches 75 PASS（refresh 双跑 updated: none）；verify:closure base 与 RC 各 PASS（DANGLING=0）；`vendor:sync` 实树重建后 git status 0 行（干净重放证明）；mobile-hosts 442/0/2946（40 文件）= #148 基线恒同；gradle `:app:testDebugUnitTest` base 与 RC 各 9/39/0；audit-secret-persistence 构建态 PASS；leak-scan 命中集与 base 恒同（5 条合成 fixture 既有，零新增）；探针普查两态枚举集实测（干净 pre-build 11 rc=0/22 rc=1；构建态 **14 rc=0/19 rc=1**，与计划主工作树 14 条枚举集一致；verify-about-version rc=0；19 rc=1 逐项四类归因入台账，其中 verify-notifications 为唯一版本同步自引④类必修——dist 见证回填后恢复 rc=0）。计划 §9.1「干净树 17 rc=0」假设经实测推翻（direct-connection/service-ops/ssh 为 dist/assets 环境依赖；permission-requests/session-workbench 为 #147 源级陈旧锚 + 构建产物双因——c3 只修扫描域，源级 caller 登记归属不重锚，负例注入复验断言域未弱化）。
- **构建与签名**：web dist 5622/150,022,223 bytes（entry chunk index-B-7B3T0I→index-CpaevSWf 携 2.2.1，零 0.1.0；649 .map 为机器路径 churn）；`android_web_assets.py verify` + fileCount/totalBytes 与 c3 回填值显式断言通过（MAJOR-2）；assembleRelease/assembleDebug 零 web 重建；apksigner verify **Verifies（v2 scheme true）**，签名者 SHA-256 `bbd52148…` = keystore 指纹；aapt2 badging `ai.opencode.mobile` 20201/2.2.1；unsigned 负例（四属性空覆盖）rc=0 + 明示 lifecycle 行 + apksigner 拒验、部分缺属性 fail-fast 点名——三分支接线语义实测成立。归档（仓库外 `/home/peterhan/release-staging/issue-149/`）：release **`aa145593d4d7086130f1233d3cbc58279b9d84054c93c94c92df2b6efb02a637`**（56,595,739 bytes）、debug `abcf1a42…`（64,447,987 bytes）；发布动作（tag/Release/上传）零执行（U2 未决）。
- **模拟器 Phase E**（本地可丢弃 AVD；MatePad 全程未触碰）：API 34（WebView 113）首装 Success → 冷启动连接面渲染 → 经 `opencode pair` 配对连接（⚠️ 只读范围外触碰诚实登记：2.1.1 隔离实例不隔离数据目录，pair 实际配到数据目录注册表中用户已在运行的本地 2.2.1 服务；仅列表渲染/版本读取，零任务/零写入，发现即收口）；About 三行实显截图（Version 2.2.1 / Upstream OpenCode 2.1.4 / Server OpenCode 2.2.1——S39 服务行真服务展示收口）；`install -r` 同签名覆盖升级 Success + firstInstallTime 保持 + 服务器配置存续（数据保留）；debug→release 异签名拒绝（INSTALL_FAILED_UPDATE_INCOMPATIBLE）两台 AVD 实测。API 31 镜像 WebView 91 过旧（Object.hasOwn 缺失白屏）登记为环境事实。
- **真机 Phase D（后续同日完成，6/6 Stage PASS）**：MatePad 覆盖安装归档 debug APK（SHA 复核一致）→ versionCode 1→20201/2.2.1、firstInstallTime 不变（Retain data 系统级佐证）；数据保留全对照（服务器 3/3+凭据水合两径、偏好 12 项、会话/项目/标签全恢复）；About 壳行 0.1.0→2.2.1；**whatsNew 真实跃迁首测**（fetch 200+无弹窗+水位推进，上游「无合格 highlights」判定路径）；核心回归 oc-148 流式链 PASS；主题/语言切换往返截图；logcat 73,255 行 0 FATAL 零凭据命中。证据 `/home/peterhan/release-staging/issue-149/qa-phase-d/`。
- **维持 OPEN/BLOCKED**（解除条件在 build-and-verify.md #149 段）：Phase R（卸载 debug 装 release，U1 授权点——已询问用户未获答复，不视为授权，不擅自卸载）；残余有副作用面（权限 once/断连恢复补齐/通知前台抑制/终端文件 smoke 于 2.2.1 构建重跑——发送→流式→完成已经 Phase D PASS，其余继承 #146–#148 在册证据不重跑口径）；服务行诚实降级串设备复验；whatsNew 弹窗呈现面（待上游内容激活）；发布上传待 U2 用户授权。

## E35 已有运行证据与发布边界

- PR [#135](https://github.com/0xYiliu/opencode-mobile/pull/135) 已合并；GitHub merge commit 为 `bbd0b488efb5a654ce55cbde30661d5287bc4381`，最终 Agent/Extensions 修复提交为 `813e68d`。PR 正文的 Draft、旧 APK 和较早评论不是最终状态。
- 最终 MatePad APK SHA-256：`9e4a4f7c3ba01377ed649edf052c83eceba8d052c2a68ade77d0967c72002fa6`，安装与活动资源身份匹配；Agent 用户确认正常；MCP 2 行、Skills 10 行、Plugins/LSP 空态实际可见，切换 hidden/inert 及关闭通过。该证据是会话 Details 面，不自动覆盖 Settings 的启停/授权及所有失败恢复。
- **仍未验收**：整体消息列宽度、排版密度、Composer 尺寸、工具卡片截图差异、完整竖屏键盘，以及当前集成版 SSH/直连真实任务、权限、恢复等完整门禁。Settings 主要已迁入，按具体运行缺口补验，不重建页面。
- 本轮只读取源码与 PR 最终记录并发布任务安排，无新 build/APK/设备测试。最小核对结果：`git diff --check` 通过；矩阵 **93 个稳定 ID 无增删、无重复、顺序一致**；9 份修改文档 **273 个本地相对链接目标均存在**（未检查标题锚点/全部远程链接可达性；新建 Issue 正文和原生关系已 API 回读）。不借历史重放或局部设备 PASS 宣称发布完成。

## E34 历史快照（2026-11-01，禁止作为当前结论）

以下保留 E34 当时的原始记录。其“本轮”“当前”、缺文件与未迁移结论均只指 `c68ccc0`，已被上方 E35 与后续迁移覆盖；不作为当前待办、基线或优先级。历史检查数字亦不代表本轮检查。

## 比较身份与覆盖范围

- Mobile：`c68ccc0c2541e4cf19be4befc706cb09fcce0690`。本次 `git ls-remote origin refs/heads/main refs/heads/dev` 确认两远端分支均指向该提交；本地 main/dev 同值。开始时只有主工作树，未跟踪 `.zcode/` 保留未动；文档修改位于独立 `docs/desktop-matrix-refresh` 工作树。
- Desktop：沿用活跃目标 **v2.2.1**，本机上游仓库 `/home/peterhan/repository/opencode` 的标签解析为 `3ebcf9a32c7b28f658cfee80775448929361727a`。读取固定 git 对象，不以其工作目录 HEAD 替代目标；此次未评估更新版本。
- Vendor：全局 pin 仍为 `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；`vendor-manifest.json` 的 `packageSources` 单独将 gui-plugins 指向 `3ebcf9a…`，另叠加移动补丁。这是混合来源实现，不是整套 app/client/session-ui 已升级至 v2.2.1。
- 本轮为文档级复核：核对全部矩阵行的历史证据与状态，定向读取下表的代码差异、入口、平台桥及最新补验记录。没有逐文件穷尽整个上游差异，没有构建 APK、运行 Windows 或重跑 Android/真服务测试。未重新逐行为比较的行仍保留“已有代码，等价性待核”。
- 验收：稳定 ID 保留、每项差异可追溯、历史局部通过不升级为当前全链通过、已确认范围不重新变成待决策；检查文档链接与 `git diff --check`。

## 本轮源码证据

下表上游路径相对上游仓库，本项目共享路径加 `vendor/upstream/`。字节相等仅用于证明所述文件来源，不代表运行等价。

| 关联 ID | 对照路径与检查 | 当前结论 |
| --- | --- | --- |
| S02 | `packages/app/src/settings/search.tsx` 两侧实读及 pin→目标 diff；本树 `surface.plugins.items()` | #90 已修复插件索引崩溃；目标改用 SearchList/SearchHighlight、分组与聚焦行为，本树仍是旧搜索实现加消费点修补。搜索能用不代表目标搜索交互已全部移植。 |
| S04/W05 | 目标 `packages/app/src/shell/titlebar/inbox.tsx`、`inbox-model.ts`；本树两文件不存在；shell 的模式判断与 settings-interface-mode | 设置三模式已落地，但 Inbox 仍复用 Side rail；缺少目标 Inbox 列表、跨服务聚合与相应未读/注意状态。此结论不否认旧会话 tab 已有 unread/attention。历史设备观察 E19 与源码一致。 |
| S09/W15/W06/W08 | `packages/app/src/session/composer/queue.ts`：本树逐字节等于 pin、不同于 v2.2.1；目标新增 `composer/media.ts`，本树无此文件 | 缺目标 `SentEdit`、按 session mutation scope 串行、乐观重排/隐藏、失败恢复编辑草稿、已接纳后不重发与 `pinPromptMedia` 媒体保留链。旧 queue/steer 已存在；这是已定位的行为增量，不再只写“待核对”。是否在真实服务组合中出错仍需运行验证。 |
| W13 | `packages/app/src/session/commands/export.ts`：本树逐字节等于 pin；目标两处 `message.list` 加 `{ mediaRefs: false }` | 导出媒体读取参数未迁移；不据此断言当前服务一定导出损坏文件。目标语义需连同 client/media 契约评估。 |
| W13/N08 | `use-session-commands.tsx` 的 `saveSessionExport` → `runtime/platform/web.ts` 的 `createPlatformFileSaver` → 第一方 `files/client.ts` → Android `files/FilesBridge.kt` 的 `ACTION_CREATE_DOCUMENT` 与 `openOutputStream` | 导出到 Android 保存的源码链已接通，不是“只有两个孤立端点”。桥不可用时返回 false（静默取消），真机保存、产物完整性、取消/失败仍归 G27；复制 ID 命令亦已存在。 |
| W22 | 目标 `packages/gui-plugins/src/goal/renderer.tsx` 注册 ComposerPill；本树注册 Panel、side、mobile order 70，保留 pause/resume/clear | #67 合并后仍保留 Panel 重表壳；“等 #67 迁移后补 pill”的旧推进措辞过期。属于当前明确的呈现差异，不是 Goal 完全缺失。 |
| S41/N11/S43 | `packages/mobile-hosts/src/ui/extension-manager.tsx`、#96 台账与提交 `4d75fe3` | 开关反转修复已集成；真机开关往返及两次 force-stop 持久化有证据。面板撤除/恢复、远端 PTY 不受影响与完整失败/Reload 链仍不能由管理器开关通过推定。 |
| N08 | `runtime/platform/web.ts` 的 `activeFilesPort().openExternal`、`files/client.ts`、Android `ExternalOpenPolicy.kt`/`FilesBridge.kt` | Platform.openExternal 已经原生外跳；仅 http/https，mailto 拒绝是已登记差异。原始 `target=_blank` 锚链接不自动等同于该桥覆盖；真实 OAuth/MCP 授权回流未验。 |

复现方式：`git -C /home/peterhan/repository/opencode show v2.2.1:packages/<路径>`、`git diff b4525d79bf v2.2.1 -- packages/<路径>`；本树文件直接读取。queue/export 的 pin 相等检查使用 Python `Path.read_bytes()` 与 `git show` 返回字节比较，结果均为 true；与 v2.2.1 比较均为 false。

## 最新运行记录覆盖旧状态（本次未重跑）

以 `docs/build-and-verify.md` 对应 issue 的**设备补验轮**为准；旧“待执行”标题保留的是当时状态。

| 关联 ID | 已有后续证据 | 仍未覆盖 |
| --- | --- | --- |
| S01/S02/S27/S35/S37 | #90 补验 S1-A/B/C/E/F：Settings 可达、搜索命中、三个主机独立呈列、Reload 幂等、零 TypeError；S2：SSH 认证段及三种连接错误呈现 | 活服务下会话/工作台回归、连接态 Settings、Shell 读写回滚；旧“无线调试未恢复”已不再是该轮最终阻塞原因，最终阻塞为无活服务 |
| S17/S42 | #65 补验：显式 On/Off、缩放六档、持久化、字号叠加、键盘与搜索有通过记录 | 本机 WebView 114 的 system 档未映射系统减少动效；不是三态全部等价 |
| S38 | #64 补验：newIcons、持久化、8lh 支持通过 | 真实长消息折叠展开及 500 行性能未验 |
| S39 | #72 补验：版本/基座、notices 滚动、搜索与布局通过 | 服务版本行仍需已连接服务；多主机取排序首项是移动实现边界 |
| S41/S43/N11/N12 | #67 补验管理器 15 行（三集包括 WSL 排除行）呈现；#96 修复后启停与持久化通过 | WSL 读屏/零操作完整专项、工作台面板与失败恢复场景未全验，不将整个 G35 标通过 |
| W21/W22/W23 | /btw 已接窄屏入口；Sources gate 持久化有补验 | 会话内 /btw、Goal 往返、Sources chip→面板闭环未验；旧 MatePad CSS 视口下限 818px 不证明 <768px 手机体验 |
| S36/N04/W01/W07 | #61 具备真实 SSH 信任→认证→隧道→服务认证→既有会话的历史主链证据 | #67 后只补到 #90 的认证/错误段；不能宣称当前集成版全链复验通过。任务级存活、直连链、切网和 incompatible 真服务仍缺 |

## 推进顺序

后续用户确认将 **Settings 整体界面对齐作为下一实施项**。执行范围、顺序、验收与当前状态统一维护于 [矩阵的工作单元](matrix.md#下一实施工作单元settings-整体界面对齐)；下列序列保留本次初始盘点建议，当前优先级以矩阵为准。

1. **核心运行闭环**：在可用授权服务上验证当前集成版 SSH/HTTPS 直连、创建会话/发送/流式/权限、断线重连及任务级存活（G19–G21/G30），复用 #61 已有场景。
2. **已定位的版本行为差异**：队列并发/恢复与媒体契约、导出媒体参数、Inbox 列表；迁移时按依赖闭包评估，不能只复制一个文件。
3. **移动操作闭环**：文件/Diff/PTY、附件/导出/Office、通知、配对兑换、窄屏返回与软键盘；Goal/Sources/btw 的真实会话面补验。
4. **范围边界**：APK 更新与语音按 ADR 暂缓；外链唤起、WSL 执行、手机本地服务、第三方 GUI 完整运行、进程死亡通知按既有决定处理。不把这些算作待修缺陷，也不以矩阵行数计算完成率。

## 本轮文档核对结果

- T1 文档更新；用户批准直接修改及自检，省略代理流程，无独立代理评审。
- `git diff --check` 通过；Python 比较修改前后矩阵：**93 个稳定 ID 无增删、无重复、顺序相同**；五份改动文档 **46 个本地链接目标存在**（不含远程网址与标题锚点可达性验证）。
- 自检覆盖来源固定、后续补验优先、部分通过边界与 ADR 一致性；运行测试未执行，不新增任何 APK/设备通过结论。
