import {
  EVENT_CATCH_EM_ALL,
  LISTENER_IS_FUNC,
  LISTENER_IS_NAMED_FUNC,
  LISTENER_IS_OBJ,
} from './constants';

const apply = (context, func, args) => {
  if (typeof func === 'function') {
    func.apply(context, args);
  }
};

const emit = (eventName, listener, args) => apply(
  listener,
  listener.emit,
  [eventName].concat(args),
);

const detectListenerType = (listener) => {
  switch (typeof listener) {
    case 'function':
      return LISTENER_IS_FUNC;
    case 'string':
      return LISTENER_IS_NAMED_FUNC;
    case 'object':
      return LISTENER_IS_OBJ;
  }
};

let lastId = 0;
const createUniqId = () => ++lastId;

export default class EventListener {
  constructor(eventName, priority, listener, listenerObject = null) {
    this.id = createUniqId();
    this.eventName = eventName;
    this.isCatchEmAll = eventName === EVENT_CATCH_EM_ALL;
    this.listener = listener;
    this.listenerObject = listenerObject;
    this.priority = priority;
    this.listenerType = detectListenerType(listener);
    this.callAfterApply = undefined;
    this.isRemoved = false;
  }

  isEqual(listener, listenerObject = null) {
    if (listener === this) return true;
    if (typeof listener === 'number' && listener === this.id) return true;
    if (listenerObject === null && typeof listener === 'string') {
      if (listener === EVENT_CATCH_EM_ALL) return true;
      if (listener === this.eventName) return true;
      return false;
    }
    return this.listener === listener && this.listenerObject === listenerObject;
  }

  apply(eventName, args) {
    if (this.isRemoved) return;

    const { listener, listenerObject } = this;

    switch (this.listenerType) {
      case LISTENER_IS_FUNC:
        apply(listenerObject, listener, args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case LISTENER_IS_NAMED_FUNC:
        apply(listenerObject, listenerObject[listener], args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case LISTENER_IS_OBJ: {
        const func = listener[eventName];
        if (this.isCatchEmAll || this.eventName === eventName) {
          if (typeof func === 'function') {
            func(...args);
          } else {
            emit(eventName, listener, args);
          }
          if (this.callAfterApply) this.callAfterApply();
        }
        break;
      }
    }
  }
}
