# 单元：files（远程文件浏览、搜索、查看与上下文引用）

状态：**已实现（未验证）**（issue #11；#143 增量：流式读取 + 文件订阅）。远程文件树/搜索/查看（含移动专属 `MobileFiles` 面）、行选择与 @-引用、文件评论上下文、消息内文件链接、文件 tab/滚动/行选择按 workspace 恢复、大文件/二进制/编码/陈旧处理——**全部由上游闭包承载**（`app/src/workspaces/files/*` + `app/src/composer/{model,request,prompt}` + `app/src/shell/state/layout.tsx` + `gui-extensions/src/file/*` + `client` 生成面），issue #11 本仓库零新建界面、零运行时代码改动、零 vendor 补丁。**#143 增量**（目标 v2.2.1 `3ebcf9a` copy 优先）：媒体走服务端 ranged read 流式读取（HEAD 探测 + `fileStreamUrl`，`artifact.ts`/`model.tsx`/`api.ts`）、`fs.watch`/`fs.unwatch` 文件订阅（`protocol/fs.ts` + 生成面 + `model.tsx` watch/unwatch/`server.connected` 重订阅），登记为 `files-stream-watch.patch`（`gui-plugins-api-migration.patch` 同轮重生成 model.tsx/artifact.ts hunks）。全部运行期行为未经设备验证：真机门禁见 **G22**（[interaction.md](../interaction.md)），真模型 live E2E（直连+SSH 双路由）BLOCKED；#143 轮真机亦因设备 adb 不可达 BLOCKED（见 build-and-verify #143 段）。diff 查看（review/diff 查看器）**不在本期**（`architecture.md` 单元清单 diff 行保持 TODO）。

行号声明：本文引用的行号为 vendor pin `b4525d79bf` 时点值，仅供定位；权威以引号内源文本锚为准（静态探针 `scripts/verify-files.ts` 锁定）。**来源边界**：服务端语义（`packages/core/src/filesystem.ts`、`packages/core/src/file-access.ts`、`packages/core/src/filesystem/search.ts`、`packages/core/src/filesystem/protected.ts`、`packages/server/src/handlers/fs.ts`、`packages/schema/src/{schema,filesystem}.ts`、`packages/protocol/src/groups/fs.ts`）**不在 vendored 闭包内**，引自上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `b4525d79bf`（同 [architecture.md](../architecture.md) CORS 节「来源表述」先例）；vendored 侧仅生成类型/端点/消费面可静态断言。pin 更新时缓存引文需随 PROVENANCE 演练同步。

## 能力来源（复用面，无新建第一方逻辑）

