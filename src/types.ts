import type {EventKeeper} from './EventKeeper.js';
import type {EventStore} from './EventStore.js';
import type {NAMESPACE} from './constants.js';

export type EventName = string | symbol;
export type AnyEventNames = EventName | Array<EventName>;

/**
 * An event name bundled with the priority it should be subscribed at. Only
 * meaningful for `on()` / `once()` — `emit()` and `retain()` have no notion of
 * priority, which is why they keep taking `AnyEventNames`.
 */
export type EventNameWithPriority = [eventName: EventName, priority: number];

/**
 * The event-name argument of `on()` / `once()`: either a single name, or a list
 * whose elements are names, `[name, priority]` tuples, or any mix of the two. A
 * tuple's priority overrides the call-level priority for that one event.
 *
 * The mixed form is what `_subscribeTo()` has always implemented — it tests
 * `Array.isArray()` per element — but the previous type only allowed a list of
 * names *or* a list of tuples, so `[['foo', 100], 'bar']` needed a cast.
 */
export type OnEventNames = EventName | Array<EventName | EventNameWithPriority>;

export type EventArgs = Array<any>;

/**
 * Constraint type for user-supplied event maps. Intentionally as loose as
 * `object` so that a plain `interface MyEvents { data: [string, number] }`
 * satisfies it _without_ inheriting an index signature — that's what allows
 * `keyof MyEvents` to stay narrow (`'data'`) so that `emit(ε, 'wrong', …)`
 * fails to compile.
 *
 * Convention is still `{ [eventName]: arg-tuple }`; deviating from it (e.g.
 * non-array values) won't fail when declaring the map, but will produce a
 * type error at the `emit()` / `on()` call site.
 *
 * @example
 *   interface MyEvents {
 *     data: [payload: string, code: number];
 *     close: [];
 *   }
 *   const ε = eventize<MyEvents>();
 */

export type EventMap = object;

/**
 * The default (fully permissive) event map: any event name, any arguments.
 * Used so APIs without an explicit generic parameter behave exactly like v4 —
 * no type narrowing, full duck-typing.
 */
export type DefaultEventMap = Record<EventName, any[]>;

/**
 * Event keys of `T`, narrowed to `string | symbol`. Filters out the `number`
 * keys that would otherwise sneak in via the generic upper bound when the
 * constraint is `T extends object`.
 */
export type EventKeysOf<T> = Extract<keyof T, EventName>;

/**
 * Argument tuple for event `K` on event-map `T`. Falls back to `EventArgs`
 * (i.e. `any[]`) when `K` is not in `T` (e.g. user used a symbol event that
 * isn't in the typed map) or `T[K]` is not declared as an array.
 */
export type ArgsFor<T, K> = K extends keyof T
  ? T[K] extends any[]
    ? T[K]
    : EventArgs
  : EventArgs;

declare const __TEventsBrand: unique symbol;

export interface EventizedObject<TEvents extends EventMap = DefaultEventMap> {
  [NAMESPACE]: {
    keeper: EventKeeper;
    store: EventStore;
  };
  // Phantom field — never present at runtime. Exists only at the type level
  // so the generic parameter `TEvents` is preserved through TS structural
  // matching and so inference binds `TEvents` to the user-supplied event map
  // (rather than relaxing to `DefaultEventMap`). The function-typed brand
  // makes `TEvents` invariant: `EventizedObject<A>` and `EventizedObject<B>`
  // are not assignable to each other unless A and B match. The `__TEventsBrand`
  // symbol is not exported, so user code cannot access — or accidentally
  // satisfy — this slot; `asEventized()` casts the result into shape.
  readonly [__TEventsBrand]: (events: TEvents) => TEvents;
}

/**
 * Helper used by the loose/duck-typing API overloads. Resolves to `T` when
 * `T` is NOT a typed emitter (i.e. its event map is the fully permissive
 * `Record<EventName, any[]>`), and to `never` otherwise. The effect is that
 * a typed emitter (`eventize<MyEvents>()`, `Eventize<MyEvents>` instances,
 * etc.) cannot fall through to the loose overload — it must match the typed
 * overload, which means wrong event names / wrong argument tuples fail to
 * compile instead of being silently accepted.
 */
