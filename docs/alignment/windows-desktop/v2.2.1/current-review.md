# 当前实现复核（E34，2026-11-01）

## 比较身份与覆盖范围

- Mobile：`c68ccc0c2541e4cf19be4befc706cb09fcce0690`。本次 `git ls-remote origin refs/heads/main refs/heads/dev` 确认两远端分支均指向该提交；本地 main/dev 同值。开始时只有主工作树，未跟踪 `.zcode/` 保留未动；文档修改位于独立 `docs/desktop-matrix-refresh` 工作树。
- Desktop：沿用活跃目标 **v2.2.1**，本机上游仓库 `/home/peterhan/repository/opencode` 的标签解析为 `3ebcf9a32c7b28f658cfee80775448929361727a`。读取固定 git 对象，不以其工作目录 HEAD 替代目标；此次未评估更新版本。
- Vendor：全局 pin 仍为 `b4525d79bf3ec46c9c40bf2b843111d3cdd9ce43`；`vendor-manifest.json` 的 `packageSources` 单独将 gui-plugins 指向 `3ebcf9a…`，另叠加移动补丁。这是混合来源实现，不是整套 app/client/session-ui 已升级至 v2.2.1。
- 本轮为文档级复核：核对全部矩阵行的历史证据与状态，定向读取下表的代码差异、入口、平台桥及最新补验记录。没有逐文件穷尽整个上游差异，没有构建 APK、运行 Windows 或重跑 Android/真服务测试。未重新逐行为比较的行仍保留“已有代码，等价性待核”。
- 验收：稳定 ID 保留、每项差异可追溯、历史局部通过不升级为当前全链通过、已确认范围不重新变成待决策；检查文档链接与 `git diff --check`。

## 本轮源码证据

下表上游路径相对上游仓库，本项目共享路径加 `vendor/upstream/`。字节相等仅用于证明所述文件来源，不代表运行等价。

| 关联 ID | 对照路径与检查 | 当前结论 |
| --- | --- | --- |
| S02 | `packages/app/src/settings/search.tsx` 两侧实读及 pin→目标 diff；本树 `surface.plugins.items()` | #90 已修复插件索引崩溃；目标改用 SearchList/SearchHighlight、分组与聚焦行为，本树仍是旧搜索实现加消费点修补。搜索能用不代表目标搜索交互已全部移植。 |
| S04/W05 | 目标 `packages/app/src/shell/titlebar/inbox.tsx`、`inbox-model.ts`；本树两文件不存在；shell 的模式判断与 M-033 | 设置三模式已落地，但 Inbox 仍复用 Side rail；缺少目标 Inbox 列表、跨服务聚合与相应未读/注意状态。此结论不否认旧会话 tab 已有 unread/attention。历史设备观察 E19 与源码一致。 |
| S09/W15/W06/W08 | `packages/app/src/session/composer/queue.ts`：本树逐字节等于 pin、不同于 v2.2.1；目标新增 `composer/media.ts`，本树无此文件 | 缺目标 `SentEdit`、按 session mutation scope 串行、乐观重排/隐藏、失败恢复编辑草稿、已接纳后不重发与 `pinPromptMedia` 媒体保留链。旧 queue/steer 已存在；这是已定位的行为增量，不再只写“待核对”。是否在真实服务组合中出错仍需运行验证。 |
| W13 | `packages/app/src/session/commands/export.ts`：本树逐字节等于 pin；目标两处 `message.list` 加 `{ mediaRefs: false }` | 导出媒体读取参数未迁移；不据此断言当前服务一定导出损坏文件。目标语义需连同 client/media 契约评估。 |
| W13/N08 | `use-session-commands.tsx` 的 `saveSessionExport` → `runtime/platform/web.ts` 的 `createPlatformFileSaver` → 第一方 `files/client.ts` → Android `files/FilesBridge.kt` 的 `ACTION_CREATE_DOCUMENT` 与 `openOutputStream` | 导出到 Android 保存的源码链已接通，不是“只有两个孤立端点”。桥不可用时返回 false（静默取消），真机保存、产物完整性、取消/失败仍归 G27；复制 ID 命令亦已存在。 |
| W22 | 目标 `packages/gui-plugins/src/goal/renderer.tsx` 注册 ComposerPill；本树注册 Panel、side、mobile order 70，保留 pause/resume/clear | #67 合并后仍保留 Panel 重表壳；“等 #67 迁移后补 pill”的旧推进措辞过期。属于当前明确的呈现差异，不是 Goal 完全缺失。 |
| S41/N11/S43 | `packages/mobile-hosts/src/ui/extension-manager.tsx`、#96 台账与提交 `4d75fe3` | 开关反转修复已集成；真机开关往返及两次 force-stop 持久化有证据。面板撤除/恢复、远端 PTY 不受影响与完整失败/Reload 链仍不能由管理器开关通过推定。 |
| N08 | `runtime/platform/web.ts` 的 `activeFilesPort().openExternal`、`files/client.ts`、Android `ExternalOpenPolicy.kt`/`FilesBridge.kt` | Platform.openExternal 已经原生外跳；仅 http/https，mailto 拒绝是已登记差异。原始 `target=_blank` 锚链接不自动等同于该桥覆盖；真实 OAuth/MCP 授权回流未验。 |

