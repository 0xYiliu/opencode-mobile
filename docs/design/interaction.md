# 交互基线与设备门禁

本文承载跨单元交互约束、G1–G12 设备门禁完整枚举、失败路径处置协议与 memory-only notice。事实状态图例见 [README.md](README.md)。

## 交互基线

- 交互全部由上游 app（vendored 静态构建）承载，本轮壳层不新增自有交互控件；上游交互的可用性本身是门禁核验对象，不预声称。
- 壳层自有交互仅四项（均已实现、未验证，见 [units/shell-startup.md](units/shell-startup.md)）：返回键（`canGoBack` → goBack，否则结束 Activity）、SSL 错误处理（恒 CANCEL）、控制台日志（固定 tag，不含 URL 参数/请求头/凭据）、生命周期停止范围（仅本地回环 asset server）。
- 软键盘与视口：沿用上游 `viewport`（`interactive-widget=resizes-content`、`viewport-fit=cover`），见 [visual.md](visual.md)。
- 深链：不实现（未注册 VIEW intent-filter，代码留 TODO）。
- 返回手势：壳按 `onBackPressed` 实现并保持 `enableOnBackInvokedCallback` 未启用；预测性返回（OnBackInvokedCallback / androidx 迁移）为后续 issue 事项。此为 zero-androidx 约束下的实现口径，与计划中 onBackPressedDispatcher 表述的差异已记录（见 [docs/build-and-verify.md](../build-and-verify.md) 偏差表）。

## G1–G12 设备门禁（完整枚举）

每项列出验证目标、所需环境、当前状态。本轮全部 **BLOCKED：未执行**（无 Android SDK、无真机/模拟器、无授权远程服务；清单来源为 issue #2 验收项与计划 §5.2）。

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

补充 BLOCKED 项（非 G 组）：APK 构建（需 Android SDK，`cd android && ./gradlew :app:assembleDebug`）；live 直连 E2E（需授权服务与模型，不允许 fixture 替代）；SSH E2E（归 issue #6/#21）。

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
- **Keystore 安全持久化归 issue #4**：在 Keystore 方案交付并验证前，本 notice 是默认行为而非缺陷；上游界面不自带该提示，本条目前以文档为口径，App 内提示文案为后续事项。

该 notice 的真机核验（localStorage 负例、重启后行为）归 G9/G11。
