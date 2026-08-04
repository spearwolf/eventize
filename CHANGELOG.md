# CHANGELOG

## `v6.0.0` (unreleased)

**Not published.** `package.json` carries `6.0.0-dev`, and `scripts/publishPackage.cjs` refuses to publish any version ending in `-dev`, so the registry stays on `v5.1.0` until this heading loses the suffix and gains a date.

Everything below is stated against `v5.1.0` — the version consumers actually have. `v6.0.0` is the only `6.x` there is, so this is the whole jump. Seventeen breaking changes — eleven runtime, six type-only; the two with the widest reach are every bulk `off()` form now clearing retained state along with listeners, and `on()` and `once()` aggregating by listener identity. [`docs/migration.md`](./docs/migration.md) walks the upgrade with before/after code.

### Breaking

- **`on()` and `once()` aggregate by listener identity.** A listener object — or a `(methodName, listenerObject)` pair — subscribed to the same event at the same priority is one registration, however many `on()` and `once()` calls produced it, and it is dispatched once per emit. The first dispatch discharges every pending `once()`; the registration survives while an `on()` still holds it. Up to `v5.1.0` two `once()` calls on one identity collapsed into a registration that never settled — it fired on every emit instead of once. An `on()` paired with a `once()` already behaved as it does now, in either order. _Migration:_ where two `once()` calls on one identity were relied on to keep firing, subscribe with `on()`. Function listeners are unaffected — they never aggregate.
- **Every bulk `off()` form clears retained state as well as listeners** — `off(ε)`, `off(ε, undefined)`, `off(ε, '*')`, and any array containing `'*'`, `null` or `undefined`. They used to empty the listener registry and leave every retained value and policy in place — except the names spelled out in an array, which the old array branch already cleared. So the call that reads as "reset the emitter" was the one that pinned the payloads and still replayed them to the next subscriber, and `off(ε, ['a', undefined])` cleared `a` while sparing everything else. What changes is that the rest of the keeper now goes too. _Migration:_ re-`retain()` and re-`emit()` afterwards, or narrow to `off(ε, eventName)` / `off(ε, [names])`, which are unchanged. Filter runtime-assembled name lists — one nullish element turns the call into a full wipe.
- **Unsubscribe handles are single-shot.** A second call is inert. It used to run a second `off()`, decrementing a shared reference count again and releasing a _sibling_ handle's registration. _Migration:_ keep the handle the most recent `on()` returned; `off(ε, listenerObject)` releases every matching registration in one call.
- **`on()` / `once()` reject a listener they could never dispatch to.** The slot is type-checked rather than truthiness-checked: a function, a string, a symbol or a non-null object passes, anything else throws `subscribeTo() called with insufficient arguments`. `on(ε, 'foo', 5)` used to register a subscription no `emit()` could reach while still counting towards `getSubscriptionCount(ε)` — and the same call with `0` threw, because `0` is falsy. _Migration:_ grep for values forwarded into the listener position from config or from a wrapper's arguments. Every documented spelling of `on()` is unaffected.
- **`on()` / `once()` throw on a `NaN` priority** (`subscribeTo() called with a NaN priority`), in all four positions a priority can occupy, `[name, priority]` tuples included. `NaN` used to pass and then poison the insertion sort — every comparison against it is false, so the listener landed wherever the bucket size put it, with no error and no warning. Rejection is atomic: a `NaN` in one tuple registers none of the names in that call, and a call-level `NaN` throws even when every tuple carries its own priority. `Priority.Max` / `Priority.Min` are `±Infinity` and stay valid — the test is `Number.isNaN`, not a finiteness test. _Migration:_ validate before the call, and give each tuple its own guard.
- **`on()` / `once()` / `onceAsync()` throw on a sparse array of event names.** A hole — `new Array(2)`, or a literal built with an elision — used to be silently skipped by the per-name registration, so `on(ε, ['a', , 'b'], h)` registered only `'a'` and `'b'` instead of throwing, and an array of nothing but holes registered nothing at all: `once(ε, new Array(2), h)` returned a handle for zero subscriptions, and `onceAsync(ε, new Array(2))` returned a promise that never settles — the exact failure the empty-array guard exists to prevent, reached through a length that isn't `0`. All three now throw `subscribeTo() called with insufficient arguments` (`Error.cause: 'sparse-names'`), atomically, before anything is registered. An element explicitly set to `undefined` is unaffected — it is a value, not a hole, and registers under the name `undefined` exactly as before; that is a separate, pre-existing question this change does not touch. _Migration:_ build the name list densely — `push()`/`filter()` never leave a hole — or check for one with an indexed loop (`for (let i = 0; i < names.length; i++) if (!(i in names))`) before subscribing, the same way a nullish element needs checking before a bulk `off()`.
- **A method-name subscription with a missing listener object dispatches to nothing** instead of throwing. `on(ε, 'foo', 'handler', null)` — or the same call with the fourth argument left off — used to throw `TypeError: Cannot read properties of null` the moment the event fired. It now behaves like the late-bound listener object it is, and a `once()` in this shape is not consumed.
- **`off(ε, listenerFunc)` detaches that function whatever context it was registered under.** It used to match only registrations whose stored context was `null`, so `on(ε, 'evt', this.handler, this)` survived `off(ε, this.handler)` in silence and left both the function and the context object held by the emitter. _Migration:_ `off(ε, fn, ctx)` where the context is part of what you mean — that form still matches exactly that pair, and it is now the only one that does. `off(ε, listenerObject)` reads the identity slot the same way and picks up the one shape it used to miss, `on(ε, name, obj, ctx)`.
- **`off(ε, listenerObject, context)` narrows to exactly that pair.** The three-argument form used to detach the named pair *and* every registration that merely drew the listener object as some *other* listener's context, so nothing addressed one registration on its own. It now removes only what it names — the same promise `off(ε, listenerFunc, ctx)` has always carried, which up to `v5.1.0` held for a function argument only, because a function in that slot was not matched at all. _Migration:_ `off(ε, listenerObject)` where the broad sweep was the point; the two-argument forms still take both roles.
- **`off(ε, <numeric listener id>)` removes nothing.** Passing the internal listener's id used to detach it outright, skipping the reference count every documented removal path honours. It was undocumented and untested, and with the handle reduced to `() => void` there is no supported way to obtain such an id. _Migration:_ `unsub()`.
- **`retainClear()` and `unretain()` throw a `TypeError` that names the function and the remedy**, replacing the bare `new Error('object is not eventized')`. Code that matched the error class or the exact message text breaks. _Migration:_ catch `TypeError`, or match the new wording — `eventize(obj)` first, or guard the call with `isEventized(obj)`.

