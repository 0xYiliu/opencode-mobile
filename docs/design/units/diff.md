# 单元：diff（远程 Git 审查与 worktree 操作）

状态：**已实现（未验证）**（issue #12）。远程 Git 变更审查（status/working diff/branch diff、移动专属 Changes tab、行评论、review 上下文）、会话变更与项目/worktree 变更的区分、worktree 操作（迁移/创建/删除/refresh）与 undo/redo/commit（staged revert）交互、大 diff/二进制/媒体处理——**全部由上游闭包承载**（`gui-extensions/src/{review,details}` + `session-ui/src/{components/session-review,components/session-diff,v2}` + `app/src/session/revert.ts` + `app/src/settings/workspaces` + `app/src/workspaces` + `app/src/new-session/workspace` + `client` 生成面），本仓库零新建界面、零运行时代码改动、零 vendor 补丁（本期 `patches/mobile/manifest.json` 维持 18 个不变）。全部运行期行为未经设备验证：真机门禁见 **G23**（[interaction.md](../interaction.md)），真模型 live E2E（turn 快照依赖真实模型会话，直连+SSH 双路由）与真实 git 仓库/supported server OS 的 live 核对（验收 4）BLOCKED。

行号声明：本文引用的行号为 vendor pin `b4525d79bf` 时点值，仅供定位；权威以引号内源文本锚为准（静态探针 `scripts/verify-diff.ts` 锁定）。**来源边界（双域分层）**：①服务端 vcs/worktree **实现**（`packages/core/src/vcs.ts`、`packages/core/src/vcs/patch.ts`、`packages/core/src/plugin/vcs/{git,hg}.ts` 与 server handler）**不在 vendored 闭包内**（闭包 `packages/` 目录清单无 server/core），语义引自上游 pin 提交树采集缓存 `~/.cache/opencode-upstream` @ `b4525d79bf`（同 [architecture.md](../architecture.md) CORS 节「来源表述」先例）；②**协议与 schema 描述在闭包内**——`packages/protocol/src/groups/{vcs,worktree}.ts` 与 `packages/schema/src/{vcs,file-diff,worktree}.ts` 随闭包携带，端点语义与类型形状可直接静态锚定（与 #11 引缓存的差异：本期端点描述可引闭包内 protocol 逐字原文）。pin 更新时缓存引文随 PROVENANCE 演练同步。

## 能力来源（复用面，无新建第一方逻辑）

