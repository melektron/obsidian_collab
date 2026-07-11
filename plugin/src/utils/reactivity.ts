/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
14.05.26, 14:51

Reactive variables whose value changes can be observed.
These don't work like the proposed ECMAScript observables or
rxjs, but instead like the `el.observable.Observable` from 
https://github.com/melektron/el_std_py, which is similar
to vue's ref()

Possible alternatives:
- https://github.com/nanostores/nanostores
*/

import {
    Ref as VueRef, 
    WatchCallback, 
    WatchEffect, 
    WatchOptions, 
    WatchSource, 
    effect,
    stop,
    watch
} from "@vue/reactivity"
import { useEffect, useState } from "react"


/**
 * Hook to use a Vue ref in a React component.
 * Example:
 * ```js
 * let a = ref(5)
 * 
 * function Component() {
 *     let num = useVueRef(a);
 *     return <div>
 *         {num}
 *     </div>
 * }
 * 
 * // update the component
 * a.value = 6;
 * ```
 * @note which ref is passed to the hook
 * is NOT reactive, only the value of the provided
 * ref is observed.
 * A function can be passed which internally accesses a ref
 * or reactive state as an alternative to the direct ref.
 * @param ref Vue ref (or function returning value) to observe
 */
export function useVueRef<T>(ref: VueRef<T> | (() => T)) {

    let refGetter
    if (typeof ref !== "function") {
        refGetter = (() => ref.value)
    } else {
        refGetter = ref
    }

    const [value, setValue] = useState<T>(refGetter())
    useEffect(() => {
        const runner = effect(() => {
            setValue(refGetter())
        })
        return () => {
            stop(runner)
        }
    }, [])

    return value
}

export interface DebouncedWatchOptions extends WatchOptions {
    debounceMs?: number
}

/**
 * Same as vue's watch, except it performs debouncing of
 * callback invocations. 
 * The debounce period can be specified via `debounceMs` in `options`
 * and defaults to 500ms.
 * @note The debounce implementation is basic, without special handling for
 * asynchronous callbacks. 
 */
export function debouncedWatch(
    source: WatchSource | WatchSource[] | WatchEffect | object, 
    cb?: WatchCallback | null,
    options?: DebouncedWatchOptions
) {
    let debounceTimeout: number | null = null

    watch(source, async (value, oldValue, onCleanup) => {
        if (debounceTimeout !== null) {
            clearTimeout(debounceTimeout)
        }
        debounceTimeout = setTimeout(() => {
            debounceTimeout = null
            if (cb) {
                cb(value, oldValue, onCleanup)
            }
        }, options?.debounceMs ?? 500)
    }, options)
}