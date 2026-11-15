# 状态恢复横切（Recovery）

本文是「状态恢复」横切关注点的**索引与收口层**（issue #19）：恢复数据类清单、六场景处置、失败类别×恢复矩阵、服务端存活核对步骤与诚实边界。**authority 边界声明**：本文不重定义任何单元契约——各恢复契约的权威表述仍在对应单元文档（见各表「权威」列），冲突时以单元文档为准并按双向变更协议回修本文。静态结构锚由 `scripts/verify-recovery.ts` 锁定（与 `verify-session-workbench.ts` 等既有探针分工：只锁既有探针未覆盖之锚）。运行期行为归 **G30** 横切恢复门禁（[interaction.md](interaction.md)），G30 未过前本文全部运行期表述只声称「已实现（未验证）」。

## 一、恢复数据类总表（documented persistence policy）

「什么数据持久化在哪、按什么键、重启后什么自动恢复、什么需要用户动作、恢复失败如何呈现」：

| 数据类 | 存储 venue | 键控 | 恢复时机 | 失败呈现 | 权威 |
| --- | --- | --- | --- | --- | --- |
| SSH 主机记录 | WebView localStorage（经 StoragePort seam；不可用回退内存） | `opencode-mobile.hosts.v1`（白名单载荷：id/name/target/credentialRef/时间戳 + servicePort） | 冷启动 loadHosts；**连接状态归 idle，无自动重连**（恢复连接需用户手动发起：issue #161 起 Settings SSH 行 Connect 即为该入口，旧 host-manager 面已退役） | 存储不可用 → 内存回退 + `storageVolatile` 显式呈现；损坏 JSON → 空注册表（记录可重建） | [units/server-list.md](units/server-list.md) |
| 直连服务记录 | 上游原生注册表持久化（encode 恒剥 password——connection-password-memory-only）；`credentialRef` 为非机密引用（connection-initial-credential-persistence 初始连接写半负责写入） | 上游原生键（URL 本身，端口变化即新身份） | 冷启动 hydration + connection-credential-hydration：有 `credentialRef` 无 password 的条目经 vault 解析**仅注入内存**；connection-vault-ready-wait 后注入循环前有界等待 vault ready（默认 15s——hydration 微任务早于原生 ready 往返，issue #128 根因），超时不注入、显式重输 | vault unavailable/corrupt/等待超时 → 不注入 → unauthorized 重输路径（自愈，ref 稳定） | [units/connection.md](units/connection.md) |
| 凭据（secrets） | vault 信封 v1（AndroidKeyStore AES-256-GCM + `filesDir/vault/`）——**唯一设备侧持久形态**；永不入 localStorage/日志/构建产物 | `mobile-credential:<id>`（credentialRef 仅引用不携带值） | 经 connection-credential-hydration hydration / host resolver 仅注入内存；**本表其余任何恢复通道零凭据参与** | unavailable 显式状态（无明文回退）；corrupt → 失效矩阵标红 + 重输/删除 | [units/connection.md](units/connection.md) 失效矩阵与 #4 |
| 项目与会话选择 | 上游注册表 store（`Persist` 覆盖） | `ServerScope` 双重键 + `pathKey` | 冷启动随 store hydrate | 损坏 → 上游 storage 容错；项目失效 → `home.project.missing` 反馈 | [units/projects-sessions.md](units/projects-sessions.md) |
| 会话 tabs | `Persist.window("tabs")` 四 store：`tabs.recent`/`tabs.info`/`tabs.panes`/`tabs.closed` | 上游 tab 身份 | 冷启动恢复 tabs 集合；**指向未就绪 SSH 宿主时落 `PendingSessionState`（骨架面板，非空白非报错）** | 宿主未连 → pending 呈现；手动重连后 connected-gated 再同步补齐 | [units/projects-sessions.md](units/projects-sessions.md) |
| 草稿（composer 输入） | IndexedDB（`Persist.draft` → `createBrowserDraftStore`） | `Persist.serverScoped(...scope.id, "prompt")` 按会话 | 冷启动 / 切回会话时恢复 | 存储不可用 → 空草稿（无静默丢失声称，上游容错） | [units/session-workbench.md](units/session-workbench.md) |
| 视图与滚动 | `Persist` web 存储 | `sessionView`（`SessionStateKey.is(key)` 白名单过滤）+ scroll state（per 会话/workspace） | 冷启动 / 切换回视图 | 白名单外键不恢复（有意收敛） | [units/session-workbench.md](units/session-workbench.md) |
| 终端快照 | 上游 tabs store + ghostty-web 序列化 | workspace 键 `${server}\0${directory}`；2000 行序列化 | 杀 App 重开 / tab 恢复时 clone 或 replay | 服务重启 → 探活三态 → clone 恢复；隧道重建期间终端独立 250ms→4s 退避重试（引用不重定义） | [units/terminal.md](units/terminal.md) |
| 文件 tab 与行选择 | `Persist` web 存储 | `SessionStateKey` 键控 + `file-view` scoped store（per workspace） | 冷启动 / 切换回文件 tab | 远端变更 → stale 五重链重读 | [units/files.md](units/files.md) |
| 用户偏好（issue #20 回修增行） | `Persist` web 存储 + localStorage（theme） | `settings.v3`（七段）/`Persist.global("language")`/`opencode-theme-id`/`opencode-color-scheme`/`opencode-theme-css-<mode>`/`Persist.global("model")` | 启动 hydrate（settings.v3）/首帧前（theme preload）/进入相应界面（model） | schema `catchDecoding` → 默认值回落（defaultSettings 兜底）；语言/主题回落 en/system | [interaction-quality.md](interaction-quality.md) §六 与各单元文档 |
| 通知去重 claim 表（issue #23 增行） | localStorage（`opencode:notification-${kind}`，kind∈{sound,system}，滑窗 500 条）+ Web Locks 跨渲染器互斥（WebView 无 locks 时优雅降级内存 claim）+ 内存 Set | 键=`kind:serverKey\0eventID`（调用侧构造，含 serverKey 故跨服务器不互斥） | **不恢复仅防重**——claim 表持久：同一事件重启后也不重推（G33⑦ 核对）；claim 缺失最坏重响一次 | 无失败呈现（claim 表损坏时静默重建，内存 claim 兜底） | [units/notifications.md](units/notifications.md) |

