import {EventListener} from './EventListener';
import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';
import type {EventName, ListenerObjectType} from './types';
import {isCatchEmAll, isEventName} from './utils';

type HasPriorityOrIdType = {priority: number; id: number};

const sortByPriorityAndId = (
  a: HasPriorityOrIdType,
  b: HasPriorityOrIdType,
): number =>
  a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

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
  listenerObject: ListenerObjectType,
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
  listenerObject: ListenerObjectType,
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
  arr.push(listener);
  arr.sort(sortByPriorityAndId);
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
    listenerObject: ListenerObjectType,
    removeSimilar = false,
  ): void {
    // TODO clean up this messy function!
    if (listenerObject == null && Array.isArray(listener)) {
      // ---------------------------------------------------------------
      // off([...])
      //
      listener.forEach((li) => this.remove(li, null, removeSimilar));
      // ---------------------------------------------------------------
    } else if (
      listener == null ||
      (listenerObject == null && isCatchEmAll(listener))
    ) {
      // ---------------------------------------------------------------
      // off()
      // off('*')
      //
      this.removeAllListeners();
      // ---------------------------------------------------------------
    } else if (listenerObject == null && isEventName(listener)) {
      // ---------------------------------------------------------------
      // off('foo')
      // off(Symbol('foo'))
      //
      removeAll(this.namedListeners.get(listener));
      // ---------------------------------------------------------------
    } else if (listener instanceof EventListener) {
      // ---------------------------------------------------------------
      // off(EventListener)
      // on(...)()
      //
      if (!listener.isRemoved) {
        listener.refCount -= 1;
        if (listener.refCount < 1) {
          listener.isRemoved = true;
          this.namedListeners.forEach((namedListeners) =>
            removeItemFromArray(namedListeners, listener),
          );
          removeItemFromArray(this.catchEmAllListeners, listener);
        }
      }
      // ---------------------------------------------------------------
    } else if (removeSimilar) {
      if (isCatchEmAll(listener) && typeof listener == 'object') {
        // ---------------------------------------------------------------
        // .off('*', obj)
        //
        // TODO probably this will never be called
        //      so please check if we can remove this code path
        removeSimilarListenersFromArray(
          this.catchEmAllListeners,
          EVENT_CATCH_EM_ALL,
          listener,
        );
        // ---------------------------------------------------------------
      } else {
        // ---------------------------------------------------------------
        // off('foo', obj)
        // off(Symbol('foo'), obj)
        //
        this.namedListeners.forEach((namedListeners) =>
          removeSimilarListenersFromArray(
            namedListeners,
            listener,
            listenerObject,
          ),
        );
        // ---------------------------------------------------------------
      }
    } else {
      // ---------------------------------------------------------------
      // off(obj)
      //
      this.namedListeners.forEach((namedListeners) => {
        removeListenerFromArray(namedListeners, listener, listenerObject);
        if (typeof listener === 'object') {
          removeSimilarListenersFromArray(namedListeners, undefined, listener);
        }
      });
      removeListenerFromArray(
        this.catchEmAllListeners,
        listener,
        listenerObject,
      );
      if (typeof listener === 'object') {
        removeSimilarListenersFromArray(
          this.catchEmAllListeners,
          undefined,
          listener,
        );
      }
      // ---------------------------------------------------------------
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
