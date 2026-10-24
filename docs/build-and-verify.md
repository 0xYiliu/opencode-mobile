# 构建与验证证据（V8）

本文按 issue #2 验收第 6 条记录真实工具链、命令与结果，并区分四态（implemented / built-local-test / device-tested / real-remote-tested）。缺失设备/服务/模型的一律标 BLOCKED，不得写成通过。关联：[issue #2](https://github.com/0xYiliu/opencode-mobile/issues/2)、[issue #27](https://github.com/0xYiliu/opencode-mobile/issues/27)（上游更新演练）、[issue #4](https://github.com/0xYiliu/opencode-mobile/issues/4)（Keystore，见下方 issue #4 段）、[issue #3](https://github.com/0xYiliu/opencode-mobile/issues/3)（主机注册表，见下方 issue #3 段）。

记录日期：2026-10-24。issue #3 段（mobile-hosts 包、M-004…M-008 补丁）的验证于同日在分支 `issue-3-host-registry` 工作树执行，全部为本机构建/静态/单测级验证；设备级验证全部 BLOCKED。

记录日期：2026-10-24。issue #4 段（凭据保险库、M-009/M-010/M-007 修订、审计脚本）的验证于同日在分支 `issue-4-credential-vault` 工作树执行（基线 dev @ 815bde5，计划 v3），全部为本机构建/静态/单测级验证；桥 bring-up 与设备门禁 C1–C5 全部 BLOCKED。

记录日期：2026-10-24。issue #5 段（直连传输卫生与错误分类，M-011…M-014、V-conn 探针）的验证于同日在分支 `issue-5-direct-connection` 工作树执行（基线 dev @ f9cc526，计划 v1），全部为本机构建/静态/单测级验证；probe 桥 bring-up 与错误矩阵设备门禁（G4/G5/G11/G16）全部 BLOCKED。

记录日期：2026-10-24。issue #6 段（SSH 隧道传输：ssh 桥/verifier/transport、驱动装配、Kotlin ssh 四件、M-015、V-ssh 探针）的验证于同日在分支 `issue-6-ssh-tunnel` 工作树执行（基线 dev @ 8d55bd2，计划 v1；S1–S8 提交链），全部为本机构建/静态/单测级验证；桥 bring-up（G17）与 SSH E2E 及 Kotlin 编译全部 BLOCKED。

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
bun test --conditions=browser packages/mobile-hosts   # V-mh（issue #3/#4 第一方包单测）
bun run scripts/verify-credential-ref.ts              # V-cRef（issue #3 N2 探针，issue #4 升级为 M-006/M-009 口径）
bun run scripts/verify-credential-vault.ts            # V-vault（issue #4 真值表/桥/M-010 探针）
bun run scripts/audit-secret-persistence.ts           # V-secret（issue #4 明文持久化审计）
bun run scripts/verify-direct-connection.ts           # V-conn（issue #5 直连静态验证；补丁落地前用 --pre-vendor 分段）
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
| 设备凭据保险库（vault 端口/信封 v1/桥/Keystore 落盘/可选记住，issue #4） | ✓ | ✓（V-mh 96 单测、V-vault、V-secret、V2/V3） | BLOCKED（C1–C5） | BLOCKED |
| 直连传输卫生与错误分类（secure-fetch/URL 策略/probe 端口/Android probe 桥/M-011…M-014，issue #5） | ✓ | ✓（V-mh 140 单测、V-conn、V2/V3、V-cRef/V-vault 回归） | BLOCKED（G4/G5/G11/G16） | BLOCKED |
| 凭据绑定 UI + 凭据管理器（issue #4） | ✓ | ✓（V-css 令牌核验 + 单测） | BLOCKED（C2、G13） | BLOCKED |
| connection / server-list 产品能力 | 已确认未实现 | BLOCKED | BLOCKED | BLOCKED |
| NOTICE-THIRD-PARTY.md | 未生成（V4 BLOCKED） | — | — | — |
| SSH 隧道（认证/host-key/转发/四层分类，issue #6） | ✓ | ✓（V-mh 212 单测含 runtime-ssh 全流、V-ssh 全模式、V2/V3/V-conn 回归） | BLOCKED（G17 三桥 bring-up、SSH E2E） | BLOCKED |
| Kotlin ssh 四件 + gradle 依赖（jsch/bcprov） | ✓（代码） | 静态验证 ✓（V-ssh native 断言 + 括号平衡）；编译 **BLOCKED**（无 SDK，无 APK） | BLOCKED（G17） | BLOCKED |
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

## issue #4 段（设备凭据保险库与可选记住）——2026-10-24 实测记录

交付物：第一方 vault 模块（`packages/mobile-hosts/src/vault/`：types/envelope/transport/vault/remember 五件 + UI 凭据绑定块/凭据管理器 + i18n 新键 EN/ZH）、Android Keystore 落盘与桥（`android/app/src/main/java/ai/opencode/mobile/vault/` 三件 + MainActivity 握手/文件选择器 + Manifest 备份排除 + res/xml 两文件，零新依赖零 androidx）、vendor 补丁 M-009/M-010 与 M-007 修订（登记于 `patches/mobile/manifest.json` 与 `vendor-manifest.json#mobilePatches`，均含 owner 字段，共 10 个 mobile 补丁）、审计与探针脚本（`scripts/audit-secret-persistence.ts`、`scripts/verify-credential-vault.ts`）、`verify-credential-ref.ts` 升级为 M-006/M-009 口径。提交链 `0f961b6 → 41baea1 → b6e08e5 → e67445c → 05a30f9 → 1109c40 → 435a04f → 6215483 → 50beec6`（分支 `issue-4-credential-vault`，基于 dev @ 815bde5，未 push）。计划版本 v3（PASS），5 条评审备注落实见文末偏差表。