凭据边界：secrets 永不进入上表除「凭据」行以外的任何恢复通道——持久化编码路径恒剥 password（connection-password-memory-only）、vault 是唯一设备侧持久形态且仅经 #4 契约存取；本文对凭据只做索引，零新增口径。

## Issue #185 Home / new-session 恢复边界

- **持久化不变**：Home 项目/会话选择继续使用既有 `ServerScope`、`pathKey`、`usedProjectIDs`/`lastProjectID`、tabs/drafts/scroll 契约；#185 不新增项目创建、最近项目或 session persistence payload，也不重放历史 `project-identity-migration`/`home-new-session-parity` 作为新版本 source。
- **过程态不持久化**：location dialog 的 query/history/active row、directory cache、priority queue、combobox/tree loading attempt 与 new-session worktree/MCP/session attempt 属于当前流程内存态。关闭/取消/返回、timeout、server controller 消失或 dispose 后，迟到的 lookup/create 结果必须被 attempt/identity guard 丢弃，不能选中新的 server/project/worktree。
- **新建会话失败恢复**：existing directory 失败回到 draft；new worktree 在 worktree 已创建后再遇 MCP/session 失败时保留已创建目录作为 draft workspace；toast 说明失败阶段并允许重新 start。创建过程的 `11m/2m/30s` phase budgets 只约束当前 attempt，不产生后台重放。
- **Home refresh 恢复**：cached list 在 stale refresh 期间继续可见；unreachable/timeout/first-load error 保留错误态和 Try again，不降级为空态；切换 server/project 后旧 load/search/row 结果不得写回新 scope。Home fade 只反映当前 viewport 的裁切，不改变恢复选择或数据。
- **验证状态**：#185 focused machine tests 与 v2.2.7 source comparison 已通过；冷启动、切网、重启后最近项目/会话、真实远程 worktree picker、直连/SSH 双路由恢复仍归 G19/G30，当前为 BLOCKED/NOT RUN，不以静态 machine tests 代替设备证据。