| 面 | 上游实现锚（`vendor/upstream/packages/...`） | 状态 |
| --- | --- | --- |
| review 扩展（核心数据层） | `gui-extensions/src/review/model.ts`（635 行）：**三模式 `ChangeMode = "git" | "branch" | "turn"`**——git=`vcs.diff({ location, mode: "working" })`、branch=`vcs.diff({ location, mode: "branch" })`、turn=`session.diff({ sessionID: view().id })`（会话快照；turn 有界重取 `context: 3`）；options 门控（`project?.vcs` 才有 git、`branch.current && branch.default && current !== default` 才有 branch、`project?.vcs === "git" && view().id` 才有 turn）；模式选择每会话持久化且不再提供时回落第一个选项、存储值保留；diffQuery `enabled: !!stored() && view().server.connected && wantsReview() && !!view().project?.vcs` + `refetchOnMount: "always"`；**detailsQuery**（`mode: "working"` @ `view().directory`，仅 `demand.details > 0` 加载，失败 `.catch → []` + console.debug 吞错）；refresh=debounce 100ms invalidateQueries；`filesystem.changed` 事件监听（location.directory 匹配才刷新）与 session idle→refresh + turn queries invalidate；`loadDiff`（聚合 patch 无 `@@ ` hunk→目录 scope 重取→root `context: 3` 有界重取，失败 console.debug→undefined）；`readFile`=`file.read({ path, location: { directory: directory() } })` base64（媒体预览，失败→undefined）；`initializeGit`=`vcs.init({ location, provider: "git" })`（失败 toast `common.requestFailed`）；行评论→`screen.composer.attach({ type: "file", path, selection, comment, commentID, commentOrigin: "review", preview })`；scroll 持久化 `layout.scroll(view(), "review", ...)` | 已实现（未验证） |
| review 扩展（面板与移动面） | `gui-extensions/src/review/renderer.tsx`（281 行）：Panel 注册 `mobile: { title: plural("mobile.title"), order: 10, kind: "tab" }`——**Changes 是移动 tab 条的一级 tab**；`frame.placement() === "mobile"` 分支渲染 `MobileReview`（lazy）；窄屏 `layout.narrow()` → `layout.open(KEY, session)`（KEY=`"review:changes"`）；LinkHandler（priority 1，`link.origin === "review"`）——composer 审查评论点击 reveal diff；SettingsPage `{ id: "mobile-diff", page: "general" }`。`panel.tsx`（366 行，桌面）：`SessionReviewV2` + sidebar（filter `TextInput` + `showClearButton`，实位于 `session-ui/src/v2/components/session-review-v2.tsx:93-106`）；`detailSource`（`reviewDiffNeedsLoad` 才 createResource loadDiff）；toolbarAction=`ctx.uses.openIn()` 的 OpenInApp Button（desktop 门槛结构性承接，见安全专节）。`mobile.tsx`（168 行）：`diffStyle="unified"` 恒定、`overflow={mobileDiff.value.wrap ? "wrap" : "scroll"}`、`onViewFile`→`links.open`（走 files 单元查看器）、滚动恢复（`layout.scroll` "review" 键 + `wheel`/`mousewheel`/`pointerdown`/`touchstart`/`keydown` 用户交互门控集）、行评论全套接线。`parts.tsx`（92 行）：`ReviewTitle`（Select 模式选择器，单选项退化静态 span）、`ReviewEmpty` 四分支（loading/noGit（+onInitGit+initializingGit）/empty.git/empty.branch/noChanges） | 已实现（未验证） |
| diff 渲染层（session-ui） | `components/session-review.tsx`（721 行，移动面渲染本体）：**大 diff**——`MAX_DIFF_CHANGED_LINES = 500`、超限且非媒体→占位卡（`ui.sessionReview.largeDiff.*` i18n + `renderAnyway` Button，媒体豁免）；**二进制**——`diffCanRender = () => diff().additions !== 0 || diff().deletions !== 0`（注释逐字「binary files have empty diffs that we can't render」）→ Accordion.Trigger `disabled={!diffCanRender()}` + 增删行数标签；**媒体**——`mediaKindFromPath(file)`→`media: { mode: "auto", path, deleted, readFile }`（deleted 不读文件）；虚拟化挂载 `REVIEW_MOUNT_MARGIN = 300`（视口±300px 内展开 diff 才渲染）；行选择→行评论状态机；Accordion 展开集合持久化。`components/session-diff.ts`：`normalize`/`resolveFileDiff`（patch→`parsePatchFiles`、before/after→`parseDiffFromFile`、patch cache LRU 16）/`completePatch`；**对抗性 patch header 防护**——`session-diff.test.ts` 内嵌 GHSA-73rr-hh4g-fpgx 回归（\r/\u2028/\u2029 分隔符 + 超长 padding 六形态，`Bun.spawnSync` 子进程隔离）。`v2/`（桌面）：`session-review-v2.tsx`（sidebar/←→文件循环键/expand-collapse/diffStyle SegmentedControl）、`session-review-file-preview-v2.tsx`（`shouldVirtualizeReviewDiff` >500 行虚拟化）、empty 两件。移动面不消费 v2 | 已实现（未验证） |
| 纯逻辑 | `review/kinds.ts`（153 行）：`reviewDiffNeedsLoad`（additions=0&&deletions=0→false；无 patch 或无 `^@@ ` hunk→true）、`reviewDiffKinds`（add/del/mix 按目录聚合）、`sortReviewPaths`（深度优先、目录先于兄弟文件）、`filterReviewFiles`、`applyFileListKeyDown`、`normalizePath`（反斜杠/多斜杠归一）；`review/i18n/` 下平铺 63 个语言文件（含 en/zh/zht） | 已实现（未验证） |
| review 上下文 | details 扩展（`gui-extensions/src/details/`）：`renderer.tsx` Panel `mobile: { order: 50, kind: "drawer", icon: "info" }`（窄屏 details 抽屉）+ 桌面 header Popover；`panel.tsx` 的 changes 行（`ctx.plural("ui.sessionTurn.diffs.changed", n)` + DiffChanges + onReview 按钮）与 worktree/branch 上下文行（`data().location.vcs.info({ directory })` 的当前分支/`basedOn` 基分支、workspace local/worktree 名）；`popover.tsx`/`renderer.tsx` 均 `watch(screen, "details")` 按需加载 | 已实现（未验证） |
| worktree 操作 | `app/src/settings/workspaces/workspaces.tsx`（675 行）：worktree 列表（sessions per workspace/lastActive）、单个删除确认对话框、批量删除确认、**唯一 `worktree.remove` 调用点**；`gui-extensions/src/details/workspace-menu.tsx`（146 行）：SessionWorkspaceMenu「Move session to」（local/new/existing submenu + `worktree.list`/`worktree.refresh` + `worktree.updated` 监听 + `session.move` + running 禁用 + `move.failed` toast）；`app/src/workspaces/create.ts`（`createWorktree` 共享逻辑：location.get→worktree.create from canonical→syncInfo 预填缓存）；`app/src/workspaces/inventory.ts`（`createWorktreeInventory`——`staleTime: Infinity` + `retry: false`，只信 `worktree.updated` 事件与显式 demand）；`app/src/runtime/server/sync.tsx`（`api: () => serverSDK.api.worktree` accessor 注入 + `worktree.updated`→`worktrees.list(projectID)`+`bootstrap.refetch()`）；`app/src/new-session/workspace/controller.ts`（新会话 worktree 选择：`worktree.list` + `worktree.updated` 监听 + **`vcs.branch.list` 分支候选源**（失败 `.catch → { …, data: [] }` 吞为空列表，#8 交付面本期不改其行为）） | 已实现（未验证） |
| undo/redo/commit | `app/src/session/revert.ts`（124 行）：`stage` 序列——未投递 prompt→`inbox.cancel` 分流（不 interrupt）；已投递→**interrupt→wait→`revert.stage`** 三步（每步 `request()` 包裹，失败 toast `common.requestFailed` 停在第一步失败，注释「Like the TUI, stop at the first failure instead of waiting on work that was never interrupted」「both are idle no-ops」）；staged 后 `restore(` prompt 草稿+上下文；`redo`=`revert.clear`（恢复全部被撤销消息）。命令注册 `app/src/session/commands/use-session-commands.tsx`（id `session.undo`/`session.redo`、slash `undo`/`redo`；undo disabled=无可见用户消息、redo disabled=无 `revertMessageID()`）。**commit 的真语义**：`composer/submit.ts:508` `if (session.current()?.revert) await session.api.revert.commit({ sessionID: session.id })`——staged revert 存在时下一次 prompt 准入前自动提交（无用户入口）；`new-session/composer-adapter.ts:169` 透传；事件三态 `session.revert.{staged,cleared,committed}` | 已实现（未验证） |

