# 单元：server-list（服务器列表与项目选择）

当前 Settings Server 契约以本页 **issue #124** 段为准；其余早期管理界面/门禁记录是历史能力说明，不再描述 Settings 的当前挂载面。真实连接与设备证据见 [构建与验证](../../build-and-verify.md)，不得把历史未验证概括套用到后续已验证构建，也不得把历史设备结果套用到本次产物。

## 字段契约（已实现）

来源：`vendor/upstream/packages/app/src/runtime/server/persistence.ts`（connection-password-memory-only 预应用后）。

| 字段 | 类型 | 语义 | 状态 |
| --- | --- | --- | --- |
| `list` | StoredServer[] | 服务器记录列表（见 [connection.md](connection.md) 字段契约） | 已实现（未验证） |
| `hidden` | Record<key, Boolean> | 每服务器的隐藏标记 | 已实现（未验证） |
| `projects` | Record<key, { worktree, expanded }[]> | 每服务器的项目（worktree）树与展开态 | 已实现（未验证） |
| `lastProject` | Record<key, …> | 每服务器最后选中的项目 | 已实现（未验证） |

password 字段经同一 connection-password-memory-only encode 剥离，列表持久化同样收不到凭据。

## SSH 主机注册表契约（已实现（未验证）：issue #3）

存储：第一方 `packages/mobile-hosts`，键 `opencode-mobile.hosts.v1`（WebView localStorage，经 `StoragePort` 适配；载荷白名单保证无凭据，不含 Android 专属 API）。**持久化载荷白名单（仅以下字段，多数字段拒收）**：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `id` | String（uuid v4） | 主机身份，创建即定、永不改 |
| `name` | String（唯一，1–100 字符） | 展示名，重名校验拒绝 |
| `target` | String（SSH 目标，`[user@]host[:port]` 形，≤500 字符） | 连接目标；格式校验失败拒收 |
| `credentialRef` | optional String（`mobile-credential:<id>` 形，≤500 字符） | 非机密引用，不是凭据；解析经 vault-backed resolver（issue #4 已实现（未验证），默认 UnavailableVault fail-closed） |
| `servicePort` | optional Number（1–65535，白名单整数；默认 4096） | **远端 OpenCode 服务端口**（issue #6，已实现（未验证））：隧道转发目标 = 远端回环 `localhost:<servicePort>`；载荷白名单整数（非整数/越界拒收）；缺省载荷按默认 4096 读取（旧载荷往返兼容） |
| `createdAt` / `updatedAt` | String（ISO 时间戳） | 审计元数据；更新不改 id/createdAt |

**双端口去混淆（F7）**：SSH 主机有两个语义不同的端口——①**SSH 端口**（连接主机所用，位于 `target` 的 `:port` 段，缺省 22）；②**服务端口**（`servicePort`，隧道转发目标在**远端**回环上的 OpenCode 服务端口，缺省 4096）。host-dialog 以两个独立输入位+明确标签区分（「SSH 端口」在 target 内、「服务端口」单独字段），文案明示转发目标是远端回环 `localhost:<servicePort>` 单跳（无跳板机）。

**passphrase 位（issue #6，已实现（未验证））**：host-dialog 私钥导入后显示可选 passphrase 输入位（可能加密时出现，不强制）；passphrase 不进注册表/持久化载荷——它随私钥同入 vault 信封（`{"v":1,"key":…,"passphrase":…}`，Keystore AES-GCM 同层保护；三方案对比与裁定见[决策记录 0003 §4](../../decisions/0003-ssh-transport.md)）。`FORBIDDEN_INPUT_KEYS` 不动。

- 凭据形字段（password/secret/token/privateKey 等）在载荷校验层拒收：**测试断言**持久化往返与重启恢复后的记录不含任何 password 形字段。
- 存储降级不静默：注入存储不可用（或拒绝写入）时注册表落到内存后备，`storageVolatile` 标志经 host-manager 以行内提示明示（i18n 键 `hostManager.volatileStorage`，EN/ZH）；单测覆盖降级路径。
- 白名单外字段拒收（未知键剥离或拒绝，测试锁定）。

## 身份键与隔离（已实现（未验证）：issue #3）

| 连接方式 | 身份键 | 端口变化行为 |
| --- | --- | --- |
| 直连 http | URL 本身（上游原生 `Key.make(url)`） | 端口变化 = 新身份（上游原生语义，编辑地址即新记录；本仓库不改） |
| SSH | `mobile-ssh:<uuid4>`（extension 键 `${extension}:${id}`） | 隧道端口重解析（reconnect）→ 上游 health 重新探测（checking）→ **身份/scope/会话/设置键全部不变**（单测锁定） |

