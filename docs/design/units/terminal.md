# 单元：终端（persistent-PTY 会话，v2.2.7）

覆盖范围：多终端 tab（创建/切换/重命名/关闭）、ghostty-web 渲染、persistent-PTY WebSocket 帧协议（snapshot+checkpoint replay）、pane/connection/surface/rename 状态机族、resize 链（queue-resize + debounce）、**never-reconnects 恢复模型**（remount + retry，不重连）、移动宿主入口与输入面。能力**全部由上游闭包承载**（issue #13 建面、issue #191 重锚定，零新建界面、零运行时代码改动、零 vendor 补丁）；本文固化契约、状态矩阵与安全语义。来源边界双域声明见「安全与边界」专节。

**v2.2.7 重组声明（issue #191 crosswalk，详见 changes.md #191 section）**：上游在 `ef712d3a78`（#60346）将桌面终端从短生命周期 `pty` 面（客户端持久快照 + 一次性 ticket + 客户端退避重连 + 探活 clone）整体迁移到 **persistent PTY 面**（服务端持有列表与屏幕、snapshot/checkpoint 重放、单 attachment 永不重连、disconnect=detach）。旧面（`pty.*` 端点 + `createPtyClient`）在 `protocol/src/groups/pty.ts` 逐字存活为退役面；4 条客户端持久化文件 `{serialize,state}{,.test}.ts` 上游删除。vendored 树 byte-identical 于 pin `fedc6f208a`（102 present / 102 SAME / 0 DIFF）。

## 能力来源表

| 面 | 能力 | 上游文件锚（vendored，pin `fedc6f208a`） |
| --- | --- | --- |
| tab 面 | 新建（`+` 按钮/`terminal.new` 命令 ctrl+alt+t）、切换、双击/右键重命名（inline-rename，Enter/Escape/blur 键控）、关闭（closeButton/中键/右键菜单 → `props.session.close`；`mod+w` close 命令 hidden、scope `[data-component="terminal"]`）、列表=服务端唯一记录（无本地并发上限常量） | `gui-plugins/src/terminal/{panel,tab,renderer}.tsx` + `machine.ts`（server-list machine） |
| 生命周期模型 | `new()` → create join（同 key 请求合并、同一 id resolve）、`close(id)` → `close.requested` → `close-terminal`（**唯一显式终止入口**）、`rename(id, title)` → `rename.requested`（未变更/清未改名不发）、`retry()` → `session.retry`（仅 failed 列表）；15s 请求预算 `TERMINAL_REQUEST_TIMEOUT_MS` | `gui-plugins/src/terminal/{model,machine}.ts` |
| 渲染层 | ghostty-web（`Ghostty.load()` 单例共享，失败由下一终端重试）；scrollback 10_000；主题色/字体/zoom 三 `createKeyed` 跟随；**服务端 snapshot 恢复屏幕**（checkpoint replay），无客户端序列化持久化 | `gui-plugins/src/terminal/terminal.tsx` + `pane-machine.ts` |
| ws 通道 | 单跳 ws（connectToken 由连接器内部获取）、二进制帧+文本消息、binary frame 直通 writer、`input_protocol=1` 协议检查 | `client/src/solid/pty.ts`（连接器）+ `gui-plugins/src/terminal/{terminal,connection-machine}.ts` |
| resize 链 | `ResizeObserver`/window resize/fonts.ready → measure；pane-machine 100ms debounce + seq 守卫 + 首测即用；connection-machine `queue-resize` 效应（writer 排序：resize → `\x1bc` reset + base64 checkpoint decode）→ 服务端 canonical size 尺寸帧接管 | `terminal.tsx:529-536` + `pane-machine.ts` + `connection-machine.ts` + `connection.ts:60-71` |
| 恢复模型 | **never reconnects**（connection-machine.ts:19 逐字）：socket 失败 → surface `failed` → 留驻说明原因；跨 server connection 的 failed mount 在新列表后恰重挂一次；failed 列表 retry + stale answer 拒绝（list attempt + rename attempt 双守卫） | `connection-machine.ts` + `surface-machine.ts` + `machine.ts` + `panel.tsx` |
| 移动宿主 | More 抽屉 menu kind（order 30、icon "terminal"）、窄屏自有 Tabs 条（`frame.placement() === "mobile"` 分支 + TerminalTab strip）、session.panel 菜单 order 20、`sorted(["menu","drawer"])` 按 `mobile.order` 排序（锚归 verify-interaction-quality） | `terminal/renderer.tsx` + `panel.tsx`；`app/src/runtime/plugin/mobile.tsx` |

