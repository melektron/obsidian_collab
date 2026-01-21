/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
29.05.25, 21:31

Code to get the appropriate item for a file/folder
*/

import * as Y from "yjs"

import * as cm_state from '@codemirror/state' // eslint-disable-line

export class Item {
    crdtDoc: Y.Doc

    constructor() {
        this.crdtDoc = new Y.Doc()
    }
}

export class TextItem extends Item {
    textType: Y.Text
    fresh: boolean = true

    constructor() {
        super()
        this.textType = this.crdtDoc.getText("text-doc")
    }
}

export class ItemResolver {
    items: Map<string, TextItem>

    constructor() {
        let item1 = new TextItem()
        let item2 = new TextItem()
        this.items = new Map<string, TextItem>([
            ["My folder/Testsubfile.md", item1],
            ["Topfile.md", item1],

            ["Untitled 1.md", item2],
            ["Untitled 2.md", item2],
        ])

        item1.textType.observe((e, tr) => {
            console.log(`Item1 changed: ${item1.textType.toString()}` )
        })
        item2.textType.observe((e, tr) => {
            console.log(`Item2 changed: ${item2.textType.toString()}` )
        })
    }

    resolveTextItem(path: string): TextItem | null {
        return this.items.get(path) ?? null
    }
}


export const itemResolverFacet = cm_state.Facet.define<ItemResolver, ItemResolver>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
