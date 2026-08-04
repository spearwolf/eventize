import {detectListenerType, EventListener} from './EventListener';
import type {OnceObligation} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';
import type {EventName, ListenerObjectType} from './types';
import {isAttachableTarget, isCatchEmAll, isEventName} from './utils';

type HasPriorityOrIdType = {priority: number; id: number};

/**
 * A listener bucket: the array itself, plus the count of walks currently
 * stepping through it.
 *
 * Held-ness is a property of the *array*, not of the store, so this is where it
 * lives. `forEach()` increments the one or two buckets it walks and decrements
 * them in its `finally`; `bucketForMutation()` reads one field. Both are O(1)
 * and neither depends on how deeply emits are nested — the store used to keep a
 * stack of held slots and scan it, which cost one comparison per enclosing walk
 * on exactly the case the whole design is for: a mutation of a bucket nobody is
 * holding, which finds no match and therefore always scans the lot.
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
const HELD_BY = Symbol('eventize.EventStore.heldBy');

/**
 * A bucket's identity index: an identity value → the listeners filed under it,
 * or `undefined` while nothing in this bucket is filed at all.
 *
 * Two readers, and they ask different questions of the same Map.
 *
 * **`add()`**, which has to find an already registered listener with the same
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
 * **`detachByIdentity()`**, which has to find every listener a bare
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
 * Written in `createBucket()` like `HELD_BY`, for the same hidden-class reason,
 * and a clone inherits **the same Map by reference**. What makes that sound is
 * not that the two arrays are element-for-element identical — they are, but only
 * at the moment of cloning — it is that every index *entry* write goes to the
 * return value of `bucketForMutation()`, hence always to the bucket the store holds
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
const DEDUP_INDEX = Symbol('eventize.EventStore.dedupIndex');

type DedupIndex = Map<unknown, EventListener[]>;

/**
 * A bucket's index, for the specs. Nothing in the library reads it through a
 * function, and nothing outside this repo can call it: `EventStore` is not
 * re-exported from `src/index.ts`, so this reaches no published declaration —
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

interface ListenerBucket extends Array<EventListener> {
  [HELD_BY]: number;
  [DEDUP_INDEX]: DedupIndex | undefined;
}

/**
 * The only place a bucket is born, and one of the two casts this arrangement
 * costs — `dedupIndexOf()` above holds the other, for the specs.
 *
 * The count is written **immediately** after the array is created, before any
 * element goes in, so every bucket in the store passes through the same hidden
 * class in the same order and the field load in `bucketForMutation()` stays
 * monomorphic. `slice(0)` copies elements and nothing else — a clone that
 * skipped this would arrive without the property, take a different shape, and
 * quietly deoptimise every read of it. It would also read as *held*
 * (`undefined === 0` is false) and buy itself one copy it does not owe, which
 * installs a well-formed clone and hides the mistake from then on; three specs
 * in `EventStore.spec.ts` watch the four places a bucket can be born.
 *
 * The source is a `ListenerBucket` rather than any array of listeners, and that
 * is the point: a clone has to carry the dedup index of the array it copies, so
 * only something that already has one may be cloned.
 */
