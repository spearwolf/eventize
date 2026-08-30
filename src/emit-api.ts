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
import {
  asDispatchTarget,
  dispatchToTarget,
  isAttachableTarget,
  rejectWildcard,
  warn,
} from './utils';
import type {DispatchTarget} from './utils';

/**
 * The shape both walk callbacks share. Naming it keeps `store.forEach()`'s
 * generic slots matched against what the callback actually reads, instead of
 * widening to `WalkCallback`'s `any` triple at the one place that still knows
 * the real types.
 */
type ApplyListenerFn = (
  listener: EventListener,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => void;

/**
 * The dispatch callback, at module level and capturing nothing. Everything it
 * needs arrives as an argument, because `store.forEach()` carries the context
 * through the walk for exactly this purpose: an arrow built here per emit would
 * escape into the walk and allocate a JSFunction plus context on every dispatch
 * that reaches a listener.
 */
const applyListener: ApplyListenerFn = (
  listener,
  eventName,
  args,
  returnValue,
) => {
  listener.apply(eventName, args, returnValue);
};

/**
 * The one wording a guarded dispatch reports a caught throw with, shared by
 * the two guarded callbacks (`applyListenerSafe()` here, and the duck path's
 * `dispatchGuarded()`). Same reasoning as `rejectWildcard()` in `utils.ts`:
 * a corrected wording in one place must not let the other drift.
 */
const warnListenerThrew = (eventName: EventName, error: unknown): void => {
  warn('a listener threw; the dispatch continues. event:', eventName, error);
};

/**
 * The failure list of the innermost `emitStrict()` / `emitStrictAsync()` frame,
 * or `null` when no strict dispatch is running on this stack.
 *
 * A module-level slot rather than a parameter, and that is what keeps the
 * guarded callbacks module constants. A closure built per call would allocate a
 * JSFunction plus a context on every guarded emit and — worse — send a fresh
 * function identity through the one shared `fn(listener, a, b, c)` call site in
 * `walk.ts`, which is megamorphic by construction. A third callback identity
 * would be cheaper than that and still trimorphic, and it would buy a
 * difference that exists only inside a `catch`. So the callback pair stays two
 * and the sink moves instead: `emitStrict()` adds nothing to the process-wide
 * surcharge `applyListenerSafe()` measures above.
 *
 * That claim is measured, not argued. Same methodology as the surcharge itself
 * — one variant per process, 1e6 dispatches to 64 listeners, 25 processes per
 * cell, interleaved and then re-run in the opposite order. An emit-only program
 * measured 526.52-588.91 ns against a baseline of 525.83-612.69 ns; a program
 * that first sends 1e5 `emitSafe()` calls through the emitter measured
 * 630.03-724.23 ns against 628.48-714.41 ns; and the same program built on
 * `emitStrict()` measured 623.43-700.03 ns. Medians in that order: 541.09 to
 * 541.92, 644.49 to 642.29, and 646.26. The third cell is the one this shape
 * exists for — it lands on top of the second rather than beside it, because
 * the shared call site saw the same two callbacks either way. Individual cells
 * wander by ten points between runs; quote ranges, never one value.
 *
 * Saved and restored rather than pushed and popped, which makes nesting
 * reentrant by construction: a listener that emits during a strict dispatch
 * opens its own frame, and its failures belong to its own call site. `finally`
 * restores on every exit, so an unwinding frame leaves nothing behind.
 *
 * Per module instance, like the counters in `EventListener.ts` — and harmless
 * for the same reason two of those are: the slot and the callbacks that read it
 * always come from the same module instance.
 */
let collectedFailures: unknown[] | null = null;

/**
 * Where a caught listener throw goes. Inside a strict frame it joins the
 * failure list the caller will receive; everywhere else it is reported through
 * `warn()`, exactly as a guarded dispatch has reported it since v6.1.0.
 *
 * This indirection is the entire difference between the two guarded variants.
 * It sits in a `catch`, so it runs only when something has already thrown.
 */
const reportListenerThrow = (eventName: EventName, error: unknown): void => {
  if (collectedFailures !== null) {
    collectedFailures.push(error);
  } else {
    warnListenerThrew(eventName, error);
  }
};

/**
 * The one-or-many rule, in one place because both strict variants apply it and
 * they must not drift.
 *
 * A single failure is handed back unchanged — same error, same stack, no
 * wrapping and no `cause` — so that replacing `emit()` with `emitStrict()`
 * leaves every existing `toThrow(…)` assertion intact. Only a second failure
 * changes the shape, and a second failure is something `emit()` could never
 * have produced: it aborted at the first.
 */
const collectedError = (failures: unknown[]): unknown =>
  failures.length === 1
    ? failures[0]
    : new AggregateError(failures, 'emitStrict: one or more listeners failed');

/**
 * `applyListener`'s guarded twin, for `emitSafe()` / `emitSafeAsync()`.
 *
 * The `try` goes around `listener.apply()` and must not move inside it.
 * `EventListener.apply()` settles a `once()` obligation *after* the listener
 * returns, so a throw skipping that settle is what leaves a throwing `once()`
 * subscribed — the behaviour `emit()` has always had and this variant keeps.
 * Guarding one level deeper would silently spend the one-shot instead.
 *
 * A second module-level function rather than a flag read inside the existing
 * one: the flag would put a branch and a `try` into the hottest function in the
 * library, and a program that never calls `emitSafe` would pay for both.
 *
 * The cost of this shape lands at the `fn(listener, a, b, c)` call site inside
 * `walkBucket()` / `mergeWalk()` in `walk.ts` — one place in the source, shared
 * by every caller. So the bimorphic surcharge is process-wide, not per-emitter:
 * once anything in a process calls `emitSafe`, every `emit()` in that process
 * pays it, whatever emitter it targets. Measured over this change, one variant
 * per process, 1e6 dispatches to 64 listeners per process, 25 processes per
 * cell, interleaved and then re-run in the opposite order: an emit-only
 * program stayed at 431.84–470.87 ns (median 437.26) against a baseline of
 * 425.47–451.14 ns (median 434.71), while a program that first sends 1e5
 * `emitSafe()` calls through the emitter and only then times `emit()` measured
 * 554.65–580.52 ns (median 564.63) against a baseline of 428.79–450.11 ns
 * (median 438.51) — roughly +29%, about 126 ns on a 64-listener dispatch, with
 * the two ranges not overlapping at all.
 *
 * Where the caught error goes is not decided here. `reportListenerThrow()`
 * answers that, and a variant that wants the failures somewhere else changes
 * the sink rather than adding a callback beside this one.
 */
const applyListenerSafe: ApplyListenerFn = (
  listener,
  eventName,
  args,
  returnValue,
) => {
  try {
    listener.apply(eventName, args, returnValue);
  } catch (error) {
    reportListenerThrow(eventName, error);
  }
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
  apply: ApplyListenerFn,
  returnValue?: (val: unknown) => void,
  internals?: EventizeInternals,
): EventizeInternals => {
  if (eventName === EVENT_CATCH_EM_ALL) {
    rejectWildcard('emitted');
  }
  const resolved = internals ?? internalsOf(eventizedObj);
  resolved.store.forEach(eventName, apply, eventName, args, returnValue);
  resolved.keeper.retain(eventName, args);
  return resolved;
};

const _emit = (
  eventizedObj: EventizedObject,
  eventNames: AnyEventNames,
  args: EventArgs,
  apply: ApplyListenerFn,
  returnValue?: (val: unknown) => void,
) => {
  if (Array.isArray(eventNames)) {
    // An index loop with an explicit hole check, not a `for...of`: the array
    // form has to keep skipping holes the way `_duckEmit()`'s loop below
    // already does, and a `for...of` does not — it reads a hole as `undefined`
    // and dispatches (and retains) an event by that name, which neither this
    // path used to do nor the duck path does today. AGENTS.md ("The two
    // dispatch paths in `emit` move in lockstep") is the reason this loop
    // shape is not a style choice. `Array.prototype.forEach` would skip holes
    // too, but only by allocating a per-call arrow to hand it — and this one
    // would also close over `internals`, costing V8 a context cell on top;
    // the `in` check gets the same hole-skipping without either.
    //
    // An empty array never calls `_emitOne()`, so `internalsOf()` never runs
    // for it — same as before this change. The protocol check is not skipped
    // *for any dispatch*; there is simply no dispatch to check it for.
    let internals: EventizeInternals | undefined;
    for (let i = 0; i < eventNames.length; i++) {
      if (!(i in eventNames)) continue;
      internals = _emitOne(
        eventizedObj,
        eventNames[i] as EventName,
        args,
        apply,
        returnValue,
        internals,
      );
    }
  } else {
    _emitOne(eventizedObj, eventNames, args, apply, returnValue);
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

/**
 * The duck path's counterpart to `ApplyListenerFn`. `dispatchToTarget()`
 * itself satisfies it — its `boolean` return is assignable to `void`, and the
 * duck path has no `once()` to spend on that boolean — so the unguarded path
 * passes it directly and pays no wrapper frame.
 */
type DuckDispatchFn = (
  target: DispatchTarget,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (retVal: unknown) => void,
) => void;

/**
 * The duck path's guard, mirroring `applyListenerSafe()` down to the report.
 * Same rule, same reason: both dispatch paths carry the guard, or neither does
 * — and both reach the same sink, so a strict dispatch collects from either.
 */
const dispatchGuarded: DuckDispatchFn = (
  target,
  eventName,
  args,
  returnValue,
) => {
  try {
    dispatchToTarget(target, eventName, args, returnValue);
  } catch (error) {
    reportListenerThrow(eventName, error);
  }
};

const _duckEmitOne = (
  obj: object,
  eventName: EventName,
  args: EventArgs,
  dispatch: DuckDispatchFn,
  returnValue?: (val: unknown) => void,
) => {
  if (eventName === EVENT_CATCH_EM_ALL) {
    rejectWildcard('emitted');
  }
  dispatch(asDispatchTarget(obj), eventName, args, returnValue);
};

const _duckEmit = (
  obj: object,
  eventNames: AnyEventNames,
  args: EventArgs,
  dispatch: DuckDispatchFn,
  returnValue?: (val: unknown) => void,
) => {
  if (Array.isArray(eventNames)) {
    // Same index loop as `_emit()`'s array branch above, for the same reason:
    // hole-skipping without a per-call arrow. Kept in lockstep with it per
    // AGENTS.md ("The two dispatch paths in `emit` move in lockstep").
    for (let i = 0; i < eventNames.length; i++) {
      if (!(i in eventNames)) continue;
      _duckEmitOne(
        obj,
        eventNames[i] as EventName,
        args,
        dispatch,
        returnValue,
      );
    }
  } else {
    _duckEmitOne(obj, eventNames, args, dispatch, returnValue);
  }
};

// Since v6.0.0 a function is a duck target too — a class with static handlers,
// a factory carrying methods. This is the same set `asEventized()` accepts and
// the same set `EventStore` treats as a listener object, so `emit(fn, 'foo')`
// no longer means something different before and after `eventize(fn)`. The
// member boundary in `dispatchableMember()` is what makes it safe: without it
// every function target answers `call`, `apply` and `bind`.
//
// The sameness is the predicate itself now, not a claim about two conditions:
// `asEventized()` asks `isAttachableTarget()` too. The alias stays because on
// this side the set answers a different question — "will a dispatch to this
// reach anything" rather than "can a marker be attached to it" — and because
// the name is what the two call sites below read as.
const isDuckTarget = isAttachableTarget;

// ---------------------------------------------------------------------------
// emit() / emitAsync() — typed overload first; loose fallback preserves
// duck-typing on plain objects, multi-event-name calls, etc.
// ---------------------------------------------------------------------------

/**
 * Dispatches an event synchronously to every subscribed listener, in
 * priority order, and updates the retained value for that name.
 *
 * Throws if the event name is (or, for an array of names, contains) the
 * wildcard `'*'` — emit a concrete name instead.
 */
export function emit<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): void;
export function emit<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
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
    _emit(target, eventNames, args, applyListener);
  } else if (isDuckTarget(target)) {
    _duckEmit(target, eventNames, args, dispatchToTarget);
  }
}