| 验证项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| V-lock（issue #4） | 未动依赖 | bun.lock 与 issue #3 终态逐字相同：`sha256sum bun.lock` = `b21f5cf1658a2df4f73e07f5388b0fc3141903bca8436c80947659db5abf782d`；vault 全部走 WebCrypto/平台 API，零新依赖（android build.gradle.kts 零新增） | 本文；`git diff 815bde5 HEAD -- bun.lock` 为空 |
| V-mh 第一方包单测 | `bun test --conditions=browser packages/mobile-hosts` | PASS：**99 tests / 99 pass / 0 fail，948 expect()**（10 文件；issue #3 的 50 项 + issue #4 的 49 项：信封真实 WebCrypto 往返/换绑拒绝/版本拒绝/截断与篡改、握手形状校验/port 不入全局（globalThis 键集合不变）/重复握手忽略/ack 前 unavailable/requestId 关联/超时显式 unavailable/dispose 拒绝在途请求、客户端校验（空值/64KiB 边界允许/超限拒绝/私钥 BEGIN 头/非法 kind/existingRef）、in-place ref 稳定、元数据无 value 且拒绝带值响应、corrupt/unsupported 按条目 undefined、UnavailableVault fail-closed、resolver 失败分类、真值表 v3 十二行+评审修复行 13（boundKind privateKey 空值保留绑定）+早退强制+初始值、runtime vault 默认 Unavailable/credentials 访问器/remove 联动/T14 回归）。**全程无 origin 伪造或 origin 断言**（探针含负检查） | 本文；脚本输出 |
| 类型检查 | `bunx tsc --noEmit -p packages/mobile-hosts/tsconfig.json` | PASS（过滤 bun:test 类型与 vendored ui 的 css side-effect import 两类环境噪声后零错误） | 本文 |
| V-vault 凭据 vault 探针 | `bun run scripts/verify-credential-vault.ts` | PASS：真值表 v3 行 1–12 + 评审修复行 13/14/15（boundKind=privateKey 空值保留绑定，add/edit 同义；password kind 行 12 语义不变）逐行经 in-process 引擎（真实信封加密）断言决策+落盘效应（put 铸造/in-place 稳定/clear 删除/abort·none·passthrough 零操作、条目数逐行核对）；host-dialog 装配静态核验（boundKind 传递、checkboxRendered=vaultAvailable、私钥绑定禁用密码位）；早退强制三态；初始值；M-010 静态（hydration 注入仅 setStore、门控 credentialRef+缺失 password、await 后快照索引新鲜度复检、注入块无直接存储写入）+ M-002 标记仍在；M-007 静态（entry 监听先于 render、五装配标记）+ 动态（形状校验握手捕获+ack、畸形握手忽略）；全第一方 vault 面代码级无 origin 咨询（注释剥除后检查） | 脚本输出 |
| V-cRef 凭据引用探针（升级） | `bun run scripts/verify-credential-ref.ts` | PASS：M-005 schema 往返保留 credentialRef、password 仍剥离（含 legacy）；M-006/M-009 对话框构造以 remember 决策 passthrough 携带引用、早退比较不含 ref 且含 `!decision.forcesSave` 门、决策先于早退 | 脚本输出 |
| V-secret 明文持久化审计 | `bun run scripts/audit-secret-persistence.ts` | PASS（A–G 七段）：A 写入路径清单（vendored app 全部 localStorage/sessionStorage 写入仅持久化机械 + 2 个登记的非秘密 UI 写入方（pwa 路由键/通知认领键），原始句柄仅进机械 write()；theme preload 只读；mobile-hosts vault 模块零 DOM storage）；B 键清单（`opencode.global.dat:server`、legacy `server.v3`、`opencode-mobile.hosts.v1`、草稿键）核对；C 服务载荷 encode 剥 password（真实 effect@4.0.1 往返，含 legacy 只解不编码）+ credentialRef 保留；D 扩展连接形状无 http 外凭据形字段（上游 ServerEntry + 我方镜像）；E 草稿边界登记恰 4 键（prompt/comments/file-view/layout，用户内容）；F dist 标记 `mobile(M-002)` 与 `mobile(vault-v1)` 均命中构建产物；G vault 元数据无 value 字段且客户端拒绝带值响应 | 脚本输出 |
| V2 web 构建（M-009/M-007 修订后） | `bun run build:web` | PASS（rc=0，6158 modules，11.9s）；dist 标记：`mobile(M-002)` 命中 `dist/_assets/health-CgcOj6Fn.js(.map)`、`opencode-mobile-vault-handshake` 命中 `index-DtKOK4jL.js`、M-009 文案键命中 `zh-Ch81V5Ky.js`/`language-CD9_hHNf.js` | 本文 |
| V2 web 构建（vault-v1 标记后，最终产物） | `bun run build:web` + `bash scripts/copy-web-dist.sh` | PASS（rc=0，6158 modules，11.52s，评审修复轮重建）；3480 文件 / 152,911,729 bytes 拷入 assets；`mobile(vault-v1)` 命中 dist | `web-dist/manifest.json`（generatedAt 2026-10-24T00:41:39Z；sha256 `dd4811055c57d71ab309a18bcbfc3b0efaf6a9fbcc89da9380b128d2f9598c16`） |
| V3 闭包核对 | `bash scripts/verify-closure.sh` | PASS（最终态，10 个 mobile 补丁登记）：树 == pin b4525d79bf + 已登记 patches 字节一致、LICENSE 一致、`DANGLING=0`、recordings 排除核对通过；M-007 修订补丁经 pristine pin 树 `git apply --check`+apply+字节比对 round-trip 验证 | 本文 |
| V5 JSON 校验（issue #4 增量） | `python3 -m json.tool` | PASS：`patches/mobile/manifest.json`、`vendor-manifest.json`、`web-dist/manifest.json` 可解析 | 本文 |
| V6 Android XML 校验（issue #4 增量） | python3 `xml.dom.minidom` 解析 | PASS：新增 `data_extraction_rules.xml`（root `<data-extraction-rules>`）、`full_backup_content.xml`（root `<full-backup-content>`）+ 既有 Manifest/netsec/themes/strings 全部解析成功、退出码 0 | 本文 |
| V7 泄漏扫描（issue #4 重跑） | `bash scripts/leak-scan.sh` | PASS（rc=0）；中途 1 次 FAIL 为新测试 fixture 的 PEM 形字面量（合成值，非泄漏）——拆分构造后复跑 rc=0（提交 1109c40）；低置信 REVIEW 项均为合成探针值（`synthetic-password-…`/`definitely-a-secret` 等，example.invalid 域） | 脚本输出 |
| V-css 令牌核验（issue #4） | dist CSS 选择器静态核验 | PASS：新组件全部 31 个令牌类命中 dist CSS（含 `.text-12-regular/.text-12-medium/.text-12-mono/.text-14-regular/.text-14-medium/.text-text-strong/.text-text-weak/.border-border-weak-base/.rounded-\[8px\]/.rounded-\[12px\]/.hidden/.border-t/.pt-3/.truncate` 精确转义选择器）；禁用令牌（text-13-*/text-12-strong/text-12-muted/text-14-strong/text-danger-*/border-token）零残留 | 本文 |
| TLS/host-key/netsec 静态确认 | `git diff 815bde5 HEAD -- android/app/src/main/res/xml/network_security_config.xml` 及 ssl/host-key 相关代码 | 零改动：netsec 配置、`onReceivedSslError` 恒 CANCEL、HostKeyVerifier stub fail-closed 全部未触碰 | 本文；git diff 为空 |
| 文档链接核对（issue #4 后） | `test -f` 全量核对 | PASS（见机械检查记录） | 本文 |

