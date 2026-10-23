# 视觉视角

视觉全部由上游 `@opencode/ui` 令牌体系与主题承载；本壳层不新增视觉决定。本文记录视觉事实的来源与当前状态。

## 令牌与主题

- 令牌体系采用 vendored `packages/ui`（`src/theme`、`src/styles`、`src/typography`）：命名令牌 + 单一来源 + 引用不复制，机制层满足令牌体系要求。
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
- 动效降级（`prefers-reduced-motion`）跟随上游实现，本仓库不另行配置。
- 图像纪律：全部图像/字体/图标资产随构建本地打包（`assets/web/`，清单见 `web-dist/manifest.json`），不引用外部图床或 CDN；PWA 图标随上游 `vite.icons.ts` 管线生成。无需联网即可渲染 UI 外壳。