/**
 * Like `emit()`, but a listener that throws does not stop the others: the
 * throw is caught, reported through `console.warn`, and the dispatch
 * continues.
 *
 * The guarantee is **execution, not completeness** — no listener can prevent
 * the others from running. It is not a promise that nothing went wrong. One
 * throw still leaves this call: `'*'` as an event name, or inside a name
 * array, where the names ahead of it dispatch first. It does not come from a
 * listener, which is why the guard is not between you and it.
 *
 * Two consequences differ from `emit()` and are intended. The retained value
 * *is* written, because the event was delivered. And a `once()` queued behind
 * a throwing listener is spent, because it now runs. The throwing listener
 * itself keeps its subscription either way.
 */
export function emitSafe<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): void;
export function emitSafe<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): void;
export function emitSafe<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void;
// implementation
export function emitSafe(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void {
  // The slot is cleared for the duration of this dispatch, not merely left
  // alone. A listener running under `emitStrict()` may call `emitSafe()`, and
  // its caught throws belong in the console: the strict caller asked to be
  // handed what *its* listeners failed with, not what a nested call decided to
  // swallow on its own behalf.
  const previousFailures = collectedFailures;
  collectedFailures = null;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded);
    }
  } finally {
    collectedFailures = previousFailures;
  }
}

