import { type SshBridgeTransport } from "./bridge";
import type { HostTransport } from "../ports";
export declare function createSshHostTransport(transport: SshBridgeTransport): HostTransport;
