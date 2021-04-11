export type EventName = string | symbol;
export type AnyEventNames = EventName | Array<EventName>;

export type EventArgs = Array<any>;

export type ListenerType = unknown;
export type ListenerObjectType = Object | null | undefined;
export type ListenerFuncType = (...args: EventArgs) => void;

export type UnsubscribeFunc =
  | ((() => void) & {listener: EventListener})
  | ((() => void) & {listeners: Array<EventListener>});

export type SubscribeArgs =
  //
  // .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )
  //
  | [AnyEventNames, number, ListenerFuncType, ListenerObjectType]
  | [AnyEventNames, number, ListenerFuncType]
  | [AnyEventNames, ListenerFuncType, ListenerObjectType]
  | [AnyEventNames, ListenerFuncType]
  //
  // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )
  //
  | [AnyEventNames, number, EventName, ListenerObjectType]
  | [AnyEventNames, EventName, ListenerObjectType]
  //
  // .on( eventName*, [ priority, ] listenerObject )
  //
  | [AnyEventNames, number, ListenerObjectType]
  | [AnyEventNames, ListenerObjectType]
  //
  // .on( [ priority, ] listenerFunc [, listenerObject] )
  //
  | [number, ListenerFuncType, ListenerObjectType]
  | [number, ListenerFuncType]
  | [ListenerFuncType, ListenerObjectType]
  | [ListenerFuncType]
  //
  // .on( [ priority, ] listenerObject )
  //
  | [number, ListenerObjectType]
  | [ListenerObjectType];

export interface EventizeApi {
  on(...args: SubscribeArgs): UnsubscribeFunc;
  once(...args: SubscribeArgs): UnsubscribeFunc;

  off(listener: ListenerType, listenerObject?: ListenerObjectType): void;

  emit(eventNames: AnyEventNames, ...args: EventArgs): void;

  retain(eventName: EventName): void;
}
