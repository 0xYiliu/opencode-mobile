# Settings 整体对照（issue #144）——逐页状态与推进记录

本文件是 #144 的唯一推进记录（矩阵 #144 行链接到此）。S01–S43 与 N12 的**源码级普查结论**、参考条件、本轮工程门禁与真机验收边界集中在此；各页面的实现史（迁移补丁、逐 hunk 处置、历史设备 QA）仍以 [matrix.md](matrix.md) 各行与 [build-and-verify.md](../../../build-and-verify.md) 对应 issue 段为准，本文件不重复。

## 一、执行卡

```text
工作单元 / 用户可观察的目标：Settings 整体界面对照（issue #144）。同一 CSS 视口/主题/语言/缩放/
  字体配置下，Settings 共享区域与 Windows Desktop v2.2.1 的布局、控件、状态呈现与交互结果一致；
  搜索可命中并定位全部目录行；偏好按 settings.v3 契约持久化。
关联矩阵 ID：S01–S43 全行 + N12（移交核对，不重做）；不改动其它 ID 的结论。
上游目标 / vendor pin：Windows Desktop v2.2.1，3ebcf9a32c7b28f658cfee80775448929361727a；
  全局 pin b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43 + gui-plugins=3ebcf9a（packageSources）+
  69 active 移动补丁（M-019/M-039 reserved-absent）。
绝对工作目录 / 开发分支 / base SHA / 当前 HEAD：
  /home/peterhan/worktrees/opencode-mobile/feat--221-settings-acceptance；
  分支 feat/221-settings-acceptance；base = c6a31fd1489b901c22b8cf4523ad1e74c89c0802
  （开工 git log -1 实测 = base，工作区干净；不从 main 推断）。
已有实现、设计、决定与验证证据：#101–#110 迁移与设备记录（S01–S43 各行证据列）；
  docs/design/units/settings.md 各单元契约；E35 校准（current-review.md）。
具体差距及分类：F1 = 唯一「契约-树偏差」（M-035 已登记偏离被补丁链 54/55 静默退役，
  search-catalog.ts/search-results.test.ts 与目标逐字节相同）——已有缺陷类，恢复偏离；
  F2 = 探针锚陈旧（会话/通知域随 #140 迁移收敛后，六个第一方探针仍钉 #103/#107/#23 时代形）——
  证据不足类，刷新锚点；R2 = desktop-menu 链两探针 rc=1（#74/S12 负锁被补丁 54/55 翻入的
  目标形打破）——越界项，不修复，登记归属；真机整体验收 = 运行门禁。
本次范围与必要依赖 / 明确后置事项：F1+F2+文档回填+真机验收窗口。后置/移交：
  desktop-menu 链 R2 归 #145/N10；M-023 投递面退役缺口归 #148/G33（见 §五/§七）；
  真服务路径（S03/S05/S09/S22/S25/S29/S30/S35–S37 动态面）归 #146/#147 的 G 门禁。
正常流程、交互状态、失败路径和恢复行为：随各 S 行既有契约；本轮无行为面改动
  （唯一源码行为变化 = 搜索可见的 zoom/font 命中恢复，见 §三）。
验收步骤、预期结果与验证环境：本文件 §四（逐页状态）+ §五（工程门禁实跑）+ §六（真机窗口与 BLOCKED 登记）。
当前授权：隔离工作树内提交；设备构建/覆盖安装/启动/操作（AGENTS.md 既有授权）；
  不 push、不建 PR、不动 GitHub issue（协调者负责）。
执行状态 / 已完成 / 剩余 / 阻塞与解除条件 / 下一步：
  已完成 = F1/F2/全部工程门禁/文档回填；阻塞 = 真机交互验收（物理 Smart Cover 合盖，
  见 §六）；下一步 = 协调者评审 + PR；设备可物理开盖后按 §六解除条件补运行窗口。
实现提交与 PR / 验证结果与证据位置：三组提交（fix(vendor)/chore(verify)/docs(parity)）；
  证据 = 本文件 §五 + build-and-verify.md issue #144 段；PR 由协调者创建。
```

## 二、参考条件记录（issue ②按序）

