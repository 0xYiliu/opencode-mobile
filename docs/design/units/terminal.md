# 单元：终端（远程 PTY 会话）

覆盖范围：多终端 tab（创建/切换/重命名/拖拽/关闭）、ghostty-web 渲染与序列化恢复、WebSocket 铸票-升级-帧协议、resize 链、退避重连+探活分类+clone 恢复、移动宿主入口与输入面。能力**全部由上游闭包承载**（issue #13，零新建界面、零运行时代码改动、零 vendor 补丁）；本文固化契约、状态矩阵与安全语义。来源边界双域声明见「安全与边界」专节。

## 能力来源表

| 面 | 能力 | 上游文件锚（vendored，pin `b4525d79bf`） |
| --- | --- | --- |
| tab 面 | 新建（`+` 按钮/`terminal.new` 命令 ctrl+alt+t）、mousedown 切换、拖拽排序（dnd-kit `RestrictToHorizontalAxis`）、双击/右键重命名（Enter/Escape 键控）、关闭（closeButton/中键/右键菜单/`terminal.close` 命令 mod+w，hidden，scope `[data-component="terminal"]`）、并发上限 20、跨切换 surfaces 缓存保屏 | `gui-extensions/src/terminal/{panel,tab,renderer}.tsx`（`MAX_CACHED_TERMINAL_WORKSPACES = 20`；surfaces 缓存「Keeps each shown terminal mounted … so switching back keeps its screen and session」） |
| 生命周期模型 | workspace 键 `${server}\0${directory}`（会话切换同目录共享）；`new()` → `pty.create`、`update(id)` → `pty.update`（title+size，失败回滚本地 draft）、`clone(id)` → `pty.create` 同 title 新 PTY 替换死终端、`close(id)` → `pty.remove`、`pty.exited` 订阅移除已退出 tab；titleNumber 1..20 复用 | `gui-extensions/src/terminal/{model,state,title}.ts`（`MAX_TERMINAL_SESSIONS = 20`） |
| 渲染层 | ghostty-web（`github:anomalyco/ghostty-web#83c0a07b…`）`Ghostty.load()` 单例共享（失败由下一终端重试）；scrollback 10_000；主题色/字体/zoom 三 `createKeyed` 跟随；`SerializeAddon` 卸载序列化 2000 行（`persistedScrollbackRows = 2_000`，主线程 O(rows×cols) 成本权衡注释在册）→ `onCleanup({id, buffer, cursor, rows, cols, scrollY})` 持久化，重挂载按 restoreSize 恢复并 `scrollToLine` | `gui-extensions/src/terminal/{terminal,serialize,state}.ts(x)`；状态 schema `TerminalState {active, all}` 解码去重恢复 |
| ws 通道 | 铸票→升级两跳、二进制控制帧+文本数据帧、输入以文本帧发送、指数退避重连+探活分类 | `client/src/solid/pty.ts`（连接器）+ `gui-extensions/src/terminal/terminal.tsx`（客户端镜像）；协议常量 `protocol/src/groups/pty.ts` |
| resize 链 | `t.onResize`→`scheduleSize`（fit 完成后把新尺寸同步回服务端）；window resize 监听→`scheduleFit`；100ms debounce + lastSize 去重；`pty.update` HTTP PUT（不经 ws）；`window.visualViewport` 高度同步（软键盘视口感知） | `terminal.tsx` `scheduleSize`/`pushSize`/`handleOpen`；`app/src/runtime/extension/panels.tsx` |
| 重连与恢复 | abnormal close（code≠1000）退避 250ms→4s 封顶重试（次数不封顶）、每次重试重铸新 ticket；探活 `pty.get` 三态（exited/PtyNotFound/其它）→ `onConnectError` → `recoverTerminal` → `ops.clone`（新 shell 替换死终端，buffer/cursor 清空、title/titleNumber 保留） | `terminal.tsx` `retry`/`gone`/`open`；`panel.tsx` `recoverTerminal`/`markTerminalConnected` |
| 移动宿主 | More 抽屉 menu kind（order 30、icon "terminal"）、dock 全宽视图（`placement: "mobile"`）、ResizeHandle 移动分支（`md:hidden`，collapseThreshold 50 拖拽折叠）、`sorted(["menu","drawer"])` 按 `mobile.order` 排序 | `terminal/renderer.tsx`（Panel 注册）；`app/src/runtime/extension/{mobile,panels}.tsx`；`app/src/session/screen.tsx`（窄屏 dock 切换） |

