import type {AnyEventNames, EventArgs, EventName} from './types';
import {isCatchEmAll} from './utils';

type KeeperEventItem = {
  order: number;
  args: EventArgs;
};

export type KeeperEvent = {
  order: number;
  replay: () => void;
};

let nextOrderId = 0;

const byOrder = (a: KeeperEvent, b: KeeperEvent) => a.order - b.order;

const rejectMutation = (field: string) => (): never => {
  throw new Error(
    `EventKeeper: ${field} is the shared empty stand-in — replace it, never mutate it`,
  );
};

/**
 * Shared stand-ins for the two retain containers, one pair per module instance.
 *
 * Most emitters never see `retain()`, and an empty V8 Map or Set costs ~160 B
 * each — so building both in a field initializer spends ~320 B per emitter on
 * a retain index that stays empty for the object's whole life. Both fields
 * start out pointing here instead, and every write path swaps in a real
 * container first. The fields therefore always hold a Map / a Set, and every
 * reader — inside the class and out — works unchanged.
 *
 * `Object.freeze()` does not make a Map or a Set immutable: it seals the own
 * properties and nothing else, so `set()`, `add()`, `delete()` and `clear()`
 * would go on working and one missed write path would hand its entries to
 * every other emitter this module built. The mutators are therefore shadowed
 * with throwing stubs, which turns that silent corruption into a failure at
 * the first offending call. Nothing in the library is allowed to reach them:
 * a mutation is either preceded by materialization, or skipped because an
 * empty container has nothing to delete.
 *
 * Module instance, not realm — and unlike the obligation counter (see
 * `EventListener.ts`) that distinction costs nothing here. Loading the ESM and
 * the CJS build side by side creates a second pair, but a keeper is only ever
 * touched by the methods of the class that built it, so the identity test in
 * the materializers always compares against its own module's stand-in. A
 * foreign pair is simply a pair this code never sees. `getRetainedCount.ts`
 * reads `events`/`eventNames` straight off the field, past the class — harmless
 * as long as it only reads; the premise would stop holding the day something
 * outside the class assigns one of these fields instead.
 */
const EMPTY_EVENTS: Map<EventName, KeeperEventItem> = Object.freeze(
  Object.defineProperties(new Map<EventName, KeeperEventItem>(), {
    set: {value: rejectMutation('events')},
    delete: {value: rejectMutation('events')},
    clear: {value: rejectMutation('events')},
  }),
);

const EMPTY_EVENT_NAMES: Set<EventName> = Object.freeze(
  Object.defineProperties(new Set<EventName>(), {
    add: {value: rejectMutation('eventNames')},
    delete: {value: rejectMutation('eventNames')},
    clear: {value: rejectMutation('eventNames')},
  }),
);

export class EventKeeper {
  static publish(events: KeeperEvent[]): void {
    if (events.length === 0) return;
    events.sort(byOrder).forEach((event) => event.replay());
  }

  events: Map<EventName, KeeperEventItem> = EMPTY_EVENTS;
  eventNames: Set<EventName> = EMPTY_EVENT_NAMES;

  private mutableEvents(): Map<EventName, KeeperEventItem> {
    if (this.events === EMPTY_EVENTS) {
      this.events = new Map();
    }
    return this.events;
  }

  private mutableEventNames(): Set<EventName> {
    if (this.eventNames === EMPTY_EVENT_NAMES) {
      this.eventNames = new Set();
    }
    return this.eventNames;
  }

  add(eventNames: AnyEventNames): void {
    if (Array.isArray(eventNames)) {
      // `retain(ε, [])` writes nothing, so it must not build a container
      // either.
      if (eventNames.length === 0) return;
      const names = this.mutableEventNames();
      eventNames.forEach((name) => names.add(name));
    } else {
      this.mutableEventNames().add(eventNames);
    }
  }

  remove(eventNames: AnyEventNames): void {
    // Nothing held means nothing to delete — and skipping the walk is also
    // what keeps the shared stand-in out of `delete()`.
    if (this.eventNames.size !== 0) {
      const names = this.eventNames;
      if (Array.isArray(eventNames)) {
        eventNames.forEach((name) => names.delete(name));
      } else {
        names.delete(eventNames);
      }
    }
    this.clear(eventNames);
  }

  clear(eventNames: AnyEventNames): void {
    if (this.events.size === 0) return;
    const events = this.events;
    if (Array.isArray(eventNames)) {
      eventNames.forEach((name) => events.delete(name));
    } else {
      events.delete(eventNames);
    }
  }

  /**
   * Drops every retain policy and every retained value.
   *
   * Releases both containers rather than emptying them: `clear()` on the
   * shared stand-in would reach every keeper this module built, and letting go
   * of a populated container returns the emitter to the state it was born in.
   */
  removeAll(): void {
    this.eventNames = EMPTY_EVENT_NAMES;
    this.events = EMPTY_EVENTS;
  }

  /** Drops every retained value, keeping the retain policies in place. */
  clearAll(): void {
    this.events = EMPTY_EVENTS;
  }

  retain(eventName: EventName, args: EventArgs): void {
    if (this.eventNames.has(eventName)) {
      this.mutableEvents().set(eventName, {args, order: nextOrderId++});
    }
  }

  /**
   * Whether `replayTo()` for this name could queue anything at all.
   *
   * A pure "is there something held" test, cheap enough to sit in front of
   * every single subscription — and deliberately not a test of whether the
   * subscriber is entitled to what is held. That decision stays where it is,
   * in the obligation check at the replay itself.
   *
   * `'*'` subscribes to every retained value rather than to a value stored
   * under the name `'*'`, so for the catch-em-all it asks about the whole
   * container instead of about its own name.
   */
  hasRetainedFor(eventName: EventName): boolean {
    return isCatchEmAll(eventName)
      ? this.events.size !== 0
      : this.events.has(eventName);
  }

  replayTo(
    eventName: EventName,
    eventListener: {apply: (eventName: EventName, args?: EventArgs) => void},
    sortedEvents: KeeperEvent[] = [],
  ): KeeperEvent[] {
    if (!isCatchEmAll(eventName)) {
      const event = this.events.get(eventName);
      if (event != null) {
        const {order, args} = event;
        sortedEvents.push({
          order,
          replay: () => eventListener.apply(eventName, args),
        });
      }
    } else {
      // Iterate the retained values, not the retain policies: every entry in
      // `events` has a policy by construction — retain() only ever writes
      // one that's already known — so this visits the same names as
      // `eventNames` would, minus the ones with no value to replay. Cost is
      // O(retained values), not O(policies).
      //
      // Map#forEach's callback is (value, key) — `name` is the second
      // argument here, unlike the `eventNames` Set this replaced.
      this.events.forEach((_event, name) => {
        // '*' can never be a retained name — retain() rejects it — but the
        // guard costs nothing and stops any future path that lets it in from
        // recursing through this branch forever.
        if (!isCatchEmAll(name)) {
          this.replayTo(name, eventListener, sortedEvents);
        }
      });
    }
    return sortedEvents;
  }
}
