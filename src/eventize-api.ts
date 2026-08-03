import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL} from './constants';
import {createOnceObligation} from './EventListener';
import type {EventListener, OnceObligation} from './EventListener';
import type {EventizeInternals} from './internals';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import type {
  AnyEventNames,
  ArgsFor,
  DefaultEventMap,
  EventArgs,
  EventKeysOf,
  EventMap,
  EventName,
  EventizedObject,
  ListenerFuncType,
  NonTypedEmitter,
  OnceAsyncOptions,
  StandaloneSubscribeFunc,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';
import type {DispatchTarget} from './utils';
import {dispatchToTarget, isEventName} from './utils';

// The handle is idempotent by construction: a second call is inert, not a
// second release. Without the guard a shared registration was decremented
// twice by the same handle, which released a sibling handle's count. Cleanup
// code that calls a stored handle defensively ("call it again, it's a no-op")
// is exactly the shape that hit it, and `docs/off.md` promised that no-op.
//
// The nulled capture *is* the consumed flag, and that is what stops a handle
// kept after its call from pinning anything — the emitter, and with it the
// store, the keeper and every retained payload. A separate boolean would leave
// both references in the closure forever. Both go in one slot so a single null
// test releases them together and TypeScript narrows both at once.
//
// on() and once() release through two different store calls now — a listener
// list against release(), one obligation against releaseObligation() — so they
// get their own handle makers below instead of sharing one shaped around
// whichever the store used to take. A once() handle in particular holds no
// listener at all: the obligation already knows every listener it was added
// to, which is exactly what lets whichever name fires first release the
// others too. Both makers keep the same guard for the same reason: reaching
// the emitter (and through it every retained payload) from a spent handle is
// the leak this design exists to prevent, whichever shape the capture is in.
const makeOnUnsubscribe = (
  host: EventizedObject,
  listeners: EventListener | Array<EventListener>,
): UnsubscribeFunc => {
  let held: {
    host: EventizedObject;
    listeners: EventListener | Array<EventListener>;
  } | null = {host, listeners};

  return () => {
    const target = held;
    if (target === null) return;
    held = null;
    const {store} = internalsOf(target.host);
    if (Array.isArray(target.listeners)) {
      target.listeners.forEach((listener) => store.release(listener));
    } else {
      store.release(target.listeners);
    }
  };
};

// The once() handle has a second way to be spent, and it is the common one:
// the dispatch that discharges the obligation. Up to the aggregation change
// that came for free — once() installed its own unsubscribe as the listener's
// `callAfterApply`, so firing ran the handle and nulled its capture. That hook
// now settles obligations instead (one listener can carry several, and a
// single closure could only ever speak for the last), so the release hangs off
// the obligation: the handle registers `onSettled`, EventStore's
// dischargeObligation() clears the field and runs it, and a fired once()
// releases the emitter without anyone calling the handle. Anything else leaves
// every emitter whose once() has already fired pinned until the caller's
// teardown loop runs — the leak the nulled capture exists to prevent, reached
// by the one route that never reaches the closure below.
//
// Capturing {store, obligation} instead would also free the emitter, and
// earlier: the store holds no back-reference to its host. It would free it too
// early, though. A handle whose subscription is still pending must pin the
// emitter — that is deliberate, it is what makeOnUnsubscribe() does, and
// src/lifecycle.spec.ts keeps a control group on the on() side to prove a
// `collected` verdict elsewhere means anything at all. A once() whose event
// never fires is the shape on this side that relies on it.
const makeOnceUnsubscribe = (
  host: EventizedObject,
  obligation: OnceObligation,
): UnsubscribeFunc => {
  let held: {host: EventizedObject; obligation: OnceObligation} | null = {
    host,
    obligation,
  };

  if (obligation.settled) {
    // Already discharged before this handle existed: a retained replay settles
    // the obligation from inside subscribeTo(). A hook installed now would
    // never run, so the capture is released here instead — the handle is born
    // spent, which is what it is.
    held = null;
  } else {
    obligation.onSettled = () => {
      held = null;
    };
  }

  return () => {
    const target = held;
    if (target === null) return;
    held = null;
    const {store} = internalsOf(target.host);
    store.releaseObligation(target.obligation);
  };
};

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
// `internalsOf()` once instead of once per name (PERF-001). The `'*'` check
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

const hasWildcard = (eventNames: unknown): boolean =>
  Array.isArray(eventNames)
    ? eventNames.some((name) => name === EVENT_CATCH_EM_ALL)
    : eventNames === EVENT_CATCH_EM_ALL;

// True for exactly the `off()` arguments that make EventStore.remove() empty
// the whole registry. Mirrors that method's *effective* behaviour, not just
// its condition: its array branch forwards every element back into itself with
// a null listenerObject — recursively, so a nested array re-enters that same
// branch — until a `null`, `undefined` or `'*'` at any depth lands in the
// wipe-everything branch. An array is bulk if any (flattened) element would
// be. Testing only the top level here is what left `off(ε, [[null]])`
// emptying the store two levels down while the keeper never looked past the
// first — expects an already-flattened array; see the call site in off().
const isBulkRemoval = (listener: unknown): boolean =>
  Array.isArray(listener)
    ? listener.some((item) => item == null || item === EVENT_CATCH_EM_ALL)
    : listener === EVENT_CATCH_EM_ALL;

// ---------------------------------------------------------------------------
// on() and once() take the same overload set, and it is declared once, as
// `StandaloneSubscribeFunc` in `types.ts`. Both used to carry a hand-written
// copy of it — 230 lines each, kept in step by nothing but a comment asking
// them to. The load-bearing order, the group labels and the reasoning now sit
// with the interface.
//
// Annotated, not asserted, and that is the whole safety of the arrangement:
// an annotation makes TypeScript check the implementation *against* the
// overload set on every build, so an implementation that stops satisfying the
// signatures it claims fails the build. `as` would only ask the two types to
// be comparable, which is a weaker question and one they pass even when the
// implementation is wrong — assert a `void` return here and the assertion
// still succeeds, because `(…) => UnsubscribeFunc` is assignable to
// `(…) => void` and comparability takes either direction. The annotation
// rejects it. For a set declared once so the two copies cannot drift, letting
// implementation and declaration drift instead would be a poor trade.
//
// The reverse direction is where an assertion really is unavoidable, and it is
// a different check: `SubscribeImpl` in `src/eventize.ts` widens these fixed
// arities *back* to a rest parameter, which TypeScript refuses as an
// assignment (TS2322) because no overload set accepts a spread union of
// tuples. Nothing here needs that widening. The comment on the interface says
// why either of them is a different boundary from the one AGENTS.md draws
// around the internals.
// ---------------------------------------------------------------------------

export const on: StandaloneSubscribeFunc = (
  obj: object,
  ...args: SubscribeArgs
): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  return makeOnUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
};

