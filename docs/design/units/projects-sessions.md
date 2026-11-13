# 单元：projects-sessions（远程项目、工作区与会话生命周期）

状态：**已实现（未验证）**（issue #8；项目身份与 home/new-session 目标形收口于 issue #140；v2.2.7 Home/new-session 状态机核对见 issue #185）。浏览/选择远程目录、创建/打开/fork/重命名/归档会话、切换项目与工作区的能力由固定 v2.2.7 上游闭包携带的 UI 与生成客户端承载（未经任何新增平行界面）；本仓库已有移动语义继续由 **session-home-archive**、**project-identity-migration** 与 **settings-ssh-entry-guard** 等历史登记说明，历史 **home-new-session-parity** 不在本轮重放。#185 的唯一 active source delta 是 `home-new-session-v2-2-7`：直接 import Home project-list fade helper 并锁定 edge-state tests；不重复承载项目身份或最近使用持久化。issue #55 的 connection-initial-ssh-entry 只补齐空/签出连接屏的首个 SSH hosts 入口，未改变项目/会话生命周期或 SSH 传输。全部能力未经设备运行验证；真机门禁见 **G19/G36**（[interaction.md](../interaction.md)），双路由 lifecycle E2E BLOCKED。

## v2.2.7 / issue #185 设计边界

- **设计单元**：Home server/project rail 与 session list、new-session location/project/workspace flow、远端 worktree picker 是同一 projects-sessions 单元内的三个可观察区域；入口、数据契约和恢复键沿用上游，不建立 Android 平行流程。
- **架构与数据来源**：Home 通过 `ctx.projects`、server scope 和 session index 读取远程项目/会话；new-session 通过 `location.get`、`project.list`、`worktree.list`、`vcs.*` 和 `file.list/file.find` 读取远端目录与 worktree。web/mobile picker 使用 server 语义，不能把手机文件系统路径当成项目路径。
- **交互状态**：Home session load machine 区分 cached/stale/loading/unreachable/error/retry，search machine 的 found/missing/failed/timed-out/closed/disposed 均结束于可观察状态；row machine 覆盖 long-press/menu、rename cancel/failed save/late answer。location dialog 保留 query、active row 和 history，Escape/Back 从 worktree 返回上一步或取消；combobox/tree/queue/cache machine 对 loading、失败、取消、过期 attempt 和 dispose 做 stale-result 拒绝。new-session start machine 的 worktree → MCP → session 阶段有 timeout、toast 和 rollback，已创建 worktree 在失败后保留为 draft workspace。
- **视觉与响应式**：Home project viewport 在 top/middle/bottom edge 通过 `data-fade-top`/`data-fade-bottom` mask 表达内容裁切；#185 把一像素容差集中在 `home/projects/fade.ts`，scroll/resize/mutation 三条更新路径共用同一判断。此为现有 v2.2.7 视觉契约的可测 seam，不改变行内容、选择结果或持久化；窄屏仍使用上游 Home/new-session 布局，设备触摸可达性归 G19。
- **状态恢复**：项目身份、`usedProjectIDs`/`lastProjectID`、tabs/drafts/scroll 与 server scope 继续按 issue #140/本单元既有契约恢复；#185 不新增最近项目、项目创建或 session persistence 语义。picker 对话框 query/history 与 in-flight request 是过程态，取消、超时、dispose 后不得让迟到结果改写新目标；完整冷启动/切网/双路由恢复仍未运行验证。
- **无障碍与文案**：键盘 Back/Escape、焦点行恢复、可重试错误和现有 i18n 文案由上游机器/组件承载；#185 不新增用户可见文案或键盘分支。edge mask 不承载唯一信息，项目/会话文本仍须可见；实际触摸目标、读屏和 reduced-motion 设备检查归 G19/G30。

## 能力来源（复用面，无新建第一方会话逻辑）

