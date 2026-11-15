import { expect, test } from "bun:test"
import { hasCustomAgent, resolveAgent, shouldShowAgentSelector } from "./agent"

test("hasCustomAgent detects only explicitly custom agents", () => {
  expect(hasCustomAgent([{ native: true }, { native: false }])).toBe(true)
  expect(hasCustomAgent([{ native: true }, {}])).toBe(false)
})

const agents = [{ name: "plan" }, { name: "build" }, { name: "custom" }]

const rows: { name: string; agents: { name: string }[]; requested?: string; expected: string }[] = [
  { name: "the requested available agent", agents, requested: "custom", expected: "custom" },
  { name: "build without a request", agents, requested: undefined, expected: "build" },
  { name: "build for a missing agent", agents, requested: "missing", expected: "build" },
  {
    name: "the first agent when build is unavailable",
    agents: [{ name: "custom" }],
    requested: "missing",
    expected: "custom",
  },
]

test.each(rows)("resolveAgent uses $name", (row) => {
  expect(resolveAgent(row.agents, row.requested)?.name).toBe(row.expected)
})

// mobile(providers-models-usage-v2-2-7, issue #192): the agent-visibility re-base cases.
test("shouldShowAgentSelector keeps the selector visible on the Android host", () => {
  expect(shouldShowAgentSelector({ android: true, preference: false, agents: [{ name: "build", native: true }] })).toBe(
    true,
  )
})

test("shouldShowAgentSelector hides the built-in agents on Desktop without the preference", () => {
  expect(shouldShowAgentSelector({ android: false, preference: false, agents: [{ name: "build", native: true }] })).toBe(
    false,
  )
})

test("shouldShowAgentSelector shows a custom agent on every host", () => {
  expect(shouldShowAgentSelector({ android: false, preference: false, agents: [{ name: "custom", native: false }] })).toBe(
    true,
  )
  expect(shouldShowAgentSelector({ android: true, preference: true, agents: [{ name: "custom", native: false }] })).toBe(
    true,
  )
})
