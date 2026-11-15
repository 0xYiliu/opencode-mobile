export type ExtensionCapability = "web" | "desktop-host" | "excluded";
/** First-party static capability mapping (probe group 7 locks all three sets). All sets are
 * consulted: the desktop-host blacklist decides the presented-not-toggleable rows, the
 * web-active whitelist documents the toggleable eight, the excluded table carries the
 * product-scope exclusions. An id in NEITHER set (a future builtin the table has not met
 * yet) classifies "web" — the renderer-side default — so the mapping stays
 * conservative-by-default exactly as shipped. */
export declare function capabilityOf(id: string): ExtensionCapability;
export interface ExtensionManagerProps {
    /** The window's filtered definition list (host.definitions() — wsl already os-filtered;
     * the excluded table below presents wsl statically, N12). */
    definitions: readonly {
        readonly id: string;
    }[];
    /** The host's live status reader (host.state.status[id]). */
    statusOf: (id: string) => string | undefined;
    /** The host's last-failure reader (host.state.failures[id]?.error). */
    failureOf: (id: string) => string | undefined;
    /** The renderer-side reload action (host.reload(id)). */
    onReload: (id: string) => void;
}
export declare function ExtensionManager(props: ExtensionManagerProps): import("solid-js").JSX.Element;
