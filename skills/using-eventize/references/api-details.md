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
on(ε, 'foo', listenerObj, ctx)          // object listener; ctx is the dedup + off() key
on(ε, 'foo', 10, listenerObj, ctx)      // the same, with a priority
on(ε, listenerObj, ctx)                 // the same, catch-all
on(ε, 10, listenerObj, ctx)             // the same, catch-all with a priority
on(ε, 10, 'methodName', obj)            // catch-all method name, with a priority
```

Parsing is positional: a leading `number` means "wildcard with priority"; a `number` in second position means "named event with priority"; a leading `string`/`symbol`/array means a named subscription; anything else is treated as a wildcard listener. Calling `on()` without a resolvable listener throws `"subscribeTo() called with insufficient arguments"` — and "resolvable" is a type test, not a truthiness test: only a function, a string, a symbol or a non-null object gets through, so `on(ε, 'foo', 5)` throws (since v6.0.0) where it used to register a subscription that could never dispatch. An unusable priority throws too, from the same release on (`"subscribeTo() called with a NaN priority"`), in every position a priority can occupy, including inside a `[name, priority]` tuple, where a single bad value rejects the whole call without registering any of the names. The guard is `typeof priority !== 'number' || Number.isNaN(priority)` — it catches `NaN` and, in the tuple slot an untyped call site can reach past the positional `typeof` gate, every other non-number that would poison the sort the same way. `Priority.Max` and `Priority.Min` are `±Infinity` and stay valid: the test is not a finiteness test.

### Why a subscription was rejected

`"subscribeTo() called with insufficient arguments"` covers four distinct mistakes, and the message has been that one string since v4. Since v6.0.0 the specific one rides on `Error.cause`, so a catch block can tell them apart without parsing text or reading the console:

| `Error.cause` | What was wrong | Example |
| --- | --- | --- |
| `'missing-listener'` | The listener slot came out `null` / `undefined` — usually one argument short | `on(ε, 'foo')` |
| `'not-dispatchable'` | A value that is not a function, string, symbol or non-null object | `on(ε, 'foo', 5)` |
| `'empty-method-name'` | A method name of `''` | `on(ε, 'foo', '', obj)` |
| `'empty-names'` | An empty array of event names — zero registrations, so nothing to hand back | `on(ε, [], fn)` |

The NaN-priority rejection is the one throw that is *not* in this family: different message, and no `cause`.

```js
try {
  on(ε, names, handler);
} catch (err) {
  if (err.cause === 'empty-names') {
    // nothing to subscribe to — the name list came out empty
  } else throw err;
}
```

All four are atomic. Nothing is registered before the check, so a rejected call leaves the emitter exactly as it found it — the same guarantee a `NaN` inside one tuple gives for the whole name list.

Forwarding `on()` / `once()` through a wrapper needs `const rawOn = on as SubscribeImpl` — TypeScript refuses to spread a union of tuples into a fixed-arity call, so the public overloads cannot accept `on(target, ...args)` for `args: SubscribeArgs`. `SubscribeImpl` and the eleven named `SubscribeArgs` arms are exported for exactly this.

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

Both the mixed form and typed-emitter support landed in **v5.1** — before that the type demanded a homogeneous array of tuples and typed emitters rejected the form outright. Typed emitters now accept the same shapes, and names inside tuples are still narrowed against the event map — `on(ε, [['nope', 0]], fn)` fails to compile when `nope` isn't a key. A multi-event `emit()` is checked against the union of the listed tuples rather than a shared one — see "Caveats" in `typed-events.md`.

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

The same boundary applies to the duck-typed `emit()` path on non-eventized targets; the two paths move in lockstep so `emitAsync()` aggregates the same way on both. One deliberate exception: the method-name form `on(ε, 'evt', 'toString', obj)` names the method, so it dispatches to the inherited one — that hit is the caller's choice, not an accident. One collision: the event name `'emit'` matches the fallback method, so `emit(obj, 'emit', ...args)` on a target with its own `.emit` takes the first stage and never reaches the fallback — it calls `obj.emit(...args)` without the event name. A target without `.emit` is unaffected (silent no-op).

## `off()` shapes

| Call | Removes |
| --- | --- |
| `off(ε)` | every listener, **and** every retained value + policy (v6.0.0; before that the keeper survived) |
| `off(ε, '*')` | every listener, named and wildcard, **and** all retained state |
| `off(ε, eventName)` | all listeners for that event, **and** its retain value + policy |
| `off(ε, [name1, name2])` | as above for several events; strings and symbols alike. A `'*'`, `null` or `undefined` anywhere in the array makes it the bulk form — everything goes, listeners and retained state |
| `off(ε, listenerFunc)` | that function, across all events and under every context it was registered with — `on(ε, name, fn, ctx)` included. Since v6.0.0; before that a context-bound registration survived |
| `off(ε, listenerFunc, ctx)` | that function, only where it was registered with exactly that context — the narrowing form of the row above. A nullish `ctx` narrows nothing: it *is* the row above, so no spelling reaches only the contextless registration; the `on()` handle is what addresses a single one |
| `off(ε, listenerObject)` | every subscription of that object — object alone, method name, `on(ε, name, fn, obj)`, and, since v6.0.0, `on(ε, name, obj, ctx)` |
| `off(ε, [name, …], listenerObject)` | **nothing** — a complete no-op on listeners *and* retained state. Use `off(ε, [names])` without the object, or `unretain(ε, [names])` |
| `off(ε, eventName, listenerObject)` | that object, on that event only — **and** the event's retain value + policy, even when sibling listeners for the name survive |
| `off(ε, '*', listenerObject)` | that object's **wildcard** subscription only — named subscriptions of the same object survive, and retained state is untouched (`'*'` can never carry any). Since v6.0.0; before that it removed nothing at all |

A **target** that is non-eventized, `null` or `undefined` is a silent no-op, so `off()` is safe in teardown without an `isEventized()` guard. The **second argument** is the opposite: `off(ε, undefined)` and `off(ε, null)` take the same branch as the bare `off(ε)` and wipe every listener and all retained state. Forwarding a possibly-missing value — `off(ε, handlers[name])` for a name that was never registered — empties the emitter instead of doing nothing.

Called from inside a listener, `off()` takes effect immediately for the running dispatch: listeners already invoked are unaffected, listeners not yet reached are skipped.

### Reference counting

Listener-object forms dedupe — `on(ε, name, listenerObject)` and `on(ε, name, 'methodName', listenerObject)` — and, since v6.0.0, so does `once()` on the same identity (below). Registering an identical tuple `(eventName, priority, listener, listenerContext)` through `on()` increments a refcount on the existing entry instead of adding a second listener; each `on()` unsubscribe decrements it, and the listener is only actually removed once nothing — refcount or `once()` obligation — still holds it. Plain function listeners are never deduped, by either call: subscribing the same function twice, through `on()`, `once()`, or a mix, produces two independent listeners that both fire.

A deduped registration does not replay retained events again for an aggregating `on()` — the handler already saw that value. `once()` is different: aggregating onto an existing listener still does replay, because the obligation a `once()` call creates is new even when the listener it lands on is not — without that replay, whether a `once()` fires on a retained event would depend on the incidental existence of an `on()` on the same identity.

**Since v6.0.0, `once()` joins the same identity key `on()` uses, and settles properly there (v5.1.0 folded them but never discharged — see below).** A listener object — or a `(methodName, listenerObject)` pair — subscribed to the same event at the same priority is one registration, however many `on()` and `once()` calls produced it and in whatever order. Each `once()` call adds its own obligation to that listener; the first dispatch that reaches the listener discharges every obligation added before it, in one batch. The listener itself is only detached once nothing is left holding it — no `on()` registration and no pending obligation. That accounting is the *handles'*, and `off()` overrides it: every `off()` form detaches outright without reading either, so one `off(ε, listenerObject)` releases a `refCount`-2 registration and cancels any pending obligation on it in a single call. An `on()` on the same identity keeps the registration alive independently of any `once()` obligations riding on it, and each returned handle releases only what it registered: an `on()` handle decrements the persistent count, a `once()` handle discharges its own obligation (a no-op if a dispatch already did). Up to v5.1.0 the fold already worked in both orders and both handles released fine; what did not work was the settling. Two `once()` calls on one identity collapsed into a registration that never discharged and fired on every emit instead of once — that pair is the only one whose behaviour changed. A `once()` paired with an `on()` was already indistinguishable from correct, because the `on()` was keeping the registration alive anyway.

A multi-name `once()` — `once(ε, ['a', 'b'], h)` — still shares one obligation across every listener it registers, so whichever name fires first discharges it for all of them; that race is unchanged by aggregation, including when one of the names aggregates onto an existing `on()` and the other doesn't.

## `emit()` / `emitAsync()`

```ts
emit(ε, 'name', a, b)
emit(ε, ['name1', 'name2'], a, b)   // same args to each event, in order
const values = await emitAsync(ε, 'load')
```

`emitAsync` collects each listener's return value, dropping `null` and `undefined`. A listener returning an array has its elements awaited with `Promise.all`, but the array stays one entry: a lone listener returning `[1, Promise.resolve(2)]` gives `[[1, 2]]`, not `[1, 2]`. With nothing collected the promise resolves to `undefined` rather than an empty array.

A listener that throws synchronously aborts the dispatch in both functions. In `emitAsync` that throw leaves the call *synchronously* — the function is not `async`, and the dispatch runs before any promise is built — so it is not a rejected promise and `.catch()` on the result cannot see it. Wrap the call, not only the `await`. A listener returning a rejected promise only rejects the awaited result of `emitAsync` — by then every listener has already run, since invocation is synchronous.

**Mixing the two in one dispatch costs the collected values.** `emitAsync` builds its aggregation only after the dispatch returns, so a synchronous throw — from a listener, or from `'*'` inside a name array — never reaches it. The caller gets the throw and nothing else: every value collected up to that point is dropped, and a rejection among them is claimed on the way out, so it is neither reported as unhandled nor observable. Wrap a throwing listener in `try/catch` if the values before it matter.

## The marker slot and its protocol

`asEventized(obj)` — which `eventize()`, `on()`, `once()` and `retain()` all
run for you — defines one property on the target, keyed by
`Symbol.for('eventize')`, holding `{protocol, keeper, store}`. All three
descriptor flags stay `false`: not enumerable (nothing leaks onto the public
surface), not writable, not configurable. That last one means
`delete ε[Symbol.for('eventize')]` throws in strict mode since v6.0.0; up to
v5.1.0 it succeeded silently and left the emitter's listeners and retained
values in collaborators nothing could reach, with the object reading as
non-eventized and the next `on()` quietly building a second, empty set.

`Symbol.for()` registers per realm, so the key is the same for *every* copy of
the library in the process. npm will happily resolve `@spearwolf/eventize@^5`
and `@^6` side by side as soon as one transitive dependent asks for the older
range, and both copies then read the same slot as theirs. Up to v5.1.0 that
mixture worked for a while — `on()` and `emit()` dispatched across the versions
— and then failed calls later from inside the dispatch, with a `TypeError`
naming neither the library nor the cause.

The `protocol` field is checked wherever the internals are read. A mismatch
throws immediately, at the call the caller made:

```
TypeError: two incompatible copies of @spearwolf/eventize are active on this
object (marker protocol undefined, expected 6) — dedupe @spearwolf/eventize in
your dependency tree so a single copy is loaded
```

That covers `on()`, `once()`, `emit()`, `emitAsync()`, `off()`, `retain()` and
the read-only helpers `getSubscriptionCount()` / `getRetainedCount()` /
`getRetainedEventNames()` alike — a plausible-looking `0` from a store nobody
can reach would be worse than the diagnosis. `asEventized()` and `eventize()`
throw it too rather than handing back a foreign emitter.

Two functions deliberately stay quiet:

- `isEventized(obj)` is a type guard and probes the slot only. It answers `true`
  for a foreign marker, because the object *is* eventized — just not by this
  copy.
- `getEventizeProtocol(obj)` returns the number, or `undefined` for anything
  without one, and never throws. It is the tool for diagnosing the situation
  before something else does. `undefined` together with
  `isEventized(obj) === true` means a copy that predates the field (up to
  v5.1.0) owns the object.

The check does not catch the ESM and CJS builds of *one* version loaded against
the same objects: same library, same protocol number. That combination stays
unsupported for a different reason — the module-level counters exist once per
loaded module instance, and a `once()` obligation stamped by one instance never
settles against the other's watermark.

## `retain()` semantics

`retain(ε, name)` makes an event sticky: the **last** emitted args are replayed to every new subscriber, synchronously during `on()`/`once()`/`onceAsync()`. Details that matter:

- Emissions from *before* the `retain()` call are not stored.
- Calling `retain()` again for the same event is idempotent.
- With several retained events, a new subscriber receives them in completion order, not start order — `subscribeTo` buffers them and `EventKeeper.publish()` flushes after registration completes. The two orders coincide only when no `emit()` call is nested inside another; any listener that calls `emit()` (on any event name, not just the one it's handling) before returning nests one call inside another and reverses completion order for the events involved. The common way in is forwarding, `on(upstream, downstream)`, not self-recursion (see below).
- New wildcard subscribers also receive retained events.
- `retainClear(ε, name)` drops the stored value and keeps recording future emits; `unretain(ε, name)` drops the value and the policy. Both throw on non-eventized targets.
- `retain(ε, '*')` throws — the wildcard cannot be retained. On the other two it means *all retained events*: `retainClear(ε, '*')` drops every stored value and keeps every policy, `unretain(ε, '*')` drops both. An array containing `'*'` is treated as the wildcard, whatever else it lists.
- A throwing listener leaves the previously retained value untouched — `keeper.retain()` (`_emitOne` in `eventize-api.ts`) runs after `store.forEach()` returns, i.e. after every listener has run. The same ordering means **any** nested `emit()` call — forwarding to a different event or re-emitting the same one — writes its retain state before the call that contains it: nested calls write on unwind, innermost first, outermost last. Forwarding a chain of distinct events (`retain(ε,'a')`, `retain(ε,'b')`, a listener on `'a'` that calls `emit(ε,'b', …)`) retains `'b'` before `'a'`, reversing the emission order. Self-recursion — re-emitting the *same* name — is the special case where it's most surprising, because both nested calls compete for one slot: `retain(ε,'ping')` plus a listener that counts `0 → 1 → 2` via recursive re-emission leaves `0`, not `2`, retained.

`getRetainedCount(ε)` (`keeper.events.size`) and `getRetainedEventNames(ε)` (`keeper.eventNames`, as an array) expose the keeper's two internal collections without reaching into `ε[Symbol.for('eventize')]`. A name can carry a policy before it has ever fired, so `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds; `unretain(ε, '*')` drains both to `0`/`[]`, `retainClear(ε, '*')` only drains the count. Like `getSubscriptionCount()`, both return `0`/`[]` — never throw — for a non-eventized target.
