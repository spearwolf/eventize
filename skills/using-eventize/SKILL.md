---
name: using-eventize
description: Use when code imports `@spearwolf/eventize`, mentions `eventize`/`Eventize`, or when writing/reviewing synchronous event-emitter code using this library (on, once, emit, emitAsync, off, retain). Covers the API surface, the four behaviour families on non-eventized targets, wildcard quirks, retain semantics, priorities, cleanup and handle lifetime, typed event maps, the v5 → v6 migration, and common pitfalls.
---

# @spearwolf/eventize

A zero-dependency **synchronous** event emitter for any JS/TS object. ESM + CJS,
opt-in generic event maps. Ships unminified (~48 kB ESM); around 5 kB once a
bundler minifies it and the transport gzips it.

Deeper material — load only when the task needs it:

| File | Covers |
| --- | --- |
| `references/api-details.md` | every `on()` / `off()` shape, per-event priorities, retain semantics in full |
| `references/lifecycle.md` | what an emitter holds, what each `off()` form releases, handle and `once()` lifetime |
| `references/typed-events.md` | generic event maps, the `EventMap` trap, symbol escape hatch |
| `references/migration.md` | v5 → v6 breaking changes, the v4 → v5 emit change, the v4.3 type-brand migration for classes |

## Mental model

An **emitter** is any object carrying a hidden symbol slot with a listener
registry (`store`) and a retained-event log (`keeper`). Three ways to attach it,
sharing one implementation:

| Style | Create | Call |
| --- | --- | --- |
| Functional (recommended, tree-shakable) | `const ε = eventize(obj?)` | `on(ε, …)`, `emit(ε, …)` |
| Injected methods | `eventize.inject(obj)` | `obj.on(…)`, `obj.emit(…)` |
| Class inheritance | `class X extends Eventize {}` | `this.on(…)`, `this.emit(…)` |

A typed event map narrows on all three surfaces since v6.0.0 — the standalone
functions, `eventize.inject<M>()` and `class Eventize<M>`. Declare
`[key: string]: any[]` in the map if you want dynamic names alongside the
declared ones.

Listeners run **synchronously**, highest priority first. `emitAsync` changes only
how return values are aggregated, never when listeners run. Convention: name
eventized objects `ε` (epsilon).

## API surface

```ts
import {eventize, on, once, onceAsync, emit, emitAsync,
        off, retain, retainClear, unretain, Priority,
        isEventized, asEventized, getEventizeProtocol, getSubscriptionCount,
        getSubscribedEventNames, getRetainedCount, getRetainedEventNames,
        Eventize, EVENT_CATCH_EM_ALL} from '@spearwolf/eventize';
```

| Function | Purpose | Returns |
| --- | --- | --- |
| `on(ε, name?, [prio,] listener[, ctx])` | subscribe | `unsubscribe()` |
| `once(ε, …)` | subscribe, auto-unsub after the first call that actually happens | `unsubscribe()` |
| `onceAsync(ε, name, {signal}?)` | promise resolving on next emit; the optional `AbortSignal` unsubscribes and rejects | `Promise<firstArg>` |
| `emit(ε, name, …args)` | sync dispatch | `void` |
| `emitAsync(ε, name, …args)` | dispatch + collect non-null returns | `Promise<any[] \| undefined>` |
| `off(ε, …)` | unsubscribe; also clears retain for named events, and all retained state on `off(ε)` / `off(ε, '*')` / any array holding a `'*'` or a nullish element | `void` |
| `retain(ε, name)` | replay last value to new subscribers | `void` |
| `retainClear(ε, name)` | drop stored value, keep policy | `void` |
| `unretain(ε, name)` | drop value and policy | `void` |
| `isEventized(obj)` / `eventize.is(obj)` | type guard | `boolean` |
| `asEventized(obj)` | attach the slot only, no API methods | `obj` |
| `getEventizeProtocol(obj)` | which copy of eventize owns the marker; `6` for this one, `undefined` without one — never throws | `number \| undefined` |
| `getSubscriptionCount(obj)` | listener count, `0` for non-eventized | `number` |
| `getSubscribedEventNames(obj)` | every name with an active listener, wildcard as `EVENT_CATCH_EM_ALL`, order unspecified; `[]` for non-eventized | `EventName[]` |
| `getRetainedCount(obj)` | count of events holding a retained value, `0` for non-eventized | `number` |
| `getRetainedEventNames(obj)` | every name carrying a retain policy (fired or not), `[]` for non-eventized | `EventName[]` |
| `Priority` | `Max Critical High Medium Normal Low Min` (higher runs first) | object |
| `EVENT_CATCH_EM_ALL` | the wildcard name, `'*'` | `string` |

