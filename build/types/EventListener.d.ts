import { EventName, EventArgs } from './types';
declare type ListenerObjectType = Object | null;
declare type CallAfterApplyFnType = (() => void) | undefined;
export declare class EventListener {
    readonly id: number;
    readonly eventName: EventName;
    readonly isCatchEmAll: boolean;
    readonly priority: number | undefined;
    readonly listener: unknown;
    readonly listenerObject: ListenerObjectType;
    readonly listenerType: number;
    readonly callAfterApply: CallAfterApplyFnType;
    isRemoved: boolean;
    constructor(eventName: EventName, priority: number | undefined, listener: unknown, listenerObject?: ListenerObjectType);
    isEqual(listener: unknown, listenerObject?: ListenerObjectType): boolean;
    apply(eventName: EventName, args?: EventArgs): void;
}
export {};
