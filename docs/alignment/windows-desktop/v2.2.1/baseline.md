# Windows Desktop v2.2.1：基准、源码依据与验收要求

> **历史基准已冻结（2026-11-12）**：本页只描述 v2.2.1，不再作为当前活跃目标；升级变化见 [v2.2.7 变化总结](../v2.2.7/changes.md)。

> 2026-11-06 复核仍使用本页的固定目标 `3ebcf9a…`；当前 Mobile 身份、源码增量与历史补验边界见 [E35（含 E34 历史）](current-review.md)。本页是上游目标及最小验收清单，不是当前通过记录。以下初次盘点的环境说明保留其历史时点。

## 1. 首个基准

| 项目 | 事实 |
| --- | --- |
| 对标产品 | OpenCode Windows Desktop 客户端 |
| 首个目标版本 | v2.2.1；无前版对齐表，但已有 vendor b4525d79bf 基线；不描述为“从旧版升级完成” |
| 上游提交 | `3ebcf9a32c7b28f658cfee80775448929361727a` |
| 本机源码 | `/home/peterhan/repository/opencode`；工作目录 HEAD 领先于标签，本次新增核对使用 `git show/git grep v2.2.1` |
| Windows 宿主依据 | `packages/desktop/src/renderer/platform/index.ts` 提供 desktop 平台、Windows OS 识别、通知、存储、缩放、插件及文件接口 |
| 插件注册依据 | `packages/gui-plugins/src/renderer.ts`、`packages/gui-plugins/src/main.ts` 的 compose 注册表；不能只看组件文件是否存在 |
| 发布安装包 | 未获取/运行 Windows v2.2.1 安装包；架构、安装器校验值、内嵌渠道与实际页面待运行核实 |
| 验证环境 | 当前源码检查在 Linux；本项目已有 MatePad 局部冒烟记录，见 implementation.md；本轮未复测 |
| 本次核对性质 | 静态盘点及实施前验收要求，未构建上游/本项目，未执行 Windows/Android 功能测试 |

固定版本入口：<https://github.com/anomalyco/opencode/tree/3ebcf9a32c7b28f658cfee80775448929361727a>。

查阅任一以下路径：在上游仓库执行 `git show v2.2.1:<路径>`。不能改成默认读 dev；同一个版本的内部包版本号也不能替代发布标签。

## 2. 证据级别

- **共享源码**：有对应组件、状态或命令，未发现该入口排除 Windows。
- **宿主/注册链已核对**：进一步核对 Windows 平台接口、插件注册或 OS 条件。
- **Windows 实机已验证**：必须有指定安装包/构建、系统版本、步骤与结果；当前没有此级证据。
- **本项目已验证**：必须另附本项目提交/构建、设备、远程服务版本与结果；已有局部 APK/设备记录见 [实现证据](implementation.md)，不代表目标版本完整验收。

矩阵“有”只能结合以上口径读作源码结论。条件性入口写明窗口宽度、插件启用、当前服务、构建渠道等条件；未核对发布包条件的功能不能算正式版默认能力。

<a id="source-map"></a>

## 3. 功能 ID → 源码 → 最小验收映射

路径相对上述固定版本上游仓库。每行验收都需要在 Windows 参考端确认，再在本项目的等价交互验证；排除能力只核对范围与入口隔离。下列均为**待执行**清单，不是测试通过记录。

### Settings

