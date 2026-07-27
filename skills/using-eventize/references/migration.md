# eventize — migration notes

## v5 → v6: eleven breaking changes

Against the last released version, `v5.1.0`. Most are runtime changes on
signatures that don't change shape, so grep for the call patterns rather
than relying on the type checker to find affected sites. Two are type-only
(a wrong type binding fixed, a dead type export removed) and surface as
compile errors instead.

- **Bulk `off()` now clears retained state.** `off(ε)`, `off(ε, '*')`, and
  any array containing `'*'`, `null` or `undefined` (`off(ε, ['*', …])`,
  `off(ε, [null, …])`) used to empty only the listener registry, leaving
  retained values and retain policies intact. All of them now wipe the
  keeper too. Targeted forms — `off(ε, eventName)`, `off(ε, [names])`,
  `off(ε, eventName, listenerObject)` — are unchanged.
- **`once()` no longer deduplicates.** Two `once(ε, 'foo', listenerObject)`
  calls on the same object used to collapse into one listener that then
  fired on every subsequent emit and could not be released through its own
  handles. Each `once()` now gets its own listener: two registrations mean
  two firings, each releasing independently. `on()`'s reference-counted
  dedup is unaffected.
- **Unsubscribe handles are single-shot.** Calling one a second time used to
  decrement a shared reference count again, releasing a *sibling* handle's
  registration out from under it. A second call is now inert.
- **A method-name subscription with a missing listener object no-ops
  instead of throwing.** `on(ε, 'foo', 'handler', null)` used to throw the
  moment the event fired; it now silently does nothing until a real
  listener object is supplied.
- **`off(ε, <numeric listener id>)` no longer removes anything.** This was
  undocumented and untested — passing the internal listener's numeric id
  used to detach it outright, skipping the reference count every documented
  path honours. Use `unsub()`.
- **`UnsubscribeFunc.listener` / `.listeners` are gone (v6.3.0), and so is
  the `EventListener` type export.** The handle is `() => void`. The union
  that declared the two fields made either access a `TS2339` at every call
  site, so `off(ε, unsub.listener)` never compiled against the published
  declarations in the first place. Replace it with `unsub()` — same
  reference-counted path, same single-shot guard, no emitter needed in
  scope. Reads past it (`unsub.listener.id`, `.isRemoved`) were internals
  and have no replacement.
- **`export type ListenerType` is gone** — an alias for `unknown` nothing
  referenced. Replace an import with `unknown` directly.
- **An `EventListener` built directly with a `null`/`undefined` listener
  now dispatches to nothing instead of throwing.** Only reachable by
  constructing the class yourself, which the package does not export at
  all — neither as a value nor, since v6.3.0, as a type.
- **`on()` / `once()` throw on a listener they cannot dispatch to.** The
  slot used to be checked for truthiness only, so `on(ε, 'foo', 5)`
  registered a listener no `emit()` could ever reach — it counted towards
  `getSubscriptionCount(ε)` and needed an explicit `off()` to remove. The
  same call with `0` threw, because `0` is falsy. Only a function, a string,
  a symbol or a non-null object passes now. Grep for values forwarded into
  the listener position from config or from a wrapper's arguments; every
  documented spelling of `on()` is unaffected.
- **`on()` / `once()` throw on a `NaN` priority.** `NaN` is a `number`, so it
  passed as a priority and then made every comparison in the insertion sort
  false — the listener landed wherever the bucket size put it, silently. The
  check covers all four positions a priority can occupy, `[name, priority]`
  tuples included, and it rejects the whole call either way: a `NaN` in one
  tuple registers none of the names in that call, and a `NaN` at call level
  throws even when every tuple carries its own priority to override it —
  `on(ε, [['a', 5], ['b', 7]], NaN, fn)` used to subscribe both names at
  their tuple priorities. `Priority.Max` / `Priority.Min` (`±Infinity`) stay
  valid: the test is `Number.isNaN`, not a finiteness test. The realistic way
  in is arithmetic on unvalidated input — `on(ε, 'foo', Number(cfg.prio), fn)`
  — so validate before the call: `Number.isNaN(p) ? Priority.Normal : p`, and
  apply the same guard inside a tuple, which the call-level value does not
  cover.