## 数据与端点契约

persistent-PTY 端点全部引用 vendored 生成面（`packages/protocol/src/groups/persistent-pty.ts` 协议描述 + `packages/schema/src/persistent-pty.ts` 类型），不另行定义契约。

| 端点 | 方法+路径 | 调用方（两包 `src/**` 生产归一扫描，tests 不入域） | 协议描述（闭包内逐字） | 错误 |
| --- | --- | --- | --- | --- |
| `persistentPty.list` | GET `/api/experimental/session/:sessionID/terminal` | 恰 `terminal/model.ts`（load-list 命令 :187 + createTerminal 预点数 :322） | identifier `experimental.persistentPty.list`（无描述） | `InvalidRequestError`/`ServiceUnavailableError` |
| `persistentPty.create` | POST `/api/experimental/session/:sessionID/terminal` | 恰 `terminal/model.ts`（createTerminal :327） | identifier `experimental.persistentPty.create` | 同上 |
| `persistentPty.get` | GET `/api/experimental/persistent-pty/:ptyID` | 无调用方（生成面包装在册） | identifier `experimental.persistentPty.get` | `PtyNotFoundError`/`ServiceUnavailableError` |
| `persistentPty.update` | PUT `/api/experimental/persistent-pty/:ptyID` | 恰 `terminal/model.ts`（rename-terminal 命令 :253） | 逐字「Resize when size is present and rename when title is present; a null title clears the user title so the shell's title shows again. **Renaming fails with 501 while the terminal service predates renaming.**」 | terminalErrors + **`PtyFeatureUnsupportedError`（501）** |
| `persistentPty.remove` | DELETE `/api/experimental/persistent-pty/:ptyID` | **全域恰 1 处** = `terminal/model.ts` close-terminal 命令（:221，单入口 close.requested） | identifier `experimental.persistentPty.remove` | `PtyNotFoundError`/`ServiceUnavailableError` |
| `persistentPty.snapshot` | GET `/api/experimental/persistent-pty/:ptyID/snapshot` | 恰 `terminal/terminal.tsx`（connect 链 :544） | identifier `experimental.persistentPty.snapshot` | `PtyNotFoundError`/`ServiceUnavailableError` |
| `persistentPty.read` | GET `/api/experimental/session/:sessionID/terminal/read` | 无调用方（桌面引用面，audit-only） | 逐字「Read the last physical rows without changing selection or taking control. …」 | `ServiceUnavailableError` |
| `persistentPty.connectToken` | POST `/api/experimental/persistent-pty/:ptyID/connect-token` | 无域内调用方——经 `client/src/solid/pty.ts` 连接器内部调用（header `x-opencode-ticket: "1"`） | identifier `experimental.persistentPty.connectToken` | `ForbiddenError`/`PtyNotFoundError`/`ServiceUnavailableError` |
| `persistentPty.connect` | GET `/api/experimental/persistent-pty/:ptyID/connect`（ws） | 经连接器（query `ticket`/`cursor`/`attachment_id`/`takeover`/`input_protocol`） | 逐字「Stream persistent PTY output through the OpenCode server.」 | `ForbiddenError`/`PtyNotFoundError`/`ServiceUnavailableError` |

