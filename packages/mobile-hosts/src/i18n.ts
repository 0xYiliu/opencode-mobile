// Self-contained EN/ZH strings for the mobile host UI (issue #3).
//
// Deliberately not wired into the upstream i18n provider (packages/app/src/runtime/i18n is
// app-internal); the locale is chosen once at bootstrap from navigator.language. Keys are
// flat and total: `t()` always returns a string.

export type Locale = "en" | "zh"

export const messages = {
  en: {
    "hostManager.title": "SSH hosts",
    "hostManager.empty": "No SSH hosts yet. Add one to connect to a remote OpenCode service.",
    "hostManager.add": "Add host",
    "hostManager.edit": "Edit",
    "hostManager.delete": "Delete",
    "hostManager.connect": "Connect",
    "hostManager.disconnect": "Disconnect",
    "hostManager.retry": "Retry",
    "hostManager.deleteHint": "Deleting only removes the local record. The remote service and its tasks keep running.",
    "hostManager.volatileStorage": "Persistent storage is unavailable: host records last for this session only.",
    "hostDialog.addTitle": "Add SSH host",
    "hostDialog.editTitle": "Edit SSH host",
    "hostDialog.name": "Name",
    "hostDialog.namePlaceholder": "Unique display name",
    "hostDialog.target": "Host",
    "hostDialog.targetPlaceholder": "user@example.invalid:22",
    "hostDialog.credentialRef": "Credential reference",
    "hostDialog.credentialRefHint": "Identifier of the stored credential (not the credential itself).",
    "hostDialog.save": "Save",
    "hostDialog.cancel": "Cancel",
    "hostDialog.error.duplicateName": "A host with this name already exists.",
    "hostDialog.error.invalidTarget": "Use the form user@host or user@host:port.",
    "hostDialog.error.emptyName": "Enter a name.",
    "hostDialog.error.invalidCredentialRef": "Credential references look like mobile-credential:<id>.",
    "hostKey.title": "Verify host",
    "hostKey.fingerprint": "Host key fingerprint",
    "hostKey.confirm": "Trust and connect",
    "hostKey.reject": "Reject",
    "hostKey.note": "The host identity must be verified before connecting. Verification cannot be skipped.",
    "state.idle": "Not connected",
    "state.connecting": "Connecting…",
    "state.hostKeyUnverified": "Host key needs confirmation",
    "state.ready": "Connected",
    "state.authRequired": "Sign-in required",
    "state.incompatible": "Incompatible server version",
    "state.offline": "Offline",
    "state.reconnecting": "Reconnecting…",
    "state.failed": "Failed",
  },
  zh: {
    "hostManager.title": "SSH 主机",
    "hostManager.empty": "还没有 SSH 主机。添加一个以连接远程 OpenCode 服务。",
    "hostManager.add": "添加主机",
    "hostManager.edit": "编辑",
    "hostManager.delete": "删除",
    "hostManager.connect": "连接",
    "hostManager.disconnect": "断开",
    "hostManager.retry": "重试",
    "hostManager.deleteHint": "删除仅移除本地记录，远程服务与其任务不受影响。",
    "hostManager.volatileStorage": "持久存储不可用：主机记录仅保留到本次会话结束。",
    "hostDialog.addTitle": "添加 SSH 主机",
    "hostDialog.editTitle": "编辑 SSH 主机",
    "hostDialog.name": "名称",
    "hostDialog.namePlaceholder": "唯一的展示名",
    "hostDialog.target": "主机",
    "hostDialog.targetPlaceholder": "user@example.invalid:22",
    "hostDialog.credentialRef": "凭据引用",
    "hostDialog.credentialRefHint": "已存凭据的标识符，不是凭据本身。",
    "hostDialog.save": "保存",
    "hostDialog.cancel": "取消",
    "hostDialog.error.duplicateName": "已存在同名主机。",
    "hostDialog.error.invalidTarget": "请使用 user@host 或 user@host:port 形式。",
    "hostDialog.error.emptyName": "请输入名称。",
    "hostDialog.error.invalidCredentialRef": "凭据引用形如 mobile-credential:<id>。",
    "hostKey.title": "校验主机",
    "hostKey.fingerprint": "主机密钥指纹",
    "hostKey.confirm": "信任并连接",
    "hostKey.reject": "拒绝",
    "hostKey.note": "连接前必须校验主机身份，校验不可跳过。",
    "state.idle": "未连接",
    "state.connecting": "连接中…",
    "state.hostKeyUnverified": "主机密钥待确认",
    "state.ready": "已连接",
    "state.authRequired": "需要登录",
    "state.incompatible": "服务版本不兼容",
    "state.offline": "离线",
    "state.reconnecting": "重连中…",
    "state.failed": "失败",
  },
} as const

export type MessageKey = keyof (typeof messages)["en"]

export function detectLocale(candidate?: string): Locale {
  const language = (candidate ?? (typeof navigator !== "undefined" ? navigator.language : undefined)) ?? "en"
  return language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export type Translator = (key: MessageKey) => string

export function createTranslator(locale: Locale): Translator {
  const table = messages[locale] ?? messages["en"]!
  return (key) => table[key] ?? messages["en"]![key] ?? key
}