### 诚实边界（issue #4 段）

- **设备级全部 BLOCKED**：桥 bring-up（C1 握手/ack/重试耗尽呈现、C5a 错误 origin 探针顺序）、凭据读写端到端（C2 含私钥导入与 ValueCallback 恰一次）、64KiB 边界（C3）、备份排除负例（C4）、平台 WebMessage 细节（ack 到达时序、targetOrigin 强制的真机复核）——全部未执行，不声称任何设备行为。
- **M-009/M-010 静态边界**：真值表经第一方决策核心（`evaluateRemember`）+ in-process 引擎逐行验证，但 vendored dialog 的 Solid 装配（勾选框渲染、mutation 错误呈现）为源码结构探针（V-cRef/V-vault），未在 Solid 运行时执行对话框；M-010 hydration 注入为源码结构断言 + M-002 编码路径语义证明，未在运行时执行 registry。
- **Android Kotlin 未编译**：无 Android SDK，Kotlin 三件与 MainActivity 改动仅静态（V6 XML + 人工审读），BLOCKED 如实。
- **无 origin 断言**：全部模拟测试不伪造 event.origin、不断言 origin 值（平台证据链：恒空串）；信任依据为形状校验+三层信任（见 [design/architecture.md](design/architecture.md)）。

### 评审修复轮（CODE_REVIEWER on 93b7675 判定 FAIL → 修复，2026-10-24）

评审独立复跑全部验证 PASS、红线全干净；修复项与落实：

| 项 | 修复 | 验证 |
| --- | --- | --- |
| B1（blocking）host-dialog add+私钥导入无法完成绑定且逃生路径静默换 kind | `evaluateRemember` 增可选 `boundKind`：已勾+空值+绑定私钥 → passthrough 保留绑定（行 13，add/edit 同义；M-009 不传该字段不受影响）；host-dialog 装配传 `boundKind: boundMeta().kind`、`checkboxRendered: vaultAvailable()`；次级隐患按「禁用密码位」处置——私钥绑定期间密码输入禁用+行内说明（防 in-place 换 kind），替换路径=取消勾选再绑定 | V-vault 行 13/14/15 + 3b 装配静态核验；V-mh 新增 2 单测（99/99） |
| B2（blocking）startHandshake 异常路径以过期 round 调度重试（postWebMessage 抛出→本轮零重试） | catch 内不再 close/bump round，直接 `scheduleRetry(round)`（round 为活值；重试回调自带 close+重建） | 代码审读；C1 门禁描述同步（postWebMessage 失败进入有界重试） |
| N1 VaultStore 回退分支可毁旧密文 | 删除「delete target+二次 rename」回退：POSIX rename 原子覆盖，失败只删 tmp 并抛 io（注释写明二次失败路径危害） | 代码审读 |
| N2 ack 前 native 受理操作与文档不符 | `handleClientMessage` 非 ack 操作加 `acked` guard（零能力于 ack 前，三层信任第 3 层落地） | 代码审读 |
| N3 M-010 hydration 跨 await 快照索引写回 | 写回前 `store.list[index] !== conn` 则放弃注入；M-010 patch 自 pristine 树重新生成并 round-trip 验证 | V-vault M-010 静态断言（含新鲜度行） |
| N7 dispose 在途请求无测试 | 新增单测：dispose 拒绝在途请求（unavailable）+ 迟到响应忽略 + dispose 幂等 | V-mh 99/99 |
| N4 行 10 被健康检查门控 | connection.md 真值表增「装配语义注记」：put/clear 在健康检查通过之后执行，失败按「保存失败」保留 ref 与条目 | 文档；链接核对 |
| N5 重试耗尽与 ack 在途竞态窗口 | interaction.md C1 记录：窗口有界（≤一个重试周期）、可见（unavailable 显式+横幅）、无降级（重载即恢复） | 文档 |
| N6/N8 | 提交点级事实状态不要求改写历史（最终树准确）；N8 冗余参数折叠跳过 | — |

## issue #4 段（设备凭据保险库与可选记住）验证对应（验收映射）

| Issue #4 验收项 | 交付与验证 | 状态 |
| --- | --- | --- |
| 1 加密静态存储（Keystore；秘密不入 APK/git/localSessionStorage/日志/备份迁移） | D2 信封 v1（V-mh 信封套件+V-vault 探针）、index.json 无值（V-mh+V-secret G）、备份排除（Manifest+两 XML，V6；负例 C4 BLOCKED）、日志零值（Kotlin 注释+审读）、dist 标记（V-secret F） | implemented + built-local-test；device BLOCKED（C4） |
| 2 记住/不记住、私钥导入/替换/删除、有界清理、元数据仅引用 | 真值表 v3（V-mh+V-vault 逐行）、host-dialog 绑定块/凭据管理器（V-css+单测）、导入流（ValueCallback 恰一次+64KiB 双检，代码级；设备 C2/C3 BLOCKED）、URI 不持久化（代码注释+审读） | implemented + built-local-test；device BLOCKED |
| 3 明文审计、不静默降级 | V-secret 审计七段 PASS；unavailable 显式状态、无明文回退代码（V-mh UnavailableVault + V-vault C5d 断言） | implemented + built-local-test |
| 4 无额外解锁、失效恢复路径 | 不设 setUserAuthenticationRequired（VaultCrypto 注释+审读）；失效矩阵与恢复文案（connection.md/interaction.md/i18n 恢复键）；锁屏 N/A by design | implemented（逻辑级）；真机恢复 C2 BLOCKED |
| 5 设备测试（合成秘密、TLS/host-key 保持） | 全部 BLOCKED（C1–C5、APK 构建）；netsec/ssl/host-key 零改动静态确认 PASS | BLOCKED |

## issue #5 段（直连传输卫生与错误分类）——2026-10-24 实测记录

