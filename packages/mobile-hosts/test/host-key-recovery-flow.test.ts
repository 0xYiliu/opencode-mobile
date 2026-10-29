import { describe, expect, test } from "bun:test"
import { createHostKeyRecoveryFlow } from "../src/ui/host-key-recovery-flow"

describe("changed host-key danger confirmation behavior", () => {
  test("does not call forgetHostKey until the separate confirm action", async () => {
    const calls: string[] = []
    const flow = createHostKeyRecoveryFlow(async () => { calls.push("host-a"); return true })
    expect(flow.phase()).toBe("warning")
    expect(await flow.confirm()).toBe(false)
    expect(calls).toHaveLength(0)

    flow.begin()
    expect(flow.phase()).toBe("confirming")
    flow.cancel()
    expect(flow.phase()).toBe("warning")
    expect(calls).toHaveLength(0)

    flow.begin()
    expect(await flow.confirm()).toBe(true)
    expect(flow.phase()).toBe("removed")
    expect(calls).toEqual(["host-a"])
    expect(await flow.confirm()).toBe(false)
    expect(calls).toHaveLength(1)
  })

  test("a failed removal stays explicit and can only be retried from confirmation state", async () => {
    let calls = 0
    const flow = createHostKeyRecoveryFlow(async () => { calls++; return false })
    flow.begin()
    expect(await flow.confirm()).toBe(false)
    expect(flow.phase()).toBe("failed")
    expect(calls).toBe(1)
  })
})
