import type { Accessor } from "solid-js";
import type { MobileHosts } from "../runtime";
/** Bind the fingerprint and action to one immutable host identity for the prompt lifetime. */
export declare function KeyedHostKeyPrompt(props: {
    runtime: MobileHosts;
    hostId: Accessor<string | undefined>;
    onClose: () => void;
}): import("solid-js").JSX.Element;