交付物：决策记录 [0002](decisions/0002-direct-connection-transport.md)（D1 validated-follow/D-URL/D5 WS 票据/D2 system-CA/D3 明文不支持/D4 分类落点）、第一方传输与 probe 模块（`packages/mobile-hosts/src/transport/`：connection-errors/url-policy/secure-fetch 三件 + `src/probe.ts` + i18n 十二分类键 EN/ZH + runtime probe 访问器）、Android probe 两件（`android/app/src/main/java/ai/opencode/mobile/probe/`：DirectEndpointProbe.kt + ProbeBridge.kt + MainActivity 接线）、vendor 补丁 M-011…M-014（登记于 `patches/mobile/manifest.json` 与 `vendor-manifest.json#mobilePatches`，均含 owner 字段，mobile 补丁总数 10→14）、静态探针 `scripts/verify-direct-connection.ts`（V-conn，F3 分段策略）。提交链 `c7c5556 → 756fd28 → 6cb8d33 → b5fb626 → 3edf631 → 2719d25 → b18d9e0 → fd25ba8 → ece20b1 → e467f8f`（分支 `issue-5-direct-connection`，基于 dev @ f9cc526，未 push）。计划版本 v1（PASS），5 条评审备注（F1–F5）落实见下表。

| 验证项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| V-lock（issue #5） | 未动依赖 | bun.lock 与 issue #4 终态逐字相同：`sha256sum bun.lock` = `b21f5cf1658a2df4f73e07f5388b0fc3141903bca8436c80947659db5abf782d`；`bun install --frozen-lockfile` rc=0（1060 packages installed）；全部走 WebCrypto/平台 API/HttpURLConnection，零新依赖（android build.gradle.kts 零改动） | 本文；git diff f9cc526 HEAD -- bun.lock 为空 |
| V-mh 第一方包单测 | `bun test --conditions=browser packages/mobile-hosts` | PASS：**140 tests / 140 pass / 0 fail，1146 expect()**（13 文件；issue #3/#4 的 99 项 + issue #5 的 41 项：userinfo 拒绝（含 percent-encoded）/同源放行/跨主机拒/降级拒/端口变化=跨源/回环别名=跨源/升级亦拒（origin 双向严格）/空 responseURL=合成放行/SecureFetchError 消息纪律（message 避开 health 重试正则词——**纵深而非重试抑制（勘误 N1）**：上游 client 把 fetch 异常包为 `ClientError("Transport")`，健康检查面仍按上游策略重试，fail-closed 无害）+ 全码映射/secure-fetch mock fetch 五场景（跨主机拒、降级拒、凭据 URL 拒发且零请求、直连放行、同源重定向放行）+ init 透传 + Request/URL 输入 + 错误原样穿透、StubProbePort 恒 unavailable、分类→i18n 全集断言（EN/ZH 非空非桩）、probe 桥形状校验/vault 握手不误捕/ack 前零能力/超时显式 unavailable/userinfo URL 不过桥/错误与畸形码退化、runtime 默认 stub + 注入访问器） | 本文；脚本输出 |
| V-conn 直连静态验证（S6 提交点） | `bun run scripts/verify-direct-connection.ts --pre-vendor` | PASS（rc=0）：①android 负断言 13 个 .kt/.xml 零命中（无 X509TrustManager/checkServerTrusted/checkClientTrusted/HostnameVerifier/setSSLSocketFactory/SslErrorHandler proceed/trust-all 姿态）；②netsec 未放宽（base 禁明文 + 仅 system 锚 + 回环例外恰 127.0.0.1/localhost 两域）；③12 分类码 Kotlin↔JS 线协议一致 + 第一方 i18n EN/ZH 全集非空；④vendor 依赖断言按 F3 分段跳过 | 脚本输出 |
| V-conn 直连静态验证（S10 后全量） | `bun run scripts/verify-direct-connection.ts` | PASS（rc=0）：前述三段不变 + ④全量生效：vendored web.ts 含 `createSecureFetch` 注入与 mobile(M-011) 标记注释；dist 标记 `mobile(M-011)`、`opencode-mobile-probe-handshake`、`mobile(probe-v1)` 在 3457 个构建资产中全部命中 | 脚本输出 |
| V2 冒烟（M-011 后） | `bun run build:web` | PASS（rc=0，6162 modules，11.7–11.9s）；**dist 标记勘误与修复**：首版 `void MARKER` 引用被 tree-shake（标记仅存于 .map sourcemap），修复为写入逃逸函数对象的属性后，`mobile(M-011)` 命中压缩产物 `dist/_assets/src-*.js` | 本文 |
| V2 冒烟（M-012/M-013 后） | `bun run build:web` | PASS（rc=0，6162 modules）；M-013 后 `dialog.server.error.*` 键命中 `dist/_assets/language-*.js` 与 `zh-*.js`。**键数勘误（N5）**：app i18n 每语言实为 **12 键 = 11 个失败分类 + `credential-url`**（`ok` 无对话键——probe `ok` 不产生错误文案，冲突按 D4 退化为泛化文案；评审若按「12 码+credential-url=13」核对，差额即 `ok` 的有意缺席） | 本文 |
| V2 最终产物（M-014 后） | `bun run build:web` + `bash scripts/copy-web-dist.sh` | PASS（rc=0，11.7s）；3480 文件 / 152,967,449 bytes 拷入 assets；probe 握手串与 mobile(probe-v1) 标记命中压缩产物 | `web-dist/manifest.json`（sha256 `883902ae323120678f15eb42fe1f5817e0405b276386f90ae41d707082efadaf`） |
| V3 闭包核对（每补丁后） | `bash scripts/verify-closure.sh` | PASS ×4（M-011/M-012/M-013/M-014 各一次）：树 == pin b4525d79bf + 已登记 patches 字节一致、LICENSE 一致、`DANGLING=0`；M-013/M-014 为**叠层补丁**（生成基线=pin+前序补丁，因 M-006/M-009 已改写 dialog.tsx），经 scratch 树 `git apply --check` round-trip 验证 | 本文 |
| V-cRef / V-vault 回归 | `bun run scripts/verify-credential-ref.ts` + `bun run scripts/verify-credential-vault.ts` | PASS（M-013/M-014 后重跑）：M-006/M-009 对话框结构断言、M-007 监听先于 render/标记/零 origin 咨询断言全部保持 | 脚本输出 |
| V5 JSON 结构校验（issue #5 增量） | `python3 -m json.tool` | PASS：`patches/mobile/manifest.json`、`vendor-manifest.json`、`web-dist/manifest.json` 可解析；两 manifest 的 diff 为纯追加（无删除行） | 本文 |
| V7 泄漏扫描 | 见最终核查段 | PASS（rc=0） | 本文 |
| Android XML 校验（V6 回归） | python3 `xml.dom.minidom` | netsec/Manifest 零改动（`git diff f9cc526 HEAD -- android/app/src/main/res/xml/network_security_config.xml` 为空） | 本文 |

### 评审备注 F1–F5 落实（issue #5，计划 v1）

