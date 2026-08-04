import {asEventized} from './asEventized';
import {emit, emitAsync} from './emit-api';
import {off, on as _on, once as _once, onceAsync} from './eventize-api';
import {isEventized} from './isEventized';
import {retain, retainClear, unretain} from './retain-api';
import type {
  AnyEventNames,
  DefaultEventMap,
  EventArgs,
  EventMap,
  EventizeApi,
  EventizedObject,
  EventizerFuncAPI,
  OnceAsyncOptions,
  SubscribeArgs,
  SubscribeImpl,
  UnsubscribeFunc,
} from './types';

// Internal: the class- and inject-side delegations call into the standalone
// API on a typed `this`, but with arbitrary runtime arg shapes. Two things
// stop a plain assignment. TypeScript will not spread a union of tuples into
// a fixed-arity call, so no overload set could accept `on(obj, ...args)`; and
// `object` is not assignable to `EventizedObject`, whose brand slots `{}` does
// not carry. `SubscribeImpl` is the shape that answers both, and it is
// exported so consumers writing the same wrapper do not have to rediscover it.
const on = _on as SubscribeImpl;
const once = _once as SubscribeImpl;
const offLoose = off as (
  obj: unknown,
  listener?: unknown,
  listenerObject?: unknown,
) => void;
const emitLoose = emit as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => void;
const emitAsyncLoose = emitAsync as (
  obj: object,
  eventNames: AnyEventNames,
  ...args: EventArgs
) => Promise<any[] | undefined>;
const onceAsyncLoose = onceAsync as <ReturnType = void>(
  obj: object,
  eventNames: AnyEventNames,
  options?: OnceAsyncOptions,
) => Promise<ReturnType>;
const retainLoose = retain as (obj: object, eventNames: AnyEventNames) => void;
const retainClearLoose = retainClear as (
  obj: object,
  eventNames: AnyEventNames,
) => void;
const unretainLoose = unretain as (
  obj: object,
  eventNames: AnyEventNames,
) => void;

// The nine members, described once (ARCH-004). Both `eventize.inject()` below
// and the `Eventize.prototype` installation further down build their
// descriptors from this one object instead of each spelling the same nine
// names out — `EventizeApi` in types.ts is the only other place the list is
// allowed to stand. The bodies read `this` rather than closing over an
// object, which is what lets `inject()` reuse them via `fn.bind(obj)` while
// the class surface uses them unbound, one per prototype method.
const eventizeMethods = {
  on(this: object, ...args: SubscribeArgs): UnsubscribeFunc {
    return on(this, ...args);
  },
  once(this: object, ...args: SubscribeArgs): UnsubscribeFunc {
    return once(this, ...args);
  },
  onceAsync<ReturnType = void>(
    this: object,
    eventNames: AnyEventNames,
    options?: OnceAsyncOptions,
  ): Promise<ReturnType> {
    return onceAsyncLoose<ReturnType>(this, eventNames, options);
  },
  off(this: object, listener?: unknown, listenerObject?: unknown): void {
    offLoose(this, listener, listenerObject);
  },
  emit(this: object, eventNames: AnyEventNames, ...args: EventArgs): void {
    emitLoose(this, eventNames, ...args);
  },
  emitAsync(
    this: object,
    eventNames: AnyEventNames,
    ...args: EventArgs
  ): Promise<any[] | undefined> {
    return emitAsyncLoose(this, eventNames, ...args);
  },
  retain(this: object, eventNames: AnyEventNames): void {
    retainLoose(this, eventNames);
  },
  retainClear(this: object, eventNames: AnyEventNames): void {
    retainClearLoose(this, eventNames);
  },
  unretain(this: object, eventNames: AnyEventNames): void {
    unretainLoose(this, eventNames);
  },
};

/**
 * Prepares an object for the standalone `on`/`once`/`emit`/… functions and
 * returns it, typed as an emitter. `eventize.inject(obj)` does the same but
 * also attaches the whole API as methods on `obj` itself; `eventize.is` is
 * `isEventized`.
 *
 * `eventize(obj)` alone does not add `obj.on`/`obj.emit`/… — call
 * `eventize.inject(obj)` (or extend `Eventize`) if the object needs to call
 * itself. The target must be extensible: a frozen, sealed or
 * non-extensible object throws a `TypeError`; freezing it after eventizing
 * it is fine.
 */
export const eventize: EventizerFuncAPI = (() => {
  const e = <
    TEvents extends EventMap = DefaultEventMap,
    T extends object = object,
  >(
    obj: T = {} as T,
  ): T & EventizedObject<TEvents> =>
    asEventized(obj) as T & EventizedObject<TEvents>;

  e.inject = <
    TEvents extends EventMap = DefaultEventMap,
    T extends object = object,
  >(
    obj: T = {} as T,
  ): T & EventizeApi<TEvents> => {
    obj = asEventized(obj);

    // Object.defineProperties(), not Object.assign() — same descriptor, same
    // reason, see the comment on the class surface below. `fn.bind(obj)`
    // costs the same nine function objects the nine hand-written closures
    // used to, and keeps `obj` destructurable exactly as before — pinned by
    // "all nine descriptors match the class prototype shape" in
    // api-surfaces.spec.ts, which now guards a derivation instead of a
    // second copy of the member list.
    Object.defineProperties(
      obj,
      Object.fromEntries(
        Object.entries(eventizeMethods).map(([name, fn]) => [
          name,
          {
            value: fn.bind(obj),
            writable: true,
            enumerable: false,
            configurable: true,
          },
        ]),
      ),
    );

    return obj as T & EventizeApi<TEvents>;
  };

  e.is = isEventized;

  return e;
})();

export interface Eventize<
  TEvents extends EventMap = DefaultEventMap,
> extends EventizeApi<TEvents> {}

// The class declares no members of its own, and that is the whole point. A
// method in the class body wins over the same name inherited through the
// merged interface, so `on(...args: SubscribeArgs)` used to replace
// `SubscribeFunc<TEvents>` outright — the class surface accepted every wrong
// event name and inferred every listener parameter as `any`, while
// `eventize.inject()` did not. Installing the implementations on the prototype
// leaves the merged interface as the single type source, so the class inherits
// whatever the other two surfaces get.
//
// `Object.defineProperties`, not `Object.assign`: class methods are
// non-enumerable, and an enumerable prototype method shows up in every
// `for…in` over an instance. The descriptors below reproduce exactly what
// `class { on() {} }` produced.
//
// The rule below guards against an interface promising members that have no
// runtime implementation. The implementations are installed on the prototype
// below, so every member of `EventizeApi` is there — the merge is what gives
// them their public signatures.
/**
 * Base class that gives every instance the full `on`/`once`/`emit`/…
 * method surface, equivalent to calling `eventize.inject(this)` in the
 * constructor.
 *
 * Each instance is its own emitter — unlike `eventize(SomeClass.prototype)`,
 * subclassing does not share subscriptions across instances. Prefer
 * composition (`eventize.inject(this)` in the constructor) when the class
 * already extends something else.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Eventize<TEvents extends EventMap = DefaultEventMap> {
  constructor() {
    eventize<TEvents>(this);
  }
}

Object.defineProperties(
  Eventize.prototype,
  Object.fromEntries(
    Object.entries(eventizeMethods).map(([name, value]) => [
      name,
      {value, writable: true, enumerable: false, configurable: true},
    ]),
  ),
);
