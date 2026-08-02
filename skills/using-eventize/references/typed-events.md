# eventize — typed event maps

Opt-in since v4.1. Pass a generic to `eventize<TEvents>()`, `eventize.inject<TEvents>()`, or `class extends Eventize<TEvents>`; all three surfaces pick the types up automatically — the standalone functions since v4.1, the injected methods and the class since v6.0.0.

```ts
interface ChatEvents {
  message: [from: string, text: string];
  joined: [user: string];
  closed: [];
}

const ε = eventize<ChatEvents>();

on(ε, 'message', (from, text) => {/* from: string, text: string */});

emit(ε, 'message', 'alice', 'hello'); // ✅
emit(ε, 'unknown', 1);                // ❌ unknown event name
emit(ε, 'message', 'alice');          // ❌ missing 'text'

const first = await onceAsync(ε, 'message'); // string — the tuple's first element
```

Listener-objects are checked per method, and unknown keys are rejected:

```ts
on(ε, {
  message(from, text) {/* typed */},
  joined(user) {/* typed */},
  // banana() {}   // ❌ not in the map
});
```

## The inject and class forms

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

## Define the map as a plain interface

```ts
// ✅ keyof stays narrow: 'foo' | 'bar'
interface MyEvents {
  foo: [string];
  bar: [];
}

// ❌ pointless, not dangerous — `EventMap` is `object`, so nothing is
// inherited: keyof stays 'foo' and every narrowing survives. The heritage
// clause and its import buy nothing. What *does* reopen the map is an index
// signature written into it — see "Symbols are an escape hatch" below.
interface MyEventsBad extends EventMap {
  foo: [string];
}
```

The constraint on `TEvents` is deliberately as loose as `object` so a plain interface satisfies it without an index signature. That looseness is the price of strict narrowing.

## Symbols are an escape hatch

Symbol event names are accepted on a typed emitter even when absent from the map, with permissive arguments — useful for private events alongside a typed public surface:

```ts
const PRIVATE = Symbol('private');
const ε = eventize<ChatEvents>();
on(ε, PRIVATE, (...args) => {});  // ✅
emit(ε, PRIVATE, 'anything');     // ✅ permissive
```

Add the symbol to the map (`[PRIVATE]: [reason: string]`) if you want it checked.

## Caveats

- Multi-event `emit(ε, ['a', 'b'], …)` is checked against the **union** of the listed tuples, not a shared one: it compiles as soon as the arguments match at least one listed name, and the runtime then hands the same arguments to every name. `emit(ε, ['message', 'joined'], 'alice')` compiles and dispatches `message` one argument short. Use separate calls when the tuples differ — the compiler will not stop you.
- Multi-event `on()` / `once()` does **not**: since v6.0.0 a common listener compiles even when the tuples differ. Identical tuples keep it positionally typed; differing ones give each parameter the union of all element types, since positional information does not exist for one function serving two shapes.
- Per-event priority tuples (`on(ε, [['a', Priority.High], 'b'], fn)`) work on typed emitters, and names inside tuples are still checked against the map — see `api-details.md`.
- `off()` is intentionally **untyped** against `TEvents` — every parameter accepts `unknown`. Cleanup code routinely handles values of unknown origin, and the runtime is permissive anyway.
- `getSubscriptionCount()` and `EVENT_CATCH_EM_ALL` are diagnostic or structural and carry no event-map typing. `isEventized()` used to be in that group and no longer is: since v6.0.0 it preserves the map of the emitter it narrows, so a typed `emit()` inside the `if` is checked exactly as it is outside.
- The `__TEventsBrand` phantom field on `EventizedObject<T>` exists only at compile time; the symbol isn't exported, so user code can't mismatch it.
- Without a generic, everything falls back to the fully permissive v4 signatures: arbitrary event names, arbitrary args, listener-objects with any method names.
