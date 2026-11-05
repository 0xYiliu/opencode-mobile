# 决策记录 0007：配对链接外部唤起不实施

本文记录 issue #71（D03：配对链接接入及扫码——外链唤起部分）的评估结论，并记录已确认的产品决策：**2026-10-31 用户确认不实施——(A) HTTPS App Links 结构性不可适用、(B) 自定义 scheme 不实施；激活条件（§4.2）保持在册，条件触发后按新工作单元开工**。§1–§8 的评估结论保持原样（全部为源码级与机制级裁定；评估边界见 §8）；决策状态与确认记录见 §9。相机扫码部分（D03 的另一半）已随 issue #71 实施（见 [../design/units/connection.md](../design/units/connection.md) 配对专节⑦），与本文互不依赖。

- 状态：已确认的产品决策（2026-10-31 用户确认）——**外链唤起不实施**（维持不实施）；激活条件 §4.2 保持登记
- 记录日期：2026-10-30
- 来源议题：[issue #71](https://github.com/0xYiliu/opencode-mobile/issues/71)（验收 2：「外链唤起：按批准方案实现或登记不实施理由」——本文即登记不实施理由的载体）
- 关联：[0002](0002-direct-connection-transport.md)、[0003](0003-ssh-transport.md)、[0005](0005-apk-update.md)、[0006](0006-voice-call.md)（结构先例；0006 §2.4-4 在册的「onPermissionRequest 媒体权限接线同型前提」已随 #71 相机扫码落地并回指本文无关面）、[../project-scope.md](../project-scope.md)、[../design/units/connection.md](../design/units/connection.md) 配对专节⑦-4、[../design/units/providers-models.md](../design/units/providers-models.md)（#14 OAuth 回跳同族候选）、[../alignment/windows-desktop/v2.2.1/matrix.md](../alignment/windows-desktop/v2.2.1/matrix.md)（D03、N06）、[../alignment/workflow.md](../alignment/workflow.md) §4/§5
- 事实基线：上游 v2.2.1 = `3ebcf9a32c7b28f658cfee80775448929361727a`；vendor pin = `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；本仓库基线 = origin/dev `9d7f459`（#67 已合并）。核对方法见 §7

## 0. 决策问题（workflow.md §4 五要素）

- **现状**：Android 壳未注册任何 VIEW intent-filter、未声明任何自定义 scheme——外部打开配对链接（`http(s)://<server>/auth/connect/<code>`）不会进入 App（manifest 唯一 LAUNCHER，注释逐字「deep links are not implemented (TODO in MainActivity)」）。上游自己同样零 scheme、零 deep link：上游六包 src 全域 `opencode://` 零命中（`scripts/verify-pairing.ts` 组 4 哨兵在册），桌面/CLI 的配对形态就是 QR + 复制链接；上游六包 src 亦无任何读取 intent 值的页面通道。粘贴导入是全功能等价路径（「粘贴+提交=显式确认」两步），相机扫码已随 issue #71 接入（同一兑换路径的第二个输入源）。
- **差距**：「在聊天 App/浏览器里点一条配对链接直接唤起 App 进入导入表单」的形态在移动端不存在。这是**非对齐缺口**（D03 行登记的能力缺项之一），但其上游形态本身也不存在——上游没有任何 deep link 可供对齐，落法是纯第一方发明。
- **可行方案**：三案——(A) HTTPS App Links（autoVerify 域验证）；(B) 自定义 scheme（如 `opencode://pair?...`）；(C) 维持不实现 + 粘贴/扫码路径承载。逐案对比见 §3。
- **影响**：产品范围（配对链接的唤起面）、安全与信任模型（隐式唤起引入「第三方可触发的配对 payload 注入」面，§6）、实现规模（(B) 需 vendor 补丁 + 壳 VIEW 处理 + 三座在册哨兵反向 + 新门禁项，§3）、上游关系（纯移动发明须差异登记）。
- **推荐**：**(C) 维持不实现**——(A) 结构性不可适用（机制性，非暂缓）；(B) 可行但为独立 issue 体量且引入新的信任面；(C) 现状与上游一致、粘贴/扫码已承载全部功能。**最终决策留用户拍板**（§9.3）；本文登记激活条件（§4.2）与最小安全形态设计草图（§5），条件触发后按新工作单元开工，无需重走可行性核对。

**送达载体（F-4）**：本节即决策问题的完整呈现；协调员提交 PR 时，以同样的五要素形态把决策问题写入 PR 描述送达用户。用户拍板后的落法见 §9.3（小提交路径）。

## 1. 目标语义：deep link 唤起意味着什么

配对链接的完整形态是 `http(s)://<server>/auth/connect/<code>`（§0 现状；`pairingLink` 四层校验的输入）。「外链唤起」= 用户在任意 App（聊天、浏览器、二维码扫描器）中点按/打开该链接时，Android 以 VIEW intent 交给本壳，壳把 payload 带入导入表单。两件事实决定这一形态的落点：

1. **链接的 host 是无界集合**：`<server>` 是用户自管服务器或其隧道域（OpenTunnel 域名、自建域名、LAN 地址、IP:port）——不存在一个固定的、可由本 App 声称所有的域。
2. **QR 载荷与链接形态是两回事**：QR 里是 `{"code","urls"}` JSON（`uqr renderSVG(JSON.stringify({ code, urls: [tunnel] }))`），链接是它的 `urls[]` 投影。任何 scheme 化（`opencode://...`）到该形态的映射都是第一方发明，上游没有可对齐的语义。

## 2. 移动端现状（pin `b4525d79` / vendored 树 + 第一方壳 @ `9d7f459`）

1. **壳层零 deep link 面**：`AndroidManifest.xml` 唯一 LAUNCHER intent-filter（注释在册）；`MainActivity.kt` 头注 TODO「deep links (no VIEW intent-filter is registered)」与 `onNewIntent` 注释「never an external deep link」在册；零自定义 scheme 处理。三座在册哨兵把这一状态锁为回归守卫：`verify-pairing.ts` 组 3（manifest 零 VIEW intent-filter + onNewIntent 仅允许 pendingRoute 内部路由锚）、组 4（六包 src `opencode://` 双零）、`verify-notifications.ts` 组 6（零 VIEW + deep-links 注释锚）。**外链唤起不实施，这些哨兵原地保持为守卫（改语义不改断言）**。
2. **上游零 scheme、零 deep link**：六包 src `opencode://` 零命中（哨兵即证）；上游配对流以 QR + 复制链接为形态，桌面侧点按消息内链接的行为是「同窗导航至远端 web app」（connection.md ⑦-5），不是导入流。
3. **替代路径已全功能在册**：粘贴导入（issue #22 收口）+ 相机扫码（issue #71 接入，qr-scanner 扫描同一 QR 载荷）。两者终点都是同一兑换链（四层校验 → 有界兑换 → 健康检查 → 注册表写入）。
4. **#14 OAuth 回跳同族**：providers-models.md 在册的 OAuth 回跳（移动适配候选）与外链唤起共享「壳层 VIEW 基建」这一前置——若该族获批实施，VIEW 基建可复用，本文 (B) 的边际成本下降（§4.2 激活条件之一）。

## 3. 三案对比

| 维度 | (A) HTTPS App Links | (B) 自定义 scheme | (C) 维持不实现（推荐） |
| --- | --- | --- | --- |
| 机制前提 | App 对**固定域名**做 `assetlinks.json` 域验证（网站证明 App 归属） | manifest 声明 scheme intent-filter（零验证、零域证明——任何 App/网页可发起） | 无 |
| 对配对域模型的适配 | **结构性不可适用**：配对链接域 = 用户自管服务器/Tunnel 域（无界集合），App 无法声称他人域；引入第一方中转域则把项目置于配对路径（新基础设施 + 新信任面）——N06「手机不作配对服务提供方」已排除邻近形态，发行/更新基础设施本身待 [ADR 0005](0005-apk-update.md) 决策 | 适配（scheme 无域概念），但**纯移动发明**：scheme→`http(s)://<server>/auth/connect/<code>` 的映射是第一方发明；语义分歧须差异登记 | 与上游一致（上游自己零 scheme 零 deep link） |
| 实现规模 | 不适用 | vendor 补丁（页面侧新增读 intent 值的通道——**该通道今天不存在**）+ 壳 VIEW intent-filter 与 payload 传递 + ≥3 座哨兵反向（verify-pairing 组 3/4、verify-notifications 组 6）+ ≥6 处文档事实锚改写 + 新门禁项——**独立 issue 体量** | 零代码；本文 + 文档行 + 真机负例（QA-8：VIEW intent 不唤起、`opencode://` 无解析目标）即闭环 |
| 信任模型 | 域验证给出「链接确实属于声明的 App」证明——但对无界用户域无意义 | 无验证：§6 的注入面完整存在，缓解措施全部是尚未存在的页面通道（vendor 补丁） | 无新增信任面；粘贴（用户显式动作）与扫码（用户取景动作）都是显式确认链 |
| 用户价值 | — | 「点链接直达」，少一次复制/切换 | 粘贴/扫码多两步人工动作（已可接受：上游形态即如此） |

## 4. 决策框架与激活条件

### 4.1 推荐（最终决策归用户）

**(C) 维持不实现**。理由：

1. **(A) 机制性排除**（非暂缓）：App Links 的域验证模型与「链接域 = 用户自管服务器」的结构正交，无适用形态；第一方中转域被 N06 邻近排除。
2. **(B) 的成本/收益比不足以在本期承载**：独立 issue 体量（§3），且其新增信任面（§6）的缓解措施全部依赖尚未存在的页面通道——先建通道再谈缓解，等于为一个用户尚未确认想要的形态预铺 vendor 面。
3. **(C) 无功能损失**：上游产品本身不含 deep link 形态；粘贴 + 扫码覆盖全部导入场景（扫码已随 #71 落地，QR 取景即「点链接」的最接近无 friction 形态）。

### 4.2 激活条件（登记）

满足任一条即按 §5 前提清单以**新工作单元**开工（本文不再重评审）：

1. 用户确认要「聊天 App 里点链接直达导入表单」的产品形态（拍板 (B)）。
2. #14 OAuth 回跳族（移动适配候选）获批实施——同壳层 VIEW 基建届时已存在，(B) 的壳面边际成本降为 intent-filter 声明 + payload 白名单；但 vendor 通道与哨兵反向仍按 §3 独立核算。

## 5. 最小安全形态设计草图（若用户批准实施 (B)；本模块不实施）

- **壳面**：VIEW intent-filter 仅声明自定义 scheme（零 host 限定、零 autoVerify）；MainActivity 对 VIEW intent 的处理=仅提取 payload、形状预检后带入表单，**零自动兑换、零网络动作**；payload 不进日志（零值日志纪律）。
- **页面通道（vendor 补丁）**：表单仅 **prefill**——链接/地址字段带入草稿态，地址在表单内**可见可改**；兑换仍仅由「粘贴+提交=显式确认」同款的两步提交触发（提交按钮）；`pairingLink` 四层校验前置不变（scheme 白名单、userinfo/search/hash 拒绝、CODE 正则、路径白名单）；legacy `/connect#` 照拒。
- **登记面**：差异登记（scheme 语义为纯移动发明）+ verify-pairing 组 3/4、verify-notifications 组 6 三哨兵反向为新形态守卫 + ≥6 处文档事实锚改写（connection.md ②⑦-4、interaction.md、shell-startup.md、providers-models.md、notifications.md、project-scope.md）+ 新增门禁项（真机唤起矩阵：正例、伪造 payload、非配对路径、权限外 payload）。
- **不做的变体**：不做 App Links（§3 (A) 结构性排除）；不做「剪贴板静默检测配对链接」类更激进形态（零被动导入红线）。

## 6. 信任模型分析（恶意链接注入配对 payload）

- **威胁**：任意 App 或网页可发起 VIEW intent（自定义 scheme 零验证、零域证明）。payload 指向攻击者服务器 → 用户被引导「连接」到恶意 OpenCode 服务。
- **边界事实**：配对码单次、服务端签发（`packages/server/src/pairing.ts` 引缓存交叉证据：`TTL = Duration.minutes(5)` + `consume = Cache.invalidateWhen(...)`）——**伪造 payload 的兑换必然失败**（invalid/expired）；成功兑换意味着攻击者确实运行了真 opencode 服务并完成了配对——后果等价于用户手工输入该地址。客户端凭据纪律（memory-only + vault、TLS 校验、明文阻断、秘密不经日志/剪贴板/历史）**不受 deep link 影响**。
- **结论**：注入风险主要是**社会工程/混淆**（诱导用户连接攻击者的服务），不是密钥窃取；与粘贴的信任差在于**动作显式性**——粘贴是用户显式动作（来源可知），深链是隐式唤起（来源不可知、可由第三方触发）。若实施，§5 的 prefill-only + 可见可改 + 两步确认即针对该差的最小缓解。

## 7. 风险与关联

- **哨兵反转成本**：(B) 实施时 verify-pairing 组 3/4 与 verify-notifications 组 6 三座哨兵从「不实施守卫」反向为「实施形态守卫」——反向是完整重构（断言、负例、PASS 汇总、修订登记四处同改），不是删断言。
- **0006 回指**：0006 §2.4-4 曾把「onPermissionRequest 媒体权限接线」登记为 #71/D03 同型前提——该前提已随 #71 相机扫码落地；语音通话（0006）未来实施时复用同一 `CameraGrantPolicy` 资源白名单骨架，但本 AE 决策（外链唤起）与语音面互不依赖。
- **上游漂移**：全部引用锚定 `3ebcf9a`（v2.2.1 口径）与 pin `b4525d79`，不做 HEAD 跟踪；上游若未来引入 scheme，本评估按新事实重开。
- **决策越权风险**：本文状态=提案，推荐意见（§4）与决策问题（§0）分节呈现，不代用户拍板；matrix D03 行内固定「决策待用户」字样。

## 8. 诚实边界

- **外链唤起零实施、零代码**：本期全部交付为本文 + 受影响文档行 + 真机负例（QA-8：`adb shell am start` VIEW intent 不唤起 App、`opencode://` 无解析目标）；无 manifest/MainActivity/vendor 任何改动指向 deep link。
- **三案裁定为文档级评估**：(A)/(B) 的机制事实以源码与公开平台语义为据（assetlinks.json 域验证模型、scheme 零验证），未做任何唤起原型或设备正例实验；真机证据只有 (C) 的负例。
- **信任分析边界**：§6 是机制级推理（单次码语义 + 客户端凭据纪律），非渗透测试；「社会工程风险」的量级未做用户研究。
- 本文不含凭据、令牌、私钥或真实连接配置。

## 9. 状态

### 9.1 状态表

| 条目 | 状态 |
| --- | --- |
| 本文（ADR 0007） | **已确认不实施（2026-10-31 用户确认）**；外链唤起维持不实施 |
| 矩阵 D03 | 「相机扫码已实现（issue #71）+ 外链唤起已确认不实施（本文，2026-10-31）」已决态（已落矩阵行）；证据 E26 |
| 哨兵姿态 | verify-pairing 组 3/4、verify-notifications 组 6 保持零 VIEW/零 scheme 断言为**回归守卫**（不实施状态的漂移哨兵）——不变 |
| 推荐 | (C) 维持不实现；激活条件 §4.2；若拍板 (B)，§5 为实施单元的最小安全形态输入——**该推荐即被确认的决策** |

### 9.2 决策问题送达

本文 §0 + PR 描述（协调员按 workflow.md §4 五要素形态向用户提出，F-4）。

**确认记录（2026-10-31）**：决策问题已按上述载体送达用户；用户确认**不实施**——维持推荐 (C)：(A) App Links 结构性不可适用、(B) 自定义 scheme 不实施，激活条件（§4.2）保持在册。落法见 §9.3 确认记录。

### 9.3 拍板后路径（小提交）

- **用户确认维持不实现**：一次小提交把本文状态改「已确认不实现（依据用户拍板）」+ matrix D03 行「决策待用户」字样更新为已决态；哨兵与文档行不变。
- **用户批准 (B)**：本文状态改「已接受（方案 B）」；实施按 §5 前提以新工作单元开工（完整实施流程：计划→评审→隔离工作树→实现→评审→PR）；本文不就地扩张为实施记录。

**确认记录（2026-10-31，按上列「用户确认维持不实现」路径执行）**：本文状态改「已确认不实施（依据用户拍板，2026-10-31）」；矩阵 D03 行「决策待用户」字样已更新为已决态（外链唤起已确认不实施）；verify-pairing 组 3/4、verify-notifications 组 6 三哨兵与各文档行保持不变，继续作为不实施状态的回归守卫。
