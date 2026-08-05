import type {EventListener} from './EventListener';
import {LISTENER_IS_NAMED_FUNC, LISTENER_IS_OBJ} from './constants';
import type {EventName} from './types';
import {isAttachableTarget} from './utils';
import type {ListenerBucket} from './bucket';

/**
 * A bucket's identity index: an identity value → the listeners filed under it,
 * or `undefined` while nothing in this bucket is filed at all.
 *
 * Two readers, and they ask different questions of the same Map.
 *
 * **`EventStore.add()`**, which has to find an already registered listener with
 * the same
 * identity before it inserts. Up to v5.1.0 it did that with a linear `find()`
 * over the whole bucket. Only object and method-name subscriptions can ever
 * match — a function listener never dedups — so the scan stayed invisible in
 * every function-listener benchmark and was quadratic in exactly the
 * listener-object pattern this library advertises. Registering n object
 * listeners on one event name, measured: 1000 → 1.8 ms, 2000 → 6.9 ms,
 * 4000 → 27.9 ms, while 4000 function listeners cost 0.5 ms. Doubling
 * quadrupled. Through the index the same 4000 cost 0.7 ms, which is the
 * function form's own price.
 *
 * **`EventStore.detachByIdentity()`**, which has to find every listener a bare
 * `off(ε, fn)` / `off(ε, obj)` names. That one kept the linear scan a release
 * longer and paid the same quadratic price on the same shape — n listener
 * objects under one event name, then one `off(ε, o)` each. Medians of five to
 * seven, ranged over three runs of the pair, one process per variant:
 *
 * | n | scanning | through the index |
 * | --- | --- | --- |
 * | 1000 | 1.3–1.4 ms | 0.3–0.4 ms |
 * | 2000 | 4.7–5.2 ms | 0.4–0.7 ms |
 * | 4000 | 18–22 ms | 1.1–1.4 ms |
 * | 8000 | 81–91 ms | 3.1–3.7 ms |
 *
 * Doubling quadrupled, and worse than on the registration side, because the
 * scan ran to the end of the bucket after every match instead of stopping at
 * it. What is left grows a little faster than linearly, and the shape of what
 * is left is on `removeByListener()`: unsubscribing in reverse registration
 * order — `indexOf()`'s worst case rather than its best — costs ~8 ms at
 * n = 8000 instead of ~3.6, while the scan measured ~87–93 ms either way.
 * A function listener, which the index did not hold before, measures the same
 * as an object one on both halves.
 *
 * What the two readers share is the key, and the reason the index can serve
 * both: a key is a value some caller may later hand back. `add()` looks up the
 * slot carrying the *identity* of a subscription — `listener` for
 * `on(ε, 'foo', obj)`, `listenerObject` for `on(ε, 'foo', 'method', obj)` —
 * and leaves the rest of the similarity test (priority, and the method name
 * itself) to a linear pass over the candidates. `detachByIdentity()` looks up
 * the value `off()` was given and runs the identity test it would have run per
 * element. Both lists stay short: one entry for the pattern that hurt (many
 * objects, one name), never more than the priorities and method names a single
 * object uses on a single event name.
 *
 * Serving the second reader is what makes a listener with no dedup of its own
 * worth filing, so a bucket of nothing but function listeners now carries a Map
 * (~160 B) and one one-element array per listener. That is the price of the
 * measurement above, paid on subscription; `eachIndexKey()` says which slots
 * earn a key and why the set is exactly big enough.
 *
 * Written in `bucket.ts`'s `createBucket()` like `HELD_BY`, for the same
 * hidden-class reason,
 * and a clone inherits **the same Map by reference**. What makes that sound is
 * not that the two arrays are element-for-element identical — they are, but only
 * at the moment of cloning — it is that every index *entry* write goes to the
 * return value of `EventStore.bucketForMutation()`, hence always to the bucket
 * the store holds
 * afterwards, and no path ever hands a pre-clone array back in. The Map
 * therefore keeps describing the current bucket while the abandoned array drifts
 * away from it, reporting through `dedupIndexOf()` listeners it never contained.
 * Nothing reads it there: a walk dispatches, it does not dedup. Rebuilding the
 * index per clone would instead put an O(n) Map fill on the
 * mutate-during-dispatch path, which is the one path clone-on-mutate exists to
 * keep cheap.
 *
 * A second symbol on the bucket also means a second key `Reflect.ownKeys()` and
 * Jest's `toEqual` see. Nothing changes for the specs: a bucket already failed
 * against a plain array literal because of `HELD_BY`, and buckets are compared
 * by identity and length throughout — see AGENTS.md.
 */
