import { type SshBridgeTransport } from "./bridge";
import type { HostKeyVerifier } from "../ports";
export declare function createSshHostKeyVerifier(transport: SshBridgeTransport): HostKeyVerifier;
/**
 * Remove a host's stored key through the bridge (the changed-key recovery path: an
 * explicit user confirmation above this call, never an automatic overwrite — decision
 * 0003 §3.3). Idempotent native-side.
 */
export declare function removeSshHostKey(transport: SshBridgeTransport, target: string): Promise<void>;
