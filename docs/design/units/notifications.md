# 通知面（Task completion, permission, and error notifications）

**状态：issue #148 M-023 投递面恢复后通知面已实现（未验证）**——文档/探针/单测/编译层已验证；投递面历史：#23 交付 → #140 时代 session-workbench-upstream 补丁以目标形覆盖将其退役（#144 登记缺口、探针负锚钉定）→ #148 修剪该补丁 retirement hunks 恢复（notifications-platform-delivery 补丁字节不动）。全部运行期行为（系统通知到达/前台抑制实态/tap 路由/权限请求/声音/锁屏呈现/进程死亡边界）归 **G33** 真机门禁（[interaction.md](../interaction.md)），G33 未过前不得声称任何运行期通知行为已验证。第六座协议隔离桥（NotificationsBridge）沿用 #16 files 桥经评审通过的全部机制（协议隔离/白名单/fail-closed/零新依赖/零 androidx/零值日志）。

## ① 上游通知面全景（已随闭包进入移动壳）

上游拥有完整的应用内通知系统，四个呈现面全部在闭包内（`packages/app/src/shell/notifications/`）：

- **系统通知状态**（`notification.tsx` `createServerNotificationState`，经 `runtime/server/runtime.tsx` 每服务器装配、`ctx.notification` 挂载）：监听两支事件（`session.execution.succeeded` → agent 声音+系统通知；`session.execution.failed` → error 声音+系统通知）；每支先 `lookup(sessionID)`（未加载会话经 `data.session.sync` 拉取）、root 会话过滤（`session.parentID` 早退）、`hasOpenTab` 门（`sessionIDHasOpenTab`），然后声音与系统通知独立门控（`settings.sounds.agentEnabled()/errorsEnabled()` → `coordinator.sound`；`settings.notifications.agent()/errors()` → `coordinator.system`）。
- **应用内呈现面**：tab 头像 unread/attention 徽标（`project-avatar-state.ts`：`needsAttention`=挂起 permission/form，`unread`=needsAttention ‖ 服务端派生 unread）；`ToastRegion` 应用内 toast；permission dock（会话内，标题 `notification.permission.title`）。
- **未读水位**：`isSessionUnread` = `time.idle > time.viewed` 服务端权威；`markViewed` 经 `session.view` API 上报（失败指数退避重试 250ms→5s）；进入会话即上报（`session/route.tsx`）；legacy 本地面迁移（旧客户端列表迁服务端后删除）。
- **声音面**：`sound.ts` 45 音选项（`import.meta.glob` ui 包 aac 懒加载 + `new Audio` 播放）；`toast.tsx` 应用内 toast。

**两个上游缺口（本期新实证，shell 内实施位）**：

1. **`platform.notify` 在 Android WebView 是结构性死点**——web 平台实现（`runtime/platform/web.ts`）用 Web Notification API（`if (!("Notification" in window)) return` 早退），Android WebView 不实现该 API → notify 恒静默返回。上游 desktop 实现不在闭包；web 实现是闭包内唯一 notify 实现且在壳内不可达。门控链完整、最终一跳缺失（与 #22 相机死路同型）。
2. **permission 通知是上游死开关**——`settings.notifications.permissions()` 开关与 `notification.permission.title` i18n 键均在册（设置面已呈现给用户），但 `settings.notifications.permissions` 的消费面在 pin 实态仅两处（settings/model.tsx 访问器 + 设置 UI 渲染），**零运行时触发点**；`notification.permission.title` 的唯一消费者是会话内 permission dock 标题；`settings.sounds.permissions` 零事件面消费（`playSoundById` 事件面仅 agent/error 两处+设置预览一处）。**上游闭包实态=死开关（设置+i18n 在册、零触发面），notifications-platform-delivery 为壳内补全**——不得声称 permission 通知是上游行为。

## ② 事件源盘点