export const DEDUP_INDEX = Symbol('eventize.EventStore.dedupIndex');

export type DedupIndex = Map<unknown, EventListener[]>;

/**
 * A bucket's index, for the specs. Nothing in the library reads it through a
 * function, and nothing outside this repo can call it: neither `EventStore` nor
 * this module is re-exported from `src/index.ts`, so this reaches no published
 * declaration —
 * and being a module-level export nothing in the bundle graph imports, it is
 * tree-shaken out of `lib/` rather than shipped like an unused class method
 * would be.
 *
 * It exists because the bookkeeping below is otherwise unobservable *by
 * construction*: a stale index entry changes no dispatch and no count. All it
 * does is keep a detached listener — and, in the key, the consumer's own object
 * — alive on an emitter the consumer believes it has unsubscribed from. Before
 * the cases that read this, deleting every `indexRemove()` call left all 33
 * suites green: a promise nothing can read is a promise nothing can hold.
 *
 * Still true now that `detachByIdentity()` reads the index too, and for the
 * same reason it was true before: a stale entry is a listener already spliced
 * out, hence already detached, hence carrying two nulled identity slots that
 * match no `off()` argument. A *missing* entry is the loud half — the removal
 * finds nothing and the listener keeps firing.
 */
export const dedupIndexOf = (
  listeners: ReadonlyArray<EventListener>,
): ReadonlyMap<unknown, ReadonlyArray<EventListener>> | undefined =>
  (listeners as ListenerBucket)[DEDUP_INDEX];

// An undefined tag is similar to nothing — both comparisons already say so.
const isSimilarListenerType = (listenerType: number | undefined) =>
  listenerType === LISTENER_IS_OBJ || listenerType === LISTENER_IS_NAMED_FUNC;

// The five slots a subscription is identified by, spelled out rather than
// bundled into a descriptor object: the sole caller is a search that runs
// before the `EventListener` exists, and a literal built per registration to
// carry them would reintroduce the very allocation that search was rebuilt to
// avoid — a smaller one, but on the same path and with the same frequency.
//
// Both listener slots are `unknown`, so swapping them compiles in silence and
// costs a comment nothing to prevent: `listener` before `listenerObject`,
// everywhere in this file, in `EventStore.ts` and in `EventListener`'s
// constructor. Add a
// parameter list that holds the pair and it takes that order too — the search
// side has no descriptor left to name its arguments for it.
//
// `unknown` for the two listener slots, not `any`: the store never calls into
// them, it only compares them by identity. Saying `any` here claimed a
// knowledge the registry does not have and switched off checking inside a
// function whose whole job is comparison.
const isSimilar = (
  listenerType: number | undefined,
  priority: number,
  eventName: EventName,
  listener: unknown,
  listenerObject: unknown,
  candidate: EventListener,
) => {
  if (listenerType === candidate.listenerType) {
    return (
      priority === candidate.priority &&
      eventName === candidate.eventName &&
      listenerObject === candidate.listenerObject &&
      listener === candidate.listener
    );
  }
  return false;
};

