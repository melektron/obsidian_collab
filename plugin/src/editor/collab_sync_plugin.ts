/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 21:04

This code is based on the code found on https://github.com/yjs/y-codemirror.next
which is licensed under the conditions of the MIT License (see README.md of this project)
*/

import * as Y from 'yjs'
import * as cm_state from '@codemirror/state' // eslint-disable-line
import * as cm_view from '@codemirror/view' // eslint-disable-line
import { YRange } from './y-range.js'

import { editorInfoField, MarkdownView, Notice, TFile } from 'obsidian';
import { DocHandle, DocManager, docManagerFacet, TextDocument } from 'src/doc_manager.js';
import { ErrorNotice, InfoNotice, LoadingNotice, WarningNotice } from 'src/ui/static_components.js';
import { ChoiceModal } from 'src/ui/modals.js';


export const collabSyncOriginAnnotation = cm_state.Annotation.define()

export const editableCompartment = new cm_state.Compartment()

type InactiveState = {
    active: false
}
// state of the editor view plugin that only exists if collab
// plugin is active for that editor
type ActiveState = {
    active: true
    // reference to the doc manager to access even after editor is destroyed
    docManager: DocManager
    // the file this editor is accessing
    file: TFile
    // collab document associated with this editor
    document: TextDocument
    // handle to the document, so we can later release the doc from syncing
    handle: DocHandle
    // bound observer function for later unobservation
    crdtObserverFn: (event: Y.YTextEvent, transaction: Y.Transaction) => void
}

class CollabSyncPluginValue implements cm_view.PluginValue {
    // set true when the editor is destroyed, to prevent activation
    // after being destroyed
    destroyed: boolean = false;
    // whether the sync plugin is active in this editor.
    // only if this is true are the following members
    // guaranteed to be initialized and may be used.
    private state: InactiveState | ActiveState = {
        active: false
    }

    constructor(
        private editorView: cm_view.EditorView
    ) {
        // start activation in the background
        this.activate()
            .catch((reason) => {
                new ErrorNotice(`Initialization of collab editor failed unexpectedly: ${reason}`)
                // make editor editable as to not interfere with it anymore
                this.makeEditable()
                // deactivate it in case the error happened after activation
                this.deactivate()
            })
    }