| 操作 | 上游实现（`vendor/upstream/packages/app`） | 服务 API（生成客户端 `packages/client/src/promise/generated/client.ts`） | 状态 |
| --- | --- | --- | --- |
| 浏览/选择远程目录 | `workspaces/selection/picker.tsx` `useDirectoryPicker`（server 模式对远端 `file.list`/`file.find` 浏览、`~` 展开远端 home、`normalizePickerDrive` 兼容 Windows 盘符输入、手输绝对路径兜底） | `file.list` / `file.find` | 已实现（未验证） |
| 添加项目 | `home/projects/controller.tsx` `pickDirectory` → `home/projects/add.ts`（目标异步链：`ctx.projects.add(directory)` = `location.get` 解析 → `sync.project.refresh()` → `projects.touch(id)`，失败 toast 并返回 undefined）；settings 页入口 `settings/workspaces/projects.tsx` addProject 消费同一异步链（`addProjects(...).then(project => 单目录时 onOpenProject)`） | `file.list` / `location.get` | 已实现（未验证）；**目标异步 add 链已随 issue #140 落地**（FU-3 收口，[settings.md](settings.md) 的 Milestone 登记随之关闭）；不可访问目录的真实反馈形态仍待 G19 首项核对 |
| 设置层项目/工作区页（S27/S30/S32 页面） | `settings/workspaces/projects.tsx` / `workspaces.tsx` / `project.tsx`（**settings-workspaces-migration**，v2.2.1 目标形：workspaces.tsx 目标逐字含删除确认 Cancel `autofocus`；projects.tsx min-w-0 页头 + vendored addProject hunks；project.tsx `registry.label` 服务器标签 + settings-framework-migration onClose；S29 auto-accept 行 `<Show when={key()}>` 的项目 `id` 数据供给已随 issue #140 落地（运行实态归 G21/G19）） | `project.list` / `project.update` / `worktree.*` / `vcs.*` | 页面目标形已实现；settings-workspaces-migration 在册（双 manifest 第 47 补丁）；运行期面（编辑保存/删除确认链全流程/逐字段实态）BLOCKED——需授权测试项目与可达服务器，见 build-and-verify.md issue #106 段 |
| 新会话项目选择 | `new-session/project/selector.tsx`（同一 picker） | 同上 | 已实现（未验证） |
| 创建会话 | `new-session/` 流 | `session.create` | 已实现（未验证） |
| 打开会话 | home 行（`home/sessions/controller.tsx` `open`）→ 会话 tab | `session.get`（`time.archived` 随 info 返回） | 已实现（未验证） |
| fork 会话 | `session/commands/fork-dialog.tsx` + `use-session-commands.tsx` | `session.fork`（body `before`） | 已实现（未验证） |
| 重命名会话 | home 行 rename（204 后本地 remember + invalidate + resync） | `session.update`（body `title`） | 已实现（未验证） |
| **归档会话** | **session-home-archive**：home 会话行 `archive` 由 stub 改为真实调用，复用 `home/sessions/archive.ts` `archiveHomeSession`（成功清 tabs + 行移除；失败 toast 且不 remove） | `session.update`（body `archived: true`，服务端盖 `time.archived`） | 已实现（未验证）；归档 API 语义（服务端盖章/列表过滤）归 G19/live E2E |
| 删除会话 | home 行（确认对话框 + toast + tabs 清理 + finally invalidate） | `session.remove` | 已实现（未验证） |
| 移动会话 | `SessionLocationMissing` 恢复流（`session/composer/location-missing.tsx`） | `session.move`（body `directory`） | 已实现（未验证） |
| 项目列表/改名 | `project.list`（archived 过滤）/ `project.update`（name/icon/commands）；无 project.create/delete——项目由目录/worktree 派生 | `project.list` / `project.update` | 已实现（未验证） |
| 工作区（worktree） | worktree inventory/submenu + `worktree.updated` 事件驱动 | `worktree.list/create/remove/refresh` + `vcs.*` + `location.get/reload` | 已实现（未验证） |

上游会话生命周期 API 面全部在生成客户端中现存；`archiveHomeSession`（注入式 helper）的「失败不 remove、成功清理 tabs」语义由上游 `home/sessions/archive.test.ts` 锁定——**该测试不经过 session-home-archive 的改写点**（controller 调用位），session-home-archive 接线本身的覆盖=探针（结构）+ V2（构建）+ G19（真机）三层，如实标注。

