

import { addIcon, Notice, setIcon } from "obsidian";
import { h } from "dom-chef";

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
    const old_setAttribute = ret.setAttribute
    ret.setAttribute = (qualifiedName: string, value: string) => {
        if (qualifiedName === "iconId")
            setIcon(ret, value);
        else
            old_setAttribute(qualifiedName, value);
    }
    return ret;
}

export class NoticeWithIcon extends Notice {

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

        let element = <div style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center"
        }}>
            <Icon iconId={iconId} style={{
                marginRight: "0.3rem"
            }} />
            {container}
        </div>;

        super(element, duration);
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
        super(message, 0, "circle-x", "collab_error_notice")
    }
}

export class WarningNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        super(message, 0, "triangle-alert", "collab_warning_notice")
    }
}

export class InfoNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        console.log("info notice construct")
        super(message, 0, "info", "collab_info_notice")
    }
}

export class DebugNotice extends NoticeWithIcon {
    constructor(message: string | DocumentFragment) {
        super(message, 0, "bug", "collab_debug_notice")
    }
}