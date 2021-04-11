import {EventListener} from './EventListener';
import {EVENT_CATCH_EM_ALL} from './constants';
import {EventName, ListenerObjectType} from './types';
import {isCatchEmAll, isEventName} from './utils';

type HasPriorityOrIdType = {priority: number; id: number};

const sortByPrioAndId = (
  a: HasPriorityOrIdType,
  b: HasPriorityOrIdType,
): number =>
  a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

const cloneArray = <T>(arr: Array<T>): Array<T> => arr?.slice(0);

const removeListenerItem = (arr: Array<any>, listener: any) => {
  const idx = arr.indexOf(listener);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
};

const removeListener = (
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

const removeAllListeners = (listeners: Array<EventListener>) => {
  if (listeners) {
    listeners.forEach((li) => {
      li.isRemoved = true;
    });
    listeners.length = 0;
  }
};

export class EventStore {
  readonly namedListeners: Map<EventName, Array<EventListener>>;
  readonly catchEmAllListeners: Array<EventListener>;

  constructor() {
    this.namedListeners = new Map();
    this.catchEmAllListeners = [];
  }

  add(eventListener: EventListener): void {
    if (eventListener.isCatchEmAll) {
      this.catchEmAllListeners.push(eventListener);
      this.catchEmAllListeners.sort(sortByPrioAndId);
    } else {
      const {eventName} = eventListener;
      let namedListeners = this.namedListeners.get(eventName);
      if (!namedListeners) {
        namedListeners = [];
        this.namedListeners.set(eventName, namedListeners);
      }
      namedListeners.push(eventListener);
      namedListeners.sort(sortByPrioAndId);
    }
  }

  remove(listener: unknown, listenerObject: ListenerObjectType): void {
    if (listenerObject == null && Array.isArray(listener)) {
      listener.forEach(this.remove.bind(this));
    } else if (
      listener == null ||
      (listenerObject == null && isCatchEmAll(listener))
    ) {
      this.removeAllListeners();
    } else if (listenerObject == null && isEventName(listener)) {
      const listeners = this.namedListeners.get(listener);
      removeAllListeners(listeners);
    } else if (listener instanceof EventListener) {
      listener.isRemoved = true;
      this.namedListeners.forEach((namedListeners) =>
        removeListenerItem(namedListeners, listener),
      );
      removeListenerItem(this.catchEmAllListeners, listener);
    } else {
      this.namedListeners.forEach((namedListeners) =>
        removeListener(namedListeners, listener, listenerObject),
      );
      removeListener(this.catchEmAllListeners, listener, listenerObject);
    }
  }

  removeAllListeners(): void {
    this.namedListeners.forEach((namedListeners) =>
      removeAllListeners(namedListeners),
    );
    this.namedListeners.clear();
    removeAllListeners(this.catchEmAllListeners);
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
}
