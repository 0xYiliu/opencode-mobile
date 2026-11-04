import type { OpenCode } from "./client.js"
import type { Attachment } from "@opencode/schema/prompt"
import type {
  SessionMessageInfo as InlineMessageInfo,
  SessionMessageUser as InlineMessageUser,
  SessionInboxInfo as InlineInboxInfo,
  SessionInboxUser as InlineInboxUser,
} from "./generated/types.js"

type MutableAttachment<T> = T extends object ? { -readonly [Key in keyof T]: MutableAttachment<T[Key]> } : T
// The facade exposes the validated read union. Generated methods and all mutation inputs stay
// at their pinned inline contracts; media-capable reads are composed by the app's narrow adapter.
export type SessionMessageUser = Omit<InlineMessageUser, "files"> & { files?: MutableAttachment<Attachment>[] }
export type SessionMessageInfo = Exclude<InlineMessageInfo, { type: "user" }> | SessionMessageUser
export type SessionInboxUser = Omit<InlineInboxUser, "payload"> & {
  payload: Omit<InlineInboxUser["payload"], "files"> & { files?: MutableAttachment<Attachment>[] }
}
export type SessionInboxInfo = Exclude<InlineInboxInfo, { type: "user" }> | SessionInboxUser

export * from "./generated/index.js"
export { OpenCode } from "./client.js"
export type {
  AgentApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcCallOptions,
  RpcClient,
  RpcEventPayload,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export type { EventSubscribeOutput as OpenCodeEvent } from "./generated/types.js"
export type OpenCodeClient = ReturnType<typeof OpenCode.make>
export type { Attachment as PromptAttachment } from "@opencode/schema/prompt"
