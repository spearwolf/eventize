# emitSafe() / emitSafeAsync() — per-listener guarded dispatch

Date: 2026-08-30
Status: design, awaiting review. Nothing implemented.

## Problem

A listener that throws aborts the whole dispatch. `emit-throwing-listener.spec.ts`
pins it: the exception reaches the `emit()` caller unchanged, every listener
queued behind the throwing one is never invoked, and the retain write at the end
of `_emitOne()` never happens.

That is the right default and stays the default. But one pattern keeps showing up
in consumer code and has to be hand-rolled every time: dispatch to a set of
independent subscribers where no single one of them may take the others down —
teardown notifications, frame ticks, plugin fan-out. Today that means wrapping
every listener at registration, which the listener-object and method-name
subscription forms cannot express at all.

### `emitAsync()` does not already do this

A common assumption, and false. Its `try`/`catch` does not resume anything: it
calls `markCollectedAsHandled()` on the promises collected so far — otherwise a
rejected one among them is reported as an unhandled rejection and, under Node's
default `--unhandled-rejections=throw`, ends the process even though the caller
correctly caught the synchronous throw — and then rethrows unchanged. A
synchronous throw aborts the walk exactly as it does under `emit()`.

What `emitAsync()` does differently concerns only the asynchronous half: by the
time a promise rejects, every listener has already run synchronously, so a
rejection cannot stop anyone. `Promise.all()` is fail-fast, so the *values* of
the others are lost, but their *execution* never was.

### Inventory: where the library calls consumer code

| Site | Today |
| --- | --- |
| `emit()` → `_emit` / `_duckEmit` | unguarded, a throw aborts |
| `emitAsync()` synchronous dispatch phase | unguarded, identical to `emit()` |
| `emitAsync()` aggregation | fail-fast via `Promise.all()` |
| retained replays in `on()`/`once()` → `publishReplays()` | already guarded: isolated per replay, reported via `warn()` |
| `onceAsync()`, `off()`, unsubscribe handles | invoke no consumer code |

So there is exactly one unguarded site, and it is `emit`. Nothing else in the
library needs a guard, and `publishReplays()` is the in-house precedent for what
a guard looks like here: isolate, `warn()`, keep going.

## The guarantee

> A guarded dispatch guarantees **execution**, not **completeness**: no listener
> can prevent the others from running. It does not promise that no error occurs,
> that every return value arrives, or that the caller is spared a rejection.

This is the sentence that goes into `CHANGELOG.md` and `docs/`, and it is what
decides the async side below. A rejection prevents no execution, so it is outside
the guarantee — deliberately, not as an omission.

## Scope

Added:

- `emitSafe(obj, eventNames, ...args): void`
- `emitSafeAsync(obj, eventNames, ...args): Promise<any[] | undefined>`

on all three API surfaces (standalone functions, `eventize.inject(obj)` methods,
`class Eventize`), per AGENTS.md "Three API surfaces, one implementation".

Not added, and explicitly not deferred work — decided against:

- No `allSettled` aggregation in `emitSafeAsync()`. `Promise.all()` stays. A
  rejection rejects the returned promise exactly as it does under `emitAsync()`.
- No error collection, no return value, no `onError` callback, no
  `AggregateError`. Errors go to `warn()` and nowhere else.
- No change to `emit()`, `emitAsync()` or any existing behaviour.
- No emitter-wide guard policy, no guarded subscription form.

### The name

`emitSafe` promises more than it delivers, and the docs carry the correction: a
guarded dispatch is safe against *one listener taking down the others*, and
against nothing else. Rejections still reach the caller, the wildcard rejection
still throws, a corrupted bucket still throws. Every doc entry states the
guarantee sentence above rather than the word "safe" on its own.

## API

Both functions mirror `emit()` / `emitAsync()` overload for overload — the typed
arm, the typed-array arm, and the loose `NonTypedEmitter` fallback — so a call
that type-checks against `emit()` type-checks against `emitSafe()` and vice
versa. Same for the `EventizeApi` members in `types.ts`, which mirror the
existing `emit` / `emitAsync` member overloads including the `| symbol` escape
hatch and the `LooseEmitNames` arm.

```ts
emitSafe(ε, 'tick', dt);              // every listener runs; each throw -> warn()
await emitSafeAsync(ε, 'save');       // sync throws isolated; a rejection rejects
```

## Implementation: approach A

