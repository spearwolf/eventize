# eventize — migration notes

## v5 → v6: two silent behavior breaks

Neither has a compile-time signal — both are runtime changes on signatures
that don't change shape, so grep for the call patterns rather than relying
on the type checker to find affected sites.

- **Bulk `off()` now clears retained state.** `off(ε)`, `off(ε, '*')`, and
  any array containing `'*'` (`off(ε, ['*', …])`) used to empty only the
  listener registry, leaving retained values and retain policies intact. All
  three now wipe the keeper too. Targeted forms — `off(ε, eventName)`,
  `off(ε, [names])`, `off(ε, eventName, listenerObject)` — are unchanged.
- **`once()` no longer deduplicates.** Two `once(ε, 'foo', listenerObject)`
  calls on the same object used to collapse into one listener that then
  fired on every subsequent emit and could not be released through its own
  handles. Each `once()` now gets its own listener: two registrations mean
  two firings, each releasing independently. `on()`'s reference-counted
  dedup is unaffected.

Worked before/after snippets for both, plus how to verify a migration with
`getRetainedCount(ε)` / `getSubscriptionCount(ε)`, live in
[`docs/lifecycle.md#migrating-from-v5`](../../../docs/lifecycle.md#migrating-from-v5)
rather than being duplicated here.

## v4 → v5: `emit()` stopped throwing

`emit()` and `emitAsync()` no longer throw `"object is not eventized"` on a non-eventized target. They duck-type instead:

1. `obj[eventName]` is a function → call it with `this === obj`.
2. Else `obj.emit` is a function → call `obj.emit(eventName, …args)`.
3. Else silent no-op.

`null`, `undefined`, and non-objects no-op. `'*'` still throws. Return values flow through the same aggregation as eventized dispatch, so `emitAsync()` behaves uniformly across both paths.

If you relied on the throw as a typo net, either guard with `isEventized()` or move to a typed emitter — `eventize<TEvents>()` still rejects unknown event names at compile time. `retainClear()` and `unretain()` are unchanged and still throw.

## v4.0.x → v4.3.x: the type brand on classes

v4.3 added unique-symbol brands (`[__TEventsBrand]`, `[NAMESPACE]`) to `EventizedObject<TEvents>`. The function-style API now requires its first argument to be either a branded `EventizedObject<T>` or assignable to `NonTypedEmitter<T>`. Plain class instances no longer qualify: `eventize(this)` brands the instance at runtime, but the *type* of `this` stays unbranded, so every later `emit(this, …)` inside the class fails to type-check.

Fix without refactoring — declaration-merge an empty interface per class file:

```ts
import {emit, type EventizedObject, eventize, on, retain} from '@spearwolf/eventize';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MyClass extends EventizedObject {}

export class MyClass {
  constructor() {
    eventize(this);          // still required at runtime
    retain(this, 'ready');   // now type-checks
  }
  doStuff() { emit(this, 'ready'); }
}
```

Apply it to every class that calls `eventize(this)` — or that auto-eventizes via `retain`/`on`/`once` on `this`. It works for classes that already extend something else; the merge is independent of the runtime inheritance chain. Since the brand symbols aren't exported, this merge and `extends Eventize` are the only ways to satisfy the constraint without `as any`.

**Extend `EventizedObject`, not `EventizeApi`.** `EventizeApi` carries the public method signatures (`on`, `emit`, `retain`, …) and will collide with any same-named method on the host class.

Two call sites still need help after the merge:

- **Polymorphic `this` plus listener-object form.** `on(this, listenerObj)` fails because TS can't reduce `NonTypedEmitter<this>` while `this` is generic. Cast to the concrete class: `on(this as MyClass, listenerObj)`.
- **`on.bind(undefined, this, eventName)` patterns.** TS picks the priority-as-number overload and rejects the string event name. Cast the reference: `(on as (...args: unknown[]) => unknown).bind(undefined, this, eventName)`. Not `as Function` — ESLint's `no-unsafe-function-type` rejects that.

Runtime behavior is unchanged by this migration; it is purely type-level. Sanity check with typecheck → build → tests.
