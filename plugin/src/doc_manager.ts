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
import { App } from "obsidian"
import { Connection, ConnectionState } from "./networking/connection"
import { AnyUint8Array } from "./networking/proto_shared"
import { Listener } from "./networking/event_channel"

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
    // components
    crdtDoc: Y.Doc
    protected localPersistence: IndexeddbPersistence

    // whether the document has finished loading from local persistence
    #loaded: boolean = false
    get loaded() { return this.#loaded }
    
    // whether syncing is allowed and intended
    #syncingEnabled: boolean = false;
    get syncingEnabled() { return this.#syncingEnabled }
    
    // whether syncing is actually active (may be false
    // if server is not connected)
    #syncingActive: boolean = false;
    get syncingActive() { return this.#syncingActive }

    private connectedListener: Listener | null = null;
    
    // listener IDs active during syncing
    private syncStep1Listener: Listener | null = null;
    private syncStep2Listener: Listener | null = null;
    private syncStepUpdateListener: Listener | null = null;
    private onUpdateCb: ((update: AnyUint8Array, origin: any) => void) | null = null;

    // list of all the active handles to this document. 
    // only accessible by DocManager via symbol.
    [docHandles]: DocHandle[] = []

    readonly loadedPromise: Promise<null>

    //firstLoad: boolean  // TODO: set when first loaded from server (not in local persistence cache). IN case local file conflicts exist, the user always gets asked about them in this case
    // TODO: question: is this even needed? on first load, the _remoteSyncingEnabled is always set immediately, so that would be enough. When remote sync is active already, always ask user about how they want to merge

    constructor(
        readonly app: App,
        readonly connection: Connection,
        readonly uuid: string,
    ) {
        // create new document
        this.crdtDoc = new Y.Doc()  // TODO: use server specified client ID
        // load document from local indexeddb database (db name includes
        // both vault id (appId) and doc id, as the local persistence has to be unique across vaults
        // so if two vaults share the same collab doc, they still can do independent offline
        // conflict resolution)
        this.localPersistence = new IndexeddbPersistence(`${this.app.appId}-collab-doc-${this.uuid}`, this.crdtDoc)
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

        // Try to start syncing whenever the server is connected
        this.connectedListener = this.connection.connectedEvent.on(() => this.startSyncing())

        this.crdtDoc.on("destroy", (doc) => {
            // when the document is destroyed, we also stop 
            // and disable syncing if it is still active
            // and stop listening for new connections
            this.connectedListener = this.connection.connectedEvent.off(this.connectedListener)
            this.disableSyncing()
            // the DB provider is automatically destroyed as well
        })
    }

    protected onLoaded() { }

    private handleSyncStep1(state_vector: AnyUint8Array) {
        // respond with sync step 2
        const update = Y.encodeStateAsUpdate(this.crdtDoc, state_vector)
        this.connection.sendSyncStep2(this.uuid, update)
    }
    private handleSyncUpdate(update: AnyUint8Array) {
        // apply the update with teh connection as the origin
        // to indicate this update was received from the server
        Y.applyUpdate(this.crdtDoc, update, this.connection)
    }

    /**
     * Attempts to start syncing if syncing is enabled 
     * (`syncingEnabled` === true). If that is possible,
     * (bc server is connected) it sets `syncingActive` to true, 
     * otherwise (mainly because server is not connected) it does nothing.
     * 
     * @return true if syncing was started, false otherwise
     * (including because it was already active)
     */
    public startSyncing(): boolean {
        console.log("trie to start syncing")
        // if syncing is not enabled, we do nothing
        if (!this.syncingEnabled) return false
        // if syncing is already active, we do nothing
        if (this.syncingActive) return false
        // if we are not connected, we can't do anything either
        if (!this.connection.connected) return false

        // otherwise enable updates and initiate first sync with server
        this.#syncingActive = true
        
        // listen for server events regarding this document
        this.syncStep1Listener = this.connection.syncStep1Event.on(this.uuid, (msg) => this.handleSyncStep1(msg.state_vector))
        this.syncStep2Listener = this.connection.syncStep2Event.on(this.uuid, (msg) => this.handleSyncUpdate(msg.update))
        this.syncStepUpdateListener = this.connection.syncStepUpdateEvent.on(this.uuid, (msg) => this.handleSyncUpdate(msg.update))

        // enable update events for this document
        this.connection.configureUpdates(this.uuid, true)
        
        // initiate sync step 1, to which a server response follow
        const state_vector = Y.encodeStateVector(this.crdtDoc)
        this.connection.sendSyncStep1(this.uuid, state_vector)

        // forward local updates to the server
        this.onUpdateCb = (update, origin) => {
            // updates originating from the server are ignored
            if (origin === this.connection) return;
            this.connection.sendSyncStepUpdate(this.uuid, update)
        }
        this.crdtDoc.on("update", this.onUpdateCb)

        // when the server disconnects, stop syncing
        this.connection.disconnectEvent.once(() => this.stopSyncing())

        return true
    }

    /**
     * Stops syncing immediately by disabling
     * server updates, setting `syncingActive` false
     * and cleaning up and releasing any resources (listeners, ...)
     * related to syncing.
     * This does NOT set `syncingEnabled` to false, and thus
     * it will be stated again when the connection to the server
     * is restored.
     */
    public stopSyncing() {
        console.log("trie stop syncing")
        if (!this.#syncingActive) return
        
        // disable all the event listeners
        this.syncStep1Listener = this.connection.syncStep1Event.off(this.uuid, this.syncStep1Listener)
        this.syncStep2Listener = this.connection.syncStep2Event.off(this.uuid, this.syncStep2Listener)
        this.syncStepUpdateListener = this.connection.syncStepUpdateEvent.off(this.uuid, this.syncStepUpdateListener)
        
        // request server to stop sending updates
        // (if server is not connected, this will do nothing,
        // but server automatically stops in that case anyway)
        this.connection.configureUpdates(this.uuid, false)
        
        // disable local document update callback
        if (this.onUpdateCb !== null) {
            this.crdtDoc.off("update", this.onUpdateCb)
            this.onUpdateCb = null
        }

        // only set to false once everything was completed
        this.#syncingActive = false
    }

    /**
     * enables (allows) syncing for this document, but does
     * not yet start syncing it immediately. Call `startSyncing` after
     * to start immediately.
     * `startSyncing()` is also called automatically when the server connects later.
     * This is intended to enable syncing once all preliminary checks
     * have completed (e.g. merging of local files with local CRDT state).
     */
    public enableSyncing() {
        this.#syncingEnabled = true
    }

    /**
     * disables syncing by setting `syncingEnabled` to false.
     * If syncing is currently active, it is also stopped,
     * cleaning up all associated resources
     */
    public disableSyncing() {
        this.#syncingEnabled = false
        this.stopSyncing()
    }

    /**
     * destroys the document instance by stopping syncing,
     * local persistence and destroying the yjs
     * document itself.
     */
    public destroy() {
        // document destruction triggers all further destroy actions
        // (see constructor)
        this.crdtDoc.destroy()
    }

    syncNow() {
        // TODO: re-send syncstep1 to initiate a complete re-sync at this point
        // could be used by a potential "sync now" button in the UI
    }
}

/**
 * Class representing the CRDT document for a text file.
 * It has one text item containing the text content of the file.
 */
export class TextDocument extends Document {
    textType: Y.Text
    //fresh: boolean = true

    constructor(
        app: App,
        connection: Connection,
        uuid: string,
    ) {
        super(app, connection, uuid)
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
        // https://discuss.yjs.dev/t/does-a-huge-text-with-tiny-changes-overriding-lead-an-entire-document-sync/2461
        this.textType.delete(0, this.textType.length)
        this.textType.insert(0, newText)
    }
}

export class DocManager {
    mountpointIndex: Map<string, DocumentIdentifier>
    private activeDocs: ValueMap<DocumentIdentifier, TextDocument>
    private handleToDocId: Map<DocHandle, DocumentIdentifier>
    private nextDocHandle: DocHandle = 0;
    
    constructor(
        readonly app: App,
        readonly connection: Connection
    ) {
        this.mountpointIndex = new Map([
            ["My folder/Testsubfile.md", new DocumentIdentifier("00000000-0000-4000-8000-000000000001", new URL("http://localhost:1234/collab"))],
            ["Topfile.md", new DocumentIdentifier("00000000-0000-4000-8000-000000000001", new URL("http://localhost:1234/collab"))],

            ["Untitled 1.md", new DocumentIdentifier("00000000-0000-4000-8000-000000000002", new URL("http://localhost:1234/collab"))],
            ["Untitled 2.md", new DocumentIdentifier("00000000-0000-4000-8000-000000000002", new URL("http://localhost:1234/collab"))],
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
            doc = new TextDocument(this.app, this.connection, docId.uuid)
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
        
        // Document has no more handles, so it must be destroyed
        console.log("destroying document", docId)
        doc.destroy()
        this.activeDocs.delete(docId)
    }
}


export const docManagerFacet = cm_state.Facet.define<DocManager, DocManager>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
