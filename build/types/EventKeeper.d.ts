import { AnyEventNames, EventArgs, EventName } from './types';
export declare class EventKeeper {
    events: Map<EventName, any[]>;
    eventNames: Set<EventName>;
    add(eventNames: AnyEventNames): void;
    remove(eventNames: AnyEventNames): void;
    retain(eventName: EventName, args: EventArgs): void;
    isKnown(eventName: EventName): boolean;
    emit(eventName: EventName, eventListener: {
        apply: (eventName: EventName, args?: EventArgs) => void;
    }): void;
}
