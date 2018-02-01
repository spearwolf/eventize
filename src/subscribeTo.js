import EventListener from './EventListener';

import { hasConsole, warn } from './logUtils';

import {
  EVENT_CATCH_EM_ALL,
  PRIO_DEFAULT,
} from './constants';

const registerEventListener = (store, keeper, eventName, priority, listener, listenerObject) => {
  const eventListener = new EventListener(eventName, priority, listener, listenerObject);
  store.add(eventListener);
  keeper.emit(eventName, eventListener);
  return eventListener;
};

const subscribeTo = (store, keeper, args) => {
  const len = args.length;
  const typeOfFirstArg = typeof args[0];

  let eventName;
  let priority;
  let listener;
  let listenerObject;

  if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
    eventName = EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = PRIO_DEFAULT;
    if (typeOfFirstArg === 'string' || Array.isArray(args[0])) {
      [eventName, listener, listenerObject] = args;
    } else {
      eventName = EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }

  if (!listener && hasConsole) {
    warn('called with insufficient arguments!', args);
    return;
  }

  const register = prio => event => registerEventListener(
    store, keeper, event,
    prio, listener, listenerObject,
  );

  if (Array.isArray(eventName)) {
    return eventName.map((name) => {
      if (Array.isArray(name)) {
        return register(name[1])(name[0]);
      }
      return register(priority)(name);
    });
  }
  return register(priority)(eventName);
};

export default subscribeTo;
