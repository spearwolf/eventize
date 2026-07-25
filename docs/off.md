# Unsubscribing in depth — `off()`

[← back to README](../README.md)

`off()` removes listeners from an emitter. It is the counterpart to `on()` and exists for cleanup scenarios where you no longer hold the `unsubscribe` function that `on()` returned.

## Signatures

| Signature                                 | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `off(emitter)`                            | Unsubscribes **all** listeners from the emitter.                    |
| `off(emitter, '*')`                       | Same as above — unsubscribes all listeners (named and wildcard).     |
| `off(emitter, eventName)`                 | Unsubscribes all listeners for a specific event (string or symbol), and unretains it. |
| `off(emitter, [eventName1, eventName2])`  | Same, for several events at once.                                   |
| `off(emitter, listenerFunc)`              | Unsubscribes a specific listener function from all events.          |
| `off(emitter, listenerFunc, context)`     | Unsubscribes a listener function with a specific context.           |
| `off(emitter, listenerObject)`            | Unsubscribes all listeners associated with an object.               |
| `off(emitter, eventName, listenerObject)` | Unsubscribes a listener object from a specific event only.          |

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

Calling it more than once is safe — subsequent calls are no-ops.

## Removing all listeners

```javascript
const ε = eventize();

on(ε, 'foo', () => console.log('foo'));
on(ε, 'bar', () => console.log('bar'));
on(ε, (...args) => console.log('wildcard:', args));

off(ε);        // remove ALL listeners
// or equivalently:
off(ε, '*');

emit(ε, 'foo'); // (nothing happens)
emit(ε, 'bar'); // (nothing happens)
```

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

When the *same* listener-object subscription is registered more than once, eventize collapses the duplicates into a single entry carrying a reference count. Each `on()` increments it, each unsubscribe decrements it, and the listener is only really removed at zero.

```javascript
const ε = eventize();
const listener = {foo: () => console.log('foo')};

const unsub1 = on(ε, 'foo', listener);
const unsub2 = on(ε, 'foo', listener); // same subscription → refCount = 2

emit(ε, 'foo'); // => "foo"  (once — there is only one underlying listener)

unsub1();       // refCount = 1
emit(ε, 'foo'); // => "foo"  (still active)

unsub2();       // refCount = 0 → removed
emit(ε, 'foo'); // (nothing happens)
```

> [!IMPORTANT]
> Reference counting applies **only to listener-object forms** — `on(ε, eventName, listenerObject)` and `on(ε, eventName, 'methodName', listenerObject)`. Two subscriptions count as identical when event name, priority, listener object, and listener context all match.

Function listeners behave differently — each `on()` is an independent registration:

```javascript
const fn = () => console.log('fn');

on(ε, 'foo', fn);
on(ε, 'foo', fn); // a SECOND, separate listener

emit(ε, 'foo');
// => "fn"
// => "fn"  ← called twice
```