Two module-level callbacks, the walk and the store untouched.

```ts
const applyListenerSafe = (listener, eventName, args, returnValue) => {
  try {
    listener.apply(eventName, args, returnValue);
  } catch (error) {
    warn('a listener threw; the dispatch continues. event:', eventName, error);
  }
};
```

Three rules for where the code goes:

1. **The `try`/`catch` sits tightly around `listener.apply()`, never deeper.**
   `EventListener.apply()` settles a `once()` obligation *after* the listener
   returns (`if (didCall && this.callAfterApply) …`). A throw skips that, which
   is why a throwing `once()` stays subscribed today. Guarding inside `apply()`
   would silently change that; guarding around it preserves it exactly.
2. **The callback travels as a parameter through `_emit()` / `_emitOne()`**,
   rather than duplicating them. The wildcard rejection, the accumulating
   `internals` resolve and the hole-skipping index loop stay written once. It
   goes in as a required parameter directly after `args`, ahead of the optional
   `returnValue` and the accumulating `internals`, so no call site has to pass
   `undefined` to reach a later slot:
   `_emitOne(obj, eventName, args, apply, returnValue?, internals?)`. The same
   for the duck path: `_duckEmit()` / `_duckEmitOne()` take the dispatch
   function in the corresponding slot, with a `dispatchGuarded()` wrapper around
   `dispatchToTarget()` mirroring `applyListenerSafe()`.
3. **Both dispatch paths get the guard, or neither does.** AGENTS.md, "The two
   dispatch paths in `emit` move in lockstep". A guarded eventized path next to
   an unguarded duck path is exactly the divergence that rule exists to prevent.

`emitSafeAsync()` is `emitAsync()` with the guarded callback. It keeps its
`try`/`catch` and `markCollectedAsHandled()`: that path is reached less often now,
but not never — `_emitOne()` still throws for a `'*'` inside a name array after
the preceding names have already collected promises, and `mergeWalk()` still
throws on a corrupted bucket. Without it, that case tears down the process.

### Why not a separate walk (approach B)

A `forEachSafe()` with its own `walkBucketSafe()` / `mergeWalkSafe()` would keep
every call site monomorphic, at the price of duplicating the most delicate logic
in the library: `HELD_BY` bookkeeping, clone-on-mutate, hole throws, merge order.
That is the duplication that already let the two dispatch paths disagree about
function targets once, and repairing it cost a v6.0.0 behaviour change. Not worth
buying before the price of A has been weighed.

### Why not an ambient flag (approach C)

A module-level flag set before the walk and restored in a `finally`, read by the
one existing callback. Monomorphic, but it puts a `try`/`catch` and a branch into
the hottest function in the library, needs save/restore for nested emits, and
introduces hidden global state into the dispatch.

### The performance question, stated honestly

The call sites that matter are `fn(listener, a, b, c)` inside `walkBucket()`
and inside `mergeWalk()` — two in the whole source, one inline cache each,
shared by every caller. Duplicating `_emitOne()` would therefore not have helped
them; only approach B would.

But the cache only sees what a given program actually sends through it. A program
that never calls `emitSafe` never sends a second callback, and that site stays
monomorphic; such a consumer pays nothing. The cost is bimorphic dispatch in
programs that mix both, plus one extra argument on `_emit()` / `_emitOne()`.

`walk.ts` documents that these sites are sensitive enough that merely moving the
merge loop out of `EventStore.forEach()` took a 64-listener dispatch from 653 ns
to ~535 ns, so the number gets measured, not assumed.

**Acceptance gate.** Benchmark before and after, following the protocol the
comments in `walk.ts` and `utils.ts` prescribe: one variant per process,
interleaved and then re-run in the opposite order, many processes per cell,
quote ranges rather than single values. Two workloads:

- emit-only program: must stay inside the baseline's own spread.
- mixed program: measured, and the resulting range recorded in a comment beside
  `applyListenerSafe()`.

If the emit-only workload regresses beyond its spread, approach B is back on the
table and this document gets revised before implementation continues.

## Behavioural consequences

Each of these is visible to a consumer and belongs in the docs.

- **The retain write happens.** `_emitOne()` writes the retained value after the
  walk; under `emit()` a throw skips it, which is what keeps a throwing listener
  from destroying the previously retained value. Under `emitSafe()` the throw is
  isolated and the event was delivered, so the write runs. Correct, and different
  from `emit()`.
