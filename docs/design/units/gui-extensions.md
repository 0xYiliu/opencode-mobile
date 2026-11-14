# 单元：GUI 扩展管理面（gui-extensions）— 已移交

> **移交声明（issue #67 / S41+N11）**：上游 v2.2.1 将 `packages/gui-extensions` 整包替换为
> `packages/gui-plugins`（宿主 API 库随之落在 `packages/plugin/src/gui`），本单元文档随之迁移为
> [gui-plugins.md](gui-plugins.md)。产品边界不变：**移动零安装、零移除、零扩展商店（marketplace）**
> （决策 D04）；上游 v2.2.1 删除已安装 `.ocdx` 包的安装/移除面，宿主 `Bridge.manager` 恰
> {initial, list, enable, disable, reload}——无 install/remove 成员，负锚由探针
> `scripts/verify-gui-plugins.ts` 组 3 锁定；桌面 DEV 内建管理页（settings-page-dev.tsx）按差异
> D2 保留并适配；移动设置 tab id/标签仍为 "gui-extensions"、`settings.guiExtensions.*` 9 键 en/zh
> 原样保留（差异 D4）。运行期门禁 G35 与状态声明（第二十一处落字）一并移至新文档承载。
>
> **#193 校准（2026-11-14，v2.2.7）**：v2.2.7 重基后移动 gui-extensions face 由 active `settings-v2-2-7`（issue #193）W3 重 derive——mobile(M-044) root tab、`mobileGuiExtensions = platform.platform !== "desktop"` predicate + redirect guard + Tabs.Content mount（M-026）、first-party ExtensionManager、`createExtensionDisabled` disabled union（M-025/M-052）与 settings.guiExtensions 9 键 en/zh 全部在册；D4（KEEP）与移动零安装/零移除/零 marketplace 边界不变。