- **目标**：Windows Desktop v2.2.1（`3ebcf9a32c7b28f658cfee80775448929361727a`，从本地 `/home/peterhan/repository/opencode` 固定 git 对象读取，非工作树 HEAD）。**无 Windows 参考端登记**：没有 Desktop v2.2.1 安装包在跑；本轮全部对照为源码级（逐字节 blob 比较）与构建级（dist 检索），不冒充实机对照——视觉/交互一致性的 Desktop 侧结论保持 BLOCKED（继承 #101–#110 同判据）。
- **Android 端实测条件**（2026-11-06 真机窗口起点实测）：设备 DBY2-AL00（MatePad），Android 12 / API 31，物理 1840×2800 @ 360dpi（**DPR 2.25**），WebView = com.huawei.webview **114.0.5.302**，横屏 CSS 视口 ≈1245×786（系统报告 winConfig sw817dp×h785dp）；语言 en（系统 locale en_CN）；深浅主题与缩放状态在设备存储内（QA 前值 = #110 轮收尾态：system 配色、oc-2 主题、zoom 100%、font_scale 1.0）。三台 SSH 主机在册（authorized-bastion / bastion-main / bastion-aux，hosts.v1 与 #109 轮一致）。
- **<768px 断点物理不可达判据继承**：DPR 2.25 下最小原生 CSS 宽 ≈818px > 768px，窄断点物理不可达；CDP `Emulation.setDeviceMetricsOverride` 在嵌入 WebView 的生效记录两轮不一致（#103 记布局视口不变、#107 记 innerWidth 生效但截图未采），均不作 <768px 联验证据——该面保持 BLOCKED 继承（判据同 #103/#104 段在册记录）。

## 三、F1 —— 恢复 M-035（唯一契约-树偏差的修复）

**事实链**：appearance-motion-zoom（#65）裁定 A2 = 搜索目录 zoom 行删 `available: "desktop"`（web 可用），登记偏离随 `mobile(M-035)` 注释在册。#140 时代的 `session-workbench-upstream.patch`（mobilePatches 0-based 54）对 search-results.test.ts 携带把 M-035 断言翻回目标形的 hunk，`session-client-compatibility.patch`（0-based 55）对 search-catalog.ts 携带把 zoom 行翻回 `available: "desktop"` 的 hunk——两条在册偏离被补丁链**静默退役**，两文件退化为与 v2.2.1 目标逐字节相同（普查实测 cmp 一致）。

**修复内容**（恢复 #107 时代已验证形 = 目标形 + 唯一登记偏离）：

- `vendor/upstream/packages/app/src/settings/search-catalog.ts`：zoom 行删 `available: "desktop"`，恢复两行 `mobile(M-035)` 注释（与 403eefb 时代逐字同形）。
- `vendor/upstream/packages/app/src/settings/search-results.test.ts`：`font` 查询长度 3→4（M-035 注释恢复）；`not.toContain("settings-zoom")` 翻回 `toContain`（M-035 注释恢复）；**timeline-width/sounds-interface 两条第一方断言保持目标形删除**（见下）。
- **补丁治理**（按 patches/mobile/README.md 程序，不新增补丁、不改 mobilePatches 顺序）：
  - `session-client-compatibility.patch` **仅修剪** search-catalog.ts 的 zoom 门 hunk（该文件段整体移出；select-dialog/composer 接线、desktop-menu.ts、`visibility.fileTree` 等其余 hunk 全部不动）；manifest targets 移除 `packages/app/src/settings/search-catalog.ts`。
  - `session-workbench-upstream.patch` 的 search-results.test.ts 段**仅修剪 hunk 1**（M-035 翻回，原 `@@ -45,16` 区段），**保留 hunk 2**（改号 `@@ -82,10 +82,6`——删 timeline-width/sounds-interface 两条 #103/#107 时代第一方断言，收敛目标形）；文件保持 patch target。修剪理由与归因写入两 manifest 条目 `rebase` 字段；`bun run patches:refresh` 重算 sha256（session-workbench-upstream `e532b2c8…`、session-client-compatibility `8ae7f5a9…`）并同步机器镜像；幂等复跑 `updated: none`。
- **行为面**：搜索 `zoom` / `font` 查询恢复命中 Zoom 行（含 keywords 内 "font" 联动，4 结果）——移动端搜索可见性恢复，无其它行为变化。

**普查结论（评审条件 MAJOR-1，两条独立陈述）**：

