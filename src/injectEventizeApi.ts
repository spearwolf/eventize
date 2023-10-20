import {EventKeeper} from './EventKeeper';
import {EventListener} from './EventListener';
import {EventStore} from './EventStore';
import {EVENT_CATCH_EM_ALL, NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import type {
  AnyEventNames,
  EventArgs,
  EventizeApi,
  EventName,
  ListenerType,
  ListenerObjectType,
  SubscribeArgs,
  UnsubscribeFunc,
} from './types';
import {defineHiddenPropertyRO, isEventName} from './utils';

const afterApply =
  (obj: EventizeApi, callback?: () => void) => (listener: EventListener) => {
    listener.callAfterApply = () => {
      obj.off(listener);
      callback?.();
    };
  };

const makeUnsubscribe = (
  host: EventizeApi,
  listeners: EventListener | Array<EventListener>,
): UnsubscribeFunc => {
  const unsubscribe = () => host.off(listeners);
  return Object.assign(
    unsubscribe,
    Array.isArray(listeners) ? {listeners} : {listener: listeners},
  ) as UnsubscribeFunc;
};

export function injectEventizeApi<T extends Object>(obj: T): T & EventizeApi {
  if (isEventized(obj)) {
    // it already has the interface - no need to inject it again
    return obj;
  }

  const store = new EventStore();
  const keeper = new EventKeeper();

  defineHiddenPropertyRO(obj, NAMESPACE, {keeper, store});

  const _once = (args: SubscribeArgs, afterApplyHook?: () => void): UnsubscribeFunc => {
    const listeners = subscribeTo(store, keeper, args);
    if (Array.isArray(listeners)) {
      listeners.forEach(afterApply(eventizedObj, afterApplyHook));
    } else {
      afterApply(eventizedObj, afterApplyHook)(listeners);
    }
    return makeUnsubscribe(eventizedObj, listeners);
  };

  const _emit = (eventNames: AnyEventNames, args: EventArgs, returnValue?: (val: unknown) => void) => {
    if (Array.isArray(eventNames)) {
      eventNames.forEach((event: EventName) => {
        store.forEach(event, (listener) => listener.apply(event, args, returnValue));
        keeper.retain(event, args);
      });
    } else if (eventNames !== EVENT_CATCH_EM_ALL) {
      store.forEach(eventNames, (listener) => {
        listener.apply(eventNames, args, returnValue);
      });
      keeper.retain(eventNames, args);
    }
  };

  const eventizedObj = Object.assign(obj, {
    on(...args: SubscribeArgs): UnsubscribeFunc {
      return makeUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
    },

    once(...args: SubscribeArgs): UnsubscribeFunc {
      return _once(args);
    },

    onceAsync(...args: SubscribeArgs): Promise<void> {
      return new Promise((resolve) => {
        _once(args, resolve);
      });
    },

    off(listener?: ListenerType, listenerObject?: ListenerObjectType): void {
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
    },

    emit(eventNames: AnyEventNames, ...args: EventArgs): void {
      _emit(eventNames, args);
    },

    emitAsync(eventNames: AnyEventNames, ...args: EventArgs): Promise<any> {
      let values: any[] = [];
      _emit(eventNames, args, (val: unknown) => {
        values.push(val);
      });
      values = values.map((val: any) => Array.isArray(val) ? Promise.all(val) : Promise.resolve(val));
      return values.length > 0 ? Promise.all(values) : Promise.resolve();
    },

    retain(eventName: EventName): void {
      keeper.add(eventName);
    },
  });

  return eventizedObj;
}
