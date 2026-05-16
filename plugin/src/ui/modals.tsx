/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
15.05.26, 16:48

Custom modals, trying to lean on what obsidian itself uses internally
but doesn't publish via the API
*/

import { App, Modal } from "obsidian";


/**
 * This class allows creating standardized modals with buttons and checkboxes.
 * This is inspired by compiled obsidian code for the same thing 
 * (e.g. used by confirm deletion modal). Why this isn't a public API
 * I am unsure, as it would help to improve UI consistency.
 */
export class ConfirmationModal extends Modal {
    buttonContainerEl: HTMLElement;

    constructor(app: App) {
        super(app)
        this.containerEl.addClass("mod-confirmation")
        this.buttonContainerEl = this.modalEl.createDiv("modal-button-container")
    }

    /**
     * Adds a checkbox to the dialog, to the left of the button row.
     * This is intended for "Don't show again" style checkboxes.
     * Only a single one should be added per dialog.
     * Thought this works, it should not be used on mobile because 
     * it is not styled for that purpose
     * @param label text of the label
     * @param cb callback function executed when checkbox is clicked.
     * Useful to retrieve the checkbox value.
     */
    addCheckbox(label: string, cb: (this: HTMLInputElement, ev: PointerEvent) => any) {
        this.buttonContainerEl.createEl("label", { cls: "mod-checkbox" }, (el) => {
            el.createEl("input", {
                attr: {
                    tabindex: -1
                },
                type: "checkbox"
            }).addEventListener("click", cb)
            el.appendText(label)
        })
        return this
    }

    /**
     * Adds a button to the dialog. The button closes the modal by default.
     * @param classes CSS classes to add to button element
     * @param text text of the button
     * @param cb callback when button is clicked (may be async, in which case 
     * the modal waits until resolved until it is closed). If it returns 
     * or resolves to something truthy, the modal is NOT closed.
     * @returns this (for chaining)
     */
    addButton(classes: string | string[], text: string, cb: (e: PointerEvent) => any) {
        classes = Array.isArray(classes) ? classes : [classes]
        let button = this.buttonContainerEl.createEl("button", {
            cls: classes.join(" "),
            text: text
        });
        button.addEventListener("click",  async (event) => {
            try {
                button.addClass("mod-loading");

                const ok = await cb(event);

                if (!ok) this.close();
            } finally {
                button.removeClass("mod-loading");
            }
        })
        return this
    }

    /**
     * convenience method for adding a button with mod-cancel class
     */
    addCancelButton(e: () => any) {
        // obsidian had gm.dialogue.buttonCancel() for text, maybe we can do translation as well?
        return this.addButton("mod-cancel", "Cancel", () => {
            if (e) e()
        })
    }

    onClose() {
        // Obsidian has this here, do we need it? what does it do?
        //Cv()
    }
}

/**
 * Modal with a single action that is highlighted (default action) 
 * and a cancel option. Useful for simple Yes/No confirmation.
 */
export class CtaModal extends ConfirmationModal {
    protected ctaCls = "mod-cta"
    protected ctaText = ""
    promise?: Promise<boolean>
    resolve?: (value: boolean | PromiseLike<boolean>) => void

    constructor(app: App) {
        super(app)
        this.scope.register([], "Enter", this.accept.bind(this))
    }

    /**
     * Sets the text and styling of the called action
     * @param cls CSS class to add (e.g. `mod-warning`)
     * @param text Text of the button
     */
    setCta(cls: string, text: string) {
        this.ctaCls = cls
        this.ctaText = text
        return this
    }

    override onOpen() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve
        })
    }

    protected accept() {
        if (this.resolve) this.resolve(true)
    }
    protected cancel() {
        if (this.resolve) this.resolve(false)
    }
    
    /**
     * Shows the Call-to-action modal and prompts the user this way.
     * @returns promise that resolves to true if the Cta action
     * was used or false if the modal was canceled.
     */
    prompt(): Promise<boolean> {
        this.addButton(this.ctaCls, this.ctaText, this.accept.bind(this))
        this.addCancelButton(this.cancel.bind(this))
        this.open()
        return this.promise!    // this.open() creates the promise through onOpen()
    }
    
    override onClose() {
        super.onClose()
        this.cancel()
    }
}