类型与消息：`PersistentPty.Info`（id/title/userTitle/size/output{head,tail} 等）；`PersistentPty.Snapshot`（`checkpoint: Uint8Array` + info）；**`PersistentPtyMessage` 7 变体**（attached[inputProtocol/size/role]/replay_complete/resized[cols,rows,checkpoint]/controller_changed[attachmentID]/exited[exitCode]/title_changed[title]/foreground_process_changed[process]）；事件订阅 `persistent-pty.added/removed/updated`（恰 {model.ts}，updated → `terminal.updated` 分发——**标题变更经事件到达 UI，socket `title_changed` 消息被 connection machine 刻意忽略**）。

帧协议（出站）：`persistentPtyFrame(size, data?)` = **byte0（data?1:0）+ u16BE cols + u16BE rows + payload@5**（5 字节头）；尺寸帧（data 空）即控制/接管帧，数据帧附带输入字节。入站：二进制帧直通 writer（`event.data instanceof ArrayBuffer` → `connection.output`）；文本帧为 `PersistentPtyMessage` JSON（`decodePersistentPtyMessage`，Option.isSome 才处理）。replay = writer 队列内 snapshot checkpoint（`atob` 解码 + `reset` 时前置 `\x1bc` 终端 reset）→ `replay_complete` → `replay.drained` → `live`。

**防误读句（v2.2.7 更新）**：
- 旧面 `pty.list/create/remove/update/get/connectToken/connect` 与 `createPtyClient` 在 app+gui-plugins 生产域**零调用**（归一扫描穷举；大小写敏感形态不可匹配 `persistentPty.*`/`createPersistentPtyClient`）；`protocol/src/groups/pty.ts:9-12` 常量逐字存活为退役面记录（persistent-pty 组 re-export），旧端点描述已退役。
- `createPersistentPtyClient` 在域内**恰 1 处真实调用**——`terminal/terminal.tsx`（终端 UI 路径，挂载期捕获 `ServerRef` 对象引用而非 URL 快照；「read client, data and url from it each time」语义下每次连接重读 `server.url`/`server.client`）。
- client 生成面（`promise/generated/client.ts`）端点包装与 `persistentPty.get/shutdown/handoff/connectToken/connect` 直接调用不入域（N-5 层次注记；连接器内部的 connectToken 调用在 client 包，扫描域外）。
- **本文替代 v2.2.1 版的「experimental.persistentPty 移动不消费」句**：该句在 v2.2.7 已失效——persistent PTY 就是终端面的唯一通道，移动端经同一 vendored 闭包消费（上游原生，无移动专码）。

## 状态矩阵

### connection-machine（单 attachment 协议机）

| 态 | 触发 | 上游锚点与口径 |
| --- | --- | --- |
| restoring | `createConnectionState(attachmentID)` | 等 socket `attached`；HTTP snapshot 先行恢复（`snapshot.restored` → `queue-resize(size, checkpoint)`——仅 restoring 态接受） |
| replaying | `attached`（inputProtocol=1） | role = controller/observer（`controller_changed` 可翻转）；`replay_complete` → `queue-replay-end`；`resized` → `queue-resize(size, checkpoint, reset:true)`；`exited` → EXITED；writer 队列排空（`replay.drained` + replayComplete）后进 live |
| live | drained + desired size | 输入/尺寸帧出站（`send(size, data)`）；pane 未 sized 时 pendingInput/wantsControl 挂起，sized 时按序冲刷（「Sends the input held until the pane had a size, or else takes control」flush 链） |
| exited | `exited` 消息 | socket 关闭/错误其后不再计 failure，零再发送 |
| failed（disconnected/failed/outdated） | socket.closed / socket.errored / inputProtocol≠1 | **一次性上报 surface（notify-failure），不重试不重连**；输出仍可写直至 disposed（canAcceptOutput） |
| disposed | `dispose()`（onCleanup） | 清 writer 未写输出；其后一切事件 unchanged |

