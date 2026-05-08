# CHANGELOG

## Unreleased

- **Types:** `on()` and `once()` now expose IDE-friendly function overloads instead of a single rest parameter typed as a 14-member tuple union. Hovering or autocompleting either function shows each supported call shape on its own line (event-name + listener function, listener method name on a listener object, listener-object alone, catch-all wildcard variants — each with and without explicit priority), ordered specific → generic. The new overload set covers the standalone exports `on`/`once`, the `eventize.inject(obj)` methods, and the `Eventize` class methods. Internally a new `SubscribeFunc` callable interface in `types.ts` carries the canonical method-form overloads, used by `EventizeApi`. The implementation type alias `SubscribeArgs` is unchanged and still drives the runtime dispatch in `subscribeTo()`. No runtime-behavior change; existing valid calls keep typechecking, and the on()/once() spec suite (all 314 tests) passes unmodified.


## `v4.0.3` (2026-05-07)

_Documentation, testing, and internal cleanup_

- **API:** `EVENT_CATCH_EM_ALL` (the `'*'` wildcard event name) is now re-exported from the package root. Users no longer need to use the magic string `'*'` or reach into deep import paths.
- **API:** The `EventListener` type is now exported (type-only) from the package root, so consumers can refer to the `listener` / `listeners` properties on `UnsubscribeFunc` without `@ts-ignore` workarounds.
- **Fix:** `subscribeTo()` (used internally by `on()` / `once()`) now throws a proper `Error` instance instead of a bare string when called with insufficient arguments. The message is `'subscribeTo() called with insufficient arguments'`. Previously the bare-string throw broke `instanceof Error` checks and lost stack traces. Note: the throw is no longer suppressed in environments without `console` — only the accompanying `console.warn` is.
- **Fix:** Memory leak in `EventStore.namedListeners`. Removing the last listener for an event name now also deletes the (then empty) entry from the internal `namedListeners` map. Previously, repeatedly subscribing and unsubscribing with unique event names (e.g. UUIDs) would grow the map without bound. Cleanup is applied on all four removal code paths (`off()`, `off(name)`, `off(fn)`/`off(obj)`, returned unsubscribe function, and `off(name, obj)`).
- Removed dead code in `EventStore` and `constants`: dropped unused `LISTENER_UNKNOWN` constant and the unreachable `isCatchEmAll(listener) && typeof listener == 'object'` branch in `EventStore.remove`. Internal refactor only — no API or behavior change.
- Replaced all `@ts-ignore` annotations with `@ts-expect-error` (in `EventListener.apply` and `isEventized`). Each remaining suppression now carries a short comment explaining the dynamic-dispatch reason, and TS will surface the suppression site if the underlying type ever stops needing it. `isEventized` was rewritten to use a `Record<symbol, unknown>` cast, removing its suppression entirely.
- Expanded documentation for `retain()` and `retainClear()` API functions in README with comprehensive examples
- Added extensive test coverage for `retain()` and `retainClear()` covering all code paths:
  - Symbol event names support
  - Array of event names support
  - Error handling for non-eventized objects
  - Interaction with `once()` and `onceAsync()`
  - Wildcard listener behavior
  - Edge cases (empty args, complex args, multiple calls)
- Added comprehensive tests for `EventKeeper` class internal methods
- Added a dedicated spec for `getSubscriptionCount()` (`src/getSubscriptionCount.spec.ts`) covering edge cases that were previously only tested indirectly: non-eventized inputs (plain objects, arrays, class instances) returning `0`, freshly eventized objects with no listeners, `off()` calls on empty objects, refCount-based de-duplication, mixed wildcard / named subscriptions, and the fact that `off(obj, '*')` is equivalent to `off(obj)` (clears every subscription, not just wildcard ones).
- **Docs:** README — fixed and expanded several inaccurate sections:
  - The wildcard-listener example claimed a function-form listener (`on(ε, '*', (eventName, ...args) => …)`) receives the event name as its first argument. It does not — function listeners only see `emit()` arguments. Replaced with an accurate example and added a callout showing the listener-object-with-`.emit()` pattern as the way to receive `eventName`.
  - The "Reference Counting" section described refCount de-duplication as if it applied to all listeners. Clarified that refCount only kicks in for listener-object subscriptions (`on(ε, eventName, listenerObject)` and `on(ε, eventName, 'methodName', listenerObject)`); plain function listeners are never deduplicated. Added a side-by-side example.
  - The `getSubscriptionCount()` section now documents that it returns `0` (rather than throwing) for non-eventized inputs, that a wildcard listener-object counts as a single subscription regardless of how many event-named methods it exposes, and how refCount affects the count.
