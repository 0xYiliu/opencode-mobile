# 项目范围

本文记录已确认的产品目标，不代表功能已经实现，也不替代后续交互设计和技术方案。

## 当前事实

- 已建立独立 Git 仓库及初始化文档；上游前端闭包已引入 `vendor/upstream`（pin `b4525d79bf`，经 issue #27 更新演练推进），来源与补丁记录见 `vendor/upstream/PROVENANCE.md`。
- web 静态构建在本机可复现（bun 1.4.2；3480 个文件，共 153,316,573 字节，清单见 `web-dist/manifest.json`，issue #8 交付后 2026-10-25 刷新）。
- Android WebView 壳代码已实现（未编译验证）：构建环境无 Android SDK，`assembleDebug` BLOCKED。
- 尚无 APK；两种连接方式（SSH 隧道、服务地址直连）已实现（未验证，issue #5/#6）但未经设备端到端验证；远程项目、工作区与会话生命周期管理（浏览/选择远端目录、会话创建/打开/fork/重命名/归档/切换）已实现（未验证，issue #8）；设备门禁 G1–G19 全部未执行（见设计文档与 `docs/build-and-verify.md`）。
- 许可审计 BLOCKED：12 项待用户决策，`NOTICE-THIRD-PARTY.md` 尚未生成。
- 服务凭据默认 memory-only（M-002 补丁，刷新/重启需重新输入密码）；可选的安全记住已实现（未验证，issue #4）：Android Keystore（AES-256-GCM 信封 v1）加密落盘，元数据索引永不存值，无额外解锁，无明文回退，备份排除已实现（未验证）。
- 主机注册表已实现（未验证，issue #3）：第一方包 `packages/mobile-hosts/` 承载 SSH 主机记录（身份键 `mobile-ssh:<uuid>`、名称唯一、载荷白名单无凭据字段；issue #6 增 servicePort 白名单字段）与连接状态机；vendor 补丁 M-004…M-008 将其接入上游 app。直连服务仍走上游原生注册表，credentialRef（M-005/M-006）为非机密引用；可选记住与凭据管理器随 issue #4 交付（M-009/M-010 与 M-007 修订，`packages/mobile-hosts/src/vault/` + `android/.../vault/`）。设备级验证（G13–G15、C1–C5、live E2E）全部 BLOCKED。
- SSH 隧道传输已实现（未验证，issue #6）：内建 SSH（无外部 SSH App/跳板机）——密码/密钥认证（密钥导入经 #4 vault，口令与私钥同信封）、未知指纹显式确认（HostKeyPrompt 已挂载）、变更密钥严格拒绝+显式恢复、known_hosts 原生 OpenSSH 行格式（`filesDir/ssh/`，备份排除）、指纹与 `ssh-keygen -lf` 互通（固定向量）、本地转发到远端回环 `localhost:<servicePort>` 单跳、失败四层分类（可达/认证/隧道目标/服务）。SSH 库（jsch 2.28.8 Revised BSD + bcprov 1.80 Bouncy Castle Licence，均宽松、不触发 V4 停点）只在 Kotlin 桥内；共享层零平台 API；fail-closed stub 保留为无注入默认。裁定与支持矩阵/失败 UI/安全评审见决策 [0003](decisions/0003-ssh-transport.md)。**真机门禁全部 BLOCKED**（G17 三桥 bring-up、SSH E2E：auth 成败/未知/已知/变更三态/目标拒绝/重连/远程任务存活）。**勘误（issue #7 S5）**：本机 SDK 在位，Kotlin 编译已过真实工具链（`:app:compileDebugKotlin` PASS）；APK 打包仅阻塞于 jsch+bcprov jar 元数据冲突（待 build.gradle.kts packaging 决策）。
- 直连传输卫生与错误分类已实现（未验证，issue #5）：vendor 补丁 M-011…M-014（mobile 补丁总数 10→14；issue #6 增 M-015 后为 15）——validated-follow 重定向策略（跨主机/降级拒交付）、userinfo 凭据 URL 拒发、端点 probe 分类器（fail-closed stub 默认，Android 桥 ack 后可用）与 `dialog.server.error.<code>` 反馈；裁定（决策 [0002](decisions/0002-direct-connection-transport.md)）：TLS 信任=system CA 唯一锚（静态负断言在册，绝不 trust-all）、**明文 HTTP 直连本期不支持**、**自签/私有 CA HTTPS 直连本期不支持**（出路：正规 CA/SSH 隧道/per-connection pin 后续候选）。probe 桥 bring-up（G16）与错误矩阵端到端（G4/G5/G11）BLOCKED。
- 远程服务发现与显式授权的安装/启动/版本处理已实现（未验证，issue #7）：第四座协议隔离桥（`opencode-mobile-svcops-handshake`）+ 白名单命令面（模板表 OS 闭域三分变体、参数双闸、全仓唯一 `setCommand` 调用点被 Kotlin 校验器门禁、零删除类模板）+ 授权流 O1–O14（无确认不执行、取消不确定性诚实呈现、回滚仅自 rollbackAvailable、**无 disconnect→stop 边——断开永不停止远端**）；两层发现（API 权威 + SSH exec 安装面，pgrep 漏报等限制直陈）；curl 管道安装仅 POSIX 且预览明示远程执行本质（N2）；凭据逐命令解析单次过桥（N7 继承 0003 §4）；断开存活复核（B1 触发集 watcher，`state-machine.ts`/`runtime.ts` 零改动）。裁定（[决策 0004](decisions/0004-service-operations.md)）：**客户端构建不隐含服务操作能力**（运行时桥下发、构建产物零执行面）；确认与执行间的 TOCTOU 残余为已接受有界竞态（exec 侧预检拒绝覆盖运行中服务）。设备/真 OS 门禁（G18 四桥 bring-up、三 OS E2E）BLOCKED；APK 打包阻塞于 jsch+bcprov jar 元数据冲突（需 build.gradle.kts packaging 块，待决策；Kotlin 编译已过真实工具链）。

