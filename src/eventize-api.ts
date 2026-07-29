import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL} from './constants';
import {createOnceObligation} from './EventListener';
import type {EventListener, OnceObligation} from './EventListener';
import {internalsOf} from './internals';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import type {
  AnyEventNames,
  ArgsFor,
  DefaultEventMap,
  EventArgs,
  EventKeysOf,
  EventListenerMethods,
  EventMap,
  EventName,
  EventizedObject,
  ListenerFor,
  ListenerFuncType,
  ListenerObjectType,
  NonTypedEmitter,
  OnEventNames,
  OnceAsyncOptions,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';
import {dispatchableMember, isEventName} from './utils';

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

const _emitOne = (
  eventizedObj: EventizedObject,
  eventName: EventName,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  if (eventName === EVENT_CATCH_EM_ALL) {
    throw new Error(
      "emit() must be called with a concrete event name — '*' is reserved for subscribing to all events and cannot be emitted",
    );
  }
  const {store, keeper} = internalsOf(eventizedObj);
  store.forEach(eventName, (listener) =>
    listener.apply(eventName, args, returnValue),
  );
  keeper.retain(eventName, args);
};

const _emit = (
  eventizedObj: EventizedObject,
  eventNames: AnyEventNames,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  if (Array.isArray(eventNames)) {
    eventNames.forEach((event: EventName) =>
      _emitOne(eventizedObj, event, args, returnValue),
    );
  } else {
    _emitOne(eventizedObj, eventNames, args, returnValue);
  }
};

// Duck-typing dispatch for non-eventized targets (v5+). Mirrors the
// listener-object fallback in EventListener.ts: try obj[eventName](...args)
// first; if no method is found, fall back to obj.emit(eventName, ...args);
// otherwise silently no-op. Return values are surfaced via the same
// `returnValue` callback used for eventized dispatch, so emitAsync can
// aggregate them uniformly across both paths.
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
  const target = obj as Record<EventName, unknown>;
  // Same prototype boundary as the listener-object path in EventListener.ts —
  // the two dispatch paths have to agree on what counts as a match, or the
  // emitAsync() aggregation diverges between them. An event name out of
  // external data (a JSON key, a message type) collides with
  // Object.prototype on every plain object.
  const fn = dispatchableMember(target, eventName);
  if (typeof fn === 'function') {
    const retVal = (fn as (...a: any[]) => any).apply(obj, args);
    if (retVal != null) returnValue?.(retVal);
    return;
  }
  const emitFn = (target as {emit?: unknown}).emit;
  if (typeof emitFn === 'function') {
    const retVal = (emitFn as (...a: any[]) => any).apply(obj, [
      eventName,
      ...args,
    ]);
    if (retVal != null) returnValue?.(retVal);
  }
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

const isDuckTarget = (obj: unknown): obj is object =>
  obj != null && typeof obj === 'object';

const hasWildcard = (eventNames: unknown): boolean =>
  Array.isArray(eventNames)
    ? eventNames.some((name) => name === EVENT_CATCH_EM_ALL)
    : eventNames === EVENT_CATCH_EM_ALL;

// True for exactly the `off()` arguments that make EventStore.remove() empty
// the whole registry. Mirrors that method's *effective* behaviour, not just
// its condition: its array branch forwards every element back into itself with
// a null listenerObject, so a `null`, `undefined` or `'*'` element lands in the
// wipe-everything branch — an array is bulk if any single element would be.
// Testing only for `'*'` here is what left `off(ε, [null])` emptying the store
// while the keeper kept every retained value, and `off(ε, ['foo', null])`
// dropping one name's retained state out of a total wipe.
const isBulkRemoval = (listener: unknown): boolean =>
  Array.isArray(listener)
    ? listener.some((item) => item == null || item === EVENT_CATCH_EM_ALL)
    : listener === EVENT_CATCH_EM_ALL;

// ---------------------------------------------------------------------------
// on() — overloads ordered specific → generic.
//
// 1a/1b are the typed forms that bind when an explicit event-map generic
// is in scope. The fallback overloads (1)–(4) carry a generic `T extends
// object` whose `obj` parameter is `NonTypedEmitter<T>` — that conditional
// resolves to `never` for typed emitters, forcing them through the typed
// overloads (so wrong event names fail to compile) while still accepting
// plain objects, arbitrary `object` references, and untyped emitters
// (where the event map is the permissive default).
// ---------------------------------------------------------------------------

// (1a) typed listener function for a known event key (or any symbol)
export function on<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  listener: ListenerFor<TEvents, K>,
): UnsubscribeFunc;
export function on<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  priority: number,
  listener: ListenerFor<TEvents, K>,
): UnsubscribeFunc;
// (1c) typed array of event names — common-listener form. Elements may carry
// their own priority as a [name, priority] tuple, mixed freely with bare names.
export function on<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: Array<K | [K, number]>,
  listener: (...args: ArgsFor<TEvents, K>) => void,
): UnsubscribeFunc;
export function on<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: Array<K | [K, number]>,
  priority: number,
  listener: (...args: ArgsFor<TEvents, K>) => void,
): UnsubscribeFunc;
// (1b) typed listener-object (method names = event names)
export function on<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  listenerObject: EventListenerMethods<TEvents>,
): UnsubscribeFunc;
// (1) listener function with event name(s)
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (2) listener method name on listener object
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  methodName: EventName,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  methodName: EventName,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (3) listener object alone
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (4) catch-all (no event name)
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function on<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// implementation
export function on(obj: object, ...args: SubscribeArgs): UnsubscribeFunc {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = internalsOf(eventizedObj);
  return makeOnUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
}