Six more are type-only and surface as compile errors rather than as behaviour changes:

- **The listener slot no longer accepts an array, `null` or `undefined`.** `on(ε, ['a','b'])`, `on(ε, null)` and `on(ε, undefined)` compiled and then threw `subscribeTo() called with insufficient arguments`; they are compile errors now. The *trailing* listener-object slot is unchanged and still nullish — a late-bound `on(ε, 'foo', 'handler', null)` is a documented shape. _Migration:_ guard the lookup, or keep the handle `on()` returned.
- **`UnsubscribeFunc` is `() => void`.** The handle no longer carries `.listener` / `.listeners`, and `EventListener` has left the published surface entirely. The old declaration was a union TypeScript could never narrow, so both fields were a `TS2339` at every call site — the documented `off(ε, unsub.listener)` never compiled against the shipped declarations, and the `EventListener` it named resolved to the **DOM** global, not this package's class. _Migration:_ `unsub()` — same reference-counted path, same single-shot guard, no emitter needed in scope. Reads past it (`.listener.id`, `.isRemoved`) were internals with no replacement.
- **`emitAsync()` returns `Promise<any[] | undefined>`** instead of `Promise<any>`, on all three API surfaces. The runtime has always resolved to `undefined` when no listener returned a non-null value; `any` did not merely lose precision, it switched checking off, so `(await emitAsync(ε, 'x')).map(…)` compiled and then threw. _Migration:_ `(await emitAsync(ε, 'x'))?.map(…)`, or `?? []`.
- **`ListenerType` is gone.** It was `export type ListenerType = unknown`, an alias nothing in the package referenced. _Migration:_ write `unknown`.
- **A typed event map now narrows on `eventize.inject()` and on `class Eventize`.** Both surfaces accepted every wrong event name and every wrong argument tuple, and on the class surface the listener parameter inferred as `any`: the guard that closes the loose overloads sat on the standalone functions' `obj` parameter and a method has none, and the class on top of that declared its own methods in the class body, which win over the same names inherited from the merged `EventizeApi` interface. `SubscribeFunc` and `EventizeApi` close theirs on the event-name slot instead, and the class's implementations moved to the prototype — unchanged and still non-enumerable — so the merged interface is its only type source. _Migration:_ fix the names, or declare `[key: string]: any[]` in the map to keep dynamic names open. Untyped emitters are unaffected.
- **A subclass that narrows an override of one of those methods is a `TS2416`.** The override has to be assignable to the whole merged `EventizeApi` overload set now, and a name-narrowed `emit(eventName: 'data', …)` does not satisfy the array arm; it compiled up to `v5.1.0`, where the class's own loose declaration was the only base member it had to match. _Migration:_ declare the override with the loose implementation signature — `emit(eventNames: AnyEventNames, ...args: EventArgs)` — and forward with `super.emit(eventNames as never, ...args)`.

### Added

- `getRetainedCount(ε)` and `getRetainedEventNames(ε)` join `getSubscriptionCount(ε)` — how many events hold a retained value, and every name carrying a retain policy whether or not it has fired. Both return `0` / `[]` for non-eventized objects. Until now the retained half of an emitter's state was invisible from the outside.
- `onceAsync(ε, eventNames, {signal})` accepts an `AbortSignal`. Aborting unsubscribes the internal `once()` and rejects with the signal's `reason`, or with an `AbortError` `DOMException` when it has none. Without a signal, an event that never fires pins the listener, the resolve closure and the caller's entire `await` continuation for the emitter's lifetime, with no handle to release them. New exported type `OnceAsyncOptions`; available on all three API surfaces.
- `unretain(ε, '*')` and `retainClear(ε, '*')` gained bulk semantics: the former drops every retain policy and every retained value, the latter drops the values and keeps the policies. Both were silent no-ops before.
- `getEventizeProtocol(ε)` reports the marker's protocol number — `6` for anything this copy eventized, `undefined` for an object without the marker or with one written before the field existed. It never throws, so it can answer "which copy eventized this?" before anything else does.
- `Priority.Medium` (`1e3`) fills the gap the legacy `C` alias occupied. The four legacy aliases `AAA`, `BB`, `C` and `Default` are now marked `@deprecated` and slated for removal in a future major; they keep working.
- **`SubscribeArgs` is now a union of named arms**, one group per decoding branch of `_subscribeTo()` — `NamedFuncArgs`, `NamedPriorityMethodArgs`, `CatchAllObjectArgs` and eight siblings, all exported. One arm is new rather than renamed: `CatchAllPriorityMethodArgs` types `on(ε, priority, methodName, listenerObject)`, which `_subscribeTo()` has always decoded and the union never modelled. Every other shape is unchanged; what is new is that a wrapper can name the one arm it handles.
- **`SubscribeImpl`** is the exported implementation signature of `on()` / `once()`. TypeScript refuses to spread a union of tuples into a fixed-arity call, so `on(target, ...args)` never compiled against the public overloads; `const rawOn = on as SubscribeImpl` is the sanctioned way to write a forwarding wrapper, and it is the cast this package already made for itself.
- **`StandaloneSubscribeFunc`** is the exported overload set of the standalone `on()` / `once()` — what `SubscribeFunc` is for `eventize.inject()` and `class Eventize`, with the emitter in the first slot. Both functions are now declared against it instead of each carrying a hand-maintained copy of the same 35 signatures. Every call shape, and the order they are resolved in, is unchanged; an editor hovering `on` shows the interface name rather than 35 rolled-out overloads, while signature help as you type `on(` is unaffected. One runtime side effect: `on` and `once` no longer carry a `.prototype`, so `new on(…)` throws `TypeError: not a constructor` instead of running the body — never a supported call. `name` and `length` are unchanged.
- **Five call shapes the runtime always accepted now compile**: an object listener with a trailing context object in every one of the four positions it can occupy — `on(ε, obj, ctx)`, `on(ε, 'foo', obj, ctx)`, `on(ε, 10, obj, ctx)`, `on(ε, 'foo', 10, obj, ctx)` — and the catch-all method-name form with a priority, `on(ε, 10, 'handler', obj)`. The context is the fourth slot of the documented dedup tuple and the key `off(ε, ctx)` removes by; the shapes were reachable, dispatched correctly, and had no compiling spelling.
- **A typed emitter takes the same call shapes through `on(ε, …)` as through `ε.on(…)`**: `on(ε, 'msg', obj)`, `on(ε, 'msg', 'method', obj)`, `on(ε, 'msg', fn, ctx)` and `on(ε, fn)`, each with its priority variant, and the same for `once()`. The standalone guard sits on `obj`, so a typed map closed the whole loose overload set with it — forms carrying no event name to check included. `on(ε, 'msg', fn, ctx)` compiled on no surface and is new on all three. The two-argument `on(ε, listenerObject)` deliberately stays typed as `EventListenerMethods<TEvents>`, so its method names are still checked against the map.
- **`emit(names[], …)` and `emitAsync(names[], …)` are typed on `eventize.inject()` and `class Eventize`.** A typed map closes their loose array route along with every other loose overload, so both members gained a `K[]` arm that checks each name against the map. Without it a typed method surface could not emit an array at all.
- **`emit()` and `emitAsync()` duck-type on a function target.** A class with static handlers or a function carrying methods dispatches like any other non-eventized target — `emit(Registry, 'reset', 1)` calls `Registry.reset(1)`, and the `.emit()` fallback applies as usual. Up to `v5.1.0` the same call was a silent no-op, because the duck-target test demanded `typeof === 'object'`, while the same function dispatched normally after `eventize()`. Two names on a function target throw a `TypeError` out of the dispatch instead of falling through: `arguments` and `caller` are poisoned accessors on a strict-mode function — a sloppy-mode one answers `null` and reaches the `.emit()` fallback — and reading the member is what a dispatch does first.
- **`ListenerObjectSlot` and `MultiArgsFor`** join the exported types. The first is the listener-slot constraint that rejects an array, a function and nullish; the second is the argument list of a listener serving several event names. Both appear in the published signatures, so a wrapper reproducing one can name it. The guards behind them (`IsLooseMap`, `LooseNames`, `LooseEmitNames`) stay unexported — each is shorter spelled out than imported.

