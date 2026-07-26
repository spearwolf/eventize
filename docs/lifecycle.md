# Lifecycle & cleanup

[← back to README](../README.md)

What an emitter holds, and what actually releases it — the two questions that matter once an app subscribes and unsubscribes for longer than a single test run. Every claim below has an assertion behind it in [`src/lifecycle.spec.ts`](../src/lifecycle.spec.ts). This describes the **v6.0.0** state, with two breaking changes against v5.2.0: `off(ε)` and `off(ε, '*')` now clear retained state as well as listeners, where they used to clear only the store, and `once()` no longer shares `on()`'s reference-counted de-duplication (`MEM-002`, described below).

## What an emitter holds

`eventize(obj)` (and `asEventized(obj)` underneath it) attaches one hidden, non-enumerable slot keyed by `Symbol.for('eventize')`. Two collaborators live there:

- **`EventStore`** — the listener registry. One bucket per event name, plus a separate bucket for wildcard (`'*'`) listeners.
- **`EventKeeper`** — the retained-events log. `eventNames` is the set of names carrying a *retain policy*; `events` is the map of names to their last *retained value*. A name can be in the first without being in the second — retain a name, never emit it, and it carries a policy with nothing to replay yet.

Retained payloads are held by **strong reference, not cloned**. `retain(ε, 'foo'); emit(ε, 'foo', bigObject)` keeps the exact `bigObject` reference alive in the keeper — a later subscriber gets the same object back, `===`, not a copy — until the value is overwritten, cleared, or the emitter itself is garbage collected. Retaining a large buffer or a DOM node pins it for as long as the keeper does.

```javascript
const payload = {big: 'buffer-or-dom-node'};
retain(ε, 'foo');
emit(ε, 'foo', payload);

on(ε, 'foo', (received) => {
  console.log(received === payload); // => true — same reference, not a clone
});
```

## What each `off()` form releases

`off()` always touches the store; whether it also touches the keeper's retained state depends on the exact form. The "everything" forms (`off(ε)`, `off(ε, undefined)`, `off(ε, '*')`, and any array containing `'*'`) wipe both halves — store and keeper — since v6.0.0. Beyond those, the distinction that trips people up runs the other way from what you'd guess: **`off(ε, eventName, listenerObject)` — the one form that carries both an event name and a listener object — reaches the keeper and unretains that name, even though it only removes a single listener's subscription.** The remaining forms follow whether they carry a *concrete* event name at all: the two bare-name forms (`off(ε, eventName)`, `off(ε, [eventName, …])`) unretain; the listener-only forms do not.

| Form                                       | Listeners removed                                          | Retained state                                                                          |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `off(ε)`                                    | all                                                          | every value **and** every policy dropped — same as `unretain(ε, '*')`                     |
| `off(ε, undefined)`                         | all — same branch as `off(ε)`, **not** a no-op               | every value and every policy dropped                                                       |
| `off(ε, '*')`                                | all (same as `off(ε)`)                                       | every value and every policy dropped                                                       |
| `off(ε, ['*', …])` — wildcard anywhere in the array | all (the store recurses into its own wipe branch)       | every value and every policy dropped — the other names in the array add nothing            |
| `off(ε, eventName)`                          | every listener for that name                                  | value **and** policy dropped for that name — same as `unretain(ε, eventName)`             |
| `off(ε, [eventName, …])` — no `'*'` in the array | every listener for each listed name                        | value and policy dropped for each listed name (string and symbol names alike)              |
| `off(ε, listenerFunc[, context])`            | that function (with that context, if given), from every event | **untouched**                                                                              |
| `off(ε, listenerObject)`                     | every subscription of that object, both the object-alone and method-name shapes | **untouched**                                                                     |
| `off(ε, eventName, listenerObject)`          | only that object's subscription to that one event               | value **and** policy dropped for that name — even if a sibling listener for the *same* name is left subscribed |
| the `unsubscribe`/`unsubscribe()` handle from `on()`/`once()` | its own listener(s) only                          | **untouched** — it isn't an event-name form                                                |