## 二、六场景处置表

| 场景 | 触发 → 机制链 | 用户可见形态 | 门禁归属 |
| --- | --- | --- | --- |
| ① SSE drop/retry | 网络中断/服务重启/设备休眠 → `runStream` 重试循环：**固定间隔重试（非指数退避）**——唯一等待点 `await wait(reconnectDelay, …)`（1s）；存活 ≥1s 的连接将 attempt 归零（防长期失败累积）；`resync` 置 forced 旁路固定等待（上游注释「A deliberate resync already knows the old socket is gone; reconnect without backing off.」）；`options.reconnect` 钩子在每次重试前调用（仅 extension/sidecar 型装配，直连无钩子），失败仅记日志由循环按自身节奏重调 | connecting/reconnecting 状态行 + attempt 计数；重连后快照补齐（见场景⑥） | G20④ 权威；G30① 横切复核（固定 1s 节奏与 attempt 归零实测） |
| ② foreground/background | 锁屏/切 App（不发 pagehide）→ 回前台 `visibilitychange` 且静默 ≥20s（`foregroundIdleThreshold`）→ `resync("Page returned to the foreground after the event stream went quiet")`；pagehide → `stop()`、pageshow → `start()`；持久化时机：`visibilitychange` → hidden → `flushPersisted()`、`pagehide` → `flushPersisted()`、脏值 100ms debounce | 回前台后事件流重同步、快照刷新；切后台前脏草稿/tabs 已强制落盘（脏窗口 ≤100ms）；后台期间事件的通知投递为尽力而为（socket 存活才可能响，见 [units/notifications.md](units/notifications.md) ⑥） | G9/G12 权威；G30② 横切复核（resync 与 flush 时机实测）；G33②（后台通知全链，socket 静默死亡=快照补齐 PASS 形态） |
| ③ network switch | wifi↔蜂窝 → `online` 事件 → `resync("Network connection restored")`；**无 offline 监听**（上游仅 pagehide/pageshow/online/visibilitychange 四监听）——离线期 SSE fetch 自行报错按 1s 节奏重试；WebView 不发 online 时由 45s idle watchdog 兜底（挂起期过期的定时器回前台立即触发） | 状态行 connecting/reconnecting；动作失败 toast；重连后快照补齐 | G11/G19 权威；G30③ 横切复核（含 watchdog 兜底时长如实记录） |
| ④ process death/relaunch | 杀 App/系统回收 → 冷启动八环链：①壳层无实例状态恢复（`onSaveInstanceState` TODO，进程重建走完整启动流程）→ ②entry 引导（app-mobile-hosts-bootstrap）→ ③SSH 主机记录恢复为 idle（无自动重连）→ ④直连服务恢复 + connection-credential-hydration 凭据免重输（connection-vault-ready-wait：注入循环前有界等待 vault ready，15s 上限；等待不阻塞其余启动环——超时按未记住凭据处理，ref 保留）→ ⑤项目/会话/tabs 恢复 → ⑥草稿恢复（**#188 起 draft 媒体引用按 `sourceServerKey` 源解析**：未解析的 `media:` 引用以 `{mediaURI, sourceServerKey}` 持久化并在渲染/发送时 fail-closed——`blobDataUrl` 拒绝未解析引用、`buildPromptRequest` 拒绝未解析 `media:` file-part url；唯一 scoped per-draft 容器在 decode 时按路由 server 溯源旧引用，共享 session-prompt 容器不溯源、由 wire floor 保护，草稿保持可编辑）→ ⑦视图/滚动恢复 → ⑧恢复的会话 tab 指向未就绪宿主 → `OFFLINE_ENDPOINT` 快速失败 → `PendingSessionState` 骨架 → 用户手动重连（SSH 经 Settings SSH 行 Connect——issue #161 起该行即重连入口，offline 态走 T10 retry；直连 unauthorized 则重输）→ connected-gated 再同步补齐 | 主机行 idle + Connect 按钮；会话 tab 骨架（非空白）；未记住凭据 → 重输路径自愈；**进程死亡期间发生的一切（任务完成/权限请求/错误）零系统通知**——回前台经未读水位/徽标/dock 快照补齐呈现（[units/notifications.md](units/notifications.md) ⑦） | G19/G20④/G15 权威；G30④ **手动重连可接受性判定点**（不足→四步协议，候选 移动适配候选 host 级自动重连策略，不预设）；G33⑨（进程死亡零通知+重启补齐呈现） |
| ⑤ tunnel recreation | SSH 隧道断流 → T9 `ready --connectionLost--> offline`（远端持续运行）→ 上游连接循环调 `reconnect` 钩子 → `ensureTunnel` 有界预算重试（`RECONNECT_MAX_RETRIES = 3`，至多 4 次尝试；offline → retry → attemptOpen：指纹 fast path → open → 有界 `/api/info` 健康）→ ready 返回端点（换端口同身份，`ServerRef` 活 getter 跟随新端点）→ 预算耗尽落 failed | offline → retry 按钮；failed → 失败原因行内呈现 + retry；恢复期遇 host key 变化 → 红色警示 + 危险确认恢复链（永不自动覆盖） | G14/G15/G24④ 权威；G30⑤ 横切复核（换端口同身份与耗尽呈现） |
| ⑥ re-subscribe then fetch authoritative snapshot | 任意断连恢复 → SSE live-only 无重放 → 重订阅 + 全量失效（`sync.invalidate()`）→ HTTP 快照为恢复权威 + `server.connected` reconcile（`session.active()`）+ connected-gated 再同步 | 恢复后时间线/权限 dock/终端/文件各面经快照错峰补齐（见四、partial recovery 行） | [units/session-workbench.md](units/session-workbench.md) 专节权威；G20④ 权威；G30⑩ 双路由贯通 |