| 面 | 上游实现锚（`vendor/upstream/packages/...`） | 状态 |
| --- | --- | --- |
| 数据模型 | `app/src/workspaces/files/model.tsx`（383 行，`useFile` context）：树=`serverSDK.api.file.list({ path: dir, location: { directory: scope() } })`（响应映射 `FileNode{name,path,absolute,type,ignored}`，树节点 `absolute = \`${scope()}/${entry.path}\``）；查看=`api.file.read(request)`（源码跨行书写；声明 400/401/404、`binary: true`）；搜索=`api.file.find({ location, query, type, limit }, { signal })`（AbortSignal）；生成错误分类器 `isFileNotFoundError`（generated types.ts:2890，`_tag === "FileNotFoundError"`）。**#143 增量**（目标 v2.2.1 逐字 + 2 行调用点适配）：媒体 kind（`streamedKinds`=image/audio/video）走 `fileStreamUrl` + `(platform.fetch ?? fetch)(url, { method: "HEAD" })` 探测→`streamedFileContent` 版本化 URL，HEAD 失败/无 URL 回落 `api.file.read` 下载；`watch(file)`/`unwatch(file)`=归一化后 `api.file.watch/unwatch`（location 作用域、静默容错 `.catch(() => {})`），`server.connected` 时对 `attachment.files.opened()` 重发 watch（onCleanup 清理）——调用点由目标的 `api.experimental.file.*` 改为本 vendored 生成面 `api.file.*`（pin 生成面无 Experimental 命名空间，`mobile(files-stream-watch)` 注记在位） | 已实现（未验证） |
| path identity | `app/src/workspaces/files/path.ts` `createPathHelpers(scope)`：`normalize`（剥 `file://`/query/hash、`unquoteGitPath` git 引号路径、workspace 前缀剥离→**workspace 相对路径**为 store 键；根外路径保持绝对，注释「it is a file outside the workspace」）、`absolute()`（根外判定）、`normalizeDir`；Windows 盘符/Cygwin/UNC 兼容在列。文件 tab 身份=`fileTabId(files, path)`（`gui-extensions/src/file/path.ts`）；renderer `normalize` 锚「Older builds stored some files as absolute paths; one file is one tab once the workspace root is known」——编码名（如 `a%23b.txt`）单次解析后保持同 tab | 已实现（未验证） |
| 树 UI | `gui-extensions/src/file/tree-v2.tsx`（396 行）：tanstack virtual 虚拟化（`estimateSize: () => 28`）、行渲染为 `<button type="button">`（`as="button"`）、目录行 `aria-expanded`、活动行自动 scrollIntoView、聚焦行保持渲染（rangeExtractor 追加）；`tree-model.ts`（`buildFileTreeV2Model`/`flattenFileTreeV2`/`flattenLiveFileTreeV2`）纯逻辑可测 | 已实现（未验证） |
| 搜索 UI | `gui-extensions/src/file/browser.tsx` `SessionFileBrowserTab`：过滤输入 `role="combobox"`（`aria-controls`/`aria-activedescendant`/`aria-expanded` 接线）、`createQuery`（`file.search(value, { limit: 200, signal })`、`keepPreviousData`、`enabled: connected && query.length > 0`）、loading/空态均 `role="status"` + i18n；**搜索失败被吞为空结果**（`model.tsx` search 非 abort 错误 `.catch → []`）——呈现充分性核对归 G22③ 首项 | 已实现（未验证） |
| 查看器 | `gui-extensions/src/file/view.tsx`（528 行 `SessionFileView`）四态 `Switch`：loaded（text→代码视图 `fileComponent`：行选择/gutter/行内查找 `search.register` Mod+F；binary→`ArtifactView` 媒体查看器）、loading（`common.loading`）、notFound（`tab.notFound`）、error（行内错误文本）；滚动恢复 per tab 键 `file:${id}`（`layout.scroll`，rAF 双帧 restore，diffs-container shadow DOM 双向同步） | 已实现（未验证） |
| 移动专属面 | 文件面板注册 `mobile: { title: ctx.t("mobile.title")（「Files」/「文件」）, order: 20, kind: "menu", icon: "folder" }`（`gui-extensions/src/file/renderer.tsx`）；`createMobileViews`（`app/src/runtime/extension/mobile.tsx`）把带 `mobile` 配置的 Panel 收进窄屏视图切换器（`MobileViewTabs` + More 抽屉 `MobilePanelDrawer`，`session/screen.tsx` 消费）；`panel.placement() === "mobile"` 分支渲染 **`MobileFiles`**（`gui-extensions/src/file/mobile.tsx`，113 行）：`tree.all` 浏览按钮（`aria-pressed`）+ 打开文件 tab 条（`Tabs.List aria-label={ctx.t("mobile.openTabs")}`、逐 tab 关闭 `aria-label={ctx.t("common.closeTab")}`）+ `SessionFileBrowserTab mobile`（树+过滤+查看同组件）；renderer `open()`/`openResolvedFile` 窄屏处理（`layout.narrow()` 时 `layout.side.toggle`，「the mobile tab strip must register the new tab before it leaves the browser」）。桌面 side-region（`app/src/runtime/extension/side-region.tsx`）整体 768px 媒体查询门控，与本移动面互补 | 已实现（未验证） |
| 上下文引用 | @-引用：`app/src/composer/model.ts` `searchContextFiles`（候选源=`file.find` 经 `searchFilesAndDirectories`，`recent()` 置顶；选中产生 `mention: { type: "file", path, content: "@${path}", start, end }`；`file.attach` 命令 `mod+u`）。行范围：查看器行选择→`file.selection.set`（`view-cache.ts` `SelectedLineRange{start,end,side?,endSide?}` 持久化）；入上下文两通道——①查看器行内评论 `addCommentToContext`→`composer.attach({ type: "file", path, selection, comment, ... })`（preview=`previewSelectedLines` 行文摘录）；②会话命令 `app/src/session/commands/use-session-commands.tsx` `addSelectionToContext`/`addSelection`（`prompt.context.add({ type: "file", path, selection, preview })`；无选择 toast `toast.context.noLineSelection.*`）。消息内文件链接：`renderer.tsx` `LinkHandler`——`parseFileLink`（`:line`/`:line:col`/`:start-end`/`#L`，`resolve-link.ts`）解析→行范围选择→打开 tab 并 `applySelection`；存在性检查用「列父目录」而非读内容（`model.tsx` 注释「checking a path a message names transfers no content」） | 已实现（未验证） |
| 恢复 | tab 集合与活动 tab：`app/src/shell/state/layout.tsx` `sessionTabs: Persistence.record(...)`——键=`SessionStateKey`（`ServerScope` + workspace/session route 双段，`runtime/server/scope.ts`），值 `{ all: string[], active? }`，文件 tab 键形态 `file:${fileTabId}`；decode 迁移清洗按 `SessionStateKey.is` 过滤；LRU 上限 `MAX_SESSION_KEYS = 50`，逐出时 `dropSessionState` 名单 `["prompt", "file-view", ...scoped]` 连带删除 scoped store。每文件视图状态：`workspaces/files/view-cache.ts` `persisted(Persist.serverScoped(scope, dir, id, "file-view"), FileViewsSchema)`（`MAX_VIEW_FILES = 500` 修剪、`MAX_FILE_VIEW_SESSIONS = 20`；`FileViewState{scrollTop, scrollLeft, selectedLines}`，选择范围归一化 start>end 交换）。滚动：`sessionView.scroll`（250ms debounce + pagehide/visibility flush） | 已实现（未验证） |

