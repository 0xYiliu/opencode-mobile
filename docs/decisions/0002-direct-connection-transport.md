# 决策记录 0002：直连传输策略与错误分类

本文记录 issue #5（服务地址直连：认证、HTTP/HTTPS 与证书恢复）的传输与安全裁定。裁定以文档承载，可随用户决策演进；除文末状态表外，本文不声称任何功能已在真机可用。

- 状态：已确认的技术裁定（设备级验证 BLOCKED，见 [../build-and-verify.md](../build-and-verify.md) V-conn 与 G 门禁）
- 记录日期：2026-10-24
- 来源议题：[issue #5](https://github.com/0xYiliu/opencode-mobile/issues/5)
- 关联：[0001](0001-wsl-exclusion.md)、[../design/units/connection.md](../design/units/connection.md)、[../design/architecture.md](../design/architecture.md)、[../design/interaction.md](../design/interaction.md)

## 背景

直连要求用户在设备上输入远程服务地址与凭据后完成认证连接。四条通道（API/SSE/WS/上传与二进制读）的认证语义、跨主机重定向行为、TLS 信任锚、明文 HTTP 的取舍与失败反馈的分类，需要一次性裁定，避免逐补丁漂移。

## D1 重定向策略：validated-follow（校验后跟随）

裁定：前端 fetch 封装做「保留跟随 + 响应后校验」，不修改浏览器传输语义本身。connection-platform-fetch-policy 经 app-mobile-hosts-alias 别名把 `createWebPlatform` 的 `fetch` 注入为 `createSecureFetch()`（vendored `packages/app/src/runtime/platform/web.ts`；`platform.fetch` 是上游既有接缝，`client.tsx` 的 `createServerTransport({fetch: platform.fetch})` 与 `health.ts` 的 `useCheckServerHealth` 均消费它，覆盖 API/SSE/二进制读/健康检查全部 fetch 面）。保留 `redirect: "follow"`（同源反代场景合法）；浏览器完成重定向后，在内容交付前校验：

1. `response.url` 的 origin ≠ 请求 origin → 取消响应 body、抛 `SecureFetchError("redirect-cross-host")`；
2. 请求 https → 响应 http（降级）→ 抛 `SecureFetchError("redirect-downgrade")`；
3. 请求 URL 含 userinfo 凭据（`user:pass@host`）→ 拒发（纵深，见 D-URL）。

安全论证：跨源重定向的子请求已被浏览器规范剥除 Authorization 头（泄漏不成立）；真实问题是**静默跟随**——在无凭据状态下消费另一主机的响应体，或 https→http 降级。我方在响应体交付给应用前 fail-closed。

- XHR 上传不经 `platform.fetch`：attachments-upload-redirect-policy 在 `destination.ts` 的 load 回调以同规则校验 `xhr.responseURL`（`validateRedirectTarget`），两面一致。
- 备选评估：`redirect: "error"` 否（伤害合法同源反代）；`redirect: "manual"` 否（`opaqueredirect` 不可读，无法区分合法/恶意跟随）。
- 已知边界（勘误 N1，评审）：**分类错误在健康检查面会被重试**——vendored client 的 `execute()`（`packages/client/src/promise/generated/client.ts:350`）把一切 fetch 异常（含 `SecureFetchError`）包为 `ClientError("Transport")`，而 `health.ts` 的 `retryable()` 第一分支 `error instanceof ClientError` 先于消息正则短路返回 true。后果无害且 fail-closed：至多默认再试 2 次（~300ms 量级）、全程无 body 交付、跨源子请求已被浏览器剥头（底线不破）。消息纪律（避开 `network|fetch|timedout` 等词、类名非 `TypeError`）保留为**未来直接消费 `SecureFetchError` 的调用方**（如 attachments-upload-redirect-policy 上传面的直接 reject）的纵深，并以单测锁定该纪律本身。

## D-URL 密钥不进 URL

裁定：长期凭据（服务密码）永不进入 URL。`packages/app/src/runtime/server/api.ts` 的 `authTokenFromCredentials` 拼 `Basic base64("opencode:<password>")` 进 `Authorization` 头（上游已统一，connection-platform-fetch-policy 不触头语义）；secure-fetch 对含 userinfo 的请求 URL 拒发（`assertNoUrlCredentials`，纵深：对话框地址校验 `serverAddress` 已拒 userinfo，但 `normalizeServerUrl` 直存路径不拒，壳侧拒发兜底）。上游健康检查轮询以同一内存密码铸头。

## D5 WS 票据入 URL：接受并文档化

PTY 通道（vendored `packages/client/src/solid/pty.ts`）先认证铸一次性 ticket（`Authorization` + `x-opencode-ticket` 头），再 `new WebSocket(url?ticket=…)`；服务端对铸票与升级双重校验 Origin 白名单并**单次消费** ticket（绑定 ptyID/directory/workspaceID）。裁定：

- URL 中是**短时效单次能力票据**，不是长期凭据；浏览器 WebSocket 无法自定义请求头，上游此设计是唯一可行路径。
- 红线「密钥不进 URL」指长期凭据（服务密码/私钥），不含单次票据。
- 改动上游设计需同时 patch client 与 server 两包，代价不成比例，不采用。
- 日志纪律已保证 URL 参数不入 logcat（Kotlin 侧固定 tag + 零值日志；见下 probe 设计节与 architecture.md 日志纪律）。

## D2 TLS 信任设计：system CA 唯一信任锚

裁定：

- **system CA store 是唯一信任锚**：原裁定中 `network_security_config.xml` base-config 禁止明文并仅使用 `<certificates src="system"/>`；后续允许 HTTP 的变更不改变 system CA 信任锚。不引入 user anchors、不做 per-connection 放行、不引入自定义 `X509TrustManager`/`HostnameVerifier`（静态负断言入 `scripts/verify-direct-connection.ts`），**绝不 trust-all**（红线，永不）。
- WebView fetch 由 Chromium 校验证书；平台 `HttpURLConnection`（probe 用）与 Chromium 同受 netsec 约束——probe 与 WebView 判定天然同源一致。
- 新增原生 `DirectEndpointProbe`（Kotlin `HttpURLConnection`，严格默认、连接/读取超时、有界 body 侦嗅、无 URL/头日志）+ `ProbeBridge`（见下节）。
- 分类码全集（`DirectErrorCode`）：`cert-expired` / `cert-hostname` / `cert-untrusted` / `cleartext-blocked` / `refused` / `timeout` / `dns` / `unauthorized` / `forbidden` / `not-found` / `html-response` / `ok`。自签与私有 CA 在客户端不可分辨，同为 `cert-untrusted`，文案如实说明。
- **裁定：自签/私有 CA HTTPS 直连本期不支持**。失败反馈给三条出路：①正规 CA 证书（如 Let's Encrypt）；②SSH 隧道（归 issue #6）；③每连接证书 pin 的壳侧信任桥列为后续候选（需设计评审，本轮不做）。
- 备选评估：netsec 增 user anchors 否（全局信任姿态变更，影响面超出单连接）；壳内 TLS 反代否（体量不成比例，推迟）；trust-all 永不（红线）。

### probe 设计节（F1：probe 凭据边界与桥纪律）

probe 是**分类器不是权威**：`/api/info`（与上游健康检查同路径）的一次 GET 请求 + 有界响应侦嗅，产出 `DirectErrorCode`；分类与真实 fetch（上游健康检查）冲突时**以真实 fetch 为准**（connection-error-classification 只在健康检查失败时消费 probe 分类选择错误文案，绝不因 probe 结果放行保存；`ok` 分类与真实失败冲突时退化为上游泛化反馈）。覆盖边界（勘误 N4）：优先级次序位于 vendored dialog 的 `connectErrorKey`（connection-error-classification 装配），现有覆盖=probe 端口级单测（fail-closed/退化/零伪造）+ connection-error-classification 装配静态核验（V-cRef 类结构探针），优先级次序本身未经 Solid 运行时单测。

带凭据 probe（评审备注 F1）：probe 分类含 `unauthorized`/`forbidden`，语义成立要求请求携带 `Authorization` 头——用户刚输入的密码经 probe 桥（JS→Kotlin WebMessage port）传给原生 probe，Kotlin 侧拼 `Basic base64("opencode:" + password)`。边界纪律：

1. **头不进日志**：请求头（含 Authorization）零日志；URL 与查询参数零日志；日志仅固定 tag + op 名/计数器（Kotlin 与桥两侧同律）。
2. **不持久化**：密码仅存在于桥消息与 probe 请求的内存生命周期内，probe 侧零写盘、零 SharedPreferences；probe 响应只回 `{code}` 分类码，无自由文本、无回显值。
3. **桥消息零日志值**：ProbeBridge 入站/出站消息不记值，仅记形状裁决结果（与 vault 桥同一纪律）。
4. **probe 桥自身的信任边界**：①`postWebMessage` 的 targetOrigin 由平台执行，非目标 origin 收不到 transferred port；②port 引用限制在对应 JS transport 闭包；③ack 前 native 不受理 probe 操作。probe 与旧 vault WebMessageChannel 协议曾通过独立握手串隔离；issue #58 vault 已改为 AndroidX origin/frame-bound listener v2，两者不再共享握手或生命周期。以上描述只适用于 probe 自身，不代表 vault v2 的安全机制。
5. **probe 时序**：`onPageFinished` 开新握手轮；未收 ack 的重试**重建通道**（已转移的 port2 不可重投）；有界重试 5×500ms；耗尽后 probe 显式 `unavailable`（见 D4）。

## D3 明文 HTTP：裁定变更

历史裁定：issue #5 原本不支持远端明文 HTTP，netsec 仅对回环放行；逐连接知情授权曾列为前瞻方案。

已批准的变更：**Android 将允许远端 HTTP 直连**，包括局域网地址；不再把远端明文一律阻断作为目标。`normalizeServerUrl` 裸地址默认补 `http://` 的上游行为不变。HTTP 不加密，Basic 认证凭据及其他通信内容可能被网络上的第三方读取或篡改；建议使用 HTTPS 或 SSH 隧道。此处不预设逐连接授权界面已实现。

TLS 证书与主机名校验、system CA 信任锚不变；D1 的 HTTPS→HTTP 降级拒绝仍适用。Android HTTP 直连及相关路径**待真机验证**，不声称已验证可用。

## D4 错误分类层落点

三层各司其职：

| 层 | 职责 | 承载 |
| --- | --- | --- |
| probe（壳侧分类器） | 传输层失败原因分类（TLS/明文/拒连/超时/DNS/401/403/404/HTML），仅用于**错误文案选择** | `packages/mobile-hosts` `probe.ts` 端口 + Android `DirectEndpointProbe` |
| secure-fetch（JS 卫生层） | 重定向跨主机/降级 fail-closed、userinfo 拒发 | `secure-fetch.ts`（connection-platform-fetch-policy）+ `destination.ts` 校验（attachments-upload-redirect-policy） |
| 上游健康检查（权威） | 真实连通性/版本/认证判定，决定保存是否放行 | vendored `health.ts`（不动） |

- 分类经 `getMobileHosts().probe` 端口到达 UI；默认 **fail-closed stub**（恒 `unavailable`）→ connection-error-classification 显式退化为上游泛化反馈（`dialog.server.add.error`），**绝不伪造分类**。真实 probe 经 app-connection-probe-bridge 注入（Android 桥 available 才可用）。
- 401/403：probe 分类 `unauthorized`/`forbidden`；认证刷新沿用上游 unauthorized 流 + #4 的 connection-remember-credential/connection-credential-hydration 链路（重输/hydration），不另起炉灶。
- **诚实边界：会话中期的逐因分类不在本期**。中期降级仍由上游 10s 健康轮询承载；本期覆盖连接建立/保存面（probe + secure-fetch + 健康检查）；中期逐因分类与恢复动作归后续迭代。
- probe 不可用是显式退化（泛化文案），不静默伪装成精确错误。

## CORS 证据链（G3 事实修正）

**来源表述（评审备注 F4）**：以下结论取自**上游 pin 提交树（采集缓存 `~/.cache/opencode-upstream` @ `cec70f3`/`b4525d79bf`）**的 `packages/server/src/cors.ts`，**不是** vendored 闭包树——vendored 闭包按策略不含 `packages/server`（手机不运行本地服务），该文件仅可从上游缓存读取。

事实：上游原生服务的 `isAllowedCorsOrigin` 默认放行任意 `http://127.0.0.1:*` 与 `http://localhost:*` origin（另有 `--cors` 配置扩展；PTY 铸票/升级与 MCP 的 `isAllowedRequestOrigin` 同白名单）。本壳 origin 恰为 `http://127.0.0.1:18090`，落在默认白名单内。因此：

- **预案 A（零配置）对原生上游服务成立**：API/SSE/WS（铸票与升级）/上传的跨源调用（含预检）默认允许，无需服务侧配置。
- 预案 B（本地反代）/C（平台适配层）仅对非原生/旧版/自定 CORS 策略的服务兜底，维持用户决策项。
- G3 设备级验证仍 **BLOCKED**（需真机 + 授权服务实测预检与实流）；静态证据已足够支撑把 G3 从「高风险无证据」修正为「低风险待实测」。
- 与桌面差异的事实保留：桌面 Electron 主进程的宽松 CORS 注入（`packages/desktop` @ pin）不在闭包内，与本壳无关；本壳依赖的是**服务端**白名单。

## 残余 fetch 面（评审备注 F2）

以下两处不经过 `platform.fetch`（因此不受 D1 校验），登记为已知残余面（详见 [../design/units/connection.md](../design/units/connection.md) 直连章节）：

1. `pairing.ts:87` `OpenCode.make({ baseUrl: url })`（配对码兑换；**无认证头**——兑换以一次性 code 换会话 token，请求本身不携带服务密码）；
2. `pairing.ts:129` `checkServerHealth(http, globalThis.fetch, …)`（配对地址优选；带 Basic 头、不经 D1 校验）。

out-of-scope 理由：跨源重定向子请求被浏览器剥头是规范强制的**底线**，D1 校验是**纵深**；这两处面仅存在于配对流（地址来自 `opencode pair` 链接，非用户手输服务器列表），泄漏不成立、静默跟随的内容风险窗口极小。登记不修补，后续如收敛配对流传输面再评估。

## 备选方案汇总

| 备选 | 裁定 | 理由 |
| --- | --- | --- |
| `redirect: "error"` | 否 | 伤害合法同源反代 |
| `redirect: "manual"` | 否 | `opaqueredirect` 不可读 |
| netsec 增 user anchors | 否 | 全局信任姿态变更 |
| 壳内 TLS 反代 | 否（推迟） | 体量不成比例 |
| trust-all / 自定义 TrustManager | **永不** | AGENTS.md 红线 |
| 自签/私有 CA 直连 | 本期不支持 | 三条出路见 D2；per-connection pin 为后续候选 |
| 明文 HTTP 直连 | 原不支持；已批准变更为 Android 将允许 | 明文凭据风险见 D3；真机待验证 |
| WS 弃用 ticket 改头 | 否 | 需同时 patch client+server；浏览器 WS 无法带头 |

## 状态

| 条目 | 状态 |
| --- | --- |
| D1/D-URL/D5/D2/D3/D4 代码承载 | `packages/mobile-hosts/src/transport|probe.ts` + connection-platform-fetch-policy/attachments-upload-redirect-policy/connection-error-classification/app-connection-probe-bridge 补丁（implemented，未经真机验证） |
| 设备级验证（G3 预检实测/G4 坏证书分类/G5 明文行为（原阻断口径已由 D3 变更）/G11 错误矩阵/G16 桥 bring-up/live E2E） | **BLOCKED** |
| 敏感信息 | 本文不含凭据、令牌或真实连接配置 |
