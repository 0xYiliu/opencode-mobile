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

// Project data comes from the server; per server scope, the client keeps only which projects it has used.
// `projects` is the directory list older builds kept: each scope's entry is migrated to project IDs once the
// server's list loads, then deleted. Stored `recentlyClosed` and directory-keyed `lastProject` fields are not part
// of this schema, so decoding drops them.
export const ServerState = Persistence.struct({
  list: Persistence.array(StoredServer),
  hidden: Schema.Record(
    Schema.String,
    Schema.mutableKey(Schema.Boolean.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
  ),
  lastProjectID: Schema.Record(
    Schema.String,
    Schema.mutableKey(Schema.String.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
  ),
  usedProjectIDs: Persistence.record(Persistence.array(Schema.String)),
  // The last hostname each server reported, so its name shows before the first health check answers.
  hostnames: Schema.Record(
    Schema.String,
    Schema.mutableKey(Schema.String.pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))),
  ),
  projects: Persistence.record(Persistence.array(Persistence.struct({ worktree: Schema.String }))),
})

export const ModelState = Persistence.struct({
  user: Persistence.array(
    Persistence.struct({
      providerID: Schema.String,
      modelID: Schema.String,
      visibility: Schema.Literals(["show", "hide"]),
      favorite: Schema.optional(Schema.Boolean),
    }),
  ),
  recent: Persistence.array(Persistence.struct({ providerID: Schema.String, modelID: Schema.String })),
  favorite: Persistence.array(Persistence.struct({ providerID: Schema.String, modelID: Schema.String })),
  variant: Schema.Record(
    Schema.String,
    Schema.mutableKey(
      Schema.UndefinedOr(Schema.String).pipe(Schema.catchDecoding(() => Effect.succeed(Option.none()))),
    ),
  ),
})

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