| 矩阵 ID | 源码依据 | Windows 条件与最小验收要求 |
| --- | --- | --- |
| S01–S03 | `packages/app/src/settings/shell.tsx`、`packages/app/src/settings/navigation.tsx`、`packages/app/src/settings/search.tsx`、`packages/app/src/settings/surface.tsx` | 本地偏好与服务器页分组；搜索定位并返回；切换两台服务器；断线时仍能打开本地设置，远程页给错误出口 |
| S04–S09 | `packages/app/src/settings/general/general.tsx`、`packages/app/src/settings/general/interface-mode.tsx`、`packages/app/src/settings/model.tsx` | 分别验证三种模式、语言、工作区默认、权限默认、自定义 Agent、queue/steer；重开后保持并影响实际任务，不只验证保存成功 |
| S10–S11 | `packages/app/src/settings/timeline-detail.tsx`、`packages/app/src/settings/general/general.tsx` | 各时间线类别预设/细分改变真实消息呈现；宽度、活动隐藏/位置与每轮 Diff 生效 |
| S12、S42 | `packages/desktop/src/renderer/window/zoom.ts`、`packages/desktop/src/renderer/platform/index.ts`、`packages/app/src/settings/general/controllers.ts` | 捏合开关与缩放比例是两个能力；检查 Windows 触控/缩放及重开恢复；Android 等价策略另定 |
| S13 | `packages/app/src/settings/general/general.tsx` | `max-width: 767px` 控制入口，不是 Windows 专有或仅手机 OS 可见；缩窄 Windows 窗口核对，再验证 Android 软键盘 |
| S14 | `packages/gui-plugins/src/review/renderer.tsx`、`packages/gui-plugins/src/review/settings.tsx` | 插件将换行项注入 General；对长行 Diff 验证换行前后可读性 |
| S15–S17 | `packages/app/src/settings/appearance/appearance.tsx`、`packages/app/src/settings/general/controllers.ts`、`packages/app/src/settings/model.tsx` | 主题明暗、三种字体回退、减少动效；Windows 字体不保证手机可用；大字和 reduced-motion 验证 |
| S18–S19 | `packages/app/src/settings/notifications/notifications.tsx`、`packages/desktop/src/renderer/platform/notifications.ts` | 窗口聚焦时 notify 返回；失焦通知 silent，声音由独立逻辑控制；三类事件/开关/声音预览/点击返回分别验证 |
| S20 | `packages/app/src/settings/keybinds/keybinds.tsx`、`packages/app/src/settings/keybinds/migration.ts` | 记录 Windows 实际按键显示；修改、冲突、恢复；迁移后不丢自定义项；Android 外接键盘验收 |
| S21–S23 | `packages/app/src/settings/providers/providers.tsx`、`packages/app/src/settings/providers/account-actions.ts` | API key/OAuth、环境/config 来源、切账号/重命名/移除；取消授权和请求失败保持明确状态；凭据作用于指定服务 |
| S24 | `packages/app/src/settings/models/models.tsx` | 搜索、分组、显示/隐藏及从供应商跳转；会话选择器与设置一致 |
| S25–S26 | `packages/app/src/settings/providers/extensions.tsx` | MCP default Location 与活动 Location 不同；认证/启停/失败；插件/技能空态与列表；第三方 GUI 运行不在此行验收 |
| S27–S30 | `packages/app/src/settings/workspaces/projects.tsx`、`packages/app/src/settings/workspaces/project.tsx`、`packages/app/src/settings/workspaces/project-options.tsx` | 列表进入项目、名称/图标/颜色、权限继承、启动脚本；目录丢失、保存失败、文件选择取消；清理项目通知与文件管理器入口按能力显示 |
| S31–S32 | `packages/app/src/settings/workspaces/workspaces.tsx` | 项目过滤、磁盘与关联会话；单删/批删/无会话清理；取消、未提交改动提示、失败和重连后的真实状态 |
| S33–S34 | `packages/app/src/settings/workspaces/project-extensions.tsx` | 项目专有与共享项；LSP 读取 config 并展示启用状态/扩展名，不是编辑器；加载失败可重试 |
| S35、S37 | `packages/app/src/settings/servers/servers.tsx`、`packages/app/src/settings/general/controllers.ts`、`packages/app/src/servers/connect/dialog.tsx` | 单/多服务器布局、添加/编辑/认证；Shell 读取与失败回滚；地址和凭据错误不误指向其他服务 |
| S36 | `packages/gui-plugins/src/ssh/renderer.tsx`、`packages/gui-plugins/src/ssh/command.ts`、`packages/gui-plugins/src/ssh/contract.ts` | 桥接路径见 N04/N05；实际系统 ssh.exe、密钥、主机指纹和远端版本组合待 Windows 验证 |
| S38 | `packages/app/src/settings/experimental/experimental.tsx`、`packages/app/src/settings/model.tsx` | 标签内只有新图标/折叠长用户消息；默认关闭；每个开关验证真实视觉行为 |
| S39 | `packages/app/src/settings/about/about.tsx` | Windows 构建版本、许可和 notices 可打开；本项目显示自己的版本及上游来源，不冒充官方 Desktop |
| S40 | `packages/gui-plugins/src/updater/renderer.tsx`、`packages/gui-plugins/src/updater/main.ts` | General 更新区与条件性 What's New 分开；packaged、渠道、beta notes 条件分别记录；详见 N09 |
| S41、S43 | `packages/app/src/runtime/plugin/settings-pages.ts`、`packages/app/src/runtime/plugin/extension-plugins.tsx`、`packages/desktop/src/main/plugin/host.ts` | SettingsPage 贡献和服务端插件列表不是一回事；own/builtin、OS 不适用、插件失败及 reload 的不同状态需要核对 |

