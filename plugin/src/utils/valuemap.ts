/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
20.05.26, 18:41

Map-like object that indexes by object values
using json-stable-stringify

Inspired by https://tomcant.dev/posts/2022/04/value-objects-as-map-keys-in-typescript/

*/

import { stringify as stableStringify} from "safe-stable-stringify"


export class MapKey {
    toKeyString(): string {
        return stableStringify(this)
    }
}

type PrimitiveKey = string | number | boolean | bigint | symbol

export class ValueMap<K extends MapKey | PrimitiveKey, V> implements Map<K, V> {
  private readonly items: Map<PrimitiveKey, { key: K; value: V }>;

  constructor(entries: [K, V][] = []) {
    this.items = new Map(
      entries.map(([key, value]) => [this.toPrimitiveKey(key), { key, value }])
    );
  }

  clear(): void {
    this.items.clear();
  }

  delete(key: K): boolean {
    return this.items.delete(this.toPrimitiveKey(key));
  }

  get(key: K): V | undefined {
    return this.items.get(this.toPrimitiveKey(key))?.value;
  }

  has(key: K): boolean {
    return this.items.has(this.toPrimitiveKey(key));
  }

  set(key: K, value: V): this {
    this.items.set(this.toPrimitiveKey(key), { key, value });
    return this;
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [, { key, value }] of this.items) {
      yield [key, value];
    }
  }

  *entries(): IterableIterator<[K, V]> {
    yield* this[Symbol.iterator]();
  }

  *keys(): IterableIterator<K> {
    for (const [, { key }] of this.items) {
      yield key;
    }
  }

  *values(): IterableIterator<V> {
    for (const [, { value }] of this.items) {
      yield value;
    }
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    for (const [, { key, value }] of this.items) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  get size(): number {
    return this.items.size;
  }

  get [Symbol.toStringTag](): string {
    return this.constructor.name;
  }

  private toPrimitiveKey(key: K): PrimitiveKey {
    if (key instanceof MapKey) {
        return key.toKeyString()
    }
    return key
  }
}