1. **14 个文件级 delta 全部归因在册移动补丁/契约登记偏离。** 对 `packages/app/src/settings/` 与目标 3ebcf9a 的逐文件 cmp：74 个共享文件中 14 个存在 delta——about/about.tsx（settings-about-version 已批准区域级例外）、experimental/experimental.tsx（session-goal-sources-panels Sources 行，#109 复核保留）、general/behavior.ts + general/controllers.ts（behavior 再导出边界 + pin `config.update` 命名，S37 在册偏离）、model.tsx（terminalPlacement/showFileTree 解码存根 + 注释）、notifications/notifications.tsx（settings-notification-permission 残留 50 行）、pages.ts + route.ts + route.test.ts（gui-extensions root tab 恢复，#109 已决永久保留）、servers/servers.tsx + shell.tsx（settings-mobile-host-manager / settings-mobile-gui-plugins 移动面）、workspaces/project-options.tsx + project.tsx + projects.tsx（settings-framework-migration onClose 面 + M-043 形）——每一项都能指认在册补丁或登记偏离，无未归因差异。
2. **F1 = 唯一契约-树偏差。** 补丁链重放（verify-closure V3(a) 字节级）成立的同时，search-catalog.ts / search-results.test.ts 曾与目标逐字节相同——即「树正确、契约丢失」的唯一位置（登记偏离被链静默退役）。本轮修复后，两文件以「目标形 + 在册 M-035 偏离」**重新成为差异文件**（全域 delta 文件 14→16），目录级偏离表述恢复为：搜索目录现存唯一目录级偏离 = appearance-motion-zoom zoom 行（settings.md 搜索契约段表述继续成立）。

**精度修正（评审条件 MINOR-4）**：settings 域 vendored-only 文件实测 **10 个 = 8 个第一方测试 + 2 个源码 helper**，逐文件补丁归属：keyed-server-entry.test.tsx（settings-mobile-host-manager / settings-server-menu）、palette.test.ts + search-reveal.test.ts + surface.test.ts（settings-framework-migration）、servers/android-host.ts + servers/android-host.test.ts + servers/mobile-ssh.tsx + servers/mobile-ssh.test.tsx + servers/servers-page.test.tsx（settings-server-menu；servers-page.test.tsx 另有 settings-servers-migration 携带面）、settings-search-plugin.test.tsx（gui-plugins-api-migration）。计划 MINOR-4 的「9 测试 + 1 helper」与实测「8 测试 + 2 helper（android-host.ts 与 mobile-ssh.tsx）」存在计数口径差，以本实测为准登记。settings 域探针名单（8 个）：verify-about-version / verify-appearance-settings / verify-experimental-settings / verify-interface-mode / verify-notifications / verify-pinch-shell-settings / verify-projects-sessions / verify-settings-framework。

## 四、逐页状态表（S01–S43 + N12）

口径：「目标逐字」= 与 3ebcf9a 逐字节 cmp（本轮实测）；「登记偏离」均指可在 manifest/单元契约指认的在册项（§三清单）；「既有证据」复用 #101–#110 设备记录——**适用性边界**：各记录描述其当轮 APK 与树态，本轮树在其后有 F1 与 #140 系迁移，未复验前不外推为当前集成版结论。本轮运行验收受 §六物理合盖 BLOCKED 支配：「BLOCKED（设备）」= 继承历史证据、本轮未复验；「G 门禁」= 真服务/授权环境路径归 #146/#147。

