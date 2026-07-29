# eventize — lifecycle & cleanup

What an emitter holds and what releases it. Load when writing teardown code, or
when something stays subscribed or stays in memory longer than expected.

## What an emitter holds

The hidden `Symbol.for('eventize')` slot carries two collaborators:

- the **listener registry** — one bucket per event name, plus one for wildcard
  (`'*'`) listeners;
- the **retained-event log** — the set of names carrying a retain *policy*, kept
  separate from the map of names to their last retained *value*. A name can carry
  a policy with no value yet: retain it, never emit it.

The slot needs an extensible object. `eventize(Object.freeze(obj))` (and the
`seal` / `preventExtensions` equivalents) throws a `TypeError` naming the cause.
An object eventized *before* it was frozen is unaffected.

**Retained payloads are strong references, not clones.** `retain(ε, 'foo')` plus
`emit(ε, 'foo', bigObject)` keeps that exact reference alive until it is
overwritten, cleared, or the emitter is collected. A later subscriber gets the
same object back, `===`. `retainClear(ε, 'foo')` is the antidote for a large
payload.

## What each `off()` form releases

| Form | Listeners removed | Retained state |
| --- | --- | --- |
| `off(ε)` | all | every value **and** every policy |
| `off(ε, undefined)` | all — same branch as `off(ε)`, **not** a no-op | every value and every policy |
| `off(ε, '*')` | all | every value and every policy |
| `off(ε, ['*', …])` — wildcard anywhere | all | every value and every policy |
| `off(ε, [null, …])` / `off(ε, [undefined, …])` | all | every value and every policy |
| `off(ε, eventName)` | every listener for that name | value **and** policy for that name |
| `off(ε, [eventName, …])` — no `'*'` | every listener for each listed name | value and policy per listed name |
| `off(ε, listenerFunc[, context])` | that function, from every event | untouched |
| `off(ε, listenerObject)` | every subscription of that object, both shapes | untouched |
| `off(ε, eventName, listenerObject)` | only that object, on that one event | value **and** policy for that name — even when a sibling listener survives |
| `off(ε, '*', listenerObject)` | only that object's wildcard subscription | untouched |
| `off(ε, [eventName, …], listenerObject)` | **nothing** | untouched — a complete no-op |
| the `on()` / `once()` handle | its own listener(s) only | untouched |

Three rows to watch:

- **`off(ε, undefined)` wipes the emitter.** `undefined == null`, so it takes the
  bare `off(ε)` branch. Wrapping it in an array does not contain it: each element
  is processed on its own, so `off(ε, ['foo', undefined])` wipes too. A name list
  built at runtime is the realistic way in — filter it, or keep the handle.
- **`off(ε, eventName, listenerObject)` unretains the whole name**, even though it
  detaches one object's subscription and leaves siblings running. Deliberate and
  unchanged since v4.0.0.
- **`off(ε, [eventName, …], listenerObject)` does nothing at all.** The store has
  no array-plus-object form. Use `off(ε, [names])` without the object, or
  `unretain(ε, [names])`.

## Handles

`on()` and `once()` return `() => void`. No properties, and a second call is
inert — which matters because `on()` and `once()` both aggregate onto one
registration, so two handles can share it and a double call must not take the
sibling's down with it.

A call releases two things:

- **the emitter, unconditionally** — the closure's capture is nulled on the first
  call, so a spent handle held in an array pins nothing: not the emitter, not
  the registry, not the retained-event log, not any retained payload;
- **the listener, only when it actually left the store** — if the call merely
  decremented a shared reference count, or discharged one of several pending
  obligations, the listener stays registered and populated.

A `once()` handle has a second way to be spent, and it is the usual one: the
dispatch that discharges its obligation releases the capture too, whether or not
anyone calls the handle. A fired `once()` therefore holds nothing from the
moment it fires.

```js
const subs = [];
subs.push(on(ε, 'foo', service));
subs.push(once(ε, 'bar', service));
// teardown:
subs.forEach((unsubscribe) => unsubscribe());
```

**A handle you have not spent pins the emitter — by design.**
The array above is as leaky as any array of live references if `forEach` never
runs. A `once()` whose event actually fired is the exception: discharging its
obligation releases the handle's capture, so it holds nothing afterwards without
anyone calling it. A `once()` that ends any other way never reaches that
discharge — `off(ε, 'foo')` before the event fires detaches the listener and
leaves the handle pinning the emitter.
`off(ε, listenerObject)` is the alternative: it removes every matching
registration in one call, however many handles they were split across.

### Reference counting decides the real release point

```js
const h1 = on(ε, 'foo', service); // refCount = 1
const h2 = on(ε, 'foo', service); // same subscription → refCount = 2

h1();
getSubscriptionCount(ε); // => 1 — not detached yet
h1();
getSubscriptionCount(ε); // => 1 — a consumed handle is inert

h2();
getSubscriptionCount(ε); // => 0
```

The retention window belongs to the registration, not to the handle: until the
count hits zero, `service` stays reachable through the still-registered listener.
Since v6.0.0 a `once()` on the same identity aggregates onto that very listener
rather than registering its own — it adds a pending obligation instead of a
count, and the listener lives while either is outstanding.

## When a `once()` is actually spent

Only when a dispatch called something. An event name that matches nothing on the
listener object leaves the subscription in place — which is what makes a
late-bound handler work. A name whose only match is an inherited
`Object.prototype` member counts as no match, so `once(ε, 'toString', {})` stays
subscribed. A listener object with an `.emit()` method is answered by that
fallback and released.

A throwing listener *was* called, but the auto-unsubscribe runs after the call
returns and a throw never returns — so a one-shot that throws survives and fires
again on the next matching `emit()`, until one invocation completes normally.

## `onceAsync` cancellation

```js
const controller = new AbortController();
const promise = onceAsync(ε, 'never-fires', {signal: controller.signal});

controller.abort();
await promise; // rejects — name: 'AbortError'
getSubscriptionCount(ε); // => 0
```

Aborting unsubscribes and rejects with the signal's `reason`, or with an
`AbortError` `DOMException` when it has none (including `abort(null)`, where
`fetch()` would hand back the bare `null`). An already-aborted signal rejects
without subscribing.

**Without a signal, an `onceAsync()` on an event that never fires is a leak by
construction**: the listener, the `resolve` closure and the caller's whole
`await` continuation stay attached for the emitter's lifetime, and there is no
handle to release them. Pass a signal tied to the caller's own teardown whenever
the event might legitimately never come.

## Dynamically generated retain names

Supported, with no eviction, no cap and no TTL — the library does not get to
guess which generated name is still needed. The log grows by one entry per
distinct name retained *and* emitted, however often it is re-emitted afterwards.
Cleanup is the caller's job: `unretain(ε, name)` for one, `unretain(ε, '*')` for
all.

## Verifying cleanup

```js
getSubscriptionCount(ε); // listeners registered, named + wildcard
getRetainedCount(ε); // event names holding a retained value
getRetainedEventNames(ε); // every name carrying a retain policy, fired or not
```

`getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds. All three
return `0` / `[]` for a non-eventized object rather than throwing.

Calling handles back only empties the listener registry. A teardown that stops
there leaves the retained-event log exactly as full as it was — add
`unretain(ε, '*')`, or use a single `off(ε)` to cover both halves.