    /**
     * initializes the editor for syncing,
     * asking the user questions if needed and waiting
     * for network syncing to be ready.
     * May decide to not activate the plugin.
     */
    private async activate(): Promise<void> {
        // forbid duplicate initialization
        if (this.state.active) return;

        let docManager = this.editorView.state.facet(docManagerFacet)
        
        // determine what file is opened in the editor
        // TODO: what happens if the file is renamed or moved while open?
        let editorInfo = this.editorView.state.field(editorInfoField);
        if (!editorInfo.file) {
            new ErrorNotice("Collab could not determine which file was opened. This editor will not be synced.");
            this.makeEditable();
            return;
        }
        const file = editorInfo.file
        
        // check if any document is associated with this path
        const [doc, handle] = docManager.resolveTextDocument(file.path)
        if (doc === null) {
            new ErrorNotice("Not associated with any item").hideAfter(3);
            this.makeEditable();
            return;
        }

        console.log("Associated with item");

        // wait until the document is loaded (at least from local persistence)
        // TODO: show some sort of syncing animation somewhere on the editor while waiting for load
        // for now we just do that with a notice
        const loadingNotice = new LoadingNotice("Loading document...")
        await doc.loadedPromise
        loadingNotice.appendMessage(" done").completed().hideAfter(3)

        if (!doc.syncingEnabled) {
            // if the doc is NOT syncing with the server yet, it was either freshly created
            // or opened for the first time during this session. We can thus assume that
            // the state in the CRDT was not modified by another user since it was
            // last updated from the local obsidian file.
            //
            // In this case, the local file content loaded by obsidian into the editor usually
            // matches the content of the local CRDT state. In this case, we must do nothing further
            // and can safely enable syncing with the server to pull changes from other users.
            //
            // It is however possible that the local CRDT state does not match the state of
            // the local file as loaded by obsidian. This usually means the file was modified
            // outside of obsidian while obsidian was not running or the file was at least not
            // used in any open editor (bg sync not supported yet). Since the CRDT is not syncing with the 
            // server, we can safely assume that any changes in the local file are probably downstream 
            // of the last saved CRDT state, and we can just update the CRDT with the changes made to the 
            // local file. Only AFTER those are integrated, we can enable server syncing, otherwise the
            // user intent would not be preserved.

            // TODO: move this to a separate function and improve it a lot
            if (doc.textType.toString() !== this.editorView.state.doc.toString()) {
                new WarningNotice("File differs from CRDT! Overwriting CRDT with file value").hideAfter(3);
                editorInfo.editor?.blur()   // TODO: what does this do?
                doc.crdtDoc.transact((tr) => {
                    doc.granularlyReplaceText(this.editorView.state.doc.toString())
                }, this)
            }

            // enable syncing and try to start syncing right away
            doc.enableSyncing()
            doc.startSyncing()
            if (!doc.syncingActive) {
                new InfoNotice("Syncing is currently not possible, but you can continue to work offline.").hideAfter(3)
            }

        } else /* if (document.syncingEnabled) */ {
            // If the doc is already syncing with the server, we must assume that 
            // it's state may have been modified by other users, and we cannot just update
            // it from the local file contents, as that may revert changes done by other users.
            // If the CRDT content differs from the content on disk now, one of two things could have happened:
            // 1. Document was synced and worked on by other users, but not open by this user in any editor,
            //    so those remote changes were not saved to disk.
            //    TODO: in the future, we should make it such that if no editor uses the document, it stops from syncing 
            //          or (probably even better) is still synced to disk in the background so we always have up-to-date
            //          local documents
            // 2. Everything from 1, plus the local file was edited externally on disk, without those changes
            //    being integrated into the document
            //    TODO: If we decide to do background file syncing in the future, we must also integrate changes made
            //          in the background by other programs to local files into the CRDT.
            // In case of 1, we could just overwrite the content of the local file with those from the CRDT.
            // In case of 2, we would need to do manual conflict resolution because we don't know from which
            // starting point the local file changes happened.
            // TODO: As a temporary fix until background syncing is implemented or unused documents are stopped from syncing,
            //       we could store the state vector of when we last synced the local file with the document, and then integrate 
            //       from that point somehow, but that is kinda hacky, one of the proper implementations would be better.
            
            // If the doc hasn't changed, we don't have a problem anyway.
            if (doc.textType.toString() !== this.editorView.state.doc.toString()) {
                // For now, we just show a modal asking the user what version they want to keep (local or remote)
                const result = await new ChoiceModal<"keep_crdt" | "keep_local">(editorInfo.app)
                    .setTitle("Conflict")
                    .setContent("The note you just opened may have been independently modified on disk and by other users. Collab can not determine how to safely merge these changes. How do you want to proceed?")
                    .addOption("mod-cta", "Keep changes from server", "keep_crdt", true)
                    .addOption("", "Keep local changes", "keep_local")
                    .addOption("mod-cancel", "Close note", null)
                    .prompt()
                
                if (result === null) {
                    // user has dismissed the modal, so we close the leaf containing this editor
                    // without ever making it editable, to prevent any collateral damage
                    const leaf = editorInfo.app.workspace.getLeavesOfType("markdown").find((l) => {
                        return (l.view instanceof MarkdownView ? l.view : undefined)?.editor.cm === this.editorView
                    })
                    if (leaf) leaf.detach()
                    docManager.releaseHandle(handle)
                    return;
                } else if (result === "keep_crdt") {
                    new Notice("Local file has been overwritten with online changes")
                    //queueMicrotask(() => {
                        this.replaceEditorText(doc.textType.toString())
                    //})
                } else if (result === "keep_local") {
                    new Notice("Collab document has been overwritten with local changes")
                    doc.crdtDoc.transact((tr) => {
                        doc.granularlyReplaceText(this.editorView.state.doc.toString())
                    }, this)
                }
            }
        }

        // if the editor was destroyed by now, we just stop here
        // and clean up side-effects caused outside the editor
        if (this.destroyed) {
            docManager.releaseHandle(handle)
            return;
        }
        
        // collab is now active
        this.state = {
            active: true,
            file,
            docManager,
            document: doc,
            handle,
            // we save the bound update observer fn so we can later unregister it
            crdtObserverFn: this.updateEditorFromCrdt.bind(this),
        };
        
        // update the editor when the CRDT text changes
        doc.textType.observe(this.state.crdtObserverFn)

        // finally, allow editing
        this.makeEditable()
    }

