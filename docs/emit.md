# Dispatch: emit, emitAsync, emitSafe, emitSafeAsync, emitStrict, emitStrictAsync

Six functions dispatch an event. They differ in two dimensions only: whether
they collect what listeners return, and what happens when a listener throws.

| Function | Collects return values | A throwing listener | Returns |
| --- | --- | --- | --- |
| `emit()` | no | aborts the dispatch | `void` |
| `emitAsync()` | yes | aborts the dispatch | `Promise<any[] \| undefined>` |
| `emitSafe()` | no | is isolated and reported to the console | `void` |
| `emitSafeAsync()` | yes | is isolated and reported to the console | `Promise<any[] \| undefined>` |
| `emitStrict()` | no | is isolated and raised to the caller | `void` |
| `emitStrictAsync()` | yes | is isolated and raised to the caller | `Promise<any[] \| undefined>` |

`emitSafe()` and `emitSafeAsync()` arrived in v6.1.0, `emitStrict()` and
`emitStrictAsync()` in v6.2.0. `emit()` is still the default, and nothing about
it changed.

## What a guarded dispatch guarantees

> Execution: no listener can prevent the others from running.

All four guarded functions promise that and nothing more. What they differ in
is where the failure goes afterwards — the console, or your `catch`.

```javascript
const calls = [];

on(ε, 'foo', () => calls.push('first'));
on(ε, 'foo', () => {
  throw new Error('boom');
});
on(ε, 'foo', () => calls.push('third'));

emitSafe(ε, 'foo'); // does not throw; console.warn reports the failure

console.log(calls); // => ["first", "third"]
```

Priorities are unaffected: the walk continues where it was, so a listener
scheduled behind the throwing one runs in its normal position.

`emitSafe()` hands you no error object. A caught throw goes to `console.warn`
with the event name and the error, and nowhere else. That is the right trade
for a broadcast nobody is waiting on, and the wrong one for a dispatch whose
caller has to report — which is what the strict pair is for.

### The call's own errors are not a listener's

The guard covers what a listener does. It does not cover an error in the call
itself, and there is one of those: **`'*'` as an event name.** `emitSafe(ε, '*')`
throws exactly as `emit()` does — the wildcard is reserved for subscribing, and
the rejection lands before any listener runs. Inside a name array the same
rejection is reached in order instead of up front: the names ahead of the `'*'`
dispatch first, and then the call throws.

A caller's own error stays a caller's error. The strict pair keeps that
distinction and drops nothing on the way: the rejection joins the failures the
dispatch had already collected, as the last entry, instead of erasing them.

## What changes versus `emit()`

Three behaviours, all intended, and all four guarded functions share them.

**The retained value is written.** `emit()` writes it after every listener has
run, so a throw skips the write and the previously retained value survives.
Under a guarded dispatch nothing unwound, the event was delivered, and the
write happens:

```javascript
retain(ε, 'foo');
on(ε, 'foo', () => {
  throw new Error('boom');
});

emitSafe(ε, 'foo', 42);
on(ε, 'foo', (value) => console.log(value)); // => 42
```

Under `emit()` that late subscriber would receive nothing. Under `emitStrict()`
it receives the value *and* the caller receives the error — the write happens
before the failures are raised.

**A `once()` queued behind a throwing listener is spent**, because it now runs.
Under `emit()` it never got the chance, so it stayed subscribed.

**The throwing listener keeps its own subscription** — under every one of the
six. The one-shot of a `once()` is settled after its callback returns, and a
throw never gets there. A throwing `once()` therefore fires again on the next
dispatch, guarded or not.

## When you need both halves

`emitSafe()` buys execution by spending the error. `emitStrict()` buys both:

```javascript
const calls = [];

on(ε, 'foo', () => calls.push('first'));
on(ε, 'foo', () => {
  throw new Error('boom');
});
on(ε, 'foo', () => calls.push('third'));

emitStrict(ε, 'foo'); // throws "boom" — after all three listeners ran

console.log(calls); // => ["first", "third"]
```

What it raises depends on how much failed:

| Failures | `emitStrict()` |
| --- | --- |
| none | returns normally |
| one | throws it unchanged — same error, same stack, no wrapping |
| two or more | throws an `AggregateError` holding them in dispatch order |

The single-failure rule is worth more than it looks. It is what lets you
replace `emit()` with `emitStrict()` without rewriting a single
`toThrow('boom')` assertion: the behaviour only changes once a *second*
listener fails, which under `emit()` could not happen at all.

```javascript
on(ε, 'foo', () => {
  throw new Error('first');
});
on(ε, 'foo', () => {
  throw new Error('second');
});

try {
  emitStrict(ε, 'foo');
} catch (err) {
  console.log(err.errors.map((e) => e.message)); // => ["first", "second"]
}
```

A caller's own error joins that list rather than pre-empting it.
`emitStrict(ε, '*')` still throws the plain `Error` the wildcard has always
thrown, because it is the only entry. `emitStrict(ε, ['foo', '*'])` dispatches
`'foo'`, keeps whatever its listeners threw, and then reports both — the
wildcard rejection last. The names behind the `'*'` still do not run.

## The async half

`emitSafeAsync()` isolates synchronous throws and keeps `Promise.all` for the
aggregation. A listener returning a rejected promise still rejects the awaited
result.

That is the guarantee drawn where it belongs rather than a gap. Dispatch is
synchronous: by the time any promise rejects, every listener has already run.
A rejection prevents no execution.

What the guarded variants do fix is the loss `emitAsync()` takes on a
synchronous throw. `emitAsync()` builds its aggregation only after the dispatch
returns, so a throw mid-walk means the caller gets the exception and nothing
else — every value collected up to that point is dropped. Under
`emitSafeAsync()` the walk finishes and those values survive:

