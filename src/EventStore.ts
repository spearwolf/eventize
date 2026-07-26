import {EventListener} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';
import type {EventName} from './types';
import {isCatchEmAll, isEventName} from './utils';

type HasPriorityOrIdType = {priority: number; id: number};

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

const removeItemFromArray = (arr: Array<any>, item: any) => {
  const idx = arr.indexOf(item);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
};

// An undefined tag is similar to nothing — both comparisons already say so.
const isSimilarListenerType = (listenerType: number | undefined) =>
  listenerType === LISTENER_IS_OBJ || listenerType === LISTENER_IS_NAMED_FUNC;

// Removes *every* match, not just the first. One bucket can hold several
// listeners that are equal by this test: two once() registrations (exempt from
// dedup since v6.0.0), two on() calls at differing priorities (priority is part
// of the similarity key, so they never collapse), or the same function
// subscribed twice (functions never dedup). off(ε, listenerObject) promises to
// remove all of them, and splicing only the first left the rest subscribed and
// still firing. Walking backwards keeps the indices of the entries not yet
// visited valid across the splice; each removed listener is detached in the
// same step, so the array never holds a detached entry for a later isEqual to
// read nulled fields from.
const removeListenerFromArray = (
  listeners: Array<EventListener>,
  listener: unknown,
  listenerObject: unknown,
) => {
  for (let i = listeners.length - 1; i >= 0; i--) {
    // i walks strictly inside [0, listeners.length), so listeners[i] is
    // always defined here — the undefined branch exists for the compiler.
    const current = listeners[i];
    if (current !== undefined && current.isEqual(listener, listenerObject)) {
      current.detach();
      listeners.splice(i, 1);
    }
  }
};

const removeSimilarListenersFromArray = (
  fromArray: Array<EventListener>,
  eventName: unknown,
  listenerObject: unknown,
) => {
  const similarListeners: EventListener[] = [];
  for (const listener of fromArray) {
    if (
      (eventName == null && listener.listenerObject === listenerObject) ||
      // Three registration shapes can associate an object with a listener:
      // on(ε, name, listenerObject) parks it in `listener`, while both
      // on(ε, name, methodName, listenerObject) and on(ε, name, fn, context)
      // park it in `listenerObject`. All three are matched here, which mirrors
      // the nameless off(ε, listenerObject) branch above.
      (listener.eventName === eventName &&
        (listener.listener === listenerObject ||
          listener.listenerObject === listenerObject))
    ) {
      similarListeners.push(listener);
    }
  }
  for (const listener of similarListeners) {
    removeListenerFromArray(fromArray, listener, undefined);
  }
};

const removeAll = (fromArray: Array<EventListener> | undefined) => {
  if (fromArray) {
    // Detach-then-truncate: for the duration of this loop the array still
    // holds detached listeners. Harmless while the body only detaches; adding
    // any isEqual-based lookup here would read nulled fields.
    fromArray.forEach((listener) => listener.detach());
    fromArray.length = 0;
  }
};

