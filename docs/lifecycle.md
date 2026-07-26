# Lifecycle & cleanup

[← back to README](../README.md)

What an emitter holds, and what actually releases it — the two questions that matter once an app subscribes and unsubscribes for longer than a single test run. Every claim below has an assertion behind it somewhere in the spec suite — most in [`src/lifecycle.spec.ts`](../src/lifecycle.spec.ts), which exists specifically to state cleanup as executable assertions, with the rest in [`src/off.spec.ts`](../src/off.spec.ts) (the `off(ε, ['*', …])` wildcard-array row), [`src/once.spec.ts`](../src/once.spec.ts) (`once()` firing twice per registration) and [`src/retain.spec.ts`](../src/retain.spec.ts) (the double-replay of a retained value). This describes the **v6.1.0** state, closing a 35-finding audit against the last released version, `v5.1.0`, plus the follow-up audit that produced `v6.1.0`. The two lifecycle changes with the widest blast radius: `off(ε)` and `off(ε, '*')` now clear retained state as well as listeners, where they used to clear only the store, and `once()` no longer shares `on()`'s reference-counted de-duplication (`MEM-002`, described below). Upgrading from v5? See [Migrating from v5](#migrating-from-v5) below for these and the rest of this release's breaking changes.

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

`off()` always touches the store; whether it also touches the keeper's retained state depends on the exact form. The "everything" forms (`off(ε)`, `off(ε, undefined)`, `off(ε, '*')`, and any array containing a `'*'`, a `null` or an `undefined`) wipe both halves — store and keeper — since v6.0.0. Beyond those, the distinction that trips people up runs the other way from what you'd guess: **`off(ε, eventName, listenerObject)` — the one form that carries both a *concrete* event name and a listener object — reaches the keeper and unretains that name, even though it only removes a single listener's subscription.** The remaining forms follow whether they carry a *concrete* event name at all: the two bare-name forms (`off(ε, eventName)`, `off(ε, [eventName, …])`) unretain; the listener-only forms do not. `off(ε, '*', listenerObject)` reads like the first group and belongs to the second — it removes exactly that object's wildcard subscription, and `'*'` is a name `retain()` rejects, so there is no retained state under it to drop.

| Form                                       | Listeners removed                                          | Retained state                                                                          |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `off(ε)`                                    | all                                                          | every value **and** every policy dropped — same as `unretain(ε, '*')`                     |
| `off(ε, undefined)`                         | all — same branch as `off(ε)`, **not** a no-op               | every value and every policy dropped                                                       |
| `off(ε, '*')`                                | all (same as `off(ε)`)                                       | every value and every policy dropped                                                       |
| `off(ε, ['*', …])` — wildcard anywhere in the array | all (the store recurses into its own wipe branch)       | every value and every policy dropped — the other names in the array add nothing            |
| `off(ε, [null, …])` / `off(ε, [undefined, …])` — nullish anywhere in the array | all (same recursion, same wipe branch) | every value and every policy dropped — the other names in the array add nothing            |
| `off(ε, eventName)`                          | every listener for that name                                  | value **and** policy dropped for that name — same as `unretain(ε, eventName)`             |
| `off(ε, [eventName, …])` — no `'*'` in the array | every listener for each listed name                        | value and policy dropped for each listed name (string and symbol names alike)              |
| `off(ε, listenerFunc[, context])`            | that function (with that context, if given), from every event | **untouched**                                                                              |
| `off(ε, listenerObject)`                     | every subscription of that object, both the object-alone and method-name shapes | **untouched**                                                                     |
| `off(ε, eventName, listenerObject)`          | only that object's subscription to that one event               | value **and** policy dropped for that name — even if a sibling listener for the *same* name is left subscribed |
| `off(ε, '*', listenerObject)`                | only that object's wildcard subscription — named ones survive     | **untouched** — `'*'` can never carry retained state, so the keeper call finds nothing to drop |
| the `unsubscribe`/`unsubscribe()` handle from `on()`/`once()` | its own listener(s) only                          | **untouched** — it isn't an event-name form                                                |

