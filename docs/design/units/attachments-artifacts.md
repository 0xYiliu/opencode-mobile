# 单元：attachments-artifacts（附件、工件与 Android 文件交互）

状态：**已实现（未验证）**（issue #16）。附件导入与上传（进度/取消/错误反馈）、消息工件（artifact）查看器、会话导出、timeline 附件保存/分享、剪贴板图片——**附件/进度/取消/芯片/查看器/导出六面上游闭包承载**，本期新面只补平台能力到上游既有 seam（`platform.readClipboardImage`/`platform.saveFile`）与上游调用点（`region.tsx openAttachment` 的 data: 分支）。**本期首次包含第一方运行时代码**（`packages/mobile-hosts/src/files/` 桥模块——第五座协议隔离桥的 JS 侧）与**壳层新 Kotlin 面**（`android/.../files/FilesBridge.kt` + `ShareFileProvider.kt`，零 androidx）与 **vendor 补丁两枚**（files-platform-bridge/attachments-share-bridge，补丁总数 18→20；原 M-019 预留仅为历史证据，`addProjects` 缺口归 FU-3；后续候选按用途语义命名）。全部运行期行为未经设备验证：真机门禁见 **G27**（[interaction.md](../interaction.md)），真实远程服务核对 BLOCKED。Office 文件渲染归 **#18**；外部 IDE/Explorer 打开维持排除（#11 既有门槛，探针继续生效）。

行号声明：本文引用的行号为 vendor pin `b4525d79bf` 时点值，仅供定位；权威以引号内源文本锚为准（静态探针 `scripts/verify-attachments-artifacts.ts` 锁定）。**来源边界**：服务端 fs.write 零围栏/`paths.tmp` 语义/上传接收行为不在 vendored 闭包内，引自上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `b4525d79bf`（同 [architecture.md](../architecture.md) CORS 节「来源表述」先例，与 [units/files.md](files.md) 分层一致）；pin 更新时缓存引文随 PROVENANCE 演练同步。

## 能力来源（复用面 + 新面锚）