| 备注 | 落实 |
| --- | --- |
| F1 probe 凭据边界 | 决策 0002 probe 设计节 + [design/architecture.md](design/architecture.md) probe 桥条目 + [design/units/connection.md](design/units/connection.md) probe 节三处落字：带凭据 probe（401/403 分类语义成立，Basic 头由 Kotlin 侧从桥消息内存构造）；日志纪律覆盖请求头/URL/桥消息（零值，Kotlin 注释与审读双写）；不持久化（probe 侧零写盘）；信任模型复用 vault 桥三层信任 + 协议隔离（独立握手串互不误捕，单测锁定）；密码仅存活单次请求，响应只回分类码 |
| F2 pairing 残余 fetch 面 | decision 0002「残余 fetch 面」节 + [design/units/connection.md](design/units/connection.md) 直连章节登记：`pairing.ts:87` OpenCode.make（无认证头）与 `pairing.ts:129` checkServerHealth(…, globalThis.fetch)（带 Basic 头、不受 D1 校验）不经 platform.fetch；out-of-scope 理由=浏览器剥头为底线、fail-closed 为纵深、仅配对流且地址非服务器列表 |
| F3 脚本时序 | `verify-direct-connection.ts` 断言分两段：S6 提交点 `--pre-vendor` 跑通 android 负断言+netsec+分类码一致（实际执行 PASS）；S10 后全量 PASS（dist 断言自此常绿——标记丢失即 FAIL）；两阶段均真实执行并记录 |
| F4 来源表述 | decision 0002 与 architecture.md CORS 节均写明「上游 pin 提交树（采集缓存 `~/.cache/opencode-upstream` @ `cec70f3`/`b4525d79bf`）」，并注明 vendored 闭包不含 packages/server |
| F5 双 i18n 键集 | [design/units/connection.md](design/units/connection.md) 错误矩阵节写明消费方：M-013 只消费 app i18n `dialog.server.error.<code>`（en 基表合并 locale 表，缺键回退 en 再回退键名）；mobile-hosts `direct.error.<code>` 自含 EN/ZH 键用于第一方 UI 面（`directErrorCodeMessageKey` 映射 + 全集断言单测）；en.ts 内加注释锚点 |

### 诚实边界（issue #5 段）

- **设备级全部 BLOCKED**：G3 预检实测（静态证据已把风险修正为低风险）、G4 坏证书分类呈现、G5 明文阻断呈现、G11 错误矩阵端到端、G16 probe 桥 bring-up（握手/ack/重试耗尽/与 vault 并存/零日志负例）——均未执行。
- **Kotlin 未编译**：无 Android SDK，probe 两件与 MainActivity 改动仅静态（V-conn 负断言 + 人工审读 + 括号平衡机械检查），BLOCKED 如实。
- **M-013 装配为静态边界**：probe 优先级/退化逻辑在第一方端口层单测锁定（140 项中的 probe 套件），vendored dialog 的 Solid 装配为源码结构（V-cRef 回归 + 构建冒烟），未在 Solid 运行时执行对话框。
- **probe 分类与 Chromium 漂移**：probe 仅为分类器，权威判定=真实 fetch/上游健康检查（决策 0002 D4；端口级单测锁定「绝不伪造分类、失败即退化」，冲突裁决次序位于 M-013 装配的 `connectErrorKey`——静态核验，勘误 N4）；分类错误（如 SSL 异常消息匹配）在 Android 版本间可能漂移，漂移的后果=退化为泛化文案，不会误放行。
- **tree-shake 勘误**：M-011 首版 `void SECURE_FETCH_MARKER` 被最小化器删除（标记仅存 sourcemap）；已改为逃逸函数对象属性写入并实测压缩产物命中——该经验已写回 secure-fetch.ts 注释。

## issue #6 段（内建 SSH 认证、host-key 校验与隧道）——2026-10-24 实测记录

交付物：决策记录 [0003](decisions/0003-ssh-transport.md)（库选型/桥架构/host-key/认证/四层分类/线程契约 + 勘误一钉固 fast path、勘误二服务健康检查形态）、第一方 ssh 模块（`packages/mobile-hosts/src/ssh/`：fingerprint/known-hosts/bridge/host-key-verifier/transport 五件 + `src/transport/ssh-errors.ts` 十四码 + i18n `ssh.error.<code>` EN/ZH + servicePort 白名单（registry/storage F1）+ vault 私钥信封 v1（parsePrivateKeyEnvelope）+ 驱动装配（runtime 分类映射/钉固 fast path/post-open 健康检查/ensureTunnel/connectInline/forgetHostKey/fingerprintOf）+ T1 来源态修订（state-machine）+ upstream 镜像 reconnect/connect 钩子 + HostKeyPrompt 挂载与变更恢复 UI（host-manager/host-dialog））、Android ssh 四件（`android/app/src/main/java/ai/opencode/mobile/ssh/`：SshErrorCode/SshHostKeyStore/SshTunnelManager/SshTunnelBridge.kt + MainActivity 三桥接线 + `ssh/` 备份排除）、gradle 依赖 jsch 2.28.8 + bcprov-jdk18on 1.80（许可注释见下 F3 表）、vendor 补丁 M-015（登记于 `patches/mobile/manifest.json` 与 `vendor-manifest.json#mobilePatches`，mobile 补丁总数 14→15）、静态探针 `scripts/verify-ssh.ts`（V-ssh，F3 分段策略 --pre-native/--pre-vendor）。提交链 `a46b634 → 365a3fa → 7b48562 → 996de0d → ab3ad91 → de27569 → e18212e`（分支 `issue-6-ssh-tunnel`，基于 dev @ 8d55bd2，未 push）。

