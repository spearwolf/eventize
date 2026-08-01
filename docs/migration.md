# Migration guide

[← back to README](../README.md)

Upgrade notes, newest jump first. The full record of every change is in
[`CHANGELOG.md`](../CHANGELOG.md); this file is the task-oriented version — what
to grep for and what to write instead.

## v5 → v6

`v6.0.0` is the only `6.x` there is, so a `v5.1.0` consumer takes the whole jump
at once. Fifteen breaking changes. Eight are runtime changes on signatures that
do not change shape, so the type checker will not find the call sites for you —
grep for the patterns below. Seven are type-only and do surface as compile
errors.

Two further changes are filed as fixes rather than breaks, but a v5 consumer
meets them in the same install; they are at the end.

### Dedupe `@spearwolf/eventize` before you install v6

This is the one step to take *before* the upgrade rather than after it. The
eventized marker is keyed by `Symbol.for('eventize')` — realm-wide, so every
copy of the library in the process writes and reads the same slot. npm resolves
`^5` and `^6` side by side without complaint the moment one of your dependencies
asks for the older range, and then both copies consider the same objects theirs.

Up to `v5.1.0` that mixture was silent until it wasn't: `on()` and `emit()`
worked across the versions, dispatching to listeners of both, and the first call
that reached a method the other major does not have threw something like
`TypeError: store.settleOneShots is not a function` from inside the dispatch,
naming neither eventize nor the cause.

`v6.0.0` versions the marker payload and checks it wherever the internals are
read, so the same tree fails at the boundary instead:

```
TypeError: two incompatible copies of @spearwolf/eventize are active on this
object (marker protocol undefined, expected 6) — dedupe @spearwolf/eventize in
your dependency tree so a single copy is loaded
```

Check the tree, and resolve it to one copy:

```sh
npm ls @spearwolf/eventize   # more than one version listed is the problem
npm dedupe
```

If a transitive dependent pins `^5` and cannot be updated, an `overrides` entry
(npm) or a `resolutions` entry (yarn / pnpm) forces the single copy:

```json
{
  "overrides": {
    "@spearwolf/eventize": "^6.0.0"
  }
}
```

To find out which copy owns an object at runtime, ask
`getEventizeProtocol(obj)`: `6` is this one, `undefined` on an object that
`isEventized()` reports as `true` is a copy from before the field existed.

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

### `on()` and `once()` aggregate by listener identity

A listener object — or a `(methodName, listenerObject)` pair — subscribed to
the same event at the same priority is one registration, however many `on()`
and `once()` calls produced it, in whatever order. The first dispatch
discharges every pending `once()` on that identity; the registration survives
for as long as an `on()` still holds it.

Only calls whose listener is an **object** — or a `(methodName, object)` pair —
can aggregate. A function listener never does, in either version. No text
pattern tells those apart reliably, so list every `once()` call site and narrow
by hand:

```bash
grep -rnE '\bonce\s*\(' --include='*.ts' --include='*.js' \
  --exclude-dir=node_modules .
```

For each hit, check whether the same object is also subscribed to that event
name with `on()` at the same priority. Those are the pairs whose call count
changes; everything else is untouched.

Two calls on one identity used to mean two invocations in one registration
order and one in the other. They now always mean one. Where two invocations
were the point, give the second subscription its own handler:

```js
// before — two invocations only if the on() came first
on(ε, 'ready', handlers);
once(ε, 'ready', handlers);

// after — two invocations in either order
on(ε, 'ready', handlers);
once(ε, 'ready', {ready: () => handlers.ready()});
```

Plain function listeners are unaffected — they never aggregate, in either
version.

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

### The listener slot is type-checked

Grep for a possibly-missing value forwarded into the listener position:

```
rg "\.on\(\s*[^,)]+,\s*\w+\[" src/
rg "\bon\([^,]+,\s*[^,)]*\?\." src/
```

Before — compiles, throws at runtime when the lookup misses:

```ts
on(ε, 'foo', handlers[name]);
```

After — guard it, or keep the handle:

```ts
const handler = handlers[name];
if (handler) on(ε, 'foo', handler);
```

An array, `null` or `undefined` in the listener position is now a compile
error the same way: `on(ε, ['a', 'b'])`, `on(ε, null)` and
`on(ε, undefined)` used to compile and throw
`subscribeTo() called with insufficient arguments` at runtime. The *trailing*
listener-object slot — `on(ε, 'foo', 'handler', null)` — is unchanged and
still accepts `null` / `undefined`; that is the documented late-bound shape,
not a lookup that missed.

### Typed maps now narrow on `eventize.inject()` and `class Eventize`

Grep for the two surfaces that changed:

```
rg "eventize\.inject<" src/
rg "extends Eventize<" src/
```

Before — compiled, and did nothing the map said:

```ts
const ε = eventize.inject<ChatEvents>({});
ε.emit('joind', 'carol'); // typo, accepted

class Chat extends Eventize<ChatEvents> {
  greet(user: string) {
    this.emit('joind', user); // typo, accepted
    this.on('joined', (u) => {
      /* u: any */
    });
  }
}
```

After — a compile error, and `u` is `string`. Either fix the name, or open the
map:

```ts
interface ChatEvents {
  joined: [user: string];
  [key: string]: any[];
}
```

The guard that closes the loose overloads used to sit on the standalone
functions' `obj` parameter, which a method does not have; it now sits on the
event-name slot, where both surfaces reach it. The class needed one thing more:
it declared its own `on` / `emit` / … in the class body, and a member declared
there wins over the same name inherited from the merged `EventizeApi`
interface, so the loose implementation signature was the public one. Those
implementations live on the prototype now — same functions, still
non-enumerable, no runtime change — and the merged interface is the class's
only type source. Untyped emitters are unaffected — every duck-typing route
stays open, including dynamic names, symbols, catch-all subscriptions and
late-bound method names.

A subclass that _overrides_ one of those methods feels it too. The override has
to be assignable to the merged overload set, so it carries the loose
implementation signature — `emit(eventNames: AnyEventNames, ...args: EventArgs)`
and `super.emit(eventNames as never, ...args)`, not a narrowed
`emit(eventName: 'data', …)`, which compiled up to `v5.1.0` and is a `TS2416`
now. And for as long as it is declared, that one member is loose again for
callers of that subclass: a member in a class body wins over the merged
interface, which is the whole reason the base class stopped declaring its own.

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