## 数据与端点契约

七端点全部引用 vendored 生成面（`packages/protocol/src/groups/pty.ts` 协议描述 + `packages/schema/src/{pty,pty-ticket}.ts` 类型），不另行定义契约。location 均为 `{ directory }`。

| 端点 | 方法+路径 | 调用方（两包 `src/**` 归一扫描） | 协议描述（闭包内逐字） | 错误 |
| --- | --- | --- | --- | --- |
| `pty.list` | GET `/api/pty` | 无调用方（生成面包装在册） | "List PTY sessions for a location, including exited sessions retained until removal." | — |
| `pty.create` | POST `/api/pty` | 恰 `terminal/model.ts`（new+clone 两处，其一跨行书写） | "Create a pseudo-terminal session for a location." | — |
| `pty.get` | GET `/api/pty/:ptyID` | 恰 `terminal/terminal.tsx`（探活 `gone()`） | "Get one PTY session, including its exit code once exited." | `PtyNotFoundError` |
| `pty.update` | PUT `/api/pty/:ptyID` | 恰 {`terminal/model.ts`, `terminal/terminal.tsx`}（update title/size 与 pushSize，后者跨行书写） | "Update the title or viewport size of one PTY session." | `PtyNotFoundError` |
| `pty.remove` | DELETE `/api/pty/:ptyID` | **全仓恰 1 处** = `terminal/model.ts` `close()` 内（单行书写） | "Terminate and remove one PTY session." | `PtyNotFoundError` |
| `pty.connectToken` | POST `/api/pty/:ptyID/connect-token` | 无直接调用方——经 `client/src/solid/pty.ts` 连接器内部调用（自定义 header `x-opencode-ticket` 强制 CORS preflight） | "Create a short-lived single-use ticket for opening a PTY WebSocket connection." | `ForbiddenError`/`PtyNotFoundError` |
| `pty.connect` | GET `/api/pty/:ptyID/connect`（ws 升级） | 经连接器（query `location[directory]`/`cursor`/`ticket`） | "Establish a WebSocket connection streaming PTY output and accepting terminal input." | `ForbiddenError`/`PtyNotFoundError`/`LocationNotFoundError` |

类型与事件：`Pty.Info`（`status: Literals(["running","exited"])`、exitCode 可选）、`Pty.CreateInput`/`UpdateInput`（size `{ rows: PositiveInt, cols: PositiveInt }`）、`PtyTicket.ConnectToken`（`{ ticket, expires_in }`）；事件 `pty.created`/`pty.updated`/`pty.exited`/`pty.deleted`（ephemeral）。

帧协议（客户端侧锚点在闭包内 `terminal.tsx`；服务端实现语义引缓存，见安全与边界专节）：出站=原始 UTF-8 文本帧（终端输入，`ws.send(data)`）；**唯一控制帧=0x00 字节+UTF-8 JSON `{cursor}`**（注释逐字「The server's binary control frames carry JSON such as the output cursor.」，`bytes[0] !== 0` 早退 + `ControlFrame = Schema.fromJsonString(Schema.Struct({ cursor }))`）；入站=文本或二进制 UTF-8，文本帧 `cursor += data.length` 推进；replay 按 64 KiB 分帧（引缓存 `core/pty/protocol.ts`）。

**防误读句**：
- `createPtyClient` 在 app+gui-extensions 两包域恰两处真实调用——`terminal/terminal.tsx`（终端 UI 路径，挂载期捕获的是 `ServerRef` 对象引用而非 URL 快照；getter 语义下每次重试重读 `server.url`/`server.client`）与 `app/src/runtime/server/client.tsx`（transport 层为每个 server 自建端点级 pty 客户端，**非终端 UI 路径**，属 app 数据/transport 面）。
- `client/src/pty-handoff.ts`（node:fs）与 `client/src/{service,service-probe}.ts` 为桌面后台服务 sidecar 移交用，非终端 web UI 路径，不入扫描域。
- `experimental.persistentPty`（`createPersistentPtyClient`）为桌面实验面，app+gui-extensions 源码域零消费（仅 client 包在案），移动不消费。
- client 生成面（`promise/generated/client.ts`）端点包装不入调用集合（`pty.list`/`pty.connectToken`/`pty.connect` 的直接调用方为连接器内部）。