// once() — auto-unsubscribes after the first call.
export const once: StandaloneSubscribeFunc = (
  obj: object,
  ...args: SubscribeArgs
): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  // One obligation per call, however many names it covers. A multi-name
  // once() shares this same object across every listener it registers, which
  // is what makes firing any one of them discharge the rest — the race
  // once(ε, ['a', 'b'], h) has always promised. The auto-unsubscribe is not
  // this handle's job: the store discharges the obligation from inside the
  // dispatch that satisfies it, retained replay included, which can happen
  // before this handle even exists — releaseObligation() bails on `settled`
  // if it already did.
  const obligation = createOnceObligation();
  subscribeTo(store, keeper, args, obligation);
  return makeOnceUnsubscribe(eventizedObj, obligation);
};

// ---------------------------------------------------------------------------
// onceAsync() — typed overload first; falls back to the loose v4 signature.
// An optional AbortSignal cancels the subscription and rejects the promise,
// in the shape of fetch(). Without it, an event that never fires keeps the
// listener and the caller's continuation alive for the emitter's whole
// lifetime.
//
// off(ε) does not help here either, deliberately: it empties the store, but
// the `onAbort` listener below is registered on the AbortSignal, not on the
// emitter, and nothing in off() knows the signal exists to tell it. A signal
// that outlives the emitter keeps this whole closure — promise, obligation,
// emitter reference — alive until the signal itself fires or is collected.
// See docs/lifecycle.md ("onceAsync and off()") for the consumer-facing
// writeup; there is no fix that doesn't require off() to know about signals
// or onceAsync() to know about off().
// ---------------------------------------------------------------------------