> [!DANGER]
> **`off(ε, undefined)` is not a no-op.** `undefined == null`, so it takes the exact same branch as the bare `off(ε)` and removes **every** listener on the emitter. Cleanup code that forwards a possibly-missing handle property straight through — `off(ε, maybeHandle.listener)` — wipes the whole emitter the moment that property is `undefined`, instead of doing nothing. Guard the call, or pass the handle itself and let it no-op safely on repeat calls.
>
> **Wrapping it in an array does not contain it.** `EventStore.remove()` forwards each element back into itself, so `off(ε, [null])`, `off(ε, [undefined])` and `off(ε, ['foo', undefined])` each hit the same wipe branch — one nullish element takes the whole emitter, and since v6.0.0 the retained state with it. An event-name list assembled at runtime is the realistic way in: `off(ε, ids.map((id) => nameFor(id)))` empties the emitter as soon as one lookup returns `undefined`. Filter the array first.

The row worth pausing on is `off(ε, eventName, listenerObject)`: it narrowly removes one listener object's subscription to that name, but it drops the retained value and policy for the name *entirely*. Any sibling listener still subscribed to that name keeps running on future emits exactly as before — nothing is unsubscribed out from under it — but the *next* listener to subscribe to that name gets no replay, because the retained state it would have replayed from is gone.

> [!IMPORTANT]
> **The bulk `off()` forms clear retained state as of v6.0.0.** Up to v5.1.0 the bare and wildcard forms only emptied the store: every retained value and every retain policy survived, so the call that reads as "reset the emitter" was precisely the one that pinned the payloads and still replayed them to the next subscriber. `off(ε)`, `off(ε, '*')` and `off(ε, ['*', …])` now wipe store and keeper together — the array form worst of all before, since it removed every listener but unretained only the names listed beside the `'*'`, leaving the rest pinned. Code that relied on retained values surviving a bulk `off(ε)` must re-`retain()` and re-`emit()`, or switch to the targeted `off(ε, eventName)` / `off(ε, [names])` forms, which are unchanged as long as no `'*'` appears in the array. The explicit `unretain(ε, '*')` after an `off(ε)` is now redundant, not wrong.
>
> **`off(ε, eventName, listenerObject)` unretaining the whole name was deliberately left off this release's break list.** Unlike the bulk forms above, this branch has been unchanged since the 4.0.0 functional API, and code may already depend on it — `off(ε, eventName, listenerObject)` reversing a `retain()` on that name is exactly what a caller reaches for when they mean "detach this listener and reset the event." Fixing it was not out of scope because it's impossible; it was left out because this release already carries several breaking changes, and a further, narrower one goes on the next major's list instead of piling onto this one. Treat it as intentional, not overlooked.

See [`docs/off.md`](./off.md) for the full signature reference and [`docs/retain.md`](./retain.md) for `retain()` itself.

## Migrating from v5

Nine breaking changes against the last released version, `v5.1.0`. Most are
runtime behavior changes on signatures that don't change shape, so the type
checker won't find the call sites — grep for the patterns below instead. Two
are type-only (a wrong type binding fixed, a dead type export removed) and
surface as compile errors instead.

### `off(ε)` now clears retained state

```js
// v5 — the retained value survived a bulk off()
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn); // fn received `settings` — replayed from the keeper

// v6 — off(ε) clears everything, listeners and retained state alike
retain(ε, 'config');
emit(ε, 'config', settings);
off(ε);
on(ε, 'config', fn); // fn receives nothing — the keeper was wiped too

// if you relied on the old behavior, re-retain and re-emit after the reset:
retain(ε, 'config');
emit(ε, 'config', settings);

// or narrow the call to what you actually mean to remove — targeted forms
// (off(ε, eventName), off(ε, [names])) are unchanged:
off(ε, 'someOtherEvent');
```