| S-ID | 页面/能力 | 源码对齐结论（本轮逐文件普查） | 既有证据及适用性 | 本轮运行验收 |
| --- | --- | --- | --- | --- |
| S01 | 设置导航/壳/返回上下文 | shell.tsx/navigation/route/surface 目标形 + 登记偏离（shell.tsx 移动面两补丁、pages.ts/route.ts/route.test.ts gui-extensions 已决保留）；#144 零触碰 | #101 框架迁移 + 设备冒烟（返回链/键盘避让 PASS，E31）；树后未复验 | BLOCKED（设备） |
| S02 | 搜索与定位 | search-catalog.ts/search-results.test.ts **目标形 + 唯一 M-035 偏离（#144 恢复）**；search-index/search-results.ts/search.tsx 目标逐字 | #101/#103/#107 搜索命中记录；F1 单测（86/1 含 font→4、zoom toContain）+ dist 实证 | **F1 源码级 PASS**；设备复测 BLOCKED（设备） |
| S03 | 服务器选择/数据隔离 | switcher.tsx/unavailable.tsx/surface.tsx 目标逐字（本轮零触碰）；移动 host-manager 面在册 | #101/#102 冒烟（三主机切换保页 PASS）；真服务隔离归 G13 | BLOCKED（设备）+ G 门禁 |
| S04 | Top/Side/Inbox 模式 | general.tsx 目标逐字；interface-mode 探针 rc=0；Inbox 面 #140 迁入 | #103 局部 + E19 历史（Side rail 结论仅历史） | BLOCKED（设备） |
| S05 | 语言切换 | general.tsx 目标逐字；en-only 先例在册；#144 零触碰 | #103 记录（回退英文=上游实态） | BLOCKED（设备） |
| S06 | 默认工作区目的地 | WorkspaceDestinationSetting 行目标逐字 | #103 记录 | BLOCKED（设备）+ G 门禁 |
| S07 | 默认自动批准 | 行目标逐字（默认关） | #103 记录；代答执行归 G21 | BLOCKED（设备）+ G 门禁 |
| S08 | 显示自定义 Agent | 行目标逐字 | #103 记录 | BLOCKED（设备） |
| S09 | queue/steer | 设置行目标逐字；执行链 #140 迁入 | E35；真服务竞态归 W15 | BLOCKED（设备）+ G 门禁 |
| S10 | 时间线详情分类 | detail.ts 逐字目标、schema 含 commentary（E35） | E35 校准；呈现归会话域 | BLOCKED（设备） |
| S11 | 时间线宽度/后台活动/Diff | schema+token 在册；composer-lane 已消费（E35） | #103 局部记录；组合验收待当前构建 | BLOCKED（设备） |
| S12 | 捏合缩放 | General 页捏合行 desktop 门目标形保留；**R2 在册 rc=1 → #145/N10**（§七） | #104 复验（viewport 负锚/零 pinch 行） | BLOCKED（设备）+ R2 移交 |
| S13 | 窄屏标题栏 | mobile() 标题栏行目标原生含于 general.tsx | <768px 物理不可达（DPR 2.25 判据 §二） | BLOCKED（断点不可达，继承） |
| S14 | Diff 换行 | 插件贡献宿主挂载在册（#109） | #109 记录；长 Diff 实态归 G23 | BLOCKED（设备）+ G 门禁 |
| S15 | 主题 | appearance.tsx/theme 族 byte-identical（本轮零触碰） | #104 设备复验（system/light/dark、36 主题、Dracula） | BLOCKED（设备） |
| S16 | 三类字体 | appearance.tsx byte-identical | #104 设备复验（三输入即时生效/跨重启） | BLOCKED（设备） |
| S17 | 减少动效 | 目标形 + dataset.motion 链在册 | #104 复验（On/Off/持久化；system 档 WebView 114 映射 full 在册环境差） | BLOCKED（设备） |
| S18 | 系统通知开关 | 通知页目标形 + settings-notification-permission 残留在册；notification.tsx **目标逐字**（M-023 投递面退役 → **#148/G33 登记**，§七） | #107 深浅 sweep/持久化记录 | BLOCKED（设备）+ G33 |
| S19 | 声音选择/界面音效 | 通知页目标形（11 行 sounds-interface 在册）；播放消费者已随 #140 迁入 | #107 机证记录（play-resolved 双形态） | BLOCKED（设备）+ G19/G33 |
| S20 | 快捷键 | keybinds.tsx/migration.ts/command.tsx 目标逐字（本轮零触碰） | #108 触摸可达面 PASS；外接键盘 BLOCKED 继承 | BLOCKED（设备+外接键盘） |
| S21 | 供应商列表/连接 | providers.tsx 目标逐字；#141 对话框族目标逐字 | #105 设备 QA + #141 源码收敛 | BLOCKED（设备+凭据） |
| S22 | API key/OAuth | #141 全链目标形（cancel/expire/retry 可达） | #141 探针/单测；真实授权 BLOCKED | BLOCKED（设备+凭据） |
| S23 | 多账号管理 | 零 delta 逐字复用（#141 复核零触碰） | #105/#141 记录 | BLOCKED（设备+凭据） |
| S24 | 模型搜索/分组 | settings/models.tsx 目标逐字；FU-2 选择器族归 #142 | #105 记录（目录空=远端下线） | BLOCKED（设备+服务） |
| S25 | MCP 状态/启停 | extensions.tsx/mcp-dialog.tsx 目标逐字 | #105 记录（行面 BLOCKED 服务下线） | BLOCKED（设备+服务） |
| S26 | Plugins/Skills 列表 | extension-plugins.tsx 目标逐字（NEW 文件） | #105 记录 | BLOCKED（设备+服务） |
| S27 | 项目列表 | projects.tsx 目标 min-w-0 + FU-3 已随 #140 落地 | #106 QA + #140 | BLOCKED（设备）+ G19 |
| S28 | 项目名称/图标/颜色 | project.tsx 目标形 + onClose 登记偏离 | #106 QA | BLOCKED（设备+授权测试项目） |
| S29 | 项目自动批准 | 行目标形；#140 后 id 数据面供给 | #106 潜伏面 → #140 解除 | BLOCKED（设备）+ G21 |
| S30 | 启动脚本 | 编辑面目标形 | #106 QA | BLOCKED（设备+授权测试项目） |
| S31 | 工作区筛选/占用 | workspaces.tsx 目标逐字 | #106 QA（列表内容 Loading 不返=环境） | BLOCKED（设备+服务） |
| S32 | 删除/批量清理 | 确认链目标形 + Cancel autofocus 采纳 | #106 负例机检 | BLOCKED（授权测试仓库） |
| S33 | 项目扩展作用域 | 八文件零 delta 复用（本轮零触碰） | #106 复验 | BLOCKED（测试项目） |
| S34 | 项目 LSP | 只读零 delta | #106 复验 | BLOCKED（设备+服务） |
| S35 | HTTP 服务管理 | servers.tsx 目标形 + 移动面在册 | #102 复核（三主机/切换器 PASS；认证面 PARTIAL） | BLOCKED（设备）+ G 门禁 |
| S36 | SSH/指纹/隧道 | #144 零触碰（连接域红线） | #61 主链 + #102 指纹两径复验 | BLOCKED（设备）+ G 门禁 |
| S37 | 每服务器 Shell | controllers.ts 目标形 + 唯一登记偏离（pin config.update 命名，behavior.ts 导出面随行） | #102 线等价核 | BLOCKED（设备+真服务） |
| S38 | 实验开关 | experimental.tsx 目标形 + Sources 行保留偏离（#109 维持） | #64 记录 | BLOCKED（设备） |
| S39 | About/版本/许可 | about.tsx 已批准例外在册；notices/updater 目标逐字 | #110 复验（三行/滚动/链接原位打开） | BLOCKED（设备）+ 真服务版本行 G |
| S40 | 更新/发行说明 | 不实现（ADR 0005）；#110 三负例在册 | #110 复验 | 真实跃迁 BLOCKED（升版轮） |
| S41 | 插件贡献设置 | PluginSettingsSections 双挂载目标逐字 | #109 记录 | BLOCKED（设备）+ G 门禁 |
| S42 | 界面缩放 | 外观页目标逐字；**M-035 目录行 #144 恢复（源码级）**；zoom 行为面零变化 | #104 六档复验 | **F1 源码级 PASS**；设备复验 BLOCKED（设备） |
| S43 | GUI 启停 | extension-manager 在册（第一方）；#144 零触碰 | #109 设备轮（15 行三集/双向启停/持久化） | BLOCKED（设备+服务） |
| N12 | WSL 行可见禁用 | 零触碰（行零控件/决策文案在册） | #109/#62 记录（DOM 级已核） | TalkBack 走查 BLOCKED（设备） |

