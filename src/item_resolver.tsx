/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
29.05.25, 21:31

Code to get the appropriate item for a file/folder
*/

import * as Y from "yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import * as cm_state from '@codemirror/state' // eslint-disable-line

export class Item {
    crdtDoc: Y.Doc
    localPersistence: IndexeddbPersistence
    private _remoteSyncingEnabled: boolean = false;
    ready: boolean
    readyPromise: Promise<null>

    firstLoad: boolean  // TODO: set when first loaded from server (not in local persistence cache). IN case local file conflicts exist, the user always gets asked about them in this case
    // TODO: question: is this even needed? on first load, the _remoteSyncingEnabled is always set immediately, so that would be enough. When remote sync is active already, always ask user about how they want to merge

    constructor(
        readonly uuid: string
    ) {
        this.crdtDoc = new Y.Doc()
        this.localPersistence = new IndexeddbPersistence(this.uuid, this.crdtDoc)
        this.readyPromise = new Promise((resolve, _) => {
            this.localPersistence.on("synced", () => {
                console.log(`Doc ${uuid} synced from DB`)
                this.onSynced()
                this.ready = true;
                resolve(null)
            })
        })
    }

    onSynced() {}

    public get remoteSyncing() : boolean {
        return this._remoteSyncingEnabled
    }
    
    public set remoteSyncing(v : boolean) {
        this._remoteSyncingEnabled = v;
        // TODO: connect to server and exchange updates between local doc and remote doc
    }
}

export class TextItem extends Item {
    textType: Y.Text
    fresh: boolean = true

    constructor(
        uuid: string
    ) {
        super(uuid)
        this.textType = this.crdtDoc.getText("text-doc")
    }

    override onSynced(): void {
        console.log(`Doc Value: ${this.textType.toString()}`)
    }
}

export class ItemResolver {
    items: Map<string, TextItem>

    constructor() {
        let item1 = new TextItem("id_item1")    // TODO: use proper UUID/GUID (and proper type for it)
        let item2 = new TextItem("id_item2")
        this.items = new Map<string, TextItem>([
            ["My folder/Testsubfile.md", item1],
            ["Topfile.md", item1],

            ["Untitled 1.md", item2],
            ["Untitled 2.md", item2],
        ])

        item1.textType.observe((e, tr) => {
            console.log(`Item1 changed`);//: ${item1.textType.toString()}` )
        })
        item2.textType.observe((e, tr) => {
            console.log(`Item2 changed`);//: ${item2.textType.toString()}` )
        })
    }

    resolveTextItem(path: string): TextItem | null {
        // mountpoint lookup (TODO: do with real mountpoint table)
        let item = this.items.get(path) ?? null
        if (item === null) return null;

        // introducing dummy loading delay TODO: remove this when proper cache lookup is implemented
        item.ready = false;
        item.readyPromise = new Promise<null>((resolve, _) => {
            console.info("Simulating loading delay...");
            item.ready = true;
            setTimeout(() => resolve(null), 1000);
        });
        return item
    }
}


export const itemResolverFacet = cm_state.Facet.define<ItemResolver, ItemResolver>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