### Fixed

- **A common listener for several typed event names compiles again when the argument tuples differ.** `on(ε, ['data', 'close'], (first) => …)` produced `TS2769` naming only the last overload, because `ArgsFor` distributed into a union of signatures no single function satisfies. The tuples are merged first now: identical ones stay positionally typed, differing ones give the listener the union of every element type.
- **`isEventized()` no longer erases a typed emitter's event map.** The guard narrowed to `EventizedObject<DefaultEventMap>`, and the intersection reopened every loose overload: `emit(ε, 'nope')` was a compile error outside the `if` and legal inside it. It now preserves the map it was handed and keeps narrowing `unknown` exactly as before.
- **An event name colliding with an inherited `Object.prototype` member no longer dispatches to it** — on both dispatch paths, so `emitAsync()` aggregates the same way for eventized and non-eventized targets. `toString`, `toLocaleString`, `valueOf`, `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable` and V8's `__defineGetter__` family used to resolve to the function every object inherits: `emitAsync(ε, 'toString')` collected `'[object Object]'`, `once(ε, 'toString', {})` was consumed without running a handler, and `emit(ε, '__defineGetter__')` threw from inside the dispatch. The test is function identity against `Object.prototype`, so a target's own method under that name dispatches as normal; a skipped name falls through to the `.emit()` fallback. The method-name form `on(ε, 'evt', 'toString', obj)` is deliberately exempt — it names what it wants. _Migration:_ if such a name was doing real work, use the method-name form or define the method on the target. Event names taken from external data (JSON keys, message types, DOM attributes) are where the collision happens by accident.
- **An event name colliding with an inherited `Function.prototype` member no longer dispatches to it either** — the same identity test, one prototype level further out, and it runs on both dispatch paths for every target rather than only for the function targets it arrived with. `call`, `apply`, `bind`, `toString` and `Symbol.hasInstance` are callable on every function, so without the level the function targets above would answer all of them: `emit(fn, 'bind', ctx)` would reinterpret the caller's first argument as a `this` value, and `emitAsync(fn, 'bind')` would aggregate the bound function as though a handler had returned it. (`constructor` is not decided here — it is carved out unconditionally, which is the next entry.) A skipped name falls through to the `.emit()` fallback. `name` and `length` are own properties of a function rather than inherited ones, so the test does not reach them; they hold a string and a number, are therefore not callable, and reach the fallback anyway. On a plain object the level is visible in one shape only, and it is a fix: `{bind: Function.prototype.bind}` used to be dispatched and throw "Bind must be called on a function" from inside the dispatch, and is now skipped like any other alias of an inherited function.
- **`emit(ε, 'constructor')` against a class instance no longer throws from inside dispatch.** A class instance's `constructor` is the class itself, never identical to `Object.prototype.constructor`, so the identity test above missed it and `apply()` invoked the class as a plain function. `constructor` is now excluded unconditionally, ahead of that check — including an *own* `constructor` property, unlike every other name the identity test covers — and falls through to the `.emit()` fallback instead.
- **The event name `__proto__` dispatches to nothing**, carved out unconditionally like `constructor` and for the same reason: neither prototype level can subtract it (`Object.prototype.__proto__` is `null`, and the accessor is not one of `Function.prototype`'s own keys), while on a function target it resolves to something callable. `emit(fn, '__proto__')` invoked `Function.prototype` as a handler and swallowed the `.emit()` fallback with it; on a subclass, `emit(Sub, '__proto__')` threw `Class constructor Base cannot be invoked without 'new'` from inside the dispatch. It now falls through to the fallback. On an object target nothing changes — a prototype object is not callable — unless the target's own prototype is a function (`Object.create(fn)`), which used to dispatch.
- **`eventize.inject()` installs its nine methods non-enumerable**, matching the class surface, which already did and said why. `Object.assign()` made them own enumerable properties, so `Object.keys(injected)` and `for…in` listed all nine, `{...injected}` produced an object with a working, closure-capturing `emit`/`on`/etc. that still drove the original emitter, and `structuredClone(injected)` threw `DataCloneError` where `structuredClone(eventize({}))` did not. `Object.defineProperties()` with `{writable: true, enumerable: false, configurable: true}` closes all three at once; destructuring (`const {on, emit} = injected`) is unaffected. A side effect of the same switch: installing onto any pre-existing member `Object.assign()` could not write through — a non-writable data property, or an accessor with no setter — no longer throws, *if* that member is configurable: `defineProperty()` replaces the descriptor outright instead of assigning through it. A non-configurable member still throws either way, now as `TypeError: Cannot redefine property: <name>` instead of the old assignment error. _Migration:_ `Object.keys()` / `for…in` / a spread over an injected object no longer surfaces the nine methods; read them by name (`injected.on`, `injected.emit`, …) instead.
- **`off(ε, '*', listenerObject)` detaches that object's wildcard subscriptions** instead of doing nothing. The call routed into the named buckets, where a wildcard listener has never lived, so every shape that puts an object on `'*'` was unremovable except by wiping more than intended. Named subscriptions of the same object survive, retained state is untouched, and reference counting is not consulted — one call releases a `refCount`-2 registration outright.
- **`off(ε, [eventName, …], listenerObject)` no longer clears retained state for listeners it never removed.** The store's array branch requires `listenerObject == null`, so with one given nothing was ever unsubscribed while the keeper dropped every listed name's value and policy. The call is now a complete no-op on both halves. _Migration:_ use `off(ε, [names])` without a listener object, or `unretain(ε, [names])`.
- **A spent unsubscribe handle holds neither the emitter nor the listener.** The closure used to keep both for the handle's lifetime, so a kept handle pinned the store, the keeper and every retained payload — under _any_ event name, not just the one it subscribed to. The teardown pattern this project's own docs recommend, `subs.push(on(…))` followed by `subs.forEach((u) => u())`, is exactly the shape that hit it. A `once()` counts as spent the moment its obligation is discharged, whether or not anyone called the handle. An _unconsumed_ handle still pins the emitter, by design.
- **Removed listeners release their references.** `EventListener.detach()` nulls `listener`, `listenerObject` and `callAfterApply`, and all three removal paths in `EventStore` use it. Previously a removed listener was only flagged as removed and went on holding everything it had.
- **`off(ε, listenerObject)` and `off(ε, fn)` remove every matching subscription**, not just the first one found in each bucket. Anything registered more than once for the same event — differing priorities, or the same function twice — was left partly subscribed and kept firing, while `docs/off.md` promised the opposite.
- **`off(ε, listenerObject)` detaches a listener object that is a function or a class.** The sweep tested `typeof listener === 'object'`, so `off(ε, Registry)` after `on(ε, 'foo', 'reset', Registry)` removed nothing and reported nothing — the class stayed subscribed and kept firing — and the same held for a function in the context slot, `on(ε, 'foo', handler, ctxFn)`. The removal now accepts the set `ListenerObjectType` describes — `object | null | undefined`, so a function or a class and nothing else. (A primitive in that slot still dispatches and still cannot be removed by identity: `on(ε, 'foo', 'toFixed', 42)` is reachable only through `off(ε, 'foo')` or a handle.) One consequence, symmetric to the object case: `off(ε, fn)` also detaches the registrations that drew `fn` as some *other* listener's context. Use `off(ε, other, fn)` to name a single one. The targeted `off(ε, 'foo', Registry)` never ran that test — but it missed the same registration up to `v5.1.0` for the separate reason recorded in the next entry, so no identity-based `off()` reached it at all.
- **`off(ε, eventName, listenerObject)` detaches listeners registered in the method-name form** `on(ε, eventName, methodName, listenerObject)`. The association filter compared the wrong slot, so cleanup code believed it had run while the emitter kept holding the listener object. The same widening also detaches the function-with-context form `on(ε, eventName, fn, context)` when called with that context.
- **`retain(ε, '*')` throws** instead of filing `'*'` as an ordinary retained name, where a later `on(ε, '*', fn)` recursed through the entry until the stack overflowed. `'*'` stays subscribe-only, matching `emit()`.
- **A retained event is no longer replayed twice when `on()` deduplicates the subscription.** The replay now runs only when the store actually inserted a listener; a deduplicated `on()` is a pure reference-count bump. A `once()` joining an existing registration is the one case that still replays: its obligation is new even though the listener is not.
- **`once()` no longer consumes itself when the dispatch found nothing to call.** `once(ε, 'foo', {})` followed by `emit(ε, 'foo')` used to unsubscribe even though the object had neither a `foo` method nor an `.emit()` fallback, so supplying the method afterwards fired nothing. The same guard covers the method-name form; the wildcard form `once(ε, listenerObject)` now fires on the first event the object can actually handle rather than the first it merely sees. Function listeners are unaffected — they are callable by construction.
- **A `[name]` tuple written without its priority falls back to the call-level priority** instead of passing `undefined` into the sort, where `b.priority - a.priority` is `NaN`, every comparison is false, and the listener is appended regardless of what it or its neighbours are worth.
- **Two incompatible copies of `@spearwolf/eventize` on one object now fail with a named diagnosis.** The marker key is `Symbol.for('eventize')` and therefore realm-wide, so a `^5` and a `^6` resolved side by side share one slot and each reads the other's payload as its own — `v6.on()` and `v6.emit()` ran against a v5 emitter without a word until something broke with `TypeError: store.settleOneShots is not a function`, several calls away from the mixing. The marker payload now carries a protocol version, checked wherever the internals are read, and a mismatch throws a `TypeError` naming both protocols and the remedy: dedupe `@spearwolf/eventize` in the dependency tree. `asEventized()` / `eventize()` throw it too instead of returning a foreign emitter. `isEventized()` is unchanged — it stays a non-throwing type guard for "has the slot at all".
- **The marker slot can no longer be deleted.** It was `configurable: true`, so `delete ε[Symbol.for('eventize')]` was legal and entirely silent: the object read as not eventized while its store and keeper went on holding listeners and retained values nobody could reach, and the next `on()` built a second, empty set. The slot is now non-configurable and the `delete` throws in strict mode.
- **`eventize()` on a non-extensible object names the cause** instead of leaking an opaque native error: `eventize() cannot attach to a non-extensible object — eventize before freezing, or eventize a wrapper`. Still a `TypeError`, so call sites branching on error class see no difference. An object eventized _before_ it was frozen is unaffected.
- **`eventize(42)`, `eventize('foo')`, `eventize(null)` and the like now name the type they were given** instead of reusing the non-extensible-object message. `Object.isExtensible()` returns `false` for every primitive, so a non-object argument used to fall into that branch and be told to eventize before freezing — advice that never fit. Still a `TypeError`. Objects, functions and already-eventized values are unaffected.
- **`lib/index.d.ts` no longer exports `EventListener` in the value namespace**, where it contradicted both `src/index.ts` and the runtime bundles — `import {EventListener}` from the ESM build threw a `SyntaxError`. The class stays as an unexported `declare class` inside the file.
- **`tsconfig.json`'s `removeComments: true` was stripping every JSDoc comment**, `@deprecated` included, from the declarations tsup emits. `tsup.config.js` now overrides it for the `dts` pass only, so the shared config, `ts-jest` and the JS bundle are untouched.
- **`subscribeTo() called with insufficient arguments` now names its cause on `Error.cause`** — `'missing-listener'`, `'not-dispatchable'`, `'empty-method-name'` or `'empty-names'` — instead of only on the console via `warn()`. The thrown message is unchanged, so code that matches on the string sees no difference.
- **A non-number priority arriving through a `[name, priority]` tuple no longer poisons the sort.** The tuple's second slot reaches `assertPriorityIsUsable()` without the `typeof`-number gate branches A and B enter through, so a string, boolean or object cast into that slot answered `false` from `Number.isNaN()` exactly as `NaN` itself used to, and landed the listener by bucket size instead of by priority. The guard is now `typeof priority !== 'number' || Number.isNaN(priority)`; the thrown message, and `Priority.Max` / `Priority.Min` (`±Infinity`) staying valid, are unchanged.
- **`on(ε, [], …)` and `once(ε, [], …)` throw instead of registering nothing, and `onceAsync(ε, [])` no longer returns a promise that never settles.** The array branch maps each event name to a registration, so an empty array silently produced none — a handle for zero subscriptions, no warning, no throw — and the `once()` call `onceAsync()` wraps around left its promise permanently unresolved and unrejected. All three now throw `subscribeTo() called with insufficient arguments` (`Error.cause: 'empty-names'`), atomically, before anything is registered. _Migration:_ see `docs/migration.md`.
- **`exports` in `package.json` now declares `types` and `default`, and adds `./package.json`.** The map used to carry only `import` and `require`; a resolver honouring neither got no entry point at all, and the declared types rested on tsup's filename convention (`index.d.mts` beside `index.mjs`) rather than on a stated `types` condition. `require('@spearwolf/eventize/package.json')` now resolves instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **`off()`'s keeper half now follows nested arrays as deep as `EventStore.remove()`'s recursive array branch already does.** `isBulkRemoval()` and the array-to-name filter used to read only the top level, so `off(ε, [['a']])` cleared subscriptions for `'a'` while leaving its retained value in place, and `off(ε, [[null]])` emptied the whole store while the keeper kept every retained value — both flatten first now, matching the store at any depth.
- **A throwing `emitAsync()` dispatch no longer leaves unhandled rejections behind.** Promises collected before a later listener threw — or before the `'*'` rejection aborted an event-name array — sat in a local array with no handler and were reported by Node's `unhandled-rejections=throw` (or the browser's `unhandledrejection`), tearing down a process whose caller had caught the synchronous throw correctly. They are claimed now before the error is rethrown unchanged. Mixing promise-returning and throwing listeners on one emit needs no workaround any more.
- **`docs/backlog.md` is gone.** It briefly shipped inside the npm tarball, which it was never meant to do. Its two surviving entries moved to where a reader meets them: the typed-map narrowing asymmetry to [`docs/typed-events.md`](./docs/typed-events.md), the dev-dependency advisories to the project audit's appendix. Nothing under `docs/` is excluded from the tarball any more.
- **`onceAsync()` throws argument errors synchronously instead of rejecting.** `once()` ran inside the `new Promise(executor)` that builds the returned promise, so a throw from `subscribeTo()` — an empty array of event names, a `NaN` priority — was caught by the executor and handed back as a rejection instead of propagating out of `onceAsync()` at the call site. A fire-and-forget `onceAsync(ε, [])` with no `await`/`catch` turned that into an unhandled rejection under Node's default `--unhandled-rejections=throw`. The registration now happens after the promise's `resolve`/`reject` are captured but outside the executor, so the same throw reaches the caller synchronously, the way every other programmer-error throw in this library does. An already-aborted `AbortSignal` is unaffected — it still rejects, in the shape of `fetch()`, because that is not an argument error — and takes precedence over one: `onceAsync(ε, [], {signal: alreadyAborted})` rejects with the abort reason rather than throwing, since the abort check runs before the argument validation ever does.
- **A throwing retained replay no longer takes the rest of its batch — or the caller's handle — with it.** `publishReplays()` runs every queued replay in its own `try`/`catch`: the throw is reported through `console.warn` with the event name and the error, the remaining names of an `on(ε, ['a', 'b'], fn)` still replay in order, and `on()` / `once()` return the handle for the registration they completed. Up to `v5.1.0` the throw propagated out of `on()`, the later replays of that batch never ran, and the subscriptions the call had already made were reachable only through `off()`. A `once()` spends its one shot after the listener returns, so a replay that throws settles nothing and the next replay of the same batch fires the listener again. _Migration:_ see `docs/migration.md`.

