import {Priority, CatchEmAllType} from './constants';
import {EventListener} from './EventListener';

export type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

export type EventNames<T extends Object> = FunctionPropertyNames<T> | Array<FunctionPropertyNames<T>> | CatchEmAllType;

export type AnyEventNames = string | Array<string> | CatchEmAllType;

export type EventListenerType = EventListener | Array<EventListener>;

export interface EventizeApi {

  // .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  on(eventName: AnyEventNames, priority: Priority, listenerFunc: (...args: any[]) => void): EventListenerType;
  on<T extends Object>(eventName: EventNames<T>, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  on(eventName: AnyEventNames, listenerFunc: (...args: any[]) => void): EventListenerType;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  once(eventName: AnyEventNames, priority: Priority, listenerFunc: (...args: any[]) => void): EventListenerType;
  once<T extends Object>(eventName: EventNames<T>, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  once(eventName: AnyEventNames, listenerFunc: (...args: any[]) => void): EventListenerType;

  // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): EventListenerType;
  on<T extends Object>(eventName: EventNames<T>, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): EventListenerType;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): EventListenerType;
  once<T extends Object>(eventName: EventNames<T>, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): EventListenerType;

  // .on( eventName*, [ priority, ] listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerObject: T): EventListenerType;
  on<T extends Object>(eventName: EventNames<T>, listenerObject: T): EventListenerType;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerObject: T): EventListenerType;
  once<T extends Object>(eventName: EventNames<T>, listenerObject: T): EventListenerType;

  // .on( [ priority, ] listenerFunc [, listenerObject] ) => listenerObject.on( '*', listenerFunc )

  on<T extends Object>(priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  on(priority: Priority, listenerFunc: (...args: any[]) => void): EventListenerType;
  on<T extends Object>(listenerFunc: (this: T,...args: any[]) => void, listenerObject: T): EventListenerType;
  on(listenerFunc: (...args: any[]) => void): EventListenerType;

  once<T extends Object>(priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): EventListenerType;
  once(priority: Priority, listenerFunc: (...args: any[]) => void): EventListenerType;
  once<T extends Object>(listenerFunc: (this: T,...args: any[]) => void, listenerObject: T): EventListenerType;
  once(listenerFunc: (...args: any[]) => void): EventListenerType;

  // .on( [ priority, ] listenerObject ) => listenerObject.on( '*', listenerObject )

  on(priority: Priority, listenerObject: Object): EventListenerType;
  on(listenerObject: Object): EventListenerType;

  once(priority: Priority, listenerObject: Object): EventListenerType;
  once(listenerObject: Object): EventListenerType;

  // .off( listener?, listenerObject? )

  off(listener?: any, listenerObject?: Object): void;

  // .emit( eventName* [, args... ] )

  emit(eventName: AnyEventNames, ...args: any[]): void;

  // .retain( eventName )

  retain(eventName: AnyEventNames): void;

}
