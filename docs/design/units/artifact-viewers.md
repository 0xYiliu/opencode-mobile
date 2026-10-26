# 单元：artifact-viewers（工件查看器与 Office/富媒体渲染）

状态：**已实现（未验证）**（issue #18）。本单元为**零新建界面/零运行时代码/零壳层改动/零 vendor patch/零依赖变更**的**上游复用固化单元**：14 种工件 kind（image/svg/audio/video/pdf/html/markdown/mermaid/table/font/document/spreadsheet/presentation/text）的渲染面全部由上游闭包承载——其中 document/spreadsheet/presentation 三 kind 由内建 GUI 扩展 `microsoft-office`（依赖 `@betteroffice/docx`/`@betteroffice/xlsx`/`@betteroffice/pptx`/`@betteroffice/fonts` 的 Rust+WASM 引擎，每格式引擎按需懒加载、每文件独立 worker）经 `FileViewer` 扩展契约注册，其余 11 kind 由 `artifact-view.tsx` 直接渲染。本期交付=本单元文档 + 静态探针 `scripts/verify-artifacts.ts` + 上游子集扩充（gui-extensions 17→22 文件、util 新域 1 文件）+ **G29 设备门禁**。全部运行期行为未经设备验证：真机门禁见 **G29**（[interaction.md](../interaction.md)），PDF 与 CJK 两项运行实态为 G29②⑥ **判定点**（见「PDF/CJK 两不确定点专条」，本文不断言其结论）。

行号声明：本文引用的行号为 vendor pin `b4525d79bf` 时点值，仅供定位；权威以引号内源文本锚为准（静态探针 `scripts/verify-artifacts.ts` 锁定）。

## 能力来源（复用面锚，零新面）

