import {LOG_NAMESPACE, EVENT_CATCH_EM_ALL} from './constants';
import type {EventArgs, EventName} from './types';

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
 * `Function.prototype`'s own members, snapshotted by name at load time rather
 * than read off the live prototype the way `Object.prototype`'s are. Two of
 * them — `arguments` and `caller` — are poisoned accessors: reading either off
 * `Function.prototype` itself, or off any strict-mode function, throws a
 * `TypeError` (a sloppy-mode function answers `null` instead, so the throw is
 * not universal — the unreadability of the prototype's own copy is). The
 * boundary below is keyed by name for *every* target, not only for functions,
 * so a live read would blow up inside the dispatch of a plain object carrying
 * an own `arguments` method — a legal handler name that dispatched long before
 * this level existed. A snapshot that skips whatever throws answers every other
 * name identically and answers those two with `undefined`, which never matches
 * a member that got as far as the comparison. `Reflect.ownKeys()` rather than
 * `getOwnPropertyNames()`, because `Symbol.hasInstance` is a member like the
 * rest and callable like the rest.
 *
 * A plain `{}` rather than `Object.create(null)`, and that is measured, not
 * cosmetic: a null-prototype object holds its properties in dictionary mode
 * (`%HasFastProperties` says so), which turns the second comparison into a
 * dictionary lookup. Resolving a target's own method, 3e7 times, one variant
 * per process: 0.71-0.75 ns before this level existed, 7.6-9.4 ns with the
 * null-prototype snapshot, 0.71-1.18 ns with this one, and 3.7-4.2 ns with a
 * `Map`. In situ — a listener-object `emit()` doing nothing else, 1e7 times —
 * the same three came out at 24.7-25.1 ns, 30.4-31.5 ns and 24.5-25.5 ns per
 * dispatch: the dictionary form was a fifth of the whole dispatch, this one
 * disappears into the noise. The prototype the literal drags along cannot
 * change an answer, because a name it inherits from `Object.prototype` was
 * already subtracted one comparison earlier — the only names this object
 * decides are its own.
 *
 * Being a snapshot, it ages: a method hung on `Function.prototype` after this
 * module loaded is not subtracted and can become a handler, where the live
 * `Object.prototype` read one level up keeps up with such a change. Nobody
 * extends `Function.prototype` at runtime, and the trade buys both the poisoned
 * accessors and the numbers above.
 */
const functionPrototypeMembers = ((): Record<EventName, unknown> => {
  const snapshot: Record<EventName, unknown> = {};
  const proto = Function.prototype as unknown as Record<EventName, unknown>;
  for (const key of Reflect.ownKeys(Function.prototype)) {
    try {
      snapshot[key as EventName] = proto[key as EventName];
    } catch {
      // `arguments` / `caller`: unreadable here, therefore never comparable.
    }
  }
  return snapshot;
})();

/**
 * The member an event name resolves to on a dispatch target — with two ranges
 * of names taken out: anything identical to the same-named member of
 * `Object.prototype`, and anything identical to the same-named member of
 * `Function.prototype`. Every object inherits `toString`, `valueOf`,
 * `constructor`, `hasOwnProperty` and friends (plus V8's `__defineGetter__`
 * family), so an event named after one of them used to find a callable member
 * on *any* listener object and on *any* duck-typed target: it dispatched to
 * code nobody subscribed, fed `'[object Object]'` into the `emitAsync()`
 * aggregation and consumed a `once()` while no user method ever ran. This is
 * `isObjListener()`'s reasoning about primitives, one prototype up.
 *
 * The `Function.prototype` level is the same argument one level further out,
 * and it arrived *with* function targets in v6.0.0 (`isDuckTarget()`) rather
 * than after them, so it has no history of misdispatching to point at: every
 * function carries `call`, `apply`, `bind`, `toString` and `Symbol.hasInstance`,
 * all of them callable, and without this level an event name out of external
 * data would make a function target answer any of them — `emit(fn, 'bind', ctx)`
 * reinterpreting the caller's first argument as a `this` value, `emitAsync()`
 * aggregating the bound function as if a handler had returned it. The level is
 * keyed by name for every target rather than only for functions, which is
 * deliberate: a class or a function reaches the object dispatch paths as a
 * listener object too, and a second boundary that applied on one path but not
 * the other would be exactly the divergence AGENTS.md ("The two dispatch paths in `emit` move in
 * lockstep") forbids. Its one visible effect on a plain object is the same
 * aliasing edge the `Object.prototype` level already has: `{bind:
 * Function.prototype.bind}` is skipped, which up to v5.1.0 threw "Bind must be
 * called on a function" from inside the dispatch.
 *
 * Function identity is the whole test for every name but two (`constructor` and
 * `__proto__`, both below), which is what keeps it narrow: a target that defines
 * its own method under that name — own property or anywhere on its prototype
 * chain — resolves as normal, and a `Object.create(null)` target has nothing to
 * subtract. The literal edge follows from the same rule rather than
 * contradicting it: aliasing the inherited function under its own name
 * (`{toString: Object.prototype.toString}`) is skipped too, because there is no
 * way to tell that apart from inheriting it, and no reason to want it.
 * Callability stays the caller's question; the dispatch paths both decide it
 * with their own `typeof === 'function'` test.
 *
 * Deliberately not applied to the method-name form `on(ε, 'evt', 'toString',
 * obj)`: there the inherited hit is the caller's own choice.
 *
 * `constructor` is the one name where an own property does *not* win: it is
 * carved out unconditionally, ahead of the identity check, because identity
 * alone cannot answer it — a class instance's `target.constructor` is the
 * class itself, never identical to `Object.prototype.constructor`, so the
 * general rule let it through as dispatchable and `apply()` invoked the class
 * as a plain function. No handler named `constructor` is legitimate, own
 * property included, so the `undefined` here costs nothing real and is
 * unconditional rather than identity-checked.
 *
 * `__proto__` is carved out on the same terms, and it is the name that made the
 * second level necessary rather than sufficient. Neither level can subtract it:
 * `Object.prototype.__proto__` is `null`, and the accessor is not among
 * `Reflect.ownKeys(Function.prototype)` at all, because it belongs to
 * `Object.prototype`. On an object target that never mattered — the resolved
 * value is a prototype object, and an object is not callable. On a function
 * target it is the one inherited name that resolves to something callable:
 * `fn.__proto__` *is* `Function.prototype`. Measured on the intermediate build
 * that had function targets but not this carve-out: invoked as a handler it ran
 * as a silent no-op and swallowed the `.emit()` fallback with it, and on a
 * subclass — where it resolves to the superclass — it threw `Class constructor
 * Base cannot be invoked without 'new'` from inside the dispatch. Exactly the
 * `constructor` failure mode, reached by a name far likelier to arrive out of
 * external data. No legitimate handler is lost:
 * `{__proto__: fn}` in an object literal sets the prototype instead of defining
 * a property, so the name is barely spellable as a handler in the first place.
 *
 * Two names the `Function.prototype` level cannot answer, and does not need to:
 * `name` and `length` are own properties of every function, so the identity test
 * is not the thing deciding them — it happens to match for an anonymous
 * zero-arity function, whose `''` / `0` are `Function.prototype`'s own values,
 * and to miss for every other function. Either way the outcome is the same:
 * both hold a string or a number, never a function, so they fail the caller's
 * callability test one step later and an event named after either reaches the
 * `.emit()` fallback like any unanswered name. Nothing here has to distinguish
 * the two cases, which is why it doesn't try.
 *
 * The two poisoned accessors are the sharp edge instead:
 * reading `fn.arguments` or `fn.caller` throws for a strict-mode function, and
 * that read happens here, before anything can be subtracted — so those two
 * names surface a `TypeError` out of the dispatch rather than falling through.
 */
export const dispatchableMember = (
  target: Record<EventName, unknown>,
  eventName: EventName,
): unknown => {
  if (eventName === 'constructor' || eventName === '__proto__') {
    return undefined;
  }
  const member = target[eventName];
  // The `undefined` shortcut is the common case — an event name matches no
  // member at all — and it skips a second property read on the hottest path in
  // the library. Behaviour is identical: `undefined` was never callable, so
  // whether it came from the target or from Object.prototype changes nothing.
  if (member === undefined) return undefined;
  if (member === objectPrototype[eventName]) return undefined;
  // A resolved member pays two prototype lookups, not one, and that read is
  // the expensive half of this level — measured rather than argued: with the
  // snapshot in fast-properties form the pair sits at 0.71-1.18 ns against
  // 0.71-0.75 ns for the single lookup this line was added to, and a whole
  // listener-object dispatch does not move (see the snapshot's own comment for
  // the method and for what a null-prototype object cost instead, which was a
  // fifth of that dispatch). Ordering between the two levels is free — no name resolves
  // to the same value on both prototypes, `constructor` and `toString`
  // included — so `Object.prototype` goes first for being the level every
  // dispatch target on either path shares.
  return member === functionPrototypeMembers[eventName] ? undefined : member;
};

/**
 * Builds the argument list an `emit(eventName, ...args)` fallback call passes
 * on — the event name prepended to the original arguments. A pre-sized array
 * filled by index beats both `[eventName].concat(args)` and
 * `[eventName, ...args]`; measured roughly 9x and 5x respectively for a
 * single forwarded argument. Shared by the two `emit()` fallbacks
 * (`EventListener.ts`'s listener-object path, `eventize-api.ts`'s duck-typed
 * path) so the two dispatch paths keep building the same shape one way. One
 * difference from `concat`: a hole in `args` comes out as a real `undefined`
 * entry, harmless here since `args` is always a dense rest parameter at both
 * call sites.
 */
export const prependEventName = (
  eventName: EventName,
  args: EventArgs,
): EventArgs => {
  const out = new Array(args.length + 1);
  out[0] = eventName;
  for (let i = 0; i < args.length; ++i) {
    out[i + 1] = args[i];
  }
  return out;
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
