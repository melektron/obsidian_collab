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
    editor: cm_view.EditorView;
    file: TFile;
    resolver: ItemResolver;
    item: TextItem | null;
    ytext: Y.Text;
    observer

    constructor(editor: cm_view.EditorView) {
        this.editor = editor
        this.resolver = editor.state.facet(itemResolverFacet)
        
        let editorInfo = this.editor.state.field(editorInfoField);
        if (editorInfo.file) {
            this.file = editorInfo.file;
        } else {
            new ErrorNotice("Collab could not determine which file was opened. This editor will not be synced.");
            throw Error("getActiveFile() failed");
        }
        
        this.item = this.resolver.resolveTextItem(this.file.path)
        if (this.item) {
            this.ytext = this.item.textType;
            new Notice("Associated with item");
        } else {
            new ErrorNotice("Not associated with any item");
            throw Error("resolveTextItem() failed");
        }

        if (this.ytext.toString() !== this.editor.state.doc.toString()) {
            new ErrorNotice("Doc differs from item! Overwriting with item doc value");
            this.ytext.doc?.transact((tr) => {
                this.ytext.delete(0, this.ytext.length)
                this.ytext.insert(0, this.editor.state.doc.toString())
            }, this)
        }
        
        // yjs change handler function
        this.observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
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

                editor.dispatch({ changes, annotations: [ySyncAnnotation.of(this.editor)] })
            }
        }
        this.ytext.observe(this.observer)
    }

    /**
     * @param {cm_view.ViewUpdate} update
     */
    update(update: cm_view.ViewUpdate) {
        if (!update.docChanged || (update.transactions.length > 0 && update.transactions[0].annotation(ySyncAnnotation) === this.editor)) {
            return
        }
        const ytext = this.ytext
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
        }, this)
    }

    destroy() {
        this.ytext.unobserve(this.observer)
    }
}

export const ySync = cm_view.ViewPlugin.fromClass(YSyncPluginValue)