## 五、F2 —— 探针刷新（第一方脚本，vendored 源码零改动）与工程门禁

基线（开工 c6a31fd 同法同态）：8 探针中 verify-settings-framework / verify-appearance-settings / verify-experimental-settings / verify-notifications / verify-about-version / verify-pinch-shell-settings 六个 rc=1，verify-interface-mode / verify-projects-sessions rc=0。刷新均带归因注释、追踪目标收敛、不放松验收（负锁改写为当前形的正锚或显式退役注记，无一处改为无条件放行）；**vendored 源码零触碰**（F1 两文件除外，属 F1）。

| 探针 | 刷新内容（全部带 issue #144 归因） | 刷新后 rc |
| --- | --- | --- |
| verify-experimental-settings | 组 3：showFileTree/terminalPlacement 锚改退役块形（`Persistence.optional` + terminalPlacement 解码存根注释行；#103 登记偏离随 #140 会话重构退役，消费者 screen-layout.ts/use-session-commands.tsx 引用已消失，schema 保留供旧存储解码）；组 4：model.test.ts 改钉目标「discards retired preferences」断言；组 5：会话时间线文件已目标逐字——`run={joined()}`/`run?: UserRun` 负负翻正、token 负锁退役；组 6：catalog 已毕业形（17 全采纳、sidebar-right 删除、毕业 trash/copy 体）；组 7：data-run-folded 负锁退役改正锚；组 9：token 扫描 in-set 豁免（search-controller/virtualizer/session-timeline-row/message-content，目标形） | **rc=0** |
| verify-notifications | 组 2：permissions 引用集收窄 notifications.tsx 单文件 + **notification.tsx 已目标形**（M-023 桥投递面/权限监听随链退役——见下「M-023 登记」）；投递面锚改为目标形（hasRunningChild、2 sound + 2 system 面、activeNotificationsPort/sessionHref 零命中负锚）；reply 竭尽集语义澄清（wire 级仍 {auto-approve, model}；inbox-model 走 data store 包装面，注释登记）；组 3：M-023 marker 负锚（退役）；组 7：once-call 6→4；组 8：dist 常量 3520/149595730→**5616/149754033**（#144 实测） | **rc=0** |
| verify-about-version | 组 5：btw renderer 零溢出负锚退役（会话域 #145 方向）+ 目标门锚 `enabled: !layout.narrow() && mounted()` 正锚 + mobile.title 复活负锚；M-038 en.ts 残留键保留钉（在册 delta）；goal renderer 改钉 ComposerPill 目标形 | **rc=0** |
| verify-settings-framework | 组 7：#107 时代 timeline-width/sounds-interface 测试断言钉随保留的 hunk 2 退役（改为复活负锚）；组 5 随 F1 自然转绿（available 负锚 + mobile(M-035) 正锚） | **rc=0** |
| verify-appearance-settings | **组 4 保持 rc=1**（R2：desktop-menu 由补丁 54 翻入 .ts、补丁 55 带入 `nextDesktopZoomLevel`，违反 #74/S12 负锁）——不修复、不重剪 overlay；探针头注登记归属（#145/N10 方向）与解除条件（owner 轮重剪 hunk 或改约负锁）；组 9 的 #107 时代测试面钉在组 4 持失败期间不可达，其刷新归 #145 轮（头注已注明） | rc=1（R2） |
| verify-pinch-shell-settings | **组 1 保持 rc=1**（R2，同上；全树 `nextDesktopZoomLevel` 扫描）——探针注释登记归属与解除条件 | rc=1（R2） |
| verify-interface-mode / verify-projects-sessions | 未触（基线 rc=0 维持） | rc=0 |

