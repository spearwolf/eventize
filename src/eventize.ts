import {asEventized} from './asEventized';
import {
  emit,
  emitAsync,
  off,
  on,
  once,
  onceAsync,
  retain,
  retainClear,
} from './eventize-api';
import {isEventized} from './isEventized';
import type {
  AnyEventNames,
  EventArgs,
  EventizeApi,
  EventizedObject,
  EventizerFuncAPI,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';

export const eventize: EventizerFuncAPI = (() => {
  const e = <T extends object>(obj: T = {} as T): T & EventizedObject =>
    asEventized(obj);

  e.inject = <T extends object>(obj: T = {} as T): T & EventizeApi => {
    obj = asEventized(obj);

    Object.assign(obj, {
      on: (...args: SubscribeArgs): UnsubscribeFunc => on(obj, ...args),

      once: (...args: SubscribeArgs): UnsubscribeFunc => once(obj, ...args),

      onceAsync: <ReturnType = void>(
        eventNames: AnyEventNames,
      ): Promise<ReturnType> => onceAsync(obj, eventNames),

      off: (listener?: unknown, listenerObject?: object): void =>
        off(obj as EventizedObject, listener, listenerObject),

      emit: (eventNames: AnyEventNames, ...args: EventArgs): void =>
        emit(obj as EventizedObject, eventNames, ...args),

      emitAsync: (
        eventNames: AnyEventNames,
        ...args: EventArgs
      ): Promise<any> => emitAsync(obj as EventizedObject, eventNames, ...args),

      retain: (eventNames: AnyEventNames): void => retain(obj, eventNames),

      retainClear: (eventNames: AnyEventNames): void =>
        retainClear(obj as EventizedObject, eventNames),
    });

    return obj as T & EventizeApi;
  };

  e.is = isEventized;

  return e;
})();

export interface Eventize extends EventizeApi {}

export class Eventize {
  constructor() {
    eventize(this);
  }

  on(...args: SubscribeArgs): UnsubscribeFunc {
    return on(this, ...args);
  }

  once(...args: SubscribeArgs): UnsubscribeFunc {
    return once(this, ...args);
  }

  onceAsync<ReturnType = void>(eventNames: AnyEventNames): Promise<ReturnType> {
    return onceAsync(this, eventNames);
  }

  off(listener?: unknown, listenerObject?: object): void {
    off(this, listener, listenerObject);
  }

  emit(eventNames: AnyEventNames, ...args: EventArgs): void {
    emit(this, eventNames, ...args);
  }

  emitAsync(eventNames: AnyEventNames, ...args: EventArgs): Promise<any> {
    return emitAsync(this, eventNames, ...args);
  }

  retain(eventNames: AnyEventNames): void {
    retain(this, eventNames);
  }

  retainClear(eventNames: AnyEventNames): void {
    retainClear(this, eventNames);
  }
}