### 工作界面

| 矩阵 ID | 源码依据 | 条件与最小验收要求 |
| --- | --- | --- |
| W01、W09 | `packages/app/src/new-session/screen.tsx`、`packages/app/src/new-session/project/selector.tsx`、`packages/app/src/home/sessions/search.ts`、`packages/app/src/shell/commands/session-search.tsx` | 项目/服务器选择→创建会话→搜索并切回；项目不存在/连接失败有出口 |
| W02、W14 | `packages/app/src/composer/submit.ts`、`packages/app/src/session/route.tsx`、`packages/app/src/session/requests/session-permission-dock.tsx`、`packages/app/src/session/requests/session-question-dock.tsx`、`packages/app/src/session/requests/session-elicitation-dock.tsx` | 发送→流式输出→权限/提问/表单→继续；取消、拒绝、提交中断和重连后重复响应需验证 |
| W03、W16 | `packages/gui-plugins/src/file/renderer.tsx`、`packages/gui-plugins/src/review/renderer.tsx`、`packages/app/src/session/commands/use-session-commands.tsx` | 文件打开、关闭、切换、Diff 浏览、选区加入上下文；文件消失和超长文本；评论与编辑细节仍需细化，不宣称全部审查能力完成盘点 |
| W04 | `packages/gui-plugins/src/terminal/renderer.tsx`、`packages/gui-plugins/src/terminal/model.ts` | 创建多个 PTY、输入输出、切换、关闭；连接中断/尺寸变更；主任务与终端关闭不能混淆 |
| W05、W15 | `packages/app/src/shell/tabs/tabs.tsx`、`packages/app/src/session/composer/activity-chips.tsx`、`packages/app/src/session/composer/queue.ts`、`packages/app/src/session/composer/queue-panel.tsx` | 标签切换不串任务；queue/steer 与后台活动状态；重连后队列和执行结果一致 |
| W06 | `packages/app/src/composer/attachments/uploads.tsx`、`packages/desktop/src/renderer/platform/files.ts` | 选择/粘贴附件，取消与上传失败；Windows 本地文件路径不能直接当远程有效路径 |
| W07 | `packages/gui-plugins/src/wsl/main.ts`、`packages/gui-plugins/src/ssh/controller.ts` | WSL cleanup 明确 stopServers；不同连接生命周期不能统一推断。Windows 分别断开 HTTP/SSH/退出 WSL 宿主观察，本项目必须满足远程任务不主动停止的既定目标 |
| W08 | `packages/app/src/runtime/platform/platform.tsx`、`packages/app/src/settings/model.tsx`、`packages/app/src/shell/tabs/schema.ts`、`packages/app/src/shell/tabs/memory.ts` | 有 draftStore/persistence 接口不等于进程恢复已验证；检查切页、重启、被杀后恢复及敏感字段排除 |
| W10 | `packages/app/src/session/timeline/controller.tsx`、`packages/app/src/home/sessions/archive.ts` | 重命名/归档/删除分别验证；模拟失败；列表与当前会话导航同步 |
| W11–W13 | `packages/app/src/session/commands/use-session-commands.tsx`、`packages/app/src/session/commands/fork-dialog.tsx`、`packages/app/src/session/commands/export.ts` | Undo/Redo/Fork、Compact、导出/复制 ID；无会话/无消息禁用；失败反馈；导出文件内容与路径选择 |
| W17–W18 | `packages/app/src/composer/commands.tsx`、`packages/app/src/usage/dialog.tsx`、`packages/gui-plugins/src/context/renderer.tsx` | Agent/模型/变体切换；无模型；用量和上下文数据加载/缺失；不能用零值掩盖失败 |
| W19 | `packages/gui-plugins/src/browser/renderer.tsx`、`packages/gui-plugins/src/browser/main.ts` | Desktop 原生 pane；可用性 gates；打开/新标签/地址/刷新/检查；浏览器工具与远程服务联动仍需专项验证 |
| W20 | `packages/gui-plugins/src/microsoft-office/renderer.tsx` | 按需加载 docx/xlsx/pptx 查看器；ZIP 签名及旧二进制/加密格式错误；大文件性能待验收 |
| W21 | `packages/gui-plugins/src/btw/renderer.tsx` | /btw 在 `!layout.narrow()` 且有会话时启用；旧 vendor 同样有此 gate；先核对现有设计再补移动交互方案 |
| W22 | `packages/gui-plugins/src/goal/renderer.tsx` | 依服务器 goal RPC；active/paused/complete 及 pause/resume/clear；无插件时不显示 |
| W23 | `packages/gui-plugins/src/sources/renderer.tsx` | sourcesExperiment.enabled 控制页与链接；关闭后面板收回；不推定默认开启 |
| W24 | `packages/app/src/voice/composer.tsx` | desktop + 非 prod 渠道 + 实验开关；需记录发布构建渠道，不能从源码存在推断稳定版默认有语音 |
| W25 | `packages/gui-plugins/src/details/renderer.tsx`、`packages/gui-plugins/src/details/location-workspace.tsx` | 有项目才提供 details drawer；子 Agent 禁用工作区切换入口；会话位置与服务上下文准确 |
| W26 | `packages/app/src/shell/commands/palette.ts` | command/file/session/setting 检索；同名不同服务器结果不能误开；空结果与键盘/触摸路径 |
| W27 | `packages/app/src/session/timeline/search-controller.ts` | 用户/助手文本搜索、折叠消息定位及高亮；不支持 CSS highlights 时仍需可用的定位反馈 |
| W28 | `packages/gui-plugins/src/debug/renderer.tsx` | bar 命令与 heap main 条件、DEV/beta motion 条件分开；缺能力不显示永远无效的控制项 |

