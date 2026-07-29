---
name: using-eventize
description: Use when code imports `@spearwolf/eventize`, mentions `eventize`/`Eventize`, or when writing/reviewing synchronous event-emitter code using this library (on, once, emit, emitAsync, off, retain). Covers the API surface, the auto-eventize vs strict split, wildcard quirks, retain semantics, priorities, and common pitfalls.
---

# @spearwolf/eventize

A zero-dependency **synchronous** event emitter for any JS/TS object. ESM + CJS,
opt-in generic event maps. Ships unminified (~36 kB ESM); around 4.5 kB once a
bundler minifies it and the transport gzips it.

Deeper material — load only when the task needs it:

| File | Covers |
| --- | --- |
| `references/api-details.md` | every `on()` / `off()` shape, per-event priorities, retain semantics in full |
| `references/lifecycle.md` | what an emitter holds, what each `off()` form releases, handle and `once()` lifetime |
| `references/typed-events.md` | generic event maps, the `EventMap` trap, symbol escape hatch |
| `references/migration.md` | v5 → v6 breaking changes, the v4 → v5 emit change, the v4.3 type-brand migration for classes |

## Mental model

An **emitter** is any object carrying a hidden symbol slot with a listener
registry (`store`) and a retained-event log (`keeper`). Three ways to attach it,
sharing one implementation:

| Style | Create | Call |
| --- | --- | --- |
| Functional (recommended, tree-shakable) | `const ε = eventize(obj?)` | `on(ε, …)`, `emit(ε, …)` |
| Injected methods | `eventize.inject(obj)` | `obj.on(…)`, `obj.emit(…)` |
| Class inheritance | `class X extends Eventize {}` | `this.on(…)`, `this.emit(…)` |

Listeners run **synchronously**, highest priority first. `emitAsync` changes only
how return values are aggregated, never when listeners run. Convention: name
eventized objects `ε` (epsilon).

## API surface

```ts
import {eventize, on, once, onceAsync, emit, emitAsync,
        off, retain, retainClear, unretain, Priority,
        isEventized, asEventized, getSubscriptionCount,
        getRetainedCount, getRetainedEventNames,
        Eventize, EVENT_CATCH_EM_ALL} from '@spearwolf/eventize';
```

| Function | Purpose | Returns |
| --- | --- | --- |
| `on(ε, name?, [prio,] listener[, ctx])` | subscribe | `unsubscribe()` |
| `once(ε, …)` | subscribe, auto-unsub after the first call that actually happens | `unsubscribe()` |
| `onceAsync(ε, name, {signal}?)` | promise resolving on next emit; the optional `AbortSignal` unsubscribes and rejects | `Promise<firstArg>` |
| `emit(ε, name, …args)` | sync dispatch | `void` |
| `emitAsync(ε, name, …args)` | dispatch + collect non-null returns | `Promise<any[] \| undefined>` |
| `off(ε, …)` | unsubscribe; also clears retain for named events, and all retained state on `off(ε)` / `off(ε, '*')` / any array holding a `'*'` or a nullish element | `void` |
| `retain(ε, name)` | replay last value to new subscribers | `void` |
| `retainClear(ε, name)` | drop stored value, keep policy | `void` |
| `unretain(ε, name)` | drop value and policy | `void` |
| `isEventized(obj)` / `eventize.is(obj)` | type guard | `boolean` |
| `asEventized(obj)` | attach the slot only, no API methods | `obj` |
| `getSubscriptionCount(obj)` | listener count, `0` for non-eventized | `number` |
| `getRetainedCount(obj)` | count of events holding a retained value, `0` for non-eventized | `number` |
| `getRetainedEventNames(obj)` | every name carrying a retain policy (fired or not), `[]` for non-eventized | `EventName[]` |
| `Priority` | `Max Critical High Medium Normal Low Min` (higher runs first) | object |
| `EVENT_CATCH_EM_ALL` | the wildcard name, `'*'` | `string` |

Event names are `string` or `symbol`. Anywhere a name is accepted, an array of
names works too. The unsubscribe handle is exactly `() => void` — it carries no
properties, and a second call is inert.

## The four behavior families

How each function treats a target that was never eventized — the single most
common source of surprise:

| Functions | On a non-eventized target |
| --- | --- |
| `on`, `once`, `onceAsync`, `retain` | **auto-eventize** it, then proceed |
| `emit`, `emitAsync` | **duck-type**: `obj[eventName](…args)`, else `obj.emit(eventName, …args)`, else no-op — an inherited `Object.prototype` member is not a match (pitfall 11) |
| `off`, `getSubscriptionCount`, `getRetainedCount`, `getRetainedEventNames` | **permissive**: silent no-op / `0` / `[]`, even for `null` |
| `retainClear`, `unretain` | **throw** `"object is not eventized"` |

`on`-family functions install behavior, so auto-eventizing is a meaningful
reading of the intent. Retain-state mutators have no duck-typed equivalent, so
they still surface typos. `emit()` does not throw on plain objects — for typo
safety use a typed emitter (`eventize<TEvents>()`, which rejects unknown names at
compile time) or an explicit `isEventized()` guard.