- **Docs:** README — added a "De-duplication (Listener Objects)" subsection under `on()` so the refCount behavior is surfaced where users first encounter it (subscribing), with a cross-reference to the detailed Reference Counting section under `off()`.
- **Docs:** README — added an "Error Handling in Listeners" section documenting that exceptions thrown by listeners propagate out of `emit()`/`emitAsync()`, abort dispatch for the remaining listeners of that emit, leave the throwing listener subscribed, and do not update the retained value. Includes a try/catch-in-listener recommendation and a note on the difference between sync throws and rejected-promise returns under `emitAsync()`.
- Added `src/emit-throwing-listener.spec.ts` — explicit coverage for the throwing-listener semantics: exception propagation, dispatch abort, prior (higher-priority) listeners still running, retained value not updated, throwing listener not auto-removed, and `emitAsync()` behavior for both synchronous throws and rejected-promise returns.
- Added `src/emit-reentrancy.spec.ts` — explicit coverage for sub/unsub during dispatch: a peer listener unsubscribed mid-emit is skipped (the `isRemoved` check in `EventListener.apply` short-circuits even though it is still in the cloned snapshot), `off(ε)` mid-emit completes iteration cleanly, a self-unsubscribing listener still finishes its current invocation, and a listener subscribed during emit (named or wildcard) does not fire for the current dispatch but does fire for subsequent emits.
- **Fix:** `once()` with a retained event no longer leaves the listener subscribed after the retained replay. Previously, `subscribeTo()` flushed retained events before `once()` had a chance to attach its `callAfterApply` hook, so the auto-unsubscribe was skipped — the listener stayed in the store and continued to fire on subsequent live emits. Now `once()` registers the listener, attaches the auto-unsubscribe hook, and only then triggers the retained replay. Affects both single-event-name (`once(ε, 'foo', fn)`) and array-of-event-names (`once(ε, ['foo', 'bar'], fn)`) forms. Internal: introduced `subscribeToDeferred()` next to `subscribeTo()` so callers that need to interleave setup between registration and retained-event publishing can do so without triggering the publish twice.
- Added `src/once.spec.ts` coverage for `once()` + retained event: after the retained replay the listener is invoked exactly once and `getSubscriptionCount(ε)` returns `0`, for both single and array-of-event-names forms.

## `v4.0.2` (2025-08-07)

_very minor quality of life improvements_

- polish some types (api should remain compatible)
- add duck-typing test for emit
- migrate eslint configs to latest flat-style
- upgrade build dependencies

## `v4.0.1` (2024-08-04)

- use `Symbol.for('eventize')`

## `v4.0.0` (2024-07-22)

**!! BREAKING CHANGES !!**

_Introduction of the new functional API_

Previously, the Eventize API methods were assigned to the object as methods after calling `eventize(obj)`
This behavior has changed in 4.0.0: all eventize methods are now available as library exports in the functional variant:

```js
import {
  on,
  once,
  onceAsync,
  off,
  emit,
  emitAsync,
  retain,
  retainClear
} from '@spearwolf/eventize';
```

| before | after |
|--------|-------|
| `obj.on(..)` | `on(obj, ...)` |
| `obj.once(..)` | `once(obj, ...)` |
| `obj.emit(..)` | `emit(obj, ...)` |
| `obj.off(..)` | `off(obj, ...)` |
| ... | ... |

There is still the option to inject the Eventize API as methods to the object (but this is no longer the default) by using:

- `eventize.inject(obj)` &rarr; _eventizedObj with eventize-api methods_
  - the `eventize.extend()` method has been removed, however
- `new (class extends Eventize {})()`
  - the base class `Eventize` is still available and works in the same way as before

If you are using the syntax from the _composition via inheritance_ example, you should now be using `eventize.inject` directly:

```typescript
import {eventize, type Eventize} from '@spearwolf/eventize'

export interface Foo extends Eventize {}

export class Foo {
  constructor() {
    eventize.inject(this);
  }
}
```

Other API Changes

- The _default export_ is still the `eventize()` function, but the `Priority` object is no longer assigned here
  - `Priority` is still available as a named export (only)


## `v3.4.2` (2024-06-01)

- extend the signature of `.onceAsync()` so that the type of the promise return value can be specified optionally
- upgrade build package dependencies
- upgrade the javascript target version to ES2022 (was ES2021)

## `v3.4.1`

- retained events always maintain their original order in which they were published!
- the methods `.retain()` and `.retainClear()` now also optionally allow the specification of multiple events

## `v3.4.0`

- fix `.once()` behavior with multiple event names
- fix `.onceAsync()`

## `v3.3.0`

- with `.onceAsync()` only the event names are accepted as parameters, no callback functions anymore (this makes no sense)
- introduce the `.retainClear()` method: clear a saved event

## `v3.2.0`

- introduce `.onceAsync()`

## `v3.1.2`

- The `src/` folder no longer ends up in the npm package by mistake!

## `v3.1.1`

- `eventize()` can now create a `{}` by itself if no custom object is given

## `v3.1.0`

- introduce `.emitAsync()`

## `v3.0.2`

- Fix exported type definitions
- Clean up the build system internally (using `tsup`)

## `v3.0.1`

- Mark npm package as side effects free

## `v3.0.0`

### Npm Package

- Under the hood, the build pipeline has been modernised and now uses Typescript v5.2 internally.
- The javascript fragment output of the npm package `@spearwolf/eventize` has been fixed:
  - there is no _default_ export anymore. instead of the default export, the named export `eventize` should now be used.
- a CHANGELOG was finally introduced 😉

### Migration Guide

- Change all _default_ imports to the explicit named import: `import {eventize} from '@spearwolf/eventize'`
