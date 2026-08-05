import type {EventListener} from './EventListener';
import type {EventName} from './types';
import {DEDUP_INDEX} from './dedupIndex';
import type {DedupIndex} from './dedupIndex';

/**
 * A listener bucket: the array itself, plus the count of walks currently
 * stepping through it.
 *
 * Held-ness is a property of the *array*, not of the store, so this is where it
 * lives. `EventStore.forEach()` increments the one or two buckets it walks and
 * decrements them in its `finally`; `EventStore.bucketForMutation()` reads one
 * field. Both are O(1) and neither depends on how deeply emits are nested — the
 * store used to keep a stack of held slots and scan it, which cost one
 * comparison per enclosing walk on exactly the case the whole design is for: a
 * mutation of a bucket nobody is holding, which finds no match and therefore
 * always scans the lot.
 *
 * A symbol key, not a name, and not a `defineProperty` descriptor. All three
 * spellings measure the same — symbol against name came out at 0.985× to 1.026×
 * across nine dispatch shapes, mean 1.002 — so the tiebreaker is what each one
 * lets escape. A named key shows up in `Object.keys()`, `for…in` and an object
 * spread of a bucket; the symbol does not, and a descriptor would buy a
 * hidden-class shape nobody else in the store shares, on a read that sits in
 * the hot path.
 *
 * What the symbol still does **not** hide, verified rather than assumed:
 * `Reflect.ownKeys()` and `Object.getOwnPropertySymbols()` list it, and Jest's
 * `toEqual`, `toStrictEqual` and `toMatchObject` all compare own enumerable
 * symbols, so a bucket never equals a plain array literal — the same three fail
 * against a bare-named key too, and the control with a plain array passes.
 * **Compare buckets by identity and length**, as every spec here does.
 * Unaffected either way: `JSON.stringify`, array spread, `slice`, `concat`,
 * `filter`, `flat`, `toHaveLength`, `toBe`, `toContain` and
 * `expect.arrayContaining`.
 */
export const HELD_BY = Symbol('eventize.EventStore.heldBy');

export interface ListenerBucket extends Array<EventListener> {
  [HELD_BY]: number;
  [DEDUP_INDEX]: DedupIndex | undefined;
}

/**
 * The only place a bucket is born, and one of the two casts this arrangement
 * costs — `dedupIndexOf()` in `dedupIndex.ts` holds the other, for the specs.
 *
 * The count is written **immediately** after the array is created, before any
 * element goes in, so every bucket in the store passes through the same hidden
 * class in the same order and the field load in
 * `EventStore.bucketForMutation()` stays monomorphic. `slice(0)` copies
 * elements and nothing else — a clone that skipped this would arrive without
 * the property, take a different shape, and quietly deoptimise every read of
 * it. It would also read as *held* (`undefined === 0` is false) and buy itself
 * one copy it does not owe, which installs a well-formed clone and hides the
 * mistake from then on; three specs in `EventStore.spec.ts` watch the four
 * places a bucket can be born.
 *
 * The source is a `ListenerBucket` rather than any array of listeners, and that
 * is the point: a clone has to carry the dedup index of the array it copies, so
 * only something that already has one may be cloned.
 */
export const createBucket = (source?: ListenerBucket): ListenerBucket => {
  const bucket = (
    source === undefined ? [] : source.slice(0)
  ) as ListenerBucket;
  bucket[HELD_BY] = 0;
  bucket[DEDUP_INDEX] = source === undefined ? undefined : source[DEDUP_INDEX];
  return bucket;
};

const rejectMutation = (container: string) => (): never => {
  throw new Error(
    `EventStore: ${container} is the shared empty stand-in — replace it, never mutate it`,
  );
};

