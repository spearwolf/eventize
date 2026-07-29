# Migration guide

[← back to README](../README.md)

Upgrade notes, newest jump first. The full record of every change is in
[`CHANGELOG.md`](../CHANGELOG.md); this file is the task-oriented version — what
to grep for and what to write instead.

## v5 → v6

`v6.0.0` is the only `6.x` there is, so a `v5.1.0` consumer takes the whole jump
at once. Twelve breaking changes. Most are runtime changes on signatures that do
not change shape, so the type checker will not find the call sites for you —
grep for the patterns below. Four are type-only and do surface as compile
errors.

Two further changes are filed as fixes rather than breaks, but a v5 consumer
meets them in the same install; they are at the end.

### `off(ε)` and the other bulk forms now clear retained state

```js
// v5 — the retained value survived a bulk off()
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn); // fn received `settings`, replayed from the keeper

// v6 — off(ε) clears listeners and retained state alike
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn); // fn receives nothing
```

If you relied on the old behaviour, re-`retain()` and re-`emit()` after the
reset — or narrow the call to what you actually mean to remove. The targeted
forms `off(ε, eventName)` and `off(ε, [names])` are unchanged.

The same applies to `off(ε, '*')` and to any array containing `'*'`, `null` or
`undefined`. That last one is the trap worth checking for:

```js
// wipes the entire emitter — listeners and retained state — the moment
// one lookup misses
off(ε, ids.map((id) => nameFor(id)));

// filter first
off(
  ε,
  ids.map((id) => nameFor(id)).filter(Boolean),
);
```

`off(ε, undefined)` was never a no-op — it has always taken the same branch as
the bare `off(ε)`. What changed is that the branch now empties the keeper too.

### Unsubscribe handles are single-shot

```js
// v5 — a second call could release a SIBLING handle's registration
const u1 = on(ε, 'foo', listenerObject);
on(ε, 'foo', listenerObject); // same subscription → refCount = 2

u1();
u1(); // decremented the shared count again
getSubscriptionCount(ε); // => 0 — the other registration is gone too

// v6 — the second call is inert
const u1 = on(ε, 'foo', listenerObject);
const u2 = on(ε, 'foo', listenerObject); // refCount = 2

u1();
u1(); // no-op
getSubscriptionCount(ε); // => 1 — u2's registration is untouched

u2();
getSubscriptionCount(ε); // => 0
```

Nothing to change unless a cleanup path *relied* on calling `off()` twice to
force a shared registration to zero. Reach for `off(ε, listenerObject)`, which
removes every matching subscription in one call however many handles they were
split across.

### `once()` no longer deduplicates

```js
// v5 — two once() calls collapsed into one listener that then never stopped
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready'); // one call — and the listener is still subscribed

// v6 — two independent one-shot subscriptions
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready'); // two calls — both detached afterwards
```

Drop the duplicate `once()`, or guard the handler against being invoked twice.
`on()`'s reference-counted de-duplication is unaffected.

### `on()` / `once()` reject a listener they cannot dispatch to

```js
on(ε, 'foo', 5); // v5: registered a subscription no emit() could reach
// v6: throws `subscribeTo() called with insufficient arguments`
```

Only a function, a string, a symbol or a non-null object passes now. The same
call with `0` already threw in v5, because `0` is falsy — the same mistake
behaved in opposite ways depending on the number, and the silent half was the
one that looked like it had worked.

Every documented spelling of `on()` is unaffected. Grep for values forwarded
into the listener position: a config field, a wrapper's `arguments`, an argument
that slipped a place.

### `on()` / `once()` throw on a `NaN` priority

```js
on(ε, 'foo', Number(cfg.prio), fn); // v5: listener landed anywhere at all
// v6: throws `subscribeTo() called with a NaN priority`

// validate at the call site
on(ε, 'foo', Number.isNaN(p) ? Priority.Normal : p, fn);

// a tuple carries its own priority and needs its own guard — the call-level
// value is not a fallback for a tuple that spells one out
on(ε, [['a', Number.isNaN(p) ? Priority.Normal : p]], fn);
```

Rejection is atomic: a `NaN` in one tuple registers none of the names in that
call, and a call-level `NaN` throws even when every tuple carries its own
priority. `Priority.Max` and `Priority.Min` are `±Infinity` and stay valid — the
test is `Number.isNaN`, not a finiteness test.

### The smaller ones

- **`on(ε, 'foo', 'handler', null)` no longer throws.** A method-name
  subscription with a missing or `null` listener object used to throw
  `TypeError` the moment the event fired; it now dispatches to nothing until a
  real listener object is supplied, and a `once()` in this shape is not
  consumed. Code that caught the `TypeError` as a signal should check
  `getSubscriptionCount(ε)` instead.
- **`off(ε, <numeric listener id>)` removes nothing.** Undocumented and
  untested; it detached the listener outright, skipping the reference count.
  Use `unsub()`.
- **`UnsubscribeFunc` is `() => void`.** `.listener` and `.listeners` are gone,
  and so is the `EventListener` type export. Replace `off(ε, unsub.listener)`
  with `unsub()` — same reference-counted path, same single-shot guard, and no
  emitter needed in scope. Reads past it (`unsub.listener.id`, `.isRemoved`)
  were internals and have no replacement.
- **`emitAsync()` returns `Promise<any[] | undefined>`.** The runtime has always
  resolved to `undefined` when no listener returned a non-null value; the old
  `any` hid that. Guard the result: `(await emitAsync(ε, 'x'))?.map(…)`, or
  `?? []`.