| 面 | 实现锚 | 状态 |
| --- | --- | --- |
| 附件导入（chooser） | 上游 `<input type="file">` 回退链零改动承接：`composer/editor/interaction.ts`（`attachments.pick(() => fileInput?.click(), …)`）→ 壳层 `onShowFileChooser`（#4 既有 seam）承接；**本期壳层增强（第一方 Kotlin，非补丁）**：`MODE_OPEN_MULTIPLE` → `EXTRA_ALLOW_MULTIPLE` + ClipData 多 URI 解析；`acceptTypes` 映射口径（MIME 直用/扩展名经壳内建小映射表转 MIME——对齐 `WebAssetServer.MIME_BY_EXTENSION` 口径，未知扩展名忽略；用 `EXTRA_MIME_TYPES` 时 intent type 置 `*/*`）；`ACTION_OPEN_DOCUMENT` 失败 → `ACTION_GET_CONTENT` 回退链；exactly-once 纪律与「no takePersistableUriPermission」不变 | 已实现（未验证） |
| 上传通道 | `composer/attachments/destination.ts`（87 行）：`sdk.api.server.info` 取 `info.paths.tmp` → `new URL("/api/experimental/fs/write", …)` + `searchParams.set("path", …uploads/${uuid()}/${file.name})`（**每上传独立 uuid 目录防文件名碰撞**）→ XHR POST（`application/octet-stream`）；成功判据=attachments-upload-redirect-policy `validateRedirectTarget(url.href, xhr.responseURL)` + `assertNoUrlCredentials` + `xhr.status === 200`（注释逐字「SAFETY: a 200 from \`fs.write\` is its declared success body」）。**无校验和/无完整性字段（如实）**。**本期零改动**；`fs.write` 全仓唯一线级调用点穷举集合恰 `{destination.ts}`（#11 基线，探针复验） | 已实现（未验证） |
| 附件三路分流 | `attachments/attachments.ts`（342 行）：`attachmentMime`（4096 字节嗅探）→ ①`native(mime, destination.input) && file.size <= MAX_INLINE_BYTES`（**`MAX_INLINE_BYTES = 20 * 1024 * 1024`**）→ inline：字节进 draft blob store；②`destination.local && sourcePath` → path part（desktop 分支，web 恒不走——`local: server.isLocal` 在移动恒 false）；③否则 `stage()` → `uploads.track` 进度上传 → `addPath({filename, mime, path})` | 已实现（未验证） |
| 进度/取消/重试 | `attachments/uploads.tsx`（128 行）：进程级 upload 列表（注释逐字「Uploads outlive the composer that started them, so one process-wide list feeds every chip and the single progress toast」）；`UploadToastHost` 挂载于 `shell/shell.tsx`——单聚合 toast、每行 `role="progressbar"` + 每文件 cancel（AbortController）；编辑器内 upload 芯片（ProgressCircle + cancelUpload）。**无自动重试**（上游语义：失败 toast 后重新添加即重新上传）；发送前 `attachments?.pending().length` 门挡住未完成上传 | 已实现（未验证） |
| 工件查看器 | 14 kind（image/svg/audio/video/pdf/html/markdown/mermaid/table/font/document/spreadsheet/presentation/text；`util/src/artifact.ts` `artifactMime` 扩展名 MIME 表，**docx/xlsx/pptx → officeKinds 三 kind 经 microsoft-office 扩展查看器呈现（FileViewer 注册链，见 [artifact-viewers.md](artifact-viewers.md)），运行期验证归 #18**——binary 占位仅在扩展缺席/预检拒绝/引擎失败三情形）；字节策略 `workspaces/files/artifact.ts`（binaryKinds 保留原始字节，`MAX_MEDIA_BYTES = 256 * 1024 * 1024` 超限占位）；两容器：文件面板 `gui-extensions/src/file/view.tsx` → `artifact-view.tsx`（897 行：image/svg 缩放平移、video 全屏、pdf/html iframe 沙箱 + `referrerPolicy="no-referrer"`、binary 占位 + preview/source 切换）与消息媒体 `session-ui/src/components/file-media.tsx`（image/audio/svg/binary 四态） | 已实现（未验证） |
| 会话导出 | `session/commands/export.ts`（73 行）：`saveSessionExport` = `platform.saveFile` 在 → 保存对话框；不在 → `downloadSessionExport` blob anchor 回退 + `return true`；文件名 `sessionExportFilename` slug 化（`[^a-z0-9_-]+` → `-`，**天然不含服务器路径**）；消费端 `use-session-commands.tsx`：false=静默 return（用户取消契约）、true=成功 toast、throw=catch → 失败 toast。GUI 扩展 `runtime/extension/host-apis.tsx` `system.save` 同型（`platform.saveFile` 在则用，不在则 anchor + true） | 已实现（未验证）；SAF 落点运行期归 G27④ |
| 保存（新面） | `platform.saveFile` web 实现（files-platform-bridge）经 files 桥 `save` op → 壳层 **SAF `ACTION_CREATE_DOCUMENT` + `CATEGORY_OPENABLE` + `EXTRA_TITLE`**（用户选 Downloads/Drive 等系统可达落点）→ `ContentResolver.openOutputStream` **一次性写授权**（无 persistable、零临时文件、零 save 清理面——授权生命周期由系统管理）→ 三态回桥：`{saved:true}` / `RESULT_CANCELED → {saved:false}`（上游「false=用户取消」契约原样成立）/ IO 失败 → 显式 `io` 错误码（上游 catch → failed toast）。**saveFile 的 mime 由 client.ts 按 `defaultPath` 扩展名推导（小映射表，与 acceptTypes 口径同源），无扩展名/未知 → `application/octet-stream` 兜底**（`SaveFilePickerOptions = { title?; defaultPath? }` 无 mime 字段——上游两个调用点均只传 `defaultPath` 与内容串） | 已实现（未验证）；落点可达性归 G27④ |
| 分享（新面） | files 桥 `share` op：`cacheDir/share/<uuid>/` 临时文件 staging（分享目标 App 即交付落点）→ 手写最小 `ShareFileProvider`（零 androidx，`openFile` 只服务 `cacheDir/share/` 子树、路径穿越拒绝、`exported=false` + `grantUriPermissions=true`）→ `Intent.ACTION_SEND` + `FLAG_GRANT_READ_URI_PERMISSION`（**同时置于 send intent 与 chooser intent 两处**——`Intent.createChooser` 包裹场景下目标 App 读授权要求 flag 双置）+ chooser；**代际清理**：保留当前代、新代写入成功后删更旧代（最小暴露窗口），onDestroy 全清。**仅 data: 分支接线**（attachments-share-bridge）：`region.tsx openAttachment` 的 data: URL 分支优先 `shareDataUrl(url, getFilename(file.name) || "attachment", file.mime)`——**成功即返回；取消（false）与失败（throw）/桥不可用 → 原样回退 anchor.download**（上游行为保持）；**file:// URI 分支零改动**（远程路径工件：设备无字节，不触发任何设备侧分享/路径解析——身份分离防线） | 已实现（未验证）；授权范围归 G27⑤ |
| 剪贴板图片（新面） | 上游 paste 链完整：`interaction.ts shouldHandlePasteAsAttachment`（file kind → 附件；`text/` → 文本；否则 `readClipboardImage` 平台能力）→ `attachments.ts handlePaste` → `add(file, target, clipboard=true)`（**clipboard 图片按字节判重**，注释「identical clipboard content is matched on bytes alone」）。web 构建结构性缺口=`readClipboardImage` 无实现（desktop 源不在闭包）→ files-platform-bridge 补 web 实现，经桥 `clipboardImage` op：Kotlin 侧仅支持 `ClipDescription` mime `image/*` 的 content:// URI 形态（`ContentResolver.openInputStream` 一次性读、10s 超时），bitmap-Intent 等其余形态 → 显式 `unsupported`；无图像 → `null`（paste 链静默走文本路径） | 已实现（未验证）；Android 剪贴板形态实态归 G27⑥ |

## 数据与端点契约

全部引用 vendored/第一方在册类型，不另行定义契约。

### 上游面（零改动）

- **上传端点**：`POST /api/experimental/fs/write`（attachments-upload-redirect-policy 校验面在位；服务端「Unlike read, the target is not confined to the location」@ 缓存引文见 [units/files.md](files.md)）。
- **发送侧身份编码**（`composer/request.ts` `buildPromptRequest`）：images → `{ uri: attachment.dataUrl }`（inline 随消息）；path attachments → `` `file://${encodeFilePath(path)}` ``（file:// URI 是**传给远程服务的路径记号**，不是手机本地文件）。
- **身份分离（schema 双类型，验收 3 落点）**：`ImageAttachmentPart.blob {id, url}` = **设备副本**（content-addressed chunk 入 IndexedDB draft store，`runtime/persistence/drafts.ts` `putBlob`/`resolveBlobUrl`）；`PathAttachmentPart {path}` = **远程工件身份**（schema 注释逐字「A file the model receives as a path on the server: its bytes never enter the draft store」）。`sourcePath`（设备来源路径，desktop 概念）在 web 恒 undefined；上传成功后设备字节不再被引用（流式直连远端，无设备落地副本）。**local/remote 报告**：blob 缩略图芯片（本地设备副本）vs path 芯片（远程工件）呈现区分；远程工件恒可经文件面板（location 作用域）查看，导出/分享仅对设备有字节的附件（data: 分支）开放。

### files 桥协议（第五座协议隔离桥，本期新增）

握手串 `opencode-mobile-files-handshake`（与 vault/probe/ssh/svcops 四桥互不误捕：各自「data 严格等值 + 恰一 port」）；native-initiated WebMessageChannel、JS 形状校验捕获 port2、ack 前零能力、5×500ms 重试（通道重建）、requestId 关联、超时显式 `unavailable`；JSON 双向零二进制（base64 过桥）、零凭据过桥、零值日志。白名单恰四 op（issue #76 增第四 op `openExternal`）：

| op | 载荷 | 返回 | 错误码 |
| --- | --- | --- | --- |
| `clipboardImage` | `{}` | `{name, mime, data(base64)}` 或 `null`（无图像） | `unsupported`（非 content:// 或非 image/* 形态）、`unavailable`、`io` |
| `save` | `{name, mime, data}` | `{saved:true}` / `{saved:false}`（用户取消） | `unsupported`（name 非法）、`busy`（已有 pendingSave）、`io`、`unavailable`、`too-large` |
| `share` | `{name, mime, data}` | `{shared:true}` | `unsupported`、`busy`、`io`、`unavailable`、`too-large` |
| `openExternal`（issue #76） | `{url}` | `{opened:true}` / `{opened:false}`（拒绝/失败——**永不 wire-error**：Platform 契约为 `void`，拒绝与失败均走 `{opened:false}` + native Toast） | 结构上仅 `{opened:false}`；无 in-flight 状态故无 `busy` 面 |

错误码集合 `FILES_ERROR_CODES = unavailable/too-large/unsupported/io/busy/cancelled` 六码（`packages/mobile-hosts/src/files/errors.ts`）。**`MAX_BRIDGE_BYTES = 32 MiB`** 单消息原始字节上界（超界 → `too-large` 显式码），**双侧校验**（JS client 前置拒绝 + Kotlin 镜像 native re-check）；与 inline 20 MiB / 媒体 256 MiB **三界各自独立、如实并列**。

**save op 的 SAF 语义表（与上游 export 契约逐字对齐）**：`true` = 已保存到用户所选落点（成功 toast）；`false` = 用户取消（`use-session-commands.tsx` 静默 return，无 toast）；throw（错误码）= 上游 catch → failed toast。`pendingSave` 恰一（并发 save → `busy` 显式拒绝，不排队不覆盖——与 chooser 41001 exactly-once 分域并存）；`REQUEST_SAVE_DOCUMENT = 41002` 与 chooser `REQUEST_FILE_CHOOSER = 41001` 独立分发。

**name 双层形状校验（JS + Kotlin native re-check，vault `ENTRY_ID`/`MAX_VALUE_BYTES` 房规同款）**：JS 侧 `files/client.ts` `sanitizeFilename`（basename 化、白名单字符集（字母/数字/空格/点/下划线/连字符/常见括号方括号）、拒绝 `/`、`\`、`..` 段、控制字符、前导点、空名，长度 ≤128；非法 → 显式 `unsupported`，**不做内部 strip——分隔符一律拒绝（不做 basename 化转换），basename 由调用方 `getFilename` 完成**；不 import vendor——mobile-hosts 零 vendor 依赖）；Kotlin 侧 `FILENAME` 正则 native re-check（非法即 `unsupported`、**绝不落盘**；save op 亦先过 re-check 再起 SAF，`EXTRA_TITLE` 只收已净化名）。

**模块级 seam（app-service-operations-bridge `setActiveServiceOpsPort` 先例）**：`setActiveFilesPort`/`activeFilesPort`（`packages/mobile-hosts/src/files/client.ts`）；**fail-closed stub 默认**（无注入时）：`clipboardImage → null`（与「web 平台无此字段」等价——paste 链静默走文本路径）、`saveFile → false`、`shareDataUrl → false`（false → attachments-share-bridge 回退 anchor，与「无字段」等价）、`openExternal → false`（issue #76：与 `void` 契约的失败闭合形态等价——上游消费点无 try/catch，false 无读取方；桥 ack 前 stub 应答 false、Platform 面忽略之）。**saveFile 分字段不等价（M1，有意行为变更）**：字段缺席 = `downloadSessionExport` anchor 回退 + true（假成功 toast，WebView 内 anchor 死点）；字段在且 stub false = 静默取消（无 toast 无 anchor）。裁定 stub=false（保持 Platform 契约「false=用户取消」语义统一；不选 throw——GUI 扩展宿主侧异常传播面不受控）；桥降级时导出从「anchor 死点+假成功」变为「静默取消」，更诚实。`mobile(files-v1)` marker 常量入 `FILES_BRIDGE` 常量对象（dist 标记先例同型）。

## 状态矩阵（单元级）

| 面 | 状态 | 语义 |
| --- | --- | --- |
| 上传 | queued → uploading（progress）→ done / cancelled / failed | done=`addPath` path part（远程工件）；cancelled=abort 后返回 undefined、不加 part；failed=`prompt.toast.uploadFailed.title` toast（重试=重新发起，无自动重试——上游语义如实） |
| 导入（chooser） | picked → mime-sniffed → inline \| path 上传 | 嗅探 4 image mime + pdf 直判；空/octet-stream 按扩展名回退；text 归一 `text/plain`；NUL/控制字符比率 >0.3 → binary。unsupported 类型照常走 path 上传（上游三路分流兜底，无独立「拒绝」态——如实） |
| 导出（SAF） | saved（落点可达）/ cancelled（静默）/ failed（toast） | saved=`{saved:true}`（G27④ 经系统文件应用核对产物）；cancelled=`RESULT_CANCELED → false`（上游静默 return 契约）；failed=错误码 throw → 上游 catch toast。**无桥降级=静默取消（M1，非 anchor 假成功）** |
| 剪贴板 | image（File）/ null / unsupported | image=构造 File 喂上游 paste 链（字节判重）；null=静默走文本路径（与「无字段」等价）；unsupported=非 content:// image 形态显式码（负例在册） |
| 分享 | sheet（系统分享面板）/ cancelled / failed / too-large | sheet=目标 App 收到内容（只读临时授权）；cancelled/false 与失败/桥不可用 → 回退 anchor.download（L6 钉死口径）；too-large 超 32 MiB 显式码 |
| 外跳（openExternal，issue #76） | OPEN（ACTION_VIEW 交给系统默认处理器）/ refused（policy 拒绝）/ failed（无处理 App / SecurityException / 硬失败） | 三失败路径全部 `{opened:false}` + **固定文案 native Toast**（`external_open_failed`「Unable to open external link」，LENGTH_SHORT、零 URL 内容、不节流——一次点击一次尝试，用户即限速器；en-only 首版，zh 补齐候选在册）；桥未 ack stub=false = 静默（void 契约闭合形态） |

## Android 文件交互专节

- **chooser seam 与 #4 增强边界**：#4 的 `onShowFileChooser`（`ACTION_OPEN_DOCUMENT + CATEGORY_OPENABLE`）保持 exactly-once 纪律（新请求前旧 callback 答 null）；本期增强不改「bounded temporary access only, no takePersistableUriPermission」注释纪律。multiple 与 acceptTypes 在 #4 单选 `*/*` 版本全部丢失，本期补齐（MIME/扩展名映射口径见能力来源表；`EXTRA_MIME_TYPES` 配 `type="*/*"` 的 Android 语义）。
- **SAF 保存与一次性写授权**：`ACTION_CREATE_DOCUMENT` 返回的目标 URI 经 `openOutputStream` 一次性写——非 persistable 的 activity-result 授权随接收方任务栈销毁/设备重启由系统回收，无 persistable 即无 releasePersistableUriPermission 之需（「无需显式 revoke」论证）；零临时文件即零 save 清理面。SAF 对话框覆盖 Activity 界面期间 WebView 不失生命周期（对话框为 Activity 结果流而非新任务）；Activity 重建即新 FilesBridge 实例，pendingSave 随旧实例消亡，无跨重建泄漏；SAF 期间进程死亡/重建导致 onActivityResult 丢失 → JS 侧 transport 超时（显式 unavailable）→ 上游 export catch → failed toast，失败路径闭合。
- **URI 权限一次性纪律**：chooser（#4 既有）一次性访问不取 persistable；剪贴板 content:// 一次性 `openInputStream`（无 persistable）；SAF 一次性写授权；share 经 `FLAG_GRANT_READ_URI_PERMISSION` 显式授予 + 代际清理。**manifest 零新权限**（INTERNET 已足；SAF/剪贴板/分享均无需运行时权限）+ `<provider>` 声明一处（ShareFileProvider，authority `ai.opencode.mobile.share`）。
- **外跳面（openExternal，issue #76/N08）**：第四 op 承接 Platform `openExternal`（files-open-external 把 web.ts 的 `window.open` 同窗导航换为桥调用——壳 WebView 无 `setSupportMultipleWindows`，`window.open` 或为 no-op 或把整壳同窗导航离壳，即缺陷本体）。native 侧：`ExternalOpenPolicy`（`ai.opencode.mobile`，纯 JVM、零 android import，CameraGrantPolicy 加严同型）在后台解析线程裁决 → 主线程 `ACTION_VIEW` **直开**（上游「default system application」语义；chooser 每次弹选择器为移动反 UX 且零安全增益）+ 恰一回包。失败呈现=固定文案 Toast（LENGTH_SHORT、零 URL 内容、不节流——显式登记；en-only 首版 `values/strings.xml` 唯一新增资源，zh 补齐候选在册）。MainActivity/AndroidManifest 零改动（出站面零 intent-filter/零 scheme/零新权限——入站 VIEW 哨兵 verify-pairing 组 3/4/6 原地保持，外链唤起已确认不实施（决策 0007，2026-10-31）不受扰）。切回稳定：外跳 → 浏览器返回键/Recents 切回，壳状态与六桥 bring-up 不受扰（QA-5）。
- **share provider 授权与代际清理生命周期**：`ShareFileProvider` 手写最小 ContentProvider（`openFile` 只解析 `cacheDir/share/` 子树内文件名、分段路径校验拒绝穿越；`query` 仅返回 name/size/type；无写能力）；分享 staging 放 `cacheDir`（系统不备份 cache，`allowBackup=false` 主控）；代际清理=保留当前代、新代写入成功后删更旧代、onDestroy 全清（ACTION_SEND 异步无完成回调，非「分享完成后即清」——已打开的旧文件目标 App 持 fd 不受 unlink 影响，残留竞态窗口由 G27⑤⑦ 覆盖）。

## 安全专节

- **远程路径呈现 vs 泄漏的精确界**：UI 呈现远程路径给已认证用户是上游设计（附件芯片 Tooltip `attachment.path`、file tab、面包屑——用户自己的服务器路径）；红线是：①logcat/桥消息**零值日志**（MainActivity/vault 既有纪律，新桥沿用）；②save/share 文件名只用上游 `filename`（导出 slug 化、附件芯片经 `getFilename` 末段化）——**绝不含 `info.paths.tmp` 或服务器绝对路径形**；③导出/分享动作不把设备路径上传远端；④文件面零凭据过桥（凭据面=vault，#4/#14 分层沿用）；⑤桥写路径 name 双层净化（B2）。
- **name 双层净化**：对抗数据流=远端消息 part 污染 `file.name`（`region.tsx` data: 分支 name 来自远端 part）→ 写点逃逸 `<uuid>` 目录。封死=JS `sanitizeFilename` + Kotlin `FILENAME` native re-check 双层（六负例：`../`、含 `/`、含 `\`、绝对路径、空串、超长 → `unsupported`）；写点恒在 `<uuid>` 目录内；读路径（ShareFileProvider）路径穿越拒绝对称。
- **身份分离**：PathAttachmentPart（远程路径工件，字节永不入 draft store）vs ImageAttachmentPart.blob（设备副本，content-addressed IndexedDB）+ 发送侧 file:// 记号 vs dataUrl 双形态 + attachments-share-bridge 仅触 data: 分支（file:// 分支零改动）。
- **三界如实并列**：inline `MAX_INLINE_BYTES = 20 * 1024 * 1024`（上游）；桥 `MAX_BRIDGE_BYTES = 32 MiB`（新面）；媒体 `MAX_MEDIA_BYTES = 256 * 1024 * 1024`（上游）。
- **外跳 URL 强制策略（issue #76）**：native `ExternalOpenPolicy` 为唯一强制层（JS 门仅第一层、不受信）：`java.net.URI` 严 parse（空白/控制字符/相对引用/坏 authority 一律拒绝）、scheme 小写归一后**恰 http/https**、`rawUserInfo != null` 拒绝（决策 0002 D-URL 同源：凭据不进 URL，`https://good.com@evil.com/` 混淆形同杀）、host 必须可解析、端口界 -1..65535 加严（`java.net.URI` 对越界端口不抛——解析器分歧面 fail-closed）、`raw.length > 2048` 拒绝。**不做域名白名单（有意裁定）**：三个真实消费类（OAuth authorize URL、MCP elicitation `external` 字段、GUI 插件 host API 直通）域名为无界/远程受控集合，硬白名单打断自管服务器 OAuth（G25 族核心流）且白名单维护面自身成为攻击面。**parser-differential 单点校验**：intent 以 policy 接受的**同一字符串** `Uri.parse(accepted)` 构造，零二次归一化——URI 拒绝的字符串永不触达 android.net.Uri.parse。回环目标（`http://127.0.0.1:18090`）不特判（浏览器打开的是公共前端静态资产，零凭据在 URL）。零值日志：URL/异常消息永不入 logcat（handleOpenExternal 域负例探针锁定）。

