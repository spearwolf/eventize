# eventize — migration notes

## v5 → v6

Against the last released version, `v5.1.0` — and `v6.0.0` is the only
`6.x` there is, so this is the whole jump. Fourteen breaking changes.
Eight are runtime changes on signatures that don't change shape, so grep
for the call patterns rather than relying on the type checker to find
affected sites. Six are type-only and surface as compile errors
instead.

- **Bulk `off()` now clears retained state.** `off(ε)`, `off(ε, '*')`, and
  any array containing `'*'`, `null` or `undefined` (`off(ε, ['*', …])`,
  `off(ε, [null, …])`) used to empty only the listener registry, leaving
  retained values and retain policies intact. All of them now wipe the
  keeper too. Targeted forms — `off(ε, eventName)`, `off(ε, [names])`,
  `off(ε, eventName, listenerObject)` — are unchanged.
- **`off(ε, listenerFunc)` no longer cares which context the subscription
  was drawn under.** It used to match only registrations whose stored
  context was `null`, so `on(ε, 'evt', this.handler, this)` survived
  `off(ε, this.handler)` in silence and left the emitter holding both the
  function and the context object. It now detaches every registration of
  that function. The break runs the other way for shared prototype methods:
  `off(ε, MyClass.prototype.onData)` now also detaches other instances that
  drew the same method under their own context. Grep for two-argument
  `off()` calls whose listener is a `this.`-bound or `.prototype.` method
  and narrow them to `off(ε, fn, ctx)`, which stays exact on both halves.
  A nullish third argument does not count as one: `off(ε, fn, null)` takes
  the same broad branch, so nothing addresses only the contextless
  registration any more — use the handle `on()` returned for that.
  `off(ε, listenerObject)` widened along the same seam, one shape's worth:
  it now also detaches `on(ε, name, obj, ctx)`, an object listener carrying
  a context, which was the one shape it walked past. What it already swept
  — the object alone, the method-name form, `on(ε, name, fn, obj)` — is
  unchanged.
- **`on()` and `once()` aggregate by listener identity.** A listener object
  subscribed to the same event at the same priority is one registration,
  however many `on()` and `once()` calls produced it and in whatever order.
  Every pending `once()` on it is discharged by the first dispatch, and the
  registration survives as long as an `on()` still holds it. Up to `v5.1.0`
  the collapse itself already worked in both orders; what did not was the
  settling. Two `once()` calls on one identity produced a registration that
  never discharged and fired on every emit instead of once — that pair is the
  only one whose behaviour changes, and where the repeated firing was being
  relied on, the subscription wanted `on()`. A `once()` paired with an `on()`
  needs no migration. Function listeners never aggregate.
- **Unsubscribe handles are single-shot.** Calling one a second time used to
  decrement a shared reference count again, releasing a *sibling* handle's
  registration out from under it. A second call is now inert.
- **A method-name subscription with a missing listener object no-ops
  instead of throwing.** `on(ε, 'foo', 'handler', null)` used to throw the
  moment the event fired; it now silently does nothing until a real
  listener object is supplied.
- **`off(ε, <numeric listener id>)` no longer removes anything.** This was
  undocumented and untested — passing the internal listener's numeric id
  used to detach it outright, skipping the reference count every documented
  path honours. Use `unsub()`; with the handle reduced to `() => void`
  there is no supported way to obtain such an id anyway.
- **`UnsubscribeFunc.listener` / `.listeners` are gone, and so is the
  `EventListener` type export.** The handle is `() => void`. The union
  that declared the two fields made either access a `TS2339` at every call
  site, so `off(ε, unsub.listener)` never compiled against the published
  declarations in the first place — and the `EventListener` it named was
  the **DOM** global, not this package's class, because the declarations
  used the name without importing it. Replace it with `unsub()` — same
  reference-counted path, same single-shot guard, no emitter needed in
  scope. Reads past it (`unsub.listener.id`, `.isRemoved`) were internals
  and have no replacement.
