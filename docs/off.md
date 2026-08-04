# Unsubscribing in depth — `off()`

[← back to README](../README.md)

`off()` removes listeners from an emitter. It is the counterpart to `on()` and exists for cleanup scenarios where you no longer hold the `unsubscribe` function that `on()` returned.

## Signatures

| Signature                                 | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `off(emitter)`                            | Unsubscribes **all** listeners from the emitter, and clears **all** retained state. |
| `off(emitter, undefined)`                 | The same branch as `off(emitter)` — **not** a no-op. All listeners, all retained state. |
| `off(emitter, '*')`                       | Same as above — all listeners (named and wildcard), all retained state. |
| `off(emitter, eventName)`                 | Unsubscribes all listeners registered *for that name* (string or symbol), and unretains it. Wildcard listeners are not touched and keep seeing the event. |
| `off(emitter, [eventName1, eventName2])`  | Same, for several events at once. A `'*'`, `null` or `undefined` anywhere in the array makes it the bulk form. |
| `off(emitter, listenerFunc)`              | Unsubscribes that listener function from all events — every registration of it, whatever context it was drawn under, `on(ε, name, fn, ctx)` included. Since v6.0.0 it also reaches the registrations that drew the function as some *other* listener's context, `on(ε, name, other, fn)`, because a function is a listener object like any other. |
| `off(emitter, listenerFunc, context)`     | Unsubscribes that function only where it was registered with exactly that context. The narrowing form of the row above, and the one to reach for when the context matters. A listener *object* in the first slot reads the same way — `off(ε, obj, ctx)` is that one pair and nothing else, since v6.0.0. |
| `off(emitter, listenerObject)`            | Unsubscribes every subscription associated with that object: the object-alone shape, the method-name shape, the function-with-context shape `on(ε, name, fn, obj)`, and — since v6.0.0 — the object-with-a-context shape `on(ε, name, obj, ctx)`. The listener object may be a function or a class; up to v5.1.0 those two were silently skipped here. |
| `off(emitter, eventName, listenerObject)` | Unsubscribes a listener object from a specific event only — but still unretains that event, whole, even if other listeners for it survive, and even if it detached nothing. |
| `off(emitter, [eventName, …], listenerObject)` | **Nothing at all** — a complete no-op on listeners *and* retained state. Use `off(emitter, [names])` without the object, or `unretain(emitter, [names])`. |
| `off(emitter, '*', listenerObject)`       | Unsubscribes a listener object from the **wildcard** bucket only. Named subscriptions of the same object stay, and retained state is untouched. |

> [!NOTE]
> Calling `off()` on a non-eventized object (or on `null`/`undefined`) is a no-op — it returns silently. This makes `off()` safe in cleanup paths without first checking `isEventized()`.

## Using the unsubscribe function

The recommended way to unsubscribe is the function returned by `on()`:

```javascript
const ε = eventize();
const listener = (val) => console.log(val);

const unsubscribe = on(ε, 'my-event', listener);
emit(ε, 'my-event', 'Hello!'); // => "Hello!"

unsubscribe();
emit(ε, 'my-event', 'Silent?'); // (nothing happens)
```

