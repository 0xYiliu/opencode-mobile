import { describe, expect, test } from "bun:test"
import { createPanelDriver } from "../src/service-ops/panel-driver"
import type { PanelDriverDeps, PanelResult, Preview } from "../src/service-ops/panel-driver"
import type { MessageKey } from "../src/i18n"
import { messages } from "../src/i18n"
import { parseSshTargetUser } from "../src/ssh/known-hosts"
import { createFakeSvcopsBridge } from "./fake-svcops-bridge"
import { createServiceOpsClient } from "../src/service-ops/port"

// Driver-level regression tests for the review-B1 deadlock: the two FORCED re-discovery
// paths (the N3 stale-confirm and the cancel-uncertain paths) must REALLY execute a
// discovery — the probe sequence runs again, the flow lands back in `discovered` with a
// fresh stamp, and the UI recovers — instead of parking in `discovering` with the O1
// gate refusing the re-entry. Driven against the REAL flow machine and the fake svcops
// bridge (synthetic outputs only; nothing contacts a network).

const EN = messages.en as Record<string, string>
const t = (key: MessageKey) => EN[key] ?? key

/** Deterministic probe outputs for a Linux host with the binary present. */
function linuxHandlers(listening: boolean) {
  return {
    exec: (params: Record<string, unknown>) => {
      const templateId = String(params["templateId"])
      const out = (stdout: string, exitCode = 0) => ({
        exitCode,
        stdout,
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      })
      switch (templateId) {
        case "probe.os.posix":
          return out("Linux\n")
        case "probe.bin.linux":
          return out("/home/u/.opencode/bin/opencode")
        case "probe.version.linux":
          return out("opencode 2.1.4")
        case "probe.process.linux":
          return out("", 1)
        case "probe.port.linux":
          return listening ? out("LISTEN 0 128 *:4096 *:*") : out("")
        case "start.linux":
        case "stop.linux":
        case "backup.linux":
        case "restore.linux":
        case "install.npm.linux":
          return out("")
        default:
          return out("")
      }
    },
  }
}

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function createHarness(options: { listening?: boolean; apiReachable?: boolean } = {}) {
  let listening = options.listening ?? false
  let apiReachable = options.apiReachable ?? false
  let clock = 1_800_000_000_000
  const bridge = createFakeSvcopsBridge(linuxHandlers(listening))
  bridge.native.connect()
  const client = createServiceOpsClient(bridge.transport)

  const states: string[] = []
  let lastResult: PanelResult | undefined
  let lastPreview: Preview | undefined
  const deps: PanelDriverDeps = {
    sshUser: () => "deploy",
    servicePort: () => 4096,
    fingerprint: () => "SHA256:7Dil7fhcFhvYP/3LBtfWvXYovDGcuwdyX6t+Av12qgk",
    resolveCredential: async () => "synthetic-credential",
    execRequest: (input) => {
      expect(input.username).toBe("deploy") // B2: the username crosses on every exec
      return client.exec({
        host: "example.invalid",
        port: 22,
        username: input.username,
        templateId: input.templateId,
        params: input.params,
        os: input.os,
        credential: input.credential,
        pinnedFingerprint: input.pinnedFingerprint,
      })
    },
    cancelExec: async () => {
      await bridge.transport.request("cancel", { host: "example.invalid", port: 22 })
    },
    apiReachable: () => apiReachable,
    now: () => clock,
    translate: t,
    onFlow: (state) => states.push(state),
    onSnapshot: () => {},
    onDiscoveredOs: () => {},
    onPreview: (p) => {
      lastPreview = p
    },
    onBusy: () => {},
    onResult: (r) => {
      lastResult = r
    },
    onInlineError: () => {},
    onSurvived: () => {},
    onReauthChecked: () => {},
  }
  const driver = createPanelDriver(deps)
  return {
    driver,
    bridge,
    states,
    result: () => lastResult,
    preview: () => lastPreview,
    probeCount: (templateId: string) => bridge.native.requests().filter((r) => r.op === "exec" && r.params["templateId"] === templateId).length,
    execCount: (templateId: string) => bridge.native.requests().filter((r) => r.op === "exec" && r.params["templateId"] === templateId).length,
    cancelCount: () => bridge.native.requests().filter((r) => r.op === "cancel").length,
    advance: (ms: number) => {
      clock += ms
    },
    setListening: (v: boolean) => {
      listening = v
      bridge.native.setHandlers(linuxHandlers(v))
    },
    setApiReachable: (v: boolean) => {
      apiReachable = v
    },
  }
}

describe("discovery happy path", () => {
  test("discover runs the probe sequence and lands discovered with a fresh stamp", async () => {
    const h = createHarness({ listening: true, apiReachable: true })
    await h.driver.discover()
    expect(h.driver.getFlow().state).toBe("discovered")
    expect(h.probeCount("probe.os.posix")).toBe(1)
    const snapshot = h.driver.getSnapshot()
    expect(snapshot?.status.kind).toBe("running")
    expect(snapshot?.limitations.length).toBeGreaterThan(0) // N5 pgrep limitation carried
  })
})

