# 构建与验证证据（V8）

本文按 issue #2 验收第 6 条记录真实工具链、命令与结果，并区分四态（implemented / built-local-test / device-tested / real-remote-tested）。缺失设备/服务/模型的一律标 BLOCKED，不得写成通过。关联：[issue #2](https://github.com/0xYiliu/opencode-mobile/issues/2)、[issue #27](https://github.com/0xYiliu/opencode-mobile/issues/27)（上游更新演练）、[issue #4](https://github.com/0xYiliu/opencode-mobile/issues/4)（Keystore）、[issue #3](https://github.com/0xYiliu/opencode-mobile/issues/3)（主机注册表，见下方 issue #3 段）。

记录日期：2026-10-24。issue #3 段（mobile-hosts 包、M-004…M-008 补丁）的验证于同日在分支 `issue-3-host-registry` 工作树执行，全部为本机构建/静态/单测级验证；设备级验证全部 BLOCKED。

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
bun test --conditions=browser packages/mobile-hosts   # V-mh（issue #3 第一方包单测）
bun run scripts/verify-credential-ref.ts              # V-cRef（issue #3 N2 探针）
```

`--conditions=browser` 的原因：solid-js@1.9.15 的 exports 无 `solid` 条目，bun test 默认按 `node` 条件解析到无响应式的 server 构建；`browser` 条件选中有响应式的 client 构建（已用最小 repro 验证：store 变更触发 memo 重算）。上游 app 自身测试使用 `--conditions=solid` + happy-dom 预载（其 JSX 预载所必需），与本包命令不同属正常，两者均已如实记录。

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
| V7 泄漏扫描 | `bash scripts/leak-scan.sh` | PASS（rc=0；评审修复后 2026-10-24 重跑）：高置信模式仅命中 7 处已过滤的 AWS 文档示例密钥（AKIA…EXAMPLE 形式；构成：扫描脚本自身模式行 4 处 + 上游 test fixture 3 处；计数不含本文自引用，本文不引用完整示例键字面量）；`git check-ignore` 抽查全部忽略 | 脚本输出 |
| V8 证据文档 | 本文 | 记录完成 | — |
| 锁文件哈希 | `sha256sum bun.lock` | `05b7cf62b016aa79c8e8c38e45b8df86892d09f8c037877475bdb78bdcdde6a4`（与 `provenance.json#pinUpdateExercise.closureRefresh.lockDiff` 记录一致，reconciliation 确定性复现；issue #3 后新哈希见下节 V-lock 行） | 本文 |
| V-mh 第一方包单测 | `bun test --conditions=browser packages/mobile-hosts` | PASS：48 tests / 48 pass / 0 fail，801 expect()（identity/registry/state-machine/credential-ref/storage/upstream-map 六文件；含 T1–T14 逐条、非法转移拒绝、取消无残留、删除/断开零 transport 调用、host-key stub 恒拒绝、载荷白名单、凭据形字段拒收、变更传播断言） | 本文 issue #3 段 |
| V-cRef 凭据引用探针 | `bun run scripts/verify-credential-ref.ts` | PASS：M-005 schema 往返保留 credentialRef、password 仍被剥离（含 legacy 载荷）、M-006 对话框构造转发 `original.http.credentialRef` 且早退比较不含 ref。诚实边界：M-006 断言为对 dialog.tsx 源的静态结构检查（正则），未在 Solid 运行时执行对话框；探针以 createRequire 经 `packages/app` 依赖图解析 effect@4.0.1（隔离 linker 下 scripts/ 无法直接解析） | 脚本输出 |
| V-upstream 上游定向回归 | `bun test --conditions=solid --isolate --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts src/runtime/server/persistence.test.ts`（在 packages/app 下） | 4 pass / 1 fail。该 1 fail 为 **M-002 预先存在**（上游用例断言 encode 保留 password，与 M-002 memory-only 语义冲突；已用「仅 M-002、无 M-005」的基线树复跑确认失败一致，非 M-005 引入）。另跑 `src/servers/registry/{management,controller}.test.ts` + `src/runtime/server/registry.test.ts`：12 pass / 0 fail。不声称上游全量套件 | 本文 issue #3 段 |

## 四态区分表

