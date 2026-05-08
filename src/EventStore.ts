import {EventListener} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';
import type {EventName} from './types';
import {isCatchEmAll, isEventName} from './utils';

type HasPriorityOrIdType = {priority: number; id: number};

const sortByPriorityAndId = (
  a: HasPriorityOrIdType,
  b: HasPriorityOrIdType,
): number =>
  a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

const findInsertIndex = (
  arr: Array<HasPriorityOrIdType>,
  item: HasPriorityOrIdType,
): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortByPriorityAndId(item, arr[mid]) < 0) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

const cloneArray = <T>(arr: Array<T>): Array<T> => arr?.slice(0);

const removeItemFromArray = (arr: Array<any>, item: any) => {
  const idx = arr.indexOf(item);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
};

const isSimilarListenerType = (listenerType: number) =>
  listenerType === LISTENER_IS_OBJ || listenerType === LISTENER_IS_NAMED_FUNC;

// TODO removeSimilarListener()

const removeListenerFromArray = (
  listeners: Array<EventListener>,
  listener: unknown,
  listenerObject: unknown,
) => {
  const idx = listeners.findIndex((item) =>
    item.isEqual(listener, listenerObject),
  );
  if (idx > -1) {
    listeners[idx].isRemoved = true;
    listeners.splice(idx, 1);
  }
};

const removeSimilarListenersFromArray = (
  fromArray: Array<EventListener>,
  eventName: unknown,
  listenerObject: unknown,
) => {
  const similarListeners: EventListener[] = [];
  for (const listener of fromArray) {
    if (
      (eventName == null && listener.listenerObject === listenerObject) ||
      (listener.eventName === eventName && listener.listener === listenerObject)
    ) {
      similarListeners.push(listener);
    }
  }
  for (const listener of similarListeners) {
    removeListenerFromArray(fromArray, listener, undefined);
  }
};

const removeAll = (fromArray: Array<EventListener>) => {
  if (fromArray) {
    fromArray.forEach((listener) => {
      listener.isRemoved = true;
      // listener.refCount = 0;
    });
    fromArray.length = 0;
  }
};

const isSimilar = (
  a: {
    listenerType: number;
    priority: number;
    eventName: string | symbol;
    listenerObject: any;
    listener: any;
  },
  b: EventListener,
) => {
  if (a.listenerType === b.listenerType) {
    return (
      a.priority === b.priority &&
      a.eventName === b.eventName &&
      a.listenerObject === b.listenerObject &&
      a.listener === b.listener
    );
  }
  return false;
};

const findSimilarListener = (
  searchFor: EventListener,
  listeners: EventListener[],
) => {
  if (isSimilarListenerType(searchFor.listenerType)) {
    return listeners.find((listener) => isSimilar(searchFor, listener));
  }
  return undefined;
};

const insertOrFindSimilarListener = (
  listener: EventListener,
  arr: EventListener[],
): EventListener => {
  const similarListener = findSimilarListener(listener, arr);
  if (similarListener) {
    similarListener.refCount += 1;
    return similarListener;
  }
  arr.splice(findInsertIndex(arr, listener), 0, listener);
  return listener;
};

export class EventStore {
  readonly namedListeners: Map<EventName, Array<EventListener>>;
  readonly catchEmAllListeners: Array<EventListener>;

  getListenersForEventName = (eventName: string | symbol): EventListener[] => {
    let namedListeners = this.namedListeners.get(eventName);
    if (!namedListeners) {
      namedListeners = [];
      this.namedListeners.set(eventName, namedListeners);
    }
    return namedListeners;
  };

  constructor() {
    this.namedListeners = new Map();
    this.catchEmAllListeners = [];
  }

  /**
   * Returns the given listener (newListener), or if there is already a similar listener in the store,
   * the existing one with increased reference count (refCount)
   */
  add(listener: EventListener): EventListener {
    return insertOrFindSimilarListener(
      listener,
      listener.isCatchEmAll
        ? this.catchEmAllListeners
        : this.getListenersForEventName(listener.eventName),
    );
  }

