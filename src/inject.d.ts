import {Priority, CatchEmAllType} from './constants';

type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

type EventNames<T extends Object> = FunctionPropertyNames<T> | Array<FunctionPropertyNames<T>> | CatchEmAllType;

type AnyEventNames = string | Array<string> | CatchEmAllType;

export interface EventizeApi {

  // .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): void;
  on(eventName: AnyEventNames, priority: Priority, listenerFunc: (...args: any[]) => void): void;
  on<T extends Object>(eventName: EventNames<T>, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): void;
  on(eventName: AnyEventNames, listenerFunc: (...args: any[]) => void): void;

  // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): void;
  on<T extends Object>(eventName: EventNames<T>, listenerFuncName: FunctionPropertyNames<T>, listenerObject: T): void;

  // .on( eventName*, [ priority, ] listenerObject )

  on<T extends Object>(eventName: EventNames<T>, priority: Priority, listenerObject: T): void;
  on<T extends Object>(eventName: EventNames<T>, listenerObject: T): void;

  // .on( [ priority, ] listenerFunc [, listenerObject] ) => listenerObject.on( '*', listenerFunc )

  on<T extends Object>(priority: Priority, listenerFunc: (this: T, ...args: any[]) => void, listenerObject: T): void;
  on(priority: Priority, listenerFunc: (...args: any[]) => void): void;
  on<T extends Object>(listenerFunc: (this: T,...args: any[]) => void, listenerObject: T): void;
  on(listenerFunc: (...args: any[]) => void): void;

  // .on( [ priority, ] listenerObject ) => listenerObject.on( '*', listenerObject )

  on(priority: Priority, listenerObject: Object): void;
  on(listenerObject: Object): void;

}