- **`emitAsync()` returns `Promise<any[] | undefined>`**, on all three API
  surfaces, instead of `Promise<any>`. The runtime has always resolved to
  `undefined` when no listener returned a non-null value; the old `any`
  did not merely lose precision, it switched checking off, so
  `(await emitAsync(ε, 'x')).map(…)` compiled and then threw on exactly
  that case. Add a guard: `(await emitAsync(ε, 'x'))?.map(…)`, or `?? []`.
- **`export type ListenerType` is gone** — an alias for `unknown` nothing
  referenced. Replace an import with `unknown` directly.
- **`on()` / `once()` throw on a listener they cannot dispatch to.** The
  slot used to be checked for truthiness only, so `on(ε, 'foo', 5)`
  registered a listener no `emit()` could ever reach — it counted towards
  `getSubscriptionCount(ε)` and needed an explicit `off()` to remove. The
  same call with `0` threw, because `0` is falsy. At runtime a function, a
  string, a symbol or a non-null object gets through and nothing else does.
  Grep for values forwarded into the listener position from config or from a
  wrapper's arguments; every documented spelling of `on()` is unaffected.
- **The listener slot no longer accepts an array, `null` or `undefined` —
  as a compile error.** This is the type half of the runtime check above,
  and it catches what that one cannot: an array *is* a non-null object, so
  `on(ε, ['a', 'b'])` looked dispatchable to the runtime test and threw
  `subscribeTo() called with insufficient arguments` anyway. That call, and
  `on(ε, null)` / `on(ε, undefined)`, are compile errors now. The *trailing*
  listener-object slot is unchanged and still nullish —
  `on(ε, 'foo', 'handler', null)` is the documented late-bound shape, not a
  lookup that missed. Guard the lookup, or keep the handle `on()` returned:

  ```ts
  const handler = handlers[name];
  if (handler) on(ε, 'foo', handler);
  ```
- **`on()` / `once()` throw on a `NaN` priority.** `NaN` is a `number`, so it
  passed as a priority and then made every comparison in the insertion sort
  false — the listener landed wherever the bucket size put it, silently. The
  check covers all four positions a priority can occupy, `[name, priority]`
  tuples included, and it rejects the whole call either way: a `NaN` in one
  tuple registers none of the names in that call, and a `NaN` at call level
  throws even when every tuple carries its own priority to override it —
  `on(ε, [['a', 5], ['b', 7]], NaN, fn)` used to subscribe both names at
  their tuple priorities. `Priority.Max` / `Priority.Min` (`±Infinity`) stay
  valid: the test is `Number.isNaN`, not a finiteness test. The realistic way
  in is arithmetic on unvalidated input — `on(ε, 'foo', Number(cfg.prio), fn)`
  — so validate before the call: `Number.isNaN(p) ? Priority.Normal : p`, and
  apply the same guard inside a tuple, which the call-level value does not
  cover.
- **A typed event map now narrows on `eventize.inject()` and on
  `class Eventize`.** Both surfaces used to accept every wrong event name and
  every wrong argument tuple, and on the class surface the listener parameters
  inferred as `any`: the guard that closes the loose overloads sat on the standalone
  functions' `obj` parameter, and a method has none. It sits on the event-name
  slot now, where both surfaces reach it. The class needed a second fix — it
  declared its own `on` / `emit` / … in the class body, and a member declared
  there wins over the same name inherited from the merged `EventizeApi`
  interface, so the loose implementation signature was the public one however
  well the interface was tuned. Those implementations live on the prototype
  now — same functions, still non-enumerable, no runtime change — which leaves
  the merged interface as the class's only type source. Grep for
  `eventize\.inject<` and `extends Eventize<`, then fix the names, or declare
  an index signature to keep the dynamic ones open:

  ```ts
  interface ChatEvents {
    joined: [user: string];
    [key: string]: any[]; // dynamic names stay open
  }
  ```

  Untyped emitters are unaffected: every duck-typing route stays open,
  including dynamic names, symbols, catch-all subscriptions and late-bound
  method names. So does a call with no event name for the guard to close: a
  catch-all is accepted on all three surfaces, and a listener-object passed
  alone is accepted on the method surfaces even when its method names are not
  in the map — the standalone two-argument `on(ε, obj)` is the one spelling
  that still rejects the same literal, because it is typed as
  `EventListenerMethods<TEvents>`.
