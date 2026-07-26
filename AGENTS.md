# AGENTS.md

Canonical guide for coding agents in this repo. `CLAUDE.md` is a symlink to this file — edit only this one.

`@spearwolf/eventize` makes any JS/TS object a **synchronous** event emitter. Zero runtime deps, ESM + CJS, opt-in typed event maps. All development happens in `src/`; `lib/` is build output.

## Verification

`npm run cbt` — clean → build → `attw --pack` → test with coverage → lint → format check. Run it before declaring a task done; it is the only gate that catches dual-format type breakage, and the only local run where the `coverageThreshold` actually binds.

Narrower loops while working: `npm test -- src/once.spec.ts`, `npm test -- -t "retains the last value"`, `npm run watch`. Bare `npm test` collects no coverage on purpose — a threshold applied to one spec file fails for the wrong reason.

**`npm run clean` does not clear the ts-jest cache.** It removes `lib/`, `build/`, `dist/`, `types/` and `tmp/`. ts-jest's transform cache lives outside the repository — `/tmp/jest_rs` on Linux — and survives every clean, every `npm ci`, and every `cbt`. A stale cache serves previously compiled output and hides type errors that a fresh checkout or a CI runner hits immediately. This is not hypothetical: it once produced a green `cbt` for a change that broke 13 of 25 spec suites, and the breakage survived two code reviews because both trusted the green suite. Run `npx jest --clearCache` before verifying any change to dependencies, `tsconfig.json`, or a `.d.ts` boundary.

Coverage is gated, not merely measured: `jest.config.ts` carries a global `coverageThreshold`, both workflows run `npm test -- --coverage`, and `cbt` runs `test:coverage` so the threshold binds locally too — it used to bind only in CI, which made "the only gate" a claim `cbt` could not back. Raise the numbers when coverage rises; never lower them to make a build pass.

**TypeScript is pinned below 7, on purpose.** `ts-jest` — which compiles every spec — declares `peerDependencies.typescript: ">=4.3 <7"` (checked across its six most recent releases; its `next` dist-tag is an *older* prerelease than `latest`, not a forward path). `typescript-eslint` is tighter still, capping at `<6.1.0`. Before retrying this upgrade, check both packages' current peer range with `npm view <pkg> peerDependencies`; do not force the install with `--legacy-peer-deps`, `--force`, or an `overrides` entry to get past a real peer conflict — that trades a known state (outdated TypeScript) for an unverified one (a compiler nothing in the toolchain has agreed to support). See `CHANGELOG.md` under `## \`v6.0.0\`` for the full record.

## Architecture invariants

These are the things that bite. Everything else is readable from the source.

**The eventized marker.** `asEventized(obj)` attaches a non-enumerable property keyed by `NAMESPACE` (`Symbol.for('eventize')`) holding `{store, keeper}`. That hidden slot _is_ the definition of an emitter — `isEventized()` just probes for it. This is why eventize works on plain `{}`, existing objects, and class instances interchangeably, and why nothing may ever enumerate its way onto the public surface.

**Two collaborators per emitter.** `EventStore` is the listener registry (binary-search insertion by priority, removal via `(listener?, listenerObject?, forceRemove?)`). `EventKeeper` is the retained-events log. Their interplay has one ordering rule worth protecting: `subscribeTo` collects retained events into a local `retainedEvents[]` and `EventKeeper.publish()` flushes them **after** registration completes, so a new subscriber sees replayed values in emission order rather than mid-registration.

**Three API surfaces, one implementation** (`eventize-api.ts` → `eventize.ts`). Standalone functions, `eventize.inject(obj)` methods, and `class Eventize` all delegate to the same `on`/`emit`/`off`. Never fork logic into a surface. The class/inject side casts to loose implementation-shape signatures on purpose — the public overload sets are tuned for end users and don't accept a spread of `SubscribeArgs`.

**Two dispatch paths in `emit`.** `_emit` handles eventized targets; `_duckEmit` handles non-eventized ones (v5+: `obj[eventName](...args)`, then `obj.emit(eventName, ...args)`, then no-op). Three things must hold on both sides, or `emitAsync` aggregation silently diverges between them: both must reject `'*'`, both must funnel return values through the same `returnValue` callback, and both must resolve the event-named member through `dispatchableMember()` (`utils.ts`) rather than reading `target[eventName]` raw — that is the `Object.prototype` boundary, and a path that skips it answers `emit(ε, 'toString')` while the other one doesn't. `emitAsync` differs from `emit` only in that aggregation — invocation is always synchronous.

**`subscribeTo` and `types.ts` move in lockstep.** `_subscribeTo` decodes the overloaded `on()` shapes positionally (event name(s), optional priority, listener function or method-name + listener object, or a bare listener object). Changing the API means changing `SubscribeArgs` _and_ the parsing; the spec files exercise the corner cases.

**Counters are per module instance.** `EventListener.lastId` (secondary sort
among equal priorities) and `EventKeeper.nextOrderId` (replay order of
retained events) are module-global `let` variables. Loading the ESM and the
CJS build in the same process — which the dual-format package permits —
gives you two independent counter pairs, so ordering stability is guaranteed
per loaded module instance, not per realm. This is deliberate: the
`Symbol.for('eventize')` marker is realm-wide because identity must be, the
counters are not because sorting only ever compares listeners on the same
emitter, and one emitter comes from one module instance.

## Known asymmetries

Verified quirks that look like bugs but are load-bearing or simply undocumented. Don't "fix" them without a CHANGELOG entry.