```javascript
on(ε, 'load', () => 'first');
on(ε, 'load', () => {
  throw new Error('boom');
});
on(ε, 'load', () => Promise.resolve('third'));

await emitSafeAsync(ε, 'load'); // => ["first", "third"]
await emitAsync(ε, 'load');     // throws "boom", collected values lost
```

With nothing collected, all four async functions resolve to `undefined` rather
than to an empty array.

### `emitStrictAsync()`: every rejection, and one channel

`Promise.all` is fail-fast. Of *n* rejected listener promises the caller sees
exactly one — whichever rejected **first in time**, not first in dispatch
order — and the other reasons are simply unreported. For `emitAsync()` and
`emitSafeAsync()` that is fine: by then every listener has run, so a rejection
prevents nothing. For a function whose whole contract is "report everything" it
is a hole.

So `emitStrictAsync()` aggregates with `Promise.allSettled`, on the outer
collection and on the inner unwrap of a listener that returned an array of
promises. Three things follow:

- **The failure order is deterministic.** Synchronous throws first — they all
  happened before any promise settled — then the rejections in dispatch order,
  not in settle order.
- **There is no partially-filled result array.** If anything failed, the promise
  rejects and no array is produced. Success resolves exactly what `emitAsync()`
  would have resolved, or `undefined`.
- **It waits for the slowest listener promise.** A rejection is only reported
  once every promise has settled. `Promise.all` already waits that long for the
  success case, so this extends an existing property rather than adding one.

```javascript
on(ε, 'destroy', () => Promise.reject(new Error('slow')));  // rejects last
on(ε, 'destroy', () => Promise.reject(new Error('fast')));  // rejects first

await emitAsync(ε, 'destroy');       // rejects with "fast" — "slow" is lost
await emitStrictAsync(ε, 'destroy'); // rejects with AggregateError
                                     // ["slow", "fast"] — dispatch order
```

**The returned promise is the only error channel.** `emitStrictAsync()` never
throws synchronously. Not for a wildcard name, not for a foreign protocol
marker, not for a corrupted bucket — all of it rejects instead, through the
same one-or-many rule.

```javascript
emitStrictAsync(ε, '*').catch(report); // rejects; nothing is thrown
emitSafeAsync(ε, '*');                 // throws, synchronously
```

The reasoning is the one the platform already settled: a function that returns
a promise should not also throw, because a caller cannot handle both with one
construct. `await emitStrictAsync(…)` inside a `try` catches either, but
`emitStrictAsync(…).catch(report)` catches only the rejection — and that is the
idiomatic call in exactly the place this variant is for, a teardown that fires
the event, collects, and does not block on it. `fetch()` rejects on a malformed
URL rather than throwing for the same reason.

`emitAsync()` and `emitSafeAsync()` keep throwing synchronously. Changing them
would be breaking, and their contract is not "report everything".

## Name arrays and the wildcard

All six functions accept an array of event names and dispatch them in order,
passing the same arguments to each. A `'*'` inside such an array is rejected
when the walk reaches it, not before: the names ahead of it have already
dispatched.

```javascript
emitSafe(ε, ['foo', '*']); // dispatches 'foo', then throws
```

This is identical across all six. What differs is only where the rejection
lands: `emit()`, `emitAsync()`, `emitSafe()` and `emitSafeAsync()` throw it at
you, `emitStrict()` adds it to the failures it collected, and
`emitStrictAsync()` puts it in the rejection.

## Which one to reach for

**`emit()` by default.** A throwing listener is usually a bug, and an exception
that unwinds into your call is the fastest way to find out about it.

**`emitSafe()` for fan-out to independent subscribers**, where no single one of
them owns the others: frame ticks, plugin dispatch, broadcast notifications.
The listeners have no relationship to each other, so one failing is not a
reason to skip the rest — and nobody is waiting on a report.

**`emitStrict()` where the caller has to report.** A teardown that must
dismantle everything and then hand its own caller everything that went wrong;
a batch step that may not stop at the first failure but may not lose one
either. This is the shape you would otherwise hand-roll around every listener,
which the listener-object and method-name subscription forms cannot express at
all.

**A `try/catch` in the listener body** where exactly one listener needs a policy
the others don't — a retry, a fallback value, a specific error to swallow.
Eventize keeps no global error handler by design, so error policy stays visible
at the site that owns it.

**The choice is not free, and the cost is not local.** The guarded and
unguarded dispatches are two different callbacks reaching the same call site
inside the walk — one place in the whole library, shared by every emitter in
the process. A program that never calls a guarded variant only ever sends one
callback through it and pays nothing, measurably nothing: such a program stays
inside the spread of its own baseline. The moment anything in the process calls
`emitSafe()` or `emitStrict()` once, that site sees two, and **every** `emit()`
in the process pays the surcharge — measured at roughly **+29%** on a
64-listener dispatch, about 2 ns per listener. It applies to emitters that code
never touches, and it is transitive: a dependency calling a guarded variant a
single time taxes its host's unrelated `emit()` calls, invisibly.

The step is paid once, not per variant. `emitStrict()` rides the same guarded
callback as `emitSafe()` — the difference between them is where the caught
error goes, not how it is caught — so a program using both pays what a program
using one pays. Measured: an `emit()` loop after 1e5 `emitStrict()` calls lands
on the `emitSafe()` figures rather than beside them.

So reach for a guarded variant where the isolation is worth it, not by default
— and if you publish a library, know that the choice is one your consumers
cannot see.
