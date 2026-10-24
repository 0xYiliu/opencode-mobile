# OpenCode Mobile

OpenCode 移动端客户端。首个目标平台是 Android（APK），后续为其他移动平台保留适配空间。

> 当前状态：上游前端闭包已引入（pin `b4525d79bf`，见 `vendor/upstream/PROVENANCE.md`），web 静态构建本机可复现，Android WebView 壳代码已实现（未编译验证）；主机注册表与连接状态机已实现（未验证，issue #3：第一方包 `packages/mobile-hosts/` + vendor 补丁 M-004…M-008，host-key 校验与 SSH 隧道为 fail-closed stub，真实实现归 issue #6）；设备凭据保险库已实现（未验证，issue #4：vault 端口/信封 v1/Keystore 落盘/可选记住交互 + vendor 补丁 M-009/M-010 与 M-007 修订，桥 bring-up 与设备门禁 C1–C5 BLOCKED）；直连传输卫生与错误分类已实现（未验证，issue #5：vendor 补丁 M-011…M-014——validated-follow 重定向策略、userinfo 凭据 URL 拒发、端点 probe 分类器与精确错误反馈；TLS=system CA 唯一信任锚，明文 HTTP 与自签/私有 CA 直连本期不支持，见 `docs/decisions/0002`；probe 桥 bring-up 与错误矩阵端到端 BLOCKED）。尚无 APK；两种连接方式与会话功能未实现，设备验证全部 BLOCKED。构建与验证证据见 [docs/build-and-verify.md](docs/build-and-verify.md)，设计文档体系见 [docs/design/README.md](docs/design/README.md)。

## 产品目标

在手机上提供 OpenCode Desktop 的远程工作体验：连接远程机器，管理项目和会话，发送任务，查看文件与 Diff，处理权限确认，使用远程终端。

支持两种连接方式：

1. **SSH 连接**：通过 SSH 发现远程 OpenCode 服务并建立加密隧道；远程服务的安装、启动与版本处理纳入开发范围。
2. **服务地址直连**：通过服务器地址、端口和认证信息连接远程 OpenCode HTTP API；公网优先使用 HTTPS。

手机不运行本地 OpenCode 服务。项目文件、Git、Shell、模型调用与 Agent 工具执行均由远程机器负责。手机断开连接不应主动停止远程任务。

远程机器为原生 Windows 时同样通过上述两种方式支持。Android 客户端不管理、不运行 Windows 宿主上的 WSL 发行版，并以明示方式呈现这一与 Desktop 的差异；见[决策记录 0001](docs/decisions/0001-wsl-exclusion.md)。

## 凭据与隐私

- SSH 私钥和服务凭据可以保存在用户设备上，不嵌入 APK，也不上传到本仓库。
- 设备侧加密存储已实现（未验证，issue #4）：Android Keystore（AES-256-GCM）加密的信封文件落盘，元数据索引永不存值；无额外解锁（不绑定生物识别/锁屏凭据）；vault 不可用是显式状态，不存在明文回退。SSH 密钥解析格式支持范围归 SSH 隧道实现（issue #6）。
- 服务密码默认 memory-only（M-002）；「记住」为可选项（勾选后经 vault 加密落盘，重启自动恢复）。
- SSH 主机指纹必须校验；不得通过全局关闭 TLS 校验来兼容服务证书。
- 日志、备份和诊断导出必须避免泄露密码、令牌、私钥与私钥口令；备份排除（allowBackup=false + data extraction rules）已实现（未验证）。

## 文档

- [项目范围与开发前待确认项](docs/project-scope.md)
- [决策记录 0001：排除 WSL，保留原生 Windows 远程支持](docs/decisions/0001-wsl-exclusion.md)
- [设计文档体系](docs/design/README.md)
- [构建与验证证据](docs/build-and-verify.md)
- [开发约定](AGENTS.md)

## 与 OpenCode 的关系

本项目是独立的移动端客户端仓库，不是整个 OpenCode 源码仓库的副本。

前端界面与客户端契约优先复用 OpenCode 已有实现：当前以 vendor 闭包方式引入上游部分前端包（`vendor/upstream`，仅 `packages/app` 及其传递闭包），版本固定与更新策略按 [docs/build-and-verify.md](docs/build-and-verify.md) 与上游来源记录执行；复用代码保留上游许可证与版权声明，移动补丁记录在 `vendor/upstream/patches/mobile/`。

上游项目：<https://github.com/anomalyco/opencode>。本项目不是上游官方移动客户端的声明。