| 事件 | schema 性质 | 载荷 | 通知消费 | 适配 |
| --- | --- | --- | --- | --- |
| `session.execution.succeeded` | durable（`schema/src/session-event.ts`） | sessionID | agent 声音+系统通知（上游两支在册语义） | notifications-platform-delivery 改投递面（platform.notify → 桥），语义不动 |
| `session.execution.failed` | durable | sessionID+error | error 声音+系统通知（同上） | 同上 |
| `permission.asked` | **ephemeral**（`schema/src/permission.ts` `ephemeral({ type: "permission.asked", schema: Request.fields })`） | id/sessionID/action/resources/save?/metadata?/source?/message? | **上游零消费（死开关）** | notifications-platform-delivery 新增第四支监听（门控见 ④） |
| `permission.replied` | ephemeral（sessionID/requestID/reply） | 三字段 | 不通知（决策已发生；dock/徽标承接） | — |
| `session.*` 消息流（step/text/tool…） | 混合 | — | 不通知（会话在打开 tab 内，通知即噪音；上游同样不通知——上游设计口径） | — |

**审批路径全景（引用不重裁定，#10 穷举在册）**：wire 级 `api.permission.reply` 线级调用**恰两处**——`auto-approve.ts`（`decision:"once"`，全仓唯一无人参与的自动审批路径）+ `session/requests/model.ts`（dock `decide()` 的用户显式动作 once/always/reject）。**通知面与两者零交（双面触达禁止）**：auto-approve 面——notifications-platform-delivery 守卫抑制（已覆盖项目不通知，防「已代答仍推通知」；两门控的评估竞态最坏一次冗余/一次抑制，表现层残差归 G33①② 观察）；dock 面——通知零决策 op、零动作按钮，tap 仅导航，审批仍需用户在 dock 显式动作。

## ③ 桥契约（第六座协议隔离桥）

`NotificationsBridge.kt`（`android/.../notifications/`，vault-bridge 形状持有 activity+webView）逐机制镜像五桥先例：

