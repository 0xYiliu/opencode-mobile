import { describe, expect, test } from "bun:test"
import { createComponent, Show } from "solid-js"
import { render } from "solid-js/web"

describe("root Settings Server keyed entry", () => {
  test("renders and passes the keyed entry value directly to the root server panel", async () => {
    const entry = { key: "synthetic-server", name: "Synthetic server" }
    const host = document.createElement("div")
    const dispose = render(
      () => createComponent(Show, {
        get when() { return entry },
        keyed: true,
        get children() {
          return (value: typeof entry) => {
            const heading = document.createElement("h2")
            heading.dataset.testid = "server-name"
            heading.textContent = value.name
            return heading
          }
        },
      }),
      host,
    )

    expect(host.querySelector("[data-testid=server-name]")?.textContent).toBe("Synthetic server")
    const source = await Bun.file(new URL("./shell.tsx", import.meta.url)).text()
    expect(source).toContain("<Show when={singleEntry()} keyed>")
    expect(source).toContain("<SettingsServerGeneral entry={entry} onAddServer={addServer} />")
    expect(source).not.toContain("<SettingsServerGeneral entry={entry()} onAddServer={addServer} />")
    dispose()
  })
})
