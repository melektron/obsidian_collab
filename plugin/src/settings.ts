/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 19:13

Plugin Settings
*/


import { AbstractInputSuggest, addIcon, App, FuzzyMatch, PluginSettingTab, prepareFuzzySearch, SearchComponent, setIcon, SettingGroup, setTooltip, sortSearchResults, SuggestModal } from "obsidian";
import { effect, Reactive, reactive, Ref, ref, toRaw, watch } from "@vue/reactivity";
import z from "zod";
import Sortable from "sortablejs";
import type CollabPlugin from "./main"
import { WarningNotice } from "./ui/static_components";
import { FileInputSuggest } from "./utils/file_suggest";
import { debouncedWatch } from "./utils/reactivity";


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
    #data: Reactive<CollabSettings> | null = null
    
    // Provides access to a mutable settings object.
    // The mutable object is reactive and property access 
    // can be tracked with `effect()` or `watch()`
    get data(): CollabSettings { 
        if (this.#data === null)
            throw new Error("Settings accessed before initialization")
        return this.#data
    }


    constructor(
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
            console.log(error)

            if (error instanceof z.ZodError) {
                new WarningNotice("Collab configuration is invalid, reverting to defaults. See settings for details and a backup.")
                this.parsingIssues = error.issues
                settings.invalidSettingsBackup = rawPluginData
            } else {
                new WarningNotice("Failed to load collab configuration, reverting to defaults. See settings for details.")
                this.parsingIssues = `${error}`
            }
        }

        // stores the settings as a reactive ref.
        // Note: We don't use reactive because that doesn't allow reactively reloading
        // the entire settings object
        this.#data = reactive(settings);

        // immediately save the settings in case anything was changed/cleaned up during loading
        await this.save()

        // autosave settings when settings are mutated
        debouncedWatch(this.#data, async () => {
            console.log("settings changed, saving")
            this.save()
        })
    }

    // Reloads the settings from disk in a reactive manner
    async reload() {
        // reload only works after initial load.
        if (this.#data === null) return;

        try {
            // try to reload the settings
            let newSettings = collabSettingsValidator.parse(await this.plugin.loadData())
            // delete removed keys (only relevant if there are any optional settings)
            Object.keys(this.#data).forEach(key => {
                if (this.#data === null) return;
                if (!(key in newSettings)) delete (this.#data as any)[key]
            })
            // copy properties while keeping original reactive proxy
            Object.assign(this.#data, newSettings)
        } catch (error) {
            // if it fails, just do nothing. In this case we keep the current settings
            console.error("Collab settings reload failed: ", error)
            new WarningNotice("Collab configuration is invalid, cannot reload. See console for details.").hideAfter(3)
        }
    }

    // Writes the settings to disk using obsidian's builtin data API.
    // When mutating settings data, this happens automatically, no need
    // for a separate call.
    async save() {
        await this.plugin.saveData(toRaw(this.data));
    }
}

type MountPointDefinition = CollabSettings["mountPoints"][0]

export class CollabSettingTab extends PluginSettingTab {

    constructor(app: App, plugin: CollabPlugin, private settings: SettingsManager) {
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
                    .onChange(async (value) => {
                        this.settings.data.serverUrl = value;
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
                        .allowNullSelection((ni) => {console.log("selected nonexistent item:", ni)})
                })
            )
        

        // mount points

        let mountpointSearch: SearchComponent
        const mountpointGroup = new SettingGroup(containerEl)
            .setHeading("Shared notes")
            .addSearch(sc => {
                mountpointSearch = sc;
                sc.setPlaceholder("Filter")
                sc.onChange(value => {
                    // repaint mount points with new filter
                    this.displayMountpoints(mountpointContainer, value)
                })
                sc.inputEl.addEventListener("ended", _ => {
                    console.log("Submitted:", sc.getValue())
                })
            })
            .addExtraButton(eb => eb
                .setIcon("plus")
                .setTooltip("")
                .onClick(() => {
                    // TODO: this is for testing, eventually show dialog here
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
        let mountPoints: MountPointDefinition[]
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
                        this.settings.data.mountPoints.remove(mountpoint)
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
            new Sortable(container, {
                handle: ".mobile-option-setting-drag-icon",
                ghostClass: "drag-ghost-hidden",
                dragClass: "collab-mountpoint-drag-ghost",
                onEnd: e => {
                    if (e.oldIndex === e.newIndex || e.oldIndex === undefined || e.newIndex === undefined) return;
                    const movedEntry = this.settings.data.mountPoints[e.oldIndex]
                    this.settings.data.mountPoints.remove(movedEntry)
                    this.settings.data.mountPoints.splice(e.newIndex, 0, movedEntry)
                    // no need to repaint here as Sortable already adjusted the UI
                }
            })
        }
    }
}