- **握手**：`opencode-mobile-notifications-handshake`（六桥两两不等；native 发起 `webView.createWebMessageChannel()`、平台强制 targetOrigin `http://127.0.0.1:18090`、端口闭包、ack 前零能力、5×500ms 重建重试、ack 生命周期导航作用域）。
- **白名单恰二 op**（零动态路由零反射）：`notify` / `requestPermission`。
- **`notify` 参数**：`{category, title, body, route}`——category ∈ {agent, permissions, errors} 白名单；title/body 长度上界 128/256（JS 先行校验 + Kotlin native re-check 双层）；route 正则白名单 `^\/server\/[A-Za-z0-9_-]{1,512}\/session\/[A-Za-z0-9_-]{1,128}$`（路径由 JS 侧 `sessionHref` 构造过桥，Kotlin 只做形状校验）。返回 `{posted: boolean, code?}`。
- **`requestPermission` 参数**：`{}`。API<33 或已授权即答 `{granted:true}`；否则 `activity.requestPermissions(POST_NOTIFICATIONS, …)` 挂起、`onRequestPermissionsResult` 回答 `{granted}`（**用户必须在前台**——后台到达的该 op 立答 `{granted:false, code:"foreground"}`，不弹系统对话框，平台不允许也不尝试）。
- **线码集**：`{"unavailable","permission","foreground","io"}`（JS 镜像 `NOTIFICATIONS_ERROR_CODES`）。
- **通知身份**：tag=category、id=route.hashCode() → 同会话同类通知替换不堆叠。
- **三类静默频道**：`notifications-agent`/`-permissions`/`-errors`，`setSound(null,null)` + IMPORTANCE_DEFAULT、创建一次不可变——用户所选 45 音经上游 Audio 路径播放（前台可靠；后台 WebView 音频平台相关尽力而为，G33③）、「关闭声音」=真正无声（频道不引入第二音源、无双响）。
- **锁屏可见性** `VISIBILITY_PRIVATE`（安全锁屏只显 App 名，正文隐藏——保守默认，G33⑧ 核对）；`setAutoCancel(true)`；**零 addAction**（唯一交互=contentIntent 导航）。
- **contentIntent**：PendingIntent.getActivity(MainActivity, extras 恰 route 一枚，flag `FLAG_IMMUTABLE | FLAG_ACTIVITY_CLEAR_TOP | FLAG_ACTIVITY_SINGLE_TOP`——standard launchMode 下既达 `onNewIntent` 也支持冷启 onCreate）。
- **权限复核**：`NotificationManager.areNotificationsEnabled()` 为假 → `{posted:false, code:"permission"}`（拒绝后静默降级——应用内声音/徽标/dock 不受影响）。
- **线程模型/日志**：单后台 HandlerThread 解析派发、主线程回帖；@Volatile 跨线程字段；**零值日志**（固定 tag+op 名，永不记 route/标题/正文/任何值）。零新依赖零 androidx（`android.app.Notification.Builder` 平台 API，禁 NotificationCompat）。

**JS 侧**（`packages/mobile-hosts/src/notifications/`，files 模块逐结构镜像）：`transport.ts`（姊妹传输：handshake 常量 + `NOTIFICATIONS_BRIDGE.marker = "mobile(notifications-v1): notifications bridge transport over the platform web message channel"` + 状态机/requestId 关联/超时显式 unavailable）；`client.ts`（`NotificationsPort` 接口 `notify(op): Promise<{posted, code?}>` + `requestPermission(): Promise<{granted, code?}>`；`StubNotificationsPort` fail-closed 默认——notify→`{posted:false, code:"unavailable"}`、requestPermission→`{granted:false, code:"unavailable"}`，**降级=应用内面照常、系统通知缺席，等价于现状死点**，回滚安全）；`setActiveNotificationsPort` 模块级 seam（app-service-operations-bridge/files-platform-bridge 先例）；category/route/长度 JS 侧先行校验（双层净化先例）。

## ④ 触发面与门控矩阵（notifications-platform-delivery）

| 类别 | 事件 | 门控链（全部既有语义镜像） | 声音 | 系统通知 |
| --- | --- | --- | --- | --- |
| agent | `session.execution.succeeded` | `hasOpenTab` × `settings.notifications.agent()` | `settings.sounds.agentEnabled()` → coordinator.sound → playSoundById(sounds.agent()) | coordinator.system（内含 `document.hasFocus()` 前台早退+去重）→ 桥 notify(category="agent") |
| errors | `session.execution.failed` | `hasOpenTab` × `settings.notifications.errors()` | `settings.sounds.errorsEnabled()` → 同上 | 同上（category="errors"） |
| permissions | `permission.asked`（notifications-platform-delivery 新增第四支） | `hasOpenTab` × `settings.notifications.permissions()` × **`!settings.permissions.autoApproves(projectSettingsKey(input.sdk.scope, session?.projectID))`**（project-avatar-state 逐字先例镜像——已覆盖项目不通知，auto-approve 面守卫抑制） | `settings.sounds.permissionsEnabled()` → playSoundById(sounds.permissions())（死开关的声音面一并补全） | coordinator.system → 桥 notify(category="permissions") |

**恢复登记（issue #148）**：本表四支触发面随 #23 交付；#140 时代 session-workbench-upstream 补丁的 v2.2.1 目标形覆盖将投递面退役（#144 登记为 M-023 缺口、verify-notifications 组 2/3 负锚钉定）；#148 修剪该补丁 notification.tsx 段的四个 retirement hunks（仅保留 hasRunningChild 助手与 handleSessionIdle 守卫两个目标形 hunk 并改号），notifications-platform-delivery 补丁字节不动——其 post-image（宽形 imports + 三类桥投递 + `handlePermissionAsked` + `permission.asked` 派发）即恢复面本体，与目标形 hasRunningChild 守卫合成现树形态；verify-notifications 组 2/3/7 已随恢复转正（桥投递正锚、M-023 源注释必需、once-call 6）。

**通知内容最小化**：标题=i18n 泛化文案（`notification.session.responseReady.title`/`notification.session.error.title`/`notification.permission.title`，全在册零新增）；正文=会话标题或泛化 fallback（上游实态）。**`permission.asked` 载荷中的 `action`（工具动作名）与 `resources`（资源路径数组）不进通知文案**——notifications-platform-delivery 只消费 sessionID/id 与 `lookup` 的 `session.title`；通知文本零 URL/零 token/零凭据/零消息内容/零 action/resources。app-notifications-bridge 装配（entry.tsx 第六传输+seam 注册，app-service-operations-bridge/files-platform-bridge 单文件先例）。settings-notification-permission 设置面（settings/notifications/notifications.tsx + en/zh 三文件）：开关开启时用户在场的 POST_NOTIFICATIONS 请求 + 拒绝显态描述行（新键 `settings.general.notifications.android.*`，缺失回退 en 在册）——**后台永不弹权限对话框**。

## ⑤ tap 路由

- **路由构造**：`sessionHref(server, sessionID) = "/server/" + base64Encode(server) + "/session/" + sessionID`（`shell/routes/session.ts`；base64 为 TextEncoder 前置的 btoa 派生 URL-safe 无填充变体——任意 Unicode serverKey 均安全，安全性归因是 TextEncoder 前置）。**路由路径由 JS 侧构造后过桥**，Kotlin 只做形状白名单校验（③）——基变体风险归零，与 files 桥「JS sanitize + Kotlin native re-check」双层先例同构。
- **投递链**：通知 contentIntent → MainActivity extra（恰 route 一枚）→ `pendingRoute`（@Volatile）→ `onPageFinished` 消费 → `loadUrl(START_URL + route)`（冷启 onCreate extras 同消费）。零 deep-link（**零 VIEW intent-filter 现状保持**，`onNewIntent` 仅消费应用自身 PendingIntent extra——外部拉起禁令不变）。
- **路由语义**：`/server/:serverKey/session/:id` 是上游可直达 URL 路由（`requireServerKey` round-trip 校验查连接、ServerProvider 包裹）；签出 fallback=ConnectServerScreen。**与上游 web tap 语义的差别如实落字**：上游 `openNotificationSession` 走 tab API（add+route+select，上游单测在册）；壳内 tap=`loadUrl` 整页导航到会话路由——会话帧渲染、dock 呈现，但 tab 条的添加/高亮行为与 tab API 路径不逐字等价（tabs 从路由观察）——归 G33④ 实态判定，不预设补齐。
- **冷/热/进程死亡三态统一**：PendingIntent flag `CLEAR_TOP|SINGLE_TOP` + standard launchMode；会话删除后点陈旧通知 → `requireServerKey`/`connection()` 查无 → 空帧/签出屏——G33⑦ 负例核对。
- **鉴权恢复**（验收 2 尾句）：通知零凭据零认证动作；tap 落地后唯一服务器 unauthorized → routes fallback 连接屏（重配对/重输自愈链，connection.md 失效矩阵权威）；多服务器下非授权服务器的会话路由呈现归 G33⑥。

## ⑥ 前台抑制双层与后台尽力边界

- **JS 层**：`coordinator.system` 内 `document.hasFocus()` 早退（coordinator.ts 在册）——前台事件只响铃不出系统通知（上游设计实态）。`document.hasFocus()` 在 WebView 前后台转换的实态静态不可证，归 G33① 判定。
- **native 层**：`notify` op 处理时 `activity.hasWindowFocus()` 为真 → 不投 `{posted:false, code:"foreground"}`——**不依赖 JS 层假设的兜底**（files 桥 native re-check 先例同型）。双重失效才误报，残余登记 G33① 观察。
- **后台可达性真相（上游原文）**：`packages/client/src/solid/connection.ts:222-223` 注释逐字「Locking a phone or switching apps hides the document without a pagehide; the socket usually dies while the page is suspended, and the browser may never report that on the hung read.」——锁屏/切走不触发 pagehide（SSE 不主动停），但 socket 通常在挂起期死于平台侧且僵读不报错 → **后台通知是尽力而为**：事件到达且 socket 活着才可能响；回前台 visibilitychange+静默阈值 → resync 快照补齐（recovery.md 场景②权威）。

## ⑦ 可靠投递边界专节（验收 3 本体）

统一口径（三处落字之一，另两处见 [interaction.md](../interaction.md) 失败路径节与 [build-and-verify.md](../../build-and-verify.md) #23 段）：

- **系统通知是 best-effort**：仅进程存活且 SSE 存活期间到达的事件可触发；**进程死亡期间发生的一切（任务完成/权限请求/错误）不产生任何通知**，回前台后经应用内未读水位/dock/徽标呈现（recovery.md 场景④口径）。
- **后台 socket 通常在挂起期静默死亡**（⑥ 上游注释逐字引用）；该期间事件零通知，回前台经快照补齐。
- **本期零前台服务、零保活、零推送通道**。出处锚定 **`docs/project-scope.md` 开发前确认项 7（「不默认承诺进程被杀后仍保活或收到通知」逐字；recovery.md R7 沿用）**——凡「离开 App 仍会收到通知」的表述均超出本期证明力。
- **双向不暗示**：「通知存在 ≠ 任务定会完成或权限定会被看到」（通知发出后投递可能被系统/用户拦截）；「无通知 ≠ 任务未完成」（进程死亡/socket 死亡期间零通知）。G33②⑨ 以「零通知+回前台快照补齐=PASS 形态」如实执行。

## ⑧ 安全语义

1. **零动作红线**：Kotlin 零 `addAction`（探针负断言）；唯一交互=contentIntent 导航；`setAutoCancel(true)`。**「通知不得批准权限/停止任务」结构性成立**：op 白名单恰 `{notify, requestPermission}`（无 reply/cancel/interrupt 形态 op）；审批两处线级调用点与通知面零交（②双面触达禁止）；「停止任务」红线（AGENTS「不因客户端断开而主动停止远程任务」）——通知面天然零远端调用（Kotlin 只发本地通知）。
2. **内容最小化**（④）：标题=泛化 i18n、正文=会话标题或 fallback；action/resources/URL/token/凭据/消息内容零进文案；op 参数集合恰 `{category,title,body,route}`（route 是 base64 路径非机密）。
3. **VISIBILITY_PRIVATE**（③）：安全锁屏只显 App 名。
4. **Android 通知权限**：manifest 增 `android.permission.POST_NOTIFICATIONS`（API 33+ 运行时请求；29-32 免请求仅频道）；`requestPermission` op 必须用户在场触发（settings-notification-permission 设置面开关开启时），后台到达立答 foreground 零弹窗；`areNotificationsEnabled()` 复核，拒绝 → 静默降级。
5. **日志零值**（③）：桥日志固定 tag+op 名/计数；通知 route/标题/正文永不入 logcat。
6. **音频频道静默**（③）：三频道 setSound(null,null)，单音源纪律（上游 Audio 路径），关声=真无声无双响。

## ⑨ 设置面

- **三开关**（上游闭包在册）：agent（默认 true）/ permissions（默认 true）/ errors（默认 false）——`settings.notifications.*`；notifications-platform-delivery 后 permissions 开关获得运行时效果（死开关消灭）。
- **三声音**（上游闭包在册）：`settings.sounds.{agentEnabled, permissionsEnabled, errorsEnabled}` + 45 音选择（默认 `staplebops-01`/`staplebops-02`/`nope-03`）；notifications-platform-delivery 后 permissions 声音获得事件面消费（`playSoundById` 事件面恰 3 处）。
- **Interface 声音行**（issue #107/settings-notifications-migration 恢复，target 11 行 SettingsRow）：`settings.sounds.interfaceEnabled` 持久化 Switch（`data-action="settings-sounds-interface"`）+ 搜索目录行（keywords `sound audio interface effects wordmark logo`）随 settings-notifications-migration 回归——**播放消费者惰性登记**：target 由 new-session 面（wordmark/PinBoard/pin-sound 族）消费 `sounds.interfaceEnabled()`，该消费族不在 vendored 树；呈现归后续 new-session issue（S11 backgroundActivity 先例：字段+行+搜索行落地，呈现归后续）。45 音资源双侧同树 hash（26 emitted + 19 内联 data-URL，三默认音内联）；sound.ts 随目标收敛 3 个 export（`SoundOption`/`SoundID`/`soundSrc` 转模块私有，vendored 零消费者）。
- **Android 权限显态**（settings-notification-permission 新增）：开关开启触发用户在场的 POST_NOTIFICATIONS 请求；拒绝/桥缺席显态描述行（`settings.general.notifications.android.*` 键族，en/zh）；再授权后自动恢复投递（`areNotificationsEnabled()` 每次通知复核）。**再进入语义**（#107 设备 QA 登记）：状态行是 **session-signal**（settings-notification-permission createSignal，不入 settings.v3）——同进程内切页返回行保留上次结果（设置壳 tab 组件 keep-alive），跨重启回中性文案；per-notify `areNotificationsEnabled()` 复核不变。#107 设备实测：OFF→ON 可信点击触发请求 → 结果（本轮环境 seam fail-closed = unavailable 文案）落显式状态行，零 dialog、零 adb 授权态变更。
- **toast.tsx no-owner-gap 登记**（#107，manifest settings-notifications-migration reason 同源）：target 的 toast.tsx dead-export 收敛（移除 `dismissToast` 导出 + `toaster` 导入，vendored 树 measured 零消费者）本轮**不采纳**——shell/notifications 源面在 sound.ts 之外零触碰；显式登记为无主缺口（当前无 carve 后续 issue），candidate rider = 未来 notification-face / dead-export-sweep issue。
- 设置侧边栏 notifications 根级 tab 上游已装配（settings/shell.tsx，守卫重定向列表不含 notifications——双布局可达，无 settings-ssh-entry-guard 类守卫问题）。

## ⑩ 不支持流清单

- **进程死亡后补发通知**：平台无持久队列，不做——进程死亡期间事件零通知（⑦）；回前台快照补齐是唯一恢复通道。
- **锁屏免打扰细分**：Android 通道级 DND 交互不做专断（频道语义交系统）。
- **后台音频可靠性**：WebView 后台音频平台相关尽力而为，不承诺（G33③ 实测登记）。
- **permission 通知对无 open-tab 会话**：不通知（`hasOpenTab` 门控一致性设计选择，与 agent/error 门控一致）——徽标/dock 承接。
- **前台服务/推送通道/保活**：零（⑦红线）。
- **通知动作按钮/回复内联**：零 addAction（⑧红线）。
- **deep-link scheme 外部拉起**：零 VIEW intent-filter（tap=应用内 PendingIntent 导航）。

## 验证与门禁

- 静态结构锚：`scripts/verify-notifications.ts`（九组断言+负例四组；与既有探针分工见其头注——`audit-secret-persistence.ts` 已锁 coordinator claim 键模板为交叉引用不重锁）。
- 单测：`packages/mobile-hosts/test/notifications-client.test.ts`（stub 语义/op 形状/route 正则负例/category 集合恰三/零凭据字段负例）；上游 `notification.test.ts`（`openNotificationSession` tab 路由三调用序列）入 app 子集。
- 运行期：**G33** 真机门禁十项（[interaction.md](../interaction.md)）——G33 未过前本文全部运行期表述只声称「已实现（未验证）」（第十九处落字）。
- 去重 claim 表持久化语义见 [recovery.md](../recovery.md) 恢复数据类总表「通知去重 claim 表」行。
