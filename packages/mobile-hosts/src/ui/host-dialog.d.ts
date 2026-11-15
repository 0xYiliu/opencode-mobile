import type { MobileHosts } from "../runtime";
export declare function HostDialog(props: {
    runtime: MobileHosts;
    hostId?: string;
    onClose: () => void;
    onCreated?: (id: string, generation?: number) => void;
    beforeCreate?: () => number | void;
}): import("solid-js").JSX.Element;
