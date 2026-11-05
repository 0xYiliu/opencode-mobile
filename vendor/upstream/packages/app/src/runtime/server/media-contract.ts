import { Schema } from "effect"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionInbox } from "@opencode/schema/session-inbox"
import { ClientError } from "./media-generated/client-error"
import type { SessionMessageInfo, SessionInboxInfo } from "@opencode/client/promise"

export function mediaMessages(value: SessionMessageInfo[]) {
  return value.map(mediaMessage)
}

export function mediaMessage(value: SessionMessageInfo) {
  const decoded = Schema.decodeUnknownSync(Schema.toEncoded(SessionMessage.MediaInfo))(value)
  if (value.type !== "user") return value
  if (decoded.type !== "user") throw new ClientError("MalformedResponse")
  return { ...value, files: decoded.files === undefined ? undefined : mutableWire(decoded.files) }
}

export function mediaInbox(value: SessionInboxInfo[]): SessionInboxInfo[] {
  return value.map((item) => {
    const decoded = Schema.decodeUnknownSync(Schema.toEncoded(SessionInbox.MediaInfo))(item)
    if (item.type !== "user") return item
    if (decoded.type !== "user") throw new ClientError("MalformedResponse")
    return { ...item, payload: { ...item.payload, files: decoded.payload.files === undefined ? undefined : mutableWire(decoded.payload.files) } }
  })
}

export type MutableWire<T> = T extends object ? { -readonly [Key in keyof T]: MutableWire<T[Key]> } : T

/** Canonical schemas stay readonly. Store ownership receives its own cloned, mutable wire tree. */
export function mutableWire<T>(value: T): MutableWire<T> {
  // SAFETY: these validated JSON wire values contain no functions or handles. structuredClone
  // recursively creates fresh writable objects/arrays without changing their shape or variants.
  return structuredClone(value) as MutableWire<T>
}

export function assertInlineMessages(messages: ReturnType<typeof mediaMessages>) {
  if (messages.some((message) => message.type === "user" && message.files?.some((file) => "uri" in file)))
    throw new ClientError("MalformedResponse")
}
