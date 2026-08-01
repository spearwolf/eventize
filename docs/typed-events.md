# TypeScript: typed event maps

[← back to README](../README.md)

Eventize ships an _opt-in_ generic event map you can pass to `eventize<TEvents>()`, `eventize.inject<TEvents>()`, or `class extends Eventize<TEvents>`. The map describes each event's argument tuple, and every surface picks the types up automatically — the standalone functions (`emit`, `on`, `once`, `onceAsync`, `retain`, …) since v4.1, the injected methods and the class since v6.0.0.

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
// ε.emit('joind', 'carol');              // ❌ typo — rejected since v6.0.0

class Chat extends Eventize<ChatEvents> {
  greet(user: string) {
    this.emit('joined', user);   // ✅ typed
    // this.emit('joind', user); // ❌ typo — rejected since v6.0.0
  }
}
```

Since v6.0.0 both method forms reject an event name the map does not declare and an argument tuple that does not match it. Up to v5.1.0 both accepted them: the guard that closes the loose overloads sat on the standalone functions' `obj` parameter, and a method has none. It sits on the event-name slot now. The class needed a second fix — it declared its own `on` / `emit` / … in the class body, and a member declared there wins over the same name inherited from the merged interface, so the loose implementation signature was the public one however well the interface was tuned. The implementations sit on the prototype instead, which leaves the merged interface as the class's only type source.

That leaves the method surfaces narrow in a different place than the standalone functions. A call with no event name to check — a catch-all, or a listener-object alone — stays open on both of them, and a listener-object passed _with_ an event name has its name checked and its method names not. So the `banana()` above is a compile error on the standalone `on()` and an accepted, unreachable subscription on `ε.on()` and `this.on()` alike.

If you want a typed map _and_ dynamic names, say so in the map:

```ts
interface ChatEvents {
  message: [from: string, text: string];
  [key: string]: any[]; // dynamic names stay open
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

The constraint on `TEvents` is intentionally as loose as `object` so a plain interface satisfies it without an index signature. This is the price of strict narrowing.

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

- Multi-event-name calls to `emit(ε, ['a', 'b'], …)` on typed emitters require all listed events to share the same argument tuple — one call carries one set of arguments, so there is nothing else it could mean. If they don't, fall back to two separate `emit()` calls.
- `on()` and `once()` are the other way round, deliberately: since v6.0.0 a common listener for several names compiles even when the tuples differ. Identical tuples keep the listener positionally typed; differing ones give every parameter the union of all element types, because positional information genuinely does not exist for one function serving two shapes. Per-event priority tuples (`on(ε, [['a', Priority.High], 'b'], fn)`) work on typed emitters either way, and the names inside the tuples are still checked against the map.
- The `__TEventsBrand` phantom field on `EventizedObject<T>` is a compile-time-only contrivance: it's never present at runtime and the symbol is not exported, so user code can't accidentally mismatch it.
- `getSubscriptionCount(ε)` and `EVENT_CATCH_EM_ALL` are intentionally untyped against `TEvents` — they are diagnostic or structural and don't depend on the event map. `isEventized()` is no longer in that group: since v6.0.0 it preserves the map of the emitter it narrows, so a typed `emit()` inside the `if` is checked exactly as it is outside.
- `off(ε, …)` is also intentionally untyped against `TEvents`. Cleanup paths routinely hand off arbitrary values (a saved unsubscribe handle, an event name from a config, a listener object of unknown origin), so `off()` accepts `unknown` for every argument and the runtime decides what to remove. This matches its permissive runtime contract — no type-level surprises in teardown code.

## Migrating a class-based codebase to v4.3+ types

If `emit(this, …)` inside your own classes stopped type-checking, see [`docs/migration.md`](./migration.md) — it covers the declaration-merge fix and the two call sites that still need a cast.
