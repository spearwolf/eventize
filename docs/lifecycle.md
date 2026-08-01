# Lifecycle & cleanup

[← back to README](../README.md)

What an emitter holds, and what actually releases it — the two questions that
matter once an app subscribes and unsubscribes for longer than a single test
run.

Upgrading from v5? See [`docs/migration.md`](./migration.md); this file
describes the current behaviour, not the change.

## What an emitter holds

`eventize(obj)` — and `asEventized(obj)` underneath it — attaches one hidden,
non-enumerable slot keyed by `Symbol.for('eventize')`. Two collaborators live
there:

- **`EventStore`**, the listener registry. One bucket per event name, plus a
  separate bucket for wildcard (`'*'`) listeners.
- **`EventKeeper`**, the retained-events log. It keeps two things apart: the set
  of names carrying a *retain policy*, and the map of names to their last
  *retained value*. A name can be in the first without being in the second —
  retain a name, never emit it, and it carries a policy with nothing to replay
  yet.

That slot needs an extensible object to attach to. `eventize(Object.freeze(obj))`
— and the same for `Object.seal()` and `Object.preventExtensions()` — throws a
`TypeError`:

> eventize() cannot attach to a non-extensible object — eventize before
> freezing, or eventize a wrapper

An object eventized *before* it was frozen is unaffected: the slot already
exists, and every further `eventize()` call is a no-op returning the same
object.

### Retained payloads are strong references

`retain(ε, 'foo'); emit(ε, 'foo', bigObject)` keeps the exact `bigObject`
reference alive in the keeper. A later subscriber gets the same object back,
`===`, not a copy — until the value is overwritten, cleared, or the emitter
itself is collected. Retaining a large buffer or a DOM node pins it for as long
as the keeper lives.

```javascript
const payload = {big: 'buffer-or-dom-node'};
retain(ε, 'foo');
emit(ε, 'foo', payload);

on(ε, 'foo', (received) => {
  console.log(received === payload); // => true — same reference, not a clone
});
```

`retainClear(ε, 'foo')` is the antidote for a large payload, and worth calling
deliberately.

## What each `off()` form releases

`off()` always touches the store. Whether it also touches retained state depends
on the form.

| Form | Listeners removed | Retained state |
| --- | --- | --- |
| `off(ε)` | all | every value **and** every policy — same as `unretain(ε, '*')` |
| `off(ε, undefined)` | all — same branch as `off(ε)`, **not** a no-op | every value and every policy |
| `off(ε, '*')` | all | every value and every policy |
| `off(ε, ['*', …])` — wildcard anywhere in the array | all | every value and every policy; the other names in the array add nothing |
| `off(ε, [null, …])` / `off(ε, [undefined, …])` | all | every value and every policy; the other names add nothing |
| `off(ε, eventName)` | every listener for that name | value **and** policy for that name — same as `unretain(ε, eventName)` |
| `off(ε, [eventName, …])` — no `'*'` in the array | every listener for each listed name | value and policy for each listed name, strings and symbols alike |
| `off(ε, listenerFunc[, context])` | that function, from every event | **untouched** |
| `off(ε, listenerObject)` | every subscription of that object, in both the object-alone and method-name shapes | **untouched** |
| `off(ε, eventName, listenerObject)` | only that object's subscription to that one event | value **and** policy for that name — even when a sibling listener for it survives |
| `off(ε, '*', listenerObject)` | only that object's wildcard subscription; named ones survive | **untouched** — `'*'` can never carry retained state |
| `off(ε, [eventName, …], listenerObject)` | **nothing** | **untouched** — a complete no-op |
| the handle returned by `on()` / `once()` | its own listener(s) only | **untouched** |

Three rows are worth reading twice.

**`off(ε, undefined)` is not a no-op.** `undefined == null`, so it takes the same
branch as the bare `off(ε)` and removes every listener and all retained state.
Cleanup code that forwards a possibly-missing value straight through —
`off(ε, handlers[name])` for a name that was never registered — wipes the whole
emitter instead of doing nothing. Wrapping it in an array does not contain it:
each element is processed on its own, so `off(ε, [null])` and
`off(ε, ['foo', undefined])` hit the same branch. An event-name list assembled at
runtime is the realistic way in — filter it first, or keep the `on()` handle and
call that, which no-ops safely however often it runs.

**`off(ε, eventName, listenerObject)` unretains the whole name.** It narrowly
removes one listener object's subscription to that event, and drops the retained
value and policy for the name *entirely*. Any sibling listener still subscribed
keeps running on future emits — nothing is unsubscribed out from under it — but
the *next* listener to subscribe gets no replay. This is the one place where the
narrowest removal form has the widest effect on retained state, and it is
deliberate rather than overlooked: the branch has been unchanged since the 4.0.0
functional API, and changing it now would be breaking.

**`off(ε, [eventName, …], listenerObject)` does nothing at all.** The store has
no array-plus-listener-object form: its array branch only runs when the listener
object is absent, so with one given it falls through to a listener-identity
lookup that an array can never match. The keeper follows the same condition. The
call reads as "detach this object from these events" and has never been a
supported way to do it — use `off(ε, [names])` without the object, or
`unretain(ε, [names])`.

