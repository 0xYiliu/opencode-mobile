// Extension manager: the GUI extension list mounted in the app's settings "gui-extensions"
// tab on non-desktop builds (M-026). Reuses @opencode/ui primitives and tokens — no new
// visual decisions, no bare values (host-manager precedent); the list itself is a
// deliberately lightweight semantic markup with data-component markers (the upstream
// SettingsList/SettingsRow pair is app-internal and out of this package's import boundary).
//
// The host handle arrives via props — this package never imports app internals: the mount
// wrapper in the vendored shell injects the definition list, the per-id status/failure
// readers and the reload action. Disable records come from the shell-wide instance created
// by root.tsx (M-025); without it the list degrades to read-only (explicit state).
//
// Capability rows are a FIRST-PARTY STATIC TABLE keyed by extension id: "web" rows can be
// toggled; "desktop-host" rows present the main-process absence honestly — their Active
// status is host mechanics, not a usability claim, so their switch stays disabled and the
// row says desktop-only. Product-scope exclusions ("excluded", decision 0001 / issue #62)
// render a static row — id, disabled status, reason — with ZERO controls: no reload, no
// switch, nothing that implies start/stop, install or management semantics. The host
// definitions still never contain wsl (the upstream os filter is untouched), so that row
// is synthesized here, not a host state.
// There is NO install, remove or store entry anywhere: packaged install/remove are desktop
// bridge surfaces and stay unreachable here (zero marketplace claim).

import { For, Show, createMemo } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Switch as ToggleSwitch } from "@opencode/ui/switch"
import { createTranslator, type MessageKey } from "../i18n"
import { getMobileHosts } from "../runtime"
import { isValidExtensionId, sharedExtensionDisabled } from "../extensions/manager"

/** Extensions whose whole contribution runs renderer-side on this device: toggleable. */
const WEB_ACTIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  "context",
  "btw",
  "debug",
  "terminal",
  "file",
  "review",
  "details",
  "microsoft-office",
])

/** Extensions whose main entry lives in the desktop main process: presented, not toggleable. */
const DESKTOP_HOST_EXTENSIONS: ReadonlySet<string> = new Set(["browser", "pairing", "ssh", "updater"])

/** Product-scope exclusions (decision 0001, issue #62/N12): presented as a disabled row
 * with the exclusion reason, never toggleable and never wired to the host. The value IS
 * the row's reason key, compile-time tied to the i18n table (a member without its own key
 * is a type error — there is NO fallback copy); the probe (group 7) locks the table to
 * exactly {"wsl"}. */
const EXCLUDED_EXTENSIONS = {
  wsl: "guiext.excluded.wsl.reason",
} as const satisfies Record<string, MessageKey>

/** The reason key of an excluded id. Membership is checked with `in`; the narrowing after
 * that check is the only index and cannot miss (capabilityOf reads the same table). */
function excludedReasonKey(id: string): MessageKey | undefined {
  return id in EXCLUDED_EXTENSIONS ? EXCLUDED_EXTENSIONS[id as keyof typeof EXCLUDED_EXTENSIONS] : undefined
}

export type ExtensionCapability = "web" | "desktop-host" | "excluded"

/** First-party static capability mapping (probe group 7 locks all three sets). All sets are
 * consulted: the desktop-host blacklist decides the presented-not-toggleable rows, the
 * web-active whitelist documents the toggleable eight, the excluded table carries the
 * product-scope exclusions. An id in NEITHER set (a future builtin the table has not met
 * yet) classifies "web" — the renderer-side default — so the mapping stays
 * conservative-by-default exactly as shipped. */
export function capabilityOf(id: string): ExtensionCapability {
  if (id in EXCLUDED_EXTENSIONS) return "excluded"
  if (DESKTOP_HOST_EXTENSIONS.has(id)) return "desktop-host"
  if (WEB_ACTIVE_EXTENSIONS.has(id)) return "web"
  return "web"
}

export interface ExtensionManagerProps {
  /** The window's filtered definition list (host.definitions() — wsl already os-filtered;
   * the excluded table below presents wsl statically, N12). */
  definitions: readonly { readonly id: string }[]
  /** The host's live status reader (host.state.status[id]). */
  statusOf: (id: string) => string | undefined
  /** The host's last-failure reader (host.state.failures[id]?.error). */
  failureOf: (id: string) => string | undefined
  /** The renderer-side reload action (host.reload(id)). */
  onReload: (id: string) => void
}

