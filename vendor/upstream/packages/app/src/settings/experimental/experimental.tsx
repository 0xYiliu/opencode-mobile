import { Component } from "solid-js"
import { setSourcesEnabled, sourcesExperiment } from "@opencode/session-ui/sources/experiment"
import { Switch } from "@opencode/ui/switch"
import { Select } from "@opencode/ui/select"
import { useLanguage } from "@/runtime/i18n/language"
import { SettingsList } from "@/settings/list"
import { useSettings } from "@/settings/model"
import { SettingsRow } from "@/settings/row"
import "@/settings/settings.css"

export const experimentalSettingsAvailable = true

export const SettingsExperimental: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.tab.experimental")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">
              {language.t("settings.experimental.description")}
            </span>
          </div>
        </div>
      </div>

      <div class="settings-tab-body">
        <div class="settings-section">
          <SettingsList>
            <SettingsRow
              title={language.t("settings.experimental.row.sidebarOrganize.title")}
              description={language.t("settings.experimental.row.sidebarOrganize.description")}
            >
              <Select
                data-action="settings-sidebar-organize"
                options={["list", "projects"] as const}
                current={settings.general.sidebarOrganize()}
                label={(mode) => language.t(`settings.experimental.sidebarOrganize.${mode}`)}
                onSelect={(mode) => mode && settings.general.setSidebarOrganize(mode)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRow>
            <SettingsRow
              title={language.t("settings.experimental.row.newIcons.title")}
              description={language.t("settings.experimental.row.newIcons.description")}
            >
              <div data-action="settings-new-icons">
                <Switch
                  checked={settings.general.newIcons()}
                  onChange={(checked) => settings.general.setNewIcons(checked)}
                />
              </div>
            </SettingsRow>
            <SettingsRow
              title={language.t("settings.experimental.row.foldUserMessages.title")}
              description={language.t("settings.experimental.row.foldUserMessages.description")}
            >
              <div data-action="settings-fold-user-messages">
                <Switch
                  checked={settings.general.foldUserMessages()}
                  onChange={(checked) => settings.general.setFoldUserMessages(checked)}
                />
              </div>
            </SettingsRow>
            <SettingsRow
              title={language.t("settings.experimental.row.newQuestionUI.title")}
              description={language.t("settings.experimental.row.newQuestionUI.description")}
            >
              <div data-action="settings-new-question-ui">
                <Switch
                  checked={settings.general.newQuestionUI()}
                  onChange={(checked) => settings.general.setNewQuestionUI(checked)}
                  hideLabel
                >
                  {language.t("settings.experimental.row.newQuestionUI.title")}
                </Switch>
              </div>
            </SettingsRow>
            {/* mobile(gui-plugins-v2-2-7, issue #194; M-036): the Sources experiment gate row. The knob is declared
                once by session-ui's sources experiment; this row flips that same registered instance through the
                exported setter — re-registering here would clobber the knob and leave the row showing on while the
                experiment stays off — and the experiment's subscribe mirrors the flip back into the store. */}
            <SettingsRow
              title={language.t("settings.experimental.row.sources.title")}
              description={language.t("settings.experimental.row.sources.description")}
            >
              <div data-action="settings-sources">
                <Switch checked={sourcesExperiment.enabled} onChange={(checked) => setSourcesEnabled(checked)} />
              </div>
            </SettingsRow>
          </SettingsList>
        </div>
      </div>
    </>
  )
}
