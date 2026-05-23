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
import { MapKey, ValueMap } from "./utils/valuemap"
import { Value } from "obsidian"

export type UUID = string

/**
 * object to identify and locate a document globally
 */
export class DocumentIdentifier extends MapKey {
    constructor(
        readonly uuid: UUID,
        readonly server: URL
    ) { super() }
}

export type DocHandle = number

const docHandles = Symbol("docHandles")

export class Document {
    crdtDoc: Y.Doc
    protected localPersistence: IndexeddbPersistence
    #loaded: boolean = false
    get loaded() { return this.#loaded }
    #syncingEnabled: boolean = false;
    get syncingEnabled() { return this.#syncingEnabled }

    // list of all the active handles to this document. 
    // only accessible by DocManager via symbol.
    [docHandles]: DocHandle[] = []

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

export class DocManager {
    mountpointIndex: Map<string, DocumentIdentifier>
    private activeDocs: ValueMap<DocumentIdentifier, TextDocument>
    private handleToDocId: Map<DocHandle, DocumentIdentifier>
    private nextDocHandle: DocHandle = 0;
    
    constructor() {
        this.mountpointIndex = new Map([
            ["My folder/Testsubfile.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000000", new URL("http://localhost:1234/collab"))],
            ["Topfile.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000000", new URL("http://localhost:1234/collab"))],

            ["Untitled 1.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000002", new URL("http://localhost:1234/collab"))],
            ["Untitled 2.md", new DocumentIdentifier("00000000-0000-0000-0000-ffff00000002", new URL("http://localhost:1234/collab"))],
        ])
        this.activeDocs = new ValueMap()
        this.handleToDocId = new Map()
    }

    private allocateHandle(): DocHandle {
        return this.nextDocHandle++
    }
    
    resolveTextDocument(path: string): [TextDocument, DocHandle] | [null, null] {
        // mountpoint lookup (TODO: do with real mountpoint table)
        const docId = this.mountpointIndex.get(path) ?? null
        if (docId === null) return [null, null];

        // check if the document is already active
        let doc = this.activeDocs.get(docId) ?? null
        if (doc === null) {
            // document is not active, load it from local persistence
            doc = new TextDocument(docId.uuid)
            this.activeDocs.set(docId, doc)
        };

        const handle = this.allocateHandle()
        // register handle with the document
        doc[docHandles].push(handle)
        this.handleToDocId.set(handle, docId)

        return [doc, handle]
    }

    releaseHandle(handle: DocHandle) {
        // retrieve the referenced document. If it isn't active
        // or the handle is invalid (possible double-release)
        // we ignore it but print warning as it is a sign of a bug
        const docId = this.handleToDocId.get(handle)
        if (docId === undefined) {
            console.warn("Attempted release of unknown handle, ignoring")
            return
        };
        // get the doc
        const doc = this.activeDocs.get(docId)
        if (doc === undefined) {
            throw new Error("Handle references inactive doc, this is a bug!")
        }

        // otherwise remove from the doc and the map
        doc[docHandles].remove(handle) // this is an obsidian addition to Array<T>
        this.handleToDocId.delete(handle)

        if (doc[docHandles].length !== 0) return;
        
        // Document has no more handles, so it must be deactivated
        console.log("deactivating document", docId)
        this.activeDocs.delete(docId)
        // TODO: stop syncing this document if it is syncing currently
    }
}


export const docManagerFacet = cm_state.Facet.define<DocManager, DocManager>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
