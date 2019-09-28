import { EVENT_CATCH_EM_ALL } from './constants';

export default class EventKeeper {
  constructor() {
    this.events = new Map();
    this.eventNames = new Set();
  }

  add(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach((name) => this.eventNames.add(name));
    } else {
      this.eventNames.add(eventName);
    }
  }

  remove(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach((name) => this.remove(name));
    } else {
      this.eventNames.delete(eventName);
    }
  }

  retain(eventName, args) {
    if (this.eventNames.has(eventName)) {
      this.events.set(eventName, args);
    }
  }

  isKnown(eventName) {
    return this.eventNames.has(eventName);
  }

  emit(eventName, eventListener) {
    if (eventName === EVENT_CATCH_EM_ALL) {
      this.eventNames.forEach((name) => this.emit(name, eventListener));
    } else {
      const args = this.events.get(eventName);
      if (args) {
        eventListener.apply(eventName, args);
      }
    }
  }
}