## 状态矩阵

| 态 | 触发 | 上游锚点与恢复口径 |
| --- | --- | --- |
| connecting | 面板打开/新终端 | ghostty 加载（`importGhostty` 单例，失败由下一终端重试）+ loading 文案（i18n `loading`）+ tab 标题 handoff（`HANDOFF_MAX = 40`）；`pty.create` 失败 `console.error("Failed to create terminal")` |
| connected | ws open | replay 从 `cursor` 起补齐 + 0x00 JSON 元帧推进绝对游标 + 首输出 reveal（`serializeAsText` 非空才显形）；`handleOpen` 重置 tries、`markTerminalConnected`→`ops.trim`（清恢复快照） |
| reconnecting | close code ≠ 1000 | 退避 `Math.min(250 * 2 ** Math.min(tries, 4), 4_000)`（250ms→4s 封顶，次数不封顶），每次重试重铸新 ticket；旧快照保留呈现（不清屏）；code 1000（我方主动规范关闭）不重试 |
| dead（exited/PtyNotFound） | 探活 `pty.get` → `status === "exited"` 或 `PtyNotFoundError` | `fail(err)` → `onConnectError` → panel `recoverTerminal` → `ops.clone(id)`：**新 shell 替换死终端**，buffer/cursor/scrollY 清空、title/titleNumber 保留；每 key 仅恢复一次（`recovered` 簿记） |
| dock 关闭 | panel `onClose` → `layout.close(DOCK)` | **零影响**：不关 tab 不 remove；快照持久（surfaces 缓存 + 卸载序列化） |
| explicit close（tab 关闭） | `workspace.close`（tab.tsx 三个 UI 入口）或 `terminal.close`（mod+w 命令） | 本地移除 + **`pty.remove`（终止远端进程）**；最后一 tab 连带 `layout.close(DOCK)`；**失败通道= `console.error("Failed to close terminal", error)`——非 toast：remove 失败时远端进程存活且用户零 UI 感知** |
| exited 自行退出 | `pty.exited` 事件 | `removeExited` 移除 tab 行，active 回退相邻；shell 自行退出不 clone |
| ticket 失效 | 60s 单次消费（引缓存） | 重试路径每次先 `connect.token` 重铸新 ticket |
| auth 失败 | SSH 路由无终端级密码（隧道层认证）；直连路由 401 走应用层认证流 | 终端无 401 特判（如实）——退避重试 + `ServerRef` 活 getter 跟随重解析后的端点 |
| resize 竞态 | fit/onResize/window resize/visualViewport | `scheduleSize` 100ms debounce + `pendingSize` 合帧 + 开头 lastSize 去重命中即 return。**实态：`lastSize` 在 `pushSize` 之前更新（首发与 debounce 两路径同型），`pushSize` 失败被 `.catch(debugTerminal("failed to sync terminal size"))` 吞没——断连期（HTTP 同断）的 resize 已推进 lastSize 而服务端未收到，重连 `handleOpen` 的 `scheduleSize(t.cols, t.rows)` 被去重精确抑制、重推不发生，服务端 PTY 尺寸保持陈旧直至下一次真实 resize**；「断线期 HTTP 直达」仅在 HTTP 可达（仅 ws 断）时成立，此时 push 已成功、去重是正确去抖。**上游无失败后重推兜底，本期不补码，登记为上游已知局限（G24⑥ 显式核对）** |
| 后台/恢复 | 无 pagehide/visibilitychange 特判（terminal 目录 grep 零命中，如实） | 后台 ws 断开 → handleClose → retry（后台定时器节流可能延迟重试至回前台，属平台行为）→ 回前台重连成功后 replay 从 cursor 补齐；size 重推同受 lastSize 去重约束 |
| server 重启 | PTY 全失（服务重启=PTY 全失，引缓存） | 探活 gone → clone 新 shell + `connectionLost.description` 文案如实（「This can happen when the server restarts.」） |

## 断开安全语义专节（验收 2 落字）

**权威表述：Never send stop on client disconnect。**

三级区分（「distinguish view close from remote process termination」的实态）：