/**
 * Like `emit()`, but every listener runs *and* every failure reaches you.
 *
 * `emitSafe()` buys execution by spending the error; this one keeps both
 * halves. A throwing listener no longer stops the ones queued behind it, and
 * what it threw is raised again once the last listener has returned:
 *
 * - nothing threw → normal return;
 * - one failure → rethrown unchanged, same error and same stack, so swapping
 *   `emit()` for this function leaves an existing `toThrow(…)` assertion
 *   intact;
 * - two or more → an `AggregateError` holding them in dispatch order. That
 *   shape is new by definition: `emit()` aborted at the first failure, so a
 *   second one could not exist.
 *
 * The call's own errors are not listener failures, and they are not dropped
 * either. `'*'` as an event name is still rejected and still ends the dispatch
 * — the names behind it in an array do not run — and so is a corrupted bucket.
 * Both enter the same list, last, where the rule above decides the shape. A
 * lone wildcard therefore still throws the plain `Error` a caller expects,
 * while a wildcard behind failing listeners no longer erases what the dispatch
 * had already collected.
 *
 * Retain and `once()` behave as they do under `emitSafe()`, for the same
 * reason: the event *was* delivered. The retained value is written even though
 * a listener threw, a `once()` queued behind a failure is spent because it now
 * runs, and a throwing `once()` keeps its own subscription.
 */
