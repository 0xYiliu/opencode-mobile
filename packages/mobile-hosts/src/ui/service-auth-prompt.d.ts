import type { Accessor } from "solid-js";
import type { MobileHosts } from "../runtime";
type ServiceAuthRuntime = Pick<MobileHosts, "locale" | "serviceAuthRequiredOf" | "cancelServiceAgain" | "checkServiceAgain" | "disconnect">;
/** Session-only OpenCode service authentication; separate from the SSH credential. */
export declare function ServiceAuthPrompt(props: {
    runtime: ServiceAuthRuntime;
    hostId: Accessor<string>;
    active?: Accessor<boolean>;
    showDisconnect?: boolean;
}): () => (Node & {
    [key: string]: any;
}) | (Node & {
    [key: string]: any;
})[];
export {};