## 数据与端点契约

全部走上游生成类型与端点（`@opencode/client`，`packages/client/src/promise/generated/{types,client}.ts`；生成客户端 worktree 段 client.ts:2092-2147、vcs 段 :2148-2223 分列）。**本仓库不另行定义 vcs/worktree 数据契约**；端点描述可引**闭包内** protocol 逐字原文（`packages/protocol/src/groups/{vcs,worktree}.ts`，来源差异见行号声明②）。

### 端点（vcs 段 + worktree 段 + revert 三端点；调用方列为归一化跨行扫描穷举，与探针组 2 同口径）

| 端点 | 方法/路径 | 声明状态码 | 用途与语义（描述引闭包内 protocol 逐字） | 调用方（app+gui-extensions 源码域穷举） |
| --- | --- | --- | --- | --- |
| `vcs.init` | POST `/api/vcs/init` | [400, 401, 404, 409, 501, 503] | 「Initialize a repository using the selected VCS provider in a markerless project's directory and refresh its location services. Omitting provider defaults to git; built-in git and hg providers support initialization. An unknown provider returns 400; a registered provider without init returns 501.」（501=`VcsInitNotSupportedError`、503=`ServiceUnavailableError`） | 恰 {`gui-extensions/src/review/model.ts`}（`initializeGit`，跨行书写） |
| `vcs.get` | GET `/api/vcs` | [400, 401, 404] | 「Get current and default branch information for the requested location.」 | app+gui-extensions 源码域零直接调用；由 client 包 solid 数据层 `client/src/solid/data.ts:1370` 经 `locationResource("vcs", …)` 装载（`api().vcs.get`），经 `data.location.vcs.info`（data.ts:1971 `info: vcs.list`）供 details branch/basedOn 行、review 模式门控 vcs memo（review/model.ts:97）与 home sessions 消费（**不写「仅生成面/无调用方」——手写数据层真实调用点**） |
| `vcs.base` | GET `/api/vcs/base` | [400, 401, 404, 503] | 「Infer a local review base from named branch creation history, or the repository default only when currently on that branch. Returns null before the first commit or when the provider lacks base metadata; ambiguous Git history requires an explicit base on diff requests.」 | app+gui-extensions 源码域零调用；`vcs.base` 为 client test 在册（`client/test/{effect,promise}.test.ts`） |
| `vcs.status` | GET `/api/vcs/status` | [400, 401, 404] | 「List uncommitted working-copy changes relative to the requested location.」 | 恰 {`app/src/settings/workspaces/workspaces.tsx`}（删除预检，与 `vcs.diff(mode:"branch")` 三并联） |
| `vcs.branch.list` | GET `/api/vcs/branch` | [400, 401, 404] | 「List local and remote branches available at the requested location.」 | 恰 {`app/src/new-session/workspace/controller.ts`}（新会话分支候选源，`limit: 50`，跨行书写；失败 `.catch → { …, data: [] }` 吞为空列表，#8 交付面） |
| `vcs.diff` | GET `/api/vcs/diff` | [400, 401, 404, 503] | 「Diff HEAD to the working copy (working), the base merge-base to the working copy (branch), or the base merge-base to HEAD (committed). Omitting base preserves repository-default comparison; supplying it overrides the comparison without saving it.」 | 恰 {`app/src/settings/workspaces/workspaces.tsx`, `gui-extensions/src/review/model.ts`}（diffQuery+detailsQuery+删除预检） |
| `worktree.list` | GET `/api/worktree` | [400, 401, 404] | 「Return the project's saved worktree inventory without loading configuration or running discovery.」 | 归一命中 {`app/src/runtime/server/sync.tsx`（accessor 注入 `api: () => serverSDK.api.worktree`）, `app/src/workspaces/inventory.ts`（包装调用）, `app/src/new-session/workspace/controller.ts`, `gui-extensions/src/details/workspace-menu.tsx`（+queries.ts 经 sync 包装）} |
| `worktree.create` | POST `/api/worktree` | [400, 401, 404] | 「Load the project's canonical configuration, create a local worktree using its selected strategy, then run the project's setup script.」（增量创建，非破坏） | 恰 {`app/src/workspaces/create.ts`, `gui-extensions/src/details/workspace-menu.tsx`} |
| `worktree.remove` | DELETE `/api/worktree` | [400, 401, 404] | 「Load the project's canonical configuration and remove a saved worktree using its recorded strategy.」；`force` 必填（`Worktree.RemoveInput.force: Schema.Boolean`）、204（**唯一不可逆操作**，确认链见确认与失败恢复专节） | 恰 {`app/src/settings/workspaces/workspaces.tsx`}（跨行书写） |
| `worktree.refresh` | POST `/api/worktree/refresh` | [400, 401, 404] | 「Load the project's canonical configuration, discover worktrees across known checkout roots using all available strategies, and reconcile saved state.」 | 恰 {`app/src/workspaces/inventory.ts`（包装）, `gui-extensions/src/details/workspace-menu.tsx`} |
| `revert.stage` | POST `/api/session/{sessionID}/revert/stage` | [400, 401, 404, 409, 500]（success 200，body `{messageID, files}`） | staged revert 序列（undo/rewind 前置；`files?: boolean` 入参 app 客户端从不传——文件级回滚由服务端 snapshot 承载，见类型节与确认专节） | `app/src/session/revert.ts`（interrupt→wait→stage 三步的 stage 步） |
| `revert.clear` | **DELETE `/api/session/{sessionID}/revert`**（无 `/clear` 后缀——评审 F1 勘误，按生成面实况逐字；204） | [400, 401, 404, 409, 500] | redo=`revert.clear`（全量恢复被撤销消息，「Like the TUI, redo restores every reverted message at once」） | `app/src/session/revert.ts`（redo 路径） |
| `revert.commit` | POST `/api/session/{sessionID}/revert/commit`（204） | [400, 401, 404, 409] | staged revert 的提交语义（下一次 prompt 准入前自动 settle，见确认专节） | `revert.commit` 归一调用形态锚 `\.revert\.commit\(` 穷举恰 {`composer/submit.ts`（settle 自动提交）, `new-session/composer-adapter.ts`（透传）}——**无用户入口** |

