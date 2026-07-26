# Unsubscribing in depth — `off()`

[← back to README](../README.md)

`off()` removes listeners from an emitter. It is the counterpart to `on()` and exists for cleanup scenarios where you no longer hold the `unsubscribe` function that `on()` returned.

## Signatures

| Signature                                 | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `off(emitter)`                            | Unsubscribes **all** listeners from the emitter, and clears **all** retained state. |
| `off(emitter, '*')`                       | Same as above — all listeners (named and wildcard), all retained state. |
| `off(emitter, eventName)`                 | Unsubscribes all listeners for a specific event (string or symbol), and unretains it. |
| `off(emitter, [eventName1, eventName2])`  | Same, for several events at once. A `'*'`, `null` or `undefined` anywhere in the array makes it the bulk form. |
| `off(emitter, listenerFunc)`              | Unsubscribes a specific listener function from all events.          |
| `off(emitter, listenerFunc, context)`     | Unsubscribes a listener function with a specific context.           |
| `off(emitter, listenerObject)`            | Unsubscribes all listeners associated with an object.               |
| `off(emitter, eventName, listenerObject)` | Unsubscribes a listener object from a specific event only — but still unretains that event, whole, even if other listeners for it survive. |
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
> A list of event names assembled at runtime — `off(ε, names.map((n) => lookup[n]))` — wipes the entire emitter the moment one lookup misses. Filter the array before passing it.

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

Until v6.1.0 this call removed nothing at all and said nothing about it: `off()` routed a name-plus-object pair into the named buckets, where a wildcard listener never lives. Reach for `off(ε, service)` when you mean both halves, and `off(ε, '*')` when you mean the whole emitter — the three read almost alike and do quite different things.

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

When the *same* listener-object subscription is registered more than once **through `on()`**, eventize collapses the duplicates into a single entry carrying a reference count. Each `on()` increments it, each unsubscribe decrements it, and the listener is only really removed at zero.

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
> Reference counting applies **only to listener-object forms of `on()`** — `on(ε, eventName, listenerObject)` and `on(ε, eventName, 'methodName', listenerObject)`. Two subscriptions count as identical when event name, priority, listener object, and listener context all match.

> [!IMPORTANT]
> **`once()` never deduplicates (since v6.0.0).** Every `once()` call registers its own listener, whatever is already subscribed:
>
> ```javascript
> once(ε, 'foo', listener);
> once(ε, 'foo', listener); // a SECOND one-shot subscription
>
> emit(ε, 'foo'); // => "foo" twice — then both are gone
> ```
>
> Two one-shot subscriptions mean two firings, each returned handle releases exactly its own, and a `once()` registered next to an existing `on()` for the same listener object is independent of it. Up to v5.1.0 `once()` shared `on()`'s dedup, which produced a listener that fired on every emit and could only be removed with `off(ε, listenerObject)`.

Function listeners behave differently — each `on()` is an independent registration:

```javascript
const fn = () => console.log('fn');

on(ε, 'foo', fn);
on(ε, 'foo', fn); // a SECOND, separate listener

emit(ε, 'foo');
// => "fn"
// => "fn"  ← called twice
```