**never-reconnects 逐字**（connection-machine.ts:19-21）：「One WebSocket attachment to a persistent PTY. It never reconnects: after a failure the surface mounts a new terminal / with a new attachment and a new state.」——退避重连/探活 clone 家族自 v2.2.7 起不存在。

### pane-machine（单 `<Terminal>` 挂载）

| 态 | 口径 |
| --- | --- |
| idle → loading | ghostty 加载（30s timeout `GHOSTTY_LOAD_TIMEOUT_MS`） |
| opening → connecting | emulator 打开（`terminal.opened` + initialSize）→ `apply-size` + `start-connect`（15s `TERMINAL_CONNECT_TIMEOUT_MS`：snapshot+ticket+socket 全程） |
| live / failed | `shown`（首写输出）前透明；failed 留驻最后一屏 + banner 文案（failureText：disconnected/connectionFailed/serverOutdated——**v2.2.7 i18n 键，connectionLost.* 已退役**） |
| 尺寸纪律 | sizing `{seq, size, pending}`：首测即用（`!sizing.size` → apply-size 立即）；后续 100ms debounce（`TERMINAL_SIZE_DEBOUNCE_MS`）+ seq 守卫（旧 timer 忽略）+ 同尺寸去重；**resize 经 `queue-resize` 请求服务端 canonical size，emulator 只接受服务端回推尺寸**（FitAddon.fit() 不直接 resize emulator——terminal.tsx:529-530 注释逐字） |

### surface-machine（panel 级挂载簿记）

| 规则 | 口径 |
| --- | --- |
| 挂载 | 终端可见即挂载并连接（`missing → issued+1 → mounted(session, id, mount, connection)`），切 tab 保屏 |
| failed 留驻 | socket 结束且在显示 → `status:"failed"` 留驻说明原因；不在显示 → 直接摘除 |
| 重挂一次 | 「One that ended under an older server connection, such as across a server restart, mounts again once, after the newer connection lists it.」（surface-machine.ts:71-73 逐字；`state.connection > current.connection` → swap 成新 mount） |
| elsewhere | 用户移到别的 pane 的终端在此 pane 放开屏幕（`elsewhere` 集合） |

### focus / rename

| 机 | 口径 |
| --- | --- |
| focus-machine | 面板/菜单发起的焦点请求 token 化（request pending → target → consumed/cancelled）；rename 字段持有焦点时终端不抢（tab.tsx 注释锚） |
| rename-machine | idle → arming（arm 双跳/菜单单跳，armed 前 blur 不结束编辑）→ editing（blur 即存）→ idle；save = `draft.trim() || null`（清空=清除用户标题）；change 去重 |

## 断开安全语义专节（验收 2 落字，v2.2.7 形态）

**权威表述：Never send stop on client disconnect——persistent-PTY 语义下进一步强化：客户端断开 = detach，连「视图关闭=终止」都不再成立（终止只剩一条显式路径）。**

三级区分：

1. **dock/视图关闭（零影响）**：panel 关闭仅 layout 动作；客户端断开（锁屏/切后台/杀 App/隧道拆除）同族——仅拆 ws。terminal.tsx 清理 = **dispose-only**：`onCleanup(() => { connection.dispose(); dispatch({ type: "disposed" }) })`（:591-594）+ `stop()` 的 `handles.connect?.abort()`（abort 即摘 listener，"Aborting detaches the socket's listeners, so closing it reports nothing"）+ 在途 socket `close(1000)` 守卫关闭（`CONNECTING || OPEN`）。**close(1000) 恰 2 处**（stop() :430 + aborted-connect :557；旧 pin 计 3——onCleanup persist-close 随 persistTerminal 退役，回落如实登记）。**无任何持久化/序列化/终止动作**。
2. **显式关闭（唯一终止入口）**：tab closeButton/中键/右键菜单 → `props.session.close(id)`（tab.tsx:25）→ `close.requested` → machine `close-terminal` 命令 → `persistentPty.remove`（**全域唯一调用点**，model.ts:221）。配对吞错：`isPtyNotFoundError(error) → close.succeeded`（已退出终端的 remove 不算失败）；其余失败 → `close.failed` → toast-close-failed（**v2.2.7 失败有 toast 呈现，旧 pin 的「remove 失败零 UI 感知」局限已被上游修复**）。`mod+w` close 命令（hidden，follows "tab.close"，scope `[data-component="terminal"]`）同一入口。
3. **进程自行退出**：`exited` 消息 → connection 态 EXITED（socket 关闭不再计 failure）；tab 行由 `persistent-pty.removed` 事件刷新移除，非用户动作。

