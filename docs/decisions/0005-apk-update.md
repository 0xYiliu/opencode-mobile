# 决策记录 0005（草案）：APK 更新机制——可行性核对与决策建议

本文记录 issue #68（S40+N09：APK 更新机制——可行性与决策）的核对结论与决策建议。**本文是决策草案（提案态）：全部结论为源码级文档裁定，零代码、零构建、零设备验证；最终决策归用户**（见 §0 与 §9 的拍板路径）。

- 状态：**提案（待用户决策）**——本文不记录任何已确认决策；全部事实引用以固定 git 对象实测为准
- 记录日期：2026-10-30
- 来源议题：[issue #68](https://github.com/0xYiliu/opencode-mobile/issues/68)
- 关联：[0001](0001-wsl-exclusion.md)、[0004](0004-service-operations.md)、[../project-scope.md](../project-scope.md)、[../alignment/windows-desktop/v2.2.1/matrix.md](../alignment/windows-desktop/v2.2.1/matrix.md)（S40/N09）、[../alignment/windows-desktop/v2.2.1/implementation.md](../alignment/windows-desktop/v2.2.1/implementation.md)（E24）、[../design/units/gui-extensions.md](../design/units/gui-extensions.md)、[../alignment/workflow.md](../alignment/workflow.md) §4/§5
- 事实基线（本文全部行号均为对应 git 对象实测）：上游 v2.2.1 = `3ebcf9a32c7b28f658cfee80775448929361727a`；vendor pin = `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；本仓库 = origin/dev `ef10718`

## 0. 决策问题（workflow.md §4 五要素）

- **现状**：移动客户端没有任何应用内 APK 更新逻辑——换包即部署边界（`MainActivity.kt:174-175` 注释原文 "APK replacement is the deployment boundary"）；vendored 树中 updater 扩展注册于移动 web 宿主（`vendor/upstream/packages/gui-extensions/src/renderer.ts:52`）但被管理面呈现为 desktop-host 禁用行（`packages/mobile-hosts/src/ui/extension-manager.tsx:48`），其唯一可达面是 whatsNew 发行说明（§2.4）；Android 壳无 `REQUEST_INSTALL_PACKAGES` 权限、release 构建无签名配置、`versionCode=1`。
- **差距**：矩阵 S40（更新检查、安装与发行说明）/N09（Windows 安装更新及 beta notes）的目标更新链在 Android 侧全缺：无检查触发、无下载、无安装、无更新呈现；且不存在承载这些功能的发布前提（无对外可下载的已签名 release 产物、无版本清单、无 versionCode 单调方案）。
- **可行方案**：三案——(a) 应用内下载 + Android PackageInstaller；(b) 检查 + 引导外部安装（外链到发布产物）；(c) 不做（维持换包即部署边界）。逐案对比见 §3。
- **影响**：产品范围（是否对用户承诺客户端自更新支持）、安全面（(a) 新增「feed 控制者可向设备推代码」的信任锚与新权限）、维护负担（feed/签名/版本清单的持续运维）、以及既有 whatsNew 邻外面的处置（§6 R1）。
- **推荐**：**暂缓实施**——(c) 作为当前运营姿态维持，(b) 登记为已核对可行、与上游契约同型的未来形态（§4）。激活条件见 §4.2；**暂缓是「条件未满足」而非永久排除**（workflow.md §5 红线）。

**送达载体**：本节即决策问题的完整呈现；协调员提交 PR 时，以同样的五要素形态把决策问题写入 PR 描述送达用户（F-4）。用户拍板后的落法见 §9.3（小提交路径）。

## 1. 目标语义：v2.2.1（上游 `3ebcf9a`）更新面

### 1.1 插件形态与规模

更新器在 v2.2.1 是 **gui-plugins 内建插件**：`packages/gui-plugins/src/updater/`，目录实测 79 个文件 = **16 个非 i18n 源文件**（action/actions/beta-dialog.stories/beta-dialog/beta-notes.test/beta-notes/beta-page/index/log/machine.test/machine/main/platform/renderer/section/whats-new）+ `i18n/` 63 个文件（en 基座 + 62 语言）。注册于 gui-plugins 宿主 compose（`packages/gui-plugins/src/renderer.ts:49`，15 个内建项之一，注释 ：38 "The only place host builds name built-ins"）。

### 1.2 平台层（`platform.ts`）：electron-updater 桌面形态

`platform.ts` 导入 `electron` 与 `electron-updater`（:3-4），是全树唯一运行时 import electron-updater 的源文件。要点（全文 160 行实测）：channel 恒 `"latest"`、`allowPrerelease=false`、`allowDowngrade=true`、`autoDownload=false`、`autoInstallOnAppQuit` 仅 darwin；Windows NSIS 差分下载（按 staged 状态禁用差分）+ ARM64 模拟安装换原生安装器挑选 + `--stage` 预解包（120s 超时）；安装 = `quitAndInstall()`（10s 超时守卫）。`checkForUpdate`（:39 起）**只返回 `{mode:"restart"}`**（:57）。

feed 为 generic provider，三通道（`packages/desktop/electron-builder.config.ts` 实测 ：212/:231/:250）：`https://opencode.ai/update/api/{dev|beta|latest}/desktop/opencode/`，`channel` 恒 `"latest"`；`electron-builder.config.test.ts:15-19/:54-58` 以通道表锁定该形状。

### 1.3 状态机：双模式 UpdateTarget 与 external 预留位

- 状态集（`packages/plugin/src/gui/updater.ts:16-26`）9 态：`disabled/idle/checking/downloading/ready/download-required/up-to-date/installing/error`。
- `machine.ts:4-6` **UpdateTarget 双模式**：`{mode:"restart", version}`（应用内下载 → staged → 重启安装）与 `{mode:"external", version, url}`（→ `download-required` 态，检查路径 ：76-79；`install` 经可选 `platform.externalInstall(url)` 移交外部，`machine.ts:13/:185-189`）。
- **关键事实（负断言实测）**：`git grep -n externalInstall 3ebcf9a -- packages/gui-plugins packages/desktop` 命中恰为 machine.ts 契约三处 + machine.test.ts mock 一处——**v2.2.1 无任何生产 Platform 提供 external 模式**，desktop 的 electron platform 只产 `restart` 目标。external 是**契约预留位**，不是已使用的路径。

### 1.4 主进程入口（`main.ts`）：packaged 门

门 = `enabled = build.packaged`（:13）；`platform.ts` 仅在 enabled 时动态 import（注释 "electron-updater loads only in packaged builds, after the first window is up"）。主入口 import electron `dialog`（:1），承载 checkFailed/upToDate/ready + restart/later 对话框与 app 菜单检查项；staged 版本记忆在 `opencode.updater` ready-store（防差分缓存陈旧，`machine.ts:44-46` 注释）。**v2.2.1 的 desktop 主门不再排除 dev 通道**（仅 `build.packaged`；pin 版为 `build.packaged && build.channel !== "dev"`，见 §2.1）——dev 通道语义增量不改变移动端结论。

### 1.5 renderer 面与注册顺序

`renderer.tsx`：`whatsNew(ctx)`（:10）与 `betaNotes(ctx)`（:11）**先于** `if (!ctx.desktop) return`（:13）注册——发行说明面不设平台门，更新操作面设。desktop 门之后才有：TitlebarItem（:29）、"Updates" 设置页（:45，releaseNotes 开关 + 检查更新两行，`section.tsx:19-42`）与 check/install 动作（`actions.tsx`，`download-required` 时确认后走 install——上游 electron platform 无 externalInstall，该分支在生产上不可达）。

### 1.6 发行说明三通道

① `whats-new.tsx`：`fetch("https://opencode.ai/changelog.json")`（:8），lenient 解码（:17-28），过滤 `source` 含 "desktop" 的 highlights（:102），升级后首启对话框（seen 版本持久化 `highlights.v1`）；② `beta-notes.ts`：beta 构建内嵌 JSON（feat/fix/perf + PR + sha + 作者 + 动图，:8-22），`sliceBetaNotes` 至多 10 条（`SHOWN = 10`，:6）；③ `beta-dialog.tsx`/`beta-page.tsx` 呈现。

## 2. 移动端现状（pin `b4525d79` / vendored 树 + 第一方壳 @ `ef10718`）

### 2.1 vendored 树 updater 形态与 M-001 实际剥离集（F-1 修正）

vendor 闭包容 **gui-extensions 形态** updater：`vendor/upstream/packages/gui-extensions/src/updater/`，实测 75 文件 = **12 个非 i18n 源文件**（较 v2.2.1 多 `contract.ts`、少五个 beta 面文件）+ `i18n/` 63 文件。差异：主门更严 = `build.packaged && build.channel !== "dev"`（pin `main.ts:12`）；`main.ts:1` import electron `dialog`；`renderer.tsx:8` whatsNew 先于 :10 桌面早退（vendored 文件与 pin 逐字节一致，diff 实测空）。

**M-001 实际剥离集（评审修正后复核，`patches/mobile/manifest.json` M-001 条目 + patch hunk 实读）**：仅从 `packages/gui-extensions/package.json` 的 devDependencies 剥 **`electron`（pin :61）/ `@lydell/node-pty`（:55）/ `devtools-protocol`（:60）** 三项；**`electron-updater: 6.8.9` 保留在 pin package.json:62**（vendored 树 :59），在 M-001 patch hunk 中仅作上下文行出现。本文与台账均按此实际剥离集描述。

### 2.2 「web 构建死代码」论证（不依赖 M-001）

main/platform 侧 updater 代码在移动 web 构建不可达，论证挂在两个独立事实、**不依赖 M-001**：① `electron-updater` 是 devDependency（pin package.json:62）——devDeps 不参与 web 生产打包；② 其唯一运行时 import 点 `platform.ts:2` 只被 `main.ts:20-21` 在 desktop 主进程 `enabled`（packaged）时动态 import，而移动 web 宿主从不执行任何 main entry（gui-extensions 设计单元「六 main entry 懒加载、phone never runs Electron/Node main-process extensions」）。

### 2.3 移动宿主注册与 desktop-host 禁用行

updater 内建注册于移动 web 宿主使用的 compose：`vendor/upstream/packages/gui-extensions/src/renderer.ts:20-21`（import）/ **:52**（`{ ...updater, renderer: eager(updaterRenderer) }`；pin 树为 ：48，M-036 追加 sources/goal import 后漂移 +4）；`main.ts:11/:32` 同表 main 侧（web 不可达）。移动扩展管理器把 updater 列为四个 desktop-host 禁用行之一（`packages/mobile-hosts/src/ui/extension-manager.tsx:48` `DESKTOP_HOST_EXTENSIONS`，呈现「桌面专属」+ Switch 禁用态）。

### 2.4 F6：whatsNew 邻外面（R1，见 §6）

移动 web 面唯一可达的 updater 功能 = **whatsNew**（pin `renderer.tsx:93-112`，文档注释 :89-92 "on every platform"）：seen 版本 ≠ 当前 web 构建版本、存在上一版本且 releaseNotes 开启（默认 `enabled: true`，`index.ts:15-17` 经 settings.v3 pick）时，动态 import 并 `fetch("https://opencode.ai/changelog.json")` → 弹**桌面版** highlights 对话框；首启（无 previous）只写 seen 不弹窗。即：**移动端今天已有一个「意外存在」的更新邻近面**——对 opencode.ai 的启动期网络外联 + 桌面版发行说明弹窗，且在 APK 换包（web 构建版本变化）后触发。源码级确证；**设备端实际触发时序未运行验证**（诚实边界）。

### 2.5 F5：Android 壳事实

- 权限：`AndroidManifest.xml` 仅 `INTERNET`（:7）+ `POST_NOTIFICATIONS`（:10）；**`REQUEST_INSTALL_PACKAGES` 零命中**（负断言 `git grep -il REQUEST_INSTALL -- android/` rc=1）。
- 备份与 TLS：`allowBackup=false`（:13）+ `dataExtractionRules`/`fullBackupContent`（vault/、ssh/ 双通道排除）+ `usesCleartextTraffic=false`（:20）+ networkSecurityConfig（HTTPS-only、仅系统 CA）——与 §3 的更新安全性讨论正交但相关：更新面若引入，不得破坏这些既有边界。
- 版本与签名：`build.gradle.kts` `versionCode=1`/`versionName="0.1.0"`（:14-15），minSdk 29/targetSdk 36（:12-13）；release buildType **无签名配置**（:22-24，注释 "No signing configuration on purpose: signing material never lives in this repo"）。
- 部署边界：`MainActivity.kt:174-175` 注释原文 "Android has one shell document and APK replacement is the deployment boundary"（PWA worker 提升语境）。

### 2.6 F7：远程服务升级先例与 0004 独立性

N09「远程服务升级已有独立实现」所指 = [0004](0004-service-operations.md) 第四桥服务操作模板的 `opencode upgrade --method <m> --target <v>` 动词（`packages/mobile-hosts/src/service-ops/commands.ts:32/:46/:72-73`，出处登记 0004 §3.1）。**升级远端 OpenCode 服务与升级 APK 客户端是两个独立问题**：前者在远端机器执行白名单命令，后者在手机本地替换应用二进制；0004 的授权流、红线与回滚语义不覆盖、也不替代本文议题。本文不改动 0004 任何结论。

## 3. 三案对比

| 维度 | (a) 应用内下载 + PackageInstaller | (b) 检查 + 引导外部安装 | (c) 不做（换包即部署边界） |
| --- | --- | --- | --- |
| 目标语义映射 | 同型于上游 restart 模式（electron-updater/quitAndInstall 的 Android 对应物）；上游无 Android 先例 | **上游契约已有同型**（内部谱系）：machine `external` 模式 / `download-required` 态 / `externalInstall(url)`（§1.3，`machine.ts:4-14`），v2.2.1 虽无生产 provider，契约位完整存在——移植语义风险最低 | 上游无对应（desktop 必有更新面）；按 workflow.md §3「已决定排除」行登记并保留依据 |
| 来源校验与签名一致性 | 应用自身下载并暂存 APK 二进制：feed 元数据走 TLS 校验（AGENTS.md 硬约定）；**真正的验证锚是安装期 Android 签名一致性**（平台强制同签名升级，异签名报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`），可选 SHA-256 清单双通道核验加固；feed 控制者获得「可向设备推代码」的信任锚 | 应用不触 APK 二进制：检查面仅拉元数据（TLS 校验）；完整性与签名校验交由用户下载链 + Android 安装器——信任面最小 | 零新增校验面；现状边界维持 |
| 安全边界与权限 | 新增 `REQUEST_INSTALL_PACKAGES`（API 26+ 特殊授权流，用户侧开关）+ 新增应用内信任锚 + 下载存储面 | 零新权限、零新信任锚；桥面可近似为零（WebView 外链 / ACTION_VIEW 走既有模式） | 零变化 |
| 失败路径 | 网络/TLS 失败、存储不足、parse 错误、签名不匹配（debug↔release 混装）、用户拒授权/取消安装确认、OEM PackageInstaller 差异、下载中断续传——全需实现与呈现 | 检查失败（网络/feed 缺失）→ 诚实态呈现；链接失效；用户中途放弃；**无完成回调**（完成检测=下次启动版本比对，whatsNew 同型机制现成） | 无运行失败路径；「失败」= 用户忘更新（产品语义，非故障） |
| 回滚语义 | 成功后**无应用级回滚**（Android 侧载无 RollbackManager）；失败回滚=弃置下载/暂存；数据面 filesDir 跨 install -r 保留、Keystore 绑定 vault 不失效（`allowBackup=false` 与更新正交） | 手动（用户重装旧 APK，数据保留语义同左） | 回滚=用户手动换包（与现状同） |
| 实现规模 | 大：下载管理 + 桥授权流 + 设置面 UI + 进度/错误态 + feed 与清单设施 + 签名 release 流水线 + versionCode 单调方案——完整模块，远超单 issue | 小-中：JS 设置面（检查 + 呈现 + 外链）+ 至多一个 intent 辅助桥；feed 可退化设计（静态外链 GitHub Releases 也可起步） | 零代码；仅文档 |
| 与项目约定兼容 | 与「不提交签名密钥」兼容的前提=签名材料在 repo 外且**先有签名 release 流程（当前不存在）**；TLS 校验可实现 | 完全兼容（零新权限、零新信任锚） | 完全兼容 |
| 前置条件（当前缺失） | 签名 release 构建 + 密钥管理约定 + feed 托管 + 版本清单 + versionCode 方案 + `REQUEST_INSTALL_PACKAGES` 授权流 | 发布产物可下载处 + 版本清单（**GitHub Releases 即可满足**，见 §4.2） | 无 |

## 4. 决策框架与推荐

### 4.1 推荐（最终决策归用户）

**暂缓实施**：(c) 作为当前运营姿态维持；(b) 登记为**已核对可行、契约同型的未来形态**。理由：

1. **发布面前置条件整体缺失**：无签名 release 产物、无 feed/版本清单、无 versionCode 方案——任何检查面今天都「无可查之物」；先行交付更新 UI 会构成虚假承诺（违反台账诚实边界纪律）。
2. **(b) 与上游 external 契约同型**（§1.3/§3）：语义风险最低、规模最小，发布产物存在后可低成本激活；且其完成检测可复用已在移动面存在的 whatsNew 同型机制。
3. **(a) 在签名/发布基础设施建立前不应启动**：其规模（完整模块）、对 Play 政策与 OEM 差异的依赖使范围不可控，且新增应用内代码执行信任锚。

### 4.2 暂缓的激活条件（F-5）

**「首个对外可下载的已签名 release 产物 + 版本清单存在（GitHub Releases 即可）」即满足 (b) 的启动前置。** 暂缓 = 该条件当前未满足，而**非永久排除**（workflow.md §5 红线「不能将暂缓写成永久排除」）。条件满足后，(b) 作为新工作单元按 §5 前置清单开工，无需重走可行性核对。

## 5. 实施前置条件清单（若用户批准实施；本模块不实施）

- **(b) 启动前置（全部满足即可开工）**：① 对外可下载的已签名 release 产物；② 版本清单（GitHub Releases 页面即可起步，静态清单可选加固）；③ JS 设置面（检查 + 版本呈现 + 外链，S40 行的界面交付）；④ 至多一个 intent 辅助桥（外链唤起，走既有桥纪律）；⑤ 失败路径呈现（检查失败/链接失效诚实态）。
- **(a) 追加前置**：⑥ `REQUEST_INSTALL_PACKAGES` 特殊授权流与状态呈现；⑦ 应用内下载管理（续传、存储、校验）；⑧ 第五桥或等价桥纪律扩展；⑨ versionCode 单调方案；⑩ feed 与 SHA-256 清单设施 + 签名流水线（签名材料永不入 repo）。
- **通用约束**：TLS 校验不得关闭（AGENTS.md）；签名一致性错误路径显式呈现；versionCode 方案先于首次对外发布确定；实施单元需设备端到端验证（本模块零设备验证的缺口由该单元补齐）。

## 6. 附属发现 R1：whatsNew 邻外面的处置建议（F-6 三选项谱系）

§2.4 的 whatsNew 面是 vendored 树既有行为（上游语义：桌面发行说明在「每个平台」呈现），不是本模块引入的问题。**本期裁定：仅登记，不升格为补丁**（保持零代码边界）。若用户要求处置，三选项谱系与代价：

| 选项 | 内容 | 代价 |
| --- | --- | --- |
| (a) vendored whatsNew 门补平台条件 | 在 vendored `renderer.tsx` whatsNew 注册处（:8）补 `ctx.desktop` 类平台条件 | 小补丁（约 1-3 行）+ web 构建验证 + 新 M-xxx 补丁链登记与探针锚修订——vendored 树变更的完整纪律 |
| (b) 移动 builtins 组合剔除 updater | 移动宿主组合不注册 updater 内建（whatsNew 随注册消失） | 同上量级的补丁 + 构建验证；**连带面更大**：extension-manager 的 desktop-host 行消失、能力三集合与探针闭集（verify-gui-extensions 组 7 等）同轮修订 |
| (c) 仅文档化现状（零代码） | 本文 §2.4 + E24 登记；不动代码 | 零代码；面继续存在（启动期对 opencode.ai 的外联 + 换包后桌面 highlights 弹窗） |

**#67 迁移后复核条件句**：上述锚点（vendored `gui-extensions/src/renderer.ts:52`）位于 #67（S41+N11 gui-plugins 迁移）的改造域——迁移落地后 compose 形态与行号会变化，R1 三选项的落点与代价需在该轮**复核后**再执行；本文记录的是迁移前实态（pin `b4525d79` + M-001..M-036）。

## 7. 风险与关联

- **0004 独立性**（§2.6）：本文不修改 0004 任何结论；远端服务升级与 APK 客户端更新在文档与实现两个层面保持独立议题。
- **#67 迁移耦合**：矩阵 S40/N09 与 S41/N11 行相邻；本文引用的 vendored 树行号（renderer.ts :52 等）带迁移后复核条件句；E24 编号为 #67（预期 E23）预留顺延位，rebase 轮按实际占用重排。
- **上游漂移**：全部引用锚定 `3ebcf9a`（v2.2.1 口径）与 pin `b4525d79`，不做 HEAD 跟踪。
- **决策越权风险**：本文状态=提案，推荐意见（§4）与决策问题（§0）分节呈现，不代用户拍板；矩阵行内固定「决策待用户」字样。

## 8. 诚实边界

- **零代码、零构建、零设备 QA**：本模块全部交付为文档；未引入或修改任何代码、补丁、权限、构建配置；未执行任何设备验证。
- **Windows v2.2.1 更新面未运行核实**：§1 全部为目标版本源码级语义（`3ebcf9a` 实测），无 Windows 运行环境对照。
- **whatsNew 设备触发未验证**（§2.4）：触发条件与弹窗路径为源码级推断（seen/version 持久化时序、首启 markSeen 分支），未在设备运行确认。
- **文件计数按实测**：v2.2.1 updater = 16 非 i18n 源文件（目录共 79 文件，含 i18n/ 63 个文件：en 基座 + 62 语言）；pin 树 updater = 12 个非 i18n 源文件（含 index.ts/machine.test.ts/contract.ts）+ i18n/ 63 文件（共 75）。评审记录中的「66 个翻译 / pin 13 文件」两数与 `git ls-tree` 实测不符（63 / 12），本文按实测值记载。
- 本文不含凭据、令牌、私钥或真实连接配置。

## 9. 状态

### 9.1 状态表

| 条目 | 状态 |
| --- | --- |
| 本文（ADR 0005） | **提案（待用户决策）**；事实底座 = 三个固定 git 对象的源码级实测（`3ebcf9a` / `b4525d79` / `ef10718`） |
| 矩阵 S40/N09 | 「待决策」+ 行内「决策待用户」固定字样（不造新状态词）；证据 E24 |
| 附属发现 R1 | 已登记三选项谱系（§6）；本期处置 = (c) 仅文档化 |
| 推荐 | 暂缓（c 为当前运营姿态）+ (b) 契约同型未来形态；激活条件 §4.2 |

### 9.2 决策问题送达

本文 §0 + PR 描述（协调员按 workflow.md §4 五要素形态向用户提出，F-4）。

### 9.3 拍板后路径（小提交）

- **用户接受 (b) 或 (a)**：一次小提交把本文状态改「已接受（方案 X）」+ 矩阵 S40/N09 推到对应终态 +（若用户要求）`project-scope.md`「已确认范围」表补「客户端更新」行；实施本身归批准后的新工作单元（§5 前置清单为其输入）。
- **用户确认暂缓/不做**：一次小提交把状态改「已确认暂缓」并把矩阵推到「不实现（依据 ADR 0005，激活条件见 §4.2）」终态；R1 同轮按用户选择落子。
- **用户接受 R1 处置选项**：随对应小提交实施（(a)/(b) 为代码单元，需走完整实施流程；(c) 即现状）。