1. **dock/视图关闭（零影响）**：panel `onClose` 仅 `layout.close(DOCK)`——不关 tab、不 remove；客户端断开（锁屏/切后台/杀 App/隧道拆除）同族，仅拆 ws（`close(1000)`）+ 序列化快照持久化。
2. **tab 关闭（显式终止）**：`workspace.close`/`terminal.close` → `pty.remove`（协议描述逐字「Terminate and remove one PTY session.」）。**上游无「仅关闭视图保留进程」的标签级操作（detach-only）——tab close 即终止**，如实登记不虚构能力。
3. **进程自行退出**：`pty.exited` 事件移除行，非用户动作。

close 触发面恰两处（归一扫描穷举）：`workspace\s*\.\s*close\s*\(` 恰 {`terminal/tab.tsx`}（closeButton/中键/右键菜单三入口汇聚）+ `terminal\s*\.\s*close\s*\(` 恰 {`terminal/renderer.tsx`}（mod+w 命令）。

**红线双侧取证**：
- 客户端侧：`terminal.tsx` 全文件归一扫描 `pty.remove`/`kill(` **零命中**；清理仅 `socket.close(1000)`/`ws.close(1000)` 三处（disposed 后建连、`stop()`、`onCleanup`）+ `persistTerminal` 序列化（onCleanup 块相邻锚）。
- 服务端侧（引缓存 `~/.cache/opencode-upstream` @ pin，非闭包）：`server/src/handlers/pty-socket.ts` 注释逐字「Either side closing ends the connection normally, and every exit detaches.」+ `Effect.raceFirst(drain, read).pipe(Effect.ensuring(Effect.sync(input.detach)))`——任一侧关闭仅 `attachment.detach()`，**detach 不 kill**；`core/pty.ts` 的 `process.kill()` 唯一出现于 `teardown()`（removeSession/finalizer/EXITED_LIMIT 已退出裁剪三类调用方）。**PTY 无 idle 超时**：存活直至 ①shell 自行退出 ②显式 `pty.remove` ③服务端进程退出/teardown。
- 对照：#9 已锁 `session.interrupt` 三处显式调用点、#7 O14「断开永不停止远端」、svcops B1 `survivedDisconnect`——终端面同族红线，与 G12/G20⑤ 红线机械核对互补（终端面归 G24⑤）。

## 错误路径专节（验收 3 落字）

六类逐类上游形态（**不新增第一方分类器**——终端错误分类完全走上游自有通道：connectToken/upgrade HTTP 状态（403/404）→ ws close code（1000/非 1000/4404）→ `pty.get` 探活三态 → onConnectError → clone 恢复 + `connectionLost.*` toast）：

| # | 类别 | 上游形态 |
| --- | --- | --- |
| 1 | ticket 失效 | ticket 60s TTL、单次消费（引缓存「A ticket authorizes one upgrade to one target」）；无效/过期升级 → 403 → 客户端按非 1000 → 重试重铸新 ticket |
| 2 | auth 失败 | SSH 路由隧道层认证（终端零参与）；直连 401 走应用层认证流 + `ServerRef` getter 跟随；终端无 401 特判——退避重试，如实 |
| 3 | ws 丢失 | code 1000（我方规范关闭）不重试；非 1000 退避重连；4404（attach 拒绝：session not found/exited，引缓存）→ 客户端统一按非 1000 → retry → gone() 二跳分类 |
| 4 | 目标拒绝 | 探活三态（exited/PtyNotFoundError → clone 恢复 + title 保留；其它 → 继续重试）；注释逐字「A failed connection does not mean the PTY exited; retry checks its status first.」 |
| 5 | 后台/恢复 | 无 pagehide 特判；后台断开回前台 retry + replay 补齐；size 重推受去重约束（见状态矩阵） |
| 6 | resize 竞态 | debounce + lastSize 去重；**断连期 push 失败被去重精确抑制——重连后不自动重推，服务端尺寸陈旧直至下次 resize（上游已知局限，非兜底）**；旋转/分屏后重连的换行一致性归 G24⑥ 核对 |

吞错路径如实登记：`pushSize` 失败 debugTerminal（DEV-only）；`update` 失败回滚本地 draft + `console.error("Failed to update terminal")`；**close（remove）失败 `console.error("Failed to close terminal")`——远端进程存活且用户零 UI 感知（非 toast）**；clone 失败 `console.error("Failed to clone terminal")`。对照 G11 负例矩阵增补条目（interaction.md）。

