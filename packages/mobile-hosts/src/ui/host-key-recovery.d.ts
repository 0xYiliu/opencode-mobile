import type { MobileHosts } from "../runtime";
/** Two-step danger confirmation before removing a changed host's stored trust. */
export declare function HostKeyRecovery(props: {
    runtime: MobileHosts;
    hostId: string;
}): import("solid-js").JSX.Element;