## 能力边界专节

- **session import 入口移动隐藏**：`home/projects/controller.tsx` `canImportSession: !!platform.openAttachmentPickerDialog`——web 恒 false → 项目卡「导入会话」入口移动隐藏（上游实态）；本期不提供 `openAttachmentPickerDialog`（其 platform 级对话框契约与 input file chooser 不同），该入口保持隐藏并如实登记（G27 呈现核对项；未来若需，属新范围）。
- **无自动重试/无完整性校验和**：上传失败 → 失败 toast，用户重新添加即重新上传；成功判据=200（无校验和字段，如实登记）。
- **saveFile stub 降级语义差异（M1）**：见数据契约节；**特别不声称「桥降级时导出仍可用」**——降级=静默取消。
- **photo picker 专面（PickVisualMedia）不本期**：导入面=系统 document/photo picker 经 `ACTION_OPEN_DOCUMENT` 承接（ACTION_OPEN_DOCUMENT 即系统文档/照片选择面）；专用 Photo Picker API 不在本期交付。拖拽导入（Android WebView 拖拽语义未验证）不本期。
- **anchor.download 回退面死点如实**：壳未设 DownloadListener → 下载动作无处理者；`blob:` URL 在 native 侧不可解引用、`data:` URL 会把整串 base64 塞进回调——保存/分享必须经壳层桥字节通道，上游 anchor 回退在壳内是死点（files-platform-bridge 无条件 stub 注入后，本仓 dist 内 anchor 回退仅剩 share 分享失败回退与桌面浏览器开发场景）。
- **office 渲染归 #18**：officeKinds（docx/xlsx/pptx）的默认路径是 microsoft-office 扩展查看器链（viewer memo 命中→ArtifactViewer→引擎渲染，见 [artifact-viewers.md](artifact-viewers.md)）；binary 占位仅在扩展被禁用/缺席、`problem()` 魔数预检拒绝、引擎失败三情形（#16 时点「占位呈现」表述已随 #18 勘察订正）。Office 渲染的运行期验证归 #18（G29）；G27 不含 Office 项。
- **mailto 第一方 delta 如实枚举（issue #76，订正既往「全树零 mailto 消费者」误判）**：上游 web 门（web.ts 协议白名单）与 microsoft-office 链接协议表（`microsoft-office/links.ts` `schemes = ["http:", "https:", "mailto:"]`）都放行 mailto；**真实在册消费链=Office 文档链接链**（links.ts `externalUrl` → `document.tsx:105` `ctx.system.openExternal(link.url)`，#18/G29 域）。本期裁定后该链的 mailto 形态在移动= **native 拒绝 + `{opened:false}` + 固定文案 Toast**（上游桌面/浏览器实态=邮件 App 外跳）；**当前壳内无可用实态可回退**——Office 文档正文在移动本就经查看器链渲染（G29 运行期未验证），「文档内 mailto 链接点按外跳邮件 App」在壳内不存在可工作的既有行为可降级，故 delta 呈现=拒绝 + Toast 即完整行为（非静默降级）。http/https 形态照常 OPEN（最小外跳面）。**vendor-sync 升级项在册**：同步上游时 grep mailto 消费点，范围= `microsoft-office` links 族 + `session-ui` markdown 链接族两域（上游新增 mailto 消费点在移动即触发本 delta 的拒绝路径，需计划修订而非静默吸收）。
- **window.open 残余面如实（issue #76 勘察）**：files-open-external 后全树 `window.open(` 调用点仅剩 `gui-plugins/src/updater/beta-dialog.stories.tsx` ×3（storybook fixtures——桌面 story 场景，web 生产构建结构性不打包）；SPA `target="_blank"` 锚恰两处（`session-ui/src/tools/tool-renderer.tsx` :435/:1700，verify-interaction-quality 组 2 在册锁 exactly 2 + G31② 例外类成员）——该残余面属 WebViewClient 兜底加固候选（`shouldOverrideUrlLoading`/`onCreateWindow` 层拦截），**登记新后续 issue 不入本期**（触碰 MainActivity，且 #75 正占用该文件冲突面）；浏览器面板（`browser/panel.tsx` openExternal 按钮）为页面内容外跳的既有上游面，非 WebView 导航层。
- **OpenInBrowser 移动不可达**：`artifact-view.tsx OpenInBrowserButton` 依赖 browser GUI 扩展 main 进程 CDP 面（#15 已证 web 结构性缺席）——html 工件的该按钮在移动恒隐藏（G27 呈现核对项）。

