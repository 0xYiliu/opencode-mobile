import { describe, expect, test } from "bun:test"
import { createComponent, createRoot, Show, type Accessor } from "solid-js"
import { insert } from "solid-js/web"

// mobile(M-044) rewrite for the migrated servers-tab shape (issue #101, plan §3.3):
// the target `<Show when={multiple() ? undefined : inventory()[0]} fallback={...}>` is NOT
// keyed — its callback receives the plain value, which is why the value must be passed on as
// `entry={entry()}` (the frozen-baseline failure was the pin-era keyed form passing the
// getter wrapper to `SettingsServerGeneral entry={entry}`). The render below uses
// createComponent + createRoot + a manual host append instead of `render()` from
// solid-js/web, whose server dist throws `notSup` under the unit-test conditions (the
// frozen baseline's environment failure; the same render-free harness as the M-044
// surface.test.ts).

describe("root Settings Server keyed entry", () => {
  test("passes the plain entry value to the root server panel (non-keyed target form)", () => {
    const entry = { key: "synthetic-server", name: "Synthetic server" }
    const host = document.createElement("div")
    document.body.appendChild(host)

    createRoot((dispose) => {
      const tree = createComponent(Show, {
        get when() {
          return entry
        },
        get children() {
          return (value: Accessor<typeof entry>) => {
            // Non-keyed function children receive an accessor; the panel prop unwraps it
            // (`entry={entry()}`), which is exactly the identity this test locks.
            expect(value()).toBe(entry)

            const heading = document.createElement("h2")
            heading.dataset.testid = "server-name"
            heading.textContent = value().name

            return heading
          }
        },
      })

      // solid-js/web's insert materializes thunks/arrays (what render() does before its
      // server dist raises notSup): under the browser dist createComponent returns a lazy
      // thunk, so a plain appendChild would mount nothing — while under the server dist
      // insert itself is the client-only API, and the eagerly-evaluated node appends
      // directly. Either environment mounts exactly one of the two ways.
      try {
        insert(host, tree as never)
      } catch {
        if (tree instanceof Node) host.appendChild(tree)
      }
      queueMicrotask(dispose)
    })

    expect(host.querySelector("[data-testid=server-name]")?.textContent).toBe("Synthetic server")
  })

  test("the migrated shell renders the target servers-tab shape with the host manager first", async () => {
    const source = await Bun.file(new URL("./shell.tsx", import.meta.url)).text()

    // mobile(M-008): the first-party SSH host manager is the tab's first child.
    expect(source).toContain('<Tabs.Content value="servers" class="settings-panel">')
    expect(source).toContain("<MobileHostManager />")
    expect(source.indexOf("<MobileHostManager />")).toBeGreaterThan(
      source.indexOf('<Tabs.Content value="servers" class="settings-panel">'),
    )

    // Target form: non-keyed Show with the SettingsServerList fallback wired to the
    // surface's server scope, and the plain value passed to the root server panel.
    expect(source).toContain("when={multiple() ? undefined : inventory()[0]}")
    expect(source).toContain("<SettingsServerList")
    expect(source).toContain("selected={surface.server()?.key}")
    expect(source).toContain("onServerChange={selectServer}")
    expect(source).toContain("<SettingsServerGeneral entry={entry()} onAddServer={addServer} />")
    expect(source).not.toContain("<SettingsServerGeneral entry={entry} onAddServer={addServer} />")
  })
})