### Performance

- **A dispatch that mutates nothing no longer allocates.** `EventStore.forEach()` used to copy the listener bucket on every `emit()`, whether or not anything subscribed or unsubscribed during it. The copy moved to the mutating side: a bucket carries a count of the walks stepping through it, and a mutation clones only a bucket a walk is actually holding. Copied slots per emit drop to zero at every bucket size; over 500 K emits at 512 listeners, GC scavenges fall from 2,052 to 71. The mutating path costs up to +16 % over a small bucket, with no trend over nesting depth. Dispatch semantics are unchanged in every particular. `AGENTS.md` carries the invariants any new mutation path has to obey.
- **A dispatch no longer allocates a closure to carry its own arguments.** `EventStore.forEach()` takes the event name, the arguments and the return-value collector as parameters and hands them to the callback, so the dispatch callback is a module-level function instead of a fresh arrow per `emit()`. A named dispatch to one listener drops from ~28.6 ns to ~22.6 ns.
- **Forwarding to a listener object's `emit()` builds its argument list once, and only when there is something to call.** The list used to be assembled with `concat` and passed as an argument to `apply()`, so it was built even when the target had no `emit()` method — the normal case for a catch-all listener object serving only some names. Such a dispatch drops from ~80 ns to ~24 ns; real A→B forwarding from ~120 ns to ~70 ns.
- **Unsubscribing no longer scans every event-name bucket.** Both removal helpers already held the event name they needed; removal drops from O(number of event names) to O(1), which matters for the cyclical subscribe/unsubscribe patterns in entity systems and scene graphs.
- **Registering an object or method-name listener no longer scans the whole bucket.** The dedup search reads an index, so subscribing n of them to one event name no longer grows quadratically with the number already there. Function listeners never deduped and are unaffected.
- **An emitter that never retains no longer carries a retain index.** The `Map` and `Set` behind `retain()` are created on first write, with shared empty stand-ins until then, so a fresh `eventize({})` drops from ~776 B to ~440 B. A subscription on such an emitter also skips the retained-value replay it used to queue unconditionally.
- **Wildcard replay costs what is actually retained, not what is merely known about.** The catch-all branch of `EventKeeper.replayTo()` walked every name carrying a retain policy and looked each one up to find that most hold nothing. With 20,000 policies and a single retained value, one `on(ε, '*')` cost 1.4 ms; it now walks the retained values directly.