Worked before/after snippets for the four runtime changes, plus how to
verify a migration with `getRetainedCount(ε)` / `getSubscriptionCount(ε)`,
live in
[`docs/lifecycle.md#migrating-from-v5`](../../../docs/lifecycle.md#migrating-from-v5)
rather than being duplicated here.

Two more runtime changes ride along in `v6.1.0`, both filed as **fixes**
rather than breaking changes — one stopped dispatching to code the subscriber
never wrote, the other made a call do the one thing its arguments ask for —
but a `v5.1.0` consumer meets both in the same upgrade and neither is visible
to the type checker:

- **An event name that only matches an inherited `Object.prototype` member
  dispatches to nothing.** `toString`, `toLocaleString`, `valueOf`,
  `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`
  and V8's `__defineGetter__` family used to resolve to the function every
  object inherits — on both dispatch paths. `emit(ε, 'toString')` called it on
  every listener-object subscribed to that name and on every wildcard
  listener-object, `emitAsync(ε, 'toString')` collected `'[object Object]'`,
  `emitAsync({}, 'constructor')` collected `[{}]` from the `Object`
  constructor invoked as a plain function, and `emit(ε, '__defineGetter__')`
  threw a `TypeError` from deep inside the dispatch. A `once()` in any of
  those shapes was consumed without calling a handler — except for the two
  `__define*` names, where the throw came before the auto-unsubscribe ran and
  the subscription survived by accident; it now survives everywhere, so an
  emitter holds such a subscription until it is answered or released. Grep for
  event names taken from external data (JSON keys, message types, DOM
  attributes) — that is where the collision happens by accident. If a name of
  this kind was doing real work, spell the method out with the method-name
  form (`on(ε, 'toString', 'toString', obj)`), which is deliberately exempt,
  or define the method on the target: a target's own method under that name
  dispatches as normal, unless it is literally an alias of
  `Object.prototype`'s function.
- **`off(ε, '*', listenerObject)` now detaches that object's wildcard
  subscriptions.** It used to remove nothing and report nothing: `off()`
  routes a name-plus-object pair into the named buckets, and a wildcard
  listener has never lived there. Every shape that puts an object on the
  wildcard was affected — `on(ε, '*', obj)`, the bare catch-all `on(ε, obj)`,
  `on(ε, '*', fn, ctx)` and `on(ε, '*', 'method', ctx)`. Grep for the call:
  code that used it as a working cleanup step was leaking the subscription,
  and code that had settled for the blunt workarounds (`off(ε, '*')`, which
  wipes the emitter, or `off(ε, obj)`, which also drops the object's *named*
  subscriptions) can now narrow to what it actually meant. Named
  subscriptions of the same object survive this call, retained state is
  untouched — `'*'` can never carry any — and reference counting is not
  consulted, so one call releases a `refCount`-2 registration outright,
  exactly as `off(ε, 'foo', obj)` always has.

## v4 → v5: `emit()` stopped throwing

`emit()` and `emitAsync()` no longer throw `"object is not eventized"` on a non-eventized target. They duck-type instead:

1. `obj[eventName]` is a function the object itself provides → call it with
   `this === obj`. Since v6.1.0 a member inherited from `Object.prototype`
   doesn't count (see the v5 → v6 note above).
2. Else `obj.emit` is a function → call `obj.emit(eventName, …args)`.
3. Else silent no-op.

`null`, `undefined`, and non-objects no-op. `'*'` still throws. Return values flow through the same aggregation as eventized dispatch, so `emitAsync()` behaves uniformly across both paths.

If you relied on the throw as a typo net, either guard with `isEventized()` or move to a typed emitter — `eventize<TEvents>()` still rejects unknown event names at compile time. `retainClear()` and `unretain()` are unchanged and still throw.

## v4.0.x → v4.3.x: the type brand on classes

v4.3 added unique-symbol brands (`[__TEventsBrand]`, `[NAMESPACE]`) to `EventizedObject<TEvents>`. The function-style API now requires its first argument to be either a branded `EventizedObject<T>` or assignable to `NonTypedEmitter<T>`. Plain class instances no longer qualify: `eventize(this)` brands the instance at runtime, but the *type* of `this` stays unbranded, so every later `emit(this, …)` inside the class fails to type-check.

Fix without refactoring — declaration-merge an empty interface per class file:

```ts
import {emit, type EventizedObject, eventize, on, retain} from '@spearwolf/eventize';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MyClass extends EventizedObject {}

export class MyClass {
  constructor() {
    eventize(this);          // still required at runtime
    retain(this, 'ready');   // now type-checks
  }
  doStuff() { emit(this, 'ready'); }
}
```

Apply it to every class that calls `eventize(this)` — or that auto-eventizes via `retain`/`on`/`once` on `this`. It works for classes that already extend something else; the merge is independent of the runtime inheritance chain. Since the brand symbols aren't exported, this merge and `extends Eventize` are the only ways to satisfy the constraint without `as any`.

**Extend `EventizedObject`, not `EventizeApi`.** `EventizeApi` carries the public method signatures (`on`, `emit`, `retain`, …) and will collide with any same-named method on the host class.

Two call sites still need help after the merge:

- **Polymorphic `this` plus listener-object form.** `on(this, listenerObj)` fails because TS can't reduce `NonTypedEmitter<this>` while `this` is generic. Cast to the concrete class: `on(this as MyClass, listenerObj)`.
- **`on.bind(undefined, this, eventName)` patterns.** TS picks the priority-as-number overload and rejects the string event name. Cast the reference: `(on as (...args: unknown[]) => unknown).bind(undefined, this, eventName)`. Not `as Function` — ESLint's `no-unsafe-function-type` rejects that.

Runtime behavior is unchanged by this migration; it is purely type-level. Sanity check with typecheck → build → tests.
