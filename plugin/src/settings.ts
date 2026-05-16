/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 19:13

Plugin Settings
*/


import { App, PluginSettingTab, Setting } from "obsidian";
import type CollabPlugin from "./main"


export interface CollabSettings {
    serverUrl: string;
}

export const DEFAULT_SETTINGS: CollabSettings = {
    serverUrl: "ws://localhost:1234/collab"
}


export class CollabSettingTab extends PluginSettingTab {
    plugin: CollabPlugin;

    constructor(app: App, plugin: CollabPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Server URL")
            .setDesc("URL to the collab server to connect to")
            .addText(text => text
                .setPlaceholder("wss://collab.ppc.social/collab")
                .setValue(this.plugin.settings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        // TODO: maybe use this in the future if more complicated settings are needed:
        // https://github.com/Ssentiago/react-obsidian-setting
    }
}