| 面 | 实现锚 | 状态 |
| --- | --- | --- |
| kind 契约 | `util/src/artifact.ts`（95 行）：`ArtifactKind` 14 枚举；`mimes` 扩展名→MIME 表 **44 键**（12 image+9 audio+6 video+1 pdf+2 html+3 markdown+2 mermaid+2 table+4 font+3 office）；`officeKinds` 三 MIME→三 kind（wordprocessingml.document→document、spreadsheetml.sheet→spreadsheet、presentationml.presentation→presentation）；`artifactKind` 判定序：无 mime→text、svg→svg、pdf→pdf、html→html、markdown→markdown、mermaid→mermaid、csv/tsv→table、image/*→image、audio/*→audio、font/*→font、officeKinds→三 kind、其余→video（上游权威测试 `util/src/artifact.test.ts` 在册） | 已实现（未验证） |
| 查看器主面 | `gui-extensions/src/file/artifact-view.tsx`（897 行）：`previewableKinds` 五 kind `{svg, html, markdown, mermaid, table}` 有 preview/source 切换（source=宿主代码视图）；主 `Switch` **8 个 Match 分支**：`image|svg`→ArtifactImage（blob URL+缩放平移+Fit+onError→binary 回退）、`video`→ArtifactVideo（`<video controls playsinline>`+popover 全屏）、`audio`→ArtifactAudio（卡片+`<audio controls>`）、`pdf|html`→ArtifactFrame（iframe blob URL）、`font`→ArtifactFont（FontFace 装载+字样标本）、`table`→ArtifactTable（parseDelimited+`view.table.truncated` 截断提示）、`markdown|mermaid`→Markdown 管线、fallback `ArtifactBinary`（文件图标+文件名+`view.binary` size+reason 三元呈现，注释逐字「Bytes the viewer rejects, and a viewer that throws, show the binary placeholder in this area alone rather than the whole file panel failing.」）。未匹配任何分支的 kind（document/spreadsheet/presentation）走 `viewer()` memo：`ctx.list(FileViewer).find((item) => item.kinds.includes(value))`（注释逐字「A kind the file view does not render itself goes to the first extension viewer that lists it.」）→ `ArtifactViewer`（`problem?(bytes)` 预检 → ErrorBoundary → Dynamic View） | 已实现（未验证） |
| Office 扩展 | `gui-extensions/src/microsoft-office/`（31 文件）：`index.ts` `Extension.define({ id: "microsoft-office", i18n: { en } })`（头注「Read-only previews of Word, Excel and PowerPoint files in the file view.」，**无 platform/uses 门槛字段**）；`renderer.tsx` 注册**三个** FileViewer（document/spreadsheet/presentation 各 `lazy(() => import(...))`），头注逐字「Each format loads its engine, several megabytes of wasm, only when a file of that format opens. Nothing preloads: most sessions never open an Office file.」；`problem()` **魔数预检**：zip 签名 `[0x50, 0x4b, 0x03, 0x04]` 通过；Compound File 签名 `[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]`（口令保护/旧版 .doc/.xls/.ppt 二进制格式）→ `"problem.compound"`；其余 → `"problem.format"`——注释逐字「Bytes no engine can open fail here, before their viewer and its engine download.」 | 已实现（未验证） |
| worker 引擎 | 三查看器实现各持独立 worker：`document.tsx`（`new Worker(new URL("./document.worker.ts", import.meta.url), { type: "module" })`、bytes movable buffer 转移零拷贝、首页即渲+分步补排、透明文本层可选可查可链、外链 `ctx.system.openExternal`）、`spreadsheet.tsx`（sheet tabs/选区复制/canvas 绘制）、`presentation.tsx`（幻灯片位图+讲者备注+隐藏页标注）；`worker-rpc.ts`：`WorkerClosedError` 三文案（「The Office engine stopped」/「The Office engine sent an unreadable reply」/「The Office engine was closed」） | 已实现（未验证） |
| 字体面 | `microsoft-office/fonts.ts`：注释逐字「Every face loads from the app's own files, so no font request leaves the machine.」——metric-compatible 兜底族（Carlito/Caladea/Gelasio/ComicRelief 等）+逐 worker 缓存；`fonts-cjk.ts`：`export const CJK_FONT_ASSET_URLS = undefined`（注释逐字「The add-on is about 33 MB, so the app aliases it to this module, which offers no faces: those scripts fall back to the bundled Latin faces.」——CJK 未随包，见专条） | 已实现（未验证） |
| 壳层资产服务 | `android/.../WebAssetServer.kt` `MIME_BY_EXTENSION` 显式表（#2/#13 在册）：`"js"/"mjs"`→text/javascript（worker chunk 服务）、`"wasm"`→application/wasm、`"ttf"/"otf"/"woff"/"woff2"`→font/*——Office 渲染所需三类资产（worker JS/wasm/字体）的 MIME 全部在册；路径解析防穿越沿用；资产根 `assets/web/` | 已实现（未验证） |

## 数据与资产契约

全部引用 vendored 与构建产物在册事实，不另行定义契约。

- **14 kind × 渲染器 × 字节策略**：kind 判定与 mime 全部来自 `util/src/artifact.ts` `mimes`/`artifactKind`（上表）；字节策略来自 `app/src/workspaces/files/artifact.ts`：`binaryKinds` 八 kind `{image, audio, video, pdf, font, document, spreadsheet, presentation}` 保留原始字节；`MAX_MEDIA_BYTES = 256 * 1024 * 1024`（注释逐字「Media above this stays a placeholder so the in-memory file cache stays bounded.」——超限→带 size 的可区分占位 `{type:"binary", content:"", size}`）；未知二进制（text kind + 前 8 KiB 含 NUL，注释逐字「Text files never contain NUL; a NUL in the first 8 KiB marks an unknown binary.」）不保留字节仅占位；文本 UTF-8 非致命解码。内容 LRU（`MAX_FILE_CONTENT_ENTRIES = 40` + `MAX_FILE_CONTENT_BYTES = 20MiB`，#11 在册）与媒体 256MiB、#16 桥 32MiB 三界各自独立。
- **worker 文件（dist 闭包在册，manifest 键）**：`_assets/document.worker-*.js`、`_assets/spreadsheet.worker-*.js`、`_assets/presentation.worker-*.js` 三枚 office worker（另有 markdown.worker/qr-scanner-worker 等非 office worker 与共享 `worker-rpc-*.js`）。
- **wasm 引擎（dist 闭包恰四枚，manifest 键实测）**：`_assets/docx_edit_bg-*.wasm`、`_assets/docx_parse_bg-*.wasm`（docx 引擎两枚）+ `_assets/pptx_wasm_bg-*.wasm` + `_assets/xlsx_wasm_bg-*.wasm`。
- **字体族（dist 闭包 ttf 86 个）**：BetterOffice metric-compatible 族 Caladea/Carlito 各 4 风格键在册（另 Gelasio/ComicRelief 等）；逐族版权与许可归属由上游 `app/src/settings/about/notices/fonts.ts` OFL-1.1 专节携带（见许可专节）。
- **离线语义**：字体全部同源（「no font request leaves the machine」）；引擎 wasm/worker 为 vite 同源 chunk，经回环 127.0.0.1:18090 加载，零外网请求。**运行期离线核对归 G29⑨ 飞行模式负例**（本机静态层仅证明「资产在闭包+MIME 在册」，不证明运行时加载）。

## 状态矩阵（文件 tab 四态 × 工件子态）

文件 tab 承接面=`gui-extensions/src/file/view.tsx` `SessionFileView`（#11 在册）四态：loading（`common.loading`）/ notFound（`tab.notFound`，`isFileNotFoundError` 归一）/ error（行内错误文本 + `toast.file.loadFailed`）/ loaded。loaded 时「Plain text keeps the code view; every other kind is rendered by ArtifactView」（注释逐字）——移动与桌面同组件。loaded 内容的工件子态：

| 子态 | 触发 | 呈现 | 文案锚 |
| --- | --- | --- | --- |
| 预检拒绝（compound） | Office kind 魔数为 Compound File（口令保护/旧版 .doc/.xls/.ppt） | ArtifactBinary 占位（文件名+大小+reason），引擎不下载 | `problem.compound`：「This file is password-protected or saved in an older Office format.」 |
| 预检拒绝（format） | Office kind 魔数既非 zip 亦非 Compound（含伪装扩展名） | 同上 | `problem.format`：「This file is not a valid Office document.」 |
| 引擎失败 | 魔数通过但 `open()` reject / worker 死亡 / 消息不可解 | `props.onError()` → ArtifactBinary 占位（details 离开工具栏） | `WorkerClosedError` 三文案（engine stopped/unreadable reply/engine closed） |
| 局部失败（sheet） | 单个 sheet 打不开 / 局部绘制失败 / 复制失败 | 其余部分照常呈现，失败部分局部文案 | `sheet.openFailed`/`sheet.paintFailed`/`sheet.copyTooLarge`/`sheet.copyFailed` |
| 局部失败（slide） | 单页幻灯片失败 | 其余页照常 | `slideFailed`：「This slide could not be shown」 |
| 解码失败（media） | image/video/audio `onError`（浏览器无法解码字节） | `fail()` → binary 占位（注释逐字「The browser could not decode the bytes; the host falls back to the binary placeholder.」） | — |
| 大文件占位 | binaryKinds 超 `MAX_MEDIA_BYTES` 256MiB | 带 size 的 binary 占位（非空白） | `view.binary`（size 内插） |
| 未知二进制 | text kind 且前 8 KiB 含 NUL | binary 占位 | `view.binary` |

**零空白态**：任何 loaded 内容要么有渲染器、要么落在 ArtifactBinary 三元占位（文件名+大小+reason）。

## 许可与资产专节

- **`@betteroffice` 四包许可（许可链完整口径）**：docx/xlsx/pptx 三包为**纯 Apache-2.0**（bun 缓存 package.json+LICENSE 实读）；**fonts 包为 `"(Apache-2.0 AND OFL-1.1)"`** 且带 `LICENSES/` 目录——其内嵌字体族为 **SIL Open Font License 1.1**。上游分发物为 Office 预览字体设了**独立 OFL-1.1 归属专节**：`app/src/settings/about/notices/fonts.ts` 头注逐字「The font families the Office previews ship, each with the copyright lines its own license file carries. Every family is under the SIL Open Font License 1.1, so the license text is shown once.」+ Carlito/Caladea/Liberation/Gelasio/Comic Relief/Inter/Roboto/Source Sans 3/DM Sans 等**逐族版权行** + `notices/fonts/OFL-1.1.txt` 全文。
- **BetterOffice 条目与 crate 级归属**：上游 `settings/about/notices/notices.ts` 在册 `{name: "BetterOffice", detail: "@betteroffice/docx, @betteroffice/xlsx, @betteroffice/pptx, @betteroffice/fonts", url: "https://github.com/openooxml/betteroffice", license: "Apache License 2.0", notice: betteroffice-notice.txt + "Copyright 2026 The OpenOOXML contributors"}` + **Rust crate 级 notices**（`crateNotices`——「generated from the published Cargo.lock and crate tarballs. Each crate keeps its own copyright lines」）+ 同页 eigenpal docx editor（Apache-2.0）；app 设置 About 页有 Notices 入口。
- **与本仓许可审计的关系**：`scripts/license-audit.ts` PERMISSIVE 白名单含 `Apache-2.0` **且含 `OFL-1.1`/`OFL-1.0`**——fonts 包的 AND 表达式按既有的表达式拆分逻辑可通过；V4 审计的 1089 包已覆盖 bun.lock 内 `@betteroffice/{docx,fonts,pptx,xlsx}` 四包，**12 项待用户决策清单不含它们**。**结论：复用上游 Office 渲染面零新增许可义务**（引擎三包 Apache-2.0 与字体 OFL-1.1 的归属均已由上游在分发物内携带）；AGENTS.md「复用 OpenCode 代码前确定来源版本和更新策略，保留相应许可证及版权声明」由 pin+patches 机制与上游内嵌 notices 满足。NOTICE-THIRD-PARTY.md 未生成仍受既有 12 项阻塞，与本期无关不扩大。
- **CJK 未随包（上游裁定，非本期缺陷）**：`@betteroffice/fonts` 的 optional peer `@betteroffice/fonts-cjk` 不在 lock（约 33MB add-on 主动不随包）；`fonts-cjk.ts` 别名为零字体模块，中日韩文本以 bundled Latin faces 兜底渲染——中文用户的实态边界，**观感充分性归 G29⑥ 判定**（本文不断言「CJK 完整显示」）。
- **i18n en-only**：`microsoft-office/i18n/` 仅 `en.ts` 1 个 locale——office 查看器全部用户可见文案（pages/slides/sheets/problem.compound/problem.format/sheet.openFailed/sheet.paintFailed/slideFailed/sheet.copyTooLarge/sheet.copyFailed 等）**无中文**，zh 用户看到英文（上游实态，与 #14「zh 缺失回退 en」同型）。
- **秘密面**：本期零新面零存储写入——office 渲染的输入字节全部来自远程 fs.read 的内存流，不经桥、不入 draft store/IndexedDB（binaryKinds 字节在内存 FileContent 与 worker 之间转移）；零新增秘密暴露面。

## 移动形态专节

- **无平台门控（与 browser 扩展显式对比）**：`microsoft-office/renderer.tsx` 零 `ctx.build.platform` 早退——web/移动构建内注册且默认启用（`gui-extensions/src/renderer.ts` `builtins` compose 含 `microsoftOffice`；`app/src/runtime/platform/web.ts` `platform: "web"`）。对照组：`browser/renderer.tsx` 的 `if (ctx.build.platform !== "desktop") return` 早退（「The native pane is a desktop feature.」）。零 electron import（勘察实测零命中）；main 面不存在（#15 四证据链口径）。
- **文件 tab 同组件**：移动打开文件 tab（#11 MobileFiles）与桌面同一 `SessionFileView` → `ArtifactView` 链；office kind 默认路径是扩展查看器链（viewer memo 命中→ArtifactViewer→引擎渲染），binary 占位仅出现在①扩展被禁用/缺席②`problem()` 预检拒绝③引擎失败三类情形（#16 在册「占位呈现」表述已随本期订正，见 [attachments-artifacts.md](attachments-artifacts.md)）。
- **内存防线（上游第一道防线在册）**：①worker-per-file——`createKeyed(() => props.bytes, ...)` 键控，关文件 tab/切换文件即 onCleanup 终止 worker（注释逐字「Terminating it is what frees the engine's memory.」）；②bytes movable buffer 转移零拷贝；③页位图按需构建/远页释放（注释逐字「each built page holds megabytes in the engine. ... a paint releases the pages far from its own」）；④>256MiB 媒体不进内存缓存（带 size 占位）；⑤FileContent LRU 40 条/20MiB。**数十 MB 级文档在低端真机的实态未知，归 G29③**。
- **文档内外链**：office 文档内 http(s) 外链 → `ctx.system.openExternal` → web 实现 `window.open(_blank, noopener)`（G25③ 壳内实态在册不确定点，沿用不新增断言）；文档内书签/内部链接 → worker bookmark 定位。
- **扩展生命周期边界（#26）**：microsoft-office 作为内建 GUI 扩展的启用/禁用生命周期归 #26；本单元只固化「默认启用、无平台门控」的实态与「禁用时 office kind 落 ArtifactBinary 占位」的降级态（上表子态①）。

## 下载与身份分离专节

- **远程工件 vs 设备副本（#16 在册，本期复验零改动）**：schema 双类型 `PathAttachmentPart {path}`（远程工件身份，字节永不入 draft store）vs `ImageAttachmentPart.blob`（设备副本）；发送侧 `file://${path}` 记号 vs `dataUrl` 双形态；M-021 分享**仅触 data: 分支**、**file:// 分支零改动**（远程工件不触发任何设备侧动作——身份分离防线）；`verify-attachments-artifacts.ts` 断言 3（「remote artifacts keep upstream behavior」）继续生效。
- **下载面实态（上游能力边界，如实登记）**：工件查看器（artifact-view.tsx）**没有保存/下载 affordance**（探针 RAW 扫描基线=实测零命中）；设备侧保存仅两条既有路径=timeline 附件 data: 芯片（save/share 经第五桥）+ 会话导出（SAF）。**远程 Office/媒体工件当前无设备侧下载路径**——若产品需要「把远程工件存到手机」，属新面候选 **M-022+ 候选 A「工件下载：ArtifactView 增保存动作→经 files 桥 save op（sanitizeFilename 双层净化/32MiB 界/SAF 落点均在位可复用）」**，本期不预设、交用户决策；在用户决策前，「downloaded copy distinct」由既有 #16 面（timeline 附件设备副本 vs 远程工件）承载并经探针复验。
- **G29⑧ 负例**：file:// 工件全程零设备侧动作（无分享/无下载/无路径解析）；timeline data: 附件的保存/分享照常（设备副本路径与远程工件路径呈现可区分——#16 芯片区分复验）。

## PDF/CJK 两不确定点专条（实态判定项，非既立事实）

> 编写纪律：本节只登记**静态可证事实**与**静态风险**；两项运行实态均**未经判定**，任何文档/提交不得把「PDF 在 WebView 可渲染」「CJK 完整显示」列为既立事实。

- **PDF iframe（G29② 判定点）**：静态可证事实——pdf kind 走 `ArtifactFrame` iframe（blob URL + `#navpanes=0&view=FitH` PDF Open Parameters），注释逐字「The PDF viewer is Chromium's own and does not run in a sandboxed frame.」——**产出依赖宿主 Chromium 内建 PDF 渲染器**。「Android WebView 无内建 PDF 渲染器」（Chromium PDF viewer 属 Chrome 不属 WebView）为业界通识级**静态风险**，与上述事实并列在册；**真机实态未经判定**——不可用→按失败路径四步协议交用户决策（候选含 M-022+ PDF 查看面）；可用→核对渲染质量并回填本文。两分支均如实记录。
- **CJK Latin 兜底（G29⑥ 判定点）**：静态可证事实——CJK add-on（约 33MB）不随包、`CJK_FONT_ASSET_URLS = undefined`、中日韩文本以 bundled Latin faces 兜底渲染。**观感充分性未经判定**——不可接受→按四步协议交用户决策（候选含 M-022+ CJK 字体包评估）；可接受→回填本文。

## 门禁与验证

- **G29**（[interaction.md](../interaction.md) 第十五处新设）：artifact-viewers 运行期真机清单十项——①Office WASM 引擎加载与首渲染（本门禁首项=G8 落点，失败分支=验收 4 四步协议）；②14 kind 渲染矩阵实态与 PDF 判定；③大文档与内存压力；④损坏/旧格式/加密文件错误呈现；⑤旋转/resize 重排；⑥CJK 字体回退实态判定；⑦无障碍与 i18n；⑧下载/回退与身份分离实态；⑨离线资产加载负例；⑩双路由+真实远程服务。六类样例集（有效/大/损坏/旧格式/加密/不支持）不允许 fixture 替代真机项。
- **V-probe**：`scripts/verify-artifacts.ts`（断言八组+负例四组：kind 契约/查看器面/office 扩展+魔数/worker 资产闭包含 manifest 断言（4 wasm+3 office worker+字体键）/许可链含 OFL-1.1/错误路径/身份分离与零下载 affordance/零 OS 零 electron）。诚实边界：静态结构检查，对运行时行为零证明力。
- **V-upstream**：gui-extensions 子集 17→**22 文件**（新增 `src/microsoft-office/{fonts,links,sheet-cells,slide-text,worker-rpc}.test.ts`，首跑逐例归因门）+ util 新域 `src/artifact.test.ts` 1 文件（kind 映射表上游权威测试）。
- **装配层覆盖口径**：`document.tsx`/`spreadsheet.tsx`/`presentation.tsx`/`artifact-view.tsx`/`view.tsx` 装配层上游零直接测试（fonts/links/sheet-cells/slide-text/worker-rpc 为**纯逻辑或 worker 协议层** 5 文件）——覆盖=探针（结构）+V2（构建）+G29（真机）三层，与 #10–#17 口径同型，不声称单测覆盖装配层。

## 诚实边界

- **G29 全部运行期行为 BLOCKED**：Office WASM 加载与首渲染、14 kind 矩阵与 PDF 实态判定、内存压力实态、损坏/旧格式/加密呈现、旋转重排、CJK 实态判定、无障碍、身份分离负例、离线资产负例、双路由——本交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」（第十五处落字）。G29 未过≠Office 不可用。
- **PDF 呈现形态未判定**：见专条；判定前任何文档不得断言两可之外结论。
- **CJK 字体边界（上游裁定，非本期缺陷）**：33MB add-on 不随包、中日韩文本以 Latin 兜底；观感充分性归 G29⑥ 判定。
- **i18n en-only**：office 查看器文案仅 en，zh 用户见英文混排——上游实态如实登记。
- **上游能力边界（非本期缺口）**：①ArtifactView 无保存/下载 affordance——远程工件在设备侧无下载路径（候选 M-022+）；②文档外链经 `window.open`（G25③ 壳内实态在册沿用）；③office 引擎 wasm 体积（每格式数 MB）按需懒加载为上游设计（流量与首开延迟的权衡如实登记）；④引擎字体内嵌字体让位于 metric-compatible 兜底。
- **服务端语义边界**：工件字节全部经 `fs.read`（#11 围栏/ETag/Range 语义，服务端面引缓存分层）——本期零新增服务端语义。
