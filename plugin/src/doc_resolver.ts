/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
29.05.25, 21:31

Code to get the appropriate CRDT document for a file/folder
*/

import * as Y from "yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import * as cm_state from '@codemirror/state' // eslint-disable-line

type UUID = string

/**
 * object to identify and locate a document globally
 */
export class DocumentIdentifier {
    constructor(
        readonly uuid: UUID,
        readonly server: URL
    ) { }
}

export class Document {
    crdtDoc: Y.Doc
    protected localPersistence: IndexeddbPersistence
    #loaded: boolean = false
    #syncingEnabled: boolean = false;

    readonly loadedPromise: Promise<null>

    //firstLoad: boolean  // TODO: set when first loaded from server (not in local persistence cache). IN case local file conflicts exist, the user always gets asked about them in this case
    // TODO: question: is this even needed? on first load, the _remoteSyncingEnabled is always set immediately, so that would be enough. When remote sync is active already, always ask user about how they want to merge

    constructor(
        readonly uuid: string
    ) {
        // create new document
        this.crdtDoc = new Y.Doc()  // TODO: use server specified client ID
        // load document from local indexeddb database
        this.localPersistence = new IndexeddbPersistence(this.uuid, this.crdtDoc)
        this.localPersistence.whenSynced
        this.loadedPromise = new Promise((resolve, _) => {
            this.localPersistence.on("synced", () => {
                console.log(`Doc ${uuid} loaded from local DB`)
                // introducing dummy loading delay TODO: remove this later
                console.info("Simulating loading delay...");
                setTimeout(() => {
                    console.info("Dummy delay over, doc loaded");
                    this.onLoaded()
                    this.#loaded = true;
                    resolve(null)
                }, 1000);
            })
        })
    }

    get loaded() {
        return this.#loaded
    }
    get syncingEnabled() {
        return this.#syncingEnabled
    }

    protected onLoaded() { }
    //
    //public get remoteSyncing() : boolean {
    //    return this._remoteSyncingEnabled
    //}
    //
    //public set remoteSyncing(v : boolean) {
    //    this._remoteSyncingEnabled = v;
    //    // TODO: connect to server and exchange updates between local doc and remote doc
    //}
}

/**
 * Class representing the CRDT document for a text file.
 * It has one text item containing the text content of the file.
 */
export class TextDocument extends Document {
    textType: Y.Text
    //fresh: boolean = true

    constructor(
        uuid: string
    ) {
        super(uuid)
        this.textType = this.crdtDoc.getText("text-file-content")
    }

    protected override onLoaded(): void {
        console.log(`Doc Value: ${this.textType.toString()}`)

        this.textType.observe((e, tr) => {
            console.log(`${this.uuid} changed: ${this.textType.toString()}`);
        })
    }

    /**
     * replaces the entire text content of the document
     * with as little changes as possible by applying 
     * the diff between current doc content and newText.
     * @note It is recommended to wrap this in a transaction
     */
    granularlyReplaceText(newText: string) {
        // TODO: don't do this, instead create a diff and do a granular update
        this.textType.delete(0, this.textType.length)
        this.textType.insert(0, newText)
    }
}

export class DocResolver {
    mountpointIndex: Map<string, DocumentIdentifier>
    activeDocs: Map<UUID, TextDocument>

    constructor() {
        this.mountpointIndex = new Map([
            ["My folder/Testsubfile.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000000", new URL("http://localhost:1234/collab"))],
            ["Topfile.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000000", new URL("http://localhost:1234/collab"))],

            ["Untitled 1.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000002", new URL("http://localhost:1234/collab"))],
            ["Untitled 2.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000002", new URL("http://localhost:1234/collab"))],
        ])
        this.activeDocs = new Map<string, TextDocument>()
    }

    resolveTextDocument(path: string): TextDocument | null {
        // mountpoint lookup (TODO: do with real mountpoint table)
        const docId = this.mountpointIndex.get(path) ?? null
        if (docId === null) return null;

        // check if the document is already active
        let document = this.activeDocs.get(docId.uuid) ?? null
        if (document === null) {
            // document is not active, load it from local persistence
            document = new TextDocument(docId.uuid)
            this.activeDocs.set(docId.uuid, document)
        };

        return document
    }
}


export const docResolverFacet = cm_state.Facet.define<DocResolver, DocResolver>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
