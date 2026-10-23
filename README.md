# OpenCode Mobile

OpenCode 移动端客户端。首个目标平台是 Android（APK），后续为其他移动平台保留适配空间。

> 当前状态：仓库初始化，仅包含项目说明和范围约定。尚未实现客户端、Android 工程或可安装 APK。

## 产品目标

在手机上提供 OpenCode Desktop 的远程工作体验：连接远程机器，管理项目和会话，发送任务，查看文件与 Diff，处理权限确认，使用远程终端。

支持两种连接方式：

1. **SSH 连接**：通过 SSH 发现远程 OpenCode 服务并建立加密隧道；远程服务的安装、启动与版本处理纳入开发范围。
2. **服务地址直连**：通过服务器地址、端口和认证信息连接远程 OpenCode HTTP API；公网优先使用 HTTPS。

手机不运行本地 OpenCode 服务。项目文件、Git、Shell、模型调用与 Agent 工具执行均由远程机器负责。手机断开连接不应主动停止远程任务。

远程机器为原生 Windows 时同样通过上述两种方式支持。Android 客户端不管理、不运行 Windows 宿主上的 WSL 发行版，并以明示方式呈现这一与 Desktop 的差异；见[决策记录 0001](docs/decisions/0001-wsl-exclusion.md)。

## 凭据与隐私

- SSH 私钥和服务凭据可以保存在用户设备上，不嵌入 APK，也不上传到本仓库。
- Android 计划采用 Keystore 保护的加密存储；具体实现和 SSH 密钥格式支持范围尚待验证。
- SSH 主机指纹必须校验；不得通过全局关闭 TLS 校验来兼容服务证书。
- 日志、备份和诊断导出必须避免泄露密码、令牌、私钥与私钥口令。

## 文档

- [项目范围与开发前待确认项](docs/project-scope.md)
- [决策记录 0001：排除 WSL，保留原生 Windows 远程支持](docs/decisions/0001-wsl-exclusion.md)
- [开发约定](AGENTS.md)

## 与 OpenCode 的关系

本项目是独立的移动端客户端仓库，不是整个 OpenCode 源码仓库的副本。

计划优先复用 OpenCode 已有的前端界面、客户端协议和 SSH 交互契约；复用方式、上游版本固定策略及依赖分发方式在技术验证阶段确定。当前未复制上游代码，也未建立可构建的依赖关系。

上游项目：<https://github.com/anomalyco/opencode>。本项目不是上游官方移动客户端的声明。