### Internal

- `strictNullChecks` is on — it had been switched off directly beside `"strict": true`, disabling the most valuable check `strict` enables. Twenty errors across eight files, each fixed rather than suppressed, and one `as UnsubscribeFunc` cast that was masking a type error is gone.
- `tsconfig.json` gained `include: ["src"]` — without it `tsc` also read `jest.config.ts` and the generated `lib/index.d.*ts` — plus an explicit `module` / `moduleResolution` (`esnext` / `bundler`, not `nodenext`, which would demand extensions on the relative imports), `exactOptionalPropertyTypes`, `isolatedModules` and `noUncheckedIndexedAccess`.
- `npm run cbt` is a gate that binds. It gained a `typecheck` step (`tsc --noEmit`) — esbuild does not type-check, tsup's dts pass only reaches what `src/index.ts` imports, and `attw --pack` only checks already-emitted declarations, so nothing else read the specs or `src/__test-utils__/` — and it now runs `test:coverage`, so `jest.config.ts`'s `coverageThreshold` applies locally and not only in CI. Bare `npm test` stays coverage-free for narrow loops.
- `EventizedObject`'s marker slot became opaque, so `EventStore`, `EventKeeper` and `EventListener` no longer appear in `lib/index.d.ts` — `grep -c '^declare class'` drops from 4 to 1. Not a breaking change: the slot's key is a non-exported `unique symbol`, so reading it answered `TS7053` against `v5.1.0` too, and neither `EventStore` nor `EventKeeper` was ever exported for a structural annotation to name. The one export genuinely withdrawn is `EventListener`, covered by the `UnsubscribeFunc` entry above.
- `npm run cbt` now checks that boundary instead of only describing it: a new `check:dts` step fails the build when `lib/index.d.ts` or `lib/index.d.mts` declares a class other than `Eventize`, and names the one that leaked.
- An `EventListener` constructed directly with a `null` / `undefined` listener dispatches to nothing instead of throwing, and two of them no longer count as similar. Not a breaking change either: `EventListener` is `undefined` in both `v5.1.0` runtime bundles, so no consumer could construct one.
- `EventStore.remove()` lost its `instanceof EventListener` branch, so `off(ε, <EventListener instance>)` is a silent no-op. Unreachable through the `v6.0.0` API — the class is not exported and no handle hands one out — but a `v5.1.0` consumer could reach one through `handle.listener`. _Migration:_ call the handle.
- `EventListener.apply()` lost all four `@ts-expect-error` suppressions by testing `listener` directly instead of switching on the numeric tag. Three unreachable branches of `EventListener.isEqual()` are deleted. Six internal `any` annotations became `unknown` or `AnyEventNames`. Type-only imports are enforced by `@typescript-eslint/consistent-type-imports` rather than by habit.
- TypeScript stays at 5.9: `ts-jest` peers on `typescript: ">=4.3 <7"` and `typescript-eslint` on `<6.1.0`, and neither is worth forcing past with `--legacy-peer-deps` or an `overrides` entry.
- Dev dependencies updated, including `eslint` 9 → 10, `@eslint/js` 9 → 10 and `globals` 16 → 17; `eslint.config.mjs` moved from `tseslint.config()` to ESLint core's `defineConfig()`, and five deprecated `/* eslint-env */` comments were removed. No runtime dependencies exist, so none of this reaches consumers.

