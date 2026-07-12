/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 19:13

Plugin Settings
*/


import { App, debounce, FuzzyMatch, PluginSettingTab, prepareFuzzySearch, setIcon, SettingGroup, setTooltip, sortSearchResults } from "obsidian";
import z from "zod";
import Sortable from "sortablejs";
import type CollabPlugin from "./main";
import type { ReadonlyDeep } from "type-fest";
import { WarningNotice } from "./ui/static_components";
import { FileInputSuggest } from "./utils/file_suggest";
import { EventChannel } from "./utils/event_channel";
import { createContext } from "react";
import { Logger } from "./utils/logger";


const collabSettingsValidator = z.object({
    serverUrl: z.url().default("ws://localhost:1234/collab"),
    mountPoints: z.array(z.object({
        path: z.string(), 
        doc: z.uuid(),
    })).default([]),
    invalidSettingsBackup: z.any().default(null)
})
export type CollabSettings = z.infer<typeof collabSettingsValidator>;


export class SettingsManager {
    public parsingIssues: z.core.$ZodIssue[] | string| null = null
    #data: CollabSettings | null = null
    public readonly updatedEvent: EventChannel<ReadonlyDeep<CollabSettings>> = new EventChannel()
    
    // Provides access to the settings data. This must not be
    // mutated directly. Use `update()` to mutate the settings.
    // Use `updatedEvent.on()` to observe changes to the object.
    get data(): ReadonlyDeep<CollabSettings> { 
        if (this.#data === null)
            throw new Error("Settings accessed before initialization")
        return this.#data
    }


    constructor(
        private log: Logger,
        private plugin: CollabPlugin
    ) {}

    // Loads the settings from disk using obsidian's builtin data API.
    // This must be called once before ever accessing the settings.
    // To reload settings later, `reload()` is used.
    async load() {
        let settings: CollabSettings
        let rawPluginData
        try {
            rawPluginData = await this.plugin.loadData()
            settings = collabSettingsValidator.parse(rawPluginData)
        } catch (error) {
            // load defaults 
            settings = collabSettingsValidator.parse({})
            this.log.error("loading failed:", error)

            if (error instanceof z.ZodError) {
                new WarningNotice("Collab configuration is invalid, reverting to defaults. See settings for details and a backup.")
                this.parsingIssues = error.issues
                settings.invalidSettingsBackup = rawPluginData
            } else {
                new WarningNotice("Failed to load collab configuration, reverting to defaults. See settings for details.")
                this.parsingIssues = `${error}`
            }
        }

        // stores the settings. This is no longer
        // reactive as deep reactivity proved to be unreliable.
        this.#data = settings;

        // immediately save the settings in case anything was changed/cleaned up during loading
        await this.save()

        //
    }

    // Reloads the settings from disk in a reactive manner
    async reload() {
        // reload only works after initial load.
        if (this.#data === null) return;

        try {
            // try to reload the settings
            this.#data = collabSettingsValidator.parse(await this.plugin.loadData())
            // inform subscribers but don't save, as we just reloaded.
            this.updatedEvent.emit(this.data)
        } catch (error) {
            // if it fails, just do nothing. In this case we keep the current settings
            this.log.error("reload failed: ", error)
            new WarningNotice("Collab configuration is invalid, cannot reload. See console for details.").hideAfter(3)
        }
    }

    /**
     * Calls `updater` with a mutable reference
     * to the settings object, allowing changes to be made.
     * After `updater` returns, all update subscribers are
     * notified and the changes are saved to disk.
     * 
     * @note It is advised to batch related updates in a single
     * call ("atomic") to avoid event spam or 
     * 
     * @param updater Callback to modify settings. Must not be
     * async, as changes have to be applied immediately before
     * returning. Async functions would break the "atomic" guarantee.
     */
    update(updater: (cfg: CollabSettings) => any) {
        if (this.#data === null)
            throw new Error("Settings updated before initialization")
        // invoke updater with mutable settings
        updater(this.#data)
        // inform subscribers and save changes
        this.updatedEvent.emit(this.data)
        this.log.info("settings changed, saving")
        this.save()
    }

    // Writes the settings to disk using obsidian's builtin data API.
    // When mutating settings data with `update()` this happens automatically, 
    // no need for a separate call.
    async save() {
        await this.plugin.saveData(this.data);
    }
}
// Context to access settings from react hooks
export const SettingsContext = createContext<SettingsManager>(null!);

type MountPointDefinition = ReadonlyDeep<CollabSettings["mountPoints"][0]>

export class CollabSettingTab extends PluginSettingTab {

    constructor(
        private readonly log: Logger,
        app: App, 
        plugin: CollabPlugin, 
        private settings: SettingsManager) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();


        // basic global settings

        new SettingGroup(containerEl)
            .addSetting(setting => setting
                .setName("Server URL")
                .setDesc("URL of the collab server to connect to")
                .addText(text => text
                    .setPlaceholder("wss://collab.ppc.social/collab")
                    .setValue(this.settings.data.serverUrl)
                    .onChange((value) => {
                        this.settings.update(cfg => {
                            cfg.serverUrl = value
                        });
                    }))
            )
            .addSetting(setting => setting
                .setName("A folder")
                .setDesc("A description")
                .addText(text => {
                    text
                        .setPlaceholder("E.g. folder1/folder2")
                    new FileInputSuggest(this.app, text.inputEl)
                        .onlyFolders()
                        .onlyFiles()
                        .allowNullSelection((ni) => {this.log.experiment("selected nonexistent item:", ni)})
                })
            )
        

        // mount points

        const mountpointGroup = new SettingGroup(containerEl)
            .setHeading("Shared notes")
            .addSearch(sc => {
                sc.setPlaceholder("Filter")
                sc.onChange(value => {
                    // repaint mount points with new filter
                    this.displayMountpoints(mountpointContainer, value)
                })
            })
            .addExtraButton(eb => eb
                .setIcon("plus")
                .setTooltip("Add shared note")
                .onClick(() => {
                    // TODO: Show modal for creating new mountpoint
                    //this.settings.data.mountPoints.push({
                    //    path: mountpointSearch.getValue(),
                    //    doc: "00000000-0000-4000-8000-000000000001"
                    //})
                    //mountpointSearch.setValue("")
                    //// repaint
                    //this.display()
                })
            )
            .addExtraButton(eb => eb
                .setIcon("link")
                .setTooltip("Import share link")
            )
        const mountpointContainer = mountpointGroup.listEl.createDiv("collab-mountpoints-container")
        this.displayMountpoints(mountpointContainer)
    }

    /**
     * Displays the list of mount points. The list can optionally
     * be fuzzy-searched with the `query` string. Empty string implies
     * no filtering. When the list is not filtered, the elements are 
     * re-orderable and are displayed in the configured order.
     * When the list is filtered, reordering is disabled and the order
     * depends on matching score.
     * @param container container element to render into
     * @param query optional search query to filter by
     */
    private displayMountpoints(container: HTMLDivElement, query: string = "") {
        // make sure the container is empty before
        container.empty()
        
        const isFiltered = query.length > 0
        let mountPoints: ReadonlyDeep<MountPointDefinition[]>
        if (isFiltered) {
            // fuzzy search if a search query is passed
            const search = prepareFuzzySearch(query)
            const searchResults: FuzzyMatch<MountPointDefinition>[] = []
    
            for (const item of this.settings.data.mountPoints) {
                const result = search(item.path)
                if (result !== null) {
                    searchResults.push({
                        item: item,
                        match: result
                    })
                }
            }
            sortSearchResults(searchResults)
            mountPoints = searchResults.map(res => res.item)
        } else {
            // otherwise just show all rows
            mountPoints = this.settings.data.mountPoints
        }

        for (const mountpoint of mountPoints) {
            // we are reusing this logic and the CSS classes from the official 
            // command pallet plugin to create our list
            container.createDiv({
                cls: ["mobile-option-setting-item", "collab-mountpoint-entry"]
            }, div => {
                div.createDiv("collab-mountpoint-paths-container", div => {
                    div.createDiv("collab-mountpoint-path", div => {
                        setIcon(div, "file")
                        div.createSpan({
                            text: mountpoint.path
                        })
                    })
                    div.createDiv("collab-mountpoint-path", div => {
                        setIcon(div, "cloudy")
                        div.createEl("code", {
                            text: mountpoint.doc
                        })
                    })
                })
                div.createDiv("clickable-icon", t => {
                    setIcon(t, "lucide-x")
                    setTooltip(t, "Delete Mountpoint")
                    t.onClickEvent(() => {
                        this.settings.update(cfg => {
                            cfg.mountPoints.remove(mountpoint)
                        })
                        // after removing a mountpoint we repaint only the 
                        // mountpoint list, so that the search entry state is retained
                        this.displayMountpoints(container, query)
                    })
                })
                if (!isFiltered) {
                    // show drag handles only in the not filtered, natively ordered view
                    div.createDiv("clickable-icon mobile-option-setting-drag-icon", n => {
                        setIcon(n, "lucide-menu")
                        setTooltip(n, "Drag to rearrange")
                    })
                }
            })
        }

        // only create reordering infrastructure
        if (!isFiltered) {
            // for reordering we add new logic based on sortablejs, as obsidian's logic
            // is not accessible to plugins. (This is also more responsive)
            // TODO: This seems to have a problem with running on iOS (drag ghost is not properly visible), fix that
            new Sortable(container, {
                handle: ".mobile-option-setting-drag-icon",
                ghostClass: "drag-ghost-hidden",
                dragClass: "collab-mountpoint-drag-ghost",
                onEnd: e => {
                    if (e.oldIndex === e.newIndex || e.oldIndex === undefined || e.newIndex === undefined) return;
                    const oldIndex = e.oldIndex, newIndex = e.newIndex
                    this.settings.update(cfg => {
                        const [movedEntry] = cfg.mountPoints.splice(oldIndex, 1)
                        cfg.mountPoints.splice(newIndex, 0, movedEntry)
                    })
                    // no need to repaint here as Sortable already adjusted the UI
                }
            })
        }
    }
}