## 数据与端点契约

全部走上游生成类型与端点（`@opencode/client`，`packages/client/src/promise/generated/{types,client}.ts`）。**本仓库不另行定义文件数据契约**；三端点 + 事件 + 发送侧 URI 形态全部引用 vendored 生成面与上游 schema。

### 端点（生成客户端 `client.ts`，全部声明状态码 `[400, 401, 404]`）

| 端点 | 方法 | 用途与语义（描述引 protocol @ 缓存原文） |
| --- | --- | --- |
| `/api/fs/read/${encodePath(path)}`（client.ts:1702，`binary: true`） | GET | 「Stream one file relative to the requested location with ETag, Last-Modified, and single-range HTTP Range support (206 Partial Content, 416 Range Not Satisfiable, and 304 Not Modified; multi-range and malformed Range headers fall back to 200)」（fs.read OpenAPI 描述 @ 缓存逐字） |
| `/api/fs/list`（client.ts:1715） | GET | 「List direct children using an absolute path or a path relative to the requested location, **including parents and siblings outside its directory**. Entry paths remain relative to the requested location; listing does not switch locations.」（fs.list OpenAPI 描述 @ 缓存逐字；**上游有意设计**，见安全专节） |
| `/api/fs/find`（client.ts:1727） | GET | 「Find recursively ranked filesystem entries relative to the requested location.」；location 作用域索引（ripgrep/fff 二选一 @ 缓存），无已声明错误类型（fff 初始化失败降级恒空结果）；home 目录扫描排除 `Protected.names()`（`filesystem/protected.ts` @ 缓存） |
| `/api/experimental/fs/write`（client.ts:1739） | POST | 「Unlike read, the target is not confined to the location.」——**文件浏览/搜索/查看路径零调用**；vendored app+gui-extensions 源码唯一线级调用点=`composer/attachments/destination.ts`（附件上传，attachments-upload-redirect-policy 校验面），归 #16（见边界专节） |
| `/api/experimental/fs/watch`（#143，protocol `fs.watch`，identifier `experimental.fs.watch`） | POST | 「Watch one file relative to the requested location for 24 hours, publishing filesystem.changed on that location when it changes. Watching an already watched file resets its expiry. Paths follow read confinement. Experimental: may change without compatibility guarantees.」（目标 protocol @ 3ebcf9a 逐字）；payload `{ path }`（相对 location）、success 204 NoContent、声明 400/401/404/**503**（503=ServiceUnavailableError，location 未就绪）；客户端消费=`model.tsx` `watch(file)`（tab 打开/展示时）+ `server.connected` 重订阅 |
| `/api/experimental/fs/watch`（#143，protocol `fs.unwatch`，identifier `experimental.fs.unwatch`） | DELETE | 「Stop watching one file relative to the requested location. Experimental: may change without compatibility guarantees.」（目标 protocol @ 3ebcf9a 逐字）；同路径同 payload、success 204、声明 400/401/404；客户端消费=`model.tsx` `unwatch(file)`；vendored 生成面 wrapper 名 `file.watch`/`file.unwatch`（`FileWatchInput/Output`、`FileUnwatchInput/Output`，去目标 `Experimental` 前缀——pin 生成面命名），watch 声明 `[400,401,404,503]`、unwatch `[400,401,404]` |

### `fileStreamUrl`（`runtime/server/api.ts`，#143 目标逐字，移动适配形态注记）

`fileStreamUrl(server, { path, directory })`：媒体元素（不可带 Authorization 头、凭据不得进 DOM URL）直连服务端 ranged read 的 URL 工厂——**`server.password` 存在即返回 `undefined`**（有密码服务的媒体改走 API 下载，语义同 `createApiForServer` 认证面）；无密码时产出 `<server>/api/fs/read/<逐段 encodeURIComponent 的 path>?location[directory]=<dir>`。**来源边界注记**：vendored `api.ts` 是移动适配形态（connection-utf8-basic-auth 与 session-client-compatibility 两补丁承载认证适配），`fileStreamUrl` 为 #143 以追加 hunk 方式落位（files-stream-watch.patch），非整文件 copy；所需 `ServerConnection` import 已在文件头。

