# OpenCode Mobile

OpenCode 移动端客户端。目标平台是 Android（APK），以固定上游 OpenCode Windows Desktop 版本为复制基准；后续平台适配不改变该基准。

> 当前状态：Android 客户端已有共享前端、Kotlin WebView 壳、SSH/直连、凭据保险库和远程工作界面。debug APK 已构建并有 MatePad 局部验证记录；inline SSH 表单渲染门禁通过。完整 SSH 主机指纹/认证及远程任务 E2E 仍未通过。详见[构建与验证记录](docs/build-and-verify.md)和[功能对齐矩阵](docs/alignment/windows-desktop/v2.2.1/matrix.md)。

## 产品目标

在手机上提供 OpenCode Windows Desktop 的远程工作体验：连接远程机器，管理项目和会话，发送任务，查看文件与 Diff，处理权限确认，使用远程终端。

当前对齐基准为 **Windows Desktop v2.2.1**（上游 commit `3ebcf9a32c7b28f658cfee80775448929361727a`）。实现采用 copy 优先：先复制上游完整页面和流程，再对 Android WebView、触摸、键盘、生命周期及安全边界做必要的最小适配。当前仓库客户端版本应与该上游版本同步；服务端版本单独展示。

支持两种连接方式：

1. **SSH 连接**：通过 SSH 发现远程 OpenCode 服务并建立加密隧道；远程服务的安装、启动与版本处理纳入开发范围。
2. **服务地址直连**：通过服务器地址、端口和认证信息连接远程 OpenCode HTTP API；公网优先使用 HTTPS。

手机不运行本地 OpenCode 服务。项目文件、Git、Shell、模型调用与 Agent 工具执行均由远程机器负责。手机断开连接不应主动停止远程任务。

远程机器为原生 Windows 时同样通过上述两种方式支持。Android 客户端不管理、不运行 Windows 宿主上的 WSL 发行版，并以明示方式呈现这一与 Desktop 的差异；见[决策记录 0001](docs/decisions/0001-wsl-exclusion.md)。

## 凭据与隐私

- SSH 私钥和服务凭据可以保存在用户设备上，不嵌入 APK，也不上传到本仓库。
- 设备侧加密存储已实现（未验证，issue #4）：Android Keystore（AES-256-GCM）加密的信封文件落盘，元数据索引永不存值；无额外解锁（不绑定生物识别/锁屏凭据）；vault 不可用是显式状态，不存在明文回退。SSH 密钥解析格式支持范围随 issue #6 交付（支持矩阵见 [docs/design/units/connection.md](docs/design/units/connection.md) 与 [docs/decisions/0003](docs/decisions/0003-ssh-transport.md)，真机协商核对 BLOCKED）。
- 服务密码默认 memory-only（M-002）；「记住」为可选项（勾选后经 vault 加密落盘，重启自动恢复）。
- SSH 主机指纹必须校验；不得通过全局关闭 TLS 校验来兼容服务证书。
- 日志、备份和诊断导出必须避免泄露密码、令牌、私钥与私钥口令；备份排除（allowBackup=false + data extraction rules）已实现（未验证）。

## 文档

- [项目范围与开发前待确认项](docs/project-scope.md)
- [Windows Desktop v2.2.1 功能矩阵](docs/alignment/windows-desktop/v2.2.1/matrix.md)
- [功能对齐推进规则](docs/alignment/workflow.md)
- [功能对齐文档索引](docs/alignment/README.md)
- [决策记录 0001：排除 WSL，保留原生 Windows 远程支持](docs/decisions/0001-wsl-exclusion.md)
- [设计文档体系](docs/design/README.md)
- [构建与验证证据](docs/build-and-verify.md)
- [开发约定](AGENTS.md)

## 与 OpenCode 的关系

本项目是独立的移动端客户端仓库，不是整个 OpenCode 源码仓库的副本。

前端界面与客户端契约优先直接复用 OpenCode 已有实现：当前以 vendor 闭包方式引入上游前端包（`vendor/upstream`），固定来源、版本同步和更新策略按 [docs/project-scope.md](docs/project-scope.md)、[docs/alignment/workflow.md](docs/alignment/workflow.md) 与上游来源记录执行；复用代码保留上游许可证与版权声明，必要的 Android 补丁记录在 `vendor/upstream/patches/mobile/`。Playwright 仅是可选的 Web 组件辅助验证，不是 APK 交付门禁。

上游项目：<https://github.com/anomalyco/opencode>。本项目不是上游官方移动客户端的声明。
