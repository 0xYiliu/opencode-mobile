import { parseSettingsView } from "@/settings/route"

/** The only settings view reachable while there is no connected server. */
export function isConnectionRoute(pathname: string, search: string) {
  if (pathname !== "/settings") return false

  const view = parseSettingsView(search, false)
  const params = new URLSearchParams(search)
  const entries = Array.from(params.entries())

  return (
    entries.length === 1 &&
    params.getAll("tab").length === 1 &&
    params.get("tab") === "servers" &&
    view.type === "root" &&
    view.tab === "servers" &&
    view.subtab === undefined
  )
}