### 类型与事件（生成面，不另行定义）

- `FileNode{name, path, absolute, type, ignored}`（`app/src/runtime/server/types.ts`；树节点 `absolute` 由客户端合成）。
- `FileContent`（text/binary 双形态 + `size`/`mime`）、`FileSelection{startLine, endLine}`、`SelectedLineRange{start, end, side?, endSide?}`（`workspaces/files/view-cache.ts`，side/endSide 为 additions/deletions Literal）、`FileSystem.Entry`（list/find 行）。
- 事件 `filesystem.changed`（generated types.ts:1612，data `{file, event: "add"|"change"|"unlink"}`，schema 标注 `ephemeral` @ 缓存）→ `watcher.ts invalidateFromWatcher` 失效链（见陈旧专节）。
- 发送侧上下文编码（`composer/request.ts` `buildPromptRequest`）：context 文件项 = `{ uri: "file://" + encodeFilePath(absolute(sessionDirectory, path)) + fileQuery(selection), mime, name }`；`fileQuery = ?start=${selection.startLine}&end=${selection.endLine}`——**行范围即 file URI 的 query 参数**；评论文走 `comments` 数组（`{path, selection, comment, preview, origin}`）拼入文本（`formatCommentNote`）。恢复：`extractPromptFromMessage`/`extractPromptContext`/`selectionFromFileUrl`（`composer/prompt.ts`）从已发消息还原 mention/上下文芯片/评论（含从 URI query 还原行范围）；composer 草稿含 context items 随 `Persist.serverScoped(prompt)` 持久化（#9 已交付机制）。

## 状态矩阵（单元级）

| 状态 | 上游锚点与语义 |
| --- | --- |
| loading | 树目录三态 `DirectoryState`（`tree-store.ts` loading/loaded/error）；文件查看器 loading 态（`common.loading`）；搜索 `isPending`（`role="status"` + `common.loading`） |
| empty | 空目录=loaded 且 children 空（树/查看器自然呈现）；搜索空结果 `role="status"` + `palette.empty` 文案 |
| loaded（text） | `new TextDecoder().decode(bytes)`（UTF-8）→ 代码视图（行选择/gutter/行内查找 Mod+F） |
| loaded（binary/媒体） | 已知媒体 kind（image/audio/video/pdf/font/document/spreadsheet/presentation）保留原始字节→`ArtifactView` 媒体查看器；未知二进制不保留字节（注释「the viewer only shows a placeholder for them」） |
| notFound | `setLoadError(file, message, notFound, silent)`——`isFileNotFoundError` 归一 notFound 态（查看器「tab.notFound」文案）且静默（已打开文件不弹 toast）；链接打开先 `files.sync(targetPath, { force: true })` 确认存在，「a file deleted since its link rendered shows the load error」 |
| error（文件） | 其余错误 `formatServerError` + toast `toast.file.loadFailed.title`（en「Failed to load file」/zh「加载文件失败」在册）+ 查看器行内错误文本 |
| error（目录） | 目录列表失败→`dir.error` + toast `toast.file.listFailed.title`（en/zh 在册）；树目录加载三态 error 在 `tree-store.ts` |
| permission（401） | HTTP 文件面**不经** `Permission.assert`——服务端权限=认证（declaredStatuses 含 **401**）+ location 可见性；401 走既有认证失败反馈、其余服务端错误 `formatServerError` 透传（见安全专节分层） |
| large | 媒体 `MAX_MEDIA_BYTES = 256 * 1024 * 1024` 超限→占位 `{ type: "binary", content: "", size }`（「Media above this stays a placeholder so the in-memory file cache stays bounded」）；内容 LRU（`MAX_FILE_CONTENT_ENTRIES = 40`、`MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024`）超限逐出后下次重取。**文本文件无客户端大小上限**（一次载入整文件字节）——超大文本在移动 WebView 的加载表现归 G22④ 真机核对（计划 R9，不预设分页/截断补丁）；HTTP 层另有 ETag/Range/304（fs.read 描述 @ 缓存） |
| binary | `isBinaryBytes`：「Text files never contain NUL; a NUL in the first 8 KiB marks an unknown binary」——前 8KiB 含 NUL→binary 占位 |
| encoding | 文本恒 UTF-8 解码且**非 fatal**（非法字节替换为 U+FFFD，解码从不抛错）——**无独立「编码失败」错误态**，如实分层（工具级 `Content.encoding: "utf8"|"base64"` schema 属 agent 工具读路径 @ 缓存，非本 HTTP 面） |
| stale | 五重客户端链 + ETag 再验证 + 索引 ≤10s 陈旧（见陈旧专节）；**#143 增量第六链**：文件 tab 打开/展示即 `api.file.watch`（24h 窗口、重复 watch 重置过期），`server.connected` 对已打开文件重发 watch（重启服务端遗忘订阅）——`filesystem.changed` 事件仍经 `invalidateFromWatcher` 失效链落地 |
| offline | 断连期动作失败走既有 toast/错误通道（`enabled: connected && ...` 使搜索在断连期不发请求）；重连后 `filesystem.changed` watcher 与快照语义补齐（与 session-workbench 恢复口径同构）；**#143 增量**：重连（`server.connected`）自动对全部已打开文件重发 watch、静默容错，watch 失败不弹错（旧服务器无该路由时零噪音）；运行期断连恢复呈现归 G22⑤ |