export function emitStrict<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): void;
export function emitStrict<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): void;
export function emitStrict<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void;
// implementation
export function emitStrict(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void {
  const previousFailures = collectedFailures;
  const failures: unknown[] = [];
  collectedFailures = failures;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded);
    }
  } catch (err) {
    // Not a listener's throw: the wildcard rejection or a corrupted bucket,
    // both raised outside `listener.apply()`. Under `emitSafe()` they leave the
    // call unguarded, which is right there — the guard is not between a caller
    // and its own mistake. Here they are collected instead, because the list is
    // the error channel: dropping them would be the one thing this variant
    // exists not to do.
    failures.push(err);
  } finally {
    collectedFailures = previousFailures;
  }
  if (failures.length > 0) {
    throw collectedError(failures);
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
//
// Both this and the aggregation below unwrap exactly one level. A promise
// nested deeper than that — a listener returning `[[Promise.reject(...)]]` —
// belongs to the listener, not to emitAsync(): the inner array is not a
// thenable, so Promise.all() hands it back as a value instead of reaching
// into it, and a rejection sitting inside it is reported as an unowned
// unhandled rejection even when the caller correctly catches emitAsync()'s
// own result. Unwrapping deeper would spend a recursive walk on every
// dispatch to save one such listener from itself; not worth the cost.
const markCollectedAsHandled = (values: any[]) => {
  for (const val of values) {
    if (Array.isArray(val)) {
      for (const item of val) Promise.resolve(item).catch(ignoreRejection);
    } else {
      Promise.resolve(val).catch(ignoreRejection);
    }
  }
};

/**
 * Like `emit()`, but awaits every listener's return value — including a
 * promise or an array of promises among them — before resolving.
 *
 * Resolves `undefined`, not `[]`, when no listener returned anything; check
 * for that before indexing the result. Throws the same way `emit()` does
 * for a wildcard name.
 */
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
  K extends EventKeysOf<TEvents> | symbol,
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
      _emit(target, eventNames, args, applyListener, returnValue);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchToTarget, returnValue);
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