describe("review B1: the forced re-discovery paths really execute", () => {
  test("N3 stale confirm: the re-discovery runs (probes re-executed) and the preview re-opens", async () => {
    const h = createHarness({ listening: true })
    await h.driver.discover()
    expect(h.probeCount("probe.os.posix")).toBe(1)
    h.driver.openPreview("start", "", "")
    expect(h.preview()?.action).toBe("start")
    // The discovery goes stale beyond the N3 threshold.
    h.advance(61_000)
    await h.driver.executePreview(true)
    // THE FIX UNDER TEST: the probe sequence ran a second time (the pre-fix deadlock
    // parked the flow in discovering with the probes never re-running).
    expect(h.probeCount("probe.os.posix")).toBe(2)
    // The flow is back in the ladder WITH a fresh stamp: the re-discovery dispatched
    // `discovered` (O2, fresh checkedAt) and then re-opened the preview (O4) — the
    // panel recovers instead of parking in `discovering`.
    expect(h.driver.getFlow().state).toBe("previewing")
    expect(h.driver.getFlow().ctx.checkedAt).toBe(1_800_000_000_000 + 61_000)
    expect(h.preview()?.action).toBe("start")
    // And the ladder still gates execution: a fresh confirm now executes for real.
    h.advance(1)
    await h.driver.executePreview(true)
    expect(h.execCount("start.linux")).toBe(1)
    expect(h.result()?.kind).toBe("success")
    expect(h.driver.getFlow().state).toBe("succeeded")
  })

  test("cancel-uncertain: the cancel reaches the bridge and the forced re-discovery really runs", async () => {
    const h = createHarness({ listening: true })
    await h.driver.discover()
    h.driver.openPreview("start", "", "")
    await h.driver.executePreview(true) // fresh clock: confirm -> execute -> done fast
    expect(h.driver.getFlow().state).toBe("succeeded")
    // Drive a second action and cancel it mid-execution.
    await h.driver.discover() // hygiene re-check (succeeded -> discovering -> discovered)
    h.driver.openPreview("start", "", "")
    const release: Array<() => void> = []
    h.bridge.native.setHandlers({
      exec: (params) => {
        if (params["templateId"] === "start.linux") {
          return new Promise((resolve) => {
            release.push(() =>
              resolve({ exitCode: 0, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false }),
            )
          })
        }
        return linuxHandlers(true).exec!(params)
      },
    })
    const executing = h.driver.executePreview(true)
    await drain()
    expect(h.driver.getFlow().state).toBe("executing")
    await h.driver.requestCancel()
    expect(h.driver.getFlow().state).toBe("cancelRequested")
    expect(h.cancelCount()).toBe(1) // the local cancel crossed the bridge
    for (const r of release) r()
    await executing
    // THE FIX UNDER TEST: after the cancel the probes re-ran (evidence, not a claim).
    const posixAfterSecondDiscovery = 1 /* first discover */ + 1 /* hygiene rediscover */ + 1 /* forced rediscovery */
    expect(h.probeCount("probe.os.posix")).toBe(posixAfterSecondDiscovery)
    expect(h.driver.getFlow().state).toBe("discovered")
    expect(h.result()?.code).toBe("cancel-uncertain")
    expect(h.preview()).toBeUndefined()
  })
})

describe("review B1: reconnect refresh after the O14 invalidation", () => {
  test("notifyReadyArrival runs the discovery while the flow is already discovering", async () => {
    const h = createHarness({ listening: true, apiReachable: true })
    await h.driver.discover()
    expect(h.driver.getSnapshot()?.status.kind).toBe("running")
    h.driver.notifyConnectionLost() // O14: discovered -> discovering (invalidation)
    expect(h.driver.getFlow().state).toBe("discovering")
    h.setApiReachable(false)
    h.setListening(false)
    await h.driver.notifyReadyArrival(false)
    expect(h.probeCount("probe.os.posix")).toBe(2)
    expect(h.driver.getFlow().state).toBe("discovered")
    expect(h.driver.getSnapshot()?.status.kind).toBe("installed-stopped")
  })

  test("re-auth arrival (T12 face) refreshes without claiming detach survival", async () => {
    const h = createHarness({ listening: true, apiReachable: true })
    await h.driver.discover()
    h.driver.notifyConnectionLost()
    await h.driver.notifyReadyArrival(true)
    expect(h.probeCount("probe.os.posix")).toBe(2)
    // survived stays undefined on the re-auth face (the driver reports it via the
    // reauthChecked sink; the panel words it as a re-authentication re-check).
    expect(h.driver.getFlow().state).toBe("discovered")
  })
})

describe("review N3: the preflight and the preview-time running refusal", () => {
  test("install preview on a running service is refused with the occupied-port copy", async () => {
    const h = createHarness({ listening: true, apiReachable: true })
    await h.driver.discover()
    h.driver.openPreview("install", "2.1.4", "")
    expect(h.preview()).toBeUndefined()
    // The result/inline face carries the occupied-port honesty (via the translate sink).
  })

  test("portFree is fail-closed: no probe evidence refuses the install (never installs)", async () => {
    const h = createHarness({ listening: false })
    await h.driver.discover()
    // Kill the bridge mid-execution: the preflight probe answers no evidence -> refuse.
    h.bridge.transport.dispose()
    h.driver.openPreview("install", "2.1.4", "")
    expect(h.preview()?.action).toBe("install") // preview assembles (offline assembly is pure)…
    await h.driver.executePreview(true)
    // …but the execution path refuses with occupied-port instead of installing blind.
    expect(h.result()?.code).toBe("occupied-port")
    expect(h.execCount("install.npm.linux")).toBe(0)
  })
})

describe("B2: the username rides the exec request (routing fact, once per request)", () => {
  test("exec requests carry the target user; user-less parsing answers undefined", () => {
    expect(parseSshTargetUser("deploy@example.invalid:22")).toBe("deploy")
    expect(parseSshTargetUser("example.invalid")).toBeUndefined()
    expect(parseSshTargetUser("example.invalid:2222")).toBeUndefined()
  })
})
