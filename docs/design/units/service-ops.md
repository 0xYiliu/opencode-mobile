# 单元：服务操作（发现 + 显式授权的安装/启动/版本处理）

本单元承载 issue #7：在已批准的 SSH 能力上发现远端 OpenCode 服务与版本、并以显式授权动作执行 install/start/upgrade/replace/stop。事实状态：**已实现（未验证）**；设备/真 OS 门禁 G18 与三 OS E2E 全部 BLOCKED（见 [interaction.md](../interaction.md) 与[决策 0004](../../decisions/0004-service-operations.md)）。

**issue #102 增补（settings-servers-migration）**：命令面**保留不动**——本轮未新增远端命令/OS 管理能力，service-ops 面板、service-auth-prompt、行内挂载在服务器页迁移后原位可用（设备复核 2026-11-01：三主机行的 Service operations 入口在迁移后的 servers 页正常呈列）；发现/版本/兼容谓词与 #29 兼容反馈共有面零改动。

## 1. 两层发现模型

| 层 | 载体 | 能回答 | 不能回答（诚实限制） |
| --- | --- | --- | --- |
| API 探测（第一层） | 既有连接流（隧道 → 有界 `GET /api/info`），SSH 与直连通用，零新代码路径 | 在跑/版本（权威） | 直连主机**无法发现安装面**（二进制路径/来源/进程）——协议限制，面板以 `svcops.limitation.direct` 直陈 |
| exec 探测（第二层，仅 SSH 主机） | 第四桥白名单探测模板（OS 判定/二进制/版本/进程/端口） | 安装面：路径/来源/进程/端口 | **N5（pgrep 漏报）**：`pgrep -x opencode` 仅匹配 comm==`opencode`；npm/bun 形态服务进程是 node/bun 宿主，进程探测会**漏报**。处置=running 判定不单独依赖进程探测（端口 + API 证据为权威，合并规则见下），面板 limitation 文案直陈 |

**合并规则**：API 证据**权威**于版本与 running 判定（真实 fetch 原则，与 probe「分类器不是权威」同构）；exec 证据补充安装面；冲突时 API 胜出并记录（`version-conflict-api-wins`）。兼容谓词复用 `health-wrapper.isCompatibleServerVersion`（major==2 && minor>=1，与连接流同一规则——与 #29 的兼容反馈共有面，ownership 备注：文案键 `state.incompatible` 归 connection 单元，本单元不另起口径）。

**探测模板 × OS 支持矩阵（B2 三分）**：

| 探测目标 | Linux | macOS | Windows（cmd.exe 假设） |
| --- | --- | --- | --- |
| OS 判定 | `uname -s`（引导对，`any` 域） | `uname -s`（引导对） | `ver`（引导对） |
| 二进制 | `command -v opencode` | `command -v opencode` | `where opencode` |
| 版本 | `opencode --version` | 同左 | 同左 |
| 进程 | `pgrep -x opencode`（N5 漏报） | 同左（N5） | `tasklist /FI "IMAGENAME eq opencode.exe" /FO CSV /NH` |
| 端口 | `ss -tln` | `lsof -nP -iTCP:<port> -sTCP:LISTEN` | `netstat -ano \| findstr :<port>` |

Windows DefaultShell 假设 cmd.exe（注册表默认，客户端**无法探测**是否被改为 PowerShell）：解析失败归 os-unknown/unsupported-os 如实呈现，绝不猜测（`svcops.limitation.windowsShell`）。

## 2. 状态模型与快照

`ServiceStatus`：unknown / not-installed / installed-stopped / running（evidence: api|exec|both）/ running-incompatible / unsupported-os。附带 `checkedAt` 新鲜度界（N3 守卫输入）、`survivedDisconnect` 证据位（§4）、limitations 清单（N5 必列）、execDetail（路径/来源/进程/端口补充证据）。**状态仅内存**（不进注册表白名单载荷——陈旧状态持久化会撒谎）；每次进入面板/重连后主动刷新。

## 3. 授权动作流（O1–O14）

- 无确认不执行：进入 `executing` 的唯一转移是 O7 confirming→executing（穷举单测锁定）；每个动作先经预览（等宽命令全文=将执行逐字节一致，golden vectors）→ 危险确认勾选 → 确认。
- cancel：discovering→idle、previewing/confirming→discovered（无副作用）；executing→`cancelRequested`（诚实：远端可能已继续，强制重发现定夺，`cancel-uncertain`）。
- 回滚仅自 `rollbackAvailable`（partial/failed 携带），回滚本身重走授权阶梯；replace 四步计划（stop→backup→install→start）一次预览全文 + 红色警示 + 备份/恢复路径。
- **N3 新鲜度复核**：confirming 带 60s 有界守卫，过期强制重发现；确认与执行之间的残余 TOCTOU 有界声明见[决策 0004 §4/§7](../../decisions/0004-service-operations.md)。
- exec 侧预检：install/replace 安装步前重探端口，运行中服务即拒（`occupied-port`），**绝不静默替换**。

## 4. 断开存活验证（验收④；B1 触发集）

