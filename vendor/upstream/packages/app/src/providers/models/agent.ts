export function hasCustomAgent(items: Array<{ native?: boolean }>) {
  return items.some((item) => item.native === false)
}

// mobile(providers-models-usage-v2-2-7, issue #192): re-landed from session-agent-selector
// (b-blob c97ec4f is the mobile delta — no upstream ancestor).
/**
 * The Desktop preference hides the selector for the built-in agents by default. Android's
 * composer has no equivalent desktop-wide preference expectation, so its session workbench
 * keeps the selector available while still requiring a non-empty server catalog at the view
 * boundary. The Android marker is passed in by the platform adapter rather than inferred from
 * the WebView user agent.
 */
export function shouldShowAgentSelector(input: {
  android: boolean
  preference: boolean
  agents: Array<{ native?: boolean }>
}) {
  return input.android || input.preference || hasCustomAgent(input.agents)
}

export function resolveAgent<T extends { name: string }>(items: T[], name?: string) {
  return items.find((item) => item.name === name) ?? items.find((item) => item.name === "build") ?? items[0]
}