**防误读句（N-5 式）**：以上「调用方」均为 app+gui-extensions 两包 `src/**` 源码域的归一化穷举；**client 生成面**（`client/src/promise/generated/client.ts`）的 vcs/worktree 端点包装是 SDK 层、距 app 一跳可达、不入调用点集合（探针组 2 域声明同步落字）。

### 类型与事件（生成面，不另行定义）

- `VcsFileStatus = { file, additions, deletions, status: "added" | "deleted" | "modified" }`（generated types.ts:298；闭包内 `packages/schema/src/vcs.ts` 同形状）——**无 staging 字段**（能力边界见确认专节）。
- `FileDiffInfo`（`FileDiff.Info`）：`FileDiff.Info.status` 三值 added/deleted/modified，**无 renamed**（闭包内 `packages/schema/src/file-diff.ts` 同——服务端 diff 全调用 `--no-renames`，重命名以 add+delete 分解，见安全专节）。
- `Vcs.Info`（current/default branch）、`Vcs.BranchList`、`Vcs.Mode = Literals(["working","branch","committed"])`、`WorktreeDirectory`、`Worktree.RemoveInput{projectID, directory, force}`、`SessionRevert = { messageID, partID?, snapshot?, files? }`（types.ts:409；`revert.stage` 的 `files?: boolean` 入参 app 客户端从不传——文件级回滚效果由服务端 snapshot 承载）。
- 事件：`filesystem.changed`（review 面刷新，location.directory 匹配才 refresh；files 单元同源事件）、`worktree.updated`（inventory 列表重载 + workspace-menu 重取 + bootstrap.refetch）、`vcs.branch.updated`（types.ts:1898）、`session.revert.staged/cleared/committed`（types.ts:1446/1456/1466——committed 连带清理 pending inbox 项与边界后本地消息行，`client/src/solid/data.ts` 事件处理）。
- 三模式查询键形态：diffQuery 键含 `{ctx.id, server.id, session, mode, directory()}`（directory 变更自动重取）、detailsQuery 键 `[ctx.id, server.id, "session-details", view().directory]`、worktree inventory 键 `worktreeInventoryKey(scope, projectID)`。

