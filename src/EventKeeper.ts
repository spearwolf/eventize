import type {AnyEventNames, EventArgs, EventName} from './types';
import {isCatchEmAll} from './utils';

export class EventKeeper {
  events = new Map<EventName, EventArgs>();
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
      this.events.set(eventName, args);
    }
  }

  isKnown(eventName: EventName): boolean {
    return this.eventNames.has(eventName);
  }

  emit(
    eventName: EventName,
    eventListener: {apply: (eventName: EventName, args?: EventArgs) => void},
  ): void {
    if (!isCatchEmAll(eventName)) {
      const args = this.events.get(eventName);
      if (args) {
        eventListener.apply(eventName, args);
      }
    } else {
      this.eventNames.forEach((name) => this.emit(name, eventListener));
    }
  }
}
