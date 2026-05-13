import {EventListener} from './EventListener';
import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL, NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import {subscribeTo, subscribeToDeferred} from './subscribeTo';
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
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';
import {isEventName} from './utils';

const afterApply = (callback?: () => void) => (listener: EventListener) => {
  listener.callAfterApply = () => {
    callback?.();
  };
};

const makeUnsubscribe = (
  host: EventizedObject,
  listeners: EventListener | Array<EventListener>,
): UnsubscribeFunc => {
  const unsubscribe = () => off(host, listeners);
  return Object.assign(
    unsubscribe,
    Array.isArray(listeners) ? {listeners} : {listener: listeners},
  ) as UnsubscribeFunc;
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
  const {store, keeper} = eventizedObj[NAMESPACE];
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
  const fn = target[eventName];
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
// (1c) typed array of event names — common-listener form
export function on<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
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
  const {store, keeper} = eventizedObj[NAMESPACE];
  return makeUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
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
// (1c) typed array of event names — common-listener form
export function once<TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
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
  const {store, keeper} = eventizedObj[NAMESPACE];
  const {listeners, publishRetained} = subscribeToDeferred(store, keeper, args);
  const unsubscribeFn = makeUnsubscribe(eventizedObj, listeners);
  let unsubscribeCalled = false;
  const unsubscribe = () => {
    if (!unsubscribeCalled) {
      unsubscribeFn();
      unsubscribeCalled = true;
    }
  };
  if (Array.isArray(listeners)) {
    listeners.forEach(afterApply(unsubscribe));
  } else {
    afterApply(unsubscribe)(listeners);
  }
  publishRetained();
  return unsubscribe as UnsubscribeFunc;
}

// ---------------------------------------------------------------------------
// onceAsync() — typed overload first; falls back to the loose v4 signature.
// ---------------------------------------------------------------------------
export function onceAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents>,
>(
  obj: EventizedObject<TEvents>,
  eventName: K,
): Promise<TEvents[K] extends [infer A, ...any[]] ? A : void>;
export function onceAsync<ReturnType = void, T extends object = object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
): Promise<ReturnType>;
// implementation
export function onceAsync<ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
): Promise<ReturnType> {
  return new Promise((resolve) => {
    once(obj, eventNames, resolve as ListenerFuncType);
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
  const {store, keeper} = eventizedObj[NAMESPACE];
  const listenerType = typeof listener;
  const forceRemove =
    listenerObject != null &&
    (listenerType === 'string' || listenerType === 'symbol');
  store.remove(listener, listenerObject, forceRemove);
  if (Array.isArray(listener)) {
    keeper.remove(listener.filter((li) => typeof li === 'string'));
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
): Promise<any>;
export function emitAsync<
  TEvents extends EventMap,
  K extends EventKeysOf<TEvents>,
>(
  obj: EventizedObject<TEvents>,
  eventNames: K[],
  ...args: ArgsFor<TEvents, K>
): Promise<any>;
export function emitAsync<T extends object>(
  obj: NonTypedEmitter<T>,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any>;
// implementation
export function emitAsync(
  target: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any> {
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
  return values.length > 0 ? Promise.all(values) : Promise.resolve();
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
export function retain(obj: object, eventNames: any): void {
  const eventizedObj = asEventized(obj);
  const {keeper} = eventizedObj[NAMESPACE];
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
export function retainClear(eventizedObj: object, eventNames: any): void {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  const {keeper} = eventizedObj[NAMESPACE];
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
export function unretain(eventizedObj: object, eventNames: any): void {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  const {keeper} = eventizedObj[NAMESPACE];
  keeper.remove(eventNames);
}

// Re-export so consumers can spot DefaultEventMap / EventMap without deep imports
export type {DefaultEventMap, EventMap};
