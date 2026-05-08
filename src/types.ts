import type {EventKeeper} from './EventKeeper.js';
import type {EventStore} from './EventStore.js';
import type {NAMESPACE} from './constants.js';

export interface EventizedObject {
  [NAMESPACE]: {
    keeper: EventKeeper;
    store: EventStore;
  };
}

export type EventName = string | symbol;
export type AnyEventNames = EventName | Array<EventName>;
export type OnEventNames = AnyEventNames | Array<[EventName, number]>;

export type EventArgs = Array<any>;

export type ListenerType = unknown;
export type ListenerObjectType = object | null | undefined;
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

/**
 * Overloaded call signatures for `on()` / `once()`.
 *
 * Ordered specific → generic so TypeScript picks the most precise match first:
 *   1. listener function (with/without priority, with/without listenerObject)
 *   2. listener method name on a listener object
 *   3. listener object alone
 *   4. catch-all (no event name)
 */
export interface SubscribeFunc {
  // (1) listener function with event name(s)
  (eventNames: OnEventNames, listener: ListenerFuncType): UnsubscribeFunc;
  (
    eventNames: OnEventNames,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: OnEventNames,
    priority: number,
    listener: ListenerFuncType,
  ): UnsubscribeFunc;
  (
    eventNames: OnEventNames,
    priority: number,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;

  // (2) listener method name on listener object
  (
    eventNames: OnEventNames,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: OnEventNames,
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;

  // (3) listener object alone (event-named methods on the object are the listeners)
  (
    eventNames: OnEventNames,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: OnEventNames,
    priority: number,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;

  // (4) catch-all (no event name; equivalent to subscribing to '*')
  (listener: ListenerFuncType): UnsubscribeFunc;
  (
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (priority: number, listener: ListenerFuncType): UnsubscribeFunc;
  (
    priority: number,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (listenerObject: ListenerObjectType): UnsubscribeFunc;
  (priority: number, listenerObject: ListenerObjectType): UnsubscribeFunc;
}

export interface EventizeApi extends EventizedObject {
  on: SubscribeFunc;
  once: SubscribeFunc;
  onceAsync<ReturnType = void>(eventNames: AnyEventNames): Promise<ReturnType>;

  off(listener?: ListenerType, listenerObject?: ListenerObjectType): void;

  emit(eventNames: AnyEventNames, ...args: EventArgs): void;
  emitAsync(eventNames: AnyEventNames, ...args: EventArgs): Promise<any>;

  retain(eventNames: AnyEventNames): void;
  retainClear(eventNames: AnyEventNames): void;
}

export interface EventizerFunc {
  <T extends object>(obj?: T): T & EventizedObject;
}

export interface EventizeGuard {
  <T extends object>(obj: T): obj is T & EventizedObject;
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

export interface EventizerFuncAPI extends EventizerFunc {
  is: EventizeGuard;
  inject: <T extends object>(obj?: T) => T & EventizeApi;
}
