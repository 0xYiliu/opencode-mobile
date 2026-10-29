// Real rendered smoke for the initial connection screen in Android WebView.
// Run after install-r and `adb forward tcp:9239 localabstract:webview_devtools_remote_<pid>`:
//   bun run scripts/verify-inline-ssh-device.ts http://127.0.0.1:9239
// Only synthetic, unsubmitted drafts are entered; no server/host action or credential save occurs.

const endpoint = process.argv[2] ?? "http://127.0.0.1:9222"
const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json()) as Array<{
  type: string
  url: string
  webSocketDebuggerUrl: string
}>
const page = targets.find((target) => target.type === "page" && target.url.startsWith("http://127.0.0.1:18090/"))
if (!page) throw new Error("No OpenCode Android WebView target at http://127.0.0.1:18090/")

const socket = new WebSocket(page.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map<number, (value: unknown) => void>()
socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown }
  if (message.id === undefined) return
  pending.get(message.id)?.(message.result)
  pending.delete(message.id)
}
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve()
  socket.onerror = () => reject(new Error("Could not connect to Android WebView DevTools"))
})

const evaluate = async (expression: string) => {
  const id = ++sequence
  const result = await new Promise<unknown>((resolve) => {
    pending.set(id, resolve)
    socket.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }))
  }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string } }
  if (result.exceptionDetails) throw new Error(`WebView behavior assertion threw: ${result.exceptionDetails.text ?? "unknown error"}`)
  return result.result?.value
}

try {
  const report = await evaluate(`(async () => {
    const url = location.href
    const root = document.querySelector('[data-component="connect-server"]')
    if (!root) throw new Error('ConnectServerScreen is not rendered')
    const buttons = () => [...root.querySelectorAll('[data-component="server-connect-method"] button')]
    const click = (label) => {
      const button = buttons().find((item) => item.textContent.trim() === label)
      if (!button) throw new Error('Missing mode switch: ' + label)
      button.click()
    }
    const fill = (selector, value) => {
      const input = root.querySelector(selector)
      if (!input) throw new Error('Missing draft input: ' + selector)
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const pause = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    click('Pairing link')
    await pause()
    fill('#server-connect-link', 'https://pair.example.invalid/auth/connect/synthetic-code')
    click('Use password')
    await pause()
    fill('#server-connect-url', 'https://server.example.invalid:4096')
    fill('#server-connect-password', 'synthetic-unsubmitted-draft')
    click('Pairing link')
    await pause()
    const pairingDraftRetained = root.querySelector('#server-connect-link')?.value === 'https://pair.example.invalid/auth/connect/synthetic-code'

    click('SSH hosts')
    await pause()
    const inlineFormVisible = !!root.querySelector('#mobile-host-name') && !!root.querySelector('#mobile-host-target')
    if (!inlineFormVisible) throw new Error('SSH mode did not render the first-host form')
    fill('#mobile-host-name', 'Synthetic UI draft')
    fill('#mobile-host-target', 'probe@example.invalid:22')
    const servicePort = root.querySelector('#mobile-host-service-port')?.value
    click('Pairing link')
    await pause()
    const nameHiddenWhilePairing = root.querySelector('#mobile-host-name')?.closest('[hidden]')?.hidden === true
    click('Use password')
    await pause()
    const directDraftRetained = root.querySelector('#server-connect-url')?.value === 'https://server.example.invalid:4096'
      && root.querySelector('#server-connect-password')?.value === 'synthetic-unsubmitted-draft'
    click('Pairing link')
    await pause()
    const pairingDraftRetainedAgain = root.querySelector('#server-connect-link')?.value === 'https://pair.example.invalid/auth/connect/synthetic-code'
    click('SSH hosts')
    await pause()
    const sshDraftRetained = root.querySelector('#mobile-host-name')?.value === 'Synthetic UI draft'
      && root.querySelector('#mobile-host-target')?.value === 'probe@example.invalid:22'

    // Remove all synthetic drafts without submitting or saving anything.
    fill('#mobile-host-name', '')
    fill('#mobile-host-target', '')
    click('Pairing link')
    await pause()
    fill('#server-connect-link', '')
    click('Use password')
    await pause()
    fill('#server-connect-url', '')
    fill('#server-connect-password', '')
    return { url, finalUrl: location.href, pairingDraftRetained, directDraftRetained,
      pairingDraftRetainedAgain, inlineFormVisible, nameHiddenWhilePairing, sshDraftRetained, servicePort }
  })()`)

  const parsed = typeof report === "string" ? JSON.parse(report) : report
  const checks = parsed as Record<string, unknown>
  for (const key of ["pairingDraftRetained", "directDraftRetained", "pairingDraftRetainedAgain", "inlineFormVisible", "nameHiddenWhilePairing", "sshDraftRetained"]) {
    if (checks[key] !== true) throw new Error(`Rendered Android check failed: ${key}=${String(checks[key])}`)
  }
  if (checks["url"] !== checks["finalUrl"]) throw new Error(`SSH selection navigated: ${String(checks["url"])} -> ${String(checks["finalUrl"])}`)
  if (checks["servicePort"] !== "4096") throw new Error(`Unexpected default service port: ${String(checks["servicePort"])}`)
  console.log(`verify-inline-ssh-device: PASS ${JSON.stringify(checks)}`)
} finally {
  socket.close()
}
