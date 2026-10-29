import { Show, createComponent } from "solid-js"
import type { Accessor } from "solid-js"
import type { MobileHosts } from "../runtime"
import { HostKeyPrompt } from "./host-key-prompt"

/** Bind the fingerprint and action to one immutable host identity for the prompt lifetime. */
export function KeyedHostKeyPrompt(props: { runtime: MobileHosts; hostId: Accessor<string | undefined>; onClose: () => void }) {
  return createComponent(Show, {
    get when() { return props.hostId() },
    keyed: true,
    get children() {
      return (value: {}) => createComponent(HostKeyPrompt, {
        runtime: props.runtime,
        hostId: value as string,
        onClose: props.onClose,
      })
    },
  })
}
