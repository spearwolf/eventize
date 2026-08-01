import {LOG_NAMESPACE, EVENT_CATCH_EM_ALL} from './constants';
import type {EventName} from './types';

export const isCatchEmAll = (eventName: unknown): eventName is string =>
  eventName === EVENT_CATCH_EM_ALL;

export const isEventName = (eventName: unknown): eventName is EventName => {
  switch (typeof eventName) {
    case 'string':
    case 'symbol':
      return true;
    default:
      return false;
  }
};

const objectPrototype = Object.prototype as Record<EventName, unknown>;

/**
 * The member an event name resolves to on a dispatch target — with one range of
 * names taken out: anything identical to the same-named member of
 * `Object.prototype`. Every object inherits `toString`, `valueOf`,
 * `constructor`, `hasOwnProperty` and friends (plus V8's `__defineGetter__`
 * family), so an event named after one of them used to find a callable member
 * on *any* listener object and on *any* duck-typed target: it dispatched to
 * code nobody subscribed, fed `'[object Object]'` into the `emitAsync()`
 * aggregation and consumed a `once()` while no user method ever ran. This is
 * `isObjListener()`'s reasoning about primitives, one prototype up.
 *
 * Function identity is the whole test, which is what keeps it narrow: a target
 * that defines its own method under that name — own property or anywhere on its
 * prototype chain — resolves as normal, and a `Object.create(null)` target has
 * nothing to subtract. The literal edge follows from the same rule rather than
 * contradicting it: aliasing the inherited function under its own name
 * (`{toString: Object.prototype.toString}`) is skipped too, because there is no
 * way to tell that apart from inheriting it, and no reason to want it.
 * Callability stays the caller's question; the dispatch paths both decide it
 * with their own `typeof === 'function'` test.
 *
 * Deliberately not applied to the method-name form `on(ε, 'evt', 'toString',
 * obj)`: there the inherited hit is the caller's own choice.
 */
export const dispatchableMember = (
  target: Record<EventName, unknown>,
  eventName: EventName,
): unknown => {
  const member = target[eventName];
  // The `undefined` shortcut is the common case — an event name matches no
  // member at all — and it skips a second property read on the hottest path in
  // the library. Behaviour is identical: `undefined` was never callable, so
  // whether it came from the target or from Object.prototype changes nothing.
  if (member === undefined) return undefined;
  return member === objectPrototype[eventName] ? undefined : member;
};

export const hasConsole = typeof console !== 'undefined';

// `console.warn` is non-optional in lib.dom, so a truthiness test on it reads
// as always-true to the compiler (TS2774). The typeof form keeps the same
// runtime guard for hosts whose console is narrower than the type claims.
export const warn = hasConsole
  ? console[typeof console.warn === 'function' ? 'warn' : 'log'].bind(
      console,
      LOG_NAMESPACE,
    )
  : () => {};

type PropertyKey = string | symbol;
// Handed straight to Object.defineProperty and never inspected, so `unknown`
// costs nothing and stops the alias from being an `any` in disguise.
type PropertyValue = unknown;

/**
 * Defines a property that is invisible, unwritable and — since v6.0.0 —
 * unremovable: `enumerable`, `writable` and `configurable` all stay at their
 * `false` default.
 *
 * `configurable: true` used to make `delete ε[Symbol.for('eventize')]` legal,
 * and the fallout was entirely silent: the object read as not eventized
 * afterwards while the store and the keeper went on holding listeners and
 * retained values nobody could reach any more, and the next `on()` built a
 * second, empty set without a word. The name said read-only and meant the
 * value, not the existence of the property. Now it means both.
 *
 * `asEventized()` is the only caller and never removes the slot again.
 */
export const defineSealedHiddenProperty = <T extends object>(
  obj: T,
  name: PropertyKey,
  value: PropertyValue,
): T => {
  Object.defineProperty(obj, name, {
    value,
    configurable: false,
  });
  return obj;
};
