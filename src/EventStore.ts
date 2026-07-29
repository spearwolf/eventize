import type {EventListener, OnceObligation} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';
import type {EventName} from './types';
import {isCatchEmAll, isEventName} from './utils';

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

interface ListenerBucket extends Array<EventListener> {
  [HELD_BY]: number;
}

/**
 * The one cast this arrangement costs, and the only place a bucket is born.
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
 */
const createBucket = (
  source?: ReadonlyArray<EventListener>,
): ListenerBucket => {
  const bucket = (
    source === undefined ? [] : source.slice(0)
  ) as ListenerBucket;
  bucket[HELD_BY] = 0;
  return bucket;
};

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
const detachAll = (listeners: Array<EventListener>) => {
  listeners.forEach((listener) => listener.detach());
};

// `unknown` for the two listener slots, not `any`: the store never calls into
// them, it only compares them by identity. Saying `any` here claimed a
// knowledge the registry does not have and switched off checking inside a
// function whose whole job is comparison.
const isSimilar = (
  a: {
    listenerType: number | undefined;
    priority: number;
    eventName: string | symbol;
    listenerObject: unknown;
    listener: unknown;
  },
  b: EventListener,
) => {
  if (a.listenerType === b.listenerType) {
    return (
      a.priority === b.priority &&
      a.eventName === b.eventName &&
      a.listenerObject === b.listenerObject &&
      a.listener === b.listener
    );
  }
  return false;
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
 * Both lengths are read once, up front. That is safe because the walk holds
 * these two arrays: a mutation from inside `fn` clones the bucket it changes
 * and leaves these alone, so neither can grow, shrink or acquire a hole while
 * the merge runs.
 */
const mergeWalk = (
  named: Array<EventListener>,
  wildcards: Array<EventListener>,
  fn: (listener: EventListener) => void,
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
      fn(cur);
      ++i;
      continue;
    }
    if (other !== undefined) {
      fn(other);
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

const findSimilarListener = (
  searchFor: EventListener,
  listeners: EventListener[],
) => {
  if (isSimilarListenerType(searchFor.listenerType)) {
    return listeners.find((listener) => isSimilar(searchFor, listener));
  }
  return undefined;
};

export class EventStore {
  readonly namedListeners: Map<EventName, ListenerBucket>;

  // Read-only from the outside, swappable from the inside. It used to be a
  // `readonly` field; clone-on-mutate needs to replace the reference, and a
  // getter over a private field buys that without widening what a holder of
  // the store may do with it. (Consumers never see the store at all since
  // v6.0.0 — the internals slot is opaque in the published types — but this is
  // the boundary AGENTS.md asks to keep drawn, not a hypothetical.)
  private catchEmAllBucket: ListenerBucket;

  get catchEmAllListeners(): Array<EventListener> {
    return this.catchEmAllBucket;
  }

  constructor() {
    this.namedListeners = new Map();
    this.catchEmAllBucket = createBucket();
  }

  getListenersForEventName(eventName: string | symbol): ListenerBucket {
    let namedListeners = this.namedListeners.get(eventName);
    if (!namedListeners) {
      namedListeners = createBucket();
      this.namedListeners.set(eventName, namedListeners);
    }
    return namedListeners;
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
   * Two obligations for anyone adding a mutation path:
   *
   * 1. Route it through here, or a listener that subscribes from inside its
   *    own callback becomes visible to the running dispatch again.
   * 2. Call it only once a mutation is certain — never speculatively. A lookup
   *    that removes nothing must leave bucket identity alone, or "the array
   *    changed" stops meaning "the registry changed" and `EventStore.spec.ts`
   *    stops measuring anything.
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
      this.namedListeners.set(eventName, clone);
    }
    return clone;
  }

  /** Splices one known instance out, if it is in there. Returns the bucket the store holds afterwards. */
  private removeItem(
    eventName: EventName,
    bucket: ListenerBucket,
    item: EventListener,
  ): ListenerBucket {
    const idx = bucket.indexOf(item);
    if (idx < 0) return bucket;
    const target = this.bucketForMutation(eventName, bucket);
    target.splice(idx, 1);
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
   */
  private detachByIdentity(
    eventName: EventName,
    bucket: ListenerBucket,
    listener: unknown,
    listenerObject: unknown,
    isObjectListener: boolean,
  ): ListenerBucket {
    let target = bucket;
    for (let i = bucket.length - 1; i >= 0; i--) {
      const current = bucket[i];
      if (
        current !== undefined &&
        (current.isEqual(listener, listenerObject) ||
          (isObjectListener && current.listenerObject === listener))
      ) {
        if (target === bucket) {
          target = this.bucketForMutation(eventName, bucket);
        }
        target.splice(i, 1);
        current.detach();
      }
    }
    return target;
  }

  /**
   * Returns the listener the registration landed on: the given one when it was
   * inserted, or an existing one with the same identity. Either way the
   * registration is recorded on it, which is what makes `on()` and `once()`
   * aggregate in both registration orders.
   *
   * `obligation` is what used to be a `noDedup`/`kind` flag: `null` for a
   * persistent `on()`, an `OnceObligation` for a `once()`. Its *presence*, not
   * a tag compared against it, is the whole test — the obligation itself is
   * the thing that later has to know every listener it was added to, so
   * threading it through here is what lets `once(ε, ['a','b'], h)` share one
   * obligation across two listeners instead of building two.
   */
  add(
    listener: EventListener,
    obligation: OnceObligation | null = null,
  ): EventListener {
    const bucket = listener.isCatchEmAll
      ? this.catchEmAllBucket
      : this.getListenersForEventName(listener.eventName);

    const similar = findSimilarListener(listener, bucket);
    const target = similar ?? listener;

    if (obligation === null) {
      target.refCount += 1;
    } else if (!target.onceObligations?.includes(obligation)) {
      // The guard is for a duplicated name in one call — once(ε, ['a','a'], h)
      // aggregates onto the listener it just created, and one obligation must
      // not be counted on the same listener twice.
      (target.onceObligations ??= []).push(obligation);
      obligation.members.push(target);
    }

    // An aggregation touches no array, so it owes no clone — searching the
    // live bucket above is safe for the same reason.
    if (similar) return similar;

    const arr = this.bucketForMutation(listener.eventName, bucket);
    arr.splice(findInsertIndex(arr, listener), 0, listener);
    return listener;
  }

  remove(
    listener: unknown,
    listenerObject: unknown,
    removeSimilar = false,
  ): void {
    // off([...])
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
    if (removeSimilar) {
      this.removeByEventNameAndListenerObject(
        listener as EventName,
        listenerObject,
      );
      return;
    }

    // off(fn[, obj]) / off(obj)
    this.removeByListener(listener, listenerObject);
  }

  private removeByEventName(eventName: EventName): void {
    const bucket = this.namedListeners.get(eventName);
    if (bucket !== undefined) {
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
    }
    this.namedListeners.delete(eventName);
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
      this.removeItem(listener.eventName, this.catchEmAllBucket, listener);
    } else {
      const bucket = this.namedListeners.get(listener.eventName);
      if (bucket) {
        const remaining = this.removeItem(listener.eventName, bucket, listener);
        if (remaining.length === 0) {
          this.namedListeners.delete(listener.eventName);
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
    const bucket = this.namedListeners.get(eventName);
    if (!bucket) return;
    const remaining = this.detachByAssociation(
      eventName,
      bucket,
      listenerObject,
    );
    if (remaining.length === 0) {
      this.namedListeners.delete(eventName);
    }
  }

  private removeByListener(listener: unknown, listenerObject: unknown): void {
    const isObjectListener = typeof listener === 'object';

    this.namedListeners.forEach((bucket, name) => {
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
        this.namedListeners.delete(name);
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
    this.namedListeners.forEach((bucket) => {
      detachAll(bucket);
      // The truncation exception again — see removeByEventName(). The map is
      // cleared right after, so the store lets go of these arrays either way.
      if (bucket[HELD_BY] === 0) {
        bucket.length = 0;
      }
    });
    this.namedListeners.clear();

    const wildcards = this.catchEmAllBucket;
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

  forEach(eventName: EventName, fn: (listener: EventListener) => void): void {
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
        : this.namedListeners.get(eventName);
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
        wildcards.forEach(fn);
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
        named.forEach(fn);
      } else {
        mergeWalk(named, wildcards, fn);
      }
    } finally {
      named[HELD_BY] -= 1;
      if (wildcards !== undefined) wildcards[HELD_BY] -= 1;
    }
  }

  getSubscriptionCount(): number {
    let count = this.catchEmAllBucket.length;
    for (const namedListeners of this.namedListeners.values()) {
      count += namedListeners.length;
    }
    return count;
  }
}