## 三、红线专节：断开不停止远程服务与任务

客户端断开/退出/进程死亡**永不停止远程服务与任务**。五处在册口径统一索引（本文不重定义）：

1. 仓库约定：AGENTS.md「不静默关闭或替换远程服务，不因客户端断开而主动停止远程任务」。
2. 进程边界：[architecture.md](architecture.md)「壳 `onDestroy` 仅停本地回环 asset server；远程服务/任务永不因客户端断开而停止」。
3. 会话面：[units/session-workbench.md](units/session-workbench.md) 取消/断开安全语义——断开路径零 API/interrupt 调用（`api.session.interrupt` 线级调用点全仓恰三处，均为显式用户动作）。
4. 终端面：[units/terminal.md](units/terminal.md) 三级断开语义与「Never send stop on client disconnect」红线（客户端断开路径零 remove/kill 调用 + 服务端 detach 不 kill）。
5. 服务操作面：`service-ops/flow.ts`「There is deliberately NO disconnect->stop edge.」——授权流 O14 无 disconnect→stop 边；svcops `survivedDisconnect` 证据位（B1 watcher）是断开存活的第一方核对通道。

## 四、失败类别 × 恢复矩阵

| 类别 | 机制（全部在册，本文索引） | 用户可见状态/动作 |
| --- | --- | --- |
| duplicate events | 服务端不重放（live-only）；`server.connected` reconcile 与 hydration 期事件幂等合并；`pending.sync` reconcile 合并事件与 HTTP 快照；权限 dock 他端先答处置=G21④ 在册 | 他端先答 → 本端 dock 移除，无需操作 |
| gaps | `sync.invalidate()` 全量失效 + 重连再同步补齐；**事件缺口无 durable.seq 缺口检测**（`durable` 在客户端仅 debug 日志消费）——快照为恢复权威，属上游设计 | 恢复后各面经快照补齐；无缺口指示（上游实态，见诚实边界） |
| stale snapshot | `session.active()` reconcile；未加载行事件丢弃；本地脏值优先（persist `dirty` 守卫）+ namespace revision 单调序；G19「切网恢复后不覆盖本地脏值」 | 本地编辑不被动覆盖；远端变更面经重读/刷新呈现 |
| expired credentials | 直连 401 → 重输路径自愈；SSH authRequired → host-manager 行内编辑凭据重连（T1 修订源→T12；issue #161 起 Settings SSH 行 Connect 亦驱动同一条 T1 路径）；provider needs_auth → 重认证链（G25⑤ 引用不重裁定）。**probe 分类器仅服务保存路径，恢复流不经 probe** | 连接行状态 + 行内编辑/重试动作 |
| host key 变化 | verifier 判 `changed` → `fail("host-key-changed")` → failed 态 + 行内红色警示 + `recoverHostKey` 危险确认 → `forgetHostKey` → 回未知指纹确认流。**永不自动覆盖 known_hosts** | 红色警示 + 显式危险确认恢复链 |
| offline | 连接行状态呈现（host-manager 状态标签 + offline→retry 按钮；Settings SSH 行 offline 态的 Connect 项即 T10 retry 入口——issue #161，设备实测见构建与验证文档 issue #161 段）；会话内无独立 offline 横幅（上游实态，G20④ 首项核对在册）；动作失败 toast 反馈 | 状态标签 + retry；不足归 G30③/G20④ 判定 |
| partial recovery | 恢复后各面错峰就绪：会话 tab=PendingSessionState→快照补齐；权限 dock=重连 resync 重建（服务端重启 pending 清空→G21④）；终端=探活→clone；文件 tab=stale 重读；svcops=ready 到达刷新快照（B1 watcher） | 各面独立就绪，**无统一恢复指示**（上游实态；整体可理解性=G30⑨ 判定点，不足→四步协议，候选 移动适配候选 恢复呈现强化，不预设） |