const createBucket = (source?: ListenerBucket): ListenerBucket => {
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
 * real container first, and every reader — `forEach()`, `peekListeners()`,
 * `getSubscriptionCount()`, the `removeBy*` family — works unchanged, because
 * all any of them touch is `.get()`, `.forEach()`, `.length`.
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
 * the `??= new Map()` in `indexAdd()` throw on the frozen stand-in, which are
 * precisely the two writes that would otherwise make one emitter's dispatch
 * bookkeeping and one emitter's index visible to all of them. The stubs on top
 * are for the message: a stray `splice()` says which object it hit and what to
 * do instead, where the native error would only report a read-only property of
 * `[object Array]`.
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
const EMPTY_NAMED_LISTENERS: Map<EventName, ListenerBucket> = Object.freeze(
  Object.defineProperties(new Map<EventName, ListenerBucket>(), {
    set: {value: rejectMutation('namedListeners')},
    delete: {value: rejectMutation('namedListeners')},
    clear: {value: rejectMutation('namedListeners')},
  }),
);

const EMPTY_CATCH_EM_ALL: ListenerBucket = createBucket();

// Every mutator `Array.prototype` carries, not only the `splice()` this file
// uses: the point of a stand-in is to catch the path nobody thought of. Defined
// rather than assigned, so they arrive non-enumerable and stay out of
// `Object.keys()`, a spread and Jest's `toEqual` — same treatment `HELD_BY` and
// `DEDUP_INDEX` get from being symbols.
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

const sortByPriorityAndId = (
  a: HasPriorityOrIdType,
  b: HasPriorityOrIdType,
): number =>
  a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

const findInsertIndex = (
  arr: Array<HasPriorityOrIdType>,
  item: HasPriorityOrIdType,
): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // mid is always within [lo, hi) ⊆ [0, arr.length), so arr[mid] is defined
    // for every dense array this is called with. The old code trusted that
    // and let a hole surface as a TypeError from inside
    // sortByPriorityAndId(item, undefined); this throws explicitly instead of
    // picking hi = mid for it — a hole is a corrupted array, not a value the
    // search should silently place.
    const midItem = arr[mid];
    if (midItem === undefined) {
      throw new Error('EventStore: findInsertIndex encountered a hole');
    }
    if (sortByPriorityAndId(item, midItem) < 0) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

// An undefined tag is similar to nothing — both comparisons already say so.
const isSimilarListenerType = (listenerType: number | undefined) =>
  listenerType === LISTENER_IS_OBJ || listenerType === LISTENER_IS_NAMED_FUNC;

// Detaching is a mutation of the listeners, never of the array holding them,
// so it needs no clone-on-mutate treatment and is safe to run over a bucket a
// dispatch is currently walking: that is precisely how a wiped listener gets
// skipped mid-walk (EventListener.apply() bails on isRemoved).
//
// The index goes with them. Both callers are letting go of the whole bucket —
// one drops the map entry, the other clears the map — so there is nothing left
// to file. Dropping it here rather than at those two call sites also covers the
// bucket that survives emptied: removeAllListeners() truncates an unheld
// wildcard array in place and keeps it, and an index left standing on it would
// hold every detached listener plus a strong reference to the object each one
// was keyed by, none of which the truncated array itself retains any more.
//
// What this releases is the slot on the bucket it is given, not the contents of
// the Map. A walk still holding the pre-clone array holds the same Map through
// that array's own slot, and it survives until the walk returns — bounded by the
// dispatch, so not a leak, but the one case where the sentence above does not
// hold. Clearing the Map instead would buy only the keys for that stretch: the
// held array is not truncated either, so it keeps every detached listener alive
// regardless.
const detachAll = (bucket: ListenerBucket) => {
  bucket.forEach((listener) => listener.detach());
  bucket[DEDUP_INDEX] = undefined;
};

// The five slots a subscription is identified by, spelled out rather than
// bundled into a descriptor object: the sole caller is a search that runs
// before the `EventListener` exists, and a literal built per registration to
// carry them would reintroduce the very allocation that search was rebuilt to
// avoid — a smaller one, but on the same path and with the same frequency.
//
// Both listener slots are `unknown`, so swapping them compiles in silence and
// costs a comment nothing to prevent: `listener` before `listenerObject`,
// everywhere in this file and in `EventListener`'s constructor. Add a
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
 * The callback a walk dispatches to, plus three context slots the walk carries
 * from the caller through to the callback untouched.
 *
 * The slots exist so that callback can be a module-level function. An arrow
 * built per emit captures what it needs and then escapes into the walk, where
 * V8 cannot scalar-replace it, so every dispatch reaching at least one listener
 * allocated a closure — two thirds of everything an `emit()` allocated.
 *
 * This is the *internal* shape of the hand-off, and `any` is what it costs.
 * `unknown` is not available: a parameter type is checked contravariantly, so
 * it would make every precisely typed callback unassignable. A generic
 * `<A, B, C>` is — but only on the outside: inside the body the optional
 * parameters read as `A | undefined` and no longer fit the callback's `A`, so a
 * generic implementation buys its checking back with three casts. `forEach()`
 * therefore declares the generic signature and implements it against this one:
 * callers get the slots matched against the callback they passed (a swapped
 * pair is rejected), while the walk itself carries values it never reads.
 */
type WalkCallback = (
  listener: EventListener,
  a?: any,
  b?: any,
  c?: any,
) => void;

/**
 * Walks one bucket, for the dispatch that has only one. A module-level function
 * for the same reason as `mergeWalk()` below — `forEach()` is close enough to
 * TurboFan's inlining budget that neither loop belongs in its body.
 *
 * An index loop rather than `Array.prototype.forEach`, which hands its callback
 * `(element, index, array)` and would land the index in the first context slot.
 * The length is read once up front, which is safe for the same reason it is in
 * `mergeWalk()`: the walk holds this array, so a mutation from inside `fn`
 * clones the bucket and leaves this one alone. The `undefined` guard keeps the
 * builtin's behaviour on a holey bucket — the hole is skipped in silence here,
 * while `mergeWalk()` throws on one. It differs on one case the builtin would
 * have visited, an element that really is `undefined`, which no bucket can hold:
 * only `EventListener` instances ever go in.
 */
const walkBucket = (
  listeners: Array<EventListener>,
  fn: WalkCallback,
  a?: any,
  b?: any,
  c?: any,
): void => {
  const len = listeners.length;
  for (let i = 0; i < len; i++) {
    const listener = listeners[i];
    if (listener !== undefined) {
      fn(listener, a, b, c);
    }
  }
};

/**
 * Interleaves a named bucket with the wildcard bucket by descending priority,
 * for the dispatch that has both. A module-level function rather than a branch
 * inside `forEach()`, and that placement is measured, not cosmetic: `forEach()`
 * carries a `try`/`finally`, which puts it close enough to TurboFan's inlining
 * budget that its exact size decides whether the *caller* inlines it. With the
 * merge loop in the body, two benchmark harnesses differing only in trivia
 * measured the same mutation-free 64-listener dispatch at 535 ns and 653 ns —
 * stably, one value each. Moving the loop out took both to ~535.
 *
 * Two traps when re-measuring any of this. Loading two library variants into
 * one process makes the call site polymorphic and moves results by double
 * digits, so a comparison run wants one variant per process — and this
 * function wants a process of its own either way. Individual cells move by ten
 * points between runs: quote ranges, never a single cell.
 *
 * Both lengths are read once, up front. That is safe because the walk holds
 * these two arrays: a mutation from inside `fn` clones the bucket it changes
 * and leaves these alone, so neither can grow, shrink or acquire a hole while
 * the merge runs.
 */
const mergeWalk = (
  named: Array<EventListener>,
  wildcards: Array<EventListener>,
  fn: WalkCallback,
  a?: any,
  b?: any,
  c?: any,
): void => {
  const iLen = named.length;
  const jLen = wildcards.length;
  let i = 0;
  let j = 0;
  while (i < iLen || j < jLen) {
    // cur/other are defined exactly when i < iLen / j < jLen — the ternary
    // re-expresses those bounds checks so the compiler can see it too.
    const cur = i < iLen ? named[i] : undefined;
    const other = j < jLen ? wildcards[j] : undefined;
    if (
      cur !== undefined &&
      (other === undefined || cur.priority >= other.priority)
    ) {
      fn(cur, a, b, c);
      ++i;
      continue;
    }
    if (other !== undefined) {
      fn(other, a, b, c);
      ++j;
    } else {
      // cur/other read as undefined here for one of two reasons: the loop is
      // legitimately done (i >= iLen and j >= jLen, in which case the
      // while-condition above already exits first), or one of the buckets is
      // holey below its own length. A hole is a corrupted array — the same
      // call findInsertIndex makes — so this throws rather than silently
      // dispatching a truncated prefix and dropping every real listener still
      // queued behind the hole.
      throw new Error('EventStore: forEach encountered a hole');
    }
  }
};

/**
 * The slot a subscription's identity lives in, and therefore the key `add()`'s
 * dedup lookup reads. Only meaningful for the two listener types that can dedup
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
const indexAdd = (bucket: ListenerBucket, listener: EventListener): void => {
  eachIndexKey((bucket[DEDUP_INDEX] ??= new Map()), listener, fileUnder);
};

/**
 * Unfiles a listener that is being spliced out. Every path that removes a single
 * listener from a bucket calls it, and calls it before `detach()`.
 *
 * A path that forgot to would not corrupt `add()`'s lookup:
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
const indexRemove = (bucket: ListenerBucket, listener: EventListener): void => {
  const index = bucket[DEDUP_INDEX];
  if (index !== undefined) {
    eachIndexKey(index, listener, unfileFrom);
  }
};

/**
 * The lookup `add()` makes before it inserts. At most one entry in a bucket can
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
const findSimilarListener = (
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

/**
 * `peekListeners()`'s answer for a name nothing is registered under. One
 * frozen array, reused for every miss instead of allocating a throwaway one
 * per call. Freezing it matters *because* it is shared: a caller reaching
 * past the `ReadonlyArray` type with a cast would otherwise corrupt every
 * other name's empty answer along with its own, which a per-bucket array
 * never risks.
 */
const EMPTY_LISTENERS: ReadonlyArray<EventListener> = Object.freeze([]);

export class EventStore {
  // Both start on the shared stand-ins and are swapped for a container of
  // their own by the first write — see `EMPTY_NAMED_LISTENERS` above. Neither
  // is `readonly` any more for that reason, and both are private for the one
  // they always should have been: read-only from the outside, swappable from
  // the inside. Clone-on-mutate has replaced the wildcard reference since
  // v6.0.0, and lazy allocation now replaces the named one too; a getter over
  // a private field buys that without widening what a holder of the store may
  // do with it. (Consumers never see the store at all — the internals slot is
  // opaque in the published types — but this is the boundary AGENTS.md asks to
  // keep drawn, not a hypothetical.)
  private namedBuckets: Map<EventName, ListenerBucket> = EMPTY_NAMED_LISTENERS;

  private catchEmAllBucket: ListenerBucket = EMPTY_CATCH_EM_ALL;

  get namedListeners(): Map<EventName, ListenerBucket> {
    return this.namedBuckets;
  }

  /**
   * The wildcard bucket, live and mutable — which makes this the creating door
   * of the pair, the way `getListenersForEventName()` is for a named one.
   * Handing the stand-in out through a mutable `Array<EventListener>` would be
   * handing out the one array in the module nobody may write to, and a caller
   * that then writes to it has neither reached the registry nor been told so.
   * `peekListeners('*')` is the looking door: it promises no mutation through
   * its return type and creates nothing, so it answers from the field and may
   * hand back the stand-in.
   *
   * Nothing in the library reads this — `add()` goes to the materializer
   * directly — so the allocation it forces lands on the specs and the test
   * utils that ask for the array by name.
   */
  get catchEmAllListeners(): Array<EventListener> {
    return this.mutableCatchEmAllBucket();
  }

  private mutableNamedBuckets(): Map<EventName, ListenerBucket> {
    if (this.namedBuckets === EMPTY_NAMED_LISTENERS) {
      this.namedBuckets = new Map();
    }
    return this.namedBuckets;
  }

  private mutableCatchEmAllBucket(): ListenerBucket {
    if (this.catchEmAllBucket === EMPTY_CATCH_EM_ALL) {
      this.catchEmAllBucket = createBucket();
    }
    return this.catchEmAllBucket;
  }

  /**
   * `eventName === '*'` is not special-cased here: `'*'` is a legal key in
   * `namedListeners` as far as this method knows, so it gets a bucket of its
   * own like any other name, distinct from `catchEmAllBucket`. `forEach()`
   * never walks that key — a `'*'` dispatch reads `catchEmAllBucket` only —
   * so a bucket created this way is never held and never seen by a running
   * emit. `peekListeners('*')` disagrees on purpose: it reads
   * `catchEmAllBucket` for `'*'`, the array wildcard listeners actually land
   * in. Calling both with `'*'` therefore answers from two different arrays;
   * see `EventStore.spec.ts`'s impostor-bucket case for the mechanism, and
   * `peekListeners()`'s own doc comment for the reading side of it.
   */
  getListenersForEventName(eventName: string | symbol): ListenerBucket {
    let namedListeners = this.namedBuckets.get(eventName);
    if (!namedListeners) {
      namedListeners = createBucket();
      // The first named subscription on this emitter is also what buys it a
      // Map of its own; up to here it shared the stand-in with every other
      // store this module built.
      this.mutableNamedBuckets().set(eventName, namedListeners);
    }
    return namedListeners;
  }

  /**
   * The second door promised for a caller that only wants to look:
   * `getListenersForEventName()` stays the creating one — `add()` needs a
   * bucket to insert into, and lazy creation plus the `'*'`-as-key edge are
   * both pinned by spec against it — while this one never adds a bucket or a
   * map entry. An unknown name reads back the same frozen empty array every
   * time; a known one is handed back by reference, not copied, because
   * nothing here is a snapshot promise, only a no-mutation one — reading it
   * again after a mutation may hand back the pre-clone array, same as
   * `getListenersForEventName()` (see AGENTS.md).
   *
   * That no-mutation promise is the return type, not a runtime copy: what
   * comes back is `ReadonlyArray`, so a caller cannot `push()` or `splice()`
   * their way into the registry without reaching past the type first. The
   * use-it-immediately discipline `getListenersForEventName()` can only ask
   * for in a comment is half enforced here instead: the compiler takes the
   * no-mutation half, and freshness stays the caller's problem either way. Frozen-ness is not part of that promise and is not uniform: it
   * holds for the shared empty answer to an unknown name and for the
   * catch-em-all stand-in an emitter without wildcard listeners still sits on,
   * while a bucket that exists is a live array underneath and stays mutable
   * via a cast, because `bucketForMutation()` still has to splice it in place.
   * Nobody outside this file may rely on either state.
   *
   * `eventName === '*'` reads `catchEmAllBucket`, not a `'*'` key in
   * `namedListeners` — the array wildcard listeners are actually in.
   * `getListenersForEventName('*')` disagrees: it treats `'*'` as an
   * ordinary name and creates a bucket of its own for it, a bucket
   * `forEach()` never walks. The two methods answer `'*'` from different
   * arrays; see the doc comment there and `EventStore.spec.ts`'s
   * impostor-bucket case.
   *
   * Unreachable in the published types, not at runtime: `EventStore` is not
   * exported from `src/index.ts` and the internals slot is opaque there —
   * the boundary AGENTS.md draws under "The internals boundary". The slot
   * itself is a documented, realm-wide symbol (`Symbol.for('eventize')`)
   * that code can still reach into directly, which is exactly what
   * `docs/retain.md` warns against doing. This method is not public API; it
   * just isn't unreachable by construction.
   */
  peekListeners(eventName: EventName): ReadonlyArray<EventListener> {
    if (isCatchEmAll(eventName)) {
      return this.catchEmAllBucket;
    }
    return this.namedBuckets.get(eventName) ?? EMPTY_LISTENERS;
  }

  /**
   * The array a mutation has to go through, and the one rule the whole
   * clone-on-mutate design rests on.
   *
   * If no walk is holding this bucket the mutation happens in place and
   * nothing is allocated — that covers every dispatch that mutates nothing at
   * all, and also every mutation of a bucket other than the one or two the
   * running walks are iterating. Only when the live bucket *is* an array a
   * walk is stepping through may it not change underneath: it is cloned, the
   * clone is swapped into the store, and the walk keeps the old array. That is
   * the entire protection `forEach()` used to buy with a `slice(0)` on
   * **every** dispatch.
   *
   * A clone therefore costs at most **once per bucket and walk**, never once
   * per mutation: the clone the store now holds is not the array anyone is
   * walking, so the next mutation of the same event name finds it unheld and
   * goes in place. And a bucket no walk ever looked at is never copied,
   * however often a dispatch changes it — a teardown listener calling
   * `off(ε, componentInstance)` across k event names copies at most the one
   * bucket its own emit is walking, not k of them.
   *
   * Three obligations for anyone adding a mutation path:
   *
   * 1. Route it through here, or a listener that subscribes from inside its
   *    own callback becomes visible to the running dispatch again.
   * 2. Call it only once a mutation is certain — never speculatively. A lookup
   *    that removes nothing must leave bucket identity alone, or "the array
   *    changed" stops meaning "the registry changed" and `EventStore.spec.ts`
   *    stops measuring anything.
   * 3. Pair every splice with the dedup index — but the two halves fail
   *    differently, and only one of them tells you. `indexAdd()` after an
   *    insert: skip it and the next identical subscription stops aggregating
   *    and registers a second time instead, which is a dispatch and a count
   *    error, and the suite says so loudly across several files.
   *    `indexRemove()` before the `detach()` that follows a removal: skip it
   *    and nothing goes red except the handful of cases that read the index
   *    directly, while the consumer's own object stays held by an emitter they
   *    have unsubscribed from — see `indexRemove()`.
   *
   * Indices computed against `bucket` stay valid in what comes back: the clone
   * is a `slice(0)`, element for element.
   *
   * Which slot the clone is installed into is derived from the **array**, not
   * from `eventName`: the caller holds the array, so that is the thing it
   * cannot get wrong. `'*'` can appear as a key in `namedListeners` — the
   * public `getListenersForEventName('*')` puts it there — and deriving the
   * destination from the name would send that bucket's clone into the wildcard
   * slot. That damage cannot actually occur, and the rule is worth keeping
   * anyway: `forEach()` never walks a `'*'` key, so such a bucket is never
   * counted, never cloned, and the name-derived branch is unreachable rather
   * than merely untested. No spec can catch the swap. Deriving from the array
   * is what keeps the question closed here instead of resting on an argument
   * about `forEach()` two hundred lines away.
   */
  private bucketForMutation(
    eventName: EventName,
    bucket: ListenerBucket,
  ): ListenerBucket {
    if (bucket[HELD_BY] === 0) return bucket;

    const clone = createBucket(bucket);
    if (bucket === this.catchEmAllBucket) {
      this.catchEmAllBucket = clone;
    } else {
      this.namedBuckets.set(eventName, clone);
    }
    return clone;
  }

  /** Splices one known instance out, if it is in there. Returns the bucket the store holds afterwards. */
  private spliceOut(
    eventName: EventName,
    bucket: ListenerBucket,
    item: EventListener,
  ): ListenerBucket {
    const idx = bucket.indexOf(item);
    if (idx < 0) return bucket;
    const target = this.bucketForMutation(eventName, bucket);
    target.splice(idx, 1);
    // Before the caller detaches it — see indexRemove().
    indexRemove(target, item);
    return target;
  }

  /**
   * Splices out *every* entry under `eventName` that `listenerObject` takes
   * part in — not just the first — detaching each, and returns the bucket the
   * store holds afterwards. Two shapes still put several matches in one
   * bucket: two `on()` calls at differing priorities (priority is part of the
   * similarity key, so they never collapse), and the same function subscribed
   * twice (functions never dedup). Two `once()` calls on one identity were a
   * third until v6.0.0; they aggregate into a single registration now, so this
   * pass finds one entry there however many obligations it carries.
   * `off(ε, eventName, listenerObject)` promises to remove all of them, and
   * splicing only the first left the rest subscribed and firing.
   *
   * One backward pass, reading from the array it was handed. Backwards keeps
   * the indices of the entries not yet visited valid across each splice, and
   * the clone — where one is owed — is element-for-element below every index
   * spliced so far, so the same `i` addresses the same entry in either array.
   * Each match is detached in the step that removes it, and the scan never
   * looks at an entry again afterwards, so no comparison ever reads the nulled
   * fields of a detached listener. Up to v5.1.0 both removal paths could: this
   * one collected its victims and then ran a fresh identity scan per victim,
   * and the sibling below ran its two tests as two sequential passes.
   *
   * `bucketForMutation()` is called at the first match and never before: a
   * lookup that removes nothing has to leave bucket identity alone.
   */
  private detachByAssociation(
    eventName: EventName,
    bucket: ListenerBucket,
    listenerObject: unknown,
  ): ListenerBucket {
    let target = bucket;
    for (let i = bucket.length - 1; i >= 0; i--) {
      // i walks strictly inside [0, bucket.length), so bucket[i] is always
      // defined here — the undefined branch exists for the compiler.
      const current = bucket[i];
      // Three registration shapes can associate an object with a listener:
      // on(ε, name, listenerObject) parks it in `listener`, while both
      // on(ε, name, methodName, listenerObject) and on(ε, name, fn, context)
      // park it in `listenerObject`. All three are matched here.
      if (
        current !== undefined &&
        current.eventName === eventName &&
        (current.listener === listenerObject ||
          current.listenerObject === listenerObject)
      ) {
        if (target === bucket) {
          target = this.bucketForMutation(eventName, bucket);
        }
        target.splice(i, 1);
        // Unfiled before it is detached, which nulls the slot it is keyed by.
        indexRemove(target, current);
        current.detach();
      }
    }
    return target;
  }

  /**
   * The same single backward pass as `detachByAssociation()`, with the test
   * `off(ε, fn[, obj])` and `off(ε, obj)` need: the registered
   * `(listener, listenerObject)` pair, plus — for an object argument — the
   * nameless association, which reduces to `listenerObject` identity because
   * the event-name half of the association test can never fire without a name.
   *
   * How much of that pair has to match depends on how much of it the caller
   * gave. `off(ε, fn, ctx)` names both halves and gets both compared. An
   * `off()` with no listener object at all — `listenerObject` arrives
   * `undefined` from `off()`, `null` from `remove()`'s array branch and from
   * an explicit `off(ε, fn, null)` — asks about the listener alone, and since
   * v6.0.0 that is what it is answered: the stored context is not part of a
   * question the caller did not ask. There is therefore no spelling left that
   * matches *only* a contextless registration; the handle `on()` returned is
   * what addresses one registration and nothing else.
   *
   * Up to v5.1.0 the missing half was read as "registered with no context",
   * so `on(ε, 'evt', this.handler, this)` survived `off(ε, this.handler)`
   * without a word and kept both the function and the context object alive on
   * an emitter the caller believed it had let go of. The narrow reading was
   * deliberate, and the broad one is not free either: a teardown calling
   * `off(ε, SomeClass.prototype.handler)` now detaches every *other* instance
   * that drew the same prototype method under its own context. That price is
   * accepted knowingly. An unsubscribe that silently removes nothing is the
   * worse of the two failures — nothing about it is observable until someone
   * measures what the emitter still holds — and `off(ε, fn, ctx)` is the way
   * to name one registration, which is the whole point of keeping the
   * three-argument form exact.
   *
   * An object argument reads the same way, and that is a decision rather than
   * a side effect — an `&& !isObjectListener` on the test above would have
   * held `off(ε, obj)` back, though only written `isEqual(listener,
   * listenerObject ?? null)`: `isEqual()` lost its `null` default in the same
   * change, so the exemption on its own would have asked the object-alone
   * form about `undefined` and matched nothing at all. The rule is worth more
   * than the exemption: the identity slot alone decides whenever the caller
   * names no second argument, for a function and an object alike, so there is
   * one sentence to know instead of two. What `off(ε, obj)` gains by it is the
   * one shape it used to walk past, `on(ε, 'evt', obj, ctx)`, which files the
   * object in the identity slot and something else in the context slot —
   * "every subscription of that object" is what the call has always promised.
   *
   * What the association disjunct needed instead is `&& matchListenerOnly`: it
   * answers the *nameless* association, so it has no business running once the
   * caller has named a context. Without the gate the three-argument form was
   * not narrowing at all — `off(ε, fn, ctx)` swept every other listener that
   * merely drew `fn` as its own context, and the whole point of keeping that
   * form exact is that there be one spelling for one registration. The gate
   * moves two things relative to v5.1.0, in opposite directions, and both are
   * intended: the two-argument forms remove *more* (the paragraph above, and
   * `off(ε, fn)` also reaching a function that sits in someone else's context
   * slot), while `off(ε, obj, ctx)` removes *less* — v5.1.0 and the untethered
   * v6 disjunct both took the foreign-context registrations along, and now
   * only the named pair goes. `off(ε, obj)` is the form for the broad sweep.
   * Note that `!isObjectListener` and `matchListenerOnly` are not two spellings
   * of one idea: the first asks what kind of thing the caller passed, the
   * second how much of the pair they named. Only the second is a question about
   * the call.
   *
   * The candidates come from the bucket's index rather than from the bucket,
   * and the test below is the one the scan ran per element, unchanged. What the
   * index buys is which elements it runs on: up to v5.1.0 — and, on the removal
   * side, up to the release this comment ships in — every `off(ε, fn)` and
   * `off(ε, obj)` read both identity slots of every listener under every event
   * name, and it read them to the end of each bucket rather than stopping at
   * the match, because a bucket can hold several. `eachIndexKey()` carries the
   * argument that makes the shortcut sound: a listener not filed under the
   * value `off()` names cannot match it.
   *
   * An index a bucket does not have means no listener in it is filed, which by
   * that same argument means none of them can match. Reachable and common
   * rather than theoretical: it is the wildcard bucket of every emitter nobody
   * ever subscribed a `'*'` listener to, visited once per `off(ε, fn)`.
   *
   * A copy of the candidate list, because unfiling a match splices it out of
   * that very list. Taken up front and therefore also when nothing matches —
   * `off(ε, fn, someOtherCtx)` pays for it and removes nothing — which is one
   * short array against a scan of the whole bucket, and the price of not
   * having to decide mid-loop whether the list is still the one being walked.
   * `spliceOut()` does the rest, and does it against `target` each time — so
   * the position is looked up in the array the store holds at that moment, and
   * neither the clone nor the shift from the previous splice has to be
   * reasoned about here.
   */
  private detachByIdentity(
    eventName: EventName,
    bucket: ListenerBucket,
    listener: unknown,
    listenerObject: unknown,
    isObjectListener: boolean,
  ): ListenerBucket {
    const index = bucket[DEDUP_INDEX];
    if (index === undefined) return bucket;
    const candidates = index.get(listener);
    if (candidates === undefined) return bucket;

    const matchListenerOnly = listenerObject == null;
    let target = bucket;
    for (const current of candidates.slice()) {
      if (
        (matchListenerOnly
          ? current.listener === listener
          : current.isEqual(listener, listenerObject)) ||
        (matchListenerOnly &&
          isObjectListener &&
          current.listenerObject === listener)
      ) {
        // spliceOut() unfiles before this detaches, which nulls the slots the
        // listener is keyed by.
        target = this.spliceOut(eventName, target, current);
        current.detach();
      }
    }
    return target;
  }

  /**
   * Whether the `add()` that returned last built the listener it handed back,
   * rather than finding one to aggregate onto. Meaningful only on the statement
   * that follows the call — a reader that stashes it for later is reading the
   * *next* registration's answer.
   *
   * It exists because `add()` no longer receives the listener it might insert:
   * the caller used to answer "was this one new?" by comparing the return value
   * against the instance it had just built, and that instance is precisely what
   * a deduplicating registration must stop allocating. A `{listener, created}`
   * result object would put the allocation straight back, one field narrower.
   *
   * The one reader is `registerEventListener()`, deciding whether a retained
   * value is replayed to a registration that aggregated.
   *
   * **What makes a single slot safe is that nothing between the write and the
   * read can register anything.** `add()` runs no consumer code after the
   * write — no dispatch, no `warn()`, no member read that could reach a getter
   * or a proxy trap — so a nested registration can only start outside `add()`,
   * where the pair it belongs to has already closed. Adding anything that
   * re-enters consumer code between the two breaks this field and nothing else
   * would say so, which is why the premise is pinned rather than asserted:
   * `once_on_aggregation.spec.ts` subscribes to a second retained event from
   * inside a retained replay, the tightest nesting the public API can build.
   */
  lastAddCreatedListener = false;

  /**
   * Returns the listener the registration landed on: a newly built one, or an
   * existing one with the same identity. Either way the registration is
   * recorded on it, which is what makes `on()` and `once()` aggregate in both
   * registration orders — see `lastAddCreatedListener` for how a caller tells
   * the two apart.
   *
   * Takes the subscription's five identifying slots rather than a listener,
   * and builds the `EventListener` only where one is actually inserted. The
   * dedup search reads nothing else (`findSimilarListener()`), so an
   * aggregating call now allocates nothing at all and burns no id from
   * `EventListener`'s module-global counter.
   *
   * `obligation` is what used to be a `noDedup`/`kind` flag: `null` for a
   * persistent `on()`, an `OnceObligation` for a `once()`. Its *presence*, not
   * a tag compared against it, is the whole test — the obligation itself is
   * the thing that later has to know every listener it was added to, so
   * threading it through here is what lets `once(ε, ['a','b'], h)` share one
   * obligation across two listeners instead of building two.
   */
  add(
    eventName: EventName,
    priority: number,
    listener: unknown,
    listenerObject: ListenerObjectType = null,
    obligation: OnceObligation | null = null,
  ): EventListener {
    // Materialized up front rather than at the splice below, and that is not
    // the speculative call `bucketForMutation()`'s rule forbids: the stand-in
    // is empty, an empty bucket holds nothing to aggregate onto, so reaching
    // here with it means the insertion at the end of this method is certain.
    // Both branches create — `getListenersForEventName()` is the named twin of
    // the materializer.
    const bucket = isCatchEmAll(eventName)
      ? this.mutableCatchEmAllBucket()
      : this.getListenersForEventName(eventName);

    // Recomputed here rather than read off a listener, and the constructor
    // below computes it a second time on the inserting path. That is the one
    // duplicated `typeof` switch this rebuild costs, and it is paid only where
    // an object is allocated anyway — an aggregating call pays it once and
    // allocates nothing.
    const listenerType = detectListenerType(listener);

    const similar = findSimilarListener(
      listenerType,
      priority,
      eventName,
      listener,
      listenerObject,
      bucket,
    );
    const target =
      similar ??
      new EventListener(eventName, priority, listener, listenerObject);

    if (obligation === null) {
      target.refCount += 1;
    } else if (!target.onceObligations?.includes(obligation)) {
      // The guard is for a duplicated name in one call — once(ε, ['a','a'], h)
      // aggregates onto the listener it just created, and one obligation must
      // not be counted on the same listener twice.
      (target.onceObligations ??= []).push(obligation);
      obligation.members.push(target);
    }

    // Two writes, and the optimistic one comes last — the field says "created"
    // only once the splice has actually happened. Deriving it from `similar`
    // in one write up here would leave it claiming a registration that does
    // not exist whenever `findInsertIndex()` rejects a corrupted bucket: that
    // throw skips the insertion, not the write. Written pessimistically first
    // for the same reason, so the throwing path leaves behind the answer that
    // is true of it.
    this.lastAddCreatedListener = false;

    // An aggregation touches no array and no index, so it owes no clone —
    // reading the live bucket's index above is safe for the same reason.
    if (similar) return similar;

    const arr = this.bucketForMutation(eventName, bucket);
    arr.splice(findInsertIndex(arr, target), 0, target);
    // Filed on the array the store holds afterwards, which is also the array the
    // next lookup will read — the clone shares the index of the bucket it came
    // from, so this lands in the same Map either way.
    //
    // Unconditional, while the dedup *gate* stays where it always was, in
    // findSimilarListener(): what the index holds and what aggregates are two
    // questions since the index gained its second reader. A function listener
    // is filed so off() can find it, and still never dedups, because the search
    // never asks about one — and could not match it if it did, isSimilar()
    // comparing listenerType first.
    indexAdd(arr, target);
    this.lastAddCreatedListener = true;
    return target;
  }

  remove(
    listener: unknown,
    listenerObject: unknown,
    removeSimilar = false,
  ): void {
    // off([...]) — recurses once per element, depth unbounded on purpose: a
    // self-referencing element re-enters this same branch and overflows the
    // stack with a RangeError rather than looping forever. That is the one
    // structure off()'s "accepts any shape" promise does not cover — see the
    // comment above off() in eventize-api.ts.
    if (listenerObject == null && Array.isArray(listener)) {
      listener.forEach((li) => this.remove(li, null, removeSimilar));
      return;
    }

    // off() / off('*')
    if (
      listener == null ||
      (listenerObject == null && isCatchEmAll(listener))
    ) {
      this.removeAllListeners();
      return;
    }

    // off('foo') / off(Symbol('foo'))
    if (listenerObject == null && isEventName(listener)) {
      this.removeByEventName(listener);
      return;
    }

    // off('foo', obj) / off(Symbol('foo'), obj)
    if (removeSimilar && isEventName(listener)) {
      this.removeByEventNameAndListenerObject(listener, listenerObject);
      return;
    }

    // off(fn[, obj]) / off(obj)
    this.removeByListener(listener, listenerObject);
  }

  private removeByEventName(eventName: EventName): void {
    const bucket = this.namedBuckets.get(eventName);
    // Returning early rather than deleting the key unconditionally: a bucket
    // under this name is also the proof that the Map is this store's own and
    // not the shared stand-in, which rejects `delete()` like every other write.
    if (bucket === undefined) return;

    detachAll(bucket);
    // Dropping the map entry is what empties the store here — this bucket is
    // not being *changed*, it is being let go of, which is why it needs no
    // clone. The truncation on top of it is a courtesy to a caller still
    // holding the array from getListenersForEventName(), and it is the one
    // thing a walk stepping through this very array must not suffer, so it
    // is skipped exactly then. A named bucket, hence the `false`. See
    // AGENTS.md, "the truncation exception".
    if (bucket[HELD_BY] === 0) {
      bucket.length = 0;
    }
    this.namedBuckets.delete(eventName);
  }

  /**
   * Gives one persistent (`on()`) registration back. `once()`'s handle calls
   * `releaseObligation()` instead — it holds no listener at all, only the
   * obligation, so there is nothing for this method to accept for that case.
   */
  release(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount > 0 || listener.onceObligations !== undefined) return;
    this.dropListener(listener);
  }

  /**
   * Gives one `once()` obligation back by hand, before anything discharged it.
   * A settled obligation is inert here on purpose: whichever name fired first
   * already ended it for every listener it was ever added to, and a handle
   * calling in after that has nothing left to give back.
   */
  releaseObligation(obligation: OnceObligation): void {
    if (obligation.settled) return;
    this.dischargeObligation(obligation);
  }

  /**
   * Discharges the obligations a listener carried *before* the dispatch that
   * just called this — all of them at once: they were satisfied by the same
   * call, and settling them one per dispatch would make a second `once()` on
   * the same identity fire on the next emit instead of this one.
   *
   * `watermark` is `EventListener.apply()`'s pre-dispatch snapshot of the
   * obligation sequence counter, not a count or an array slice boundary. Every
   * obligation this listener carries whose `sequence` is below that value
   * existed before the dispatch began, wherever it sits in the array — a
   * position cannot say that, because releasing a handle or a force-removal
   * can splice an obligation out of the *middle* of `onceObligations` and
   * shift every later entry left, including one the callback added *during*
   * this very dispatch by re-subscribing. Filtering by `sequence` instead of
   * position is what keeps that reshuffle from mattering.
   *
   * Runs from inside `EventListener.apply()`, so from inside a live `forEach()`
   * walk. `dischargeObligation()` → `dropListener()` routes through
   * `bucketForMutation()`, which is what keeps the walk's array intact.
   *
   * A copy, not the live array: discharging an obligation removes it from
   * every member's own list, this listener's included, out from under the
   * loop that is currently iterating it.
   */
  settleOneShots(listener: EventListener, watermark: number): void {
    const obligations = listener.onceObligations;
    if (obligations === undefined) return;

    for (const obligation of obligations.slice()) {
      if (obligation.sequence < watermark && !obligation.settled) {
        this.dischargeObligation(obligation);
      }
    }
  }

  /**
   * Ends one obligation everywhere it is held. `settled` and the emptied
   * `members` list go first, so a `dropListener()` below — which detaches,
   * which walks the dropped listener's own remaining obligations — cannot come
   * back into this one.
   *
   * This is the one place that knows about the race a multi-name `once()`
   * promises: `members` may hold several listeners, one per name the call
   * covered, and whichever of them got here first — through a real dispatch or
   * a handle calling `releaseObligation()` by hand — takes all of them out
   * together. A member already gone (force-removed by `off()`, which walks
   * straight to `EventListener.detach()` without going through here) is
   * skipped: `detach()` already spliced it out of `members` on its way out, so
   * `isRemoved` is a belt-and-braces check, not the one this relies on.
   *
   * The settle hook goes first, and it is read and cleared before it is called
   * so that neither a re-entrant discharge nor a throw from a member below can
   * run it twice or leave it standing. It is the `once()` handle's capture:
   * discharging is what spends a `once()`, whichever way it happened, and a
   * spent handle must hold nothing — see `OnceObligation.onSettled`.
   */
  private dischargeObligation(obligation: OnceObligation): void {
    obligation.settled = true;

    const onSettled = obligation.onSettled;
    obligation.onSettled = undefined;
    onSettled?.();

    const members = obligation.members.slice();
    obligation.members.length = 0;

    for (const member of members) {
      const held = member.onceObligations;
      if (held !== undefined) {
        const idx = held.indexOf(obligation);
        if (idx >= 0) held.splice(idx, 1);
        if (held.length === 0) {
          member.onceObligations = undefined;
          member.callAfterApply = undefined;
        }
      }

      if (
        !member.isRemoved &&
        member.refCount === 0 &&
        member.onceObligations === undefined
      ) {
        this.dropListener(member);
      }
    }
  }

  /**
   * Takes a listener out of the registry, unconditionally. A listener lives in
   * exactly one bucket: the catch-em-all array, or the named array for its own
   * eventName. A multi-event `on()` creates one EventListener per name, so
   * there is never more than one home to visit.
   */
  private dropListener(listener: EventListener): void {
    if (listener.isCatchEmAll) {
      this.spliceOut(listener.eventName, this.catchEmAllBucket, listener);
    } else {
      const bucket = this.namedBuckets.get(listener.eventName);
      if (bucket) {
        const remaining = this.spliceOut(listener.eventName, bucket, listener);
        if (remaining.length === 0) {
          this.namedBuckets.delete(listener.eventName);
        }
      }
    }

    listener.detach();
  }

  private removeByEventNameAndListenerObject(
    eventName: EventName,
    listenerObject: unknown,
  ): void {
    // '*' is not a key in namedListeners — wildcard listeners live in their own
    // array — so looking there made off(ε, '*', listenerObject) a silent no-op
    // that removed nothing and reported nothing. Every listener in that array
    // carries eventName === '*', so the same filter narrows it exactly as it
    // narrows a named bucket; the array is a fixed member rather than a Map
    // entry, so there is nothing to delete once it empties. Named subscriptions
    // of the same object stay — this is the targeted form, off(ε, listenerObject)
    // is the sweeping one.
    if (isCatchEmAll(eventName)) {
      this.detachByAssociation(
        eventName,
        this.catchEmAllBucket,
        listenerObject,
      );
      return;
    }

    // The event name is known, and the filter checks it anyway — no reason to
    // walk every other bucket. Catch-em-all listeners are not in this one:
    // they live in the array the branch above handles, which is where they
    // have always been and where this path only started looking in v6.0.0.
    const bucket = this.namedBuckets.get(eventName);
    if (!bucket) return;
    const remaining = this.detachByAssociation(
      eventName,
      bucket,
      listenerObject,
    );
    if (remaining.length === 0) {
      this.namedBuckets.delete(eventName);
    }
  }

  /**
   * The identity-based half of `off()` — `off(ε, fn)`, `off(ε, fn, ctx)` and
   * `off(ε, listenerObject)`. There is no reverse index from a listener back
   * to the event names it sits under, so this walks every bucket in
   * `namedListeners` plus the catch-em-all one and asks each "is this
   * listener here?"
   *
   * Two terms, and the first one used to be the whole model:
   *
   * - **once per registered event name**, whether or not the listener is
   *     subscribed under it — one Map lookup into that bucket's index, which
   *     answers `undefined` for every name the listener has nothing to do with;
   * - **once per listener actually removed**, plus the array work that removal
   *     costs: `spliceOut()` finds the position with `indexOf()` and then
   *     splices, so a removal from a bucket of depth d moves O(d) slots in the
   *     worst case and the memory traffic, not the identity test, is what is
   *     left of the old shape.
   *
   * Bucket depth is in that second term and nowhere else, which is the whole
   * change: what a removal *reads* is no longer proportional to how many
   * other listeners share the event name, only what it *moves* is. The claim
   * this replaces — "O(registered event names), roughly 11 ns per name" —
   * modelled the first term alone and predicted ~0.09 ms for a case that
   * measured ~85 ms, three orders of magnitude out, because the scan it was
   * written for read every listener of every name and the model counted only
   * the names. Any successor to it has to keep both terms, whatever happens to
   * the second. See `docs/off.md` for the consumer-facing version of this note,
   * and `DEDUP_INDEX` for the measurements.
   */
  private removeByListener(listener: unknown, listenerObject: unknown): void {
    // Both `typeof` values, because both are listener objects: the set is
    // `ListenerObjectType` in `types.ts` — `object | null | undefined`, which
    // in `typeof` terms is exactly these two. Not `canReadMembers()`, which is
    // a laxer test on the dispatch side and takes any non-nullish value,
    // primitives included: `on(ε, 'foo', 'toFixed', 42)` registers and
    // dispatches, and nothing here or in `off()` will ever remove it by
    // identity. `'object'` alone made `off(ε, Registry)` after
    // `on(ε, 'foo', 'reset', Registry)` the failure this file's other comments
    // call the worse one: nothing removed, nothing reported, the class still
    // held and still firing. `null` cannot arrive here — `remove()` routes a
    // nullish listener to `removeAllListeners()` long before this line.
    const isObjectListener =
      typeof listener === 'object' || typeof listener === 'function';

    this.namedBuckets.forEach((bucket, name) => {
      // Replacing the value of a key the Map is currently iterating is
      // defined behaviour and does not re-visit the entry — which is what
      // lets bucketForMutation() swap a clone in from right here.
      const remaining = this.detachByIdentity(
        name,
        bucket,
        listener,
        listenerObject,
        isObjectListener,
      );
      if (remaining.length === 0) {
        this.namedBuckets.delete(name);
      }
    });

    this.detachByIdentity(
      EVENT_CATCH_EM_ALL,
      this.catchEmAllBucket,
      listener,
      listenerObject,
      isObjectListener,
    );
  }

  removeAllListeners(): void {
    // Nothing registered under a name means nothing to detach — and skipping
    // the walk is also what keeps `clear()` off the shared stand-in, the same
    // shape of guard `EventKeeper.remove()` carries. The Map itself stays: a
    // spec holds the wildcard array across an `off(ε)` and expects the same
    // array back, and emptying one container while releasing the other would
    // be two rules where the truncation exception already states one.
    if (this.namedBuckets.size !== 0) {
      this.namedBuckets.forEach((bucket) => {
        detachAll(bucket);
        // The truncation exception again — see removeByEventName(). The map is
        // cleared right after, so the store lets go of these arrays either way.
        if (bucket[HELD_BY] === 0) {
          bucket.length = 0;
        }
      });
      this.namedBuckets.clear();
    }

    const wildcards = this.catchEmAllBucket;
    // An emitter no `'*'` listener ever reached has nothing here to detach and
    // nothing to truncate — and this is the one place in the class where a
    // removal path can reach a stand-in with a write in hand rather than a
    // lookup. Load-bearing, not tidiness: `detachAll()` clears the index slot
    // unconditionally, and on the frozen stand-in that assignment throws even
    // though it would be writing the `undefined` already sitting there. Taking
    // the guard out turns every `off(ε)` on an emitter without wildcard
    // listeners into a `TypeError` naming the frozen index slot — verified by
    // removing it, across seven suites.
    if (wildcards === EMPTY_CATCH_EM_ALL) return;

    detachAll(wildcards);
    if (wildcards[HELD_BY] !== 0) {
      // A walk is stepping through this array. Hand the store a fresh one
      // instead of truncating the one being iterated; the listeners in the old
      // array are detached, so the walk skips every one of them. Nobody is
      // holding the fresh one, so a later mutation in the same dispatch finds
      // it in place rather than cloning it.
      this.catchEmAllBucket = createBucket();
    } else {
      wildcards.length = 0;
    }
  }

  /**
   * Walks the listeners for `eventName` in dispatch order and hands each one to
   * `fn`, together with `a`, `b` and `c` unchanged — see `WalkCallback` for why
   * the context travels as arguments rather than in a closure.
   *
   * The three slots are typed against the callback's own parameters, so passing
   * them in the wrong order is a compile error rather than a listener called
   * with its arguments shuffled. A context-typed callback requires all three —
   * optional slots would let `forEach(eventName, applyListener)` compile and
   * dispatch under `eventName === undefined` three times over. A callback that
   * takes only the listener — every spec in this repo — uses the other overload
   * instead, and needs no context at all.
   */
  forEach(eventName: EventName, fn: (listener: EventListener) => void): void;
  forEach<A, B, C>(
    eventName: EventName,
    fn: (listener: EventListener, a: A, b: B, c: C) => void,
    a: A,
    b: B,
    c: C,
  ): void;
  forEach(
    eventName: EventName,
    fn: WalkCallback,
    a?: any,
    b?: any,
    c?: any,
  ): void {
    // The walk runs over the *live* buckets. Up to v5.1.0 it copied them
    // first, which protected it against a listener subscribing or
    // unsubscribing from inside its own callback — at the price of one
    // allocation per dispatch, mutation or not. Since v6.0.0 the copy sits on
    // the mutating side instead: the walk counts itself into the one or two
    // buckets it steps through, and a mutation of a bucket with a live count
    // clones it and swaps the clone into the store, so the references taken
    // here stay both stable and complete for the duration of the walk. The
    // normal case — nothing mutates — allocates nothing at all, and neither
    // does a mutation of any other bucket.
    const catchEmAllBucket = this.catchEmAllBucket;
    const wildcards =
      catchEmAllBucket.length > 0 ? catchEmAllBucket : undefined;

    // A '*' emit walks the wildcard bucket only, so the named lookup is not
    // even made — and a '*' key in namedListeners (which the public
    // getListenersForEventName('*') can create) is never walked and therefore
    // never held.
    const namedBucket =
      eventName === EVENT_CATCH_EM_ALL
        ? undefined
        : this.namedBuckets.get(eventName);
    const named =
      namedBucket !== undefined && namedBucket.length > 0
        ? namedBucket
        : undefined;

    if (named === undefined) {
      // Nothing to walk is nothing to protect: the empty-emitter path stays
      // free of the bookkeeping and of the try/finally entirely.
      if (wildcards === undefined) return;
      // Counting in, not marking: nested emits over the same bucket each add
      // one, and each takes its own back. A boolean would have the inner walk's
      // exit tell the store the outer one is over.
      wildcards[HELD_BY] += 1;
      try {
        walkBucket(wildcards, fn, a, b, c);
      } finally {
        // From a `finally`, because a listener that throws must not leave a
        // dead walk counted in — every later mutation of that bucket would
        // clone for the rest of its life.
        wildcards[HELD_BY] -= 1;
      }
      return;
    }

    named[HELD_BY] += 1;
    if (wildcards !== undefined) wildcards[HELD_BY] += 1;
    try {
      if (wildcards === undefined) {
        walkBucket(named, fn, a, b, c);
      } else {
        mergeWalk(named, wildcards, fn, a, b, c);
      }
    } finally {
      named[HELD_BY] -= 1;
      if (wildcards !== undefined) wildcards[HELD_BY] -= 1;
    }
  }

  getSubscriptionCount(): number {
    let count = this.catchEmAllBucket.length;
    for (const namedListeners of this.namedBuckets.values()) {
      count += namedListeners.length;
    }
    return count;
  }

  /**
   * Every event name with at least one active listener: the keys of
   * `namedBuckets`, plus `EVENT_CATCH_EM_ALL` if a wildcard listener is
   * registered. Safe against the stand-ins from `namedBuckets` and
   * `catchEmAllBucket`'s own declarations — reading `.keys()` on the frozen
   * empty `Map` and `.length` on the frozen empty bucket materializes
   * neither, the same way `getSubscriptionCount()` above does not.
   *
   * `namedBuckets` never holds a key with an empty bucket: `add()` only
   * reaches `getListenersForEventName()` for a non-wildcard name (`'*'`
   * goes to `mutableCatchEmAllBucket()` instead, see `add()` above), and
   * every place that empties a bucket — `dropListener()`,
   * `removeByEventNameAndListenerObject()`, `removeByEventName()` — deletes
   * the map entry in the same step. No filtering is needed here for that
   * reason; the `getListenersForEventName('*')` impostor-bucket edge is
   * reachable only by calling that method directly, which nothing on the
   * public API path does.
   */
  getSubscribedEventNames(): EventName[] {
    const names: EventName[] = Array.from(this.namedBuckets.keys());
    if (this.catchEmAllBucket.length > 0) {
      names.push(EVENT_CATCH_EM_ALL);
    }
    return names;
  }
}