const isSimilar = (
  a: {
    listenerType: number | undefined;
    priority: number;
    eventName: string | symbol;
    listenerObject: any;
    listener: any;
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

const findSimilarListener = (
  searchFor: EventListener,
  listeners: EventListener[],
) => {
  if (isSimilarListenerType(searchFor.listenerType)) {
    return listeners.find((listener) => isSimilar(searchFor, listener));
  }
  return undefined;
};

const insertOrFindSimilarListener = (
  listener: EventListener,
  arr: EventListener[],
): EventListener => {
  const similarListener = findSimilarListener(listener, arr);
  if (similarListener) {
    similarListener.refCount += 1;
    return similarListener;
  }
  arr.splice(findInsertIndex(arr, listener), 0, listener);
  return listener;
};

export class EventStore {
  readonly namedListeners: Map<EventName, Array<EventListener>>;
  readonly catchEmAllListeners: Array<EventListener>;

  constructor() {
    this.namedListeners = new Map();
    this.catchEmAllListeners = [];
  }

  getListenersForEventName(eventName: string | symbol): EventListener[] {
    let namedListeners = this.namedListeners.get(eventName);
    if (!namedListeners) {
      namedListeners = [];
      this.namedListeners.set(eventName, namedListeners);
    }
    return namedListeners;
  }

  /**
   * Returns the given listener, or — when an identical one is already
   * registered and `noDedup` is false — the existing one with its reference
   * count increased.
   *
   * `once()` passes `noDedup: true`: two one-shot subscriptions mean two
   * firings, and collapsing them leaves a listener whose own idempotence
   * guard blocks its handles from ever releasing it.
   */
  add(listener: EventListener, noDedup = false): EventListener {
    const bucket = listener.isCatchEmAll
      ? this.catchEmAllListeners
      : this.getListenersForEventName(listener.eventName);
    if (noDedup) {
      bucket.splice(findInsertIndex(bucket, listener), 0, listener);
      return listener;
    }
    return insertOrFindSimilarListener(listener, bucket);
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

    // off(EventListener) — used by the unsubscribe function returned from on()
    if (listener instanceof EventListener) {
      this.removeByEventListener(listener);
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
    removeAll(this.namedListeners.get(eventName));
    this.namedListeners.delete(eventName);
  }

  private removeByEventListener(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount >= 1) return;

    // A listener lives in exactly one bucket: the catch-em-all array, or the
    // named array for its own eventName. A multi-event on() creates one
    // EventListener per name, so there is never more than one home to visit.
    if (listener.isCatchEmAll) {
      removeItemFromArray(this.catchEmAllListeners, listener);
    } else {
      const bucket = this.namedListeners.get(listener.eventName);
      if (bucket) {
        removeItemFromArray(bucket, listener);
        if (bucket.length === 0) {
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
      removeSimilarListenersFromArray(
        this.catchEmAllListeners,
        eventName,
        listenerObject,
      );
      return;
    }

    // The event name is known, and the filter checks it anyway — no reason to
    // walk every other bucket. Catch-em-all listeners are not in this one:
    // they live in the array the branch above handles, which is where they
    // have always been and where this path only started looking in v6.1.0.
    const bucket = this.namedListeners.get(eventName);
    if (!bucket) return;
    removeSimilarListenersFromArray(bucket, eventName, listenerObject);
    if (bucket.length === 0) {
      this.namedListeners.delete(eventName);
    }
  }

  private removeByListener(listener: unknown, listenerObject: unknown): void {
    const isObjectListener = typeof listener === 'object';
    this.namedListeners.forEach((namedListeners, name) => {
      removeListenerFromArray(namedListeners, listener, listenerObject);
      if (isObjectListener) {
        removeSimilarListenersFromArray(namedListeners, undefined, listener);
      }
      if (namedListeners.length === 0) {
        this.namedListeners.delete(name);
      }
    });
    removeListenerFromArray(this.catchEmAllListeners, listener, listenerObject);
    if (isObjectListener) {
      removeSimilarListenersFromArray(
        this.catchEmAllListeners,
        undefined,
        listener,
      );
    }
  }

  removeAllListeners(): void {
    this.namedListeners.forEach((namedListeners) => removeAll(namedListeners));
    this.namedListeners.clear();
    removeAll(this.catchEmAllListeners);
  }

  forEach(eventName: EventName, fn: (listener: EventListener) => void): void {
    // Snapshotting protects against a listener unsubscribing (or subscribing)
    // from inside its own callback — the walk below must not see that
    // mutation. But slice(0) is itself an allocation, so each branch below
    // only copies the bucket(s) it actually walks, and skips the copy
    // entirely when that bucket is empty (nothing to protect a walk over
    // zero elements from).
    const namedBucket = this.namedListeners.get(eventName);

    if (
      eventName === EVENT_CATCH_EM_ALL ||
      !namedBucket ||
      namedBucket.length === 0
    ) {
      if (this.catchEmAllListeners.length > 0) {
        this.catchEmAllListeners.slice(0).forEach(fn);
      }
      return;
    }

    if (this.catchEmAllListeners.length === 0) {
      namedBucket.slice(0).forEach(fn);
    } else {
      const namedListeners = namedBucket.slice(0);
      const catchEmAllListeners = this.catchEmAllListeners.slice(0);
      const iLen = namedListeners.length;
      const jLen = catchEmAllListeners.length;
      let i = 0;
      let j = 0;
      while (i < iLen || j < jLen) {
        // cur/other are defined exactly when i < iLen / j < jLen — the ternary
        // re-expresses those bounds checks so the compiler can see it too.
        const cur = i < iLen ? namedListeners[i] : undefined;
        const other = j < jLen ? catchEmAllListeners[j] : undefined;
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
          // cur/other read as undefined here for one of two reasons: the
          // loop is legitimately done (i >= iLen and j >= jLen, in which case
          // the while-condition above already exits first), or one of the
          // snapshots is holey below its own length. A hole is a corrupted
          // array — the same call made in findInsertIndex above — so this
          // throws rather than silently dispatching a truncated prefix and
          // dropping every real listener still queued behind the hole.
          throw new Error('EventStore: forEach encountered a hole');
        }
      }
    }
  }

  getSubscriptionCount(): number {
    let count = this.catchEmAllListeners.length;
    for (const namedListeners of this.namedListeners.values()) {
      count += namedListeners.length;
    }
    return count;
  }
}
