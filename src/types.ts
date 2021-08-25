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

export interface EventizePriority {
  Max: number;
  AAA: number;
  BB: number;
  C: number;
  Default: number;
  Low: number;
  Min: number;
}

export interface EventizeFuncApi extends EventizerFunc {
  /**
   * Returns the same object, with the [[EventizeApi]] attached,
   * by modifying the original object.
   */
  inject: EventizerFunc;

  /**
   * Returns a new object, with the [[EventizeApi]] attached.
   * The original object is not modified here, instead the prototype
   * of the new object is the orignial object.
   */
  extend: EventizerFunc;

  /**
   * @deprecated
   */
  create(obj: Object): EventizeApi;

  is: EventizeGuard;

  Priority: EventizePriority;
}
