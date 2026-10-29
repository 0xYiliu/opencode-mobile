# 视觉视角

视觉全部由上游 `@opencode/ui` 令牌体系与主题承载；本壳层不新增视觉决定。本文记录视觉事实的来源与当前状态。

## 令牌与主题

- 令牌体系采用 vendored `packages/ui`（`src/theme`、`src/styles`、`src/typography`）：命名令牌 + 单一来源 + 引用不复制，机制层满足令牌体系要求。
- mobile-hosts 组件实际消费的令牌类（评审修复后，全部经 dist CSS 选择器核验存在）：字号×字重 `text-12-regular|medium|mono`、`text-14-regular|medium`（**不存在 13 号与 -strong 后缀**）；文本色 `text-text-strong`、`text-text-weak`；边框 `border-border-weak-base`。错误/状态提示以 `role="alert|status"` + text-text-strong 强调（主题无 danger 色令牌，`text-danger-base` 在本构建不生成——上游 error.tsx 的同类用法亦未落地，不效仿）。issue #4 新组件（凭据绑定块/凭据管理器）沿用同一**已核验令牌集**（text-12/14-regular/medium、text-12-mono、text-text-strong/weak、border-border-weak-base/base），V-css dist 核验随交付执行；「记住」勾选框用上游 `Icon name="check"` 式样与原生 `role="checkbox"`/`aria-checked` 语义（上游 question-dock 同款），不引 Dialog/Icon 新包之外的新组件。
- 主题在构建层面已实现：上游 app 以深色为主并跟随上游自身的主题机制（`oc-theme-preload.js` 随构建打包），产物含主题 CSS（dist 内 31 个 css 文件）。
- 本仓库不新增令牌、不改写上游视觉；壳层仅提供全屏 WebView 容器与系统 `Theme.Material.NoActionBar`，无自有色彩/字号/间距。
- 真机渲染（字体加载、主题切换、对比度）**待验证**，归 G1；深浅色跟随行为同样待验证。

## 视口与移动适配

- 上游 `packages/app/index.html` 自带移动 viewport：`width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover`（已实现（未验证）——随构建打包，行为待 G1 真机核验）。
- `interactive-widget=resizes-content`：软键盘弹出时压缩视口而非遮挡，为交互基线的一部分。
- `viewport-fit=cover`：刘海屏/挖孔屏下延伸绘制；safe-area 由上游布局处理，实际效果待验证。
- 窄屏：上游 app 自带响应式布局，降级顺序由上游实现承载；真机窄屏（约 360dp 宽）可用性待验证，本仓库未做窄屏改写，不做预声称。

## 组件、动效、图像纪律

- 组件规范与动效规范由上游组件库承载（`packages/ui/src/components`、`src/feedback` 等）；本阶段不单独建立组件契约，待各单元设计文档补齐时引用基线。
- 第一方 `packages/mobile-hosts` 的界面组件（host-manager/host-dialog/host-key-prompt，已实现（未验证）：issue #3；credential-manager 与凭据绑定块，已实现（未验证）：issue #4）**复用 `@opencode/ui` 令牌与组件**，实际使用清单：`Button`（variant neutral/danger）、`TextInput`；不使用 Dialog/Icon（未引包）。不新增令牌、不引入裸值；深浅色跟随上游主题上下文。真机渲染随 G1/G13 核验（当前 BLOCKED）。
- 动效降级（`prefers-reduced-motion`）跟随上游实现，本仓库不另行配置。
- 图像纪律：全部图像/字体/图标资产随构建本地打包（`assets/web/`，清单见 `web-dist/manifest.json`），不引用外部图床或 CDN；PWA 图标随上游 `vite.icons.ts` 管线生成。无需联网即可渲染 UI 外壳。