- 隔离：上游 `ServerScope` 按 server 键控 projects/lastProject/hidden/recentlyClosed 与会话状态键——同名路径/项目/会话/设置在不同主机间天然隔离，不因重名混淆（键隔离随上游机制成立；设备级行为归 G13）。
- 同名校验：上游对 displayName 无唯一性约束（自由命名）；SSH 主机名由我方注册表强制唯一（重名拒绝，测试锁定）。
- 多 host 一窗：SSH 主机经 `props.servers` 注入上游 `ServersProvider`（extension 型；provided 键 `canRemove=false`，删除控制权在我方管理界面）；直连服务走上游原生注册表。注入值必须是 solid store 派生的响应式访问器（`ServersProvider` 在 `createMemo` 内读取；普通数组快照不会触发重渲染——测试锁定变更传播）。

## 管理界面挂载点（已实现（未验证）：issue #3 + issue #4 扩展）

### Settings Server 完整上游展示（issue #124）

**范围/事实**：已实现 UI 与未接通动作的明确失败；不实现后台。来源为 Desktop v2.2.1 `3ebcf9a32c7b28f658cfee80775448929361727a`（不是上游 HEAD）。Server 页面、HTTP 对话框沿用现有 vendor；SSH 直接复用 gui-plugins 的 `dialog.tsx` / `row.tsx` / `state.ts` / `name.ts` / `contract.ts` / `ssh.css` 与全部 i18n catalog，只增加窄翻译/动作失败接口，不另画移动版表单。唯一界面例外是 WSL 灰显；无额外说明、SSH hosts 标题、凭据/服务面板。旧 MobileHostManager 在 Settings 中卸载，但代码和连接屏既有功能保留。

| 单元/标识 | 布局与控件 | 状态与流转 | 数据/恢复 |
| --- | --- | --- | --- |
| Settings Server：`servers` tab | 原上游标题/描述/Add；单服务 Connection/Preferences、多服务分段列表；SSH 用原上游徽标/状态点/版本/更多菜单 | 加载与健康门沿用上游；无记录仅标题；非健康 Shell 隐藏；HTTP Authenticate/Edit/Delete 继续原安全链；Android WebView 触摸 Edit 延迟 350ms，避开菜单选择后的兼容 click；SSH 按真实 runtime 状态展示 | HTTP registry + 既有 `mobile-ssh:<uuid>` 连接；唯一 runtime owner 不变、不注册第二个 SSH 插件、无 mock inventory |
| 添加菜单 | 顺序 Add server / Add SSH server / 灰显 WSL；真实其他插件贡献保留 | 普通 Add→既有 HTTP dialog；SSH→原 DialogSsh；Android 菜单开窗等待 350ms 避开触摸兼容点击，离开 Settings 时取消待开窗；WSL 触摸/键盘不执行；关闭无副作用 | 同步检查固定 shell origin 与唯一 Android meta 标识；标识只作 UI 区分，不授权 native |
| SSH dialog | 原 target/name、Add/Connect/Update、Cancel；挑战为 masked response 或 Trust | 空 target 禁用；未接通提交立即原错误行 + SSH unavailable toast；保留 draft、允许重试；Cancel/卸载仅清本 dialog attempt；不写 host/vault/known_hosts、不导航 | runtime 真实 config/状态/已存在 host-key prompt；新表单仅内存；关闭后丢弃；旧 ready 快照不能令失败提交成功关闭 |
| SSH row | 原 SSH row 与 Connect/SSH authentication/Delete 菜单；认证中原行内 Authenticate | 普通 Connect 直驱共享 runtime（issue #161 修订：offline→retry/T10，其余状态→connect/T1，failed/incompatible/authRequired 行仍可操作；仅 hostKeyUnverified 挑战与 incompatible 行走原 dialog 路径；connecting/reconnecting 中菜单项禁用）；Delete=runtime.remove/T14 本地删除（零 transport 调用，远端不受影响；vault 凭据保留为显式孤儿）；仅在记录已不存在时按错误路径呈现 | 读写经唯一 runtime owner（connect/retry/remove）；只读 registry/state/health；不影响远端任务或 SSH 恢复链；修订后的行为由 mobile-ssh.test 修订用例锁定（attempt 启动、stub 下落 failed、Delete 收缩 registry） |

