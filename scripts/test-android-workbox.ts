/** Real Chromium Workbox integrity smoke: `bun scripts/test-android-workbox.ts [chromium-path]`. */
import { createRequire } from "node:module"
import { resolve } from "node:path"
const require = createRequire(resolve("vendor/upstream/packages/app/package.json"))
const { chromium } = await import(require.resolve("@playwright/test"))
const web = resolve("vendor/upstream/packages/app/dist")
const android = resolve("android/app/src/main/assets/web")
let root = android
let tamperIndex = false
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/test-control") return new Response("<!doctype html><title>test</title>", { headers: { "content-type": "text/html", "cache-control": "no-store" } })
    let path = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html"
    if (path.includes("..")) return new Response("invalid", { status: 400 })
    let file = Bun.file(resolve(root, path))
    if (!(await file.exists())) file = Bun.file(resolve(root, "index.html"))
    if (tamperIndex && path === "index.html") {
      return new Response((await file.text()) + "\n<!--tampered-->", { headers: { "content-type": "text/html", "cache-control": "no-store" } })
    }
    return new Response(file, { headers: { "cache-control": "no-store", ...(path === "sw.js" ? { "service-worker-allowed": "/" } : {}) } })
  },
})
const executablePath = process.argv[2] || undefined
const browser = await chromium.launch({ headless: true, executablePath })
const url = `http://127.0.0.1:${server.port}`
try {
  async function openContext() {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${url}/test-control`)
    return { context, page }
  }
  async function register(page: any) {
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
    })
  }
  root = android
  {
    const { context, page } = await openContext()
    await register(page)
    await page.goto(`${url}/project/first`, { waitUntil: "domcontentloaded" })
    if (await page.locator('head meta[name="opencode-mobile-host"][content="android-v1"]').count() !== 1) throw new Error("new install: fallback missing marker")
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
    if (!controlled) throw new Error("new install: fallback not worker-controlled")
    console.log("new install: Workbox activated; controlled SPA fallback has Android marker")
    await context.close()
  }
  root = web
  {
    const { context, page } = await openContext()
    await register(page)
    await page.goto(`${url}/project/old`, { waitUntil: "domcontentloaded" })
    if (await page.locator('head meta[name="opencode-mobile-host"]').count() !== 0) throw new Error("old build unexpectedly marked")
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error("old worker did not control page")
    await page.goto(`${url}/test-control`)
    root = android
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) throw new Error("missing old registration")
      await registration.update()
    })
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) throw new Error("missing registration")
      const worker = registration.waiting ?? registration.installing
      if (!worker) throw new Error("new worker not installing")
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`worker timed out: ${worker.state}`)), 30000)
        const check = () => {
          if (worker.state === "redundant") { clearTimeout(timer); reject(new Error("new worker install failed")) }
          if (worker.state === "installed") { clearTimeout(timer); resolve() }
        }
        worker.addEventListener("statechange", check)
        check()
      })
      worker.postMessage({ type: "SKIP_WAITING" })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`activation timed out: ${worker.state}`)), 30000)
        const check = () => {
          if (worker.state === "activated") { clearTimeout(timer); resolve() }
          if (worker.state === "redundant") { clearTimeout(timer); reject(new Error("new worker activation failed")) }
        }
        worker.addEventListener("statechange", check)
        check()
      })
    })
    await page.goto(`${url}/project/upgrade`, { waitUntil: "domcontentloaded" })
    if (await page.locator('head meta[name="opencode-mobile-host"][content="android-v1"]').count() !== 1) throw new Error("upgrade: fallback missing marker")
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error("upgrade: no controlling worker")
    console.log("upgrade: unmarked old worker -> marked waiting worker -> activated; controlled SPA fallback has marker")
    await context.close()
  }
  root = android
  tamperIndex = true
  {
    const { context, page } = await openContext()
    const result = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw.js")
      const worker = registration.installing
      if (!worker) throw new Error("no worker to observe")
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("tamper test timed out")), 30000)
        const check = () => {
          if (worker.state === "redundant" || worker.state === "activated") {
            clearTimeout(timer)
            resolve(worker.state)
          }
        }
        worker.addEventListener("statechange", check)
        check()
      })
    })
    if (result !== "redundant") throw new Error(`tampered index incorrectly installed: ${result}`)
    console.log("tamper: mismatched index integrity rejects worker installation")
    await context.close()
  }
} finally {
  await browser.close()
  server.stop(true)
}