See [`docs/off.md`](./off.md) for the full signature reference and
[`docs/retain.md`](./retain.md) for `retain()` itself.

## Retain semantics

`retain(ε, eventName)` behaves like a `ReplaySubject(1)` per event name — each
name gets its own one-slot buffer, independent of every other name's.

- `off(ε, name)` does not merely clear the retained *value*; it drops the retain
  *policy* too, so future emits of that name are not retained until `retain()` is
  called again. `unretain(ε, name)` does the same thing under a clearer name.
- `unretain(ε, '*')` and `retainClear(ε, '*')` are the bulk forms. The former
  drops every policy and every value; the latter drops only the values, leaving
  every policy in place so the next emit of each name is retained again.
- `retain(ε, '*')` throws. `'*'` is subscribe-only, on `retain()` exactly as on
  `emit()`. Subscribing a wildcard listener is unaffected; only asking the keeper
  to retain `'*'` itself is rejected.

```javascript
retain(ε, ['a', 'b', 'c']);
emit(ε, 'a', 1);
emit(ε, 'b', 2);

unretain(ε, '*'); // drops every policy and every value
getRetainedCount(ε); // => 0
getRetainedEventNames(ε); // => []
```

## Dynamically generated names

Retaining events under generated names — per-request IDs, per-entity IDs — is a
supported pattern, and the keeper does not second-guess it: no eviction, no cap,
no TTL. An event library has no way to know which generated name is still needed
and which was abandoned an hour ago, and guessing wrong in either direction is
worse than not guessing. The keeper grows by exactly one entry per distinct name
retained and emitted, however often that name is re-emitted afterwards:

```javascript
for (let i = 0; i < 500; i++) {
  retain(ε, `item-${i}`);
  emit(ε, `item-${i}`, {i});
}
getRetainedCount(ε); // => 500 — one entry per distinct name

for (let i = 0; i < 100; i++) {
  emit(ε, 'item-0', i); // re-emitting the same name does not grow the keeper
}
getRetainedCount(ε); // still 500
```