## 门禁与验证

- **G27**（[interaction.md](../interaction.md) 第十三处新设）：附件/工件/Android 文件交互运行期真机清单十项（五桥并存 bring-up/attach 全链/导入失败路径/SAF 保存全链与落点可达/data: 分支分享与 file:// 实态/剪贴板图片链/设备痕迹负例/无桥降级静默取消实态/窄屏读屏触摸目标/双路由+真实远程服务）。
- **V-probe**：`scripts/verify-attachments-artifacts.ts`（断言组：fs.write 穷举基线复验恰 `{destination.ts}`、files-platform-bridge/attachments-share-bridge 锚、双层净化锚、桥面锚、零 OS 域 + 负例控制演示）。诚实边界：静态结构检查，对运行时行为零证明力。
- **V-oe（issue #76）**：`scripts/verify-open-external.ts`（新静态探针三组：JS 面 files-open-external 形/零 window.open 负例/FilesPort 四成员/client 永不 throw 形状；native 面 policy 六门+桥四 op 集+Toast/零值日志负例/manifest witness——verify-pairing 组 3/4/6 引用不重锁；files-open-external 双注册 witness——39=39 主锁归 verify-about-version/attachments-artifacts/commands-menus）+ 负例五组 inject→FAIL→还原→PASS（.probe-logs/negex/）。`ExternalOpenPolicyTest` JVM 决策矩阵（OPEN 组含大小写归一/恰 2048 边界；REFUSED 组 11 协议形 + 11 解析/结构形 + 4 userinfo 形 + 缺 host + Decision 枚举面恰二）。
- **V-mh**：mobile-hosts 新增 `test/files-{transport,client}.test.ts`（握手捕获/互不误捕/超时/fail-closed stub 三方法语义/saveFile stub=false 单列/上界拒绝/clipboardImage File 构造/shareDataUrl data: 解析与非 data: 拒绝/name 净化六负例）——第一方直接门禁，新基线数记入 build-and-verify。
- **V-upstream**：app 子集 64→**66 文件**（新增 `session/commands/export.test.ts` + `runtime/server/image.test.ts`，均已对 #8–#15 在册清单去重核对为真新增；首跑逐例归因门适用）。
- **Kotlin 编译**：`cd android && ./gradlew :app:compileDebugKotlin` rc=0 为壳层提交门禁（APK 打包仍 BLOCKED——jsch+bcprov packaging 块用户决策，不声称）。
- **装配层覆盖口径**：`composer/attachments/{attachments.ts,destination.ts,uploads.tsx}`、`artifact-view.tsx`、`file-media.tsx` 上游零直接测试——覆盖=探针（结构）+ V2（构建）+ G27（真机）三层，与 #10 dock/#11 files 口径同型；纯逻辑（export 双分支/image mime 表）已入 app 子集。

