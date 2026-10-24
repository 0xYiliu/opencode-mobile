# 决策记录 0004：远程服务发现与显式授权的安装/启动/版本处理

本文记录 issue #7（远程服务发现与显式授权的安装/启动/版本处理）的命令面架构、授权流设计、回滚边界与安全裁定。裁定以文档承载；除文末状态表外，本文不声称任何服务操作已在真实远端 OS 上可用。

- 状态：已确认的技术裁定（**全部代码为静态实现（未验证）**；真机/真 OS 验证 BLOCKED——最终边界断言依赖 G18 四桥 bring-up + 三 OS 端到端，见文末「验收⑤条件句映射」）
- 记录日期：2026-10-24
- 来源议题：[issue #7](https://github.com/0xYiliu/opencode-mobile/issues/7)
- 关联：[0001](0001-wsl-exclusion.md)、[0002](0002-direct-connection-transport.md)、[0003](0003-ssh-transport.md)、[../design/units/service-ops.md](../design/units/service-ops.md)、[../design/units/connection.md](../design/units/connection.md)、[../design/architecture.md](../design/architecture.md)、[../design/interaction.md](../design/interaction.md)

## 1. 总纲：客户端构建不隐含服务操作能力

服务操作的命令面全部在**运行时经第四桥下发**：桥协议只传 `{templateId, params, os}`，从不传命令字符串；web 构建产物只含模板数据与 UI，不含任何执行面（静态探针 `scripts/verify-service-ops.ts` 负断言：第一方 service-ops 源码零 `child_process`/`spawn` 面；预览串唯一来源=模板表）。无桥注入时面板整体降级隐藏（stub fail-closed，同 probe 纪律）——**一个仅有客户端构建的安装包不隐含任何服务操作能力**（验收⑤的产品语义；本节为该句的裁决落点）。

## 2. 第四桥架构（决策 0003 §2 的第四座姊妹桥）

- **协议隔离第四桥**：握手串 `opencode-mobile-svcops-handshake`，镜像 vault/probe/ssh 三桥机制（三层信任、ack 前零能力、requestId 关联、JSON 字符串双向、四桥握手串两两严格不等互不误捕——单测与探针双重锁定）。G17 的三桥并存语义升级为 **G18 四桥并存**（interaction.md）。
- **短命独立 SSH 会话**：`ServiceOpsManager` 每条命令开一次性认证会话（`SshHostKeyStore` 权威 + `StrictHostKeyChecking="yes"` + pinnedFingerprint 强制），单命令、有界超时（连接 30s / 执行 60s）、有界输出（stdout/stderr 各 16 KiB 截断标记 + exitStatus）、用毕本地拆除。**不搭既有隧道会话便车**：发现/安装与隧道状态解耦（隧道断着也能修服务），且不扰动既有 watchdog/teardown 线程契约（0003 F6）。每主机至多一条在途 exec（host:port 键控，防御性——JS 驱动本身每主机串行）。
- **红线（双写于 Kotlin 注释与本文）**：所有拆除路径仅关闭本地 exec 通道与会话——**远端 OpenCode 服务/进程存活；客户端断开/取消永不停止远端任务**。执行中取消 → JS 侧流态进入 `cancelRequested`，诚实标注「远端可能已继续执行，以取消后强制重新发现的复核结果为准」，绝不谎称已中止（`cancel-uncertain`）。

## 3. 命令面安全架构（无自由命令注入面）

- **白名单双门禁**：TS 侧纯函数模板表（`service-ops/commands.ts`，预览=执行逐字节一致）与 Kotlin `ServiceCommandValidator`（templateId 全集 + 逐模板参数正则逐字镜像 + 模板 OS 适用域）互为镜像，`scripts/verify-service-ops.ts` 断言两侧结构一致；漂移=Kotlin fail-closed 拒绝（安全侧倾）。**全仓 `setCommand` 唯一调用点**位于 `ServiceOpsManager.exec` 内、且其入参只能来自校验器输出（探针断言唯一性 + 门禁引用）。
- **参数双闸**：先全量拒 shell 元字符/控制字符/cmd 转义（`; | & $ ( ) < > 反引号 引号 换行 `!` `^` `%`）与路径穿越（`..`）、越界端口；再按模板 allowlist 正则放行。无任何松散类型转换。
- **OS 适用域闭域（B2/N2）**：每条模板携带 OS 适用域字段；向 windows 装配 POSIX 模板、向 POSIX 装配 windows 模板在 TS 装配与 Kotlin 校验双侧拒绝。OS 判定引导对（`uname -s`/`ver`）是仅有的 `"any"` 域行——发现的第一个命令尚不知道远端 OS，两条都是固定白名单串，输出决定归类，解析失败归 os-unknown 如实呈现，绝不猜测。
- **零删除类模板（N8 选型）**：模板表无 `rm`/`del`/`rmdir`/`Remove-Item`；无 uninstall 动作行；**卸载故事=结果面板可复制、不执行的命令文本**（i18n `svcops.uninstall.*`）。理由：自动删除模板的破坏面收益小于风险；fresh-install 失败的清理交给用户在自身终端执行（见 §5）。

### 3.1 上游动词出处（N6 落字）

- `winget install --id Anomaly.OpenCode --exact --source winget --accept-source-agreements --disable-interactivity`：**逐字取自上游 `packages/app/src/…/updater.ts:59-68`**（pin 缓存实读）；动词 `install` 为 winget 标准动词（winget 官方动词集：install/uninstall/upgrade/show/search…），本客户端未自造任何 winget 参数。
- `curl -fsSL https://opencode.ai/v2/install | bash -s -- --version <v>`：上游仓库根 `install` 脚本的文档化调用面（装至 `$HOME/.opencode/bin`，支持 `--version`）。
- `npm install -g @opencode/cli@<v|latest>`、`brew install opencode`、`opencode serve --hostname 127.0.0.1 --port <p>`、`opencode upgrade --method <m> --target <v>`（methods = curl|npm|pnpm|bun|yarn|vp|brew|winget）：上游 CLI 文档面/updater 方法集。
- **N2（curl 模板 POSIX 闭域与 WSL launcher 出处）**：上游 updater.ts:198-208 自警——裸 `bash` 在 Windows 上可能是 WSL launcher；本客户端的 Kotlin `wsl.exe` 负断言**拦不住「远端 bash=WSL」这条路径**（那是远端的解释器，不是本机的 wsl.exe）。故 curl 管道模板整体不对 windows 提供（TS 装配与 Kotlin 校验双侧拒绝），真机负例（远端 bash=WSL 诱饵）归 BLOCKED 清单。决策 [0001](0001-wsl-exclusion.md) 的 WSL 排除在服务操作面以此方式延续。

## 4. 授权流与错误分类

- **授权流状态机 O1–O14**（`service-ops/flow.ts`，纯转移表，镜像 T1–T14 纪律）：红线单测逐行穷举锁定——①无确认不执行（进入 `executing` 的唯一行是 O7 confirming→executing）；②取消在执行前无副作用（discovering→idle、previewing/confirming→discovered）；③执行中取消仅达 `cancelRequested`，唯一出路是强制重发现（O12），结果不确定性由 `cancel-uncertain` 承载；④回滚仅自 `rollbackAvailable` 上下文（O13 守卫）且回滚本身重走 预览→确认→执行 阶梯；⑤**不存在任何 disconnect→stop 边**：`connectionLost` 只使流态失效进入重发现（O14），清除任何已预览的动作，零远端信号。
- **N3 新鲜度复核与有界 TOCTOU 声明**：`previewing→confirming` 带 60s 有界新鲜度守卫（O6）；过期则驱动强制重跑发现再重新呈现。**残余 TOCTOU 竞态如实声明**：确认与执行之间远端状态仍可能变化（他方同机操作），该残余竞态有界且不可根除——缓解为 exec 侧预检守卫（install/replace 模板链第一步做端口占用/运行中检测，检测到既有运行中服务即拒绝并报 `occupied-port`，绝不覆盖）。本文将此登记为**已接受的有界竞态**（安全评审节第 6 项）。
- **错误分类 21 码**（`ServiceOpsErrorCode`，Kotlin 枚举逐字镜像 + i18n `svcops.error.<code>` EN/ZH 全集）：含 **N4 的 `permission-denied` 专码**——分类器对有界 stderr 尾部匹配小而逐字的 permission 标记集（纯函数 + 文档化 fixture），命中即本码而非泛化 exec-failed；**匹配不上时诚实降级 exec-failed 并呈现有界 stderr 尾部原文——不伪造具体性**。`rollback-available` 是同一分类集承载的结果态标记，不是错误。

## 5. 回滚的诚实边界（N8 选型落字）

- **replace 流回滚**：备份用 `cp`/`copy /Y` 模板（对称、无删除），失败路径提供 `restore.<os>` 模板，回滚本身是一条预览→确认→执行的授权动作；备份失败（`backup-failed`）则 replace 计划在改动服务之前中止。
- **fresh-install partial 回滚（N8 选定语义：保留 + 报告 + 可复制清理命令，不自动删除）**：全新安装失败时**保留已落盘产物**，结果面板逐项报告已落路径与版本复核输出，并提供**可复制、不执行**的清理命令文本。理由：白名单引入自动 `rm`/`del` 模板是删除类破坏面，收益小于风险；V-svcops 负断言随之锁定「模板表零删除类模板」。
- **客户端不承诺的**：包管理器安装的历史版本重装依赖上游源可用性（`source-unavailable`/`version-unresolvable` 如实呈现）；npm/brew 的依赖副作用不回滚；exec 取消不保证远端中止（§4）；Windows `start /b` 子进程在 SSH 会话结束后的存活不如 POSIX 有保证——`detach-uncertain` 显式分类 + 启动后经隧道/API 复核 + 文案与 G18 如实标注。**Windows 模板 stdio 故事（评审残余 1）**：两 POSIX start 变体含全量重定向（`</dev/null >/dev/null 2>&1`，防 exec 通道在 stdin 上挂起，golden vectors 固化）；Windows 变体无 `/dev/null`（cmd 语义），其 stdio 故事为 `start /b` 立即返回（备选 `< NUL` 重定向未采用——start /b 已使启动命令立即返回，无 stdin 挂起面），存活不确定性由 `detach-uncertain` 承载而非伪装已解决。

## 6. 凭据边界（N7：显式继承 0003 §4）

每条 exec 命令的认证材料由面板经 vault resolver 按该主机 credentialRef **逐命令解析**，过桥 JSON 单向一次、memory-only、零日志、零持久化、零回显（响应只回分类码/有界输出/exitStatus；Kotlin 错误响应 message 恒空串）。**仅 store 已知主机（或经连接流完成指纹确认的 pinnedFingerprint 主机）可发起**：未知/变更指纹在 Kotlin 侧即拒绝（`host-key-unknown`，引导回连接流；变更密钥由连接流自身的 store 校验硬拒绝并提供恢复 UI——第四桥不自建信任、绝不覆盖密钥），**凭据在指纹确认前不发出**。host-key 信任的唯一所有权仍属连接流（0003 §3.3），0003 §4 的全部原语义在第四桥逐字继承。

## 7. 安全评审节

1. **exec 风险面**：安装/启动/升级/替换本质是在远端系统执行命令——这正是 issue #7 的产品要求；缓解=显式授权（预览=执行全文、危险确认勾选、绝不静默）+ 白名单双门禁 + 零自由命令注入面（探针锁定）。
2. **curl 管道安装是远程代码执行**：预览明示精确 URL 与「执行上游官方安装器」本质、版本可 pin、包管理器模板优先；POSIX 闭域（N2）。
3. **命令注入面**：模板白名单 + 参数双闸 + 唯一 setCommand 调用点 + Kotlin 镜像校验 fail-closed；无 uninstall/删除类执行面（N8）。
4. **凭据面**：N7 边界（§6）+ 零值日志（探针断言无 host/port/凭据插值）+ 备份排除不涉新目录（known_hosts 既有排除不变）。
5. **降级面**：无桥=无能力（面板隐藏）；ack 前=零能力；校验器拒绝=显式 `exec-denied`；分类器不具体即降级泛化码并保留证据原文。
6. **已接受的有界竞态**：确认与执行之间的 TOCTOU 残余（§4/N3）——缓解与声明如上，不可根除、影响有界（最坏=对已变化状态执行了一次已确认动作，绝不静默覆盖运行中服务：预检守卫拒绝）。
7. **进程边界**：客户端断开/销毁仅本地拆除（§2 红线）；`occupied-port`/`permission-detach` 等真实路径的真机验证归 G18/BLOCKED。

## 8. 验收⑤条件句映射

G18（四桥并存 bring-up：四握手各自捕获/互不误捕/互不重置 ack；cancel 即时性；C1–C5/G14–G17 不受扰动复测）+ 三 OS 真 OS E2E（真实 exec 发现、install/start/upgrade/replace 全链路、occupied-port/permission-denied 真实路径、真实文件系统回滚、Windows DefaultShell 非 cmd 变体、**N2 远端 bash=WSL 诱饵负例**、断开存活真实验证）通过前，本 issue 全部交付只声称「**静态边界已实现（未验证）**」；任一门禁失败即按 interaction.md 失败路径处置协议处理，此时该声称不成立。

## 9. 状态

| 条目 | 状态 |
| --- | --- |
| 命令面/授权流/发现模型/错误分类/第四桥/UI 代码承载 | `packages/mobile-hosts/src/service-ops/*` + `src/ui/service-panel.tsx` + `android/.../svcops/*` + M-016（**已实现（未验证）**；本机验证=V-mh 全套单测、V-svcops 探针全模式 PASS、V2/V3 冒烟、Kotlin 编译探针 PASS（compileDebugKotlin 经真实工具链）；APK 打包在 mergeDebugJavaResource 受 jsch+bcprov 既有 jar 元数据冲突阻塞（需 build.gradle.kts packaging 块，属零改动清单，待用户决策）；设备级全 BLOCKED） |
| 设备/真 OS 验证（G18、三 OS E2E、occupied-port/permission-denied 真实路径、真实回滚、bash=WSL 负例、断开存活） | **BLOCKED** |
| 敏感信息 | 本文不含凭据、令牌、私钥或真实连接配置 |