/**
 * The slot a subscription's identity lives in, and therefore the key
 * `EventStore.add()`'s dedup lookup reads. Only meaningful for the two listener types that can dedup
 * at all — see `DEDUP_INDEX`.
 *
 * Takes the three slots rather than an `EventListener`, because its two callers
 * hold different things: `eachIndexKey()` files a listener that exists,
 * `findSimilarListener()` searches for one that may not be built yet. The rule
 * which slot carries the identity is the same for both and stays written once.
 *
 * On a listener, read it *before* `detach()`: detaching nulls both slots, so a
 * detached listener no longer knows where it was filed.
 */
const dedupKeyOf = (
  listenerType: number | undefined,
  listener: unknown,
  listenerObject: unknown,
): unknown => (listenerType === LISTENER_IS_OBJ ? listener : listenerObject);

/**
 * Whether a value can be the *listener* argument of a removal that reaches
 * `detachByIdentity()` — and therefore whether filing a listener under this
 * slot buys anything, or only a Map entry nobody will ever look up.
 *
 * The three excluded kinds are excluded because `EventStore.remove()` routes
 * them elsewhere long before the identity fall-through: a nullish listener goes
 * to `removeAllListeners()`, and a string or symbol goes to
 * `removeByEventName()` — or, with a listener object named, through `off()`'s
 * `forceRemove` to the association path. This function and that routing are one
 * rule read from both ends; widening the routing means widening this.
 *
 * Everything else can arrive: a function, an object, and — only through a
 * directly constructed `EventListener`, never through `on()` — a number or a
 * boolean.
 */
const isRemovalKey = (value: unknown): boolean =>
  value != null && typeof value !== 'string' && typeof value !== 'symbol';

/**
 * Visits every key one listener is filed under, exactly once each. `indexAdd()`
 * and `indexRemove()` are this function with the two halves of the pairing rule
 * plugged in, which is the whole reason it exists: neither can file or unfile a
 * key the other does not know about. AGENTS.md says why the unfiling half is
 * the one worth that trouble — it is the failure nothing goes red for.
 *
 * At most two distinct keys out of three candidate slots:
 *
 * - the **dedup key**, for the two types that can dedup, filed whatever it
 *   holds. Not narrowed by `isRemovalKey()`: `on(ε, 'foo', 'toFixed', 42)`
 *   dedups against a primitive listener object today and has to keep doing so.
 * - the **identity slot**, when a removal could name it. Covers `off(ε, fn)` on
 *   a function listener and `off(ε, obj)` on an object one.
 * - the **listener-object slot**, when it is a value `off(ε, obj)` could name.
 *   That is the object-or-function test rather than `isRemovalKey()`, because
 *   the association disjunct in `detachByIdentity()` is gated on exactly that.
 *
 * Together those cover every listener a removal by identity can match, and that
 * coverage is what lets `detachByIdentity()` read the index instead of the
 * bucket: a listener not filed under the argument cannot match it. The
 * contrapositive is the thing to check when changing either end — a match needs
 * `listener === x` or `listenerObject === x`, so it needs a slot holding `x`,
 * so it needs the key one of the branches below writes.
 *
 * `visit` is one of two module-level functions, never a closure: this runs once
 * per subscription and once per removal.
 */
const eachIndexKey = (
  index: DedupIndex,
  listener: EventListener,
  visit: (index: DedupIndex, key: unknown, listener: EventListener) => void,
): void => {
  const identity = listener.listener;
  const context = listener.listenerObject;

  const dedupable = isSimilarListenerType(listener.listenerType);
  const dedupKey = dedupable
    ? dedupKeyOf(listener.listenerType, identity, context)
    : undefined;
  if (dedupable) {
    visit(index, dedupKey, listener);
  }
  if (isRemovalKey(identity) && !(dedupable && dedupKey === identity)) {
    visit(index, identity, listener);
  }
  if (
    isAttachableTarget(context) &&
    context !== identity &&
    !(dedupable && dedupKey === context)
  ) {
    visit(index, context, listener);
  }
};

