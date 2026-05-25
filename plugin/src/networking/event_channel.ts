/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
25.05.26, 17:56

Simple event emitter that can carry a specific data type
and supports the usual on, off, once subscription
model with some quality-of-life improvements
*/

export type Listener<T = any> = (data: T) => void

/**
 * Simple event channel for emitting data
 * events to subscribers.
 * Supports on-once-off subscription pattern.
 * `on()` returns the listener for easy storage,
 * `off()` expects the listener or null, and does nothing
 * if null is passed. This way the subscription can be
 * easily canceled:
 * ```js
 * const mycb: Listener<number> | null = null
 * const evt = new EventChannel<number>()
 * 
 * mycb = evt.on((data) => {
 *     console.log(data)
 * })
 * // later
 * mycb = evt.off(mycb)
 * ```
 */
export class EventChannel<T = void> {
    listeners: Set<Listener<T>> = new Set()
    listenersOnce: Set<Listener<T>> = new Set()

    /**
     * Adds `cb` as a listener and returns it for easy storage.
     * @param cb event listener callback. Called every time
     * the event is `emit()`ed.
     * @returns cb for easy storage
     */
    on(cb: Listener<T>) {
        this.listeners.add(cb)
        return cb
    }

    /**
     * Adds `cb` as a listener for one event and returns it for easy storage.
     * @param cb event listener callback. Called next time
     * the event is `emit()`ed and is then automatically removed.
     * @returns cb for easy storage
     */
    once(cb: Listener<T>) {
        this.listenersOnce.add(cb)
        return cb
    }

    /**
     * Removes a specific event listener registered
     * with `on()` or `once()`.
     * @param cb event listener to remove. must be the exact instance
     * of the function that was passed to (and returned by) `on()` or `once()`.
     * If passed `null`, it does nothing. If the listener is not null but still
     * doesn't exist, it also does nothing.
     * @returns null (can be used to directly clear the listener reference)
     */
    off(cb: Listener<T> | null) {
        if (cb === null) return null;
        if (this.listeners.delete(cb)) return null;
        this.listenersOnce.delete(cb)
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
        this.listeners.forEach((cb) => cb(data))
        this.listenersOnce.forEach((cb) => cb(data))
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
