import type {EventListener} from './EventListener';

type HasPriorityOrIdType = {priority: number; id: number};

const sortByPriorityAndId = (
  a: HasPriorityOrIdType,
  b: HasPriorityOrIdType,
): number =>
  a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

export const findInsertIndex = (
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
 * generic implementation buys its checking back with three casts.
 * `EventStore.forEach()` therefore declares the generic signature and
 * implements it against this one: callers get the slots matched against the
 * callback they passed (a swapped pair is rejected), while the walk itself
 * carries values it never reads.
 */
export type WalkCallback = (
  listener: EventListener,
  a?: any,
  b?: any,
  c?: any,
) => void;

/**
 * Walks one bucket, for the dispatch that has only one. A module-level function
 * for the same reason as `mergeWalk()` below — `EventStore.forEach()` is close
 * enough to TurboFan's inlining budget that neither loop belongs in its body.
 *
 * An index loop rather than `Array.prototype.forEach`, which hands its callback
 * `(element, index, array)` and would land the index in the first context slot.
 * The length is read once up front, which is safe for the same reason it is in
 * `mergeWalk()`: the walk holds this array, so a mutation from inside `fn`
 * clones the bucket and leaves this one alone. The `undefined` guard keeps the
 * builtin's behaviour on a holey bucket — the hole is skipped in silence here,
 * while `mergeWalk()` throws on one. It differs on one case the builtin would
 * have visited, an element that really is `undefined`, which no bucket can
 * hold: only `EventListener` instances ever go in.
 */
export const walkBucket = (
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
 * inside `EventStore.forEach()`, and that placement is measured, not cosmetic:
 * `forEach()` carries a `try`/`finally`, which puts it close enough to
 * TurboFan's inlining budget that its exact size decides whether the *caller*
 * inlines it. With the merge loop in the body, two benchmark harnesses
 * differing only in trivia measured the same mutation-free 64-listener dispatch
 * at 535 ns and 653 ns — stably, one value each. Moving the loop out took both
 * to ~535.
 *
 * Two traps when re-measuring any of this. Loading two library variants into
 * one process makes the call site polymorphic and moves results by double
 * digits, so a comparison run wants one variant per process — and this function
 * wants a process of its own either way. Individual cells move by ten points
 * between runs: quote ranges, never a single cell.
 *
 * Both lengths are read once, up front. That is safe because the walk holds
 * these two arrays: a mutation from inside `fn` clones the bucket it changes
 * and leaves these alone, so neither can grow, shrink or acquire a hole while
 * the merge runs.
 */
export const mergeWalk = (
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