// ---------------------------------------------------------------------------
// once() — same overload set as on(); auto-unsubscribes after the first call.
// ---------------------------------------------------------------------------

// (1a) typed listener function for a known event key (or any symbol)
export function once<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  listener: ListenerFor<TEvents, K>,
): UnsubscribeFunc;
export function once<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents> | symbol,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
  priority: number,
  listener: ListenerFor<TEvents, K>,
): UnsubscribeFunc;
// (1c) typed array of event names — common-listener form. Elements may carry
// their own priority as a [name, priority] tuple, mixed freely with bare names.
export function once<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: Array<K | [K, number]>,
  listener: (...args: ArgsFor<TEvents, K>) => void,
): UnsubscribeFunc;
export function once<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: Array<K | [K, number]>,
  priority: number,
  listener: (...args: ArgsFor<TEvents, K>) => void,
): UnsubscribeFunc;
// (1b) typed listener-object (method names = event names)
export function once<TEvents extends EventMap>(
  obj: EventizedObject<TEvents>,
  listenerObject: EventListenerMethods<TEvents>,
): UnsubscribeFunc;
// (1) listener function with event name(s)
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (2) listener method name on listener object
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  methodName: EventName,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  methodName: EventName,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (3) listener object alone
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: OnEventNames,
  priority: number,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// (4) catch-all (no event name)
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listener: ListenerFuncType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listener: ListenerFuncType,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
export function once<T extends object>(
  obj: NonTypedEmitter<T>,
  priority: number,
  listenerObject: ListenerObjectType,
): UnsubscribeFunc;
// implementation
export function once(obj: object, ...args: SubscribeArgs): UnsubscribeFunc {
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
}

// ---------------------------------------------------------------------------
// onceAsync() — typed overload first; falls back to the loose v4 signature.
// An optional AbortSignal cancels the subscription and rejects the promise,
// in the shape of fetch(). Without it, an event that never fires keeps the
// listener and the caller's continuation alive for the emitter's whole
// lifetime.
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
  return new Promise<ReturnType>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
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
  });
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

  // off(ε), off(ε, '*') and any array whose elements make the store wipe
  // itself — ['*', …], [null], ['foo', undefined] — clear the keeper too. This
  // has to run before the array/name branches below, because isEventName('*')
  // is true and '*' would otherwise take the name path, which clears nothing:
  // retain() rejects '*' and it can never be an entry.
  // isBulkRemoval() reproduces what EventStore.remove() does to the listeners,
  // and matches how unretain()/retainClear() already read a wildcard anywhere
  // in an array as "all retained events". Leaving retained payloads behind
  // after "remove everything" kept them strongly referenced and still replayed
  // them to later subscribers.
  if (listener == null || (listenerObject == null && isBulkRemoval(listener))) {
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
    // is not a name at all.
    //
    // The listenerObject == null guard mirrors EventStore.remove(): its array
    // branch requires the same condition, so off(ε, [names], listenerObject)
    // falls through to removeByListener(), where an array never matches a
    // listener identity and nothing is unsubscribed. Without this guard the
    // keeper cleared retained state for a call shape that detached no
    // listener at all.
    keeper.remove(listener.filter(isEventName));
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
  let values: any[] = [];
  const returnValue = (val: unknown) => {
    values.push(val);
  };
  if (isEventized(target)) {
    _emit(target, eventNames, args, returnValue);
  } else if (isDuckTarget(target)) {
    _duckEmit(target, eventNames, args, returnValue);
  }
  values = values.map((val: any) =>
    Array.isArray(val) ? Promise.all(val) : Promise.resolve(val),
  );
  // `Promise.resolve(undefined)`, not the argument-less `Promise.resolve()`:
  // the latter is `Promise<void>`, and the declared `Promise<any[] | undefined>`
  // rejects it. Same value at runtime, and the distinction is the point of
  // narrowing the type — a caller has to handle the empty case.
  return values.length > 0 ? Promise.all(values) : Promise.resolve(undefined);
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
    throw new Error('object is not eventized');
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
    throw new Error('object is not eventized');
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