## 第二处上游归档 TODO（N-3 边界补记）

`session/timeline/message-timeline.tsx` 存在第二处上游 TODO（`{/* TODO: Need a session archive API. */}`）：会话内菜单只有 rename/export/delete，**无归档项**。session-home-archive 后归档仅 home 会话行可达；会话内菜单归档属上游能力边界，本期不改、不新增入口。

## 字段契约

全部走上游生成类型（`@opencode/client/promise`）：`SessionInfo`（`time.archived` 为 number 时间戳或缺失）、`SessionUpdateInput`（`title`/`metadata`/`permissions`/`archived`）、`SessionListInput`（`archived`/`directory`/`project`/`search`/`parentID`/cursor 分页）。本仓库不另行定义会话/项目数据契约。home 索引侧 `home/sessions/index.ts` 的 `parseHomeSessionIndex` 过滤 `typeof session.time.archived === "number"` 的行——归档后行从 home 列表消失由该过滤与查询缓存行移除共同保证。

## 身份键、隔离与状态保持（单窗口切换）

- **身份键**：项目身份 = worktree 远端绝对路径（`workspaces/path-key.ts` `pathKey` 规范化）；连接身份沿用 [server-list.md](server-list.md) 隔离表（直连=URL、SSH=`mobile-ssh:<uuid>`）。存储键在 pathKey 之上再叠加 ServerScope 前缀（`runtime/server/scope.ts` `SessionStateKey = ServerScope \0 route`）——不同主机的同名项目、同主机不同目录的同名项目天然不混，无数据泄漏（上游 `scope.test.ts`/`layout.test.ts`/`session-tabs.test.ts` 锁定；同名 UI 区分=项目行显示远端目录路径 + 服务器分组/主机名）。
- **标签与导航**：`shell/tabs/tabs.tsx` `Persist.window` 持久 tabs/recent/info/regions/closed；`Session`/`Draft` 两态 tab 均携带 `server: ServerKey`；每标签内存态（composer 等）在 `shell/tabs/memory.ts`，随窗口存活。
- **会话状态**：`sessionTabs`/`sessionView`（滚动）按 `SessionStateKey` 记录（`shell/state/layout.tsx`）；`Persist.serverGlobal/serverSession/serverWorkspace` 按 scope 隔离（`runtime/persistence/storage.ts`）。
- **草稿**：`Persist.draft` → web 平台 `createBrowserDraftStore()`（IndexedDB，`runtime/platform/web.ts`；内容分块 + blob 引用完整性，`runtime/persistence/drafts.ts`）。
- **并发**：`runtime/persistence/namespace.ts` 主机 revision 单调序 + 本地 seq 未落盘保护；`persist.ts` 本地脏值优先。

## 项目身份（FU-3，issue #140 收口）

- **存储模型**：每服务器 scope 下记录 `usedProjectIDs`（本客户端用过、按服务端顺序）与 `lastProjectID`（最后 touch 的项目 id），另存服务器自报 `hostnames`（健康检查首答前显示服务器名）；旧目录键 `projects` 桶在服务端列表就绪后由 `registry.projects.migrate()` 按目录解析成 id 回填 `usedProjectIDs` 并删除桶，目录键 `lastProject` 与 `recentlyClosed` 载荷解码即弃（上游同形）。
- **迁移轮默认落点缺口（如实登记）**：目标 `migrate()` 只回填 `usedProjectIDs` 不回填 `lastProjectID`——覆盖升级后默认落点回落 `used[0]`，直至用户首次 touch 写入 `lastProjectID`。
- **ctx.projects 面**（runtime/server/runtime.tsx，目标形）：`list/unique/used/add/forDirectory/forSession/last/touch/hide`；`add` = 异步 `location.get` → 刷新 → touch；`touch(directory)` = `forDirectory(directory).id` → `registry.projects.touch(id)`（写 lastProjectID+usedProjectIDs）；`hide(project)` = 该路径的项目 id 从 used 移除（服务端保留项目）。settings 项目菜单的移动「关闭」面（settings-framework-migration 在册）映射为同一 hide 语义。
- **恢复守卫**：home 恢复选择清除需 `servers.hydrated()` 且 `ctx.sync.project.ready()`（目标守卫照抄）——远端列表未就绪不得清掉恢复的项目选择；不同服务器同名目录由 ServerScope+project id 双键天然隔离（身份键见下节）。

