/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
05.05.26, 18:51

View for development and debugging of the plugin 
*/

import { ItemView, WorkspaceLeaf } from "obsidian"
import { ChangeEvent, createContext, StrictMode, useContext, useEffect, useEffectEvent, useState } from "react"
import { createRoot, Root } from "react-dom/client"
import { Loader, LucideProvider, Power, Unplug } from "lucide-react"

import { Connection, ConnectionState } from "src/networking/connection";
import { useSetting, useVueRef } from "src/utils/reactivity";
import { SettingsContext, SettingsManager } from "src/settings";
import { toRefs } from "@vue/reactivity";
import { Logger } from "src/utils/logger";

export const VIEW_TYPE_COLLAB_DEBUG_VIEW = "collab-debug-view";


const connectButtonVariants: Record<ConnectionState, {
    text: string,
    icon: React.ReactNode | ""
    classes: string,
}> = {
    [ConnectionState.Disconnected]: {
        text: "Connect",
        icon: <Power style={{ marginInlineEnd: "0.5em" }} />,
        classes: "mod-success",
    },
    [ConnectionState.Connecting]: {
        text: "Connecting...",
        icon: "",
        classes: "mod-success mod-loading",
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

    const getDocBtnCallback = useEffectEvent(async () => {
        const resp = await dbg_view.connection.getDocRpc.call({
            doc_id: "00000000-0000-4000-8000-000000000002"
        })

        dbg_view.log.experiment(resp)
    })

    const reloadSettingsCallback = useEffectEvent(async () => {
        dbg_view.settings.reload()
    })

    const collab_url = useSetting((cfg) => cfg.serverUrl);
    const mountpoints = useSetting((cfg) => cfg.mountPoints);

    const settingsTestInputChangeCallback = useEffectEvent(async (e: ChangeEvent<HTMLInputElement>) => {
    })

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

            <button onClick={getDocBtnCallback} className={`collab-button`}>
                GetDoc
            </button>

            <button onClick={reloadSettingsCallback} className={`collab-button`}>
                Reload Settings
            </button>
            
            <input type="text" onChange={settingsTestInputChangeCallback}></input>

            {collab_url}
            
            <ul>
                { mountpoints.map(mp => <li key={mp.path} >{mp.path}</li>) }
            </ul>
        </div>
    </>
}

const CollabDebugViewContext = createContext<CollabDebugView>(null!);
export class CollabDebugView extends ItemView {
    root: Root | null = null
    icon: string = "bug"

    constructor(
        leaf: WorkspaceLeaf, 
        public readonly log: Logger,
        public settings: SettingsManager, 
        public connection: Connection
    ) {
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
                    <SettingsContext value={this.settings}>
                        <CollabDebugViewContext value={this}>
                            <DebugView />
                        </CollabDebugViewContext>
                    </SettingsContext>
                </LucideProvider>
            </StrictMode>
        )
    }

    async onClose() {
        if (this.root)
            this.root.unmount()
    }
}