> [!DANGER]
> **`off(ε, undefined)` is not a no-op.** `undefined == null`, so it takes the exact same branch as the bare `off(ε)` and removes **every** listener on the emitter. Cleanup code that forwards a possibly-missing handle property straight through — `off(ε, maybeHandle.listener)` — wipes the whole emitter the moment that property is `undefined`, instead of doing nothing. Guard the call, or pass the handle itself and let it no-op safely on repeat calls.

The row worth pausing on is `off(ε, eventName, listenerObject)`: it narrowly removes one listener object's subscription to that name, but it drops the retained value and policy for the name *entirely*. Any sibling listener still subscribed to that name keeps running on future emits exactly as before — nothing is unsubscribed out from under it — but the *next* listener to subscribe to that name gets no replay, because the retained state it would have replayed from is gone.

> [!IMPORTANT]
> **The bulk `off()` forms clear retained state as of v6.0.0.** Up to v5.2.0 the bare and wildcard forms only emptied the store: every retained value and every retain policy survived, so the call that reads as "reset the emitter" was precisely the one that pinned the payloads and still replayed them to the next subscriber. `off(ε)`, `off(ε, '*')` and `off(ε, ['*', …])` now wipe store and keeper together — the array form worst of all before, since it removed every listener but unretained only the names listed beside the `'*'`, leaving the rest pinned. Code that relied on retained values surviving a bulk `off(ε)` must re-`retain()` and re-`emit()`, or switch to the targeted `off(ε, eventName)` / `off(ε, [names])` forms, which are unchanged as long as no `'*'` appears in the array. The explicit `unretain(ε, '*')` after an `off(ε)` is now redundant, not wrong.
>
> **`off(ε, eventName, listenerObject)` unretaining the whole name is not scheduled to change.** Unlike the gap above, this branch has been unchanged since the 4.0.0 functional API; fixing it now would be a breaking change to a release that isn't one. Treat it as permanent, not as a bug to wait out.

See [`docs/off.md`](./off.md) for the full signature reference and [`docs/retain.md`](./retain.md) for `retain()` itself.

## Retain semantics

`retain(ε, eventName)` behaves like a `ReplaySubject(1)` per event name — each name gets its own one-slot buffer, independent of every other name's.

- `off(ε, name)` doesn't merely clear the retained *value*, it drops the retain *policy* too — future emits of that name are not retained again until `retain()` is called for it once more. `unretain(ε, name)` does the same thing under a clearer name.
- `unretain(ε, '*')` and `retainClear(ε, '*')` are the bulk forms: the former drops every retain policy and every retained value; the latter drops only the values, leaving every policy in place so the next emit of each name is retained again.
- `retain(ε, '*')` throws — `'*'` is subscribe-only, on `retain()` exactly as it is on `emit()`. Subscribing a wildcard listener (`on(ε, '*', fn)`) is unaffected; only asking the keeper to retain `'*'` itself is rejected.

```javascript
retain(ε, ['a', 'b', 'c']);
emit(ε, 'a', 1);
emit(ε, 'b', 2);

unretain(ε, '*');           // drops every policy and every value
getRetainedCount(ε);         // => 0
getRetainedEventNames(ε);    // => []
```

## Dynamically generated names

Retaining events under generated names — per-request IDs, per-entity IDs — is a supported pattern, and the keeper does not second-guess it: no eviction, no cap, no TTL. An event library has no way to know which generated name is still needed by the application and which was abandoned an hour ago; guessing wrong in either direction (evicting something still in use, or never freeing something dead) is worse than not guessing at all. The keeper grows by exactly one entry per distinct name retained and emitted, however many times that name is re-emitted afterwards:

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

Cleanup is the caller's job. `unretain(ε, '*')` is the blunt instrument; `unretain(ε, name)` (or `off(ε, name)`) targets one entry. Use [`getRetainedCount(ε)`](#verifying-cleanup) to catch growth in a test, and [`getRetainedEventNames(ε)`](#verifying-cleanup) to see exactly which names are still held when it does.

## Which handles to keep

Both `on()` and `once()` return an `UnsubscribeFunc` — a callable function object also carrying `.listener` (single-event forms) or `.listeners` (multi-event-name array form), typed and populated identically for both functions. Calling a handle whose listener has actually been removed from the store releases every reference it was holding — the listener function or object, the listener object's context, and the `callAfterApply` hook — all nulled via `EventListener.detach()`. This makes the common pattern safe:

