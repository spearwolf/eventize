import type {NAMESPACE} from './constants';

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

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/**
 * One argument list for a listener serving several event names at once.
 *
 * `ArgsFor` distributes over a union of keys, so the multi-name form used to
 * build a listener type that was a *union of signatures* — and a function
 * declaring one parameter is not assignable to a signature taking none. The
 * documented common-listener pattern therefore failed to compile the moment
 * two of the listed events carried different tuples, with a diagnostic that
 * named only the last overload and never mentioned the event.
 *
 * Collapsing the union before the signature is built is what fixes it. When
 * every listed event carries the same tuple, that tuple survives unchanged and
 * the listener stays positionally typed. When they differ, positional
 * information genuinely does not exist for one function, so it degrades to the
 * union of all element types rather than to `any` or to an error.
 *
 * The `[U] extends [UnionToIntersection<U>]` test is the non-distributive way
 * to ask "is this one type or several"; written bare it would distribute and
 * always answer yes.
 */
type MergeArgs<U> = [U] extends [UnionToIntersection<U>]
  ? U
  : Array<U extends readonly any[] ? U[number] : never>;

/**
 * The argument list of a listener serving `K` — one event name or a union of
 * them. For a single name, or several that carry the same tuple, this *is*
 * that tuple and the listener stays positionally typed. For names whose tuples
 * differ it degrades to an array of every element type, because positional
 * information does not exist for one function serving two shapes.
 *
 * The collapsing rule and why the multi-name form needs it are in the
 * `MergeArgs` comment directly above.
 */
export type MultiArgsFor<T, K> = MergeArgs<ArgsFor<T, K>>;

declare const __TEventsBrand: unique symbol;
declare const __EventizeInternalsBrand: unique symbol;

/**
 * The marker slot, deliberately opaque. What actually sits here is the
 * `EventizeInternals` of `src/internals.ts` — the `EventStore` and the
 * `EventKeeper`. Declaring that shape inline made both classes, and through
 * the store the `EventListener` too, reachable from this exported type, so
 * tsup inlined all three into `lib/index.d.ts`. Nothing outside could use
 * them: the key is a non-exported `unique symbol`, so the slot answered
 * `TS7053` from a consumer's side either way. The boundary already held in
 * practice; now it holds in the types. Internal readers go through
 * `internalsOf()`.
 */
