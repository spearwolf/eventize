export type EventName = string | symbol;
export type AnyEventNames = EventName | Array<EventName>;
export type OnEventNames = AnyEventNames | Array<[EventName, number]>;

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
  | [OnEventNames, number, ListenerFuncType, ListenerObjectType]
  | [OnEventNames, number, ListenerFuncType]
  | [OnEventNames, ListenerFuncType, ListenerObjectType]
  | [OnEventNames, ListenerFuncType]
  //
  // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )
  //
  | [OnEventNames, number, EventName, ListenerObjectType]
  | [OnEventNames, EventName, ListenerObjectType]
  //
  // .on( eventName*, [ priority, ] listenerObject )
  //
  | [OnEventNames, number, ListenerObjectType]
  | [OnEventNames, ListenerObjectType]
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

  off(listener?: ListenerType, listenerObject?: ListenerObjectType): void;

  emit(eventNames: AnyEventNames, ...args: EventArgs): void;

  retain(eventName: EventName): void;
}

export interface EventizerFunc {
  <T extends Object>(obj: T): T & EventizeApi;
}

export interface EventizeGuard {
  <T extends Object>(obj: T): obj is T & EventizeApi;
}

export interface EventizeFuncApi extends EventizerFunc {
  inject: EventizerFunc;
  extend: EventizerFunc;
  create(obj: Object): EventizeApi;

  is: EventizeGuard;

  PRIO_MAX: number;
  PRIO_A: number;
  PRIO_B: number;
  PRIO_C: number;
  PRIO_DEFAULT: number;
  PRIO_LOW: number;
  PRIO_MIN: number;
}
