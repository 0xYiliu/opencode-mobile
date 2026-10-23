# 交互基线与设备门禁

本文承载跨单元交互约束、G1–G15 设备门禁完整枚举、失败路径处置协议与 memory-only notice。事实状态图例见 [README.md](README.md)。

## 交互基线

- 交互全部由上游 app（vendored 静态构建）承载，本轮壳层不新增自有交互控件；上游交互的可用性本身是门禁核验对象，不预声称。
- 壳层自有交互仅四项（均已实现、未验证，见 [units/shell-startup.md](units/shell-startup.md)）：返回键（`canGoBack` → goBack，否则结束 Activity）、SSL 错误处理（恒 CANCEL）、控制台日志（固定 tag，不含 URL 参数/请求头/凭据）、生命周期停止范围（仅本地回环 asset server）。
- 软键盘与视口：沿用上游 `viewport`（`interactive-widget=resizes-content`、`viewport-fit=cover`），见 [visual.md](visual.md)。
- 深链：不实现（未注册 VIEW intent-filter，代码留 TODO）。
- 返回手势：壳按 `onBackPressed` 实现，manifest 显式声明 `android:enableOnBackInvokedCallback="false"`——Android 16 起 targetSdk ≥ 36 的应用默认启用 predictive back，`onBackPressed` 将不再被调用，必须显式禁用才能维持该行为；迁移平台 `OnBackInvokedCallback` 需 minSdk 守卫（API 33+），为后续 issue 事项。与计划中 onBackPressedDispatcher 表述的差异已记录（见 [docs/build-and-verify.md](../build-and-verify.md) 偏差表）。

## G1–G15 设备门禁（完整枚举）

每项列出验证目标、所需环境、当前状态。本轮全部 **BLOCKED：未执行**（无 Android SDK、无真机/模拟器、无授权远程服务；清单来源为 issue #2 验收项、计划 §5.2 与 issue #3 新增交互）。

| 门禁 | 验证目标 | 所需环境 | 状态 |
| --- | --- | --- | --- |
| G1 assets 加载 | 打包资产经回环 asset server 完整加载：首帧、懒加载分块（dist 内 1568 个 js 分块）、字体/图标/媒体（ttf/woff/woff2/aac/png/svg） | 真机或模拟器（Android 10+，记录 WebView 版本） | BLOCKED |
| G2 loopback origin 行为 | `http://127.0.0.1:18090` 作为 origin 的 secure context 判定、localStorage 可用、未知路径回落 index.html（SPA 路由回退） | 真机或模拟器 | BLOCKED |
| G3 actual CORS | 对远程服务的真实预检（OPTIONS）与带 `Authorization` 头的跨源请求；高风险项，预案 A/B/C 见 [architecture.md](architecture.md)，任一预案启用需用户决策 | 真机/模拟器 + 可配置 CORS 的授权远程服务 | BLOCKED |
| G4 TLS/证书拒绝 | 自签名/过期/主机名不符证书被拒绝并有反馈路径；`onReceivedSslError` 恒 CANCEL 的真机复核 | 真机/模拟器 + 证书可控的远程服务 | BLOCKED |
| G5 cleartext 拒绝 | 对非回环地址的 `http://` 请求被 network_security_config 阻断且失败可见（回环口除外） | 真机/模拟器 + 局域网 HTTP 服务 | BLOCKED |
| G6 fetch ReadableStream/SSE 增量 | 事件流经 fetch 流式读取在 WebView 内增量到达（会话事件实时性） | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G7 WebSocket 二进制 PTY | 终端 PTY 经 WebSocket 二进制双向传输（含 resize 消息）；上游实现位于 vendored `packages/client/src/solid/pty.ts` | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G8 WASM/Office 加载 | dist 内 4 个 `.wasm` 资产（ghostty-web 相关）及其他重型资源在 WebView 内可加载执行 | 真机/模拟器 | BLOCKED |
| G9 生命周期 + 凭据负例 | 切后台/杀进程/旋转的生命周期行为；负例：localStorage 中检索不到 password（M-002 落地）、memory-only 符合下方 notice | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G10 PWA SW 行为 | 打包构建生成的 service worker（`sw.js`）在回环 origin 的注册、缓存与更新行为 | 真机/模拟器 | BLOCKED |
| G11 负例矩阵 | 认证失败、不兼容 server（上游含 incompatible-server-panel UI）、证书错误、断网/切网——均有反馈且可恢复，不静默 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G12 生命周期恢复口径 + 断开不杀远程 | 恢复口径与壳层「不停止远程」红线在真机一致：客户端断开/退出后远程任务存活 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G13 多 host 一窗 + 隔离（issue #3） | 多个 SSH/直连服务同窗并列：列表呈现、切换、scope 隔离（同名项目/会话不混淆）；设置 servers 标签页 host-manager 可用 | 真机/模拟器 + 授权远程服务 | BLOCKED |
| G14 连接状态呈现与恢复（issue #3） | connecting/host-key 确认/认证失败/incompatible/offline/reconnecting/connected 的用户可见呈现与可操作恢复（重试/重认证/编辑）；SSH incompatible 由状态机判定 | 真机/模拟器 + 授权远程服务（host-key 真实流另归 #6） | BLOCKED |
| G15 SSH 身份稳定（issue #3） | SSH 隧道端口变化后身份/scope/会话/设置不变（`mobile-ssh:<uuid>` 与端点解耦）；重启后主机记录恢复且无凭据形字段 | 真机/模拟器 + SSH 远程主机 | BLOCKED（依赖 #6 隧道） |