## 五、服务端存活核对步骤（验收 4 机械步骤，G30⑧ 蓝本）

以 G20⑤ 四步机械核对协议为蓝本做一次横切对照复核（直连+SSH 各一遍；各单元门禁的四步核对不因此豁免，本项是贯通与证据位核验）：

1. **发起真实长任务**（授权服务上；真模型子项另需模型授权，单独分列）。
2. **制造断连**（锁屏/切后台至超时、飞行模式/断网、杀 App；SSH 路由另含隧道拆除）。
3. **远端存活证据三通道并用**：①远端 shell 直接观察任务进程/日志；②svcops 服务操作快照 `survivedDisconnect` 位（ready 到达后经 host-manager 行内「服务操作」展开点刷新；**仅 SSH 路由 hosts 有此证据位，直连服务无**——直连存活核对走①③通道）；③有界 GET `/api/info`（`checkServiceHealth`：10s 超时、`redirect: "error"`、401/403 视为存活）。
4. **恢复连接**核对快照补齐 + 本地日志零 interrupt/stop 类请求命中。

## 六、诚实边界（上游/第一方实态，本期不声称）

本节共 **10 条 = 9 条上游/第一方实态 + 1 条范围外声明（R7）**（计数口径以本行为准）：

- **SSH 主机无自动重连**：重启后主机记录恢复为 idle，连接需用户手动发起；`ensureTunnel` 对 idle 恒返回 undefined（连 reconnect 钩子路径都不产生真实尝试）。可接受性判定归 G30④（不足→四步协议，候选 移动适配候选，不预设）；issue #161 后手动入口已落到 Settings SSH 行（idle/offline/failed 均可一键发起真实尝试，设备实测见构建与验证文档 issue #161 段）。**不得声称存在自动重连。**
- **无 offline 监听**：上游事件流仅注册 pagehide/pageshow/online/visibilitychange 四监听；离线感知=fetch 失败重试 + 45s idle watchdog 兜底。**不得声称网络切换有 offline 事件感知。**
- **事件缺口无 durable.seq 缺口检测**：`durable`（含 seq）在客户端仅进 debug 日志，无序列号比对/补拉——快照为唯一恢复权威（与 issue #19 原文「live-only events may not replay, fetch authoritative snapshot」一致）。**不得声称有序列号缺口检测。**
- **SSE 重试为固定 1s 间隔（非指数退避）**：唯一等待点固定等待 `reconnectDelay`；attempt 归零（存活 ≥1s 重置）与 forced 重同步旁路等待是其上仅有节奏调节；指数退避是终端 PTY 专属（250ms→4s，[units/terminal.md](units/terminal.md) 权威）。**不得写「SSE 指数退避」。**
- **持久化脏窗口 ≤100ms**：脏值 100ms debounce + hidden/pagehide 强制 flush；进程被杀落在脏窗口内的最后 ≤100ms 变更可能丢失（上游设计，如实登记）。
- **锁屏/切后台不发 pagehide**（上游已写明的移动实态）——`visibilitychange` 是锁屏路径的主感知通道；后台挂起的 watchdog 定时器回前台立即触发。
- **idle 宿主恢复期的钩子空转现象**：恢复的会话 tab 挂在 idle SSH 宿主上时，上游连接循环每 ~1s 重询 reconnect 钩子、`ensureTunnel` 对 idle 恒返回 undefined（无真实连接尝试、仅日志级空转）——G30④ 观察到该现象属预期实态，不是隐性自动重连、不是缺陷。
- **svcops `survivedDisconnect` 覆盖范围**：仅 SSH 路由 hosts（host-manager 行内面板）；直连服务无该证据位（存活核对走远端 shell 与 `/api/info` 通道，见第五节）。
- **壳层实例状态恢复未实现**（`onSaveInstanceState` TODO，[units/shell-startup.md](units/shell-startup.md) 权威）——进程重建恢复全部依赖 web 层持久化是设计实态。
- **范围外（R7）**：离线队列/断线自动重发、push 通知保活类产品能力不在本期范围（project-scope 开发前确认项 7「不默认承诺进程被杀后仍保活或收到通知」沿用）。

