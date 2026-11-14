# v2.2.7 上游对齐执行卡

## 工作单元 / 用户可观察目标

将固定的 Windows Desktop 对齐目标从 v2.2.1 切换到 v2.2.7；保留 v2.2.1 为冻结历史快照；完整记录 v2.2.1→v2.2.7 的 Desktop 与共享前端闭包变化；在不复制 Electron Desktop 运行时的前提下，重建 Android vendor 闭包和移动补丁链。

## 关联记录

- GitHub Issue：[#182](https://github.com/0xYiliu/opencode-mobile/issues/182)
- 当前子工作单元：[#184](https://github.com/0xYiliu/opencode-mobile/issues/184)（连接、配对与 SSH 共享闭包）
- 当前子工作单元：[#185](https://github.com/0xYiliu/opencode-mobile/issues/185)（Home 与新建会话 v2.2.7 对齐）
- 当前子工作单元：[#186](https://github.com/0xYiliu/opencode-mobile/issues/186)（tabs / Inbox / titlebar 与 Android back bridge）
- 当前子工作单元：[#187](https://github.com/0xYiliu/opencode-mobile/issues/187)（timeline / messaging crosswalk 与 panel-motion guard）
- 当前子工作单元：[#188](https://github.com/0xYiliu/opencode-mobile/issues/188)（composer / queue / attachments 重 derive 与归属保护）
- 当前子工作单元：[#193](https://github.com/0xYiliu/opencode-mobile/issues/193)（settings 域 crosswalk 与 absorption audit）
- 当前子工作单元：[#194](https://github.com/0xYiliu/opencode-mobile/issues/194)（gui plugins 窄屏面 crosswalk）
- 当前子工作单元：[#195](https://github.com/0xYiliu/opencode-mobile/issues/195)（notifications crosswalk + 四类别白名单 Android 侧首改）
- 旧版本矩阵：[v2.2.1](../v2.2.1/matrix.md)
- 新版本目录：[v2.2.7](.)

## Provenance revision binding

- #187 轮 implementation revision：`4b86f9b`（panel-motion guard + patch 注册）；registry/absorption revision=`004ed54`；web payload revision=`c8163a3`
- #187 轮 documentation/final revision：本轮 docs-only commit（完整 SHA 在交付报告记录）；当前最终 HEAD 由该 commit 追溯；不改变实现、patch scope、registry/replay 或 BLOCKED/NOT RUN 边界。
- #188 轮 implementation revision：`ede5f54`（#84 `composer-queue-attachments-v2-2-7` 注册 + #12/#19/#20 翻转 absorbed + probe v2.2.7 重锚定）；web payload revision=`4fa3d3e`；documentation/final revision=本轮 docs-only commit（完整 SHA 在交付报告记录）；不改变 BLOCKED/NOT RUN 边界。
- #192 轮 implementation revision：`c57f238`（commit 1，#86 `providers-models-usage-v2-2-7` 注册 + rows 65/69/71 翻转 absorbed）；probe 重锚定 revision=`3da3e72`（commit 2）；web payload revision=`be1cfd7`（commit 3）；documentation/final revision=本轮 docs-only commit（完整 SHA 在交付报告记录）；不改变 BLOCKED/NOT RUN 边界。
- #193 轮 implementation revision：`c5e83db`（commit 1，#87 `settings-v2-2-7` 注册 + 18 rows 翻转 absorbed）；probe 重锚定 revision=`38a9ef5`（commit 2，settings 域六探针 + 负注入）；web payload revision=`9bd974b`（commit 3，5630 files / 155,851,603 bytes）；documentation/final revision=本轮 docs-only commit（完整 SHA 在交付报告记录）；不改变 BLOCKED/NOT RUN 边界。
- #195 轮 implementation revision：`8f91de3`+`298db34`（commit 1 两笔，mobile-hosts 四类别 + Kotlin 桥 questions 类别/频道）；vendor/registry revision=`09e3773`（commit 2，#89 patch 注册 + rows 21/22/23/24 翻转 absorbed）；web payload revision=`059e7d1`（commit 3，5630 files / 155,881,892 bytes + 三探针 dist 常量回填）；probe 重锚定 revision=`93e6235`（commit 4）；documentation/final revision=本轮 docs-only commit（完整 SHA 在交付报告记录）；不改变 BLOCKED/NOT RUN 边界。
- 前轮（#186）binding：implementation/fix revision=`9cafaba249efbe35110988b18e2977a9c9aac04e`；documentation/final revision=`b6568fe`（完整 SHA `b6568fefef7de076b1f9fcd617130ebd63fc432e`）——保持历史有效。

## 基准与工作区

- 绝对工作目录：`/home/peterhan/.local/share/opencode/worktree/a66c79/feat-upstream-227-tabs-inbox-titlebar`
- 分支：`feat/186-tabs-inbox-titlebar`
- 父轮审计起点：`5b7f1ac1d1b707db36f6fde6e768dc4f06e3063a`（#184/#185 已进入 main 的 v2.2.7 closure 基线）
- 本次实施 base：`5b7f1ac1d1b707db36f6fde6e768dc4f06e3063a`；reviewed/fix revision=`9cafaba249efbe35110988b18e2977a9c9aac04e`；提交已存在，尚未推送、创建 PR 或合并
- 本次实施 worktree：`/home/peterhan/.local/share/opencode/worktree/a66c79/feat-upstream-227-tabs-inbox-titlebar`
- 本次实施分支：`feat/186-tabs-inbox-titlebar`
- 开工状态：该 worktree 由本子工作单元独占；前三个 active patch payload/hash/order 作为硬不变量保留，#186 active patch 已在审核修复后更新 hash 与对应文档/验证记录
- 上游旧目标：v2.2.1 / `3ebcf9a32c7b28f658cfee80775448929361727a`
- 上游新目标：v2.2.7 / `fedc6f208aa2bd54c1019227214568083f6380ad`
- 新目标发布时间：2026-11-10

## 当前 vendor 与补丁基线

- 全局 vendor pin：`fedc6f208aa2bd54c1019227214568083f6380ad`（v2.2.7）
- 当前 `packageSources`：空；11 个 closure package 均从固定 v2.2.7 目标提取
- 当前移动补丁：84 registered / 6 active / 29 absorbed / 49 deferred（#188 轮：新增 `composer-queue-attachments-v2-2-7` active、#12/#19/#20 翻转 absorbed；#187 轮翻转记录保持历史）；`vendor-manifest.json#closurePatches` 先重放 build-only closure 修复，`vendor-manifest.json#mobilePatches` 按顺序重放 #184 consolidated overlay、继承自 origin/main 的 `server-edit-touch-compatibility` patch、#185 `home-new-session-v2-2-7` patch、#186 `tabs-inbox-titlebar-v2-2-7` patch，再重放 #187 `timeline-messaging-v2-2-7` patch；#184 overlay 仍只包含 24 个 scoped targets
- 当前客户端身份：Android/mobile `2.2.7`，versionCode `20207`；vendor app 包为 `2.2.7`
- 当前补丁登记门禁：`python3 scripts/mobile-patches.py` PASS（83）
- 当前闭包门禁：`bash scripts/verify-closure.sh` PASS；该结果来自 pristine v2.2.7 tree、closure patch、#184 scoped overlay、inherited main server-edit patch、#185 Home patch、#186 back bridge patch 与 #187 panel-motion guard patch 的有序重放和等价性核对。
- 当前 scope audit（`git status --porcelain=v1 -uall`）：#185 代码增量限于 Home fade helper/test、view import/use、patch registry/provenance/vendor order、生成 Web manifest 与本执行卡/设计记录；typecheck 产生的未跟踪 declaration artifacts 已清理，未保留 `.tsbuildinfo`、`node_modules`、`dist`、`.vite` 或 `.turbo` 作为交付文件。

### #194 当前执行状态

- 目标：gui-plugins 窄屏/管理面 v2.2.7 crosswalk 收口——四条 retired payload（rows 36/37/38/66）的吸收核对 + 幸存窄屏 delta consolidated 重 derive（active `gui-plugins-v2-2-7` #88，11 targets：D1 btw 命令门+mobile face 80、D2/D3 panel-id dispatch+btw/model.ts `saved` accessor（第 10 target）、S1 sources mobile face 60/gate-off fallback/turn dispatch/panel.* i18n、S2 Experimental Sources 行（setSourcesEnabled knob-accessor 写路径）+ en/zh row.sources.*、F6 details flyout open-state 扁平化）+ 五探针修订（verify-gui-plugins 重锚定、verify-goal-sources 全量重写、verify-browser/verify-debug-bar 重锚定、verify-experimental-settings 增补）+ rows 36/37/38/66 翻转 absorbed。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--194-gui-plugins`，分支 `feat/194-gui-plugins`，base `418918e`（#193 链尾，stacked chain main a25ab51 → #187 → … → #193；PR #203–#209 open）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a32c7b28f658cfee80775448929361727a`、v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。历史 payload（session-goal-sources-panels/gui-plugins-api-migration/session-btw-narrow-entry/extensions-flyout-webview.patch）全量读过再 derive；旧 patch 文件磁盘零触碰。
- c0 基线（coordinator 记录，引用不重 derive；当轮首跑逐字复现）：verify-gui-plugins FAIL「2: per-plugin contract.ts set …missing=[] extra=["review"]」、verify-goal-sources FAIL「1: sources/renderer.tsx lost the mobile face (NEGATIVE 2 target)」、verify-browser FAIL「2: unexpected @opencode plugin/gui specifier "gui-plugins/terminal" in …desktop-menu.test.ts」、verify-debug-bar FAIL「1: renderer.tsx lost the bar Show gate (visible() || memoryState()?.on)」（四者 = 重锚定目标；fail-fast 之下 btw M-038 anchors 为 latent sequential failures——实际 sequential reveals 在探针头注逐条 old→new 登记：contract 集、extension-plugins face、W3 root/shell 形、localStorageView、publication/isolation 注记、terminal 3-remove、icon redirect 例外）；gui-plugins goal/btw/details/context **118/0/432/12**、files 域 **430/0/1337/36**、mobile-hosts **446/0/3034/40**、Set A **396/5/1793/30**、13-file **136/0/389/13**、session-ui 6-file **112/0/355/6**（4 条 timeline machine test 文件 v2.2.7 不存在，#193 在册）；17 probes rc=0；15 pre-existing rc=1 untouched。
- **索引口径（C6，钉定）**：manifest row 编号 1-based——row 36 `session-goal-sources-panels`=manifest index 35、row 37=index 36、row 38=index 37、row 66 `extensions-flyout-webview`=index 65、row 54 `webview-url-polyfill`=index 53、新 row 88=manifest index 87；mobile-view 宿主机器位于 `app/src/runtime/plugin/host-layout-machine.ts:122`（createMobileViewState），经 host-apis.tsx 消费。
- **评审修正折入（C1–C7）**：C1 gui-plugins compose 恒 15 builtins（两 pin 同形；review 非新插件——新的是 `review/contract.ts:31 Contract.define`，verify-gui-plugins 组 1 未动、仅组 2 contract 集 []→["review"]）；C2 browser 域 crypto.randomUUID 12 处 recorded not fixed（owner #199/browser；`fef232392d` 吸收只覆盖 6 处已迁移 renderer 站点）；C3 btw/model.ts 第 10 target（`saved` accessor；v2.2.7 createBtw 不导出 saved 列表）；C4 行 36 幸存 delta=SettingsRow+data-action+i18n +2 键（storedToggle/setStoredToggle v2.2.7 不存在——写路径按 C5 重 derive 非保留 API）；C5 knob 写路径=session-ui experiment.ts accessor（单注册实例捕获；禁 re-register `motionTuning.toggle("sources.enabled")`——Map.set clobber 会致行显 ON 而实验 off；debug 面经 subscribe 同步）；C6 命名/索引口径（见上）；C7 F6 口径（v2.2.7 polyfills.ts 无 URL.canParse；row 54 context-stale；W19 前置 owner #199 行，disposition deferred/not-fixed）。
- 交付物：commit 1=`c00f1b4` feat(vendor)（#88 patch 11 targets——D1/D2/D3/S1/S2/F6 如上；registry 88/10/58/20 + patches:refresh；4 rows 翻转 absorbed + row 1/54 audit notes）；commit 2=`6773e49` fix(probes)（五探针修订，old→new ledger 在探针头注/行内；负注入：verify-gui-plugins NEG 6–9、verify-goal-sources NEG 1–3、verify-browser specifier 注入、verify-debug-bar motion-gate 注入，各 inject→FAIL→restore→PASS）；commit 3=`3fa246d` chore(web)（payload 5630 files / 155,863,020 bytes + verify-gui-plugins dist 基线回填 5630/155851603→5630/155863020，同 5630 文件数 +11,397 bytes 入既有 chunks）；commit 4=本轮 docs commit（changes.md #194 section、matrix header + S41/S43/N11/W19/W21/W22/W23 增量、patch-dispositions row 88 + 4 行翻转 + row 1/54 注记、current-review #194、build-and-verify.md #194 段、本卡）。
- 停止条件结果：零 S 类触发——STOP 条款未触发（btw/sources 机器测试 118/0/432/12 恒同：门变更只影响窄布局命令可达性，machine 测试不断言 narrow 项；无不可归因门失败）；闭集语义全保留（order 集合恰等、specifier map/openExternal 闭集、NEGATIVE 注入证明 teeth）；无 scope/registry/安全策略变更。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → **PASS (88 registered; updated: none)**；`python3 scripts/test_mobile_patches.py` → **Ran 9 tests … OK**；`bash scripts/verify-closure.sh` → **PASS**（V3(a) byte-identical 含 #88 按序重放、DANGLING=0；V3(b) DANGLING=0）；`git diff --check` PASS；五探针 rc=0：verify-gui-plugins / verify-goal-sources（重写）/ verify-browser / verify-debug-bar / verify-experimental-settings；known-green rc=0 集：verify-diff / verify-files / verify-open-external / verify-permission-requests / verify-terminal / verify-provider-models / verify-about-version / verify-settings-framework / verify-interface-mode / verify-appearance-settings / verify-pinch-shell-settings / verify-agent-capabilities / verify-pierre-webview-compat 14/0 / **verify-ssh + verify-direct-connection + verify-attachments-artifacts（commit 3 后复跑 rc=0——pre-build ENOENT 环境依赖沿 #190–#193 登记）**；pre-existing rc=1 首 FAIL 恒同（interaction-quality=组 2 titlebar history.back、notifications=组 1 isSessionUnread、commands-menus=组 1 resetZoom、service-ops=entry.tsx bridge、projects-sessions=archive stub、session-workbench=linear interrupt、pairing=组 5 clipboard、recovery=组 5 reconnect、artifacts=start fence、credential-ref=stale import、credential-vault=hydration block、connection-inline-ssh=missing ssh mode、inline-ssh-device=CDP refused、webview-url-compat.test 3 fail、password-keyboard.test 2 fail @:23/:38——诸探针 input 文件与 #194 diff 零交集，构造性不变）。**#195 errata**：上句 pairing/recovery 两条摘要为陈旧口径——实际首 FAIL 为组 2 串（pairing=「2: scanner.tsx lost the rejected-codes map declaration」、recovery=「2: persist.ts lost the 100ms save-debounce constant」），#195 记录并经 base `21531ad` 复跑构造性确认在册）。
- 套件（当轮实跑）：gui-plugins `bun test src/goal src/btw src/details src/context` → **118 pass / 0 fail / 432 expect / 12 files** 恒同；gui-plugins files 域 `bun test src/file src/review src/microsoft-office` → **430 pass / 0 fail / 1337 expect / 36 files** 恒同；session-ui `bun test src/sources` → **11 pass / 0 fail / 71 expect / 2 files**（c0 首轮实测口径）；Set A（30 文件双条件形，命令见 build-and-verify #190 段 Gate A）→ **396 pass / 5 fail / 1793 expect / 30 files** 恒同（5 条 pre-existing 同名同位）；mobile-hosts → **446 pass / 0 fail / 3034 expect / 40 files** 恒同；settings 套件 → **84 pass / 0 fail / 229 expect / 8 files** 恒同。
- 构建与 payload：`bun run build:web` rc=0 → `bun run copy:web-dist` → **5630 files / 155,863,020 bytes (verified)**（committed 前值 5630/155,851,603，同文件数 +11,397 bytes）；`python3 scripts/android_web_assets.py verify` → verified rc=0；web payload revision=`3fa246d`（web-dist/manifest.json 刷新 + scripts/verify-gui-plugins.ts dist 基线回填同 commit——rebuild-round 前例）。
- Gradle（build-only）：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL in 21s**（42 tasks）；JVM 单测 **10 suites / 47 tests / 0 failures / 0 errors / 0 skipped**（10 XML）；debug APK SHA-256 **`25bb091e1951f32db4984176885693fc45460f6ee769352da3c83ce00c5ebb38`**（以 66,213,395 bytes 在册；全值见 build-and-verify #194 段）；**未安装**。
- BLOCKED/NOT RUN（解除条件）：btw 窄屏入口（More 抽屉 order 80 项、最近 chat 呈现、mobile.none 空态）、sources 抽屉入口（order 60、gate-off fallback、最近 turn 面板）、Settings Sources 行开关真实翻转、details flyout WebView 114 呈现——归 **G25/G28/G35 设备门禁，NOT RUN，解除条件=授权设备**；goal-pill AbortSignal.any BLOCKED 不变（S41/W22 行；解除条件=WebView ≥116 或 polyfill 决策）；browser 域 crypto.randomUUID/URL.canParse 平台前置 owner #199/browser（recorded not fixed）；本轮不声称任何设备/真实服务/runtime 验证。typecheck 维持在册 known-baseline 失败集，本轮未声称通过。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；本轮零 S 类触发。

### #195 当前执行状态

- 目标：notifications 面 v2.2.7 crosswalk 收口——四条 retired payload（rows 21/22/23/24）的吸收核对 + consolidated 重 derive（active `notifications-v2-2-7` #89，6 targets）+ **本轮 Android 侧首改**（questions 通知类别：mobile-hosts `NOTIFICATION_CATEGORIES` 恰四类 + Kotlin `CATEGORIES` 镜像与 `notifications-questions` 频道；scope 恰白名单扩展——op 白名单 {notify, requestPermission} 不变，零 keepalive/前台服务/推送）+ verify-notifications v2.2.7 全量重锚定（5 条负注入）+ rows 49/72 注记。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--195-notifications`，分支 `feat/195-notifications`，base `21531ad`（#194 链尾）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a3…`、v2.2.7=`fedc6f208a…`）与 `~/.cache/opencode-upstream`（无 tag，用 SHA）。历史 payload（app-notifications-bridge/notifications-platform-delivery/notifications-webview-focus-gate/settings-notification-permission.patch）全量读过再 derive；旧 patch 文件磁盘零触碰。
- c0 基线（coordinator 记录，引用不重 derive；当轮首跑逐字复现）：verify-notifications FAIL「1: notification.tsx lost the isSessionUnread server-authoritative watermark」（重锚定目标）；verify-permission-requests PASS rc=0；verify-service-ops rc=1 首 FAIL「vendored entry.tsx: app-service-operations-bridge wiring missing (createWebMessageServiceOpsTransport)」（input 与本轮 diff 相交，落地后显式复跑恒同）；App notifications 焦点集 **29/0/87/3**；mobile-hosts **446/0/3034/40**（browser conditions 必须）；Set A 396/5/1793/30；registry PASS(88)/closure PASS；21 rc=0 / 15 rc=1 pre-existing lists。
- **评审修正折入（R1–R5）**：R1 两条降级模式（无白名单扩展时 questions 投递在 client.ts validate() :147/:163-164 JS 拒绝 {posted:false, code:"io"} 先于桥；同 tag 替换形态（tag=category, id=route.hashCode()，Kotlin :332-333）仅在 questions 被折叠进既有类别时适用——设计结论不变，两侧白名单同加）；R2 dependsOn 钉全同目标前序集（78/81/83 entry.tsx 载体 + 86/87 i18n 载体），追加为 mobilePatches 第 11 项；R3 request 面传 `target`（上游解析根会话，notification.tsx:363-365/:397）非 sessionID——tap 路由严格对齐上游导航（agent/errors 面用 sessionID）；R4 row 72 note＝490739afe7 本体触及 toast.tsx（quota-failure 通知 createEffect 为 pin 原生面），vendored toast.tsx 与 pin byte-identical——无需移动侧 toast.tsx carrier（初稿「经 persistence 层呈现，非 toast.tsx diff」为错误归因，勘误在册）；R5 web.ts notify 死点在 vendored :46。
- 交付物：commit 1a=`8f91de3` feat(mobile-hosts)（恰四类 + 序锁测试 + questions 投递用例；op 白名单零变更）；commit 1b=`298db34` feat(android)（CATEGORIES 四类 + channelTitle questions 分支/else→errors 保留 + 类 doc 更新；hasWindowFocus/areNotificationsEnabled/PendingIntent 零变更）；commit 2=`09e3773` feat(vendor)（#89 patch 6 targets；rows 21/22/23/24 翻转 absorbed；registry 89/11/62/16 + patches:refresh）；commit 3=`059e7d1` chore(web)（5630/155,881,892 + verify-gui-plugins/verify-commands-menus/verify-notifications 组 8 回填）；commit 4=`93e6235` fix(probes)（全量重锚定 + 5 负注入）；commit 5=本轮 docs commit（changes.md #195 section、matrix S18/S19/M05 增量、interaction G33 增量、patch-dispositions row 89 + 4 行翻转 + rows 49/72 注记、current-review #194→#195、build-and-verify.md #195 段、units/notifications.md ①③④⑨+状态行、本卡）。
- 停止条件结果：零 S 类触发——closure replay 一次通过（entry.tsx/i18n 锚无冲突）；verify-service-ops 首 FAIL 字符串恒同；vendored shell/notifications 焦点集 29/0/87/3 恒同（无不可归因失败）。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → **PASS (89 registered; updated: none)**；`python3 scripts/test_mobile_patches.py` → **OK（9/9）**；`bash scripts/verify-closure.sh` → **PASS**（V3(a) byte-identical 含 #89 按序重放、DANGLING=0）；`git diff --check` PASS；verify-notifications **rc=0**（重锚定后）+ verify-permission-requests rc=0（保持）；known-green rc=0 集共 23（22 脚本探针 + pierre-webview-compat.test 14/0）——#194 的 21 全保持；rc=1 共 14 条首 FAIL 与 base `21531ad` 同态（pairing/recovery 经 base 树复跑构造性确认；service-ops 落地后显式复跑恒同；commands-menus 组 8 回填后总体 rc 保持 1——#190 前例）；tsc 双跑零新错误种类（entry.tsx TS2352 已知类 +2 实例＝M-022 注册块两次 EventListener cast，同形在册）。
- 构建与 payload：`bun run build:web` rc=0 → `bun run copy:web-dist` → **5630 files / 155,881,892 bytes (verified)**（committed 前值 5630/155,863,020 = #194，同文件数 +18,872 bytes 入既有 chunks）；`python3 scripts/android_web_assets.py verify` → verified rc=0；web payload revision=`059e7d1`。
- Gradle（未安装）：commit 1 门 `:app:assembleDebug` → **BUILD SUCCESSFUL in 10s**（36 tasks）；commit 3 门 `:app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL in 5s**（42 tasks）；JVM **10 suites / 47 tests / 0 failures / 0 errors / 0 skipped**；debug APK SHA-256 **`7823972604ec83d2d1e09ccef19ce2110ce7bf279f17c27618ca67b8b8e71d6d`**（67,003,608 bytes）；**未安装**。
- BLOCKED/NOT RUN（解除条件）：questions 通知真实投递/声音/tap 路由、前台抑制/后台到达、四开关真实翻转与状态行、notifications-questions 频道呈现——归 **G33②③④⑤⑩ 设备门禁，解除条件＝授权设备 + 授权远程服务**；本轮不声称任何设备/真实服务/runtime 验证。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；本轮零 S 类触发。

## 历史 #185 Home / new-session 执行卡

- 用户可观察目标（历史 #185）：以 fixed v2.2.7 为来源，对齐 Home server/project selection、session load/search/row、new-session location/project/workspace/branch 与远端 worktree picker 的目标状态机；保持既有项目身份、最近使用和恢复契约，不把它们重复算作当前 #186 新增语义。
- 上游核对：Issue #185 的 50-file allowlist 已与 `fedc6f208aa2bd54c1019227214568083f6380ad` 逐文件 byte-compare；allowlist 内目标文件已由 v2.2.7 vendor pin 携带。历史 `project-identity-migration`、`home-new-session-parity`、`ui-typeahead-export` 保持 deferred，不作为本轮 source patch 重放。
- 本次必要移动差异：`home-new-session-v2-2-7.patch` 只抽取 `home/projects` fade threshold，接入 `view.tsx`，并以 top/middle/bottom/one-pixel tests 锁定 DOM edge attributes；patch SHA-256 为 `fa67c5df3ef687c397727106f3188e55933a5c51431b9cf2e1e25c7a29d0436d`。它排在 closure → #184 → server-edit 之后，targets 与既有 #184/server-edit active patches 不重叠。
- 正常/失败/恢复范围：Home 覆盖 cached/stale/loading/error/retry、server/project identity 与 late-result disposal；session search 覆盖 found/missing/failed/timed-out/closed/disposed；row 覆盖 long-press/menu、rename cancel/failed/late answer；new-session/picker 覆盖 branch→worktree、location history/back/cancel、directory lookup queue、combobox/tree/selection、worktree/MCP/session timeout、rollback 与 stale attempt。项目身份/最近使用持久化不改写。
- 验收：focused app selection baseline **200 pass / 0 fail / 700 expect / 17 files** → post-change **204 pass / 0 fail / 704 expect / 18 files**；Web build、patch registry、closure、Android asset verify、Gradle unit/APK 均通过。设备/真实服务的完整新建会话、worktree picker 触摸、重启/切网恢复和直连/SSH 双路由仍归 G19/G30，当前标为 BLOCKED/NOT RUN。
- 授权与停止条件（历史 #185）：不创建 PR、不推送、不合并；若出现需要改变项目身份/最近使用语义、Android 入口范围或安全策略的取舍，停止并记录，不在 #185 内私自扩展。

## #186 tabs / Inbox / titlebar 执行卡

- 用户可观察目标：固定核对 v2.2.1→v2.2.7 的 tabs、Inbox、titlebar、mobile-tabs drawer、route/history/tab promotion/load/rename、Inbox scroll anchor/scrollTop、Working shelf start-time sort、SessionTabAvatar/ActivityRing 分离、narrow safe-area 兼容；确保这些 shared production changes 不被错误 deny。
- 上游 crosswalk：`changes.md` 的 #186 section 逐 commit/逐文件记录 fixed source；`runtime/plugin` panels/side-region/panel-trigger、tabs CSS、全部 touched locale、Inbox mock fixtures/tests、shell/titlebar/tabs/state/routes/session/avatar/activity-ring allowlist 均与 `fedc6f2` byte-identical，处置为 **absorbed / no production overlay**。Timeline/Composer/Files/Terminal/Notifications、Desktop/Electron/native window、#185 与 #164–#168 为 deny scope。
- 本次必要移动差异：现有 `MainActivity`/`BackDispatchPolicy` 保留旧 `true`/fallback 外部语义，但补齐受控 main-frame app-origin request（version=1/type=back/opaque requestId≤256 bytes）、one-pending、stale/duplicate/destroy fail-closed 生命周期；新增 `tabs-inbox-titlebar-v2-2-7` 仅含 app-side back chain/binding。`entry.tsx` 与 #184 是 shared file，明确 `dependsOn` 三个前三 patch，payload 只含 distinct binding hunk。
- back chain：IME 由系统优先；app chain 为 dialog→popover→panelDrawer→dockPanel→titlebarMore→goBack；每次只消费一层，所有 false/null/error/timeout 回到原 `canGoBack/goBack→super` fallback。chain 不调用 `session.interrupt`/`abort`、`inbox.cancel`、`pty.remove`、`kill`，running session + pending Inbox negative path 保持 no-op。
- 正常/失败/恢复：tab close/menu/rename/reopen、New tab launcher、last side-region close、Inbox open-session scroll restore、two-run Working sort、mobile tabs drawer、route/history promotion/load/rename、avatar/ring separation 为 fixed-source absorbed behavior；back 的 malformed/wrong version/type/extra secret/oversize/wrong origin/timeout/stale/duplicate/destroy 均 decline 到原 fallback。
- 验收（修复后 #186）：app focused tabs/Inbox/back **138 pass / 0 fail / 383 expect / 13 files**；mobile-hosts、back-handler、Android BackDispatchPolicy + Gradle unit/APK、Web build/copy/assets/closure/patch registry 结果绑定修复后 revision；E2E tabs/side-panels 本轮受 fixture/dev-server 依赖与 120s budget 限制，未记为 PASS；设备/adb back/safe-area/real running session/predictive back/full typecheck **BLOCKED / NOT RUN**。
- 先前三 patch 硬不变量：#184 `6b3b7ab713189bdbfcce9ea3222aee480576ae55b3c504e35889a6c55d341b94`、server-edit `89c7984311d897935782f56708ca3ce7d34e83193af2bb60ff5670a1800fe6f0`、#185 `fa67c5df3ef687c397727106f3188e55933a5c51431b9cf2e1e25c7a29d0436d`；修复后 #186 `1a267f74048fb0405ee9cf3fcf5ab3bb5a87547edb1f260378c25f4505325ae2`。前三 targets/order/behavior unchanged。
- 授权与停止条件：修复提交已存在，只保持不 push、不创建 PR、不合并；没有设备/真实服务时不声称 Android runtime、safe-area、hardware back、running session、predictive back 或 Windows runtime 通过；不声称 full typecheck。

## #187 timeline / messaging 执行卡

- 用户可观察目标（#187）：固定核对 v2.2.1→v2.2.7 的 timeline 与消息呈现（timeline cache/paging、user message actions 菜单族、session-ui 状态机族、markdown fragment links、session read/unread menu、session content search、composer/e2e/i18n/context 辅路径）未被错误 deny 且不被复制成第二份 overlay；落定唯一必需的移动 delta——session panel-motion 的 WebView 114 `:dir()` capability guard（旧 Android WebView 对 `matches(":dir(rtl)")` 抛 SyntaxError 会把整个壳带到错误屏，`isRTL` try/catch 回落 LTR 分支）。
- 基准与上游审计：pass-1 路径集（`packages/app/src/session`、`packages/app/src/shell/commands`、`packages/session-ui/src`）294 entries = 147 A + 138 M + 8 D + 1 R100 → 286 present → 285 SAME + 1 DIFF（`session/screen.tsx`，#186 back-chain hunk，非本期 delta；计划期记录为 285/284，与重放差 1 条清点口径，以上列命令当轮重放为准）；pass-2 路径集（`packages/app/src/composer`、`packages/app/e2e`、`packages/session-ui/component-tests`、`packages/ui/src/context`、`packages/ui/src/i18n`、`packages/app/src/runtime/i18n`）357 entries = 219 M + 39 A + 84 D + 15 R → 273 present → 273 SAME；absence 负检 108 项（D + rename 源）0 present。逐 commit crosswalk 与 deny audit 见 [changes.md](changes.md) #187 section。
- 本次必要移动差异：`timeline-messaging-v2-2-7.patch`，targets `packages/app/src/shell/panel-motion.ts` + `panel-motion.test.ts`；从退役 `session-android-adaptation` 重基（历史 `mobile(A, issue #126)` marker 原文保留在该退役文件，重落 guard 带 `mobile(timeline-messaging-v2-2-7, issue #187)` marker），SHA-256=`602b9ac14bc06d4f19e605e1fccc11d88a6a6f1cd753721b494c57fe8a0b1a99`；`dependsOn` 前四个 active patch，追加为 `mobilePatches` 第 5 项（replay：closure → #184 → server-edit → #185 → #186 → #187）。#197 不得双落该 guard。
- registry/absorption：83 registered / 5 active / 26 absorbed / 52 deferred；7 条 deferred 翻转 absorbed（rows 56/57/60/63/64/74/75；载体=v2.2.7 vendor pin byte-identity / active `timeline-messaging-v2-2-7`（panel-motion）/ active `tabs-inbox-titlebar-v2-2-7`（row 75，7 targets 为其 8 targets 子集仅缺 `titlebar/history.ts`））；5 条 deferred 加「本轮未触碰 + owner」routing note（`session-goal-sources-panels`→goal/sources、`session-media-source-safety`→composer/media #188/#196 lineage、`settings-experimental`→settings/experimental、`gui-plugins-api-migration`→gui-plugins/extensions、`project-identity-migration`→identity #140 lineage），状态不翻转。
- 提交链：`4b86f9b`（feat(vendor): re-base WebView 114 panel-motion `:dir()` guard for issue #187）→ `004ed54`（chore(vendor): retire absorbed session timeline/messaging deferred payloads #187）→ `c8163a3`（chore(web): rebuild web payload for #187）→ 本 docs 提交（final HEAD 由该 docs-only commit 追溯）。worktree `/home/peterhan/worktrees/opencode-mobile/feat--187-timeline-messaging`，分支 `feat/187-timeline-messaging`，base=`a25ab51`（origin/main）。提交已存在，尚未推送、创建 PR 或合并。
- 验收（当轮实跑，verbatim）：
  - A（`vendor/upstream/packages/session-ui`，plain `bun test`，9 文件 = rows-current/projection/steer-arrival-machine/turn-phase-machine/user-runs/action-machine/compaction-entrance-machine/paced-text-machine/markdown-fragment-links）：**139 pass / 0 fail / 436 expect / 9 files**——基线持平，零新失败。
  - B（`vendor/upstream/packages/app`，canonical plan §4 B 14-file 命令，plain 与 `--conditions=browser --isolate` 两形同数）：**182 pass / 0 fail / 704 expect / 14 files**——计划基线 180/702 恰 +2（isRTL throwing-WebView 与 RTL-support 两测试），零失败。集合 = `session/timeline/{cache-machine,cursor-machine,history-machine,reconnect-machine,search-machine,quote-machine,machine,cold-mount,controller-projection,model,turn-diffs}` + `session/{viewed-machine,message-id-from-hash}` + `shell/panel-motion`；逐字命令见 [build-and-verify.md](../../../build-and-verify.md) #187 段。
  - C（`bun test --conditions=browser packages/mobile-hosts`）：**446 pass / 0 fail / 3034 expect / 40 files**——基线持平。
  - D：`python3 scripts/mobile-patches.py` **PASS**（83 registered；5 active / 26 absorbed / 52 deferred）；`python3 scripts/test_mobile_patches.py` **OK（9/9）**；`bash scripts/verify-closure.sh` **PASS**（#187 patch 有序重放、byte-identical、DANGLING=0）；`git diff --check origin/main...HEAD -- . ':(exclude)vendor/upstream/patches/**'` **PASS**。
  - E：`bun run build:web` **PASS**（rc=0，14.52s）；`bun run copy:web-dist` **PASS**（**5520 files / 155,503,085 bytes** verified——文件数与上一代相同）；`python3 scripts/android_web_assets.py verify` **PASS**；`web-dist/manifest.json` 已变更并提交（117 chunk 改名 + 27 同名哈希刷新：141 sourcemap + index.html/sw.js 及面板族 chunk 因 panel-motion guard 级联改名；`isRTL` guard 与 `timeline-messaging-v2-2-7` marker 实证存在于构建产物 `host-apis-*.js(.map)`）。
  - F：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` **BUILD SUCCESSFUL**（36s）；JVM 单测 **47 tests / 0 failures / 0 skipped**（10 XML）；APK `android/app/build/outputs/apk/debug/app-debug.apk` SHA-256=`b5332707401a5da2584e753edf4559bf3fc98a2ec74b78e3cdd8dd7fd2d187dd`（**66,052,781 bytes**）。**未安装**。
- BLOCKED / NOT RUN（设备边界）：WebView 114 真机 `:dir()` 崩溃场景回归、面板开合 RTL/RTL-less 实机走查、长历史会话 UX、menu 触摸、锚点跳转、真实运行会话均 **NOT RUN**；无设备/授权服务，不声称任何 Android runtime 通过。typecheck 维持在册 known-baseline 失败集，本轮未声称通过。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。出现需要改变补丁 scope、registry 语义或安全策略的决策时停止并记录。



以下四组是本轮实际执行、可在当前 worktree 直接复跑的稳定选择，不是从聚合日志推算的数字。

- 公共环境：绝对工作目录 `/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`；本轮验证基准 HEAD `55df2e39f591369a01ce9647b2b4c7fe59ce11b5`，当前为其后的 diff-check 口径修复提交；Linux `7.0.0-38-generic x86_64`；Bun `1.4.2`（测试输出标识 `744846f84`）。测试使用仓库 fixture 与 Happy DOM preload，不使用真实凭据、Android 设备、QR physical、真实远程服务或 JSch/Windows runtime。

### App connection/server/pairing

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/app`
- 条件与 preload：`--conditions=solid --conditions=browser --isolate`；`../ui/test/solid-jsx.ts` 和 `./happydom.ts`。
- 显式文件清单（16 files）：`src/providers/connect/remote.test.ts`、`src/runtime/server/api.test.ts`、`src/runtime/server/client.test.ts`、`src/runtime/server/errors.test.ts`、`src/runtime/server/health-machine.test.ts`、`src/runtime/server/health.test.ts`、`src/runtime/server/machine.test.ts`、`src/runtime/server/persistence.test.ts`、`src/runtime/server/registry-hydration.test.tsx`、`src/runtime/server/registry.test.ts`、`src/runtime/server/request-queue-machine.test.ts`、`src/runtime/server/server-sync/endpoint-machine.test.ts`、`src/runtime/server/server-sync/machine.test.ts`、`src/servers/connect/machine.test.ts`、`src/servers/connect/pairing.test.ts`、`src/servers/connect/scanner-machine.test.ts`。
- 精确命令：

```bash
bun test --conditions=solid --conditions=browser --isolate --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts src/providers/connect/remote.test.ts src/runtime/server/api.test.ts src/runtime/server/client.test.ts src/runtime/server/errors.test.ts src/runtime/server/health-machine.test.ts src/runtime/server/health.test.ts src/runtime/server/machine.test.ts src/runtime/server/persistence.test.ts src/runtime/server/registry-hydration.test.tsx src/runtime/server/registry.test.ts src/runtime/server/request-queue-machine.test.ts src/runtime/server/server-sync/endpoint-machine.test.ts src/runtime/server/server-sync/machine.test.ts src/servers/connect/machine.test.ts src/servers/connect/pairing.test.ts src/servers/connect/scanner-machine.test.ts
```

- 实际结果：**137 pass / 0 fail，403 expect calls，16 files，2.22s**。

### Inherited server-edit touch compatibility

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/app`
- 精确命令：

```bash
bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/servers/servers-page.test.tsx
```

- 实际结果：**9 pass / 0 fail，38 expect calls，1 file**；恢复并适配 origin/main 的服务器页回归覆盖（General/List、availability/health gating、unauthorized Authenticate、Shell `data-action`、selected/non-selected action naming、edit dialog mode/server/onSave），并覆盖 Android host 350ms 延迟与非 Android 立即编辑两条路径。

### Diff-check boundary

- `git diff --check origin/main...HEAD` 不能记为无条件 PASS：该命令对 6 个已登记的上游 npm 生成 patch 报告 **206 条既有 whitespace diagnostics**（trailing whitespace 或 space before tab）：`@ai-sdk%2Fmistral@3.0.51.patch`、`@ff-labs%2Ffff-bun@0.10.5.patch`、`@modelcontextprotocol%2Fclient@2.4.0.patch`、`@silvia-odwyer%2Fphoton-node@0.3.4.patch`、`app-builder-lib@26.15.7.patch`、`vite@8.2.4.patch`。这些是上游生成 patch 内容，本轮未改写；`mobilePatches` 机器校验与 closure replay 仍 PASS。
- 源码/文档 diff-check 口径命令 `git diff --check origin/main...HEAD -- . ':(exclude)vendor/upstream/patches/**'`：该命令仅验证源码/文档路径，结果 **PASS**。当前工作树同口径 `git diff --check -- . ':(exclude)vendor/upstream/patches/**'`：**PASS**。
- 独立 mobile patch diff-check：`git diff --check origin/main...HEAD -- vendor/upstream/patches/mobile`，rc=0 / **PASS**。
- 独立 closure patch diff-check：`git diff --check origin/main...HEAD -- vendor/upstream/patches/closure`，rc=0 / **PASS**。

### GUI pairing/SSH

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment/vendor/upstream/packages/gui-plugins`
- 条件与 preload：`--conditions=solid --conditions=browser --isolate`；显式 `../ui/test/solid-jsx.ts`，`bunfig.toml` 自动提供 Happy DOM preload。
- 显式文件清单（11 files）：`src/pairing/copy-machine.test.ts`、`src/pairing/dispatch.test.ts`、`src/pairing/machine.test.ts`、`src/pairing/main-machine.test.ts`、`src/pairing/remote.test.ts`、`src/ssh/add-machine.test.ts`、`src/ssh/bootstrap.test.ts`、`src/ssh/command.test.ts`、`src/ssh/dialog-machine.test.ts`、`src/ssh/main-machine.test.ts`、`src/ssh/window-machine.test.ts`。
- 精确命令：

```bash
bun test --conditions=solid --conditions=browser --isolate --preload ../ui/test/solid-jsx.ts src/pairing/copy-machine.test.ts src/pairing/dispatch.test.ts src/pairing/machine.test.ts src/pairing/main-machine.test.ts src/pairing/remote.test.ts src/ssh/add-machine.test.ts src/ssh/bootstrap.test.ts src/ssh/command.test.ts src/ssh/dialog-machine.test.ts src/ssh/main-machine.test.ts src/ssh/window-machine.test.ts
```

- 实际结果：**88 pass / 0 fail，357 expect calls，11 files，1263ms**。

### `packages/mobile-hosts`

- 工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--upstream-227-alignment`
- 条件与 preload：`--conditions=browser`；测试目标目录为 `packages/mobile-hosts`，不接入 Android API、设备或真实服务。
- 精确命令：

```bash
bun test --conditions=browser packages/mobile-hosts
```

- 文件清单（40 files）：`packages/mobile-hosts/test/back-handler.test.ts`、`basic-auth.test.ts`、`credential-ref.test.ts`、`extension-manager.rendered.test.tsx`、`extension-manager.test.ts`、`files-client.test.ts`、`files-transport.test.ts`、`fingerprint.test.ts`、`host-credential.test.ts`、`host-key-binding.test.ts`、`host-key-recovery-flow.test.ts`、`identity.test.ts`、`initial-handoff.test.ts`、`known-hosts.test.ts`、`notifications-client.test.ts`、`probe.test.ts`、`registry-service-port.test.ts`、`registry.test.ts`、`runtime-ssh.test.ts`、`runtime-vault.test.ts`、`secure-fetch.test.ts`、`service-bridge.test.ts`、`service-commands.test.ts`、`service-discovery.test.ts`、`service-driver.test.ts`、`service-errors.test.ts`、`service-flow.test.ts`、`service-refresh.test.ts`、`ssh-bridge.test.ts`、`ssh-errors.test.ts`、`ssh-verifier-transport.test.ts`、`state-machine.test.ts`、`storage.test.ts`、`upstream-map.test.ts`、`url-policy.test.ts`、`vault-androidx-transport.test.ts`、`vault-envelope.test.ts`、`vault-key-envelope.test.ts`、`vault.test.ts`、`vault-transport.test.ts`。
- 实际结果：**442 pass / 0 fail，2946 expect calls，40 files，2.15s**。

## 范围

### 本次包含

1. 固定比较 v2.2.1→v2.2.7 的所有 Desktop 直接变化与共享前端闭包变化。
2. 新建 v2.2.7 基准、变化总结和完整稳定 ID 矩阵。
3. 按 v2.2.7 目标源码重新推导 closure、partial assets、上游 npm patch 子集和 lockfile。
4. 对全部 81 条移动补丁逐条给出处置：3 条 active（#184 scoped overlay + inherited main server-edit patch + #185 Home overlay）、19 条 #184 语义 absorbed、59 条 scope 外 deferred；保留重基、上游吸收、语义重写、退休或新增移动适配。
5. 将 Android/mobile/About/vendor 身份同步到 2.2.7；远程服务版本继续独立展示。

### 本次不包含

- 不把 `packages/desktop` Electron 主体复制到 Android。
- 不改变 WSL 执行排除、手机本地服务排除、APK 自动更新暂缓、语音暂缓、第三方 GUI 商店排除或进程死亡推送边界。
- 不创建 tag、GitHub Release、上传 APK 或自动合并。
- 不把 v2.2.1 的历史 PASS/BLOCKED 回填成 v2.2.7 结果。

### #184 子工作单元范围

- 仅迁移 v2.2.1 (`3ebcf9a32c7b28f658cfee80775448929361727a`) → v2.2.7 (`fedc6f208aa2bd54c1019227214568083f6380ad`) 实际影响连接、配对、SSH 共享能力的 closure；当前唯一 vendor pin 是 `fedc6f208aa2bd54c1019227214568083f6380ad`，不以历史 vendor 文件存在性代替目标源码核对。
- 固定顺序：schema → protocol → client/generated → package exports/deps → runtime/state machines → Android bridge。active overlay 只纳入 connect controller/dialog/machine/screen、server registry/current/runtime/health/host API、pairing/URL、validated fetch/probe/vault/security 和 SSH shared controller/dialog/name/renderer/row/state 及对应测试；build-only `closurePatches` 单独承载 package-manager dangling workspace 修复和 patchmark 传递依赖。排除 providers、settings、session、files、terminal、notifications、通用 UI、无关 AI/package 行为、Electron/Desktop、WSL 执行、updater、手机本地服务、通用 port-forward 及未确认的 #164/#165/#167/#168。
- 凭据与安全语义必须在新 `ServerOriginal`/`ServerSaveAction` 契约上重基：`credentialRef`、`remember`、vault ready/status/generation、probe/fetch、unknown/changed host key、TLS/redirect/userinfo、pairing malformed/expired/replay、日志无 secret。JSch 隧道数据面继续 `BLOCKED`，不得把 v2.2.1 pairing paste PASS 升级为 v2.2.7 PASS；QR physical 保持 `BLOCKED`。
- 进入 Android runtime/设备验收的前置门禁：pristine scoped v2.2.7 closure、target package sources/lock/npm patches、`verify:patches`/`verify:closure`、build/typecheck；未满足时停止在语义重基与静态证据阶段。

## 验收标准

### Stage A：审计与文档

- [x] 新目标 tag/SHA、旧目标 tag/SHA 和预迁移机器基线已记录。
- [x] 直接 Desktop 变化与共享 closure 变化的范围、数量、分类方法已记录。
- [x] v2.2.7 baseline、变化总结和矩阵已建立；v2.2.1 历史文件不被重写。
- [x] 版本敏感探针、设计文档和当前目标引用完成 active/history/policy 分类。

### Stage B：vendor 与补丁迁移

- [x] v2.2.7 closure 与 partial assets 由目标源码推导完成。
- [x] upstream npm patches 与 lockfile 按 v2.2.7 closure 重算。
- [x] 81 条移动补丁逐条有 disposition、new baseline、targets、依赖和验证记录；19 条历史 payload 为 absorbed，59 条 scope 外历史补丁为 deferred，#184 scoped consolidated overlay、1 条 inherited main patch 与 #185 Home overlay 为 active；build-only closure patch 单独登记。
- [x] pristine v2.2.7 closure + ordered mobile patches 可干净重放。
- [x] Android/mobile/vendor/About 身份同步为 2.2.7 / 20207。

**当前门禁状态：Stage B 已完成，Stage C 静态验证部分完成。** v2.2.7 pristine closure 已按目标源码重建，19 条 #184 历史语义由 scoped overlay 明确承载，59 条 scope 外历史差异保持 deferred；build-only closure 修复与三个 active mobile replay 分离重放；`credentialRef` 已接到 v2.2.7 的 `ServerOriginal`/`ServerSaveAction` 契约。未通过项集中在直接 `tsc` 的跨 package rootDir/TS6307、旧 settings fixture/生成类型与部分 legacy GUI 测试类型错误，不以关闭 strict 或扩大 Android 依赖解决。

### Stage C：验证与交付

- [ ] patch、closure、install、web build、typecheck、相关单测和 Android Gradle 门禁完成 before/after 对账（patch/closure/install/web/focused tests/Android Gradle 已完成；typecheck 仍为已知 baseline failure set，需保留对账记录）。
- [ ] 可用设备上完成数据保留覆盖安装和受影响路径验证；无环境项明确标记未验证/阻塞。
- [ ] 远程服务版本、Windows 运行端缺失和 Desktop-only 能力边界均单独记录。
- [ ] 新矩阵、设计文档、来源证明和实现状态一致后再提交。

### #184 验收分层（独立于 v2.2.1 历史证据）

- `PASS`：目标源码/协议/闭包/补丁链/构建与适用单测在本实施 HEAD 有可复现证据。
- `PARTIAL`：共享契约、安全负例或失败状态已落地，但端到端环境只覆盖部分路径。
- `BLOCKED`：JSch 真实转发、服务端到达、完整 SSH session/stream/permission/task survival 链，或 QR physical 所需设备/服务证据缺失。
- `NOT RUN`：无设备、无真实服务或不适用的 Android/Windows 运行验证；不得以旧 vendor、旧版 PASS 或静态 DOM 代替。

## 当前结果 / 下一步

- 历史状态（#185）：**Stage A/B 已完成；Stage C 静态门禁部分完成**。该历史 worktree 的未提交状态不代表当前；当前 vendor 由 pristine v2.2.7 closure + build-only closure patch + 四个 ordered mobile replay 重建，当前交付为已提交的 #186 修复。
- 已完成：上游 tag 固定、差异规模盘点、Desktop commit/path 盘点、81 条补丁 disposition、目标闭包重建、upstream npm patch/lockfile 重算；连接/配对/SSH 共享状态机、凭据契约、健康/生命周期控制器和移动兼容接缝已落到源码，#185 Home fade seam 与测试已落位。
- 关键发现：v2.2.7 已吸收部分旧移动差异；19 条 #184 历史语义明确标为 absorbed，59 条非 #184 历史 payload 保留为 deferred；#184 active overlay 只承载 scoped connection、配对、凭据/安全、server lifecycle/health 和 SSH 共享适配，继承自 origin/main 的 server-edit patch 独立重放；#185 allowlist 中的 Home/new-session state machines 已由 v2.2.7 pin 吸收，active #185 patch 只承载 fade helper/test；patchmark 与 workspace 修复仅作为 build-only closure 传递依赖重放。
- 剩余：`bun run typecheck:tsc -- --pretty false`（在 `vendor/upstream/packages/app` 执行）仍有 component-test story module/implicit-any、WebView bridge cast、generated/plugin type、legacy fixture 与 app→mobile-hosts rootDir/TS6307 等 baseline errors；设备 UI、真实服务和真实 JSch 链路未运行。
- 停止条件：出现需要改变产品范围、安全策略、远程服务承诺或删除既有移动适配的决策时暂停并记录。

### #184 当前执行状态

- 当前状态：**共享语义实施完成 → 静态门禁部分完成**；共享连接、配对、SSH 状态机和移动兼容接线已实现，v2.2.7 closure 可重建并通过 closure gate；不声称 APK 可用或任何 Android/真实服务通过。
- 已落地的关键面：`ServerOriginal`/`ServerSaveAction` 连接保存契约、credentialRef/remember/vault hydration、URL userinfo/TLS/redirect 安全边界、tagged plugin/health 状态与旧投影、server lifecycle/health/request queue/endpoint sync machine、pairing main machine、SSH main/window machine 与保留的移动 UI 兼容面。
- 可复现验证（修复后）：`python3 scripts/mobile-patches.py` PASS（82 条；4 active/19 absorbed/59 deferred）；build-only closure patch + 四个 ordered mobile replay 可重建；Web build、`verify:patches`、`verify:closure`、#186 app/back/mobile-hosts focused tests 与 Android Gradle build 均按修复后记录执行；历史 #185 Home focused tests 不作为当前事实；closure patch 不计入 `mobilePatches`，只作为 build-only prerequisite。
- 已知失败/阻塞：direct `tsc` 仍报告 app→mobile-hosts 的 rootDir/TS6307、app→gui-plugins 的 TS6307、v2.2.7 generated/client 与旧 settings fixture 类型不一致，以及 closure 外的 Electron/GUI legacy 测试依赖；GUI `askpass.test.ts` 依赖未纳入 closure 的 `packages/core/test/lib/effect`。这些不能通过关闭 strict、引入 Electron 到 Android 或静默跳过来解决。
- 下一步：完成 #185 文档/deny audit/diff review，按用户授权决定是否提交；不创建 PR、不推送、不合并；继续保持 typecheck 的 known-baseline、设备 UI 与真实链路的 BLOCKED/NOT RUN 边界。
- 后置阻塞：真实 SSH tunnel/session/stream/permission/task survival、QR physical、设备 UI 与真实服务证据仍缺失；Android Gradle/APK 仅有本轮 build-only PASS，不能替代安装和受影响路径验证；解除条件为真实设备、授权 SSH 主机/服务端和完整链路证据，不能由静态或历史证据替代。

### #188 当前执行状态

- 目标：composer/queue/attachments 归属保护与 fail-closed 草稿语义在 v2.2.7 落地（active `composer-queue-attachments-v2-2-7`），并重 derive 已退役 #12/#19/#20 与 #58 composer 侧 payload。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--188-composer-queue-attachments`，分支 `feat/188-composer-queue-attachments`，base `e4a6dd1`（#187 链尾，stacked chain）。
- c0 基线（coordinator 记录，pristine stacked base）：A app 单测 385 pass / 5 fail / 1744 expect / 30 files（5 条 pre-existing：submit.test ×4、editor/actions.test.ts ×1）；B component set 0/4 pre-existing module-resolution（recorded，非门禁）；C test-browser 13/0/35；D session-ui 38/0/126；E mobile-hosts 446/0/3034；F1 verify-attachments-artifacts pre-existing FAIL（entry.tsx createFilesClient import）；F2 verify-files pre-existing FAIL（model.tsx isFileNotFoundError）。
- 已完成：#84 patch（review 修复轮后 21 targets；patch SHA-256=`508818a4f729dd4b5d2f5f1161d33eb04d0506e4fedc8b54267f4d279ebd73da`）按 §8 顺序落地——drafts fail-closed、request wire floor、composer provenance 7 文件、queue.ts 本地 machine-native owner（queue-machine.ts 零改动）、fork/revert provenance threading、SAF 三件（M-012/M-021/M-020）；测试重 derive（drafts/queue/image/request）；registry 84/6/29/49 + patches:refresh；probe 重锚定（verify-files 9 处 old→new + verify-attachments-artifacts 1 处，见 build-and-verify.md #188 段）。
- 停止条件结果：S1 未触发（owner 集成完全 queue.ts-local，queue-machine.ts 零 diff）；S2 未触发（drafts fail-closed 与 drafts-machine 保持协调）；S3 未触发（verify-attachments-artifacts post-landing GREEN）；S4 未触发（set A 恒同 5 条 pre-existing，无新增失败——中途出现的 `pressing Enter...` 新失败经查明为 #84 request 守卫与 v2.2.7 retryFingerprint 的碰撞，按计划「NEW failure → fix #84」协议在 #84 内收窄（记录性偏差），复测后消失）；S5 未触发（无 scope/registry/安全策略变更）。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → PASS (84 registered; updated: none)；`python3 scripts/test_mobile_patches.py` → OK；`bash scripts/verify-closure.sh` → PASS（DANGLING=0，#84 按序 byte-identical 重放）；set A 396 pass / 5 fail（= 5 条 pre-existing，11 条净新增用例全绿）/ 1793 expect / 30 files；set C 13/0/35；set D 38/0/126；set E 446/0/3034；`git diff --check feat/187-timeline-messaging...HEAD -- . ':(exclude)vendor/upstream/patches/**'` → PASS；`bun run scripts/verify-attachments-artifacts.ts` → PASS（dist 5496 assets 标记核对）；`bun run scripts/verify-files.ts` → PASS。
- 构建与 payload：`bun run build:web` rc=0（built in 15.33s）；`copy:web-dist` → 5520 files / 155,565,011 bytes verified；`android_web_assets.py verify` → verified；web payload revision=`4fa3d3e`（仅 web-dist/manifest.json 刷新，145 行 hash 行替换）。
- Gradle（build-only）：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL in 24s（42 tasks）；单测 **10 suites / 47 tests / 0 failures / 0 errors**（android/ 树与 #187 base byte-identical，计数为本轮 verbatim 实测，#187 轮记录为 9/39，差额来自链上此前轮次的测试集增长，本轮零 android 改动）；debug APK `android/app/build/outputs/apk/debug/app-debug.apk` **66,072,093 bytes，SHA-256 `a39ebb3b638d826630ae9b5b1f8460bf00d349d1d20b030acb71b8bf823b215f`**；未安装任何设备。
- BLOCKED/NOT RUN：直连与 SSH 真机任务链、SAF/share/clipboard 设备行为（G27）、QA server 真服务竞态（W15 乐观编辑/重排/撤回）——解除条件：真实设备/授权 SSH 主机/QA server 可用并按 G 门禁执行；当前不声称任何设备/真实服务/runtime 验证。
- 授权与停止条件：PR created not merged（授权内不推送、不合并）；无 S1–S5 触发。
- **Review 修复轮（3 MAJOR + 4 MINOR，新增修复 commit）**：MAJOR-1 提交后 owner 门卸除（steer-edit cancel / rewrite cancels / run tail 恢复基线语义——不再在 committed 相位抛 owner 门，杜绝重复投递）；MAJOR-2 终态报告不再被 owner 抑制（dispose-returning 的 draft.merge 恢复成立；undo/edit-fail 两窗口均有回归测试）；MAJOR-3 owner break 只对 undo 触发 abort（machine dispose 同款契约），每 attempt 经自身 flow 恰好一个终态 machine 事件（R4/R5 锁定）；MINOR-4 rewrite 重入队 residual 在 row-58/#84 处置 + request.ts 注记登记；MINOR-5 queue.test 计数 13→18；MINOR-6 QueueOwner 死字段移除；MINOR-7 Set A 精确命令与 actions.test.ts 归属修正。新增 `queue-lifecycle.test.ts`（5 用例）入 #84 targets（21），patch 重生成（SHA-256 上记），verify-closure/registry 重放 PASS。

### #189 当前执行状态

- 目标：request docks 域（session/requests 权限/提问/elicitation/websearch dock 与决策通道）对 v2.2.7 的对齐收口——纯静态轮：探针重锚定 + 单元文档事实同步，**零 vendor 改动、零新 mobile patch、零 Android/Kotlin 改动**。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--189-request-docks`，分支 `feat/189-request-docks`，base `31f8399`（#188 链尾，stacked chain）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。
- c0 基线（coordinator 记录，pristine stacked base）：docks 9-file machine 集 **115 pass / 0 fail / 375 expect / 9 files**；Set A **396 pass / 5 fail / 1793 expect / 30 files**（5 条 pre-existing：submit.test ×4、editor/actions.test ×1）；component spec question-dock **0 pass / 1 fail**（environment-level import error，recorded-not-gate）；session-ui **38/0/126**；mobile-hosts **446/0/3034**；test-browser **13/0/35**；`verify-permission-requests` FAIL「1: expected linear permission.reply call site missing from the scan: …/auto-approve.ts」（重锚定目标）；五条 pre-existing rc=1 probe：verify-interaction-quality（titlebar.tsx history.back）、verify-agent-capabilities（providers/connect/mcp.tsx）、verify-notifications（isSessionUnread watermark）、verify-commands-menus（resetZoom）、verify-service-ops（entry.tsx service-ops bridge）——各自 domain ownership 在册。registry/closure PASS(84)。
- 交付物（commit 1 = `058141f` fix(probes)）：`scripts/verify-permission-requests.ts` v2.2.7 重锚定，14 条 fact 级 old→new（全表见 permission-requests.md 映射节与 build-and-verify.md #189 段）：linear 闭集 2→1（{model.ts} machine reply effect）、wrapper caller ban 0→EXACT-SET 2（{auto-approve.ts, inbox-model.ts}）、decide() 语义重分类（NotFound→reply.succeeded / reply.failed→toast）、auto-approve machine 形（gave-up/needsUser/sweepLocations）、question thin router + 双形态 guards、controller mutations、elicitation controller、data.ts 三锚 byte-same 保留、三 connected-gate 位移、tab-strip running 条件形（v2.2.1 起既入——2141b1ba35）、sweep `sweepLocations(signal)` 形、组 4/组 5 机械存活。
- 负注入（6/6 rc=1，注入即 revert 即复跑 rc=0）：(i) unrelated 文件注入 linear reply → 闭集 rc=1；(ii) 注入 data 层 caller → EXACT-SET rc=1；(iii) session-ui dock-prompt 注入 `permission.reply` → 零命中 rc=1；(iv) settings autoApprove default→true → 组 4 rc=1；(v) auto-approve `decision: "once"→"always"` → 形锚 rc=1；(vi) question-state `questionCache` 变异 → 组 2 rc=1。
- 回归 witness：docks 9-file **115/0/375** 恒同；Set A **396/5/1793** 恒同（5 条 pre-existing 同文件同名同断言位）；component spec question-dock plain 0/1（recorded-not-gate；附观察：app preload 形 3/0/11 全绿）；set C **13/0/35**；set D **38/0/126**（`message/attachment-media-machine + message/current-message + timeline/projection` 组合——c0 记录仅含数字，三组候选组合同数，实测取此组合）；set E **446/0/3034**。
- 探针 verdicts：rc=0 HARD gate 三条全 PASS——`verify-permission-requests`（重锚定后）、`verify-direct-connection`、`verify-ssh`；五条 pre-existing rc=1 probe 逐条首 FAIL 字符串与 c0 恒同（domain ownership 不变，非本轮引入）。
- 构建与 payload（no-op 轮）：`bun run build:web` rc=0；同环境双跑 manifest **byte-identical**（构建在本环境确定）；`web-dist/manifest.json` 对 HEAD 出现 272 行 diff（generatedAt/totalBytes + 14 条同名 .map hash 刷新 + 117 条 chunk 改名）——**vendor delta 排除**（vendor 全树 byte-identity + 50-file cmp SAME + registry hash 不变），归因构建环境差异（工作树路径等；`generatedAt` 时间戳本身使跨环境零 diff 不可能）；按计划不提交任何 payload 变更，`git checkout` 还原 manifest，android payload 与 vendor dist 以 #188 worktree 的在册 byte（committed manifest 所证实的字节）还原，`android_web_assets.py verify` → verified（payload == committed manifest）。
- Gradle（build-only）：`:app:testDebugUnitTest :app:assembleDebug` BUILD SUCCESSFUL in 25s（42 tasks）；JVM **10 suites / 47 tests / 0 failures / 0 skipped**；debug APK SHA-256 **`a39ebb3b638d826630ae9b5b1f8460bf00d349d1d20b030acb71b8bf823b215f`**（66,072,093 bytes）——与 #188 记录**逐字节相同**（同源码 + 同 payload 的确定性证据）；未安装任何设备。
- registry/closure：`mobile-patches.py` PASS (84 registered; updated: none)；`test_mobile_patches.py` OK；`verify-closure.sh` PASS；`git diff 31f8399..HEAD -- vendor/upstream/packages` 与 `-- vendor/upstream/patches/` 均**空**；`git diff --check` PASS；worktree 收尾 clean（`patches:refresh` 全程未运行）。
- 停止条件结果：零 vendor delta、零 S 类触发（探针重锚定无需语义弱化——6 条负注入证明 teeth 保留）；web manifest diff 经归因排除 vendor delta 后按 no-op 轮处理并全程记录，未触发 STOP。
- 授权与停止条件：PR created not merged（授权内不推送、不合并）；无设备/真实服务声明。
- BLOCKED/NOT RUN：G21 全部运行期项（dock 呈现到达、三决策真实效果、stale/expired 真机呈现、断连恢复、client exit 红线、auto-approve 代答、通知呈现、读屏/触摸目标、双路由真模型 live E2E）；e2e `session-request-docks.spec.ts` audit-only 未运行——解除条件：授权设备与 QA server 按 G21 门禁执行。

### #190 当前执行状态

- 目标：files / diff / review 域对 v2.2.7 的收口——一条 consolidated active patch `files-diff-review-v2-2-7`（#85）重 derive 四条退役 payload（files-stream-watch/files-tree-sidebar-fill/diff-worker-pool-fallback/files-open-external 翻转 absorbed）的 files/diff/review 在册载体面，配套五个探针的 v2.2.7 重锚定与文档同步。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--190-files-diff-review`，分支 `feat/190-files-diff-review`，base `818b14e`（#189 链尾，stacked chain）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a32c7b28f658cfee80775448929361727a`、v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。
- c0 基线（coordinator 记录，pristine stacked base）：(a) app files-domain 双条件集 **128 pass / 0 fail / 397 expect / 11 files**（12 个列名中 1 个不存在——`selection/combobox` 实际文件为 `combobox-machine.test.ts`；本轮重放复原该 11-file 集，post=131/0/401/11 = artifact +3）；(b) session-ui pierre 集 **27/0/114/2**（4 列名中 `comment-hover`/`file-find` 的非 -machine 名不存在，实跑 render-machine + selection-machine）；(c) gui-plugins files 域 **430/0/1337/36**；(d) mobile-hosts 446/0/3034/40、test-browser 13/0/35、Set A 396/5/1793/30（5 条 pre-existing：submit.test ×4、editor/actions.test ×1）；(e) probes：verify-diff FAIL「1: vcs.diff must map git→working / branch→branch…」、verify-open-external FAIL「1: web.ts lost the files-open-external external-open bridge call shape」、verify-files PASS、verify-attachments-artifacts PASS、verify-pierre-webview-compat FAIL「Cannot find module '../vendor/upstream/packages/session-ui/src/pierre/pool-strategy'」；registry/closure PASS(84)。
- 交付物：commit 1=`dc907ed` fix(probes)（verify-diff 全量 v2.2.7 重锚定——review model diff-machine 化、delete/revert/workspace-menu 机器化、branch-list swallow 移 branch-picker machine、组 2 worktree.remove 闭集 +workspace-menu recovery force、组 3 revert.commit 闭集收 {submit.ts}、组 9 file.tsx createPoolReady 块退役（superseded，render-machine.test.ts:116-141）+ patch-name 锚指向 `files-diff-review-v2-2-7.patch`；verify-pierre-webview-compat 注册测试换五 target、viewer-gate 测试退役）；commit 2=`5e87281` feat(vendor)（#85 patch 落地 + registry 85/7/33/45 + patches:refresh + compat 探针 tree-chain 锚 v2.2.7 call-shape 重锚——c0 时被 pool-strategy import 错误掩盖的预存漂移）；commit 3=`129f0f1` fix(probes)（verify-open-external 组 3：absorbed 状态 + #85 载体 hunk 锚 + issue #76 attribution 保留）；commit 4=`89cc54c` chore(web)（payload 5520/155572926 + verify-commands-menus/verify-notifications 组 8 基线 5622/150022223→5520/155572926 重锚）。
- patch：`vendor/upstream/patches/mobile/files-diff-review-v2-2-7.patch`，5 targets，SHA-256=`7b452f943601e632418776e9df0525475b970f211ab82c71ff7ef1c9b12dcd81`；apply-check rc=0（pre-patch chain tree）+ 五 target byte-identical；`mobilePatches` 第 7 项，dependsOn 前六个 active patch。
- 停止条件结果：S1（verify-diff 语义漂移）未触发——全部重锚定为 v2.2.7 实形，语义面逐条保留（三模式/gates/refresh 链/force 链/revert 三步/闭集语义），file.tsx hunk 为 plan 预批准 supersession；S2（@pierre 引擎/主题位移）未触发——1.6.1 实测 `resolveHighlighterType` fallback + DEFAULT_THEMES pierre-dark/pierre-light 在位；S3（worker dead-pool await path）未触发——v2.2.7 getWorkerPool 已返回 `| undefined`，failedPools hunks 原形落位；S4（不可归因失败）未触发——tree-chain 锚漂移归因 v2.2.7 变量重命名（call shape 不变），manifest/web.ts/registry 面全部归因在册。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → **PASS (85 registered; updated: none)**；`python3 scripts/test_mobile_patches.py` → **OK（9/9）**；`bash scripts/verify-closure.sh` → **PASS**（V3(a) byte-identical 含 #85 按序重放、DANGLING=0）；`git diff --check feat/189-request-docks...HEAD` → PASS；五 probe rc=0：verify-diff / verify-files / verify-open-external / verify-attachments-artifacts / verify-pierre-webview-compat 14/0；五条 pre-existing rc=1 probe 逐条首 FAIL 与 #188/#189 记录恒同：verify-interaction-quality（titlebar.tsx history.back）、verify-agent-capabilities（providers/connect/mcp.tsx）、verify-notifications（isSessionUnread watermark）、verify-commands-menus（resetZoom）、verify-service-ops（entry.tsx service-ops bridge）——verify-commands-menus/verify-notifications 的组 8 dist 基线已随 commit 4 重锚，两探针总体 rc 保持 1（首 FAIL 字符串不变），组 8 检查本身经 collector 重放确认 0 fail。
- 基线复跑（当轮实跑）：(a) **131 pass / 0 fail / 401 expect / 11 files**（= c0 128/0/397 + artifact +3 用例/+4 expect）；(b) **27/0/114/2** 恒同；(c) **430/0/1337/36** 恒同；Set A **396 pass / 5 fail / 1793 expect / 30 files** 恒同（5 条 pre-existing 同名同位）。
- 构建与 payload：`bun run build:web` rc=0；`bun run copy:web-dist` → **5520 files / 155,572,926 bytes verified**（与 #188 同文件数，+7915 bytes vendor delta 入既有 chunks）；`python3 scripts/android_web_assets.py verify` → verified；web payload revision=`89cc54c`。
- Gradle（build-only）：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL in 17s**；JVM 单测 **10 suites / 47 tests / 0 failures / 0 errors / 0 skipped**；debug APK `android/app/build/outputs/apk/debug/app-debug.apk` **66,075,865 bytes，SHA-256 `699a7c8d0cfd718365a99af673dba4dc519b1da24cb4d396c5cd5e7c0025fc51`**；**未安装**。
- BLOCKED/NOT RUN（设备边界）：diff 渲染/模式切换/评论/worktree 流程/undo-redo 时序、web.ts openExternal 真机外跳（允许域/拒绝域 Toast/mailto 拒绝/no-handler，QA-1–QA-4）、pool 失败真机主线程回退、streamed media/watch 重订阅真服务、文件选区触摸路径（W16，G22）——**解除条件**：授权设备与 QA server 按 G22/G23/G27 门禁执行；本轮不声称任何设备/真实服务/runtime 验证。typecheck 维持在册 known-baseline 失败集，本轮未声称通过。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；S1–S4 未触发。

### #191 当前执行状态

- 目标：terminal / persistent-PTY 面对 v2.2.7 的 crosswalk 收口——纯静态轮：`verify-terminal` 探针从退役 pty 面全量重锚定到 persistent-PTY 面（7 组 + 6 条 in-memory 负注入 drill），`docs/design/units/terminal.md` 重写为 persistent-PTY 契约；上游审计（9-path，106 = 22 A + 4 D + 80 M → 102 SAME / 0 DIFF）确认终端面重组 **absorbed by vendor pin**，零新 mobile patch、零 vendor delta。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--191-terminal-pty`，分支 `feat/191-terminal-pty`，base `018a60a`（#190 链尾，stacked chain main a25ab51 → #187 → #188 → #189 → #190）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a32c7b28f658cfee80775448929361727a`、v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。
- c0 基线（coordinator 记录，引用不重 derive）：verify-terminal rc=1「FAIL: 1: the binary control-frame comment anchor changed (verbatim)」（重锚定目标；522 行 / 7 组）；terminal 套件 canonical 形态（包目录）**131/0/820/12**、根形态 125/6（preload 不生效类，不作门禁）；client pty **12/0/26/2**；gui-plugins files 域 **430/0/1337/36**；registry **85/7/33/45** PASS；known-good probes 8 条 rc=0；pre-existing rc=1 六条首 FAIL 在册（interaction-quality=组 2 titlebar history.back；verify-gui-plugins=组 2 contract-set「missing=[] extra=["review"]」）。
- 交付物：commit 1=`2912f5a` test(probes)（verify-terminal 全量重锚定——persistent-PTY 数据面/生产调用面闭集（tests 出域）/断开红线（close(1000) 3→2 如实登记）/never-reconnects 恢复/生命周期 rename/queue-resize 移动面/零 OS 101 文件 + 6 drill；退役锚显式清单在探针头注；verify-interaction-quality 组 3 注释 + summary 字符串更新，断言零改动）；commit 2=本轮 docs commit（changes.md #191 section、units/terminal.md 重写、matrix W04 + provenance、interaction.md G24④⑥ 注记、本卡、current-review）。
- 允许 diff 面：`scripts/verify-terminal.ts` + `scripts/verify-interaction-quality.ts`（注释/summary 字符串 ONLY）+ docs；`git diff 018a60a..HEAD -- vendor/upstream/ android/` **双空**（HARD BANS 全部未触碰：patches:refresh 未运行、vendor/android 零编辑、vendored 测试零编辑）。
- 探针记录（当轮实跑）：verify-terminal **PASS rc=0**（组 1-7 + drill 日志：third createPersistentPtyClient caller→FAIL(2:) / ticket header flipped→FAIL(1:) / takeover removed→FAIL(1:) / persistentPty.remove injected→FAIL(2:) / kill injected→FAIL(3:) RED LINE / process.platform injected→FAIL(7:)——各 inject→FAIL→restore→PASS）；verify-interaction-quality rc=1 首 FAIL 与 c0 恒同；8 条 known-green rc=0（verify-diff / verify-files / verify-open-external / verify-permission-requests / verify-attachments-artifacts / verify-direct-connection / verify-ssh / verify-pierre-webview-compat 14/0/43）；pre-existing rc=1 五条首 FAIL 恒同（agent-capabilities=mcp.tsx / notifications=isSessionUnread / commands-menus=resetZoom / service-ops=entry.tsx bridge / gui-plugins=contract set extra=["review"]）。
- 套件基线复跑（当轮实跑）：canonical（包目录）terminal **131 pass / 0 fail / 820 expect / 12 files** 恒同；client pty **12/0/26/2** 恒同；gui-plugins files 域 **430/0/1337/36** 恒同；根形态实跑 117/6/769/12（6 fail=KeyboardEvent-not-defined ×4 + 队列续行 ×2，preload 类——不作门禁，c0 125/6 与本轮 117/6 的 pass 计数差异如实登记、同属根形态属性）。
- 构建与 payload（零提交构建记录，#189 先例）：`bun run build:web` rc=0；`bun run copy:web-dist` → **5520 files / 155,572,926 bytes verified**（与 #190 字节总数同数）；manifest 24 行环境性 diff（generatedAt + 23 条 .js.map hash churn）→ `git checkout` 还原；fresh payload 与 #190 worktree payload 逐文件比对 = 23 条 .map sourcemap churn（零资产名/字节数变化）；android payload 与 vendor dist 以 #190 worktree 在册字节只读还原 → `android_web_assets.py verify` **verified rc=0**；探针扫描面与 c0 同字节（attachments/direct-connection/ssh 三探针在还原后复跑 rc=0）。
- Gradle（build-only）：`:app:assembleDebug` **BUILD SUCCESSFUL in 12s**（36 tasks）；debug APK **66,075,865 bytes，SHA-256 `699a7c8d0cfd718365a99af673dba4dc519b1da24cb4d396c5cd5e7c0025fc51`——与 #190 逐字节相同**（vendor 未变 + payload=committed manifest 字节）；**未安装**；JVM 单测未重跑（android/ 零改动，#190 记录继续适用）。
- registry/closure：`mobile-patches.py` **PASS (85 registered; updated: none)**；`verify-closure.sh` PASS；`git diff --check` PASS；worktree 收尾 clean。
- BLOCKED/NOT RUN（解除条件=SSH 主机授权 + 授权设备/QA server）：SSH 隧道 PTY 创建/输入/resize/关闭/断开重连/红线②、ghostty WASM WebView 加载、移动入口/tab 全生命周期/IME/软键盘/外接键盘/触屏选择、双路由+三 OS live（G24 全项）；本轮零 Android 改动 = 无 keepalive 证据（force-stop 为既有生命周期边界回归项，G24⑤ 承载杀 App）。本轮不声称任何设备/真实服务/runtime 验证。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；本轮零 S 类触发。

### #192 当前执行状态

- 目标：provider/model/usage 面对 v2.2.7 的 crosswalk 收口——agent-selector 重基（唯一幸存 mobile delta，active `providers-models-usage-v2-2-7` #86）+ rows 65/69/71 翻转 absorbed（blob-ancestry 证据）+ `verify-provider-models` v2.2.7 连接状态机面全量重锚定 + 单元文档事实同步。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--192-provider-model-usage`，分支 `feat/192-provider-model-usage`，base `ad88e80`（#191 链尾，stacked chain main a25ab51 → #187 → #188 → #189 → #190 → #191）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a32c7b28f658cfee80775448929361727a`、v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。
- c0 基线（coordinator 记录，pristine stacked base；引用不重 derive）：`bun run scripts/verify-provider-models.ts` rc=1「FAIL: 1: unexpected credential.remove call site: vendor/upstream/packages/app/src/providers/connect/controller.ts」（重锚定目标）；13-file vendor provider/usage 集（双条件形）**133 pass / 0 fail / 385 expect / 13 files**；registry **85/7/33/45** PASS；9 条 known-green probe rc=0 + 6 条 pre-existing rc=1 首 FAIL 在册；mobile-hosts 446/0；session-ui 9-file 139/0。
- 交付物：commit 1=`c57f238` feat(vendor)（#86 patch 3 targets——agent.ts `shouldShowAgentSelector` 重落 + marker、selection.tsx `desktopAgentsVisible`/`agentsVisible` 拆分 + android-host import、pristine agent.test.ts +3 第一方用例；registry 86/8/36/42 + patches:refresh；rows 65/69/71 翻转 absorbed，处置含 blob-ancestry 证据与 usage-limits 归因修正 e42f6d1016/33ffc3e58d）；commit 2=`3da3e72` fix(probes)（verify-provider-models 33 条 old→new——G1 remove 集第三站点 claude.replace、G2/G5 per-workspace opener + ScopedKey.from(scope, pathKey(directory)) + session.deleted workspace dispatch、G3 命令链/取消/cadence/seam/auto-code/copy-link/statusFailed/connectMethods/CONSOLE_INTEGRATION 移 machine.ts 形、G4 data.ts usage-limits 前缀 + hasLocation 门；2 条负注入各 inject→FAIL→restore→PASS）；commit 3=`be1cfd7` chore(web)（payload 5520 files / 155,574,838 bytes；dist 证据语言 chunk 级在册）；commit 4=本轮 docs commit（changes.md #192 section、matrix S21–S24/W17/W18 + provenance、patch-dispositions rows 65/69/71 + row 86 + rows 47/37 routing notes、units/providers-models.md、build-and-verify.md #192 段、本卡、current-review）。
- 停止条件结果：零 S 类触发——闭集语义全保留（cancel 站点计数 2→1 为 machine 化语义迁移，由 target-tagged cancel 效应 + stale-generation 补偿 + cleanup 三锚补偿强度）、无弱化（2 条负注入证明 teeth 保留）、无 scope/registry/安全策略变更。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → **PASS (86 registered; updated: none)**；`python3 scripts/test_mobile_patches.py` → **OK（9/9）**；`bash scripts/verify-closure.sh` → **PASS**（V3(a) byte-identical 含 #86 按序重放、DANGLING=0）；`bun run scripts/verify-provider-models.ts` → **PASS（rc=0）**；13-file 集 **136 pass / 0 fail / 389 expect / 13 files**（c0 133/0/385 + agent.test +3 用例/+4 expect）；mobile-hosts **446 pass / 0 fail / 3034 expect / 40 files** 恒同；session-ui 9-file **139 pass / 0 fail / 436 expect / 9 files** 恒同；9 条 known-green rc=0（verify-attachments-artifacts/verify-direct-connection/verify-ssh 在 commit 3 后复跑 rc=0——pre-build 全新 worktree ENOENT 环境依赖沿 #190/#191 登记）；6 条 pre-existing rc=1 首 FAIL 字符串与 c0 恒同；`git diff --check` PASS（vendor + scripts）。
- 构建与 payload：`bun run build:web` rc=0 → `bun run copy:web-dist` → **5520 files / 155,574,838 bytes (verified)**（committed manifest 前值 5520/155,572,926，+1,912 bytes 与 agent-selector 小 delta 一致）；`python3 scripts/android_web_assets.py verify` → verified rc=0；web payload revision=`be1cfd7`（仅 web-dist/manifest.json 刷新提交）。dist 证据（reviewer 重定口径）：语言 chunk 级命中 usage.signedOut.title/usage.title/command.usage.view（language-psZgvPUu.js + dialog-DFYAp7zw.js）、model.details.usage（language-psZgvPUu.js + dropzone-Cr65qf6t.js）与 "opencode-mobile-host"/"android-v1" 字面量（list-DGrJzx7_.js）；agent 可达性证据保留 source/unit 级，不做符号级 dist 断言。
- Gradle（build-only）：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL in 15s**（42 tasks）；JVM 单测 **10 suites / 47 tests / 0 failures / 0 errors / 0 skipped**；debug APK `android/app/build/outputs/apk/debug/app-debug.apk` **66,076,929 bytes，SHA-256 `b6decaa7e2baf4c67b8d345d801ea44f2e9b48393723cf410f2b7be5a7300c04`**；**未安装**。
- BLOCKED/NOT RUN（解除条件）：真实凭据链（API key/OAuth/command 真实授权）**解除条件=真实凭据**；设备走查（G25 全项：入口双布局、外跳实态与热回跳、冷回跳/取消/过期/失败、needs_auth 呈现、跨回跳上下文、作用域隔离、limits/可用性、触屏形态、凭据负例）**解除条件=授权设备**（沿 #105/#141/#142 BLOCKED 边界原样保留）；MCP sign-in UI 面路由 **#193**（v2.2.7 将 MCP 移出 connect 流——dialog.tsx 过滤 metadata.source !== "mcp"）；本轮不声称任何设备/真实服务/runtime 验证。typecheck 维持在册 known-baseline 失败集，本轮未声称通过。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；本轮零 S 类触发。

### #193 当前执行状态

- 目标：settings 域对 v2.2.7 的 crosswalk 收口——104 unique targets 吸收核对（84 SAME + 9 DIFF + 11 MISSING）+ 移动 delta consolidated 重 derive（active `settings-v2-2-7` #87，19 targets：W1 host-manager mount、W2 add-menu N12 face、W3 gui-extensions tab/管理器/disabled union、W4 mobile SSH row-menu adapter、W5 M-035 zoom catalog deviation、W6 测试重 derive）+ settings 域六探针 v2.2.7 重锚定 + 18 条 settings-family rows 翻转 absorbed。
- 基准与绝对工作目录：`/home/peterhan/worktrees/opencode-mobile/feat--193-settings`，分支 `feat/193-settings`，base `eb1fc20`（#192 链尾，stacked chain main a25ab51 → #187 → #188 → #189 → #190 → #191 → #192）；上游只读引用 `/home/peterhan/repository/opencode`（v2.2.1=`3ebcf9a32c7b28f658cfee80775448929361727a`、v2.2.7=`fedc6f208aa2bd54c1019227214568083f6380ad`）。
- c0 基线（coordinator 记录，pristine stacked base；引用不重 derive）：registry **86/8/36/42** PASS；verify-appearance-settings rc=1「2: controllers.ts adopted api.experimental.config.update (plugin migration — must stay out)」、verify-pinch-shell-settings rc=1「1: general.tsx lost the pinch gate line (desktop() && 'getPinchZoomEnabled' in platform)」、verify-agent-capabilities rc=1「1: unexpected mcp connect/disconnect call site (outside the named set): vendor/upstream/packages/app/src/providers/connect/mcp.tsx」（三者 = 重锚定目标）；verify-settings-framework/experimental/interface-mode 在 eb1fc20 同为 rc=1（「1: shell.tsx lost the migrated marker…」/「3: model.tsx defaults no longer carry newIcons…」/「2: shell.tsx still contains a vertical tabLayout comparison」），六个探针全部由本分支 commit 2 重锚至 PASS；settings 套件/常量集与 #192 段同数。
- 交付物：commit 1=`c5e83db` feat(vendor)（#87 patch 19 targets——W1–W6 如上；registry 87/9/54/24 + patches:refresh；18 rows 翻转 absorbed 含 settings-ssh-entry-guard disposition）；commit 2=`38a9ef5` fix(probes)（六探针重锚定，old→new ledger 在探针头注；负注入：settings-framework I1–I3、appearance A1–A5、pinch drills ⑥–⑧、agent-capabilities B1–B2，各 inject→FAIL→restore→PASS）；commit 3=`9bd974b` chore(web)（payload 5630 files / 155,851,603 bytes）；commit 4=本轮 docs commit（changes.md #193 section、matrix header + 32 行增量、patch-dispositions row 87 + 18 行翻转 + rows 37/47/69 routing 履行、units 三文档、build-and-verify.md #193 段、本卡、current-review）。
- 停止条件结果：零 S 类触发——闭集语义全保留（6 条负注入证明 teeth；terminalPlacement/showFileTree 退役翻转为负锚=强化；interfaceMode experimental 键/自适应 CSS 负锚化=吸收语义；quote-comment IS_MAC 为 registered in-set exception 单条）、无 scope/registry/安全策略变更。
- 门禁结果（verbatim）：`python3 scripts/mobile-patches.py` → **PASS (87 registered; updated: none)**；`bash scripts/verify-closure.sh` → **PASS**（V3(a) byte-identical 含 #87 按序重放、DANGLING=0）；`git diff --check` PASS；六探针 rc=0：verify-settings-framework / verify-experimental-settings / verify-interface-mode / verify-appearance-settings / verify-pinch-shell-settings / verify-agent-capabilities；11 条 known-green rc=0（verify-diff / verify-files / verify-open-external / verify-attachments-artifacts / verify-permission-requests / verify-direct-connection / verify-terminal / verify-provider-models / verify-about-version / verify-pierre-webview-compat 14/0 / verify-ssh——ssh 在 commit 3 后复跑 rc=0，pre-build 全新 worktree ENOENT 环境依赖沿 #190/#191/#192 登记）；pre-existing rc=1 首 FAIL 恒同（interaction-quality=组 2 titlebar history.back、notifications=组 1 isSessionUnread、commands-menus=组 1 resetZoom、service-ops=entry.tsx bridge、gui-plugins=组 2 contract extra=["review"]、goal-sources=组 1 mobile face、projects-sessions=archive stub、session-workbench=linear interrupt、webview-url-compat.test 3 fail @:48、password-keyboard.test 2 fail @:23/:38）。
- 套件（当轮实跑，cwd `vendor/upstream/packages/app` 除注明）：settings 套件 `bun test --conditions=browser --isolate --preload ./happydom.ts src/settings/{route,model,search-results}.test.ts src/settings/servers/{inventory,machine}.test.ts src/settings/keyed-server-entry.test.tsx src/settings/settings-search-plugin.test.tsx src/shell/commands/command.test.ts` → **84 pass / 0 fail / 229 expect / 8 files**；W4/W2 standalone（各自头部约定 browser 形）：mobile-ssh **8 pass / 0 fail / 45 expect**、add-menu **7 pass / 0 fail / 21 expect**；servers-page standalone **9 pass / 0 fail / 38 expect**；13-file sanity（双条件形）**136 pass / 0 fail / 389 expect** 恒同；Set A（30 文件双条件形）**396 pass / 5 fail / 1793 expect / 30 files** 恒同（5 条 pre-existing 同名同位：submit ×4 + editor/actions ×1）；session-ui **112 pass / 0 fail / 355 expect / 6 files**（v2.2.7 存活集：timeline 5 文件 + components/markdown-fragment-links——4 条 timeline machine test 文件上游重组移除，零失败）；mobile-hosts `bun test --conditions=browser packages/mobile-hosts` **446 pass / 0 fail / 3034 expect / 40 files** 恒同；gui-plugins `bun test src/file src/review src/microsoft-office` **430 pass / 0 fail / 1337 expect / 36 files** 恒同。
- 构建与 payload：`bun run build:web` rc=0 → `bun run copy:web-dist` → **5630 files / 155,851,603 bytes (verified)**（committed 前值 5520/155,574,838，+110 文件/+276,765 bytes 与 settings 域 chunk 增量一致）；`python3 scripts/android_web_assets.py verify` → verified rc=0；web payload revision=`9bd974b`（仅 web-dist/manifest.json 刷新提交）。
- Gradle（build-only）：`ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL in 40s**（42 tasks）；JVM 单测 **47 tests / 0 failures / 0 skipped**；debug APK SHA-256 **`f44f05154867a514054085064cc695f15a981c4acb6c89b9d31ce567cbc971e1`**；**未安装**。
- BLOCKED/NOT RUN（解除条件）：W1/W2/W4 设备走查（add-menu 三项触摸、SSH row-menu connect/retry/remove/confirmHostKey、host-manager mount 导航）**解除条件=授权设备**（G30/G35 门禁）；M-035 zoom web 实现面归 #197（deferred `appearance-motion-zoom` owner round；standing deviation 注记在 changes.md）；本轮不声称任何设备/真实服务/runtime 验证。typecheck 维持在册 known-baseline 失败集，本轮未声称通过。
- 授权与停止条件：PR 由协调者创建（不合并）；不推送；无设备主张。registry 语义、补丁 scope 或安全策略需要变化时停止并记录；本轮零 S 类触发。
