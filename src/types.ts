export type EventName = string | symbol;
export type AnyEventNames = EventName | Array<EventName>;

export type EventArgs = Array<any>;

export type ListenerType = unknown;
export type ListenerObjectType = Object | null | undefined;
export type ListenerFuncType = (...args: EventArgs) => void;

export type SubscribeArgs =
  | [AnyEventNames, [number, ListenerFuncType]]
  | [AnyEventNames, [number, ListenerFuncType, ListenerObjectType]]
  | [AnyEventNames, [number, EventName, ListenerObjectType]]
  | [AnyEventNames, [number, ListenerObjectType]]
  | [number, ListenerFuncType]
  | [number, ListenerFuncType, ListenerObjectType]
  | [number, ListenerObjectType]
  | [ListenerFuncType]
  | [ListenerFuncType, ListenerObjectType]
  | [ListenerObjectType];

export type UnsubscribeFunc =
  | ((() => void) & {listener: EventListener})
  | ((() => void) & {listeners: Array<EventListener>});

// ----------------------------------------------------------------------------------------
//
// .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )
// .on( eventName*, [ priority, ] listenerFuncName, listenerObject )
// .on( eventName*, [ priority, ] listenerObject )
//
// .on( [ priority, ] listenerFunc [, listenerObject] )
//                                            => listenerObject.on( '*', listenerFunc )
// .on( [ priority, ] listenerObject )
//                                            => listenerObject.on( '*', listenerObject )
//
// .off(...)
//
// eventName*: eventName | Array<eventName>
// eventName: string | symbol
//
// listenerFunc: function
// listenerFuncName: string | symbol
// listenerObject: object
//
// ----------------------------------------------------------------------------------------
export interface EventizeApi {
  on(...args: SubscribeArgs): UnsubscribeFunc;
  once(...args: SubscribeArgs): UnsubscribeFunc;

  off(listener: ListenerType, listenerObject?: ListenerObjectType): void;

  emit(eventNames: AnyEventNames, ...args: EventArgs): void;

  retain(eventName: EventName): void;
}