**六元组**：空表单 / 输入 target / 验证非空 / 可提交 / Add 启用 / 可编辑；可提交或既有配置 / Add、Connect、Update、Continue、Trust / 后端不可用 / 留在原表单 / 错误与可重试按钮 / 重试或 Cancel；原表单 / Cancel / 清局部 attempt / 返回 Server / 关窗 / 再打开新 draft；保存行 / Delete / 记录存在 / 行随 runtime.remove(T14) 消失 / 无错误 / 可重新添加（issue #161 修订：原「不可用/原行不变/错误 toast」形态退役）。fixture 的 connecting/auth/password/trust/incompatible/ready 仅验证上游呈现，不证明真实 SSH 后台成功。

**异步文案契约（P2 修复，已实现）**：`useMobileSshUi` 先检查 catalog resource 的 `state`；仅在 `ready/refreshing` 时读取 `.latest`，结果携带 locale 且必须与当前语言一致。首次加载、加载失败或旧语言结果均使用上游 English fallback，不以 render-time `resource()` 或未就绪的 `.latest` 读取触发 Suspense；语言加载不得隐藏已有菜单/行，切换时不得把旧语言文案错配到新语言。真实 Suspense 边界下的延迟首次加载/语言切换测试及恢复旧实现后失败的反证见验证文档。

**视觉/横切**：继承 [共享基线](../visual.md) 及原上游 token/CSS，无新增色值/字号/图片/装饰动效。原 dialog/menu 焦点语义、label、alert、masked input 保留；Trust 不因 Enter 意外触发，挑战变更清 response。响应式沿用原 w-full/min-w-0/fit 布局，无新增断点；窄屏触摸与键盘路径需实测。CSR 无 JS 内容不可用是现有接受限制；无新角色权限/配额边界。超长输入沿用上游；本阶段不保存也不把上游 SSH 命令语法传给 native target parser。Android HTML 标识构建时注入并重算 Workbox revision/integrity，不在响应时改内容。

**实施前人工冒烟清单**（MatePad；禁止触碰用户记录/凭据或停止远端）：打开 Server 确认无额外 hosts 面；实际触摸 Add 菜单，检查三项顺序及 WSL 禁用；SSH 空 target 禁用，填 `example@example.invalid`，Add 明确失败且保持草稿，重试仍失败，Cancel 返回；普通 Add 表单可开可取消；现存 SSH 行更多菜单符合上游；Connect/Delete 自 issue #161 起直驱共享 runtime（Connect=真实尝试按状态分流，Delete=本地删除），设备核对见构建与验证文档 issue #161 段；单/多服务、密码/Trust/Update 状态若无真实无害环境，仅 fixture 验证并标设备 BLOCKED；TalkBack/窄手机断点未执行则不得声称通过。

**最小双向核对记录**：菜单→`add-menu.tsx`（rendered touch/禁用/顺序测试）；SSH dialog/row→`mobile-ssh.tsx` + 原 gui-plugins JSX（真实适配器 Add/row 失败、局部取消、ready 防误关窗及挑战清空测试）；Settings 唯一面→`shell.tsx`（无 MobileHostManager 回归）；数据恢复→read-only adapter（前后 registry 相等，无写入调用）。实际命令、设备结论和未验证项随本次产物登记在构建与验证文档。

#### issue #124 最终产物核对（2026-11-02）

MatePad 实际安装 APK SHA-256：`db54c703ce2a070aa897e23d29c69c200af8b58f63190c7c5b2043095a1e033b`。下表仅对应这个最终构建，替代本次早期“Server 不可达”的验收状态；完整命令、设备恢复、截图与历史失败见 [构建与验证文档](../../build-and-verify.md) 的“最终复审修复与 MatePad UI 验收”段。**这是 UI-only 验证，不是真实 SSH E2E；独立代码复审仍待进行。**