The same applies to `off(ε, '*')` and any array form containing `'*'`
(`off(ε, ['*', …])`) — all three take the same wildcard branch in the store
and now take the matching branch in the keeper. So does an array containing
a `null` or `undefined` element (`off(ε, [null])`, `off(ε, ['foo', undefined])`)
— it has always emptied the store the same way a wildcard array does, and
now empties the keeper along with it. An event-name list assembled at
runtime (`off(ε, ids.map((id) => nameFor(id)))`) hits this the moment one
lookup misses — filter nullish values out before passing the array.

### Unsubscribe handles are single-shot

```js
// v5 — a second call on the same handle could release a SIBLING
// handle's registration instead of being a no-op
const u1 = on(ε, 'foo', listenerObject);
on(ε, 'foo', listenerObject); // same subscription → refCount = 2, no new handle kept

u1();
u1(); // second call decremented the shared refCount again
getSubscriptionCount(ε); // => 0 — the OTHER handle's registration is gone too

// v6 — the second call on u1 is inert
const u1 = on(ε, 'foo', listenerObject);
const u2 = on(ε, 'foo', listenerObject); // refCount = 2

u1();
u1(); // no-op — a consumed handle cannot decrement twice
getSubscriptionCount(ε); // => 1 — u2's registration is untouched

u2();
getSubscriptionCount(ε); // => 0 — only now released
```

`off(ε, unsub.listener)` is affected the same way `unsub()` itself is: both
now go through the same single-shot `makeUnsubscribe()` guard, so calling
`off()` with a handle's `.listener` after the handle itself already fired
decrements nothing — the registration it pointed at may already be gone, or
may be a live sibling registration, but either way a second release attempt
is a no-op rather than a second decrement. Code that stored a handle only to
call `off(ε, unsub.listener)` unconditionally on cleanup, regardless of
whether `unsub()` already ran, now gets the safe behavior `docs/off.md` had
always promised. Nothing to change unless a cleanup path *relied* on the old
double-decrement to force a shared registration to zero — reach for
`off(ε, listenerObject)` instead, which removes every matching subscription
in one call regardless of how many handles it was split across.

### `once()` no longer deduplicates

```js
// v5 — two once() calls on the same listener object collapsed into one
// listener that then never stopped firing (MEM-002)
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready'); // one call — and the listener is still subscribed

// v6 — two independent one-shot subscriptions
once(ε, 'ready', handlerObject);
once(ε, 'ready', handlerObject);
emit(ε, 'ready'); // two calls — both detached afterward
```

If code registered the same listener object with `once()` more than once and
expected a single call, it now receives one call per registration — either
drop the duplicate `once()` call, or guard the handler itself against being
invoked twice. `on()` is unaffected; its reference-counted de-duplication is
unchanged.

### Smaller breaking changes

Five more, each narrow enough not to need a worked snippet:

- **`on(ε, eventName, methodName, listenerObject)` with a missing or `null` listener object now dispatches to nothing instead of throwing.** `on(ε, 'foo', 'handler', null)` used to throw `TypeError: Cannot read properties of null` the moment the event fired; it now silently does nothing until a real listener object is supplied later, matching how the same branch already tolerated a listener object with no matching method. Code that caught the `TypeError` as a signal no longer sees it — check with `getSubscriptionCount(ε)` instead if that mattered.
- **`off(ε, <numeric listener id>)` no longer removes anything.** Passing `unsub.listener.id` — the internal `EventListener`'s numeric id — used to detach the listener outright, skipping the reference count every documented removal path honours. It was never documented and had no test. Use `unsub()` or `off(ε, unsub.listener)` instead; both go through the same reference-counted path.
- **`UnsubscribeFunc.listener` / `.listeners` are now typed as this package's `EventListener`, not the DOM global of the same name.** `src/types.ts` referenced the name without importing it, so it silently bound to `lib.dom`'s `EventListener` (`(evt: Event) => void`) in the published declarations. Code that annotated `const l: EventListener = unsub.listener` against the DOM type now gets a type error — that annotation was already wrong, it just had no way to know. No runtime change.
- **`export type ListenerType` is gone.** It was `export type ListenerType = unknown` — an alias nothing in the package referenced. Replace an import of it with `unknown` directly.
- **An `EventListener` built directly with a `null` or `undefined` listener now dispatches to nothing instead of throwing.** Only reachable by constructing `EventListener` yourself; `on()` / `once()` reject a falsy listener before one is ever built, and the runtime bundles don't export the class at all (`src/index.ts` re-exports it as a type only). No action needed unless code somehow holds a reference to the class itself.

