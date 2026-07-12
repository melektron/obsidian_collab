/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 18:58

*/

import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { EditorState, Extension } from "@codemirror/state";
import { h } from "dom-chef" ;
import * as random from "lib0/random";
import * as Y from "yjs";

import { SettingsManager, CollabSettingTab } from "./settings";
import { DebugNotice, ErrorNotice, InfoNotice, WarningNotice } from "./ui/static_components";
import { DocManager, docManagerFacet } from "./doc_manager";
import { editableCompartment, collabSyncPlugin } from "./editor/collab_sync_plugin";
import { CollabDebugView, VIEW_TYPE_COLLAB_DEBUG_VIEW } from "./ui/debug_view";
import { Connection } from "./networking/connection";
import { ChoiceModal, CtaModal } from "./ui/modals";
import { Logger, loggerFacet } from "./utils/logger";


// Remember to rename these classes and interfaces!


export default class ObsidianCollabPlugin extends Plugin {
    lastEditor: Editor | undefined;
    editorExtensions: Extension[] = [];
    log!: Logger;
    settings!: SettingsManager;
    connection!: Connection;
    docManager!: DocManager;

    async onload() {
        this.log = new Logger("collab")

        this.log.info("Collab loading")
        let loadingNotice = new InfoNotice("Collab loading...");

        // load settings from disk and initialize settings UI
        this.settings = new SettingsManager(
            this.log.child("settings"),
            this
        )
        await this.settings.load()
        this.addSettingTab(new CollabSettingTab(
            this.log.child("settings-tab"),
            this.app, 
            this, 
            this.settings
        ))
        
        // application components
        this.connection = new Connection(
            this.log.child("conn"),
            this.settings.data.serverUrl
        ) // TODO: make handle this differently to react to settings changes
        this.docManager = new DocManager(
            this.log.child("docmgr"),
            this.app, 
            this.settings, 
            this.connection
        )

        // load debug view
        this.registerView(
            VIEW_TYPE_COLLAB_DEBUG_VIEW,
            (leaf) => new CollabDebugView(
                leaf, 
                this.log.child("dbg-view"), 
                this.settings, 
                this.connection
            )
        )
        this.addCommand({
            id: "show-debug-view",
            name: "Show the Debug View",
            callback: async () => {
                this.activateDebugView();
            }
        });

        // register editor extensions to integrate with codemirror
        this.editorExtensions = [
            //debugViewPlugin,
            //debugStateField,
            // provide access to the required subsystems to all editors
            docManagerFacet.of(this.docManager),
            loggerFacet.of(this.log.child("editor")),
            // add collab sync plugin to all editors
            collabSyncPlugin,
            // make all editors readonly by default, only enabling
            // editing if collab is either fully initialized or determined
            // to not be active for a certain editor.
            editableCompartment.of([
                EditorState.readOnly.of(true)
            ])
            //yCollab(ytext, undefined, { undoManager: false })
        ];
        this.registerEditorExtension(this.editorExtensions);

        // Add collab file menu options
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                // for now, we only support sharing markdown files.
                if (file instanceof TFolder) {
                    return
                } else if (file instanceof TFile) {
                    if (file.extension != "md") return;
                    menu.addItem((item) => {
                        item
                            .setTitle("Share with Collab")
                            .setIcon("document")
                            .onClick(async () => {
                                // TODO: implement the functionality to add to mountpoint index and save that in config.
                                new Notice(file.path);
                            });
                    });
                    // TODO: Add menu items to stop sharing and so on, possibly with modal to ask whether to also delete
                    // (should delete from server also be possible? that wouldn't be properly authenticated atm... meaning
                    // everyone could delete... probably a feature for later once auth works)
                }
                
            })    
        );
        // TODO: maybe also add the same actions to the editor menu??
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, info) => {
                this.log.debug("editor menu", info)
            })    
        );

        /**
         * == Experimentation Section ==
         */

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText("Status Bar Text");

        // debug commands
        this.addCommand({
            id: "trigger-normal-notice",
            name: "Trigger Normal Notice",
            callback: () => {
                new Notice("Test notice triggered by command");
            }
        });
        this.addCommand({
            id: "trigger-error-notice",
            name: "Trigger Error Notice",
            callback: () => {
                let notice = new ErrorNotice("Test Error notice triggered by command with edit and hide");
                setTimeout(() => {notice.appendMessage(" Appendix").hideAfter(1)}, 3000)
            }
        });
        this.addCommand({
            id: "trigger-warning-notice",
            name: "Trigger Warning Notice",
            callback: () => {
                new WarningNotice("Test Warning notice triggered by command");
            }
        });
        this.addCommand({
            id: "trigger-info-notice",
            name: "Trigger Info Notice",
            callback: () => {
                new InfoNotice("Test Info notice triggered by command");
            }
        });
        this.addCommand({
            id: "trigger-debug-notice",
            name: "Trigger Debug Notice",
            callback: () => {
                new DebugNotice("Test Debug notice triggered by command");
            }
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: "sample-editor-command",
            name: "Sample editor command",
            editorCallback: (editor: Editor, view) => {
                this.log.experiment(editor.getSelection());
                editor.replaceSelection("Sample Editor Command2");
            }
        });
        this.addCommand({
            id: "sp",
            name: "Open sample modal (simple)",
            callback: () => {
                new SampleModal(this.app).open();
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: "open-sample-modal-complex",
            name: "Open CtaModal (complex)",
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we"re simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new CtaModal(this.app)
                            .setTitle("Are you sure?")
                            .setContent("This action is destructive. Do you really want to do it?")
                            .addCheckbox("Don't show again", (ev) => {
                                const target = ev.target as HTMLInputElement
                                this.log.experiment("don't show again called", target.checked)
                            })
                            .setCta("mod-warning", "Yes")
                            .prompt()
                            .then((v) => {
                                new Notice(`Cta result: ${v}`)
                            })
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        });
        this.addCommand({
            id: "sp",
            name: "Open ChoiceModal",
            callback: async () => {
                const result = await new ChoiceModal<1 | 2 | 3>(this.app)
                    .setTitle("Choose wisely")
                    .setContent("You have multiple options, which one do you want?")
                    .addOption("", "Option 1", 1)
                    .addOption("mod-cta", "Option 2", 2, true)
                    .addOption("", "Option 3", 3)
                    .prompt()
                new DebugNotice(`You chose: ${result}`)
            }
        });


        // If the plugin hooks up any global DOM events (on parts of the app that doesn"t belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        //this.registerDomEvent(document, "click", (evt: MouseEvent) => {
        //	this.log.experiment("click", evt);
        //});

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        //this.registerInterval(window.setInterval(() => this.log.experiment("setInterval"), 5 * 60 * 1000));

        // listen to file creations, deletions and changes for sending to the server
        // This needs to be done after app is loaded as it is also called while all files are loaded
        // https://docs.obsidian.md/Plugins/Guides/Optimizing+plugin+load+time#Listening+to+%60vault.on("create")%60
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(this.app.vault.on("create", this.onCreate, this));
            this.registerEvent(this.app.vault.on("delete", this.onDelete, this));
            this.registerEvent(this.app.vault.on("modify", this.onModify, this));
            this.registerEvent(this.app.vault.on("rename", this.onRename, this));
        });

        this.lastEditor = undefined;

        this.app.workspace.on("active-leaf-change", (leaf) => {
            //this.log.experiment("active-leaf-change:", leaf);
        });

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon("dice", "Sample Plugin", (evt: MouseEvent) => {
            // Called when the user clicks the icon.
            //new Notice("This is a notice!");
            this.log.experiment("\nleavesa:")
            this.app.workspace.iterateRootLeaves((leaf) => {
                this.log.experiment(leaf);
            });
            //this.log.experiment(this.);
        });
        // Perform additional things with the ribbon
        ribbonIconEl.addClass("my-plugin-ribbon-class");


                
        const usercolors = [
            { color: "#30bced", light: "#30bced33" },
            { color: "#6eeb83", light: "#6eeb8333" },
            { color: "#ffbc42", light: "#ffbc4233" },
            { color: "#ecd444", light: "#ecd44433" },
            { color: "#ee6352", light: "#ee635233" },
            { color: "#9ac2c9", light: "#9ac2c933" },
            { color: "#8acb88", light: "#8acb8833" },
            { color: "#1be7ff", light: "#1be7ff33" }
        ]

        // select a random color for this user
        const userColor = usercolors[random.uint32() % usercolors.length]

        //const doc = new Y.Doc()
        //doc.on("update", (arg0, arg1, arg2) => {
        //    this.log.experiment("doc update: ", arg0, arg1, arg2);
        //});
        //const ytext = doc.getText("codemirror")
        //ytext.observe((a) => {
        //    this.log.experiment("new val: ", ytext.toString());
        //});

        //const provider = new WebsocketProvider("ws://hetzner2.ecbb.cc:12345", "my-room", doc, { disableBc: true })

        //const undoManager = new Y.UndoManager(ytext)
        //undoManager.on("stack-item-added", (arg0) => {})
        //let awareness = new awarenessProtocol.Awareness(doc);
        //
        //awareness.setLocalStateField("user", {
        //    name: "Anonymous " + Math.floor(Math.random() * 100),
        //    color: userColor.color,
        //    colorLight: userColor.light
        //})

        this.registerObsidianProtocolHandler("collab", (params) => {
            params.action
        });

        loadingNotice.appendMessage(" Done.").hideAfter(2);
    }

    onunload() {
        let unloadingNotice = new InfoNotice("Collab unloading...");

        this.connection.disconnect()

        unloadingNotice.appendMessage(" Done.").hideAfter(2);
    }

    async activateDebugView() {
        const { workspace } = this.app;
                
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_COLLAB_DEBUG_VIEW);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for it
            leaf = workspace.getRightLeaf(false)!;
            await leaf.setViewState({ type: VIEW_TYPE_COLLAB_DEBUG_VIEW, active: true });
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        workspace.revealLeaf(leaf);
    }

    onCreate(file: TAbstractFile) {
        this.log.debug("create:", file);
    }
    onDelete(file: TAbstractFile) {
        this.log.debug("delete:", file);
    }
    onModify(file: TAbstractFile) {
        this.log.debug("modify:", file);
    }
    onRename(file: TAbstractFile, old_path: string) {
        this.log.debug(`rename "${old_path}"->"${file.path}":`, file);
    }

    onExternalSettingsChange() {
        this.log.debug("external settings change")
        // TODO: figure out why this isn't called 
        this.settings.reload()
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText("Woah!");
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}