| 设计条目 | 实现位置 | 验证动作 | 结果/差异 |
| --- | --- | --- | --- |
| catalog 加载不隐藏现有内容、不误配语言 | `settings/servers/mobile-ssh.tsx` | 真实 Suspense 边界延迟首次 zh catalog，再切换延迟 fr catalog；检查行/文案持续可见、旧语言不泄漏；恢复不安全读取作反证 | 自动测试 PASS；不安全读取时测试实际 FAIL；设备语言切换未单独验证 |
| 菜单及 Android 开窗时序 | `servers/registry/add-menu.tsx` | 最终 APK 实际触摸三项菜单、WSL、普通及 SSH Add；自动测试检查待开窗延迟与卸载取消 | PASS；WSL 灰显不执行、无额外说明，两个对话框持续打开；350ms 为 Android 必要交互适配，无新增可见控件 |
| 普通 Add 与取消 | 既有 `servers/connect/dialog.tsx` | 实际触摸 Add 打开 HTTP pairing dialog，再 Cancel | PASS；不以此证明配对/普通服务器后台新增成功 |
| SSH 空态、失败、重试、取消 | 原 SSH `dialog.tsx` + `mobile-ssh.tsx` | 空目标 Add 禁用；合成目标提交后 Request failed、保留可编辑 draft；重试仍失败；Cancel 返回 | PASS；没有创建 SSH 记录或连接、没有信任/凭据写入，不宣称真实 SSH 成功 |
| 唯一 Settings 面及数据保护 | `settings/shell.tsx`、既有 HTTP registry | Server 无额外 SSH Hosts 区块；以唯一回环测试直连临时进入，结束时仅删除该记录并逐键核对 localStorage | PASS；原服务器与全部 localStorage 键/值精确恢复；只清理自建本机服务和该条 adb reverse，无远端停止 |
| 尚未验证的范围 | 原 SSH row/challenge 展示与共享响应式/无障碍基线 | 真实 SSH Auth/Trust/Update/Delete 行、真实后台 SSH、窄手机断点、TalkBack、外接键盘、Desktop 同屏对照 | 设备未验证；fixture 不替代真实后台或设备结果；全仓 typecheck 非零，不作为 PASS |

以下管理面表格及 settings-mobile-host-manager/settings-ssh-entry-guard/settings-servers-migration 说明为 **issue #124 之前的历史挂载**，不表示 Settings 仍展示这些控件；host-dialog/InitialSshSetup 等其他入口不在本次修改范围。

| 组件 | 归属单元文档 | 挂载点 | 职责 |
| --- | --- | --- | --- |
| host-manager | 本文档 | 设置 → servers 标签页（settings-mobile-host-manager 挂载，lazy import） | SSH 主机列表：展示名称/target/状态徽标+**已绑定凭据指示**（issue #4：行内显示该主机是否绑定凭据），入口到 host-dialog、删除、重连；删除只移除本地主机，已保存凭据留在凭据管理器孤儿区供用户单独处理，远端服务/任务不受影响；**凭据管理器入口**（issue #4）；空态引导新增。SSH tunnel ready 但 OpenCode `/api/info` 返回认证挑战时显示独立 service-auth-prompt：密码输入只在 DOM/component/runtime 内存中，Check again 走 runtime Basic auth check，成功后运行态 endpoint/session 保存内存凭据，不写主机注册表/本地存储；Disconnect local 只拆本地隧道。MatePad 2026-10-29 已验证 Settings → Server 可呈现已保存主机行与 service-auth-required 提示/空 password input/Check again；完整真实密码验证未执行。 |
| host-dialog | 本文档 | host-manager 内（对话框） | SSH 主机新增/编辑表单：name（唯一）、target（格式校验）、**凭据绑定块（issue #4 重构：移除 #3 的自由文本 ref 输入；改为「记住凭据」勾选/私钥导入路径，真值表语义见 [connection.md](connection.md)）；保存失败（含 vault put 失败）**保留原配置** |
| credential-manager | 本文档 | host-manager 内入口（对话框/面板，issue #4 新增） | 凭据条目元数据列表（kind/label/时间，**无值**）：vault unavailable 横幅、corrupt/recovery-needed 标红与恢复动作（重输/删除）、**孤儿区**（无宿主引用的条目对账+删除） |
| service-auth-prompt | 本文档 | host-manager 行内（service auth required）及 InitialSshSetup 共用 | OpenCode 服务认证，与 SSH 私钥/密码认证严格分离；password type 输入、用户显式 Check again；成功则内存 session auth，不持久化；切主机/离开活动模式/卸载时清除 draft 与取消过期检查 |
| host-key-prompt | [connection.md](connection.md) | 连接状态机 hostKeyUnverified 态 | 指纹确认（stub fail-closed，BLOCKED #6） |

