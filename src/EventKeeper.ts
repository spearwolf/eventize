import type {AnyEventNames, EventArgs, EventName} from './types';
import {isCatchEmAll} from './utils';

type KeeperEventItem = {
  order: number;
  args: EventArgs;
};

export type KeeperEvent = {
  order: number;
  emit: () => void;
};

let nextOrderId = 0;

export class EventKeeper {
  static publish(events: KeeperEvent[]): void {
    events.sort((a, b) => a.order - b.order).forEach((event) => event.emit());
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

  retain(eventName: EventName, args: EventArgs): void {
    if (this.eventNames.has(eventName)) {
      this.events.set(eventName, {args, order: nextOrderId++});
    }
  }

  isKnown(eventName: EventName): boolean {
    return this.eventNames.has(eventName);
  }

  emit(
    eventName: EventName,
    eventListener: {apply: (eventName: EventName, args?: EventArgs) => void},
    sortedEvents: KeeperEvent[] = [],
  ): KeeperEvent[] {
    if (!isCatchEmAll(eventName)) {
      if (this.events.has(eventName)) {
        const {order, args} = this.events.get(eventName);
        sortedEvents.push({
          order,
          emit: () => eventListener.apply(eventName, args),
        });
      }
    } else {
      this.eventNames.forEach((name) =>
        this.emit(name, eventListener, sortedEvents),
      );
    }
    return sortedEvents;
  }
}