/**
 * Shared stand-ins for the two listener containers, one pair per module
 * instance — the same arrangement `EventKeeper` runs for its retain index, and
 * for the same reason: most emitters are eventized long before anyone
 * subscribes, and plenty never see an `on()` at all. A `new Map()` plus a
 * bucket in the constructor spent both allocations on every `eventize(obj)`
 * regardless. Both fields start out pointing here, every write path swaps in a
 * real container first, and every reader — `EventStore`'s `forEach()`,
 * `peekListeners()`, `getSubscriptionCount()`, the `removeBy*` family — works
 * unchanged, because all any of them touch is `.get()`, `.forEach()`,
 * `.length`.
 *
 * The Map is poisoned exactly like the keeper's, and for the reason spelled out
 * there: `Object.freeze()` seals a Map's own properties and leaves `set()`,
 * `delete()` and `clear()` working on the internal slots, so one missed
 * materialization would hand one emitter's listeners to every other emitter
 * this module built. Throwing stubs turn that silent corruption into a failure
 * at the first offending call.
 *
 * The bucket is the interesting half, because an array is not a Map: everything
 * that mutates one goes through an ordinary property write — the elements,
 * `length`, and the two symbol slots — so `Object.freeze()` really does close
 * it, and closes the three the stubs cannot reach. `bucket[HELD_BY] += 1` and
 * the `??= new Map()` in `dedupIndex.ts`'s `indexAdd()` throw on the frozen
 * stand-in, which are precisely the two writes that would otherwise make one
 * emitter's dispatch bookkeeping and one emitter's index visible to all of
 * them. The stubs on top are for the message: a stray `splice()` says which
 * object it hit and what to do instead, where the native error would only
 * report a read-only property of `[object Array]`.
 *
 * Nothing gets through on the strength of writing what is already there.
 * Assignment goes to `[[Set]]`, which gives up the moment it finds the own
 * property non-writable and never compares values — `length = 0` on the empty
 * stand-in and `[DEDUP_INDEX] = undefined` on the unindexed one throw exactly
 * like a write that would have changed something. Only a redefinition
 * (`Object.defineProperty` with the same value) is let through, and nothing
 * here redefines anything. Every module in `src/` is strict, and
 * `tsconfig.json` pins that with `alwaysStrict` — a sloppy-mode caller would
 * see these same writes fail silently instead, which is one more reason the
 * store never offers the stand-in to one.
 *
 * Born in `createBucket()` like every other bucket, which is not a formality —
 * see the note there. A hand-rolled `[]` would arrive without `HELD_BY`, read
 * as *held*, and send the first mutation of a materialized bucket through a
 * clone it does not owe.
 */
export const EMPTY_NAMED_LISTENERS: Map<EventName, ListenerBucket> =
  Object.freeze(
    Object.defineProperties(new Map<EventName, ListenerBucket>(), {
      set: {value: rejectMutation('namedListeners')},
      delete: {value: rejectMutation('namedListeners')},
      clear: {value: rejectMutation('namedListeners')},
    }),
  );

export const EMPTY_CATCH_EM_ALL: ListenerBucket = createBucket();

// Every mutator `Array.prototype` carries, not only the `splice()`
// `EventStore.ts` uses: the point of a stand-in is to catch the path nobody
// thought of. Defined rather than assigned, so they arrive non-enumerable and
// stay out of `Object.keys()`, a spread and Jest's `toEqual` — same treatment
// `HELD_BY` and `DEDUP_INDEX` get from being symbols.
for (const method of [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]) {
  Object.defineProperty(EMPTY_CATCH_EM_ALL, method, {
    value: rejectMutation(`the catch-em-all bucket (${method}())`),
  });
}

Object.freeze(EMPTY_CATCH_EM_ALL);

// Detaching is a mutation of the listeners, never of the array holding them,
// so it needs no clone-on-mutate treatment and is safe to run over a bucket a
// dispatch is currently walking: that is precisely how a wiped listener gets
// skipped mid-walk (EventListener.apply() bails on isRemoved).
//
// The index goes with them. Both callers are letting go of the whole bucket —
// one drops the map entry, the other clears the map — so there is nothing left
// to file. Dropping it here rather than at those two call sites also covers the
// bucket that survives emptied: EventStore.removeAllListeners() truncates an
// unheld wildcard array in place and keeps it, and an index left standing on it
// would hold every detached listener plus a strong reference to the object each
// one was keyed by, none of which the truncated array itself retains any more.
//
// What this releases is the slot on the bucket it is given, not the contents of
// the Map. A walk still holding the pre-clone array holds the same Map through
// that array's own slot, and it survives until the walk returns — bounded by
// the dispatch, so not a leak, but the one case where the sentence above does
// not hold. Clearing the Map instead would buy only the keys for that stretch:
// the held array is not truncated either, so it keeps every detached listener
// alive regardless.
export const detachAll = (bucket: ListenerBucket) => {
  bucket.forEach((listener) => listener.detach());
  bucket[DEDUP_INDEX] = undefined;
};