- 设计单元归属说明：host-manager/host-dialog/credential-manager 并入本单元（它们是服务器列表的管理面），host-key-prompt 并入 connection 单元（它是连接确认交互）；architecture.md 设计单元清单不单列新行。
- **issue #102 管理面上游形态更新（settings-servers-migration，目标逐字）**：servers 标签页的上游列表行现为目标 `ServerConnectionRow`（每行 `settings-shell:<key>` 搜索命名——选中服务器行保持默认 `settings-shell`，其余行逐服务器命名供 Settings 搜索 reveal；健康点 + `entry.name` 行名 + 未授权 401 时行内 Authenticate 入口），每个服务器段的 Shell 偏好段随 `healthy !== false` **健康门显隐**（不可达/401 服务器不再显示 Shell 行——目标行为，勿报回归）；单服务器 General 视图同一行组件 + 同一健康门。`Manage servers…`（switcher 菜单）可达 servers 标签页。settings-mobile-host-manager 主机管理器挂载（Tabs.Content 第一子元素）不变，第一方行/凭据/服务认证面与上游行**并列独立呈列**（设备复核 2026-11-01：3 个既有 SSH 主机独立呈列，凭据绑定徽标正常）。设备复核另见 [../../build-and-verify.md](../../build-and-verify.md) issue #102 段。
- host-dialog 凭据绑定块（issue #4）：SSH 主机不再手输引用标识符——密码凭据通过上游连接对话框的「记住」勾选（connection-remember-credential）或主机表单绑定；表单内不再存在任何凭据值输入位。
- 诚实边界：
  - 多 host 一窗、设置页/home 内 extension 行渲染待真机核对，归 G13/G15；Settings → Server 的 settings-mobile-host-manager 主机管理器与已保存行已在 MatePad 运行核对（2026-10-29），保存主机 Connect 可达 host-key prompt，未确认指纹。
  - 已知展示缺口（settings-mobile-host-manager）——**已由 settings-ssh-entry-guard 承接（未验证，issue #8）**：上游多 server 布局下（`multiple()`），设置导航以 per-server 条目取代 "servers" 标签页，host-manager 曾在该布局不可达。settings-ssh-entry-guard 以「入口 + 守卫修订」承接（`multiple()` 组加 SSH hosts 入口；重定向守卫 `includes` 列表移除 `"servers"`——守卫修订是入口可达性的前提），详见 [projects-sessions.md](projects-sessions.md) 与 [../interaction.md](../interaction.md) G19；运行期可达性待真机核对（G19）。
  - 直连服务记录仍由上游原生注册表承载（含 connection-credential-reference/connection-dialog-credential-reference/connection-remember-credential/connection-credential-hydration 的 credentialRef 行为），本单元的注册表只管理 SSH 主机。

## 结构与流转

- 上游 UI 代码随闭包携带（`packages/app/src/servers/`），但未在设备上运行，流转行为待验证；本仓库未为其建立单独交互契约。
- 流转：server-list → 选择服务器/项目 → 会话列表（目标单元未开始，见 [../architecture.md](../architecture.md) 流转矩阵）；录入新服务 → connection 单元；设置 servers 标签页 → host-manager（已实现（未验证），settings-mobile-host-manager）。
- 无 SSH 形态的服务记录（归 issue #6）：注册表记录经 upstream-map 映射为 extension 型连接注入上游列表（已实现（未验证），app-mobile-hosts-bootstrap 经 props.servers 注入）。

## 状态矩阵（单元级）

| 状态类 | 覆盖 |
| --- | --- |
| 加载中 | 已确认未实现：项目树加载的呈现待真机核对（上游实现承载）；service-auth-prompt 检查中按钮禁用并显示 checking 文案（已实现，rendered synthetic test） |
| 空态 | 已确认未实现：空列表形态待真机核对；SSH 主机列表空态引导已实现（未验证），真机归 G13 |
| 错误态 | 已确认未实现：服务器不可达/版本不兼容的列表反馈归 G11/G14（SSH incompatible 由我方状态机判定，见 [connection.md](connection.md)）；服务密码仍无效时保留输入并显示“still asking”可重试文案；synthetic rendered test 覆盖错误与成功；真实服务认证未验证 |
| 边界态 | 已确认未实现：超多服务器/超深项目树未测；SSH：重名/非法 target/超长/重复 id 拒收（单测锁定）；权限边界不适用（无角色体系） |
| 过程态 | service-auth-prompt: Check again → checking → ready（提示卸载/运行态 auth 更新）或仍需认证（保留 draft 并重试）；Disconnect local 清除组件 draft 并本地断开；不发送 stop 到远端服务。host-key 确认仍归 connection 单元 |
| 恢复口径 | 列表与项目树随持久化状态恢复（encode 后不含 password）；SSH 主机注册表随 `opencode-mobile.hosts.v1` 恢复（白名单载荷，无凭据形字段，重启后 connection 状态归 idle）；真机复核归 G9/G12/G15 |

## 文案口径

列表与项目文案由上游 i18n 体系承载；host-manager/host-dialog/credential-manager 文案由 `packages/mobile-hosts` 自含 EN/ZH 字典承载（已实现（未验证），`src/i18n.ts`；issue #4 增补凭据绑定/恢复态/孤儿区键，EN/ZH 成对），不混入上游字典。
