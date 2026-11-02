import { describe, expect, test } from "bun:test"
import { isAndroidMobileHost } from "./android-host"
import { dict as zh } from "@/runtime/i18n/zh"
import { dict as zht } from "@/runtime/i18n/zht"
import wslZh from "../../../../gui-plugins/src/wsl/i18n/zh"
import wslZht from "../../../../gui-plugins/src/wsl/i18n/zht"
import type { Window as HappyDOMWindow } from "happy-dom"

function isHappyDOMWindow(value: unknown): value is { happyDOM: Pick<HappyDOMWindow["happyDOM"], "setURL"> } {
  if (typeof value !== "object" || value === null || !("happyDOM" in value)) return false
  const api = value.happyDOM
  return typeof api === "object" && api !== null && "setURL" in api && typeof api.setURL === "function"
}
if (!isHappyDOMWindow(window)) throw new Error("This host test requires the Happy DOM preload")
const browser = window.happyDOM

describe("Android server host", () => {
  test("only exact origin and one exact synchronous marker identify Android", () => {
    const initial = window.location.href
    const marker = document.createElement("meta")
    marker.name = "opencode-mobile-host"
    marker.content = "android-v1"
    try {
      browser.setURL("http://127.0.0.1:18090/")
      expect(isAndroidMobileHost()).toBe(false)
      document.head.append(marker)
      expect(isAndroidMobileHost()).toBe(true)
      marker.content = "wrong"
      expect(isAndroidMobileHost()).toBe(false)
      marker.content = "android-v1"
      const duplicate = marker.cloneNode() as HTMLElement
      document.head.append(duplicate)
      expect(isAndroidMobileHost()).toBe(false)
      duplicate.remove()
      browser.setURL("https://example.org/")
      expect(isAndroidMobileHost()).toBe(false)
    } finally {
      marker.remove()
      browser.setURL(initial)
    }
  })

  test("uses upstream WSL labels in both Chinese locales", () => {
    expect(zh["dialog.server.add.wsl"]).toBe(wslZh["server.add"])
    expect(zht["dialog.server.add.wsl"]).toBe(wslZht["server.add"])
    expect(zh["dialog.server.add.wslUnavailable"]).toBeTruthy()
    expect(zht["dialog.server.add.wslUnavailable"]).toBeTruthy()
  })
})