  remove(
    listener: unknown,
    listenerObject: unknown,
    removeSimilar = false,
  ): void {
    // off([...])
    if (listenerObject == null && Array.isArray(listener)) {
      listener.forEach((li) => this.remove(li, null, removeSimilar));
      return;
    }

    // off() / off('*')
    if (
      listener == null ||
      (listenerObject == null && isCatchEmAll(listener))
    ) {
      this.removeAllListeners();
      return;
    }

    // off('foo') / off(Symbol('foo'))
    if (listenerObject == null && isEventName(listener)) {
      this.removeByEventName(listener);
      return;
    }

    // off(EventListener) — used by the unsubscribe function returned from on()
    if (listener instanceof EventListener) {
      this.removeByEventListener(listener);
      return;
    }

    // off('foo', obj) / off(Symbol('foo'), obj)
    if (removeSimilar) {
      this.removeByEventNameAndListenerObject(
        listener as EventName,
        listenerObject,
      );
      return;
    }

    // off(fn[, obj]) / off(obj)
    this.removeByListener(listener, listenerObject);
  }

  private removeByEventName(eventName: EventName): void {
    removeAll(this.namedListeners.get(eventName));
    this.namedListeners.delete(eventName);
  }

  private removeByEventListener(listener: EventListener): void {
    if (listener.isRemoved) return;
    listener.refCount -= 1;
    if (listener.refCount >= 1) return;
    listener.isRemoved = true;
    this.namedListeners.forEach((namedListeners, name) => {
      removeItemFromArray(namedListeners, listener);
      if (namedListeners.length === 0) {
        this.namedListeners.delete(name);
      }
    });
    removeItemFromArray(this.catchEmAllListeners, listener);
  }

  private removeByEventNameAndListenerObject(
    eventName: EventName,
    listenerObject: unknown,
  ): void {
    this.namedListeners.forEach((namedListeners, name) => {
      removeSimilarListenersFromArray(
        namedListeners,
        eventName,
        listenerObject,
      );
      if (namedListeners.length === 0) {
        this.namedListeners.delete(name);
      }
    });
  }

  private removeByListener(listener: unknown, listenerObject: unknown): void {
    const isObjectListener = typeof listener === 'object';
    this.namedListeners.forEach((namedListeners, name) => {
      removeListenerFromArray(namedListeners, listener, listenerObject);
      if (isObjectListener) {
        removeSimilarListenersFromArray(namedListeners, undefined, listener);
      }
      if (namedListeners.length === 0) {
        this.namedListeners.delete(name);
      }
    });
    removeListenerFromArray(this.catchEmAllListeners, listener, listenerObject);
    if (isObjectListener) {
      removeSimilarListenersFromArray(
        this.catchEmAllListeners,
        undefined,
        listener,
      );
    }
  }

  removeAllListeners(): void {
    this.namedListeners.forEach((namedListeners) => removeAll(namedListeners));
    this.namedListeners.clear();
    removeAll(this.catchEmAllListeners);
  }

  forEach(eventName: EventName, fn: (listener: EventListener) => void): void {
    const catchEmAllListeners = cloneArray(this.catchEmAllListeners);
    const namedListeners = cloneArray(this.namedListeners.get(eventName));
    if (
      eventName === EVENT_CATCH_EM_ALL ||
      !namedListeners ||
      namedListeners.length === 0
    ) {
      catchEmAllListeners.forEach(fn);
    } else if (catchEmAllListeners.length === 0) {
      namedListeners.forEach(fn);
    } else {
      const iLen = namedListeners.length;
      const jLen = catchEmAllListeners.length;
      let i = 0;
      let j = 0;
      while (i < iLen || j < jLen) {
        if (i < iLen) {
          const cur = namedListeners[i];
          if (j >= jLen || cur.priority >= catchEmAllListeners[j].priority) {
            fn(cur);
            ++i;
            continue;
          }
        }
        if (j < jLen) {
          fn(catchEmAllListeners[j]);
          ++j;
        }
      }
    }
  }

  getSubscriptionCount(): number {
    let count = this.catchEmAllListeners.length;
    for (const namedListeners of this.namedListeners.values()) {
      count += namedListeners.length;
    }
    return count;
  }
}
