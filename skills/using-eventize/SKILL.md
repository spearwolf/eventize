---
name: using-eventize
description: Use when code imports `@spearwolf/eventize`, mentions `eventize`/`Eventize`, or when writing/reviewing synchronous event-emitter code using this library (on, once, emit, emitAsync, off, retain). Covers the API surface, the auto-eventize vs strict split, wildcard quirks, retain semantics, priorities, and common pitfalls.
---

# @spearwolf/eventize

A ~5 kB gz, zero-dep, **synchronous** event emitter for any JS/TS object. ESM + CJS, opt-in generic event maps.

Deeper material — load only when the task needs it:

| File | Covers |
| --- | --- |
| `references/api-details.md` | every `on()` / `off()` shape, per-event priorities, retain semantics in full |
| `references/typed-events.md` | generic event maps, the `EventMap` trap, symbol escape hatch |
| `references/migration.md` | v5 → v6 breaking changes, the v4 → v5 emit change, the v4.3 type-brand migration for classes |
| [`../../docs/lifecycle.md`](../../docs/lifecycle.md) | what an emitter holds and what releases it |

## Mental model

An **emitter** is any object carrying a hidden symbol slot with a listener registry (`store`) and a retained-event log (`keeper`). Three ways to attach it, sharing one implementation:

| Style | Create | Call |
| --- | --- | --- |
| Functional (recommended, tree-shakable) | `const ε = eventize(obj?)` | `on(ε, …)`, `emit(ε, …)` |
| Injected methods | `eventize.inject(obj)` | `obj.on(…)`, `obj.emit(…)` |
| Class inheritance | `class X extends Eventize {}` | `this.on(…)`, `this.emit(…)` |

Listeners run **synchronously**, highest priority first. `emitAsync` changes only how return values are aggregated, never when listeners run. Convention: name eventized objects `ε` (epsilon).

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
| `off(ε, …)` | unsubscribe; also clears retain for named events, and all retained state on `off(ε)` / `off(ε, '*')` | `void` |
| `retain(ε, name)` | replay last value to new subscribers | `void` |
| `retainClear(ε, name)` | drop stored value, keep policy | `void` |
| `unretain(ε, name)` | drop value and policy | `void` |
| `isEventized(obj)` / `eventize.is(obj)` | type guard | `boolean` |
| `asEventized(obj)` | attach the slot only, no API methods | `obj` |
| `getSubscriptionCount(obj)` | listener count, `0` for non-eventized | `number` |
| `getRetainedCount(obj)` | count of events holding a retained value, `0` for non-eventized | `number` |
| `getRetainedEventNames(obj)` | every name carrying a retain policy (fired or not), `[]` for non-eventized | `EventName[]` |
| `Priority` | `Max Critical High Normal Low Min` (higher runs first) | object |
| `EVENT_CATCH_EM_ALL` | the wildcard name, `'*'` | `string` |

Event names are `string` or `symbol`. Anywhere a name is accepted, an array of names works too.

## The four behavior families

How each function treats a target that was never eventized — the single most common source of surprise:

| Functions | On a non-eventized target |
| --- | --- |
| `on`, `once`, `onceAsync`, `retain` | **auto-eventize** it, then proceed |
| `emit`, `emitAsync` (v5+) | **duck-type**: `obj[eventName](…args)`, else `obj.emit(eventName, …args)`, else no-op |
| `off`, `getSubscriptionCount`, `getRetainedCount`, `getRetainedEventNames` | **permissive**: silent no-op / `0` / `[]`, even for `null` |
| `retainClear`, `unretain` | **throw** `"object is not eventized"` |

`on`-family functions install behavior, so auto-eventizing is a meaningful reading of the intent. Retain-state mutators have no duck-typed equivalent, so they still surface typos. Since v5, `emit()` no longer throws on plain objects — for typo safety use a typed emitter (`eventize<TEvents>()`, which rejects unknown names at compile time) or an explicit `isEventized()` guard.

## Pitfalls

1. **`'*'` is subscribe-only.** `emit(ε, '*', …)` throws. In an array form, names before the `'*'` still dispatch before the throw. `retain(ε, '*')` throws as well — an array containing `'*'` throws whatever else it lists. On `unretain()` and `retainClear()` the wildcard is not an error but a bulk form: it targets every retained event.
2. **Wildcard function listeners never receive the event name** — only the emit args. To learn the name, subscribe a listener-object with an `.emit(eventName, …args)` method; that method is also the catch-all fallback whenever no method matches the event name.
3. **Forwarding needs a real `.emit` method.** `on(upstream, downstream)` forwards everything, but only because `eventize.inject()` and `class extends Eventize` install `.emit`. Plain `eventize(obj)` does **not** — forwarding to such a target silently no-ops.
4. **No cycle detection.** `A → B → A`, or re-emitting the same event from inside its own listener, recurses until the stack overflows. The v4.2 guard was reverted because it forbade valid patterns. Break cycles yourself.
5. **A throwing listener aborts the rest of that dispatch.** Later listeners for the same `emit()` don't run, the throwing listener stays subscribed, and `retain()` is not updated for that emit (the write happens after all listeners). Wrap risky bodies yourself; there is no global error handler by design.
6. **Listener-objects dedupe under `on()`, functions never do, `once()` never does.** `on(ε, 'foo', listenerObj)` twice yields one listener with refcount 2; each unsubscribe decrements. The same *function* subscribed twice fires twice. Match key: `(eventName, priority, listener, listenerContext)`. Since v6.0.0 `once()` is exempt: every call registers its own listener, so two `once()` calls fire twice, replay a retained value twice, and release independently.
7. **`off()` mid-emit** skips listeners that haven't run yet in that dispatch.
8. **`emitAsync()` resolves `undefined`, not `[]`**, when nothing was collected. `null`/`undefined` returns are dropped; arrays of promises are flattened via `Promise.all`.
9. **`off(ε, name)` unretains that event** — it drops the stored value *and* the retain policy, so later emits aren't retained until `retain()` is called again. Scalar and array forms behave alike for strings and symbols since v5.1; before that, `off(ε, [aSymbol])` left retained state untouched. Since v6.0.0 the bulk forms `off(ε)` and `off(ε, '*')` do the same for *every* retained name — up to v5.2.0 they cleared only listeners and still replayed old payloads to later subscribers.
10. **Events emitted before `retain()` are not stored.** Retain starts recording from the call onwards.

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

Async-by-default queuing wants a real message bus. Backpressure or streaming wants `ReadableStream` or RxJS. A single callback wants to be a callback.