## Pitfalls

1. **`'*'` is subscribe-only.** `emit(ε, '*', …)` throws. In an array form, names
   before the `'*'` still dispatch before the throw. `retain(ε, '*')` throws as
   well — an array containing `'*'` throws whatever else it lists. On
   `unretain()` and `retainClear()` the wildcard is not an error but a bulk form:
   it targets every retained event.
2. **Wildcard function listeners never receive the event name** — only the emit
   args. To learn the name, subscribe a listener-object with an
   `.emit(eventName, …args)` method; that method is also the catch-all fallback
   whenever no method matches the event name.
3. **Forwarding needs a real `.emit` method.** `on(upstream, downstream)`
   forwards everything, but only because `eventize.inject()` and
   `class extends Eventize` install `.emit`. Plain `eventize(obj)` does **not** —
   forwarding to such a target silently no-ops.
4. **No cycle detection.** `A → B → A`, or re-emitting the same event from inside
   its own listener, recurses until the stack overflows. Break cycles yourself.
5. **A throwing listener aborts the rest of that dispatch.** Later listeners for
   the same `emit()` don't run, the throwing listener stays subscribed — a
   throwing `once()` therefore fires again — and `retain()` is not updated for
   that emit, because the write happens after all listeners. Wrap risky bodies
   yourself; there is no global error handler by design.
6. **Nested `emit()` retains out of order.** The same after-dispatch write means
   **any** `emit()` nested inside another — not only self-recursion — writes its
   retained state first, innermost call to outermost. The common way in is
   forwarding (pitfall 3): with `retain(ε,'a')` and `retain(ε,'b')`, a listener on
   `'a'` that calls `emit(ε,'b', …)` retains `'b'` before `'a'`. Self-recursion is
   the case that surprises most, because both calls compete for one slot:
   `retain(ε,'ping')` with a listener counting `0 → 1 → 2` by re-emission leaves
   `0` retained, not `2`.
7. **Listener-object forms aggregate across `on()` and `once()` alike;
   functions never do.** `on(ε, 'foo', listenerObj)` twice, `once()` twice, or
   any mixture of the two, all yield one listener for that identity —
   `(eventName, priority, listener, listenerContext)` — dispatched once per
   emit; each `once()` call adds its own obligation, discharged as a batch by
   the first matching dispatch, while an `on()` on the same identity keeps the
   registration alive independently of them. The same *function* subscribed
   twice always fires twice.
8. **`off()` mid-emit** skips listeners that haven't run yet in that dispatch.
9. **`emitAsync()` resolves `undefined`, not `[]`**, when nothing was collected.
   `null`/`undefined` returns are dropped; arrays of promises are flattened via
   `Promise.all`.
10. **`off(ε, name)` unretains that event** — it drops the stored value *and* the
    retain policy, so later emits aren't retained until `retain()` is called
    again. The bulk forms `off(ε)`, `off(ε, '*')` and any array holding a `'*'` or
    a nullish element do the same for *every* retained name. `off(ε, undefined)`
    is one of those bulk forms, not a no-op — forwarding a possibly-missing value
    into `off()` wipes the emitter. The three-argument `off(ε, '*', listenerObject)`
    is the one name-plus-object form that leaves retained state alone.
11. **Event names inherited from `Object.prototype` dispatch to nothing.**
    `toString`, `toLocaleString`, `valueOf`, `constructor`, `hasOwnProperty`,
    `isPrototypeOf`, `propertyIsEnumerable` and V8's `__defineGetter__` family are
    skipped on both dispatch paths when the target only inherits them. Write your
    own method — on the object or on its class — and it dispatches as normal; the
    comparison is against `Object.prototype`'s function by identity, so the one
    own property still skipped is an alias of that very function
    (`{toString: Object.prototype.toString}`). A skipped name falls through to the
    `.emit()` fallback. The method-name form `on(ε, 'evt', 'toString', obj)` is
    exempt — it names what it wants.
12. **`on()` rejects what it cannot dispatch.** The listener slot is type-checked,
    not truthiness-checked: a function, a string, a symbol or a non-null object
    passes, anything else throws. A `NaN` priority throws as well, in every
    position, tuples included, and a `NaN` inside `on(ε, ['a', ['b', NaN]], fn)`
    registers nothing at all. `Priority.Max` / `Priority.Min` (`±Infinity`) and `0`
    stay valid — the test is `Number.isNaN`.

## Idiomatic shape

```ts
import {eventize, on, emit, retain, Priority} from '@spearwolf/eventize';

const bus = eventize();
retain(bus, 'status');
emit(bus, 'status', 'loading');

const unsubscribe = on(bus, 'status', Priority.High, (s) => console.log(s));
// fires immediately with the retained 'loading'

emit(bus, 'status', 'ready');
unsubscribe();
```

## When not to reach for eventize

Async-by-default queuing wants a real message bus. Backpressure or streaming
wants `ReadableStream` or RxJS. A single callback wants to be a callback.