## 诚实边界

- **G27 全部运行期行为 BLOCKED**：五桥 bring-up、attach 全链手感、上传真实远端进度节奏、SAF 保存对话框与落点可达性核对、share sheet 与目标 App 授权、剪贴板图像跨形态实态、设备痕迹负例、无桥降级静默取消实态、触摸目标/读屏——本交付只声称「文档/探针/单测/编译级已验证，运行期已实现（未验证）」（第十三处落字）。
- **服务端语义来源边界**：fs.write 零围栏/paths.tmp 语义/上传接收行为引上游 pin 缓存（非闭包）；真服务上传核对归 G27⑩/live E2E。
- **新面边界（设计裁定，非缺陷）**：①剪贴板仅 content:// image 形态（bitmap-Intent 等显式 unsupported）；②桥字节上界 32 MiB（超界显式 too-large；WebMessagePort 对数十 MB JSON 串的投递上限未经真机证实——投递失败表现为请求超时（显式 unavailable），与内存 OOM 两种触发独立归因，处置均为常量下调或分块（分块属新协议面，需计划修订））；③file:// 远程工件不提供设备侧分享（身份分离设计）；④share 临时目录=代际清理（非「分享完成后即清」）；⑤saveFile 桥降级=静默取消（与「字段缺席」不等价——有意行为变更）；⑥save 落点=用户经 SAF 所选位置，壳不持有也不复制产物（一次性写授权，零持久副本）。
- **上游能力边界（非本期缺口）**：desktop 原生 saveFile/readClipboardImage 实现不在闭包（desktop 包剥离——引缓存分层）；ArtifactView 无保存按钮（工件保存面仅 timeline 附件芯片与会话导出两条）。
- **Office/IDE/Explorer 排除**：Office 渲染归 #18；外部 IDE/Explorer 打开按 #11 既有门槛排除（`ctx.desktop` web 恒 undefined、`canOpen` 双门槛、拖拽 mobile 禁——verify-files 探针既有断言继续生效），本期零改动。
