import type { OpenCodeClient } from "@opencode/client/promise"
import { make, type ClientOptions } from "./media-generated/client"

/** Compose only the generated binary getter; both clients share the same verified transport. */
export function withMediaApi(client: OpenCodeClient, options: ClientOptions) {
  const media = make(options)
  return { ...client, experimental: { ...client.experimental, media: media.experimental.media } }
}