## 路径边界（手机路径 vs 远程路径）

验收「绝不混淆手机文件系统路径与远程路径」由**结构性保证**承接，客户端零手机 FS 参与代码：

1. 目录浏览恒远端：`workspaces/selection/policy.ts` `directoryPickerKind` 仅在 `platform === "desktop" && ServerConnection.local(server)` 时返回 `"native"`，**web 平台恒返回 `"server"`**（对远端浏览，`~`/盘符均为远端语义）。
2. native picker 入口 `platform.openDirectoryPickerDialog` 仅由 picker 的 native 分支调用；web 平台对象（`runtime/platform/web.ts`）**不定义**该方法。
3. 「在文件管理器中打开/揭示」为 desktop 双门槛：`home/projects/reveal.ts`（`platform.platform === "desktop" && !!platform.revealPath && ServerConnection.local(conn)`）与 `home/projects/view.tsx` 的 `fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown")`——web 构建不可达。
4. 三 OS 支持=服务契约：全部路径/目录语义经上游 API（`file.list`/`file.find`/`location`/worktree），picker 自带 Windows 盘符与 `~` 归一（`workspaces/selection/domain.ts`）；客户端零 OS 条件分支（限定白名单目录的负例探针，见 `scripts/verify-projects-sessions.ts`）；真 OS E2E 归 #7 环境组；**Windows Desktop（上游桌面宿主）行为映射归 issue #1**，本仓库不实施桌面宿主。

以上 1–3 由静态探针锁定（含负例），静态检查不证明运行时行为，运行期核验归 G19。

## settings-ssh-entry-guard（入口 + 守卫修订）与语义注记

- 上游 `settings/shell.tsx` 的重定向守卫（`createEffect`：`multiple()` 布局下 `view.tab ∈ {projects, workspaces, providers, models, extensions, servers}` 时改写为 `open("general")`）使 "servers" 标签页在多服务器布局不可达——仅加入口不足以可达。settings-ssh-entry-guard 同文件两处改动：①守卫 `includes` 列表移除 `"servers"`（其余五项重定向语义不动：这些 per-server 面板在多服务器布局由 per-server 条目承接，上游原意图不受影响）；②`multiple()` 导航组增加固定「SSH hosts」入口（`surface.select("servers")` 打开既有 "servers" tab，即 settings-mobile-host-manager 挂载的 host-manager 面板；`Tabs.Content value="servers"` 块无条件渲染）。
- i18n 新键 `settings.tab.sshHosts`（en/zh，`runtime/i18n/en.ts`/`zh.ts`；connection-remember-credential/connection-error-classification 三文件先例）。
- **语义外溢（已评估低风险，如实记录）**：若上游未来把其他功能挂到 "servers" tab 并依赖「多服务器下不可达」假设，行为改变；该 tab 现状唯一内容是 settings-mobile-host-manager host-manager + 上游单服务器面板（后者在多服务器布局本就由 per-server 条目承接）。回滚=恢复列表项（单行）+移除入口。
- **验证边界**：V2/dist/探针三层均无法证明运行时导航可达性（守卫是 Solid `createEffect` 运行时行为）；「入口在 multiple() 布局可达且不弹回 general」归 G19 真机核对。

## 流转矩阵

