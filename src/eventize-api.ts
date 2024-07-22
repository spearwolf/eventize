import {EventListener} from './EventListener';
import {asEventized} from './asEventized';
import {EVENT_CATCH_EM_ALL, NAMESPACE} from './constants';
import {isEventized} from './isEventized';
import {subscribeTo} from './subscribeTo';
import type {
  AnyEventNames,
  EventArgs,
  EventName,
  EventizedObject,
  ListenerObjectType,
  ListenerType,
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

const _emit = (
  eventizedObj: EventizedObject,
  eventNames: AnyEventNames,
  args: EventArgs,
  returnValue?: (val: unknown) => void,
) => {
  const {store, keeper} = eventizedObj[NAMESPACE];
  if (Array.isArray(eventNames)) {
    eventNames.forEach((event: EventName) => {
      store.forEach(event, (listener) =>
        listener.apply(event, args, returnValue),
      );
      keeper.retain(event, args);
    });
  } else if (eventNames !== EVENT_CATCH_EM_ALL) {
    store.forEach(eventNames, (listener) => {
      listener.apply(eventNames, args, returnValue);
    });
    keeper.retain(eventNames, args);
  }
};

export const on = (obj: object, ...args: SubscribeArgs): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = eventizedObj[NAMESPACE];
  return makeUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
};

export const once = (obj: object, ...args: SubscribeArgs): UnsubscribeFunc => {
  const eventizedObj = asEventized(obj);
  const {store, keeper} = eventizedObj[NAMESPACE];
  const listeners = subscribeTo(store, keeper, args);
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
  return unsubscribe as UnsubscribeFunc;
};

export const onceAsync = <ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
): Promise<ReturnType> => {
  return new Promise((resolve) => {
    once(obj, eventNames, resolve);
  });
};

export const off = (
  eventizedObj: object,
  listener?: ListenerType,
  listenerObject?: ListenerObjectType,
): void => {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
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
};

export const emit = (
  eventizedObj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): void => {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  _emit(eventizedObj, eventNames, args);
};

export const emitAsync = (
  eventizedObj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
): Promise<any> => {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  let values: any[] = [];
  _emit(eventizedObj, eventNames, args, (val: unknown) => {
    values.push(val);
  });
  values = values.map((val: any) =>
    Array.isArray(val) ? Promise.all(val) : Promise.resolve(val),
  );
  return values.length > 0 ? Promise.all(values) : Promise.resolve();
};

export const retain = (obj: object, eventNames: AnyEventNames): void => {
  const eventizedObj = asEventized(obj);
  const {keeper} = eventizedObj[NAMESPACE];
  keeper.add(eventNames);
};

export const retainClear = (
  eventizedObj: object,
  eventNames: AnyEventNames,
): void => {
  if (!isEventized(eventizedObj)) {
    throw new Error('object is not eventized');
  }
  const {keeper} = eventizedObj[NAMESPACE];
  keeper.clear(eventNames);
};