Event names are `string` or `symbol`. Anywhere a name is accepted, an array of
names works too. The unsubscribe handle is exactly `() => void` — it carries no
properties, and a second call is inert.

## The four behavior families

How each function treats a target that was never eventized — the single most
common source of surprise:

| Functions | On a non-eventized target |
| --- | --- |
| `on`, `once`, `onceAsync`, `retain` | **auto-eventize** it, then proceed |
| `emit`, `emitAsync` | **duck-type**: `obj[eventName](…args)`, else `obj.emit(eventName, …args)`, else no-op — a function or class target too (v6.0.0), and an inherited `Object.prototype` / `Function.prototype` member is not a match (pitfall 11) |
| `off`, `getSubscriptionCount`, `getSubscribedEventNames`, `getRetainedCount`, `getRetainedEventNames` | **permissive**: silent no-op / `0` / `[]`, even for `null` |
| `retainClear`, `unretain` | **throw** a `TypeError` naming the function and the remedy |

`on`-family functions install behavior, so auto-eventizing is a meaningful
reading of the intent. Retain-state mutators have no duck-typed equivalent, so
they still surface typos. `emit()` does not throw on plain objects — for typo
safety use a typed emitter (`eventize<TEvents>()`, which rejects unknown names at
compile time) or an explicit `isEventized()` guard.

## Pitfalls

1. **`'*'` is subscribe-only.** `emit(ε, '*', …)` throws. In an array form, names
   before the `'*'` still dispatch before the throw. `retain(ε, '*')` throws as
   well — an array containing `'*'` throws whatever else it lists. On
   `unretain()` and `retainClear()` the wildcard is not an error but a bulk form:
   it targets every retained event.
2. **Wildcard function listeners never receive the event name** — only the emit
   args. To learn the name, subscribe a listener-object with an
   `.emit(eventName, …args)` method; that method is also the catch-all fallback
   whenever no method matches the event name.
3. **Forwarding needs a real `.emit` method.** `on(upstream, downstream)`
   forwards everything, but only because `eventize.inject()` and
   `class extends Eventize` install `.emit`. Plain `eventize(obj)` does **not** —
   forwarding to such a target silently no-ops.
4. **No cycle detection.** `A → B → A`, or re-emitting the same event from inside
   its own listener, recurses until the stack overflows. Break cycles yourself.
5. **A throwing listener aborts the rest of that dispatch.** Later listeners for
   the same `emit()` don't run, the throwing listener stays subscribed — a
   throwing `once()` therefore fires again — and `retain()` is not updated for
   that emit, because the write happens after all listeners. Wrap risky bodies
   yourself; there is no global error handler by design.
   **A throw is not the only way a `once()` fires twice.** The one-shot is
   settled after the callback *returns*, so a callback that re-emits its own
   event before returning is dispatched to its own listener again, still fully
   subscribed. Both routes are the same rule seen from two sides, and neither is
   a defect on its own: this one is that rule meeting the absent recursion guard
   of pitfall 4. If a `once()` body may re-enter its own event, unsubscribe
   through the returned handle before emitting.
   **A retained replay is the one dispatch this does not describe.** Since
   v6.0.0 each replay queued by an `on()`/`once()` call runs in its own
   `try`/`catch`: the throw is reported through `console.warn` with the event
   name, the remaining replays of that batch still run, and the call returns its
   handle. Up to v5.1.0 it threw out of `on()`, leaving registered
   subscriptions the caller had no handle for. A `once()` sees the third way to
   fire twice here — a replay that throws settles nothing, so the next replay of
   the same batch calls it again. What such a handler *can* do is stop the rest
   of the batch: since v6.0.0 each replay reads the emitter when it runs, so an
   `unretain()`, a `retainClear()` or an `off()` from inside one takes effect for
   the names still ahead of it, and a name re-emitted there replays the new
   value. Up to v5.1.0 only the `off()` route worked.
6. **Nested `emit()` retains out of order.** The same after-dispatch write means
   **any** `emit()` nested inside another — not only self-recursion — writes its
   retained state first, innermost call to outermost. The common way in is
   forwarding (pitfall 3): with `retain(ε,'a')` and `retain(ε,'b')`, a listener on
   `'a'` that calls `emit(ε,'b', …)` retains `'b'` before `'a'`. Self-recursion is
   the case that surprises most, because both calls compete for one slot:
   `retain(ε,'ping')` with a listener counting `0 → 1 → 2` by re-emission leaves
   `0` retained, not `2`.
