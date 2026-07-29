# TypeScript: typed event maps

[← back to README](../README.md)

Eventize ships an _opt-in_ generic event map you can pass to `eventize<TEvents>()`, `eventize.inject<TEvents>()`, or `class extends Eventize<TEvents>`. The map describes each event's argument tuple, and the standalone API (`emit`, `on`, `once`, `onceAsync`, `retain`, …) picks the types up automatically when called on a typed emitter.

```ts
import {eventize, emit, on, onceAsync} from '@spearwolf/eventize';

interface ChatEvents {
  message: [from: string, text: string];
  joined: [user: string];
  closed: [];
}

const ε = eventize<ChatEvents>();

// listener arg types are inferred from the map
on(ε, 'message', (from, text) => {
  // from: string, text: string
});

// emit checks the event name and the argument tuple
emit(ε, 'message', 'alice', 'hello'); // ✅
emit(ε, 'joined', 'bob');             // ✅
emit(ε, 'closed');                    // ✅

// emit(ε, 'unknown', 1);             // ❌ "Argument of type '\"unknown\"' is not assignable …"
// emit(ε, 'message', 'alice');       // ❌ missing 'text'
// emit(ε, 'message', 1, 2);          // ❌ wrong tuple

const firstMessage = await onceAsync(ε, 'message');
// firstMessage: string  (the first element of the tuple)
```

A typed listener-object registers several events at once, each method getting its event's argument tuple:

```ts
on(ε, {
  message(from, text) {
    /* from: string, text: string */
  },
  joined(user) {
    /* user: string */
  },
  // banana() {}   // ❌ "Object literal may only specify known properties …"
});
```

The same generic works on the inject and class forms:

```ts
const ε = eventize.inject<ChatEvents>();
ε.emit('joined', 'carol');                // ✅ typed
ε.on('message', (from, text) => {/*…*/}); // ✅ typed

class Chat extends Eventize<ChatEvents> {
  greet(user: string) {
    this.emit('joined', user);            // ✅ typed
  }
}
```

## Defining the event map

Define it as a **plain interface** — _without_ `extends EventMap`:

```ts
// ✅ correct — keyof MyEvents stays narrow ('foo' | 'bar')
interface MyEvents {
  foo: [string];
  bar: [];
}

// ❌ avoid — extending EventMap inherits an index signature, which widens
// keyof MyEvents back to `string | symbol` and defeats the narrowing on
// emit/on/retain.
interface MyEventsBad extends EventMap {
  foo: [string];
}
```

The constraint on `TEvents` is intentionally as loose as `object` so a plain interface satisfies it without an index signature. This is the price of strict narrowing on the standalone API.

## Backwards compatibility & duck-typing

Without a generic, every API behaves exactly like v4.0.x — full duck-typing, arbitrary event names, listener-objects with whatever method names you like:

```ts
const ε = eventize();               // no generic → DefaultEventMap (permissive)
on(ε, 'whatever', (a, b, c) => {}); // any name, any args
emit(ε, 'whatever', 1, 'two', {});  // any args

on(ε, {
  somethingDynamic() {},
  whateverElse() {},
});
```

Plain `{}` passed to `on`, `emit`, etc. continues to work the same way — `on` auto-eventizes, and since v5 `emit` falls back to duck-typing on non-eventized objects (see [_The four behavior families_](../README.md#the-four-behavior-families)).

## Symbol events as an escape hatch

Symbol event names are accepted on typed emitters even when they're not in the map, with permissive arguments. This lets libraries combine a typed surface with private or internal symbol events:

```ts
const PRIVATE = Symbol('private');
const ε = eventize<ChatEvents>();
on(ε, PRIVATE, (...args) => {/*…*/}); // ✅ symbol always allowed
emit(ε, PRIVATE, 'anything');         // ✅ permissive args
```

For strict typing on a symbol event, add it to the map:

```ts
const PRIVATE = Symbol('private');
interface ChatEvents {
  message: [string, string];
  [PRIVATE]: [reason: string];
}
```

## Caveats worth knowing

- Multi-event-name calls (`emit(ε, ['a', 'b'], …)`) on typed emitters require all listed events to share the same argument tuple — that's the typed overload's contract. If they don't, fall back to two separate `emit()` calls.
- Per-event priority tuples (`on(ε, [['a', Priority.High], 'b'], fn)`) work on typed emitters, and the names inside the tuples are still checked against the map. All listed events must share one argument tuple, as with any multi-event call.
- The `__TEventsBrand` phantom field on `EventizedObject<T>` is a compile-time-only contrivance: it's never present at runtime and the symbol is not exported, so user code can't accidentally mismatch it.
- `getSubscriptionCount(ε)` and the lifecycle helpers (`isEventized`, `EVENT_CATCH_EM_ALL`) are intentionally untyped against `TEvents` — they are diagnostic or structural and don't depend on the event map.
- `off(ε, …)` is also intentionally untyped against `TEvents`. Cleanup paths routinely hand off arbitrary values (a saved unsubscribe handle, an event name from a config, a listener object of unknown origin), so `off()` accepts `unknown` for every argument and the runtime decides what to remove. This matches its permissive runtime contract — no type-level surprises in teardown code.

## Migrating a class-based codebase to v4.3+ types

If `emit(this, …)` inside your own classes stopped type-checking, see [`docs/migration.md`](./migration.md) — it covers the declaration-merge fix and the two call sites that still need a cast.
