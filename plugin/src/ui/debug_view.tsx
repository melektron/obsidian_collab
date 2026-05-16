/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
05.05.26, 18:51

View for development and debugging of the plugin 
*/

import { ItemView, WorkspaceLeaf } from "obsidian"
import { createContext, StrictMode, useContext, useEffectEvent, useState } from "react"
import { createRoot, Root } from "react-dom/client"
import { Loader, LucideProvider, Power, Unplug } from "lucide-react"

import { ConnectionProvider, ConnectionState } from "src/connection_provider";
import { useVueRef } from "src/utils/reactivity";

export const VIEW_TYPE_COLLAB_DEBUG_VIEW = "collab-debug-view";


const connectButtonVariants: Record<ConnectionState, {
    text: string,
    icon: React.ReactNode
    classes: string,
}> = {
    [ConnectionState.Disconnected]: {
        text: "Connect",
        icon: <Power style={{ marginInlineEnd: "0.5em" }} />,
        classes: "mod-success",
    },
    [ConnectionState.Connecting]: {
        text: "Connecting...",
        icon: <Loader style={{ marginInlineEnd: "0.5em" }} className="collab-spin-1s" />,
        classes: "mod-success",
    },
    [ConnectionState.Connected]: {
        text: "Disconnect",
        icon: <Unplug style={{ marginInlineEnd: "0.5em" }} />,
        classes: "mod-destructive",
    }
}



function DebugView() {
    const dbg_view = useContext(CollabDebugViewContext);

    const connectBtnCallback = useEffectEvent(() => {
        if (dbg_view.connection.state.value === ConnectionState.Disconnected) {
            dbg_view.connection.attemptConnect()
        } else {
            dbg_view.connection.disconnect()
        }
    });

    const conn_state = useVueRef(dbg_view.connection.state)
    const conn_btn_variant = connectButtonVariants[conn_state]

    return <>
        <div style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
        }}>
            <h4>Collab Debug View</h4>

            <span>Connection status: <span
                style={{
                    color: {
                        [ConnectionState.Disconnected]: "var(--text-error)",
                        [ConnectionState.Connecting]: "var(--text-warning)",
                        [ConnectionState.Connected]: "var(--text-success)",
                    }[conn_state]
                }}
            >
                {ConnectionState[conn_state]}
            </span></span>

            <button onClick={connectBtnCallback} className={`collab-button ${conn_btn_variant.classes}`}>
                {conn_btn_variant.icon}
                {conn_btn_variant.text}
            </button>
        </div>
    </>
}

const CollabDebugViewContext = createContext<CollabDebugView>(null!);
export class CollabDebugView extends ItemView {
    root: Root | null = null;

    constructor(leaf: WorkspaceLeaf, public connection: ConnectionProvider) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_COLLAB_DEBUG_VIEW;
    }

    getDisplayText() {
        return "Collab Debug View";
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.root.render(
            <StrictMode>
                <LucideProvider size={"1em" as unknown as number}>
                    <CollabDebugViewContext value={this}>
                        <DebugView />
                    </CollabDebugViewContext>
                </LucideProvider>
            </StrictMode>
        )
    }

    async onClose() {
        if (this.root)
            this.root.unmount()
        // Nothing to clean up.
    }
}