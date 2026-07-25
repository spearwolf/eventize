# eventize — typed event maps

Opt-in since v4.1. Pass a generic to `eventize<TEvents>()`, `eventize.inject<TEvents>()`, or `class extends Eventize<TEvents>`; the standalone API picks the types up automatically.

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

## Define the map as a plain interface

```ts
// ✅ keyof stays narrow: 'foo' | 'bar'
interface MyEvents {
  foo: [string];
  bar: [];
}

// ❌ extending EventMap inherits an index signature, widening keyof back to
// string | symbol and defeating every narrowing on emit/on/retain
interface MyEventsBad extends EventMap {
  foo: [string];
}
```

The constraint on `TEvents` is deliberately as loose as `object` so a plain interface satisfies it without an index signature. That looseness is the price of strict narrowing on the standalone API.

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

- Multi-event calls (`emit(ε, ['a', 'b'], …)`) require all listed events to share one argument tuple. If they don't, use separate calls.
- Per-event priority tuples (`on(ε, [['a', Priority.High], 'b'], fn)`) work on typed emitters, and names inside tuples are still checked against the map — see `api-details.md`.
- `off()` is intentionally **untyped** against `TEvents` — every parameter accepts `unknown`. Cleanup code routinely handles values of unknown origin, and the runtime is permissive anyway.
- `getSubscriptionCount()`, `isEventized()`, and `EVENT_CATCH_EM_ALL` are diagnostic or structural and likewise carry no event-map typing.
- The `__TEventsBrand` phantom field on `EventizedObject<T>` exists only at compile time; the symbol isn't exported, so user code can't mismatch it.
- Without a generic, everything falls back to the fully permissive v4 signatures: arbitrary event names, arbitrary args, listener-objects with any method names.
