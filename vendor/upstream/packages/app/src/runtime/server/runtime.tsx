import { createSimpleContext } from "@opencode/ui/context"
import { Accessor, batch, createEffect, createMemo, createResource, createRoot, getOwner, onCleanup, on, untrack } from "solid-js"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { createServerProjects, RECENTLY_CLOSED_DISPLAY_LIMIT, ServerConnection, useServers } from "./registry"
import { pathKey } from "@/workspaces/path-key"
import { useServerHealth } from "@/runtime/server/health"
import { createServerSdkContext } from "./client"
import { createServerSyncContext } from "./sync"
import { createData, createSessionRetention } from "@opencode/client/solid"
import type { ServerScope } from "@/runtime/server/scope"
import { createPermissionAutoApprover } from "@/session/requests/auto-approve"
import { createServerNotificationState } from "@/shell/notifications/notification"
import { createNotificationCoordinator } from "@/shell/notifications/coordinator"
import { useCurrentRoute } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { createDesktopData } from "./data"
import { modelState } from "./persistence"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import { formatServerError } from "./errors"
import { useSettings } from "@/settings/model"
import { timelinePreset } from "@opencode/session-ui/timeline/detail"
import type { SessionInfo } from "@opencode/client/promise"
import { projectForSession, resolveProjectForSession, resolveSessionDetailsProject } from "@/shell/layout/helpers"
import { normalizeProjectInfo } from "./global-sync/utils"
import { containsDirectory } from "@opencode/util/path"

let nextCatalogGeneration = 0

export const { use: useGlobal, provider: GlobalProvider } = createSimpleContext({
  name: "Global",
  init: () => {
    const server = useServers()

    const serverHealth = useServerHealth(
      () => server.list,
      () => true,
    )

    const models = createGlobalModels()
    const notificationCoordinator = createNotificationCoordinator()

    const serverCtxs = new Map<ServerConnection.Key, ReturnType<typeof createServerController>>()
    const serverCtxDisposers = new Map<ServerConnection.Key, () => void>()
    // The credentials each controller started with, as plain values: the listed connection is a store proxy that
    // already reads the new password once the user saves it.
    const serverCtxCredentials = new Map<ServerConnection.Key, string>()

    const owner = getOwner()

    if (!owner) throw new Error("Global provider requires a Solid owner")

    const disposeServerCtx = (key: ServerConnection.Key) => {
      serverCtxDisposers.get(key)?.()
      serverCtxDisposers.delete(key)
      serverCtxCredentials.delete(key)
      serverCtxs.delete(key)
    }

    const ensureServerCtx = (input: ServerConnection.Any) => {
      const key = ServerConnection.key(input)
      // Callers can hold an older copy of the connection; the listed one has the credentials the user saved last.
      const conn = untrack(() => server.list.find((item) => ServerConnection.key(item) === key)) ?? input
      const existing = serverCtxs.get(key)

      if (existing && serverCtxCredentials.get(key) === credentials(conn)) return existing

      // A controller keeps the credentials it started with, so a server signed in again under the same address needs
      // a new one.
      if (existing) disposeServerCtx(key)

      const serverCtx = createRoot((dispose) => {
        serverCtxDisposers.set(key, dispose)

        return createServerController(conn, server.scope(key), server.projects.forServer(key), notificationCoordinator)
      }, owner)

      serverCtxs.set(key, serverCtx)
      serverCtxCredentials.set(key, credentials(conn))

      return serverCtx
    }

    // A server that rejects our credentials would retry its event stream every second with the same
    // credentials, so its controller waits until health recovers and then starts with the current ones.
    createMemo(() => {
      for (const conn of server.list) {
        if (serverHealth.status[ServerConnection.key(conn)]?.unauthorized) continue
        ensureServerCtx(conn)
      }
    })

    createEffect(() => {
      for (const [key] of serverCtxs) {
        if (serverHealth.status[key]?.unauthorized || !server.list.find((conn) => ServerConnection.key(conn) === key))
          disposeServerCtx(key)
      }
    })

    return {
      servers: {
        list: () => server.list,
        health: serverHealth.status,
        retry: serverHealth.retry,
      },
      models,
      ensureServerCtx(conn: ServerConnection.Any) {
        return ensureServerCtx(conn)
      },
      /** The live controller of a server, or undefined while it is unlisted or rejects our credentials. Reactive. */
      serverCtx(key: ServerConnection.Key) {
        const conn = server.list.find((item) => ServerConnection.key(item) === key)

        if (!conn || serverHealth.status[key]?.unauthorized) return

        return ensureServerCtx(conn)
      },
    }
  },
})