### Tests and documentation

- New `src/lifecycle.spec.ts` states cleanup as executable assertions: what each `off()` form releases from the store and from the keeper, handle lifetime after unsubscribe, keeper growth under dynamically generated names, and `WeakRef` checks on what a consumed handle still holds — with a control group proving an unconsumed one still holds the emitter.
- All 81 `@ts-ignore` directives are gone from the specs. The survivors are `@ts-expect-error`, which fails when the suppressed error disappears and so doubles as an assertion about the types; `ban-ts-comment` now rejects `@ts-ignore` in `**/*.spec.ts`.
- The specs read the registry through `src/__test-utils__/listeners.ts` rather than through the unsubscribe handle, so an assertion about internals says out loud that that is what it is.
- New documents: [`docs/lifecycle.md`](./docs/lifecycle.md) (what an emitter holds and what releases it), [`docs/migration.md`](./docs/migration.md) (the v5 → v6 upgrade, worked) and `docs/backlog.md` (decisions with no other home in the repository; retired in `v6.0.0`).
- Behaviours that were always true and never written down are now recorded: retained payloads are held by strong reference and not cloned; `retain()` with dynamically generated names is a supported pattern whose cleanup belongs to the caller; ordering stability from the module-global id counters holds per loaded module instance, not per realm; "equal priorities keep insertion order" is a per-bucket guarantee, so at equal priority a named listener always runs before a wildcard one regardless of registration order; a `once()` whose listener throws stays subscribed and fires again; and any nested `emit()` — not only self-recursion — retains in completion order, so the outer call's value is the one that survives.
- `isEventized()`'s prototype-chain read was always true and is now pinned: `eventize(SomeClass.prototype)` makes every instance share one `EventStore` and `EventKeeper`, so `on()` on one instance is reachable from `emit()` on another and `getSubscriptionCount()` cannot tell them apart. New `src/marker-integrity.spec.ts` cases hold it in place.

## `v5.1.0` (2026-07-25) — Symbol-safe `off()`, per-event priorities everywhere

