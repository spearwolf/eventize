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

That leaves the method surfaces narrow in a different place than the standalone functions, and the difference runs the other way from what the shared interface suggests. On `ε.on()` and `this.on()` every form carrying no event name stays open — a catch-all function, a listener-object alone — and a listener-object passed _with_ an event name has its name checked and its method names not. The standalone `on()` closes all of that: its guard sits on the `obj` parameter, which resolves to `never` for a typed emitter and takes the whole loose overload set with it, so what survives is `on(ε, name, fn)`, `on(ε, [names], fn)` (with or without a priority) and `on(ε, listenerObject)` — and that last one is typed as `EventListenerMethods<TEvents>`, so its method names _are_ checked.

So `on(ε, {banana() {}})` is a compile error while `ε.on({banana() {}})` and `this.on({banana() {}})` are accepted, unreachable subscriptions. The same split covers `on(ε, fn)`, `on(ε, 'message', obj)`, `on(ε, 'message', 'method', obj)` and `on(ε, 'message', fn, thisArg)`: all four are `never` errors on the standalone spelling and legal on the two method surfaces. Closing them there would take the catch-all listener-object subscription away from typed maps entirely, which is a larger design question than the guard; it is accepted rather than fixed.

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

// ❌ pointless, not dangerous — `EventMap` is `object`, so this inherits
// nothing. `keyof MyEventsBad` is still 'foo' and every narrowing survives;
// the heritage clause and its import just buy you nothing.
interface MyEventsBad extends EventMap {
  foo: [string];
}
```

The constraint on `TEvents` is intentionally as loose as `object` so a plain interface satisfies it without an index signature. This is the price of strict narrowing.

What *does* widen `keyof` back to `string | symbol` is an index signature written into the map itself — `[key: string]: any[]`. That is a deliberate escape hatch, covered above, and it reopens every loose overload along with the names.

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

- Multi-event-name calls to `emit(ε, ['a', 'b'], …)` on typed emitters are checked against the *union* of the listed tuples, not against a shared one: the call compiles as soon as the arguments match at least one listed name. `emit(ε, ['message', 'joined'], 'alice')` type-checks and then dispatches `'message'` one argument short, because the runtime hands the same arguments to every name. Only arguments fitting none of the listed events are rejected. Use separate `emit()` calls when the tuples differ — not because the compiler stops you, but because it will not.
- `on()` and `once()` are the other way round, deliberately: since v6.0.0 a common listener for several names compiles even when the tuples differ. Identical tuples keep the listener positionally typed; differing ones give every parameter the union of all element types, because positional information genuinely does not exist for one function serving two shapes. Per-event priority tuples (`on(ε, [['a', Priority.High], 'b'], fn)`) work on typed emitters either way, and the names inside the tuples are still checked against the map.
- The `__TEventsBrand` phantom field on `EventizedObject<T>` is a compile-time-only contrivance: it's never present at runtime and the symbol is not exported, so user code can't accidentally mismatch it.
- `getSubscriptionCount(ε)` and `EVENT_CATCH_EM_ALL` are intentionally untyped against `TEvents` — they are diagnostic or structural and don't depend on the event map. Untyped is not the same as usable, though: `EVENT_CATCH_EM_ALL` is `'*'`, which no typed map declares, so `on(ε, '*', fn)`, `ε.on('*', fn)` and both spelled with the constant are compile errors on a typed emitter. Reach the wildcard through a form that carries no event name — `ε.on(fn)`, or a listener object with an `emit()` member. `isEventized()` is no longer in that group: since v6.0.0 it preserves the map of the emitter it narrows, so a typed `emit()` inside the `if` is checked exactly as it is outside.
- `off(ε, …)` is also intentionally untyped against `TEvents`. Cleanup paths routinely hand off arbitrary values (a saved unsubscribe handle, an event name from a config, a listener object of unknown origin), so `off()` accepts `unknown` for every argument and the runtime decides what to remove. This matches its permissive runtime contract — no type-level surprises in teardown code.

## Wrapping `on()` / `once()`

TypeScript refuses to spread a union of tuples into a fixed-arity call, so no
overload set — however carefully tuned — accepts `on(target, ...args)` for
`args: SubscribeArgs`. Writing a forwarding wrapper therefore needs one cast,
and the package exports the signature to cast to rather than leaving everyone
to invent it:

```ts
import {on} from '@spearwolf/eventize';
import type {SubscribeArgs, SubscribeImpl, UnsubscribeFunc} from '@spearwolf/eventize';

const rawOn = on as SubscribeImpl;

export const subscribe = (target: object, ...args: SubscribeArgs): UnsubscribeFunc =>
  rawOn(target, ...args);
```

`SubscribeImpl` is the implementation signature `on()` and `once()` already
have internally — `src/eventize.ts` makes this exact cast for the inject and
class surfaces. It is not a second API: it performs no narrowing, so a typed
emitter passed through a wrapper built on it is checked by nothing. Where a
wrapper only handles one call shape, name that shape instead: `SubscribeArgs`
is a union of eleven named arms (`NamedFuncArgs`, `NamedPriorityMethodArgs`,
`CatchAllObjectArgs` and their siblings), all exported, so the wrapper's
parameter can say which one it takes and keep its checking.

## Migrating a class-based codebase to v4.3+ types

If `emit(this, …)` inside your own classes stopped type-checking, see [`docs/migration.md`](./migration.md) — it covers the declaration-merge fix and the two call sites that still need a cast.
