/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
11.07.26, 15:15

Re-implementation (and extension) of obsidians built-in 
folder suggestion class as that is not exposed via the API
*/

import { AbstractInputSuggest, App, FuzzyMatch, prepareFuzzySearch, renderMatches, SearchResult, sortSearchResults, TAbstractFile, TFolder } from "obsidian";


export class TestSuggest extends AbstractInputSuggest<TAbstractFile> {
    protected getSuggestions(query: string): TAbstractFile[] | Promise<TAbstractFile[]> {
        throw new Error("Method not implemented.");
    }
    renderSuggestion(value: TAbstractFile, el: HTMLElement): void {
        throw new Error("Method not implemented.");
    }
    
}

type FileSuggestion = FuzzyMatch<TAbstractFile> | null
export class FileInputSuggest extends AbstractInputSuggest<FileSuggestion> {
    private MAX_SUGGESTIONS = 100
    protected nullSelectionCallback: ((value: string) => any) | null = null
    // allows selecting a non existing item, `cb` is called with the entered text if this item is selected.
    public allowNullSelection(cb: (value: string) => any) { this.nullSelectionCallback = cb; return this }
    protected _includeRoot: boolean = false
    public includeRoot() { this._includeRoot = true; return this }
    protected _onlyFolders: boolean = false
    protected _onlyFiles: boolean = false
    public onlyFolders() { this._onlyFiles = false; this._onlyFolders = true; return this }
    public onlyFiles() { this._onlyFiles = true; this._onlyFolders = false; return this }
    protected _filePredicate: ((file: TAbstractFile) => boolean) | null = null
    public filePredicate(predicate: (file: TAbstractFile) => boolean) { this._filePredicate = predicate; return this }

    constructor(
        app: App, 
        private textInputEl: HTMLInputElement | HTMLDivElement
    ) {
        super(app, textInputEl)
    }

    override renderSuggestion(value: FileSuggestion, el: HTMLElement) {
        if (value === null) {
            el.setText("+ " + this.getValue())
            return
        }
        renderMatches(el, value.item.path, value.match.matches)
    }

    protected override getSuggestions(query: string): FileSuggestion[] | Promise<FileSuggestion[]> {
        let allItems
        if (this._onlyFolders) {
            allItems = this.app.vault.getAllFolders(this._includeRoot)
        } else {
            allItems = this.app.vault.getAllLoadedFiles()
        }
        
        const search = prepareFuzzySearch(query)
        const searchResults: FuzzyMatch<TAbstractFile>[] = []

        for (const item of allItems) {
            if (searchResults.length >= this.MAX_SUGGESTIONS)
                break;
            if (this._onlyFiles && item instanceof TFolder)
                continue;
            if (!this._includeRoot && item instanceof TFolder && item.isRoot())
                continue
            if (this._filePredicate && !this._filePredicate(item)) 
                continue;

            const result = search(item.path)
            if (result !== null) {
                searchResults.push({
                    item: item,
                    match: result
                })
            }
        }
        sortSearchResults(searchResults)
        const suggestions: FileSuggestion[] = searchResults
        if (this.nullSelectionCallback && query) {
            suggestions.push(null)
        }
        
        return suggestions
    }
    
    override selectSuggestion(value: FileSuggestion, evt: MouseEvent | KeyboardEvent) {
        if (value !== null) {
            this.setValue(value.item.path)
            this.textInputEl.trigger("input")
        } else if (this.nullSelectionCallback) {
            this.nullSelectionCallback(this.getValue())
        }
        this.close()
        super.selectSuggestion(value, evt)
    }
}