/**
 * Like `emitAsync()`, but a listener that throws synchronously does not stop
 * the others — same guard as `emitSafe()`, same `console.warn` report.
 *
 * The aggregation is unchanged: `Promise.all`, fail-fast. A listener returning
 * a rejected promise still rejects the returned promise. That is the guarantee
 * drawn exactly where it belongs — a rejection prevents no execution, because
 * every listener has already run synchronously by the time one arrives.
 *
 * The `try`/`catch` below is reached less often than `emitAsync()`'s, not
 * never: a `'*'` inside a name array still throws after the preceding names
 * have collected their promises, and so does a corrupted bucket. Dropping it
 * would turn that case into an unhandled rejection.
 */
export function emitSafeAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitSafeAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitSafeAsync<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined>;
// implementation
export function emitSafeAsync(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined> {
  const values: any[] = [];
  const returnValue = (val: unknown) => {
    values.push(val);
  };
  // Same slot discipline as `emitSafe()`, and the dispatch phase this covers is
  // the synchronous one — the only phase that can reach the guard at all.
  const previousFailures = collectedFailures;
  collectedFailures = null;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe, returnValue);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded, returnValue);
    }
  } catch (err) {
    markCollectedAsHandled(values);
    throw err;
  } finally {
    collectedFailures = previousFailures;
  }
  return values.length > 0
    ? Promise.all(
        values.map((val: any) =>
          Array.isArray(val) ? Promise.all(val) : Promise.resolve(val),
        ),
      )
    : Promise.resolve(undefined);
}

/**
 * Splits `Promise.allSettled` results into the resolved array and the failure
 * list, positionally — which is the whole reason `emitStrictAsync()` does not
 * aggregate with `Promise.all`. Positional results mean the failures come back
 * in the order the listeners were dispatched in, not in the order their
 * promises happened to settle.
 *
 * `values` is consulted for one thing only: telling an inner-array slot from a
 * plain one. A listener that returned an array was itself aggregated with
 * `allSettled`, so its slot is always fulfilled and always holds a result
 * array — the level where `Promise.all` would have hidden every rejection but
 * the first.
 */
const splitSettled = (
  values: any[],
  results: PromiseSettledResult<any>[],
  failures: unknown[],
): any[] => {
  const resolved: any[] = [];
  // `entries()` rather than an index loop: `noUncheckedIndexedAccess` types
  // `results[i]` as possibly `undefined`, and a guard for a hole this array
  // cannot have is an untestable branch.
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      failures.push(result.reason);
      continue;
    }
    if (!Array.isArray(values[index])) {
      resolved.push(result.value);
      continue;
    }
    const inner: any[] = [];
    for (const item of result.value as PromiseSettledResult<any>[]) {
      if (item.status === 'rejected') {
        failures.push(item.reason);
      } else {
        inner.push(item.value);
      }
    }
    resolved.push(inner);
  }
  return resolved;
};

