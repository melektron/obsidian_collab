/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
16.05.26, 15:43

Additional types for private Obsidian APIs we need.
Inspired by https://github.com/RafaelGB/obsidian-db-folder/blob/master/src/typings/obsidian.d.ts
*/

import "obsidian"
import { EditorView } from "@codemirror/view"

declare module "obsidian" {

  interface Editor {
    /**
     * WARNING! not exposed by Obsidian, may break in future.
     */
    cm: EditorView
  }

  interface App {
    /**
     * WARNING! not exposed by Obsidian, amy break in the future.
     * 
     * Unique ID identifying the active vault. Obsidian internally uses this to
     * e.g. differentiate local storage keys, so different vaults don't collide
     * (as chromium session is persisted and shared across vaults)
     * https://forum.obsidian.md/t/how-to-uniquely-identify-an-obsidian-instance/85740/2
     */
    appId: string
  }
}