export function ExtensionManager(props: ExtensionManagerProps) {
  const t = createTranslator(getMobileHosts().locale)
  const records = sharedExtensionDisabled()
  const disabledIds = createMemo(() => records?.disabled() ?? new Set<string>())

  const statusLine = (id: string) => {
    const status = props.statusOf(id)
    if (status === "active") return t("guiext.status.active")
    if (status === "failed") return t("guiext.status.failed")
    if (status === "disabled") return t("guiext.status.disabled")
    if (status === "blocked") return t("guiext.status.blocked")
    return t("guiext.status.loading")
  }

  const setDisabled = (id: string, next: boolean) => {
    // The switch only renders enabled for web rows with the shell instance present; the
    // id-shape guard mirrors the record layer (defense in depth, never a silent no-op path
    // for a real id).
    if (!records || !isValidExtensionId(id)) return
    records.toggle(id, next)
  }

  // Excluded ids NOT already delivered by the host: the defensive shape (issue #62 MINOR
  // guard) — if the upstream os filter ever stops filtering a member out, the definition
  // row above renders through the excluded branch and the static row disappears (never a
  // duplicate row for one id).
  const excludedIds = createMemo(() => {
    const present = new Set(props.definitions.map((definition) => definition.id))
    return (Object.keys(EXCLUDED_EXTENSIONS) as Array<keyof typeof EXCLUDED_EXTENSIONS>).filter((id) => !present.has(id))
  })

  return (
    <div class="flex w-full min-w-0 flex-col gap-4" data-component="extension-manager">
      <div class="flex flex-col gap-1">
        <h3 class="text-14-medium text-text-strong">{t("guiext.title")}</h3>
        <p class="text-12-regular text-text-weak">{t("guiext.description")}</p>
      </div>
      <ul class="flex w-full min-w-0 flex-col gap-2">
        <For each={props.definitions}>
          {(definition) => {
            const capability = capabilityOf(definition.id)
            const desktopHost = capability === "desktop-host"
            const excluded = capability === "excluded"
            const reasonKey = excluded ? excludedReasonKey(definition.id) : undefined
            return (
              <li
                class="flex w-full min-w-0 items-center gap-2 rounded-[8px] border border-border-weak-base px-3 py-2"
                data-component="extension-row"
                data-extension-id={definition.id}
                data-capability={capability}
              >
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-12-medium text-text-strong" dir="ltr">
                    {definition.id}
                  </span>
                  <span class="truncate text-12-regular text-text-weak">{statusLine(definition.id)}</span>
                  {reasonKey ? (
                    // Excluded definition rows (defensive branch): the reason copy replaces
                    // the capability label — never the "runs on this device" claim.
                    <span class="whitespace-pre-wrap text-12-regular text-text-weak">{t(reasonKey)}</span>
                  ) : (
                    <span class="truncate text-12-regular text-text-weak">
                      {desktopHost ? t("guiext.capability.desktopHost") : t("guiext.capability.web")}
                    </span>
                  )}
                  <Show when={desktopHost}>
                    <span class="text-12-regular text-text-weak">{t("guiext.desktopHostHint")}</span>
                  </Show>
                  <Show when={props.failureOf(definition.id)}>
                    <span role="alert" class="mt-1 whitespace-pre-wrap text-12-regular text-text-strong">
                      {props.failureOf(definition.id)}
                    </span>
                  </Show>
                </div>
                <Show when={!excluded}>
                  <div class="flex shrink-0 items-center gap-2">
                    <Button size="small" variant="neutral" onClick={() => props.onReload(definition.id)}>
                      {t("guiext.reload")}
                    </Button>
                    <ToggleSwitch
                      hideLabel
                      checked={!disabledIds().has(definition.id)}
                      disabled={desktopHost || !records}
                      onChange={(next: boolean) => setDisabled(definition.id, next)}
                    >
                      {definition.id}
                    </ToggleSwitch>
                  </div>
                </Show>
              </li>
            )
          }}
        </For>
        <For each={excludedIds()}>
          {(id) => (
            // Static exclusion row (issue #62/N12, decision 0001): honest id + fixed
            // disabled status + reason, ZERO controls. It reads no statusOf/failureOf/
            // disabledIds and renders no Button/ToggleSwitch; the reason key comes from
            // the EXCLUDED_EXTENSIONS table itself (compile-time tied to the i18n table —
            // no fallback copy).
            <li
              class="flex w-full min-w-0 items-center gap-2 rounded-[8px] border border-border-weak-base px-3 py-2"
              data-component="extension-row"
              data-extension-id={id}
              data-capability="excluded"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-12-medium text-text-strong" dir="ltr">
                  {id}
                </span>
                <span class="truncate text-12-regular text-text-weak">{t("guiext.status.disabled")}</span>
                <span class="whitespace-pre-wrap text-12-regular text-text-weak">{t(EXCLUDED_EXTENSIONS[id])}</span>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={records?.volatile()}>
        <p role="status" class="text-12-regular text-text-strong">{t("guiext.volatile")}</p>
      </Show>
    </div>
  )
}
