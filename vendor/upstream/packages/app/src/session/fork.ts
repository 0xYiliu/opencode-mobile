import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode/util/encode"
import { useComposerState } from "@/composer/persistence"
import { extractPromptContext, extractPromptFromMessage } from "@/composer/prompt"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useData, useServer } from "@/runtime/server/current"
import { showToast } from "@/shell/notifications/toast"
import { sessionHref } from "@/shell/routes/session"
import { useWorkspaceLocation } from "@/workspaces/location"
import { pinPromptMedia } from "@/composer/media"

/**
 * Forks a session before one of its prompts: the new session keeps the history above the prompt, opens, and has the
 * prompt back in its composer to edit and send. Resolves to whether the fork opened.
 */
export function useSessionFork() {
  const navigate = useNavigate()
  const data = useData()
  const serverSDK = useServerSDK()
  const location = useWorkspaceLocation()
  const prompt = useComposerState()
  const language = useLanguage()
  const server = useServer()

  return async (input: { sessionID: string; messageID: string }) => {
    const current = prompt.captureOwner()
    const sourceServerKey = server.key
    const sourceScope = serverSDK.scope
    const api = serverSDK.api
    const directory = location().directory
    const message = data.session.message.get(input.sessionID, input.messageID)

    if (message?.type !== "user") return false

    const extracted = extractPromptFromMessage(message, {
      directory,
      sourceServerKey,
      attachmentName: language.t("common.attachment"),
      sessionTitle: (id) => data.session.get(id)?.title,
    })

    const context = extractPromptContext(message, { directory })
    const dir = base64Encode(directory)

    return pinPromptMedia(extracted, current)
      .then(async (restored) => {
        if (!current()) return false
        const forked = await api.session.fork({ sessionID: input.sessionID, before: input.messageID })
        if (!current()) return false
        data.session.remember(forked)
        const target = prompt.capture({ dir, id: forked.id }, { server: sourceServerKey, scope: sourceScope })
        target.set(restored)
        target.context.replace([...context.comments, ...context.files])
        navigate(sessionHref(sourceServerKey, forked.id))

        return true
      })
      .catch((cause: unknown) => {
        if (!current()) return false
        const message = cause instanceof Error ? cause.message : String(cause)
        showToast({ title: language.t("common.requestFailed"), description: message })

        return false
      })
  }
}