## 安全与边界专节

- **零 OS 条件分支**：`gui-extensions/src/terminal`（全目录）+ `client/src/solid/pty.ts` 四模式（`process.platform`/`navigator.platform`/`node:os`/`require("os")`）白名单扫描零命中（实测 80 文件，下限断言 70）。终端消费面全部经扩展 SDK（`useExtension`/`usePanel`/`ServerRef`）；`ctx.desktop` web 恒 undefined。**跨探针并集注记**：terminal 目录此前未被任何探针覆盖（#8–#12 白名单均不含）——本期首扫。
- **回环 ws/ticket 的 SSH 隧道代码级论证**：`createPtyClient` 的 `url.protocol` 转换作用于 `http://127.0.0.1:<port>` → `ws://127.0.0.1:<port>/api/pty/<id>/connect?...`——ws 帧经 jsch 本地转发 TCP 通道透传（HTTP upgrade 与帧均为该 TCP 流上的字节，隧道无协议感知）。身份键 `mobile-ssh:<uuid>` 与端口解耦 → workspace 存储 scope `{server.id, directory}` 稳定，恢复链不受换端口影响；`ServerRef` 活 getter（「read client, data and url from it each time…」）使隧道重连换端口后下一次重试自动指向新端点（#6 `ExtensionConnection.reconnect` T10/T11 已交付端点重解析）。
- **CORS/origin**：铸票（POST+自定义 header→preflight）与 ws 升级的 `isAllowedRequestOrigin` 白名单默认放行 `http://127.0.0.1:*`/`localhost:*` origin（architecture.md CORS 事实节，引缓存 cors.ts @ pin）；本壳 origin `http://127.0.0.1:18090` 落于白名单——G3「预案 A」结论覆盖铸票+升级两跳，G24 真机复核叠加 ws 帧流。**明文策略**：`ws://127.0.0.1` 属 netsec 配置已放行的回环 cleartext 域（architecture.md 信任边界）。
- **ticket 非凭据**：PTY 经一次性票据 URL 参数（非凭据），引决策 [0002](../decisions/0002-direct-connection-transport.md) D5。
- **服务端保留语义（引缓存分层声明，非闭包）**：`core/pty.ts` `BUFFER_LIMIT = 1024 * 1024 * 2`（2MB 环形保留）+ `EXITED_LIMIT = 25`（已退出会话保留可观察直至显式 remove）+ 多订阅者 Map + attach 三态（replay/cursor/activate）；`core/pty/ticket.ts` `DEFAULT_TTL = Duration.seconds(60)`、容量 10_000；`handlers/pty.ts` 先验 PTY 存在（PtyNotFoundError 404）、origin 拒绝 403。**服务重启=PTY 全失**（connectionLost 文案如实）。这些语义不入探针（非闭包），pin 更新时缓存引文随 PROVENANCE 演练同步。

## 键盘/触摸/无障碍专节（验收 4 文档落点，六缺口如实登记归 G24）

**现状（上游桌面语义，零移动专码）**：ghostty-web 以隐藏 `textarea` 承载输入与原生 IME 合成（e2e 断言 `textarea`/`contenteditable="true"` 在册）；定制键处理仅两处——`terminalKeyInput`（meta+Backspace → `\x15` kill-line）与 `attachCustomKeyEventHandler`（ctrl+shift+c 复制 + `keybinds.matches("terminal.toggle")` 透传）；copy/paste 走 clipboard 事件捕获（`term.paste(text)`）；软键盘视口联动 = panels.tsx `window.visualViewport` 高度同步 + fit 重排；`terminal.toggle`/`terminal.new`/`terminal.close` keybind 对外接键盘生效。「依赖 WebView 原生行为」是事实描述**不是适配声明**——上游 e2e（terminal-input.spec.ts，运行时 9 test：文本 8 处 `test(`、1 处双迭代）全部桌面视口 1440×900 playwright，移动输入面**上游零测试覆盖**。

