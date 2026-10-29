# 决策记录 0003：SSH 传输、host-key 校验与隧道

本文记录 issue #6（内建 SSH 认证、host-key 校验与隧道）的库选型、桥架构、host-key 方案、认证方案与失败分类裁定。裁定以文档承载；除文末状态表外，本文不声称任何功能已在真机可用。

- 状态：已确认的技术裁定（**全部代码为静态实现（未验证）**；设备级验证 BLOCKED——最终边界断言依赖 G17 三桥 bring-up + SSH 端到端，见文末"验收⑤条件句映射"）
- 记录日期：2026-10-24
- 来源议题：[issue #6](https://github.com/0xYiliu/opencode-mobile/issues/6)
- 关联：[0001](0001-wsl-exclusion.md)、[0002](0002-direct-connection-transport.md)、[../design/units/connection.md](../design/units/connection.md)、[../design/architecture.md](../design/architecture.md)、[../design/interaction.md](../design/interaction.md)

## 1. SSH 库选型

裁定按实现位置分层：**SSH 库只进入 Android 桥（Kotlin）**，共享层（`packages/mobile-hosts`）零平台 API、零 SSH 依赖——端口语义（`HostTransport.open` / `HostKeyVerifier.verify`）与 fail-closed stub 保持不变，真实实现经第三座 WebMessage 桥接入。

| 候选 | 裁定 | 理由 |
| --- | --- | --- |
| ① JS 层（ssh2 等） | 否 | ssh2 依赖 Node `net`/`tls`，浏览器侧无运行时；浏览器 WASM SSH 仅实验性、端口转发成熟度不足；WASSH 绑定 Chromium 专有 API；WebSocket→SSH 网关=变相跳板机，违反验收 3 |
| ② **com.github.mwiede:jsch（JCraft JSch 0.1.55 活跃 fork）** | **采用** | 纯 Java、零强制运行时依赖；支持 rsa-sha2-256/512（RFC 8332）、ecdsa、aes-gcm/ctr、ecdh、dh-group14/16/18-sha256；OpenSSH 新私钥格式（bcrypt KDF）+PEM+口令加密私钥均支持；fork 直用 BC 低层类规避平台混淆 BC 的 provider 冲突（mwiede issue #77） |
| ③ sshj | 备选（不采用） | Apache-2.0 但依赖面大（netty 系） |
| ④ MINA SSHD | 否 | 体积不成比例 |
| ⑤ Ganymed-ssh2 | 否 | 停更、无新密钥格式 |
| ⑥ 外部 ssh 二进制 exec | 否 | 设备端引入可执行依赖、超出平台适配边界 |

**BC 补齐的必要性**：curve25519-sha256（KEX）、ssh-ed25519/curve25519（主机密钥与用户密钥）、chacha20-poly1305 需 BouncyCastle——minSdk 29–32 的 JCE 缺 XDH（X25519 密钥协商）与 Ed25519 签名，不补 BC 则主流现代密钥（ed25519 私钥导入）在 API 29–32 上不可用。Android 13（API 33+）平台自带后仍统一走 BC 路径（行为一致性，不为版本分叉算法集）。

### 依赖与实测许可数字（F3，2026-10-24 对 Maven Central 实测）

| 依赖 | 版本 | jar 实测字节数 | 许可（POM/官方） | 审计判定 |
| --- | --- | --- | --- | --- |
| `com.github.mwiede:jsch` | 2.28.8 | 716,757（≈717 KB） | **Revised BSD ×2**（POM：主许可 + JZlib；另随源码捆绑 jBCrypt，ISC） | 宽松，登记不 STOP |
| `org.bouncycastle:bcprov-jdk18on` | 1.80 | 8,682,747（≈8.7 MB；R8 可裁） | **Bouncy Castle Licence**（MIT 改编，bouncycastle.org/licence.html） | 宽松，登记不 STOP |

许可均宽松，不触发 V4 审计停点；按纪律登记于 `android/app/build.gradle.kts` 依赖行注释与 `docs/build-and-verify.md` Android 第三方依赖表。NOTICE 生成仍受 V4（12 项既有待决策项）阻塞，不受本轮影响。实施中发现任何许可不符或传染性 → 立即停止并交用户决策（候选替换：sshj）。

## 2. 桥架构（第三座协议隔离桥）

SSH 的 request/response 仍使用独立的 WebMessageChannel（`opencode-mobile-ssh-handshake`、JSON+requestId、单 worker executor、零值日志）；native 不再在 `onPageFinished` 抢先发送该握手。JS entry 模块同步安装 window message listener 后，通过独立 AndroidX `WebMessageListener` bootstrap 请求 native 创建 channel。bootstrap feature 不可用时 fail-closed；native 对每条 bootstrap 消息校验精确 loopback origin、scheme/port/userinfo 与 `isMainFrame`，再按 existing 5×500ms budget 重建传输端口；该端口仍须收到 ack 才开放 SSH operations。Bootstrap object/marker 与 vault/probe/channel protocols 隔离；其余两桥生命周期不受 SSH bridge 影响。

```text
JS entry 同步安装 listener 并请求 AndroidX bootstrap（`opencodeMobileSshBootstrapV2`）
  → native origin/frame gate 后 postMessageChannel（严格 `opencode-mobile-ssh-handshake`）
  → JS captures port + ack；无 ack 则 fail-closed
JS runtime.attemptOpen（packages/mobile-hosts/src/runtime.ts）
  → resolver.resolve(credentialRef)                # vault-backed，内存值
  → HostKeyVerifier.verify({host})                 # SshBridgeHostKeyVerifier（默认=stub fail-closed 不变）
  → HostTransport.open({target,credential,pinnedFingerprint,signal,onEvent})
       ↕ 第三桥（AndroidX origin/frame bootstrap + 独立 SSH channel）
Kotlin：SshTunnelBridge.kt（ProbeBridge 协议隔离镜像）
  → SshTunnelManager.kt（JSch Session）
      · StrictHostKeyChecking="yes"（永不禁用校验）：scan 会话=默认空库抛出后读 session.hostKey；
        认证会话=自实现 HostKeyRepository 权威比对
      · 认证：publickey → password → keyboard-interactive（次序固定）
      · setPortForwardingL("127.0.0.1", 0, "localhost", servicePort)
  → SshHostKeyStore.kt（filesDir/ssh/known_hosts）
  → SshErrorCode.kt（四层失败分类码镜像）
回环动态端口（内核分配）→ endpoint = http://127.0.0.1:<dynPort>
```

- **listener 绑 `127.0.0.1:0`**（内核分配本地回环端口）；转发目标**固定远端回环 `localhost:<servicePort>` 单跳**——不开放任意转发、不设跳板机/ProxyJump/ProxyCommand/WSL/设备端服务（负断言入 `scripts/verify-ssh.ts`）。
- **生命周期红线（F8① 精确表述）**：disconnect/T13/T14/onDestroy → 桥 cancel/disconnect → `session.disconnect()` + 关本地 listener——**仅拆 SSH 传输（SSH_MSG_DISCONNECT），远端 OpenCode 进程存活**；零远程服务信号、零任务停止（Kotlin 注释 + connection.md + interaction.md 三处双写）。
- **掉线检测**：JSch 无一等掉线回调——manager 以有界看护线程周期检查 `session.isConnected` + `ServerAliveInterval` 心跳；判定掉线 → `{type:"connectionLost"}` → 状态机 T9 offline。**掉线检测只影响客户端重连，从不断开远端。**
- **upstream 镜像扩展**：`ExtensionConnection` 增可选 `reconnect`（async(signal) => ensureTunnel：端点重解析，隧道换端口后上游 health 重新探测）/`connect`（async() => attemptOpen 后轮询至 ready/失败，供上游 authenticate/authRequired 行内登录）——上游 `client.tsx` effect 监听 `http.url`/`password` 变化自动 `transport.update`，端点注入即生效。形状镜像为可选字段：上游读取时按存在性分支，不破坏既有直连侧。

## 3. host-key 方案

### 3.1 存储裁定：普通私有文件，非 vault

`SshHostKeyStore` 管理 `filesDir/ssh/known_hosts`，**OpenSSH 行格式**（`host keytype base64`；非默认端口为 `[host]:port` 形态）：

- **host key 是信任锚，不是凭据**：机密性无要求（公钥材料），完整性由应用私有目录（filesDir，沙箱内）保证；vault 的 kind 白名单（password|privateKey）/确定性映射/credentialRef 语义全部错位，备选否决。
- **互通故事最强**：原生 OpenSSH 行格式可 `ssh-keygen -lf` 直接比对指纹；不做 hashed-hostname（明文主机名如实记录在应用私有目录；负断言禁止 hashed 行进入已知文件——`@` 开头哈希标记不可出现）。
- **备份排除**：`data_extraction_rules.xml`/`full_backup_content.xml` 增 `ssh/` 排除——防串设备携带旧信任状态（信任状态属于本设备）。

### 3.2 指纹格式（互通 OpenSSH documented 表示）

`SHA256:<base64_nopad(SHA-256(keyblob))>`——与 `ssh-keygen -lf` 输出逐字一致（base64 无 padding、`/`+ 原样）。纯函数双实现：TS（WebCrypto SHA-256）+ Kotlin（`MessageDigest`），`scripts/verify-ssh.ts` 固定向量锁定两侧一致（sha256:b64 是 OpenSSH 7.2+ 默认展示格式）。

### 3.3 决策流（凭据在指纹确认前不发出）

```text
verify({host}) →
  1. 桥可用性先行：不可用 → throw（bridge-unavailable）→ failed 显式文案；
     绝不误报 host-key-rejected（host-key 拒绝只来自 KEX 比对）
  2. 查 store：已知键匹配 → {action:"trust"}
  3. 未知 → 桥 fetchHostKey（仅 KEX key-scan，不认证，有界超时）→
     {action:"prompt", fingerprint}
  4. store 有记录但 KEX 呈现键不同 → {action:"reject"} + reason="changed"
     （HostKeyDecision 加可选 reason 字段，向后兼容）
prompt → T2（hostKeyUnverified）→ HostKeyPrompt 挂载（host-manager 行内 +
     runtime.fingerprintOf(id)）→ 用户确认 → T3 → open(pinnedFingerprint) →
Kotlin 校验 KEX 呈现键 == pinned → 写入 store（首次接受即存，先于认证）
失配 → fail-closed（host-key-changed，永不自动覆盖）
```

- **scan 机制契约（F2，勘误三对齐实现）**：`fetchHostKey` = 一次性 JSch Session + `StrictHostKeyChecking` 恒 `"yes"`——KEX 完成密钥捕获后 session 按 yes 抛 UnknownHostKeyException（**预期路径**不视为错误），随后读 `session.hostKey` 取得呈现键。**实现机制字节码层核验**（评审 B1 轮，对 Maven Central `com.github.mwiede:jsch` 2.28.8 jar javap/反编译，无需 SDK）：session 的 hostkey 字段赋值先于异常抛出，捕获路径成立。自实现 `HostKeyRepository` **不用于 scan**，仅用于**认证会话**的 KEX 权威比对（check 两参形态与 `NOT_INCLUDED`/`getKnownHostsRepositoryID()` 为 fork 2.x 现代化签名，javap 核验；**Kotlin 侧接口常量须限定书写** `HostKeyRepository.NOT_INCLUDED` 等——接口静态常量不进入实现类作用域，kotlin-compiler-embeddable 编译探针实证，评审 B1' 轮）。**scan 会话零认证材料**：不 setPassword、不 addIdentity、不经任何认证尝试；全部 connect/scan 路径显式超时。信任路径 Kotlin 仍以 store 为权威比对（纵深：即使 JS 侧状态漂移，native 比对兜底）。
- **变更=严格拒绝 + 显式安全恢复**：KEX≠store → 硬失败 `host-key-changed`，**永不自动覆盖**；恢复 UI = 显式危险确认（红色警示文案，说明"服务器主机密钥已变化"）→ `removeHostKey(target)` → 下次连接回未知指纹确认流。**无任何"跳过校验"/"仅本次信任"路径**（负断言在册：无 `StrictHostKeyChecking=no/ask`、无自动 add、无 `addHostKey` 绕过确认流的调用面）。
- **勘误一（实现期修订，已实现（未验证））——确认后的钉固 fast path**：store 只在钉固 open 时记录密钥，因此 T3 确认后的第二次 verify（再次 fetchHostKey）仍会得到 prompt → 永久重弹确认。驱动（`packages/mobile-hosts/src/runtime.ts` attemptOpen）据此对**机器上下文已持钉固指纹**的尝试跳过 verify 门、直接 `open(pinnedFingerprint)`，由 Kotlin 侧在 KEX 权威比对（失配 fail-closed）——即上流程图「确认 → open(pinnedFingerprint)」的直接落地。安全性论证：钉固指纹只能经 T2→T3 用户确认进入上下文（T4/T8/T13 均清除），钉固 open 由 Kotlin store 比对兜底；scan 会话仍零认证材料（凭据仅在钉固比对通过后的认证会话发出）。
- **勘误二（实现期修订，已实现（未验证））——服务层健康检查形态**：open 成功后的服务层权威判定为有界 GET `<endpoint>/api/info`（10s 超时、`redirect: "error"`）。端点是内核分配的 `127.0.0.1:<dyn>` 回环口（`parseBridgeEndpoint` 构造校验仅接受回环），URL 构造上不含 userinfo、重定向只可能是敌意构造故直接拒绝——因此不走 secure-fetch 的 validated-follow 封装而以更严格的 redirect:error + 回环限定承载同等防线；401/403 视为服务存活（服务认证归上游流），SSH 凭据不用于服务请求。

## 4. 认证方案

- **password**：vault kind=password（真值表 v3 语义不变）；Kotlin JSch 密码认证 + keyboard-interactive 同密码应答（支持矩阵登记）。
- **private key**：vault kind=privateKey **value schema 修订（#6 接管，兼容双形态）**：
  1. **裸 PEM/OpenSSH 文本**（issue #4 既有形态，不破）：首字符非 `{`，按原文交给 JSch `addIdentity`；
  2. **JSON 信封** `{"v":1,"key":"<密钥文本>","passphrase":"<可选>"}`：首字符 `{` 识别；**嵌入 key 必须过 PEM BEGIN 门**（`-----BEGIN ... PRIVATE KEY-----`），passphrase 仅在信封内携带。
- **passphrase 落点裁定（F10，三方案对比）**：

| 方案 | 描述 | 裁定 |
| --- | --- | --- |
| A. 注册表/记录字段 | passphrase 随 HostRecord 持久化 | **否**：秘密进白名单载荷，违反"载荷无凭据形字段"红线（passphrase 在 FORBIDDEN_INPUT_KEYS） |
| B. 独立 vault 条目 + 双 ref | passphrase 单独 put，记录持两个 credentialRef | **否**：registry 需加字段、双 ref 语义、连接中提示同步三处更差方案；孤儿面翻倍 |
| C. **与私钥同信封** | `{"v":1,"key":…,"passphrase":…}` 整体作为 privateKey 条目值入 vault | **采用**：同为 Keystore AES-GCM 保护；零 registry 字段、零双 ref、零连接中提示 |

- **导入流**：host-dialog 私钥文件导入后显示**可选** passphrase 输入位（可能加密时出现，不强制）；v1 导入时不试解密（不把 JSch 拉进 UI 进程），首次连接解密失败 → 显式 `ssh-key-decrypt-failed` → 重导入（已知限制如实登记）。
- **连接**：Kotlin 解析信封 → `addIdentity(name, keyBytes, null, passphraseBytes)`；认证次序 publickey、password、keyboard-interactive；`ssh-rsa`（SHA-1 签名）维持 fork 默认禁用（rsa-sha2-256/512 覆盖 RFC 8332 主机）。**密钥文本过桥同 #4 律**：JSON 单向一次、零日志（含 header）、零持久化、零回显；`FORBIDDEN_INPUT_KEYS` 不动（信封在 vault 值内部，注册表层不可见）。

## 5. 失败分类四层

`SshErrorCode`（14 码，Kotlin 枚举 + `codeName` 镜像 JS 线字符串，i18n `ssh.error.<code>` EN/ZH）：

| 层 | 触发（Kotlin 侧证据） | 码 | 状态机落点 |
| --- | --- | --- | --- |
| SSH 可达性 | TCP/DNS/超时（auth 前） | `dns` / `refused` / `timeout` / `unreachable` / `io` | T8 fail（编辑/重试可恢复） |
| SSH 认证 | `UserAuthException` / 私钥解密失败 | `auth-failed` / `key-decrypt-failed` | T6 authRequired → 行内编辑凭据 → T1 重连 |
| host-key | store 未知/变更/用户拒绝 | `host-key-unknown` / `host-key-changed` / `host-key-rejected` | T2 prompt / T4+T8（拒绝后无连接） |
| 隧道目标 | direct-tcpip 被远端拒（认证已成功） | `target-refused` / `forward-failed` | T8 fail，文案明示「SSH 认证成功但远端拒绝转发」 |
| 服务失败 | open 成功后健康检查失败 | `service-unreachable`；版本不符 → `markIncompatible` | T8 / T7 incompatible → 上游 IncompatibleServerPanel |
| 桥面 | 握手未 ack/耗尽/非 Android | `bridge-unavailable` | failed，显式泛化文案（probe 同律：不伪造分类） |

`bridge-unavailable` 显式退化泛化文案（与 probe unavailable 同律）；**probe/分类器不是权威**：open 成功后的有界 GET `<endpoint>/api/info` 健康检查为服务层权威，分类仅选文案。

## 6. 线程契约（F6）

| 路径 | 线程 | 契约 |
| --- | --- | --- |
| connect/scan/forward | 桥 executor 单后台线程（永不主线程） | **全部显式超时**（`Session.connect(timeout)` / scan 有界超时 / 健康检查有界 GET）；超时即失败分类，不悬挂 |
| cancel/disconnect/abort | **独立线程**（不排 executor 队列） | `Session.disconnect()` 跨线程安全（JSch 内部同步）；拆除**不依赖 executor 队列排空**——executor 忙于长连接时拆除仍即时 |
| 掉线看护 | 有界看护（ServerAliveInterval 心跳 + isConnected 周期检查） | 判定掉线 → connectionLost 事件 → T9；看护只读会话状态，零远程信号 |
| destroy（onDestroy） | 主线程调 destroy → 内部转独立线程 | executor shutdownNow + 会话 disconnect；与 vault/probe 桥同序（MainActivity 三桥接线） |

hostId 单例：同一主机同时至多一个活跃 Session；新连接先拆旧（cancel 本地拆除，零远程信号）；重连预算沿用状态机 RECONNECT_MAX_RETRIES=3，无无限重试循环。

## 7. 无跳板机边界（验收 3 的静态可验面）

- 转发目标**固定** `localhost:<servicePort>`（**远端**回环语义，F7），单跳；无 ProxyJump/ProxyCommand/`setProxy*` 调用面。
- 无 WSL 路径、无设备端 SSH 服务（手机不运行 OpenCode 服务，项目范围红线）。
- 负断言入册 `scripts/verify-ssh.ts`：`StrictHostKeyChecking=no|ask`、自动 add、`setProxy*`/`ProxyJump`/`ProxyCommand`、hashed hostname、scan 认证材料——命中即 FAIL。

## 8. 验收⑤条件句映射（F4）

验收⑤："Preserve the established SSH library/platform boundary **only if runtime gates pass**"。映射（三处文档落字，本文为第一处；另两处：connection.md SSH 传输节、interaction.md G17）：

- **BLOCKED 期间只声称"静态边界已实现（未验证）"**：库在 Kotlin 桥内、共享层零平台 API/零 Android import、端口语义与 stub fail-closed 保留、支持矩阵/失败 UI/安全评审三份文档随变更交付——均为静态级。
- **边界保持的最终断言依赖 G17（三桥并存 bring-up：ack 时序/cancel 响应/C1–C5、G14–G16 不受扰动复测）+ SSH E2E（真机 + 授权 SSH 主机 + 授权服务）**；任一门禁失败即按 interaction.md 失败路径处置协议处理，此时"边界已保留"的声称不成立。

## 9. 状态

| 条目 | 状态 |
| --- | --- |
| 选型/桥架构/host-key/认证/四层分类/线程契约 代码承载 | `packages/mobile-hosts/src/ssh|transport/*` + `android/.../ssh/*` + M-015（**已实现（未验证）**；本机验证=V-mh 212 单测（含 runtime-ssh 全流）、V-ssh 探针全模式 PASS、V2/V3/V-conn PASS；Kotlin 编译 BLOCKED 无 SDK） |
| 设备级验证（G17 三桥 bring-up、SSH E2E：auth 成败/未知/已知/变更三态/目标拒绝/服务不可达/incompatible 真服务/重连/远程任务存活） | **BLOCKED** |
| 敏感信息 | 本文不含凭据、令牌、私钥或真实连接配置 |
