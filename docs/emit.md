# Dispatch: emit, emitAsync, emitSafe, emitSafeAsync

Four functions dispatch an event. They differ in two dimensions only: whether
they collect what listeners return, and whether a throwing listener stops the
others.

| Function | Collects return values | A throwing listener | Returns |
| --- | --- | --- | --- |
| `emit()` | no | aborts the dispatch | `void` |
| `emitAsync()` | yes | aborts the dispatch | `Promise<any[] \| undefined>` |
| `emitSafe()` | no | is isolated and reported | `void` |
| `emitSafeAsync()` | yes | is isolated and reported | `Promise<any[] \| undefined>` |

`emitSafe()` and `emitSafeAsync()` arrived in v6.1.0. `emit()` is still the
default, and nothing about it changed.

## What a guarded dispatch guarantees

> Execution, not completeness: no listener can prevent the others from running.

That is the whole promise. It is not a promise that nothing went wrong, and it
hands you no error object — a caught throw goes to `console.warn` with the event
name and the error, and nowhere else.

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

### The call's own errors still throw

The guard covers what a listener does. It does not cover an error in the call
itself, and there is one of those: **`'*'` as an event name.** `emitSafe(ε, '*')`
throws exactly as `emit()` does — the wildcard is reserved for subscribing, and
the rejection lands before any listener runs. Inside a name array the same
rejection is reached in order instead of up front: the names ahead of the `'*'`
dispatch first, and then the call throws. Either way the throw comes from the
call rather than from a listener, which is why the guard is not between you and
it.

A caller's own error stays a caller's error.

## What changes versus `emit()`

Three behaviours, all intended.

**The retained value is written.** `emit()` writes it after every listener has
run, so a throw skips the write and the previously retained value survives.
Under `emitSafe()` nothing unwound, the event was delivered, and the write
happens:

```javascript
retain(ε, 'foo');
on(ε, 'foo', () => {
  throw new Error('boom');
});

emitSafe(ε, 'foo', 42);
on(ε, 'foo', (value) => console.log(value)); // => 42
```

Under `emit()` that late subscriber would receive nothing.

**A `once()` queued behind a throwing listener is spent**, because it now runs.
Under `emit()` it never got the chance, so it stayed subscribed.

**The throwing listener keeps its own subscription** — under both functions. The
one-shot of a `once()` is settled after its callback returns, and a throw never
gets there. A throwing `once()` therefore fires again on the next dispatch,
guarded or not.

## The async half

`emitSafeAsync()` isolates synchronous throws and keeps `Promise.all` for the
aggregation. A listener returning a rejected promise still rejects the awaited
result.

That is the guarantee drawn where it belongs rather than a gap. Dispatch is
synchronous: by the time any promise rejects, every listener has already run.
A rejection prevents no execution.

What the guarded variant does fix is the loss `emitAsync()` takes on a
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

With nothing collected, both async functions resolve to `undefined` rather than
to an empty array.

## Name arrays and the wildcard

All four functions accept an array of event names and dispatch them in order,
passing the same arguments to each. A `'*'` inside such an array is rejected
when the walk reaches it, not before: the names ahead of it have already
dispatched.

```javascript
emitSafe(ε, ['foo', '*']); // dispatches 'foo', then throws
```

This is identical across the four, and it is the one throw a guarded dispatch
does not catch.

## Which one to reach for

**`emit()` by default.** A throwing listener is usually a bug, and an exception
that unwinds into your call is the fastest way to find out about it.

**`emitSafe()` for fan-out to independent subscribers**, where no single one of
them owns the others: teardown notifications, frame ticks, plugin dispatch. The
listeners have no relationship to each other, so one failing is not a reason to
skip the rest.

**A `try/catch` in the listener body** where exactly one listener needs a policy
the others don't — a retry, a fallback value, a specific error to swallow.
Eventize keeps no global error handler by design, so error policy stays visible
at the site that owns it.

**The choice is not free, and the cost is not local.** The guarded and unguarded
dispatches are two different callbacks reaching the same call site inside the
walk — one place in the whole library, shared by every emitter in the process.
A program that never calls `emitSafe()` only ever sends one callback through it
and pays nothing, measurably nothing: such a program stays inside the spread of
its own baseline. The moment anything in the process calls `emitSafe()` once,
that site sees two, and **every** `emit()` in the process pays the surcharge —
measured at roughly **+29%** on a 64-listener dispatch, about 2 ns per listener.
It applies to emitters that code never touches, and it is transitive: a
dependency calling `emitSafe()` a single time taxes its host's unrelated
`emit()` calls, invisibly. So reach for `emitSafe()` where the isolation is
worth it, not by default — and if you publish a library, know that the choice
is one your consumers cannot see.
