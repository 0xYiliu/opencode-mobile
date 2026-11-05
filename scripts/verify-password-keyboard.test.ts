import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("first connection password keyboard contract", () => {
  test("build flag defaults to normal keyboard and rejects invalid values", () => {
    const gradle = read("android/app/build.gradle.kts")
    expect(gradle).toContain('gradleProperty("passwordKeyboard").orElse("false")')
    expect(gradle).toContain('it == "true" || it == "false"')
    expect(gradle).toContain('"PASSWORD_KEYBOARD", passwordKeyboard.get().toString()')
  })

  test("shell exposes only an uncached boolean", () => {
    const server = read("android/app/src/main/java/ai/opencode/mobile/WebAssetServer.kt")
    expect(server).toContain('session.uri == "/mobile-keyboard-config.json"')
    expect(server).toContain('BuildConfig.PASSWORD_KEYBOARD')
    expect(server).toContain('addHeader("Cache-Control", "no-store")')
  })

  test("only first connection password selects the masked text mode", () => {
    const screen = read("vendor/upstream/packages/app/src/servers/connect/screen.tsx")
    expect(screen).toContain('config?.passwordKeyboard === false')
    expect(screen).toContain('CSS.supports("-webkit-text-security", "disc")')
    expect(screen).toContain('location.hostname !== "127.0.0.1"')
    expect(screen).toContain('type={normalPasswordKeyboard() ? "text" : "password"}')
    expect(screen).toContain('"-webkit-text-security": "disc"')
    expect(screen).toContain('autocomplete={normalPasswordKeyboard() ? "off" : "current-password"}')
    expect(screen).toContain('autocorrect="off"')
    expect(screen).toContain('spellcheck={false}')
    expect(read("vendor/upstream/packages/app/src/servers/connect/dialog.tsx")).toContain('type="password"')
  })

  test("vendor patch is registered in both manifests", () => {
    const manifest = JSON.parse(read("vendor/upstream/vendor-manifest.json"))
    const patches = JSON.parse(read("vendor/upstream/patches/mobile/manifest.json"))
    const patch = "patches/mobile/connection-password-keyboard.patch"
    expect(manifest.mobilePatches).toContain(patch)
    expect(patches.patches.some((entry: { id: string; patch: string }) => entry.id === "connection-password-keyboard" && entry.patch === patch)).toBe(true)
  })
})
