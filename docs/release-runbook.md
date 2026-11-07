# Android 发行手册（release runbook）

本文是 Android 客户端版本的签名、构建、验收与发布操作手册。首发记录见 `build-and-verify.md` issue #149 段（RC `6e83db6`，2.2.1 / versionCode 20201）。**所有发布动作（tag、GitHub Release、上传）须用户明确发布授权后才执行**——本轮仅完成仓库内准备。

## 1. 签名材料（只在仓库外）

- Keystore：`~/.config/opencode-mobile-signing/opencode-mobile-release.keystore`
  - PKCS12 / RSA 4096 / 有效期 10950 天（30 年，> Android 建议 10000 天）/ alias `opencode-mobile-release`
  - 目录权限 700，keystore 权限 600
- 密码文件：`~/.config/opencode-mobile-signing/signing.properties`（四键：`opencodeReleaseStoreFile` / `opencodeReleaseStorePassword` / `opencodeReleaseKeyAlias` / `opencodeReleaseKeyPassword`），权限 600
- Gradle 读取：`~/.gradle/gradle.properties`（同四键，权限 600）；亦可用 `-P` 参数或 `ORG_GRADLE_PROJECT_*` 环境变量
- 证书 SHA-256 指纹（公开身份，可入台账）：`bbd5214880378a4f4d7a4076b04ab71f3444d01846392ec46df691fd055f4190`
- **密码与密钥值零入仓库、台账、issue、PR、日志**；leak-scan 命中集恒同是佐证门禁之一
- **备份提醒**：keystore 丢失 = 该签名谱系永不能再对已安装用户覆盖升级（Android 拒绝异签名安装）。建议用户自行做一次性仓库外备份（如离线密码管理器），仓库不托管、本文不记录其位置

## 2. 签名接线语义（android/app/build.gradle.kts）

| 属性状态 | 行为 |
| --- | --- |
| 四项全在 | release 构建产**已签名 APK**（signingConfig = release） |
| 四项全缺 | release 仍可构建，产 **unsigned APK**，gradle 打出 `…will produce an UNSIGNED APK` lifecycle 行 |
| 部分缺 | **fail-fast**，报错点名缺失属性 |

签名的正确性不由 gradle 断言，由发布门禁断言：`apksigner verify` + 证书指纹记录（见 §4）。仓库在无密钥机器上保持可构建（"signing material never lives in this repo" 语义不变）。

## 3. versionCode 方案

```
versionCode = major×10000 + minor×100 + patch
```

- 2.2.1 → **20201**；对已装 0.1.0/1 单调（20201 > 1）
- 在 major≥1、minor≤98、patch≤99 域内对 (major,minor,patch) 字典序严格保序（1.99.99=19999 < 2.0.0=20000；2.9.99=20999 < 2.10.0=21000）
- minor 跨 99 或 major 双位升版时须重新评估方案并更新本节

## 4. 构建命令序列（以 2.2.1 为例）

```bash
# 0) 干净树 + RC 冻结：git status clean，登记 RC SHA；此后禁改源码与构建输入
# 1) 依赖与 seam（测试/构建期，不入 git）
bun install --frozen-lockfile
# vendor/upstream/packages/{app,session-ui,ui,client,plugin-browser}/node_modules/@opencode-mobile/mobile-hosts -> <worktree>/packages/mobile-hosts
# vendor/upstream/packages/ui/node_modules/@opencode/util -> ../../../util
# 2) 门禁
bun run verify:patches && bun run verify:closure
bash scripts/leak-scan.sh && bun run scripts/audit-secret-persistence.ts   # leak-scan 允许 base 既有合成 fixture 命中，命中集必须与 base 恒同
bun test --conditions=browser packages/mobile-hosts
ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:testDebugUnitTest
# 3) web 构建（每个 RC 只做一次；dist 非确定性，发布包=验收包靠同一文件对象）
bun run build:web && bash scripts/copy-web-dist.sh     # 刷新 web-dist/manifest.json 并随探针回填提交
# 4) dist 三方断言（显式，不等于则先修正回填值并重冻结 RC）
python3 scripts/android_web_assets.py verify
#    且 web-dist/manifest.json fileCount/totalBytes == 探针组 8 回填值
# 5) APK（零重建——不得再跑 build:web / copy:web-dist）
ANDROID_HOME=$HOME/.android-sdk /home/peterhan/gradle-bootstrap/gradle-9.6.1/bin/gradle -p android :app:assembleRelease :app:assembleDebug
# 6) 发布门禁
/usr/bin/apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk   # v2 scheme 必须 true
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk  # 包名/versionCode/versionName
# 7) 归档（仓库外稳定路径）+ SHA-256 + 字节数登记
mkdir -p /home/peterhan/release-staging/<issue>/ && cp android/app/build/outputs/apk/{release,debug}/*.apk /home/peterhan/release-staging/<issue>/
sha256sum /home/peterhan/release-staging/<issue>/*.apk
```

**发布包 = 验收包**：APK 与 web dist 均非字节可重现（时间戳/chunk hash），hash 一致只能靠「同一文件对象」——归档后一律零重建；任何源码或构建输入变化 → 重冻结 + 重构建 + 重走 §4 全部核对。

## 5. 发布流程与授权点

1. **准备**（仓库内，本轮授权）：身份同步 → 门禁 → RC 冻结 → 构建/签名/核对 → 归档 → Release 说明草稿（列平台排除/暂缓/兼容边界）。
2. **发布授权点（U2）**：GitHub Release 创建 + tag（建议 `v2.2.1`，随授权一并拍板）+ APK/SHA-256 上传。授权未明示前零发布动作。
3. **发布内容**：Release 说明 + release APK + SHA-256（归档文件原样上传，零重建）+ 版本清单（ADR 0005 激活条件 = 首个对外可下载已签名 release + 版本清单；上传后 S40/N09 暂缓边界才进入复评）。

## 6. debug → release 迁移（签名不兼容，如实告知）

- 已装 **debug** 包（历史 QA 安装）不能被 release 包覆盖安装：Android 报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`（#149 轮在 API 31/34 两台 AVD 实测成立）。
- 迁移 = **卸载 debug → 安装 release**：应用全部本地数据不可恢复清除（真实连接、vault 凭据、偏好；`allowBackup=false`，无备份机制）。服务端项目与会话不受影响。
- 该卸载属用户数据处置，**必须在用户明示授权后执行**（执行卡授权点 U1），不得由普通调试授权推定。

## 7. 验收与状态边界

- 范围内门禁与两阶段设备验收清单见 `build-and-verify.md` 对应 issue 段；历史 PASS 不自动覆盖新轮。
- SSH 隧道数据面、goal pill（WebView <116）、应用内 APK 更新（ADR 0005 暂缓）等平台排除/暂缓项随 Release 说明如实列出，不因版本发布自动解除。
