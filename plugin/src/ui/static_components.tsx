/*
ELEKTRON © 2025 - now
Written by melektron
www.elektron.work
25.05.25, 18:58

Components for re-use

*/

// this file uses dom-chef for static rendering and is not reactive.
/** @jsxRuntime classic */
/** @jsx h */
/** @jsxFrag DocumentFragment */

import { addIcon, Notice, setIcon } from "obsidian";
import { h } from "dom-chef";

// this is needed to fix intellisense for non-reactive JSX in 
// a partially reactive app.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

interface IconProps {
    iconId: string
    style: React.CSSProperties
};

const Icon = (props: IconProps) => {
    let ret = <div style={{
        width: "var(--icon-size)",
        height: "var(--icon-size)"
    }} />
    // we do a questionable botch to override the setAttribute method because props
    // are not actually passed to components in "dom-chef". We only get the defaults
    // if specified, the others are instead applied using "setAttribute"
    const old_setAttribute = ret.setAttribute.bind(ret)
    ret.setAttribute = (qualifiedName: string, value: string) => {
        if (qualifiedName === "iconId") {
            if (value === "collab-icon-loading") {
                // special case for our custom loading icon
                // that looks like obsidian's built-in loader
                ret.addClass("collab-icon-loading")
            } else {
                // otherwise use obsidian's default icon helper to
                // set an icon from lucide
                setIcon(ret, value);
                ret.removeClass("collab-icon-loading")
            }
        } else
            old_setAttribute(qualifiedName, value);
    }
    return ret;
}

export class NoticeWithIcon extends Notice {

    iconEl: HTMLElement 
    /**
     * Element contained inside the icon wrapper
     * (added by NoticeWithIcon)
     */
    innerContainerEl: HTMLElement

    constructor(message: string | DocumentFragment, duration?: number, iconId: string = "info", containerClass?: string) {
        //this.innerMessageEl = message

        let container = <span className={containerClass}>
            {message}
        </span>

        let icon = <Icon iconId={iconId} style={{
            marginRight: "0.3rem"
        }} />

        let element = <div style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center"
        }}>
            {icon}
            {container}
        </div>;

        super(element, duration);
        this.iconEl = icon
        this.innerContainerEl = container;
    }

    override setMessage(message: string | DocumentFragment): this {
        // this comes from dom-chef: 
        // https://github.com/vadimdemedes/dom-chef/blob/d6fb65c65be6912b6d4361b83cc369cf1fb684fe/index.ts#L101
        if (message instanceof Node) {
			this.innerContainerEl.setChildrenInPlace([message]);
		} else if (
			typeof message !== 'boolean'
			&& typeof message !== 'undefined'
			&& message !== null
		) {
			this.innerContainerEl.setChildrenInPlace([activeDocument.createTextNode(message)]);
		}
        return this
    }

    appendMessage(message: string | DocumentFragment) {
        if (message instanceof Node) {
			this.innerContainerEl.appendChild(message);
		} else if (
			typeof message !== 'boolean'
			&& typeof message !== 'undefined'
			&& message !== null
		) {
            this.innerContainerEl.appendText(message)
		}
        return this
    }

    hideAfter(seconds: number) {
        setTimeout(() => this.hide(), seconds * 1000);
    }
}

export class ErrorNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        super(message, 0, "circle-x", "collab-error-notice")
    }
}

export class WarningNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        super(message, 0, "triangle-alert", "collab-warning-notice")
    }
}

export class InfoNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        console.log("info notice construct")
        super(message, 0, "info", "collab-info-notice")
    }
}

export class DebugNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        super(message, 0, "bug", "collab-debug-notice")
    }
}

export class LoadingNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        console.log("loading notice construct")
        super(message, 0, "collab-icon-loading", "collab-loading-notice")
    }

    completed() {
        this.iconEl.setAttribute("iconId", "circle-check")
        return this
    }

    failed() {
        this.iconEl.setAttribute("iconId", "circle-x")
        return this
    }
}