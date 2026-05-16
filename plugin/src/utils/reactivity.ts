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
    ref, 
    shallowRef, 
    reactive, 
    shallowReactive, 

    Ref as VueRef, 
    ShallowRef, 
    Reactive,
    ShallowReactive,

    effect,
    stop
} from "@vue/reactivity"
import { useEffect, useState } from "react"



export {
    ref,
    shallowRef,
    reactive,
    shallowReactive,

    effect,
    stop,
}

export type {
    VueRef,
    ShallowRef,
    Reactive,
    ShallowReactive
}

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
 * @param ref Vue ref to observe
 */
export function useVueRef<T>(ref: VueRef<T>) {
    const [value, setValue] = useState<T>(ref.value)
    useEffect(() => {
        const runner = effect(() => {
            setValue(ref.value)
        })
        return () => {
            stop(runner)
        }
    }, [])

    return value
}

