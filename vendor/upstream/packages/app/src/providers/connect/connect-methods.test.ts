import { expect, mock, test } from "bun:test"
import type { FormField, IntegrationInfo, IntegrationMethod } from "@opencode/client/promise"

// Behavior tests for the two pure functions of the connect controller (issue #141):
// `connectMethods` (the "same order as the TUI" method ordering) and
// `providerFormDefaults` (hidden-field defaults with when-conditions).
// The controller module pulls the runtime server chain (`useServerSDK`/`useData` → registry),
// which does not resolve in the no-seam unit-test mode; the hook boundaries are mocked
// (same seam as settings/palette.test.ts) and the functions under test stay real.
mock.module("@/runtime/i18n/language", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
mock.module("@/runtime/platform/platform", () => ({
  usePlatform: () => ({}),
}))
mock.module("@/runtime/server/client", () => ({
  useServerSDK: () => ({}),
}))
mock.module("@/runtime/server/current", () => ({
  useData: () => ({}),
}))

const { connectMethods, providerFormDefaults } = await import("./controller")

const method = (shape: IntegrationMethod): IntegrationMethod => shape

const integration = (methods: Array<IntegrationMethod>): IntegrationInfo => ({
  id: "openai",
  name: "OpenAI",
  methods,
  connections: [],
})

test("connectMethods sorts non-key methods first and the API key last", () => {
  const sorted = connectMethods(
    integration([
      method({ type: "key", label: "API key" }),
      method({ id: "m-oauth", type: "oauth", label: "OAuth" }),
      method({ id: "m-command", type: "command", label: "Command", command: ["opencode", "auth"] }),
      method({ id: "m-external", type: "external", label: "External" }),
    ]),
  )

  expect(sorted.map((m) => m.type)).toEqual(["oauth", "command", "external", "key"])
})

test("connectMethods filters environment methods out", () => {
  const sorted = connectMethods(
    integration([
      method({ type: "env", names: ["OPENAI_API_KEY"] }),
      method({ type: "key", label: "API key" }),
      method({ id: "m-oauth", type: "oauth", label: "OAuth" }),
    ]),
  )

  expect(sorted.map((m) => m.type)).toEqual(["oauth", "key"])
})

test("connectMethods keeps a single oauth method", () => {
  const sorted = connectMethods(integration([method({ id: "m-oauth", type: "oauth", label: "OAuth" })]))

  expect(sorted).toHaveLength(1)
  expect(sorted[0]?.type).toBe("oauth")
})

test("connectMethods returns no methods for an env-only integration", () => {
  const sorted = connectMethods(integration([method({ type: "env", names: ["OPENAI_API_KEY"] })]))

  expect(sorted).toEqual([])
})

test("providerFormDefaults collects hidden fields with defaults", () => {
  const answer = providerFormDefaults([
    { key: "visible", type: "string", default: "skipped" },
    { key: "region", type: "string", hidden: true, default: "us" },
  ])

  expect(answer).toEqual({ region: "us" })
})

test("providerFormDefaults skips external fields and hidden fields without defaults", () => {
  const answer = providerFormDefaults([
    { key: "link", type: "external", url: "https://example.com" },
    { key: "empty", type: "string", hidden: true },
  ])

  expect(answer).toEqual({})
})

test("providerFormDefaults applies eq conditions against earlier hidden defaults", () => {
  const active = providerFormDefaults([
    { key: "mode", type: "string", hidden: true, default: "cloud" },
    {
      key: "endpoint",
      type: "string",
      hidden: true,
      default: "https://cloud.example.com",
      when: [{ key: "mode", op: "eq", value: "cloud" }],
    },
  ])

  expect(active).toEqual({ mode: "cloud", endpoint: "https://cloud.example.com" })

  const inactive = providerFormDefaults([
    { key: "mode", type: "string", hidden: true, default: "self-hosted" },
    {
      key: "endpoint",
      type: "string",
      hidden: true,
      default: "https://cloud.example.com",
      when: [{ key: "mode", op: "eq", value: "cloud" }],
    },
  ])

  expect(inactive).toEqual({ mode: "self-hosted" })
})

test("providerFormDefaults applies neq conditions", () => {
  const answer = providerFormDefaults([
    { key: "mode", type: "string", hidden: true, default: "self-hosted" },
    {
      key: "endpoint",
      type: "string",
      hidden: true,
      default: "https://local.example.com",
      when: [{ key: "mode", op: "neq", value: "cloud" }],
    },
  ])

  expect(answer).toEqual({ mode: "self-hosted", endpoint: "https://local.example.com" })
})

test("providerFormDefaults treats a multiselect answer as a contains check", () => {
  const contains = providerFormDefaults([
    {
      key: "scopes",
      type: "multiselect",
      hidden: true,
      options: [
        { value: "read", label: "Read" },
        { value: "write", label: "Write" },
      ],
      default: ["read", "write"],
    },
    { key: "writeFlag", type: "boolean", hidden: true, default: true, when: [{ key: "scopes", op: "eq", value: "write" }] },
  ])

  expect(contains).toEqual({ scopes: ["read", "write"], writeFlag: true })

  const missing = providerFormDefaults([
    { key: "scopes", type: "multiselect", hidden: true, options: [{ value: "read", label: "Read" }], default: ["read"] },
    { key: "writeFlag", type: "boolean", hidden: true, default: true, when: [{ key: "scopes", op: "eq", value: "write" }] },
  ])

  expect(missing).toEqual({ scopes: ["read"] })
})

test("providerFormDefaults leaves fields inactive when their condition key is unanswered", () => {
  const answer = providerFormDefaults([
    {
      key: "endpoint",
      type: "string",
      hidden: true,
      default: "https://cloud.example.com",
      when: [{ key: "mode", op: "eq", value: "cloud" }],
    },
  ] satisfies FormField[])

  expect(answer).toEqual({})
})
