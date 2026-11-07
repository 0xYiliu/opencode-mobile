# OpenCode Mobile 2.2.1 Release 说明（草稿——上传须发布授权）

> 状态：**备妥未发布**。APK 与 SHA-256 已归档于仓库外 staging 路径（`/home/peterhan/release-staging/issue-149/`），实际创建 tag / GitHub Release / 上传须用户明确发布授权（执行卡授权点 U2）。授权后回填正式 SHA-256 清单。

## 版本身份

- 客户端（本 App）版本：**2.2.1**（versionName；versionCode **20201**，方案 major×10000+minor×100+patch，单调可升级）
- 上游基座版本：**2.1.4**（全局 pin `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；gui-plugins 来源覆盖 = v2.2.1 `3ebcf9a32c7b28f658cfee80775448929361727a`）——About「Upstream OpenCode」行如实显示基座版本，不伪称整套来源已升级
- 所连服务版本：About「Server OpenCode」行独立实显真实连接的服务版本，与客户端版本不混淆
- 对齐目标：Windows Desktop v2.2.1（固定 commit `3ebcf9a32c7b28f658cfee80775448929361727a`）

## 本轮交付（相对 #140–#148 集成态）

- 版本身份三方同步（App 常量 = Android 构建签名 = mobile-hosts 包元数据），About 三行实显
- 仓库外签名接线（gradle 从外部属性读取；无属性机器保持可构建、产 unsigned 并明示）与 release 签名产物
- 六条在册移动补丁补齐 `upstreamBaseline` 来源字段（manifest-only，补丁文件字节不动）
- 两个验收探针扫描域修正（排除 gradle 构建产物目录）+ dist 见证回填（5622 files / 150,022,223 bytes）

## 平台排除与暂缓（不因发版自动解除）

| 项 | 状态 | 依据 |
| --- | --- | --- |
| WSL 执行能力 | 排除（入口可见并禁用说明） | N12 / ADR 0001 |
| 应用内 APK 更新 / What's New 自动弹窗 | 暂缓（呈现不误导已验） | ADR 0005；S40/N09——上传本 release 并建版本清单后进入复评 |
| 语音输入 | 暂缓 | ADR 0006 |
| 扫码配对物理解码 | 相机授权面已验，物理解码待真机轮 | #148 在册 |
| 后台通知到达 / tap 路由 | 随渲染器冻结平台实态 | #148 在册 |
| SSH 隧道数据面 | 暂缓 | #146 在册 |
| Goal pill（AbortSignal.any） | WebView < 116 环境不可用（Chrome 114 实测） | #148 C4 登记 |
| MCP needs_auth / OAuth | 暂缓 | #148 在册 |
| 桌面参考端视觉对照 | 未运行核实（无 Windows 参考端环境） | workflow §6 |

## 兼容边界

- **Android 10+（minSdk 29）**；编译/目标 SDK 36
- 实测环境：Android 12（API 31，WebView Chrome/114）与 Android 14 模拟镜像（API 34，WebView 113）；API 31 模拟镜像自带 WebView 91 过旧不可用（需 WebView ≥ ~93，建议保持系统 WebView 更新）
- 签名谱系：release 签名（v2 scheme）；历史 debug 安装不能覆盖安装，须卸载迁移（**应用本地数据不可恢复清除**，服务端数据不受影响）——见发行手册 §6
- SSH 主机指纹与 TLS 证书校验不可关闭；凭据仅存平台安全存储，不入 WebView 普通 localStorage

## 安装与升级

- 首次安装：直接安装 APK
- 后续版本升级：同签名（本谱系）直接覆盖安装，数据保留（同签名覆盖路径已实测：firstInstallTime 保持、配置存续）
- debug（历史 QA 构建）→ release：签名不兼容，须卸载后安装（数据清除后果见上）
