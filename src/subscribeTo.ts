import {EventKeeper, KeeperEvent} from './EventKeeper';
import {EventListener} from './EventListener';
import {EventStore} from './EventStore';
import {Priority} from './Priority';
import {EVENT_CATCH_EM_ALL} from './constants';
import type {EventArgs, EventName, ListenerObjectType} from './types';
import {hasConsole, warn} from './utils';

const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  retainedEvents: KeeperEvent[],
): EventListener => {
  const el = store.add(
    new EventListener(eventName, priority, listener, listenerObject),
  );
  keeper.emit(eventName, el, retainedEvents); // TODO what if similarListener ?
  return el;
};

const _subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  retainedEvents: KeeperEvent[],
): EventListener | Array<EventListener> => {
  const len = args.length;
  const typeOfFirstArg = typeof args[0];

  let eventName: EventName;
  let priority: number;
  let listener: unknown;
  let listenerObject: ListenerObjectType;

  if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
    eventName = EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = Priority.Default;
    if (
      typeOfFirstArg === 'string' ||
      typeOfFirstArg === 'symbol' ||
      Array.isArray(args[0])
    ) {
      [eventName, listener, listenerObject] = args;
    } else {
      eventName = EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }

  if (!listener && hasConsole) {
    warn('called with insufficient arguments!', args);
    throw 'subscribeTo() called with insufficient arguments!';
  }

  const register = (prio: number) => (event: EventName) =>
    registerEventListener(
      store,
      keeper,
      event,
      prio,
      listener,
      listenerObject,
      retainedEvents,
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

export const subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
): EventListener | Array<EventListener> => {
  const retainedEvents: KeeperEvent[] = [];
  const listener = _subscribeTo(store, keeper, args, retainedEvents);
  EventKeeper.publish(retainedEvents);
  return listener;
};