### Windows 专有/宿主、范围排除与本项目增补

| 矩阵 ID | 源码/范围依据 | 条件与最小验收要求 |
| --- | --- | --- |
| N01、D01 | `packages/desktop/src/main/service/desktop-cli.ts`；本项目 [范围](../../../project-scope.md) | Windows 使用 .exe；手机没有本地服务入口或本地工具执行路径，远程任务不受手机退出控制 |
| N02–N03 | `packages/gui-plugins/src/wsl/index.ts`、`packages/gui-plugins/src/wsl/main.ts`、`packages/gui-plugins/src/wsl/renderer.tsx`、`packages/gui-plugins/src/wsl/dialog.tsx` | OS windows；发现、安装、添加、启动/失败重试；区分“手机本地运行 WSL”与“访问远程 WSL 服务”；后者不因此排除 |
| N12 | 用户在本次对话明确要求 Android 显示置灰 WSL；上游入口见 `packages/gui-plugins/src/wsl/renderer.tsx` | 在对应添加服务器入口保留 WSL；显示禁用原因，触摸/键盘不得启动操作，TalkBack 可感知名称、不可用状态和原因；不影响 SSH/直连 |
| N04–N05 | `packages/gui-plugins/src/ssh/command.ts`、`packages/gui-plugins/src/ssh/contract.ts`、`packages/gui-plugins/src/ssh/renderer.tsx` | ssh.exe 存在/不存在；host-key、认证、检查、下载/上传、启动、不兼容、取消；禁止用全局跳过校验实现“兼容” |
| N06–N07、D02–D03 | `packages/gui-plugins/src/pairing/renderer.tsx`、`packages/gui-plugins/src/pairing/page.tsx`、`packages/gui-plugins/src/pairing/main.ts` | 本机服务/插件 main 条件；二维码/码过期/刷新；remote 设置的服务生命周期；屏幕常亮；手机连接方不是主机侧开关的直接复用 |
| N08 | `packages/desktop/src/renderer/platform/files.ts`、`packages/app/src/home/projects/reveal.ts`、`packages/gui-plugins/src/file/open-in-app.tsx` | Windows 文件/Explorer/外部 app 的本机路径语义；远程路径不直接交给 Android 文件管理器 |
| N09 | `packages/gui-plugins/src/updater/main.ts`、`packages/gui-plugins/src/updater/platform.ts`、`packages/gui-plugins/src/updater/renderer.tsx` | packaged 启用更新器；Windows staging；检查失败/无更新/下载与安装过程；beta notes 由编译条件控制 |
| N10 | `packages/app/src/shell/titlebar/windows-menu.tsx`、`packages/desktop/src/renderer/platform/index.ts` | Windows 窗口与菜单行为；手机端核心动作触摸可达，不显示无效窗口按钮 |
| N11、D04 | `packages/gui-plugins/src/renderer.ts`、`packages/gui-plugins/src/main.ts`、`packages/desktop/src/main/plugin/host.ts` | 内置插件及自定义插件、OS 过滤、主进程失效；本项目已有原生 WebView 宿主和内置管理范围，不承诺 Electron 插件自动兼容 |
| D05 | 产品生命周期范围；本次未确认 Windows 退出后的通知交付机制 | 手机进程被杀后通知不在当前默认承诺内；必须有后台/推送方案及真机证据后才能改变状态 |
| M01–M05 | 本项目 [范围](../../../project-scope.md) 与 [固定实现证据](implementation.md) | Android 壳、保险库、文件/通知桥和恢复已有；安装启动有局部历史证据，各功能完整运行门禁另验 |