**M-023 投递面退役缺口（本轮普查新登记，非本轮修复项）**：notification.tsx 随会话链收敛到 v2.2.1 目标形（逐字节，含 hasRunningChild 守卫）后，#23 时代的桥投递面（`activeNotificationsPort().notify(...)` 的 agent/errors/permissions 三路 + 权限监听）在 vendored 树内**零消费者**——现仅存 settings 页 `requestPermission` 一处 seam 消费；系统通知投递退经 web `platform.notify`（在册登记为 Android WebView 结构死点）。属 #148/G33 域（通知运行门禁 owner），已钉入 verify-notifications 负锚与组注；**恢复桥投递面 = 该域 owner 的接线工作**（notifications-platform-delivery 补丁在册 active，载荷为 #23 时代形，重放树 ≠ 工作树该文件——由 session-workbench-upstream 后段收敛，两补丁_targets 不变，闭包仍字节级成立）。

### 工程门禁实跑汇总（全实跑，rc 实测）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| V-patches | `python3 scripts/mobile-patches.py`（= `bun run verify:patches`） | PASS（69 registered） |
| V3 闭包 | `bash scripts/verify-closure.sh` | **PASS**（69 补丁字节级重放，DANGLING=0，V3(a) 树==pin+packageSources+补丁；两修剪补丁重放后与工作树逐字节一致） |
| 幂等 | `bun run patches:refresh` 复跑 | `updated: none` |
| settings 域探针 | 8 个 `bun run scripts/verify-*.ts` | 6 rc=0 + 2 rc=1（appearance g4 / pinch-shell g1，R2 在册，见上） |
| dist 检索（F1 面） | dist chunk 实索 | `settings.appearance.row.zoom.title` chunk 命中且**无 available 字段**（`available:`desktop`` 全 chunk 恰 1 次 = pinch 行 + 1 次 `available:`mobile`` = titlebar 行）；`opencode-ui-zoom-level`/`settings-pinch-zoom` 命中在册 |
| dist 常量三探针 | verify-notifications / verify-commands-menus / verify-gui-plugins 组 8 | notifications rc=0；commands-menus rc=1（组 1 desktop-menu R2 域预存）、gui-plugins rc=1（组 2 btw 预存）——对 base c6a31fd stash 复测**同败同文**（#141「main 预存漂移」同型，归各域 owner，本轮不触） |
| settings 单测 | `cd vendor/upstream/packages/app && bun test --conditions=solid --conditions=browser --isolate --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts src/settings/` | **86 pass / 1 fail / 252 expect()（87 tests / 16 files）**；唯一 fail = `settings search plugin catalog > mounts the search over the real surface plugin handle…`（#105/#107/#108 在册 seam 口径预存项，同名同位） |
| typecheck | `cd vendor/upstream/packages/app && bun run typecheck:tsc`（清 tsbuildinfo 纯净口径） | **415 errors / 50 文件**；对 base c6a31fd stash 双跑分布**逐文件全等**（uniq 计数 diff 为空）——零新增 |
| 构建 | `bun install`（worktree 重建；hoisted linker）+ `bun run build:web` + `bash scripts/copy-web-dist.sh` | build rc=0（5156 modules）；**dist 5616 files / 149,754,033 bytes**（manifest 记录已刷新提交；对 #140/#143 时代 committed 5616/149831838 的字节差含本轮 F1 面 + 重建 churn）；Android web 资产已 staged（assets/web 5592 个 _assets 文件） |
| V-secret | `bun run scripts/audit-secret-persistence.ts` | PASS rc=0（A–G 七段，dist 标记命中） |
| 泄漏扫描 | `bash scripts/leak-scan.sh` | rc=1 = **恰 5 条预存** host-credential.test.ts synthetic fixture 高置信行（:22/:44/:51/:59/:78）+ 7 条文档化 example 过滤——与在册基线同文同数，零新增 |
| Android | `ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` | **BUILD SUCCESSFUL（42 tasks）**；单测 **31 tests / 0 failures（8 文件）**；APK `app-debug.apk` SHA-256 = **`9ed89389d06900d3dd7752fb0f2c617470be908fe8df42846fec3f05c4910757`**（64,362,631 bytes） |