- **Fix:** `off(ε, [eventName, …])` now clears retained state for **symbol** event names too. The array branch filtered its elements with `typeof li === 'string'`, so `off(ε, [SOME_SYMBOL])` removed the listeners but left the retained value and the retain policy in place, while the scalar `off(ε, SOME_SYMBOL)` cleared both. The filter is now `isEventName`, which keeps strings and symbols alike. The filter exists because the array branch is also reached from the unsubscribe function of a multi-event `on()`, which passes an array of `EventListener` instances — those are still ignored, and a regression test covers it. Affects `src/eventize-api.ts`.
- **Types:** `OnEventNames` reworked to describe what `_subscribeTo()` has always accepted. It was `EventName | EventName[] | Array<[EventName, number]>`, which allowed a list of names _or_ a list of `[name, priority]` tuples but not a mix — even though the runtime checks `Array.isArray()` per element and handles the mixed form fine. It is now `EventName | Array<EventName | EventNameWithPriority>`, so `on(ε, [['foo', 100], 'bar'], fn)` type-checks without a cast. The new `EventNameWithPriority` (`[eventName: EventName, priority: number]`) is exported from the package root. `AnyEventNames` is unchanged and still used by `emit()` / `retain()`, which have no notion of priority.
- **Types:** Per-event priorities now work on **typed** emitters. Previously the tuple form didn't type-check there at all: the typed overloads accepted only `K` / `K[]`, and the loose fallback was closed off because `NonTypedEmitter<T>` collapses to `never` for a branded emitter. The typed array overload of `on()` / `once()` (and the corresponding `SubscribeFunc` signatures used by the injected and class APIs) now accepts `Array<K | [K, number]>` plus an optional call-level priority. Event names inside tuples are still narrowed against the event map, so `on(ε, [['unknown', 0]], fn)` remains a compile error. Widening a parameter position only — no call that compiled before stops compiling.
- **Docs:** Corrected a claim that predates this release: `off(ε, eventName)` doesn't merely clear the retained _value_, it drops the retain _policy_ as well, so it behaves like `unretain()`. `README.md`, `docs/off.md`, and the skill now say so.
- **Tests:** `src/documented-quirks.spec.ts` grew to 15 cases — symbol/string parity between the scalar and array `off()` forms, the listener-array regression guard, mixed tuple/name arrays on plain and typed emitters, the call-level-priority combination, and two `@ts-expect-error` cases proving tuples still reject unknown event names.

### Documentation restructure

_No runtime or type changes in this section._

- **Docs:** Restructured the agent- and human-facing documentation around progressive disclosure, following Anthropic's _"The new rules of context engineering for Claude 5 generation models"_ (2026-07-24). `README.md` shrank from 1275 to 678 lines; the deep material moved to `docs/off.md`, `docs/retain.md`, and `docs/typed-events.md`, linked from the summaries that remain.
- **Docs:** `AGENTS.md` is now the single canonical agent guide and `CLAUDE.md` a symlink to it, removing the duplicated command lists and documentation rules that had been drifting apart in the two files. `AGENTS.md` dropped the file-tree and tech-stack listings (readable from the repo) in favour of architecture invariants and verified quirks, and lost a stale convention block referring to `TODO.md`, deleted back in v4.1.0. The `npm run cbt` description was wrong — it also runs `attw`, lint, and the format check.
- **Docs:** `skills/using-eventize/SKILL.md` is now a ~90-line pointer; the detail lives in `references/api-details.md` (all `on()` / `off()` shapes, priorities, retain semantics), `references/typed-events.md`, and `references/migration.md`.
- **Docs:** Newly documented, previously unrecorded behavior — `emitAsync()` resolves to `undefined` rather than `[]` when nothing was collected; `eventize.is()` is a public alias of `isEventized()`; `asEventized()` is exported as the low-level primitive behind `eventize()`; and per-event priority tuples exist at all. Two further findings from this audit turned out to be defects rather than quirks and were fixed in this release instead of documented: the `off()` symbol asymmetry and the un-typeable mixed tuple array (see above).
- **Docs:** Fixed a README example that showed a wildcard function listener receiving the event name as its first argument — it does not; only the `emit()` args are passed.
- **Tests:** New `src/documented-quirks.spec.ts` (9 cases) covers the five behaviors above, so the documentation claims now have witnesses.

## `v5.0.0` (2026-05-13) — Duck-typed `emit()` / `emitAsync()`

- **BREAKING:** `emit()` and `emitAsync()` no longer throw `"object is not eventized"` when called on a non-eventized target. Instead, they fall back to duck-typing — the same pattern already used by the listener-object dispatch path (`EventListener.ts`):
  1. If `obj[eventName]` is a function, call it with the args (with `this === obj`).
  2. Otherwise, if `obj.emit` is a function, call `obj.emit(eventName, ...args)`.
  3. Otherwise, silently no-op.
     Return values are funneled through the same aggregation pipeline as eventized listeners, so `emitAsync()` collects them uniformly. `null` / `undefined` / non-object targets silently no-op. The `'*'` wildcard still throws — it remains subscribe-only. **Migration:** callers that relied on `emit()` / `emitAsync()` throwing as a typo-safety net should add an explicit `isEventized()` guard (or a TypeScript typed emitter, which still rejects unknown event names at compile time).
- **Unchanged (strict):** `retainClear()` and `unretain()` continue to throw `"object is not eventized"` — they operate on internal retain state that does not exist on plain objects and has no meaningful duck-typed equivalent.
- **Types:** Public overload set unchanged. The existing typed-emitter overload still binds first for `EventizedObject<TEvents>`, and the loose `NonTypedEmitter<T>` overload accepts plain objects — types now match runtime exactly.
- **Tests:** New `src/emit-ducktyping.spec.ts` (28 cases) covers method-with-args, `this` binding, symbol event names, `.emit()` fallback, missing-method silent no-op, array forms with mixed method/fallback, wildcard rejection, non-object targets, `retainClear`/`unretain` strictness, and the full `emitAsync()` return-aggregation pipeline (sync value, Promise, array-of-Promises, null, undefined, no-op). Existing `emit.spec.ts › duck typing` case flipped to assert non-throw.
- **Docs:** README _Auto-eventize vs. strict mode_ table and examples updated; `skills/using-eventize/SKILL.md` quirks #1 and #4 (forwarding caveat) revised.
- **Affected files:** `src/eventize-api.ts`, `src/emit-ducktyping.spec.ts` (new), `src/emit.spec.ts`, `README.md`, `skills/using-eventize/SKILL.md`, `package.json` (`4.3.1` → `5.0.0`).
- Coverage for `src/eventize-api.ts`: 100% statements / branches / functions / lines.

## `v4.3.1` (2026-05-08)