## 状态矩阵（单元级）

| 状态 | 上游锚点与语义 |
| --- | --- |
| loading | review 面=`loadingChanges`/diffQuery pending；details changes 行=「正在检查未合并的更改…」（`workspace.status.checking`，删除对话框 inspection 态） |
| empty | `ReviewEmpty` 分支：`empty.git`（「No uncommitted changes yet」/「尚无未提交的更改」）、`empty.branch`、`noChanges`；面板侧 `SessionReviewEmptyChangesV2` |
| noGit | `SessionReviewEmptyNoGitV2` + `onInitGit`（`vcs.init`，provider "git"）+ `initializingGit` pending；未知 provider 400、注册无 init 501、服务不可用 503（声明面）；失败 toast `common.requestFailed`+error.message；成功后 project/session/location/location.vcs 四路 invalidate+sync |
| loaded | unified（移动恒定）\| split（桌面 SegmentedControl）；wrap\|scroll（`mobileDiff.value.wrap`，General 设置节 Switch `aria-label`）；大 diff 占位+renderAnyway、二进制占位+trigger disabled、媒体 auto、行评论全套 |
| error（四类吞错如实） | ①detailsQuery→`[]`（console.debug）；②`loadDiff`→undefined（console.debug）；③branch.list 候选→`[]`（#8 面吞错）；④initializeGit/worktree remove/move/revert→toast `common.requestFailed` 族（`workspace.delete.failed.title`/`move.failed`） |
| stale（五重） | ①`refetchOnMount: "always"`；②`refetchOnWindowFocus: !turn`；③`filesystem.changed` debounce 100ms（location.directory 匹配；事件流跟随重启后的 server）；④session idle→refresh + turn queries invalidate；⑤`loadDiff` version 校验（重取竞态丢弃旧响应）。worktree inventory 另有事件驱动链（`worktree.updated`→list+refetch；`staleTime: Infinity`+`retry: false` 只信事件不信时间） |
| offline | diffQuery `enabled` 含 `view().server.connected` 门（断连期不发请求）；重连 `sync.invalidate()` 全量失效（#9 机制）+ worktree inventory 事件驱动重载；运行期呈现归 G23⑦ |
| conflict | **上游客户端无 merge conflict 专用渲染**——服务端 porcelain 冲突码折叠为 modified（core/vcs `kind()` `code.includes("U") → "modified"` @ 缓存）；冲突以 vcs.status/diff 的 dirty 计数呈现并经删除预检三态拦截（dirty=true 不删，见确认专节）；如实登记，不声称冲突可视化 |
| permission（401） | declaredStatuses 全族含 401——认证失败走既有反馈（#11 分层口径同型）；vcs 无独立权限层声明（服务端语义 @ 缓存，真服务核对归 G23⑩） |

## 会话变更与项目/worktree 变更的区分（验收 1 后半落字）

- **review 三模式就是区分机制**：`turn`（会话自身的变更快照——`session.diff`，仅 git 项目会话提供，注释「Turn snapshots are captured only for Git sessions」）vs `git`/`branch`（**所在 worktree 的仓库级**变更——`vcs.diff` working/branch）。模式 Select 常驻标题位（桌面 sidebar 头+移动 ReviewTitle），每会话持久化（review index.ts session store，sessionView "layout" 键 `pick: reviewMode/reviewFile/reviewOpen`）；不再提供时回落第一个选项、存储值保留（切回默认分支后 branch 模式自动回落、存储值不丢）。
- **details changes 行 = 会话目录（worktree）的 working tree 快照**（`vcs.diff({ location: view().directory, mode: "working" })`，contract 注释逐字「The session directory's uncommitted changes, independent of the review mode」）——与 review 模式无关的行级入口，review 模式门控同时消费 `vcs.info`（同源 `data.location.vcs.info`）。
- **timeline 逐 turn diff（可选）**：设置 `general.showTurnDiffs`（**默认 false**，`settings/model.tsx:282`）；`shell/routes/session-ui-provider.tsx` `turnDiff.load`→`session.diff(input)`；`session/timeline/turn-diffs.ts`（每 tab 内存缓存，失败重试语义——`turn-diffs.test.ts` 在 #9 子集）。
- **worktree 上下文跟随**：`session.move` 切换 worktree（details workspace-menu）后 review 的 `directory()=screen.file.root` 跟随新 location，diffQuery 查询键含 directory 自动重取；worktree inventory（#8 交付）与 `sync.tsx` 事件链全部沿用。

