---
name: using-eventize
description: Use when code imports `@spearwolf/eventize`, mentions `eventize`/`Eventize`, or when writing/reviewing synchronous event-emitter code using this library (on, once, emit, emitAsync, off, retain). Covers the API surface, the auto-eventize vs strict split, wildcard quirks, retain semantics, priorities, and common pitfalls.
---

# @spearwolf/eventize — Quick Reference

A tiny (~6kb gz), zero-dep, **synchronous** event-emitter library for any JS/TS object. ESM + CJS, full TS types with optional generic event maps.

## Mental model

- **Emitter** = any object made "eventized" (via `eventize(obj)`, `eventize.inject(obj)`, or `class extends Eventize`). Internally attached: a `store` (listener registry) + `keeper` (retained events).
- **Listeners run synchronously** in priority order. `emitAsync` only changes how *return values* are aggregated — invocation is still sync.
- Three API surfaces share the same primitives — pick one, don't mix conceptually:
  | Style | Create | Call |
  |---|---|---|
  | Functional (recommended) | `const ε = eventize(obj?)` | `on(ε, …)`, `emit(ε, …)` |
  | Injected methods | `eventize.inject(obj)` | `obj.on(…)`, `obj.emit(…)` |
  | Class inheritance | `class X extends Eventize {}` | `this.on(…)`, `this.emit(…)` |

> Convention: name eventized objects `ε` (epsilon).

## Core API

```ts
import {eventize, on, once, onceAsync, emit, emitAsync,
        off, retain, retainClear, unretain, Priority,
        isEventized, asEventized, getSubscriptionCount,
        Eventize, EVENT_CATCH_EM_ALL} from '@spearwolf/eventize';
```

| Function | Purpose | Returns |
|---|---|---|
| `on(ε, name?, [prio,] listener)` | subscribe | `unsubscribe()` |
| `once(ε, …)` | subscribe, auto-unsub after first call | `unsubscribe()` |
| `onceAsync(ε, name)` | promise that resolves on next emit | `Promise<firstArg>` |
| `emit(ε, name, …args)` | sync dispatch | `void` |
| `emitAsync(ε, name, …args)` | dispatch + collect non-null returns | `Promise<any[]>` |
| `off(ε, …)` | unsubscribe (many overloads) | `void` |
| `retain(ε, name)` | start replaying last value to new subscribers | `void` |
| `retainClear(ε, name)` | drop stored value, keep retain policy | `void` |
| `unretain(ε, name)` | disable retain entirely | `void` |
| `isEventized(obj)` | type guard | `boolean` |
| `getSubscriptionCount(obj)` | listener count (0 for non-eventized — does NOT throw) | `number` |
| `EVENT_CATCH_EM_ALL` | wildcard symbol (= `'*'`) | `string` |

## Subscribing — `on()` shapes

`on()` is heavily overloaded. All forms accept an optional priority `number` between event name(s) and listener:

```ts
on(ε, 'foo', listener)                      // simple
on(ε, 'foo', Priority.High, listener)       // with priority
on(ε, ['foo', 'bar'], listener)             // multiple events, one listener
on(ε, 'foo', listener, ctx)                 // listener + this-context
on(ε, 'foo', 'methodName', obj)             // call obj.methodName
on(ε, 'foo', listenerObj)                   // call listenerObj.foo()
on(ε, listenerObj)                          // listenerObj.<eventName>() per event
on(ε, listener)                             // wildcard (same as on(ε, '*', listener))
```

**Listener-object form**: an object whose method names match event names. If a method matches the event, it's called. Otherwise, if `listenerObj.emit(eventName, ...args)` exists, it's the **catch-all fallback** — used for forwarding (see below).

## Emitting

```ts
emit(ε, 'name', a, b)
emit(ε, ['name1', 'name2'], a, b)   // multi-event
await emitAsync(ε, 'load')          // resolves when all listener promises settle
```

## Priorities

`Priority.{Max, Critical, High, Normal, Low, Min}` (legacy: `AAA`=Critical, `BB`=High, `Default`=Normal). Higher number → runs first. Default `0` = `Normal`.

## State / retain

`retain(ε, name)` makes an event "sticky": the **last** emitted value is replayed to every new subscriber synchronously, in original emission order across multiple retained events. Works with `once`/`onceAsync` too. `retainClear` drops the stored value but keeps retaining future emits; `unretain` disables retain entirely. Events emitted *before* `retain()` is called are NOT stored.

## ⚠️ Quirks & pitfalls (read these)

1. **Auto-eventize asymmetry — by design**:
   - `on/once/onceAsync/retain` on a plain object → auto-eventizes it.
   - `emit/emitAsync/retainClear/unretain` on a non-eventized object → **throws** `"object is not eventized"`. This catches typos that would otherwise silently no-op.
   - `off` is the exception in the strict family: it accepts any object (including `null`/`undefined`) and **silently no-ops** when there's nothing to remove — safe in cleanup paths without `isEventized()` guards. (`getSubscriptionCount` returns `0` for non-eventized inputs as well.)

