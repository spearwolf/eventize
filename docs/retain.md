# Retained events in depth — `retain()`, `retainClear()`, `unretain()`

[← back to README](../README.md)

## `retain(emitter, eventName | eventName[])`

Tells an emitter to hold onto the last-emitted event and its data. When a new listener subscribes, it is immediately called with the retained data — comparable to a `ReplaySubject(1)` in RxJS.

Key behaviors:

- Calling `retain()` on a non-eventized object automatically eventizes it.
- Only the **last** emission is retained; later ones overwrite it.
- Retained events are delivered to new subscribers synchronously, during `on()`.
- With several retained events, a new subscriber receives them in original emission order.
- String and symbol event names both work.

```javascript
import {eventize, retain, emit, on} from '@spearwolf/eventize';

const ε = eventize();

retain(ε, 'status');

// emitted before anyone is listening
emit(ε, 'status', 'ready');

on(ε, 'status', (currentStatus) => {
  console.log(`Status is: ${currentStatus}`);
});
// fires immediately => "Status is: ready"

emit(ε, 'status', 'running'); // => "Status is: running"
```

### Retaining several events

```javascript
const ε = eventize();

retain(ε, ['config', 'user', 'theme']);

emit(ε, 'config', {debug: true});
emit(ε, 'user', {name: 'Alice'});
emit(ε, 'theme', 'dark');

// a new subscriber receives all three, in emission order
on(ε, {
  config(cfg) {
    console.log('Config:', cfg);
  },
  user(u) {
    console.log('User:', u);
  },
  theme(t) {
    console.log('Theme:', t);
  },
});
// => "Config: { debug: true }"
// => "User: { name: 'Alice' }"
// => "Theme: dark"
```

### Symbol event names

```javascript
const AUTH_STATE = Symbol('authState');

retain(ε, AUTH_STATE);
emit(ε, AUTH_STATE, {authenticated: true, user: 'admin'});

on(ε, AUTH_STATE, (state) => console.log('Auth state:', state));
// => "Auth state: { authenticated: true, user: 'admin' }"
```

### With `once()` and `onceAsync()`

Both trigger immediately when a retained value exists:

```javascript
const ε = eventize();

retain(ε, 'initialized');
emit(ε, 'initialized', {ready: true});

once(ε, 'initialized', (data) => console.log('Initialized:', data));
// => "Initialized: { ready: true }"

const result = await onceAsync(ε, 'initialized');
console.log(result); // => { ready: true }
```

### Notes

- Events emitted **before** `retain()` was called are not stored.
- Calling `retain()` repeatedly for the same event is idempotent.
- New wildcard (`*`) subscribers also receive retained events.
- A throwing listener leaves the previously retained value untouched — the retain write happens after all listeners have run.

`'*'` is subscribe-only. `retain(ε, '*')` throws, matching `emit()`. On
`unretain()` and `retainClear()` the wildcard means *all retained events*:
`unretain(ε, '*')` drops every retain policy and every retained value,
`retainClear(ε, '*')` drops the values and keeps the policies. An array
containing `'*'` is treated as the wildcard, whatever else it lists.

---

## `retainClear(emitter, eventName | eventName[])`

Discards the currently stored value but keeps the retain policy active, so future emissions are retained again.

- Does **not** disable retain — only clears the stored value.
- Throws on a non-eventized object.
- Accepts a single name or an array; string and symbol names both work.
- Clearing a non-existent or already-cleared event is a no-op.

```javascript
import {eventize, retain, retainClear, emit, on} from '@spearwolf/eventize';

const ε = eventize();

retain(ε, 'status');
emit(ε, 'status', 'loading');

on(ε, 'status', (s) => console.log('Subscriber 1:', s));
// => "Subscriber 1: loading"

retainClear(ε, 'status');

on(ε, 'status', (s) => console.log('Subscriber 2:', s));
// (nothing happens)

emit(ε, 'status', 'complete');
// => "Subscriber 1: complete"
// => "Subscriber 2: complete"

on(ε, 'status', (s) => console.log('Subscriber 3:', s));
// => "Subscriber 3: complete"   ← the new emission was retained
```

Clearing several events:

```javascript
retain(ε, ['event1', 'event2', 'event3']);

emit(ε, 'event1', 'data1');
emit(ε, 'event2', 'data2');
emit(ε, 'event3', 'data3');

retainClear(ε, ['event1', 'event2']);

on(ε, {
  event1() {
    console.log('event1');
  }, // not called
  event2() {
    console.log('event2');
  }, // not called
  event3() {
    console.log('event3');
  }, // => "event3"
});
```

On a plain object it throws:

```javascript
const plainObj = {};

try {
  retainClear(plainObj, 'foo');
} catch (e) {
  console.error(e.message); // => "object is not eventized"
}

const ε = eventize(plainObj);
retainClear(ε, 'foo'); // fine now
```

---

## `unretain(emitter, eventName | eventName[])`

Fully reverses `retain()`: the stored value is dropped **and** future emissions are no longer retained.

- Does not affect already-subscribed listeners — they keep receiving new emissions.
- Throws on a non-eventized object.
- Accepts a single name or an array; string and symbol names both work.
- Unretaining an event that was never retained is a no-op.

```javascript
import {eventize, retain, unretain, emit, on} from '@spearwolf/eventize';

const ε = eventize();

retain(ε, 'status');
emit(ε, 'status', 'loading');

unretain(ε, 'status');

emit(ε, 'status', 'complete'); // not retained

on(ε, 'status', (s) => console.log(s));
// (nothing happens)
```

### `retainClear` vs. `unretain`

```javascript
// retainClear: clears the value, retain stays active
retain(ε, 'foo');
emit(ε, 'foo', 1);
retainClear(ε, 'foo');
emit(ε, 'foo', 2);
on(ε, 'foo', console.log); // => 2 (newly retained)

// unretain: clears the value AND disables retain
retain(ε, 'bar');
emit(ε, 'bar', 1);
unretain(ε, 'bar');
emit(ε, 'bar', 2);
on(ε, 'bar', console.log); // (nothing — retain is off)
```