- **A subclass that narrows an override of one of those methods is a
  `TS2416`.** The override has to be assignable to the whole merged
  `EventizeApi` overload set now, and a name-narrowed
  `emit(eventName: 'data', …)` does not satisfy the array arm. It compiled up
  to `v5.1.0`, where the class's own loose declaration was the only base
  member it had to match. Declare the override with the loose implementation
  signature instead:

  ```ts
  class Chat extends Eventize<ChatEvents> {
    override emit(eventNames: AnyEventNames, ...args: EventArgs): void {
      super.emit(eventNames as never, ...args);
    }
  }
  ```

  And for as long as it is declared, that one member is loose again for
  callers of the subclass — a member in a class body wins over the merged
  interface, which is the whole reason the base class stopped declaring its
  own.

Verify an upgrade with `getSubscriptionCount(ε)` and `getRetainedCount(ε)`
around the call in question — they read both halves of an emitter's state
without reaching into internals, and `getRetainedCount(ε)` is where the
bulk-`off()` change shows up:

```js
retain(ε, 'config');
emit(ε, 'config', settings);
on(ε, 'config', fn);

off(ε);

getSubscriptionCount(ε); // => 0 — in v5 and v6 alike
getRetainedCount(ε); // => 0 in v6, would have been 1 in v5
```

One step comes **before** the install rather than after it: dedupe
`@spearwolf/eventize` in the dependency tree. The marker key is
`Symbol.for('eventize')` and therefore realm-wide, so a `^5` and a `^6`
resolved side by side — which npm does without complaint as soon as one
transitive dependent asks for the older range — share one slot per object and
each copy reads the other's payload as its own. Up to v5.1.0 that dispatched
across the versions for a while and then threw from inside the dispatch,
naming nothing useful. v6.0.0 versions the marker payload, so the same tree
now fails at the boundary with a `TypeError` that names both protocols and the
remedy. Check with `npm ls @spearwolf/eventize`, fix with `npm dedupe` or an
`overrides` / `resolutions` entry pinning `^6.0.0`. At runtime,
`getEventizeProtocol(obj)` says which copy owns an object without throwing.

Four more runtime changes ride along, all filed as **fixes** rather than
breaking changes — one stopped dispatching to code the subscriber never
wrote, one turned a silent no-op into a throw, one made a call do the one
thing its arguments ask for, one stopped an API surface from contradicting
itself — but a `v5.1.0` consumer meets all four in the same upgrade and none
of them is visible to the type checker:

- **An event name that only matches an inherited `Object.prototype` member
  dispatches to nothing.** `toString`, `toLocaleString`, `valueOf`,
  `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`
  and V8's `__defineGetter__` family used to resolve to the function every
  object inherits — on both dispatch paths. `emit(ε, 'toString')` called it on
  every listener-object subscribed to that name and on every wildcard
  listener-object, `emitAsync(ε, 'toString')` collected `'[object Object]'`,
  `emitAsync({}, 'constructor')` collected `[{}]` from the `Object`
  constructor invoked as a plain function, and `emit(ε, '__defineGetter__')`
  threw a `TypeError` from deep inside the dispatch. A `once()` in any of
  those shapes was consumed without calling a handler — except for the two
  `__define*` names, where the throw came before the auto-unsubscribe ran and
  the subscription survived by accident; it now survives everywhere, so an
  emitter holds such a subscription until it is answered or released. Grep for
  event names taken from external data (JSON keys, message types, DOM
  attributes) — that is where the collision happens by accident. If a name of
  this kind was doing real work, spell the method out with the method-name
  form (`on(ε, 'toString', 'toString', obj)`), which is deliberately exempt,
  or define the method on the target: a target's own method under that name
  dispatches as normal, unless it is literally an alias of
  `Object.prototype`'s function.