2. **`'*'` is subscribe-only.** `emit(ε, '*', …)` throws. Use a concrete name.

3. **Wildcard function listeners do NOT receive the event name** — only the args. To get the name, register a listener-object with an `.emit(eventName, ...args)` method.

4. **Forwarding between emitters**: `on(upstream, downstream)` works because `eventize.inject()` / `class Eventize` install an `.emit()` method that doubles as the catch-all sink. ⚠️ **Plain `eventize(obj)` does NOT install `.emit`** — forwarding to such a target silently no-ops.

5. **No recursion guard**: re-emitting the same event on the same emitter (directly or via a forwarding chain `A → B → A`) is allowed and will recurse until the stack overflows. The v4.2 guard was removed because some valid patterns need same-event re-emission. Break cycles yourself if you build a forwarding chain.

6. **Listener-object de-dup with refcount** — `on(ε, 'foo', listenerObj)` called twice = ONE listener with refcount 2. Each unsubscribe decrements; removed at 0. **Function listeners are NOT deduped** — registering the same function twice fires it twice. Match key: `(eventName, priority, listener, listenerContext)`.

7. **Synchronous error semantics**: a throwing listener aborts the rest of that `emit()`'s dispatch; subsequent listeners do not run; the throwing listener stays subscribed; `retain()` is **not** updated for that emit (write happens after all listeners). Wrap risky listener bodies yourself.

8. **`off()` clears retain for that event** when called with an event name. Quietly important.

9. **`off()` during emit**: already-scheduled listeners continue; not-yet-run listeners for that emit are skipped.

10. **`emitAsync` collects only non-null/undefined returns**; arrays-of-promises are flattened with `Promise.all`.

## Typed events (opt-in, v4.1+)

```ts
interface MyEvents {
  data: [payload: string, code: number];
  close: [];
}
const ε = eventize<MyEvents>();
emit(ε, 'data', 'hi', 42);    // ✅
emit(ε, 'data', 'hi');        // ❌ TS error
emit(ε, 'unknown');            // ❌ TS error
```

Without a generic, behavior is fully permissive (v4 ducktyping preserved).

## Minimal idiomatic example

```ts
import {eventize, on, emit, retain, Priority} from '@spearwolf/eventize';

const bus = eventize();
retain(bus, 'status');
emit(bus, 'status', 'loading');

const off = on(bus, 'status', Priority.High, (s) => console.log('hi:', s));
// fires immediately with retained 'loading'

emit(bus, 'status', 'ready');
off();
```

## When NOT to reach for eventize

- You need async-by-default queuing → use a real message bus.
- You need backpressure / streams → use `ReadableStream` / RxJS.
- You only need a single callback → just pass the function.

## Migration notes: 4.0.x → 4.3.x (strict types)

v4.3 added a unique-symbol brand (`[__TEventsBrand]`, `[NAMESPACE]`) to `EventizedObject<TEvents>`. The function-style API (`on(obj, …)`, `emit(obj, …)`, `retain(obj, …)`, etc.) now requires the first arg to be either a branded `EventizedObject<T>` or assignable to `NonTypedEmitter<T>`. Plain class instances no longer satisfy this — `eventize(this)` runtime-brands the instance but the *type* of `this` stays unbranded, so every subsequent `emit(this, …)` / `on(this, …)` call inside the class fails to type-check.

**Fix without refactoring**: declaration-merge an empty interface that brings in the brand. Per class file:

```ts
import {emit, type EventizedObject, eventize, on, retain} from '@spearwolf/eventize';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MyClass extends EventizedObject {}

export class MyClass {
  constructor() {
    eventize(this);          // unchanged, still required at runtime
    retain(this, 'ready');   // now type-checks
  }
  doStuff() { emit(this, 'ready'); }
}
```

Apply to every class that calls `eventize(this)` (or auto-eventizes via `retain`/`on`/`once` on `this`). Works for classes that already `extends SomeBase` — the merge is independent of the runtime inheritance chain. The brand symbols are non-exported `unique symbol`s, so this declaration-merge is the *only* way (besides `extends Eventize`) to satisfy the constraint without `as any`.

**Two residual call sites that still need help even after the merge:**

1. **Polymorphic-`this` + listener-object form**: `on(this, listenerObj)` fails because TS can't reduce `NonTypedEmitter<this>` when `this` is generic. Cast to the concrete class: `on(this as MyClass, listenerObj)`.
2. **`on.bind(undefined, this, eventName)` patterns**: TS picks a wrong overload (often the priority-as-number one) and rejects the string event name. Cast the function reference: `(on as (...args: unknown[]) => unknown).bind(undefined, this, eventName)`. Don't use `as Function` — ESLint's `no-unsafe-function-type` rejects it.

**Do NOT extend `EventizeApi` instead of `EventizedObject`** — `EventizeApi` carries the public method signatures (`on`, `emit`, `retain`, …) and will collide with any same-named method on the host class (e.g. a class with its own `on()` API method).

**Sanity check after migration**: typecheck → build → tests. Runtime behavior is unchanged; this is purely a type-level adjustment.
