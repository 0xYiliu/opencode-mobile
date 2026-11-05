# 决策记录 0006：语音通话（W24）暂缓

> **E35 源码时效补注（2026-11-06）**：当前 `vendor/upstream/packages/app/src/session/timeline/voice-delegation.ts` 已逐字等于目标 `3ebcf9a`，含 transcript_delta 与 legacy 分支。下文 #69 时点的“增量不在 vendored 树”仅为历史，不能继续列为当前迁移缺口。此变化不改变语音通话暂缓决定，不代表语音运行验收；本轮无构建或设备操作，见 [E35](../alignment/windows-desktop/v2.2.1/current-review.md)。

本文记录 issue #69（W24：非 prod 实验语音通话——移动可行性与决策）的核对结论，并记录已确认的产品决策：**2026-10-31 用户确认暂缓——当前默认不做为运营姿态；激活条件（§4.2）与实施前提（§5）保持在册，条件满足或用户要求时重启**。§1–§8 的核对结论保持原样（全部为源码级文档裁定，零代码、零构建、零设备验证；验证边界见 §8）；决策状态与确认记录见 §9。

- 状态：已确认的产品决策（2026-10-31 用户确认）——**暂缓（当前默认不做为运营姿态）**；激活条件 §4.2 与实施前提 §5 保持在册；全部事实引用以固定 git 对象实测为准
- 记录日期：2026-10-30
- 来源议题：[issue #69](https://github.com/0xYiliu/opencode-mobile/issues/69)
- 关联：[0002](0002-direct-connection-transport.md)、[0003](0003-ssh-transport.md)、[0004](0004-service-operations.md)、[0005](0005-apk-update.md)（结构先例）、[../project-scope.md](../project-scope.md)、[../alignment/windows-desktop/v2.2.1/matrix.md](../alignment/windows-desktop/v2.2.1/matrix.md)（W24）、[../alignment/windows-desktop/v2.2.1/implementation.md](../alignment/windows-desktop/v2.2.1/implementation.md)（E25）、[../alignment/windows-desktop/v2.2.1/baseline.md](../alignment/windows-desktop/v2.2.1/baseline.md)（W24 :82，本期不改）、[../alignment/workflow.md](../alignment/workflow.md) §4/§5、issue #71（D03 相机扫码——WebView 媒体权限同型前提）
- 事实基线（本文全部行号均为对应 git 对象实测）：上游 v2.2.1 = `3ebcf9a32c7b28f658cfee80775448929361727a`；vendor pin = `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；本仓库 = origin/dev `70232d0`（#67 尚未合并）。核对方法与可运行命令见 §7；勘误与计述订正留痕见 §8

## 0. 决策问题（workflow.md §4 五要素）

- **现状**：移动端没有任何语音通话入口——vendored 树无 `vendor/upstream/packages/app/src/voice/` 目录（`git ls-tree` 实测 0 文件）、`app.tsx`/composer region 零 voice 命中（负断言）、`voice.calls` 实验 knob 无移动 face（vendored 树 grep 零命中）、Android 壳无 `RECORD_AUDIO` 权限且 `WebChromeClient` 无 `onPermissionRequest`（负断言）。vendored 树持有两个**两侧均不等于 v2.2.1** 的服务端语音契约（protocol `groups/voice.ts` 为回退前超集、ai `experimental/realtime.ts` 为缺增量前形态，§2.2）与 iOS 语音交接的时间线基础呈现（§2.1）。
- **差距**：矩阵 W24（非 prod 实验语音通话）的目标语音面在移动端全缺（无入口、无权限、无实时传输接线）。但相对 v2.2.1 的判定是**非对齐缺口**：上游该面被 `platform === "desktop"` 平台门结构性排除，**上游自己的 web 平台访客同样看不到语音按钮**——移动现状（platform 报 `"web"`）与上游 web 平台行为一致，不存在「落后于 v2.2.1」的语义（§1.2/§2.4）。
- **可行方案**：三案——(a) 实施（移植 + 门控语义分歧 + 壳权限接线 + 服务端凭据前提）；(b) 不做（以上游 desktop 门控为范围依据的排除）；(c) 暂缓（默认不做为当前运营姿态 + 激活条件登记）。逐案对比见 §3。
- **影响**：产品范围（是否对用户开放语音这一新敏感权限域）、安全与权限（`RECORD_AUDIO` + WebView `onPermissionRequest` 媒体授权流）、连接模型（语音媒体路径为手机 ↔ OpenAI RTC 端点直连，不经 SSH 隧道/直连传输——0002/0003 之外的新路径）、服务端依赖（目标远端服务须 ≥ v2.2.1 且配置 realtime 凭据）。
- **推荐**：**暂缓**——(c) 作为当前运营姿态维持，登记激活条件（§4.2）；**暂缓是「条件未满足」而非永久排除**（workflow.md §5 红线）；「不做/实施」的正式范围决策**留用户拍板**（§9.3）。核心理由：(i) 上游 desktop 平台门说明上游产品范围本身不含移动 web，移动现状与上游 web 平台行为一致；(ii) 实施必然引入上游语义分歧（改平台门）+ 新敏感权限 + 隧道外直连 RTC 路径，三项都是产品级取舍；(iii) 依赖服务端非稳定渠道实验能力（gpt-live-1）；(iv) 上游自身的移动语音形态是 iOS 原生 App + 纯文本交接，而非开放 web 面（§1.5）。

**送达载体**：本节即决策问题的完整呈现；协调员提交 PR 时，以同样的五要素形态把决策问题写入 PR 描述送达用户（F-4）。用户拍板后的落法见 §9.3（小提交路径）。

## 1. 目标语义：v2.2.1（上游 `3ebcf9a`）语音面

### 1.1 模块形态与规模

`packages/app/src/voice/` 实测顶层 **20 个条目 = 18 个 .ts/.tsx 文件（其中 5 个 .test.ts：coordination/handoff/messages/search/tools）+ voice.css（84 行）+ fixtures/（内含 fixtures/history.ts 一个文件）**。非测试源文件 13 个：call.ts（314 行）、composer.tsx、context.tsx、gates.ts（49 行）、handoff.ts、messages.ts、protocol.ts、replies.ts、search.ts、spec.ts、tail.ts、tools.ts、transport.ts（227 行）。挂载点：`VoiceProvider` 无条件挂载于 `app.tsx:107-111`（import :2）、`VoiceOverlay` 同处（import :3）、`VoiceComposer` 在 `session/composer/region.tsx:587-594`（import :10）。文案面：`runtime/i18n/en.ts:4-20` 恰 **17 个键**（`experiment.voiceCalls` :4 + `voice.*` 16 个 :5-20，含四条 failure 文案）；zh 等其他语言不含（上游 en-only 实态）。

### 1.2 三重门 + 服务端第四条件

上游入口门（`composer.tsx:43-44` 实测）：

```ts
const enabled = () =>
  platform.platform === "desktop" && import.meta.env.VITE_OPENCODE_CHANNEL !== "prod" && state.enabled
```

三重门 = **desktop 平台 + 非 prod 构建渠道 + 实验 knob `voice.calls`**（`composer.tsx:19-25`：`motionTuning.toggle("voice.calls", …, experiment: true, value: false)`——**默认关**，:24/:25）。第四条件在服务端：`transport.ts:88` 调 `api.experimental.voice.models()`，:93-95 要求存在 `model === "gpt-live-1" && available && transports.includes("webrtc")` 的模型，否则 :98 `throw new VoiceFailure("unavailable")`。服务端链（不在移动 vendored 闭包内，§2.4）：`packages/server/src/handlers/voice.ts`（`VoiceHandler` group `"server.voice"`，零渠道门——grep `channel|prod` 零命中，`available` 纯由凭据决定）→ `packages/core/src/voice.ts`（164 行：按引擎逐个查凭据——provider 存储密钥/env 变量，gpt-live-1 可走 OpenCode Console 连接，`3330b3cf38` 引入的形态）→ `packages/ai/src/experimental/realtime.ts:35` 引擎表首行 `{ family: "gpt-live", model: "gpt-live-1", id: "openai-live", provider: "openai", transports: ["webrtc"] }`（其余引擎：gpt-realtime-2.1/openai、grok-voice-3.0/xai/websocket、gemini-3.8-live/google/websocket，:35-50）。

即：**该面存在，但被四重条件锁死**——桌面平台、非 prod 渠道、默认关的实验开关、服务端 realtime 凭据。这与 baseline.md W24 行（:82）「desktop + 非 prod 渠道 + 实验开关；……不能从源码存在推断稳定版默认有语音」的既有描述逐字吻合（本期不改该行）。

### 1.3 传输形态：服务器只换 SDP，媒体直连 OpenAI

`transport.ts` 实测：:20 `private peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" })`——**ICE 服务器为空，仅 host candidates，无 STUN/TURN**；:21 协商 data channel `oai-events`（`negotiated: true, id: 4`）；:116-127 经 opencode 服务器 API（`api.experimental.voice.session`）换 SDP——服务器持有 provider 凭据并下发 delegation（指令模型 `gpt-6.1-sol` responses）；:147 `navigator.mediaDevices.getUserMedia({ audio: {…}, video: false })`，失败 → :149 `VoiceFailure("microphone")`；远端音频经 `:22` `private audio = new Audio()` + `:44` `this.audio.autoplay = true` + `:75` `srcObject` + `:77` `play()` 拉流（媒体元素 sink，Chromium 播放要求）。

**语音媒体路径 = 手机/浏览器 ↔ OpenAI RTC 端点直连，不经 opencode 服务器**（服务器只交换 SDP）；因而也不经 SSH 隧道/直连传输（0002/0003 只承载 opencode API 流量，SDP 交换请求是其唯一经隧道的部分）。设备侧需要能出网到达 OpenAI RTC 端点，这是一条既有传输决策之外的新连接路径。

### 1.4 桌面麦克风宿主：Electron renderer 仍走 getUserMedia，差异在 OS 级权限中介

桌面版的麦克风获取与 web **同一 API 路径**（renderer 内 `getUserMedia`）；多出的一层是宿主进程与操作系统的权限中介：main 进程 `setPermissionRequestHandler`（`packages/desktop/src/main/windows/security.ts:10`）+ darwin `systemPreferences.askForMediaAccess("microphone")`（`packages/desktop/src/main/ipc-handlers/window.ts:25`）+ macOS TCC 提示文案 `NSMicrophoneUsageDescription`（`electron-builder.config.ts:158` ← `desktop-native.ts:233` 逐字 "OpenCode uses your microphone for voice calls."）。对移动端的含义：Android WebView 里的对应物是 `RECORD_AUDIO` 权限 + `WebChromeClient.onPermissionRequest` 授权流——壳当前两者皆无（§2.4）。

### 1.5 上游自己的移动语音形态：iOS 原生 App + 纯文本交接

v2.2.1 `packages/app/src/session/timeline/voice-delegation.ts:3-5` 注释逐字原文（m1）：

> // Voice calls send each request as plain prompt text: a header line, then a JSON body. Nothing else marks the
> // message, so this mirrors the iOS app's `VoiceHandoff.parse`. The header's wording has changed between
> // releases; its opening and the body's shape have not.

即上游移动侧的语音故事 = **独立 iOS 原生 App 语音通话 + 把每条请求作为纯 prompt 文本交接**（头行 + JSON 体），由 web 时间线解析呈现——**不是把 web 语音通话面开放给非桌面平台**。（vendored/pin 版同一注释措辞不同——"The OpenCode iOS app sends each request from a voice call as plain prompt text…"，该注释在两版本间被改写，见 §2.2 第三条。）

## 2. 移动端现状（pin `b4525d79` / vendored 树 + 第一方壳 @ `70232d0`）

### 2.1 vendored 与 pin 的关系：blob 哈希双侧相等

vendored 树与 pin 对两个服务端语音契约**精确相等**（相等断言以 blob 哈希双侧落款，命令见 §7）：

- `vendor/upstream/packages/protocol/src/groups/voice.ts` = pin 同路径，blob `ecebc8d9bebb2de0386763831bef254bec38eb99` 双侧相等；接线在 pin/vendored `protocol/src/api.ts:5`（`import { VoiceGroup }`）与 `client.ts:47`（`"server.voice": "voice"`）。
- `vendor/upstream/packages/ai/src/experimental/realtime.ts` = pin 同路径，blob `c5f5026a005f74bb0246f8b1b602cbc5058dbe99` 双侧相等。
- iOS 语音交接解析链完整在树：`session/timeline/voice-delegation.ts`（vendored 版注释见 §2.2 第三条引文）+ 消费点 `message-timeline.tsx:27`（import）/`:301`（`parseVoiceDelegation` 调用，vendored 实测；pin :26/:297、v2.2.1 :28/:341）。

### 2.2 pin 与 v2.2.1 的关系：三个非空 diff、两侧均不等（B1 订正后版本化表述）

**对 v2.2.1，pin 的三处契约文件均为非空 diff**（分歧即下列三条；复查命令见 §7，勿以「空 diff」为预期）：

1. **`protocol/src/groups/voice.ts`：pin 持有回退前超集**（diff 实测，pin→v2.2.1 方向为删除；blob `ecebc8d9be` → `83d52fed30`）。pin 多出、v2.2.1 已删：①`VoiceModel` 的 `integration`/`workspace` 可选字段及 Console 托管注释；②`voice.models` 端点描述中的 Console 托管语义（"…or the connected OpenCode Console hosts the model, and the Console workspace a hosted model bills to."）；③`voice.session` 响应中的 `session: Schema.optional(Schema.Struct({ id: Schema.String }))`（"A hosted session's ID, for `voice.instructions`"）；④**`voice.instructions` 整个端点**（`POST /api/experimental/voice/session/:sessionID/instructions`，"Replace the backend instructions of a running session the connected OpenCode Console hosts…"）。谱系实测（`git merge-base --is-ancestor`）：`f7577a1f65`（"feat(server): start hosted GPT-Live on the connected OpenCode Console (#57735)"）**是** pin 祖先——特性进 pin；`8d95ef805b`（"chore(server): revert hosted GPT-Live on the connected OpenCode Console (#58461)"）**不是** pin 祖先——回退发生在 pin 之后、v2.2.1 已不含。服务端侧同构：pin 的 `packages/core/src/voice.ts` 亦为 Console 托管形态（`integration` 语义逐字命中实测：小写 `integration` 11 处/10 行、大写 `Integration` 5 处/5 行，大小写不敏感合计 16 处/13 行——计数命令补录 §7）。**对移动端结论的影响：pin 内该契约是上游已回退能力的残留，不能作为「移动端已有 v2.2.1 服务端语义」的依据。**
2. **`ai/src/experimental/realtime.ts`：pin 为缺增量前形态**（diff 实测；blob `c5f5026a00` → `2ac3e6bfde`）。v2.2.1 多出（`3330b3cf38` "feat(core): offer GPT-Live through an OpenCode Console connection without an OpenAI key (#58567)"，实测为 v2.2.1 祖先；pin 无）：①`RealtimeConnectInput` 的 `baseURL`/`headers` 可选字段及注释；②openai-live 分支 `${input.baseURL ?? OPENAI_BASE_URL}/live/sessions` 与 `{ headers: input.headers }` 转发；③`post()` 参数从裸 `authHeader?: string` 改为 `options: { authHeader?, headers? }` 形态。
3. **`app/src/session/timeline/voice-delegation.ts`：pin 同为前形态**（diff 实测；blob `939c336582` → `82f810759a`）。v2.2.1 多出：①`transcript_delta: Schema.optional(Schema.Array(Schema.String))` 字段；②"Desktop's first voice calls" legacy 分支（`if (text.slice(0, newline) === "Voice delegation." && !body?.transcript_delta) return { instruction, framing: undefined }`）；③注释被改写——pin 版逐字为 "// The OpenCode iOS app sends each request from a voice call as plain prompt text: a header line, then a JSON body. Nothing else marks the message, so this mirrors the app's `VoiceHandoff.parse`. …"（§1.5 引文取 v2.2.1 版）。

### 2.3 审计结论订正

本议题范围的既有表述「pin 内不存在语音通话能力（仅 TTS SpeechVoice 契约）」与本计划 v1 稿的「两契约与 v2.2.1 逐字节相同」**均不准确**：前者忽略了 pin 已接线持有 protocol/ai 两契约与 voice-delegation 解析链（且服务端语音实现存在于 pin 对象本身，§2.4）；后者为验证命令缺陷导致的假阳性（v1 在 mobile 仓执行跨仓 `git diff <ref>:<path> <ref>:<path>`，`3ebcf9a` 非本仓对象，报错走 stderr 被管道吞掉、stdout 空 diff 被误读为相等——实录见 §8）。**准确表述 = §2.1/§2.2**。两个结论不受订正影响、维持为真：①**旧入口不存在**（issue 三核对项之一）：vendored 树无 `packages/app/src/voice/` 目录（`git ls-tree` 0 文件），`app.tsx`/composer region/`mobile-hosts` voice 零命中（负断言 rc=1）；②平台门结构性排除（§2.4 第 1 条）。另：TTS SpeechVoice 契约面（`ai/src/speech.ts` 栈）是另一能力域，矩阵无对应行，本议题不登记不决策（§6）。

### 2.4 移动壳事实与连接模型

1. **平台门结构性排除（决定性事实）**：connection-platform-fetch-policy 移动平台适配器报 `platform: "web"`（`vendor/upstream/patches/mobile/connection-platform-fetch-policy.patch` hunk :9-10）。上游 `enabled()` 第一门 `platform === "desktop"`（§1.2）在移动 payload **按构造为 false**——即使源码全部移植，按钮也不渲染；反之，**上游自己的 web 平台访客同样看不到按钮**。移动现状与上游 web 平台行为一致，这是「非对齐缺口」判定的根据（§0）。
2. **渠道门不构成障碍**：`VITE_OPENCODE_CHANNEL ?? "local"`（vendored `app/src/env.d.ts:5` 类型、`runtime/extension/host-apis.tsx:253`），移动构建不设置该 env → channel = `"local"` ≠ `"prod"`，渠道门通过（issue 三核对项之二「目标渠道」已核）。
3. **实验开关面缺失**：移动 Experimental 设置只呈现 newIcons/foldUserMessages（settings-experimental）+ sources 行（session-goal-sources-panels 经 motion-tuning shim）；vendored 树现有 knob 实例恰四个（`sources.enabled` toggle、`sources.icons` choice、`sources.fade`/`sources.expand` spring，`packages/session-ui/src/sources/experiment.ts:6/:17/:27/:41`），**`voice.calls` knob 实例不存在、无设置行、无任何移动 face**（负断言 grep `voice.calls` 零命中 rc=1）；shim 默认 false、无 auto-enable。
4. **麦克风宿主（issue 三核对项之三）**：`AndroidManifest.xml` 仅 `INTERNET`（:7）+ `POST_NOTIFICATIONS`（:10），**`RECORD_AUDIO` 零命中**（负断言 rc=1）；`MainActivity.kt:202` WebChromeClient 仅重写 `onConsoleMessage`/`onGeolocationPermissionsShowPrompt`（拒绝，:210）等——**无 `onPermissionRequest`**，默认行为拒绝一切 getUserMedia 授权请求；WebView settings（`configureWebView`，:142-154）未动媒体自动播放默认。这与 **D03（issue #71，OPEN：相机扫码）是同型前提**——同为「Android WebView 媒体权限接线」缺失。
5. **安全上下文（预期，属运行属性）**：WebView 资产服务器为 loopback `http://127.0.0.1:<port>/`（network_security_config.xml :15 有 127.0.0.1 明文例外）；按 W3C secure-context 规范 loopback 属 potentially trustworthy origin，`isSecureContext` 预期 true、getUserMedia 接口预期暴露——**源码级推定，须运行探针实证（若未来实施）**；WebView 的 WebRTC（RTCPeerConnection/data channel/Audio autoplay）支持随 WebView 版本浮动，同归运行探针。
6. **服务端域边界（计述精确化）**：上游 pin **对象本身**包含服务端语音实现（`packages/core/src/voice.ts` 164 行 + `packages/server/src/handlers/voice.ts`，v2.2.1 同在且为含 Console 连接的新形态）；但移动仓 vendored 闭包不 vendor 这两包（`vendor/upstream/PROVENANCE.md`「Excluded packages」明列 core/server 等，实测 vendored 树两目录 0 文件）——服务端语音实现属远程服务域，与 #66 goal 服务端插件「服务端域不移植」同一逻辑。计划 v2 §0.2.5「pin 不 vendor core/server」的措辞按本条精确化（订正留痕见 §8）。

## 3. 三案对比

| 维度 | (a) 实施 | (b) 不做 | (c) 暂缓（推荐） |
| --- | --- | --- | --- |
| 目标语义映射 | 把 v2.2.1 语音面整体移植（18 .ts/.tsx + voice.css + 17 en 键 + knob face）并**主动改写平台门**（`platform === "desktop"` → 移动可达）——对上游产品范围的语义分歧，须差异登记 | 以上游 desktop 门控为范围依据：该面在上游就不面向移动 web，移动不追随 | 维持现状；登记激活条件（§4.2），条件触发后按 §5 前提清单开工 |
| 上游关系 | 语义分歧（平台门改写）+ 契约残留处置（§2.2：须以 v2.2.1 为准重取源，不沿用 pin 回退残留/前形态） | 与上游移动形态一致（上游移动语音 = iOS App + 文本交接，§1.5）；web 时间线的 iOS 交接呈现已在树（§2.1） | 同 (b)，保留未来选项 |
| 权限与安全 | 新增 `RECORD_AUDIO` + `onPermissionRequest` 授权流（origin 限制、代际校验、拒绝路径；#71/D03 同型接线）+ 新敏感权限域 | 零新权限、零新信任面 | 零变化 |
| 连接模型 | 新增隧道外路径：手机 ↔ OpenAI RTC 直连（`iceServers: []` 仅 host candidates，§1.3）；用户须显式接受 | 无 | 无 |
| 服务端依赖 | 目标远端服务 ≥ v2.2.1 + realtime 凭据（provider key/env 或 gpt-live-1 走 Console 连接），否则 `VoiceFailure("unavailable")`（§1.2 第四条件） | 无 | 无 |
| 实现规模 | 大：18 文件移植（移动补丁序列新条目采用语义 ID，登记表与生效数组分别维护 + `git apply --check` 硬门禁）+ 壳接线 + 运行探针 + 设置面 + 服务端配置前提 | 零代码；一次小提交落「不实现」终态（§9.3） | 零代码；仅文档 |
| 与项目约定兼容 | 需产品批准（平台门语义分歧）+ AGENTS.md 权限纪律（凭据/权限经平台安全能力）+ 运行验证义务（workflow.md §6.4/6.5） | 完全兼容 | 完全兼容 |
| 前置条件（当前状态） | 七项全部未满足（§5） | 无 | 无 |

## 4. 决策框架与推荐

### 4.1 推荐（最终决策归用户）

**暂缓**：(c) 作为当前运营姿态维持；「不做」与「实施」都留待用户拍板（workflow.md §4/§5）。理由：

1. **非对齐缺口**：上游 desktop 平台门是结构性证据——上游产品范围本身不含移动 web 语音；移动现状与上游 web 平台行为一致，不存在需要「追赶」的缺口（§1.2/§2.4.1）。
2. **三项产品级取舍捆绑**：实施 = 改上游门控语义（对上游产品范围的主动偏离）+ 引入新敏感权限（麦克风）+ 新增隧道外直连 RTC 路径——任一项都超出技术核对可自决的范围（workflow.md §4 决策边界）。
3. **服务端前提不在本仓控制内**：依赖目标远端服务升级至 v2.2.1+ 且配置 realtime 凭据（gpt-live-1 为非稳定渠道实验能力；且 v2.2.1 该面本身在上游处于活跃返工期——hosted GPT-Live 的 Console 托管在 pin→v2.2.1 区间内经历 f7577a1f65 进入与 8d95ef805b 回退，3330b3cf38 又改写 realtime 契约，§2.2），今天实施会绑定一个上游自身仍在改写的语义。
4. **上游移动语音形态相异**：上游为移动选择的是 iOS 原生 App + 文本交接（§1.5），不是开放 web 面——追随上游的产品判断应优先考虑其已选择的形态。

若用户拍板实施 → **本 issue 不交付实施**，另按批准方案新开 issue（§5 前提清单即未来方案骨架）。

### 4.2 暂缓的激活条件（可判定，暂缓 ≠ 永久排除）

以下任一条满足即重开本议题的方案讨论（对齐 0005 §4.2 形态）：

1. 用户明确移动语音需求；或上游在后续版本移除/放宽 `platform === "desktop"` 门（把该面开放到 web/移动平台）；
2. #71/D03 同型的 WebView 媒体权限接线已有批准设计（相机或麦克风任一先行均可复用）；
3. 目标远端服务存在已配置 realtime 凭据的 v2.2.1+ 实例；
4. 设备出网可达 OpenAI RTC 端点（用户网络环境确认）。

**暂缓 = 上述条件当前未满足，而非永久排除**（workflow.md §5 红线「不能将暂缓写成永久排除」；同理也不得在未拍板时把「暂缓」写死为已确认决策）。

## 5. 实施前提条件清单（若用户批准实施；本模块不实施）

1. **上游语义分歧批准**：改 `platform === "desktop"` 门（composer.tsx:43-44）为移动可达——对上游产品范围的主动偏离，须差异登记并获产品批准。
2. **源码移植**：`packages/app/src/voice/` 18 个 .ts/.tsx 文件（5 个 .test.ts 在内）+ voice.css（84 行）+ 17 个 en 键（`experiment.voiceCalls` + `voice.*` 16 个）+ `voice.calls` knob 的移动 face 与设置行——作为移动补丁序列新条目（语义 ID，登记表与生效数组分别维护 + `git apply --check` 硬门禁，沿 settings-experimental/appearance-motion-zoom/session-goal-sources-panels 先例）；**以 v2.2.1 为源重取，不得沿用 pin 的回退残留/前形态契约**（§2.2）。
3. **Android 壳媒体权限**：`RECORD_AUDIO` + `WebChromeClient.onPermissionRequest` 接线（origin 限制、代际校验、拒绝路径）——与 #71/D03 同型，应共享同一接线设计；当前壳零实现（负断言：manifest 仅 :7/:10 两权限；WebChromeClient 无 onPermissionRequest）。
4. **运行探针**：loopback `http://127.0.0.1` 的 `isSecureContext`/getUserMedia 暴露实证；WebView WebRTC（RTCPeerConnection/data channel/`Audio` autoplay 与媒体自动播放默认）实证——均为源码级推定（§2.4.5），实施前须真机探针。
5. **服务端前提**：目标远端 opencode 服务 ≥ v2.2.1（server voice handler + core Voice.Service 在移动 vendored 闭包之外，§2.4.6）且配置 realtime 供应商凭据（provider key/env，或 gpt-live-1 走 OpenCode Console 连接——3330b3cf38 形态）→ `experimental.voice.models` 返回 gpt-live-1 `available && webrtc`。
6. **连接模型扩展**：语音媒体 = 手机 ↔ OpenAI RTC 端点直连（`iceServers: []` 仅 host candidates；服务器只换 SDP，§1.3）——不经 SSH 隧道/直连传输（0002/0003）；设备需可达 OpenAI RTC 出口，用户须显式接受这条隧道外路径。
7. **产品语义约束**：即使实施，保持上游「非 prod 渠道 + 默认关实验开关」的**不计作生产默认能力**约束（matrix/baseline 既有口径，baseline.md W24 :82）；移动 face 需要新增（现状无 knob 入口，§2.4.3）。

## 6. 邻外面与关系

- **「手机不是浏览器执行宿主」（project-scope）**：该决定属浏览器**执行**宿主域（W19 desktop 内置浏览器面板）；语音通话不是浏览器执行宿主能力，而是新媒体权限域（麦克风）+ 新连接路径域（RTC 直连）——需要的是**本文这样的新决策**，不是既有决定的直接推论；也不因该决定被默认排除。
- **D03/#71（相机扫码）同型**：WebView 媒体权限接线（`RECORD_AUDIO`/`onPermissionRequest` 与相机权限/文件桥同层），两议题应共享同一接线设计；谁先行都为另一方铺路（§4.2 条件 2）。
- **TTS SpeechVoice ≠ 语音通话**：`ai/src/speech.ts` 栈是另一能力域（文本转语音），矩阵无对应行；本议题不登记、不决策、不展开。
- **voice-delegation 的 v2.2.1 增量缺口**：`transcript_delta` 字段与 legacy 分支不在 vendored 树（§2.2 第三条）——本期**只登记缺口存在，不移植、不开工作项**；处置归后续版本对齐（与 #64 时代时间线增量排除同一处置逻辑）。**收窄后的准确表述：iOS 语音交接的时间线基础呈现零缺口**（header+instruction 基础体已在 vendored `message-timeline.tsx:301` 消费），增量呈现有缺口。
- **N12「入口可见但禁用」形态不适用**：语音在移动没有任何入口可显示（入口本身不存在，§2.3），0001 的「显示禁用入口」形态（N12）没有可作用的客体。
- **「不计作生产默认能力」约束**：在未来任何实施中保持（baseline.md W24 :82 既有口径；§5.7）。

## 7. 证据方法（可复核命令形态）

全部行号为固定 git 对象实测；本文引用的可运行命令形态如下（上游对象比较一律在**上游仓**执行 `git -C /home/peterhan/repository/opencode …`；「相等」结论以 blob 哈希双侧落款；「差异」结论给出非空 diff 的分歧点；禁止以 stderr 不可见的单管道 stdout 作为唯一验证——§8 勘误）：

```sh
# 三处非空 diff（预期均非空；分歧点见 §2.2 三条——复查者勿以空 diff 为预期）
git -C /home/peterhan/repository/opencode diff b4525d79 3ebcf9a -- packages/protocol/src/groups/voice.ts
git -C /home/peterhan/repository/opencode diff b4525d79 3ebcf9a -- packages/ai/src/experimental/realtime.ts
git -C /home/peterhan/repository/opencode diff b4525d79 3ebcf9a -- packages/app/src/session/timeline/voice-delegation.ts

# blob 相等（vendored == pin，双侧落款）
git -C /home/peterhan/repository/opencode-mobile show 70232d0:vendor/upstream/packages/protocol/src/groups/voice.ts | git -C /home/peterhan/repository/opencode hash-object --stdin
git -C /home/peterhan/repository/opencode rev-parse b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43:packages/protocol/src/groups/voice.ts
# → 两侧均 ecebc8d9bebb2de0386763831bef254bec38eb99；realtime.ts 同法两侧均 c5f5026a005f74bb0246f8b1b602cbc5058dbe99

# 谱系（git merge-base --is-ancestor，rc=0 为真）
git -C /home/peterhan/repository/opencode merge-base --is-ancestor f7577a1f65 b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43   # rc=0：特性进 pin
git -C /home/peterhan/repository/opencode merge-base --is-ancestor 8d95ef805b b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43   # rc≠0：回退在 pin 后
git -C /home/peterhan/repository/opencode merge-base --is-ancestor 3330b3cf38 3ebcf9a32c7b28f658cfee80775448929361727a   # rc=0：Console 连接增量在 v2.2.1
git -C /home/peterhan/repository/opencode merge-base --is-ancestor b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43 3ebcf9a32c7b28f658cfee80775448929361727a # rc=0：pin 是 v2.2.1 祖先

# 计数与负断言（rc=1 = 零命中；git 命令一律带 -C 指明仓，禁止裸 git show/diff 跨仓对象）
git -C /home/peterhan/repository/opencode show b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43:packages/core/src/voice.ts | grep -oi 'integration' | wc -l   # → 16（小写 integration 11 处/10 行 + 大写 Integration 5 处/5 行；行数口径 grep -ic → 13）
git -C /home/peterhan/repository/opencode ls-tree --name-only 3ebcf9a32c7b28f658cfee80775448929361727a -- packages/app/src/voice/ | wc -l                      # → 20
git -C /home/peterhan/repository/opencode ls-tree -r --name-only 3ebcf9a32c7b28f658cfee80775448929361727a -- packages/app/src/voice/ | grep -c '\.test\.ts$'   # → 5
git -C /home/peterhan/repository/opencode-mobile ls-tree -r --name-only 70232d0 -- vendor/upstream/packages/app/src/voice/ | wc -l        # → 0（旧入口不存在）
git -C /home/peterhan/repository/opencode-mobile grep -n 'voice.calls' 70232d0 -- vendor/upstream/packages/                                # rc=1
git -C /home/peterhan/repository/opencode-mobile grep -n 'RECORD_AUDIO' 70232d0 -- android/                                                # rc=1
git -C /home/peterhan/repository/opencode-mobile show 70232d0:android/app/src/main/java/ai/opencode/mobile/MainActivity.kt | grep -c 'onPermissionRequest'                              # → 0
```

行号锚点（固定对象实测，供复查）：composer.tsx :19-25（knob；experiment :24 / value:false :25）、:43-44（三重门）；transport.ts :20/:21/:88/:93-95/:98/:116-127/:147/:149、Audio :22/:44/:75/:77；app.tsx :2/:3/:107-111；region.tsx :10/:587-594；realtime.ts :35（引擎表首行）；en.ts :4-20（17 键）；security.ts :10；window.ts :25；electron-builder.config.ts :158；desktop-native.ts :233；voice-delegation v2.2.1 注释 :3-5；message-timeline vendored :27/:301、pin :26/:297、v2.2.1 :28/:341；env.d.ts :5；host-apis.tsx :253；connection-platform-fetch-policy patch :9-10；MainActivity.kt :142-154/:202/:210；AndroidManifest.xml :7/:10。

## 8. 诚实边界

- **零代码、零构建、零设备 QA**：本模块全部交付为文档；未引入或修改任何代码、补丁、权限、构建配置；未执行任何设备或运行探针。
- **运行属性未证**：loopback 安全上下文（`isSecureContext`/getUserMedia 暴露）与 WebView WebRTC 支持均为源码级推定（§2.4.5），未在任何设备实证；若未来实施，§5.4 运行探针先行。
- **Windows v2.2.1 语音面未运行核实**：§1 全部为目标版本源码级语义（`3ebcf9a` 实测），无 Windows 运行环境对照（workflow.md §6 边界句适用）；服务端链语义同样为源码级（无真实 v2.2.1 服务可用）。
- **勘误留痕（v1 → v2）**：本计划 v1 稿曾断言「pin voice 契约与 v2.2.1 逐字节相同」，其验证命令 `git diff origin/dev:<path> 3ebcf9a:<path>` 在 mobile 仓因 `3ebcf9a` 非本仓对象而失败——git 报错走 **stderr**，管道接的 `head`/`wc` 只读 **stdout**，空输出被误读为「空 diff」（假阳性根因，A.5 形态）。v2 以 §7 命令形态实测订正；**实施期再次现场复现该故障形态一次**（在上游比较命令未加 `git -C` 时于 mobile 仓执行 `git show b4525d79:…` 得 "invalid object name"，stderr 可见、命令显式失败）——教训已固化为 §7 方法约束。实施期另订正计划稿计述两处：①「16 个 en i18n 键」实为 **17 个**（`experiment.voiceCalls` :4 + `voice.*` 16 个 :5-20，§1.1）；②「`<audio autoplay>` 元素」实为 `new Audio()` + `autoplay = true`（transport.ts :22/:44/:75/:77，行为同型——媒体元素 sink，§1.3）；③「pin 不 vendor core/server」精确化为「上游 pin 对象包含服务端语音实现，移动 vendored 闭包不 vendor 这两包」（§2.4.6，PROVENANCE.md excluded 列表实测）。三处订正均不改变结论。
- **审计表述两版均不准确，本文为准**：issue 范围节的「pin 内不存在语音通话能力（仅 TTS SpeechVoice 契约）」与 v1 稿「逐字节相同」的订正后准确表述 = §2.1/§2.2/§2.3；旧证据（E02/E11）不受影响。
- 本文不含凭据、令牌、私钥或真实连接配置。

## 9. 状态

### 9.1 状态表

| 条目 | 状态 |
| --- | --- |
| 本文（ADR 0006） | **已确认暂缓（2026-10-31 用户确认；当前默认不做为运营姿态）**；事实底座 = 三个固定 git 对象的源码级实测（`3ebcf9a` / `b4525d79` / `70232d0`）+ 三个谱系 commit（`f7577a1f65` / `8d95ef805b` / `3330b3cf38`） |
| 矩阵 W24 | 实现格「未实现（语音通话）」保持；策略格保持「待决策」态词并记录用户确认的暂缓（2026-10-31 已落矩阵行）；证据 E02/E11/E25 |
| 可行性结论 | **有条件可行——七项前提当前全部未满足**（§5；三项为产品级前提） |
| 推荐 | 暂缓（§4）+ 激活条件 §4.2；暂缓 ≠ 永久排除（workflow.md §5）——**该推荐即被确认的决策** |
| 各拍板选项对应的矩阵落法 | 「不做」→ W24 翻「不实现」+ 策略排除；「实施」→ 新 issue 按批准方案（§5 为骨架），矩阵俟实施推进；「暂缓」→ W24 保持待决策并记录用户确认的暂缓态（本决策即按此条落子） |

### 9.2 决策问题送达

本文 §0 + PR 描述（协调员按 workflow.md §4 五要素形态向用户提出，F-4）。

**确认记录（2026-10-31）**：决策问题已按上述载体送达用户；用户确认**暂缓**——当前默认不做为运营姿态；激活条件（§4.2）与实施前提（§5）保持在册。落法见 §9.3 确认记录。

### 9.3 拍板后路径（小提交）

- **用户拍板「不做」**：一次小提交把本文状态改「已确认（不做）」+ 矩阵 W24 推到「不实现」+ 策略排除 + 依据日期。
- **用户拍板「实施」**：本文状态改「已接受（实施）」；实施本身归批准后的新 issue（§5 前提清单为其方案骨架；含 §2.2 契约残留处置——以 v2.2.1 为源重取）。
- **用户拍板「暂缓」**：一次小提交把状态改「已确认暂缓」并记录确认日期与激活条件核对基线；矩阵 W24 保持「待决策」态（记录用户确认的暂缓）。

**确认记录（2026-10-31，按上列「用户拍板暂缓」路径执行）**：本文状态改「已确认暂缓」，确认日期 2026-10-31。激活条件核对基线：§4.2 四条中，条件 2 所指的 WebView 媒体权限接线已随 #71 相机扫码先行落地（相机侧；文件头「关联」条目的回指注记在册），条件 1（用户需求/上游放门）、条件 3（服务端 realtime 凭据）、条件 4（设备出网可达 OpenAI RTC 端点）当前未满足；本文不据此自动重开方案讨论——是否重开归用户。矩阵 W24 保持「待决策」态词并记录用户确认的暂缓（不做为运营姿态）。