- **触发集（精确）**：任意**迁入 `ready` 且前一状态 ∈ {offline, reconnecting, authRequired}** 的转移。T 表实际路径：offline→**T10**→reconnecting→**T11**→ready；authRequired→**T12**→ready。谓词含 `offline` 是**防御性死支**（T 表不存在 offline→ready 直接边——残余 2，测试按谓词级用例表述，不写成不存在的直接转移边）。
- **T5（connecting→ready 首连就绪）不触发**：此前无 established episode，无存活可言；首连的发现由面板自身的入口检查承担。
- **T9（ready→offline）不触发**：离开 ready 只使流态失效（O14 connectionLost）并记录断开前 running 证据；刷新发生在回程。
- **挂点（B1）**：面板层 solid store watcher（`service-panel.tsx` createEffect 订阅 `runtime.stateOf`）——**`state-machine.ts` 与 `runtime.ts` 零改动**（纯订阅侧实现）。
- **authRequired→ready 的措辞纪律**：该路径是**重认证后复核**（中断原因是凭据而非隧道），面板按「已重新认证；服务已重新检查」呈现（`svcops.survived.reauth`），**不冒充断线存活**。
- 刷新结果写 `survivedDisconnect`：对比断开前快照与复核证据，反馈「断开期间服务保持运行：是/否/未知」。兼容策略复用 health-wrapper（与 #29 共有面；ownership 备注：兼容文案键归 connection 单元）。

## 5. 动作 × OS 支持矩阵（B2 setsid 差异行）

| 动作 | Linux | macOS | Windows | 授权要点 |
| --- | --- | --- | --- | --- |
| install（包管理器） | `npm install -g @opencode/cli@<v\|latest>` / `brew install opencode`（按发现来源） | 同左（brew 优先） | `npm install -g …` / winget（动词与参数逐字上游，N6） | 预览=全文+版本（可 pin）；装后强制版本复核，不符→`partial-install`+回滚 |
| install（curl 管道，**N2：仅 linux/darwin**） | `curl -fsSL https://opencode.ai/v2/install \| bash -s -- --version <v>` | 同左 | **不存在**（闭域拒绝；WSL launcher 自警出处见 0004 §3.1） | 预览明示远程代码执行本质 |
| start | `setsid nohup opencode serve --hostname 127.0.0.1 --port <p> </dev/null >/dev/null 2>&1 &`（**setsid 属 util-linux，Linux 专属**） | `nohup opencode serve … </dev/null >/dev/null 2>&1 &`（**macOS 基础系统无 setsid；nohup 忽略 SIGHUP 足以越过 SSH 会话关闭**——支持矩阵差异行） | `start /b opencode serve --hostname 127.0.0.1 --port <p>` | **N1（评审残余 1）**：两 POSIX 变体含 `</dev/null`（golden vectors 固化）；Windows 无 `/dev/null`（cmd 语义），stdio 故事=start /b 立即返回（备选 `< NUL` 未采用），存活不保证归 `detach-uncertain`，真机归 G18 |
| upgrade | `opencode upgrade --method <m> --target <v>`（三 OS 同形） | 同左 | 同左 | Windows 运行中 exe 不可覆盖→完整 stop+升级计划一次预览 |
| replace | stop→`cp` 备份→install(pin)→start | 同左 | `copy /Y` 备份；winget/npm 路径 | 最强确认级；exec 时预检守卫拒绝覆盖运行中服务；失败→`rollbackAvailable` |
| stop | `pkill -x opencode` | 同左 | `taskkill /IM opencode.exe /F` | 独立授权动作；仅用户显式要求；**断开永不触发（无 disconnect→stop 边）** |
| uninstall | **不实现执行**——结果面板提供可复制命令文本（N8） | 同左 | 同左 | 本期诚实裁界：给命令不给执行 |

## 6. 门禁与验证归属（G18）

G18（interaction.md 完整枚举）：四桥并存 bring-up（四握手各自捕获互不误捕/互不重置 ack、cancel 即时性、C1–C5/G14–G17 不受扰动复测）+ svcops 面板真机交互（发现/预览/确认/执行/回滚/取消-uncertain 呈现、`survivedDisconnect` 真机触发核对、零日志负例）。三 OS 真实 exec/安装/回滚与 bash=WSL 诱饵负例归真 OS E2E（BLOCKED 清单见 [../../build-and-verify.md](../../build-and-verify.md) issue #7 段）。

## 7. 与其他单元的边界

- 入口：connection 单元的 `service-unreachable` 失败态与 host-manager 行内「服务操作」展开（[units/connection.md](connection.md) 交叉链接）。
- 信任：host-key 唯一所有权归连接流（[决策 0003 §3.3](../../decisions/0003-ssh-transport.md)）；第四桥不自建信任。
- 凭据：逐命令 vault 解析、单次过桥（[决策 0004 §6](../../decisions/0004-service-operations.md)）；桥协议的 `username` 字段是 target `user@` 段的**路由事实而非凭据**（评审 B2：修复密码被当作用户名的认证错位；纳入形状校验与零日志纪律）。
