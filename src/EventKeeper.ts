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

export class EventKeeper {
  static publish(events: KeeperEvent[]): void {
    events.sort((a, b) => a.order - b.order).forEach((event) => event.replay());
  }

  events = new Map<EventName, KeeperEventItem>();
  eventNames = new Set<EventName>();

  add(eventNames: AnyEventNames): void {
    if (Array.isArray(eventNames)) {
      eventNames.forEach((name) => this.eventNames.add(name));
    } else {
      this.eventNames.add(eventNames);
    }
  }

  remove(eventNames: AnyEventNames): void {
    if (Array.isArray(eventNames)) {
      eventNames.forEach((name) => this.eventNames.delete(name));
    } else {
      this.eventNames.delete(eventNames);
    }
    this.clear(eventNames);
  }

  clear(eventNames: AnyEventNames): void {
    if (Array.isArray(eventNames)) {
      eventNames.forEach((name) => this.events.delete(name));
    } else {
      this.events.delete(eventNames);
    }
  }

  /** Drops every retain policy and every retained value. */
  removeAll(): void {
    this.eventNames.clear();
    this.events.clear();
  }

  /** Drops every retained value, keeping the retain policies in place. */
  clearAll(): void {
    this.events.clear();
  }

  retain(eventName: EventName, args: EventArgs): void {
    if (this.eventNames.has(eventName)) {
      this.events.set(eventName, {args, order: nextOrderId++});
    }
  }

  isKnown(eventName: EventName): boolean {
    return this.eventNames.has(eventName);
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
      this.eventNames.forEach((name) => {
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