## 六A、issue #102 增补（服务器页迁移的恢复面，settings-servers-migration）

- **身份单源不变**：切页/重建后的 per-server 身份仍由 `surface.server()` 单源决定（settings.md 权威），settings-servers-migration 迁移未引入第二 current-server 状态；设备复核 2026-11-01：force-stop 后重启，服务器身份/主机列表/凭据绑定原样恢复（杀进程重建走冷启动八环链，见场景④——本轮 DBY2-AL00 实测主机行 idle、记录零丢失）。
- **Shell 写失败→回滚→重查**：目标代码路径（乐观 mutate → `actions.mutate(previous)` 回滚 → toast → 权威重查）由探针 `verify-pinch-shell-settings` 组 2 的回滚序锚与 `servers-page.test.tsx` 单测锁定；**动态写/回滚本轮未在真机执行**（辅助服务授权下的 B.11 尝试因对话框保存路径自动化受阻未达，见 build-and-verify.md issue #102 段）——动态面仍归 G30/后续授权轮，**不得声称动态已验**。
- **断开红线**：本轮未新增可执行证据（无 ready 服务会话可断开）；既有五处在册口径与 #61 历史证据不变（红线专节权威），本轮**零新增断言、零违例**。
- **健康门与恢复呈现**：不可达/401 服务器的 Shell 段随 `healthy !== false` 隐藏（settings.md/server-list.md 权威）；恢复期呈现（重试/编辑/Manage servers 出口）保持 target 形。

## 七、验证与门禁

- 静态结构锚：`scripts/verify-recovery.ts`（七组断言+负例四组；与 `verify-session-workbench.ts` 分工——组 2 的 pagehide→stop 与 foreground resync 两锚为交叉引用复核性断言（引用性，非首锁），其余为既有探针未覆盖的新锁）。
- 运行期：**G30** 横切恢复门禁十项（[interaction.md](interaction.md)）——G30 是 G20④⑤/G24④⑤⑥/G14/G15/G19/G21④⑥/G22⑤⑦⑧/G23⑧/G26⑦/G9/G12 的横切复核与贯通验证位，不替代任何单元门禁；G30 未过前本文全部运行期表述只声称「已实现（未验证）」（第十六处落字）。
- 移动适配候选池：host 级自动重连策略、恢复呈现强化（offline 横幅/统一恢复指示类）——与 #18 三候选（工件下载/PDF 查看面/CJK 字体包）同池，候选按用途去重，用户决定实施时采用语义名称；均待 G30 判定+用户决策，不预设。
