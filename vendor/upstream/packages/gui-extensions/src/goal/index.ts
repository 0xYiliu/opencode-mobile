// mobile(M-036): vendored from v2.2.1 (8de0323975) where the goal extension is a gui-plugins
// `Plugin.define({ i18n })` whose id is derived by the new host. The old host's Definition
// declares the id directly (the #67 migration maps this form onto the new one).
import { Extension } from "../sdk"
import en from "./i18n/en"

export default Extension.define({
  id: "goal",
  i18n: { en },
})
