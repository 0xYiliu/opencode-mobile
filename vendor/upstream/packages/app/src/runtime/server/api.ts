import { OpenCode, type OpenCodeClient } from "@opencode/client/promise"
import type { ServerConnection } from "@/runtime/server/registry"
import { decode64 } from "@/runtime/persistence/base64"
import { withMediaApi } from "./media-api"
import { assertInlineMessages, mediaInbox, mediaMessage, mediaMessages } from "./media-contract"
import type { RequestOptions } from "./media-generated/client"

export type ServerRequestOptions = RequestOptions & { mediaRefs?: boolean }

export function authTokenFromCredentials(input: { password: string }) {
  const bytes = new TextEncoder().encode(`opencode:${input.password}`)
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)

  if (!decoded) return
  const separator = decoded.indexOf(":")

  if (separator === -1) return

  return {
    password: decoded.slice(separator + 1),
  }
}

export function createApiForServer(input: {
  server: ServerConnection.HttpBase
  fetch?: typeof globalThis.fetch
}) {
  const options = {
    baseUrl: input.server.url,
    fetch: input.fetch,
    headers: input.server.password
      ? {
          Authorization: `Basic ${authTokenFromCredentials({
            password: input.server.password,
          })}`,
        }
      : undefined,
  }
  const base = withMediaApi(OpenCode.make(options), options)
  type ReadOptions = ServerRequestOptions
  const read = async <T>(operation: (options: RequestOptions) => Promise<T>, options: ReadOptions = {}) => {
    const headers = new Headers(options.headers)
    const { mediaRefs, ...requestOptions } = options
    if (mediaRefs === false) {
      headers.delete("X-OpenCode-Capabilities")
      return operation({ ...requestOptions, headers })
    }
    headers.set("X-OpenCode-Capabilities", "experimental-media-uri")
    try {
      return await operation({ ...requestOptions, headers })
    } catch (error) {
      if (options.signal?.aborted) throw error
      // Exactly one compatibility read, on this same authenticated source. Never retry a mutation.
      const fallback = new Headers(options.headers)
      fallback.delete("X-OpenCode-Capabilities")
      return operation({ ...requestOptions, headers: fallback })
    }
  }
  const mediaReads = {
    ...base,
    message: {
      ...base.message,
      list: async (input: Parameters<OpenCodeClient["message"]["list"]>[0], requestOptions?: ReadOptions) => {
        const response = await read((options) => base.message.list(input, options), requestOptions)
        const data = mediaMessages(response.data)
        if (requestOptions?.mediaRefs === false) assertInlineMessages(data)
        return { ...response, data }
      },
    },
    session: {
      ...base.session,
      message: {
        ...base.session.message,
        get: async (input: Parameters<OpenCodeClient["session"]["message"]["get"]>[0], options?: ReadOptions) => {
          const data = mediaMessage(await read((requestOptions) => base.session.message.get(input, requestOptions), options))
          if (options?.mediaRefs === false) assertInlineMessages([data])
          return data
        },
      },
      inbox: {
        ...base.session.inbox,
        list: async (input: Parameters<OpenCodeClient["session"]["inbox"]["list"]>[0], options?: ReadOptions) =>
          mediaInbox(await read((requestOptions) => base.session.inbox.list(input, requestOptions), options)),
      },
    },
  }
  // Existing plugin/client contracts remain inline-only. Only the desktop data reader opts
  // into the new union; never expose a uri as the old required `data` attachment shape.
  const inline = {
    ...base,
    message: { ...base.message, list: async (input: Parameters<OpenCodeClient["message"]["list"]>[0], options?: ReadOptions) => {
      const response = await base.message.list(input, options)
      assertInlineMessages(mediaMessages(response.data))
      return response
    } },
    session: {
      ...base.session,
      message: { ...base.session.message, get: async (input: Parameters<OpenCodeClient["session"]["message"]["get"]>[0], options?: ReadOptions) => {
        const response = await base.session.message.get(input, options)
        assertInlineMessages([mediaMessage(response)])
        return response
      } },
      inbox: { ...base.session.inbox, list: async (input: Parameters<OpenCodeClient["session"]["inbox"]["list"]>[0], options?: ReadOptions) => {
        const response = await base.session.inbox.list(input, options)
        const decoded = mediaInbox(response)
        if (decoded.some((item) => item.type === "user" && item.payload.files?.some((file) => "uri" in file)))
          throw new Error("MalformedResponse")
        return response
      } },
    },
  }
  return { ...mediaReads, inline }
}

export type MediaServerApi = ReturnType<typeof createApiForServer>
export type ServerApi = MediaServerApi["inline"]
export type InlineServerApi = ServerApi
