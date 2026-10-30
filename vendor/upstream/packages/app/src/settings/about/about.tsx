import { createResource, Show } from "solid-js"
import { useDialog } from "@opencode/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ExternalLink } from "@/runtime/platform/external-link"
import { showToast } from "@/shell/notifications/toast"
import { useServerCollectionController } from "@/servers/registry/controller"
import { ServerConnection } from "@/runtime/server/registry"
import legal from "./legal.svg"
import anomalyBrush from "./anomaly-brush.svg"
import { AnimatedWordmark } from "./animated-wordmark"
import { FALLBACK_OTHER_CONTRIBUTORS, loadOtherContributorCount } from "./contributors"
// mobile(M-040): the vendored app package version backs the "upstream base" row (issue #72).
import pkg from "../../../package.json"

const writers = [
  "thdxr",
  "adamdotdev",
  "rekram1-node",
  "kitlangton",
  "iamdavidhill",
  "jayair",
  "fwang",
  "brendonovich",
  "nexxeln",
  "hona",
  "kommander",
  "jlongster",
  "vimtor",
  "r44vcorp",
  "simonklee",
  "arvsrn",
] as const

const illustrators = ["usrnk1", "ludvigrask_", "arvsrn", "iamdavidhill"] as const

export function SettingsAbout(props: { active: boolean }) {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  // mobile(M-040): the server row reads the first sorted connection's health (issue #72).
  const servers = useServerCollectionController()

  const [otherContributors] = createResource(
    () => props.active || undefined,
    () => loadOtherContributorCount(platform.fetch ?? fetch),
    { initialValue: FALLBACK_OTHER_CONTRIBUTORS },
  )

  const credit = (name: string) => (
    <bdi dir="ltr">
      <ExternalLink href={profile(name)}>{name}</ExternalLink>
    </bdi>
  )

  const writerCredits = () => [
    ...writers.map(credit),
    <ExternalLink href="https://github.com/anomalyco/opencode/graphs/contributors">
      {language.plural("settings.about.otherContributor", otherContributors.latest, {
        count: otherContributors.latest,
      })}
    </ExternalLink>,
  ]

  // mobile(M-040): server version row (issue #72). The shown server is the first entry of
  // the sorted collection — sortServerConnections ranks healthy-first over the FULL list
  // (hidden hosts included), so with multiple servers this row shows only the first sorted
  // entry; the complete per-server version face lives in the servers settings rows.
  // Degradation, all explicit strings: no collection entry -> the row is not rendered;
  // the health entry is not yet established (undefined) or still checking -> the checking
  // key; unauthorized / unhealthy / healthy-but-version-missing-or-not-presentable -> the
  // unavailable key. The key derivation follows the settings/servers contract
  // (ServerConnection.key(item)); every store read is undefined-safe.
  const serverVersionLine = () => {
    const item = servers.collection.items()[0]

    if (!item) return undefined

    const health = servers.collection.health()[ServerConnection.key(item)]

    if (!health || health.checking) return language.t("settings.about.serverVersion.checking")
    if (health.unauthorized || !health.healthy || !presentableVersion(health.version))
      return language.t("settings.about.serverVersion.unavailable")

    return language.t("settings.about.serverVersion.version", { version: health.version })
  }

  const showNotices = async () => {
    // The license texts load only when someone reads them.
    const loaded = await import("./notices/dialog").catch(() => undefined)

    if (!loaded) {
      showToast({ variant: "error", title: language.t("settings.about.notices.loadFailed") })

      return
    }

    void dialog.show(() => <loaded.default />)
  }

  return (
    <div class="settings-about-content">
      <div class="settings-about-intro">
        <p>
          {language.t("settings.about.version", {
            version: platform.version ?? language.t("settings.about.devVersion"),
          })}
        </p>
        {/* mobile(M-040): base/server version rows (issue #72) — a registered mobile delta,
            not an upstream face: upstream v2.2.1 has no base/server version rows. */}
        <div class="settings-about-versions" data-component="settings-about-versions">
          <p>{language.t("settings.about.upstreamVersion", { version: pkg.version })}</p>
          <Show when={serverVersionLine()}>{(line) => <p>{line()}</p>}</Show>
        </div>
        <p>{language.t("settings.about.license")}</p>
      </div>

      <AnimatedWordmark active={props.active} />

      <div class="settings-about-credits">
        <p>{language.rich("settings.about.writtenByNames", { names: language.list(writerCredits()) })}</p>
        <p>
          {language.rich("settings.about.illustratedByNames", {
            names: language.list(illustrators.map(credit)),
          })}
        </p>
      </div>

      <div class="settings-about-publication">
        <p>{language.t("settings.about.firstPublished")}</p>
        <p>{language.t("settings.about.firstIllustrated")}</p>
      </div>

      <p class="settings-about-faint">
        <ExternalLink href="https://opencode.ai">
          <bdi dir="ltr">{language.t("settings.about.website")}</bdi>
        </ExternalLink>
      </p>

      <div class="settings-about-details">
        <p>{language.t("settings.about.description")}</p>
        <p>{language.t("settings.about.trademark")}</p>
        <p>{language.t("settings.about.typeset")}</p>
        <p>
          <button type="button" class="settings-about-link" onClick={() => void showNotices()}>
            {language.t("settings.about.notices.title")}
          </button>
        </p>
      </div>

      <p>{language.t("settings.about.tagline")}</p>
      <img class="settings-about-legal" src={legal} alt="" />
      <div class="settings-about-copyright">
        <p>{language.t("settings.about.copyright")}</p>
        <img class="settings-about-anomaly-brush" src={anomalyBrush} alt="" />
      </div>
    </div>
  )
}

// mobile(M-040): a health version is presentable only as a non-empty string — the display
// contract stays verbatim like the servers settings rows (no semver re-parsing here).
function presentableVersion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function profile(name: string) {
  if (name === "r44vcorp") return "https://github.com/R44VC0RP"

  if (name === "ludvigrask_") return "https://x.com/ludvigrask_"

  return `https://github.com/${name}`
}
