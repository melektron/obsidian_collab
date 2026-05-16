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
}