复现方式：`git -C /home/peterhan/repository/opencode show v2.2.1:packages/<路径>`、`git diff b4525d79bf v2.2.1 -- packages/<路径>`；本树文件直接读取。queue/export 的 pin 相等检查使用 Python `Path.read_bytes()` 与 `git show` 返回字节比较，结果均为 true；与 v2.2.1 比较均为 false。

## 最新运行记录覆盖旧状态（本次未重跑）

以 `docs/build-and-verify.md` 对应 issue 的**设备补验轮**为准；旧“待执行”标题保留的是当时状态。

| 关联 ID | 已有后续证据 | 仍未覆盖 |
| --- | --- | --- |
| S01/S02/S27/S35/S37 | #90 补验 S1-A/B/C/E/F：Settings 可达、搜索命中、三个主机独立呈列、Reload 幂等、零 TypeError；S2：SSH 认证段及三种连接错误呈现 | 活服务下会话/工作台回归、连接态 Settings、Shell 读写回滚；旧“无线调试未恢复”已不再是该轮最终阻塞原因，最终阻塞为无活服务 |
| S17/S42 | #65 补验：显式 On/Off、缩放六档、持久化、字号叠加、键盘与搜索有通过记录 | 本机 WebView 114 的 system 档未映射系统减少动效；不是三态全部等价 |
| S38 | #64 补验：newIcons、持久化、8lh 支持通过 | 真实长消息折叠展开及 500 行性能未验 |
| S39 | #72 补验：版本/基座、notices 滚动、搜索与布局通过 | 服务版本行仍需已连接服务；多主机取排序首项是移动实现边界 |
| S41/S43/N11/N12 | #67 补验管理器 15 行（三集包括 WSL 排除行）呈现；#96 修复后启停与持久化通过 | WSL 读屏/零操作完整专项、工作台面板与失败恢复场景未全验，不将整个 G35 标通过 |
| W21/W22/W23 | /btw 已接窄屏入口；Sources gate 持久化有补验 | 会话内 /btw、Goal 往返、Sources chip→面板闭环未验；旧 MatePad CSS 视口下限 818px 不证明 <768px 手机体验 |
| S36/N04/W01/W07 | #61 具备真实 SSH 信任→认证→隧道→服务认证→既有会话的历史主链证据 | #67 后只补到 #90 的认证/错误段；不能宣称当前集成版全链复验通过。任务级存活、直连链、切网和 incompatible 真服务仍缺 |

## 推进顺序

后续用户确认将 **Settings 整体界面对齐作为下一实施项**。执行范围、顺序、验收与当前状态统一维护于 [矩阵的工作单元](matrix.md#下一实施工作单元settings-整体界面对齐)；下列序列保留本次初始盘点建议，当前优先级以矩阵为准。

1. **核心运行闭环**：在可用授权服务上验证当前集成版 SSH/HTTPS 直连、创建会话/发送/流式/权限、断线重连及任务级存活（G19–G21/G30），复用 #61 已有场景。
2. **已定位的版本行为差异**：队列并发/恢复与媒体契约、导出媒体参数、Inbox 列表；迁移时按依赖闭包评估，不能只复制一个文件。
3. **移动操作闭环**：文件/Diff/PTY、附件/导出/Office、通知、配对兑换、窄屏返回与软键盘；Goal/Sources/btw 的真实会话面补验。
4. **范围边界**：APK 更新与语音按 ADR 暂缓；外链唤起、WSL 执行、手机本地服务、第三方 GUI 完整运行、进程死亡通知按既有决定处理。不把这些算作待修缺陷，也不以矩阵行数计算完成率。

## 本轮文档核对结果

- T1 文档更新；用户批准直接修改及自检，省略代理流程，无独立代理评审。
- `git diff --check` 通过；Python 比较修改前后矩阵：**93 个稳定 ID 无增删、无重复、顺序相同**；五份改动文档 **46 个本地链接目标存在**（不含远程网址与标题锚点可达性验证）。
- 自检覆盖来源固定、后续补验优先、部分通过边界与 ADR 一致性；运行测试未执行，不新增任何 APK/设备通过结论。
