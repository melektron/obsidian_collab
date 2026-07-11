/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
25.05.26, 12:17

Event channel that passes data
to particular subscribers based
on a specific key in the data.
Behaves otherwise equivalent to EventChannel.
*/

import { Listener } from "./event_channel"


export class TargetedEventChannel<
    T extends object,
    K extends keyof T
> {
    listeners: Map<T[K], Set<Listener<T>>> = new Map()
    listenersOnce: Map<T[K], Set<Listener<T>>> = new Map()

    constructor(
        private readonly criterionKey: K
    ) { }

    /**
     * Adds `cb` as a listener and returns it for easy storage.
     * @param criterion criterion to filter events by.
     * @param cb event listener callback. Called every time
     * the event is `emit()`ed with the criterion key matching `criterion`.
     * @returns cb for easy storage
     */
    on(criterion: T[K], cb: Listener<T>) {
        let set = this.listeners.get(criterion)
        if (set === undefined) {
            this.listeners.set(criterion, new Set([cb]))
        } else {
            set.add(cb)
        }
        
        return cb
    }

    /**
     * Adds `cb` as a listener for one event and returns it for easy storage.
     * @param criterion criterion to filter events by.
     * @param cb event listener callback. Called next time
     * the event is `emit()`ed with the criterion key matching 
     * `criterion` and is then automatically removed.
     * @returns cb for easy storage
     */
    once(criterion: T[K], cb: Listener<T>) {
        let set = this.listenersOnce.get(criterion)
        if (set === undefined) {
            this.listenersOnce.set(criterion, new Set([cb]))
        } else {
            set.add(cb)
        }
        
        return cb
    }

    /**
     * Removes a specific event listener registered
     * with `on()` or `once()`.
     * @param criterion criterion the listener was registered with. must match exactly.
     * @param cb event listener to remove. must be the exact instance
     * of the function that was passed to (and returned by) `on()` or `once()`.
     * If passed `null`, it does nothing. If the listener is not null but still
     * doesn't exist, it also does nothing.
     * @returns null (can be used to directly clear the listener reference)
     */
    off(criterion: T[K], cb: Listener<T> | null) {
        if (cb === null) return null;
        let set = undefined
        if (set = this.listeners.get(criterion)) {
            const wasDeleted = set.delete(cb)
            if (set.size === 0)
                this.listeners.delete(criterion)
            if (wasDeleted) return null;
        }
        if (set = this.listenersOnce.get(criterion)) {
            const wasDeleted = set.delete(cb)
            if (set.size === 0)
                this.listenersOnce.delete(criterion)
            if (wasDeleted) return null;
        }
        return null
    }

    /**
     * Emits an event, calling every listener
     * and passing `data` to each of them.
     * `once()` listeners are removed after
     * they are called.
     * @param data data to be passed to listeners
     */
    emit(data: T) {
        this.listeners.get(data[this.criterionKey])?.forEach((cb) => cb(data))
        this.listenersOnce.get(data[this.criterionKey])?.forEach((cb) => cb(data))
        this.listenersOnce.clear()
    }

    /**
     * removes all listeners
     */
    destroy() {
        this.listeners.clear()
        this.listenersOnce.clear()
    }

}