function createGlobalModels() {
  const [store, setStore, _, ready] = persisted(Persist.global("model"), modelState, {
    favorite: [],
    user: [],
    recent: [],
    variant: {},
  })

  // Suspend readers only until persisted state loads. Refetching on every change would put the
  // session route into its Suspense fallback, detaching the screen and resetting the timeline scroll.
  const [loaded] = createResource(async () => {
    await ready.promise

    return true
  })

  return {
    store,
    set: setStore,
    ready,
    favorite: () => {
      loaded()
      return store.favorite
    },
    recent: () => {
      loaded()

      return store.recent
    },
    // Marks models visible in the picker regardless of the "latest per family" default.
    show(models: ReadonlyArray<{ providerID: string; modelID: string }>) {
      const seen = new Map(store.user.map((item, index) => [`${item.providerID}:${item.modelID}`, index]))
      batch(() => {
        for (const model of models) {
          const index = seen.get(`${model.providerID}:${model.modelID}`)

          if (index !== undefined) {
            setStore("user", index, "visibility", "show")
            continue
          }

          seen.set(`${model.providerID}:${model.modelID}`, store.user.length)
          setStore("user", store.user.length, {
            providerID: model.providerID,
            modelID: model.modelID,
            visibility: "show",
          })
        }
      })
    },
  }
}

