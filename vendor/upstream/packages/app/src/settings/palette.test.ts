import { describe, expect, mock, test } from "bun:test"

// Narrow tests for the settings → command-palette bridge (issue #101, plan §5):
// `createSettingsPaletteEntries` returns at most five `type: "setting"` entries with the
// `setting:` id prefix, a title that starts with the query leads the group, projects are
// excluded, and selecting an entry hands the setting's view/id to `surface.search.open`.
// The catalog and surface are synthetic seams; `rankSettings` stays real (pure function).

const opened: Array<{ view: unknown; id: string }> = []
mock.module("./surface", () => ({
  useSettingsSurface: () => ({
    search: {
      open(view: unknown, id: string) {
        opened.push({ view, id })
      },
    },
  }),
}))

mock.module("@/runtime/i18n/language", () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))

const catalog = [
  {
    id: "settings-code-font",
    title: "Code Font",
    keywords: "code typeface",
    description: "",
    owner: "",
    page: "Appearance",
    view: { type: "root", tab: "appearance", target: "settings-code-font" },
  },
  {
    id: "settings-font-size",
    title: "Font size",
    keywords: "font size text",
    description: "",
    owner: "",
    page: "Appearance",
    view: { type: "root", tab: "appearance", target: "settings-font-size" },
  },
  {
    id: "settings-project-name",
    title: "Name",
    keywords: "rename",
    description: "",
    owner: "",
    page: "Projects",
    entity: true,
    projectName: "Opencode",
    view: { type: "project", server: "srv", project: "/projects/opencode", tab: "general", target: "settings-project-name" },
  },
]
mock.module("./search", () => ({
  createSettingsSearchCatalog: () => () => catalog,
}))

const { createSettingsPaletteEntries } = await import("./palette")

describe("settings palette entries", () => {
  test("returns at most five setting entries with the setting: id prefix", () => {
    const entries = createSettingsPaletteEntries().items("font")

    expect(entries.length).toBeGreaterThan(0)
    expect(entries.length).toBeLessThanOrEqual(5)
    expect(new Set(entries.map((entry) => entry.type))).toEqual(new Set(["setting"]))
    for (const entry of entries) expect(entry.id).toMatch(/^setting:settings-/)
    expect(entries.every((entry) => entry.category === "palette.group.settings")).toBeTrue()
  })

  test("ranks a title that starts with the query first and excludes project entities", () => {
    const entries = createSettingsPaletteEntries().items("font")

    // The palette's prefix rule (case-insensitive) leads with "Font size"; the score-equal
    // "Code Font" follows.
    expect(entries[0]!.title).toBe("Font size")
    expect(entries.map((entry) => entry.title)).toContain("Code Font")
    expect(entries.some((entry) => entry.title === "Name")).toBeFalse()
  })

  test("select hands the setting's view and id to the surface search", () => {
    const palette = createSettingsPaletteEntries()
    const entry = palette.items("font")[0]!
    opened.length = 0

    palette.select(entry)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.id).toBe(entry.setting!.id)
    expect(opened[0]!.view).toEqual(entry.setting!.view)
  })
})