7. **Listener-object forms aggregate across `on()` and `once()` alike;
   functions never do.** `on(ε, 'foo', listenerObj)` twice, `once()` twice, or
   any mixture of the two, all yield one listener for that identity —
   `(eventName, priority, listener, listenerContext)` — dispatched once per
   emit; each `once()` call adds its own obligation, discharged as a batch by
   the first matching dispatch, while an `on()` on the same identity keeps the
   registration alive independently of them. The same *function* subscribed
   twice always fires twice.
8. **`off()` mid-emit** skips listeners that haven't run yet in that dispatch.
9. **`emitAsync()` resolves `undefined`, not `[]`**, when nothing was collected.
   `null`/`undefined` returns are dropped. An array return has its elements
   awaited via `Promise.all` but stays **one** entry — `[1, Promise.resolve(2)]`
   from a lone listener gives `[[1, 2]]`, not `[1, 2]`.
10. **`off(ε, name)` unretains that event** — it drops the stored value *and* the
    retain policy, so later emits aren't retained until `retain()` is called
    again. The bulk forms `off(ε)`, `off(ε, '*')` and any array holding a `'*'` or
    a nullish element do the same for *every* retained name. `off(ε, undefined)`
    is one of those bulk forms, not a no-op — forwarding a possibly-missing value
    into `off()` wipes the emitter. The three-argument `off(ε, '*', listenerObject)`
    is the one name-plus-object form that leaves retained state alone.
11. **Event names inherited from `Object.prototype` dispatch to nothing.**
    `toString`, `toLocaleString`, `valueOf`, `constructor`, `hasOwnProperty`,
    `isPrototypeOf`, `propertyIsEnumerable` and V8's `__defineGetter__` family are
    skipped on both dispatch paths when the target only inherits them. Write your
    own method — on the object or on its class — and it dispatches as normal; the
    comparison is against `Object.prototype`'s function by identity, so the one
    own property still skipped is an alias of that very function
    (`{toString: Object.prototype.toString}`). A skipped name falls through to the
    `.emit()` fallback. The method-name form `on(ε, 'evt', 'toString', obj)` is
    exempt — it names what it wants. Since v6.0.0 the same identity test runs one
    prototype level further out, against `Function.prototype`, which matters for
    the function targets that arrived with it: `call`, `apply`, `bind`,
    `toString` and `Symbol.hasInstance` are not handlers on a function. `name`
    and `length` are own properties of a function, so the test is not what
    decides them — they are a string and a number, not callable, and fall
    through anyway. `arguments` and `caller` are the one place a name is not merely
    unanswered: reading either off a strict-mode function throws, and the
    dispatch reads before it subtracts, so those two surface a `TypeError`.
    `__proto__` is carved out unconditionally like `constructor`, because no
    level can subtract it and on a function it resolves to something callable —
    `Function.prototype`, or the superclass of a subclass.
12. **Two majors of eventize in one tree throw at the boundary.** The marker is
    keyed by `Symbol.for('eventize')`, which is realm-wide, so a `^5` and a `^6`
    installed side by side share one slot per object. Since v6.0.0 the marker
    carries a protocol number: a mismatch makes every `on()` / `emit()` / `off()`
    — and `getSubscriptionCount()` and friends, which read the same internals —
    throw a `TypeError` that names both protocols and the fix (`npm dedupe`, or
    an `overrides` / `resolutions` entry). `isEventized()` still answers `true`,
    because it only probes for the slot; `getEventizeProtocol(obj)` is the one
    that says whose slot it is, and it never throws. `undefined` from it plus
    `isEventized(obj) === true` means a copy older than the field.
13. **The marker slot cannot be deleted.** `delete ε[Symbol.for('eventize')]`
    throws in strict mode since v6.0.0. Up to v5.1.0 it silently succeeded and
    left the listeners and retained values stranded in collaborators nothing
    could reach any more.
