import {EventKeeper} from './EventKeeper';
import type {KeeperEvent} from './EventKeeper';
import {detectListenerType, EventListener} from './EventListener';
import type {OnceObligation} from './EventListener';
import type {EventStore} from './EventStore';
import {Priority} from './Priority';
import {EVENT_CATCH_EM_ALL} from './constants';
import type {EventArgs, EventName, ListenerObjectType} from './types';
import {warn} from './utils';

const registerEventListener = (
  store: EventStore,
  keeper: EventKeeper,
  eventName: EventName,
  priority: number,
  listener: unknown,
  listenerObject: ListenerObjectType,
  retainedEvents: KeeperEvent[],
  obligation: OnceObligation | null,
): EventListener => {
  const newListener = new EventListener(
    eventName,
    priority,
    listener,
    listenerObject,
  );
  const el = store.add(newListener, obligation);

  if (obligation !== null && el.callAfterApply === undefined) {
    // One hook per listener, however many once() obligations it carries. It
    // outlives none of them: settleOneShots() clears it when the last one
    // discharges. The watermark comes from apply() at the moment it calls
    // this — see settleOneShots() for why it has to be the sequence counter's
    // value, not a count or a position.
    el.callAfterApply = (watermark) => store.settleOneShots(el, watermark);
  }

  // An aggregating on() gets no replay — the handler already saw that value.
  // An aggregating once() does: its obligation is new, and without the replay
  // whether a once() fires on a retained event would depend on the incidental
  // existence of an on() with the same handler.
  //
  // A multi-name once() queues one such replay per name it covers, all
  // against the one obligation it shares, and EventKeeper.publish() runs
  // every replay queued by this call in sequence before returning. Whichever
  // one runs first can settle that obligation — through the real dispatch it
  // triggers, same as any other emit — and a once() promises at most one
  // invocation in total, retained replay included. `isRemoved` cannot be what
  // stops a later replay in the same batch: a member kept alive by an on()
  // registration is never removed at all, so its queued replay would call the
  // listener a second time with nothing left to guard it. The obligation
  // itself is the guard, checked when the replay actually runs — never at
  // queue time, since nothing queued by this call has run yet while this call
  // is still queueing.
  if (el === newListener || obligation !== null) {
    const replayTarget: {apply: (name: EventName, args?: EventArgs) => void} =
      obligation === null
        ? el
        : {
            apply: (name, args) => {
              if (!obligation.settled) el.apply(name, args);
            },
          };
    keeper.replayTo(eventName, replayTarget, retainedEvents);
  }

  return el;
};

/**
 * NaN is a `number`, so the positional decoding below takes it for a priority —
 * and `sortByPriorityAndId()` then compares with `b.priority - a.priority`,
 * which is NaN for every pair. Every comparison is false, `findInsertIndex()`
 * walks its binary search all the way right, and the listener lands at a
 * position determined by the bucket size instead of by its priority. No error,
 * no warning, just the wrong call order.
 *
 * `Number.isNaN`, not `Number.isFinite`: `Priority.Max` and `Priority.Min` are
 * `±Infinity`, which sorts perfectly well and is documented API.
 */
const assertPriorityIsUsable = (priority: number, args: EventArgs): void => {
  if (Number.isNaN(priority)) {
    // No `hasConsole` guard: `warn` is already the no-op arrow when there is no
    // console. The guard that used to sit here (and at the listener check
    // below) could never be false in any environment a test can construct, so
    // it only ever showed up as an uncovered branch.
    warn('called with a NaN priority!', args);
    throw new Error('subscribeTo() called with a NaN priority');
  }
};

const _subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  retainedEvents: KeeperEvent[],
  obligation: OnceObligation | null,
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

  // Truthiness used to be the entire test, so any truthy value that cannot be
  // dispatched — a number, a boolean, a bigint — was registered as a listener
  // and every emit() fell through all three branches of EventListener.apply().
  // The dead entry could only be removed with off(), and until then it inflated
  // getSubscriptionCount(). The type test is what makes that undefined branch
  // unreachable through the public API rather than merely claiming it.
  //
  // `!listener` stays in front of the type test: '' does carry a listener type
  // (a method name is a string), but an empty method name was rejected before
  // this change and there is no reason to start accepting it.
  if (!listener || detectListenerType(listener) === undefined) {
    // Three ways in, and the log line is where anyone actually looks — so it
    // says which one it was. The last branch is `''` and nothing else: it is
    // the only falsy value `detectListenerType()` still tags.
    warn(
      listener == null
        ? 'called with insufficient arguments!'
        : detectListenerType(listener) === undefined
          ? 'called with a value that cannot be a listener!'
          : 'called with an empty method name!',
      args,
    );
    // One thrown message for all three, unchanged since v4 and documented.
    throw new Error('subscribeTo() called with insufficient arguments');
  }

  assertPriorityIsUsable(priority, args);

  const register = (prio: number) => (event: EventName) =>
    registerEventListener(
      store,
      keeper,
      event,
      prio,
      listener,
      listenerObject,
      retainedEvents,
      obligation,
    );

  if (Array.isArray(eventName)) {
    // Resolve every per-event priority before registering anything, so a NaN in
    // one tuple rejects the whole call instead of leaving the names in front of
    // it subscribed — the same atomicity `retain(ε, [name, …])` has for '*'.
    //
    // A tuple without a priority only reaches here from untyped call sites —
    // `EventNameWithPriority` is a fixed 2-tuple, so the typed API rejects it.
    // Falling back to the call-level priority is what a missing override means,
    // and it keeps `undefined` out of the arithmetic in sortByPriorityAndId,
    // where it would become NaN. `??` rather than `||` — 0 is Priority.Normal,
    // not "absent" — which is also why `??` lets an explicit NaN through to the
    // assertion below rather than swallowing it.
    const entries: Array<[EventName, number]> = eventName.map((name) =>
      Array.isArray(name) ? [name[0], name[1] ?? priority] : [name, priority],
    );
    for (const entry of entries) {
      assertPriorityIsUsable(entry[1], args);
    }
    return entries.map((entry) => register(entry[1])(entry[0]));
  }
  return register(priority)(eventName);
};

export const subscribeTo = (
  store: EventStore,
  keeper: EventKeeper,
  args: EventArgs,
  obligation: OnceObligation | null = null,
): EventListener | Array<EventListener> => {
  const retainedEvents: KeeperEvent[] = [];
  const listeners = _subscribeTo(
    store,
    keeper,
    args,
    retainedEvents,
    obligation,
  );
  EventKeeper.publish(retainedEvents);
  return listeners;
};