## 大文件/二进制/编码/陈旧专节（验收 1 失败路径落字）

- **大文件（客户端）**：`workspaces/files/artifact.ts` `MAX_MEDIA_BYTES = 256 * 1024 * 1024`——**仅媒体**超限占位（文本无上限，见状态矩阵 large 行）；`content-cache.ts` LRU `MAX_FILE_CONTENT_ENTRIES = 40` + `MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024`（`evictContentLru`，keep 参数保当前文件），逐出后重取。
- **大文件（HTTP 层）**：`handlers/fs.ts` `serveFile` @ 缓存——ETag（size+mtime 弱校验器）/Last-Modified/单区间 Range（206/416/304，multi-range 与畸形 Range 回落 200）/`cache-control: no-cache, no-transform`（注释「Clients must revalidate after agent edits」逐字）。
- **二进制**：8KiB NUL 判定 + 媒体字节保留 + 未知二进制占位（三态均有源码注释锚）。
- **编码**：UTF-8 非致命替换（U+FFFD），无独立错误态（如实）。
- **陈旧（stale-file，客户端五重）**：
  1. `filesystem.changed` 事件（ephemeral）→ `watcher.ts invalidateFromWatcher`——已打开文件 `load(file, { force: true, silent: true })` 重读、已加载目录 `refreshDir`、`.git/` 前缀跳过；
  2. HTTP ETag/`no-cache` 强制再验证（304 不重传）；
  3. 链接打开强制重读（renderer 注释逐字「Confirm the file exists before a tab appears for it; a file deleted since its link rendered shows the load error. Always reread: a cached copy can be stale.」+ `files.sync(targetPath, { force: true })`）；
  4. workspace 目录（scope）变化→ `createComputed(on(scope, …))` 清 inflight/`resetFileContentLru()`/`reconcile({})`/`tree.reset()`（model.tsx 注释「a reset after that load would discard its reply」逐字）+ renderer `moved` memo 重载聚焦 tab；
  5. LRU 逐出后重取。
  6. **#143 增量（服务端订阅链）**：文件 tab 打开/展示与重连时 `api.file.watch(path, location)`（服务端 watch 24h、重复请求重置过期；`filesystem.changed` 事件由此在生产端产生），静默容错 `.catch(() => {})` 是目标自带的旧服务器容错（旧服务无路由→404 被吞，零噪音）——客户端不自行轮询，事件消费仍走链 1。
- **流式媒体读取（#143 增量）**：`streamedKinds`（image/audio/video）媒体在 `model.tsx` `read()` 先以 `(platform.fetch ?? fetch)(fileStreamUrl(...), { method: "HEAD" })` 探测，响应 ok 则 `streamedFileContent` 产出 `v=<content-length>-<last-modified>` 版本化 URL（文件变化→URL 变化→元素重载），否则/无 URL 回落 `api.file.read` 全量下载——HEAD 失败的报错由全量下载路径呈现（HEAD 无 body，不另立错误态）。`fileStreamUrl` 有密码返回 undefined（凭据不进 DOM URL），密码服务恒走下载。
- **搜索索引陈旧**：服务端 `filesystem/search.ts` `REFRESH_INTERVAL = Duration.toMillis("10 seconds")` @ 缓存——搜索结果 ≤10s 陈旧（如实落字）。

## 安全与边界专节（验收 2/3 权威落字）

### 读路径围栏（服务端语义，引上游 pin 缓存；「绝不声称超出事实」口径）

`packages/core/src/filesystem.ts` `resolve` @ 缓存 `b4525d79bf` 对 `fs.read` 设**三重围栏**：①NUL 字节→`NotFoundError`；②`path.resolve(location.directory, input)` 后 `FSUtil.contains(location.directory, absolute)`（词法 `..` 攀爬→`NotFoundError`；`FSUtil.contains` 在 vendored `packages/util/src/fs-util.ts`）；③`fs.realPath(absolute)` 后 `FSUtil.contains(root, real)`——**符号链接逃逸同样归一**。另：非文件（目录）→`NotFoundError`。**四形态（缺失/穿越/符号链接逃逸/非文件）全部归一 NotFoundError（HTTP 404）**——不泄漏路径存在性差异。客户端形态：`workspaces/files` 全部服务调用带 `location: { directory: scope() }` 作用域、`isFileNotFoundError` 归一 notFound 呈现。