export interface EventizedObject<TEvents extends EventMap = DefaultEventMap> {
  [NAMESPACE]: {readonly [__EventizeInternalsBrand]: true};
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

/**
 * True for the permissive default map — the same question `NonTypedEmitter`
 * asks, phrased about the map rather than about the emitter.
 *
 * Not exported: this and the two guards below are the mechanism that closes an
 * overload, not vocabulary a consumer has any reason to write. Each is shorter
 * spelled out than imported — `true` / `false` here, `OnEventNames` or `never`
 * for `LooseNames`, `AnyEventNames` or `never` for `LooseEmitNames`. Those last
 * two are not interchangeable, which is the reason to spell them rather than
 * name a guard: `OnEventNames` also admits `[name, priority]` tuples, and the
 * emit family has no notion of a priority. tsup inlines all three into the
 * declarations unexported, the way it already does with `MergeArgs`.
 */
type IsLooseMap<T> = string extends EventKeysOf<T> ? true : false;

/**
 * Closes a loose overload for a typed map by making its event-name slot
 * unmatchable, the way `NonTypedEmitter` closes one by making `obj` `never`.
 *
 * The method surfaces have no `obj` parameter, so `NonTypedEmitter` cannot
 * reach them — up to v5.1.0 that is why `eventize.inject<MyEvents>()` and
 * `class Eventize<MyEvents>` accepted every wrong event name while the
 * standalone functions rejected it. A consumer who wants a mostly-typed map
 * plus dynamic names declares an index signature (`[key: string]: any[]`),
 * which makes `IsLooseMap` true again and reopens everything.
 */
type LooseNames<T> = IsLooseMap<T> extends true ? OnEventNames : never;
/**
 * `LooseNames` for the members that take no priority, and therefore no
 * `[name, priority]` tuples either: `onceAsync`, `emit`, `emitAsync`,
 * `retain`, `retainClear` and `unretain`. The priority is what decides which
 * of the two a member gets — a list of member names goes stale the moment the
 * interface grows one, which is how this one came to name three of six.
 */
type LooseEmitNames<T> = IsLooseMap<T> extends true ? AnyEventNames : never;

export type ListenerObjectType = object | null | undefined;

/**
 * The *listener* slot, as opposed to the trailing listener-object slot above.
 * Rejects the two values that only ever reach it by mistake: an array, which
 * is a mis-typed event-name list, and `null` / `undefined`, which is a lookup
 * that missed. `_subscribeTo()` throws for all three.
 *
 * A function is excluded from this *slot*, not from the listener *role*: it is
 * a perfectly good listener, and the function arms take it. What it must not do
 * is match an arm that means "an object listener, specifically" — the runtime
 * tags a function as a function listener, so a function reaching an object arm
 * is decoded as something the arm never described, bypassing whatever that arm
 * checks. Hence the `L extends Function ? never` below.
 *
 * The generic is load-bearing: a tuple element cannot carry a conditional over
 * its own argument, so this can only be applied on an overload parameter. The
 * arms below therefore narrow to `object`, which is enough to reject `null`
 * and `undefined`, and the overloads add the array test on top.
 */
export type ListenerObjectSlot<L> = L extends readonly any[]
  ? never
  : L extends Function
    ? never
    : L & object;

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

/**
 * What `on()` and `once()` hand back: a function that releases the
 * subscription, and nothing else.
 *
 * It used to carry the underlying `EventListener` as `.listener` (single-name
 * forms) or `.listeners` (array form). Those are gone — they exposed an
 * internal type no consumer could construct, subclass or `instanceof`, and the
 * union that declared them made both fields unreadable anyway, because
 * TypeScript could never tell the two arms apart. The one thing they were good
 * for, `off(ε, unsub.listener)`, is what calling the handle already does.
 */
export type UnsubscribeFunc = () => void;

/**
 * Options for `onceAsync()`. Passing a `signal` gives the caller a way to
 * cancel a subscription that may never fire — without one, an event that
 * never arrives pins the listener, the resolve closure and the caller's
 * await continuation to the emitter for its whole lifetime.
 */
export type OnceAsyncOptions = {
  signal?: AbortSignal;
};

// The arms below are grouped by the branch of `_subscribeTo()` that decodes
// them, not by how the docs list the call forms. That is the whole point: the
// decoding is a chain of arity and `typeof` tests, and until these names
// existed the mapping from branch to shape lived only in comments on both
// sides. Renaming or regrouping an arm means editing the matching comment in
// `src/subscribeTo.ts` in the same commit — see AGENTS.md, "`subscribeTo` and
// `types.ts` move in lockstep".

/** Branch C1 — `args[0]` is an event name or a list of them, no priority. */
export type NamedFuncArgs = [
  eventNames: OnEventNames,
  listener: ListenerFuncType,
  listenerObject?: ListenerObjectType,
];
export type NamedMethodArgs = [
  eventNames: OnEventNames,
  methodName: EventName,
  listenerObject: ListenerObjectType,
];
export type NamedObjectArgs = [
  eventNames: OnEventNames,
  listenerObject: object,
  listenerContext?: ListenerObjectType,
];

/** Branch B — `args[1]` is a number, so it is the priority. */
export type NamedPriorityFuncArgs = [
  eventNames: OnEventNames,
  priority: number,
  listener: ListenerFuncType,
  listenerObject?: ListenerObjectType,
];
export type NamedPriorityMethodArgs = [
  eventNames: OnEventNames,
  priority: number,
  methodName: EventName,
  listenerObject: ListenerObjectType,
];
export type NamedPriorityObjectArgs = [
  eventNames: OnEventNames,
  priority: number,
  listenerObject: object,
  listenerContext?: ListenerObjectType,
];

/** Branch C2 — `args[0]` is the listener itself; the event name is `'*'`. */
export type CatchAllFuncArgs = [
  listener: ListenerFuncType,
  listenerObject?: ListenerObjectType,
];
export type CatchAllObjectArgs = [
  listenerObject: object,
  listenerContext?: ListenerObjectType,
];

/** Branch A — `args[0]` is a number and the call has two or three arguments. */
export type CatchAllPriorityFuncArgs = [
  priority: number,
  listener: ListenerFuncType,
  listenerObject?: ListenerObjectType,
];
export type CatchAllPriorityMethodArgs = [
  priority: number,
  methodName: EventName,
  listenerObject: ListenerObjectType,
];
export type CatchAllPriorityObjectArgs = [
  priority: number,
  listenerObject: object,
  listenerContext?: ListenerObjectType,
];

export type SubscribeArgs =
  | NamedFuncArgs
  | NamedMethodArgs
  | NamedObjectArgs
  | NamedPriorityFuncArgs
  | NamedPriorityMethodArgs
  | NamedPriorityObjectArgs
  | CatchAllFuncArgs
  | CatchAllObjectArgs
  | CatchAllPriorityFuncArgs
  | CatchAllPriorityMethodArgs
  | CatchAllPriorityObjectArgs;

/**
 * The signature `on()` and `once()` have as an implementation, exported so a
 * consumer can build a forwarding wrapper without inventing the cast this
 * package makes for itself in `src/eventize.ts`.
 *
 * It exists because TypeScript refuses to spread a union of tuples into a
 * fixed-arity call — no overload set, however exactly tuned, accepts
 * `on(target, ...args)` for `args: SubscribeArgs`. A rest parameter does, and
 * that is the only difference between this type and the public one. It is not
 * a second API: it performs no narrowing, and a typed emitter passed through
 * it is checked by nothing.
 */
export type SubscribeImpl = (
  obj: object,
  ...args: SubscribeArgs
) => UnsubscribeFunc;

/**
 * Overloaded call signatures for `on()` / `once()`.
 *
 * Ordered specific → generic so TypeScript picks the most precise match first:
 *   1a. typed listener function for a known (or symbol) event key
 *   1c. typed array of event keys, optionally with per-event priorities
 *   2t. method-name and object forms with a checked event name
 *   1b. typed listener-object (method names = event names)
 *   1.  listener function (with/without priority, with/without listenerObject)
 *   2.  listener method name on a listener object
 *   3.  listener object alone
 *   4.  catch-all (no event name)
 *
 * The event-name slot of every loose arm is `LooseNames<TEvents>`, which is
 * `never` for a typed map. That is `NonTypedEmitter`'s job moved one slot over:
 * this interface types a *method*, so there is no `obj` parameter to close.
 */
export interface SubscribeFunc<TEvents extends EventMap = DefaultEventMap> {
  // (1a) typed function listener for a known event key (or any symbol)
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    priority: number,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;
  // The same two with the trailing context object. It is the fourth slot of
  // the dedup tuple and the key `off(ε, fn, ctx)` removes by, so a typed map
  // losing the spelling loses the narrow removal with it. The listener stays
  // checked against the event; only the context is loose, the way the
  // listener-object arms below leave everything after the name loose.
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    listener: ListenerFor<TEvents, K>,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    priority: number,
    listener: ListenerFor<TEvents, K>,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;

