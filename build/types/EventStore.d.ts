import { EventListener } from './EventListener';
import { EventName, ListenerObjectType } from './types';
export declare class EventStore {
    readonly namedListeners: Map<EventName, Array<EventListener>>;
    readonly catchEmAllListeners: Array<EventListener>;
    constructor();
    add(eventListener: EventListener): void;
    remove(listener: unknown, listenerObject: ListenerObjectType): void;
    removeAllListeners(): void;
    forEach(eventName: EventName, fn: (listener: EventListener) => void): void;
}
