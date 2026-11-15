import type { MobileHosts } from "../runtime";
/** Snapshot one host ID and the fingerprint presented for that exact ID. */
export declare function bindHostKeyPrompt(runtime: MobileHosts, hostId: string): {
    hostId: string;
    hostName: string;
    target: string;
    sshPort: number;
    servicePort: number;
    fingerprint: string;
    confirm: () => void;
    reject: () => void;
};