export type NonTypedEmitter<T> =
  T extends EventizedObject<infer M> ? (string extends keyof M ? T : never) : T;

export type ListenerType = unknown;
export type ListenerObjectType = object | null | undefined;
export type ListenerFuncType = (...args: EventArgs) => void;

/**
 * Listener function for a single event key. With the default event map this
 * collapses to `(...args: any[]) => void` (the v4 behavior).
 */
export type ListenerFor<TEvents, K> = (...args: ArgsFor<TEvents, K>) => void;

/**
 * A listener-object whose method names match the event keys of `TEvents`.
 * Each method gets typed argument lists. Extra members are allowed (duck-typing
 * still works), and `emit(eventName, ...args)` is recognized as the catch-all
 * fallback documented in `README.md`.
 */
export type EventListenerMethods<TEvents extends EventMap = DefaultEventMap> = {
  [K in EventKeysOf<TEvents>]?: (...args: ArgsFor<TEvents, K>) => void;
} & {
  emit?: (eventName: EventKeysOf<TEvents>, ...args: any[]) => void;
};

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
 *   1a. typed listener function for a known (or symbol) event key
 *   1c. typed array of event keys, optionally with per-event priorities
 *   1b. typed listener-object (method names = event names)
 *   1.  listener function (with/without priority, with/without listenerObject)
 *   2.  listener method name on a listener object
 *   3.  listener object alone
 *   4.  catch-all (no event name)
 */
export interface SubscribeFunc<TEvents extends EventMap = DefaultEventMap> {
  // (1a) typed listener function for a known event key (or any symbol)
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    priority: number,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;

  // (1c) typed array of event names — common-listener form. Elements may carry
  // their own priority as a [name, priority] tuple, mixed freely with names.
  <K extends EventKeysOf<TEvents>>(
    eventNames: Array<K | [K, number]>,
    listener: (...args: ArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents>>(
    eventNames: Array<K | [K, number]>,
    priority: number,
    listener: (...args: ArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;

  // (1b) typed listener-object (method names = event names)
  (listenerObject: EventListenerMethods<TEvents>): UnsubscribeFunc;

  // (1) listener function with event name(s) — loose
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

export interface EventizeApi<TEvents extends EventMap = DefaultEventMap>
  extends EventizedObject<TEvents> {
  on: SubscribeFunc<TEvents>;
  once: SubscribeFunc<TEvents>;

  // typed onceAsync — return type matches the first arg of the tuple for K
  onceAsync<K extends EventKeysOf<TEvents>>(
    eventName: K,
  ): Promise<TEvents[K] extends [infer A, ...any[]] ? A : void>;
  onceAsync<ReturnType = void>(eventNames: AnyEventNames): Promise<ReturnType>;

  off(listener?: unknown, listenerObject?: unknown): void;

  // typed emit — strict event name and argument tuple; symbol always allowed
  emit<K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    ...args: ArgsFor<TEvents, K>
  ): void;
  emit(eventNames: AnyEventNames, ...args: EventArgs): void;

  emitAsync<K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    ...args: ArgsFor<TEvents, K>
  ): Promise<any>;
  emitAsync(eventNames: AnyEventNames, ...args: EventArgs): Promise<any>;

  retain(eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>): void;
  retain(eventNames: AnyEventNames): void;

  retainClear(
    eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
  ): void;
  retainClear(eventNames: AnyEventNames): void;

  unretain(
    eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
  ): void;
  unretain(eventNames: AnyEventNames): void;
}

export interface EventizerFunc {
  <TEvents extends EventMap = DefaultEventMap, T extends object = object>(
    obj?: T,
  ): T & EventizedObject<TEvents>;
}

export interface EventizeGuard {
  (obj: unknown): obj is EventizedObject;
}

export interface EventizePriority {
  Max: number;
  Critical: number;
  High: number;
  Normal: number;
  Low: number;
  Min: number;
  // Legacy aliases
  AAA: number;
  BB: number;
  C: number;
  Default: number;
}

export interface EventizerFuncAPI extends EventizerFunc {
  is: EventizeGuard;
  inject: <
    TEvents extends EventMap = DefaultEventMap,
    T extends object = object,
  >(
    obj?: T,
  ) => T & EventizeApi<TEvents>;
}
