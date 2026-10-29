# 单元：projects-sessions（远程项目、工作区与会话生命周期）

状态：**已实现（未验证）**（issue #8）。浏览/选择远程目录、创建/打开/fork/重命名/归档会话、切换项目与工作区的能力由上游闭包携带的 UI 与生成客户端承载（未经任何新增平行界面）；本仓库增量仅两个最小 vendor 补丁：**M-017**（home 会话行归档接线，替换上游 stub）与 **M-018**（多服务器设置布局的 SSH hosts 入口 + 重定向守卫修订——此项是 [server-list.md](server-list.md) 预登记「已知入口缺口（M-008）」债务的承接，**不是 issue #8 的验收项本身**）。issue #55 的 M-027 只补齐空/签出连接屏的首个 SSH hosts 入口，未改变项目/会话生命周期或 SSH 传输。全部能力未经设备运行验证；真机门禁见 **G19/G36**（[interaction.md](../interaction.md)），双路由 lifecycle E2E BLOCKED。

## 能力来源（复用面，无新建第一方会话逻辑）

| 操作 | 上游实现（`vendor/upstream/packages/app`） | 服务 API（生成客户端 `packages/client/src/promise/generated/client.ts`） | 状态 |
| --- | --- | --- | --- |
| 浏览/选择远程目录 | `workspaces/selection/picker.tsx` `useDirectoryPicker`（server 模式对远端 `file.list`/`file.find` 浏览、`~` 展开远端 home、`normalizePickerDrive` 兼容 Windows 盘符输入、手输绝对路径兜底） | `file.list` / `file.find` | 已实现（未验证） |
| 添加项目 | `home/projects/controller.tsx` `pickDirectory` → `home/projects/add.ts`（`file.list` 校验 + `location.get` 取 project + `sync.child`） | `file.list` / `location.get` | 已实现（未验证）；`add.ts` 的校验失败被 `catch(() => undefined)` 吞掉且 `projects.open` 无条件执行——不可访问目录加入列表的真实反馈形态待 G19 首项核对（缺陷成立则预留 M-019，本期不预设） |
| 新会话项目选择 | `new-session/project/selector.tsx`（同一 picker） | 同上 | 已实现（未验证） |
| 创建会话 | `new-session/` 流 | `session.create` | 已实现（未验证） |
| 打开会话 | home 行（`home/sessions/controller.tsx` `open`）→ 会话 tab | `session.get`（`time.archived` 随 info 返回） | 已实现（未验证） |
| fork 会话 | `session/commands/fork-dialog.tsx` + `use-session-commands.tsx` | `session.fork`（body `before`） | 已实现（未验证） |
| 重命名会话 | home 行 rename（204 后本地 remember + invalidate + resync） | `session.update`（body `title`） | 已实现（未验证） |
| **归档会话** | **M-017**：home 会话行 `archive` 由 stub 改为真实调用，复用 `home/sessions/archive.ts` `archiveHomeSession`（成功清 tabs + 行移除；失败 toast 且不 remove） | `session.update`（body `archived: true`，服务端盖 `time.archived`） | 已实现（未验证）；归档 API 语义（服务端盖章/列表过滤）归 G19/live E2E |
| 删除会话 | home 行（确认对话框 + toast + tabs 清理 + finally invalidate） | `session.remove` | 已实现（未验证） |
| 移动会话 | `SessionLocationMissing` 恢复流（`session/composer/location-missing.tsx`） | `session.move`（body `directory`） | 已实现（未验证） |
| 项目列表/改名 | `project.list`（archived 过滤）/ `project.update`（name/icon/commands）；无 project.create/delete——项目由目录/worktree 派生 | `project.list` / `project.update` | 已实现（未验证） |
| 工作区（worktree） | worktree inventory/submenu + `worktree.updated` 事件驱动 | `worktree.list/create/remove/refresh` + `vcs.*` + `location.get/reload` | 已实现（未验证） |

上游会话生命周期 API 面全部在生成客户端中现存；`archiveHomeSession`（注入式 helper）的「失败不 remove、成功清理 tabs」语义由上游 `home/sessions/archive.test.ts` 锁定——**该测试不经过 M-017 的改写点**（controller 调用位），M-017 接线本身的覆盖=探针（结构）+ V2（构建）+ G19（真机）三层，如实标注。