| 来源 | 触发点 | 目的地 | 携带参数 | 失败时行为 | 状态 |
| --- | --- | --- | --- | --- | --- |
| server-list | 选择服务器/项目 | projects-sessions（home 会话区） | 项目元数据（scope 键控） | 项目不可达 → `home.project.missing` toast；`addProjects` 静默疑点归 G19 | 已实现（未验证） |
| projects-sessions | home 行打开会话 | 时间线（会话 tab） | `server` 键 + `sessionID` | stale ID → resolution failed（见状态矩阵） | 已实现（未验证） |
| projects-sessions | 新会话 | new-session 流（项目/工作区选择经远端 picker） | 目录（远端绝对路径） | picker 手输非法路径 → 行内反馈（上游 picker 承载） | 已实现（未验证） |
| projects-sessions | 归档（session-home-archive） | 行自 home 列表消失 + 该会话打开的 tab 关闭 | `sessionID` | 失败 → toast、行保留、不 remove（`archiveHomeSession` 语义） | 已实现（未验证） |
| projects-sessions | 切换工作区 | worktree inventory/submenu / `SessionLocationMissing` 恢复 | 目录 | 路径缺失 → 恢复流（picker 重选 + `session.move`） | 已实现（未验证） |
| projects-sessions | 设置 → SSH hosts 入口（settings-ssh-entry-guard） | host-manager（"servers" tab） | 无 | — | 已实现（未验证）；可达性归 G19 |

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | home 会话区 `loading`（`sessionLoad.isPending`）；上游承载 |
| 空态 | 空项目会话区文案 `home.sessions.empty(.description)`；新会话由 `canCreate`（`newSessionProject`）门控 |
| 错误态 | **stale session ID**：`session/session-resolution.ts` failed 态 → 会话路由错误边界；归档会话在 `shell/routes/session-ui-provider.tsx`（`!session || session.time.archived` → `session.error.notFound` toast）与 home lookup 均按 not-found 处置；`runtime/server/errors.ts` `isSessionNotFoundError`（`SessionNotFoundError` tag）。**不可达/已删除路径**：`SessionLocationMissing` 恢复流 + `home.project.missing.*` toast。**失败变更**：rename/remove/export/archive 均 toast + 行内反馈，remove 有确认对话框，finally invalidate；归档失败不 remove。**并发**：namespace revision + dirty-wins + rename resync |
| 边界态 | 同名项目（不同主机/不同目录）经双重键隔离（见上）；home 索引有界（`HOME_SESSION_LIMIT` 64 + 每目录 recent 窗口，`home/sessions/index.ts`） |
| 过程态 | 归档/删除为行内即时操作（删除有确认框）；归档**不设危险确认**（可逆元数据操作，非删除；零删除红线不适用） |
| 恢复口径 | tabs/drafts/滚动/导航栈经 `Persist.window` + tab memory + `SessionStateKey` 跨单窗口切换与重启恢复（上游机制，`Persist` 对象按 scope 隔离）；归档后行不再出现（服务端 `time.archived` + 索引过滤）；**本期无 unarchive 界面**（上游同样没有，属上游能力边界，已接受限制） |

## 门禁与验证

- **G19（新设，见 [interaction.md](../interaction.md)）**：projects-sessions 全部运行期行为的真机门禁——单窗口切换保持、同名隔离、空项目、错误恢复、settings-ssh-entry-guard 入口可达且不弹回、双路由各一遍。
- 静态探针：`scripts/verify-projects-sessions.ts`（session-home-archive 文本锚/调用形态、settings-ssh-entry-guard 守卫修订+入口、路径边界负例、零 OS 分支白名单扫描；**#106 增补四锚**：workspaces.tsx 删除确认 Cancel `autofocus` ×2、project.tsx `registry.label`/`useServers` 服务器标签源、projects.tsx min-w-0 页头、project-options.tsx mobile close face 正锚；诚实标注为静态结构检查）。
- 上游定向回归子集与 V2 构建冒烟：见 [../../build-and-verify.md](../../build-and-verify.md) issue #8 段。

## 文案口径

projects/sessions 面文案全部由上游 i18n 承载（`home.sessions.*`/`session.*`/`command.session.*` 等）；settings-ssh-entry-guard 新增 `settings.tab.sshHosts` 进入上游字典（en/zh 成对）；不新增第一方键。