**红线双侧取证**：
- 客户端侧：terminal.tsx 归一扫描 `persistentPty.remove`/`kill(` **零命中**；`persistentPty.remove` 生产域恰 {model.ts}（探针组 2 闭集 + 组 3 红线双保险；负注入 drill「remove 注入 cleanup」「kill 注入 cleanup」在册）。
- 服务端侧（引缓存 `~/.cache/opencode-upstream` @ pin，非闭包）：persistent-pty daemon 的 attach/detach 语义——任一侧断开仅 detach，**detach 不 kill**；`core/pty.ts` `process.kill()` 仍唯一出现于 teardown（removeSession/finalizer/EXITED_LIMIT 三类调用方）。PTY 存活直至 ①shell 自行退出 ②显式 `persistentPty.remove` ③服务端进程退出。
- 对照：#9 `session.interrupt` 三处显式调用点、#7 O14「断开永不停止远端」、svcops B1 `survivedDisconnect`——终端面同族红线，G24⑤ 机械核对承载（G24⑤ 同时承载杀 App 场景；本轮零 Android 改动 = 无 keepalive 证据）。

## snapshot + cursor replay 专节（v2.2.7 新增）

connect 链（terminal.tsx:543-587）：
1. `const snapshot = await server.client.experimental.persistentPty.snapshot({ ptyID })`——服务端快照（info.size + output.tail + checkpoint）。
2. `connection.restore({ size: snapshot.info.size, checkpoint: snapshot.checkpoint })`——restoring 态入队 `queue-resize(size, checkpoint)`。
3. `createPersistentPtyClient(server.client, { url: server.url }).connect({ ptyID, cursor: snapshot.info.output.tail, attachmentID, takeover: true })`——ws 打开后 `attached`（role=inputProtocol 判定）→ replay 流（checkpoint base64 → `\x1bc` reset + 解码回放）→ `resized`（服务端 canonical 尺寸 + checkpoint）→ `replay_complete` → drained → live。
4. aborted（signal）→ `socket.close(1000)` 直接关闭（red-line 形态内的规范关闭）。

**checkpoint 语义**：base64 二进制串（one character per byte，connection.ts 注释锚）；`reset` 分支前置 `\x1bc`（终端硬 reset 后回放 checkpoint），保证 resized 后屏幕状态一致。旧面的「replay 从 cursor 起文本补齐」升级为「snapshot 全屏恢复 + cursor 起增量」双层。

## rename / 501 专节（`65c0d83f4d`）

