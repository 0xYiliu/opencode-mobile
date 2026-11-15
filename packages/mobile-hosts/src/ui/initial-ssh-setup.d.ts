import type { MobileHosts } from "../runtime";
/** Initial-screen SSH onboarding. Ownership is claimed before registry publication. */
export declare function InitialSshSetup(props: {
    runtime: MobileHosts;
    active: () => boolean;
}): import("solid-js").JSX.Element;