Calling it more than once is safe — subsequent calls are no-ops. Each handle is single-shot: once consumed it is inert, so a repeated call cannot decrement a [reference-counted](#reference-counting) subscription twice and unsubscribe a sibling handle's registration along with it.

## Removing all listeners

```javascript
const ε = eventize();

on(ε, 'foo', () => console.log('foo'));
on(ε, 'bar', () => console.log('bar'));
on(ε, (...args) => console.log('wildcard:', args));

off(ε);        // remove ALL listeners and ALL retained state
// or equivalently:
off(ε, '*');

emit(ε, 'foo'); // (nothing happens)
emit(ε, 'bar'); // (nothing happens)
```

Since v6.0.0 both forms empty the retained-events keeper as well as the listener registry: every retained value and every retain policy is dropped, exactly as [`unretain(ε, '*')`](./retain.md#unretainemitter-eventname--eventname) does. Up to v5.1.0 they left retained state alone, so a subscriber arriving after the "reset" still got the old payload replayed.

A `'*'` anywhere in an array counts as the bulk form, on the keeper exactly as it always has on the listeners — `off(ε, ['*'])` and `off(ε, ['*', 'foo'])` both wipe everything, and the names listed beside the wildcard add nothing:

```javascript
off(ε, ['*']);        // identical to off(ε, '*')
off(ε, ['*', 'foo']); // also identical — the 'foo' is redundant, not narrowing
```

A `null` or `undefined` element does the same, for the same reason: each element is processed on its own, and a nullish one means "everything" just as the bare `off(ε, undefined)` does. Since v6.0.0 the keeper follows the store here too — before, these forms emptied the registry and left every retained value in place.

```javascript
off(ε, [null]);         // identical to off(ε)
off(ε, ['foo', null]);  // also identical — the 'foo' narrows nothing
```

> [!WARNING]
> A lookup that misses wipes the emitter. The scalar shape is the common one: `off(ε, handlers[name])` for a `name` that is not in `handlers` passes `undefined` and takes the bulk branch — every listener gone, every retained value and policy gone. The array shape does the same the moment one element misses: `off(ε, names.map((n) => lookup[n]))`. Guard the lookup, filter the array, or keep the handle `on()` returned and call that.

## Removing listeners by event name

```javascript
const ε = eventize();

on(ε, 'foo', () => console.log('foo listener 1'));
on(ε, 'foo', () => console.log('foo listener 2'));
on(ε, 'bar', () => console.log('bar listener'));

off(ε, 'foo');

emit(ε, 'foo'); // (nothing happens)
emit(ε, 'bar'); // => "bar listener"
```

Several events at once:

```javascript
off(ε, ['foo', 'bar']);
```

Symbol event names work the same way:

```javascript
const MyEvent = Symbol('MyEvent');

on(ε, MyEvent, () => console.log('symbol event'));
off(ε, MyEvent);
```

## Removing a specific listener function

```javascript
const ε = eventize();
const listener = () => console.log('I will be removed');
const other = () => console.log('I will stay');

on(ε, 'foo', listener);
on(ε, 'foo', other);
on(ε, 'bar', listener); // same listener on a different event

off(ε, listener);       // removes it from ALL events

emit(ε, 'foo'); // => "I will stay"
emit(ε, 'bar'); // (nothing happens)
```

Since v6.0.0 the context a subscription was drawn under is no part of this match. A function registered as `on(ε, 'foo', handler, ctx)` is removed by `off(ε, handler)` just like one registered without a context, and one function drawn under several contexts loses all of them at once:

```javascript
const ε = eventize();
const handler = function () {
  console.log('called on', this.name);
};
const a = {name: 'a'};
const b = {name: 'b'};

on(ε, 'foo', handler, a);
on(ε, 'foo', handler, b);

off(ε, handler); // both go
```

Up to v5.1.0 only the contextless registrations matched, so the two calls above survived an `off(ε, handler)` without a word — and the emitter went on holding the function and both context objects. Name the context to narrow the removal back to one subscription:

```javascript
off(ε, handler, a); // b's registration stays
```

That is the form to use in a teardown that shares a prototype method across instances: `off(ε, MyComponent.prototype.onData)` now detaches every instance's subscription, `off(ε, this.onData, this)` only its own.

The context has to be a real value to narrow anything. `off(ε, handler, null)` and `off(ε, handler, undefined)` are the two-argument form spelled with a placeholder — a nullish third argument *is* "no listener object given" — so neither is a way to address only the registration made without a context. Nothing addresses that one on its own any more; keep the `unsubscribe` handle `on()` returned when a single registration has to be removed and no other, since it removes exactly what it created and asks no identity question at all.

> [!NOTE]
> There is no index from a listener back to the event names it is registered under, so `off(ε, listenerFunc)`, `off(ε, listenerFunc, context)` and `off(ε, listenerObject)` all visit every event name the emitter has ever seen to find where it sits. Two things add up, and only the first is about names:
>
> - **one lookup per registered event name**, whether or not your listener is subscribed under it. Negligible for the usual handful of names; worth knowing if a hot teardown path calls one of these forms against an emitter carrying many distinct names.
> - **one removal per subscription actually found**, and a removal is an array splice, so a bucket holding many listeners under the *same* event name makes each of its removals proportionally more expensive to shift out.
>
> Up to v5.1.0 the second cost was far worse and hid inside the first: every call read both identity slots of every listener under every name, so tearing down _n_ listener objects registered on one event name was quadratic in _n_ — 8000 of them measured 81–93 ms, against 3–4 ms since v6.0.0. What is left is the array work, not the search.
>
> `unsubscribe()` handles and the event-name forms of `off()` don't pay the per-name cost at all — they already know where to look.

## Removing listener objects

```javascript
const ε = eventize();
const service = {
  foo() {
    console.log('foo');
  },
  bar() {
    console.log('bar');
  },
};

on(ε, 'foo', service);
on(ε, 'bar', service);

off(ε, service); // removes every subscription of 'service'

emit(ε, 'foo'); // (nothing happens)
emit(ε, 'bar'); // (nothing happens)
```

A listener object does not have to be a plain object — a function or a class is one too, on this side as well as on the dispatch side:

```javascript
class Registry {
  static reset() {
    console.log('reset');
  }
}

on(ε, 'shutdown', 'reset', Registry);
off(ε, Registry); // detaches it
```

Up to v5.1.0 that `off()` removed nothing and reported nothing: the sweep asked `typeof === 'object'`, so a function or a class in the listener-object slot fell through the test and went on firing, with the class and everything it closed over still held by the emitter. The targeted `off(ε, 'shutdown', Registry)` never asks that question and is untouched by the widening — but it did not reach this subscription against v5.1.0 either, for a separate reason: with an event name given it compared `Registry` against the slot holding the *method name* instead of the one holding the listener object, so the method-name shape slipped past it too. Both halves land in v6.0.0. Against v5.1.0 nothing addressed this subscription by identity at all — only `off(ε, 'shutdown')`, a bulk `off()`, or the handle `on()` returned.

Restricted to one event:

```javascript
const objA = {foo: () => console.log('A:foo'), bar: () => console.log('A:bar')};
const objB = {foo: () => console.log('B:foo')};

on(ε, 'foo', objA);
on(ε, 'bar', objA);
on(ε, 'foo', objB);

off(ε, 'foo', objA); // objA keeps its 'bar' subscription

emit(ε, 'foo'); // => "B:foo"
emit(ε, 'bar'); // => "A:bar"
```

Restricted to the wildcard bucket — `'*'` in that same slot means "the wildcard subscription", not "everything":

```javascript
const service = {foo: () => console.log('foo'), bar: () => console.log('bar')};

on(ε, '*', service); // sees every event
on(ε, 'foo', service); // and 'foo' a second time, via its own subscription

off(ε, '*', service); // only the wildcard one goes

emit(ε, 'foo'); // => "foo"  (once — the named subscription is still there)
emit(ε, 'bar'); // (nothing happens)
```

Up to v5.1.0 this call removed nothing at all and said nothing about it: `off()` routed a name-plus-object pair into the named buckets, where a wildcard listener never lives. Reach for `off(ε, service)` when you mean both halves, and `off(ε, '*')` when you mean the whole emitter — the three read almost alike and do quite different things.

## Interaction with `retain()`

Called with an event name, `off()` also reverses `retain()` for that event — it discards the stored value **and** the retain policy, exactly like [`unretain()`](./retain.md#unretainemitter-eventname--eventname):

```javascript
const ε = eventize();

retain(ε, 'status');
emit(ε, 'status', 'loading');

on(ε, 'status', (s) => console.log('Listener 1:', s));
// => "Listener 1: loading"

off(ε, 'status'); // removes listeners AND clears the retained value

on(ε, 'status', (s) => console.log('Listener 2:', s));
// (nothing — and future emits are not retained either)
```

Call `retain(ε, 'status')` again if you want the event to keep being retained after an `off()`.

The scalar and array forms behave identically here, for string and symbol event names alike:

```javascript
off(ε, SOME_SYMBOL);   // unretains SOME_SYMBOL
off(ε, [SOME_SYMBOL]); // same
```

The bare `off(ε)` and the wildcard `off(ε, '*')` do the same for every retained name at once — see [Removing all listeners](#removing-all-listeners). The listener-only forms (`off(ε, listenerFunc)`, `off(ε, listenerObject)`, `off(ε, '*', listenerObject)`, the `unsubscribe` handle) never touch retained state; [`docs/lifecycle.md`](./lifecycle.md#what-each-off-form-releases) tabulates all of them.

## Behavior during emit

If `off()` runs inside a listener, listeners that have already been invoked are unaffected; listeners not yet reached in that dispatch are skipped:

```javascript
const ε = eventize();

on(ε, 'test', 10, () => console.log('High priority'));
on(ε, 'test', 5, () => {
  console.log('Medium priority');
  off(ε, 'test');
});
on(ε, 'test', 0, () => console.log('Low priority'));

emit(ε, 'test');
// => "High priority"
// => "Medium priority"
// (Low priority is never called — off() removed it first)
```

## Reference counting

When the *same* listener-object subscription is registered more than once — through `on()`, `once()`, or a mixture of the two — eventize collapses the duplicates into a single entry. This covers listener objects and method-name subscriptions only: a plain function listener never de-duplicates, so two `on(ε, 'foo', fn)` calls, or two `once(ε, 'foo', fn)` calls, stay two registrations and fire twice. `on()` and `once()` track their share of it separately: a persistent reference count for `on()`, and a list of pending one-shot obligations for `once()`. Each `on()` call increments the reference count, each of its unsubscribe handles decrements it; each `once()` call adds one obligation, discharged as a batch by whichever matching dispatch reaches the listener first. The listener is only really removed once both are empty — no `on()` holding it and no obligation pending.

That accounting belongs to the handles. `off()` overrides it: every `off()` form detaches outright without consulting either, so `off(ε, listenerObject)`, `off(ε, eventName)`, `off(ε, eventName, listenerObject)` and `off(ε, '*', listenerObject)` each release a `refCount`-2 registration — and any pending `once()` obligation riding on it — in a single call. That is what makes `off()` the teardown hammer, and why a handle still held afterwards is inert rather than dangerous.

```javascript
const ε = eventize();
const listener = {foo: () => console.log('foo')};

const unsub1 = on(ε, 'foo', listener);
const unsub2 = on(ε, 'foo', listener); // same subscription → refCount = 2

emit(ε, 'foo'); // => "foo"  (once — there is only one underlying listener)

unsub1();       // refCount = 1
unsub1();       // still 1 — a consumed handle is inert
emit(ε, 'foo'); // => "foo"  (still active)

unsub2();       // refCount = 0 → removed
emit(ε, 'foo'); // (nothing happens)
```

> [!IMPORTANT]
> Reference counting applies **only to listener-object forms** — `on(ε, eventName, listenerObject)` and `on(ε, eventName, 'methodName', listenerObject)`, and, since v6.0.0, the matching `once()` forms aggregating onto them (below). Two subscriptions count as identical when event name, priority, listener object, and listener context all match.

> [!IMPORTANT]
> **`once()` aggregates onto the same identity `on()` does (since v6.0.0).** Two `once()` calls, or a `once()` next to an existing `on()` in either order, land on one listener:
>
> ```javascript
> once(ε, 'foo', listener);
> once(ε, 'foo', listener); // a second obligation on the SAME listener
>
> emit(ε, 'foo'); // => "foo" once — both obligations discharge together
> ```
>
> Each `once()` call still returns its own handle, and each handle releases only its own obligation — calling one early is a no-op if the matching dispatch already discharged it. An `on()` on the same identity keeps the listener alive independently of any `once()` obligations riding on it: `on(ε, 'foo', listener); once(ε, 'foo', listener); emit(ε, 'foo');` fires once, discharges the `once()`, and leaves the `on()` registration subscribed. That much held up to v5.1.0 too, in either order. What did not is the settling: two `once()` calls on one identity collapsed into a registration that never discharged and fired on every emit instead of once.

Function listeners behave differently — each `on()` is an independent registration:

```javascript
const fn = () => console.log('fn');

on(ε, 'foo', fn);
on(ε, 'foo', fn); // a SECOND, separate listener

emit(ε, 'foo');
// => "fn"
// => "fn"  ← called twice
```
