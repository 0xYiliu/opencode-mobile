import { readFileSync } from "node:fs"
import { createMobileHosts } from "../packages/mobile-hosts/src/runtime"
import { createMemoryStorage } from "../packages/mobile-hosts/src/storage"

const root = new URL("..", import.meta.url).pathname
const read = (file: string) => readFileSync(`${root}${file}`, "utf8")
const fail = (message: string): never => {
  console.error(`verify-connection-inline-ssh: FAIL: ${message}`)
  process.exit(1)
}
const screen = read("vendor/upstream/packages/app/src/servers/connect/screen.tsx")
const routes = read("vendor/upstream/packages/app/src/shell/routes/routes.tsx")
const form = read("packages/mobile-hosts/src/ui/host-dialog.tsx")
const setup = read("packages/mobile-hosts/src/ui/initial-ssh-setup.tsx")
const hostDialog = read("packages/mobile-hosts/src/ui/host-dialog.tsx")
const hostManager = read("packages/mobile-hosts/src/ui/host-manager.tsx")
const hostCredential = read("packages/mobile-hosts/src/ui/host-credential.ts")
const runtimeSource = read("packages/mobile-hosts/src/runtime.ts")
const activity = read("android/app/src/main/java/ai/opencode/mobile/MainActivity.kt")
const recovery = read("packages/mobile-hosts/src/ui/host-key-recovery.tsx")
const keyPrompt = read("packages/mobile-hosts/src/ui/host-key-prompt.tsx")
const keyBinding = read("packages/mobile-hosts/src/ui/host-key-binding.ts")

for (const mode of ['"link"', '"password"', '"ssh"']) if (!screen.includes(mode)) fail(`missing in-place connection mode ${mode}`)
if (!screen.includes("<InitialSshSetup runtime={mobileHosts} active={() => state.method === \"ssh\"} />")) fail("SSH mode does not render an active-gated first-party setup form")
if (screen.includes('navigate("/settings?tab=servers")')) fail("legacy settings escape remains in the connection screen")
if (!screen.includes("whitespace-nowrap")) fail("M-029 button no-wrap correction was lost")
if (screen.slice(screen.indexOf("const chooseMethod"), screen.indexOf("const target")).includes("releaseInitialScreen")) fail("switching modes must not abandon a saved SSH owner")
if (!(screen.indexOf("servers.add(existing") < screen.indexOf("mobileHosts.releaseInitialScreen()"))) fail("direct-mode ownership is released before authenticated server publication")
if (routes.includes("isConnectionRoute") || routes.includes("useLocation")) fail("M-027 special settings route access was not reverted")
if (!routes.includes("servers.list.length > 0 && !signedOut()")) fail("original no-server/signed-out guard is not restored")
if (!routes.includes("initialScreenOwned()")) fail("AppShell does not honor initial SSH ownership")

