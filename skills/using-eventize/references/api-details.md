# eventize — API details

Full argument shapes for the overloaded functions. Load when a call doesn't type-check or a dispatch order surprises you.

## `on()` / `once()` shapes

Both take identical arguments. An optional priority `number` always sits between the event name(s) and the listener.

```ts
on(ε, 'foo', listener)                  // simple
on(ε, 'foo', Priority.High, listener)   // with priority
on(ε, 'foo', listener, ctx)             // listener called with this === ctx
on(ε, 'foo', 'methodName', obj)         // calls obj.methodName(…args)
on(ε, 'foo', listenerObj)               // calls listenerObj.foo(…args)
on(ε, ['foo', 'bar'], listener)         // one listener, several events
on(ε, listenerObj)                      // wildcard: listenerObj.<eventName>() per event
on(ε, listener)                         // wildcard function, same as on(ε, '*', listener)
on(ε, Priority.Low, listener)           // wildcard with priority
```

Parsing is positional (`_subscribeTo` in `src/subscribeTo.ts`): a leading `number` means "wildcard with priority"; a `number` in second position means "named event with priority"; a leading `string`/`symbol`/array means a named subscription; anything else is treated as a wildcard listener. Calling `on()` without a resolvable listener throws `"subscribeTo() called with insufficient arguments"`.

`once()` with several event names removes the listener after the **first** of them fires.

### Per-event priorities

Elements of the array form may be `[eventName, priority]` tuples, mixed freely with bare names. A tuple's priority overrides the call-level one for that event:

```ts
on(ε, [['foo', Priority.Critical], 'bar'], listener);
// 'foo' at Critical, 'bar' at the default priority

on(ε, [['foo', Priority.Critical]], Priority.High, listener);
// the tuple wins over the call-level Priority.High
```

The type is `OnEventNames = EventName | Array<EventName | EventNameWithPriority>`, mirroring the per-element `Array.isArray()` check in `_subscribeTo`. `EventNameWithPriority` is exported as `[eventName: EventName, priority: number]`.

Both the mixed form and typed-emitter support landed in **v5.1** — before that the type demanded a homogeneous array of tuples and typed emitters rejected the form outright. Typed emitters now accept the same shapes, and names inside tuples are still narrowed against the event map — `on(ε, [['nope', 0]], fn)` fails to compile when `nope` isn't a key. As with any multi-event call, all listed events must share one argument tuple.

### `Priority` values

| Name | Value | Legacy alias |
| --- | --- | --- |
| `Max` | `+Infinity` | — |
| `Critical` | `1e9` | `AAA` |
| `High` | `1e6` | `BB` |
| `Normal` | `0` | `Default` |
| `Low` | `-1e4` | — |
| `Min` | `-Infinity` | — |

`C` (`1e3`) also survives as a legacy alias. Higher runs first; the default is `Normal`. Equal priorities keep insertion order.

### Listener-object dispatch

For a listener-object, eventize resolves the method at **emit** time: `listener[eventName]` if it's a function, otherwise `listener.emit(eventName, …args)` as catch-all. A matching named method always wins over `.emit()`. This resolution is what makes emitter-to-emitter forwarding work, and it applies to named subscriptions too — `on(ε, 'foo', obj)` calls `obj.emit('foo', …)` when `obj.foo` isn't a function.

A wildcard listener-object counts as a **single** subscription in `getSubscriptionCount()`, no matter how many event-named methods it exposes.

## `off()` shapes

| Call | Removes |
| --- | --- |
| `off(ε)` | every listener |
| `off(ε, '*')` | every listener, named and wildcard |
| `off(ε, eventName)` | all listeners for that event, **and** its retain value + policy |
| `off(ε, [name1, name2])` | as above for several events; strings and symbols alike |
| `off(ε, listenerFunc)` | that function, across all events |
| `off(ε, listenerFunc, ctx)` | that function bound to that context |
| `off(ε, listenerObject)` | every subscription of that object |
| `off(ε, eventName, listenerObject)` | that object, on that event only |

Non-eventized targets, `null`, and `undefined` are silent no-ops, so `off()` is safe in teardown without an `isEventized()` guard.

Called from inside a listener, `off()` takes effect immediately for the running dispatch: listeners already invoked are unaffected, listeners not yet reached are skipped.

### Reference counting

Only listener-object forms dedupe — `on(ε, name, listenerObject)` and `on(ε, name, 'methodName', listenerObject)`. Registering an identical tuple `(eventName, priority, listener, listenerContext)` increments a refcount on the existing entry instead of adding a second listener; each unsubscribe decrements, and removal happens at zero. Plain function listeners are never deduped: subscribing the same function twice produces two independent listeners that both fire.

## `emit()` / `emitAsync()`

```ts
emit(ε, 'name', a, b)
emit(ε, ['name1', 'name2'], a, b)   // same args to each event, in order
const values = await emitAsync(ε, 'load')
```

`emitAsync` collects each listener's return value, dropping `null` and `undefined`. Arrays are flattened with `Promise.all`, so a listener returning `[1, Promise.resolve(2)]` contributes `[1, 2]`. With nothing collected the promise resolves to `undefined` rather than an empty array.

A listener that throws synchronously aborts the dispatch in both functions. A listener returning a rejected promise only rejects the awaited result of `emitAsync` — by then every listener has already run, since invocation is synchronous.

## `retain()` semantics

`retain(ε, name)` makes an event sticky: the **last** emitted args are replayed to every new subscriber, synchronously during `on()`/`once()`/`onceAsync()`. Details that matter:

- Emissions from *before* the `retain()` call are not stored.
- Calling `retain()` again for the same event is idempotent.
- With several retained events, a new subscriber receives them in original emission order — `subscribeTo` buffers them and `EventKeeper.publish()` flushes after registration completes.
- New wildcard subscribers also receive retained events.
- `retainClear(ε, name)` drops the stored value and keeps recording future emits; `unretain(ε, name)` drops the value and the policy. Both throw on non-eventized targets.
- A throwing listener leaves the previously retained value untouched — the retain write happens after all listeners have run.