    replaceEditorText(newText: string) {
        if (this.destroyed) return

        this.editorView.dispatch({
            changes: {
                from: 0,
                to: this.editorView.state.doc.length,
                insert: newText
            },
            // this change must not be undoable, as otherwise the entire CRDT history 
            // would be effectively cleared with a giant update if it was undone
            annotations: [
                cm_state.Transaction.addToHistory.of(false)
            ]
        })
    }

    /**
     * disables readOnly on the editor, which was set by default
     */
    protected makeEditable() {
        queueMicrotask(() => {
            if (this.destroyed) return;
            // make editor editable as to not interfere with it anymore
            this.editorView.dispatch({
                effects: editableCompartment.reconfigure([
                    cm_state.EditorState.readOnly.of(false)
                ])
            })
        })
    }

    // interface implementation
    update(update: cm_view.ViewUpdate) {
        // update the CRDT when the editor text changes
        // TODO: is this also fired if the file is updated on disk and obsidian uses that to update the editor?
        this.updateCrdtFromEditor(update);
    }
    // interface implementation
    destroy() {
        this.destroyed = true;
        this.deactivate()
    }
    
    /**
     * Deactivates the plugin by removing the 
     * CRDT->editor binding and sets the active flag 
     * to false to disable the editor->CRDT binding.
     * If not active, this does nothing.
     */
    protected deactivate() {
        if (!this.state.active) return;
        this.state.document.textType.unobserve(this.state.crdtObserverFn)
        // release the document handle this editor doesn't need the doc anymore
        this.state.docManager.releaseHandle(this.state.handle)
        this.state = { active: false }
    }

    updateCrdtFromEditor(update: cm_view.ViewUpdate) {
        // only update if collab is active here
        if (!this.state.active) return;
        const ytext = this.state.document.textType

        // only update if there are content changes and they don't originate from an editor update triggered by this plugin itself 
        if (!update.docChanged || (update.transactions.length > 0 && update.transactions[0].annotation(collabSyncOriginAnnotation) === this.editorView)) {
            return
        }

        ytext.doc!.transact(() => {

            /**
             * This variable adjusts the fromA position to the current position in the Y.Text type.
             */
            let adj = 0
            update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
                const insertText = insert.sliceString(0, insert.length, '\n')
                if (fromA !== toA) {
                    ytext.delete(fromA + adj, toA - fromA)
                }
                if (insertText.length > 0) {
                    ytext.insert(fromA + adj, insertText)
                }
                adj += insertText.length - (toA - fromA)
            })

        }, this)    // pass "this" to identify this transaction the own handler
    }

    updateEditorFromCrdt(event: Y.YTextEvent, transaction: Y.Transaction) {
        // only apply transactions originating from other clients
        if (transaction.origin !== this) {
            const delta = event.delta
            const changes: cm_state.ChangeSpec[] = []

            // walk through the quill delta steps, counting the current position
            // which is needed for codemirror's absolutely indexed change format
            let pos = 0
            for (let i = 0; i < delta.length; i++) {
                const d = delta[i]

                // Insert operation
                if (d.insert != null) {
                    changes.push({ from: pos, to: pos, insert: d.insert as string })
                
                // Delete operation
                } else if (d.delete != null) {
                    changes.push({ from: pos, to: pos + d.delete, insert: '' })
                    // codemirror positions are relative to before the transaction, 
                    // so future changes must account for the now deleted characters
                    pos += d.delete
                
                // Retain operation
                } else {
                    // skip the amount of characters that shall be retained without change
                    pos += d.retain!
                }
            }

            this.editorView.dispatch({ changes, annotations: [
                collabSyncOriginAnnotation.of(this.editorView),
                // don't add changes made by other clients to the undo history.
                // This way we get independent undo histories while being able
                // to re-use the builtin CM6 history used by obsidian and don't
                // need to somehow implement this using Y.UndoManager.
                // TODO: observe if this approach causes any problems in the future.
                cm_state.Transaction.addToHistory.of(false)
            ] })
        }
    }
}

export const collabSyncPlugin = cm_view.ViewPlugin.fromClass(CollabSyncPluginValue)