- 入口：tab 双击/右键菜单 → inline-rename（arming/editing 两态防误触）→ save（null=清除用户标题，shell 标题回归）。
- 未变更不发：rename.requested 与 shown title 相同、或对从未改名的终端清空 → machine unchanged（不发请求）。
- 501 分类链：`persistentPty.update` 遇 terminal service 早于 rename 能力 → `PtyFeatureUnsupportedError`（httpApiStatus 501，errors.ts 逐字在册）→ model `rename.failed kind:"unsupported"` → machine `toast-rename-failed` → toast `rename.unsupported`（en 逐字「Terminal renaming will be available after OpenCode's terminal service restarts」）；其余失败 → `rename.failed`（description=error.message）。
- stale 守卫：「An older rename's answer is stale: the newer one decides, and the server's update event reports the result.」逐字（machine.ts）——旧 attempt 应答被 attempt 比对拒绝。
- 标题呈现：服务端以 `persistent-pty.updated` 事件广播（→ `terminal.updated` 分发 → withItems 替换行）；socket `title_changed` 消息被忽略（防双源）；pending rename 的 draft 以 `renamed()` 覆盖显示在确认列表之上。

## 恢复链专节（v2.2.7：remount + retry，非重连）

| 场景 | 链路 |
| --- | --- |
| socket 断开/错误（同 attachment） | connection → failed("disconnected"/"failed") → pane failed + banner（留驻最后一屏）→ `notify-failure` → surface `surface.failed`：显示中 → failed 留驻；不在显示 → 摘除。**不重试**——用户切走再切回同 mount 不复活；新挂载（新 attachment）才重新 connect |
| server 重启（跨 connection） | 新 connection 列表到达 → `state.connection > current.connection` 的 failed mount swap 成新 mount（issued+1）→ 新 terminal 实例全链 reconnect（snapshot 恢复屏幕） |
| 列表加载失败 | panel failed 视图 + retry 按钮（`onClick={() => terminal().retry()}`）→ `session.retry` → 仅 failed 列表可重试（「Retrying a list that isn't failed would only repeat a request」逐字） |
| stale answer | list：attempt 不符 → unchanged（「Only the latest request for a session still loaded may settle it.」）；rename：同上 stale 守卫 |
| 能力缺失 | server info `capabilities.persistentPty === false` 或 list 404/405（outdated()）→ unsupported 视图（「Terminals aren't available on this server」）；list.unavailable（503）→ lost → unsupported，下次 server.connected 再查 |

## 安全与边界专节

- **零 OS 条件分支**：`gui-plugins/src/terminal`（全目录）+ `client/src/solid/pty.ts` 白名单扫描（process.platform/navigator.platform/node:os/require("os")/from "os"）零命中——**实测 101 文件**（terminal 100 + pty.ts），下限断言 101。例外在册：`terminal/quote.tsx:41` navigator.platform Mac 指针门（quote 按钮，同 verify-files renderer.tsx 异常形态）。
- **回环 ws/ticket 的 SSH 隧道代码级论证（沿 #13，路径更新）**：`createPersistentPtyClient` 的 `url.protocol` 转换作用于 `http://127.0.0.1:<port>` → `ws://127.0.0.1:<port>/api/experimental/persistent-pty/<id>/connect?...`——ws 帧经 jsch 本地转发 TCP 通道透传（HTTP upgrade 与帧均为该 TCP 流上的字节，隧道无协议感知）。`ServerRef` 活 getter 使隧道重连换端口后新挂载自动指向新端点；**attachmentID 每挂载新生成（uuid），无跨端点身份耦合**。
- **CORS/origin**：connectToken（POST+自定义 header→preflight）与 ws 升级的 `isAllowedRequestOrigin` 白名单默认放行 `http://127.0.0.1:*`/`localhost:*`（architecture.md CORS 事实节，引缓存）；本壳 origin 落于白名单——G3「预案 A」结论覆盖铸票+升级两跳，G24 真机复核叠加 ws 帧流。`ws://127.0.0.1` 属 netsec 已放行的回环 cleartext 域。
- **ticket 非凭据**：PTY 经一次性票据 URL 参数（非凭据），引决策 [0002](../../decisions/0002-direct-connection-transport.md) D5。
- **服务端保留语义（引缓存分层声明，非闭包）**：`core/pty.ts` `BUFFER_LIMIT = 1024 * 1024 * 2`（2MB 环形保留）+ `EXITED_LIMIT` + persistent-pty daemon checkpoint/ticket TTL 语义 + `handlers/persistent-pty.ts` 先验存在（PtyNotFoundError 404）。**服务重启=PTY 全失 → surface 跨 connection 重挂一次走 snapshot 全屏恢复**（v2.2.7 的恢复体验优于旧 clone 替换：同 id 同服务端记录）。这些语义不入探针（非闭包），pin 更新时缓存引文随 PROVENANCE 演练同步。