- **A throwing `once()` stays subscribed**, same as under `emit()` — see rule 1.
- **A `once()` queued behind a throwing listener is spent.** Under `emit()` it
  never runs, so it is not. This falls out of the guarantee and is not separately
  fixable.
- **The wildcard rejection still throws.** It is raised in `_emitOne()` /
  `_duckEmitOne()`, outside the listener call, so the guard cannot reach it — by
  construction, not by a special case. A caller error stays a caller error.
- **A corrupted (holey) bucket still throws** out of `mergeWalk()`, for the same
  structural reason.
- **A nested unguarded `emit()` inside a guarded listener** is caught by the
  outer guard. There is no depth tracking, and none is wanted.
- **A `RangeError` from unbounded recursion is caught too.** There is still no
  recursion guard (AGENTS.md, "Known asymmetries"), so `A → B → A` forwarding
  under `emitSafe` overflows the stack and the overflow is reported via `warn()`
  instead of unwinding. Accepted: filtering by error type would be fragile, and
  the alternative is a special case nobody can state cleanly.

## Testing

New spec file `src/emit-safe.spec.ts`, plus additions to the existing conformity
and parity suites. Every case below is a case, per AGENTS.md ("Important enough
to state is important enough to test"):

- subsequent listeners run after a throw; priority order is unaffected
  (high runs, mid throws, low runs)
- `warn()` is called once per throw, with the event name and the error
- several throwing listeners produce several warnings and one complete dispatch
- the retained value is written despite a throw
- a throwing `once()` stays subscribed and fires again on the next dispatch
- a `once()` behind a throwing listener is consumed
- `'*'` as a name throws; `['a', '*']` dispatches `'a'` and then throws
- a holey bucket still throws
- duck-typed target: a throwing event-named method is isolated; a throwing
  `.emit()` fallback is isolated; later names in an array still dispatch
- `emitSafeAsync()`: a synchronous throw is isolated and the promise still
  resolves the collected values; a rejection rejects the returned promise; the
  `'*'`-after-collection case produces no unhandled rejection
- all three surfaces, via `apiSurfaces` in
  `src/__test-utils__/expect2ImplEventizeApi.ts`
- `dispatch-parity.spec.ts`: the guarded eventized and duck paths agree the same
  way the unguarded pair does

Coverage thresholds bind in `cbt` only; the new code must be covered rather than
the numbers lowered.

## Files touched

Implementation:

- `src/emit-api.ts` — the two new functions, the two guarded callbacks, the
  callback parameter on `_emit` / `_emitOne` / `_duckEmit` / `_duckEmitOne`
- `src/types.ts` — `EventizeApi` gains `emitSafe` and `emitSafeAsync`
- `src/eventize.ts` — `eventizeMethods` and the two loose delegation aliases

Test infrastructure:

- `src/__test-utils__/expect2ImplEventizeApi.ts` — `expect2ImplEventizeApi`,
  `ConformityApi`, and the standalone entry in `apiSurfaces`
- `src/api-surfaces.spec.ts` — the descriptor-shape case enumerates the member
  list by name and its title states the count; both need updating with it

`check:dts` needs no change: it constrains which classes the published
declarations carry, and this adds none.

Documentation, per the obligations table in AGENTS.md:

- `CHANGELOG.md` — new section. **Which version it is named after is a human's
  call**; nothing here authorises a bump.
- `README.md` — the two functions and the guarantee sentence
- `docs/emit.md` — new file. `docs/` has no home for dispatch semantics today
  (`lifecycle`, `migration`, `off`, `retain`, `typed-events`), and the guarded /
  unguarded difference plus the retain and `once()` consequences need one.
- `skills/using-eventize/SKILL.md` and `references/api-details.md` — the skill
  must stay self-contained, so the relevant paragraphs are duplicated rather
  than linked out of the folder.
- `AGENTS.md` — the lockstep rule now covers four dispatch entry points rather
  than two, and rule 1 above (the `try`/`catch` sits around `apply()`, never
  inside it) is exactly the kind of plausible edit that breaks something no test
  name mentions.

`docs/migration.md` needs nothing: this is additive against v5.1.0.

## Open questions

1. The version heading in `CHANGELOG.md`.
2. Whether `emitSafeAsync()` ever grows an `allSettled` variant. Decided against
   for now on the strength of the guarantee sentence; recorded here so a future
   reader knows it was weighed rather than missed.