### `fs.list` 允许父/兄弟目录——上游有意设计（如实披露）

fs.list 的 OpenAPI 描述 @ 缓存**逐字**含「including parents and siblings outside its directory」；`filesystem.ts list` 仅 `path.resolve` 后 stat，无 contains 检查（`RelativePath` schema 为纯 brand 无校验 @ 缓存）。这是上游有意设计（浏览父目录），**非缺陷**；本期的围栏主张据此收窄为：**内容读取路径（read）服务端硬围栏 + 客户端树/搜索只产生 workspace 相对路径（`createPathHelpers` 产出、树节点来自服务端 list 结果）+ 移动端从不构造 `..` 目标**。真服务行为核对归 G22/live E2E（服务端语义引缓存非闭包）。

### `fs.write` 边界与唯一调用点（#16 基线断言）

`/api/experimental/fs/write` 不设围栏（「Unlike read, the target is not confined to the location」@ 缓存逐字）。静态探针穷举断言：换行容忍归一扫描 **app+gui-extensions 两包 `src/**`**（scan domain 写死于探针头注；**client 生成面单列不入集合**），`api.file.write|/api/experimental/fs/write` 线级调用点集合**恰为** `{composer/attachments/destination.ts}`——文件浏览/搜索/查看路径零写调用。生成客户端含 `file.write` 端点包装（client.ts:1735-1739），**无任何调用方**（N-5：SDK 层该端点距 app 一跳可达，防后续 issue 误读，特此声明）。上传/导出/分享整体归 #16（见下）。

### 权限分层（HTTP 面权限 = 401 认证 + location 可见性）

HTTP 文件 API **不经** `Permission.assert`——agent 工具侧文件访问才走 `file-access.ts` 的 `authorizeRead`（`action: "read"` + 越界目录 `external_directory` 批量审批 @ 缓存）。HTTP 面的服务端权限=认证（declaredStatuses `[400, 401, 404]` 的 401）+ location 可见性；「respect server permissions」在本期的客户端形态=401 走既有认证失败反馈、404 走 notFound/error 双态、其余服务端错误 `formatServerError` 透传。权限审批（permission.asked 的 read/external_directory）已在 #10 交付，其 `resources` 即文件路径——两单元在 permission-requests 一侧衔接，本期不重复交付。

### 路径身份与「绝不把远程路径当 Android 本地路径」

- 文件面全部读取经 `api.file.read/list/find` 的 `location: { directory: scope() }`（远程 worktree 为根的相对路径）；web 平台对象无任何本地文件读取入口；发送侧 `file://` URI 仅是**传给远程服务的路径记号**，从不被手机端按本地文件打开（web 平台无 file:// fetch 能力；读取恒走 `api.file.read` 的 location 作用域）。
- **IDE/Explorer 面在移动 web 构建结构性不存在**（验收 4 排除项）：`ctx.desktop` 定义（`app/src/runtime/extension/host-apis.tsx:238-248`）为 `platform.platform === "desktop" ? {...launch/reveal/installed...} : undefined` 三元——web 恒 undefined（注释「Desktop-only abilities; `ctx.desktop` is undefined on the web」实际位于 `gui-extensions/src/sdk/host-apis.ts:907`，N-1 归属勘误）；`open-in-app.tsx` 双门槛 `canOpen = createMemo(() => !!desktop && input.session.server.local)` + `openPath` 早退 `if (opening() || !canOpen() || !desktop) return`；OpenInApp Slot 注册整体 `if (desktop) {...}` + `<Show when={desktop}>`；树/列表行 `openIn = ctx.desktop ? useOpenInApp(...) : undefined`；树行右键菜单 `OpenInAppContextMenuV2` web 无 state→直通子元素；**拖拽**：`draggable={!props.mobile}` 在 `browser.tsx:145`（N-2 归属勘误）把 prop 传入树，`tree-v2.tsx` 的 `startFileDrag` 由 `local.draggable` prop 门控——mobile 禁拖拽。
- **零 OS 条件分支**：`app/src/workspaces`（全目录递归，含 #8 的 selection 子集与本期 files）+ `gui-extensions/src/file` 两域，四模式（`process.platform`/`navigator.platform`/`from "node:os"`/`require("os")`）零命中——探针白名单扫描（含扫描数下限断言）锁定；#8 路径边界断言（`directoryPickerKind` web 恒 `"server"` 等）沿用不改动。

### #16 边界声明（只声明不实现）