补充 BLOCKED 项（非 G 组）：APK 构建（需 Android SDK，`cd android && ./gradlew :app:assembleDebug`）；live 直连 E2E（需授权服务与模型，不允许 fixture 替代）；SSH E2E（归 issue #6/#21）；host-key 真实校验流（归 issue #6）；SSH 凭据引用真实解析（归 issue #4）；SSH 端口变化真机验证（归 #6 配合 G15）。

## 失败路径处置协议

任一门禁运行失败时，按以下顺序处置，不得跳步：

1. **复现失败报告**：可复现步骤、设备/API/WebView 版本、脱敏日志（不含凭据、不含 URL 查询参数）。
2. **影响范围**：明确失败影响哪些单元与验收项，哪些不受影响。
3. **备选方案**：列出可行替代（如 G3 的预案 A/B/C），含各自代价与安全影响；备选不得默认「原生重写」或「关闭浏览器/传输安全」。
4. **用户决策**：由用户选定处置后再继续产品化工作；未获决策前该路径停在那里并如实标注。

## memory-only notice（用户可见口径）

凭据在本阶段为 memory-only（M-002），用户须知晓并接受以下行为：

- **刷新或重启 App 后需重新输入服务密码**：密码只存在于内存，不写入任何持久化后端（localStorage、桌面存储、草稿存储均收不到）。
- **配对重连需重新认证**：连接中断后重连不能复用已落盘的凭据。
- **credentialRef 不是凭据（issue #3 扩展）**：主机记录与连接记录中的 `credentialRef` 是指向凭据条目的非机密引用标识符，随记录持久化；它**不携带任何凭据值**。重启后：直连需重新输入密码（同上），SSH 主机需重新解析引用（解析端口本期为 NullResolver，真实解析归 issue #4）——引用本身不会还原出凭据。
- **Keystore 安全持久化归 issue #4**：在 Keystore 方案交付并验证前，本 notice 是默认行为而非缺陷；上游界面不自带该提示，本条目前以文档为口径，App 内提示文案为后续事项。

该 notice 的真机核验（localStorage 负例、重启后行为）归 G9/G11。

## 主机管理交互（已实现（未验证）：issue #3；设备核验 BLOCKED，归 G13–G15）

- **host-manager（设置 → servers 标签页）**：SSH 主机列表（名称/target/状态徽标），行内动作：编辑（→ host-dialog）、删除、连接/重连；空态引导新增。删除为本地操作——**零远程调用**，远程服务/任务不受影响（红线，测试断言）；删除活跃主机不弹「停止远程」类操作。
- **host-dialog（SSH 主机新增/编辑）**：字段 name（唯一校验，重名行内报错不写入）、target（格式校验 `[user@]host[:port]`）、credentialRef（引用标识输入，**不是密码输入**——界面不接收凭据值）；保存前校验失败保留表单；**保存/健康检查失败保留原配置**（不写入注册表）。取消/关闭不产生任何变更。
- **取消切换语义**：连接发起后取消（connect 过程、host-key 确认、重连过程）恢复进入前的来源态（idle 或 offline），无残留副作用（状态机 T13，测试锁定）。
- **host-key-prompt（stub）**：状态机进入 hostKeyUnverified 时展示指纹确认；当前 stub 恒拒绝——确认 UI 组件已立桩但**挂载点未建**（无任何界面渲染它），在本构建不可达（真实校验与挂载归 #6，BLOCKED）；**不存在"跳过校验"选项**。
- **已知入口缺口（M-008）**：上游多 server 布局下，设置导航以 per-server 条目取代 "servers" 标签页，host-manager 在该布局不可达（单 server/空列表布局可达，且空列表时可创建首个 SSH 主机）。补齐导航入口归后续 issue，先以 G13 真机核对实际布局。
- **断开语义**：ready 态的「断开」走状态机 T13（cancel）：恢复来源态 idle、清空内存端点，零 transport 调用；「删除」走 T14：仅删本地记录，零 transport 调用。两者均不向远程发出任何信号（红线，单测断言）。
- **状态可见性**：SSH 主机行状态由状态机映射的上游 ServerState 呈现（starting/auth/ready/failed/incompatible）；offline/reconnecting 有明确反馈与恢复入口（重试/编辑/删除），不静默（G14 真机核验）。
