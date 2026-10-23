# 构建与验证证据（V8）

本文按 issue #2 验收第 6 条记录真实工具链、命令与结果，并区分四态（implemented / built-local-test / device-tested / real-remote-tested）。缺失设备/服务/模型的一律标 BLOCKED，不得写成通过。关联：[issue #2](https://github.com/0xYiliu/opencode-mobile/issues/2)、[issue #27](https://github.com/0xYiliu/opencode-mobile/issues/27)（上游更新演练）、[issue #4](https://github.com/0xYiliu/opencode-mobile/issues/4)（Keystore）。

记录日期：2026-10-24。S0–S4 段的验证于 2026-10-23 执行（首跑记录见 `vendor/upstream/provenance.json` 的 `pinUpdateExercise.regression`），本文引用其结果；V4/V5/V6/V7 与文档机械检查在 2026-10-24 于分支 `issue-2-android-shell-upstream-closure` 工作树重跑确认。

## 工具链（本机真实版本）

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| bun | 1.4.2（= 上游 `packageManager`） | 依赖安装、web 构建 |
| node | v24.20.0 | 间接依赖执行环境 |
| openjdk | 21.0.12.1 | 已安装；Android 构建需要 SDK（缺失，见 BLOCKED） |
| python3 | 系统自带（xml.dom.minidom、json.tool） | V5/V6 结构校验 |
| git / gh | 可用 | 闭包获取、issue 记录 |
| Android SDK / Gradle / kotlinc / gitleaks | **未安装** | APK 构建与 gitleaks 级扫描 BLOCKED（泄漏扫描以启发式脚本 `scripts/leak-scan.sh` 代替，明示非 gitleaks） |

## 构建流水线（真实命令）

```bash
bun install --frozen-lockfile          # V1
bun run build:web                      # V2（= bun run --cwd vendor/upstream/packages/app build）
bash scripts/copy-web-dist.sh          # dist → android/app/src/main/assets/web/ + web-dist/manifest.json
bash scripts/verify-closure.sh         # V3（树等价 + workspace 引用一致性）
bun run scripts/license-audit.ts       # V4（BLOCKED：12 项待用户决策）
bash scripts/leak-scan.sh              # V7
python3 -m json.tool <关键 JSON>        # V5
python3 xml.dom.minidom 解析 Android XML  # V6
scripts/vendor-sync.sh [revision]      # 闭包重建（S3 演练复用）
```

`cd android && ./gradlew :app:assembleDebug` 与 `gradle wrapper --gradle-version 8.11.1`（wrapper jar 引导）**仅记录、未执行**：本机无 Android SDK，执行必然失败；wrapper jar 不提交（见 `.gitignore`）。

## 验证项记录

| 验证项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| V1 依赖安装 | `bun install --frozen-lockfile` | PASS（rc=0；演练回归 21 installed / 50 pruned；ghostty-web 解析 commit `83c0a07b8628b748aed073b232cb4b52a6ca11c1`） | `provenance.json#pinUpdateExercise.regression.V1_install` |
| V1 补丁段比对 | 安装后比对我方 `bun.lock` patchedDependencies 段与根配置 9 项 | PASS：`PATCH_SEGMENT_MATCH=true`，9/9 在册，无静默跳过 | 同上 |
| V2 web 构建 | `bun run build:web` | PASS：vite rc=0，6138 modules，3330 dist 文件（约 152.6 MB，含 sourcemap），PWA service worker 生成 | 同上（`V2_build`） |
| V2 产物拷贝 | `bash scripts/copy-web-dist.sh` | PASS：3330 文件 / 152,638,185 bytes 拷入 `android/app/src/main/assets/web/`（gitignored，committed 记录为 manifest） | `web-dist/manifest.json`（generatedAt 2026-10-23T19:41:15Z；manifest sha256 `93a093e6b79540d1858d0665589350c45c7e0c856ac8f62992517528198bb55a`） |
| V3 闭包核对 | `bash scripts/verify-closure.sh` | PASS：(a) 树 == pin 树 + 已登记 patches，LICENSE 字节一致；(b) 11 包 workspace 引用全量扫描 `DANGLING=0`；recordings 排除项核对通过 | `provenance.json#pinUpdateExercise.regression.V3_verifyClosure` |
| V4 许可审计 | `bun run scripts/license-audit.ts` | **BLOCKED**：1089 包审计，12 项待用户决策（清单见下）；无新许可类别 | 本文「许可审计 12 项」；`provenance.json#pinUpdateExercise.closureRefresh.licenseRefresh` |
| V-cred 凭据静态验证 | 源码 grep + dist 标记检索 + 语义探针 | PASS：(a) `persistence.ts` encode 剥离 password 且含 `mobile(M-002)` 标记，app/src/runtime 无其他持久化写入路径；(b) dist 压缩产物中标记命中（`dist/_assets/health-6k7mPhm6.js` + .map）。诚实边界：压缩产物仍含与 auth header 拼接相关的无关 password 字面量；真机负例归 G9 | `provenance.json#pinUpdateExercise.regression.V_cred` |
| V5 JSON 结构校验 | `python3 -m json.tool` | PASS（2026-10-24 重跑）：`provenance.json`、`vendor-manifest.json`、`patches/mobile/manifest.json`、`web-dist/manifest.json` 全部可解析 | 本文 |
| V6 Android XML 校验 | python3 `xml.dom.minidom` 解析 | PASS（2026-10-24 真实执行）：`AndroidManifest.xml`（root `<manifest>`）、`network_security_config.xml`（root `<network-security-config>`）为计划要求项；另覆盖 `themes.xml`、`strings.xml`（root `<resources>`），全部解析成功、退出码 0 | 本文 |
| V7 泄漏扫描 | `bash scripts/leak-scan.sh` | PASS（rc=0；2026-10-24 重跑）：高置信模式仅命中 7 处已过滤的文档示例凭据（AWS `AKIAIOSFODNN7EXAMPLE`，上游测试 fixture；S3 更新后较前段记录的 3 处增加，均为同类别示例键）；`git check-ignore` 抽查全部忽略 | 脚本输出 |
| V8 证据文档 | 本文 | 记录完成 | — |
| 锁文件哈希 | `sha256sum bun.lock` | `05b7cf62b016aa79c8e8c38e45b8df86892d09f8c037877475bdb78bdcdde6a4`（与 `provenance.json#pinUpdateExercise.closureRefresh.lockDiff` 记录一致，reconciliation 确定性复现） | 本文 |

