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
import { useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react"
import { SettingsContext, CollabSettings } from "src/settings"
import { ReadonlyDeep } from "type-fest"


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

/**
 * Use a setting value in a reactive manner.
 * 
 * Example:
 * ```js
 * const url = useSetting(cfg => cfg.serverUrl)
 * ```
 * 
 * @note 
 * - the `SettingsContext` must be available.
 * - the `selector` function must not depend on any reactive
 *   or ideally any outside state. Changes to the getter will not
 *   properly be reflected in the result.
 * 
 * 
 * @param selector function that receives the settings as `cfg` 
 * and must return the desired settings property.
 * @returns Reactive settings property.
 * 
 */
export function useSetting<T>(selector: (cfg: ReadonlyDeep<CollabSettings>) => T) {
    const settings = useContext(SettingsContext)
    // the settings may be mutated in a way that can't be compared, 
    // so we always force an update when settings change. They don't change
    // too regularly anyway.
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    
    useEffect(() => {
        const listener = settings.updatedEvent.on(cfg => {
            forceUpdate()
        })
        return () => {
            settings.updatedEvent.off(listener)
        }
    }, [])
    
    return selector(settings.data)

    // we do not use useSyncExternalStore as our settings object
    // is mutated which wouldn't always be picked up by that.
    // Without it we have the small downside of any (possibly insignificant)
    // settings change may trigger a rerender, but settings shouldn't change often anyway.
    
    //return useSyncExternalStore(
    //    (onStoreChange) => {
    //        const listener = settings.updatedEvent.on(onStoreChange);
    //        return () => settings.updatedEvent.off(listener);
    //    },
    //    () => selector(settings.data),
    //);
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