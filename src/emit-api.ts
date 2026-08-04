import {EVENT_CATCH_EM_ALL} from './constants';
import type {EventListener} from './EventListener';
import type {EventizeInternals} from './internals';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import type {
  AnyEventNames,
  ArgsFor,
  EventArgs,
  EventKeysOf,
  EventMap,
  EventName,
  EventizedObject,
  NonTypedEmitter,
} from './types';
import type {DispatchTarget} from './utils';
import {dispatchToTarget} from './utils';

/**
 * The dispatch callback, at module level and capturing nothing. Everything it
 * needs arrives as an argument, because `store.forEach()` carries the context
 * through the walk for exactly this purpose: an arrow built here per emit would
 * escape into the walk and allocate a JSFunction plus context on every dispatch
 * that reaches a listener.
 */
const applyListener = (
  listener: EventListener,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  listener.apply(eventName, args, returnValue);
};

// `internals` is an accumulator, not a cache: `_emit()`'s array branch passes
// back whatever the previous call resolved, so a run of concrete names pays
// `internalsOf()` once instead of once per name. The `'*'` check
// stays the first thing this function does, unconditionally, so the resolve
// never moves ahead of it — a name array with `'*'` after concrete names must
// keep throwing the wildcard message, not a stale-internals side effect, and
// a foreign-marker emitter asked for `'*'` must keep getting that same
// message instead of a protocol mismatch. Called with no fourth argument (the
// scalar path, and the first element of every array), it resolves internals
// itself exactly as before.
const _emitOne = (
  eventizedObj: EventizedObject,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
  internals?: EventizeInternals,
): EventizeInternals => {
  if (eventName === EVENT_CATCH_EM_ALL) {
    throw new Error(
      "emit() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be emitted",
    );
  }
  const resolved = internals ?? internalsOf(eventizedObj);
  resolved.store.forEach(
    eventName,
    applyListener,
    eventName,
    args,
    returnValue,
  );
  resolved.keeper.retain(eventName, args);
  return resolved;
};

const _emit = (
  eventizedObj: EventizedObject,
  eventNames: AnyEventNames,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  if (Array.isArray(eventNames)) {
    // `.forEach()`, not a `for...of`: the array form has to keep skipping
    // holes the way `_duckEmit()`'s `.forEach()` below already does, and a
    // `for...of` does not — it reads a hole as `undefined` and dispatches (and
    // retains) an event by that name, which neither this path used to do nor
    // the duck path does today. AGENTS.md ("The two dispatch paths in `emit`
    // move in lockstep") is the reason this loop shape is not a style choice.
    //
    // An empty array never calls `_emitOne()`, so `internalsOf()` never runs
    // for it — same as before this change. The protocol check is not skipped
    // *for any dispatch*; there is simply no dispatch to check it for.
    let internals: EventizeInternals | undefined;
    eventNames.forEach((event: EventName) => {
      internals = _emitOne(eventizedObj, event, args, returnValue, internals);
    });
  } else {
    _emitOne(eventizedObj, eventNames, args, returnValue);
  }
};

// Duck-typing dispatch for non-eventized targets (v5+). The resolution itself
// is `dispatchToTarget()`, the same function the listener-object path in
// EventListener.ts runs — try obj[eventName](...args), else fall back to
// obj.emit(eventName, ...args), else silently no-op — so the two paths cannot
// disagree about what counts as a match and emitAsync() aggregates the same
// way either way. What stays here is the `'*'` rejection: a name array has to
// dispatch the names ahead of the wildcard before it throws, which is a
// property of the loop below, not of a single dispatch.
//
// The duck path ignores the boolean, having no once() to spend on it.
const _duckEmitOne = (
  obj: object,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  if (eventName === EVENT_CATCH_EM_ALL) {
    throw new Error(
      "emit() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be emitted",
    );
  }
  dispatchToTarget(obj as DispatchTarget, eventName, args, returnValue);
};

const _duckEmit = (
  obj: object,
  eventNames: AnyEventNames,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  if (Array.isArray(eventNames)) {
    eventNames.forEach((event: EventName) =>
      _duckEmitOne(obj, event, args, returnValue),
    );
  } else {
    _duckEmitOne(obj, eventNames, args, returnValue);
  }
};

// Since v6.0.0 a function is a duck target too — a class with static handlers,
// a factory carrying methods. This is the same set `asEventized()` accepts and
// the same set `EventStore` treats as a listener object, so `emit(fn, 'foo')`
// no longer means something different before and after `eventize(fn)`. The
// member boundary in `dispatchableMember()` is what makes it safe: without it
// every function target answers `call`, `apply` and `bind`.
const isDuckTarget = (obj: unknown): obj is object =>
  obj != null && (typeof obj === 'object' || typeof obj === 'function');

// ---------------------------------------------------------------------------
// emit() / emitAsync() — typed overload first; loose fallback preserves
// duck-typing on plain objects, multi-event-name calls, etc.
// ---------------------------------------------------------------------------

export function emit<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): void;
export function emit<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): void;
export function emit<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void;
// implementation
export function emit(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void {
  if (isEventized(target)) {
    _emit(target, eventNames, args);
  } else if (isDuckTarget(target)) {
    _duckEmit(target, eventNames, args);
  }
}

const ignoreRejection = () => {
  // deliberately empty: the point is owning the rejection, not reacting to it
};

// Claims the values an aborted emitAsync() dispatch left behind, so none of
// them can be reported as an unhandled rejection. The array case is unwrapped
// the same way the aggregation unwraps it, because a listener that returned an
// array of promises hides its rejections one level down. Non-promise values
// cost a throwaway wrapper each; this runs only on the error path, where the
// aggregation is already lost.
const markCollectedAsHandled = (values: any[]) => {
  for (const val of values) {
    if (Array.isArray(val)) {
      for (const item of val) Promise.resolve(item).catch(ignoreRejection);
    } else {
      Promise.resolve(val).catch(ignoreRejection);
    }
  }
};

export function emitAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents>,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitAsync<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined>;
// implementation
export function emitAsync(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined> {
  const values: any[] = [];
  const returnValue = (val: unknown) => {
    values.push(val);
  };
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, returnValue);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, returnValue);
    }
  } catch (err) {
    // The dispatch aborted mid-walk: a later listener threw, or a '*' inside an
    // event name array was rejected after the preceding names had already run.
    // Whatever is in `values` at that point never reaches the aggregation
    // below, and `values` is a local — nothing outside can attach a handler to
    // a promise sitting in it. A rejected one would be reported as unhandled
    // and, under Node's default --unhandled-rejections=throw, tear down the
    // process even though the caller caught the synchronous throw correctly.
    // Both dispatch paths feed the same collector, so both are covered here.
    markCollectedAsHandled(values);
    // Rethrown unchanged — same error, same stack, no wrapping and no cause.
    // The throw belongs to the listener, not to emitAsync().
    throw err;
  }
  // `Promise.resolve(undefined)`, not the argument-less `Promise.resolve()`:
  // the latter is `Promise<void>`, and the declared `Promise<any[] | undefined>`
  // rejects it. Same value at runtime, and the distinction is the point of
  // narrowing the type — a caller has to handle the empty case.
  //
  // The map() only runs once there is something to map: with no listener
  // (or none that returned a value) `values` is empty, and building a second
  // array just to hand it to Promise.all() would be work for a result nobody
  // asked for.
  return values.length > 0
    ? Promise.all(
        values.map((val: any) =>
          Array.isArray(val) ? Promise.all(val) : Promise.resolve(val),
        ),
      )
    : Promise.resolve(undefined);
}