## 确认与失败恢复专节（验收 2 落字）

### worktree.remove 五层确认链（唯一不可逆操作，零静默路径）

**#106 注记（M-049，零契约变更）**：`workspaces.tsx` 的 DialogDeleteWorkspaces/DialogDeleteWorkspace Cancel 按钮携目标形 `autofocus`（v2.2.1 3ebcf9a）——确认对话框打开时默认焦点落取消按钮，裸 Enter 不会直接武装 danger 删除按钮（第 3 层对话框细节的加固）；负例机检在册（verify-projects-sessions #106 锚：剥 autofocus 即 FAIL）。

1. **preflight** `inspect()`=`vcs.status`+`vcs.diff(mode:"branch")`+sessions 三并联→`inspectWorkspaceDeletion`（`workspaces/paths.ts:65`，分类 `{active, linked, dirty}`，`paths.test.ts` 在 #8 子集）；
2. **非 force 三态拦截**：任一命中→blocked toast（`settings.workspaces.delete.blocked.active/linked`+`workspace.status.dirty`「检测到未合并的更改。」）**不删**；
3. **确认对话框** `DialogDeleteWorkspace`——标题 `workspace.delete.confirm`（「删除"x"吗？」）+ 位置 code 块（远程绝对路径纯展示）+ 固定警告（「工作区目录和分支将被永久移除」）+ 动态 inspection 消息（checking/error）+ 取消/**danger 按钮 `disabled={status.isPending || status.isError}`**——**stale/失败态不盲确认**；
4. **danger 路径** `transact(() => remove(workspace, true, context))` force 执行；
5. **失败恢复**：toast `workspace.delete.failed.title`+error.message，`transact` 包装 catch→toast+finally 清态；**成功**→draft tab 重指向项目主 worktree（`containsDirectory` 匹配）+`extensions.workspaceRemoved` 钩子+双 query invalidation。

### undo/redo/commit 三层语义（如实）

- **undo/redo 是可逆对**：undo=`revert.stage`（interrupt→wait→stage 三步，失败停第一步，状态不变可重试，幂等 no-op）；redo=`revert.clear`（全量恢复被撤销消息）。**无二次确认对话框**——可逆性与失败即停替代确认（如实登记，非缺陷）。
- **commit = staged revert 的自动 settle**：`submit.ts:508` settle() 在下一次 prompt 准入前自动提交 staged revert（注释「The server would otherwise commit it on admission and delete every row from its boundary on」）；**无用户入口、无 git commit（创建提交）UI/API 调用面**——调用形态锚 `\.revert\.commit\(` 穷举恰两处（submit.ts+composer-adapter.ts）。事件三态驱动本地清理。
- **破坏性红线承接（对照 AGENTS.md「不静默关闭或替换远程服务」精神）**：破坏性操作面穷举后仅 `worktree.remove` 不可逆，其确认链完整且分层（预检脏态默认拦截、force 需对话框显式危险按钮、失败 toast 恢复）；`vcs.init` 有幂等/conflict 保护（409）、`worktree.create` 增量创建、`session.move` 非破坏——零静默路径。

### 能力边界（上游客户端面不存在，如实登记，不虚构）

- **git index 的 staged/unstaged 分解与 `git add` 类暂存操作不在上游客户端与服务端适配面**：`VcsFileStatus`/schema 三值 status 无 staging 字段、`vcs.diff` mode 三值 working|branch|committed 无 staged/unstaged 分解、全客户端源码**零 git 暂存语义消费面**（字面 `staged` 命中均为 staged-revert/更新器语义；`--cached`/`unstaged` 零命中）；服务端 Adapter 恰 `{ info, base?, branches, status, diff }` 无 staged 操作、diff 全调用 `--no-renames` 且零 `--cached`（@ 缓存四层取证）。上游以 **working copy 全量变更**（status 端点+working diff）为审查对象。
- **git commit（创建提交）操作上游零 UI/API 调用面**——本期「commit」= staged revert 自动 settle 语义。
- **status 的客户端呈现**：`vcs.status` 线级调用点恰 workspaces.tsx（删除预检）；diff 面的「status」呈现=A/D/M 状态标签（`statusLabel`）+ 增删行数（`DiffChanges`）+ `reviewDiffKinds` 目录聚合（add/del/mix 标记树）——无独立 status 列表视图（上游形态如实）。

## 安全与边界专节（验收 3 落字）

### 路径边界（沿用 #8/#11 结构保证 + 本期新面核对）

- **diff 面 Open-in-app 移动结构性不存在**：`ctx.desktop` web 恒 undefined（`gui-extensions/src/sdk/host-apis.ts` 注释「Desktop-only abilities; `ctx.desktop` is undefined on the web」）；file 扩展 `if (desktop)` 才 provide OpenInApp + Slot `<Show when={desktop}>`（#11 已锁沿用）；review panel 的 openIn 按钮=`ctx.uses.openIn()`——contract 未 provide 时 `status !== "active"`→按钮结构性不存在（`<Show when={openIn()}>`），移动 web 构建上 diff 工具栏无任何本地打开入口。
- **FileDiffInfo.file 是 repo 相对路径**（git diff 输出），UI 用 `getDirectory/getFilename` 拆分展示（`\u202A...\u202C` 隔离字符），**读取恒经 `readFile`=`file.read({ path, location: { directory: directory() } })` 远程作用域**；`onViewFile`→`links.open`→files 单元 tab（#11 已锁 location 作用域）；worktree 远程绝对路径在 settings workspaces 列表与删除对话框 code 块**纯展示**，无 launch/reveal 入口；审查评论→`composer.attach({ type: "file", path })`——与 #11 相同的远程记号语义（file:// URI 仅发往远程服务）。**绝不把远程路径映射为手机本地 IDE 路径**。
- **零 OS 条件分支（六域白名单扫描，探针组 8）**：`gui-extensions/src/review` + `gui-extensions/src/details` + `session-ui/src/components/session-review.tsx` + `session-ui/src/v2/components` + `app/src/session/revert.ts` + `app/src/settings/workspaces`——四模式（`process.platform`/`navigator.platform`/`node:os`/`require("os")`）零命中（实测 **170 文件**）。**跨探针并集注记（N6）**：`app/src/workspaces`（create/inventory/paths 等）由 #11 `verify-files.ts` 白名单覆盖、`app/src/new-session/workspace` 由 #8 `verify-projects-sessions.ts` 白名单覆盖——六域扫描与既有两探针构成并集，无「无扫描」盲区。

### renamed/conflict/huge/binary 的语义分层（服务端实现 @ 缓存，如实）

- **renamed**：`FileDiffInfo.status` 三值无 renamed——服务端 diff 全调用 `--no-renames`（core/vcs git 插件 @ 缓存），git 重命名以 **add+delete 分解**呈现；上游无 rename 专用标记。
- **conflicted**：上游客户端无 merge conflict 专用渲染——服务端 porcelain 冲突码折叠为 modified（`kind()` `code.includes("U") → "modified"` @ 缓存）；冲突以 dirty 计数呈现并经删除预检三态拦截。
- **huge（超限 patch）**：服务端 `MAX_TOTAL_PATCH_BYTES` 超限回空 patch（vcs.ts @ 缓存）→ 客户端 `loadDiff` 的「无 `@@ ` hunk→目录 scope 重取→root `context: 3` 有界重取」兜底；渲染侧 `MAX_DIFF_CHANGED_LINES = 500` 占位+renderAnyway+`shouldVirtualizeReviewDiff` 虚拟化。
- **binary**：空 patch（additions=deletions=0）→ Accordion trigger disabled + 增删行数标签（注释逐字「binary files have empty diffs that we can't render」）；媒体走 `mediaKindFromPath` auto 预览（`readFile` base64，deleted 不读）。
- 上述服务端语义（`--no-renames`、冲突码折叠、MAX_TOTAL_PATCH_BYTES）均为缓存引文（非闭包），真服务核对归 G23⑩/live E2E；协议与 schema 层（三值 status、Mode 三值、force 必填）在闭包内已静态锚定。

## 移动面与无障碍现状与缺口（如实；G23⑨ 首项核对，不预设补丁）

**已成立**：Changes 是移动 tab 条一级 tab（`kind: "tab"` order 10，无需进 More 抽屉）；窄屏恒 unified diff（无 split 选择负担）；**wrap/scroll 换行开关**（General 设置节 Switch，`aria-label`，en「Wrap long lines in mobile diffs instead of scrolling horizontally」/zh「在移动设备差异中换行，而不是水平滚动」——上游为移动显式设计的设置项）；`SessionReview` Accordion 行为可聚焦控件、行评论 menu `aria-label`、view-file button `aria-label`、大 diff `renderAnyway` Button、review 模式 Select、`ReviewEmpty` 三态文案；滚动恢复有 `touchstart` 等用户交互门控（防 restore 打架；`wheel`/`mousewheel` 监听在 `review/mobile.tsx:132-133`，为桌面交互语义补充，`touchstart`:135 已覆盖触屏——N3 归属勘误：监听在 review/mobile.tsx 非 session-review.tsx）。

**缺口（如实，归 G23⑨）**：①移动 review 头部 `!h-10`≈40px、Accordion trigger 与行评论按钮触摸目标 vs 48dp 推荐——与 #10/#11 同型事实；②**触屏行选择→行评论**的可用性（`@pierre/diffs` 行选择与移动端文本选择句柄/长按的交互）未核验——diff 评论是本面核心交互，G23 首项；③模式 Select（Kobalte menu）窄屏触屏可用性未核验；④读屏焦点顺序/焦点陷阱未核验。**均归 G23⑨ 首项核对**，不足按失败路径四步协议交用户决策（候选含 M-022+），本期不预设。

## 门禁与验证

- **G23**（[interaction.md](../interaction.md) 新设）：diff/vcs/worktree 面运行期真机清单十项（Changes tab 可达与三模式切换/diff 浏览/触屏行选择→行评论（首项）/评论 reveal 链/undo-redo/worktree 操作与删除确认链全流程/stale 刷新/client exit 红线/窄屏读屏焦点触摸目标首项核对/SSH+直连双路由+**真实 git 仓库与 supported server OS**）。
- **V-probe**：`scripts/verify-diff.ts` 静态结构探针（八组断言：数据面接线/调用面穷举集合（归一化跨行扫描，无例外）/确认与失败恢复/大 diff 二进制媒体/session vs worktree 区分/移动面与桌面门槛/worktree 操作面/零 OS 分支扫描 + 负例控制）。诚实边界：静态结构检查，对运行时行为零证明力。
- **测试子集**：app 子集追加 `settings/model.test.ts`（mobileDiffWrap/settings v3 持久化锚；import 链经 `runtime/persistence/{schema,storage}.ts`，不经 M-002 目标——R9 机械核对仍执行）；gui-extensions 子集追加 `src/review/kinds.test.ts`（可选 `src/details/configured-lsp.test.ts` 按首跑结果裁剪）；session-ui 子集追加 `src/components/session-diff.test.ts`（含 `Bun.spawnSync` 子进程——首跑归因门重点，FAIL 先归因 runner 环境）与 `src/v2/components/session-review-file-preview-v2-virtualize.test.ts`；首跑逐例归因门适用全部新增。
- **装配层覆盖口径（R1，如实）**：`review/{model,panel,mobile,renderer,parts}`、`details/{renderer,panel,popover,workspace-menu}`、`settings/workspaces/workspaces.tsx`、`session/revert.ts` 上游零直接测试——覆盖=探针（结构）+ V2（构建）+ G23（真机）三层，与 #10/#11 dock/files 口径同型，不声称单测覆盖；纯逻辑部分（kinds/session-diff/virtualize/turn-diffs/paths）有上游单测且已入子集。

## 诚实边界

- **G23 全部运行期行为 BLOCKED**（十项清单见上）：Changes tab 到达、三模式切换、diff 渲染与大文件手感、**触屏行选择→评论**、评论 reveal 链、undo/redo 过程、worktree 删除/迁移全流程、stale 刷新时机、client exit 红线的远端核对、读屏/焦点/触摸目标——本交付只声称「文档/探针/单测级已验证，运行期已实现（未验证）」（F4 系列第九处落字）。
- **真实 git 仓库与 supported server OS 的 live 核对 BLOCKED**（验收 4）：真实 git 仓库的 working/branch/turn diff、真删除/迁移、服务端 git 不可用 503 呈现——需授权远程服务+真实仓库+受支持 OS（直连+SSH 双路由）；**真模型 live E2E BLOCKED**（turn 快照与真实会话 diff 依赖真实模型会话，不允许 fixture 替代）。
- **能力边界（上游客户端面不存在，非本期缺口）**：staged/unstaged 分解与 git add 暂存、git commit（创建提交）、merge conflict 专用可视化与 renamed 状态标记——三项均已如实登记（见确认与失败恢复专节/安全专节），**特别不声称「staged/unstaged 已支持」「git commit 已支持」「冲突已可视化」**。
- **服务端实现语义来源边界**：`packages/core/src/vcs.ts`、`vcs/patch.ts`、`plugin/vcs/{git,hg}.ts` 与 server handler 不在闭包内（引上游 pin 缓存）；协议与 schema 描述在闭包内可静态锚定——两类来源显式分层；pin 更新时缓存引文随 PROVENANCE 演练同步。
- **四类吞错的呈现充分性归 G23**：detailsQuery→[]、loadDiff→undefined、branch.list 候选→[]、turn 缓存失败静默重试——上游语义如实落字，用户可见性未核验。
- **上游全量套件不作为门禁**；终端与设置两个单元仍为 architecture.md TODO 行，本期不声称已交付。