## 四态区分表

| 能力/条目 | implemented | built-local-test | device-tested | real-remote-tested |
| --- | --- | --- | --- | --- |
| vendor 闭包 + provenance + 补丁（M-001/002/003） | ✓ | ✓（V1/V3/V-cred） | BLOCKED | BLOCKED |
| web 静态构建（含 PWA SW、主题） | ✓ | ✓（V2，3330 文件） | BLOCKED（G1/G10） | BLOCKED |
| Android 壳代码（Gradle 骨架/Manifest/netsec/Kotlin） | ✓ | 静态验证 ✓（V6 XML + V7）；编译 **BLOCKED**（无 SDK，无 APK） | BLOCKED | BLOCKED |
| 回环 asset server + WebView 配置 + 生命周期 | ✓（代码） | 编译/运行 BLOCKED | BLOCKED（G1/G2/G9/G12） | BLOCKED |
| 上游 app UI（会话/终端/设置/权限/文件 Diff 的 vendored 代码） | ✓（vendored） | ✓（随 V2 构建打包） | BLOCKED | BLOCKED |
| connection 字段契约 + memory-only（M-002） | ✓ | ✓（V-cred 静态） | BLOCKED（G9） | BLOCKED |
| connection / server-list 产品能力 | 已确认未实现 | BLOCKED | BLOCKED | BLOCKED |
| NOTICE-THIRD-PARTY.md | 未生成（V4 BLOCKED） | — | — | — |
| SSH 隧道 | 未开始（归 #6） | — | — | — |
| live 直连 HTTPS 会话 | 已确认目标 | BLOCKED（无授权服务/模型） | BLOCKED | BLOCKED |

## 上游更新演练记录（S3，经 issue #27）

完整记录以 `vendor/upstream/provenance.json#pinUpdateExercise` 与 `vendor/upstream/PROVENANCE.md` 为准，此处为摘要：

