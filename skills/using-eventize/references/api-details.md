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

Parsing is positional (`_subscribeTo` in `src/subscribeTo.ts`): a leading `number` means "wildcard with priority"; a `number` in second position means "named event with priority"; a leading `string`/`symbol`/array means a named subscription; anything else is treated as a wildcard listener. Calling `on()` without a resolvable listener throws `"subscribeTo() called with insufficient arguments"` — and "resolvable" is a type test, not a truthiness test: only a function, a string, a symbol or a non-null object gets through, so `on(ε, 'foo', 5)` throws (since v6.0.0) where it used to register a subscription that could never dispatch. A `NaN` priority throws too, from the same release on (`"subscribeTo() called with a NaN priority"`), in every position a priority can occupy, including inside a `[name, priority]` tuple, where a single `NaN` rejects the whole call without registering any of the names. `Priority.Max` and `Priority.Min` are `±Infinity` and stay valid — the check is `Number.isNaN`, not `Number.isFinite`.

`once()` with several event names removes the listener after the **first** of them fires.

`onceAsync()` takes an optional `{signal}`. Without it, an event that never fires keeps the listener, the resolve closure and the caller's `await` continuation attached to the emitter for as long as the emitter lives — there is no other handle to release them with.

```js
const controller = new AbortController();
try {
  const value = await onceAsync(ε, 'ready', {signal: controller.signal});
} catch (err) {
  if (err.name === 'AbortError') {
    /* cancelled */
  }
}
// somewhere in teardown:
controller.abort();
```

Aborting unsubscribes the internal `once()` and rejects with `signal.reason`, falling back to an `AbortError` `DOMException` whenever the reason is nullish — `abort(null)` lands on the `DOMException` too, where `fetch()` would reject with the bare `null`. An already-aborted signal rejects without subscribing at all; a retained event that resolves synchronously inside `once()` never attaches an abort handler. The option type is exported as `OnceAsyncOptions`, and the option works identically on all three surfaces: `onceAsync(ε, …)`, `ε.onceAsync(…)` after `eventize.inject()`, and `this.onceAsync(…)` in a `class extends Eventize`.

`once()` is only consumed when a listener actually ran. For the object forms — `once(ε, 'foo', obj)` and `once(ε, 'foo', 'methodName', obj)` — a dispatch that finds neither the method nor the `.emit()` fallback leaves the subscription in place, so a late-initialised listener object still gets its one call. The `.emit()` fallback counts as a call and does consume the `once()`. Function listeners are always callable, so they are always consumed. Until v6.0.0 the miss silently burned the subscription.

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
| `Critical` | `1e9` | `AAA` (deprecated) |
| `High` | `1e6` | `BB` (deprecated) |
| `Medium` | `1e3` | `C` (deprecated) |
| `Normal` | `0` | `Default` (deprecated) |
| `Low` | `-1e4` | — |
| `Min` | `-Infinity` | — |

Higher runs first; the default is `Normal`. Equal priorities keep insertion order **within a bucket** — named listeners for one event name, or wildcard listeners, sort stably against their own kind by registration order (`sortByPriorityAndId` breaks a priority tie on ascending `id`). Across the named/wildcard split that guarantee does not hold: `EventStore.forEach()` merges the two buckets by comparing priority alone, so at equal priority the named listener always runs before the wildcard one, regardless of which was registered first. Registering the wildcard first makes that visible; registering the named listener first hides it, because insertion order and the tie-break happen to agree.

The four legacy aliases (`AAA`, `BB`, `C`, `Default`) are marked `@deprecated` on the exported `EventizePriority` interface, so editors strike them through at the point of use. They are not removed and carry the same values as before — `Medium` exists because `C` (`1e3`) sat between `High` and `Normal` with no speaking name of its own.

### Listener-object dispatch

For a listener-object, eventize resolves the method at **emit** time: `listener[eventName]` if it's a function, otherwise `listener.emit(eventName, …args)` as catch-all. A matching named method always wins over `.emit()`. This resolution is what makes emitter-to-emitter forwarding work, and it applies to named subscriptions too — `on(ε, 'foo', obj)` calls `obj.emit('foo', …)` when `obj.foo` isn't a function.

A wildcard listener-object counts as a **single** subscription in `getSubscriptionCount()`, no matter how many event-named methods it exposes.

