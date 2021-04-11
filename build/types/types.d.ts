export declare type EventName = string | symbol;
export declare type AnyEventNames = EventName | Array<EventName>;
export declare type OnEventNames = AnyEventNames | Array<[EventName, number]>;
export declare type EventArgs = Array<any>;
export declare type ListenerType = unknown;
export declare type ListenerObjectType = Object | null | undefined;
export declare type ListenerFuncType = (...args: EventArgs) => void;
export declare type UnsubscribeFunc = ((() => void) & {
    listener: EventListener;
}) | ((() => void) & {
    listeners: Array<EventListener>;
});
export declare type SubscribeArgs = [OnEventNames, number, ListenerFuncType, ListenerObjectType] | [OnEventNames, number, ListenerFuncType] | [OnEventNames, ListenerFuncType, ListenerObjectType] | [OnEventNames, ListenerFuncType] | [OnEventNames, number, EventName, ListenerObjectType] | [OnEventNames, EventName, ListenerObjectType] | [OnEventNames, number, ListenerObjectType] | [OnEventNames, ListenerObjectType] | [number, ListenerFuncType, ListenerObjectType] | [number, ListenerFuncType] | [ListenerFuncType, ListenerObjectType] | [ListenerFuncType] | [number, ListenerObjectType] | [ListenerObjectType];
export interface EventizeApi {
    on(...args: SubscribeArgs): UnsubscribeFunc;
    once(...args: SubscribeArgs): UnsubscribeFunc;
    off(listener?: ListenerType, listenerObject?: ListenerObjectType): void;
    emit(eventNames: AnyEventNames, ...args: EventArgs): void;
    retain(eventName: EventName): void;
}