// `??`, not a `=== undefined` test: a signal aborted with an explicit null
// reason gets the synthesized DOMException too. fetch() would reject with the
// null itself, which tells a catch block nothing.
const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('This operation was aborted', 'AbortError');

export function onceAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents>,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  options?: OnceAsyncOptions,
): Promise<TEvents[K] extends [infer A, ...any[]] ? A : void>;
export function onceAsync<ReturnType = void, T extends object = object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType>;
// implementation
export function onceAsync<ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
): Promise<ReturnType> {
  const signal = options?.signal;
  // A manual deferred, not `new Promise((resolve, reject) => { ... once() ... })`:
  // an argument error (empty name array, NaN priority, ...) is a programmer
  // mistake, and every other throw site in this library fails synchronously
  // at the call site rather than through a rejection. Calling once() inside a
  // Promise executor would catch that throw and hand it back as a rejection
  // instead — invisible to a fire-and-forget call with no `await`/`catch`,
  // and an unhandled rejection under Node's default
  // `--unhandled-rejections=throw`. Capturing `resolve`/`reject` here and
  // calling once() afterwards, outside the executor, lets such a throw
  // propagate straight out of onceAsync() to its caller.
  let resolve!: (value: ReturnType | PromiseLike<ReturnType>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<ReturnType>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Deliberately ahead of once(), and therefore ahead of the argument
  // validation once() carries out: if the signal already fired there is no
  // reason to touch the emitter at all. One consequence follows from that
  // ordering and is accepted rather than fixed — onceAsync(ε, [], {signal:
  // alreadyAborted}) rejects with the abort reason instead of throwing the
  // "insufficient arguments" error a bare onceAsync(ε, []) throws. Running
  // once() first to validate before this check would register a real
  // subscription, and a retained value can resolve that subscription
  // synchronously from inside once() itself — settling the promise with a
  // stale value the caller already told this call to abandon. Swallowing one
  // rare argument error is the cheaper mistake of the two.
  if (signal?.aborted) {
    reject(abortReason(signal));
    return promise;
  }
  // Declared before once() on purpose: the listener closure reads onAbort,
  // which can only be created once `unsubscribe` exists.
  let onAbort: (() => void) | undefined;
  // A retained event fires inside once(), before there is anything to attach.
  let resolved = false;
  const unsubscribe = once(obj, eventNames, ((...args: EventArgs) => {
    resolved = true;
    if (signal != null && onAbort != null) {
      signal.removeEventListener('abort', onAbort);
    }
    resolve(args[0] as ReturnType);
  }) as ListenerFuncType);
  if (signal != null && !resolved) {
    onAbort = () => {
      unsubscribe();
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, {once: true});
  }

  return promise;
}

// ---------------------------------------------------------------------------
// off() — fully permissive: accepts any object and any listener / listener
// object shape, mirroring the runtime which silently no-ops on anything it
// doesn't recognize. Typed event maps deliberately do NOT narrow the args
// here — cleanup paths often hand off arbitrary values.
// ---------------------------------------------------------------------------
export function off(
  eventizedObj: unknown,
  listener?: unknown,
  listenerObject?: unknown,
): void {
  if (!isEventized(eventizedObj)) {
    return;
  }
  const {store, keeper} = internalsOf(eventizedObj);
  const listenerType = typeof listener;
  const forceRemove =
    listenerObject != null &&
    (listenerType === 'string' || listenerType === 'symbol');
  store.remove(listener, listenerObject, forceRemove);

  // Flattened once, ahead of both places below that read an array's
  // elements. EventStore.remove()'s array branch recurses arbitrarily deep —
  // every element goes back into remove() with a null listenerObject, so a
  // nested array re-enters the same branch — and both isBulkRemoval() and the
  // name filter have to see that same depth, or a marker or a name one level
  // down from the top goes unseen on the keeper side while the store keeps
  // following it. A non-array listener passes through unchanged.
  //
  // The listenerObject == null gate is not a second condition to keep in sync
  // with the two readers below: it is the one both of them already carry. With
  // a listener object named, off(ε, [name, …], listenerObject) unsubscribes
  // nothing and clears nothing, and the flattened copy was allocated for a
  // path that never looks at it.
  const flatListener =
    listenerObject == null && Array.isArray(listener)
      ? listener.flat(Infinity)
      : listener;

  // off(ε), off(ε, '*') and any (nested) array whose elements make the store
  // wipe itself — ['*', …], [[null]], ['foo', undefined] — clear the keeper
  // too. This has to run before the array/name branches below, because
  // isEventName('*') is true and '*' would otherwise take the name path,
  // which clears nothing: retain() rejects '*' and it can never be an entry.
  // isBulkRemoval() reproduces what EventStore.remove() does to the listeners,
  // and matches how unretain()/retainClear() already read a wildcard anywhere
  // in an array as "all retained events". Leaving retained payloads behind
  // after "remove everything" kept them strongly referenced and still replayed
  // them to later subscribers.
  if (
    listener == null ||
    (listenerObject == null && isBulkRemoval(flatListener))
  ) {
    keeper.removeAll();
    return;
  }

  if (listenerObject == null && Array.isArray(listener)) {
    // Only the event-name elements are meaningful to the keeper. One caller
    // reaches this branch: an explicit off(ε, [name, …]). The multi-event on()
    // handle used to be a second, passing an array of EventListener instances
    // through here; since v6.0.0 it gives each registration back through
    // EventStore.release() and never enters off() at all. The isEventName
    // filter stays because the surviving caller hands in whatever the consumer
    // assembled: it keeps symbol event names — which the old
    // `typeof === 'string'` test silently dropped — and ignores anything that
    // is not a name at all, nested arrays included — flattened above, a name
    // buried at any depth reads as a name too.
    //
    // The listenerObject == null guard mirrors EventStore.remove(): its array
    // branch requires the same condition, so off(ε, [names], listenerObject)
    // falls through to removeByListener(), where an array never matches a
    // listener identity and nothing is unsubscribed. Without this guard the
    // keeper cleared retained state for a call shape that detached no
    // listener at all.
    keeper.remove((flatListener as unknown[]).filter(isEventName));
  } else if (isEventName(listener)) {
    keeper.remove(listener);
  }
}

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

// ---------------------------------------------------------------------------
// retain() / retainClear() / unretain() — typed event-name overload first.
// ---------------------------------------------------------------------------

export function retain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
): void;
export function retain<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): void;
// implementation
export function retain(obj: object, eventNames: AnyEventNames): void {
  if (hasWildcard(eventNames)) {
    throw new Error(
      "retain() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be retained",
    );
  }
  const eventizedObj = asEventized(obj);
  const {keeper} = internalsOf(eventizedObj);
  keeper.add(eventNames);
}

export function retainClear<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
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
  if (!isEventized(eventizedObj)) {
    throw new TypeError(
      'retainClear() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)',
    );
  }
  const {keeper} = internalsOf(eventizedObj);
  if (hasWildcard(eventNames)) {
    keeper.clearAll();
    return;
  }
  keeper.clear(eventNames);
}

export function unretain<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
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
  if (!isEventized(eventizedObj)) {
    throw new TypeError(
      'unretain() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)',
    );
  }
  const {keeper} = internalsOf(eventizedObj);
  if (hasWildcard(eventNames)) {
    keeper.removeAll();
    return;
  }
  keeper.remove(eventNames);
}

// Re-export so consumers can spot DefaultEventMap / EventMap without deep imports
export type {DefaultEventMap, EventMap};
