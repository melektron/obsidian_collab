/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 21:04

This code is a modified version of the code found on https://github.com/yjs/y-codemirror.next
licensed under the conditions of the MIT License (see README.md of this project)
*/

import * as Y from 'yjs'
import * as cm_state from '@codemirror/state' // eslint-disable-line
import * as cm_view from '@codemirror/view' // eslint-disable-line
import { YRange } from './y-range.js'
import { Awareness } from 'y-protocols/awareness.js';

// TODO: use this to determine the path of a document opened in an editor
import { editorInfoField, Notice, TFile } from 'obsidian';
import { ItemResolver, itemResolverFacet, TextItem } from 'src/item_resolver.js';
import { ErrorNotice } from 'src/components.js';


export const ySyncAnnotation = cm_state.Annotation.define()


class YSyncPluginValue implements cm_view.PluginValue{
    editorView: cm_view.EditorView;
    resolver: ItemResolver;
    active: boolean = false;    // whether the sync plugin is active in this editor
    file: TFile;
    syncing: boolean = false;   // whether syncing between CRDT and editor is currently enabled
    item: TextItem | null;
    ytext: Y.Text;

    constructor(editorView: cm_view.EditorView) {
        this.active = false;

        this.editorView = editorView
        this.resolver = editorView.state.facet(itemResolverFacet)
        
        let editorInfo = this.editorView.state.field(editorInfoField);
        if (editorInfo.file) {
            this.file = editorInfo.file;
        } else {
            new ErrorNotice("Collab could not determine which file was opened. This editor will not be synced.");
            // TODO: make editable here using compartments (also in all other early return cases)
            return;
        }
        
        this.item = this.resolver.resolveTextItem(this.file.path)
        if (this.item === null) {
            new ErrorNotice("Not associated with any item");
            return;
        }
        this.ytext = this.item.textType;
        console.log("Associated with item");
        new Notice("Associated with item");

        // TODO: check whether the item is ready
        
        // TODO: move this to a separate function and improve it a lot
        if (this.ytext.toString() !== this.editorView.state.doc.toString()) {
            new ErrorNotice("File differs from item! Overwriting item with file value");
            editorInfo.editor?.blur()
            this.ytext.doc?.transact((tr) => {
                this.ytext.delete(0, this.ytext.length)
                this.ytext.insert(0, this.editorView.state.doc.toString())
            }, this)
        }
        
        // editor is now active
        this.active = true;
        
        // TODO: only set this once syncing is enabled. pull that out into its own function
        // update the editor when the CRDT text changes
        this.ytext.observe(this.updateEditorFromCrdt)
    }
    // interface implementation
    update(update: cm_view.ViewUpdate) {
        if (!this.active) return;
        this.updateCrdtFromEditor(update);
    }
    // interface implementation
    destroy() {
        if (!this.active) return;
        this.ytext.unobserve(this.updateEditorFromCrdt)
    }

    updateCrdtFromEditor(update: cm_view.ViewUpdate) {
        // only update if there are content changes and they don't originate from the local CRDT update
        if (!update.docChanged || (update.transactions.length > 0 && update.transactions[0].annotation(ySyncAnnotation) === this.editorView)) {
            return
        }

        this.ytext.doc!.transact(() => {

            /**
             * This variable adjusts the fromA position to the current position in the Y.Text type.
             */
            let adj = 0
            update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
                const insertText = insert.sliceString(0, insert.length, '\n')
                if (fromA !== toA) {
                    this.ytext.delete(fromA + adj, toA - fromA)
                }
                if (insertText.length > 0) {
                    this.ytext.insert(fromA + adj, insertText)
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

            this.editorView.dispatch({ changes, annotations: [ySyncAnnotation.of(this.editorView)] })
        }
    }
}

export const ySync = cm_view.ViewPlugin.fromClass(YSyncPluginValue)
