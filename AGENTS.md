# OpenCode Mobile 开发约定

## 范围与事实

- 本仓库是移动客户端，Android 优先；不添加手机本地 OpenCode 服务。
- SSH 与服务地址直连均为核心目标，不以外部 SSH App 作为默认使用前提。
- 当前产品范围和唯一对齐口径见 `docs/project-scope.md` 与 `docs/alignment/workflow.md`：固定上游 Windows Desktop 版本，copy 优先，仅做 Android 必要适配；不要另行设计移动版流程。
- Android 交付主要使用 Gradle 测试、APK 构建、adb 安装和模拟器/真机 UI 验证。没有实际构建或运行验证时不得声称 APK 已可用；Playwright 不是 Android APK 硬门禁。

## 架构与安全

- 共享界面、服务通信和连接状态不得直接依赖 Android 专属 API；平台能力经适配边界接入。
- 不静默关闭或替换远程服务，不因客户端断开而主动停止远程任务。
- 不提交私钥、密码、令牌、签名密钥、真实连接配置或含敏感信息的日志。
- 设备端凭据使用平台安全能力保护；不得放入 WebView 的普通 localStorage 或编译进安装包。
- 校验 SSH 主机指纹和 TLS 证书，不用关闭校验来规避错误。
- 复用 OpenCode 代码前确定来源版本和更新策略，保留相应许可证及版权声明。

## 交付

- 功能实施前明确验收标准、交互状态、失败路径和验证方式。
- 修改界面、数据来源或恢复行为时同步更新相应设计文档。
- 连接与安全能力应覆盖真实失败路径，至少进行模拟器或真机端到端验证；环境不足时明确标记未验证。
- 使用 conventional commit 格式，例如 `docs: initialize mobile project`、`feat(android): add ssh transport`。