| 能力/条目 | implemented | built-local-test | device-tested | real-remote-tested |
| --- | --- | --- | --- | --- |
| vendor 闭包 + provenance + 补丁（M-001/002/003） | ✓ | ✓（V1/V3/V-cred） | BLOCKED | BLOCKED |
| mobile-hosts 包（注册表/身份键/状态机/端口 stub/映射/UI） | ✓ | ✓（V-mh：50 单测） | BLOCKED（G13–G15） | BLOCKED |
| vendor 运行时接缝（M-004…M-008） | ✓ | ✓（V2 冒烟 ×3、V3 ×5、V-cRef） | BLOCKED（G1/G13/G14） | BLOCKED |
| connection 字段契约 + credentialRef（M-005/M-006） | ✓ | ✓（V-cRef） | BLOCKED（G9/G14） | BLOCKED |
| web 静态构建（含 PWA SW、主题） | ✓ | ✓（V2，3330 文件） | BLOCKED（G1/G10） | BLOCKED |
| Android 壳代码（Gradle 骨架/Manifest/netsec/Kotlin） | ✓ | 静态验证 ✓（V6 XML + V7）；编译 **BLOCKED**（无 SDK，无 APK） | BLOCKED | BLOCKED |
| 回环 asset server + WebView 配置 + 生命周期 | ✓（代码） | 编译/运行 BLOCKED | BLOCKED（G1/G2/G9/G12） | BLOCKED |
| 上游 app UI（会话/终端/设置/权限/文件 Diff 的 vendored 代码） | ✓（vendored） | ✓（随 V2 构建打包） | BLOCKED | BLOCKED |
| connection 字段契约 + memory-only（M-002） | ✓ | ✓（V-cred 静态） | BLOCKED（G9） | BLOCKED |
| connection / server-list 产品能力 | 已确认未实现 | BLOCKED | BLOCKED | BLOCKED |
| NOTICE-THIRD-PARTY.md | 未生成（V4 BLOCKED） | — | — | — |
| SSH 隧道 | 未开始（归 #6） | — | — | — |
| live 直连 HTTPS 会话 | 已确认目标 | BLOCKED（无授权服务/模型） | BLOCKED | BLOCKED |

## issue #3 段（主机注册表、身份键与连接状态机）——2026-10-24 实测记录

交付物：第一方包 `packages/mobile-hosts/`（@opencode-mobile/mobile-hosts）+ 五个 vendor 补丁 M-004…M-008（`vendor/upstream/patches/mobile/`，两处登记：`patches/mobile/manifest.json` 与 `vendor-manifest.json#mobilePatches`，均含 owner 字段）。提交链 `ff0a69f → 1de095c → c5dd037 → aed9eba → e881ad9 → 99b6d40 → 34b5752`（分支 `issue-3-host-registry`，基于 dev @ 693ad3f，未 push）。