## 键盘/触摸/无障碍专节（验收 4 文档落点，六缺口如实登记归 G24）

**现状（上游桌面语义，零移动专码）**：ghostty-web 以隐藏 `textarea` 承载输入与原生 IME 合成；定制键处理 = `terminalKeyInput`（meta+Backspace → `\x15` kill-line）+ `attachCustomKeyEventHandler`（ctrl+shift+c 复制 + `keybinds.matches("terminal.toggle")` 透传）+ `consumeTerminalMetaKey`（meta+v/c 走原生 paste/copy，ghostty-web 层 preventDefault 协作——**v2.2.7 新增 RTL/非 QWERTY 布局宽容**，terminal-key-event.test.ts 在册）；copy/paste 走 clipboard 事件捕获（`term.paste(text)`/`document.execCommand`）；输入路径 `onData → connection.input`（writer 去抖期间挂起，防「另一客户端被夺控」——connection.ts 注释逐字「forwarding a reply would also take control from another client」）。**终端目录 visualViewport 零命中（v2.2.7 实态记录）**——app 壳软键盘视口锚归 verify-interaction-quality（其组 3 断言 stale-on-v2.2.7 待自身重锚）；软键盘 fit 行为归 G24⑦ 真机判定。上游 e2e（`terminal.spec.ts`，Playwright）为桌面视口语义，移动输入面**上游零测试覆盖**（e2e audit-only，不作为 Android 门禁）。

**六缺口（如实登记，G24⑦⑧⑨ 承接，不预设补丁；与 v2.2.1 版差异如实标注）**：
1. 软键盘弹出/收起时的 fit 与滚动锚定手感（**v2.2.7 起终端目录无自有 visualViewport 同步——判定语境变化：fit 完全由 ResizeObserver/窗口尺寸驱动**）；
2. 中文/日文 IME 组串期间的上屏与终端回显（ghostty-web 在 Android WebView 的组合事件处理未核验）；
3. 外接键盘全键位（Ctrl/Alt/Esc/方向/F 键）透传完整性；
4. 触屏选择/复制/粘贴入口（上游为指针+剪贴板事件语义，无长按菜单适配）；
5. 控制键软输入（Ctrl/Esc/方向键的触屏等价入口）上游不存在——若 G24 判定移动不可用，候选方案（软键条 vs 接受桌面语义）届时按失败路径四步协议交用户决策；
6. 读屏/焦点顺序未核验。

## 移动面现状（上游原生，v2.2.7）

