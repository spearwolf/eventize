# emitStrict() / emitStrictAsync() — serve every listener and report every failure

Date: 2026-08-30
Status: design, awaiting review. Nothing implemented. Target release `v6.2.0`.

Supersedes the `emitStrict()` section of `ROADMAP.md`, which carries the
motivation and the naming decision. Read that first; this document does not
repeat the gap analysis, only the parts the roadmap left open or got wrong.

## What the roadmap settled, and what it did not

Settled, and unchanged here: the gap (`emit()` reports but does not serve,
`emitSafe()` serves but does not report), the consumer that ran into it
(`@spearwolf/signalize`'s teardown), why it cannot be fixed in the consumer,
the name, the one-or-many error rule, and `Promise.allSettled` on both levels
of the async aggregation.

Two things change.

**One correction.** The roadmap says the wildcard rejection is a `TypeError`,
three times. It is not: `rejectWildcard()` in `src/utils.ts` throws a plain
`Error` with the `emit() must be called with a concrete event name` message.
Nothing in the design depends on the class — but a spec case written from the
roadmap's wording (`toThrow(TypeError)`) would never go green.

**One design change, and it dissolves the roadmap's only gate.** The roadmap
assumes a third walk callback (`applyListenerStrict`) beside `applyListener`
and `applyListenerSafe`, makes the shared call site in `walk.ts` trimorphic,
and therefore gates the whole implementation shape on a measurement. That third
callback is not needed. See "Implementation" below.

## The guarantee

> Nothing is dropped. Not the execution of a listener, and not the report of a
> failure.

`emitSafe()` buys execution by spending the error. `emitStrict()` buys both and
pays for it in the shape of what it throws: a single failure arrives unchanged,
several arrive as an `AggregateError`.

## Scope

In:

- `emitStrict()` and `emitStrictAsync()`, on all three API surfaces — standalone
  functions, `eventize.inject()` methods, `class Eventize` methods. The
  roadmap's open question ("all three from day one, or standalone first")
  resolves to all three: every other emit variant carries all three, the member
  list in `src/eventize.ts` is derived from one object rather than written out
  per surface, and a surface added later is a second changelog entry for the
  same feature. The member count goes from eleven to thirteen.
- The eventized dispatch path and the duck-typed path, in lockstep, as
  `AGENTS.md` requires.

Out:

- Any change to `emit()`, `emitAsync()`, `emitSafe()`, `emitSafeAsync()`. The
  only edits they see are internal: the guarded pair's report call moves behind
  one indirection (below), and `emitSafe()` gains a save-and-restore around its
  dispatch.
- Error transformation. Whatever a listener threw is what the caller gets —
  no wrapping, no `cause`, no normalisation of a thrown non-`Error`.
- A global error handler, a per-emitter error policy, or an `onError` option.
  Error policy stays at the call site that owns it.
- Recursion guards. Unchanged and still deliberate (`AGENTS.md`, "Known
  asymmetries").

## API

```ts
declare function emitStrict<TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
  obj: EventizedObject<TEvents>, eventName: K, ...args: ArgsFor<TEvents, K>): void;
declare function emitStrict<TEvents extends EventMap, K extends EventKeysOf<TEvents> | symbol>(
  obj: EventizedObject<TEvents>, eventNames: K[], ...args: ArgsFor<TEvents, K>): void;
declare function emitStrict<T extends object>(
  obj: NonTypedEmitter<T>, eventNames: AnyEventNames, ...args: EventArgs): void;

declare function emitStrictAsync<…same three shapes…>(…): Promise<any[] | undefined>;
```

Three overloads each, matching `emitSafe()` / `emitSafeAsync()` exactly, plus
the matching members on `EventizeApi`. `Promise<any[] | undefined>` rather than
`unknown[]`: same decision `emitAsync()` made and it is not reopened here.

## Semantics

### The one-or-many rule

| Failures collected | `emitStrict()` | `emitStrictAsync()` |
| --- | --- | --- |
| none | returns normally | resolves the collected values, or `undefined` |
| one | throws it unchanged | rejects with it unchanged |
| two or more | throws `AggregateError` | rejects with `AggregateError` |

Order is dispatch order throughout. The single-error-unchanged rule is what
lets a consumer swap `emit()` for `emitStrict()` without touching a single
`toThrow('listener boom')` assertion — the observable behaviour only changes
once a *second* listener fails, which under `emit()` could not happen.

The `AggregateError` message is one fixed string; the entries carry the detail.

### What the collection catches, and what it does not

Everything raised *inside* `listener.apply()` on the eventized path, and inside
`dispatchToTarget()` on the duck path. That is the same `try` placement
`emitSafe()` uses, and it must not move inside `apply()`: `EventListener.apply()`
settles a `once()` obligation after the listener returns, so a guard one level
deeper would spend the one-shot a throwing `once()` is supposed to keep
(`AGENTS.md`, "The guarded dispatch's `try` goes around `listener.apply()`").

Two throws are raised *outside* that call and are not listener failures:

- the wildcard rejection, from `_emitOne()` / `_duckEmitOne()`;
- the corrupted-bucket throw, from `mergeWalk()` / `findInsertIndex()`.

Under `emitSafe()` both leave the call unguarded. Under `emitStrict()` they are
caught one level up — around the whole dispatch — and appended to the same
list, last, where the one-or-many rule decides their shape. So:

- `emitStrict(ε, '*')` throws the plain `Error` a caller expects, unchanged,
  because it is the only entry;
- `emitStrict(ε, ['a', '*'])` dispatches `'a'`, keeps whatever its listeners
  threw, and then throws — one failure unchanged, or an `AggregateError` whose
  last entry is the wildcard rejection. The names after `'*'` do not run. This
  is the roadmap's rule extended to the corrupted bucket, which it did not name.

The distinction that survives: a caller's own error still ends the dispatch. It
just no longer erases what the dispatch had already collected.

### Retain and `once()`

Identical to `emitSafe()`, and for the same reason — the event *was* delivered:

- the retained value is written even when listeners threw;
- a `once()` queued behind a throwing listener is spent, because it now runs;
- a throwing `once()` keeps its own subscription, guarded or not.

This extends the existing asymmetry entry ("A guarded dispatch writes the
retained value, an aborted one does not") to a third and fourth function rather
than adding a new one.

### The async half

`emitStrictAsync()` aggregates with `Promise.allSettled` on both levels — the
outer collection and the inner unwrap of a listener that returned an array of
promises — then splits the results:

- every `fulfilled` value keeps its slot and forms the resolved array, exactly
  what `emitAsync()` would have resolved to (an inner array rebuilds as an
  array of its fulfilled values);
- every `reason` joins the failure list the synchronous guard already filled,
  in positional order.

Three consequences, all wanted:

- **Deterministic failure order.** `Promise.all` reports whoever lost the race;
  `allSettled` returns positionally. Synchronous throws first — they all
  happened before any promise settled — then rejections in dispatch order.
- **No partially-filled result array.** If anything failed, the promise rejects
  and there is no result array at all. Success resolves a complete array or
  `undefined`.
- **`markCollectedAsHandled()` is not needed on this path.** It exists because a
  mid-walk throw abandons already-collected promises, and an abandoned rejected
  promise takes the process down under Node's default. Here nothing is ever
  abandoned: every collected value reaches `allSettled`, which owns it.

The cost: one result object per element, and the report waits for the *slowest*
listener promise. `Promise.all` already waits that long for the success case,
so this extends a property rather than introducing one.

**The returned promise is the only error channel.** `emitStrictAsync()` never
throws synchronously — not for a wildcard name, not for a foreign protocol
marker, not for a corrupted bucket. A function that returns a promise should not
also throw, because `emitStrictAsync(…).catch(report)` is the idiomatic call in
exactly the place this variant is for. This is a deliberate asymmetry against
`emitAsync()` and `emitSafeAsync()`, which keep throwing synchronously, and it
needs an entry under `AGENTS.md` → "Known asymmetries".

### Nesting

The collection is a per-call frame, saved and restored. What that buys:

| Inner call, from inside a listener | Its failures go to |
| --- | --- |
| `emit()` | nowhere — they unwind into the outer guard and are collected there, as the outer listener's failure |
| `emitSafe()` | `console.warn`, never the outer collection |
| `emitStrict()` | its own frame; its `AggregateError` then unwinds into the outer guard as one entry |
| `emitStrictAsync()` | its own frame; its rejection belongs to whoever holds that promise |

The `emitSafe()` row is why `emitSafe()` has to touch the slot at all: without
the save-and-restore its caught throws would be attributed to an outer
`emitStrict()` caller who never asked for them.

## Implementation

### The shape: one guarded callback, a switchable report sink

`applyListenerStrict` would differ from `applyListenerSafe` in nothing but
where the caught error goes. Same `try`, same placement, same `once()` and
retain consequences. So the variable is the sink, not the callback:

```ts
// module-level, one slot, no stack
let collectedFailures: unknown[] | null = null;

const reportListenerThrow = (eventName: EventName, error: unknown): void => {
  if (collectedFailures !== null) collectedFailures.push(error);
  else warnListenerThrew(eventName, error);
};
```

`applyListenerSafe()` and `dispatchGuarded()` call `reportListenerThrow()`
instead of `warnListenerThrew()`. Nothing else about them changes, and the
guarded/unguarded pair at `fn(listener, a, b, c)` in `walkBucket()` /
`mergeWalk()` stays exactly two identities.

`emitStrict()` then is:

```ts
export function emitStrict(target, eventNames, ...args): void {
  const previous = collectedFailures;
  const failures: unknown[] = [];
  collectedFailures = failures;
  try {
    if (isEventized(target)) _emit(target, eventNames, args, applyListenerSafe);
    else if (isDuckTarget(target)) _duckEmit(target, eventNames, args, dispatchGuarded);
  } catch (err) {
    failures.push(err);            // wildcard rejection, corrupted bucket
  } finally {
    collectedFailures = previous;  // restore, not pop: reentrant by construction
  }
  raiseFailures(failures);         // none / one / many
}
```

and `emitSafe()` gains the same save-and-restore with `collectedFailures = null`
for the duration of its dispatch.

Why this is the right seam:

- **The hot call site is untouched.** The library's process-wide surcharge lives
  at one shared call site, and it is a function of how many callback identities
  reach it. This design sends the same two through it that v6.1.0 does, so a
  program that never calls a guarded variant stays monomorphic and a program
  that calls one stays bimorphic. `emitStrict()` costs the ecosystem nothing it
  is not already paying.
- **The added work is on cold paths.** One null check inside a `catch` that only
  runs when something already threw; two assignments and a `try`/`finally` per
  guarded emit call, against a dispatch that walks N listeners.
- **Restore, not a stack.** A listener that emits during a guarded dispatch
  opens its own frame and its failures belong to its own call site. No array of
  arrays, no depth counter, nothing to leak if a frame unwinds — `finally`
  restores on every exit.
- **`_emit()`, `_duckEmit()`, `EventStore`, `walk.ts` and `EventListener` are
  not touched at all.** The wildcard rejection, the `internals` accumulator and
  the hole-skipping loops stay written exactly once.

The one property worth writing down beside the slot: it is per module instance,
like the counters in `AGENTS.md` → "Counters are per module instance". Loading
the ESM and the CJS build against the same objects is already unsupported; this
adds nothing new, because the guard callback and the slot always come from the
same module instance.

### Rejected alternatives

**A third walk callback** (the roadmap's sketch). Makes the shared call site
trimorphic, and the step from bimorphic to trimorphic is the one that usually
hurts in V8's inline caches. It would tax every `emit()` in every process that
calls any guarded variant — for a distinction that exists only in a `catch`
block. Rejected on cost for a difference that is not on the hot path.

**A closure per call** (`(l, n, a, rv) => {try{…}catch(e){failures.push(e)}}`).
Correct and obvious, and it allocates a JSFunction plus a context on every
`emitStrict()` call *and* sends a fresh function identity through the shared
call site, which is worse than trimorphic — it is megamorphic by construction.
Rejected for the reason `applyListener`'s own doc comment already states.

**A duplicated dispatch loop** (the roadmap's plan B). Only helps if the
duplication reaches all the way down through `EventStore.forEach()`,
`walkBucket()` and `mergeWalk()`, because that is where the polymorphic site
is. That is a second copy of the dispatch core, in a repo whose central rule is
that the dispatch paths move in lockstep. Rejected, and with the shared-sink
design there is nothing left for it to solve.

**A flag argument on the existing callback** (`applyListenerSafe(…, collect)`).
Changes the `WalkCallback` arity that `EventStore.forEach()`'s three context
slots are matched against, for no gain over the module slot.

### The performance question, restated

The roadmap made a measurement the gate on the design. Under this shape there
is no trimorphic step to measure, so the measurement becomes a *confirmation*
and does not block the design:

- an emit-only program must stay inside its own baseline spread (it should be
  bit-identical work);
- a program that calls `emitSafe()` must stay inside the v6.1.0 bimorphic
  baseline's spread, which is what the slot save-and-restore and the extra
  indirection in the cold `catch` are measured against.

Same methodology the +29% number used: one variant per process, 1e6 dispatches
to 64 listeners, 25 processes per cell, interleaved and re-run in the opposite
order. If `emitSafe()` moves outside its baseline spread, the save-and-restore
becomes conditional (`if (collectedFailures !== null)` around it) before
anything else is reconsidered.

## Behavioural consequences to document

- A new "Known asymmetries" entry: `emitStrictAsync()` never throws
  synchronously, while `emitAsync()` / `emitSafeAsync()` do.
- The existing asymmetry "A guarded dispatch writes the retained value" now
  covers four functions.
- `docs/emit.md` grows from four dispatch functions to six, and the
  decision guidance gains a third row.
- The process-wide surcharge paragraph in `docs/emit.md`, `README.md` and the
  skill needs one added sentence: `emitStrict()` joins `emitSafe()` on the same
  guarded callback, so calling it costs the same one-time step from monomorphic
  to bimorphic and nothing beyond it.

## Testing

New file `src/emit-strict.spec.ts`, mirroring `src/emit-safe.spec.ts`'s
structure and its `jest.mock('./utils')` workaround for observing `warn()`.

The cases that carry the design: every listener runs; one failure rethrown
unchanged (identity, not just message); two failures as an `AggregateError`
with `errors` in dispatch order; nothing thrown means normal return; retain
written; `once()` behind a failure spent; throwing `once()` still subscribed;
wildcard alone throws the plain `Error`; wildcard in an array collects the
names ahead of it first; corrupted bucket enters the list; duck path mirrors
all of it; nesting — `emitSafe()` inside `emitStrict()` warns and does not
collect, `emitStrict()` inside `emitStrict()` aggregates into one entry, and
the slot is restored after a frame unwinds.

For the async twin: resolves like `emitAsync()` when nothing fails; a single
rejected listener promise rejects unchanged; two rejections aggregate in
dispatch order; a synchronous throw sorts before a rejection; an inner array's
rejections are seen; `emitStrictAsync(ε, '*')` returns a rejected promise and
does *not* throw synchronously; no unhandled rejection escapes (the existing
`unhandledRejectionsDuring()` helper).

Plus the three-surface conformity matrix in `src/api-surfaces.spec.ts` and
`src/__test-utils__/expect2ImplEventizeApi.ts`, and one case in
`src/documented-quirks.spec.ts` for the new asymmetry.

## Files touched

| File | Change |
| --- | --- |
| `src/emit-api.ts` | the slot, `reportListenerThrow()`, `raiseFailures()`, `emitStrict()`, `emitStrictAsync()`, save-and-restore in `emitSafe()` / `emitSafeAsync()` |
| `src/emit-strict.spec.ts` | new |
| `src/types.ts` | `EventizeApi` gains two members, six overloads |
| `src/eventize.ts` | two loose aliases, two entries in `eventizeMethods`, "eleven" → "thirteen" |
| `src/__test-utils__/expect2ImplEventizeApi.ts` | `ConformityApi`, the existence checks, the standalone surface |
| `src/api-surfaces.spec.ts` | member list and title, "eleven" → "thirteen" |
| `src/documented-quirks.spec.ts` | the new asymmetry |
| `AGENTS.md` | lockstep rule now six entry points; guard-placement rule mentions the sink; new asymmetry entry |
| `CHANGELOG.md` | `v6.2.0` section |
| `package.json` | `6.1.0` → `6.2.0` |
| `ROADMAP.md` | delete the `emitStrict()` section — the rule is same commit |
| `README.md` | API table, behaviour-families table, error-handling section |
| `docs/emit.md` | six functions |
| `docs/retain.md` | the guarded-write note covers `emitStrict()` |
| `skills/using-eventize/SKILL.md`, `references/api-details.md` | API surface, families, pitfall |

## Open questions

None that block. The two the roadmap listed are answered: the surfaces question
resolves to all three from day one, and the measurement is no longer a gate on
the design — it confirms a cost this shape is built not to have.
