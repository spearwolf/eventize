import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL} from './constants';
import type {EventKeeper} from './EventKeeper';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {
  AnyEventNames,
  EventKeysOf,
  EventMap,
  EventizedObject,
  NonTypedEmitter,
} from './types';
import {isEventName, rejectWildcard} from './utils';

const hasWildcard = (eventNames: unknown): boolean =>
  Array.isArray(eventNames)
    ? eventNames.some((name) => name === EVENT_CATCH_EM_ALL)
    : eventNames === EVENT_CATCH_EM_ALL;

/**
 * `retain()` / `unretain()` / `retainClear()` used to hand `eventNames`
 * straight to `EventKeeper.add()` / `.remove()` / `.clear()`, which take any
 * value and drop it into a `Set` or use it as a `Map` key unchecked —
 * `retain(ε, 42)` filed a policy under `42` that no `emit()` could ever
 * fill, and `getRetainedEventNames()` reported it forever after.
 * `subscribeTo()` closed the same hole for `on()` / `once()` (see
 * `assertEventNameIsUsable()` and its neighbours there), with a cause
 * vocabulary of `'empty-names'`, `'sparse-names'` and `'invalid-name'` on
 * `Error.cause`. This reuses that vocabulary and the one predicate that
 * actually decides "is this a name" — `isEventName()` — rather than writing
 * a second one.
 *
 * It does not reuse `subscribeTo.ts`'s own `assertEventNameIsUsable()`
 * function, on purpose: that helper is private to a module this package does
 * not touch, its `warn()` call logs the whole variadic `subscribeTo()`
 * argument tuple (retain-family calls have no such tuple — just this one
 * parameter), and its thrown message is the literal string `subscribeTo()
 * called with insufficient arguments`, which would misname the call for
 * every caller here. Every other throw in this file already carries a
 * message naming its own function; this matches that, not `subscribeTo()`'s.
 *
 * Checked in the same order `subscribeTo()` uses for its array branch —
 * empty, then a full sparse scan, then a per-element name check — so a
 * shape combining more than one defect reports the same cause both places
 * would. Except for a `[name, priority]` tuple: `subscribeTo()` decodes an
 * array element that is itself an array as such a tuple and checks its
 * first slot as the name, where retain() has no priority and no tuple
 * shape — `retain(ε, [[name, priority]])` sees the inner array as one
 * element that is not a name and rejects it with `'invalid-name'`, the same
 * cause subscribeTo() would reach only if that tuple's own name slot were
 * unusable too.
 */
const assertRetainNamesAreUsable = (
  fnName: 'retain' | 'unretain' | 'retainClear',
  eventNames: AnyEventNames,
): void => {
  if (!Array.isArray(eventNames)) {
    if (!isEventName(eventNames)) {
      throw new Error(
        `${fnName}() called with a value that cannot be an event name`,
        {cause: 'invalid-name'},
      );
    }
    return;
  }
  if (eventNames.length === 0) {
    throw new Error(`${fnName}() called with an empty array of event names`, {
      cause: 'empty-names',
    });
  }
  for (let i = 0; i < eventNames.length; i++) {
    if (!(i in eventNames)) {
      throw new Error(`${fnName}() called with a sparse array of event names`, {
        cause: 'sparse-names',
      });
    }
  }
  for (const name of eventNames) {
    if (!isEventName(name)) {
      throw new Error(
        `${fnName}() called with a value that cannot be an event name`,
        {cause: 'invalid-name'},
      );
    }
  }
};

/**
 * The shared body of `retainClear()` and `unretain()` (ARCH-006): both are
 * the same guard, the same message template save the function name, and the
 * same wildcard branch onto an all-pair of keeper methods. `retain()` is not
 * folded in here — its guard order differs (wildcard checked before
 * `isEventized()`), and unifying that too would change observable behaviour,
 * not just remove duplication.
 */
const keeperCommand = (
  fnName: 'retainClear' | 'unretain',
  eventizedObj: object,
  eventNames: AnyEventNames,
  all: (keeper: EventKeeper) => void,
  one: (keeper: EventKeeper, eventNames: AnyEventNames) => void,
): void => {
  if (!isEventized(eventizedObj)) {
    throw new TypeError(
      `${fnName}() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)`,
    );
  }
  const {keeper} = internalsOf(eventizedObj);
  if (hasWildcard(eventNames)) {
    all(keeper);
    return;
  }
  assertRetainNamesAreUsable(fnName, eventNames);
  one(keeper, eventNames);
};

// ---------------------------------------------------------------------------
// retain() / retainClear() / unretain() — typed event-name overload first.
// ---------------------------------------------------------------------------

// The `| symbol` in all three typed name slots below is the escape hatch `on`,
// `once` and `emit` carry: a private symbol event is not in the map and never
// will be, and the loose arm underneath resolves to `never` for a typed map, so
// without it such an event could be subscribed and fired but never retained.
/**
 * Marks one or more event names as retained: the next `emit()` for that
 * name is remembered and replayed to any listener that subscribes later.
 *
 * Validates all names atomically before retaining any of them — a non-name,
 * an empty array or a sparse array throws and retains nothing (`retain(ε,
 * [])` is no longer a silent no-op); the wildcard `'*'` always throws
 * rather than retaining every event.
 */
export function retain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames:
    EventKeysOf<TEvents> | symbol | Array<EventKeysOf<TEvents> | symbol>,
): void;
export function retain<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function retain(obj: object, eventNames: AnyEventNames): void {
  if (hasWildcard(eventNames)) {
    rejectWildcard('retained');
  }
  // Checked before asEventized() runs, same as the wildcard rejection above:
  // a call that is going to throw either way must not have the side effect
  // of eventizing a plain object first.
  assertRetainNamesAreUsable('retain', eventNames);
  const eventizedObj = asEventized(obj);
  const {keeper} = internalsOf(eventizedObj);
  keeper.add(eventNames);
}

/**
 * Discards the currently stored value for one or more event names, without
 * disabling retain — a later `emit()` for that name is retained again.
 *
 * Throws a `TypeError` if `obj` is not eventized. Name validation is the
 * same atomic check `retain()` uses; the wildcard `'*'` clears every stored
 * value at once and keeps every policy.
 */
export function retainClear<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames:
    EventKeysOf<TEvents> | symbol | Array<EventKeysOf<TEvents> | symbol>,
): void;
export function retainClear<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function retainClear(
  eventizedObj: object,
  eventNames: AnyEventNames,
): void {
  keeperCommand(
    'retainClear',
    eventizedObj,
    eventNames,
    (keeper) => keeper.clearAll(),
    (keeper, names) => keeper.clear(names),
  );
}

/**
 * Fully reverses `retain()`: drops the stored value for one or more event
 * names and stops future emissions from being retained.
 *
 * Throws a `TypeError` if `obj` is not eventized. Name validation is the
 * same atomic check `retain()` uses; the wildcard `'*'` drops every policy
 * and every stored value. Already-subscribed listeners are unaffected —
 * they keep receiving new emissions.
 */
export function unretain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames:
    EventKeysOf<TEvents> | symbol | Array<EventKeysOf<TEvents> | symbol>,
): void;
export function unretain<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function unretain(
  eventizedObj: object,
  eventNames: AnyEventNames,
): void {
  keeperCommand(
    'unretain',
    eventizedObj,
    eventNames,
    (keeper) => keeper.removeAll(),
    (keeper, names) => keeper.remove(names),
  );
}
