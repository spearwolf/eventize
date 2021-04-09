import {Priority, CatchEmAllType} from './constants';
import {EventListener} from './EventListener';

export type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

export type EventNames<T extends Object> = FunctionPropertyNames<T> | Array<FunctionPropertyNames<T>> | CatchEmAllType;

export type AnyEventNames = string | Array<string> | CatchEmAllType;

export type UnsubscribeFunc = () => void;

export interface EventizeApi {

  // .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  on(eventName: AnyEventNames, priority: Priority, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;
  on<T extends Object>(eventName: EventNames<T>, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  on(eventName: AnyEventNames, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  once(eventName: AnyEventNames, priority: Priority, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;
  once<T extends Object>(eventName: EventNames<T>, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  once(eventName: AnyEventNames, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;

  // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): UnsubscribeFunc;
  on<T extends Object>(eventName: EventNames<T>, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): UnsubscribeFunc;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): UnsubscribeFunc;
  once<T extends Object>(eventName: EventNames<T>, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): UnsubscribeFunc;

  // .on( eventName*, [ priority, ] listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerObject: T): UnsubscribeFunc;
  on<T extends Object>(eventName: EventNames<T>, listenerObject: T): UnsubscribeFunc;

  once<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerObject: T): UnsubscribeFunc;
  once<T extends Object>(eventName: EventNames<T>, listenerObject: T): UnsubscribeFunc;

  // .on( [ priority, ] listenerFunc [, listenerObject] ) => listenerObject.on( '*', listenerFunc )

  on<T extends Object>(priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  on(priority: Priority, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;
  on<T extends Object>(listenerFunc: (this: T,...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  on(listenerFunc: (...args: any[]) => void): UnsubscribeFunc;

  once<T extends Object>(priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  once(priority: Priority, listenerFunc: (...args: any[]) => void): UnsubscribeFunc;
  once<T extends Object>(listenerFunc: (this: T,...args: any[]) => void, listenerObject: T): UnsubscribeFunc;
  once(listenerFunc: (...args: any[]) => void): UnsubscribeFunc;

  // .on( [ priority, ] listenerObject ) => listenerObject.on( '*', listenerObject )

  on(priority: Priority, listenerObject: Object): UnsubscribeFunc;
  on(listenerObject: Object): UnsubscribeFunc;

  once(priority: Priority, listenerObject: Object): UnsubscribeFunc;
  once(listenerObject: Object): UnsubscribeFunc;

  // .off( listener?, listenerObject? )

  off(listener?: any, listenerObject?: Object): void;

  // .emit( eventName* [, args... ] )

  emit(eventName: AnyEventNames, ...args: any[]): void;

  // .retain( eventName )

  retain(eventName: AnyEventNames): void;

}