| 验证项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| V-lock（issue #6） | npm 侧零新依赖 | bun.lock 与 issue #5 终态逐字相同：`sha256sum bun.lock` = `b21f5cf1658a2df4f73e07f5388b0fc3141903bca8436c80947659db5abf782d`；SSH 库只进 gradle（jsch/bcprov，Android 侧），npm 闭包零变化 | 本文；`git diff 8d55bd2 HEAD -- bun.lock` 为空 |
| V-mh 第一方包单测 | `bun test --conditions=browser packages/mobile-hosts` | PASS：**212 tests / 212 pass / 0 fail，1508 expect()**（21 文件；issue #3/#4/#5 的 156 项 + issue #6 的 56 项：指纹 ssh-keygen 向量（ed25519+RSA）/格式守卫/known_hosts OpenSSH 行语义与 hashed 负例/ssh-errors 十四码全集与 i18n EN+ZH/桥隔离（三握手串互不误捕/ack 前零能力/超时显式 unavailable）/verifier 决策流（trust/prompt/changed/可达性错误不误报 host-key）/transport（loopback-only endpoint/servicePort 默认 4096/cancel-disconnect 相位/abort 即本地拆除）/registry servicePort 白名单与往返/vault 私钥信封双形态/runtime-ssh 全流（prompt→确认→单次 scan→pinned open→ready；变更=硬拒绝零连接+forgetHostKey 恢复；authRequired 分类与 T1 重驱；target-refused/refused/dns/timeout/unreachable/forward-failed 分类；service-unreachable；incompatible；connectionLost→T9→reconnect 换端口同身份；重连预算封顶；delete/disconnect 仅本地拆除红线；fetchHostKey 零凭据材料） | 本文；脚本输出 |
| V-ssh SSH 静态验证（S5 提交点） | `bun run scripts/verify-ssh.ts --pre-native --pre-vendor` | PASS（rc=0）：①14 分类码 ↔ i18n EN/ZH 全集；②指纹向量 ssh-keygen 逐字复现；③known_hosts 行语义 round-trip + hashed/marker 负例；④三桥握手串两两互异；⑤android 负断言 13 个 .kt/.xml 零命中（无 StrictHostKeyChecking no/ask、无 ProxyJump/ProxyCommand/setProxy*、无 WSL 执行面、无 hashed-hostname 字面量、ssh 包无 serving 面） | 脚本输出 |
| V-ssh SSH 静态验证（S6 后 native 段） | `bun run scripts/verify-ssh.ts --pre-vendor` | PASS（rc=0）：前述五段 + native 断言：F2 scanHostKey 函数体零认证材料（无 setPassword/addIdentity）、F3 gradle 许可注释（BSD/Bouncy Castle）、SshErrorCode 枚举逐串镜像、F8① 红线双写（teardown 本地/远端进程存活）、`ssh/` 备份排除两 XML 在册（4 个 Kotlin ssh 文件，17 个 android 文件扫描） | 脚本输出 |
| V-ssh SSH 静态验证（S7 后全量） | `bun run scripts/verify-ssh.ts` | PASS（rc=0）：前述全部 + vendor 段：M-015 entry 接线断言（createWebMessageSshTransport/createSshHostKeyVerifier/createSshHostTransport/握手串/createMobileHosts）+ dist 标记 `opencode-mobile-ssh-handshake`、`mobile(ssh-v1)` 命中构建资产 | 脚本输出 |
| V-conn 回归（S6/S7 后） | `bun run scripts/verify-direct-connection.ts` | PASS（rc=0，全模式）：android 负断言扩到 17 文件零命中（S6 期间曾因 Kotlin 注释含英文 "proceed" 一词误中 `SslErrorHandler.proceed` 宽匹配——已改词并记录为偏差行）；dist 标记三件完好 | 脚本输出 |
| V2 冒烟（M-015 后） | `bun run build:web` + `bash scripts/copy-web-dist.sh` | PASS（rc=0）；3480 文件 / 153,080,016 bytes 拷入 assets；`web-dist/manifest.json` sha256 `fc31da701fd6f1d6a0cbdaf26ea6dd434d5a0ace072ba1cd36446bb49b3804f8`（M-015 使 bundle 哈希刷新） | 本文 |
| V3 闭包核对（M-015） | `bash scripts/verify-closure.sh` | PASS：树 == pin b4525d79bf + 已登记 15 patches 字节一致、`DANGLING=0`；M-015 为叠层补丁（生成基线=pin+M-001…M-014，entry.tsx 已被 M-007/M-014 改写），经 scratch 树 `git apply --check` round-trip 验证 | 本文 |
| V5/V6 机械校验（issue #6 增量） | python3 json.tool / xml.dom.minidom | PASS：三个 manifest + `web-dist/manifest.json` 可解析且 diff 为纯追加；`data_extraction_rules.xml`、`full_backup_content.xml`（新增 `ssh/` 排除行）、Manifest、netsec 可解析 | 本文 |
| V7 泄漏扫描 | `bash scripts/leak-scan.sh` | PASS（rc=0；S4/S6/S7 后重跑） | 脚本输出 |
| V-cRef / V-vault 回归 | 随 V-mh 全量 | PASS（212 项含 vault/credential-ref 全套回归；M-015 未触碰 M-007/M-009/M-010 断言面） | 本文 |
| Kotlin 静态（无 SDK） | 括号平衡机械检查 + V-ssh/V-conn 负断言 + 人工审读 | 四个 ssh Kotlin 文件 + MainActivity 增量括号平衡 PASS；编译 **BLOCKED**（无 Android SDK） | 本文 |

### Android 第三方依赖表（F3，2026-10-24 对 Maven Central 实测；issue #6 新增）

| 依赖 | 版本 | jar 实测字节数 | 许可 | 审计判定 |
| --- | --- | --- | --- | --- |
| `com.github.mwiede:jsch` | 2.28.8 | 716,757（≈717 KB） | Revised BSD ×2（主许可 + JZlib；jBCrypt ISC 随源码捆绑） | 宽松，登记不 STOP |
| `org.bouncycastle:bcprov-jdk18on` | 1.80 | 8,682,747（≈8.7 MB；R8 可裁） | Bouncy Castle Licence（MIT 改编） | 宽松，登记不 STOP |

许可均宽松，不触发 V4 审计停点；登记于 `android/app/build.gradle.kts` 依赖行注释与上表。NOTICE-THIRD-PARTY.md 生成仍受 V4 既有 12 项用户决策阻塞，不受本轮影响。实施中如发现任一实际携带许可与登记不符或含传染性条款 → 立即停止并交用户决策（候选替换 sshj，Apache-2.0）。

### 诚实边界（issue #6 段）