/**
 * `emitStrict()`'s asynchronous twin: every listener runs, every failure is
 * reported, and the promise is the only channel either half arrives through.
 *
 * **Why `allSettled` and not `Promise.all`.** `emitAsync()` and
 * `emitSafeAsync()` are fail-fast by aggregation: of *n* rejected listener
 * promises the caller sees exactly one, whichever rejected first *in time*, and
 * the other reasons are gone. Not unhandled — `Promise.all` attaches a handler
 * to every element, so it owns them — simply unreported. One level down the
 * same thing repeats for a listener that returned an array of promises. For
 * `emitSafeAsync()` that is defensible: its guard protects execution, and by
 * the time any promise rejects every listener has already run. For a variant
 * whose entire contract is "report everything" it is a hole, and one with a
 * visible seam — the synchronous half would collect four throws and re-raise
 * all four while the asynchronous half discarded three rejections out of four.
 * So both levels aggregate with `allSettled` here.
 *
 * The failure order that falls out is dispatch order, extended over time rather
 * than redefined: synchronous throws first, because they all happened before
 * any promise settled, then the rejections positionally.
 *
 * **Why nothing is thrown synchronously.** Not for a wildcard name, not for a
 * foreign protocol marker, not for a corrupted bucket. A function that returns
 * a promise should not also throw, because one construct cannot handle both:
 * `await emitStrictAsync(…)` inside a `try` catches either, but
 * `emitStrictAsync(…).catch(report)` catches only the rejection — and that is
 * the idiomatic call in exactly the place this variant is for, a teardown that
 * fires the event, collects, and does not block on it. It also dissolves the
 * awkward case instead of answering it: under `emitStrictAsync(ε, ['a', '*'])`
 * the listeners of `'a'` have already collected their failures when the
 * wildcard is rejected, and through the promise channel there is nothing to
 * decide — the rejection is the last entry of the list. This is a deliberate
 * asymmetry against `emitAsync()` / `emitSafeAsync()`, both of which keep
 * throwing synchronously; see AGENTS.md, "Known asymmetries".
 *
 * **Why `markCollectedAsHandled()` is absent.** It exists because a mid-walk
 * throw abandons the values already collected, and an abandoned rejected
 * promise is an unhandled rejection that ends the process under Node's default.
 * Nothing is abandoned on this path: every collected value reaches
 * `allSettled`, which owns it.
 *
 * The cost is real and small: one result object per element, and the report
 * waits for the *slowest* listener promise to settle. `Promise.all` already
 * waits that long for the success case, so this extends an existing property
 * rather than introducing one. And a failure means there is no result array at
 * all, which is what keeps a half-rejected inner array from being a question
 * anyone has to answer.
 */
export function emitStrictAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitStrictAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): Promise<any[] | undefined>;
export function emitStrictAsync<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined>;
// implementation
export function emitStrictAsync(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any[] | undefined> {
  const values: any[] = [];
  const returnValue = (val: unknown) => {
    values.push(val);
  };
  const previousFailures = collectedFailures;
  const failures: unknown[] = [];
  collectedFailures = failures;
  try {
    if (isEventized(target)) {
      _emit(target, eventNames, args, applyListenerSafe, returnValue);
    } else if (isDuckTarget(target)) {
      _duckEmit(target, eventNames, args, dispatchGuarded, returnValue);
    }
  } catch (err) {
    failures.push(err);
  } finally {
    collectedFailures = previousFailures;
  }
  if (values.length === 0) {
    return failures.length > 0
      ? Promise.reject(collectedError(failures))
      : Promise.resolve(undefined);
  }
  return Promise.allSettled(
    values.map((val: any) =>
      Array.isArray(val) ? Promise.allSettled(val) : Promise.resolve(val),
    ),
  ).then((results) => {
    const resolved = splitSettled(values, results, failures);
    if (failures.length > 0) {
      throw collectedError(failures);
    }
    return resolved;
  });
}
