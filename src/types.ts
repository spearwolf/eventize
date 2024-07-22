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

export interface EventizeApi extends EventizedObject {
  on(...args: SubscribeArgs): UnsubscribeFunc;
  once(...args: SubscribeArgs): UnsubscribeFunc;
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