**环境注记**：worktree 全新无 node_modules，`bun install` 默认 isolated 布局下 ui 包对 `@opencode/util/abort`（wildcard export）不可解析 → `bun run build:web` 首跑失败；以 `bun install --linker=hoisted` 重建 node_modules 解决（机器本地环境，不入 git），另建测试期 seam 软链 `vendor/upstream/packages/app/node_modules/@opencode-mobile/mobile-hosts` → 仓库 packages/mobile-hosts（在册测试口径）。

## 六、真机验收（窗口 2026-11-06 08:10–08:40；BLOCKED 登记）

按 AGENTS.md 授权执行：构建、覆盖安装、启动与操作验证。**操作者窗口内已完成的动作**（零 uninstall / 零 pm clear / 零数据清除 / 零远端触碰）：

1. `adb devices` 确认 192.168.3.145:5555 在场（DBY2-AL00）。
2. `adb install -r` → **Success**（数据保留升级；`lastUpdateTime=2026-11-06 08:23:20`；装机 md5 `f1802f66…` 与本地构建 APK md5 逐字一致——构建身份链闭合）。
3. 冷启动：`am force-stop` + `am start` → `ResumedActivity = ai.opencode.mobile/.MainActivity`，无崩溃。
4. 设备态恢复：`cover_enabled` 复原 1（#110 轮收尾值），adb forwards 全部移除。

