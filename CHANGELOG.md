# CHANGELOG

## Unreleased

- **Types:** `EventListener.apply()` no longer needs a single `@ts-expect-error`. It used to switch on the numeric `listenerType` tag — and a number is not something TypeScript can narrow a value from, so all four member accesses in the dispatch had to overrule the compiler. The three branches now test `listener` directly (`typeof === 'function'`, `isEventName()`, non-nullish), which is exactly what `detectListenerType()` tests and therefore cannot disagree with the tag: `listenerType` is `readonly`, `listener` is written only by the constructor and by `detach()`, and a detached listener returns at the `isRemoved` check before the dispatch. `listenerType` stays on the instance as the tag `EventStore.isSimilar()` compares. The internal `apply()` helper takes `unknown` for the function it may invoke rather than `Function | undefined`, because its own `typeof === 'function'` test is the only thing entitled to decide the question — that one signature change is what removes the need to assert anything about a member read off a listener object. Net: four suppressions gone, no `as` cast and no `!` added, no new per-listener state (so nothing new for `detach()` to release). Affects `src/EventListener.ts`.
- **BREAKING:** A method-name subscription whose listener object is missing — `on(ε, 'foo', 'handler', null)`, or the same call with the fourth argument left off — now dispatches to nothing instead of throwing `TypeError: Cannot read properties of null`. `null` is an accepted value of `ListenerObjectType`, so the crash was never a documented contract, and the surrounding branch already tolerates a listener object that has no such method yet (v5.2.0's `once()` fix). A `once()` in this shape is not consumed, matching the late-bound listener object it now behaves like. Reading the method off a **function** used as the listener object — `on(ε, 'foo', 'reset', SomeClass)` — keeps working. Affects `src/EventListener.ts`; three cases in `src/EventListener.spec.ts`.
- **Fix:** A per-event priority tuple written without its priority no longer poisons the sort. `on(ε, [['foo']], fn)` passed `name[1]` — `undefined` — straight through to `EventListener.priority`, where `sortByPriorityAndId` computes `b.priority - a.priority` and gets `NaN`. Every comparison against `NaN` is false, so the binary-search insertion in `findInsertIndex` walked to the end of the bucket and appended the listener there regardless of what it or its neighbours were worth: priority ordering silently stopped holding, with no error and no warning. A tuple that carries no priority now falls back to the call-level priority, which is what a missing override means (`Priority.Default` when the call gave none). The typed API never allowed the shape — `EventNameWithPriority` is a fixed 2-tuple — so this is reachable only from untyped JS or a suppressed call site, and it has been there since per-event priorities were introduced. Affects `src/subscribeTo.ts`. Two new cases in `src/documented-quirks.spec.ts`.
- **Types:** `strictNullChecks` is on. It had been switched off directly beside `"strict": true`, disabling the most valuable check `strict` enables. Turning it on surfaced 20 errors across 8 files, and the interesting ones were exactly where the audit expected them: `EventKeeper.replayTo()` dereferenced a map lookup without checking it (now one `get()` with a null check, instead of `has()` plus `get()`), `detectListenerType()` could return `undefined` behind a `number` return type (now an explicit `default` branch and a `number | undefined` return type), and the `as UnsubscribeFunc` cast in `makeUnsubscribe()` was masking a type error rather than merely restating a type — that cast is gone. `EventListener.priority` narrowed from `number | undefined` to `number`, which every construction site already satisfied. Affects `tsconfig.json`, `src/EventKeeper.ts`, `src/EventListener.ts`, `src/EventStore.ts`, `src/eventize-api.ts`, `src/types.ts`, `src/utils.ts`.
- **BREAKING (types):** `UnsubscribeFunc.listener` and `UnsubscribeFunc.listeners` now refer to this package's `EventListener`. `src/types.ts` used the name without importing it, so it silently bound to the **DOM** global `EventListener` (`(evt: Event) => void`) — and the published `lib/index.d.ts` shipped that, because the bundler renamed the real class to `EventListener$1` and left the reference in `UnsubscribeFunc` pointing at the global. Consumers who annotated `const l: EventListener = unsub.listener` against the DOM type, or who fed `unsub.listener` somewhere expecting an event handler, will now get a type error. That code was already wrong; it just had no way to find out. In a project compiled without the DOM lib the reference did not resolve at all, and only `skipLibCheck` kept it quiet. No runtime behaviour changed.
- **BREAKING:** An `EventListener` constructed with a `null` or `undefined` listener now has `listenerType === undefined` and dispatches to nothing, instead of being tagged `LISTENER_IS_OBJ` — `typeof null === 'object'`, and `apply()` then dereferenced the null. Two consequences: such a listener no longer throws a `TypeError` when an event reaches it, and two of them are no longer treated as similar, so they no longer collapse into one reference-counted entry in the store. Unreachable through the public API — `on()` / `once()` reject a falsy listener with a thrown error before an `EventListener` is ever built — so this only affects code constructing `EventListener` directly, which the package exports as a type but not as a value.
- **Internal:** The `console.warn` availability probe in `src/utils.ts` tests `typeof console.warn === 'function'` instead of plain truthiness, which the compiler reads as always-true (TS2774) because `lib.dom` declares the method non-optional. One runtime difference falls out: a host whose `console.warn` is truthy but not callable used to throw at module-init time when `.bind()` was reached, and now falls back to `console.log`. Strictly more robust, and unreachable on any real host.
- **Internal:** `EventListener.apply()` defaults its `args` parameter to `[]` rather than passing `undefined` down to the dispatch helpers, where the listener-object `emit` fallback would have concatenated it into the argument list as a literal `undefined`. Both callers (`_emitOne`, `EventKeeper.replayTo`) always pass an array, so no dispatch changes. `EventStore`'s `cloneArray` helper is gone; `forEach()` slices the two buckets directly, which is what it did anyway.
- **Tests:** `src/EventListener.spec.ts` gained two cases pinning the null/undefined listener behaviour above. `src/EventStore.spec.ts` fixtures stopped using `null` as a placeholder listener — the reference-count dedup those fixtures exercise needs a real listener value. `src/getRetainedCount.spec.ts` restored the four `@ts-expect-error` directives that `strictNullChecks: false` had made redundant, which is the finding measuring itself: a signature reading `(o: object)` that silently accepted `null` is the nullability blindness this change closes.

## `v5.2.0` (2026-07-26) — Lifecycle fixes: cleanup, wildcards, and retained state

Six verified resource and lifecycle defects closed — a method-name `off()` form that silently failed to detach, a double-replay of retained events on de-duplicated subscriptions, a `once()` that could consume itself without calling anything, an unbounded-recursion crash from retaining `'*'`, an unsubscribe handle that kept every reference it had ever held, and an `O(n)` unsubscribe path — plus the API needed to see an emitter's retained and subscribed state from outside it, and a new `docs/lifecycle.md` describing what an emitter holds and what actually releases it.

- **Docs:** New `docs/lifecycle.md` — what an emitter holds (the hidden `Symbol.for('eventize')` slot, `EventStore`, `EventKeeper`, retained payloads held by strong reference), a table of what each `off()` form releases from the store versus the keeper, retain semantics including the `'*'` special-casing, dynamically generated retained names as a supported no-eviction pattern, which handles to keep and what a consumed one releases, `onceAsync()` cancellation, and how to verify cleanup with the three inspection functions. States plainly that `off(ε)` and `off(ε, '*')` do not clear retained state in this release (v6.0.0 changes that), and that two `once()` calls on the same listener object still collapse into one permanent listener (`MEM-002`, also fixed in v6.0.0). Linked from `README.md` and `skills/using-eventize/SKILL.md`.
- **Tests:** New `src/lifecycle.spec.ts` — one place that states, as executable assertions, what an emitter holds and what releases it: the subscription count after every `off()` form, keeper size after each retain-clearing call, keeper growth under dynamically generated names, handle lifetime after unsubscribe, and the wildcard guard. Every case corresponds to a finding from the 2026-07-25 audit. Extended while writing `docs/lifecycle.md` with the cases that document required it: which `off()` forms leave retained state untouched versus which reach the keeper (including the `off(ε, eventName, listenerObject)` edge where a sibling listener survives but the name's retained state does not, and `off(ε, undefined)` taking the same everything-goes branch as `off(ε)`), that a retained payload is held by strong reference rather than cloned, that `once()`'s returned handle carries `.listener`/`.listeners` and releases them the same way `on()`'s does, and that a de-duplicated `on()` subscription's shared listener is only released when the *last* outstanding handle calls back, not the first.
- **Feature:** `getRetainedCount(ε)` and `getRetainedEventNames(ε)` join `getSubscriptionCount(ε)`. The first reports how many events hold a retained value, the second every name carrying a retain policy whether or not it has fired — so `getRetainedEventNames(ε).length >= getRetainedCount(ε)` always holds. Until now the retained half of an emitter's state was only reachable through `ε[Symbol.for('eventize')].keeper`, which made retained-payload growth invisible from outside. Both return `0` / `[]` for non-eventized objects. New file `src/getRetainedCount.ts`.
- **Fix:** `retain(ε, '*')` now throws instead of filing `'*'` as an ordinary retained name. It used to be accepted silently, and a later `on(ε, '*', fn)` then recursed through the `'*'` entry in `EventKeeper.replayTo()` until the stack overflowed — a `RangeError` that took the whole process with it and gave no hint of the cause. `'*'` remains subscribe-only, exactly as `emit()` already enforced. `EventKeeper.replayTo()` additionally skips wildcard names in its catch-em-all branch, so no future path can reintroduce the recursion. Affects `src/eventize-api.ts`, `src/EventKeeper.ts`.
- **Feature:** `unretain(ε, '*')` and `retainClear(ε, '*')` gained bulk semantics — the former drops every retain policy and every retained value, the latter drops the values and keeps the policies. Both were silent no-ops before, so nothing that worked stops working. An array containing `'*'` is treated as the wildcard regardless of what else it lists.
- **Fix:** `off(ε, eventName, listenerObject)` now detaches listeners registered in the method-name form `on(ε, eventName, methodName, listenerObject)`. The filter in `removeSimilarListenersFromArray` compared `listener.listener` against the listener object, which only matches the `on(ε, eventName, listenerObject)` shape — in the method-name form `listener.listener` holds the method name and the object sits in `listener.listenerObject`. Code following `docs/off.md` believed it had cleaned up while the emitter kept holding the listener object and everything reachable from it. Affects `src/EventStore.ts`. The widened comparison also detaches the function-with-context form `on(ε, eventName, fn, context)` when called with that context object, which was previously a no-op here. That is deliberate: the nameless `off(ε, listenerObject)` has always swept those listeners, so the two forms now follow one rule and the named one is simply narrower in scope.
- **Fix:** A retained event is no longer replayed twice when `on()` deduplicates the subscription. Registering the same listener object for the same event a second time bumps an existing listener's reference count instead of inserting a new one, but `registerEventListener` called `keeper.replayTo()` either way — so the listener received the retained value once per `on()` call while the store reported a single subscription. Reducer and counting patterns double-booked as a result. The replay now runs only when `store.add()` actually inserted. Affects `src/subscribeTo.ts`.
- **Fix:** `once()` no longer consumes itself when the dispatch found nothing to call. `once(ε, 'foo', {})` followed by `emit(ε, 'foo')` unsubscribed the listener even though the object had neither a `foo` method nor an `emit` fallback — supplying the method afterwards then fired nothing. `callAfterApply` now runs only when a method or the `emit` fallback actually executed. The same guard applies to the method-name form `once(ε, 'foo', 'handler', obj)`, where `obj.handler` can be absent in exactly the same way; fixing only the listener-object branch would have created a fresh asymmetry. The wildcard form `once(ε, listenerObject)` is affected as well, and most visibly: it now fires on the first event the object can actually handle, where it previously fired on the first event it merely saw. Function listeners are unaffected — they are callable by construction. Affects `src/EventListener.ts`.
- **Fix:** `once()` now returns an unsubscribe function carrying `.listener` (or `.listeners` for the array form), as `UnsubscribeFunc` declares and `on()` has always delivered. The idempotence wrapper around the handle dropped both properties, so TypeScript promised a field that was `undefined` at runtime and `off(ε, unsub.listener)` failed silently. Affects `src/eventize-api.ts`.
- **Fix:** Removed listeners now release their references. An `EventListener` was only flagged `isRemoved = true` on unsubscribe, so a consumed handle kept pointing at the listener function, the listener object and — through its closure — the emitter. The common `subs.push(on(…))` / `subs.forEach(u => u())` pattern therefore pinned every listener object it had ever registered for as long as the handle array lived. The new `EventListener.detach()` nulls `listener`, `listenerObject` and `callAfterApply`, and all three removal paths in `EventStore` use it. `listener` and `listenerObject` lost their `readonly` marker as a result. `EventListener` is exported as a type, so this widening is visible in the published declarations; it is a loosening and breaks no existing consumer, but it is not purely internal. Affects `src/EventListener.ts`, `src/EventStore.ts`.
- **Feature:** `onceAsync(ε, eventNames, {signal})` accepts an `AbortSignal`. Aborting unsubscribes the internal `once()` handle and rejects the promise with the signal's `reason` when it has one, and with an `AbortError` `DOMException` otherwise — close to `fetch()`, but not identical: `abort(null)` also yields the `DOMException` here, where `fetch()` rejects with the `null` itself. Without a signal, an event that never fires kept the listener, the `resolve` closure and the caller's entire await continuation attached to the emitter for its whole lifetime, with no handle to release them: the unmount-before-event and cancelled-request shape. An already-aborted signal rejects without subscribing at all, and a retained event that resolves synchronously inside `once()` never attaches an abort handler in the first place. The parameter is optional, so no existing call changes. New exported type `OnceAsyncOptions`. All three API surfaces take it — the standalone `onceAsync(ε, …)`, the method installed by `eventize.inject()`, and the `Eventize` class method — which matters because the unmount-before-event shape is overwhelmingly a class-based one. Affects `src/eventize-api.ts`, `src/eventize.ts`, `src/types.ts`.
- **Performance:** Unsubscribing no longer scans every event-name bucket. `removeByEventListener` walked the full `namedListeners` map to find a listener whose `eventName` it already held, and `removeByEventNameAndListenerObject` did the same with the name sitting right there in its parameter list. Both now address the one bucket a listener can live in, falling back to nothing when it is absent. Removal drops from O(number of event names) to O(1), which matters for the cyclical subscribe/unsubscribe patterns in entity systems and scene graphs. No behavioural change. Affects `src/EventStore.ts`.

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