Android 文件导入（附件上传 `composer/attachments/*` + `onShowFileChooser`/`ACTION_OPEN_DOCUMENT` 面，attachments-upload-redirect-policy 在位）、导出/分享（`platform.saveFile` 契约在位、`openExternal`/下载链路面）**本期零改动**，归 issue #16 交付；本期交付的 `fs.write` 穷举断言同时是 #16 的起点基线（集合当前恰一处）。IDE/Explorer launch（`open-in-app` 全家）按验收 4 排除——其桌面门槛由探针锁定，移动面结构性不存在。**client exit 零副作用**沿 #9/#10 口径=文件面只读（写面穷举即证明）+ G22⑧ 机械核对（查看文件杀 App→远端零影响→重开 tab/选择恢复）。

## 移动面与无障碍现状与缺口（如实；G22⑨ 首项核对，不预设补丁）

**已成立**：树/列表行均为真 `<button>`（可聚焦可激活）；目录行 `aria-expanded`；搜索过滤 `role="combobox"` + `aria-controls`/`aria-activedescendant`/`aria-expanded`；搜索结果 `role="listbox"`/`option`/`aria-selected`；loading/空态 `role="status"`；移动 tab 条与关闭按钮 `aria-label`；`tree.all` 按钮 `aria-pressed`；i18n 双字典齐备（gui-extensions `file/i18n` 实测 **63** 个语言文件（61 locale + en/zh），`mobile.title`（「Files」/「文件」）/`mobile.openTabs`（「Open files」/「打开文件」）/`tree.all`/`tab.notFound`/`selectToOpen` en+zh 在册；app `toast.file.*`/`command.file.open`/`session.files.selectToOpen` en+zh 在册）。

**缺口（如实登记，归 G22⑨）**：①树/列表虚拟行高 28px（+2 gap=30px，`estimateSize: () => 28`）与移动打开文件 tab 条（`!h-10`≈40px 头部、tab 关闭按钮为小尺寸图标位）低于 48dp 触摸目标推荐——与 #10 permission 按钮 28/32px 同型事实；②树为扁平虚拟按钮列表，无 `role="tree"/"treeitem"/aria-level` 层级语义（目录展开态有 aria-expanded 但无树角色）；③移动过滤清除无触屏等价——`browser.tsx` Esc 清除过滤为唯一清除路径（`onFilterKeyDown` Esc 分支），过滤输入无自带清除钮（实测）；④读屏焦点顺序/焦点陷阱未核验。**均归 G22⑨ 首项核对**，不足按失败路径四步协议交用户决策（候选含 移动适配候选），本期不预设。

## 门禁与验证

- **G22**（[interaction.md](../interaction.md) 新设）：远程文件面运行期真机清单十项（移动 Files 视图可达/树浏览/搜索/查看四态/stale/上下文引用/恢复/client exit 红线/窄屏读屏触摸目标首项核对/SSH+直连双路由）。
- **V-probe**：`scripts/verify-files.ts` 静态结构探针（#143 起九组断言：数据面接线/写面穷举集合/大文件二进制编码锚/stale 链/恢复键控/移动面与桌面门槛/上下文引用链/零 OS 分支扫描 + **组 9 流式读取与订阅锚**（streamedKinds/HEAD 回退对/fileStreamUrl 凭据语义/protocol 两 endpoint 标识/vendored 去前缀生成面名/`api.experimental.file.*` 泄漏负例））。诚实边界：静态结构检查，对运行时行为零证明力。注：组 2 的 destination.ts anchors 在基线 `3310b80` 即 FAIL（session-workbench-upstream 迁移移除 M-012 upload 校验，见 build-and-verify #143 段），属预存基线失败，非 #143 引入。
- **#143 测试**：`api.test.ts` 目标逐字 `fileStreamUrl` 用例（无密码 URL 形/有密码 undefined）；`artifact.test.ts` `streamedFileContent` 版本化 URL/mime/缺头 `v=0-0` 用例 + `streamedKinds` 集合恰为 image/audio/video；model.tsx watch 生命周期上游零直接测试，覆盖=探针+构建+真机（同装配层口径）。
- **测试子集**：上游 app 子集追加 4 文件（`workspaces/files/{artifact,content-cache-accounting,path,watcher}.test.ts`，纯逻辑 bun:test）+ gui-extensions 新包子集 4 文件（`src/file/{artifact,path,tree-model,resolve-link}.test.ts`，包内 bunfig preload 生效，显式列文件不裸跑）；首跑逐例归因门适用两处（上游固有/runner 环境/我方基建 + pristine pin 对照，归因不了即阻断）。
- **装配层覆盖口径**：`model.tsx`/`tree-store.ts`/`view-cache.ts`/`renderer.tsx`/`mobile.tsx`/`view.tsx` 上游零直接测试——覆盖=探针（结构）+ V2（构建）+ G22（真机）三层，与 #10 dock 口径同型，不声称单测覆盖。

## 诚实边界