```javascript
const subs = [];
subs.push(on(ε, 'foo', service));
subs.push(once(ε, 'bar', service));
// ... later, on teardown:
subs.forEach((unsubscribe) => unsubscribe());
// every handle in `subs` now holds no reference to `service` or its listener
```

A handle that is never called keeps its listener (and, transitively, whatever the listener closes over) alive for as long as the emitter itself is reachable — the array in the example above is exactly as leaky as any other array of live references if `forEach` is never run.

> [!NOTE]
> **"Calling a handle releases its references" is qualified by reference counting — for `on()`.** Two `on()` calls for the same `(eventName, priority, listener, context)` share one `EventListener` with `refCount = 2` (see [`docs/off.md` → Reference counting](./off.md#reference-counting)); `once()` is exempt and always registers its own. The *first* handle's `.listener()` call only decrements the count — it does not detach, and does not null the listener reference, until the *last* outstanding handle for that shared listener calls back too:
>
> ```javascript
> const h1 = on(ε, 'foo', service); // shared EventListener, refCount = 1
> const h2 = on(ε, 'foo', service); // same subscription, refCount = 2
>
> h1();
> // getSubscriptionCount(ε) is still 1 — h1.listener.listener is NOT null yet
> h2();
> // getSubscriptionCount(ε) is now 0 — only now is the reference released
> ```
>
> Holding on to `h1` after calling it, expecting it to have released `service`, is a retention window in exactly the pattern the "consumed handle" claim above is meant to rule out. If a listener object may be subscribed more than once, only the *last* handle's callback marks the true release point.

> [!NOTE]
> **`once()` is exempt from de-duplication (since v6.0.0).** Calling `once()` twice for the same event name on the same listener object creates two independent one-shot subscriptions: two firings on the first `emit()`, two retained-value replays if the event is retained, and two handles that each release exactly their own listener. Up to v5.2.0 the second call bumped the first listener's reference count instead, while the auto-unsubscribe hook accounted for a single firing — one emit took the count from 2 to 1 and the surviving handle's idempotence guard stopped it ever reaching 0. That listener fired on every subsequent `emit()` and could only be removed with an external `off(ε, listenerObject)` (`MEM-002`). If you upgrade from v5.x and relied on two `once()` calls collapsing into one, use a single `once()`.

## `onceAsync` and cancellation

`onceAsync(ε, eventName, {signal})` accepts an `AbortSignal`, close to the `fetch()` shape. Aborting unsubscribes the internal `once()` listener and rejects the promise — with the signal's `reason` if it has one, otherwise with a synthesized `AbortError` `DOMException`.

```javascript
const controller = new AbortController();
const promise = onceAsync(ε, 'never-fires', {signal: controller.signal});

controller.abort();
await promise; // rejects — name: 'AbortError'
getSubscriptionCount(ε); // => 0 — the listener is gone
```

Without a signal, an `onceAsync()` call on an event that never fires is a leak by construction: the listener, the `resolve` closure, and the caller's entire `await` continuation stay attached to the emitter for its whole lifetime, with no handle available to release them — there is nothing to call `unsubscribe()` on from outside. This is exactly the unmount-before-event / cancelled-request shape: a component awaits `onceAsync()`, unmounts before the event ever arrives, and the promise (plus everything it closed over) is pinned until the emitter itself goes away. Pass a signal tied to the component's own teardown (an `AbortController` aborted on unmount) whenever the event might legitimately never come.

## Verifying cleanup

Three functions read emitter state from the outside without reaching into `ε[Symbol.for('eventize')]` directly, and all three return a zero-ish value (`0` or `[]`) rather than throwing when called on a non-eventized object:

- `getSubscriptionCount(ε)` — how many listeners are currently registered (named + wildcard).
- `getRetainedCount(ε)` — how many event names currently hold a retained *value*.
- `getRetainedEventNames(ε)` — every event name carrying a retain *policy*, whether or not it has fired yet. Always `getRetainedEventNames(ε).length >= getRetainedCount(ε)`.

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

The explicit `unretain(ε, '*')` is what makes that teardown work without a bulk `off()`: calling the handles back only empties the store, so a teardown that stops there leaves the keeper exactly as full as it was. A single `off(component.ε)` covers both halves in one call.