## 4. Settings 迁移与验收要点

以下保留 Settings 专项盘点中的默认值与跨页面约束，功能状态统一由矩阵维护。

- **版本边界**：v2.2.1 Experimental 页仅含新图标、折叠长用户消息；不含后续 `newQuestionUI`。Inbox 在 General 中带实验标记。
- **默认值**（`packages/app/src/settings/model.tsx`）：横向标签、后续消息 `steer`、工作区目的地 `last-used`；自动批准、自定义 Agent、每轮 Diff、新图标、折叠消息均关闭；后台活动在左侧，时间线宽度 comfortable，减少动效跟随系统，窄屏标题栏在顶部。通知默认仅权限通知开启，三类任务声音及界面音效默认开启。
- **迁移**：偏离默认值需记录理由；保留已有用户偏好。主题、语言和插件偏好有独立数据源，不能只迁移 `settings.v3`。工作区 `local` 指远程服务器原目录。
- **导航与作用域**：本地设置离线可用；服务器页保留所选服务，项目子页携带服务与项目身份；搜索定位后返回原上下文；Providers → Models 保留供应商筛选。切换服务、项目消失或目录缺失必须有明确状态与恢复出口。
- **远程写入**：验证保存中、失败回滚/重试及结果不确定时重新查询；项目失焦保存、权限继承、Shell 选择必须影响正确远程目标。账号凭据不进入普通前端存储或草稿。
- **移动交互**：复用主题令牌及窄屏导航；覆盖横竖屏、系统大字、软键盘、返回层级、TalkBack 与外接键盘。核心操作触摸可达，状态不只用颜色传递。

## 5. Windows 运行核对准备

下一轮需要可访问的 Windows v2.2.1 客户端或用户提供的录屏/截图；不把静态盘点阻塞在运行环境上。记录至少包含：

- About 版本、Windows 版本/架构、安装包来源；能取得时记录安装器 SHA256。
- Settings 全部导航及插件页面，普通宽度与窄窗口各一次。
- Providers/Extensions/Projects 的所选服务器和 builtin/远程身份；截图隐藏地址、账号及凭据。
- WSL、SSH、配对、更新页的可用/不可用状态，以及构建渠道。
- 按功能 ID 记录实际结果；与源码不符先保留差异，核实构建来源和能力条件后再裁定。

运行报告放在本版本 `evidence/` 并由矩阵引用。浏览器工具、review 评论/编辑、debug 诊断、details 工作区操作和高级连接配置仍需细化；当前映射不代表已穷尽全部产品行为。