## 已确认目标，尚未实现

| 领域 | 目标 |
| --- | --- |
| 平台 | 优先交付 Android APK，后续允许适配其他移动平台 |
| SSH | 连接远程主机，通过 SSH 隧道访问远程 OpenCode 服务（注册表/状态机/隧道传输已实现（未验证，issue #6）；真机 E2E BLOCKED） |
| 直连 | 通过服务地址、端口和认证信息访问远程 OpenCode 服务 |
| 工作界面 | 尽量复用 Desktop 的远程项目、会话、文件、Diff、权限与终端体验（远程项目/工作区/会话生命周期已实现（未验证，issue #8，见 [design/units/projects-sessions.md](design/units/projects-sessions.md)；文件/Diff/权限/终端仍为上游闭包携带、未建立设计契约） |
| 服务位置 | 不在手机本地运行 OpenCode 服务或项目工具链 |
| 远程操作系统 | 远程主机为原生 Windows 时同等支持；不管理或不运行 Windows 宿主上的 WSL 发行版 |
| 凭据 | 用户可在设备本地安全保存私钥和服务凭据 |
| 恢复 | 网络切换或返回前台后恢复连接，并从服务端同步状态 |
| 远程任务 | 断开客户端连接不主动停止远程服务和任务 |

SSH 隧道的设备回环监听端口只是网络转发入口，不是本地 OpenCode 服务。

WSL 排除与原生 Windows 保留是已确认的范围决策，见[决策记录 0001](decisions/0001-wsl-exclusion.md)；该排除不等同于排除 Windows 远程支持。

## 建议架构，待技术验证

```text
共享移动端界面与业务逻辑
  ├─ 服务地址直连 ────────────────→ 远程 OpenCode HTTP API
  └─ 平台 SSH 适配 → 加密隧道 ──→ 远程 OpenCode HTTP API

平台适配层
  ├─ Android：SSH、凭据保护、文件选择、生命周期
  └─ 其他移动平台：后续适配，当前不实现
```

可评估 Capacitor/WebView 加原生 SSH 桥接，但尚未锁定框架、SSH 库和最低系统版本。共享代码不应直接依赖 Android API。

## 开发前待确认与验证

1. **上游复用**：选择前端源码和客户端契约的引入方式、版本固定与更新策略；复用代码时保留许可证及版权声明。
2. **SSH 兼容范围**：确认密码认证、私钥格式、加密私钥、交互认证、配置别名和跳板机需求，不默认等价于系统 OpenSSH 的全部功能。
3. **远程引导**：远程服务发现、安装、启动和版本不兼容处理已实现（未验证，issue #7，见[决策记录 0004](decisions/0004-service-operations.md)）：替换现有远程服务需显式危险确认且 exec 侧预检拒绝覆盖运行中服务，绝不静默；三 OS 真 OS E2E BLOCKED。
4. **传输**：验证 HTTP、事件流和远程终端经过 SSH 转发及 Android WebView 的端到端行为。
5. **安全存储**：确定 Keystore 保护方案、备份和卸载行为、私钥导入方式，以及生物识别解锁与后台重连的取舍。
6. **直连安全**（issue #5 已裁定，见[决策记录 0002](decisions/0002-direct-connection-transport.md)，设备级验证待实测）：TLS 信任流程=system CA 唯一锚，链/过期/主机名严格校验，不关闭全局校验、绝不 trust-all；自签/私有 CA HTTPS 直连本期不支持（反馈正规 CA、SSH 隧道与 per-connection pin 候选三条出路）；局域网明文 HTTP 本期不支持，逐连接知情授权为前瞻方案、留用户决策；重定向跨主机/降级 fail-closed；凭据不进 URL（WS 单次票据为能力凭证，非凭据）。
7. **生命周期**：明确前台恢复与持续后台连接的不同承诺；不默认承诺进程被杀后仍保活或收到通知。
8. **移动体验**：确定窄屏布局、返回键、软键盘、触摸与无障碍，以及页面、草稿和滚动位置的恢复口径。
9. **交付**：确定包名、最低 Android 版本、APK 签名与发布方式；签名密钥不得提交仓库。

## 后续验收方向

实施前应将以下方向细化为可执行测试与真机冒烟清单。目前均未验证。

- 两种连接方式均能进入真实远程会话并完成任务交互。
- SSH 主机指纹变化、认证失败、直连证书错误有明确反馈和恢复路径。
- 文件、Diff、权限确认与远程终端通过同一服务连接正常工作。
- 切后台、网络中断和切换网络后，可恢复连接而不丢失服务端任务状态。
- 凭据不以明文写入普通前端存储、日志、备份或构建产物。
- 断开连接或退出 APK 不主动关闭远程 OpenCode 服务。

## 本次初始化核对

| 条目 | 交付位置 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| 产品边界 | README 与本文 | 核对用户确认的双连接、远程执行、Android 优先范围 | 已记录；功能未实现 |
| 实现状态 | README、本文与 `docs/build-and-verify.md` | 明确壳代码已实现（未编译验证）、无 APK，不将 vendored 能力写成已交付 | 已记录 |
| 凭据纪律 | README、AGENTS 与 .gitignore | 初始化文档人工核对、常见凭据标记扫描和 `git check-ignore` 检查；M-002 memory-only 静态验证；issue #4 明文持久化审计（`scripts/audit-secret-persistence.ts`）与 vault 探针（`scripts/verify-credential-vault.ts`） | 已检查；真机核验（G9/G11、C1–C4）未执行 |