- **`on(ε, [], …)` and `once(ε, [], …)` throw instead of registering
  nothing.** An empty array of event names used to reach the same map that
  turns each name into a registration, so zero names meant zero
  registrations, silently: the call handed back an unsubscribe handle for
  nothing, and `onceAsync(ε, [])` returned a promise that never settled — no
  resolve, no reject, a dangling `await` for the emitter's lifetime. All
  three now throw `subscribeTo() called with insufficient arguments`
  (`Error.cause: 'empty-names'`), atomically, before anything is registered.
  The empty array is rarely a literal in working code, so the place to look
  is a runtime-assembled name list that can come out empty — check `.length`
  before subscribing, the same way a bulk `off([...])` needs guarding against
  a nullish element.
- **`off(ε, '*', listenerObject)` now detaches that object's wildcard
  subscriptions.** It used to remove nothing and report nothing: `off()`
  routes a name-plus-object pair into the named buckets, and a wildcard
  listener has never lived there. Every shape that puts an object on the
  wildcard was affected — `on(ε, '*', obj)`, the bare catch-all `on(ε, obj)`,
  `on(ε, '*', fn, ctx)` and `on(ε, '*', 'method', ctx)`. Grep for the call:
  code that used it as a working cleanup step was leaking the subscription,
  and code that had settled for the blunt workarounds (`off(ε, '*')`, which
  wipes the emitter, or `off(ε, obj)`, which also drops the object's *named*
  subscriptions) can now narrow to what it actually meant. Named
  subscriptions of the same object survive this call, retained state is
  untouched — `'*'` can never carry any — and reference counting is not
  consulted, so one call releases a `refCount`-2 registration outright,
  exactly as `off(ε, 'foo', obj)` always has.
- **`eventize.inject()`'s nine methods are no longer enumerable.** They used
  to be installed with `Object.assign()`, as own enumerable properties;
  `class extends Eventize` already installed the same nine on the prototype
  non-enumerably and said why in a comment `eventize.inject()` did not
  follow. `Object.keys(injected)` and `for…in` listed all nine, a spread
  (`{...injected}`) carried a working, closure-capturing `emit`/`on`/etc.
  that still drove the *original* object, and `structuredClone(injected)`
  threw `DataCloneError` where `structuredClone(eventize({}))` did not. All
  three close with the same `Object.defineProperties()` /
  `{enumerable: false}` descriptor the class surface already used. Grep for
  `eventize\.inject\(` and check for a spread, `Object.keys()`/`for…in`, or
  `structuredClone()` over the result; reading a method by name
  (`injected.on`) or destructuring it (`const {on, emit} = injected`) is
  unaffected. Installing onto any pre-existing member `Object.assign()`
  couldn't write through — a non-writable data property, or an accessor with
  no setter — also changes, but only when that member is *configurable*:
  assignment used to throw (`Cannot assign to read only property …` /
  `Cannot set property … which has only a getter`); `Object.defineProperty()`
  replaces the descriptor outright and now succeeds silently instead. A
  non-configurable member still throws, now `Cannot redefine property:
  <name>` in place of the assignment error.

## v4 → v5: `emit()` stopped throwing

`emit()` and `emitAsync()` no longer throw `"object is not eventized"` on a non-eventized target. They duck-type instead:

1. `obj[eventName]` is a function the object itself provides → call it with
   `this === obj`. Since v6.0.0 a member inherited from `Object.prototype`
   doesn't count (see the v5 → v6 note above).
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
