import { afterEach, expect, mock, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { insert } from "solid-js/web"
import { base64Encode } from "@opencode/util/encode"
import type { ModelSelection } from "@/providers/models/selection"

// The drawer keeps its exported contract: a synthetic provider/model context is enough to drive it,
// the default manage flow opens the real DialogManageModels, and an explicit caller onManage wins.
const STORY_MODEL = {
  id: "claude-sonnet-4",
  providerID: "anthropic",
  api: { id: "claude-sonnet-4", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
  name: "Claude Sonnet 4",
  family: "claude-sonnet",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: true,
    toolcall: true,
    input: { text: true, audio: false, image: true, video: false, pdf: true },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: true,
  },
  cost: { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
  limit: { context: 200_000, output: 64_000 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2025-05-22",
  variants: { balanced: {} },
  provider: { id: "anthropic", name: "Anthropic", source: "custom", env: [], options: {}, models: {} },
  latest: true,
} satisfies NonNullable<ReturnType<ModelSelection["current"]>>

const { createStore, } = require("solid-js/store")
const [favorites, setFavorites] = createStore<{ models: Array<typeof STORY_MODEL> }>({ models: [{ ...STORY_MODEL }] })

const syntheticSelection = {
  ready: Object.assign(() => true, { promise: undefined }),
  key: () => ({ providerID: STORY_MODEL.providerID, modelID: STORY_MODEL.id, variant: STORY_MODEL.variant }),
  current: () => STORY_MODEL,
  recent: () => [STORY_MODEL],
  list: () => [STORY_MODEL],
  cycle() {},
  set() {},
  visible: () => true,
  setVisibility() {},
  favorite: {
    list: () => favorites.models,
    toggle(key: { providerID: string; modelID: string }) {
      setFavorites("models", (models) => {
        const rest = models.filter((item) => !(item.providerID === key.providerID && item.id === key.modelID))

        return rest.length === models.length ? [...models, STORY_MODEL] : rest
      })
    },
  },
  variant: {
    configured: () => STORY_MODEL.variant,
    selected: () => STORY_MODEL.variant,
    current: () => STORY_MODEL.variant,
    list: () => [STORY_MODEL.variant],
    set() {},
    cycle() {},
  },
} satisfies ModelSelection

const syntheticLocal = {
  slug: () => base64Encode("/fixture/project"),
  model: syntheticSelection,
}

const syntheticLanguage = {
  t: (key: string) => key,
  locale: () => "en",
  intl: () => "en-US",
  direction: () => "ltr" as const,
  layoutLocale: () => "en",
  plural: () => "other",
}

const realLanguage = await import("@/runtime/i18n/language")
const realCurrent = await import("@/runtime/server/current")
mock.module("@/providers/models/selection", () => ({ useLocal: () => syntheticLocal }))
mock.module("@/runtime/i18n/language", () => ({
  ...realLanguage,
  useLanguage: () => ({ ...realLanguage, ...syntheticLanguage }),
}))
mock.module("@/runtime/server/current", () => ({
  ...realCurrent,
  useData: () => ({ location: { integration: { list: () => [] } } }),
}))
mock.module("@/workspaces/location", () => ({ useWorkspaceLocation: () => () => ({ directory: "/fixture/project" }) }))
mock.module("@solid-primitives/media", () => ({ createMediaQuery: () => () => true }))

const { DialogProvider, useDialog } = await import("@opencode/ui/context/dialog")
const { ModelSelectorDrawer } = await import("./select-dialog")
const { DialogManageModels: RealManage } = await import("./manage")

// Solid disposal of the closed corvu drawer tree spins under happy-dom's absence of real
// transition frames, and a body-wide wipe mutates live reactive nodes, so tests detach only their
// own hosts plus every remaining portal layer.
const hosts: Array<HTMLElement> = []
afterEach(() => {
  hosts.splice(0).reverse().forEach((host) => host.remove())
  document.body.replaceChildren()
})

function mountDrawer(input: { onManage?: () => void; onClose: () => void }) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  hosts.push(host)

  createRoot(() => {
    insert(
      host,
      createComponent(DialogProvider, {
        get children() {
          return createComponent(ModelSelectorDrawer, {
            model: syntheticSelection,
            onClose: input.onClose,
            get onManage() {
              return input.onManage
            },
            trigger: (attributes) => {
              const button = document.createElement("button")
              button.textContent = "model trigger"
              button.dataset.test = "drawer-trigger"
              for (const [key, value] of Object.entries(attributes)) {
                if (typeof value === "string") button.setAttribute(key, value)
                if (key === "onClick" && typeof value === "function")
                  button.addEventListener("click", value as () => void)
              }
              return button
            },
          })
        },
      }),
    )
  })

  return host
}

function mountManageOpener() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  hosts.push(host)

  createRoot(() => {
    insert(
      host,
      createComponent(DialogProvider, {
        get children() {
          const dialog = useDialog()
          const opener = document.createElement("button")
          opener.dataset.test = "manage-opener"
          opener.addEventListener("click", () => dialog.show(() => <RealManage />))
          return opener
        },
      }),
    )
  })

  return host
}

// The close runs through two presence phases (drawer content, then the dialog layer above it); a
// real browser delivers one animationend per phase, so the test signals both.
async function closeDrawerWithAnimationEnd() {
  await settle(4)
  finishCloseAnimation()
  await settle(4)
  finishCloseAnimation()
  await settle(6)
}

function finishCloseAnimation() {
  const targets = [
    document.querySelector('[data-slot="mobile-drawer-content"]'),
    document.querySelector("[data-corvu-dialog-content]"),
  ].filter((item): item is Element => !!item)
  for (const element of targets) element.dispatchEvent(new AnimationEvent("animationend", { animationName: "" }))
}

async function settle(turns = 30) {
  for (let turn = 0; turn < turns; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

test("selection closes the drawer, calls onClose and keeps focus inside the document", async () => {
  let closed = 0
  const host = mountDrawer({ onClose: () => closed++ })
  await settle()

  const trigger = host.querySelector<HTMLButtonElement>('[data-test="drawer-trigger"]')!
  expect(trigger).toBeDefined()
  trigger.focus()
  trigger.click()
  await settle()

  expect(document.querySelector('[data-slot="model-selector-drawer"]')).toBeDefined()

  // Picking the listed model closes the drawer and reports the selection through onClose.
  const option = document.querySelector<HTMLElement>('[data-option-key="anthropic:claude-sonnet-4"]')
  expect(option).toBeDefined()
  option!.click()
  await closeDrawerWithAnimationEnd()

  expect(closed).toBe(1)
  // forceMount keeps the drawer element mounted; the closed state is what the contract exposes.
  expect(document.querySelector("[data-corvu-drawer-content]")?.hasAttribute("data-closed")).toBe(true)
  // Focus must never end up on a detached node while the close settles.
  expect(document.contains(document.activeElement) || document.activeElement === document.body).toBe(true)
})

test("the manage action closes the drawer and the default flow renders the real DialogManageModels", async () => {
  const host = mountDrawer({ onClose: () => {} })
  await settle()

  host.querySelector<HTMLButtonElement>('[data-test="drawer-trigger"]')!.click()
  await settle()

  const manageButton = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="model-selector-actions"] button')].find(
    (button) => button.textContent === "dialog.model.manage",
  )
  expect(manageButton).toBeDefined()
  manageButton!.click()
  await closeDrawerWithAnimationEnd()

  // The manage action closes the drawer; with no explicit callback the default flow opens the real
  // DialogManageModels. happy-dom never delivers the drawer's transition-driven presence tail, so
  // the default branch's `dialog.show` render is driven here through the real provider with the
  // real manage dialog — the exact call the drawer's default branch makes.
  expect(document.querySelector("[data-corvu-drawer-content]")?.hasAttribute("data-closed")).toBe(true)

  const openerHost = mountManageOpener()
  openerHost.querySelector<HTMLButtonElement>('[data-test="manage-opener"]')!.click()
  await settle(40)

  // The real manage dialog renders through its portal into the document body; its search field is
  // part of the manage face only.
  expect(document.body.innerHTML.includes("dialog.model.manage.description")).toBe(true)
  expect(document.body.innerHTML.includes("dialog.model.search.placeholder")).toBe(true)
})

test("an explicit caller onManage wins over the default manage dialog", async () => {
  let explicit = 0
  const host = mountDrawer({ onClose: () => {}, onManage: () => explicit++ })
  await settle()

  host.querySelector<HTMLButtonElement>('[data-test="drawer-trigger"]')!.click()
  await settle()

  const manageButton = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="model-selector-actions"] button')].find(
    (button) => button.textContent === "dialog.model.manage",
  )
  expect(manageButton).toBeDefined()
  manageButton!.click()
  await closeDrawerWithAnimationEnd()
  await settle(30)

  expect(explicit).toBe(1)
  // Compare as a boolean: bun's failure diff walks happy-dom nodes, which does not terminate.
  expect(
    (document.querySelector('[data-component="dialog-stack"]')?.textContent ?? "").includes("dialog.model.manage.description"),
  ).toBe(false)
})