## 第二处上游归档 TODO（N-3 边界补记）

`session/timeline/message-timeline.tsx` 存在第二处上游 TODO（`{/* TODO: Need a session archive API. */}`）：会话内菜单只有 rename/export/delete，**无归档项**。M-017 后归档仅 home 会话行可达；会话内菜单归档属上游能力边界，本期不改、不新增入口。

## 字段契约

全部走上游生成类型（`@opencode/client/promise`）：`SessionInfo`（`time.archived` 为 number 时间戳或缺失）、`SessionUpdateInput`（`title`/`metadata`/`permissions`/`archived`）、`SessionListInput`（`archived`/`directory`/`project`/`search`/`parentID`/cursor 分页）。本仓库不另行定义会话/项目数据契约。home 索引侧 `home/sessions/index.ts` 的 `parseHomeSessionIndex` 过滤 `typeof session.time.archived === "number"` 的行——归档后行从 home 列表消失由该过滤与查询缓存行移除共同保证。

## 身份键、隔离与状态保持（单窗口切换）

- **身份键**：项目身份 = worktree 远端绝对路径（`workspaces/path-key.ts` `pathKey` 规范化）；连接身份沿用 [server-list.md](server-list.md) 隔离表（直连=URL、SSH=`mobile-ssh:<uuid>`）。存储键在 pathKey 之上再叠加 ServerScope 前缀（`runtime/server/scope.ts` `SessionStateKey = ServerScope \0 route`）——不同主机的同名项目、同主机不同目录的同名项目天然不混，无数据泄漏（上游 `scope.test.ts`/`layout.test.ts`/`session-tabs.test.ts` 锁定；同名 UI 区分=项目行显示远端目录路径 + 服务器分组/主机名）。
- **标签与导航**：`shell/tabs/tabs.tsx` `Persist.window` 持久 tabs/recent/info/regions/closed；`Session`/`Draft` 两态 tab 均携带 `server: ServerKey`；每标签内存态（composer 等）在 `shell/tabs/memory.ts`，随窗口存活。
- **会话状态**：`sessionTabs`/`sessionView`（滚动）按 `SessionStateKey` 记录（`shell/state/layout.tsx`）；`Persist.serverGlobal/serverSession/serverWorkspace` 按 scope 隔离（`runtime/persistence/storage.ts`）。
- **草稿**：`Persist.draft` → web 平台 `createBrowserDraftStore()`（IndexedDB，`runtime/platform/web.ts`；内容分块 + blob 引用完整性，`runtime/persistence/drafts.ts`）。
- **并发**：`runtime/persistence/namespace.ts` 主机 revision 单调序 + 本地 seq 未落盘保护；`persist.ts` 本地脏值优先。

## 路径边界（手机路径 vs 远程路径）

验收「绝不混淆手机文件系统路径与远程路径」由**结构性保证**承接，客户端零手机 FS 参与代码：

1. 目录浏览恒远端：`workspaces/selection/policy.ts` `directoryPickerKind` 仅在 `platform === "desktop" && ServerConnection.local(server)` 时返回 `"native"`，**web 平台恒返回 `"server"`**（对远端浏览，`~`/盘符均为远端语义）。
2. native picker 入口 `platform.openDirectoryPickerDialog` 仅由 picker 的 native 分支调用；web 平台对象（`runtime/platform/web.ts`）**不定义**该方法。
3. 「在文件管理器中打开/揭示」为 desktop 双门槛：`home/projects/reveal.ts`（`platform.platform === "desktop" && !!platform.revealPath && ServerConnection.local(conn)`）与 `home/projects/view.tsx` 的 `fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown")`——web 构建不可达。
4. 三 OS 支持=服务契约：全部路径/目录语义经上游 API（`file.list`/`file.find`/`location`/worktree），picker 自带 Windows 盘符与 `~` 归一（`workspaces/selection/domain.ts`）；客户端零 OS 条件分支（限定白名单目录的负例探针，见 `scripts/verify-projects-sessions.ts`）；真 OS E2E 归 #7 环境组；**Windows Desktop（上游桌面宿主）行为映射归 issue #1**，本仓库不实施桌面宿主。

