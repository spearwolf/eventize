# Retained events in depth — `retain()`, `retainClear()`, `unretain()`

[← back to README](../README.md)

## `retain(emitter, eventName | eventName[])`

Tells an emitter to hold onto the last-emitted event and its data. When a new listener subscribes, it is immediately called with the retained data — comparable to a `ReplaySubject(1)` in RxJS.

Key behaviors:

- Calling `retain()` on a non-eventized object automatically eventizes it.
- Only the **last** emission is retained; later ones overwrite it.
- Retained events are delivered to new subscribers synchronously, during `on()` — but only once the whole call is registered. The replays are queued while subscribing and flushed as a batch afterwards, so every name of an `on(ε, ['a', 'b'], fn)` is already live when the first replay runs. Two consequences: a replay that emits another retained name reaches the listener live *and* still gets that name's queued replay afterwards — carrying the value that emit just wrote, since v6.0.0 — and a listener that throws on a replay does not take the rest of the batch with it — see [A listener that throws on a replay](#a-listener-that-throws-on-a-replay). What the batch fixes up front is *which* names take part and in *what order*; what each replay delivers is looked up when it runs — see [A handler that changes retained state mid-batch](#a-handler-that-changes-retained-state-mid-batch). That order is oldest-retained-value-first, not the order the names appear in the array: `on(ε, ['b', 'a'], fn)` replays `'a'` before `'b'` if `'a'` was retained first. Writing the same two names as two separate `on()` calls instead replays each immediately at its own call site, which can give the opposite sequence for the same set of names.
- With several retained events, a new subscriber receives them in completion order — the order in which each event's `emit()` call returned, not the order in which the calls started. The two coincide only when no `emit()` call is nested inside another. Nesting is not a corner case: any listener that itself calls `emit()` before returning — most commonly a forwarding listener, `on(upstream, downstream)`, relaying one event onto another — reverses completion order relative to start order for the events involved. See below.
- String and symbol event names both work.
- Since v6.0.0, `eventNames` is validated atomically before anything changes: a value that is not a string or a symbol, an empty array, or an array with a hole all throw an `Error` with `Error.cause` set to `'invalid-name'`, `'empty-names'` or `'sparse-names'` respectively — the same three causes `on()` / `once()` use for the equivalent shapes. **`retain(ε, [])` used to be a silent no-op; it now throws** (`Error.cause: 'empty-names'`), which is the behavior change worth knowing about if code ever called `retain()` with an empty, possibly-empty, or otherwise unchecked array. `retain(ε, 42)` used to file a policy under `42` that no `emit()` could ever fill — `getRetainedEventNames(ε)` reported it forever after — and now throws instead. See [`docs/migration.md` → `retain()` / `unretain()` / `retainClear()` reject a non-name, an empty array or a sparse array of event names](./migration.md#retain--unretain--retainclear-reject-a-non-name-an-empty-array-or-a-sparse-array-of-event-names) for the grep pattern.

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

### A listener that throws on a replay

Since v6.0.0 every queued replay runs in its own `try`/`catch`. A listener that
throws while a retained value is being replayed to it does not end the batch —
and an `async` listener that rejects is treated the same way, see
[below](#an-async-listener-that-rejects-on-a-replay):

- the remaining replays still run, in the same order they were sorted into
  before the first one started;
- the throw is reported through `console.warn`, prefixed `[eventize]`, with the
  event name and the error object — it is not rethrown, and there is no other
  hook for it. The library binds this call to `console.warn` once, at module
  load, so replacing `console.warn` afterwards — a log-capture setup, a Sentry
  wrapper, `jest.spyOn(console, 'warn')` — does not redirect it; the
  replacement has to be in place before `@spearwolf/eventize` is first
  imported;
- `on()` and `once()` return their handle as usual, for the complete
  registration the call made.

```javascript
retain(ε, ['a', 'b']);
emit(ε, 'a', 'A');
emit(ε, 'b', 'B');

const unsubscribe = on(ε, ['a', 'b'], (value) => {
  if (value === 'A') throw new Error('boom');
  console.log(value);
});
// => [eventize] a retained replay threw; the batch continues. event: a Error: boom
// => "B"
// `unsubscribe` covers both names and works
```

This is the one place where a throwing listener is swallowed. During an `emit()`
it propagates to the caller that *caused* the event, which is where the
decision about it belongs. A replay has no such caller: whoever called `on()`
did not produce the value, may not know the emitter retains anything, and their
listeners are already registered by the time a replay runs — so letting the
throw out handed them a half-served batch and no handle for subscriptions that
existed either way. Up to v5.1.0 that is exactly what happened, and `off()` was
the only way back out.

One consequence for `once()`: the one shot is spent *after* the listener
returns, so a replay that throws settles nothing. The next replay of the same
batch finds the obligation still open and calls the listener again — a `once()`
that fires twice for one subscription. If every replay of the batch throws, the
`once()` stays armed for the next real `emit()`. Same rule as [a throwing
`once()` during `emit()`](./lifecycle.md#a-once-is-only-spent-when-something-was-actually-called),
seen through a batch instead of a single dispatch.

One thing to know before reading a warning as a diagnosis: the catch covers
everything a replay sets off synchronously, not just the replayed listener. If
that listener emits another event and *its* handler throws, the throw is caught
here as well and reported under the name that was being replayed. The logged
error object is what says where it actually came from.

### An `async` listener that rejects on a replay

An `async` listener returns a promise before it fails, so the `try`/`catch`
around its replay never sees the failure. Since v6.0.0 the replay watches the
returned value instead: anything with a `then` gets a rejection handler, and a
rejection is reported through the same `console.warn`, with the replayed event
name and the rejection reason.

```javascript
retain(ε, 'cfg');
emit(ε, 'cfg', {});

on(ε, 'cfg', async () => {
  throw new Error('boom');
});
// => [eventize] a retained replay rejected; the batch continues. event: cfg Error: boom
```

Up to v5.1.0 this was an unhandled rejection, which under Node's default
`--unhandled-rejections=throw` ends the process — at a call site that had done
nothing but subscribe. Two things follow from the report being asynchronous:
the batch itself never waits, because the replay returned long before the
rejection arrived, and a `once()` counts its one shot as spent, because the
listener returned normally as far as the dispatch could tell.

This covers the replay only. During an `emit()` a rejecting listener is still
the caller's business — `emit()` makes no isolation promise, and `emitAsync()`
is the form that hands the promises back.

### A handler that changes retained state mid-batch

Since v6.0.0 every queued replay asks the emitter what it holds at the moment
that replay runs. A handler that unretains something while an earlier name of
the same batch is being replayed to it is therefore heard immediately:

```javascript
retain(ε, ['a', 'b']);
emit(ε, 'a', 'A');
emit(ε, 'b', 'B');

on(ε, ['a', 'b'], (value) => {
  console.log(value);
  if (value === 'A') unretain(ε, 'b'); // or retainClear(ε, '*'), or off(ε)
});
// => "A"
// 'b' is never delivered
```

Up to v5.1.0 the batch was a full snapshot, so `'B'` still arrived — while
`off(ε)` in the same place did stop it, because that detaches the listeners.
Two spellings of "stop delivering this to me", opposite directions. They now
agree.

The same rule decides the payload: a name re-emitted from inside a replay
replays the *new* value, not the one the batch was built with.

```javascript
retain(ε, ['a', 'b']);
emit(ε, 'a', 'A');
emit(ε, 'b', 'B1');

on(ε, ['a', 'b'], (value) => {
  console.log(value);
  if (value === 'A') emit(ε, 'b', 'B2');
});
// => "A"
// => "B2"   ← live, both names are already registered
// => "B2"   ← 'b's own queued replay, up to date (was "B1" until v6.0.0)
```

Only the values follow along. Which names take part is decided when the batch
is built — a name retained for the first time from inside a replay does not
join it — and the order is fixed before the first replay runs, so a value
rewritten mid-batch keeps its place instead of moving to the end.

### Notes

- Events emitted **before** `retain()` was called are not stored.
- Calling `retain()` repeatedly for the same event is idempotent.
- New wildcard (`*`) subscribers also receive retained events.
- A throwing listener leaves the previously retained value untouched — the retain write happens after all listeners have run.
- Re-subscribing an identity that is already registered replays nothing. A second `on(ε, 'foo', listenerObject)` only raises the reference count, and the retained value is not delivered again. A `once()` landing on that same identity *does* get the replay, because the obligation it creates is new. Plain function listeners never aggregate, so two `on(ε, 'foo', fn)` calls both replay.

### Retain order under nested `emit()`

The previous point — the retain write sits *after* dispatch — has a
consequence that reaches well past self-recursion: **any** `emit()` call
that runs to completion while nested inside another — a listener calling
`emit()` before it returns, on any target and any event name — writes its
retained state before the call that contains it does. Completion order is
inside-out, the reverse of start order, for every pair of events caught up
in a nesting. The ordinary way this happens is forwarding: a listener that
relays one event as another, whether onto the same object or onto a
downstream emitter (`on(upstream, downstream)` — see
[README → Forwarding events between emitters](../README.md#forwarding-events-between-emitters)).
No shared event name and no
self-reference are required, just one `emit()` call that hasn't returned
yet when another one starts:

```js
const ε = eventize();
retain(ε, 'a');
retain(ε, 'b');

on(ε, 'a', () => emit(ε, 'b', 'B')); // 'a' forwards to 'b'

emit(ε, 'a', 'A');

const seen = [];
// a wildcard function listener never receives the event name — a
// listener-object with .emit() does, and is also the catch-all fallback for
// names it has no method for
on(ε, {emit: (name, value) => seen.push([name, value])});

console.log(seen);
// => [['b', 'B'], ['a', 'A']]
// 'b' retained first (the inner, forwarded call), 'a' second (the outer
// call) — even though 'a' was emitted first and 'b' only as a consequence
// of it
```

Self-recursion — a listener re-emitting the *same* event name before
returning — is the special case where this rule is most surprising, because
here the nested calls share one retained slot instead of two, so only the
last write is visible at all: `emit(ε, 'ping', 0)` with a listener that, on
receiving a value below 2, calls `emit(ε, 'ping', value + 1)` again before
returning. The innermost call (`value === 2`) finishes and writes first,
then each enclosing call overwrites that write as the recursion unwinds, and
the outermost call (`value === 0`) writes last. A subscriber added
afterwards sees `0`, not `2` — the same "after" rule as above, just with
both nested calls competing for the same slot instead of two different
ones:

```js
const ε = eventize();
retain(ε, 'ping');

on(ε, 'ping', (value) => {
  if (value < 2) emit(ε, 'ping', value + 1);
});

emit(ε, 'ping', 0);

on(ε, 'ping', (value) => console.log(value));
// => 0   (the outermost call's args, not the innermost 2)
```

`'*'` is subscribe-only. `retain(ε, '*')` throws, matching `emit()`. On
`unretain()` and `retainClear()` the wildcard means *all retained events*:
`unretain(ε, '*')` drops every retain policy and every retained value,
`retainClear(ε, '*')` drops the values and keeps the policies. An array
containing `'*'` is treated as the wildcard, whatever else it lists.

### Retained payloads are strong references

The keeper stores the emit arguments as they were passed — no copy, no clone.
An event library must not clone payloads, so this is the only sensible
implementation, but it means a single `retain()` on an event that once
carried a large buffer, a DOM node or an object graph keeps that object alive
until the next emit of the same event, until `retainClear()`, or until the
emitter itself is collected. For large payloads, `retainClear(ε, eventName)`
is the antidote and worth calling deliberately.

### Dynamically generated event names

`retain()` with per-entity names — `item:${id}` — is supported, and cleanup is
the caller's job. There is no eviction, no cap and no LRU: an event library
does not get to guess what you still need. What it gives you instead is
visibility and a bulk switch:

```js
getRetainedCount(emitter);        // how many events hold a value
getRetainedEventNames(emitter);   // which names carry a policy
unretain(emitter, '*');           // drop every policy and value
retainClear(emitter, '*');        // drop the values, keep the policies
```

A thousand `retain(ε, 'item-' + n)` rounds leave a thousand entries with their
full payloads. That is not a leak in the library; it is a ledger you opened.

---

## `retainClear(emitter, eventName | eventName[])`

Discards the currently stored value but keeps the retain policy active, so future emissions are retained again.

- Does **not** disable retain — only clears the stored value.
- Throws on a non-eventized object.
- Accepts a single name or an array; string and symbol names both work.
- Since v6.0.0, outside the wildcard form below, `eventNames` is validated atomically the same way `retain()`'s is — see the bullet list under `retain()` above for the cause vocabulary.
- Clearing a non-existent or already-cleared event is a no-op.
- `retainClear(ε, '*')` is the bulk form — it drops **every** stored value and keeps every policy. See the wildcard note under [Retain order under nested `emit()`](#retain-order-under-nested-emit).

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
  console.error(e instanceof TypeError); // => true
  console.error(e.message); // => "retainClear() cannot operate on a non-eventized object — eventize(obj) first, or guard the call with isEventized(obj)"
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
- Since v6.0.0, outside the wildcard form below, `eventNames` is validated atomically the same way `retain()`'s is — see the bullet list under `retain()` above for the cause vocabulary.
- Unretaining an event that was never retained is a no-op.
- `unretain(ε, '*')` is the bulk form — it drops **every** policy and **every** stored value. See the wildcard note under [Retain order under nested `emit()`](#retain-order-under-nested-emit).
- `off(ε)` and `off(ε, '*')` do the same to retained state since v6.0.0, on top of removing every listener; `off(ε, eventName)` matches `unretain(ε, eventName)` for that one name. Reach for `unretain()` when the listeners are supposed to stay subscribed.

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

### Inspecting what's retained

`getRetainedCount(ε)` and `getRetainedEventNames(ε)` (see [README → Inspecting emitter state](../README.md#inspecting-emitter-state)) let you check retained state from the outside instead of reaching into `ε[Symbol.for('eventize')].keeper`. The two report different things on purpose — a name can carry a retain policy without ever having fired — so `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds. Both return `0` / `[]` for a non-eventized object rather than throwing, unlike `retainClear()` and `unretain()`, which throw a `TypeError` naming the function and the remedy (`eventize(obj)` first, or guard the call with `isEventized(obj)`) — and, for an object eventized by an incompatible copy of the library, the differently worded protocol `TypeError` that any call throws which needs the store or the keeper to do its work. The two probes built to answer instead of throwing are the exception: `isEventized(obj)` reports `true` for a foreign marker too, and `getEventizeProtocol(obj)` is exactly how a consumer tells which copy wrote it — the diagnosis for the `TypeError` above, not a second instance of it. `retain()` throws for neither reason — it eventizes the object instead, as the first bullet at the top of this page says. That does not make it throw-free: it does not throw for *that* reason, but the wildcard rejection and the argument validation above still apply, and so do the throws `eventize()` itself carries when the object cannot be eventized at all — a frozen or otherwise non-extensible target, a primitive or `null`, or a marker written by an incompatible copy of the library.
