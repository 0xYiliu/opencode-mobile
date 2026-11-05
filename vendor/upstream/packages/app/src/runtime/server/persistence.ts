import { Effect, Option, Predicate, Schema, SchemaGetter } from "effect"
import { Persistence } from "@/runtime/persistence/schema"

export const ServerKey = Schema.String.pipe(Schema.brand("ServerConnection.Key"))

// mobile(M-002): password stripped at encode (memory-only).
//
// The encoded (stored) form of a server never contains `password`: the encode half of the
// field codec below always drops it, so no persistent backend (web localStorage, desktop
// storage, draft stores) ever receives a credential. Decoding keeps tolerating a stored
// password from legacy or foreign files, and a missing password reaches the existing
// authentication-failure path. Keystore-backed persistence is owned by mobile issue #4.
// `M002.stripped` counts strip events on the live encode path and `M002.marker` anchors
// static verification of the built bundle (search the dist for "mobile(M-002)").
const M002 = {
  marker: "mobile(M-002): password stripped at encode (memory-only)",
  stripped: 0,
}

// Encoded side and type side share the same shape, so decoding is unchanged; only encoding
// rewrites a present password to `undefined`, which struct serialization omits entirely.
const MemoryOnlyPassword = Schema.UndefinedOr(Schema.String).pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
    decode: SchemaGetter.transform((value: string | undefined) => value),
    encode: SchemaGetter.transform((value: string | undefined) => {
      if (Predicate.isString(value)) {
        M002.stripped++
        return undefined
      }

      return value
    }),
  }),
)

export const ServerHttpBase = Persistence.struct({
  url: Schema.String,
  password: Schema.optional(MemoryOnlyPassword),
  // mobile(M-005): non-secret credential REFERENCE (a pointer such as
  // "mobile-credential:<id>", not a credential value). The password above is still stripped
  // at encode (M-002); this reference is safe to persist and is resolved per session into
  // memory only by the credential resolver (keystore-backed resolution is mobile issue #4).
  // Decoding tolerates its absence for already-stored servers.
  credentialRef: Schema.optional(Schema.String),
})

export const ServerHttp = Persistence.struct({
  type: Schema.Literal("http"),
  http: ServerHttpBase,
  authToken: Schema.optional(Schema.Boolean),
  displayName: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
})

const StoredServer = Schema.Union([ServerHttp, ServerHttpBase, Schema.String]).pipe(
  Schema.decodeTo(ServerHttp, {
    decode: SchemaGetter.transform((value) => {
      if (Predicate.isString(value)) return { type: "http", http: { url: value } }

      if ("http" in value) return value

      return { type: "http", http: value }
    }),
    encode: SchemaGetter.transform((value) => value),
  }),
)

const ProjectList = Persistence.array(
  Persistence.struct({
    worktree: Schema.String,
    expanded: Persistence.fallback(Schema.Boolean, () => true),
  }),
)

const Projects = Persistence.record(ProjectList)

const LastProject = Persistence.record(Schema.String.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none()))))

const State = Persistence.struct({
  list: Persistence.array(StoredServer),
  hidden: Schema.Record(
    Schema.String,
    Schema.mutableKey(Schema.Boolean.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
  ),
  projects: Schema.Record(Schema.String, Schema.mutableKey(ProjectList)),
  lastProject: Schema.Record(
    Schema.String,
    Schema.mutableKey(Schema.String.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
  ),
  recentlyClosed: Schema.Record(Schema.String, Schema.mutableKey(Persistence.array(Schema.String))),
})

export function serverState(canonicalLocalServer: () => string | undefined = () => undefined) {
  return Persistence.migrate(
    State,
    Persistence.legacy({ projects: Projects, lastProject: LastProject }).pipe(
      Schema.decode({
        decode: SchemaGetter.transform((value) => {
          const canonical = canonicalLocalServer()

          if (!canonical || canonical === "local") return value
          const previous = value.projects[canonical]
          const last = value.lastProject[canonical]

          if (!previous && last === undefined) return value

          const projects = { ...value.projects }

          if (previous) {
            const local = projects.local ?? []
            const worktrees = new Set(local.map((project) => project.worktree))
            projects.local = [
              ...local,
              ...previous.filter((project) => {
                if (worktrees.has(project.worktree)) return false
                worktrees.add(project.worktree)

                return true
              }),
            ]
            delete projects[canonical]
          }

          const lastProject = { ...value.lastProject }

          if (last !== undefined) {
            lastProject.local ??= last
            delete lastProject[canonical]
          }

          return { ...value, projects, lastProject }
        }),
        encode: SchemaGetter.transform((value) => value),
      }),
    ),
  )
}

const FavoriteIdentity = Persistence.struct({
  providerID: Schema.String.check(Schema.isMinLength(1)),
  modelID: Schema.String.check(Schema.isMinLength(1)),
})

export const ModelState = Persistence.struct({
  favorite: Persistence.array(FavoriteIdentity),
  user: Persistence.array(
    Persistence.struct({
      providerID: Schema.String,
      modelID: Schema.String,
      visibility: Schema.Literals(["show", "hide"]),
      favorite: Schema.optional(Schema.Boolean),
    }),
  ),
  recent: Persistence.array(Persistence.struct({ providerID: Schema.String, modelID: Schema.String })),
  variant: Schema.Record(
    Schema.String,
    Schema.mutableKey(
      Schema.UndefinedOr(Schema.String).pipe(Schema.catchDecoding(() => Effect.succeed(Option.none()))),
    ),
  ),
})

// Inspect raw presence before recovery supplies the empty default. An explicit (even malformed)
// new field is authoritative, so removing the last favorite never revives legacy flags.
export const modelState = Persistence.migrate(
  ModelState,
  Schema.Unknown.pipe(Schema.decode({
    decode: SchemaGetter.transform((value) => {
      if (!Predicate.isObject(value)) return value
      const entries = Object.hasOwn(value, "favorite")
        ? (Array.isArray(value.favorite) ? value.favorite : [])
        : (Array.isArray(value.user) ? value.user.filter((item) =>
            Predicate.isObject(item) && item.favorite === true &&
            (item.visibility === "show" || item.visibility === "hide")) : [])
      const seen = new Map<string, Set<string>>()
      const decode = Schema.decodeUnknownOption(FavoriteIdentity)
      const favorite = entries.flatMap((entry) => {
        const identity = decode(entry)
        if (Option.isNone(identity)) return []
        const { providerID, modelID } = identity.value
        const models = seen.get(providerID) ?? new Set<string>()
        if (models.has(modelID)) return []
        models.add(modelID)
        seen.set(providerID, models)
        return [{ providerID, modelID }]
      })
      return { ...value, favorite }
    }),
    encode: SchemaGetter.transform((value) => value),
  })),
)

export const VcsState = Persistence.struct({
  value: Schema.optional(
    Persistence.struct({
      branch: Schema.optional(Schema.String),
      default_branch: Schema.optional(Schema.String),
    }),
  ),
})

const ProjectMeta = Persistence.struct({
  name: Schema.optional(Schema.String),
  icon: Schema.optional(
    Persistence.struct({
      override: Schema.optional(Schema.String),
      color: Schema.optional(Schema.String),
    }),
  ),
  commands: Schema.optional(Persistence.struct({ start: Schema.optional(Schema.String) })),
})

export const ProjectState = Persistence.struct({
  value: Schema.optional(ProjectMeta),
})

export const IconState = Persistence.struct({
  value: Schema.optional(Schema.String),
})