- 注册：`ctx.add(Panel, { id: "main", region: "side", transient: true, mobile: { title, order: 30, kind: "menu", icon: "terminal", cached: true }, ... })`（renderer.tsx）——More 抽屉 menu kind；session.panel 菜单项 order 20（「tab.title」+ icon terminal + keybind terminal.new）；命令三条 toggle（ctrl+`，index.ts:6 在册）/new（ctrl+alt+t）/close（mod+w hidden，follows tab.close）。
- 窄屏自有 Tabs 条：`frame.placement() === "mobile"` 分支（panel.tsx:40）→ TerminalTab strip（切换/重命名/`+` 新建/Keybind 提示）+ surfaces 复用同一挂载簿记；宽屏走 side-region strip tab。
- 宿主：`sorted(["menu", "drawer"])` 按 `mobile.order` 升序（app/src/runtime/plugin/mobile.tsx:42——锚归 verify-interaction-quality 组 4 cross-reference）。
- 构建面：V2 构建携带终端全部代码（ghostty-web chunk + i18n 63 语言文件随包）；壳 MIME `"wasm"` 在册（`WebAssetServer.kt`）。

## 门禁与验证

- **G24**（interaction.md）：终端面运行期真机清单十项；**#191 注记**：④⑥ 的协议形态已随 v2.2.7 重写（never-reconnects/snapshot 恢复取代退避重连/clone），清单项本身不变、语义按本文矩阵执行。
- 探针：`scripts/verify-terminal.ts` **七组断言 + 6 条负注入 drill**（persistent-PTY 数据面/生产调用面穷举集合/断开红线/never-reconnects 恢复/生命周期与 rename/resize 链与移动面/零 OS 扫描；drill = in-memory 注入→预期组 FAIL→还原→PASS，vendored 源零写盘）——**static STRUCTURE check, no runtime proof**。退役锚显式清单见探针头注（workspace.close/terminal.close 调用集、close(1000) 3→2、persistTerminal、connectionLost.*、退避/探活/clone 族、两个 20 上限常量、workspace key、2000 行持久化、旧 pty 端点描述）。
- 上游子集（canonical 命令形态，包目录执行、bunfig happydom preload 生效）：`vendor/upstream/packages/gui-plugins` 下 `bun test src/terminal` = **131 pass / 0 fail / 820 expect / 12 files**；`vendor/upstream/packages/client` 下 `bun test test/solid-pty-protocol.test.ts test/solid-pty.test.ts` = **12 pass / 0 fail / 26 expect / 2 files**；gui-plugins files 域 `bun test src/file src/review src/microsoft-office` = **430/0/1337/36**（非终端面 untouched 旁证）。worktree 根形态 `bun test src/terminal` = 117 pass / 6 fail / 769 expect / 12 files（6 fail = terminalKeyEvent ×4 KeyboardEvent-not-defined + connection/writer 队列续行 ×2——preload 未生效所致；**根形态不作门禁**，canonical 形态为准）。

## 诚实边界

- **G24 全部运行期行为 BLOCKED**（WASM 加载、入口手感、tab 生命周期、snapshot/cursor replay 真服务、红线远端核对、错误路径呈现、IME、软键盘、外接键盘、触屏选择、双路由+三 OS live）；**SSH 隧道 PTY 创建/输入/resize/关闭/断开重连/红线② 核对 = 解除条件 SSH 主机授权**（issue #191 明确 NOT RUN 边界）。G24 未过前本期交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。
- **能力边界（上游客户端面不存在，非本期缺口）**：①终端级 401 特判 UI（退避语义已随 never-reconnects 退役，失败呈现=banner 文案+remount 恢复）；②移动端终端专属键位条/软键输入；③「仅关闭视图保留进程」的标签级操作**在 v2.2.7 已不再是缺口**——视图关闭本就不终止（dispose-only），终止只剩显式 close 一条路径。
- **装配层无上游直接单测**（terminal/panel/tab/renderer.tsx 装配面）：覆盖=12 个纯逻辑/机测试文件（connection/connection-machine/pane/surface/machine/focus/rename/quote-machine/dispatch/terminal-key-event/writer/model）+ 探针（结构）+ V2（构建）+ G24（真机）四层。
- **playwright 终端 e2e**（terminal.spec.ts）audit-only 未运行（需浏览器，且非 Android 硬门禁）；**服务端 persistent-pty 实现语义**（detach 不 kill/2MB/checkpoint/ticket）引缓存非闭包。
- **本单元替换 v2.2.1 版全文**：旧「short-lived pty 面」契约（两跳铸票、0x00 控制帧、退避重连、探活 clone、SerializeAddon 2000 行持久化、20 上限、workspace key）全部为历史文档，锚定退役 pin `b4525d79bf`，不再约束当前实现；如需考古见 git 历史与本节 v2.2.7 重组声明。