- **G22 全部运行期行为 BLOCKED**：文件树到达/查看渲染/搜索行为/stale 重读时机/上下文引用流向 composer 的呈现/恢复过程/client exit 红线/读屏焦点触摸目标——本交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」。**#143 轮设备 adb 不可达（192.168.3.209:5555 拒绝连接，疑无线调试关闭）**：G22①–⑨、G22⑤ watch 订阅生命周期（服务路由已在 v2.2.1 服务实测存在，见 build-and-verify #143 段服务前置核对）、G29 Office 门禁、G28 浏览器结果面均 BLOCKED；解除条件=恢复设备无线 ADB（设备屏物理操作）后按本轮 APK 复测。
- **真模型 live E2E BLOCKED**：@-引用/行范围上下文在真实模型会话中的可读性与效果需授权服务与模型（直连+SSH 双路由），不允许 fixture 替代。
- **服务端语义来源边界**：read 三重围栏/list 父兄目录设计/write 零围栏/搜索索引 10s/ETag 语义均引上游 pin 缓存（非闭包）；真服务核对归 G22/live E2E；pin 更新时缓存引文随 PROVENANCE 演练同步。
- **diff 查看不在本期**：文件与 Diff 拆分后 diff 单元保持「未开始」；`sidebar.tsx`（changes 树 tab）与 `SessionReviewV2*` 的 diff 面不声称已交付。
- **#16 面（导入/导出/分享）不在本期**：仅边界声明与 `fs.write` 基线断言，不声称任何导入导出能力已验证。
- **搜索失败吞为空结果**：`model.tsx` search 非 abort 错误 `.catch → []`——上游语义如实登记，呈现充分性归 G22③ 首项核对。

## #162/#163 修复轮登记（2026-11-08，分支 fix/162-163-pierre-webview-render）

**Open file 侧面板树渲染修复（#162）**——两处 114 存活适配 + 一处 vendor 基线缺口修正，全部走 mobile patch / vendor 修正登记：

- **依赖基线对齐（vendor 修正，非 mobile patch）**：`@pierre/trees` 从 1.0.0-beta.4（旧 pin b4525d79 基线）对齐到 **1.0.0-beta.6**（gui-plugins 包实际抽取源 v2.2.1=3ebcf9a 的 package.json/lock/patchedDependencies 版本）。缺口形态：gui-plugins 包源码=3ebcf9a（`pierre-tree.tsx` 调用 beta.6 API），依赖=旧基线，运行期 `applyGitStatusPatch`/`getVisibleRows` TypeError（step-0 CDP console 捕获）。修正载体：`gui-plugins-api-migration.patch` 修订（删除 gui-plugins/package.json 的 beta.6→beta.4 翻转 hunk；app/package.json hunk 增 beta.4→beta.6 翻转）+ 仓库根 `patchedDependencies` 与 patch 文件换 `@pierre%2Ftrees@1.0.0-beta.6.patch`（pin 原件）+ bun.lock 刷新。
- **`files-tree-sidebar-fill.patch`（布局语义修正）**：sidebar 树 wrapper（`[data-component="file-tree-v2"]`，content-sized 自定义元素宿主）在 `:has(file-tree-container)` tree viewport（列 flex、overflow hidden）内无任何高度来源——`:host(height:100%)` 相对 content-sized 父级解析为 auto，整条 shadow flex 链塌缩到内容最小值（实测 wrapper 12px / scroller 8px / list 140px 但全部裁剪不可见）。修正：wrapper 在 viewport 内 `flex: 1 1 0%; min-height: 0`（镜像本应用 directory picker 对同型组件的显式高度模式 `.directory-picker-tree { height: 100% }`）。设备探针：wrapper 12→601px、scroller 597px，全部行渲染。
- **`diff-worker-pool-fallback.patch`**（详见 diff.md）：`preferredHighlighter` 与主题面切换同样服务于文件查看器（TextViewer 同闸门）——`normal.txt` 内容渲染（alpha/beta 两行 + 行号）即经此路径。
- **运行验收（#162 验收句）**：真机 Open file 侧面板实际打开文件树（5 行可见：.git/edit-me.txt/longline.txt[M]/normal.txt/sample.png）→ 选择普通文本文件 `normal.txt` → 内容可见（行号 + alpha/beta，与服务端 fs.read 内容一致）→ 关闭文件 tab 返回、重进面板树状态保留（5 行 + M 徽标在位）。截图 `/tmp/oc162-163/oc162-final-D10-*.png`（构建 d059d094）。
- **登记形态（非缺陷，如实）**：树数据 scoped 缓存（staleTime Infinity，#147 D13 同源）——面板重开命中缓存时本轮零新增 `/api/fs` 请求；fs.list 200 证据来自 step-0 采证轮与服务端 smoke。