| 验证项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| V-lock（issue #3） | `git diff 693ad3f 1de095c -- bun.lock` + 段比对 | lock 变更 +16/−2（workspaces 增 `packages/*`，新增 `packages/mobile-hosts` 工作区条目）；patchedDependencies 段 9/9 逐字不变；`bun install --frozen-lockfile` rc=0（1093 installs / 1203 packages, no changes）。换锁前未动 node_modules（教训遵守：本次为全新安装，无 superset 漂移） | 本文；`sha256sum bun.lock` = `84eeea9d2d8f36b1b537e3201fd43e5bbfe9ba82cb230f643649830713fc132d` |
| V2 冒烟（M-004 后） | `bun run build:web` | PASS（rc=0，6138 modules）；别名解析核验：`new URL("../../../../packages/mobile-hosts/src/index.ts", import.meta.url)` 自 `packages/app/vite.js` 解析到仓库根 `packages/mobile-hosts/src/index.ts`（真实文件，node --input-type=module 实测） | 本文 |
| V2 冒烟（M-007 后） | `bun run build:web` | PASS（rc=0，11.56s）；dist 标记：`opencode-mobile.hosts.v1` 与 `mobile-ssh` 命中 `dist/_assets/index-BZUHd7yB.js(.map)`，`mobile(M-002)` 标记仍命中 `dist/_assets/health-BFLwV0ab.js(.map)`（新 chunk 哈希，语义不变） | 本文 |
| V2 冒烟（M-008 后，最终产物） | `bun run build:web` + `bash scripts/copy-web-dist.sh` | PASS（rc=0，11.53s）；3329 文件 / 152,736,649 bytes 拷入 assets；manager 文案键（`SSH hosts`/`SSH 主机`/`hostManager`）命中 `index-TwxVaV1z.js`。文件数 3330→3329 的差异为懒加载分块切分变化（新增 M-008 懒块、相邻分块合并），非丢失：见偏差表 | `web-dist/manifest.json`（generatedAt 2026-10-23T21:35:05Z；sha256 `9459b17902ecaa5b69100d6a46a35bee6e1238177c87b277ffee17f3600629be`） |
| V3 闭包核对（每补丁后） | `bash scripts/verify-closure.sh` | PASS ×5（M-004/M-005/M-006/M-007/M-008 各一次）：树 == pin + 已登记 8 个补丁（5 上游 + M-001…M-003 + 新 M-004…M-008），`DANGLING=0`，recordings 排除核对通过 | 本文 |
| V-mh / V-cRef / V-upstream | 见上方验证项记录表 | 全部如上（48 单测、探针 PASS、上游定向 4 pass/1 预存 fail + 12 pass） | 本文 |
| V5 JSON 校验（issue #3 增量） | `python3 -m json.tool` | PASS：`patches/mobile/manifest.json`、`vendor-manifest.json`、`web-dist/manifest.json` 可解析 | 本文 |
| V7 泄漏扫描（issue #3 重跑） | `bash scripts/leak-scan.sh` | PASS（rc=0；启发式扫描，非 gitleaks）；新第一方包无凭据形字面量 | 脚本输出 |
| 文档链接核对 | `test -f` 全量核对（docs/design/**、README、project-scope、build-and-verify） | PASS（见机械检查记录） | 本文 |
| 单元清单 ↔ units 文件对应 | 人工核对 | architecture.md 清单 9 行 ↔ units/ 3 文档 + 6 TODO 行，一一对应，无幽灵行（host-manager/host-dialog 归 server-list、host-key-prompt 归 connection，清单不单列新行） | 本文 |
| V-css（评审修复轮） | `bun run build:web` + dist CSS 选择器静态核验 | PASS：新令牌类 `.text-12-regular/.text-12-medium/.text-12-mono/.text-14-regular/.text-14-medium/.text-text-strong/.text-text-weak/.border-border-weak-base/.rounded-\[8px\]` 全部命中 dist CSS；6 个非法类（text-14-strong/text-13-strong/text-13-muted/text-12-strong/text-12-muted/border-token）零残留。诚实发现：`text-danger-base` 在本构建同样不生成（主题无 danger 色令牌），已一并改用 text-text-strong + role=alert/status | 本文 |
| V-lock（评审修复轮） | `bun install` + `--frozen-lockfile` + 段比对 | PASS：移除 mobile-hosts 未使用的 `@opencode/client` 依赖（源码零引用；#6 需要时再按 workspace:* 加回），bun.lock 仅 −1 行；patchedDependencies 9/9 逐字不变；`sha256sum bun.lock` = `b21f5cf1658a2df4f73e07f5388b0fc3141903bca8436c80947659db5abf782d`（换锁前删除 node_modules 重建） | 本文 |
| V2 最终产物（评审修复轮） | `bun run build:web` + `bash scripts/copy-web-dist.sh` | PASS（rc=0，11.64s）；3329 文件 / 152,740,475 bytes；`web-dist/manifest.json` generatedAt 2026-10-23T21:58:58Z，sha256 `ebbdcf1b47e680f7ddc92aac65ca96fa62b94e2bc4780f0cf8c2995853fa7379` | 本文 |
| V-mh（评审修复轮） | `bun test --conditions=browser packages/mobile-hosts` | **50 tests / 50 pass / 0 fail，821 expect()**（新增：引用清空到达持久化载荷、非 ready 态不暴露真实端点、driver 级 disconnect 零 transport 调用） | 本文 |
| V-cRef（评审修复轮） | `bun run scripts/verify-credential-ref.ts` | PASS（语义未变，重跑确认） | 本文 |
| V3（评审修复轮） | `bash scripts/verify-closure.sh` | PASS（树等价 + DANGLING=0；本轮零 vendor 源码改动，补丁集不变） | 本文 |

### 诚实边界（issue #3 段）

- **设备级全部 BLOCKED**：G13（多 host 一窗 + 隔离）、G14（连接状态呈现与恢复）、G15（SSH 身份稳定，依赖 #6 隧道）未执行；host-key 真实校验流（#6）、SSH 凭据引用真实解析（#4）、SSH 端口变化真机验证（#6）、live 直连 E2E 均未执行。不声称"可连接"。
- **M-006 静态边界**：对话框透传经源码结构探针验证（见 V-cRef），未在 Solid 运行时执行对话框组件；上游 dialog 自身无单测可挂。
- **上游全量套件不作为门禁**：仅定向文件如实记录（persistence.test.ts、servers registry 三件）。
- **M-007 构建期变量的取舍记录**：不采用 `VITE_OPENCODE_SERVER_MODE=none`——那会把"壳不装配 origin 服务"这一行为隐藏进构建配置，且该变量为上游 dev 语义（dev 模式另有 host/port 逻辑），补丁内联修改保持行为可见、可随上游 rebase、不引入隐藏构建配置依赖（补丁 reason 字段同记）。

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
| G13 多 host 一窗 + 隔离（issue #3） | 真机/模拟器（+授权远程服务） | issue #3 验收第 5/3 条 |
| G14 连接状态呈现与恢复（issue #3） | 真机/模拟器 + 授权远程服务；host-key 真实流另归 #6 | issue #3 验收第 2 条 |
| G15 SSH 身份稳定 + 注册表恢复（issue #3） | 真机/模拟器 + SSH 远程主机（依赖 #6 隧道） | issue #3 验收第 3 条 |
| host-key 真实校验流 | SSH 适配未实现（stub fail-closed 已立桩，恒拒绝） | issue #6 |
| SSH 凭据引用真实解析 | NullResolver 恒 undefined；Keystore 未实现 | issue #4 |
| SSH 端口变化后身份稳定真机验证 | 隧道重解析未实现（单测已锁定键不随端口变化） | issue #6（配合 G15） |
| live 直连 E2E（含 incompatible 真服务差异核对） | 授权服务 + 模型；直连不展示 incompatible（上游 web 原生行为，补齐归 #5） | issue #2/#5 |

## 许可审计 12 项待用户决策（2026-10-24 实跑输出）

`bun run scripts/license-audit.ts`：1089 packages 审计，STOP 于以下 12 项（9 个独立包，按平台二进制折叠为 6 家族；NOTICE-THIRD-PARTY.md 因此未生成）：

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
| 返回键实现与计划表述差异 | 计划 §3 写 `onBackPressedDispatcher`，该 API 属 androidx，与「零 androidx」约束冲突；按框架 `onBackPressed` 实现（minSdk 29 全覆盖）。Android 16 起 targetSdk ≥ 36 默认开启 predictive back、`onBackPressed` 不再被调用，故 manifest 显式 `android:enableOnBackInvokedCallback="false"` 维持该行为；未来迁移 `OnBackInvokedCallback` 需 minSdk（API 33+）守卫 | 已在 [design/interaction.md](design/interaction.md) 交互基线记录；迁移留后续 issue |
| 许可审计条目口径 | 交接摘要「lightningcss×2」为概数；实跑 12 项中 lightningcss 系为 6 项（2 个 JS 版本 + 4 个平台原生二进制包） | 按实跑输出记录（本文上表），以 `provenance.json` 的 12 项总数为准 |
| 回滚比对计数口径 | 3138 = 前 pin（cec70f3）构建的 dist 文件基数（回滚重建后与之比对），3330 = 候选 pin（b4525d79）构建基数（当前 `web-dist/manifest.json`）——两次构建本就不同分母，3110/3138 是回滚重建相对其自身基数的字节一致数 | 结论句替代此前「待澄清」记录；不影响 fallback 判定结论 |
| sourcemap 不可复现 | 28/3138 `.map` 跨构建字节不同 | 已接受限制（fallback 判定放行），见演练记录 |
| 泄漏扫描非 gitleaks | 环境无 gitleaks，`scripts/leak-scan.sh` 为启发式 + check-ignore 抽查 | 脚本头与本文均已明示 |
| gradle-wrapper jar 不提交 | 仅提交 `gradle-wrapper.properties`；jar 由 `gradle wrapper --gradle-version 8.11.1` 本地引导 | `.gitignore` 已登记 |
| bun test 条件选择 | solid-js@1.9.15 exports 无 `solid` 条目；本包单测用 `--conditions=browser` 选中响应式 client 构建（repro 验证），与上游 app 测试的 `--conditions=solid`+happy-dom 组合不同 | 本文「构建流水线」段已记录两条命令 |
| 上游 persistence.test.ts 1 fail 预存 | 该用例断言 encode 保留 password，与 M-002 memory-only 冲突；基线（仅 M-002）复跑失败一致，非 M-005/M-006 引入；不作为本轮门禁 | 本文 V-upstream 行 |
| dist 文件数 3330→3329 | M-007/M-008 引入新懒块与分块合并改变 chunk 切分；copy-web-dist 全量重拷（sha256 清单已刷新），V2 rc=0 且 6138 modules 不变 | 本文 V2（最终产物）行 |
| mobile-hosts UI 首版令牌类非法 | 首版误用 text-14-strong/text-13-*/text-12-muted/border-token（dist CSS 零规则落地）；评审修复轮替换为合法令牌组合并静态核验；theme 无 danger 色令牌，错误/降级提示改用 text-text-strong + role=alert/status | 本文 V-css 行；[design/visual.md](design/visual.md) |
| credentialRef 清空语义 | update：undefined=保留、空串=清空；对话框编辑路径必须传空串而非 undefined（首版误转换导致清空静默失效）。另发现 solid setStore 按对象路径写入是 MERGE 语义，删除键须整组替换数组——均已修并有测试锁定 | 本文 V-mh（评审修复轮）；[design/units/connection.md](design/units/connection.md) credentialRef 契约 |
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
| credentialRef 契约（[units/connection.md](design/units/connection.md)） | M-005 patch（persistence.ts）、M-006 patch（dialog.tsx）、`scripts/verify-credential-ref.ts` | V-cRef 探针 | 一致；引用非机密、password 仍剥离、早退比较不含 ref；真机归 G9/G14 |
| SSH 主机注册表白名单（[units/server-list.md](design/units/server-list.md)） | `packages/mobile-hosts/src/{registry,storage}.ts` | V-mh（registry/storage 单测：白名单、凭据形字段拒收、往返无 password 形字段、重复 id 折叠、损坏 JSON 回退、v1 迁移钩子） | 一致；载荷仅 id/name/target/credentialRef/时间戳 |
| 身份键与隔离（[units/server-list.md](design/units/server-list.md)） | `packages/mobile-hosts/src/identity.ts`、`upstream-map.ts` | V-mh（identity/upstream-map 单测：直连键随端口变化、SSH 键 `mobile-ssh:<uuid>` 与端点解耦、键唯一稳定） | 一致；端口变化身份不变的真机核验归 G15 |
| 连接状态机 T1–T14（[units/connection.md](design/units/connection.md)） | `packages/mobile-hosts/src/state-machine.ts`（TRANSITIONS 恰 14 行）、`runtime.ts`（驱动） | V-mh（state-machine 单测逐条 + 非法转移 + 取消无残留 + T14 零 transport 调用） | 一致；文档 T1/T8/T13 行与实现语义一致（T8 预算未耗尽回 offline） |
| host-key stub fail-closed（[units/connection.md](design/units/connection.md)） | `packages/mobile-hosts/src/ports.ts`（StubHostKeyVerifier）、`runtime.ts`（verifier 先于 transport） | V-mh（stub 恒拒绝、拒绝后零连接尝试） | 一致；真实校验归 #6，BLOCKED |
| entry 引导与注入（M-007） | M-007 patch（entry.tsx） | V2 冒烟 + dist 标记（`opencode-mobile.hosts.v1`/`mobile-ssh` 命中 index chunk） | 一致；`location.origin` 服务装配与 ?auth_token 直通已移除（壳内不适用） |
| 设置挂载（M-008） | M-008 patch（settings/shell.tsx） | V2 冒烟 + manager 文案键命中 dist | 一致；多 server 布局入口缺口已在 interaction.md/server-list.md 记录 |

### 机械检查记录（2026-10-24）

- 文档相对链接：对 `README.md`、`docs/design/**`、`docs/project-scope.md` 中的仓库内相对链接逐一 `test -f`，全部存在（issue #3 交付后 2026-10-24 重跑，含 `docs/build-and-verify.md` 与 `docs/design/units/*` 的新增链接）。
- 设计单元清单、索引表与 `design/units/` 实际文件一一对应；未决 TODO（会话列表/时间线/终端/设置/权限确认/文件与 Diff、深链、状态恢复、预测性返回）在索引与单元文档中可见；issue #3 的 host-manager/host-dialog 并入 server-list 单元、host-key-prompt 并入 connection 单元，清单未单列新行（机械核对一致）。
