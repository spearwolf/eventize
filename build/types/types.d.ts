export declare type EventName = string | symbol;
export declare type AnyEventNames = EventName | Array<EventName>;
export declare type EventArgs = Array<any>;
export declare type ListenerType = unknown;
export declare type ListenerObjectType = Object | null | undefined;
export declare type ListenerFuncType = (...args: EventArgs) => void;
export declare type UnsubscribeFunc = ((() => void) & {
    listener: EventListener;
}) | ((() => void) & {
    listeners: Array<EventListener>;
});
export declare type SubscribeArgs = [AnyEventNames, number, ListenerFuncType, ListenerObjectType] | [AnyEventNames, number, ListenerFuncType] | [AnyEventNames, ListenerFuncType, ListenerObjectType] | [AnyEventNames, ListenerFuncType] | [AnyEventNames, number, EventName, ListenerObjectType] | [AnyEventNames, EventName, ListenerObjectType] | [AnyEventNames, number, ListenerObjectType] | [AnyEventNames, ListenerObjectType] | [number, ListenerFuncType, ListenerObjectType] | [number, ListenerFuncType] | [ListenerFuncType, ListenerObjectType] | [ListenerFuncType] | [number, ListenerObjectType] | [ListenerObjectType];
export interface EventizeApi {
    on(...args: SubscribeArgs): UnsubscribeFunc;
    once(...args: SubscribeArgs): UnsubscribeFunc;
    off(listener: ListenerType, listenerObject?: ListenerObjectType): void;
    emit(eventNames: AnyEventNames, ...args: EventArgs): void;
    retain(eventName: EventName): void;
}