function createServerController(
  conn: ServerConnection.Any,
  scope: ServerScope,
  projects: ReturnType<typeof createServerProjects>,
  notificationCoordinator: ReturnType<typeof createNotificationCoordinator>,
) {
  const language = useLanguage()
  const settings = useSettings()
  const tabs = useTabs()
  const currentRoute = useCurrentRoute()
  const connKey = ServerConnection.key(conn)
  const sdk = createServerSdkContext(conn, scope)

  const source = createData({
    api: () => sdk.mediaApi,
    initialMessageLimit: () => (timelinePreset(settings.general.timelineDetail())?.id === "compact" ? 40 : 20),
    event: {
      on: sdk.event.on,
      listen: (handler) => sdk.event.listen((event) => handler({ name: event.type, details: event })),
    },
    connection: sdk.connection,
    directory: "",
    onError(error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: formatServerError(error, language.t),
      })
    },
  })

  const data = createDesktopData({
    data: source,
    remove: (sessionID) => sdk.api.session.remove({ sessionID }),
  })

  createSessionRetention({
    session: data.session,
    current: () => {
      const route = currentRoute()

      return route.type === "session" && route.server === connKey ? route.sessionId : undefined
    },
    keep: () =>
      tabs.store.flatMap((tab) =>
        tab.type === "session" && tab.server === connKey
          ? [tab.sessionId, ...(tab.routeSessionId ? [tab.routeSessionId] : [])]
          : [],
      ),
    limit: 3,
  })

  const sync = createServerSyncContext(sdk, data)
  createPermissionAutoApprover({ sdk, data })
  const notification = createServerNotificationState({ sdk, data, key: connKey, coordinator: notificationCoordinator })

  function enrich(project: { worktree: string; expanded: boolean }) {
    const [childStore] = sync.child(project.worktree, { bootstrap: false })
    const projectID = childStore.project

    const metadata = projectID
      ? sync.data.project.find((x) => x.id === projectID)
      : sync.data.project.find((x) => x.worktree === project.worktree)

    // Preserve local icon override from per-workspace localStorage cache (childStore.icon).
    // Without this, different subdirectories of the same git repo would share the same
    // icon from the database instead of using their individual overrides.
    const base = {
      ...metadata,
      ...(!metadata || metadata.id === "global" ? childStore.projectMeta : undefined),
      ...project,
    }

    if (childStore.icon) {
      return { ...base, icon: { ...base.icon, override: childStore.icon } }
    }

    return base
  }

  const projectsList = createMemo(() => projects.list().map(enrich))

  // This independent inventory deliberately does not reuse the filtered sync/bootstrap query.
  // Every controller (including a same-key reauthentication) owns a distinct cache generation.
  const queryClient = useQueryClient()
  const catalogKey = [scope, connKey, "session-project-catalog", ++nextCatalogGeneration] as const
  let catalogActive = true
  const catalogQuery = useQuery(() => ({
    queryKey: [...catalogKey, sdk.generation],
    enabled: sdk.connection.status() === "connected",
    retry: false,
    queryFn: async ({ signal }) => {
      const api = sdk.api
      const items = await api.project.list(undefined, { signal })
      if (!catalogActive || signal.aborted || sdk.api !== api) throw new DOMException("Aborted", "AbortError")
      return items.map(normalizeProjectInfo)
    },
  }))
  const refreshCatalog = () => {
    if (catalogActive && sdk.connection.status() === "connected")
      void queryClient.invalidateQueries({ queryKey: catalogKey })
  }
  const unsubscribeCatalog = sdk.event.on("project.updated", refreshCatalog)
  createEffect(on(sdk.connection.status, (status, previous) => {
    if (previous && previous !== "connected" && status === "connected") refreshCatalog()
  }))
  createEffect(() => {
    if (!catalogQuery.isError) return
    showToast({ variant: "error", title: language.t("common.requestFailed"), description: formatServerError(catalogQuery.error, language.t) })
  })
  onCleanup(() => {
    catalogActive = false
    unsubscribeCatalog()
    void queryClient.cancelQueries({ queryKey: catalogKey })
    queryClient.removeQueries({ queryKey: catalogKey })
  })
  const catalogList = () => catalogQuery.data ?? []
  const catalogAppearance = (project: ReturnType<typeof catalogList>[number] | undefined, directory: string) => {
    if (!project) return
    const local = projectsList().find((item) => pathKey(item.worktree) === pathKey(directory)) ??
      projectsList().find((item) => pathKey(item.worktree) === pathKey(project.worktree))
    if (!local) return project
    return { ...project, name: local.name ?? project.name, icon: local.icon ?? project.icon }
  }
  const catalogForDirectory = (directory: string) => {
    const normalized = pathKey(directory)
    const list = catalogList()
    const exact = list.find((item) => pathKey(item.worktree) === normalized) ??
      list.find((item) => item.sandboxes?.some((sandbox) => pathKey(sandbox) === normalized) ||
        item.worktrees?.some((worktree) => pathKey(worktree.directory) === normalized))
    const closest = exact ?? list.flatMap((project, order) =>
      [project.worktree, ...(project.sandboxes ?? []), ...(project.worktrees ?? []).map((item) => item.directory)]
        .filter((root) => containsDirectory(root, directory))
        .map((root) => ({ project, length: pathKey(root).length, order })))
      .sort((a, b) => b.length - a.length || a.order - b.order)[0]?.project
    return catalogAppearance(closest, directory)
  }

  const forSession = (session: SessionInfo) => {
    const project = resolveProjectForSession(session, projectsList(), sync.data.project)

    if (!project) return

    return "expanded" in project ? project : { ...project, expanded: false }
  }

  const detailsForSession = (session: SessionInfo) =>
    resolveSessionDetailsProject(session, projectsList(), sync.data.project)

  const recentlyClosedList = createMemo(() => {
    const known = new Set(sync.data.project.map((project) => pathKey(project.worktree)))

    return projects
      .recentlyClosed()
      .filter((worktree) => known.has(pathKey(worktree)))
      .slice(0, RECENTLY_CLOSED_DISPLAY_LIMIT)
      .map((worktree) => enrich({ worktree, expanded: false }))
  })

  const isLocal =
    (conn?.type === "sidecar" && conn.variant === "base") || (conn?.type === "http" && isLocalHost(conn.http.url))

  return {
    data,
    sdk,
    sync,
    isLocal,
    projects: {
      ...projects,
      list: projectsList,
      catalog: {
        list: catalogList,
        ready: () => catalogQuery.data !== undefined,
        status: () => catalogQuery.status,
        error: () => catalogQuery.error,
        forSession: (session: SessionInfo) => catalogAppearance(projectForSession(session, catalogList()), session.location.directory),
      },
      forDirectory: catalogForDirectory,
      forSession,
      detailsForSession,
      resolve: enrich,
      recentlyClosed: recentlyClosedList,
    },
    notification,
  }
}

export function useServerCtx(server: Accessor<ServerConnection.Any>): Accessor<ServerCtx>
export function useServerCtx(server: Accessor<ServerConnection.Any | undefined>): Accessor<ServerCtx | undefined>
export function useServerCtx(server: Accessor<ServerConnection.Any | undefined>) {
  const global = useGlobal()

  return () => {
    const s = server()

    if (s) return global.ensureServerCtx(s)
  }
}

export type ServerCtx = ReturnType<typeof createServerController>

function isLocalHost(url: string) {
  const host = url.replace(/^https?:\/\//, "").split(":")[0]

  if (host === "localhost" || host === "127.0.0.1") return "local"
}

/** What an HTTP server's controller authenticates with; other servers keep one controller per id. */
function credentials(conn: ServerConnection.Any) {
  return conn.type === "http" ? `${conn.http.url}\n${conn.http.password ?? ""}` : ""
}
