# 项目范围

本项目的目标是：以固定上游版本为基准，将 OpenCode Windows Desktop 客户端的页面、交互、视觉和使用流程尽量原样复制到 Android APK 中。当前固定基准为 **OpenCode Windows Desktop v2.2.1**，上游 commit 为 `3ebcf9a32c7b28f658cfee80775448929361727a`；逐项实现、差异和验收状态以[版本矩阵](alignment/windows-desktop/v2.2.1/matrix.md)为准。

## 对齐原则

1. **Copy 优先**：优先直接复制固定上游版本的页面、组件、样式、交互和状态流程；不先重新设计一套移动版 UI。
2. **必要适配最小化**：只有 Android WebView、触摸、软键盘、生命周期、凭据和连接安全等平台边界需要时，才增加适配；适配必须保留上游可观察的页面结构和操作结果，并记录原因。
3. **整体验证**：页面不能只按单个控件对齐。Shell、导航、Settings、Server、Session、composer、timeline、pane、dialog、menu、恢复流程及其共享依赖应按完整用户流程核对。
4. **版本同步**：当前仓库的客户端版本、Android APK `versionName`、About 页面客户端版本和 vendored 客户端基准应与固定上游版本保持一致；连接的远程服务版本单独展示，不与客户端版本混淆。
5. **来源固定**：开发只比较已登记的上游 commit，不跟随上游 HEAD；复制文件、许可证、补丁和必要适配均须保留可追溯来源。

Playwright 或上游浏览器测试只能作为 Web 组件辅助证据，不是 Android APK 的交付硬门禁。APK 的主要验收方式是 Android Gradle 测试、APK 构建、adb 安装和模拟器/真机上的实际 UI 流程验证。

## 已确认范围

| 领域 | 范围与决定 |
| --- | --- |
| 连接 | SSH 与服务地址直连都是核心路径，不以外部 SSH App 为默认前提 |
| 执行位置 | OpenCode 服务、项目文件、Git、Shell、模型和 Agent 工具均在远程机器运行；客户端断开不主动停止远程任务 |
| 服务操作 | 远程发现、安装、启动和版本处理需要显式授权；不静默关闭或替换服务 |
| WSL | Android 不运行或管理本机/Windows 宿主 WSL；原生 Windows 远程支持保留。Android 对应入口需显示为禁用并解释原因，状态见矩阵 N12 |
| 浏览器 | 手机不是浏览器执行宿主；可呈现远程浏览器工具结果，不将外部浏览器等同于 Desktop 内置面板 |
| GUI 扩展 | 管理内置移动扩展；不提供第三方 GUI 扩展安装、移除或商店 |
| Office | 保留文档查看器；PDF、字体及大文件行为以设备验证为准 |
| 配对 | 支持链接粘贴/导入的现有流程；相机扫码已接入（issue #71：壳层 CAMERA 运行时权限 + WebView 授权白名单；MatePad 实测授权链/拒绝三态/入口可用，QR 解码与兑换全链段仍归 G32①② 门禁，不在已完成能力声明内）；外链唤起已确认不实施（[决策 0007](decisions/0007-pairing-deep-link.md)，2026-10-31；激活条件在册） |
| 通知 | 应用/连接存活期间尽力投递；不承诺进程死亡期间送达，不提供前台服务、保活或推送 |
| 安全 | SSH 主机指纹与 TLS 证书必须校验；设备凭据使用 Android 安全存储，不进入普通 WebView 存储、日志或仓库 |
| 生命周期 | 网络变化或返回前台时恢复并同步真实服务状态；不扩展为永久后台在线承诺 |

WSL 排除、原生 Windows 支持及服务操作边界分别见[决策记录 0001](decisions/0001-wsl-exclusion.md)、[直连传输决策](decisions/0002-direct-connection-transport.md)、[SSH 决策](decisions/0003-ssh-transport.md)和[服务操作决策](decisions/0004-service-operations.md)。APK 更新暂缓、语音通话暂缓与配对外链唤起不实施分别见[决策记录 0005](decisions/0005-apk-update.md)、[决策记录 0006](decisions/0006-voice-call.md)和[决策记录 0007](decisions/0007-pairing-deep-link.md)。

## 架构与上游来源

当前客户端复用独立维护的 OpenCode 前端闭包，通过 **Kotlin 原生 Android WebView** 与平台桥接接入 SSH、凭据、文件、通知及生命周期能力。SSH 隧道的设备回环监听只是转发入口，不是手机本地 OpenCode 服务。共享界面和通信状态不得直接依赖 Android API；平台能力只能经适配边界接入。

vendor 来源、固定版本、许可证和移动补丁见 `vendor/upstream/PROVENANCE.md`。升级按固定版本逐次比较，不建立 submodule、fork 跟踪或自动同步关系。与 v2.2.1 的实现差异见[矩阵](alignment/windows-desktop/v2.2.1/matrix.md)。

## 验证与交付

已有代码、构建、MatePad 局部冒烟和仍阻塞的端到端门禁，见[构建与验证记录](build-and-verify.md)。APK 安装或单项 UI 冒烟不代表 SSH 认证、真实远程任务或完整版本对齐已通过。逐项工作按[功能对齐推进规则](alignment/workflow.md)记录验收和剩余缺口。
