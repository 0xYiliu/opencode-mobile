import type { ServiceOsFamily } from "./commands";
export type OsFamily = ServiceOsFamily | "unknown";
export type InstallSource = "curl" | "npm" | "brew" | "pacman" | "winget" | "unknown";
export type ServiceStatus = {
    kind: "unknown";
} | {
    kind: "not-installed";
} | {
    kind: "installed-stopped";
    version?: string;
    installPath?: string;
    source?: InstallSource;
} | {
    kind: "running";
    version: string;
    evidence: "api" | "exec" | "both";
    listenPort?: number;
} | {
    kind: "running-incompatible";
    version: string;
} | {
    kind: "unsupported-os";
    os: string;
};
/** Memory-only discovery snapshot (never persisted — a stale status would lie). */
export type ServiceSnapshot = {
    status: ServiceStatus;
    /** Freshness bound (decision 0004 N3): the flow re-discovery guard reads this. */
    checkedAt: number;
    /** Acceptance-4 evidence bit: the service answered after a client disconnect+reconnect. */
    survivedDisconnect?: boolean;
    /** Honest limitation list (i18n keys), rendered verbatim by the panel. */
    limitations: readonly string[];
    /** Exec-face supplement evidence (path/source/process/port), kept beside the status. */
    execDetail?: {
        binaryPath?: string;
        source?: InstallSource;
        processAlive?: boolean;
        listenPort?: number;
    };
    /** Merge conflict notes (API-vs-exec disagreements; the API wins, the note stays). */
    notes?: string[];
};
export declare const LIMITATION_KEYS: {
    readonly pgrep: "svcops.limitation.pgrep";
    readonly direct: "svcops.limitation.direct";
    readonly windowsShell: "svcops.limitation.windowsShell";
    readonly windowsDetach: "svcops.limitation.windowsDetach";
    readonly listenerWithoutApi: "svcops.limitation.listenerWithoutApi";
};
/** The limitation set for one discovery context (pure; panel renders the list verbatim). */
export declare function limitationKeysFor(input: {
    hostKind: "ssh" | "direct";
    os: OsFamily;
}): string[];
/**
 * OS family from the detection pair outputs. POSIX `uname -s` answers Linux/Darwin;
 * Windows `ver` answers "Microsoft Windows ...". Anything else (including an
 * unparseable shape from a non-cmd DefaultShell) is honest "unknown" — never a guess.
 */
export declare function parseOsFamily(posixOutput: string | undefined, verOutput: string | undefined): OsFamily;
/** A loose unsupported-OS reporter: the raw OS string when it is known but not supported. */
export declare function unsupportedOsName(posixOutput: string | undefined, verOutput: string | undefined): string | undefined;
/**
 * Binary lookup (`command -v opencode` / `where opencode`). Exit 0 + a first line that
 * looks like a path yields the path; exit != 0 (documented: not found) yields
 * "binary-missing" evidence; any other shape yields no evidence.
 */
export declare function parseBinaryLookup(output: string | undefined, exitCode: number): {
    found: true;
    path: string;
} | {
    found: false;
    reason: "missing" | "no-evidence";
};
/**
 * `opencode --version` output: extract a MAJOR.MINOR.PATCH token (leading v tolerated).
 * No token -> no evidence (the version is never invented from prose).
 */
export declare function parseVersionOutput(output: string | undefined): string | undefined;
/**
 * Process probe (N5-limited): pgrep exit 0 = pids printed (alive), exit 1 = none;
 * tasklist CSV containing the image name = alive. Only ever SUPPLEMENTARY evidence.
 */
export declare function parseProcessProbe(kind: "posix" | "windows", output: string | undefined, exitCode: number): boolean | undefined;
/**
 * Port probe: `ss -tln` rows (`LISTEN ... :<port> `), `lsof -nP -iTCP:<port>
 * -sTCP:LISTEN` rows, `netstat -ano | findstr :<port>` rows with LISTENING.
 */
export declare function parsePortProbe(kind: "ss" | "lsof" | "netstat", output: string | undefined, port: number): number | undefined;
/**
 * Install-source inference from a binary path (path-prefix matching, honest default
 * "unknown"). POSIX: ~/.opencode/bin -> curl; /opt/homebrew or /usr/local -> brew
 * (brew prefix first on darwin per the plan matrix); node/npm shapes -> npm. Windows:
 * %USERPROFILE%\.opencode\bin -> curl; node_modules -> npm; WindowsApps/winget -> winget.
 */
export declare function inferInstallSource(path: string, os: OsFamily): InstallSource;
export type ApiServiceEvidence = {
    reachable: boolean;
    version?: string;
};
export type ExecServiceEvidence = {
    os?: OsFamily;
    binaryPath?: string;
    /** The binary probe RAN and answered "missing" (exit 1) — the not-installed evidence. */
    binaryMissing?: boolean;
    source?: InstallSource;
    execVersion?: string;
    processAlive?: boolean;
    listenPort?: number;
};
/**
 * Merge API and exec evidence into a ServiceStatus. The API evidence is authoritative
 * for "running" and the version; a conflict (exec version differs from API version) is
 * recorded as a note and the API value wins. The compatibility predicate is the shared
 * health-wrapper rule (major==2 && minor>=1) — the same one the connection flow uses.
 */
export declare function mergeServiceEvidence(input: {
    api?: ApiServiceEvidence;
    exec?: ExecServiceEvidence;
}): {
    status: ServiceStatus;
    notes: string[];
};