Cleanup is the caller's job. `unretain(ε, '*')` is the blunt instrument;
`unretain(ε, name)` (or `off(ε, name)`) targets one entry. Use
[`getRetainedCount(ε)`](#verifying-cleanup) to catch growth in a test, and
[`getRetainedEventNames(ε)`](#verifying-cleanup) to see which names are still
held when it does.

## Which handles to keep

`on()` and `once()` both return an `UnsubscribeFunc`, which is exactly
`() => void`. It carries no properties; the call is the whole API.

Calling a handle releases references on two levels, and only the second is
conditional:

- **The emitter, unconditionally.** The handle closes over the emitter it was
  created against, and that capture is nulled on the first call. A handle kept in
  an array after teardown no longer pins the emitter — nor, through it, the
  store, the keeper, or any retained payload under any event name. A `once()`
  handle gets there without being called at all: the dispatch that discharges
  its obligation nulls the capture, so a `once()` that has fired holds nothing
  from that moment on, teardown loop or no teardown loop.
- **The listener, when nothing is left holding it.** An `on()` handle decrements
  the persistent reference count; a `once()` handle discharges its own
  obligation. Either can leave the listener standing — a shared `on()`
  registration at `refCount > 0`, or another pending `once()` obligation — and
  the listener is only actually removed once both are empty. When it is,
  everything it held is nulled: the listener function or object, its context,
  and the once() settlement hook.

Nulling the capture doubles as the consumed flag, which is what makes each
handle single-shot: a second call finds nothing to release and does nothing. That
matters because `on()` de-duplicates and `once()` aggregates onto the same
identity — several handles can share one registration, and a handle called
twice, or a `once()` handle called after its obligation already discharged,
must not take a sibling's registration down with it.

This makes the common pattern safe:

```javascript
const subs = [];
subs.push(on(ε, 'foo', service));
subs.push(once(ε, 'bar', service));
// ... later, on teardown:
subs.forEach((unsubscribe) => unsubscribe());
// every handle in `subs` now holds nothing
```

> [!WARNING]
> **A handle you have not spent pins the emitter — by design.**
> The array above is exactly as leaky as any other array of live references if
> `forEach` is never run. The one exception is a `once()` whose event actually
> fired: discharging its obligation releases the handle's capture, so it holds
> nothing afterwards without anyone calling it. A `once()` that ends any other
> way never reaches that discharge — `off(ε, 'foo')` before the event fires
> detaches the listener and leaves the handle pinning the emitter.
> Call your handles on teardown, or use `off(ε, listenerObject)`,
> which removes every matching registration in one go regardless of how many
> handles they were split across.

### Reference counting decides when a listener is really released

Two `on()` calls for the same `(eventName, priority, listener, context)` share
one listener with `refCount = 2` (see
[`docs/off.md` → Reference counting](./off.md#reference-counting)). The *first*
handle's call only decrements; the listener is detached when the *last*
outstanding handle calls back:

```javascript
const h1 = on(ε, 'foo', service); // refCount = 1
const h2 = on(ε, 'foo', service); // same subscription → refCount = 2

h1();
getSubscriptionCount(ε); // => 1 — the shared listener is not detached yet
h1();
getSubscriptionCount(ε); // => 1 — a consumed handle is inert

h2();
getSubscriptionCount(ε); // => 0 — only now released
```

The retention window belongs to the *registration*, not to the handle. Until the
count reaches zero, `service` stays reachable through the still-registered
listener. What does *not* keep it alive is `h1` itself — a consumed handle holds
nothing, so keeping one past teardown is untidy rather than load-bearing.

`once()` aggregates onto the same identity as `on()` (since v6.0.0): two
`once()` calls, or a `once()` next to an existing `on()`, land on one listener.
Each `once()` call adds its own *obligation* rather than a second listener, and
the store — not either handle — discharges every pending obligation on a
listener together, in a batch, from inside the dispatch that first reaches it:

```javascript
const u1 = once(ε, 'foo', service); // one obligation
const u2 = once(ε, 'foo', service); // a second obligation, same listener

emit(ε, 'foo'); // => called once — both obligations discharge in this dispatch
u1(); // no-op — already discharged
u2(); // no-op — already discharged
```

A handle called before its obligation discharges releases only that one, and
never touches a registration an `on()` is still holding:

```javascript
const h = on(ε, 'foo', service);   // refCount = 1
const u = once(ε, 'foo', service); // one obligation, same listener

u();               // releases the obligation by hand — it never fired
emit(ε, 'foo');    // => called once, through the on() alone
getSubscriptionCount(ε); // => 1 — the on() registration is untouched
```

A listener is only actually detached once nothing is left holding it — no
`on()` registration and no pending `once()` obligation.

### A `once()` is only spent when something was actually called

An event name that matches nothing on the listener object leaves the
subscription — and the reference to that object — in place. That is what makes a
late-bound handler work: supply the method later and the one-shot still fires.
The same applies to a name whose only match is an inherited `Object.prototype`
member, since those do not count as a match: `once(ε, 'toString', {})` stays
subscribed. A listener object carrying an `.emit()` method is answered by that
fallback and released as usual.

The same rule holds when the call happened but threw. A throwing listener *did*
get called, but the store only discharges the pending obligation after `apply()`
returns, and a throw never returns — so the obligation, and the subscription it
sits on, survives the exception and fires again on the next matching `emit()`. A
one-shot without a kept handle can turn into a repeat-shot the moment it throws.
Once some later invocation completes normally, the store finally settles the
obligation and — if nothing else is holding the listener — releases it.

If such a name might never be answered, keep the handle and call it on teardown;
`getSubscriptionCount(ε)` shows the difference.

## `onceAsync` and cancellation

`onceAsync(ε, eventName, {signal})` accepts an `AbortSignal`, close to the
`fetch()` shape. Aborting unsubscribes the internal `once()` listener and rejects
the promise — with the signal's `reason` if it has one, otherwise with a
synthesized `AbortError` `DOMException`.

```javascript
const controller = new AbortController();
const promise = onceAsync(ε, 'never-fires', {signal: controller.signal});

controller.abort();
await promise; // rejects — name: 'AbortError'
getSubscriptionCount(ε); // => 0 — the listener is gone
```

Without a signal, an `onceAsync()` call on an event that never fires is a leak by
construction: the listener, the `resolve` closure and the caller's entire `await`
continuation stay attached to the emitter for its whole lifetime, and there is
nothing to call `unsubscribe()` on from outside. This is the
unmount-before-event / cancelled-request shape — a component awaits
`onceAsync()`, unmounts before the event arrives, and the promise plus everything
it closed over is pinned until the emitter itself goes away. Pass a signal tied
to the component's own teardown whenever the event might legitimately never come.

## Verifying cleanup

Three functions read emitter state from the outside without reaching into
`ε[Symbol.for('eventize')]`, and all three return a zero-ish value rather than
throwing on a non-eventized object:

- `getSubscriptionCount(ε)` — how many listeners are registered, named plus
  wildcard.
- `getRetainedCount(ε)` — how many event names currently hold a retained *value*.
- `getRetainedEventNames(ε)` — every name carrying a retain *policy*, whether or
  not it has fired. `getRetainedEventNames(ε).length >= getRetainedCount(ε)`
  always holds.

A teardown assertion in this shape catches both halves of emitter state at once:

```javascript
function teardown(component) {
  component.subscriptions.forEach((unsubscribe) => unsubscribe());
  unretain(component.ε, '*');
}

teardown(component);

expect(getSubscriptionCount(component.ε)).toBe(0);
expect(getRetainedCount(component.ε)).toBe(0);
expect(getRetainedEventNames(component.ε)).toEqual([]);
```

The explicit `unretain(ε, '*')` is what makes that teardown work without a bulk
`off()`: calling the handles back only empties the store, so a teardown that
stops there leaves the keeper exactly as full as it was. A single
`off(component.ε)` covers both halves in one call.
