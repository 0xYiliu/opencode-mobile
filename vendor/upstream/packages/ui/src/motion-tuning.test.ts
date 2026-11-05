import { afterEach, describe, expect, test } from "bun:test"
import { motionGlobals, motionTuning } from "./motion-tuning"

const presets = {
  snappy: { duration: 0.15, bounce: 0 },
  smooth: { duration: 0.25, bounce: 0 },
  calm: { duration: 0.4, bounce: 0 },
}

afterEach(() => {
  motionTuning.set(motionGlobals.speed, 1)
  motionTuning.set(motionGlobals.slow, false)
})

describe("motionTuning.spring", () => {
  test("ships Snappy and keeps the other presets on the knob", () => {
    const spring = motionTuning.spring("test.shared", { label: "Spring", group: "Test", presets })
    const knob = motionTuning.list().find((item) => item.id === "test.shared")

    expect(spring()).toEqual(presets.snappy)
    expect(knob?.kind === "spring" && knob.initial).toEqual(presets.snappy)
    expect(knob?.kind === "spring" && knob.presets).toEqual(presets)
  })

  test("ships the preset a spring names", () => {
    const spring = motionTuning.spring("test.smooth", { label: "Spring", group: "Test", shipped: "smooth", presets })
    const knob = motionTuning.list().find((item) => item.id === "test.smooth")

    expect(spring()).toEqual(presets.smooth)
    expect(knob?.kind === "spring" && knob.initial).toEqual(presets.smooth)
  })

  test("runs a preset applied to its knob, stretched by the global speed and slow motion", () => {
    const spring = motionTuning.spring("test.scaled", { label: "Spring", group: "Test", presets })
    const knob = motionTuning.list().find((item) => item.id === "test.scaled")

    if (knob?.kind !== "spring") throw new Error("expected a spring knob")
    motionTuning.set(knob, knob.presets.calm)
    expect(spring()).toEqual({ duration: 0.4, bounce: 0 })

    motionTuning.set(motionGlobals.speed, 2)
    expect(spring().duration).toBeCloseTo(0.2)

    motionTuning.set(motionGlobals.slow, true)
    expect(spring().duration).toBeCloseTo(0.8)
  })
})

describe("motionTuning.choice", () => {
  test("starts on its shipped option and switches to another", () => {
    const choice = motionTuning.choice("test.choice", {
      label: "Choice",
      group: "Test",
      value: "b",
      labels: { a: "A", b: "B", c: "C" },
    })

    const knob = motionTuning.list().find((item) => item.id === "test.choice")

    if (knob?.kind !== "choice") throw new Error("expected a choice knob")

    expect(choice()).toBe("b")
    expect(knob.options).toEqual(["a", "b", "c"])

    motionTuning.set(knob, "c")
    expect(choice()).toBe("c")
  })
})

test("legacy gate reload, default deletion and knob saves share one live record and subscriptions", async () => {
  localStorage.setItem("opencode.motion.v2", JSON.stringify({ "legacy.enabled": 1, "legacy.disabled": 0 }))
  const current: typeof import("./motion-tuning") = await import("./motion-tuning.ts" + "?legacy-coexistence")
  expect(current.storedToggle("legacy.enabled", false)).toBe(true)
  expect(current.storedToggle("legacy.disabled", true)).toBe(false)
  expect(current.storedToggle("missing", true)).toBe(true)
  let notifications = 0
  const unsubscribe = current.motionTuning.subscribe(() => notifications++)
  const spring = current.motionTuning.spring("coexist.spring", { label: "Spring", group: "Test", presets })
  const knob = current.motionTuning.list().find((item) => item.id === "coexist.spring")
  if (knob?.kind !== "spring") throw new Error("expected a spring knob")
  current.motionTuning.set(knob, knob.presets.calm)
  expect(spring()).toEqual(presets.calm)
  expect(JSON.parse(localStorage.getItem("opencode.motion.v2")!)).toEqual({
    "legacy.enabled": 1, "legacy.disabled": 0, "coexist.spring.duration": 0.4,
  })
  current.setStoredToggle("legacy.enabled", false, false)
  current.setStoredToggle("legacy.disabled", true, true)
  expect(JSON.parse(localStorage.getItem("opencode.motion.v2")!)).toEqual({ "coexist.spring.duration": 0.4 })
  current.motionTuning.set(knob, knob.initial)
  expect(localStorage.getItem("opencode.motion.v2")).toBeNull()
  expect(current.storedToggle("legacy.enabled", false)).toBe(false)
  expect(current.storedToggle("legacy.disabled", true)).toBe(true)
  expect(notifications).toBe(5)
  unsubscribe()
  current.setStoredToggle("legacy.enabled", true, false)
  expect(notifications).toBe(5)
  const reloaded: typeof import("./motion-tuning") = await import("./motion-tuning.ts" + "?legacy-reloaded")
  expect(reloaded.storedToggle("legacy.enabled", false)).toBe(true)
  expect(reloaded.storedToggle("legacy.disabled", true)).toBe(true)
  reloaded.motionTuning.set(reloaded.motionGlobals.speed, 2)
  expect(JSON.parse(localStorage.getItem("opencode.motion.v2")!)).toEqual({ "legacy.enabled": 1, speed: 2 })
  reloaded.setStoredToggle("legacy.enabled", false, false)
  expect(JSON.parse(localStorage.getItem("opencode.motion.v2")!)).toEqual({ speed: 2 })
})