const fileUnder = (
  index: DedupIndex,
  key: unknown,
  listener: EventListener,
): void => {
  const candidates = index.get(key);
  if (candidates === undefined) {
    index.set(key, [listener]);
  } else {
    candidates.push(listener);
  }
};

/**
 * The two early returns are unreachable through `on()` / `off()`: a listener
 * reaches this only under a key `fileUnder()` wrote for it, and no other path
 * empties a candidate list. They stay because the alternative to a missed guard
 * here is `indexOf()` on `undefined` or a `splice(-1, 1)` that silently unfiles
 * a listener still in the bucket, and `EventStore.spec.ts` pins both by
 * corrupting the index by hand.
 */
const unfileFrom = (
  index: DedupIndex,
  key: unknown,
  listener: EventListener,
): void => {
  const candidates = index.get(key);
  if (candidates === undefined) return;
  const idx = candidates.indexOf(listener);
  if (idx < 0) return;
  candidates.splice(idx, 1);
  if (candidates.length === 0) index.delete(key);
};

/** Files a freshly inserted listener, creating the bucket's index on first use. */
export const indexAdd = (
  bucket: ListenerBucket,
  listener: EventListener,
): void => {
  eachIndexKey((bucket[DEDUP_INDEX] ??= new Map()), listener, fileUnder);
};

/**
 * Unfiles a listener that is being spliced out. Every path that removes a single
 * listener from a bucket calls it, and calls it before `detach()`.
 *
 * A path that forgot to would not corrupt `EventStore.add()`'s lookup:
 * `findSimilarListener()` still runs the full `isSimilar()` over whatever the
 * index hands it, and a detached listener can never pass that test — `detach()`
 * sets both of its identity slots to `null`, while a listener arriving at
 * `add()` always carries a non-null one (`_subscribeTo()` rejects a falsy
 * listener before it ever gets here). Nor would it corrupt
 * `detachByIdentity()`, for the same reason: two nulled slots match no `off()`
 * argument. What it would leave behind is the entry, and with it a strong
 * reference to the object in the key, on an emitter the consumer believes it
 * has unsubscribed from.
 */
export const indexRemove = (
  bucket: ListenerBucket,
  listener: EventListener,
): void => {
  const index = bucket[DEDUP_INDEX];
  if (index !== undefined) {
    eachIndexKey(index, listener, unfileFrom);
  }
};

/**
 * The lookup `EventStore.add()` makes before it inserts. At most one entry in a bucket can
 * ever satisfy `isSimilar()` — a second one would have deduped into the first
 * when it was registered — so which candidate comes back first is not a
 * question, and the index answers exactly what the linear scan answered.
 *
 * It searches from the *description* of a subscription, never from a listener
 * instance, and that is the whole point: a registration that aggregates now
 * builds nothing at all. Measured on repeated `on(ε, 'foo', service)` against
 * one identity, dropping the throwaway instance is worth ~112 B and ~8 ns per
 * call — the numbers are in the doc comment at `registerEventListener()`.
 */
export const findSimilarListener = (
  listenerType: number | undefined,
  priority: number,
  eventName: EventName,
  listener: unknown,
  listenerObject: unknown,
  bucket: ListenerBucket,
) => {
  if (!isSimilarListenerType(listenerType)) return undefined;
  const index = bucket[DEDUP_INDEX];
  if (index === undefined) return undefined;
  const candidates = index.get(
    dedupKeyOf(listenerType, listener, listenerObject),
  );
  if (candidates === undefined) return undefined;
  // for…of, not find(): the callback find() wants is a fresh closure on every
  // subscription, and this list is short enough that the loop is the whole cost.
  for (const candidate of candidates) {
    if (
      isSimilar(
        listenerType,
        priority,
        eventName,
        listener,
        listenerObject,
        candidate,
      )
    ) {
      return candidate;
    }
  }
  return undefined;
};