**六缺口（如实登记，G24⑦⑧⑨ 承接，不预设补丁）**：
1. 软键盘弹出/收起时的 fit 与滚动锚定手感；
2. 中文/日文 IME 组串期间的上屏与终端回显（ghostty-web 在 Android WebView 的组合事件处理未核验）；
3. 外接键盘全键位（Ctrl/Alt/Esc/方向/F 键）透传完整性；
4. 触屏选择/复制/粘贴入口（上游为指针+剪贴板事件语义，无长按菜单适配）；
5. 控制键软输入（Ctrl/Esc/方向键的触屏等价入口）上游不存在——若 G24 判定移动不可用，候选方案（软键条 vs 接受桌面语义）届时按失败路径四步协议交用户决策；
6. 读屏/焦点顺序未核验。

## 移动面现状

- 注册：`ctx.add(Panel, { id: "main", region: "dock", mobile: { title, order: 30, kind: "menu", icon: "terminal" }, ... })`——More 抽屉 menu kind；命令三条 toggle（ctrl+`\`）/new（ctrl+alt+t）/close（mod+w，hidden）。
- 宿主：`views.menu()`（`sorted(["menu", "drawer"])` 按 `mobile.order` 升序）渲染进 MobileViewTabs 的 More 抽屉；窄屏 `screen.dock.open()` 时 `mobileView()` 切到 dock 条目（终端占满移动视图）；终端 aside `id="terminal-panel"` 移动 `w-full` 全宽、ResizeHandle `md:hidden` 分支（min 100/max/collapseThreshold 50 拖拽折叠）、`window.visualViewport` 高度同步。
- 构建面：当前 V2 构建已携带终端全部代码（`web-dist/manifest.json` 在册 chunk 键 `_assets/ghostty-web-Ch-lxWIv.js`——`_assets/` 前缀；i18n 63 语言文件随包）；壳 MIME 已覆盖 `"wasm" to "application/wasm"`（`WebAssetServer.kt:109`）。

## 门禁与验证

- **G24**（interaction.md 新设）：终端面运行期真机清单十项（ghostty WASM 加载首项、移动入口、tab 全生命周期、重连与恢复、红线机械核对、错误路径矩阵（含陈旧尺寸核对）、IME/软键盘、外接键盘、触屏选择/控制键软输入缺口判定、双路由+三 OS live）。
- 探针：`scripts/verify-terminal.ts` 八组断言（ws 通道数据面/调用面穷举集合/断开语义红线/重连与分类/生命周期恢复/resize 链与移动面/零 OS 分支扫描/负例控制）——**static STRUCTURE check, no runtime proof**。
- 上游子集：gui-extensions 既有 6 文件 + terminal 三测试（state/writer 纯逻辑入子集；serialize.test.ts 依赖 ghostty-web WASM 实际加载，runner 可跑性首跑归因门两分支预登记）+ client 追加 `test/solid-pty.test.ts`；app/session-ui 零新增（终端装配面无上游单测，如实）。
- 子集 claim 按 F4 分支：serialize.test.ts 可跑 → gui-ext +3；`Ghostty.load()` 失败归因 runner 环境 → 移入 BLOCKED、claim +2（不得静默基线化）。

## 诚实边界

- **G24 全部运行期行为 BLOCKED**（WASM 加载、入口手感、tab 生命周期、重连恢复、红线远端核对、六类错误呈现、IME、软键盘、外接键盘、触屏选择、三 OS live）；G24 未过前本期交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **能力边界（上游客户端面不存在，非本期缺口）**：①detach-only 标签关闭（仅关视图保留进程的 tab 级操作）；②终端级 401 特判 UI；③移动端终端专属键位条/软键输入；④resize 失败后重推（lastSize 去重先更新后推、失败吞没）。
- **装配层无上游单测**（`terminal/{terminal,panel,tab,model,renderer}.tsx` 上游零直接测试）：覆盖=探针（结构）+ V2（构建）+ G24（真机）三层。
- **playwright 终端 e2e**（terminal-input/terminal-benchmark）需浏览器 BLOCKED；**服务端 PTY 实现语义**（detach 不 kill/2MB/25/ticket 60s/4404）引缓存非闭包。
- **serialize.test.ts runner 可跑性**：gui-ext 子集此前从未加载 ghostty-web，bun+happydom 下 WASM 实例化未经验证——两分支预登记，不得静默。
- 设置单元仍为 architecture.md TODO 行；本期不声称已交付。