### Verifying a migration actually worked

[`getRetainedCount(ε)`](#verifying-cleanup) and
[`getSubscriptionCount(ε)`](#verifying-cleanup) read the two halves of an
emitter's state without reaching into the internals. A migration that
touched either breaking change is worth pinning with both, before and after
the call in question:

```js
retain(ε, 'config');
emit(ε, 'config', settings);
on(ε, 'config', fn);

off(ε);

getSubscriptionCount(ε); // => 0 — always true, v5 and v6 alike
getRetainedCount(ε); // => 0 in v6, would have been 1 in v5
```

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

Both `on()` and `once()` return an `UnsubscribeFunc` — a callable function object also carrying `.listener` (single-event forms) or `.listeners` (multi-event-name array form), typed and populated identically for both functions. Calling a handle releases references on two levels, and only the second one is conditional:

- **The closure's own reference to the emitter, unconditionally.** The handle closes over the emitter it was created against; that capture is nulled on the first call, so a handle kept in an array after teardown no longer pins the emitter through *its own closure* — and with it the store, the keeper and every retained payload, under *any* event name. Before this fix a single kept handle for `'foo'` was enough to keep a buffer retained under `'bar'` alive for the lifetime of the array.
- **The listener, when it actually left the store.** If the call really removed the listener (rather than only decrementing a shared reference count, see the note below), everything that listener held is nulled via `EventListener.detach()` — the listener function or object, the listener object's context, and the `callAfterApply` hook.

> [!WARNING]
> **A consumed handle is not automatically reference-free.** The two levels above are separate on purpose: when the call only decremented a shared count, `.listener` stays populated *and registered*, and a registered listener can lead straight back to the emitter. Two shapes do it, both verified with `WeakRef`:
>
> - `once(ε, 'foo', service)` whose event never fires, followed by `on(ε, 'foo', service)` — the `on()` deduplicates onto the `once()` listener, so consuming the `on()` handle takes the count from 2 to 1 and detaches nothing. The surviving listener's `callAfterApply` is the `once()` handle's closure, and *that* handle was never called, so it still holds the emitter. Same for the method-name form.
> - **The emitter subscribed as its own listener object**, registered twice: `on(ε, 'foo', ε)`, the method-name form `on(ε, 'foo', 'method', ε)`, and the wildcard clothing of both, `on(ε, ε)`. All three deduplicate, so the first consumed handle leaves the listener registered — and the emitter sits in one of the listener's own slots: `.listener.listener` for the object form, `.listener.listenerObject` for the method-name form. Watching only one of those two fields misses half the cases.
>
> The plain case is fine: two `on()` calls with an ordinary listener object release the emitter as soon as the first handle is consumed, count still at 1. So does `on(ε, 'foo', fn, ε)` registered twice, which looks like the second bullet but isn't — function listeners never deduplicate, so each handle detaches its own listener outright. What matters is not the count but what the *surviving* listener points at. If you keep handles past teardown and either shape applies, drop the handles too, or use `off(ε, listenerObject)` — which removes every matching registration in one call, regardless of how many handles they were split across.

This makes the common pattern safe:

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
> **"Calling a handle releases its references" is qualified by reference counting — for `on()`.** Two `on()` calls for the same `(eventName, priority, listener, context)` share one `EventListener` with `refCount = 2` (see [`docs/off.md` → Reference counting](./off.md#reference-counting)); `once()` is exempt and always registers its own. The *first* handle's call only decrements the count — it does not detach, and does not null the listener reference, until the *last* outstanding handle for that shared listener calls back too:
>
> ```javascript
> const h1 = on(ε, 'foo', service); // shared EventListener, refCount = 1
> const h2 = on(ε, 'foo', service); // same subscription, refCount = 2
>
> h1();
> // getSubscriptionCount(ε) is still 1 — h1.listener.listener is NOT null yet
> h1();
> // still 1 — a consumed handle is inert, it cannot decrement a second time
> h2();
> // getSubscriptionCount(ε) is now 0 — only now is the reference released
> ```
>
> **Each handle is single-shot (since v6.0.0).** Calling one a second time does nothing at all — it does not decrement the shared count again, and so it cannot take a *sibling* handle's registration down with it. Up to v5.1.0 only `once()` carried that guard: `h1(); h1();` on the pair above dropped the count straight to 0, unsubscribing `h2`'s registration from under it, and the double call is precisely what defensive cleanup code writes.
>
> The retention window is what survives. Holding on to `h1` after calling it, expecting it to have released `service`, is exactly the pattern the "consumed handle" claim above is meant to rule out — and the guard does not shorten it, because `h1` is inert while the shared listener is still very much alive. If a listener object may be subscribed more than once, only the *last* handle's call marks the true release point. What keeps `service` alive through a consumed `h1` is `h1.listener` — the public, still-populated `EventListener` — not `h1`'s own capture of the emitter, which is gone the moment `h1()` returns, count or no count. That distinction is not academic: in the two shapes listed under [Which handles to keep](#which-handles-to-keep) the still-populated `.listener` reaches the emitter anyway, so "the closure released it" and "nothing holds it" are different claims.

> [!NOTE]
> **`once()` is exempt from de-duplication (since v6.0.0).** Calling `once()` twice for the same event name on the same listener object creates two independent one-shot subscriptions: two firings on the first `emit()`, two retained-value replays if the event is retained, and two handles that each release exactly their own listener. Up to v5.1.0 the second call bumped the first listener's reference count instead, while the auto-unsubscribe hook accounted for a single firing — one emit took the count from 2 to 1 and the surviving handle's idempotence guard stopped it ever reaching 0. That listener fired on every subsequent `emit()` and could only be removed with an external `off(ε, listenerObject)` (`MEM-002`). If you upgrade from v5.x and relied on two `once()` calls collapsing into one, use a single `once()`.

> [!NOTE]
> **A `once()` releases itself only when the dispatch actually called something.** An event name that matches nothing on the listener object leaves the subscription — and the reference to that object — in place, which is what makes a late-bound handler work: supply the method later and the one-shot still fires. Since v6.1.0 that set includes a name whose only match is an inherited `Object.prototype` member (`toString`, `valueOf`, `constructor`, `hasOwnProperty` and friends): `once(ε, 'toString', {})` used to be consumed by the first `emit(ε, 'toString')` without calling any handler, and now stays subscribed. A listener object carrying an `.emit()` method is answered by that fallback and released as before. If such a name might never be answered, keep the handle and call it on teardown — `getSubscriptionCount(ε)` shows the difference.
>
> The same rule holds when the call happened but blew up: a `once()` listener that throws is still "called something", but the auto-unsubscribe runs *after* the call returns, and a throw never returns. The subscription survives the exception and fires again on the next matching `emit()` — a one-shot without a kept handle can turn into a repeat-shot the moment it throws. Stop throwing on some later invocation and that invocation's `callAfterApply()` finally runs, releasing it as usual.

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