const validation = form.indexOf("registry.validate")
const credentialPersist = form.indexOf("persistHostCredential({")
const firstVaultWrite = hostCredential.indexOf("vault.put")
if (validation < 0 || credentialPersist < 0 || firstVaultWrite < 0 || validation > credentialPersist) fail("host validation must precede credential persistence")
if (hostCredential.includes("vault.remove(")) fail("editing/unbinding silently deletes an old credential")
if (!form.includes("props.beforeCreate?.()")) fail("initial owner is not acquired before registry publication")
if (!runtimeSource.includes("generation === undefined || initialGeneration() === generation")) fail("late ownership callbacks are not generation guarded")
if (!hostDialog.includes("beforeCreate?.()") || !hostDialog.includes("onCreated?.(created.id, typeof createGeneration === \"number\" ? createGeneration : undefined)")) fail("create ownership token does not travel across async vault writes")
if (!setup.includes("canStartInitialSshAttempt({") || !setup.includes("activeMode: props.active()")) fail("late created-host callback can connect a stale/inactive initial owner")
if (!hostDialog.includes("if (saveLock || saving() || importing() || disposed) return") || !hostDialog.includes("const draft = {") || !hostDialog.includes("if (disposed || generation !== saveGeneration) return")) fail("host save is not single-flight, snapshot-based and disposal guarded")
if (!hostDialog.includes("disabled={saving() || importing()}") || !hostDialog.includes("if (saving() || importing() || saveLock) return")) fail("host form/cancel is not locked during asynchronous vault writes")
if (!hostManager.includes("<Show when={dialogOpen() ? editingId() ?? \"__new-host__\" : undefined} keyed>")) fail("switching the edited host does not dispose the previous form transaction")
if (!runtimeSource.includes("response.status === 401 || response.status === 403")) fail("service auth responses are not distinguished from unreachable service")
if (!setup.includes("KeyedHostKeyPrompt") || !setup.includes("HostKeyRecovery") || setup.includes("runtime.forgetHostKey")) fail("inline host-key UI must use the identity-keyed prompt and shared recovery confirmation")
if (!recovery.includes("flow.begin()") || !recovery.includes("flow.confirm()")) fail("changed-key removal bypasses the explicit second confirmation")
if (!keyPrompt.includes("binding.hostName") || !keyPrompt.includes("binding.target") || !keyPrompt.includes("binding.sshPort")) fail("host-key prompt omits exact host identity fields")
if (!keyPrompt.includes("break-all whitespace-normal select-text") || keyPrompt.includes("truncate text-12-mono")) fail("full host-key fingerprint is not selectable/wrappable")
if (!keyBinding.includes("confirm: () => runtime.confirmHostKey(hostId, {") || !keyBinding.includes("target,") || !keyBinding.includes("fingerprint,")) fail("host target/port/fingerprint are not snapshotted into confirmation")
if (!activity.includes('waiting.postMessage({ type: "SKIP_WAITING" })') || !activity.includes('waiting.state === "activated"')) fail("Android does not promote/reload a waiting packaged worker after APK update")
if (!activity.includes('item.scope === shellScope') || !activity.includes('worker.scriptURL === expectedScript') || !activity.includes("ShellWorkerPolicy.isTrustedShellPage(url, START_URL)") || !activity.includes("location.reload()")) fail("worker rollover is not packaged-origin/script/root-scope gated and activation-gated")
if (!activity.includes("current.addEventListener(\"updatefound\", () => watchInstalling(current.installing))") || !activity.includes("watchInstalling(current.installing)")) fail("worker rollover misses an installing worker already started by app bootstrap")
if (activity.includes("localStorage.clear") || activity.includes("deleteOrigin")) fail("worker update must not clear user storage")
{
  const match = activity.match(/val script = """([\s\S]*?)"""\.trimIndent\(\)/)
  if (!match) fail("could not extract the Android worker rollover script")
  const script = match[1]!.trim().replace(/;\s*$/, "")
    .replace("${JSONObject.quote(trustedStartUrl)}", JSON.stringify("http://127.0.0.1:18090/"))
  const workerListeners = new Map<string, () => void>()
  const clientListeners = new Map<string, () => void>()
  let message: unknown
  let reloads = 0
  const waiting = {
    scriptURL: "http://127.0.0.1:18090/sw.js",
    state: "installed",
    addEventListener: (name: string, listener: () => void) => workerListeners.set(name, listener),
    postMessage: (value: unknown) => {
      message = value
      waiting.state = "activated"
      serviceWorker.controller = waiting
      workerListeners.get("statechange")?.()
      clientListeners.get("controllerchange")?.()
    },
  }
  const registration = {
    scope: "http://127.0.0.1:18090/",
    active: { scriptURL: waiting.scriptURL },
    waiting,
    installing: null,
    addEventListener() {},
  }
  const serviceWorker = {
    controller: undefined as typeof waiting | undefined,
    getRegistrations: async () => [registration],
    addEventListener: (name: string, listener: () => void) => clientListeners.set(name, listener),
  }
  const run = new Function("navigator", "location", "URL", "setTimeout", `return ${script}`)
  await run({ serviceWorker }, { href: "http://127.0.0.1:18090/", origin: "http://127.0.0.1:18090", reload: () => reloads++ }, URL, setTimeout)
  if ((message as { type?: string } | undefined)?.type !== "SKIP_WAITING") fail("waiting worker did not receive SKIP_WAITING")
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (reloads !== 1) fail(`worker activation should trigger one reload, got ${reloads}`)

  const runRejectedWorkerCase = async (href: string, scope: string, scriptUrl: string) => {
    let posted = 0
    let updates = 0
    const worker = { scriptURL: scriptUrl, state: "installed", addEventListener() {}, postMessage() { posted++ } }
    const registration = {
      scope,
      active: { scriptURL: scriptUrl },
      waiting: worker,
      installing: null,
      addEventListener() {},
      async update() { updates++ },
    }
    await run(
      { serviceWorker: { controller: undefined, getRegistrations: async () => [registration], addEventListener() {} } },
      { href, origin: new URL(href).origin, reload() { throw new Error("untrusted worker case reloaded") } },
      URL,
      setTimeout,
    )
    if (posted !== 0 || updates !== 0) fail(`untrusted worker registration was updated/promoted: ${href} ${scope} ${scriptUrl}`)
  }
  await runRejectedWorkerCase("https://attacker.invalid/", "http://127.0.0.1:18090/", "http://127.0.0.1:18090/sw.js")
  await runRejectedWorkerCase("http://127.0.0.1:18090/", "http://127.0.0.1:18090/app/", "http://127.0.0.1:18090/sw.js")
  await runRejectedWorkerCase("http://127.0.0.1:18090/", "http://127.0.0.1:18090/", "https://attacker.invalid/sw.js")
  await runRejectedWorkerCase("http://127.0.0.1:18090/", "http://127.0.0.1:18090/", "http://127.0.0.1:18090/redirected.js")

  let lateReloads = 0
  const lateWorkerListeners = new Map<string, () => void>()
  const lateClientListeners = new Map<string, () => void>()
  const redirectedLocation = {
    href: "http://127.0.0.1:18090/",
    origin: "http://127.0.0.1:18090",
    reload() { lateReloads++ },
  }
  const lateWaiting = {
    scriptURL: "http://127.0.0.1:18090/sw.js",
    state: "installed",
    addEventListener(name: string, listener: () => void) { lateWorkerListeners.set(name, listener) },
    postMessage() {
      redirectedLocation.href = "https://attacker.invalid/redirected"
      redirectedLocation.origin = "https://attacker.invalid"
      lateWaiting.state = "activated"
      lateServiceWorker.controller = lateWaiting
      lateWorkerListeners.get("statechange")?.()
      lateClientListeners.get("controllerchange")?.()
    },
  }
  const lateRegistration = {
    scope: "http://127.0.0.1:18090/",
    active: { scriptURL: lateWaiting.scriptURL },
    waiting: lateWaiting,
    installing: null,
    addEventListener() {},
  }
  const lateServiceWorker = {
    controller: undefined as typeof lateWaiting | undefined,
    async getRegistrations() { return [lateRegistration] },
    addEventListener(name: string, listener: () => void) { lateClientListeners.set(name, listener) },
  }
  await run({ serviceWorker: lateServiceWorker }, redirectedLocation, URL, setTimeout)
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (lateReloads !== 0) fail("late worker activation/controller callback reloaded after a cross-origin redirect")
}

const hosts = createMobileHosts({ storage: createMemoryStorage() })
const generation = hosts.claimInitialScreen()
const host = hosts.registry.add({ name: "probe", target: "probe@example.invalid" })
hosts.ownInitialHost(host.id)
hosts.releaseInitialScreen(host.id, generation - 1)
if (!hosts.initialScreenOwned()) fail("stale handoff released initial screen ownership")
hosts.releaseInitialScreen(host.id, generation)
if (hosts.initialScreenOwned()) fail("current owner could not release after successful handoff")

console.log("verify-connection-inline-ssh: mode, guard, credential ordering, host-key reachability and ownership race checks passed")