14. **`on()` rejects what it cannot dispatch.** The listener slot is type-checked,
    not truthiness-checked: a function, a string, a symbol or a non-null object
    passes, anything else throws. An empty array of event names throws too —
    `on(ε, [], fn)` used to hand back a handle for zero subscriptions and
    `onceAsync(ε, [])` a promise that never settled — and so does a *sparse*
    one: `on(ε, new Array(2), fn)` used to register nothing and hand back the
    same kind of dangling handle, and a hole anywhere else in the array (`['a',
    , 'b']`) used to register only the names around it, silently. Every event
    name has to be a string or a symbol as well: `on(ε, [123], fn)`, `[null]`,
    `[[]]`, an element explicitly set to `undefined`, and — wherever a priority
    follows the name — the single-name spellings `on(ε, {}, 10, fn)` and
    `on(ε, null, 10, fn)` used to file a bucket under that value, unreachable by
    `emit()` and, for a number, unreachable by `off(ε, 123)` too. The catch-all
    forms fill the name slot with `'*'` themselves and are unaffected, as is
    `on(ε, 123, fn)`, where `123` is a priority. And a method name needs an
    object to be read off:
    `on(ε, 'foo', 'handler', null)` used to register a subscription nothing could
    ever fill, because late binding covers the method, not the object it lives
    on. Seven mistakes share the one
    message `subscribeTo() called with insufficient arguments`, and `Error.cause`
    names which: `'missing-listener'`, `'not-dispatchable'`, `'empty-method-name'`,
    `'missing-listener-object'`, `'empty-names'`, `'sparse-names'`, `'invalid-name'`.
    An unusable priority is the exception — its own message
    (`subscribeTo() called with a NaN priority`), with `'invalid-priority'` on
    `Error.cause`. It throws in every
    position, tuples included, and one bad value inside
    `on(ε, ['a', ['b', NaN]], fn)` registers none of the names. The guard is
    `typeof priority !== 'number' || Number.isNaN(priority)`, so a non-number cast
    into a tuple's priority slot is rejected as well; `Priority.Max` /
    `Priority.Min` (`±Infinity`) and `0` stay valid — it is not a finiteness test.
    Every one of these rejections is atomic: nothing is registered before the
    check.
15. **`off(ε, fn)` ignores the context a subscription was drawn under** (since
    v6.0.0). It detaches every registration of that function, `on(ε, name, fn,
    ctx)` included — so a teardown calling `off(ε, MyClass.prototype.onData)`
    also unsubscribes every other instance that drew the same prototype method
    under its own context. It reaches one step further still: a registration
    that draws `fn` as some *other* listener's context, `on(ε, name, other, fn)`,
    goes with it too, because a function is a listener object like any other.
    `off(ε, fn, ctx)` stays exact and is the way to name
    one of them; the handle `on()` returned is the way to name none of them. Up
    to v5.1.0 the two-argument form matched only registrations whose context was
    `null`, which failed the other way round — silently leaving the emitter
    holding both the function and the context object.
16. **The event name `'emit'` collides with the fallback method.** On a target with
    its own `.emit`, `emit(obj, 'emit', ...args)` calls `obj.emit(...args)`
    instead of `obj.emit('emit', ...args)` — the object's method matches in stage 1,
    so the fallback is never reached. The listener sees only the trailing args, not
    the event name. A target without `.emit` is unaffected (silent no-op). This is
    the protocol applied literally, unavoidable when the event name matches the
    fallback method.
17. **`retain()` / `unretain()` / `retainClear()` reject what they cannot file a
    policy under**, since v6.0.0 — the same shapes `on()` rejects (pitfall 14),
    minus the listener and priority checks that don't apply here: a value that
    is not a string or a symbol, an empty array, a sparse array. `retain(ε, 42)`
    used to file a policy under `42` that no `emit()` could ever fill, and
    `retain(ε, [])` was a silent no-op instead of throwing — the second half of
    that asymmetry with `on(ε, [], fn)`, which has thrown since v6.0.0 too. All
    three reject atomically, before the keeper changes, with `Error.cause`:
    `'invalid-name'`, `'empty-names'`, `'sparse-names'`. The message names its
    own function (`retain() called with …`) rather than reusing `subscribeTo()`'s
    wording, and the error class is `Error`, not the `TypeError` reserved for a
    non-eventized target. Checked after the wildcard check (pitfall 1): an array
    containing `'*'` still takes the bulk path on `unretain()` / `retainClear()`
    whatever else it lists.

## Idiomatic shape

```ts
import {eventize, on, emit, retain, Priority} from '@spearwolf/eventize';

const bus = eventize();
retain(bus, 'status');
emit(bus, 'status', 'loading');

const unsubscribe = on(bus, 'status', Priority.High, (s) => console.log(s));
// fires immediately with the retained 'loading'

emit(bus, 'status', 'ready');
unsubscribe();
```

## When not to reach for eventize

Async-by-default queuing wants a real message bus. Backpressure or streaming
wants `ReadableStream` or RxJS. A single callback wants to be a callback.