- **Selection 五字段**：full SHA `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；date 2026-10-23T10:28:20-07:00；rationale：触及移动壳渲染的两个闭包包（app runtime / client solid stores）的自包含修复（#57025 session transcript retention），覆盖上游 lock/patch 段漂移（`@modelcontextprotocol/client` 补丁移动 2.0.0→2.3.1、photon-node 补丁变更）；candidate release：v2.1.4 周期（`github-v1.2.27-145-gb4525d79bf`）；compatibility evidence：9 项携带补丁 key 在候选 lock 段版本逐字一致、M-002 目标文件未变、候选为 origin/dev 祖先、上游 lock 两 pin 间变更 1033 行。
- **闭包刷新**：289 文件变更（+8313/−3282）；根 catalog/overrides 重同步（新增 `@pierre/highlights@0.2.0` 等）；bunfig `[install]` 段镜像候选（`minimumReleaseAge` 仍为 259200，上游自行加入 3 个 excludes，非本地放宽；首次安装曾因 `@pierre/highlights` 发布不足 3 天失败）；lock 比对 +82/−76。
- **补丁生命周期**：M-001/M-003 于候选 rebase（仅上下文行位移，语义不变，冲突处置逐条记录于 `patches/mobile/manifest.json`）；M-002 原样应用（目标未变，零冲突）；携带的上游补丁文件两 pin 间字节一致。
- **回归**：V1/V2/V3/V-cred/V7 全部 PASS；V4 BLOCKED 维持（同 12 项，无新许可类别）。
- **回滚演示**（真实执行）：恢复前一 pin 的 manifest/provenance/patches/根配置/lock → `vendor-sync.sh` 重建 + 干净重装 + 全量重建。判定：首选标准（sha256 与已知良好清单一致）3110/3138 文件字节一致，28 个差异文件全部为 `.map`（vite/rolldown sourcemap 跨构建不可字节复现，已接受限制）；fallback 判定（V3 树等价 + V2 构建成功）满足 → 回滚 SUCCESS（附该限制记录）。运维发现：回换 `bun.lock` 前必须先删除 `node_modules`（bun 1.4.2 对超集 store 误报 no changes）。
- **最终 pin**：`b4525d79bf`（上游默认分支 dev）。位置理由：触及 app/client 的移动相关修复 + 真实依赖漂移覆盖；gate 报告中 Gradle/Android、G1–G12、live E2E 一律 BLOCKED（not passed）。

## BLOCKED 总表

| 项 | 缺失条件 | 归属 |
| --- | --- | --- |
| APK 构建（`:app:assembleDebug`、wrapper bootstrap） | Android SDK（compileSdk 36） | 后续环境准备；命令已记录于本文 |
| G1–G12 设备门禁（清单见 [design/interaction.md](design/interaction.md)） | 真机/模拟器（+G3/G6/G7/G9/G11/G12 需授权远程服务） | issue #2 验收第 2 条 |
| live 直连 HTTPS E2E（选项目/开会话/发提示/增量事件/PTY） | 授权服务 + 模型；不允许 fixture 替代 | issue #2 验收第 4 条 |
| SSH E2E | SSH 适配未实现 | issue #6 / #21 |
| 许可审计（V4）与 NOTICE-THIRD-PARTY.md 生成 | 12 项许可类别用户决策 | 用户决策，见下表 |

## 许可审计 12 项待用户决策（2026-10-24 实跑输出）

`bun run scripts/license-audit.ts`：1089 packages 审计，STOP 于以下 12 项（7 类包名家族；NOTICE-THIRD-PARTY.md 因此未生成）：

| 包 | 版本 | 许可 | 审计判定 |
| --- | --- | --- | --- |
| @sentry/cli | 2.58.6 | FSL-1.1-MIT | UNRECOGNIZED |
| @sentry/cli-linux-x64 | 2.58.6 | FSL-1.1-MIT | UNRECOGNIZED |
| axe-core | 4.13.0 | MPL-2.0 | COPYLEFT/STOP |
| dompurify | 3.4.14 | MPL-2.0 | COPYLEFT/STOP |
| json-schema | 0.4.0 | AFL-2.1 OR BSD-3-Clause | UNRECOGNIZED |
| khroma | 2.1.0 | 无 license 字段 | UNKNOWN |
| lightningcss | 1.32.0 | MPL-2.0 | COPYLEFT/STOP |
| lightningcss | 1.33.0 | MPL-2.0 | COPYLEFT/STOP |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 | COPYLEFT/STOP |
| lightningcss-linux-x64-gnu | 1.32.0 | MPL-2.0 | COPYLEFT/STOP |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0 | COPYLEFT/STOP |
| lightningcss-linux-x64-musl | 1.32.0 | MPL-2.0 | COPYLEFT/STOP |

来源依赖路径示例：axe-core ← lighthouse、dompurify/khroma ← mermaid、lightningcss ← @tailwindcss/node 与 vite、@sentry/cli ← @sentry/bundler-plugins。MPL-2.0 为弱 copyleft（文件级），FSL-1.1-MIT 为功能性源码许可，均需用户决策是否接受进入分发物；决策前不生成 NOTICE、不进入任何发布流程。

## 偏差与已接受限制

| 项 | 说明 | 处置 |
| --- | --- | --- |
| 返回键实现与计划表述差异 | 计划 §3 写 `onBackPressedDispatcher`，该 API 属 androidx，与「零 androidx」约束冲突；按框架 `onBackPressed` 实现（minSdk 29 全覆盖），保持 `enableOnBackInvokedCallback` 不启用以维持行为 | 已在 [design/interaction.md](design/interaction.md) 交互基线记录；预测性返回迁移留后续 issue |
| 许可审计条目口径 | 交接摘要「lightningcss×2」为概数；实跑 12 项中 lightningcss 系为 6 项（2 个 JS 版本 + 4 个平台原生二进制包） | 按实跑输出记录（本文上表），以 `provenance.json` 的 12 项总数为准 |
| 回滚比对计数口径 | `web-dist/manifest.json` fileCount=3330；演练回滚首选判定记录为 3110/3138。两处计数口径未在本段重新调和，本文不改写，以 `provenance.json` 原文为准 | 记录为待澄清口径（不影响 fallback 判定结论） |
| sourcemap 不可复现 | 28/3138 `.map` 跨构建字节不同 | 已接受限制（fallback 判定放行），见演练记录 |
| 泄漏扫描非 gitleaks | 环境无 gitleaks，`scripts/leak-scan.sh` 为启发式 + check-ignore 抽查 | 脚本头与本文均已明示 |
| gradle-wrapper jar 不提交 | 仅提交 `gradle-wrapper.properties`；jar 由 `gradle wrapper --gradle-version 8.11.1` 本地引导 | `.gitignore` 已登记 |
| 本轮验证边界 | 全部验证为本机构建/静态验证（构建宿主 ≠ 远程 OS）；远程 OS 范围（Linux/原生 Windows/macOS）仅明示未验证，WSL 排除见决策记录 0001 | [docs/project-scope.md](project-scope.md) |

## 最小核对记录表（设计文档 ↔ 实现）

| 设计条目 | 实现位置 | 验证动作 | 结果/差异 |
| --- | --- | --- | --- |
| shell-startup 布局/控件行为/错误态（[units/shell-startup.md](design/units/shell-startup.md)） | `android/app/src/main/java/ai/opencode/mobile/MainActivity.kt`、`WebAssetServer.kt` | 代码核对 + V6 XML 解析 | 一致；设备运行未验证（G1/G2 BLOCKED） |
| 实例状态恢复已确认未实现 | `MainActivity.onSaveInstanceState`（TODO 注释，无 saveState 调用） | 代码核对 | 一致（已确认未实现） |
| 断开不停止远程红线 | `MainActivity.onDestroy` 注释 + [design/architecture.md](design/architecture.md) | 代码核对 | 一致；真机复核归 G12 |
| 凭据流 memory-only（[units/connection.md](design/units/connection.md)） | `vendor/upstream/packages/app/src/runtime/server/persistence.ts`（M-002）、`api.ts`（Basic 拼接） | V-cred 静态验证 | 一致；真机 localStorage 负例归 G9 |
| connection/server-list 字段契约 | `persistence.ts`（ServerHttpBase/ServerHttp/State） | 代码核对 + V5 JSON | 一致；产品能力已确认未实现 |
| CORS 差异记录（[design/architecture.md](design/architecture.md)） | 上游 `packages/desktop/src/main/windows/headers.ts` @ pin（记录性引用，不在闭包内） | 与上游缓存 clone 内容核对 | 一致 |
| G1–G12 门禁枚举（[design/interaction.md](design/interaction.md)） | 文档 | 对照计划 §5.2 人工核对 | 12/12 一致；执行全部 BLOCKED |
| memory-only notice | [design/interaction.md](design/interaction.md) | 对照 M-002 patch 与 provenance | 一致；App 内提示为后续事项 |
| 视觉视口与令牌来源（[design/visual.md](design/visual.md)） | 上游 `index.html` viewport、`packages/ui` 令牌体系 | grep/目录核对 | 一致；真机渲染待 G1 |
| 四横切适用性总表（[design/README.md](design/README.md)） | 文档 | 人工核对 | 4/4 适用，无不适用项；覆盖状态与正文一致 |
| 设计单元清单与单元文档对应 | [design/architecture.md](design/architecture.md) 清单 ↔ design/units/ | 人工核对 + 链接检查 | 一致：3 单元有文档，6 单元 TODO 行（未开始），无幽灵行 |
| 文档相对链接 | design/*.md、README.md、project-scope.md | `test -f` 全量核对 | 通过（终态，见下方机械检查记录） |

### 机械检查记录（2026-10-24）

- 文档相对链接：对 `README.md`、`docs/design/**`、`docs/project-scope.md` 中的仓库内相对链接逐一 `test -f`，全部存在。
- 设计单元清单、索引表与 `design/units/` 实际文件一一对应；未决 TODO（会话列表/时间线/终端/设置/权限确认/文件与 Diff、深链、状态恢复、预测性返回）在索引与单元文档中可见。
