import {asEventized} from './asEventized';
import {
  emit,
  emitAsync,
  off,
  on as _on,
  once as _once,
  onceAsync,
  retain,
  retainClear,
  unretain,
} from './eventize-api';
import {isEventized} from './isEventized';
import type {
  AnyEventNames,
  DefaultEventMap,
  EventArgs,
  EventMap,
  EventizeApi,
  EventizedObject,
  EventizerFuncAPI,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';

// Internal: the class- and inject-side delegations call into the standalone
// API on a typed `this`, but with arbitrary runtime arg shapes. The public
// overload sets are tuned for end users (typed first, loose fallback) and
// don't accept either a spread of `SubscribeArgs` or a typed emitter passed
// to the loose fallback. So we cast to the implementation-shape signature
// for internal use; the public exports retain their full overload set.
const on = _on as (obj: object, ...args: SubscribeArgs) => UnsubscribeFunc;
const once = _once as (obj: object, ...args: SubscribeArgs) => UnsubscribeFunc;
const offLoose = off as (
  obj: object,
  listener?: unknown,
  listenerObject?: object,
) => void;
const emitLoose = emit as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => void;
const emitAsyncLoose = emitAsync as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => Promise<any>;
const onceAsyncLoose = onceAsync as <ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
) => Promise<ReturnType>;
const retainLoose = retain as (obj: object, eventNames: AnyEventNames) => void;
const retainClearLoose = retainClear as (
  obj: object,
  eventNames: AnyEventNames,
) => void;
const unretainLoose = unretain as (
  obj: object,
  eventNames: AnyEventNames,
) => void;

export const eventize: EventizerFuncAPI = (() => {
  const e = <
    TEvents extends EventMap = DefaultEventMap,
    T extends object = object,
  >(
    obj: T = {} as T,
  ): T & EventizedObject<TEvents> =>
    asEventized(obj) as T & EventizedObject<TEvents>;

  e.inject = <
    TEvents extends EventMap = DefaultEventMap,
    T extends object = object,
  >(
    obj: T = {} as T,
  ): T & EventizeApi<TEvents> => {
    obj = asEventized(obj);

    Object.assign(obj, {
      on: (...args: SubscribeArgs): UnsubscribeFunc => on(obj, ...args),

      once: (...args: SubscribeArgs): UnsubscribeFunc => once(obj, ...args),

      onceAsync: <ReturnType = void>(
        eventNames: AnyEventNames,
      ): Promise<ReturnType> => onceAsyncLoose<ReturnType>(obj, eventNames),

      off: (listener?: unknown, listenerObject?: object): void =>
        offLoose(obj, listener, listenerObject),

      emit: (eventNames: AnyEventNames, ...args: EventArgs): void =>
        emitLoose(obj, eventNames, ...args),

      emitAsync: (
        eventNames: AnyEventNames,
        ...args: EventArgs
      ): Promise<any> => emitAsyncLoose(obj, eventNames, ...args),

      retain: (eventNames: AnyEventNames): void => retainLoose(obj, eventNames),

      retainClear: (eventNames: AnyEventNames): void =>
        retainClearLoose(obj, eventNames),

      unretain: (eventNames: AnyEventNames): void =>
        unretainLoose(obj, eventNames),
    });

    return obj as T & EventizeApi<TEvents>;
  };

  e.is = isEventized;

  return e;
})();

export interface Eventize<TEvents extends EventMap = DefaultEventMap>
  extends EventizeApi<TEvents> {}

export class Eventize<TEvents extends EventMap = DefaultEventMap> {
  constructor() {
    eventize<TEvents>(this);
  }

  on(...args: SubscribeArgs): UnsubscribeFunc {
    return on(this, ...args);
  }

  once(...args: SubscribeArgs): UnsubscribeFunc {
    return once(this, ...args);
  }

  onceAsync<ReturnType = void>(eventNames: AnyEventNames): Promise<ReturnType> {
    return onceAsyncLoose<ReturnType>(this, eventNames);
  }

  off(listener?: unknown, listenerObject?: object): void {
    offLoose(this, listener, listenerObject);
  }

  emit(eventNames: AnyEventNames, ...args: EventArgs): void {
    emitLoose(this, eventNames, ...args);
  }

  emitAsync(eventNames: AnyEventNames, ...args: EventArgs): Promise<any> {
    return emitAsyncLoose(this, eventNames, ...args);
  }

  retain(eventNames: AnyEventNames): void {
    retainLoose(this, eventNames);
  }

  retainClear(eventNames: AnyEventNames): void {
    retainClearLoose(this, eventNames);
  }

  unretain(eventNames: AnyEventNames): void {
    unretainLoose(this, eventNames);
  }
}