**BLOCKED（物理环境，非应用缺陷）**：Smart Cover **物理合盖**——Hall 传感器最后事件 1.00（wall 01:22:10，合盖态持续至今），系统 `ShowTpMsgActivity` 全屏覆盖阻断触控（mFocusedWindow 恒为该 sysui 窗口），WebView 页面 `visible:false` 保持 paused（CDP /json 无响应；`cover_enabled` 0/1 切换 + sysui 重启不解除——物理磁吸态优先）。已尝试：WAKEUP/KEYCODE 82/swipe、cover_enabled 双向切换、force-stop systemui、重绑 localabstract forward、应用重启——全部无效；#110 的设置解除路径在本轮物理合盖条件下不复现。

由此**未验收**（逐条 BLOCKED，解除条件 = 物理开盖/移除 Smart Cover 后以同 APK（SHA-256 `9ed89389…`）重开窗口）：

- 九页逐页走查（General / Appearance / Notifications / Shortcuts / Servers / Projects / Experimental / GUI extensions / About）+ 单/多服务器两布局、搜索定位（**含 F1 后 `zoom`/`font` 查询复测**——源码/单测/dist 三层已证命中形恢复：search-results.test.ts 86/1 中 `font`→4、`toContain("settings-zoom")` 用例实跑通过；dist chunk 实证 zoom 行无 available 字段）、控件操作、返回链。
- issue 清单逐项映射的运行面：浅/深色对照、超长名称、键盘遮挡、末行可达、服务器切换保页、加载/保存/失败/retry/取消（真服务路径本归 G 门禁）、偏好即时消费与写后 ≥10s force-stop 持久化、快捷键外接键盘链（.145 无外接键盘，继承 #108 BLOCKED）、GUI 管理标签、WSL 行可见禁用（N12）。
- **QA 前后 localStorage 全量 dump 18/18 逐键比对红线**：本轮无任何应用内交互发生，文件级证据 = `app_hws_webview/Default/Local Storage` 目录 mtime 保持 2026-11-02（install -r 数据保留；settings.v3/hosts.probe/tabs 等键族文件级在册抽验）——但该红线的**语义**（QA 交互后零残留/全等）未被行使，如实登记 BLOCKED，不写通过。
- 引用历史证据的适用性边界：#101–#110 各页设备记录（#104 外观全项、#107 通知、#108 快捷键、#109 GUI、#110 About）描述其**当轮 APK 与树态**；本轮树在 F1（搜索行）与 #140 系迁移（会话/通知/时间线域）之后，未复验前不外推为当前集成版结论——矩阵各行"已实现（未验证/局部验证）"的口径维持。

## 七、遗留与移交（全部显式归属，无静默缺席）

| 项 | 归属 | 解除/激活条件 |
| --- | --- | --- |
| R2：desktop-menu 链两探针 rc=1（appearance g4 / pinch-shell g1；commands-menus g1 预存同域） | #145/N10（session 与 Android 交互） | owner 轮重剪补丁 54/55 的 nextDesktopZoomLevel/desktop-menu hunks 或改约负锁 |
| M-023 桥投递面退役（notify 零消费者；web platform.notify 死点） | #148/G33（通知运行门禁 owner） | owner 轮恢复投递接线并复跑 verify-notifications 负锚轮换 |
| btw 窄屏面 / goal renderer 移动面（探针负锚已退役改目标形） | #145（btw 会话面在计划红线内不触） | owner 轮按目标收敛后核 narrow-screen 入口 |
| 九页真机走查 + 18/18 红线 + F1 设备复测 | #144（本文件 §六） | 物理开盖后同 APK 重开 QA 窗口 |
| 真服务动态面（服务器隔离、Shell 读写、项目保存、供应商授权链等） | #146/#147 的 G 门禁 | 授权测试服务/项目/凭据 |
| verify-commands-menus 组 1 / verify-gui-plugins 组 2 / verify-pairing 组 5 / verify-interaction-quality 组 3 预存 rc=1 | 各域 owner（#141 轮已登记的 main 预存漂移，本轮 stash 复测同败同文） | 各 owner 域刷新 |