**Inherited `Object.prototype` members are not a match.** `listener[eventName]` is skipped when it is identical to `Object.prototype`'s member of the same name — `toString`, `toLocaleString`, `valueOf`, `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, plus V8's `__defineGetter__` family. Without that boundary every listener object answers those names: `once(ε, 'toString', {})` was consumed by the first `emit(ε, 'toString')` with no user method running, and `emitAsync(ε, 'toString')` collected `'[object Object]'`. The test compares the resolved member against `Object.prototype`'s function by identity, so a listener-object that defines its own method under that name — own property or anywhere up its prototype chain — dispatches as normal, and a `Object.create(null)` listener object has nothing to skip. Identity is also the limit of the promise: `{toString: Object.prototype.toString}` is an own property and is skipped anyway, because it *is* the inherited function. A skipped name is an unanswered name, so it falls through to `.emit(eventName, …)` — a catch-all listener-object with an `.emit()` method still sees `'toString'`, and a `once()` in that shape is consumed by the fallback, not by the prototype.

The same boundary applies to the duck-typed `emit()` path on non-eventized targets; the two paths move in lockstep so `emitAsync()` aggregates the same way on both. One deliberate exception: the method-name form `on(ε, 'evt', 'toString', obj)` names the method, so it dispatches to the inherited one — that hit is the caller's choice, not an accident.

## `off()` shapes

| Call | Removes |
| --- | --- |
| `off(ε)` | every listener, **and** every retained value + policy (v6.0.0; before that the keeper survived) |
| `off(ε, '*')` | every listener, named and wildcard, **and** all retained state |
| `off(ε, eventName)` | all listeners for that event, **and** its retain value + policy |
| `off(ε, [name1, name2])` | as above for several events; strings and symbols alike. A `'*'`, `null` or `undefined` anywhere in the array makes it the bulk form — everything goes, listeners and retained state |
| `off(ε, listenerFunc)` | that function, across all events |
| `off(ε, listenerFunc, ctx)` | that function bound to that context |
| `off(ε, listenerObject)` | every subscription of that object |
| `off(ε, eventName, listenerObject)` | that object, on that event only — **and** the event's retain value + policy, even when sibling listeners for the name survive |
| `off(ε, '*', listenerObject)` | that object's **wildcard** subscription only — named subscriptions of the same object survive, and retained state is untouched (`'*'` can never carry any). Since v6.0.0; before that it removed nothing at all |

A **target** that is non-eventized, `null` or `undefined` is a silent no-op, so `off()` is safe in teardown without an `isEventized()` guard. The **second argument** is the opposite: `off(ε, undefined)` and `off(ε, null)` take the same branch as the bare `off(ε)` and wipe every listener and all retained state. Forwarding a possibly-missing value — `off(ε, handlers[name])` for a name that was never registered — empties the emitter instead of doing nothing.

Called from inside a listener, `off()` takes effect immediately for the running dispatch: listeners already invoked are unaffected, listeners not yet reached are skipped.

### Reference counting

Only listener-object forms of **`on()`** dedupe — `on(ε, name, listenerObject)` and `on(ε, name, 'methodName', listenerObject)`. Registering an identical tuple `(eventName, priority, listener, listenerContext)` increments a refcount on the existing entry instead of adding a second listener; each unsubscribe decrements, and removal happens at zero. Plain function listeners are never deduped: subscribing the same function twice produces two independent listeners that both fire.

A deduped registration does not replay retained events again — the replay runs only for a genuinely inserted listener, so `on()` on an already-subscribed listener object is a pure refcount bump.

**`once()` is exempt from all of this (v6.0.0).** It passes `noDedup` down to the store, so every call inserts its own listener even when an identical `on()` or `once()` subscription already exists. Consequences: two `once()` calls fire twice and both detach; each returned handle releases exactly its own subscription; and on a retained event both receive the replay, because the insert is genuine in each case. Up to v5.1.0 `once()` shared `on()`'s dedup, and the collapsed listener fired on every emit forever — `MEM-002`.

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
- `retain(ε, '*')` throws — the wildcard cannot be retained. On the other two it means *all retained events*: `retainClear(ε, '*')` drops every stored value and keeps every policy, `unretain(ε, '*')` drops both. An array containing `'*'` is treated as the wildcard, whatever else it lists.
- A throwing listener leaves the previously retained value untouched — the retain write happens after all listeners have run.

`getRetainedCount(ε)` (`keeper.events.size`) and `getRetainedEventNames(ε)` (`keeper.eventNames`, as an array) expose the keeper's two internal collections without reaching into `ε[Symbol.for('eventize')]`. A name can carry a policy before it has ever fired, so `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds; `unretain(ε, '*')` drains both to `0`/`[]`, `retainClear(ε, '*')` only drains the count. Like `getSubscriptionCount()`, both return `0`/`[]` — never throw — for a non-eventized target.