- **The marker slot on `EventizedObject` is opaque.** `EventStore`,
  `EventKeeper` and `EventListener` no longer appear in `lib/index.d.ts`.
  Nothing that calls the API breaks; only code that annotated the slot
  structurally is affected.
- **`export type ListenerType` is gone.** It was an alias for `unknown`. Write
  `unknown`.
- **An `EventListener` built directly with a `null` listener** dispatches to
  nothing instead of throwing. Only reachable by constructing the class
  yourself, which the package no longer exports in either namespace.

### Two fixes that behave like breaks

Neither is visible to the type checker, and both change what runs.

**Event names inherited from `Object.prototype` dispatch to nothing.**
`toString`, `toLocaleString`, `valueOf`, `constructor`, `hasOwnProperty`,
`isPrototypeOf`, `propertyIsEnumerable` and V8's `__defineGetter__` family used
to resolve to the function every object inherits — on both dispatch paths.
`emit(ε, 'toString')` called it on every listener object subscribed to that name
*and* on every wildcard listener object; `emitAsync({}, 'constructor')` collected
`[{}]` from the `Object` constructor invoked as a plain function; and
`emit(ε, '__defineGetter__')` threw a `TypeError` from deep inside the dispatch.

Grep for event names taken from external data — JSON keys, message types, DOM
attributes — because that is where the collision happens by accident. If such a
name was doing real work, spell the method out with the method-name form, which
is deliberately exempt:

```js
on(ε, 'toString', 'toString', obj); // dispatches to the inherited method
```

or define the method on the target. A target's own method under that name
dispatches as normal, unless it is literally an alias of `Object.prototype`'s
function (`{toString: Object.prototype.toString}` is skipped along with the
inherited one).

**`off(ε, '*', listenerObject)` now detaches something.** It used to remove
nothing and report nothing, for every shape that puts an object on the wildcard
— `on(ε, '*', obj)`, the bare catch-all `on(ε, obj)`, `on(ε, '*', fn, ctx)` and
`on(ε, '*', 'method', ctx)`. Code that used it as a working cleanup step was
leaking the subscription; code that had settled for the blunt workarounds
(`off(ε, '*')`, which wipes the emitter, or `off(ε, obj)`, which also drops the
object's *named* subscriptions) can now narrow to what it meant. Named
subscriptions of the same object survive, retained state is untouched, and
reference counting is not consulted — one call releases a `refCount`-2
registration outright.

### Verifying the upgrade

`getSubscriptionCount(ε)` and `getRetainedCount(ε)` read both halves of an
emitter's state without reaching into internals. A test around the call in
question shows the difference:

```js
retain(ε, 'config');
emit(ε, 'config', settings);
on(ε, 'config', fn);

off(ε);

getSubscriptionCount(ε); // => 0 — in v5 and v6 alike
getRetainedCount(ε); // => 0 in v6, would have been 1 in v5
```

## v4 → v5: `emit()` stopped throwing

`emit()` and `emitAsync()` no longer throw `"object is not eventized"` on a
non-eventized target. They duck-type instead:

1. `obj[eventName]` is a function the object actually provides → call it with
   `this === obj`. Since v6.0.0 a member inherited from `Object.prototype` does
   not count.
2. Otherwise `obj.emit` is a function → call `obj.emit(eventName, …args)`.
3. Otherwise a silent no-op.

`null`, `undefined` and non-objects no-op. `'*'` still throws. Return values flow
through the same aggregation as eventized dispatch, so `emitAsync()` behaves
uniformly across both paths.

If you relied on the throw as a typo net, guard with `isEventized()` or move to a
typed emitter — `eventize<TEvents>()` still rejects unknown event names at
compile time. `retainClear()` and `unretain()` are unchanged and still throw.

## v4.0.x → v4.3.x: the type brand on classes

v4.3 added unique-symbol brands to `EventizedObject<TEvents>`. The function-style
API now requires its first argument to be either a branded `EventizedObject<T>`
or assignable to `NonTypedEmitter<T>`. Plain class instances no longer qualify:
`eventize(this)` brands the instance at runtime, but the *type* of `this` stays
unbranded, so every later `emit(this, …)` inside the class fails to type-check.

Fix without refactoring — declaration-merge an empty interface per class file:

```ts
import {emit, type EventizedObject, eventize, on, retain} from '@spearwolf/eventize';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MyClass extends EventizedObject {}

export class MyClass {
  constructor() {
    eventize(this); // still required at runtime
    retain(this, 'ready'); // now type-checks
  }
  doStuff() {
    emit(this, 'ready');
  }
}
```

Apply it to every class that calls `eventize(this)` — or that auto-eventizes via
`retain` / `on` / `once` on `this`. It works for classes that already extend
something else; the merge is independent of the runtime inheritance chain. Since
the brand symbols are not exported, this merge and `extends Eventize` are the
only ways to satisfy the constraint without `as any`.

**Extend `EventizedObject`, not `EventizeApi`.** `EventizeApi` carries the public
method signatures (`on`, `emit`, `retain`, …) and will collide with any
same-named method on the host class.

Two call sites still need help after the merge:

- **Polymorphic `this` plus the listener-object form.** `on(this, listenerObj)`
  fails because TS cannot reduce `NonTypedEmitter<this>` while `this` is generic.
  Cast to the concrete class: `on(this as MyClass, listenerObj)`.
- **`on.bind(undefined, this, eventName)` patterns.** TS picks the
  priority-as-number overload and rejects the string event name. Cast the
  reference: `(on as (...args: unknown[]) => unknown).bind(undefined, this, eventName)`.
  Not `as Function` — ESLint's `no-unsafe-function-type` rejects that.

Runtime behaviour is unchanged by this migration; it is purely type-level.
