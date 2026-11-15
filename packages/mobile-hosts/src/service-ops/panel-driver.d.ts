import type { ServiceOsFamily } from "./commands";
import type { OsFamily, ServiceSnapshot } from "./discovery";
import type { ServiceOpsErrorCode } from "./errors";
import type { ServiceFlowContext, ServiceFlowState } from "./flow";
import type { ServiceOpsExecOutcome } from "./port";
import type { MessageKey } from "../i18n";
export type PlanStep = {
    templateId: string;
    params: Record<string, string>;
};
export type PreviewAction = "start" | "install" | "install-curl" | "upgrade" | "stop" | "replace";
export type Preview = {
    action: PreviewAction;
    commands: string[];
    plan: PlanStep[];
    /** The rollback step offered on failure (replace/backup flows only; never fabricated). */
    rollback?: PlanStep;
    /** Defined when the post-install version re-check decides success (install faces). */
    verifyVersion?: string;
};
export type PanelResult = {
    kind: "success" | "partial" | "failed";
    code?: ServiceOpsErrorCode;
    stderrTail?: string;
    lines?: string[];
};
export interface PanelDriverDeps {
    /** The SSH username from the target's user@ segment (B2; absent when the target has none). */
    sshUser(): string | undefined;
    servicePort(): number;
    fingerprint(): string | undefined;
    resolveCredential(): Promise<string | undefined>;
    /** One whitelisted exec through the fourth bridge (the panel fills host/port/transport). */
    execRequest(input: {
        username?: string;
        templateId: string;
        params: Record<string, string>;
        os: ServiceOsFamily;
        credential?: string;
        pinnedFingerprint?: string;
    }): Promise<ServiceOpsExecOutcome>;
    /** Best-effort local cancel of the in-flight exec. */
    cancelExec(): Promise<void>;
    /** The API face: the connection state machine says the service answered (host ready). */
    apiReachable(): boolean;
    /** Injectable clock (N3 freshness guard determinism). */
    now(): number;
    translate(key: MessageKey): string;
    onFlow(state: ServiceFlowState, ctx: ServiceFlowContext): void;
    onSnapshot(snapshot: ServiceSnapshot | undefined): void;
    onDiscoveredOs(os: OsFamily): void;
    onPreview(preview: Preview | undefined): void;
    onBusy(busy: boolean): void;
    onResult(result: PanelResult | undefined): void;
    onInlineError(message: string | undefined): void;
    onSurvived(survived: "yes" | "no" | "unknown" | undefined): void;
    onReauthChecked(checked: boolean): void;
}
export declare function createPanelDriver(deps: PanelDriverDeps): {
    discover: () => Promise<void>;
    openPreview: (action: Preview["action"], versionInput: string, methodInput: string) => void;
    executePreview: (acknowledged: boolean) => Promise<void>;
    requestCancel: () => Promise<void>;
    cancelPreview: () => void;
    rollback: () => void;
    notifyConnectionLost: () => void;
    notifyReadyArrival: (afterAuth: boolean) => Promise<void>;
    getFlow: () => {
        state: ServiceFlowState;
        ctx: {
            action?: string;
            checkedAt?: number;
            rollbackAvailable?: boolean;
            cancelUncertain?: boolean;
            reason?: ServiceOpsErrorCode;
        };
    };
    getSnapshot: () => ServiceSnapshot | undefined;
    getPreview: () => Preview | undefined;
    isBusy: () => boolean;
};