- **Types:** `off()` is now fully permissive at the type level — every parameter accepts `unknown`. Previously, calling `off(ε, eventName)` on a typed emitter (`eventize<TEvents>()` etc.) narrowed `eventName` to `EventKeysOf<TEvents>`, which forced cleanup code to cast whenever the value came from config, a saved unsubscribe handle, or any other arbitrary source. The runtime was already permissive; this change just lets the types reflect that. No runtime change. The injected/class `off()` method, the `EventizeApi.off` interface, the `isEventized()` guard, and the internal `EventStore.remove` chain were loosened to match. Affects `src/eventize-api.ts`, `src/eventize.ts`, `src/types.ts`, `src/isEventized.ts`, `src/EventStore.ts`, `src/EventListener.ts`.
- **Docs:** README _TypeScript: Typed Event Maps → Caveats_ now lists `off()` alongside `getSubscriptionCount` / `isEventized` as intentionally untyped against `TEvents`.

## `v4.3.0` (2026-05-08)

- **Behavior change:** `off()` no longer throws `"object is not eventized"` when called on a non-eventized object (or on `null`/`undefined`). It now silently does nothing in that case, so cleanup paths can call `off(maybeEmitter, …)` without first checking `isEventized()`. The other strict-mode functions (`emit`, `emitAsync`, `retainClear`, `unretain`) still throw.
- **Behavior change:** Reverted the `emit()` recursion guard added in v4.2.0. Re-emitting the same `(emitter, eventName)` from inside a listener (directly or via a forwarding chain `A → B → A`) no longer throws `"emit() recursion detected …"` — the guard turned out to forbid legitimate re-emission patterns. Forwarding cycles will recurse until the stack overflows; callers are responsible for breaking cycles. The internal per-emitter re-entrancy `WeakMap` was removed.
- **Docs:** README _Auto-eventize vs. strict mode_ table and `off()` note updated to reflect the permissive behavior; forwarding caveat and `emit()` note now warn that cycles are caller-managed; `skills/using-eventize/SKILL.md` quirks #1 and #5 likewise updated.
- **Tests:** `src/wildcard-emit.spec.ts` — dropped the two recursion-detection cases; kept the still-valid re-entrancy cases (different-event re-emit, serial same-event emit, dispatch continues after a throwing listener).

## `v4.2.1` (2026-05-08)

- **Chore**: Skip AGENTS.md, CLAUDE.md and eslint.config.mjs from npm package (these are docs and tooling files, not source code or types)

## `v4.2.0` (2026-05-08)

- **Behavior change:** `emit(ε, '*', …)` (scalar and array form) now throws — `'*'` is subscribe-only. Events before `'*'` in a multi-event array still dispatch before the throw.
- **Behavior change:** `emit()` throws `"emit() recursion detected …"` when the same `(emitter, eventName)` is re-entered during dispatch, catching forwarding loops (`A → B → A`) and same-event self-recursion. Different events or serial re-emits are unaffected.
- **Docs:** README — new _Forwarding events between emitters_ subsection (works for `eventize.inject()` / `class extends Eventize`; no-op for plain `eventize(obj)`), and clarification that the listener-object `.emit()` fallback also fires for named subscriptions.
- **Tooling:** Added `skills/using-eventize/SKILL.md` — quick-reference skill for AI coding agents (Claude Code & co.) summarising API, quirks, and pitfalls. README links it under Installation.
- **Tests:** New `src/wildcard-emit.spec.ts` covering wildcard-emit throws, `.emit()` fallback, eventized-to-eventized forwarding, and loop detection.

## `v4.1.0` (2026-05-08)

- **API:** New `unretain(emitter, eventName | eventName[])` — inverse of `retain()`: drops the stored value **and** removes the retain policy, so future emits are not retained again. Available in all three API shapes. Throws `"object is not eventized"` on plain objects (strict-mode convention).
- **API:** `Priority` gained plain-English aliases — `Critical` (= `AAA`), `High` (= `BB`), `Normal` (= `Default`). Legacy names remain as aliases; fully backwards-compatible.
- **Types:** Opt-in generic event-map support. `eventize<TEvents>()`, `eventize.inject<TEvents>()`, and `class extends Eventize<TEvents>` accept a user-defined event map; the full API (`on`/`once`/`onceAsync`/`emit`/`emitAsync`/`retain`/`retainClear`/`unretain`/`off`) gets typed overloads with autocomplete and compile-time errors for wrong event names, wrong argument tuples, and unknown listener-object keys. Untyped usage falls back to the v4 loose signatures unchanged. Define event maps as plain interfaces — do **not** `extends EventMap` (would re-widen `keyof`).
- **Types:** `on()` and `once()` now expose proper IDE-friendly function overloads instead of a 14-member tuple union, so each call shape shows up on its own line in hovers and autocomplete.
- **Performance:** `EventStore.add` inserts listeners via binary search instead of push + full sort. Drops insertion from `O(n log n)` to `O(log n) + O(n)`; only observable with many listeners on the same slot. Sort order unchanged.
- **Refactor:** Renamed internal `EventKeeper.emit(...)` to `EventKeeper.replayTo(...)` (and `KeeperEvent.emit` → `replay`) — the method replays retained values to a new subscriber, it does not emit. Internal only, no public API change.
- **Refactor:** Split `EventStore.remove` into four single-purpose private methods (`removeByEventName`, `removeByEventListener`, `removeByEventNameAndListenerObject`, `removeByListener`). Pure internal cleanup.
- **Refactor:** Moved test helper `expect2ImplEventizeApi` to `src/__test-utils__/`. Test-only file, not bundled.
- **Docs:** README — new _Auto-eventize vs. strict mode_ section explaining why `on`/`once`/`onceAsync`/`retain` auto-eventize plain objects while `emit`/`emitAsync`/`off`/`retainClear` throw on them.

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
  retainClear,
} from '@spearwolf/eventize';
```

| before         | after            |
| -------------- | ---------------- |
| `obj.on(..)`   | `on(obj, ...)`   |
| `obj.once(..)` | `once(obj, ...)` |
| `obj.emit(..)` | `emit(obj, ...)` |
| `obj.off(..)`  | `off(obj, ...)`  |
| ...            | ...              |

There is still the option to inject the Eventize API as methods to the object (but this is no longer the default) by using:

- `eventize.inject(obj)` &rarr; _eventizedObj with eventize-api methods_
  - the `eventize.extend()` method has been removed, however
- `new (class extends Eventize {})()`
  - the base class `Eventize` is still available and works in the same way as before

If you are using the syntax from the _composition via inheritance_ example, you should now be using `eventize.inject` directly:

```typescript
import {eventize, type Eventize} from '@spearwolf/eventize';

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
