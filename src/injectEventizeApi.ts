import {EventKeeper} from './EventKeeper';
import {EventListener} from './EventListener';
import {EventStore} from './EventStore';
import {EVENT_CATCH_EM_ALL, NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import {
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

const unsubscribeAfterApply = (obj: EventizeApi) => (
  listener: EventListener,
) => {
  listener.callAfterApply = () => obj.off(listener);
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

  const eventizedObj = Object.assign(obj, {
    on(...args: SubscribeArgs): UnsubscribeFunc {
      return makeUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
    },

    once(...args: SubscribeArgs): UnsubscribeFunc {
      const listeners = subscribeTo(store, keeper, args);
      if (Array.isArray(listeners)) {
        listeners.forEach(unsubscribeAfterApply(eventizedObj));
      } else {
        unsubscribeAfterApply(eventizedObj)(listeners);
      }
      return makeUnsubscribe(eventizedObj, listeners);
    },

    off(listener?: ListenerType, listenerObject?: ListenerObjectType): void {
      store.remove(listener, listenerObject);
      if (Array.isArray(listener)) {
        keeper.remove(listener.filter((li) => typeof li === 'string'));
      } else if (isEventName(listener)) {
        keeper.remove(listener);
      }
    },

    emit(eventNames: AnyEventNames, ...args: EventArgs): void {
      if (Array.isArray(eventNames)) {
        eventNames.forEach((event: EventName) => {
          store.forEach(event, (listener) => listener.apply(event, args));
          keeper.retain(event, args);
        });
      } else if (eventNames !== EVENT_CATCH_EM_ALL) {
        store.forEach(eventNames, (listener) => {
          listener.apply(eventNames, args);
        });
        keeper.retain(eventNames, args);
      }
    },

    retain(eventName: EventName): void {
      keeper.add(eventName);
    },
  });

  return eventizedObj;
}
