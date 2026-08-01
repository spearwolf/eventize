import {internalsOf} from '../internals';

import type {EventListener} from '../EventListener';
import type {EventStore} from '../EventStore';
import type {EventMap, EventName, EventizedObject} from '../types';

/**
 * Reach into an emitter's `EventStore` from a spec.
 *
 * Up to v5.1.0 the specs got at the `EventListener` a subscription produced
 * through `unsubscribe.listener` / `.listeners`. Those properties are gone from
 * the public surface — they handed out an internal class no consumer could
 * construct, subclass or `instanceof`, and the union declaring them made both
 * fields unreadable anyway. The registry state they exposed is still worth
 * pinning, so the specs now say out loud what they are doing: reading internals.
 *
 * Every signature takes `EventizedObject<T>` generically rather than a fixed
 * `EventizedObject`: the `__TEventsBrand` phantom field makes the type
 * invariant in `TEvents`, so a concrete emitter is not assignable to any single
 * instantiation. Binding `T` per call is what lets both `eventize()` and a typed
 * `eventize<MyEvents>()` through the same helper without a cast.
 *
 * Nothing here is public API, and none of it should ever be re-exported from
 * `src/index.ts`.
 */

/** The emitter's listener registry, without an `as any` at the call site. */
export const storeOf = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventStore => internalsOf(obj).store;

/** Every registered listener, named buckets first, then the wildcard bucket. */
export const allListeners = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventListener[] => {
  const {store} = internalsOf(obj);
  return [
    ...Array.from(store.namedListeners.values()).flat(),
    ...store.catchEmAllListeners,
  ];
};

/**
 * The listeners registered for one event name, in dispatch order within their
 * bucket. Reads through `EventStore.peekListeners()`, which folds in the same
 * `'*'`-reads-the-wildcard-bucket special case
 * `EventStore.removeByEventNameAndListenerObject()` has to make, and neither
 * creates a bucket for an unknown name nor hands back a mutable reference —
 * the `ReadonlyArray` return type is the guarantee, not a defensive copy, so
 * there is nothing left for this helper to spread. A spec that needs to
 * mutate the result (sorting in place, for instance) still has to copy it
 * itself.
 *
 * The old spread did two more things besides stripping mutability, and
 * neither is needed here either: it took a snapshot, and it dropped the
 * `HELD_BY` symbol a live bucket carries. That symbol is why a spec must
 * compare this method's result by identity and length, not `toEqual()` — a
 * known name's bucket carries it and fails a `toEqual()` against a plain
 * array literal, while the shared empty answer for an unknown name is a
 * plain frozen `[]` and passes. Same return type, two different comparable
 * shapes depending on state; see AGENTS.md, "compare buckets by identity and
 * length".
 */
export const listenersOf = <T extends EventMap>(
  obj: EventizedObject<T>,
  eventName: EventName,
): ReadonlyArray<EventListener> =>
  internalsOf(obj).store.peekListeners(eventName);

/**
 * The most recently *created* listener on this emitter, identified by the
 * highest `EventListener.id` — the same monotonic counter that breaks priority
 * ties. Call it directly after the `on()` / `once()` whose listener you want;
 * a later subscription on the same emitter takes the title.
 *
 * A call that de-duplicates onto an existing registration creates no listener,
 * so this would return the older one it folded into. Every spec using it
 * subscribes something new.
 */
export const latestListener = <T extends EventMap>(
  obj: EventizedObject<T>,
): EventListener =>
  allListeners(obj).reduce((newest, candidate) =>
    candidate.id > newest.id ? candidate : newest,
  );

/**
 * The two most recently created listeners, oldest first — which for a two-name
 * `on(ε, ['foo', 'bar'], …)` is the order the event names were given in,
 * because `_subscribeTo()` registers them left to right and `id` increments per
 * construction.
 *
 * The return type is a tuple, not an array, so `noUncheckedIndexedAccess`
 * doesn't force a null check into every assertion. Throwing when the pair is
 * incomplete is what earns that tuple: the alternative is a cast that lies
 * about a registration which never happened.
 */
export const latestListenerPair = <T extends EventMap>(
  obj: EventizedObject<T>,
): [EventListener, EventListener] => {
  const [first, second] = allListeners(obj)
    .sort((a, b) => a.id - b.id)
    .slice(-2);
  if (first === undefined || second === undefined) {
    throw new Error(
      `latestListenerPair(): expected two listeners, found ${allListeners(obj).length}`,
    );
  }
  return [first, second];
};
