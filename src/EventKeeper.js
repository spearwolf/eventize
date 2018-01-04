
export default class EventKeeper {
  constructor() {
    this.events = new Map();
    this.eventNames = new Set();
  }

  add(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach(en => this.eventNames.add(en));
    } else {
      this.eventNames.add(eventName);
    }
  }

  remove(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach(en => this.remove(en));
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
    const args = this.events.get(eventName);
    if (args) {
      eventListener.apply(eventName, args);
    }
  }
}
