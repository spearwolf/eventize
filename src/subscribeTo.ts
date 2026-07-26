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
  noDedup: boolean,
): EventListener => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener, noDedup);
  // store.add() returns the argument when it inserted, or an existing similar
  // listener whose refCount it bumped. Replaying to the latter would deliver
  // the retained event a second time to a listener that already got it.
  if (el === newListener) {
    keeper.replayTo(eventName, el, retainedEvents);
  }
  return el;
};

const _subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  retainedEvents: KeeperEvent[],
  noDedup: boolean,
): EventListener | Array<EventListener> => {
  const len = args.length;
  const typeOfFirstArg = typeof args[0];

  let eventName: EventName;
  let priority: number;
  let listener: unknown;
  let listenerObject: ListenerObjectType;

  if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
    // (4) catch-all with priority: on(priority, listener[, listenerObject])
    eventName = EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    // (1)-(3) with an explicit priority: on(eventNames, priority, …)
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = Priority.Normal;
    if (
      typeOfFirstArg === 'string' ||
      typeOfFirstArg === 'symbol' ||
      Array.isArray(args[0])
    ) {
      // (1)-(3) at default priority: on(eventNames, listener|methodName|obj[, obj])
      [eventName, listener, listenerObject] = args;
    } else {
      // (4) catch-all at default priority: on(listener|obj[, listenerObject])
      eventName = EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }

  if (!listener) {
    if (hasConsole) {
      warn('called with insufficient arguments!', args);
    }
    throw new Error('subscribeTo() called with insufficient arguments');
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
      noDedup,
    );

  if (Array.isArray(eventName)) {
    return eventName.map((name) => {
      if (Array.isArray(name)) {
        // A tuple without a priority only reaches here from untyped call
        // sites — `EventNameWithPriority` is a fixed 2-tuple, so the typed API
        // rejects it. Falling back to the call-level priority is what a
        // missing override means, and it keeps `undefined` out of the
        // arithmetic in sortByPriorityAndId, where it becomes NaN: every
        // comparison against NaN is false, so the binary-search insertion
        // silently misplaces the listener and priority ordering stops holding.
        // `??` rather than `||` — 0 is Priority.Normal, not "absent".
        return register(name[1] ?? priority)(name[0]);
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
  noDedup = false,
): EventListener | Array<EventListener> => {
  const retainedEvents: KeeperEvent[] = [];
  const listener = _subscribeTo(store, keeper, args, retainedEvents, noDedup);
  EventKeeper.publish(retainedEvents);
  return listener;
};

export const subscribeToDeferred = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  noDedup: boolean,
): {
  listeners: EventListener | Array<EventListener>;
  publishRetained: () => void;
} => {
  const retainedEvents: KeeperEvent[] = [];
  const listeners = _subscribeTo(store, keeper, args, retainedEvents, noDedup);
  return {
    listeners,
    publishRetained: () => EventKeeper.publish(retainedEvents),
  };
};