- `off(ε, name)` doesn't merely clear the retained *value* for that event — `keeper.remove()` drops the retain *policy* too, so it behaves like `unretain()`. Later emits of that event are no longer retained until `retain()` is called again.
- The array branch of `off()` is reached from two directions: an explicit `off(ε, [name, …])` and the unsubscribe function of a multi-event `on()`, which passes an array of `EventListener` instances. Anything filtering that array must keep event names and ignore listener instances — `isEventName` does, a `typeof === 'string'` test silently dropped symbol names (fixed). An array containing `'*'`, `null` or `undefined` never reaches this branch: `isBulkRemoval()` sends it to the bulk path first, which is why the unsubscribe-handle direction still needs the filter — listener instances make `isBulkRemoval()` false. That predicate mirrors `EventStore.remove()`'s *effective* array behaviour, not its condition: the store forwards each element back into itself with a null listener object, so one nullish element lands in the wipe-everything branch. Anything else that decides "is this argument bulk?" has to reproduce that, not just test for `'*'`.
- Reference-counted dedup is an `on()` property, not a store-wide one. `EventStore.add()` takes a `noDedup` flag and `once()` passes `true`, so every `once()` gets its own `EventListener`: two one-shot subscriptions mean two firings, two replays of a retained value, and two independently releasable handles. Folding them (pre-v6.0.0) left the second `callAfterApply` overwriting the first, so one emit decremented `refCount` from 2 to 1 and the surviving handle's own idempotence guard could never take it to 0 — a `once()` that fired forever.
- `emitAsync()` resolves to `undefined`, not `[]`, when no listener returned a non-null value.
- `emit()` on a non-eventized target no longer throws (v5). Typo safety now comes from typed emitters or an explicit `isEventized()` guard.
- No recursion guard. `A → B → A` forwarding and same-event re-emission overflow the stack by design — the v4.2 guard forbade legitimate patterns and was reverted.
- `off(ε, undefined)` is not a no-op — it takes the same branch as `off(ε)` and removes **every** listener plus, since v6.0.0, **all** retained state. Cleanup code that passes a handle property through (`off(ε, maybeHandle.listener)`) wipes the emitter when that property is missing, rather than doing nothing. Guard the call, or pass the handle itself.
- The unsubscribe handles from `on()` and `once()` are single-shot: `makeUnsubscribe()` sets a consumed flag before calling `off()`, so a second call is inert. Not cosmetic — `on()`'s reference-counted dedup means two handles can share one `EventListener`, and without the guard one handle called twice decremented the count twice and released the other handle's registration.
- `lib/index.d.ts` declares and exports `EventListener` in the **value** namespace, while the runtime bundles export nothing under that name — `import {EventListener}` from the ESM build throws a `SyntaxError`. `src/index.ts` re-exports it as `export type`, but tsup's dts rollup inlines the class (it is reachable from `UnsubscribeFunc`) and drops the type modifier; an `import type` + `export type` alias emits the same thing. The honest alternatives both cost something — drop the re-export and the type stops being nameable by consumers, or add a runtime `export` and the class becomes supported API — so the emit is left as is. `attw --pack` passes it in all four modes. Don't cite "exported as a type, not as a value" as though the published declarations agreed.
- `retain(ε, [name, …])` rejects a wildcard atomically: nothing is retained if `'*'` appears anywhere in the array. `emit(ε, [name, …])` does not — it dispatches the names preceding `'*'` and then throws. Both are pinned by specs; unify them only with a CHANGELOG entry.
- `retain()`, `unretain()` and `retainClear()` treat `'*'` specially, but not identically: `retain(ε, '*')` throws — `'*'` stays subscribe-only, matching `emit()`. `unretain(ε, '*')` and `retainClear(ε, '*')` instead mean "all retained events": the former drops every retain policy and every retained value, the latter drops only the values and keeps the policies.
- The `Object.prototype` boundary covers two of the three member lookups, on purpose. `dispatchableMember()` (in `utils.ts`) skips a member identical to `Object.prototype`'s same-named one, and both the listener-object branch of `EventListener.apply()` and `_duckEmitOne()` route through it — they have to agree, or `emitAsync` aggregates differently for eventized and non-eventized targets. The method-name branch (`listenerObject[listener]`) does **not**: `on(ε, 'evt', 'toString', obj)` spells the method out, so the inherited hit is the caller's choice. A spec in `EventListener.spec.ts` pins that asymmetry in both directions; don't "unify" it without a CHANGELOG entry.
- `off(ε, eventName, listenerObject)` unretains the *whole* event name — drops its retained value and policy — even though it only detaches one listener object's subscription and leaves any sibling listener for that same name subscribed. Unlike the bulk forms — which v6.0.0 made clear retained state too — this one is not scheduled to change: `git log -L` shows the branch unchanged since the 4.0.0 functional API, and fixing it now would be breaking. See `docs/lifecycle.md`.

## Conventions

- Specs live next to sources as `*.spec.ts`; Jest `testMatch` is restricted to `src/**`.
- Every feature or bugfix gets a spec.
- Relative imports carry no extension — `tsup` writes the output extensions.
- `lib/` is generated and git-ignored. Never edit it, never read it to answer a question about behavior.

## Documentation obligations

Progressive disclosure applies to this repo's own docs — the deep material lives in `docs/` and the agent-facing reference in `skills/using-eventize/references/`. Touch what the change actually affects:

| Change | Update |
| --- | --- |
| Public API or runtime behavior | `CHANGELOG.md` (`## Unreleased`), with migration notes if breaking |
| Documented behavior or an example | `README.md`, plus the matching `docs/*.md` if the detail lives there |
| Dispatch semantics, retain behavior, or any quirk above | `skills/using-eventize/` — `SKILL.md` for the summary, `references/*.md` for detail |
| Cleanup, retain lifetime, or handle semantics | `docs/lifecycle.md`, plus a case in `src/lifecycle.spec.ts` |
| Purely internal refactor | nothing |

Docs are English. Prefer stating the gotcha over restating the signature.
