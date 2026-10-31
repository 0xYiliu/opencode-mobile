import { describe, expect, test } from "bun:test"
import { revealSettingsSearch } from "./search-reveal"

// The migrated catalog (issue #101) pruned the three target-only rows whose page anchors do
// not exist on this tree yet (mobile(M-044) markers in search-catalog.ts), and any future
// page-issue gap can produce more. This locks the general mechanism: a reveal aimed at a
// missing anchor must degrade to a no-op — never throw, never leave marker attributes
// behind — while a present anchor still reveals and cleans up after dispose.

describe("settings search reveal", () => {
  test("no-ops on a missing target anchor and disposes without throwing", async () => {
    const root = document.createElement("div")
    const panel = document.createElement("div")
    panel.className = "settings-panel"
    root.appendChild(panel)
    document.body.appendChild(root)

    const dispose = revealSettingsSearch(root, {
      type: "root",
      tab: "general",
      target: "settings-anchor-that-does-not-exist",
    })

    // The queued reveal attempt runs without throwing; the anchor stays unrevealed.
    await Promise.resolve()
    expect(panel.querySelector("[data-search-target]")).toBeNull()

    // Disposing twice is safe (the search activation cleanup path can outlive the view).
    dispose()
    dispose()
    root.remove()
  })

  test("reveals a present anchor and restores it on dispose", async () => {
    const root = document.createElement("div")
    const panel = document.createElement("div")
    panel.className = "settings-panel"
    const control = document.createElement("button")
    control.dataset.action = "settings-color-scheme"
    // Happy-dom has no layout engine: the reveal's visibility probe, scroll, and animation
    // lookup are stubbed on the control to exercise the real reveal path.
    control.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList
    control.scrollIntoView = () => {}
    control.getAnimations = () => []
    panel.appendChild(control)
    root.appendChild(panel)
    document.body.appendChild(root)

    const dispose = revealSettingsSearch(root, {
      type: "root",
      tab: "appearance",
      target: "settings-color-scheme",
    })

    await Promise.resolve()
    const row = panel.querySelector("[data-search-target]")

    expect(row).not.toBeNull()
    dispose()
    expect(panel.querySelector("[data-search-target]")).toBeNull()
    root.remove()
  })
})