以上 1–3 由静态探针锁定（含负例），静态检查不证明运行时行为，运行期核验归 G19。

## M-018（入口 + 守卫修订）与语义注记

- 上游 `settings/shell.tsx` 的重定向守卫（`createEffect`：`multiple()` 布局下 `view.tab ∈ {projects, workspaces, providers, models, extensions, servers}` 时改写为 `open("general")`）使 "servers" 标签页在多服务器布局不可达——仅加入口不足以可达。M-018 同文件两处改动：①守卫 `includes` 列表移除 `"servers"`（其余五项重定向语义不动：这些 per-server 面板在多服务器布局由 per-server 条目承接，上游原意图不受影响）；②`multiple()` 导航组增加固定「SSH hosts」入口（`surface.select("servers")` 打开既有 "servers" tab，即 M-008 挂载的 host-manager 面板；`Tabs.Content value="servers"` 块无条件渲染）。
- i18n 新键 `settings.tab.sshHosts`（en/zh，`runtime/i18n/en.ts`/`zh.ts`；M-009/M-013 三文件先例）。
- **语义外溢（已评估低风险，如实记录）**：若上游未来把其他功能挂到 "servers" tab 并依赖「多服务器下不可达」假设，行为改变；该 tab 现状唯一内容是 M-008 host-manager + 上游单服务器面板（后者在多服务器布局本就由 per-server 条目承接）。回滚=恢复列表项（单行）+移除入口。
- **验证边界**：V2/dist/探针三层均无法证明运行时导航可达性（守卫是 Solid `createEffect` 运行时行为）；「入口在 multiple() 布局可达且不弹回 general」归 G19 真机核对。

## 流转矩阵

| 来源 | 触发点 | 目的地 | 携带参数 | 失败时行为 | 状态 |
| --- | --- | --- | --- | --- | --- |
| server-list | 选择服务器/项目 | projects-sessions（home 会话区） | 项目元数据（scope 键控） | 项目不可达 → `home.project.missing` toast；`addProjects` 静默疑点归 G19 | 已实现（未验证） |
| projects-sessions | home 行打开会话 | 时间线（会话 tab） | `server` 键 + `sessionID` | stale ID → resolution failed（见状态矩阵） | 已实现（未验证） |
| projects-sessions | 新会话 | new-session 流（项目/工作区选择经远端 picker） | 目录（远端绝对路径） | picker 手输非法路径 → 行内反馈（上游 picker 承载） | 已实现（未验证） |
| projects-sessions | 归档（M-017） | 行自 home 列表消失 + 该会话打开的 tab 关闭 | `sessionID` | 失败 → toast、行保留、不 remove（`archiveHomeSession` 语义） | 已实现（未验证） |
| projects-sessions | 切换工作区 | worktree inventory/submenu / `SessionLocationMissing` 恢复 | 目录 | 路径缺失 → 恢复流（picker 重选 + `session.move`） | 已实现（未验证） |
| projects-sessions | 设置 → SSH hosts 入口（M-018） | host-manager（"servers" tab） | 无 | — | 已实现（未验证）；可达性归 G19 |

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

- **G19（新设，见 [interaction.md](../interaction.md)）**：projects-sessions 全部运行期行为的真机门禁——单窗口切换保持、同名隔离、空项目、错误恢复、M-018 入口可达且不弹回、双路由各一遍。
- 静态探针：`scripts/verify-projects-sessions.ts`（M-017 文本锚/调用形态、M-018 守卫修订+入口、路径边界负例、零 OS 分支白名单扫描；诚实标注为静态结构检查）。
- 上游定向回归子集与 V2 构建冒烟：见 [../../build-and-verify.md](../../build-and-verify.md) issue #8 段。

## 文案口径

projects/sessions 面文案全部由上游 i18n 承载（`home.sessions.*`/`session.*`/`command.session.*` 等）；M-018 新增 `settings.tab.sshHosts` 进入上游字典（en/zh 成对）；不新增第一方键。