- **设备级全部 BLOCKED**：G17 三桥并存 bring-up（三握手各自捕获/互不误捕/互不重置 ack、cancel 即时性、C1–C5/G14–G16 不受扰动复测）、SSH E2E（auth 成败端到端、未知/已知/变更三态真机流、目标拒绝、服务不可达与 incompatible 真服务、重连换端口同身份、**隧道/App 关闭后远程任务存活**）、真机 Kotlin 协商算法矩阵核对——均未执行。
- **Kotlin 未编译**：无 Android SDK，ssh 四件与 MainActivity/gradle 改动仅静态（V-ssh 负断言 + 括号平衡 + 人工审读），BLOCKED 如实。JSch API 面经**两轮核验**（均对 Maven Central `com.github.mwiede:jsch` 2.28.8 jar，716,757 字节与 F3 登记一致，无需 SDK）：①**B1 轮 javap/字节码**——修正 4 类编译必败签名（`check` 两参、常量 `NOT_INCLUDED`、无 `getStatus()`、抽象成员 `getKnownHostsRepositoryID()`），逐证实 `Session`/`JSch`/`ChannelDirectTCPIP`/`UserInfo`/`HostKey` 其余调用面正确；②**B1' 轮 Kotlin 名称解析**——javap 接口吻合 ≠ Kotlin 名称可解析：Java 接口静态常量不进入实现类词法作用域，非限定 `OK`/`CHANGED`/`NOT_INCLUDED` 报 unresolved reference，经 kotlin-compiler-embeddable 2.2.20/2.3.21 对真实 jar 编译探针实证后改为 `HostKeyRepository.` 限定（限定后编译探针通过）。两轮结论：**编译探针（限定名）+ javap（签名）组合才是无 SDK 环境的充分静态门**；`UnknownHostKeyException` 消息分类仍属运行期行为（真机归 G17）。
- **失败分类为最佳努力映射**：JSch 异常面 → wire 分类码的映射（`classifySessionException`）按消息关键词分类，真机漂移后果=落入 `io` 泛化文案，不会误放行（分类只选文案，不改变 fail-closed 行为）。
- **钉固 fast path 的安全边界**：钉固指纹只能经 T2→T3 用户确认进入机器上下文（T4/T8/T13 均清除，单测锁定）；钉固 open 的权威比对在 Kotlin store（KEX 失配 fail-closed）；scan 会话零认证材料由 V-ssh 负断言锁定。运行期断言归 G17。

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
| SSH E2E（auth 成败端到端、未知/已知/变更三态、目标拒绝、服务不可达与 incompatible 真服务、重连换端口同身份、隧道/App 关闭后远程任务存活） | 真机/模拟器 + 授权 SSH 主机 + 授权服务；代码已实现（未验证），静态证据见 V-ssh 与决策 0003 | issue #6 / #21 |
| 许可审计（V4）与 NOTICE-THIRD-PARTY.md 生成 | 12 项许可类别用户决策 | 用户决策，见下表 |
| G13 多 host 一窗 + 隔离（issue #3） | 真机/模拟器（+授权远程服务） | issue #3 验收第 5/3 条 |
| G14 连接状态呈现与恢复（issue #3） | 真机/模拟器 + 授权远程服务；host-key 真实流另归 #6 | issue #3 验收第 2 条 |
| G15 SSH 身份稳定 + 注册表恢复（issue #3） | 真机/模拟器 + SSH 远程主机（依赖 #6 隧道） | issue #3 验收第 3 条 |
| host-key 真实校验流（未知/已知/变更三态 + 变更恢复） | 代码已实现（未验证）：HostKeyPrompt 挂载 + SshBridgeHostKeyVerifier + known_hosts；真机归 G14/G17 | issue #6 |
| SSH 凭据引用真实解析 | ~~NullResolver 恒 undefined~~ 已随 issue #4 实现（未验证）：vault-backed resolver + Android 桥；**设备级归 C1/C2** | issue #4 |
| SSH 端口变化后身份稳定真机验证 | 代码已实现（未验证）：ensureTunnel/reconnect 单测锁定换端口同身份；真机归 G17（配合 G15） | issue #6（配合 G15） |
| live 直连 E2E（含 incompatible 真服务差异核对） | 授权服务 + 模型；直连不展示 incompatible（上游 web 原生行为，补齐归 #5） | issue #2/#5 |
| G16 probe 桥 bring-up（issue #5） | 真机/模拟器（API 23+）：probe 握手/ack/重试耗尽显式 unavailable/与 vault 桥并存互不误捕/probe 零日志值负例 | issue #5 |
| G3 预检实测（修正后） / G4 坏证书分类呈现 / G5 明文阻断呈现 / G11 错误矩阵端到端（issue #5 细化） | 真机/模拟器 + 授权远程服务（G4 另需证书可控服务）；静态证据与单测已就位，见 V-conn 与决策 0002 | issue #5 |
| C1 桥握手 bring-up（含错误 origin 探针顺序：新加载页面先错误 origin→断言无捕获→再正确 origin） | 真机/模拟器（API 23+）；ack/重试耗尽呈现/导航重置 | issue #4（计划 v3 D1/C5） |
| C2 凭据读写端到端（勾选记住/hydration 免重输/私钥导入/ValueCallback 恰一次/chooser 取消复用/corrupt 恢复） | 真机/模拟器 + 授权远程服务 | issue #4 |
| C3 64KiB 边界（恰 65536 字节传输成功/超限 JS 预检拒绝+native 复检纵深） | 真机/模拟器 | issue #4 |
| C4 备份排除负例（adb backup/d2d 迁移不带走 filesDir/vault/；重装后 vault 空） | 真机/模拟器（adb） | issue #4 |
| C5 桥安全探针（C5a targetOrigin 强制/C5b port confinement 单测已 PASS/C5c 形状校验单测已 PASS/C5d ack 前 unavailable 单测已 PASS+真机复核） | 真机/模拟器（C5a/C5d 真机面） | issue #4 |
| 平台 WebMessage 细节 bring-up 实测（ack 到达时序、超时兜底真机复核） | 真机/模拟器 | issue #4（随 C1） |
| Kotlin vault 三件 + MainActivity 编译 | Android SDK（compileSdk 36，minSdk 29） | 后续环境准备；命令已记录于本文 |
| Kotlin probe 两件（DirectEndpointProbe/ProbeBridge）+ MainActivity 增量编译 | Android SDK（compileSdk 36，minSdk 29）；括号平衡与红线负断言（V-conn）为仅有的静态检查 | issue #5；命令已记录于本文 |
| G17 三桥并存 bring-up（issue #6 新设门禁） | 真机/模拟器（API 23+）：vault/probe/ssh 三握手各自捕获互不误捕/互不重置 ack；ssh 桥 cancel/disconnect 即时响应（不依赖 executor 队列排空）；C1–C5 与 G14–G16 不受扰动复测 | issue #6 |
| Kotlin ssh 四件（SshErrorCode/SshHostKeyStore/SshTunnelManager/SshTunnelBridge）+ MainActivity/gradle 增量编译 | Android SDK（compileSdk 36，minSdk 29）；括号平衡、红线负断言（V-ssh）与 JSch API javap 核验（对 Maven Central jar，评审 B1 轮）为仅有的静态检查 | issue #6；命令已记录于本文 |

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
| HostKeyRepository 签名/常量两轮编译问题（issue #6 评审 B1 + B1'） | ①首版按 JCraft 0.1.55 旧签名实现（三参 `check(host, key, session)`、常量 `NOTINCLUDED`、`getStatus()`、缺 `getKnownHostsRepositoryID()`）——B1 轮 javap 证实 fork 2.x 已现代化；②按签名重写后仍以**非限定名**引用接口常量 `OK`/`CHANGED`/`NOT_INCLUDED`——B1' 轮以 kotlin-compiler-embeddable 2.2.20/2.3.21 编译探针实证 Kotlin 不把 Java 接口常量纳入实现类作用域（非限定名 3 处 unresolved，exit 1） | ①按实测签名重写（端口经工厂闭包捕获，两参 check 无信息损失）；②常量限定为 `HostKeyRepository.XXX`（限定后编译探针 exit 0）。核验方法收敛为**javap（签名）+ Kotlin 编译探针（名称可解析性）两步**，登记为无 SDK 环境 JSch API 面的标准静态门，见 issue #6 段诚实边界 |
| V-conn 宽匹配负断言误中（issue #6 S6） | `verify-direct-connection.ts` 的 `/\bproceed\b/i`（本意捕 SslErrorHandler.proceed）误中 SshTunnelManager.kt 注释中的英文单词 "proceed to (2)"（与 SSL 无关） | 改注释措辞为 "continue to (2)"（保留宽断言不减负断言强度）；随 V-conn 全模式 PASS 复核 |
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
| 真值表决策核心位置（issue #4） | 计划的文件清单将真值表逻辑全部放于 M-009 对话框补丁；实施将**决策核心**抽为第一方 `packages/mobile-hosts/src/vault/remember.ts`（`evaluateRemember`/`initialRemember`，纯函数），M-009 补丁只做装配翻译——使 12+1 行真值表可被 bun 单测与 in-process 探针逐行验证，而非仅静态正则 | 记录为有意偏差；语义与计划 D3 v3 逐行一致（V-mh+V-vault） |
| evaluateRemember 增加 mode 字段（issue #4） | 行 8（edit 保持勾选+空+有 ref → 保留）与行 12（add 有 prior+已勾+空 → 按行 2 中止）输入完全同形，必须以 add/edit 模式区分；评审补行 12 时选定「中止」解 | 记录于 [design/units/connection.md](design/units/connection.md) 真值表；单测两行齐备 |
| 桥请求超时映射（issue #4） | 挂死的桥请求超时（默认 15s）映射为 `VaultError("unavailable")` 并终结通道——不可用是显式状态；计划未指定超时码 | 记录为实施裁定；真机复核归 C1 |
| PEM fixture 字面量拆分（issue #4） | 合成 PEM 测试值首版逐字书写触发 V7 高置信模式；拆分为拼接构造（非密钥，正文非 base64） | 提交 1109c40；V7 rc=0 |
| S6 提交次序返工（issue #4） | M-009 首次提交曾漏带 vendored 源文件（会造成该提交点 V3 失败）；已重置重排为 435a04f（S6 含源+补丁+登记）与 6215483（S7），最终树 V3 PASS | 过程记录，不影响最终产物 |

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
| vault 契约/信封 v1/失效矩阵/真值表 v3（[units/connection.md](design/units/connection.md)） | `packages/mobile-hosts/src/vault/*`、`android/.../vault/*` | V-mh（信封/握手/客户端/真值表套件）+ V-vault 探针 + V-secret 审计 | 一致；12+1 行真值表（含评审补行 12 与评审修复行 13）逐行验证；设备级 BLOCKED（C1–C5） |
| 可选记住 notice/健康预览附注/stale-ref 附注（[design/interaction.md](design/interaction.md)） | M-009 patch（dialog.tsx + i18n en/zh）、mobile-hosts i18n | V-cRef（早退/装配结构）+ V-vault（行语义）+ V-css | 一致；healthPreview 不读 vault（决策在保存时，代码核对）；stale-ref 自愈路径记录于 interaction.md |
| 凭据绑定块/凭据管理器（[units/server-list.md](design/units/server-list.md)） | `packages/mobile-hosts/src/ui/{host-dialog,credential-manager,host-manager}.tsx` | V-mh（remove 联动/T14）+ V-css 令牌核验 | 一致；自由文本 ref 输入已移除 |
| 三层信任 + event.origin 平台证据（[design/architecture.md](design/architecture.md)） | `packages/mobile-hosts/src/vault/transport.ts`（形状校验/port 闭包/ack） | V-vault（无 origin 咨询负检查 + 形状校验动态探针）+ V-mh（port 不入全局） | 一致；PostMessageTest 证据链已写入文档 |
| M-010 hydration 仅内存（[design/architecture.md](design/architecture.md) 补丁表） | M-010 patch（registry.tsx） | V-vault（setStore-only、无直接存储写入、M-002 标记在） | 一致；运行时执行归 C1 |
| 直连裁定 D1–D5（[decisions/0002](decisions/0002-direct-connection-transport.md)） | `packages/mobile-hosts/src/transport/*`、`src/probe.ts`、M-011…M-014 patches、`scripts/verify-direct-connection.ts` | V-mh（url-policy/secure-fetch/probe 套件）+ V-conn（负断言/netsec/分类码/标记）+ V3 | 一致；G3–G5/G11/G16 设备级 BLOCKED |
| 错误分类×反馈×恢复矩阵（[units/connection.md](design/units/connection.md)） | M-013 patch（dialog.tsx + en/zh i18n）、`packages/mobile-hosts/src/probe.ts`（directErrorCodeMessageKey） | V-mh 全集断言 + dist language/zh chunk 键命中 | 一致；矩阵每行文案键 EN/ZH 成对；设备端到端归 G11 |

### 机械检查记录（2026-10-24）

- 文档相对链接：对 `README.md`、`docs/design/**`、`docs/project-scope.md` 中的仓库内相对链接逐一 `test -f`，全部存在（issue #3 交付后 2026-10-24 重跑，含 `docs/build-and-verify.md` 与 `docs/design/units/*` 的新增链接；issue #4 交付后再次重跑通过）。
- 设计单元清单、索引表与 `design/units/` 实际文件一一对应；未决 TODO（会话列表/时间线/终端/设置/权限确认/文件与 Diff、深链、状态恢复、预测性返回）在索引与单元文档中可见；issue #3 的 host-manager/host-dialog 并入 server-list 单元、host-key-prompt 并入 connection 单元，清单未单列新行（机械核对一致）；issue #4 的 credential-manager 并入 server-list 单元、vault 契约并入 connection 单元，清单未单列新行（机械核对一致）。