  // (1c) typed array of event names, per-event priorities allowed
  <K extends EventKeysOf<TEvents>>(
    eventNames: Array<K | [K, number]>,
    listener: (...args: MultiArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents>>(
    eventNames: Array<K | [K, number]>,
    priority: number,
    listener: (...args: MultiArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;

  // (2t) the method-name and object forms keep the *name* checked and leave
  //      everything after it loose — the method is resolved at dispatch and is
  //      not required to exist, which is what late binding means.
  <K extends EventKeysOf<TEvents>>(
    eventNames: K | K[],
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents>>(
    eventNames: K | K[],
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents>, L>(
    eventNames: K | K[],
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  <K extends EventKeysOf<TEvents>, L>(
    eventNames: K | K[],
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;

  // (1b) typed listener-object (method names = event names)
  (listenerObject: EventListenerMethods<TEvents>): UnsubscribeFunc;

  // (1)-(3) loose event-name forms — unmatchable once the map is typed
  (
    eventNames: LooseNames<TEvents>,
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: LooseNames<TEvents>,
    priority: number,
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: LooseNames<TEvents>,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    eventNames: LooseNames<TEvents>,
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <L>(
    eventNames: LooseNames<TEvents>,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  <L>(
    eventNames: LooseNames<TEvents>,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;

  // (4) catch-all — no event name, so there is no typo to guard against, and
  //     these stay open for a typed map too.
  (
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    priority: number,
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  (
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <L>(
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  <L>(
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
}

/**
 * Overloaded call signatures for the *standalone* `on()` / `once()` — the
 * mirror of `SubscribeFunc` with the emitter moved into the first slot.
 *
 * Ordered specific → generic, and the order is load-bearing: TypeScript binds
 * a call to the first signature that matches, so moving an arm changes which
 * one wins. The groups are the same ones `SubscribeFunc` carries above.
 *
 * 1a/1b/1c, 2t and 4t are the typed forms that bind when an explicit
 * event-map generic is in scope. The fallback overloads (1)–(4) carry a
 * generic `T extends object` whose `obj` parameter is `NonTypedEmitter<T>` —
 * that conditional resolves to `never` for typed emitters, forcing them
 * through the typed overloads (so wrong event names fail to compile) while
 * still accepting plain objects, arbitrary `object` references, and untyped
 * emitters (where the event map is the permissive default).
 *
 * Because the guard sits on `obj` rather than on an event-name slot, closing
 * the loose set for a typed emitter closes *all* of it — including forms with
 * no event name in them, which have no typo to guard against. The 2t and 4t
 * groups are what puts those back, and they are mirrors of the same two groups
 * in `SubscribeFunc`: what one says the other says. Diverge here and the three
 * API surfaces start disagreeing at a new place.
 *
 * `on()` and `once()` are annotated with this, not asserted into it, and it
 * costs nothing to keep it that way — see the comment at the two declarations
 * in `src/eventize-api.ts` for what the annotation buys and what an `as` would
 * quietly stop checking. Naming the set is therefore free, and the set is
 * written once. It used to stand twice, 230 lines each, mirrored by nothing but
 * this comment's predecessor asking nicely.
 *
 * Not to be confused with `SubscribeImpl`, which widens the same forms back to
 * a rest parameter. That one genuinely needs an assertion, and the difference
 * between the two is documented where each is used.
 */
export interface StandaloneSubscribeFunc {
  // (1a) typed listener function for a known event key (or any symbol)
  <TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
    obj: EventizedObject<TEvents>,
    eventName: K,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
    obj: EventizedObject<TEvents>,
    eventName: K,
    priority: number,
    listener: ListenerFor<TEvents, K>,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
    obj: EventizedObject<TEvents>,
    eventName: K,
    listener: ListenerFor<TEvents, K>,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
    obj: EventizedObject<TEvents>,
    eventName: K,
    priority: number,
    listener: ListenerFor<TEvents, K>,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  // (1c) typed array of event names — common-listener form. Elements may carry
  // their own priority as a [name, priority] tuple, mixed freely with bare names.
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
    obj: EventizedObject<TEvents>,
    eventNames: Array<K | [K, number]>,
    listener: (...args: MultiArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
    obj: EventizedObject<TEvents>,
    eventNames: Array<K | [K, number]>,
    priority: number,
    listener: (...args: MultiArgsFor<TEvents, K>) => void,
  ): UnsubscribeFunc;
  // (2t) the method-name and listener-object forms with a checked event name.
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
    obj: EventizedObject<TEvents>,
    eventNames: K | K[],
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>>(
    obj: EventizedObject<TEvents>,
    eventNames: K | K[],
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>, L>(
    obj: EventizedObject<TEvents>,
    eventNames: K | K[],
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, K extends EventKeysOf<TEvents>, L>(
    obj: EventizedObject<TEvents>,
    eventNames: K | K[],
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  // (1b) typed listener-object (method names = event names)
  <TEvents extends EventMap>(
    obj: EventizedObject<TEvents>,
    listenerObject: EventListenerMethods<TEvents>,
  ): UnsubscribeFunc;
  // (4t) the catch-all forms for a typed emitter — the mirror of the (4) group
  // in `SubscribeFunc`, which carries no guard because a call with no event name
  // has no typo to guard against. The one arm deliberately not mirrored is the
  // bare two-argument `on(ε, listenerObject)`: (1b) above owns it and checks the
  // method names against the map, which is the one place the standalone spelling
  // is stricter than `ε.on()` and stays that way.
  <TEvents extends EventMap>(
    obj: EventizedObject<TEvents>,
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap>(
    obj: EventizedObject<TEvents>,
    priority: number,
    listener: ListenerFuncType,
    listenerObject?: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap>(
    obj: EventizedObject<TEvents>,
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, L>(
    obj: EventizedObject<TEvents>,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext: ListenerObjectType,
  ): UnsubscribeFunc;
  <TEvents extends EventMap, L>(
    obj: EventizedObject<TEvents>,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext?: ListenerObjectType,
  ): UnsubscribeFunc;
  // (1) listener function with event name(s)
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    listener: ListenerFuncType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    priority: number,
    listener: ListenerFuncType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    priority: number,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  // (2) listener method name on listener object
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  // The catch-all sibling of the method-name form. Reachable at runtime only
  // with a leading priority — without one, `on(ε, 'handler', obj)` reads the
  // string as an event name. The explicit spelling `on(ε, '*', 'handler', obj)`
  // is the priority-free equivalent and always compiled.
  <T extends object>(
    obj: NonTypedEmitter<T>,
    priority: number,
    methodName: EventName,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  // (3) listener object alone
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    listenerObject: ListenerObjectSlot<L>,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    eventNames: OnEventNames,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    listenerObject: ListenerObjectSlot<L>,
    listenerContext: ListenerObjectType,
  ): UnsubscribeFunc;
  // (4) catch-all (no event name)
  <T extends object>(
    obj: NonTypedEmitter<T>,
    listener: ListenerFuncType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    priority: number,
    listener: ListenerFuncType,
  ): UnsubscribeFunc;
  <T extends object>(
    obj: NonTypedEmitter<T>,
    priority: number,
    listener: ListenerFuncType,
    listenerObject: ListenerObjectType,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    listenerObject: ListenerObjectSlot<L>,
  ): UnsubscribeFunc;
  <T extends object, L>(
    obj: NonTypedEmitter<T>,
    priority: number,
    listenerObject: ListenerObjectSlot<L>,
  ): UnsubscribeFunc;
}

export interface EventizeApi<
  TEvents extends EventMap = DefaultEventMap,
> extends EventizedObject<TEvents> {
  on: SubscribeFunc<TEvents>;
  once: SubscribeFunc<TEvents>;

  // Every loose second overload below keeps its place and takes the guard on
  // the event-name slot. Dropping it instead would look equivalent — with the
  // default map `EventKeysOf` is already `string | symbol` and `ArgsFor` is
  // already `any[]` — and it covers every *literal* call, but not a value that
  // already carries `AnyEventNames`, which is how a forwarding wrapper types
  // its own parameter: `EventName | EventName[]` matches neither `K` nor `K[]`.

  // typed onceAsync — return type matches the first arg of the tuple for K
  onceAsync<K extends EventKeysOf<TEvents>>(
    eventName: K,
    options?: OnceAsyncOptions,
  ): Promise<TEvents[K] extends [infer A, ...any[]] ? A : void>;
  onceAsync<ReturnType = void>(
    eventNames: LooseEmitNames<TEvents>,
    options?: OnceAsyncOptions,
  ): Promise<ReturnType>;

  off(listener?: unknown, listenerObject?: unknown): void;

  // typed emit — strict event name and argument tuple; symbol always allowed
  emit<K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    ...args: ArgsFor<TEvents, K>
  ): void;
  emit<K extends EventKeysOf<TEvents>>(
    eventNames: K[],
    ...args: ArgsFor<TEvents, K>
  ): void;
  emit(eventNames: LooseEmitNames<TEvents>, ...args: EventArgs): void;

  emitAsync<K extends EventKeysOf<TEvents> | symbol>(
    eventName: K,
    ...args: ArgsFor<TEvents, K>
  ): Promise<any[] | undefined>;
  emitAsync<K extends EventKeysOf<TEvents>>(
    eventNames: K[],
    ...args: ArgsFor<TEvents, K>
  ): Promise<any[] | undefined>;
  emitAsync(
    eventNames: LooseEmitNames<TEvents>,
    ...args: EventArgs
  ): Promise<any[] | undefined>;

  retain(eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>): void;
  retain(eventNames: LooseEmitNames<TEvents>): void;

  retainClear(
    eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
  ): void;
  retainClear(eventNames: LooseEmitNames<TEvents>): void;

  unretain(
    eventNames: EventKeysOf<TEvents> | Array<EventKeysOf<TEvents>>,
  ): void;
  unretain(eventNames: LooseEmitNames<TEvents>): void;
}

export interface EventizerFunc {
  <TEvents extends EventMap = DefaultEventMap, T extends object = object>(
    obj?: T,
  ): T & EventizedObject<TEvents>;
}

/**
 * The `isEventized()` type guard. Two signatures, and the order matters.
 *
 * The first is a no-op narrowing that exists purely to preserve what the
 * caller already knew: narrowing an `EventizedObject<MyEvents>` with the
 * second signature intersects it with `EventizedObject<DefaultEventMap>`,
 * whose `keyof` includes `string`, which makes `NonTypedEmitter` resolve to
 * the emitter instead of `never` and opens every loose overload. The guard
 * then silently disabled the narrowing it was supposed to guard — a typed
 * `emit(ε, 'nope')` was an error outside the `if` and legal inside it.
 *
 * The guard still never throws and still learns nothing about protocols; that
 * question belongs to `getEventizeProtocol()`.
 */
export interface EventizeGuard {
  <TEvents extends EventMap>(
    obj: EventizedObject<TEvents>,
  ): obj is EventizedObject<TEvents>;
  (obj: unknown): obj is EventizedObject;
}

export interface EventizePriority {
  Max: number;
  Critical: number;
  High: number;
  Medium: number;
  Normal: number;
  Low: number;
  Min: number;
  /** @deprecated Use `Critical`. Slated for removal in a future major. */
  AAA: number;
  /** @deprecated Use `High`. Slated for removal in a future major. */
  BB: number;
  /** @deprecated Use `Medium`. Slated for removal in a future major. */
  C: number;
  /** @deprecated Use `Normal`. Slated for removal in a future major. */
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
