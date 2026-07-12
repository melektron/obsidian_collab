/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
12.07.26, 22:24

Simple logger that supports levels and namespaces
*/

import * as cm_state from '@codemirror/state' // eslint-disable-line

type Level = "X" | "D" | "I" | "W" | "E"

export class Logger {
    private parent: Logger | null = null

    constructor(public readonly namespace: string) {}

    child(namespace: string): Logger {
        const logger = new Logger(namespace)
        logger.parent = this
        return logger
    }

    private get fullNamespace(): string {
        const parts: string[] = [];
        let current: Logger | null = this;

        while (current) {
            parts.push(current.namespace);
            current = current.parent;
        }

        return parts.reverse().join(".");
    }

    private get color(): string {
        // Deterministically map namespace -> hue
        let hash = 0;
        for (const c of this.fullNamespace) {
            hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
        }

        const hue = Math.abs(hash) % 360;
        return `color: hsl(${hue} 70% 55%); font-weight: bold;`;
    }

    /*
    private levelColor(level: Level) {
        return {
            "X": "background-color: #AA00FF; font-weight: bold;",
            "D": "background-color: #008800; font-weight: bold;",
            "I": "background-color: #0088FF; font-weight: bold;",
            "W": "background-color: #FFAA00; font-weight: bold;",
            "E": "background-color: #FF0000; font-weight: bold;",
        }[level]
    }
    */

    private log(
        fn: (...args: any[]) => void,
        level: Level,
        args: unknown[],
    ): void {
        fn(
            `%c${level} [${this.fullNamespace}]%c`,
            this.color,
            "",
            ...args,
        );
    }

    experiment(...args: unknown[]): void {
        this.log(console.debug, "X", args);
    }
    
    debug(...args: unknown[]): void {
        this.log(console.debug, "D", args);
    }

    info(...args: unknown[]): void {
        this.log(console.info, "I", args);
    }

    warn(...args: unknown[]): void {
        this.log(console.warn, "W", args);
    }

    error(...args: unknown[]): void {
        this.log(console.error, "E", args);
    }
}

export const loggerFacet = cm_state.Facet.define<Logger, Logger>({
    combine(inputs) {
        return inputs[inputs.length - 1]
    }
})
